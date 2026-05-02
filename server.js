const express = require("express");
const app = express();

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

// 🔐 Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// 🔧 Porta
const PORT = process.env.PORT || 3000;

// 🔥 Middleware
app.use(express.json());

// 🟢 Health
app.get("/", (req, res) => {
  res.send("API Orquestrador rodando 🚀");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// 🧪 Teste banco
app.get("/teste-db", async (req, res) => {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .limit(1);

  if (error) return res.status(500).json({ error });

  res.json({ data });
});

// 💳 Criar PIX (estrutura pronta pra Cielo)
app.post("/criar-pix", async (req, res) => {
  const { pedido_id } = req.body;

  const { data: pedido, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", pedido_id)
    .single();

  if (error || !pedido) {
    return res.status(404).json({ error: "Pedido não encontrado" });
  }

  // 🔒 Só permite pagamento correto
  if (pedido.status !== "aguardando_pagamento") {
    return res.status(400).json({
      error: "Pedido não está liberado para pagamento"
    });
  }

  if (!pedido.final_total || pedido.final_total <= 0) {
    return res.status(400).json({
      error: "Pedido sem valor final definido"
    });
  }

  const valor = pedido.final_total;

  // 🔑 Gerar transaction_id único
  const transaction_id = crypto.randomUUID();

  // 💾 Salvar no banco
  const { error: updateError } = await supabase
  .from("orders")
  .update({
    payment_method: "pix",
    transaction_id: transaction_id,
    status: "pagamento_pendente"
  })
  .eq("id", pedido.id);

if (updateError) {
  console.error("Erro ao atualizar pedido:", updateError);
  return res.status(500).json({
    error: "Erro ao salvar transação",
    detalhe: updateError.message
  });
}

  // ⚠️ Aqui entra integração real com Cielo depois
  const pixFake = {
    qrCode: "00020101021226850014br.gov.bcb.pix...",
    copiaECola: "00020101021226850014br.gov.bcb.pix...",
    status: "PENDENTE"
  };

  res.json({
    pedido_id: pedido.id,
    transaction_id,
    valor,
    pix: pixFake
  });
});

// 🔔 WEBHOOK CIELO (versão robusta)
app.post("/webhook/cielo", async (req, res) => {
  try {
    console.log("🔔 Webhook recebido:", req.body);

    // 🔐 SEGURANÇA
    const secret = req.headers["x-webhook-secret"];
    if (!secret || secret.trim() !== process.env.WEBHOOK_SECRET.trim()) {
      console.warn("🚫 Webhook não autorizado");
      return res.status(401).json({ error: "Não autorizado" });
    }

    const { Payment } = req.body;

    if (!Payment) {
      return res.status(400).json({ error: "Payload inválido" });
    }

    const transaction_id = Payment.PaymentId;
    const status = Payment.Status;

    // 🔎 Buscar pedido
    const { data: pedido, error } = await supabase
      .from("orders")
      .select("*")
      .eq("transaction_id", transaction_id)
      .single();

    if (error || !pedido) {
      return res.status(404).json({ error: "Pedido não encontrado" });
    }

    // 🔁 Evitar duplicação
    if (pedido.status === "pago") {
      console.log("⚠️ Pedido já pago");
      return res.json({ ok: true });
    }

    // 🧠 Mapear status
    let novoStatus = pedido.status;
    let descricao = "";

    if (status === 2) {
      novoStatus = "pago";
      descricao = "Pagamento aprovado";
    } else if (status === 3) {
      novoStatus = "negado";
      descricao = "Pagamento negado";
    } else if (status === 1) {
      novoStatus = "aguardando_pagamento";
      descricao = "Pagamento pendente";
    }

    // 💾 Atualizar pedido
    await supabase
      .from("orders")
      .update({ status: novoStatus })
      .eq("id", pedido.id);

    console.log("✅ Pedido atualizado:", pedido.id);

    // 🧾 SALVAR LOG (AGORA CORRETO)
    const { error: errorLog } = await supabase
      .from("order_status_log")
      .insert([
        {
          order_id: pedido.id,
          status: novoStatus,
          note: `${descricao} - TXID: ${transaction_id}`
        }
      ]);

    if (errorLog) {
      console.error("❌ Erro ao salvar log:", errorLog);
    } else {
      console.log("🧾 Log salvo com sucesso");
    }

    res.json({ received: true });

  } catch (err) {
    console.error("Erro no webhook:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// 🚀 Start
app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});
