import fs from "node:fs";
const s = fs.readFileSync("C:/Users/anjo_/AppData/Local/Temp/colinha-island.js", "utf8");
const start = s.indexOf("Chapa");
console.log("chapa idx", start);
const keys = [
  "Bens declarados",
  "Redes sociais",
  "Coligação",
  "Ocupação",
  "Eleições anteriores",
  "Proposta",
  "Idade",
  "Naturalidade",
  "Grau de instrução",
  "Cor ou raça",
  "titular da chapa",
];
for (const k of keys) {
  const i = s.indexOf(k);
  console.log(k, i >= 0 ? s.slice(i, i + 80) : "NO");
}
