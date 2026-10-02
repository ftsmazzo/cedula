import fs from "node:fs";
import path from "node:path";

const rawDir = "C:/Users/anjo_/Projects/folha-urna/data/raw";
const outDir = "C:/Users/anjo_/Projects/folha-urna/public/dados";

const CARGO = {
  1: "pres",
  3: "gov",
  5: "sen",
  6: "depfed",
  7: "depest",
  8: "depest",
};

const ACOMPANHA = {
  2: "Vice",
  4: "Vice",
  9: "1º suplente",
  10: "2º suplente",
};

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

function parse(file) {
  const text = fs.readFileSync(file, "latin1");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(";").map((s) => s.replaceAll('"', ""));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";").map((s) => s.replaceAll('"', ""));
    const row = {};
    head.forEach((h, j) => {
      row[h] = cols[j] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function limpo(valor) {
  if (!valor || valor === "#NULO" || valor === "#NE" || valor === "-1" || valor === "-3") return "";
  return valor.trim();
}

function frase(valor) {
  const texto = valor.toLocaleLowerCase("pt-BR");
  return texto.charAt(0).toLocaleUpperCase("pt-BR") + texto.slice(1);
}

function idadeEm(data) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(data)) return "";
  const [dia, mes, ano] = data.split("/").map(Number);
  let anos = 2026 - ano;
  if (mes > 10 || (mes === 10 && dia > 4)) anos -= 1;
  return anos > 17 && anos < 110 ? `${anos} anos` : "";
}

function fichaDe(row) {
  const ficha = {};
  const idade = idadeEm(limpo(row.DT_NASCIMENTO));
  const ocupacao = limpo(row.DS_OCUPACAO);
  const instrucao = limpo(row.DS_GRAU_INSTRUCAO);
  const nascimento = limpo(row.SG_UF_NASCIMENTO);
  const civil = limpo(row.DS_ESTADO_CIVIL);
  const coligacao = limpo(row.NM_COLIGACAO);
  const federacao = limpo(row.SG_FEDERACAO);
  if (idade) ficha.idade = idade;
  if (ocupacao) ficha.ocupacao = frase(ocupacao);
  if (instrucao) ficha.instrucao = frase(instrucao);
  if (nascimento) ficha.nascimento = nascimento;
  if (civil) ficha.civil = frase(civil);
  if (coligacao && coligacao !== "PARTIDO ISOLADO") ficha.coligacao = frase(coligacao);
  if (federacao) ficha.federacao = federacao;
  return Object.keys(ficha).length ? ficha : undefined;
}

function candidatura(row) {
  const nome = limpo(row.NM_URNA_CANDIDATO) || limpo(row.NM_CANDIDATO);
  const numero = limpo(row.NR_CANDIDATO);
  const partido = limpo(row.SG_PARTIDO);
  if (!nome || !numero || !partido) return null;
  const sit = limpo(row.DS_SITUACAO_CANDIDATURA);
  return {
    n: numero,
    nome,
    partido,
    pn: limpo(row.NR_PARTIDO).padStart(2, "0"),
    g: row.DS_GENERO === "FEMININO" ? "F" : "M",
    sq: limpo(row.SQ_CANDIDATO),
    ...(sit ? { s: sit } : {}),
  };
}

function escolherChapa(lista) {
  const saida = [];
  for (const papel of ["Vice", "1º suplente", "2º suplente"]) {
    const vistos = new Set();
    let n = 0;
    for (const item of lista.filter((a) => a.papel === papel)) {
      if (!item.sq || vistos.has(item.sq)) continue;
      vistos.add(item.sq);
      saida.push({ papel, n: item.n, nome: item.nome, partido: item.partido, sq: item.sq, g: item.g });
      n += 1;
      if (papel === "Vice" ? n >= 2 : n >= 1) break;
    }
  }
  return saida;
}

function ingerir(rows) {
  const cargos = vazio();
  const chapa = [];
  for (const row of rows) {
    const codigo = Number(row.CD_CARGO);
    const papel = ACOMPANHA[codigo];
    const base = candidatura(row);
    if (!base) continue;
    if (papel) {
      chapa.push({ ...base, papel, colig: row.SQ_COLIGACAO });
      continue;
    }
    const id = CARGO[codigo];
    if (!id) continue;
    base.colig = row.SQ_COLIGACAO;
    base.ficha = fichaDe(row);
    cargos[id].push(base);
  }
  for (const [id, lista] of Object.entries(cargos)) {
    for (const cand of lista) {
      if (id === "gov" || id === "sen" || id === "pres") {
        const grupo = escolherChapa(chapa.filter((a) => a.colig && a.colig === cand.colig));
        if (grupo.length) cand.chapa = grupo;
      }
      delete cand.colig;
    }
    lista.sort(porNome);
  }
  return cargos;
}

function porNome(a, b) {
  return a.nome.localeCompare(b.nome, "pt-BR");
}

function vazio() {
  return { depfed: [], depest: [], sen: [], gov: [], pres: [] };
}

fs.mkdirSync(outDir, { recursive: true });

let gerado = "";
let eleicao = "";
const porUf = {};
let linhasBrasil = 0;

const br = parse(path.join(rawDir, "consulta_cand_2026_BR.csv"));
linhasBrasil += br.length;
gerado = gerado || `${br[0]?.DT_GERACAO ?? ""} ${br[0]?.HH_GERACAO ?? ""}`.trim();
eleicao = eleicao || br[0]?.DT_ELEICAO || "";
const nacional = ingerir(br);

fs.writeFileSync(path.join(outDir, "BR.json"), JSON.stringify({
  uf: "BR",
  nome: "Brasil",
  cargos: { pres: nacional.pres },
}));

for (const uf of UFS) {
  const rows = parse(path.join(rawDir, `consulta_cand_2026_${uf}.csv`));
  porUf[uf] = rows.length;
  gerado = `${rows[0]?.DT_GERACAO ?? gerado} ${rows[0]?.HH_GERACAO ?? ""}`.trim();
  eleicao = rows[0]?.DT_ELEICAO || eleicao;
  const cargos = ingerir(rows);
  delete cargos.pres;
  fs.writeFileSync(path.join(outDir, `${uf}.json`), JSON.stringify({
    uf,
    cargos,
  }));
}

const brasilCsv = path.join(rawDir, "consulta_cand_2026_BRASIL.csv");
if (fs.existsSync(brasilCsv)) {
  const text = fs.readFileSync(brasilCsv, "latin1");
  linhasBrasil = text.split(/\r?\n/).filter(Boolean).length - 1;
}

const meta = {
  fonte: "Dados abertos do TSE · consulta_cand_2026",
  gerado,
  eleicao,
  total: linhasBrasil,
  porUf,
  pres: nacional.pres.length,
};
fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 2));
console.log(JSON.stringify({
  gerado,
  eleicao,
  total: linhasBrasil,
  sp: porUf.SP,
  pres: nacional.pres.length,
  spFed: JSON.parse(fs.readFileSync(path.join(outDir, "SP.json"), "utf8")).cargos.depfed.length,
}, null, 2));
