const express = require("express");
const app = express();

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);
app.get("/", (req, res) => {
  res.send("API Orquestrador rodando 🚀");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
app.use(express.json());

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

  // 🔎 Buscar pedido real
  const { data: pedido, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", pedido_id)
    .single();

  if (error || !pedido) {
    return res.status(404).json({ error: "Pedido não encontrado" });
  }

  // 🚫 Validar status
  if (pedido.order_status !== "aguardando_pagamento") {
    return res.status(400).json({
      error: "Pedido não está disponível para pagamento"
    });
  }

  // 💳 (ainda fake por enquanto)
  const pixFake = {
    qrCode: "00020101021226850014br.gov.bcb.pix...",
    copiaECola: "00020101021226850014br.gov.bcb.pix...",
    status: "PENDENTE"
  };

  // 🔁 (opcional agora)
  // você pode manter o status ou mudar pra "pagamento_em_processamento"

  res.json({
    pedido_id: pedido.id,
    valor: pedido.valor,
    status: pedido.order_status,
    pix: pixFake
  });
});
app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
