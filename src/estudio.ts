import {
  CARGOS,
  type CargoId,
  type Escolha,
  nomeUf,
  tituloCargo,
  urlBandeira,
  urlFoto,
  urlMidia,
  urlPartido,
} from "./model";

export const CORES: { id: string; nome: string; hex: string }[] = [
  { id: "claro", nome: "Claro", hex: "#FFFFFF" },
  { id: "areia", nome: "Areia", hex: "#E8D9BC" },
  { id: "grafite", nome: "Grafite", hex: "#3A3A3A" },
  { id: "escuro", nome: "Escuro", hex: "#111111" },
  { id: "turquesa", nome: "Turquesa", hex: "#12A4B0" },
  { id: "azul", nome: "Azul", hex: "#0A3D91" },
  { id: "noite", nome: "Noite", hex: "#12233F" },
  { id: "roxo", nome: "Roxo", hex: "#5B2A86" },
  { id: "magenta", nome: "Magenta", hex: "#8E2189" },
  { id: "rosa", nome: "Rosa", hex: "#F58CBC" },
  { id: "vinho", nome: "Vinho", hex: "#5C1020" },
  { id: "vermelho", nome: "Vermelho", hex: "#B3121A" },
  { id: "laranja", nome: "Laranja", hex: "#F58220" },
  { id: "amarelo", nome: "Amarelo", hex: "#FBBF21" },
  { id: "limao", nome: "Limão", hex: "#7FC768" },
  { id: "verde", nome: "Verde", hex: "#0A6B34" },
];

export type ModeloId = "folha" | "urna" | "fila" | "mapa" | "comicio" | "santinho" | "outdoor" | "manifesto";

export const MODELOS: { id: ModeloId; nome: string; grupo: string }[] = [
  { id: "folha", nome: "Colinha", grupo: "Urna" },
  { id: "urna", nome: "Tela da urna", grupo: "Urna" },
  { id: "fila", nome: "Fila da seção", grupo: "Urna" },
  { id: "mapa", nome: "Mapa", grupo: "Campanha" },
  { id: "comicio", nome: "Comício", grupo: "Campanha" },
  { id: "santinho", nome: "Santinho", grupo: "Campanha" },
  { id: "outdoor", nome: "Outdoor", grupo: "Campanha" },
  { id: "manifesto", nome: "Manifesto", grupo: "Campanha" },
];

export type Linha = {
  cargo: string;
  digitos: number;
  nome: string;
  numero: string;
  partido: string;
  foto: ImageBitmap | null;
  logo: ImageBitmap | null;
  tipo: "cand" | "branco" | "nulo" | "legenda" | "vazio";
};

export type Cena = {
  uf: string;
  estado: string;
  bandeira: ImageBitmap | null;
  linhas: Linha[];
};

type Paleta = {
  bg: string;
  text: string;
  muted: string;
  faint: string;
  cell: string;
  line: string;
  clara: boolean;
};

function canal(c: number) {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function rel(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

function contraste(a: string, b: string) {
  const A = rel(a);
  const B = rel(b);
  const [hi, lo] = A > B ? [A, B] : [B, A];
  return (hi + 0.05) / (lo + 0.05);
}

function misturar(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}

export function paletaDe(id: string): Paleta {
  const hex = CORES.find((c) => c.id === id)?.hex ?? "#FFFFFF";
  const text = contraste(hex, "#111111") >= contraste(hex, "#F5F5F5") ? "#111111" : "#F5F5F5";
  const clara = text === "#111111";
  return {
    bg: hex,
    text,
    muted: misturar(hex, text, 0.62),
    faint: misturar(hex, text, 0.38),
    cell: clara ? "rgba(17,17,17,0.05)" : "rgba(255,255,255,0.12)",
    line: clara ? "rgba(17,17,17,0.16)" : "rgba(255,255,255,0.30)",
    clara,
  };
}

async function bitmap(url: string) {
  if (!url) return null;
  try {
    const resposta = await fetch(urlMidia(url));
    if (!resposta.ok) return null;
    return await createImageBitmap(await resposta.blob());
  } catch {
    return null;
  }
}

export async function montarCena(
  uf: string,
  escolhas: Partial<Record<CargoId, Escolha>>,
): Promise<Cena> {
  const linhas: Linha[] = [];
  for (const cargo of CARGOS) {
    const escolha = escolhas[cargo.id];
    const base = {
      cargo: tituloCargo(cargo.id, uf).toUpperCase(),
      digitos: cargo.digitos,
    };
    if (escolha?.tipo === "cand") {
      const [foto, logo] = await Promise.all([
        bitmap(urlFoto(escolha.cand.sq)),
        bitmap(urlPartido(escolha.cand.partido)),
      ]);
      linhas.push({
        ...base,
        nome: escolha.cand.nome,
        numero: escolha.cand.n,
        partido: escolha.cand.partido,
        foto,
        logo,
        tipo: "cand",
      });
    } else if (escolha?.tipo === "branco" || escolha?.tipo === "nulo") {
      linhas.push({ ...base, nome: escolha.tipo === "branco" ? "BRANCO" : "NULO", numero: "", partido: "", foto: null, logo: null, tipo: escolha.tipo });
    } else if (escolha?.tipo === "legenda") {
      const logo = await bitmap(urlPartido(escolha.partido));
      linhas.push({
        ...base,
        nome: escolha.partido,
        numero: escolha.pn,
        partido: escolha.partido,
        foto: null,
        logo,
        tipo: "legenda",
      });
    } else {
      linhas.push({ ...base, nome: "", numero: "", partido: "", foto: null, logo: null, tipo: "vazio" });
    }
  }
  return {
    uf,
    estado: nomeUf(uf),
    bandeira: await bitmap(urlBandeira(uf)),
    linhas,
  };
}

function cover(
  ctx: CanvasRenderingContext2D,
  img: ImageBitmap,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();
  const ir = img.width / img.height;
  const br = w / h;
  let dw = w;
  let dh = h;
  let dx = x;
  let dy = y;
  if (ir > br) {
    dh = h;
    dw = h * ir;
    dx = x - (dw - w) / 2;
  } else {
    dw = w;
    dh = w / ir;
    dy = y - (dh - h) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function caixa(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  digito: string,
  pal: Paleta,
) {
  const r = Math.min(12, h * 0.22);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = pal.cell;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = pal.line;
  ctx.stroke();
  if (!digito) return;
  ctx.fillStyle = pal.text;
  ctx.font = `700 ${Math.round(h * 0.58)}px Figtree, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(digito, x + w / 2, y + h / 2 + h * 0.02);
}

function cortar(ctx: CanvasRenderingContext2D, texto: string, max: number) {
  if (ctx.measureText(texto).width <= max) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

type Revelacao = { digitos: number; nome: number };

function revelar(linhas: Linha[], t: number): Revelacao[] {
  const passos = linhas.map((l) => (l.tipo === "cand" || l.tipo === "legenda" ? l.numero.length + 1 : l.tipo === "vazio" ? 0 : 1));
  const total = Math.max(1, passos.reduce((s, n) => s + n, 0));
  const andado = Math.max(0, (t - 0.04) / 0.96) * total;
  let acc = 0;
  return linhas.map((l, i) => {
    const n = l.numero.length;
    if (l.tipo === "vazio") return { digitos: 0, nome: 0 };
    const local = andado - acc;
    acc += passos[i];
    if (l.tipo !== "cand" && l.tipo !== "legenda") return { digitos: 0, nome: local > 0 ? 1 : 0 };
    const digitos = Math.max(0, Math.min(n, Math.floor(local)));
    const nome = local >= n ? Math.min(1, local - n) : 0;
    return { digitos, nome };
  });
}

function linhasVisiveis(cena: Cena, vazios: boolean) {
  return vazios ? cena.linhas : cena.linhas.filter((l) => l.tipo !== "vazio");
}

export function desenharFolha(
  ctx: CanvasRenderingContext2D,
  cena: Cena,
  corId: string,
  t: number,
  vazios: boolean,
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const story = h / w > 1.55;
  const pal = paletaDe(corId);
  const linhas = linhasVisiveis(cena, vazios);
  const revel = revelar(cena.linhas, t);
  ctx.setTransform(w / 1080, 0, 0, h / (story ? 1920 : 1350), 0, 0);
  const W = 1080;
  const H = story ? 1920 : 1350;
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, W, H);

  const contentTop = story ? 250 : 148;
  const contentBottom = story ? 1606 : 1228;
  const n = Math.max(linhas.length, 1);
  const rowH = Math.min((contentBottom - contentTop) / n, story ? 250 : 200);
  const bloco = rowH * n;
  const startY = contentTop + (contentBottom - contentTop - bloco) / 2;

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = pal.text;
  ctx.font = "800 28px Figtree, sans-serif";
  ctx.fillText("Cédula", 72, story ? 118 : 62);
  if (cena.bandeira) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(W / 2 - 118, (story ? 118 : 62) - 14, 36, 24, 4);
    ctx.clip();
    ctx.drawImage(cena.bandeira, W / 2 - 118, (story ? 118 : 62) - 14, 36, 24);
    ctx.restore();
  }
  ctx.font = "700 22px Figtree, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${cena.estado} · ${cena.uf}`, W / 2 - 74, story ? 118 : 62);
  ctx.textAlign = "right";
  ctx.font = "800 15px Figtree, sans-serif";
  ctx.fillStyle = pal.muted;
  ctx.fillText("ELEIÇÕES", W - 72, (story ? 108 : 52));
  ctx.font = "800 22px Figtree, sans-serif";
  ctx.fillStyle = pal.text;
  ctx.fillText("2026", W - 72, (story ? 132 : 74));

  linhas.forEach((linha, i) => {
    const origem = cena.linhas.indexOf(linha);
    const rev = revel[origem] ?? { digitos: linha.numero.length, nome: 1 };
    const y = startY + i * rowH;
    const fotoH = Math.round(rowH * 0.78);
    const fotoW = Math.round(fotoH * 0.72);
    const fotoX = 72;
    const fotoY = y + (rowH - fotoH) / 2;
    if (rev.nome > 0.02 && linha.foto) {
      ctx.save();
      ctx.globalAlpha = rev.nome;
      cover(ctx, linha.foto, fotoX, fotoY, fotoW, fotoH, 16);
      ctx.restore();
    }

    const cellH = Math.min(Math.round(rowH * 0.34), 78);
    const cellW = Math.round(cellH * 0.78);
    const gap = Math.round(cellW * 0.16);
    const cellsW = linha.digitos * cellW + (linha.digitos - 1) * gap;
    const cellsX = (W - cellsW) / 2;
    const cellsY = y + rowH * 0.34;
    ctx.textAlign = "center";
    ctx.fillStyle = pal.muted;
    ctx.font = `700 ${Math.max(13, Math.round(rowH * 0.09))}px Figtree, sans-serif`;
    ctx.fillText(linha.cargo, W / 2, cellsY - cellH * 0.42);
    if (linha.tipo === "branco" || linha.tipo === "nulo") {
      ctx.globalAlpha = rev.nome;
      ctx.fillStyle = pal.text;
      ctx.font = `800 ${Math.round(cellH * 0.7)}px Figtree, sans-serif`;
      ctx.fillText(linha.nome, W / 2, cellsY + cellH / 2);
      ctx.globalAlpha = 1;
    } else {
      for (let d = 0; d < linha.digitos; d += 1) {
        const ch = d < rev.digitos ? linha.numero[d] ?? "" : "";
        caixa(ctx, cellsX + d * (cellW + gap), cellsY, cellW, cellH, ch, pal);
      }
      if (rev.nome > 0.02 && linha.nome) {
        ctx.save();
        ctx.globalAlpha = rev.nome;
        ctx.fillStyle = pal.text;
        ctx.font = `800 ${Math.max(18, Math.round(rowH * 0.13))}px Figtree, sans-serif`;
        ctx.fillText(cortar(ctx, linha.nome, cellsW + 80), W / 2, cellsY + cellH + rowH * 0.16);
        ctx.restore();
      }
    }
    if (rev.nome > 0.02 && linha.logo) {
      const logo = Math.round(rowH * 0.42);
      ctx.save();
      ctx.globalAlpha = rev.nome;
      const lx = W - 72 - logo;
      const ly = y + (rowH - logo) / 2;
      ctx.beginPath();
      ctx.roundRect(lx, ly, logo, logo, 14);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.drawImage(linha.logo, lx + 8, ly + 8, logo - 16, logo - 16);
      ctx.restore();
    }
  });

  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  ctx.fillStyle = pal.muted;
  ctx.font = "600 20px Figtree, sans-serif";
  ctx.fillText("Confira o nome e a foto na urna", W / 2, H - (story ? 150 : 58));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function pessoaNoTempo(cena: Cena, t: number) {
  const pessoas = cena.linhas.filter((l) => l.tipo === "cand" || l.tipo === "legenda");
  if (!pessoas.length) return null;
  const i = Math.min(pessoas.length - 1, Math.floor(Math.min(0.999, t) * pessoas.length));
  const local = (Math.min(0.999, t) * pessoas.length) % 1;
  const n = pessoas[i].numero.length || 1;
  const fim = 0.58;
  const digitos = local >= fim ? n : Math.floor((local / fim) * n);
  const nome = local < fim ? 0 : Math.min(1, (local - fim) / 0.22);
  const confirma = local > 0.86 ? Math.min(1, (local - 0.86) / 0.14) : 0;
  return { pessoa: pessoas[i], i, total: pessoas.length, digitos, nome, confirma };
}

function desenharUrna(ctx: CanvasRenderingContext2D, cena: Cena, t: number) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.setTransform(w / 1080, 0, 0, h / 1920, 0, 0);
  ctx.fillStyle = "#101211";
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.beginPath();
  ctx.roundRect(64, 48, 952, 1824, 56);
  ctx.fillStyle = "#1c1e1c";
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(104, 96, 872, 980, 18);
  ctx.fillStyle = "#083222";
  ctx.fill();
  ctx.strokeStyle = "#1f6b48";
  ctx.lineWidth = 3;
  ctx.stroke();

  const atual = pessoaNoTempo(cena, t);
  ctx.textAlign = "left";
  ctx.fillStyle = "#b7e7cb";
  ctx.font = "600 22px Figtree, sans-serif";
  ctx.fillText(`ELEIÇÕES 2026  ·  ${cena.uf}`, 140, 160);
  ctx.fillStyle = "#7dcea5";
  ctx.font = "600 20px Figtree, sans-serif";
  ctx.fillText("SEU VOTO PARA", 140, 230);
  if (atual) {
    ctx.fillStyle = "#f3fff8";
    ctx.font = "700 34px Figtree, sans-serif";
    ctx.fillText(atual.pessoa.cargo, 140, 280);
    ctx.fillStyle = "#9fe7c2";
    ctx.font = "600 20px Figtree, sans-serif";
    ctx.fillText("Número", 140, 360);
    const cell = 92;
    for (let d = 0; d < atual.pessoa.digitos; d += 1) {
      const x = 140 + d * (cell + 14);
      ctx.beginPath();
      ctx.roundRect(x, 390, cell, 112, 8);
      ctx.fillStyle = "#062818";
      ctx.fill();
      ctx.strokeStyle = "#1f8a56";
      ctx.stroke();
      if (d < atual.digitos && atual.pessoa.numero[d]) {
        ctx.fillStyle = "#f4fff8";
        ctx.font = "700 72px Figtree, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(atual.pessoa.numero[d], x + cell / 2, 446);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }
    }
    if (atual.nome > 0.02) {
      ctx.save();
      ctx.globalAlpha = atual.nome;
      if (atual.pessoa.foto) cover(ctx, atual.pessoa.foto, 760, 360, 180, 230, 8);
      ctx.fillStyle = "#9fe7c2";
      ctx.font = "600 20px Figtree, sans-serif";
      ctx.fillText("Nome", 140, 580);
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 40px Figtree, sans-serif";
      ctx.fillText(cortar(ctx, atual.pessoa.nome, 560), 140, 630);
      ctx.fillStyle = "#9fe7c2";
      ctx.font = "600 20px Figtree, sans-serif";
      ctx.fillText("Partido", 140, 700);
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 32px Figtree, sans-serif";
      ctx.fillText(atual.pessoa.partido, 140, 748);
      ctx.restore();
    }
    ctx.fillStyle = atual.confirma ? "#d8ffe8" : "#6eae8c";
    ctx.font = "600 22px Figtree, sans-serif";
    ctx.fillText(atual.confirma ? "VERDE para CONFIRMAR" : " ", 140, 1000);
  }

  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "BRANCO", "0", "CORRIGE"];
  teclas.forEach((tecla, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 140 + col * 270;
    const y = 1140 + row * 130;
    const ultimo = atual?.pessoa.numero[atual.digitos - 1];
    const acesa = atual && atual.digitos > 0 && tecla === ultimo && atual.nome === 0;
    ctx.beginPath();
    ctx.roundRect(x, y, 240, 108, 14);
    ctx.fillStyle = tecla === "CORRIGE" ? "#E06A1A" : tecla === "BRANCO" ? "#F4F4F4" : acesa ? "#6A6E6C" : "#3C403E";
    ctx.fill();
    ctx.fillStyle = tecla === "BRANCO" ? "#111" : "#fff";
    ctx.font = tecla.length > 1 ? "700 22px Figtree, sans-serif" : "700 40px Figtree, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tecla, x + 120, y + 54);
  });
  ctx.beginPath();
  ctx.roundRect(140, 1668, 780, 110, 16);
  ctx.fillStyle = atual && atual.confirma > 0.4 ? "#1ed760" : "#146b38";
  ctx.fill();
  ctx.fillStyle = atual && atual.confirma > 0.4 ? "#042015" : "#b7e7cb";
  ctx.font = "800 32px Figtree, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("CONFIRMA", 530, 1724);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function desenharFila(ctx: CanvasRenderingContext2D, cena: Cena, t: number) {
  const atual = pessoaNoTempo(cena, t);
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.setTransform(w / 1080, 0, 0, h / 1920, 0, 0);
  ctx.fillStyle = "#E7E1D4";
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = "#F7F4EA";
  ctx.beginPath();
  ctx.roundRect(80, 120, 920, 1680, 36);
  ctx.fill();
  ctx.fillStyle = "#1B2522";
  ctx.textAlign = "center";
  ctx.font = "800 28px Figtree, sans-serif";
  ctx.fillText("É A SUA VEZ", 540, 240);
  ctx.fillStyle = "#6F827B";
  ctx.font = "700 22px Figtree, sans-serif";
  ctx.fillText("DIA DE VOTAR", 540, 290);
  ctx.fillStyle = "#1B2522";
  ctx.font = "800 26px Figtree, sans-serif";
  ctx.fillText(atual?.pessoa.cargo ?? "SUA COLINHA", 540, 420);
  if (atual?.pessoa.foto && atual.nome > 0) {
    ctx.save();
    ctx.globalAlpha = atual.nome;
    cover(ctx, atual.pessoa.foto, 390, 480, 300, 380, 24);
    ctx.restore();
  }
  const pal = paletaDe("claro");
  if (atual) {
    const cell = 100;
    const total = atual.pessoa.digitos * cell + (atual.pessoa.digitos - 1) * 16;
    const x0 = (1080 - total) / 2;
    for (let d = 0; d < atual.pessoa.digitos; d += 1) {
      caixa(ctx, x0 + d * (cell + 16), 920, cell, 120, d < atual.digitos ? atual.pessoa.numero[d] ?? "" : "", pal);
    }
    ctx.globalAlpha = atual.nome;
    ctx.fillStyle = "#1B2522";
    ctx.font = "800 48px Figtree, sans-serif";
    ctx.fillText(cortar(ctx, atual.pessoa.nome, 820), 540, 1160);
    ctx.fillStyle = "#6F827B";
    ctx.font = "700 26px Figtree, sans-serif";
    ctx.fillText(`${atual.pessoa.partido}  ·  ${cena.uf}`, 540, 1220);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = "#6F827B";
  ctx.font = "600 22px Figtree, sans-serif";
  ctx.fillText(`ELEIÇÕES 2026  ·  ${cena.estado.toUpperCase()}`, 540, 1680);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function desenharMapa(ctx: CanvasRenderingContext2D, cena: Cena, t: number) {
  const atual = pessoaNoTempo(cena, t);
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.setTransform(w / 1080, 0, 0, h / 1920, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, 1920);
  g.addColorStop(0, "#0A3D91");
  g.addColorStop(1, "#071E4A");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.save();
  ctx.translate(180, 180);
  ctx.scale(2.6, 2.6);
  ctx.beginPath();
  ctx.moveTo(150, 20);
  ctx.bezierCurveTo(190, 10, 230, 30, 250, 55);
  ctx.bezierCurveTo(275, 80, 260, 110, 245, 130);
  ctx.bezierCurveTo(270, 150, 255, 190, 220, 210);
  ctx.bezierCurveTo(180, 235, 140, 220, 110, 200);
  ctx.bezierCurveTo(70, 175, 40, 150, 45, 110);
  ctx.bezierCurveTo(50, 70, 80, 45, 110, 30);
  ctx.bezierCurveTo(125, 22, 135, 24, 150, 20);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#F5F5F5";
  ctx.textAlign = "left";
  ctx.font = "800 22px Figtree, sans-serif";
  ctx.fillText("ELEIÇÕES 2026", 80, 120);
  ctx.font = "800 64px Figtree, sans-serif";
  ctx.fillText(cena.estado.toUpperCase(), 80, 200);
  if (atual) {
    ctx.font = "700 24px Figtree, sans-serif";
    ctx.fillStyle = "rgba(245,245,245,0.75)";
    ctx.fillText(atual.pessoa.cargo, 80, 1280);
    const pal: Paleta = { bg: "#0A3D91", text: "#F5F5F5", muted: "#D5DDEA", faint: "#9AABC4", cell: "rgba(255,255,255,0.12)", line: "rgba(255,255,255,0.35)", clara: false };
    for (let d = 0; d < atual.pessoa.digitos; d += 1) {
      caixa(ctx, 80 + d * 100, 1330, 84, 108, d < atual.digitos ? atual.pessoa.numero[d] ?? "" : "", pal);
    }
    if (atual.nome > 0 && atual.pessoa.foto) {
      ctx.save();
      ctx.globalAlpha = atual.nome;
      cover(ctx, atual.pessoa.foto, 80, 1480, 200, 250, 20);
      ctx.fillStyle = "#fff";
      ctx.font = "800 42px Figtree, sans-serif";
      ctx.fillText(cortar(ctx, atual.pessoa.nome, 680), 310, 1580);
      ctx.font = "700 24px Figtree, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillText(atual.pessoa.partido, 310, 1640);
      ctx.restore();
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function desenharComicio(ctx: CanvasRenderingContext2D, cena: Cena, t: number) {
  const atual = pessoaNoTempo(cena, t);
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.setTransform(w / 1080, 0, 0, h / 1920, 0, 0);
  ctx.fillStyle = "#07101F";
  ctx.fillRect(0, 0, 1080, 1920);
  const glow = ctx.createRadialGradient(540, 620, 40, 540, 620, 520);
  glow.addColorStop(0, "rgba(255,196,92,0.45)");
  glow.addColorStop(1, "rgba(255,196,92,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = "#E7C56A";
  ctx.textAlign = "center";
  ctx.font = "700 22px Figtree, sans-serif";
  ctx.fillText(`ELEIÇÕES 2026  ·  ${cena.uf}`, 540, 160);
  if (atual) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "700 26px Figtree, sans-serif";
    ctx.fillText(atual.pessoa.cargo, 540, 240);
    if (atual.nome > 0 && atual.pessoa.foto) {
      ctx.save();
      ctx.globalAlpha = atual.nome;
      ctx.beginPath();
      ctx.arc(540, 560, 210, 0, Math.PI * 2);
      ctx.clip();
      cover(ctx, atual.pessoa.foto, 330, 350, 420, 420, 0);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(540, 560, 210, 0, Math.PI * 2);
      ctx.strokeStyle = "#E7C56A";
      ctx.lineWidth = 8;
      ctx.stroke();
    }
    ctx.fillStyle = "#F4EFE4";
    ctx.font = "800 120px Figtree, sans-serif";
    const num = atual.pessoa.numero.slice(0, atual.digitos);
    ctx.fillText(num || " ", 540, 980);
    ctx.save();
    ctx.globalAlpha = atual.nome;
    ctx.font = "800 54px Figtree, sans-serif";
    ctx.fillText(cortar(ctx, atual.pessoa.nome, 900), 540, 1100);
    ctx.fillStyle = "#E7C56A";
    ctx.font = "700 28px Figtree, sans-serif";
    ctx.fillText(atual.pessoa.partido, 540, 1160);
    ctx.restore();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function desenharSantinho(ctx: CanvasRenderingContext2D, cena: Cena, t: number) {
  const atual = pessoaNoTempo(cena, t);
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.setTransform(w / 1080, 0, 0, h / 1920, 0, 0);
  ctx.fillStyle = "#D9D2C3";
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = "#FFFdf8";
  ctx.shadowColor = "rgba(40,30,10,0.18)";
  ctx.shadowBlur = 40;
  ctx.beginPath();
  ctx.roundRect(90, 140, 900, 1640, 32);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#6d675e";
  ctx.textAlign = "center";
  ctx.font = "700 22px Figtree, sans-serif";
  ctx.fillText(atual?.pessoa.cargo ?? "", 540, 220);
  if (atual?.pessoa.foto && atual.nome > 0) {
    ctx.save();
    ctx.globalAlpha = atual.nome;
    cover(ctx, atual.pessoa.foto, 250, 280, 580, 720, 24);
    ctx.restore();
  } else {
    ctx.fillStyle = "#F3EEE4";
    ctx.beginPath();
    ctx.roundRect(250, 280, 580, 720, 24);
    ctx.fill();
  }
  const pal = paletaDe("claro");
  if (atual) {
    const cell = 110;
    const total = atual.pessoa.digitos * cell + (atual.pessoa.digitos - 1) * 16;
    const x0 = (1080 - total) / 2;
    for (let d = 0; d < atual.pessoa.digitos; d += 1) {
      caixa(ctx, x0 + d * (cell + 16), 1060, cell, 130, d < atual.digitos ? atual.pessoa.numero[d] ?? "" : "", pal);
    }
    ctx.save();
    ctx.globalAlpha = atual.nome;
    ctx.fillStyle = "#1c1915";
    ctx.font = "800 48px Figtree, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(cortar(ctx, atual.pessoa.nome, 780), 540, 1280);
    ctx.fillStyle = "#6d675e";
    ctx.font = "700 26px Figtree, sans-serif";
    ctx.fillText(`${atual.pessoa.partido}  ·  ${cena.estado}`, 540, 1340);
    ctx.restore();
  }
  ctx.fillStyle = "#8a8478";
  ctx.font = "600 20px Figtree, sans-serif";
  ctx.fillText("ELEIÇÕES 2026", 540, 1680);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function desenharOutdoor(ctx: CanvasRenderingContext2D, cena: Cena, t: number) {
  const atual = pessoaNoTempo(cena, t);
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.setTransform(w / 1080, 0, 0, h / 1920, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, 1920);
  g.addColorStop(0, "#070B14");
  g.addColorStop(1, "#14102A");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = "#0E1320";
  ctx.fillRect(70, 280, 940, 1200);
  ctx.strokeStyle = "#E7C56A";
  ctx.lineWidth = 8;
  ctx.strokeRect(70, 280, 940, 1200);
  for (let i = 0; i < 8; i += 1) {
    ctx.beginPath();
    ctx.arc(120 + i * 120, 250, 8, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? "#E7C56A" : "#F5F5F5";
    ctx.fill();
  }
  if (atual) {
    ctx.fillStyle = "#E7C56A";
    ctx.font = "700 24px Figtree, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(atual.pessoa.cargo, 110, 360);
    ctx.fillStyle = "#fff";
    ctx.font = "800 130px Figtree, sans-serif";
    ctx.fillText(atual.pessoa.numero.slice(0, atual.digitos), 110, 560);
    if (atual.nome > 0) {
      ctx.save();
      ctx.globalAlpha = atual.nome;
      if (atual.pessoa.foto) cover(ctx, atual.pessoa.foto, 110, 640, 280, 360, 16);
      ctx.font = "800 48px Figtree, sans-serif";
      ctx.fillText(cortar(ctx, atual.pessoa.nome, 500), 420, 760);
      ctx.fillStyle = "#E7C56A";
      ctx.font = "700 28px Figtree, sans-serif";
      ctx.fillText(`${atual.pessoa.partido}  ·  ${cena.uf}`, 420, 830);
      ctx.restore();
    }
  }
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "600 22px Figtree, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ANOTADO NA COLINHA", 540, 1600);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function desenharManifesto(ctx: CanvasRenderingContext2D, cena: Cena, t: number) {
  const atual = pessoaNoTempo(cena, t);
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.setTransform(w / 1080, 0, 0, h / 1920, 0, 0);
  ctx.fillStyle = "#0C0D10";
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = "#43A047";
  ctx.fillRect(0, 0, 18, 1920);
  if (atual) {
    ctx.fillStyle = "#9A9A9A";
    ctx.font = "700 24px Figtree, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`VAGA ${atual.i + 1} DE ${atual.total}`, 80, 180);
    ctx.fillStyle = "#F5F5F5";
    ctx.font = "800 28px Figtree, sans-serif";
    ctx.fillText(atual.pessoa.cargo, 80, 250);
    ctx.font = "800 180px Figtree, sans-serif";
    ctx.fillText(atual.pessoa.numero.slice(0, atual.digitos) || " ", 80, 520);
    if (atual.nome > 0) {
      ctx.save();
      ctx.globalAlpha = atual.nome;
      if (atual.pessoa.foto) cover(ctx, atual.pessoa.foto, 80, 640, 920, 860, 28);
      ctx.fillStyle = "#fff";
      ctx.font = "800 64px Figtree, sans-serif";
      ctx.fillText(cortar(ctx, atual.pessoa.nome, 900), 80, 1620);
      ctx.fillStyle = "#66C46A";
      ctx.font = "700 32px Figtree, sans-serif";
      ctx.fillText(`${atual.pessoa.partido}  ·  ${cena.uf}`, 80, 1690);
      ctx.restore();
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

export function desenhar(
  ctx: CanvasRenderingContext2D,
  cena: Cena,
  modelo: ModeloId,
  corId: string,
  t: number,
  vazios: boolean,
) {
  const bruto = ctx as CanvasRenderingContext2D & { reset?: () => void };
  bruto.reset?.();
  ctx.globalAlpha = 1;
  if (modelo === "urna") desenharUrna(ctx, cena, t);
  else if (modelo === "fila") desenharFila(ctx, cena, t);
  else if (modelo === "mapa") desenharMapa(ctx, cena, t);
  else if (modelo === "comicio") desenharComicio(ctx, cena, t);
  else if (modelo === "santinho") desenharSantinho(ctx, cena, t);
  else if (modelo === "outdoor") desenharOutdoor(ctx, cena, t);
  else if (modelo === "manifesto") desenharManifesto(ctx, cena, t);
  else desenharFolha(ctx, cena, corId, t, vazios);
}

export function duracaoDe(cena: Cena, modelo: ModeloId) {
  if (modelo === "folha") {
    const passos = cena.linhas.reduce((s, l) => s + (l.tipo === "cand" || l.tipo === "legenda" ? l.numero.length + 1 : 0), 0);
    return Math.max(6000, 1200 + passos * 320);
  }
  const n = Math.max(1, cena.linhas.filter((l) => l.tipo === "cand" || l.tipo === "legenda").length);
  return Math.max(5000, n * 2800);
}

async function blobDe(canvas: HTMLCanvasElement) {
  await document.fonts.load("800 64px Figtree");
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("png");
  return blob;
}

export async function imagemParada(cena: Cena, corId: string, vazios: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  desenharFolha(ctx, cena, corId, 1, vazios);
  return blobDe(canvas);
}

export function gravarVideo(
  cena: Cena,
  modelo: ModeloId,
  corId: string,
  vazios: boolean,
  aoAndar: (t: number) => void,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof MediaRecorder === "undefined") return Promise.reject(new Error("video"));
  desenhar(ctx, cena, modelo, corId, 0, vazios);
  const stream = canvas.captureStream(30);
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const pedacos: Blob[] = [];
  rec.ondataavailable = (evento) => {
    if (evento.data.size) pedacos.push(evento.data);
  };
  const pronto = new Promise<Blob>((resolve) => {
    rec.onstop = () => resolve(new Blob(pedacos, { type: "video/webm" }));
  });
  rec.start();
  const inicio = performance.now();
  const duracao = duracaoDe(cena, modelo);
  return new Promise<Blob>((resolve, reject) => {
    const quadro = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / duracao);
      desenhar(ctx, cena, modelo, corId, t, vazios);
      aoAndar(t);
      if (t < 1) requestAnimationFrame(quadro);
      else {
        rec.stop();
        pronto.then(resolve, reject);
      }
    };
    requestAnimationFrame(quadro);
  });
}
