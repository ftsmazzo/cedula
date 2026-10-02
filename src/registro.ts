import { CARGOS, type CargoId, type Escolha } from "./model";

const SESSAO = "cedula:sessao";

export type EscolhaRegistrada = {
  tipo: "cand" | "branco" | "nulo" | "legenda";
  n?: string;
  nome?: string;
  partido?: string;
};

function sessao() {
  const atual = localStorage.getItem(SESSAO);
  if (atual) return atual;
  const nova = crypto.randomUUID();
  localStorage.setItem(SESSAO, nova);
  return nova;
}

export function resumir(escolhas: Partial<Record<CargoId, Escolha>>) {
  const saida: Partial<Record<CargoId, EscolhaRegistrada>> = {};
  for (const cargo of CARGOS) {
    const escolha = escolhas[cargo.id];
    if (!escolha) continue;
    if (escolha.tipo === "cand") {
      saida[cargo.id] = {
        tipo: "cand",
        n: escolha.cand.n,
        nome: escolha.cand.nome,
        partido: escolha.cand.partido,
      };
    } else if (escolha.tipo === "legenda") {
      saida[cargo.id] = { tipo: "legenda", n: escolha.pn, nome: escolha.partido, partido: escolha.partido };
    } else {
      saida[cargo.id] = { tipo: escolha.tipo };
    }
  }
  return saida;
}

export function registrar(uf: string, escolhas: Partial<Record<CargoId, Escolha>>) {
  const resumo = resumir(escolhas);
  if (!Object.keys(resumo).length) return;
  fetch("/api/cedulas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: sessao(), uf, escolhas: resumo }),
  }).catch(() => {
    /* o aparelho segue com a cédula local */
  });
}
