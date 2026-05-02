const express = require("express");
const app = express();

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
app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
