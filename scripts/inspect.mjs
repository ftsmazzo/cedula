import fs from "node:fs";

function parse(path) {
  const text = fs.readFileSync(path, "latin1");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(";").map((s) => s.replaceAll('"', ""));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";").map((s) => s.replaceAll('"', ""));
    const o = {};
    head.forEach((h, j) => {
      o[h] = cols[j];
    });
    rows.push(o);
  }
  return rows;
}

const sp = parse("C:/Users/anjo_/Projects/folha-urna/data/raw/consulta_cand_2026_SP.csv");
const cargos = {};
const sits = {};
for (const r of sp) {
  cargos[r.DS_CARGO] = (cargos[r.DS_CARGO] || 0) + 1;
  sits[r.DS_SITUACAO_CANDIDATURA] = (sits[r.DS_SITUACAO_CANDIDATURA] || 0) + 1;
}
console.log("SP rows", sp.length);
console.log("cargos", cargos);
console.log("sits", sits);
console.log("eleicao", sp[0].CD_ELEICAO, sp[0].DS_ELEICAO, sp[0].DT_GERACAO, sp[0].HH_GERACAO);
const dep = sp.find((r) => r.NM_URNA_CANDIDATO.includes("ABEL COSTA"));
console.log("sample", dep);
