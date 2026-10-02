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

export type CartazOpcoes = {
  uf: string;
  escolhas: Partial<Record<CargoId, Escolha>>;
  formato: "post" | "story";
  soPreenchidos: boolean;
  escuro: boolean;
};

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

function cortar(ctx: CanvasRenderingContext2D, texto: string, max: number) {
  if (ctx.measureText(texto).width <= max) return texto;
  let atual = texto;
  while (atual.length > 1 && ctx.measureText(`${atual}…`).width > max) atual = atual.slice(0, -1);
  return `${atual}…`;
}

function circulo(
  ctx: CanvasRenderingContext2D,
  img: ImageBitmap | null,
  x: number,
  y: number,
  r: number,
  letra: string,
  tinta: string,
  fundo: string,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fundo;
  ctx.fill();
  ctx.clip();
  if (img) ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  else {
    ctx.fillStyle = tinta;
    ctx.font = `700 ${Math.round(r)}px Figtree, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letra, x, y + 2);
  }
  ctx.restore();
}

export async function gerarCartaz(opcoes: CartazOpcoes) {
  await document.fonts.load("700 64px Figtree");
  const story = opcoes.formato === "story";
  const largura = 1080;
  const altura = story ? 1920 : 1350;
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");

  const papel = opcoes.escuro ? "#141816" : "#f7f6f3";
  const cartao = opcoes.escuro ? "#1c2420" : "#ffffff";
  const tinta = opcoes.escuro ? "#f4f6f4" : "#14211b";
  const mudo = opcoes.escuro ? "#a3b0a8" : "#5c6b62";
  const verde = "#0c6b3d";

  ctx.fillStyle = papel;
  ctx.fillRect(0, 0, largura, altura);

  const margem = 64;
  const topo = story ? 120 : 72;
  ctx.fillStyle = tinta;
  ctx.font = "700 28px Figtree, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Sua colinha", margem, topo);
  ctx.fillStyle = mudo;
  ctx.font = "500 24px Figtree, sans-serif";
  ctx.fillText("1º turno · 4 de outubro de 2026", margem, topo + 40);

  const bandeira = await bitmap(urlBandeira(opcoes.uf));
  if (bandeira) {
    ctx.save();
    ctx.beginPath();
    round(ctx, largura - margem - 92, topo - 28, 92, 62, 8);
    ctx.clip();
    ctx.drawImage(bandeira, largura - margem - 92, topo - 28, 92, 62);
    ctx.restore();
  }
  ctx.fillStyle = tinta;
  ctx.font = "700 42px Figtree, sans-serif";
  ctx.fillText(nomeUf(opcoes.uf), margem, topo + 110);

  const linhas = CARGOS.filter((cargo) => !opcoes.soPreenchidos || opcoes.escolhas[cargo.id]);
  const fotos = await Promise.all(
    linhas.map(async (cargo) => {
      const escolha = opcoes.escolhas[cargo.id];
      if (escolha?.tipo !== "cand") return { foto: null, logo: null };
      const [foto, logo] = await Promise.all([
        bitmap(urlFoto(escolha.cand.sq)),
        bitmap(urlPartido(escolha.cand.partido)),
      ]);
      return { foto, logo };
    }),
  );

  const inicio = topo + 160;
  const fim = altura - (story ? 160 : 120);
  const alto = Math.min(story ? 230 : 168, (fim - inicio) / Math.max(linhas.length, 1));

  linhas.forEach((cargo, i) => {
    const y = inicio + i * alto;
    const escolha = opcoes.escolhas[cargo.id];
    ctx.fillStyle = cartao;
    round(ctx, margem, y, largura - margem * 2, alto - 16, 28);
    ctx.fill();

    const nome =
      escolha?.tipo === "cand"
        ? escolha.cand.nome
        : escolha?.tipo === "branco"
          ? "BRANCO"
          : escolha?.tipo === "nulo"
            ? "NULO"
            : escolha?.tipo === "legenda"
              ? `Legenda ${escolha.partido}`
              : "Ainda sem voto";
    const numero =
      escolha?.tipo === "cand"
        ? escolha.cand.n
        : escolha?.tipo === "legenda"
          ? escolha.pn
          : "";
    const raio = Math.min(54, (alto - 40) / 2);
    circulo(
      ctx,
      fotos[i]?.foto ?? null,
      margem + 36 + raio,
      y + (alto - 16) / 2,
      raio,
      nome.slice(0, 1),
      tinta,
      opcoes.escuro ? "#2a3330" : "#e7eee9",
    );

    const textoX = margem + 36 + raio * 2 + 28;
    ctx.textAlign = "left";
    ctx.fillStyle = mudo;
    ctx.font = "600 22px Figtree, sans-serif";
    ctx.fillText(tituloCargo(cargo.id, opcoes.uf), textoX, y + 48);
    ctx.fillStyle = tinta;
    ctx.font = "700 36px Figtree, sans-serif";
    ctx.fillText(cortar(ctx, nome, largura - textoX - 280), textoX, y + 96);

    if (escolha?.tipo === "cand") {
      const logo = fotos[i]?.logo;
      let px = textoX;
      if (logo) {
        ctx.drawImage(logo, textoX, y + alto - 78, 28, 28);
        px += 36;
      }
      ctx.fillStyle = mudo;
      ctx.font = "600 22px Figtree, sans-serif";
      ctx.fillText(escolha.cand.partido, px, y + alto - 56);
    }

    if (numero) {
      ctx.textAlign = "right";
      ctx.fillStyle = verde;
      ctx.font = "700 48px Figtree, sans-serif";
      ctx.fillText(numero, largura - margem - 36, y + alto / 2 + 8);
    }
  });

  ctx.textAlign = "left";
  ctx.fillStyle = mudo;
  ctx.font = "500 22px Figtree, sans-serif";
  ctx.fillText("Confira a foto na urna antes de confirmar.", margem, altura - 56);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("png");
  return blob;
}

function round(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
