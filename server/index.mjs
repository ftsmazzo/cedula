import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import pg from "pg";

const PORT = Number(process.env.PORT || 3000);
const DIST = join(process.cwd(), "dist");
const CARGOS = ["depfed", "depest", "sen1", "sen2", "gov", "pres"];
const UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
]);
const MIDIA =
  /^https:\/\/assets\.colinha\.ai\/(?:candidatos\/fotos\/2026\/\d+\.jpeg|partidos\/[a-z0-9]+\/logo\/sm\.(?:jpg|jpeg|png)|estados\/[a-z]{2}\/bandeira\/sm\.jpg)$/;
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 })
  : null;

async function preparar() {
  if (!pool) return;
  await pool.query(`
    create table if not exists cedulas (
      id text primary key,
      uf text not null,
      escolhas jsonb not null,
      ip text,
      cidade text,
      uf_ip text,
      atualizado_em timestamptz not null default now(),
      criado_em timestamptz not null default now()
    )
  `);
  await pool.query(`create index if not exists cedulas_uf_idx on cedulas (uf)`);
  await pool.query(`create index if not exists cedulas_atualizado_idx on cedulas (atualizado_em desc)`);
}

function json(res, status, corpo) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(corpo));
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const pedacos = [];
    let tamanho = 0;
    req.on("data", (parte) => {
      tamanho += parte.length;
      if (tamanho > 20_000) {
        reject(new Error("grande"));
        req.destroy();
        return;
      }
      pedacos.push(parte);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(pedacos).toString("utf8") || "{}"));
      } catch {
        reject(new Error("json"));
      }
    });
    req.on("error", reject);
  });
}

function ipDe(req) {
  const encaminhado = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const bruto = encaminhado || req.socket.remoteAddress || "";
  return bruto.replace(/^::ffff:/, "");
}

function ipPublico(ip) {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return false;
  if (ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("172.")) return false;
  return true;
}

const geoCache = new Map();

async function localizar(ip) {
  if (!ipPublico(ip)) return { cidade: "", uf: "" };
  if (geoCache.has(ip)) return geoCache.get(ip);
  try {
    const resposta = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(2500),
    });
    const dados = await resposta.json();
    const lugar = {
      cidade: typeof dados.city === "string" ? dados.city.slice(0, 80) : "",
      uf: typeof dados.region_code === "string" ? dados.region_code.slice(0, 8) : "",
    };
    geoCache.set(ip, lugar);
    return lugar;
  } catch {
    return { cidade: "", uf: "" };
  }
}

function texto(valor, max) {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

function escolhasValidas(bruto) {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const saida = {};
  for (const cargo of CARGOS) {
    const item = bruto[cargo];
    if (!item || typeof item !== "object") continue;
    if (item.tipo === "branco" || item.tipo === "nulo") {
      saida[cargo] = { tipo: item.tipo };
    } else if (item.tipo === "cand" || item.tipo === "legenda") {
      const n = texto(item.n, 6);
      const nome = texto(item.nome, 80);
      const partido = texto(item.partido, 40);
      if (!n && item.tipo === "cand") continue;
      saida[cargo] = { tipo: item.tipo, n, nome, partido };
    }
  }
  return Object.keys(saida).length ? saida : null;
}

function autorizado(req) {
  const esperado = process.env.ADMIN_TOKEN || "";
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!esperado || token.length !== esperado.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(esperado));
}

function filtrosDe(url) {
  const uf = (url.searchParams.get("uf") || "").toUpperCase();
  const cidade = (url.searchParams.get("cidade") || "").trim().slice(0, 80);
  const cargo = url.searchParams.get("cargo") || "";
  const de = url.searchParams.get("de") || "";
  const ate = url.searchParams.get("ate") || "";
  const where = [];
  const valores = [];
  if (UFS.has(uf)) {
    valores.push(uf);
    where.push(`uf = $${valores.length}`);
  }
  if (cidade) {
    valores.push(`%${cidade}%`);
    where.push(`cidade ilike $${valores.length}`);
  }
  if (CARGOS.includes(cargo)) {
    valores.push(cargo);
    where.push(`escolhas ? $${valores.length}`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(de)) {
    valores.push(de);
    where.push(`atualizado_em >= $${valores.length}::date`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
    valores.push(ate);
    where.push(`atualizado_em < ($${valores.length}::date + interval '1 day')`);
  }
  return { where: where.length ? `where ${where.join(" and ")}` : "", valores, cargo };
}

async function painel(url) {
  const { where, valores, cargo } = filtrosDe(url);
  const grupo = cargo
    ? `${where ? `${where} and` : "where"} chave = $${valores.length}`
    : where;
  const [total, porUf, porCidade, porCargo, linhas] = await Promise.all([
    pool.query(`select count(*)::int as n from cedulas ${where}`, valores),
    pool.query(`select uf, count(*)::int as n from cedulas ${where} group by uf order by n desc`, valores),
    pool.query(
      `select coalesce(nullif(cidade, ''), 'Sem cidade') as cidade, coalesce(uf_ip, '') as uf_ip, count(*)::int as n
       from cedulas ${where} group by 1, 2 order by n desc limit 30`,
      valores,
    ),
    pool.query(
      `select chave as cargo, item->>'n' as n, item->>'nome' as nome, item->>'partido' as partido, item->>'tipo' as tipo, count(*)::int as votos
       from cedulas, jsonb_each(escolhas) as par(chave, item)
       ${grupo}
       group by 1, 2, 3, 4, 5
       order by votos desc
       limit 40`,
      valores,
    ),
    pool.query(
      `select id, uf, cidade, uf_ip, ip, escolhas, atualizado_em
       from cedulas ${where}
       order by atualizado_em desc
       limit 200`,
      valores,
    ),
  ]);
  return {
    total: total.rows[0].n,
    porUf: porUf.rows,
    porCidade: porCidade.rows,
    porCargo: porCargo.rows,
    linhas: linhas.rows,
  };
}

function arquivoDe(url) {
  const caminho = normalize(decodeURIComponent(url.pathname));
  if (caminho.includes("..")) return null;
  const cheio = join(DIST, caminho === "/" ? "index.html" : caminho);
  if (existsSync(cheio) && statSync(cheio).isFile()) return cheio;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/dados") || url.pathname.startsWith("/midia")) {
    return null;
  }
  const indice = join(DIST, "index.html");
  return existsSync(indice) ? indice : null;
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://cedula.local");
  try {
    if (req.method === "POST" && url.pathname === "/api/cedulas") {
      if (!pool) return json(res, 503, { ok: false });
      const corpo = await lerCorpo(req);
      const id = texto(corpo.id, 80);
      const uf = texto(corpo.uf, 2).toUpperCase();
      const escolhas = escolhasValidas(corpo.escolhas);
      if (!/^[a-zA-Z0-9-]{8,80}$/.test(id) || !UFS.has(uf) || !escolhas) {
        return json(res, 400, { ok: false });
      }
      const ip = ipDe(req);
      const lugar = await localizar(ip);
      await pool.query(
        `insert into cedulas (id, uf, escolhas, ip, cidade, uf_ip)
         values ($1, $2, $3::jsonb, $4, $5, $6)
         on conflict (id) do update set
           uf = excluded.uf,
           escolhas = excluded.escolhas,
           ip = excluded.ip,
           cidade = excluded.cidade,
           uf_ip = excluded.uf_ip,
           atualizado_em = now()`,
        [id, uf, JSON.stringify(escolhas), ip.slice(0, 64), lugar.cidade, lugar.uf],
      );
      return json(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/painel") {
      if (!process.env.ADMIN_TOKEN) return json(res, 503, { ok: false });
      if (!autorizado(req)) return json(res, 401, { ok: false });
      if (!pool) return json(res, 503, { ok: false });
      return json(res, 200, await painel(url));
    }

    if (url.pathname.startsWith("/midia")) {
      const alvo = url.searchParams.get("u") || "";
      if (!MIDIA.test(alvo)) {
        res.writeHead(400);
        res.end();
        return;
      }
      const resposta = await fetch(alvo);
      res.writeHead(resposta.status, {
        "content-type": resposta.headers.get("content-type") || "application/octet-stream",
        "cache-control": "public, max-age=86400",
      });
      res.end(Buffer.from(await resposta.arrayBuffer()));
      return;
    }

    const arquivo = arquivoDe(url);
    if (!arquivo) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": TIPOS[extname(arquivo)] || "application/octet-stream" });
    createReadStream(arquivo).pipe(res);
  } catch (erro) {
    console.error(erro);
    if (!res.headersSent) json(res, 500, { ok: false });
  }
});

preparar()
  .catch((erro) => console.error("banco", erro))
  .finally(() => {
    servidor.listen(PORT, () => console.log(`cedula ${PORT}`));
  });
