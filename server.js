const express = require("express");
const app = express();

// 🔗 Supabase
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// 🔧 Porta correta (melhor prática)
const PORT = process.env.PORT || 3000;

// 🔥 Middleware JSON (deixar no topo)
app.use(express.json());

// 🟢 Rota raiz
app.get("/", (req, res) => {
  res.send("API Orquestrador rodando 🚀");
});

// 🟢 Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// 🧪 TESTE BANCO (ESSA FALTAVA)
app.get("/teste-db", async (req, res) => {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .limit(1);

  if (error) {
    return res.status(500).json({ error });
  }

  res.json({ data });
});

// 📦 Teste de pedido
app.post("/pedido", (req, res) => {
  const { valor, pedido_id } = req.body;

  res.json({
    message: "Pedido recebido",
    pedido_id,
    valor
  });
});

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

  // 🚫 Só permite pagamento se estiver pronto
  if (pedido.status !== "aguardando_pagamento") {
    return res.status(400).json({
      error: "Pedido ainda não está liberado para pagamento"
    });
  }

  // 🔒 REGRA CRÍTICA: só usa final_total
  if (!pedido.final_total || pedido.final_total <= 0) {
    return res.status(400).json({
      error: "Pedido ainda não possui valor final definido"
    });
  }

  const valor = pedido.final_total;

  const pixFake = {
    qrCode: "00020101021226850014br.gov.bcb.pix...",
    copiaECola: "00020101021226850014br.gov.bcb.pix...",
    status: "PENDENTE"
  };

  res.json({
    pedido_id: pedido.id,
    numero: pedido.number,
    cliente: pedido.customer_name,
    valor,
    status: pedido.status,
    pix: pixFake
  });
});

// 🚀 Start servidor
app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});
