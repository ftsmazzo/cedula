export type CargoId = "depfed" | "depest" | "sen1" | "sen2" | "gov" | "pres";
export type ListaId = "depfed" | "depest" | "sen" | "gov" | "pres";

export type Acompanha = {
  papel: string;
  n: string;
  nome: string;
  partido: string;
  sq?: string;
  g: "M" | "F";
};

export type Ficha = {
  idade?: string;
  ocupacao?: string;
  instrucao?: string;
  nascimento?: string;
  civil?: string;
  coligacao?: string;
  federacao?: string;
};

export type Cand = {
  n: string;
  nome: string;
  partido: string;
  pn: string;
  g: "M" | "F";
  sq?: string;
  s?: string;
  ficha?: Ficha;
  chapa?: Acompanha[];
};

export type Escolha =
  | { tipo: "cand"; cand: Cand }
  | { tipo: "branco" }
  | { tipo: "nulo" }
  | { tipo: "legenda"; partido: string; pn: string };

export type UfArquivo = {
  uf: string;
  cargos: Record<"depfed" | "depest" | "sen" | "gov", Cand[]>;
};

export type Meta = {
  fonte: string;
  gerado: string;
  eleicao: string;
  total: number;
  porUf: Record<string, number>;
  pres: number;
};

export const UFS: { sigla: string; nome: string }[] = [
  { sigla: "AC", nome: "Acre" },
  { sigla: "AL", nome: "Alagoas" },
  { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" },
  { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" },
  { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" },
  { sigla: "MT", nome: "Mato Grosso" },
  { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" },
  { sigla: "PA", nome: "Pará" },
  { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" },
  { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" },
  { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondônia" },
  { sigla: "RR", nome: "Roraima" },
  { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" },
  { sigla: "SE", nome: "Sergipe" },
  { sigla: "TO", nome: "Tocantins" },
];

export const CARGOS: { id: CargoId; lista: ListaId; digitos: number; nacional: boolean }[] = [
  { id: "depfed", lista: "depfed", digitos: 4, nacional: false },
  { id: "depest", lista: "depest", digitos: 5, nacional: false },
  { id: "sen1", lista: "sen", digitos: 3, nacional: false },
  { id: "sen2", lista: "sen", digitos: 3, nacional: false },
  { id: "gov", lista: "gov", digitos: 2, nacional: false },
  { id: "pres", lista: "pres", digitos: 2, nacional: true },
];

export function nomeUf(sigla: string) {
  return UFS.find((u) => u.sigla === sigla)?.nome ?? sigla;
}

export function tituloCargo(id: CargoId, uf: string) {
  if (id === "depfed") return "Deputado Federal";
  if (id === "depest") return uf === "DF" ? "Deputado Distrital" : "Deputado Estadual";
  if (id === "sen1") return "Senador (1ª vaga)";
  if (id === "sen2") return "Senador (2ª vaga)";
  if (id === "gov") return "Governador";
  return "Presidente";
}

export function tituloComGenero(id: CargoId, uf: string, genero: "M" | "F") {
  if (genero === "M") return tituloCargo(id, uf);
  if (id === "depfed") return "Deputada Federal";
  if (id === "depest") return uf === "DF" ? "Deputada Distrital" : "Deputada Estadual";
  if (id === "sen1") return "Senadora (1ª vaga)";
  if (id === "sen2") return "Senadora (2ª vaga)";
  if (id === "gov") return "Governadora";
  return "Presidenta";
}

export function dobrar(valor: string) {
  return valor.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function formatar(n: number) {
  return n.toLocaleString("pt-BR");
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function horaDaBase(valor: string) {
  const [data, hora] = valor.split(" ");
  if (!data || !hora) return valor;
  const [dia, mes, ano] = data.split("/");
  const [hh, min] = hora.split(":");
  const nomeMes = MESES[Number(mes) - 1];
  if (!nomeMes || !hh || !min) return valor;
  return `${Number(dia)} de ${nomeMes} de ${ano}, ${Number(hh)}h${min}`;
}

export function situacaoVisivel(s?: string) {
  if (!s) return "";
  const t = dobrar(s);
  if (t.includes("indeferido")) return s;
  if (t.includes("renuncia")) return s;
  if (t.includes("cancel")) return s;
  if (t.includes("falecimento")) return s;
  if (t.includes("nao conhecido") || t.includes("não conhecido")) return s;
  if (t.includes("pendente") || t.includes("julgamento")) return s;
  return "";
}

export function indice(lista: Cand[]) {
  const mapa = new Map<string, Cand>();
  for (const cand of lista) {
    if (!mapa.has(cand.n)) mapa.set(cand.n, cand);
  }
  return mapa;
}

export function partidosDe(lista: Cand[]) {
  return [...new Set(lista.map((c) => c.partido))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function textoFolha(
  uf: string,
  escolhas: Partial<Record<CargoId, Escolha>>,
) {
  const linhas = [
    `Cédula · ${nomeUf(uf)}`,
    "1º turno · 4 de outubro de 2026",
    "",
  ];
  for (const cargo of CARGOS) {
    const escolha = escolhas[cargo.id];
    const titulo = tituloCargo(cargo.id, uf);
    if (!escolha) {
      linhas.push(`${titulo} · —`);
      continue;
    }
    if (escolha.tipo === "branco") {
      linhas.push(`${titulo} · BRANCO`);
      continue;
    }
    if (escolha.tipo === "nulo") {
      linhas.push(`${titulo} · NULO`);
      continue;
    }
    if (escolha.tipo === "legenda") {
      linhas.push(`${titulo} · legenda ${escolha.pn} ${escolha.partido}`);
      continue;
    }
    linhas.push(`${titulo} · ${escolha.cand.n}`);
    linhas.push(`${escolha.cand.nome} · ${escolha.cand.partido}`);
  }
  linhas.push("");
  linhas.push("Confira o nome e a foto na urna antes de apertar Confirma.");
  linhas.push("Fonte: TSE. Não é o aplicativo oficial.");
  return linhas.join("\n");
}

export function slugPartido(sigla: string) {
  return sigla
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function urlFoto(sq?: string) {
  if (!sq) return "";
  return `https://assets.colinha.ai/candidatos/fotos/2026/${sq}.jpeg`;
}

export function urlPartido(sigla: string) {
  return `https://assets.colinha.ai/partidos/${slugPartido(sigla)}/logo/sm.jpg`;
}

export function urlBandeira(uf: string) {
  if (uf === "BR") return "";
  return `https://assets.colinha.ai/estados/${uf.toLowerCase()}/bandeira/sm.jpg`;
}

export function urlMidia(url: string) {
  return `/midia?u=${encodeURIComponent(url)}`;
}

export function montarLink(uf: string, escolhas: Partial<Record<CargoId, Escolha>>) {
  const partes = [uf];
  for (const cargo of CARGOS) {
    const escolha = escolhas[cargo.id];
    if (!escolha) continue;
    if (escolha.tipo === "cand") partes.push(`${cargo.id}=${escolha.cand.n}`);
    else if (escolha.tipo === "branco") partes.push(`${cargo.id}=branco`);
    else if (escolha.tipo === "nulo") partes.push(`${cargo.id}=nulo`);
    else partes.push(`${cargo.id}=legenda:${escolha.pn}:${escolha.partido}`);
  }
  return `${location.origin}${location.pathname}#${partes.join("/")}`;
}

export function lerHash(hash: string): { uf: string; brutos: Partial<Record<CargoId, string>> } | null {
  const texto = hash.replace(/^#/, "");
  if (!texto) return null;
  const partes = texto.split("/").filter(Boolean);
  const uf = partes[0]?.toUpperCase();
  if (!uf || !UFS.some((u) => u.sigla === uf)) return null;
  const brutos: Partial<Record<CargoId, string>> = {};
  for (const parte of partes.slice(1)) {
    const [id, valor] = parte.split("=");
    if (!valor) continue;
    if (CARGOS.some((c) => c.id === id)) brutos[id as CargoId] = decodeURIComponent(valor);
  }
  return { uf, brutos };
}
