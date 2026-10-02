import { useState, type FormEvent } from "react";
import { CARGOS, UFS, tituloCargo } from "./model";
import type { CargoId } from "./model";
import type { EscolhaRegistrada } from "./registro";

const CHAVE = "cedula:painel";

type Resposta = {
  total: number;
  porUf: { uf: string; n: number }[];
  porCidade: { cidade: string; uf_ip: string; n: number }[];
  porCargo: { cargo: string; n: string; nome: string; partido: string; tipo: string; votos: number }[];
  linhas: {
    id: string;
    uf: string;
    cidade: string;
    uf_ip: string;
    ip: string;
    escolhas: Partial<Record<CargoId, EscolhaRegistrada>>;
    atualizado_em: string;
  }[];
};

function hora(valor: string) {
  return new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function linhaEscolha(item?: EscolhaRegistrada) {
  if (!item) return "—";
  if (item.tipo === "branco") return "Branco";
  if (item.tipo === "nulo") return "Nulo";
  if (item.tipo === "legenda") return `Legenda ${item.partido}`;
  return `${item.n} ${item.nome}`;
}

export function Painel() {
  const [senha, setSenha] = useState(() => sessionStorage.getItem(CHAVE) ?? "");
  const [token, setToken] = useState(() => sessionStorage.getItem(CHAVE) ?? "");
  const [uf, setUf] = useState("");
  const [cidade, setCidade] = useState("");
  const [cargo, setCargo] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function carregar(chave: string) {
    setCarregando(true);
    setErro("");
    const params = new URLSearchParams();
    if (uf) params.set("uf", uf);
    if (cidade) params.set("cidade", cidade);
    if (cargo) params.set("cargo", cargo);
    if (de) params.set("de", de);
    if (ate) params.set("ate", ate);
    const resposta = await fetch(`/api/painel?${params}`, {
      headers: { authorization: `Bearer ${chave}` },
    });
    setCarregando(false);
    if (resposta.status === 401) {
      sessionStorage.removeItem(CHAVE);
      setToken("");
      setErro("Senha não confere.");
      return;
    }
    if (!resposta.ok) {
      setErro("O painel não respondeu.");
      return;
    }
    setDados(await resposta.json());
  }

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    sessionStorage.setItem(CHAVE, senha);
    setToken(senha);
    await carregar(senha);
  }

  if (!token) {
    return (
      <div className="pagina">
        <main className="colinha painel-login">
          <p className="marca">Cédula</p>
          <h1>Painel</h1>
          <form onSubmit={entrar}>
            <label>
              Senha
              <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus />
            </label>
            <button type="submit">Entrar</button>
          </form>
          {erro && <p className="aviso erro">{erro}</p>}
        </main>
      </div>
    );
  }

  return (
    <div className="pagina painel">
      <main>
        <header className="painel-topo">
          <div>
            <p className="marca">Cédula</p>
            <h1>Painel</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem(CHAVE);
              setToken("");
              setDados(null);
            }}
          >
            Sair
          </button>
        </header>
        <form
          className="filtros-painel"
          onSubmit={(evento) => {
            evento.preventDefault();
            carregar(token);
          }}
        >
          <label>
            UF do voto
            <select value={uf} onChange={(e) => setUf(e.target.value)}>
              <option value="">Todas</option>
              {UFS.map((estado) => (
                <option key={estado.sigla} value={estado.sigla}>
                  {estado.sigla}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cidade do acesso
            <input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="São Paulo" />
          </label>
          <label>
            Cargo
            <select value={cargo} onChange={(e) => setCargo(e.target.value)}>
              <option value="">Todos</option>
              {CARGOS.map((item) => (
                <option key={item.id} value={item.id}>
                  {tituloCargo(item.id, "SP")}
                </option>
              ))}
            </select>
          </label>
          <label>
            De
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </label>
          <label>
            Até
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </label>
          <button type="submit">{carregando ? "Buscando…" : "Filtrar"}</button>
        </form>
        {erro && <p className="aviso erro">{erro}</p>}
        {dados && (
          <>
            <p className="total">{dados.total} cédulas</p>
            <section className="blocos">
              <div>
                <h2>Por UF</h2>
                <ul>
                  {dados.porUf.map((item) => (
                    <li key={item.uf}>
                      <span>{item.uf}</span>
                      <b>{item.n}</b>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h2>Por cidade do acesso</h2>
                <ul>
                  {dados.porCidade.map((item) => (
                    <li key={`${item.cidade}-${item.uf_ip}`}>
                      <span>
                        {item.cidade}
                        {item.uf_ip ? ` · ${item.uf_ip}` : ""}
                      </span>
                      <b>{item.n}</b>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h2>Escolhas</h2>
                <ul>
                  {dados.porCargo.map((item) => (
                    <li key={`${item.cargo}-${item.tipo}-${item.n}-${item.nome}`}>
                      <span>
                        {tituloCargo(item.cargo as CargoId, "SP")} ·{" "}
                        {linhaEscolha({
                          tipo: item.tipo as EscolhaRegistrada["tipo"],
                          n: item.n,
                          nome: item.nome,
                          partido: item.partido,
                        })}
                      </span>
                      <b>{item.votos}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
            <div className="tabela-rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Voto</th>
                    <th>Acesso</th>
                    <th>IP</th>
                    {CARGOS.map((item) => (
                      <th key={item.id}>{tituloCargo(item.id, "SP")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dados.linhas.map((linha) => (
                    <tr key={linha.id}>
                      <td>{hora(linha.atualizado_em)}</td>
                      <td>{linha.uf}</td>
                      <td>
                        {linha.cidade || "—"}
                        {linha.uf_ip ? ` · ${linha.uf_ip}` : ""}
                      </td>
                      <td>{linha.ip}</td>
                      {CARGOS.map((item) => (
                        <td key={item.id}>{linhaEscolha(linha.escolhas[item.id])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
