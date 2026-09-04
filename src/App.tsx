import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fmtBRL,
  fmtPct,
  mesesParaAnosMeses,
  parseInflacaoTabela,
} from "./lib/calculos";
import {
  DEFAULT_CONFIG,
  Goal,
  PlannerConfig,
  parseBrazilianNumber,
  projectPlan,
  sanitizeConfig,
} from "./lib/planner";

const STORAGE_KEY = "simulador_plano_v3";
const money = (value: number) => fmtBRL(value);
const ProjectionChart = lazy(() => import("./ProjectionChart"));
const duration = (months: number) =>
  months === 0
    ? "agora"
    : mesesParaAnosMeses(months).replace(/ e 0 meses$/, "");
const goals: { id: Goal; title: string; description: string; icon: string }[] =
  [
    {
      id: "grow",
      title: "Quanto posso juntar?",
      description:
        "Veja o que seus depósitos podem se tornar ao longo do tempo.",
      icon: "↗",
    },
    {
      id: "monthly",
      title: "Quanto preciso guardar por mês?",
      description:
        "Parta de uma meta e descubra um valor mensal para chegar lá.",
      icon: "◎",
    },
    {
      id: "time",
      title: "Quando consigo chegar à minha meta?",
      description: "Descubra o prazo a partir do que você consegue guardar.",
      icon: "◷",
    },
  ];
const policyNames = {
  constante: "Mesmo valor todo mês",
  mensal_pct: "Aumento mensal",
  anual_pct: "Aumento anual",
  anual_inflacao: "Aumento anual pela inflação",
  anual_real: "Inflação + aumento extra anual",
};

function readSaved(): { config: PlannerConfig; notice: string } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const config = sanitizeConfig(JSON.parse(saved));
      return {
        config: config.compare ? { ...config, rate: 0.06 } : config,
        notice:
          "Seu plano salvo neste dispositivo foi recuperado. Você pode revisar os valores.",
      };
    }
    const legacy = localStorage.getItem("simulador_meta_config_v2");
    if (legacy) {
      const old = JSON.parse(legacy);
      if (!old || typeof old !== "object")
        return {
          config: DEFAULT_CONFIG,
          notice: "O plano antigo não pôde ser recuperado.",
        };
      return {
        config: sanitizeConfig({
          goal: "time",
          initial: old.montanteInicial,
          monthly: old.aporteMensal,
          target: old.meta,
          years: old.anosLimite,
          rate: old.rentabAnual,
          compare: false,
          inflationAdjusted: old.usarTaxaReal,
          inflation: old.inflacaoAnual,
          beginning: old.contribuicaoNoInicio,
          policy:
            old.tipoAporte === "mensal_pct"
              ? { tipo: "mensal_pct", mensalPct: old.mensalPct }
              : old.tipoAporte === "anual_pct"
                ? { tipo: "anual_pct", anualPct: old.anualPct }
                : old.tipoAporte === "anual_real"
                  ? { tipo: "anual_real", realExtra: old.realExtra }
                  : { tipo: old.tipoAporte ?? "constante" },
          inflationTable: old.usaTabelaInflacao
            ? parseInflacaoTabela(old.inflacaoTabelaStr)
            : undefined,
        }),
        notice:
          "Recuperamos seus valores antigos. Revise as hipóteses: a visão em dinheiro de hoje agora considera também a inflação sobre cada depósito.",
      };
    }
  } catch {
    return {
      config: DEFAULT_CONFIG,
      notice:
        "Não foi possível ler o plano salvo. Você pode simular normalmente.",
    };
  }
  return { config: DEFAULT_CONFIG, notice: "" };
}

type FieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onError: (id: string, error: boolean) => void;
  unit?: string;
  hint?: string;
  min?: number;
  max?: number;
  integer?: boolean;
};
function Field({
  label,
  value,
  onChange,
  onError,
  unit = "R$",
  hint,
  min = 0,
  max = 1e12,
  integer = false,
}: FieldProps) {
  const id = useId();
  const format = (n: number) =>
    new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);
  const [draft, setDraft] = useState(format(value));
  const [error, setError] = useState("");
  const lastValue = useRef(value);
  useEffect(() => {
    if (lastValue.current !== value) {
      lastValue.current = value;
      setDraft(format(value));
      setError("");
      onError(id, false);
    }
  }, [value]);
  useEffect(() => () => onError(id, false), []);
  const change = (text: string) => {
    setDraft(text);
    const n = unit.startsWith("%")
      ? parseBrazilianNumber(text.trim().replace(/%$/, ""))
      : text.includes("%")
        ? null
        : parseBrazilianNumber(text);
    const message =
      n === null
        ? "Digite um número, como 1.000,50."
        : n < min || n > max
          ? `Use um valor entre ${format(min)} e ${format(max)}.`
          : integer && !Number.isInteger(n)
            ? "Use um número inteiro de anos."
            : "";
    setError(message);
    onError(id, !!message);
    if (!message && n !== null) {
      lastValue.current = n;
      onChange(n);
    }
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={`input-wrap ${error ? "invalid" : ""}`}>
        {unit === "R$" && <span aria-hidden="true">R$</span>}
        <input
          id={id}
          inputMode={integer ? "numeric" : "decimal"}
          type="text"
          value={draft}
          aria-invalid={!!error}
          aria-describedby={`${id}-help`}
          onChange={(e) => change(e.target.value)}
          onBlur={() => {
            if (!error) setDraft(format(value));
          }}
        />
        {unit !== "R$" && <span>{unit}</span>}
      </div>
      <small id={`${id}-help`} className={error ? "error" : ""}>
        {error || hint}
      </small>
    </div>
  );
}

export default function App() {
  const [loaded] = useState(readSaved);
  const [config, setConfig] = useState<PlannerConfig>(loaded.config);
  const [step, setStep] = useState(0);
  const [initialReset, setInitialReset] = useState(0);
  const [notice, setNotice] = useState(loaded.notice);
  const [submitted, setSubmitted] = useState<PlannerConfig | null>(null);
  const [experiment, setExperiment] = useState<
    "more" | "longer" | "lower" | null
  >(null);
  const [tableText, setTableText] = useState(
    config.inflationTable?.map((n) => `${n * 100}%`).join("; ") ?? "",
  );
  const [useTable, setUseTable] = useState(!!config.inflationTable?.length);
  const errors = useRef(new Set<string>());
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) {
      heading.current?.focus();
      previousStep.current = step;
    }
  }, [step]);
  const onError = (id: string, invalid: boolean) => {
    if (invalid) errors.current.add(id);
    else errors.current.delete(id);
  };
  const update = <K extends keyof PlannerConfig>(
    key: K,
    value: PlannerConfig[K],
  ) => setConfig((c) => ({ ...c, [key]: value }));
  const tableValues = tableText
    .split(/[;\n]+/)
    .filter((s) => s.trim())
    .map((s) => parseBrazilianNumber(s.trim().replace(/%$/, "")));
  const tableError =
    useTable &&
    (!tableValues.length ||
      tableValues.length > 80 ||
      tableValues.some((n) => n === null || n <= -100 || n > 1000));
  const next = () => {
    if (errors.current.size || (step === 2 && tableError)) {
      const invalid = document.querySelector<HTMLElement>(
        '[aria-invalid="true"]',
      );
      const details = invalid?.closest("details");
      if (details) details.open = true;
      invalid?.focus();
      return;
    }
    if (step === 2) {
      const ready = {
        ...config,
        inflationTable: useTable ? tableValues.map((n) => n! / 100) : undefined,
      };
      setConfig(ready);
      setSubmitted(ready);
      setExperiment(null);
      setStep(3);
    } else setStep(step + 1);
  };
  const active = useMemo(() => {
    if (!submitted) return null;
    if (experiment === "more")
      return { ...submitted, monthly: Math.min(1e12, submitted.monthly + 100) };
    if (experiment === "longer")
      return { ...submitted, years: Math.min(80, submitted.years + 2) };
    if (experiment === "lower")
      return {
        ...submitted,
        rate: Math.max(-0.99, submitted.rate - 0.02),
        compare: false,
      };
    return submitted;
  }, [submitted, experiment]);
  const baseline = useMemo(
    () => (submitted ? projectPlan(submitted) : null),
    [submitted],
  );
  const result = useMemo(() => (active ? projectPlan(active) : null), [active]);
  const scenarios = useMemo(
    () =>
      submitted?.compare
        ? [0.04, 0.06, 0.08].map((rate) => ({
            rate,
            result: projectPlan({ ...submitted, rate }),
          }))
        : [],
    [submitted],
  );
  const field = (
    key: "initial" | "monthly" | "target" | "years" | "rate" | "inflation",
    label: string,
    extra: Partial<FieldProps> = {},
  ) => (
    <Field
      key={key === "initial" ? `initial-${initialReset}` : key}
      label={label}
      value={config[key]}
      onChange={(v) => update(key, v)}
      onError={onError}
      {...extra}
    />
  );
  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(submitted ?? config));
      setNotice(
        "Plano salvo neste dispositivo. Ele estará aqui na sua próxima visita neste navegador.",
      );
    } catch {
      setNotice(
        "O navegador não permitiu salvar. Seu plano continua disponível nesta página.",
      );
    }
  };
  const clear = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("simulador_meta_config_v2");
      setNotice(
        "Plano salvo removido deste dispositivo. A simulação aberta foi mantida.",
      );
    } catch {
      setNotice("Não foi possível remover o plano salvo neste navegador.");
    }
  };
  const basis = (active ?? config).inflationAdjusted
    ? "em dinheiro de hoje"
    : "em valores futuros";
  const currentGoal = goals.find((g) => g.id === config.goal)!;
  const headline =
    result && active
      ? result.overflow || result.monthly === null
        ? "Não foi possível calcular este cenário."
        : active.goal === "grow"
          ? `Você poderia juntar ${money(result.end.saldo)}.`
          : active.goal === "monthly"
            ? `Comece guardando ${money(result.monthly)} por mês.`
            : result.monthTarget === 0
              ? "Você já tem o valor da sua meta."
              : result.monthTarget === null
                ? `A meta não seria alcançada em ${active.years} anos.`
                : `Você chegaria à meta em ${duration(result.monthTarget)}.`
      : "";
  const validResult = !!result && !result.overflow && result.monthly !== null;

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Ir para o planejamento
      </a>
      <header className="site-header">
        <a
          className="brand"
          href="#main"
          aria-label="Seu próximo passo — planejador"
        >
          <span className="brand-mark" aria-hidden="true">
            ↗
          </span>
          <span>
            seu próximo <strong>passo</strong>
            <small>PLANEJADOR FINANCEIRO</small>
          </span>
        </a>
        <span className="header-note">
          <span className="status-dot" />
          Sem cadastro. No seu ritmo.
        </span>
      </header>
      <main id="main">
        <div className="intro">
          <span className="eyebrow">UM PLANO COMEÇA COM UMA PERGUNTA</span>
          <h1>
            Seu futuro começa
            <br />
            com o que cabe <em>hoje.</em>
          </h1>
          <p>
            Descubra como guardar dinheiro pode aproximar você dos seus
            objetivos.
            <br className="desktop-only" /> Uma pergunta de cada vez, sem
            precisar entender de investimentos.
          </p>
        </div>
        <div className="workspace">
          <aside className="journey">
            <span className="eyebrow">SEU CAMINHO</span>
            <ol>
              {[
                "Escolha sua pergunta",
                "Conte seu ponto de partida",
                "Entenda as hipóteses",
              ].map((label, index) => (
                <li
                  key={label}
                  className={
                    step === index ? "current" : step > index ? "complete" : ""
                  }
                  aria-current={step === index ? "step" : undefined}
                >
                  <span>{step > index ? "✓" : `0${index + 1}`}</span>
                  <div>
                    {label}
                    <small>
                      {
                        [
                          "O que você quer descobrir?",
                          "Os valores que fazem sentido para você",
                          "Como vamos fazer a estimativa",
                        ][index]
                      }
                    </small>
                  </div>
                </li>
              ))}
            </ol>
            <div className="journey-note">
              <span className="sprout" aria-hidden="true">
                ✳
              </span>
              <h3>Pequenos passos contam.</h3>
              <p>
                Você pode começar do zero e testar diferentes possibilidades. O
                plano é seu.
              </p>
            </div>
            <p className="privacy-note">
              Seus valores são calculados neste navegador. Salvar o plano é
              opcional.
            </p>
          </aside>
          <div className="main-column">
            {notice && (
              <div className="notice" role="status">
                {notice}
                <button
                  type="button"
                  aria-label="Fechar aviso"
                  onClick={() => setNotice("")}
                >
                  ×
                </button>
              </div>
            )}
            {step < 3 ? (
              <section className="panel wizard-panel">
                <div className="panel-top">
                  <span className="eyebrow">PASSO {step + 1} DE 3</span>
                  <span className="step-dots" aria-hidden="true">
                    {[0, 1, 2].map((n) => (
                      <i key={n} className={step >= n ? "on" : ""} />
                    ))}
                  </span>
                </div>
                <h2 ref={heading} tabIndex={-1}>
                  {
                    [
                      "O que você quer descobrir?",
                      "Vamos dar forma ao seu plano.",
                      "Uma estimativa, com tudo às claras.",
                    ][step]
                  }
                </h2>
                <p className="section-intro">
                  {
                    [
                      "Escolha a pergunta que mais combina com o seu momento.",
                      currentGoal.title,
                      "O rendimento pode mudar. Vamos usar hipóteses para explorar possibilidades, sem prometer um resultado.",
                    ][step]
                  }
                </p>
                {step === 0 ? (
                  <div className="goal-list">
                    {goals.map((g) => (
                      <button
                        key={g.id}
                        className="goal-card"
                        onClick={() => {
                          setConfig((c) => ({
                            ...c,
                            goal: g.id,
                            years:
                              g.id === "time"
                                ? c.goal === "time"
                                  ? c.years
                                  : 50
                                : c.goal === "time"
                                  ? 10
                                  : c.years,
                          }));
                          setStep(1);
                        }}
                      >
                        <span className="goal-icon" aria-hidden="true">
                          {g.icon}
                        </span>
                        <span>
                          <strong>{g.title}</strong>
                          <small>{g.description}</small>
                        </span>
                        <span className="arrow" aria-hidden="true">
                          →
                        </span>
                      </button>
                    ))}
                    <p className="quiet-note">
                      Pode explorar à vontade. Você poderá mudar de pergunta
                      depois.
                    </p>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      next();
                    }}
                    noValidate
                  >
                    {step === 1 && (
                      <div className="fields-grid">
                        <div>
                          {field("initial", "Quanto você já tem guardado?", {
                            hint: "Use apenas o valor que pretende dedicar a este plano.",
                          })}
                          <button
                            type="button"
                            className="text-button zero-button"
                            onClick={() => {
                              update("initial", 0);
                              setInitialReset((n) => n + 1);
                            }}
                          >
                            Ainda não tenho dinheiro guardado
                          </button>
                        </div>
                        {config.goal !== "monthly" &&
                          field("monthly", "Quanto consegue guardar por mês?", {
                            hint: "Pode ser pouco. Escolha um valor que caiba no seu mês.",
                          })}
                        {config.goal !== "grow" &&
                          field("target", "Quanto você quer juntar?", {
                            min: 0.01,
                            hint: "Pense no valor do objetivo que quer alcançar.",
                          })}
                        {config.goal !== "time" &&
                          field(
                            "years",
                            config.goal === "monthly"
                              ? "Em quantos anos quer chegar lá?"
                              : "Por quantos anos pretende guardar?",
                            {
                              unit: "anos",
                              min: 1,
                              max: 80,
                              integer: true,
                              hint: "Você poderá testar outro prazo depois.",
                            },
                          )}
                        <div className="helper-box full-width">
                          <span aria-hidden="true">↳</span>
                          <p>
                            Não precisa acertar de primeira. Use uma estimativa
                            e ajuste o plano depois.
                          </p>
                        </div>
                      </div>
                    )}
                    {step === 2 && (
                      <div className="assumptions">
                        <fieldset className="choice-group">
                          <legend>
                            Você sabe qual rendimento quer simular?
                          </legend>
                          <label
                            className={`radio-card ${config.compare ? "selected" : ""}`}
                          >
                            <input
                              type="radio"
                              name="rate-mode"
                              checked={config.compare}
                              onChange={() =>
                                setConfig((c) => ({
                                  ...c,
                                  compare: true,
                                  rate: 0.06,
                                }))
                              }
                            />
                            <span>
                              <strong>Não sei — comparar cenários</strong>
                              <small>
                                Hipóteses ilustrativas de 4%, 6% e 8% ao ano. O
                                resumo usa 6%.
                              </small>
                            </span>
                          </label>
                          <label
                            className={`radio-card ${!config.compare ? "selected" : ""}`}
                          >
                            <input
                              type="radio"
                              name="rate-mode"
                              checked={!config.compare}
                              onChange={() => update("compare", false)}
                            />
                            <span>
                              <strong>Quero informar uma taxa</strong>
                              <small>
                                Para experimentar uma hipótese que você já tem
                                em mente.
                              </small>
                            </span>
                          </label>
                        </fieldset>
                        {!config.compare && (
                          <Field
                            label="Rendimento estimado por ano"
                            value={config.rate * 100}
                            onChange={(v) => update("rate", v / 100)}
                            unit="% ao ano"
                            min={-99}
                            max={1000}
                            onError={onError}
                            hint="Digite 6 para simular 6% ao ano. A taxa não é garantia de ganho."
                          />
                        )}
                        <p className="quiet-note">
                          Esses cenários não representam produtos, perfis de
                          risco ou previsões de mercado. Impostos e taxas não
                          são descontados automaticamente.
                        </p>
                        <details className="advanced">
                          <summary>
                            Ajustar hipóteses <span>Opcional</span>
                          </summary>
                          <div className="advanced-content">
                            <label className="check-card">
                              <input
                                type="checkbox"
                                checked={config.inflationAdjusted}
                                onChange={(e) =>
                                  update("inflationAdjusted", e.target.checked)
                                }
                              />
                              <span>
                                <strong>
                                  Considerar que os preços podem aumentar
                                </strong>
                                <small>
                                  Mostra tudo em dinheiro de hoje: R$ 100 mil no
                                  futuro podem comprar menos do que hoje. A meta
                                  passa a representar o poder de compra atual.
                                </small>
                              </span>
                            </label>
                            <Field
                              label="Aumento estimado dos preços por ano"
                              value={config.inflation * 100}
                              onChange={(v) => update("inflation", v / 100)}
                              unit="% ao ano"
                              min={-99}
                              max={1000}
                              onError={onError}
                              hint="Hipótese de inflação. Afeta o resultado ao ativar a opção acima ou reajustar depósitos pela inflação."
                            />
                            <div className="field">
                              <label htmlFor="deposit-policy">
                                Como seus depósitos mudam com o tempo?
                              </label>
                              <select
                                id="deposit-policy"
                                value={config.policy.tipo}
                                onChange={(e) => {
                                  const tipo = e.target
                                    .value as PlannerConfig["policy"]["tipo"];
                                  update(
                                    "policy",
                                    tipo === "mensal_pct"
                                      ? { tipo, mensalPct: 0.01 }
                                      : tipo === "anual_pct"
                                        ? { tipo, anualPct: 0.05 }
                                        : tipo === "anual_real"
                                          ? { tipo, realExtra: 0.02 }
                                          : { tipo },
                                  );
                                }}
                              >
                                {Object.entries(policyNames).map(
                                  ([id, label]) => (
                                    <option value={id} key={id}>
                                      {label}
                                    </option>
                                  ),
                                )}
                              </select>
                              <small>
                                Aumentos anuais começam no depósito do mês 12 e
                                se repetem a cada 12 meses. Os valores
                                depositados são em reais de cada época.
                              </small>
                            </div>
                            {config.policy.tipo === "mensal_pct" && (
                              <Field
                                label="Aumento dos depósitos por mês"
                                value={config.policy.mensalPct * 100}
                                onChange={(v) =>
                                  update("policy", {
                                    tipo: "mensal_pct",
                                    mensalPct: v / 100,
                                  })
                                }
                                unit="% ao mês"
                                min={-99}
                                max={100}
                                onError={onError}
                              />
                            )}
                            {config.policy.tipo === "anual_pct" && (
                              <Field
                                label="Aumento dos depósitos por ano"
                                value={config.policy.anualPct * 100}
                                onChange={(v) =>
                                  update("policy", {
                                    tipo: "anual_pct",
                                    anualPct: v / 100,
                                  })
                                }
                                unit="% ao ano"
                                min={-99}
                                max={100}
                                onError={onError}
                              />
                            )}
                            {config.policy.tipo === "anual_real" && (
                              <Field
                                label="Aumento extra acima da inflação"
                                value={config.policy.realExtra * 100}
                                onChange={(v) =>
                                  update("policy", {
                                    tipo: "anual_real",
                                    realExtra: v / 100,
                                  })
                                }
                                unit="% ao ano"
                                min={-99}
                                max={100}
                                onError={onError}
                              />
                            )}
                            <label className="check-card">
                              <input
                                type="checkbox"
                                checked={config.beginning}
                                onChange={(e) =>
                                  update("beginning", e.target.checked)
                                }
                              />
                              <span>
                                <strong>Guardar no início de cada mês</strong>
                                <small>
                                  Desmarcado: consideramos o depósito no fim do
                                  mês.
                                </small>
                              </span>
                            </label>
                            {config.goal === "time" &&
                              field(
                                "years",
                                "Até quantos anos quer explorar?",
                                {
                                  unit: "anos",
                                  min: 1,
                                  max: 80,
                                  integer: true,
                                  hint: "Se a meta não for alcançada, mostraremos o resultado até esse limite.",
                                },
                              )}
                            <label className="check-card">
                              <input
                                type="checkbox"
                                checked={useTable}
                                onChange={(e) => setUseTable(e.target.checked)}
                              />
                              <span>
                                <strong>
                                  Usar uma inflação diferente em cada ano
                                </strong>
                                <small>
                                  Opcional, para simulações mais detalhadas.
                                </small>
                              </span>
                            </label>
                            {useTable && (
                              <div className="field">
                                <label htmlFor="inflation-table">
                                  Inflação de cada ano, em porcentagem
                                </label>
                                <textarea
                                  id="inflation-table"
                                  value={tableText}
                                  onChange={(e) => setTableText(e.target.value)}
                                  placeholder="4%; 5%; 3,5%"
                                  aria-invalid={!!tableError}
                                  aria-describedby="table-help"
                                />
                                <small
                                  id="table-help"
                                  className={tableError ? "error" : ""}
                                >
                                  {tableError
                                    ? "Informe até 80 taxas maiores que −100% e até 1.000%, separadas por ponto e vírgula."
                                    : "Separe anos por ponto e vírgula ou uma linha por ano. A última taxa se repete nos anos seguintes."}
                                </small>
                              </div>
                            )}
                          </div>
                        </details>
                        <div className="hypothesis-summary">
                          <strong>O que seu resultado vai considerar</strong>
                          <p>
                            {config.compare
                              ? "Três cenários, com 6% ao ano no resumo"
                              : `${fmtPct(config.rate)} ao ano`}
                            .{" "}
                            {config.inflationAdjusted
                              ? "Valores e meta em dinheiro de hoje"
                              : "Valores futuros, sem descontar a inflação"}
                            . {policyNames[config.policy.tipo]}. Depósito no{" "}
                            {config.beginning ? "início" : "fim"} do mês.
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="form-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setStep(step - 1)}
                      >
                        ← Voltar
                      </button>
                      <button type="submit" className="primary">
                        {step === 1 ? "Continuar" : "Ver meu plano"}{" "}
                        <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  </form>
                )}
              </section>
            ) : (
              result &&
              active &&
              baseline &&
              submitted && (
                <div className="results">
                  <section className="result-hero">
                    <div className="panel-top">
                      <span className="eyebrow">
                        SEU PLANO, UMA POSSIBILIDADE
                      </span>
                      <span className="result-badge">{basis}</span>
                    </div>
                    <h2 ref={heading} tabIndex={-1}>
                      {headline}
                    </h2>
                    <p>
                      {active.goal === "grow"
                        ? `Ao longo de ${active.years} anos, começando com ${money(active.initial)} e guardando inicialmente ${money(active.monthly)} por mês.`
                        : active.goal === "monthly"
                          ? `Para ter ${money(active.target)} ao final de ${active.years} anos, começando com ${money(active.initial)}.`
                          : `Para juntar ${money(active.target)}, começando com ${money(active.initial)} e guardando inicialmente ${money(active.monthly)} por mês.`}
                    </p>
                    {active.inflationAdjusted && (
                      <p>
                        Meta e saldo em dinheiro de hoje. O depósito mensal é o
                        valor em reais que você guardaria em cada mês.
                      </p>
                    )}
                    <div className="hero-foot">
                      <span>
                        Hipótese de {fmtPct(active.rate)} ao ano ·{" "}
                        {policyNames[active.policy.tipo].toLowerCase()}
                      </span>
                      <button
                        className="text-button"
                        onClick={() => {
                          setConfig(submitted);
                          setStep(1);
                        }}
                      >
                        Editar meu plano ↗
                      </button>
                    </div>
                  </section>
                  {!validResult ? (
                    <div className="notice" role="alert">
                      {result.overflow
                        ? "Os valores ultrapassam os limites numéricos da simulação. Reduza as taxas, o prazo ou os valores e tente novamente."
                        : "Não encontramos um valor mensal dentro dos limites da simulação. Experimente uma meta menor ou um prazo diferente."}
                      {experiment && (
                        <button
                          className="text-button"
                          onClick={() => setExperiment(null)}
                        >
                          Voltar ao plano original
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <section className="panel evolution">
                        <div className="section-heading">
                          <div>
                            <span className="eyebrow">
                              CADA PARTE DO SEU PLANO
                            </span>
                            <h3>Como seu dinheiro pode crescer</h3>
                          </div>
                          <span className="period-label">
                            {result.end.mes === 0
                              ? "Hoje"
                              : `Até ${duration(result.end.mes)}`}
                          </span>
                        </div>
                        <div className="metrics">
                          <div>
                            <span>
                              <i className="dot deposit" />
                              Dinheiro que você colocou
                            </span>
                            <strong>
                              {money(result.end.contribuicoesAcum)}
                            </strong>
                            <small>
                              Valor inicial + depósitos
                              {active.inflationAdjusted
                                ? ", trazidos para dinheiro de hoje"
                                : ""}
                            </small>
                          </div>
                          <div>
                            <span>
                              <i className="dot earnings" />
                              {result.end.ganhosAcum < 0
                                ? "Perda estimada"
                                : "Rendimento estimado"}
                            </span>
                            <strong>{money(result.end.ganhosAcum)}</strong>
                            <small>
                              {active.inflationAdjusted
                                ? "Variação além da inflação"
                                : "Variação além do que você colocou"}
                            </small>
                          </div>
                          <div>
                            <span>Total estimado</span>
                            <strong>{money(result.end.saldo)}</strong>
                            <small>Todos os valores no mesmo prazo</small>
                          </div>
                        </div>
                        <div
                          className="chart"
                          role="img"
                          aria-label={`Evolução até ${duration(result.end.mes)}: total ${money(result.end.saldo)}, dinheiro colocado ${money(result.end.contribuicoesAcum)} e rendimento ${money(result.end.ganhosAcum)}, ${basis}.`}
                        >
                          <Suspense
                            fallback={
                              <p className="quiet-note">
                                Preparando o gráfico… Os valores já estão
                                disponíveis acima.
                              </p>
                            }
                          >
                            <ProjectionChart
                              data={result.data}
                              target={
                                active.goal === "grow"
                                  ? undefined
                                  : active.target
                              }
                            />
                          </Suspense>
                        </div>
                        <p className="quiet-note">
                          Uma estimativa {basis}. Rendimentos variam e podem ser
                          negativos. Impostos e taxas não são descontados
                          automaticamente.
                        </p>
                      </section>
                      <section className="panel">
                        <span className="eyebrow">EXPLORE SEM COMPROMISSO</span>
                        <h3>E se eu mudar meu plano?</h3>
                        <p className="section-intro">
                          Veja o efeito de uma mudança por vez. Seu plano
                          original fica preservado.
                        </p>
                        <div className="experiment-buttons">
                          {submitted.goal !== "monthly" && (
                            <button
                              aria-pressed={experiment === "more"}
                              onClick={() =>
                                setExperiment(
                                  experiment === "more" ? null : "more",
                                )
                              }
                              disabled={submitted.monthly >= 1e12}
                            >
                              + R$ 100 por mês
                            </button>
                          )}
                          <button
                            aria-pressed={experiment === "longer"}
                            disabled={submitted.years >= 80}
                            onClick={() =>
                              setExperiment(
                                experiment === "longer" ? null : "longer",
                              )
                            }
                          >
                            {submitted.goal === "time"
                              ? "Explorar mais 2 anos"
                              : "Esperar mais 2 anos"}
                          </button>
                          <button
                            aria-pressed={experiment === "lower"}
                            onClick={() =>
                              setExperiment(
                                experiment === "lower" ? null : "lower",
                              )
                            }
                          >
                            Rendimento menor (
                            {fmtPct(Math.max(-0.99, submitted.rate - 0.02))} ao
                            ano)
                          </button>
                        </div>
                        <div className="experiment-feedback" role="status">
                          {!experiment
                            ? "Escolha uma mudança para comparar com seu plano."
                            : active.goal === "monthly"
                              ? `O valor mensal inicial muda de ${money(baseline.monthly ?? 0)} para ${money(result.monthly ?? 0)}.`
                              : active.goal === "time"
                                ? `Prazo original: ${baseline.monthTarget === null ? `meta não alcançada em ${submitted.years} anos` : duration(baseline.monthTarget)}. Nesta hipótese: ${result.monthTarget === null ? `meta não alcançada em ${active.years} anos` : duration(result.monthTarget)}.`
                                : `O total muda de ${money(baseline.end.saldo)} em ${submitted.years} anos para ${money(result.end.saldo)} em ${active.years} anos — ${money(Math.abs(result.end.saldo - baseline.end.saldo))} ${result.end.saldo >= baseline.end.saldo ? "a mais" : "a menos"}.`}
                        </div>
                        {experiment && (
                          <button
                            className="text-button"
                            onClick={() => setExperiment(null)}
                          >
                            Voltar ao plano original
                          </button>
                        )}
                      </section>
                    </>
                  )}
                  {scenarios.length > 0 && (
                    <section className="panel">
                      <span className="eyebrow">O RENDIMENTO NÃO É CERTO</span>
                      <h3>Um plano, três hipóteses</h3>
                      <p className="section-intro">
                        Comparação do plano original. São exemplos ilustrativos,
                        não uma faixa garantida de resultados.
                      </p>
                      <div className="scenario-grid">
                        {scenarios.map(({ rate, result: scenario }) => (
                          <div
                            key={rate}
                            className={`scenario ${rate === 0.06 ? "central" : ""}`}
                          >
                            <span>
                              {rate === 0.06
                                ? "HIPÓTESE ORIGINAL"
                                : rate < 0.06
                                  ? "RENDIMENTO MENOR"
                                  : "RENDIMENTO MAIOR"}
                            </span>
                            <h4>
                              {fmtPct(rate)} <small>ao ano</small>
                            </h4>
                            <strong>
                              {scenario.overflow || scenario.monthly === null
                                ? "Fora dos limites"
                                : submitted.goal === "time"
                                  ? scenario.monthTarget === null
                                    ? "Meta não alcançada"
                                    : duration(scenario.monthTarget)
                                  : money(
                                      submitted.goal === "monthly"
                                        ? scenario.monthly
                                        : scenario.end.saldo,
                                    )}
                            </strong>
                            <p>
                              {submitted.goal === "monthly"
                                ? `por mês, inicialmente, por ${submitted.years} anos`
                                : submitted.goal === "time"
                                  ? `para sua meta; limite de ${submitted.years} anos`
                                  : `ao final de ${submitted.years} anos`}
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="quiet-note">
                        {submitted.inflationAdjusted
                          ? "Resultados em dinheiro de hoje. As taxas acima são antes de descontar a inflação."
                          : "Resultados em valores futuros, sem descontar a inflação."}
                      </p>
                    </section>
                  )}
                  <section className="panel details-panel">
                    <details>
                      <summary>Ver detalhes do cálculo</summary>
                      <div className="details-body">
                        <h3>Hipóteses desta simulação</h3>
                        <ul>
                          <li>
                            Rendimento constante de {fmtPct(active.rate)} ao
                            ano, convertido em uma taxa mensal equivalente.
                          </li>
                          <li>
                            {active.inflationAdjusted
                              ? "Saldo e cada depósito convertidos para dinheiro de hoje; a meta também é em dinheiro de hoje."
                              : "Saldo e meta em valores futuros. A inflação não é descontada do resultado."}
                          </li>
                          <li>
                            Inflação:{" "}
                            {active.inflationTable?.length
                              ? `${active.inflationTable.map(fmtPct).join("; ")} por ano, repetindo o último valor depois.`
                              : `${fmtPct(active.inflation)} ao ano.`}
                          </li>
                          <li>
                            {policyNames[active.policy.tipo]}.{" "}
                            {active.policy.tipo === "mensal_pct"
                              ? `${fmtPct(active.policy.mensalPct)} ao mês.`
                              : active.policy.tipo === "anual_pct"
                                ? `${fmtPct(active.policy.anualPct)} ao ano.`
                                : active.policy.tipo === "anual_real"
                                  ? `${fmtPct(active.policy.realExtra)} extra além da inflação.`
                                  : ""}{" "}
                            Aumentos anuais nos meses 12, 24 e seguintes.
                          </li>
                          <li>
                            Depósito no {active.beginning ? "início" : "fim"} do
                            mês. O valor mensal informado é em reais da época de
                            cada depósito.
                          </li>
                          <li>
                            Sem impostos, taxas de administração ou mudanças
                            imprevisíveis do mercado.
                          </li>
                        </ul>
                        {validResult && (
                          <div
                            className="table-scroll"
                            tabIndex={0}
                            role="region"
                            aria-label="Tabela da evolução do plano"
                          >
                            <table>
                              <caption>
                                Evolução {basis} — início, anos completos e
                                último mês
                              </caption>
                              <thead>
                                <tr>
                                  <th scope="col">Momento</th>
                                  <th scope="col">Você colocou</th>
                                  <th scope="col">Rendimento</th>
                                  <th scope="col">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {result.data
                                  .filter(
                                    (d) =>
                                      d.mes % 12 === 0 ||
                                      d.mes === result.end.mes,
                                  )
                                  .map((d) => (
                                    <tr key={d.mes}>
                                      <th scope="row">{duration(d.mes)}</th>
                                      <td>{money(d.contribuicoesAcum)}</td>
                                      <td>{money(d.ganhosAcum)}</td>
                                      <td>{money(d.saldo)}</td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </details>
                  </section>
                  <div className="result-actions">
                    <button className="primary" onClick={save}>
                      Salvar neste dispositivo <span aria-hidden="true">↓</span>
                    </button>
                    <button className="secondary" onClick={() => setStep(0)}>
                      Explorar outra pergunta
                    </button>
                    <button className="text-button" onClick={clear}>
                      Remover plano salvo
                    </button>
                  </div>
                  <p className="quiet-note">
                    O salvamento guarda o plano original, sem as experiências
                    temporárias. Disponível apenas neste navegador.
                  </p>
                </div>
              )
            )}
          </div>
        </div>
        <section className="learning-strip">
          <div>
            <span>01</span>
            <h3>Você decide o começo.</h3>
            <p>Não existe um valor mínimo para explorar seu plano.</p>
          </div>
          <div>
            <span>02</span>
            <h3>O tempo faz diferença.</h3>
            <p>Compare prazos e veja como cada escolha muda a estimativa.</p>
          </div>
          <div>
            <span>03</span>
            <h3>Entenda antes de investir.</h3>
            <p>
              O simulador ajuda a planejar. Ele não escolhe investimentos por
              você.
            </p>
          </div>
        </section>
      </main>
      <footer>
        <span>
          seu próximo passo <span aria-hidden="true">↗</span>
        </span>
        <p>
          Uma ferramenta para explorar possibilidades.
          <br />
          Simulações educativas, sem garantia de rendimento.
        </p>
        <a
          href="https://github.com/g0dswer/Simulador-de-Investimentos"
          target="_blank"
          rel="noreferrer"
        >
          Sobre o projeto ↗
        </a>
      </footer>
    </div>
  );
}
