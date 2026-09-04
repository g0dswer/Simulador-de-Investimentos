import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
  Legend,
  AreaChart,
  Area
} from "recharts";
import {
  PoliticaAporte,
  aporteNecessario,
  calcularProjecao,
  fmtBRL,
  fmtPct,
  mesesParaAnosMeses,
  parseInflacaoTabela,
  taxaNecessaria
} from "./lib/calculos";
import { rodarTestes, TestRes } from "./lib/testCases";

const MIN_RATE = -0.999999;
const MAX_RATE = 10;
const MAX_MONEY = 1_000_000_000_000;
const TIPOS_APORTE: readonly PoliticaAporte["tipo"][] = [
  "constante",
  "mensal_pct",
  "anual_pct",
  "anual_inflacao",
  "anual_real"
];

function clampFinite(value: unknown, fallback: number, min: number, max: number) {
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

function safeWholeNumber(value: unknown, fallback: number, min: number, max: number) {
  return Math.round(clampFinite(value, fallback, min, max));
}

function safeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function isTipoAporte(value: unknown): value is PoliticaAporte["tipo"] {
  return typeof value === "string" && TIPOS_APORTE.includes(value as PoliticaAporte["tipo"]);
}

function Row({ children, style = {} as React.CSSProperties, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div className={className} style={{ display: "flex", gap: 12, alignItems: "center", ...style }}>{children}</div>
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

function NumberField({ label, value, onChange, step = 1, prefix, suffix, min, max }: NumberFieldProps) {
  const inputId = `number-field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const lowerBound = min ?? Number.NEGATIVE_INFINITY;
  const upperBound = max ?? Number.POSITIVE_INFINITY;

  return (
    <div className="number-field">
      <label htmlFor={inputId} style={{ fontSize: 13, color: "#475569" }}>{label}</label>
      <Row className="number-field-control">
        {prefix && <span className="number-field-prefix" style={{ color: "#64748b" }}>{prefix}</span>}
        <input
          id={inputId}
          className="number-input"
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
        {suffix && <span className="number-field-suffix" style={{ color: "#64748b" }}>{suffix}</span>}
      </Row>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section-card">
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {children}
    </section>
  );
}

export default function App() {
  const [montanteInicial, setMontanteInicial] = useState(10000);
  const [aporteMensal, setAporteMensal] = useState(1000);
  const [rentabAnual, setRentabAnual] = useState(0.12);
  const [meta, setMeta] = useState(1_000_000);
  const [anosLimite, setAnosLimite] = useState(50);
  const [contribuicaoNoInicio, setContribuicaoNoInicio] = useState(true);
  const [usarTaxaReal, setUsarTaxaReal] = useState(false);
  const [inflacaoAnual, setInflacaoAnual] = useState(0.04);
  const [prazoDesejado, setPrazoDesejado] = useState(15);

  const [usaTabelaInflacao, setUsaTabelaInflacao] = useState(false);
  const [inflacaoTabelaStr, setInflacaoTabelaStr] = useState("");
  const inflacaoTabela = useMemo(
    () => parseInflacaoTabela(inflacaoTabelaStr).filter((value) => value > MIN_RATE && value <= MAX_RATE),
    [inflacaoTabelaStr]
  );

  const [tipoAporte, setTipoAporte] = useState<PoliticaAporte["tipo"]>("constante");
  const [mensalPct, setMensalPct] = useState(0.0);
  const [anualPct, setAnualPct] = useState(0.1);
  const [realExtra, setRealExtra] = useState(0.02);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const salvo = window.localStorage.getItem("simulador_meta_config_v2");
    if (salvo) {
      try {
        const cfg = JSON.parse(salvo);
        setMontanteInicial(safeMoney(cfg.montanteInicial, 10000));
        setAporteMensal(safeMoney(cfg.aporteMensal, 1000));
        setRentabAnual(safeRate(cfg.rentabAnual, 0.12));
        setMeta(safeMoney(cfg.meta, 1_000_000));
        setAnosLimite(safeWholeNumber(cfg.anosLimite, 50, 1, 80));
        setContribuicaoNoInicio(safeBoolean(cfg.contribuicaoNoInicio, true));
        setUsarTaxaReal(safeBoolean(cfg.usarTaxaReal, false));
        setInflacaoAnual(safeRate(cfg.inflacaoAnual, 0.04));
        setPrazoDesejado(safeWholeNumber(cfg.prazoDesejado, 15, 1, 60));
        if (isTipoAporte(cfg.tipoAporte)) setTipoAporte(cfg.tipoAporte);
        if (cfg.mensalPct !== undefined) setMensalPct(safeRate(cfg.mensalPct, 0));
        if (cfg.anualPct !== undefined) setAnualPct(safeRate(cfg.anualPct, 0.1));
        if (cfg.realExtra !== undefined) setRealExtra(safeRate(cfg.realExtra, 0.02));
        setUsaTabelaInflacao(safeBoolean(cfg.usaTabelaInflacao, false));
        if (typeof cfg.inflacaoTabelaStr === "string") setInflacaoTabelaStr(cfg.inflacaoTabelaStr);
      } catch (error) {
        console.error("Falha ao carregar configuração salva", error);
      }
    }
  }, []);

  const salvarConfig = () => {
    if (typeof window === "undefined") return;
    const cfg = {
      montanteInicial,
      aporteMensal,
      rentabAnual,
      meta,
      anosLimite,
      contribuicaoNoInicio,
      usarTaxaReal,
      inflacaoAnual,
      prazoDesejado,
      tipoAporte,
      mensalPct,
      anualPct,
      realExtra,
      usaTabelaInflacao,
      inflacaoTabelaStr
    };
    window.localStorage.setItem("simulador_meta_config_v2", JSON.stringify(cfg));
  };

  const limparConfig = () => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem("simulador_meta_config_v2");
  };

  const inflTabelaOpt = usaTabelaInflacao ? inflacaoTabela : undefined;

  const { dados, mesAlvo, taxaMensalNominalConst, taxaMensalInflacaoMedia } = useMemo(
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
        politicaAporte
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
      politicaAporte
    ]
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
        politicaAporte
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
      politicaAporte
    ]
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
        politicaAporte
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
      politicaAporte
    ]
  );

  const sensibilidades = useMemo(() => {
    const variacoesRent = [-0.02, -0.01, 0, 0.01, 0.02];
    const variacoesAporte = [-0.2, -0.1, 0, 0.1, 0.2];
    return variacoesAporte.map((va) =>
      variacoesRent.map((vr) => {
        const r = Math.max(-0.99, rentabAnual + vr);
        const a = Math.max(0, aporteMensal * (1 + va));
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
          politicaAporte
        });
        return { va, vr, meses: ma };
      })
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
    politicaAporte
  ]);

  const exportarCSV = () => {
    if (typeof window === "undefined") return;
    const linhas = [
      ["mes", "aporte_mes", "saldo", "contribuicoes_acumuladas", "ganhos_acumulados"],
      ...dados.map((d) => [d.mes, d.aporte, d.saldo, d.contribuicoesAcum, d.ganhosAcum])
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
  const mesesAteMetaTexto = mesAlvo !== null ? mesesParaAnosMeses(mesAlvo) : naoAtingida;

  const [testeResultados, setTesteResultados] = useState<TestRes[] | null>(null);
  useEffect(() => {
    setTesteResultados(rodarTestes());
  }, []);

  const [tab, setTab] = useState<"planejar" | "sensibilidade" | "dados" | "testes">("planejar");

  return (
    <div className="app-shell">
      <header className="app-header">
        <div style={{ fontSize: 22, fontWeight: 600 }}>Simulador de Meta Patrimonial</div>
      </header>

      <div className="app-layout">
        <Section title="Parâmetros">
          <div className="parameter-fields">
            <NumberField label="Montante inicial" value={montanteInicial} onChange={setMontanteInicial} prefix="R$" step={100} min={0} max={MAX_MONEY} />
            <NumberField label="Aporte mensal (base)" value={aporteMensal} onChange={setAporteMensal} prefix="R$" step={50} min={0} max={MAX_MONEY} />

            <div className="field-group">
              <label style={{ fontSize: 13, color: "#475569" }}>Reajuste do aporte</label>
              <select
                className="field-select"
                value={tipoAporte}
                onChange={(e) => setTipoAporte(e.target.value as PoliticaAporte["tipo"])}
                style={{ padding: 8, borderRadius: 8, border: "1px solid #e2e8f0", width: "100%" }}
              >
                <option value="constante">Sem reajuste (constante)</option>
                <option value="mensal_pct">Crescimento mensal (% ao mês)</option>
                <option value="anual_pct">Reajuste anual (% ao ano, meses 12/24/...)</option>
                <option value="anual_inflacao">Reajuste anual pela inflação (12/24/...)</option>
                <option value="anual_real">Reajuste anual: inflação + extra real (12/24/...)</option>
              </select>
            </div>

            {tipoAporte === "mensal_pct" && (
              <NumberField label="Crescimento mensal" value={mensalPct} onChange={setMensalPct} step={0.001} min={MIN_RATE} max={MAX_RATE} suffix="(decimal, ex.: 0,01)" />
            )}
            {tipoAporte === "anual_pct" && (
              <NumberField label="Reajuste anual" value={anualPct} onChange={setAnualPct} step={0.005} min={MIN_RATE} max={MAX_RATE} suffix="(decimal, ex.: 0,10)" />
            )}
            {tipoAporte === "anual_real" && (
              <NumberField label="Extra real anual" value={realExtra} onChange={setRealExtra} step={0.005} min={MIN_RATE} max={MAX_RATE} suffix="(decimal, ex.: 0,02)" />
            )}

            <NumberField label="Rentabilidade anual" value={rentabAnual} onChange={setRentabAnual} step={0.005} min={MIN_RATE} max={MAX_RATE} suffix="(decimal, ex.: 0,12)" />
            <NumberField label="Meta de patrimônio" value={meta} onChange={setMeta} step={1000} min={0} max={MAX_MONEY} prefix="R$" />

            <div className="field-group range-field">
              <label style={{ fontSize: 13, color: "#475569" }}>Limite de anos para simulação: {anosLimite}</label>
              <input aria-label="Limite de anos para simulação" type="range" min={1} max={80} step={1} value={anosLimite} onChange={(e) => setAnosLimite(safeWholeNumber(e.target.value, anosLimite, 1, 80))} />
            </div>

            <Row className="toggle-row" style={{ justifyContent: "space-between" }}>
              <label style={{ fontSize: 13, color: "#475569" }}>Contribuição no início do mês</label>
              <input type="checkbox" checked={contribuicaoNoInicio} onChange={(e) => setContribuicaoNoInicio(e.target.checked)} />
            </Row>

            <Row className="toggle-row" style={{ justifyContent: "space-between" }}>
              <label
                title="Usa (1+nominal)/(1+inflação_do_mês)-1 para cada mês"
                style={{ fontSize: 13, color: "#475569" }}
              >
                Usar taxa real (ajustada pela inflação)
              </label>
              <input type="checkbox" checked={usarTaxaReal} onChange={(e) => setUsarTaxaReal(e.target.checked)} />
            </Row>

            <NumberField label="Inflação anual (padrão)" value={inflacaoAnual} onChange={setInflacaoAnual} step={0.005} min={MIN_RATE} max={MAX_RATE} suffix="(decimal, ex.: 0,04)" />

            <Row className="toggle-row" style={{ justifyContent: "space-between" }}>
              <label style={{ fontSize: 13, color: "#475569" }}>Usar tabela de inflação anual</label>
              <input type="checkbox" checked={usaTabelaInflacao} onChange={(e) => setUsaTabelaInflacao(e.target.checked)} />
            </Row>
            {usaTabelaInflacao && (
              <div className="field-group inflation-table-field">
                <label style={{ fontSize: 13, color: "#475569" }}>Valores anuais (decimais) separados por vírgula/linha</label>
                <textarea
                  className="inflation-table-input"
                  value={inflacaoTabelaStr}
                  onChange={(e) => setInflacaoTabelaStr(e.target.value)}
                  placeholder="Ex.: 0,04, 0,05, 0,035, 0,04"
                  aria-label="Valores anuais de inflação"
                  style={{ minHeight: 90, padding: 8, borderRadius: 8, border: "1px solid #e2e8f0" }}
                />
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Ao acabar a lista, repete o último valor para os anos seguintes.
                </div>
              </div>
            )}

            <div className="action-row">
              <button onClick={salvarConfig} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc" }}>
                Salvar parâmetros
              </button>
              <button onClick={limparConfig} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc" }}>
                Limpar salvos
              </button>
            </div>
          </div>
        </Section>

        <div className="content-stack">
          <Section title="Resumo da simulação">
            <div className="summary-grid">
              <div>
                <div style={{ fontSize: 13, color: "#475569" }}>Tempo até alcançar a meta</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{mesesAteMetaTexto}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Limite analisado: {anosLimite} {anosLimite === 1 ? "ano" : "anos"}.
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#475569" }}>Saldo final no limite</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtBRL(dados[dados.length - 1]?.saldo ?? 0)}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>Inclui ganhos e contribuições.</div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#475569" }}>Contribuições acumuladas</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtBRL(dados[dados.length - 1]?.contribuicoesAcum ?? 0)}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#475569" }}>Ganhos acumulados</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtBRL(dados[dados.length - 1]?.ganhosAcum ?? 0)}</div>
              </div>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dados} margin={{ left: 12, right: 24, bottom: 12 }}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tickFormatter={(m) => `${Math.floor(m / 12)}a ${m % 12}m`} />
                  <YAxis tickFormatter={(v) => fmtBRL(v).replace("R$\u00a0", "R$ ")} width={95} />
                  <ChartTooltip
                    formatter={(v: any, name: any, p: any) => {
                      const ponto = p?.payload as any;
                      const extra = ponto?.aporte !== undefined ? `\nAporte do mês: ${fmtBRL(ponto.aporte)}` : "";
                      return [`${fmtBRL(v as number)}${extra}`, name];
                    }}
                    labelFormatter={(m: any) => `Mês ${m} (${mesesParaAnosMeses(m)})`}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="saldo" name="Saldo" stroke="#2563eb" fill="url(#g1)" strokeWidth={2} />
                  <Area
                    type="monotone"
                    dataKey="contribuicoesAcum"
                    name="Contribuições acumuladas"
                    stroke="#10b981"
                    fill="url(#g2)"
                    strokeWidth={2}
                  />
                  <Area type="monotone" dataKey="ganhosAcum" name="Ganhos acumulados" stroke="#f59e0b" fill="url(#g3)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="simulation-note" style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
              {usarTaxaReal ? (
                <>Simulação em termos reais: inflação mensal média ≈ {fmtPct(taxaMensalInflacaoMedia)}; nominal mensal ≈ {fmtPct(taxaMensalNominalConst)}.</>
              ) : (
                <>Simulação em termos nominais: taxa mensal nominal ≈ {fmtPct(taxaMensalNominalConst)}.</>
              )}
            </div>
          </Section>

          <nav className="tab-list" aria-label="Seções da simulação">
            {(["planejar", "sensibilidade", "dados", "testes"] as const).map((t) => (
              <button
                key={t}
                className="tab-button"
                onClick={() => setTab(t)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: tab === t ? "#e2e8f0" : "#f8fafc"
                }}
              >
                {t}
              </button>
            ))}
          </nav>

          {tab === "planejar" && (
            <Section title="Planejar por prazo">
              <div className="planning-grid">
                <div className="planning-field">
                  <label style={{ fontSize: 13, color: "#475569" }}>Prazo desejado (anos)</label>
                  <input
                    aria-label="Prazo desejado em anos"
                    className="range-input"
                    type="range"
                    min={1}
                    max={60}
                    step={1}
                    value={prazoDesejado}
                    onChange={(e) => setPrazoDesejado(safeWholeNumber(e.target.value, prazoDesejado, 1, 60))}
                  />
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {prazoDesejado} {prazoDesejado === 1 ? "ano" : "anos"}
                  </div>
                </div>
                <div className="planning-result">
                  <div style={{ fontSize: 13, color: "#475569" }}>Aporte mensal necessário (base)</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{aporteParaPrazo === null ? "—" : fmtBRL(aporteParaPrazo)}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    Respeita a política de reajuste e a tabela de inflação (se ativa).
                  </div>
                </div>
                <div className="planning-result">
                  <div style={{ fontSize: 13, color: "#475569" }}>Taxa anual necessária</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{taxaParaPrazo === null ? "—" : fmtPct(taxaParaPrazo)}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Mantendo a política de aportes selecionada.</div>
                </div>
              </div>
            </Section>
          )}

          {tab === "sensibilidade" && (
            <Section title="Análise de sensibilidade (tempo até a meta)">
              <div className="section-hint" style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                Linhas: variação do aporte mensal base (−20% a +20%). Colunas: variação da rentabilidade anual (−2 a +2 p.p.).
              </div>
              <div className="table-scroll">
                <table className="data-table" style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ border: "1px solid #e2e8f0", padding: 6, textAlign: "left" }}>Aporte mensal base</th>
                      {[-0.02, -0.01, 0, 0.01, 0.02].map((vr) => (
                        <th key={vr} style={{ border: "1px solid #e2e8f0", padding: 6, textAlign: "center" }}>{((rentabAnual + vr) * 100).toFixed(2)}% a.a.</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sensibilidades.map((linha, i) => (
                      <tr key={i}>
                        <td style={{ border: "1px solid #e2e8f0", padding: 6 }}>{fmtBRL(aporteMensal * (1 + [-0.2, -0.1, 0, 0.1, 0.2][i]))}</td>
                        {linha.map((cel, j) => (
                          <td key={j} style={{ border: "1px solid #e2e8f0", padding: 6, textAlign: "center" }}>
                            {cel.meses === null ? naoAtingida : mesesParaAnosMeses(cel.meses)}
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
              <div className="action-row" style={{ marginBottom: 8 }}>
                <button onClick={exportarCSV} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc" }}>
                  Exportar CSV
                </button>
              </div>
              <div className="table-scroll data-table-scroll" style={{ maxHeight: 300, border: "1px solid #e2e8f0", borderRadius: 8 }}>
                <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead style={{ position: "sticky", top: 0, background: "#fff" }}>
                    <tr>
                      <th style={{ border: "1px solid #e2e8f0", padding: 6, textAlign: "left" }}>Mês</th>
                      <th style={{ border: "1px solid #e2e8f0", padding: 6, textAlign: "left" }}>Aporte do mês</th>
                      <th style={{ border: "1px solid #e2e8f0", padding: 6, textAlign: "left" }}>Saldo</th>
                      <th style={{ border: "1px solid #e2e8f0", padding: 6, textAlign: "left" }}>Contribuições acumuladas</th>
                      <th style={{ border: "1px solid #e2e8f0", padding: 6, textAlign: "left" }}>Ganhos acumulados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.map((d) => (
                      <tr key={d.mes}>
                        <td style={{ border: "1px solid #e2e8f0", padding: 6 }}>{d.mes} ({mesesParaAnosMeses(d.mes)})</td>
                        <td style={{ border: "1px solid #e2e8f0", padding: 6 }}>{fmtBRL(d.aporte)}</td>
                        <td style={{ border: "1px solid #e2e8f0", padding: 6 }}>{fmtBRL(d.saldo)}</td>
                        <td style={{ border: "1px solid #e2e8f0", padding: 6 }}>{fmtBRL(d.contribuicoesAcum)}</td>
                        <td style={{ border: "1px solid #e2e8f0", padding: 6 }}>{fmtBRL(d.ganhosAcum)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {tab === "testes" && (
            <Section title="Testes automatizados (embutidos)">
              <div className="action-row" style={{ marginBottom: 8 }}>
                <button onClick={() => setTesteResultados(rodarTestes())} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc" }}>
                  Reexecutar testes
                </button>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {(testeResultados ?? []).map((t) => (
                  <div
                    key={t.nome}
                    className="test-result"
                    style={{ background: t.passou ? "#dcfce7" : "#fee2e2" }}
                  >
                    <div className="test-name" style={{ fontSize: 13, fontWeight: 600 }}>{t.nome}</div>
                    <div className="test-detail" style={{ fontSize: 12 }}>
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
