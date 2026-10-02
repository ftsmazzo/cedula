import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  CORES,
  MODELOS,
  type ModeloId,
  gravarVideo,
  imagemParada,
  montarCena,
  desenhar,
  desenharFolha,
  duracaoDe,
  type Cena,
} from "./estudio";
import {
  CARGOS,
  type Cand,
  type CargoId,
  type Escolha,
  dobrar,
  indice,
  lerHash,
  montarLink,
  nomeUf,
  partidosDe,
  situacaoVisivel,
  textoFolha,
  tituloCargo,
  tituloComGenero,
  UFS,
  urlBandeira,
  urlFoto,
  urlPartido,
  type UfArquivo,
} from "./model";

const CHAVE = "cedula:v1";

type Listas = Record<"depfed" | "depest" | "sen" | "gov" | "pres", Cand[]>;
const VAZIO: Listas = { depfed: [], depest: [], sen: [], gov: [], pres: [] };

export function App() {
  const hashInicial = lerHash(location.hash);
  const [uf, setUf] = useState(hashInicial?.uf ?? "SP");
  const [escolhas, setEscolhas] = useState<Partial<Record<CargoId, Escolha>>>({});
  const [rascunho, setRascunho] = useState<Partial<Record<CargoId, string>>>({});
  const [pendentes, setPendentes] = useState<Partial<Record<CargoId, string>> | null>(
    hashInicial?.brutos ?? null,
  );
  const [pronto, setPronto] = useState(false);
  const [listas, setListas] = useState<Listas>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState<CargoId | null>(null);
  const [estadosAberto, setEstadosAberto] = useState(false);
  const [aviso, setAviso] = useState("");
  const [passar, setPassar] = useState(false);

  useEffect(() => {
    if (lerHash(location.hash)) {
      setPronto(true);
      return;
    }
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (bruto) {
        const salvo = JSON.parse(bruto) as { uf?: string; escolhas?: Partial<Record<CargoId, Escolha>> };
        if (salvo.uf && UFS.some((u) => u.sigla === salvo.uf)) setUf(salvo.uf);
        if (salvo.escolhas) setEscolhas(salvo.escolhas);
      }
    } catch {
      /* aparelho sem storage */
    }
    setPronto(true);
  }, []);

  useEffect(() => {
    if (!pronto || pendentes) return;
    localStorage.setItem(CHAVE, JSON.stringify({ uf, escolhas }));
  }, [pronto, pendentes, uf, escolhas]);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro("");
    Promise.all([
      fetch(`/dados/${uf}.json`).then((r) => {
        if (!r.ok) throw new Error("uf");
        return r.json() as Promise<UfArquivo>;
      }),
      fetch("/dados/BR.json").then((r) => {
        if (!r.ok) throw new Error("br");
        return r.json() as Promise<{ cargos: { pres: Cand[] } }>;
      }),
    ])
      .then(([estadual, nacional]) => {
        if (!vivo) return;
        setListas({
          depfed: estadual.cargos.depfed,
          depest: estadual.cargos.depest,
          sen: estadual.cargos.sen,
          gov: estadual.cargos.gov,
          pres: nacional.cargos.pres,
        });
      })
      .catch(() => {
        if (vivo) setErro("Não foi possível carregar os candidatos deste estado.");
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [uf]);

  const mapas = useMemo(
    () => ({
      depfed: indice(listas.depfed),
      depest: indice(listas.depest),
      sen: indice(listas.sen),
      gov: indice(listas.gov),
      pres: indice(listas.pres),
    }),
    [listas],
  );

  useEffect(() => {
    if (carregando) return;
    setEscolhas((atual) => {
      let mudou = false;
      const proximo = { ...atual };
      for (const cargo of CARGOS) {
        const escolha = proximo[cargo.id];
        if (escolha?.tipo !== "cand") continue;
        const fresco = mapas[cargo.lista].get(escolha.cand.n);
        if (fresco) {
          proximo[cargo.id] = { tipo: "cand", cand: fresco };
          mudou = true;
        }
      }
      return mudou ? proximo : atual;
    });
  }, [carregando, mapas]);

  useEffect(() => {
    if (!pendentes || carregando) return;
    const novas: Partial<Record<CargoId, Escolha>> = {};
    for (const cargo of CARGOS) {
      const valor = pendentes[cargo.id];
      if (!valor) continue;
      if (valor === "branco") novas[cargo.id] = { tipo: "branco" };
      else if (valor === "nulo") novas[cargo.id] = { tipo: "nulo" };
      else if (valor.startsWith("legenda:")) {
        const [, pn, partido] = valor.split(":");
        if (pn && partido) novas[cargo.id] = { tipo: "legenda", pn, partido };
      } else {
        const cand = mapas[cargo.lista].get(valor);
        if (cand) novas[cargo.id] = { tipo: "cand", cand };
      }
    }
    setEscolhas(novas);
    setPendentes(null);
  }, [pendentes, carregando, mapas]);

  function trocarUf(proxima: string) {
    setUf(proxima);
    setEscolhas((atual) => (atual.pres ? { pres: atual.pres } : {}));
    setRascunho({});
    setAviso("");
    setEstadosAberto(false);
  }

  function limpar(id: CargoId) {
    setEscolhas((atual) => {
      const proximo = { ...atual };
      delete proximo[id];
      return proximo;
    });
    setRascunho((atual) => ({ ...atual, [id]: "" }));
    setAviso("");
  }

  function aplicar(id: CargoId, escolha: Escolha) {
    const outra = id === "sen1" ? "sen2" : id === "sen2" ? "sen1" : null;
    if (outra && escolha.tipo === "cand") {
      const ocupada = escolhas[outra];
      if (ocupada?.tipo === "cand" && ocupada.cand.n === escolha.cand.n) {
        setAviso("Esse senador já está na outra vaga.");
        return false;
      }
    }
    setAviso("");
    setEscolhas((atual) => ({ ...atual, [id]: escolha }));
    setRascunho((atual) => ({ ...atual, [id]: escolha.tipo === "cand" ? escolha.cand.n : "" }));
    return true;
  }

  function digitar(id: CargoId, valor: string) {
    const cargo = CARGOS.find((c) => c.id === id)!;
    const digitos = valor.replace(/\D/g, "").slice(0, cargo.digitos);
    setRascunho((atual) => ({ ...atual, [id]: digitos }));
    setAviso("");
    if (digitos.length < cargo.digitos) {
      setEscolhas((atual) => {
        const proximo = { ...atual };
        delete proximo[id];
        return proximo;
      });
      return;
    }
    const achou = mapas[cargo.lista].get(digitos);
    if (!achou) {
      setEscolhas((atual) => {
        const proximo = { ...atual };
        delete proximo[id];
        return proximo;
      });
      return;
    }
    const ok = aplicar(id, { tipo: "cand", cand: achou });
    if (!ok) setRascunho((atual) => ({ ...atual, [id]: "" }));
  }

  const preenchidos = CARGOS.filter((c) => escolhas[c.id]).length;

  return (
    <div className="pagina">
      <main className="colinha" id="folha">
        <header className="cabeca">
          <p className="marca">Cédula</p>
          <button type="button" className="uf" onClick={() => setEstadosAberto(true)}>
            <Bandeira uf={uf} />
            <span>
              <strong>{nomeUf(uf)}</strong>
              <small>{uf}</small>
            </span>
          </button>
          <p className="pontos" aria-label={`${preenchidos} de 6 cargos`}>
            {CARGOS.map((cargo) => (
              <i key={cargo.id} className={escolhas[cargo.id] ? "on" : ""} />
            ))}
          </p>
        </header>

        <p className="uma-linha">A foto e o nome, para conferir na urna.</p>
        {carregando && <p className="aviso">Carregando candidaturas…</p>}
        {erro && <p className="aviso erro">{erro}</p>}
        {aviso && <p className="aviso erro">{aviso}</p>}

        <ol className="cargos">
          {CARGOS.map((cargo) => {
            const escolha = escolhas[cargo.id];
            const digitos = rascunho[cargo.id] ?? (escolha?.tipo === "cand" ? escolha.cand.n : "");
            const completo = digitos.length === cargo.digitos;
            const cand = escolha?.tipo === "cand" ? escolha.cand : null;
            return (
              <li key={cargo.id} className={escolha ? "cargo sim" : "cargo"}>
                {cargo.nacional && !CARGOS[CARGOS.indexOf(cargo) - 1]?.nacional && (
                  <p className="faixa">Nacional</p>
                )}
                <div className="fileira">
                  {cand ? (
                    <Retrato sq={cand.sq} nome={cand.nome} />
                  ) : (
                    <span className="retrato oco" aria-hidden="true" />
                  )}
                  <div className="quem">
                    <h2>{tituloCargo(cargo.id, uf)}</h2>
                    {cand ? (
                      <>
                        <p className="nome">{cand.nome}</p>
                        <p className="partido">
                          <Logo sigla={cand.partido} />
                          {cand.partido}
                          {situacaoVisivel(cand.s) && <em>{situacaoVisivel(cand.s)}</em>}
                        </p>
                      </>
                    ) : escolha?.tipo === "branco" ? (
                      <p className="nome">Branco</p>
                    ) : escolha?.tipo === "nulo" ? (
                      <p className="nome">Nulo</p>
                    ) : escolha?.tipo === "legenda" ? (
                      <p className="nome">Legenda {escolha.partido}</p>
                    ) : (
                      <p className="dica">
                        {cargo.digitos} dígitos{cargo.nacional ? "" : ` · ${uf}`}
                      </p>
                    )}
                  </div>
                  <label className="caixa-numero">
                    <span className="sr">
                      Número, {tituloCargo(cargo.id, uf)}, {cargo.digitos} dígitos
                    </span>
                    {escolha && escolha.tipo !== "cand" ? (
                      <span className="especial">
                        {escolha.tipo === "branco" ? "BRANCO" : escolha.tipo === "nulo" ? "NULO" : escolha.pn}
                      </span>
                    ) : (
                      <span className="caixas" aria-hidden="true">
                        {Array.from({ length: cargo.digitos }, (_, i) => (
                          <span key={i} className={digitos[i] ? "digito cheio" : "digito"}>
                            {digitos[i] ?? ""}
                          </span>
                        ))}
                      </span>
                    )}
                    <input
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={cargo.digitos}
                      value={escolha && escolha.tipo !== "cand" ? "" : digitos}
                      disabled={carregando}
                      aria-invalid={completo && !escolha}
                      onChange={(e) => digitar(cargo.id, e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="lupa"
                    aria-label={`Buscar candidato, ${tituloCargo(cargo.id, uf)}`}
                    onClick={() => setBusca(cargo.id)}
                  >
                    <LupaIcone />
                  </button>
                </div>
                {completo && !escolha && (
                  <p className="sumido">Número não encontrado. Na urna, isso anula o voto.</p>
                )}
                {escolha && (
                  <button type="button" className="tirar" onClick={() => limpar(cargo.id)}>
                    Tirar
                  </button>
                )}
              </li>
            );
          })}
        </ol>

        <div className="acoes">
          <button type="button" className="passar" disabled={preenchidos === 0} onClick={() => setPassar(true)}>
            Passar cola
          </button>
          <button type="button" className="imprimir" onClick={() => window.print()} aria-label="Imprimir colinha">
            <PrintIcone />
          </button>
        </div>
      </main>

      {estadosAberto && (
        <EstadoDialog uf={uf} onEscolher={trocarUf} onFechar={() => setEstadosAberto(false)} />
      )}
      {busca && (
        <BuscaDialog
          cargoId={busca}
          uf={uf}
          lista={listas[CARGOS.find((c) => c.id === busca)!.lista]}
          onFechar={() => setBusca(null)}
          onEscolher={(escolha) => {
            const ok = aplicar(busca, escolha);
            if (ok) setBusca(null);
            return ok;
          }}
        />
      )}
      {passar && (
        <PassarCola
          uf={uf}
          escolhas={escolhas}
          onFechar={() => setPassar(false)}
          onImprimir={() => {
            setPassar(false);
            window.setTimeout(() => window.print(), 60);
          }}
        />
      )}
    </div>
  );
}

function Retrato({ sq, nome, classe = "" }: { sq?: string; nome: string; classe?: string }) {
  const [falhou, setFalhou] = useState(false);
  const src = urlFoto(sq);
  if (!src || falhou) return <span className={`retrato letra ${classe}`}>{nome.slice(0, 1)}</span>;
  return <img className={`retrato ${classe}`} src={src} alt="" onError={() => setFalhou(true)} />;
}

function Logo({ sigla }: { sigla: string }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) return null;
  return <img src={urlPartido(sigla)} alt="" onError={() => setFalhou(true)} />;
}

function Bandeira({ uf }: { uf: string }) {
  const [falhou, setFalhou] = useState(false);
  const src = urlBandeira(uf);
  if (!src || falhou) return <span className="bandeira oca">{uf}</span>;
  return <img className="bandeira" src={src} alt="" onError={() => setFalhou(true)} />;
}

function EstadoDialog({
  uf,
  onEscolher,
  onFechar,
}: {
  uf: string;
  onEscolher: (sigla: string) => void;
  onFechar: () => void;
}) {
  const titulo = useId();
  useFechar(onFechar);
  return (
    <div className="cortina" onMouseDown={onFechar}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titulo}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header>
          <h2 id={titulo}>Em que estado você vota?</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </header>
        <ul className="estados">
          {UFS.map((estado) => (
            <li key={estado.sigla}>
              <button
                type="button"
                className={estado.sigla === uf ? "ativo" : ""}
                onClick={() => onEscolher(estado.sigla)}
              >
                <Bandeira uf={estado.sigla} />
                {estado.nome}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function BuscaDialog({
  cargoId,
  uf,
  lista,
  onFechar,
  onEscolher,
}: {
  cargoId: CargoId;
  uf: string;
  lista: Cand[];
  onFechar: () => void;
  onEscolher: (escolha: Escolha) => boolean;
}) {
  const titulo = useId();
  const campo = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [partido, setPartido] = useState("");
  const [limite, setLimite] = useState(40);
  const [recado, setRecado] = useState("");
  const partidos = useMemo(() => partidosDe(lista), [lista]);
  useFechar(onFechar);
  useEffect(() => {
    campo.current?.focus();
  }, []);

  const consulta = dobrar(texto.trim());
  const filtrados = useMemo(() => {
    return lista.filter((cand) => {
      if (partido && cand.partido !== partido) return false;
      if (!consulta) return true;
      return cand.n.startsWith(consulta) || dobrar(cand.nome).includes(consulta);
    });
  }, [lista, partido, consulta]);

  const legendas = useMemo(() => {
    const vistos = new Map<string, { partido: string; pn: string }>();
    for (const cand of lista) {
      if (!vistos.has(cand.partido)) vistos.set(cand.partido, { partido: cand.partido, pn: cand.pn });
    }
    return [...vistos.values()].sort((a, b) => a.partido.localeCompare(b.partido, "pt-BR"));
  }, [lista]);

  return (
    <div className="cortina" onMouseDown={onFechar}>
      <div
        className="dialog busca"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titulo}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <p>{tituloCargo(cargoId, uf)}</p>
            <h2 id={titulo}>Nome ou número</h2>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </header>
        <div className="filtros">
          <input
            ref={campo}
            value={texto}
            placeholder="Nome de urna ou número"
            onChange={(e) => {
              setTexto(e.target.value);
              setLimite(40);
            }}
          />
          <select
            aria-label="Filtrar por partido"
            value={partido}
            onChange={(e) => {
              setPartido(e.target.value);
              setLimite(40);
            }}
          >
            <option value="">Todos os partidos</option>
            {partidos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        {recado && <p className="aviso erro">{recado}</p>}
        <ul className="resultados">
          {filtrados.slice(0, limite).map((cand) => (
            <li key={`${cand.sq ?? cand.n}-${cand.nome}`}>
              <button
                type="button"
                onClick={() => {
                  if (!onEscolher({ tipo: "cand", cand })) setRecado("Esse senador já está na outra vaga.");
                }}
              >
                <Retrato sq={cand.sq} nome={cand.nome} />
                <span>
                  <strong>{cand.nome}</strong>
                  <small>
                    {tituloComGenero(cargoId, uf, cand.g)} · {cand.partido}
                  </small>
                </span>
                <b>{cand.n}</b>
              </button>
            </li>
          ))}
        </ul>
        {limite < filtrados.length && (
          <button type="button" className="mais" onClick={() => setLimite((n) => n + 60)}>
            Mostrar mais
          </button>
        )}
        <details>
          <summary>Branco, nulo ou legenda</summary>
          <div className="extra">
            <button type="button" onClick={() => onEscolher({ tipo: "branco" })}>
              Branco
            </button>
            <button type="button" onClick={() => onEscolher({ tipo: "nulo" })}>
              Nulo
            </button>
          </div>
          <ul className="legendas">
            {legendas.map((item) => (
              <li key={item.partido}>
                <button
                  type="button"
                  onClick={() => onEscolher({ tipo: "legenda", partido: item.partido, pn: item.pn })}
                >
                  <Logo sigla={item.partido} />
                  {item.pn} {item.partido}
                </button>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}

function PassarCola({
  uf,
  escolhas,
  onFechar,
  onImprimir,
}: {
  uf: string;
  escolhas: Partial<Record<CargoId, Escolha>>;
  onFechar: () => void;
  onImprimir: () => void;
}) {
  const titulo = useId();
  const [modo, setModo] = useState<"imagem" | "video">("imagem");
  const [cor, setCor] = useState("claro");
  const [modelo, setModelo] = useState<ModeloId>("folha");
  const [vazios, setVazios] = useState(true);
  const [cena, setCena] = useState<Cena | null>(null);
  const [recorte, setRecorte] = useState("");
  const [gerando, setGerando] = useState("");
  const tela = useRef<HTMLCanvasElement>(null);
  const minis = useRef<Record<string, HTMLCanvasElement | null>>({});
  const previaModelo = useRef<Record<string, HTMLCanvasElement | null>>({});
  useFechar(onFechar);
  const link = montarLink(uf, escolhas);
  const texto = `${textoFolha(uf, escolhas)}\n${link}`;
  const story = modo === "video";

  useEffect(() => {
    let vivo = true;
    montarCena(uf, escolhas).then((pronta) => {
      if (vivo) setCena(pronta);
    });
    return () => {
      vivo = false;
    };
  }, [uf, escolhas]);

  useEffect(() => {
    if (!cena) return;
    for (const item of CORES) {
      const mini = minis.current[item.id];
      const ctx = mini?.getContext("2d");
      if (ctx) desenharFolha(ctx, cena, item.id, 1, vazios);
    }
    for (const item of MODELOS) {
      const mini = previaModelo.current[item.id];
      const ctx = mini?.getContext("2d");
      if (ctx) desenhar(ctx, cena, item.id, cor, 0.92, vazios);
    }
  }, [cena, vazios, cor, modo]);

  useEffect(() => {
    if (!cena || !tela.current) return;
    const canvas = tela.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (modo === "imagem") {
      desenharFolha(ctx, cena, cor, 1, vazios);
      return;
    }
    let quadro = 0;
    const inicio = performance.now();
    const duracao = duracaoDe(cena, modelo);
    const loop = (agora: number) => {
      desenhar(ctx, cena, modelo, cor, ((agora - inicio) % duracao) / duracao, vazios);
      quadro = requestAnimationFrame(loop);
    };
    quadro = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(quadro);
  }, [cena, modo, cor, modelo, vazios]);

  async function imagem() {
    if (!cena) return;
    setGerando("imagem");
    setRecorte("");
    try {
      baixar(await imagemParada(cena, cor, vazios), `cedula-${cor}.png`);
    } catch {
      setRecorte("Não foi possível gerar a imagem.");
    } finally {
      setGerando("");
    }
  }

  async function video() {
    if (!cena) return;
    setGerando("vídeo");
    setRecorte("");
    try {
      const blob = await gravarVideo(cena, modelo, cor, vazios, (t) => setGerando(`vídeo ${Math.round(t * 100)}%`));
      baixar(blob, `cedula-${modelo}.webm`);
      setRecorte("Vídeo pronto.");
    } catch {
      setRecorte("Este navegador não gravou o vídeo. A imagem continua disponível.");
    } finally {
      setGerando("");
    }
  }

  async function copiarLink() {
    await navigator.clipboard.writeText(link);
    setRecorte("Link copiado.");
  }

  async function compartilharLink() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Sua colinha", text: textoFolha(uf, escolhas), url: link });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setRecorte("Não foi possível compartilhar o link.");
      }
    } else {
      await copiarLink();
    }
  }

  return (
    <div className="cortina" onMouseDown={onFechar}>
      <div
        className="dialog estudio"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titulo}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <p>Estúdio</p>
            <h2 id={titulo}>Passar cola</h2>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </header>
        <div className="estudio-corpo">
          <aside>
            <div className="modos" role="tablist">
              <button type="button" className={modo === "imagem" ? "on" : ""} onClick={() => setModo("imagem")}>
                Imagem
              </button>
              <button type="button" className={modo === "video" ? "on" : ""} onClick={() => setModo("video")}>
                Vídeos
              </button>
            </div>
            {modo === "imagem" ? (
              <>
                <div className="cores" role="listbox" aria-label="Cor">
                  {CORES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === cor ? "on" : ""}
                      aria-label={item.nome}
                      onClick={() => setCor(item.id)}
                    >
                      <canvas
                        width={216}
                        height={270}
                        ref={(el) => {
                          minis.current[item.id] = el;
                        }}
                      />
                    </button>
                  ))}
                </div>
                <label className="vazios">
                  <input type="checkbox" checked={vazios} onChange={(e) => setVazios(e.target.checked)} />
                  Com vazios
                </label>
              </>
            ) : (
              <div className="modelos">
                {MODELOS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === modelo ? "on" : ""}
                    onClick={() => setModelo(item.id)}
                  >
                    <canvas
                      width={180}
                      height={320}
                      ref={(el) => {
                        previaModelo.current[item.id] = el;
                      }}
                    />
                    <small>{item.grupo}</small>
                    {item.nome}
                  </button>
                ))}
              </div>
            )}
          </aside>
          <div className="palco">
            <canvas
              ref={tela}
              className={story ? "tela story" : "tela poster"}
              width={story ? 1080 : 1080}
              height={story ? 1920 : 1350}
            />
            <p className="medida">
              {modo === "imagem"
                ? `POST · 4:5 · ${CORES.find((item) => item.id === cor)?.nome ?? ""}`
                : MODELOS.find((item) => item.id === modelo)?.nome}
            </p>
            <p className="px">{modo === "imagem" ? "1080 × 1350" : "1080 × 1920"}</p>
            <button type="button" className="principal" disabled={!cena || !!gerando} onClick={modo === "imagem" ? imagem : video}>
              {gerando.startsWith("vídeo") ? gerando : gerando === "imagem" ? "Gerando…" : modo === "imagem" ? "Baixar imagem" : "Gerar vídeo"}
            </button>
            <div className="grade">
              <button type="button" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener")}>
                WhatsApp
              </button>
              <button type="button" onClick={copiarLink}>
                Copiar link
              </button>
              <button type="button" onClick={compartilharLink}>
                Compartilhar link
              </button>
              <button type="button" onClick={onImprimir}>
                Imprimir
              </button>
            </div>
          </div>
        </div>
        {recorte && <p className="aviso">{recorte}</p>}
        <p className="miudo">No celular, a cabine não deixa entrar com o aparelho. Imprima e leve no papel.</p>
      </div>
    </div>
  );
}

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

function useFechar(onFechar: () => void) {
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);
}

function LupaIcone() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16.5 20 20.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PrintIcone() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 8V3h10v5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 17H5a2 2 0 0 1-2-2v-5h18v5a2 2 0 0 1-2 2h-2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 14h10v7H7z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
