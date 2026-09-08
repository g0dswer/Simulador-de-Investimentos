import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import {
  PoliticaAporte,
  aporteNecessario as coreAporte,
  calcularProjecao as coreProjection,
  fmtBRL,
  fmtPct,
  mesesParaAnosMeses,
  parseInflacaoTabela,
  inflacaoMensalDoMes,
  taxaNecessaria as coreTaxa,
} from "./lib/calculos";
import { rodarTestes, TestRes } from "./lib/testCases";
import {
  DEFAULT_CONFIG,
  PlannerConfig,
  projectPlan,
  sanitizeConfig,
} from "./lib/planner";
import "./advanced-dashboard.css";

// Preserve the original dashboard UI while sharing today's-money semantics with the guide.
type ProjectionInput = Parameters<typeof coreProjection>[0];
function asPlanner(p: ProjectionInput): PlannerConfig {
  return {
    ...DEFAULT_CONFIG,
    goal: "grow",
    compare: false,
    initial: p.montanteInicial,
    monthly: p.aporteMensal,
    target: p.meta,
    years: p.anosLimite,
    rate: p.rentabAnual,
    beginning: p.contribuicaoNoInicio,
    inflationAdjusted: p.usarTaxaReal,
    inflation: p.inflacaoAnual,
    inflationTable: p.inflacaoTabela,
    policy: p.politicaAporte ?? { tipo: "constante" },
  };
}
function calcularProjecao(p: ProjectionInput) {
  const plan = projectPlan(asPlanner(p));
  return {
    dados: plan.monthly === null || plan.overflow ? [] : plan.data,
    mesAlvo: plan.monthTarget,
    taxaMensalNominalConst: Math.pow(1 + p.rentabAnual, 1 / 12) - 1,
    taxaMensalInflacaoMedia:
      plan.data
        .slice(1)
        .reduce(
          (sum, row) =>
            sum +
            inflacaoMensalDoMes(row.mes, p.inflacaoAnual, p.inflacaoTabela),
          0,
        ) / Math.max(1, plan.data.length - 1),
  };
}
function aporteNecessario(p: Parameters<typeof coreAporte>[0]) {
  return projectPlan({
    ...asPlanner({ ...p, aporteMensal: 0, anosLimite: p.anos }),
    goal: "monthly",
  }).monthly;
}
function taxaNecessaria(p: Parameters<typeof coreTaxa>[0]) {
  // Solve against the final displayed balance, including inflation and negative returns.
  const cfg = asPlanner({ ...p, rentabAnual: 0, anosLimite: p.anos });
  const reaches = (rate: number) => {
    const plan = projectPlan({ ...cfg, rate });
    return !plan.overflow && plan.monthly !== null && plan.end.saldo >= p.meta;
  };
  let lo = -0.999999,
    hi = 10;
  if (reaches(lo)) return lo;
  // Find the first safe upper bracket before overflow at extreme rates.
  let upper: number | null = null;
  for (const rate of [0, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10]) {
    if (reaches(rate)) {
      upper = rate;
      break;
    }
  }
  if (upper === null) return null;
  hi = upper;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (reaches(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

const MIN_RATE = -0.999999;
const MAX_RATE = 10;
const MAX_MONEY = 1_000_000_000_000;
const TIPOS_APORTE: readonly PoliticaAporte["tipo"][] = [
  "constante",
  "mensal_pct",
  "anual_pct",
  "anual_inflacao",
  "anual_real",
];

function clampFinite(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(max, Math.max(min, numericValue));
}

function safeMoney(value: unknown, fallback: number) {
  return clampFinite(value, fallback, 0, MAX_MONEY);
}

function safeRate(value: unknown, fallback: number) {
  return clampFinite(value, fallback, MIN_RATE, MAX_RATE);
}

function safeWholeNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  return Math.round(clampFinite(value, fallback, min, max));
}

function safeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function isTipoAporte(value: unknown): value is PoliticaAporte["tipo"] {
  return (
    typeof value === "string" &&
    TIPOS_APORTE.includes(value as PoliticaAporte["tipo"])
  );
}

function Row({
  children,
  style = {} as React.CSSProperties,
  className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{ display: "flex", gap: 12, alignItems: "center", ...style }}
    >
      {children}
    </div>
  );
}

type NumberFieldProps = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
};

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  prefix,
  suffix,
  min,
  max,
}: NumberFieldProps) {
  const inputId = `number-field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const lowerBound = min ?? Number.NEGATIVE_INFINITY;
  const upperBound = max ?? Number.POSITIVE_INFINITY;

  return (
    <div className="legacy-number-field">
      <label htmlFor={inputId} style={{ fontSize: 13, color: "#475569" }}>
        {label}
      </label>
      <Row className="legacy-number-field-control">
        {prefix && (
          <span
            className="legacy-number-field-prefix"
            style={{ color: "#64748b" }}
          >
            {prefix}
          </span>
        )}
        <input
          id={inputId}
          className="legacy-number-input"
          type="number"
          step={step}
          min={min}
          max={max}
          inputMode="decimal"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (!Number.isFinite(next)) return;
            onChange(Math.min(upperBound, Math.max(lowerBound, next)));
          }}
          style={{ padding: 8, borderRadius: 8, border: "1px solid #e2e8f0" }}
        />
        {suffix && (
          <span
            className="legacy-number-field-suffix"
            style={{ color: "#64748b" }}
          >
            {suffix}
          </span>
        )}
      </Row>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="legacy-section-card">
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {children}
    </section>
  );
}

export type DashboardSession = {
  planningYears?: number;
  tab?: "planejar" | "sensibilidade" | "dados" | "testes";
};
export default function AdvancedDashboard({
  initialConfig,
  onChange,
  session,
}: {
  initialConfig: PlannerConfig;
  onChange: (config: PlannerConfig) => void;
  session?: DashboardSession;
}) {
  const [seed] = useState(() => {
    const cfg = sanitizeConfig(initialConfig);
    const result = cfg.goal === "monthly" ? projectPlan(cfg) : null;
    return { ...cfg, monthly: result?.monthly ?? cfg.monthly };
  });
  const [notice, setNotice] = useState(() =>
    initialConfig.goal === "monthly" &&
    projectPlan(initialConfig).monthly === null
      ? "Não foi possível calcular o aporte para a meta. Ajuste os parâmetros abaixo."
      : "",
  );
  const titleRef = useRef<HTMLElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  const [montanteInicial, setMontanteInicial] = useState(seed.initial);
  const [aporteMensal, setAporteMensal] = useState(seed.monthly);
  const [rentabAnual, setRentabAnual] = useState(seed.rate);
  const [meta, setMeta] = useState(seed.target);
  const [anosLimite, setAnosLimite] = useState(seed.years);
  const [contribuicaoNoInicio, setContribuicaoNoInicio] = useState(
    seed.beginning,
  );
  const [usarTaxaReal, setUsarTaxaReal] = useState(seed.inflationAdjusted);
  const [inflacaoAnual, setInflacaoAnual] = useState(seed.inflation);
  const [prazoDesejado, setPrazoDesejado] = useState(
    session?.planningYears ?? seed.years,
  );

  const [usaTabelaInflacao, setUsaTabelaInflacao] = useState(
    !!seed.inflationTable?.length,
  );
  const [inflacaoTabelaStr, setInflacaoTabelaStr] = useState(
    seed.inflationTable?.map((v) => `${v * 100}%`).join("; ") ?? "",
  );
  const inflacaoTabela = useMemo(
    () =>
      parseInflacaoTabela(inflacaoTabelaStr).filter(
        (value) => value > MIN_RATE && value <= MAX_RATE,
      ),
    [inflacaoTabelaStr],
  );

  const [tipoAporte, setTipoAporte] = useState<PoliticaAporte["tipo"]>(
    seed.policy.tipo,
  );
  const [mensalPct, setMensalPct] = useState(
    seed.policy.tipo === "mensal_pct" ? seed.policy.mensalPct : 0,
  );
  const [anualPct, setAnualPct] = useState(
    seed.policy.tipo === "anual_pct" ? seed.policy.anualPct : 0.1,
  );
  const [realExtra, setRealExtra] = useState(
    seed.policy.tipo === "anual_real" ? seed.policy.realExtra : 0.02,
  );

  const politicaAporte: PoliticaAporte =
    tipoAporte === "mensal_pct"
      ? { tipo: "mensal_pct", mensalPct }
      : tipoAporte === "anual_pct"
        ? { tipo: "anual_pct", anualPct }
        : tipoAporte === "anual_inflacao"
          ? { tipo: "anual_inflacao" }
          : tipoAporte === "anual_real"
            ? { tipo: "anual_real", realExtra }
            : { tipo: "constante" };

  const current: PlannerConfig = {
    ...seed,
    goal: "grow",
    compare: false,
    initial: montanteInicial,
    monthly: aporteMensal,
    rate: rentabAnual,
    target: meta,
    years: anosLimite,
    beginning: contribuicaoNoInicio,
    inflationAdjusted: usarTaxaReal,
    inflation: inflacaoAnual,
    inflationTable: usaTabelaInflacao ? inflacaoTabela : undefined,
    policy: politicaAporte,
  };
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const signature = JSON.stringify(current);
  useEffect(() => {
    changeRef.current(current);
  }, [signature]);

  const salvarConfig = () => {
    try {
      window.localStorage.setItem(
        "simulador_plano_v3",
        JSON.stringify(current),
      );
      setNotice("Parâmetros salvos neste dispositivo.");
    } catch {
      setNotice("O navegador não permitiu salvar os parâmetros.");
    }
  };
  const limparConfig = () => {
    try {
      window.localStorage.removeItem("simulador_plano_v3");
      window.localStorage.removeItem("simulador_meta_config_v2");
      setNotice("Parâmetros salvos removidos. A simulação aberta foi mantida.");
    } catch {
      setNotice("O navegador não permitiu remover os parâmetros salvos.");
    }
  };

  const inflTabelaOpt = usaTabelaInflacao ? inflacaoTabela : undefined;

  const { dados, mesAlvo, taxaMensalNominalConst, taxaMensalInflacaoMedia } =
    useMemo(
      () =>
        calcularProjecao({
          montanteInicial,
          aporteMensal,
          rentabAnual,
          meta,
          anosLimite,
          contribuicaoNoInicio,
          usarTaxaReal,
          inflacaoAnual,
          inflacaoTabela: inflTabelaOpt,
          politicaAporte,
        }),
      [
        montanteInicial,
        aporteMensal,
        rentabAnual,
        meta,
        anosLimite,
        contribuicaoNoInicio,
        usarTaxaReal,
        inflacaoAnual,
        inflTabelaOpt,
        politicaAporte,
      ],
    );

  const aporteParaPrazo = useMemo(
    () =>
      aporteNecessario({
        montanteInicial,
        rentabAnual,
        anos: prazoDesejado,
        meta,
        contribuicaoNoInicio,
        usarTaxaReal,
        inflacaoAnual,
        inflacaoTabela: inflTabelaOpt,
        politicaAporte,
      }),
    [
      montanteInicial,
      rentabAnual,
      prazoDesejado,
      meta,
      contribuicaoNoInicio,
      usarTaxaReal,
      inflacaoAnual,
      inflTabelaOpt,
      politicaAporte,
    ],
  );

  const taxaParaPrazo = useMemo(
    () =>
      taxaNecessaria({
        montanteInicial,
        aporteMensal,
        anos: prazoDesejado,
        meta,
        contribuicaoNoInicio,
        usarTaxaReal,
        inflacaoAnual,
        inflacaoTabela: inflTabelaOpt,
        politicaAporte,
      }),
    [
      montanteInicial,
      aporteMensal,
      prazoDesejado,
      meta,
      contribuicaoNoInicio,
      usarTaxaReal,
      inflacaoAnual,
      inflTabelaOpt,
      politicaAporte,
    ],
  );

  const sensibilidades = useMemo(() => {
    const variacoesRent = [-0.02, -0.01, 0, 0.01, 0.02];
    const variacoesAporte = [-0.2, -0.1, 0, 0.1, 0.2];
    return variacoesAporte.map((va) =>
      variacoesRent.map((vr) => {
        const r = Math.min(10, Math.max(-0.999999, rentabAnual + vr));
        const a = Math.min(MAX_MONEY, Math.max(0, aporteMensal * (1 + va)));
        const { mesAlvo: ma } = calcularProjecao({
          montanteInicial,
          aporteMensal: a,
          rentabAnual: r,
          meta,
          anosLimite,
          contribuicaoNoInicio,
          usarTaxaReal,
          inflacaoAnual,
          inflacaoTabela: inflTabelaOpt,
          politicaAporte,
        });
        return { va, vr, meses: ma };
      }),
    );
  }, [
    montanteInicial,
    aporteMensal,
    rentabAnual,
    meta,
    anosLimite,
    contribuicaoNoInicio,
    usarTaxaReal,
    inflacaoAnual,
    inflTabelaOpt,
    politicaAporte,
  ]);

  const exportarCSV = () => {
    if (typeof window === "undefined") return;
    const linhas = [
      [
        "mes",
        "aporte_mes",
        "saldo",
        "contribuicoes_acumuladas",
        "ganhos_acumulados",
      ],
      ...dados.map((d) => [
        d.mes,
        d.aporte,
        d.saldo,
        d.contribuicoesAcum,
        d.ganhosAcum,
      ]),
    ];
    const conteudo = linhas.map((l) => l.join(",")).join("\n");
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "projecao_meta_patrimonial.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const naoAtingida = "> limite";
  const mesesAteMetaTexto =
    mesAlvo !== null ? mesesParaAnosMeses(mesAlvo) : naoAtingida;

  const [testeResultados, setTesteResultados] = useState<TestRes[] | null>(
    null,
  );
  useEffect(() => {
    setTesteResultados(rodarTestes());
  }, []);

  const [tab, setTab] = useState<
    "planejar" | "sensibilidade" | "dados" | "testes"
  >(session?.tab ?? "planejar");
  useEffect(() => {
    if (session) {
      session.planningYears = prazoDesejado;
      session.tab = tab;
    }
  }, [prazoDesejado, tab, session]);

  return (
    <div className="legacy-app-shell">
      <header className="legacy-app-header" ref={titleRef} tabIndex={-1}>
        <div style={{ fontSize: 22, fontWeight: 600 }}>
          Simulador de Meta Patrimonial
        </div>
      </header>

      {notice && <div role="status">{notice}</div>}
      {dados.length === 0 && (
        <div role="alert">
          Os parâmetros ultrapassam os limites da simulação. Reduza os valores,
          taxas ou prazo.
        </div>
      )}
      <div className="legacy-app-layout">
        <Section title="Parâmetros">
          <div className="legacy-parameter-fields">
            <NumberField
              label="Montante inicial"
              value={montanteInicial}
              onChange={setMontanteInicial}
              prefix="R$"
              step={100}
              min={0}
              max={MAX_MONEY}
            />
            <NumberField
              label="Aporte mensal (base)"
              value={aporteMensal}
              onChange={setAporteMensal}
              prefix="R$"
              step={50}
              min={0}
              max={MAX_MONEY}
            />

            <div className="legacy-field-group">
              <label
                htmlFor="legacy-policy"
                style={{ fontSize: 13, color: "#475569" }}
              >
                Reajuste do aporte
              </label>
              <select
                id="legacy-policy"
                className="legacy-field-select"
                value={tipoAporte}
                onChange={(e) =>
                  setTipoAporte(e.target.value as PoliticaAporte["tipo"])
                }
                style={{
                  padding: 8,
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  width: "100%",
                }}
              >
                <option value="constante">Sem reajuste (constante)</option>
                <option value="mensal_pct">
                  Crescimento mensal (% ao mês)
                </option>
                <option value="anual_pct">
                  Reajuste anual (% ao ano, meses 12/24/...)
                </option>
                <option value="anual_inflacao">
                  Reajuste anual pela inflação (12/24/...)
                </option>
                <option value="anual_real">
                  Reajuste anual: inflação + extra real (12/24/...)
                </option>
              </select>
            </div>

            {tipoAporte === "mensal_pct" && (
              <NumberField
                label="Crescimento mensal"
                value={mensalPct}
                onChange={setMensalPct}
                step={0.001}
                min={MIN_RATE}
                max={MAX_RATE}
                suffix="(decimal, ex.: 0,01)"
              />
            )}
            {tipoAporte === "anual_pct" && (
              <NumberField
                label="Reajuste anual"
                value={anualPct}
                onChange={setAnualPct}
                step={0.005}
                min={MIN_RATE}
                max={MAX_RATE}
                suffix="(decimal, ex.: 0,10)"
              />
            )}
            {tipoAporte === "anual_real" && (
              <NumberField
                label="Extra real anual"
                value={realExtra}
                onChange={setRealExtra}
                step={0.005}
                min={MIN_RATE}
                max={MAX_RATE}
                suffix="(decimal, ex.: 0,02)"
              />
            )}

            <NumberField
              label="Rentabilidade anual"
              value={rentabAnual}
              onChange={setRentabAnual}
              step={0.005}
              min={MIN_RATE}
              max={MAX_RATE}
              suffix="(decimal, ex.: 0,12)"
            />
            <NumberField
              label="Meta de patrimônio"
              value={meta}
              onChange={setMeta}
              step={1000}
              min={0}
              max={MAX_MONEY}
              prefix="R$"
            />

            <div className="legacy-field-group legacy-range-field">
              <label style={{ fontSize: 13, color: "#475569" }}>
                Limite de anos para simulação: {anosLimite}
              </label>
              <input
                aria-label="Limite de anos para simulação"
                type="range"
                min={1}
                max={80}
                step={1}
                value={anosLimite}
                onChange={(e) =>
                  setAnosLimite(
                    safeWholeNumber(e.target.value, anosLimite, 1, 80),
                  )
                }
              />
            </div>

            <Row
              className="legacy-toggle-row"
              style={{ justifyContent: "space-between" }}
            >
              <label style={{ fontSize: 13, color: "#475569" }}>
                Contribuição no início do mês
              </label>
              <input
                aria-label="Contribuição no início do mês"
                type="checkbox"
                checked={contribuicaoNoInicio}
                onChange={(e) => setContribuicaoNoInicio(e.target.checked)}
              />
            </Row>

            <Row
              className="legacy-toggle-row"
              style={{ justifyContent: "space-between" }}
            >
              <label
                title="Usa (1+nominal)/(1+inflação_do_mês)-1 para cada mês"
                style={{ fontSize: 13, color: "#475569" }}
              >
                Usar taxa real (ajustada pela inflação)
              </label>
              <input
                aria-label="Usar taxa real (ajustada pela inflação)"
                type="checkbox"
                checked={usarTaxaReal}
                onChange={(e) => setUsarTaxaReal(e.target.checked)}
              />
            </Row>

            <NumberField
              label="Inflação anual (padrão)"
              value={inflacaoAnual}
              onChange={setInflacaoAnual}
              step={0.005}
              min={MIN_RATE}
              max={MAX_RATE}
              suffix="(decimal, ex.: 0,04)"
            />

            <Row
              className="legacy-toggle-row"
              style={{ justifyContent: "space-between" }}
            >
              <label style={{ fontSize: 13, color: "#475569" }}>
                Usar tabela de inflação anual
              </label>
              <input
                aria-label="Usar tabela de inflação anual"
                type="checkbox"
                checked={usaTabelaInflacao}
                onChange={(e) => setUsaTabelaInflacao(e.target.checked)}
              />
            </Row>
            {usaTabelaInflacao && (
              <div className="legacy-field-group legacy-inflation-table-field">
                <label style={{ fontSize: 13, color: "#475569" }}>
                  Valores anuais (decimais) separados por vírgula/linha
                </label>
                <textarea
                  className="legacy-inflation-table-input"
                  value={inflacaoTabelaStr}
                  onChange={(e) => setInflacaoTabelaStr(e.target.value)}
                  placeholder="Ex.: 0,04, 0,05, 0,035, 0,04"
                  aria-label="Valores anuais de inflação"
                  style={{
                    minHeight: 90,
                    padding: 8,
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                  }}
                />
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Ao acabar a lista, repete o último valor para os anos
                  seguintes.
                </div>
              </div>
            )}

            <div className="legacy-action-row">
              <button
                onClick={salvarConfig}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                }}
              >
                Salvar parâmetros
              </button>
              <button
                onClick={limparConfig}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                }}
              >
                Limpar salvos
              </button>
            </div>
          </div>
        </Section>

        <div className="legacy-content-stack">
          <Section title="Resumo da simulação">
            <div className="legacy-summary-grid">
              <div>
                <div style={{ fontSize: 13, color: "#475569" }}>
                  Tempo até alcançar a meta
                </div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {mesesAteMetaTexto}
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Limite analisado: {anosLimite}{" "}
                  {anosLimite === 1 ? "ano" : "anos"}.
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#475569" }}>
                  Saldo final no limite
                </div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {fmtBRL(dados[dados.length - 1]?.saldo ?? 0)}
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Inclui ganhos e contribuições.
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#475569" }}>
                  Contribuições acumuladas
                </div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {fmtBRL(dados[dados.length - 1]?.contribuicoesAcum ?? 0)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#475569" }}>
                  Ganhos acumulados
                </div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {fmtBRL(dados[dados.length - 1]?.ganhosAcum ?? 0)}
                </div>
              </div>
            </div>
            <div className="legacy-chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={dados}
                  margin={{ left: 12, right: 24, bottom: 12 }}
                >
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.6} />
                      <stop
                        offset="95%"
                        stopColor="#2563eb"
                        stopOpacity={0.05}
                      />
                    </linearGradient>
                    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                      <stop
                        offset="95%"
                        stopColor="#10b981"
                        stopOpacity={0.05}
                      />
                    </linearGradient>
                    <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.6} />
                      <stop
                        offset="95%"
                        stopColor="#f59e0b"
                        stopOpacity={0.05}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="mes"
                    tickFormatter={(m) => `${Math.floor(m / 12)}a ${m % 12}m`}
                  />
                  <YAxis
                    tickFormatter={(v) => fmtBRL(v).replace("R$\u00a0", "R$ ")}
                    width={95}
                  />
                  <ChartTooltip
                    formatter={(v: any, name: any, p: any) => {
                      const ponto = p?.payload as any;
                      const extra =
                        ponto?.aporte !== undefined
                          ? `\nAporte do mês: ${fmtBRL(ponto.aporte)}`
                          : "";
                      return [`${fmtBRL(v as number)}${extra}`, name];
                    }}
                    labelFormatter={(m: any) =>
                      `Mês ${m} (${mesesParaAnosMeses(m)})`
                    }
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="saldo"
                    name="Saldo"
                    stroke="#2563eb"
                    fill="url(#g1)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="contribuicoesAcum"
                    name="Contribuições acumuladas"
                    stroke="#10b981"
                    fill="url(#g2)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="ganhosAcum"
                    name="Ganhos acumulados"
                    stroke="#f59e0b"
                    fill="url(#g3)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div
              className="legacy-simulation-note"
              style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}
            >
              {usarTaxaReal ? (
                <>
                  Simulação em termos reais: inflação mensal média ≈{" "}
                  {fmtPct(taxaMensalInflacaoMedia)}; nominal mensal ≈{" "}
                  {fmtPct(taxaMensalNominalConst)}.
                </>
              ) : (
                <>
                  Simulação em termos nominais: taxa mensal nominal ≈{" "}
                  {fmtPct(taxaMensalNominalConst)}.
                </>
              )}
            </div>
          </Section>

          <nav className="legacy-tab-list" aria-label="Seções da simulação">
            {(["planejar", "sensibilidade", "dados", "testes"] as const).map(
              (t) => (
                <button
                  key={t}
                  className="legacy-tab-button"
                  onClick={() => setTab(t)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #cbd5e1",
                    background: tab === t ? "#e2e8f0" : "#f8fafc",
                  }}
                >
                  {t}
                </button>
              ),
            )}
          </nav>

          {tab === "planejar" && (
            <Section title="Planejar por prazo">
              <div className="legacy-planning-grid">
                <div className="legacy-planning-field">
                  <label style={{ fontSize: 13, color: "#475569" }}>
                    Prazo desejado (anos)
                  </label>
                  <input
                    aria-label="Prazo desejado em anos"
                    className="legacy-range-input"
                    type="range"
                    min={1}
                    max={60}
                    step={1}
                    value={prazoDesejado}
                    onChange={(e) =>
                      setPrazoDesejado(
                        safeWholeNumber(e.target.value, prazoDesejado, 1, 60),
                      )
                    }
                  />
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {prazoDesejado} {prazoDesejado === 1 ? "ano" : "anos"}
                  </div>
                </div>
                <div className="legacy-planning-result">
                  <div style={{ fontSize: 13, color: "#475569" }}>
                    Aporte mensal necessário (base)
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>
                    {aporteParaPrazo === null ? "—" : fmtBRL(aporteParaPrazo)}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    Respeita a política de reajuste e a tabela de inflação (se
                    ativa).
                  </div>
                </div>
                <div className="legacy-planning-result">
                  <div style={{ fontSize: 13, color: "#475569" }}>
                    Taxa anual necessária
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>
                    {taxaParaPrazo === null ? "—" : fmtPct(taxaParaPrazo)}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    Mantendo a política de aportes selecionada.
                  </div>
                </div>
              </div>
            </Section>
          )}

          {tab === "sensibilidade" && (
            <Section title="Análise de sensibilidade (tempo até a meta)">
              <div
                className="legacy-section-hint"
                style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}
              >
                Linhas: variação do aporte mensal base (−20% a +20%). Colunas:
                variação da rentabilidade anual (−2 a +2 p.p.).
              </div>
              <div className="legacy-table-scroll">
                <table
                  className="legacy-data-table"
                  style={{ borderCollapse: "collapse", width: "100%" }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          border: "1px solid #e2e8f0",
                          padding: 6,
                          textAlign: "left",
                        }}
                      >
                        Aporte mensal base
                      </th>
                      {[-0.02, -0.01, 0, 0.01, 0.02].map((vr) => (
                        <th
                          key={vr}
                          style={{
                            border: "1px solid #e2e8f0",
                            padding: 6,
                            textAlign: "center",
                          }}
                        >
                          {(
                            Math.min(
                              10,
                              Math.max(-0.999999, rentabAnual + vr),
                            ) * 100
                          ).toFixed(2)}
                          % a.a.
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sensibilidades.map((linha, i) => (
                      <tr key={i}>
                        <td style={{ border: "1px solid #e2e8f0", padding: 6 }}>
                          {fmtBRL(
                            Math.min(
                              MAX_MONEY,
                              aporteMensal * (1 + [-0.2, -0.1, 0, 0.1, 0.2][i]),
                            ),
                          )}
                        </td>
                        {linha.map((cel, j) => (
                          <td
                            key={j}
                            style={{
                              border: "1px solid #e2e8f0",
                              padding: 6,
                              textAlign: "center",
                            }}
                          >
                            {cel.meses === null
                              ? naoAtingida
                              : mesesParaAnosMeses(cel.meses)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {tab === "dados" && (
            <Section title="Dados e exportação">
              <div className="legacy-action-row" style={{ marginBottom: 8 }}>
                <button
                  disabled={dados.length === 0}
                  onClick={exportarCSV}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                  }}
                >
                  Exportar CSV
                </button>
              </div>
              <div
                className="legacy-table-scroll legacy-data-table-scroll"
                style={{
                  maxHeight: 300,
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                }}
              >
                <table
                  className="legacy-data-table"
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 13,
                  }}
                >
                  <thead
                    style={{ position: "sticky", top: 0, background: "#fff" }}
                  >
                    <tr>
                      <th
                        style={{
                          border: "1px solid #e2e8f0",
                          padding: 6,
                          textAlign: "left",
                        }}
                      >
                        Mês
                      </th>
                      <th
                        style={{
                          border: "1px solid #e2e8f0",
                          padding: 6,
                          textAlign: "left",
                        }}
                      >
                        Aporte do mês
                      </th>
                      <th
                        style={{
                          border: "1px solid #e2e8f0",
                          padding: 6,
                          textAlign: "left",
                        }}
                      >
                        Saldo
                      </th>
                      <th
                        style={{
                          border: "1px solid #e2e8f0",
                          padding: 6,
                          textAlign: "left",
                        }}
                      >
                        Contribuições acumuladas
                      </th>
                      <th
                        style={{
                          border: "1px solid #e2e8f0",
                          padding: 6,
                          textAlign: "left",
                        }}
                      >
                        Ganhos acumulados
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.map((d) => (
                      <tr key={d.mes}>
                        <td style={{ border: "1px solid #e2e8f0", padding: 6 }}>
                          {d.mes} ({mesesParaAnosMeses(d.mes)})
                        </td>
                        <td style={{ border: "1px solid #e2e8f0", padding: 6 }}>
                          {fmtBRL(d.aporte)}
                        </td>
                        <td style={{ border: "1px solid #e2e8f0", padding: 6 }}>
                          {fmtBRL(d.saldo)}
                        </td>
                        <td style={{ border: "1px solid #e2e8f0", padding: 6 }}>
                          {fmtBRL(d.contribuicoesAcum)}
                        </td>
                        <td style={{ border: "1px solid #e2e8f0", padding: 6 }}>
                          {fmtBRL(d.ganhosAcum)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {tab === "testes" && (
            <Section title="Testes automatizados (embutidos)">
              <div className="legacy-action-row" style={{ marginBottom: 8 }}>
                <button
                  onClick={() => setTesteResultados(rodarTestes())}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                  }}
                >
                  Reexecutar testes
                </button>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {(testeResultados ?? []).map((t) => (
                  <div
                    key={t.nome}
                    className="legacy-test-result"
                    style={{ background: t.passou ? "#dcfce7" : "#fee2e2" }}
                  >
                    <div
                      className="legacy-test-name"
                      style={{ fontSize: 13, fontWeight: 600 }}
                    >
                      {t.nome}
                    </div>
                    <div
                      className="legacy-test-detail"
                      style={{ fontSize: 12 }}
                    >
                      {t.passou ? "✅" : "❌"} {t.detalhe ?? ""}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
