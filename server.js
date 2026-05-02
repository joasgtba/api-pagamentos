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
  const { pedido_id, valor } = req.body;

  // simulação (depois entra Cielo aqui)
  const pixFake = {
    qrCode: "00020101021226850014br.gov.bcb.pix...",
    copiaECola: "00020101021226850014br.gov.bcb.pix...",
    status: "PENDENTE"
  };

  res.json({
    pedido_id,
    valor,
    pix: pixFake
  });
});

app.get("/teste-db", async (req, res) => {
  const { data, error } = await supabase
    .from("pedidos")
    .select("*")
    .limit(1);

  if (error) {
    return res.status(500).json({ error });
  }

  res.json({ data });
});
app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
