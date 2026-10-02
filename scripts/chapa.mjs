import fs from "node:fs";

function parse(path) {
  const text = fs.readFileSync(path, "latin1");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(";").map((s) => s.replaceAll('"', ""));
  return lines.slice(1).map((line) => {
    const cols = line.split(";").map((s) => s.replaceAll('"', ""));
    const row = {};
    head.forEach((h, j) => {
      row[h] = cols[j];
    });
    return row;
  });
}

const sp = parse("C:/Users/anjo_/Projects/folha-urna/data/raw/consulta_cand_2026_SP.csv");
const gov = sp.filter((r) => r.DS_CARGO === "GOVERNADOR");
const vice = sp.filter((r) => r.DS_CARGO === "VICE-GOVERNADOR");
const sen = sp.filter((r) => r.DS_CARGO === "SENADOR");
const s1 = sp.filter((r) => r.DS_CARGO.startsWith("1"));
const s2 = sp.filter((r) => r.DS_CARGO.startsWith("2"));
console.log("gov", gov.map((r) => [r.NR_CANDIDATO, r.NM_URNA_CANDIDATO, r.NR_PARTIDO, r.SQ_COLIGACAO]));
console.log("vice", vice.map((r) => [r.NR_CANDIDATO, r.NM_URNA_CANDIDATO, r.NR_PARTIDO, r.SQ_COLIGACAO]));
console.log("sen sample", sen.slice(0, 4).map((r) => [r.NR_CANDIDATO, r.NM_URNA_CANDIDATO, r.NR_PARTIDO, r.SQ_COLIGACAO]));
console.log("s1", s1.slice(0, 6).map((r) => [r.DS_CARGO, r.NR_CANDIDATO, r.NM_URNA_CANDIDATO, r.NR_PARTIDO, r.SQ_COLIGACAO]));
console.log("s2", s2.slice(0, 4).map((r) => [r.DS_CARGO, r.NR_CANDIDATO, r.NM_URNA_CANDIDATO, r.NR_PARTIDO, r.SQ_COLIGACAO]));
