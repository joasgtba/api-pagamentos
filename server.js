const express = require("express");
const app = express();

const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");
const WebSocket = require("ws");

// 🔌 Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    realtime: {
      transport: WebSocket
    }
  }
);

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET?.trim();
const PORT = process.env.PORT || 3000;

const CIELO_BASE_URL =
  process.env.CIELO_BASE_URL || "https://apisandbox.cieloecommerce.cielo.com.br";

app.use(express.json());

app.get("/", (req, res) => {
  res.send("API Orquestrador rodando 🚀");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/teste-db", async (req, res) => {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .limit(1);

  if (error) return res.status(500).json({ error });

  res.json({ data });
});

// 🔥 Gerar Pix real na Cielo
async function gerarPixCielo({ pedido }) {
  const valorCentavos = Math.round(Number(pedido.final_total) * 100);

  const response = await axios.post(
    `${CIELO_BASE_URL}/1/sales`,
    {
      MerchantOrderId: pedido.id,
      Customer: {
        Name: pedido.customer_name || "Cliente"
      },
      Payment: {
        Type: "Pix",
        Amount: valorCentavos
      }
    },
    {
      headers: {
        "Content-Type": "application/json",
        MerchantId: process.env.CIELO_MERCHANT_ID,
        MerchantKey: process.env.CIELO_MERCHANT_KEY
      }
    }
  );

  const payment = response.data.Payment;

  return {
    transaction_id: payment.PaymentId,
    status_cielo: payment.Status,
    qrCode: payment.QrCodeBase64Image || payment.QrCodeImage || null,
    copiaECola: payment.QrCodeString || null,
    raw: response.data
  };
}

// 💳 Criar PIX real
app.post("/criar-pix", async (req, res) => {
  try {
    const { pedido_id } = req.body;

    if (!pedido_id) {
      return res.status(400).json({ error: "pedido_id é obrigatório" });
    }

    const { data: pedido, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", pedido_id)
      .single();

    if (error || !pedido) {
      return res.status(404).json({ error: "Pedido não encontrado" });
    }

    if (pedido.status !== "aguardando_pagamento") {
      return res.status(400).json({
        error: "Pedido não liberado para pagamento"
      });
    }

    if (!pedido.final_total || pedido.final_total <= 0) {
      return res.status(400).json({
        error: "Pedido sem valor final"
      });
    }

    const pix = await gerarPixCielo({ pedido });

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        payment_method: "pix",
        transaction_id: pix.transaction_id,
        status: "pagamento_pendente"
      })
      .eq("id", pedido.id);

    if (updateError) {
      console.error("Erro ao atualizar pedido:", updateError.message);
      return res.status(500).json({
        error: "Erro ao salvar transação"
      });
    }

    res.json({
      pedido_id: pedido.id,
      transaction_id: pix.transaction_id,
      valor: pedido.final_total,
      pix: {
        qrCode: pix.qrCode,
        copiaECola: pix.copiaECola,
        status: "PENDENTE"
      }
    });
  } catch (err) {
    console.error("Erro ao criar PIX:", err.response?.data || err.message);

    res.status(500).json({
      error: "Erro ao gerar Pix na Cielo",
      detalhe: err.response?.data || err.message
    });
  }
});

// 🔔 WEBHOOK CIELO
app.post("/webhook/cielo", async (req, res) => {
  try {
    const secret = req.headers["x-webhook-secret"];

    if (!secret || !WEBHOOK_SECRET || secret.trim() !== WEBHOOK_SECRET) {
      console.warn("🚫 Webhook não autorizado");
      return res.status(401).json({ error: "Não autorizado" });
    }

    const paymentId =
      req.body?.Payment?.PaymentId ||
      req.body?.PaymentId ||
      req.body?.paymentId;

    const statusCielo =
      req.body?.Payment?.Status ||
      req.body?.Status ||
      req.body?.status;

    if (!paymentId) {
      return res.status(400).json({ error: "PaymentId não informado" });
    }

    console.log("🔔 Webhook recebido:", {
      transaction_id: paymentId,
      status: statusCielo
    });

    const { data: pedido, error } = await supabase
      .from("orders")
      .select("*")
      .eq("transaction_id", paymentId)
      .single();

    if (error || !pedido) {
      return res.status(404).json({ error: "Pedido não encontrado" });
    }

    if (pedido.status === "pago") {
      return res.json({ ok: true });
    }

    let novoStatus = pedido.status;
    let descricao = "Atualização de pagamento";

    if (Number(statusCielo) === 2) {
      novoStatus = "pago";
      descricao = "Pagamento aprovado via Cielo";
    } else if (Number(statusCielo) === 11) {
      novoStatus = "cancelado";
      descricao = "Pagamento estornado via Cielo";
    } else if (Number(statusCielo) === 12 || Number(statusCielo) === 1) {
      novoStatus = "pagamento_pendente";
      descricao = "Pagamento pendente via Cielo";
    } else if (Number(statusCielo) === 3) {
      novoStatus = "cancelado";
      descricao = "Pagamento negado via Cielo";
    }

    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: novoStatus })
      .eq("id", pedido.id);

    if (updateError) {
      return res.status(500).json({ error: "Erro ao atualizar pedido" });
    }

    const { error: errorLog } = await supabase
      .from("order_status_log")
      .insert([
        {
          order_id: pedido.id,
          status: novoStatus,
          note: `${descricao} - TXID: ${paymentId}`
        }
      ]);

    if (errorLog) {
      console.error("Erro ao salvar log:", errorLog.message);
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Erro no webhook:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});
