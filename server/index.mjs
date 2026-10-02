import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
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
  await pool.query(`
    create table if not exists alteracoes (
      id bigserial primary key,
      cedula_id text not null,
      uf text not null,
      escolhas jsonb not null,
      ip text,
      cidade text,
      uf_ip text,
      criado_em timestamptz not null default now()
    )
  `);
  await pool.query(`create index if not exists alteracoes_criado_idx on alteracoes (criado_em desc)`);
  await pool.query(`create index if not exists alteracoes_cedula_idx on alteracoes (cedula_id)`);
  await pool.query(`alter table cedulas add column if not exists captacao_id text`);
  await pool.query(`alter table alteracoes add column if not exists captacao_id text`);
  await pool.query(`create index if not exists cedulas_captacao_idx on cedulas (captacao_id)`);
  await pool.query(`create index if not exists alteracoes_captacao_idx on alteracoes (captacao_id)`);
  await pool.query(`create index if not exists cedulas_ip_idx on cedulas (ip)`);
  await pool.query(`create index if not exists alteracoes_ip_idx on alteracoes (ip)`);
  await pool.query(`
    create table if not exists captacoes (
      id text primary key,
      nome text not null,
      senha text not null,
      criado_em timestamptz not null default now()
    )
  `);
  await pool.query(`
    insert into alteracoes (cedula_id, uf, escolhas, ip, cidade, uf_ip, criado_em)
    select c.id, c.uf, c.escolhas, c.ip, c.cidade, c.uf_ip, c.atualizado_em
    from cedulas c
    where not exists (select 1 from alteracoes a where a.cedula_id = c.id)
  `);
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
  const token = tokenDe(req);
  return mesmoSegredo(token, esperado);
}

function filtrosDe(url, instante, captacaoId = "") {
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
  if (/^[A-Za-z0-9_-]{8,40}$/.test(captacaoId)) {
    valores.push(captacaoId);
    where.push(`captacao_id = $${valores.length}`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(de)) {
    valores.push(de);
    where.push(`${instante} >= $${valores.length}::date`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
    valores.push(ate);
    where.push(`${instante} < ($${valores.length}::date + interval '1 day')`);
  }
  return { where: where.length ? `where ${where.join(" and ")}` : "", valores, cargo };
}

async function painel(url, captacaoId = "") {
  const { where, valores, cargo } = filtrosDe(url, "atualizado_em", captacaoId);
  const historico = filtrosDe(url, "criado_em", captacaoId);
  const grupo = cargo
    ? `${where ? `${where} and` : "where"} chave = $${valores.length}`
    : where;
  const pessoa = `coalesce(nullif(ip, ''), id), coalesce(captacao_id, '')`;
  const [total, porUf, porCidade, porCargo, linhas, alteracoes, meta] = await Promise.all([
    pool.query(
      `select count(*)::int as n from (select distinct ${pessoa} from cedulas ${where}) pessoas`,
      valores,
    ),
    pool.query(
      `select uf, count(distinct (coalesce(nullif(ip, ''), id), coalesce(captacao_id, '')))::int as n
       from cedulas ${where} group by uf order by n desc`,
      valores,
    ),
    pool.query(
      `select coalesce(nullif(cidade, ''), 'Sem cidade') as cidade, coalesce(uf_ip, '') as uf_ip,
              count(distinct (coalesce(nullif(ip, ''), id), coalesce(captacao_id, '')))::int as n
       from cedulas ${where} group by 1, 2 order by n desc limit 30`,
      valores,
    ),
    pool.query(
      `select chave as cargo, item->>'n' as n, item->>'nome' as nome, item->>'partido' as partido, item->>'tipo' as tipo,
              count(distinct (coalesce(nullif(ip, ''), id), coalesce(captacao_id, '')))::int as votos
       from cedulas, jsonb_each(escolhas) as par(chave, item)
       ${grupo}
       group by 1, 2, 3, 4, 5
       order by votos desc
       limit 40`,
      valores,
    ),
    pool.query(
      `select id, uf, cidade, uf_ip, ip, escolhas, atualizado_em
       from (
         select distinct on (coalesce(nullif(ip, ''), id), coalesce(captacao_id, ''))
           id, uf, cidade, uf_ip, ip, escolhas, atualizado_em
         from cedulas ${where}
         order by coalesce(nullif(ip, ''), id), coalesce(captacao_id, ''), atualizado_em desc
       ) atuais
       order by atualizado_em desc
       limit 200`,
      valores,
    ),
    pool.query(
      `select id, cedula_id, uf, cidade, uf_ip, ip, escolhas, criado_em
       from (
         select distinct on (coalesce(nullif(ip, ''), cedula_id), coalesce(captacao_id, ''))
           id, cedula_id, uf, cidade, uf_ip, ip, escolhas, criado_em
         from alteracoes ${historico.where}
         order by coalesce(nullif(ip, ''), cedula_id), coalesce(captacao_id, ''), criado_em desc
       ) ultimas
       order by criado_em desc
       limit 200`,
      historico.valores,
    ),
    captacaoId
      ? pool.query(`select id, nome from captacoes where id = $1`, [captacaoId])
      : Promise.resolve({ rows: [] }),
  ]);
  return {
    total: total.rows[0].n,
    porUf: porUf.rows,
    porCidade: porCidade.rows,
    porCargo: porCargo.rows,
    linhas: linhas.rows,
    alteracoes: alteracoes.rows,
    captacao: meta.rows[0] || null,
  };
}

function mesmoSegredo(informado, esperado) {
  const a = Buffer.from(String(informado));
  const b = Buffer.from(String(esperado));
  if (!a.length || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function tokenDe(req) {
  const header = String(req.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function codigo() {
  return randomBytes(9).toString("base64url");
}

async function captacaoAutorizada(id, senha) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return null;
  const busca = await pool.query(`select id, nome, senha from captacoes where id = $1`, [id]);
  const linha = busca.rows[0];
  if (!linha || !mesmoSegredo(senha, linha.senha)) return null;
  return linha;
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
      const captacao = texto(corpo.captacao, 40);
      let captacaoId = null;
      if (captacao) {
        if (!/^[A-Za-z0-9_-]{8,40}$/.test(captacao)) return json(res, 400, { ok: false });
        const existe = await pool.query(`select 1 from captacoes where id = $1`, [captacao]);
        if (!existe.rowCount) return json(res, 400, { ok: false });
        captacaoId = captacao;
      }
      const ip = ipDe(req).slice(0, 64);
      const lugar = await localizar(ip);
      const payload = JSON.stringify(escolhas);
      const cliente = await pool.connect();
      try {
        await cliente.query("begin");
        const porIp = ip
          ? await cliente.query(
              `select id from cedulas
               where ip = $1 and coalesce(captacao_id, '') = coalesce($2::text, '')
               order by atualizado_em desc
               limit 1`,
              [ip, captacaoId],
            )
          : { rows: [] };
        const alvo = porIp.rows[0]?.id;
        if (alvo) {
          await cliente.query(
            `update cedulas set uf = $2, escolhas = $3::jsonb, cidade = $4, uf_ip = $5, atualizado_em = now()
             where id = $1`,
            [alvo, uf, payload, lugar.cidade, lugar.uf],
          );
          const historicoIp = await cliente.query(
            `select id from alteracoes
             where ip = $1 and coalesce(captacao_id, '') = coalesce($2::text, '')
             order by criado_em desc
             limit 1`,
            [ip, captacaoId],
          );
          const linhaHist = historicoIp.rows[0]?.id;
          if (linhaHist) {
            await cliente.query(
              `update alteracoes
               set cedula_id = $2, uf = $3, escolhas = $4::jsonb, cidade = $5, uf_ip = $6, criado_em = now()
               where id = $1`,
              [linhaHist, alvo, uf, payload, lugar.cidade, lugar.uf],
            );
            await cliente.query(
              `delete from alteracoes
               where ip = $1 and coalesce(captacao_id, '') = coalesce($2::text, '') and id <> $3`,
              [ip, captacaoId, linhaHist],
            );
          } else {
            await cliente.query(
              `insert into alteracoes (cedula_id, uf, escolhas, ip, cidade, uf_ip, captacao_id)
               values ($1, $2, $3::jsonb, $4, $5, $6, $7)`,
              [alvo, uf, payload, ip, lugar.cidade, lugar.uf, captacaoId],
            );
          }
          await cliente.query(
            `delete from cedulas
             where ip = $1 and coalesce(captacao_id, '') = coalesce($2::text, '') and id <> $3`,
            [ip, captacaoId, alvo],
          );
        } else {
          const ocupado = await cliente.query(`select ip from cedulas where id = $1`, [id]);
          const idNovo = ocupado.rows[0]?.ip && ocupado.rows[0].ip !== ip ? `${id}-${codigo()}` : id;
          await cliente.query(
            `insert into cedulas (id, uf, escolhas, ip, cidade, uf_ip, captacao_id)
             values ($1, $2, $3::jsonb, $4, $5, $6, $7)
             on conflict (id) do update set
               uf = excluded.uf,
               escolhas = excluded.escolhas,
               cidade = excluded.cidade,
               uf_ip = excluded.uf_ip,
               atualizado_em = now()`,
            [idNovo, uf, payload, ip, lugar.cidade, lugar.uf, captacaoId],
          );
          await cliente.query(
            `insert into alteracoes (cedula_id, uf, escolhas, ip, cidade, uf_ip, captacao_id)
             values ($1, $2, $3::jsonb, $4, $5, $6, $7)`,
            [idNovo, uf, payload, ip, lugar.cidade, lugar.uf, captacaoId],
          );
        }
        await cliente.query("commit");
      } catch (erro) {
        await cliente.query("rollback");
        throw erro;
      } finally {
        cliente.release();
      }
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/zerar") {
      if (!process.env.ADMIN_TOKEN) return json(res, 503, { ok: false });
      if (!autorizado(req)) return json(res, 401, { ok: false });
      if (!pool) return json(res, 503, { ok: false });
      await pool.query(`truncate table alteracoes, cedulas, captacoes restart identity`);
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/captacoes") {
      if (!process.env.ADMIN_TOKEN) return json(res, 503, { ok: false });
      if (!autorizado(req)) return json(res, 401, { ok: false });
      if (!pool) return json(res, 503, { ok: false });
      const corpo = await lerCorpo(req);
      const nome = texto(corpo.nome, 80);
      if (!nome) return json(res, 400, { ok: false });
      const id = codigo();
      const senha = codigo();
      await pool.query(`insert into captacoes (id, nome, senha) values ($1, $2, $3)`, [id, nome, senha]);
      return json(res, 200, { id, nome, senha });
    }

    if (req.method === "GET" && url.pathname === "/api/captacoes") {
      if (!process.env.ADMIN_TOKEN) return json(res, 503, { ok: false });
      if (!autorizado(req)) return json(res, 401, { ok: false });
      if (!pool) return json(res, 503, { ok: false });
      const lista = await pool.query(
        `select c.id, c.nome, c.senha, c.criado_em, count(d.id)::int as n
         from captacoes c
         left join cedulas d on d.captacao_id = c.id
         group by c.id
         order by c.criado_em desc`,
      );
      return json(res, 200, lista.rows);
    }

    if (req.method === "GET" && url.pathname === "/api/painel") {
      if (!process.env.ADMIN_TOKEN) return json(res, 503, { ok: false });
      if (!pool) return json(res, 503, { ok: false });
      const pedido = texto(url.searchParams.get("captacao") || "", 40);
      if (autorizado(req)) return json(res, 200, await painel(url, pedido));
      const cap = await captacaoAutorizada(pedido, tokenDe(req));
      if (!cap) return json(res, 401, { ok: false });
      return json(res, 200, await painel(url, cap.id));
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
