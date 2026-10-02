import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Painel } from "./Painel";
import "./styles.css";

const tela = location.pathname === "/painel" || location.pathname.startsWith("/painel/") ? <Painel /> : <App />;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {tela}
  </StrictMode>,
);
