import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const PERMITIDA =
  /^https:\/\/assets\.colinha\.ai\/(?:candidatos\/fotos\/2026\/\d+\.jpeg|partidos\/[a-z0-9]+\/logo\/sm\.(?:jpg|jpeg|png)|estados\/[a-z]{2}\/bandeira\/sm\.jpg)$/;

function midia(): Plugin {
  const tratar = async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    const bruto = req.url ?? "";
    if (!bruto.startsWith("/midia?")) return next();
    const alvo = new URL(bruto, "http://folha.local").searchParams.get("u") ?? "";
    if (!PERMITIDA.test(alvo)) {
      res.statusCode = 400;
      res.end();
      return;
    }
    try {
      const resposta = await fetch(alvo);
      res.statusCode = resposta.status;
      const tipo = resposta.headers.get("content-type");
      if (tipo) res.setHeader("content-type", tipo);
      res.setHeader("cache-control", "public, max-age=86400");
      res.end(Buffer.from(await resposta.arrayBuffer()));
    } catch {
      res.statusCode = 502;
      res.end();
    }
  };

  return {
    name: "midia-candidatos",
    configureServer(server) {
      server.middlewares.use(tratar);
    },
    configurePreviewServer(server) {
      server.middlewares.use(tratar);
    },
  };
}

export default defineConfig({
  plugins: [react(), midia()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
});
