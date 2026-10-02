import { useState, type FormEvent } from "react";
import { CARGOS, UFS, tituloCargo } from "./model";
import type { CargoId } from "./model";
import type { EscolhaRegistrada } from "./registro";

type Captacao = {
  id: string;
  nome: string;
  senha: string;
  criado_em: string;
  n: number;
};

function idDaRota() {
  const resto = location.pathname.replace(/^\/painel\/?/, "");
  return /^[A-Za-z0-9_-]{8,40}$/.test(resto) ? resto : "";
}

function linkCedula(id: string) {
  return `${location.origin}/?c=${id}`;
}

function linkPainel(id: string) {
  return `${location.origin}/painel/${id}`;
}

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
  alteracoes: {
    id: number;
    cedula_id: string;
    uf: string;
    cidade: string;
    uf_ip: string;
    ip: string;
    escolhas: Partial<Record<CargoId, EscolhaRegistrada>>;
    criado_em: string;
  }[];
  captacao: { id: string; nome: string } | null;
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
  const captacaoId = idDaRota();
  const central = !captacaoId;
  const chavePainel = central ? "cedula:painel" : `cedula:painel:${captacaoId}`;
  const [senha, setSenha] = useState(() => sessionStorage.getItem(chavePainel) ?? "");
  const [token, setToken] = useState(() => sessionStorage.getItem(chavePainel) ?? "");
  const [uf, setUf] = useState("");
  const [cidade, setCidade] = useState("");
  const [cargo, setCargo] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [filtroCaptacao, setFiltroCaptacao] = useState("");
  const [dados, setDados] = useState<Resposta | null>(null);
  const [captacoes, setCaptacoes] = useState<Captacao[]>([]);
  const [nomeNova, setNomeNova] = useState("");
  const [copiado, setCopiado] = useState("");
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
    const escopo = captacaoId || filtroCaptacao;
    if (escopo) params.set("captacao", escopo);
    const resposta = await fetch(`/api/painel?${params}`, {
      headers: { authorization: `Bearer ${chave}` },
    });
    if (central) {
      const lista = await fetch("/api/captacoes", { headers: { authorization: `Bearer ${chave}` } });
      if (lista.ok) setCaptacoes(await lista.json());
    }
    setCarregando(false);
    if (resposta.status === 401) {
      sessionStorage.removeItem(chavePainel);
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

  async function gerar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    const resposta = await fetch("/api/captacoes", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ nome: nomeNova }),
    });
    if (!resposta.ok) {
      setErro("Não foi possível gerar a captação.");
      return;
    }
    setNomeNova("");
    await carregar(token);
  }

  async function copiar(texto: string, qual: string) {
    await navigator.clipboard.writeText(texto);
    setCopiado(qual);
  }

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    sessionStorage.setItem(chavePainel, senha);
    setToken(senha);
    await carregar(senha);
  }

  if (!token) {
    return (
      <div className="pagina">
        <main className="colinha painel-login">
          <p className="marca">Cédula</p>
          <h1>{central ? "Painel central" : "Painel da captação"}</h1>
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
            <h1>{central ? "Painel central" : dados?.captacao?.nome || "Painel da captação"}</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem(chavePainel);
              setToken("");
              setDados(null);
            }}
          >
            Sair
          </button>
        </header>
        {central && (
          <section className="captacoes">
            <h2>Captações</h2>
            <form className="nova-captacao" onSubmit={gerar}>
              <label>
                Nome
                <input
                  value={nomeNova}
                  onChange={(e) => setNomeNova(e.target.value)}
                  placeholder="Interior de São Paulo"
                  required
                />
              </label>
              <button type="submit">Gerar captação</button>
            </form>
            <ul>
              {captacoes.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.nome}</strong>
                    <span>
                      {item.n} cédulas · senha {item.senha}
                    </span>
                  </div>
                  <div className="links">
                    <button type="button" onClick={() => copiar(linkCedula(item.id), `cedula-${item.id}`)}>
                      {copiado === `cedula-${item.id}` ? "Link copiado" : "Copiar cédula"}
                    </button>
                    <button type="button" onClick={() => copiar(linkPainel(item.id), `painel-${item.id}`)}>
                      {copiado === `painel-${item.id}` ? "Link copiado" : "Copiar painel"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        <form
          className="filtros-painel"
          onSubmit={(evento) => {
            evento.preventDefault();
            carregar(token);
          }}
        >
          {central && (
            <label>
              Captação
              <select value={filtroCaptacao} onChange={(e) => setFiltroCaptacao(e.target.value)}>
                <option value="">Todas</option>
                {captacoes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
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
            <h2 className="secao">Alterações</h2>
            <p className="miudo">Cada mudança de voto fica guardada, também quando o IP muda ou quando o acesso gera uma cédula nova.</p>
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
                  {dados.alteracoes.map((linha) => (
                    <tr key={linha.id}>
                      <td>{hora(linha.criado_em)}</td>
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
