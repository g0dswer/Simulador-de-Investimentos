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

function Row({ children, style = {} as React.CSSProperties }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", ...style }}>{children}</div>
  );
}

type NumberFieldProps = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  prefix?: string;
  suffix?: string;
};

function NumberField({ label, value, onChange, step = 1, prefix, suffix }: NumberFieldProps) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ fontSize: 13, color: "#475569" }}>{label}</label>
      <Row>
        {prefix && <span style={{ color: "#64748b" }}>{prefix}</span>}
        <input
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const next = Number(e.target.value);
            onChange(Number.isFinite(next) ? next : 0);
          }}
          style={{ padding: 8, borderRadius: 8, border: "1px solid #e2e8f0", width: 180 }}
        />
        {suffix && <span style={{ color: "#64748b" }}>{suffix}</span>}
      </Row>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
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
  const inflacaoTabela = useMemo(() => parseInflacaoTabela(inflacaoTabelaStr), [inflacaoTabelaStr]);

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
        setMontanteInicial(cfg.montanteInicial ?? 10000);
        setAporteMensal(cfg.aporteMensal ?? 1000);
        setRentabAnual(cfg.rentabAnual ?? 0.12);
        setMeta(cfg.meta ?? 1_000_000);
        setAnosLimite(cfg.anosLimite ?? 50);
        setContribuicaoNoInicio(cfg.contribuicaoNoInicio ?? true);
        setUsarTaxaReal(cfg.usarTaxaReal ?? false);
        setInflacaoAnual(cfg.inflacaoAnual ?? 0.04);
        setPrazoDesejado(cfg.prazoDesejado ?? 15);
        if (cfg.tipoAporte) setTipoAporte(cfg.tipoAporte);
        if (cfg.mensalPct !== undefined) setMensalPct(cfg.mensalPct);
        if (cfg.anualPct !== undefined) setAnualPct(cfg.anualPct);
        if (cfg.realExtra !== undefined) setRealExtra(cfg.realExtra);
        if (cfg.usaTabelaInflacao !== undefined) setUsaTabelaInflacao(cfg.usaTabelaInflacao);
        if (cfg.inflacaoTabelaStr !== undefined) setInflacaoTabelaStr(cfg.inflacaoTabelaStr);
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
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16, display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 600 }}>Simulador de Meta Patrimonial</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
        <Section title="Parâmetros">
          <div style={{ display: "grid", gap: 12 }}>
            <NumberField label="Montante inicial" value={montanteInicial} onChange={setMontanteInicial} prefix="R$" step={100} />
            <NumberField label="Aporte mensal (base)" value={aporteMensal} onChange={setAporteMensal} prefix="R$" step={50} />

            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 13, color: "#475569" }}>Reajuste do aporte</label>
              <select
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
              <NumberField label="Crescimento mensal" value={mensalPct} onChange={setMensalPct} step={0.001} suffix="(decimal, ex.: 0,01)" />
            )}
            {tipoAporte === "anual_pct" && (
              <NumberField label="Reajuste anual" value={anualPct} onChange={setAnualPct} step={0.005} suffix="(decimal, ex.: 0,10)" />
            )}
            {tipoAporte === "anual_real" && (
              <NumberField label="Extra real anual" value={realExtra} onChange={setRealExtra} step={0.005} suffix="(decimal, ex.: 0,02)" />
            )}

            <NumberField label="Rentabilidade anual" value={rentabAnual} onChange={setRentabAnual} step={0.005} suffix="(decimal, ex.: 0,12)" />
            <NumberField label="Meta de patrimônio" value={meta} onChange={setMeta} step={1000} prefix="R$" />

            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 13, color: "#475569" }}>Limite de anos para simulação: {anosLimite}</label>
              <input type="range" min={1} max={80} step={1} value={anosLimite} onChange={(e) => setAnosLimite(parseInt(e.target.value, 10))} />
            </div>

            <Row style={{ justifyContent: "space-between" }}>
              <label style={{ fontSize: 13, color: "#475569" }}>Contribuição no início do mês</label>
              <input type="checkbox" checked={contribuicaoNoInicio} onChange={(e) => setContribuicaoNoInicio(e.target.checked)} />
            </Row>

            <Row style={{ justifyContent: "space-between" }}>
              <label
                title="Usa (1+nominal)/(1+inflação_do_mês)-1 para cada mês"
                style={{ fontSize: 13, color: "#475569" }}
              >
                Usar taxa real (ajustada pela inflação)
              </label>
              <input type="checkbox" checked={usarTaxaReal} onChange={(e) => setUsarTaxaReal(e.target.checked)} />
            </Row>

            <NumberField label="Inflação anual (padrão)" value={inflacaoAnual} onChange={setInflacaoAnual} step={0.005} suffix="(decimal, ex.: 0,04)" />

            <Row style={{ justifyContent: "space-between" }}>
              <label style={{ fontSize: 13, color: "#475569" }}>Usar tabela de inflação anual</label>
              <input type="checkbox" checked={usaTabelaInflacao} onChange={(e) => setUsaTabelaInflacao(e.target.checked)} />
            </Row>
            {usaTabelaInflacao && (
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 13, color: "#475569" }}>Valores anuais (decimais) separados por vírgula/linha</label>
                <textarea
                  value={inflacaoTabelaStr}
                  onChange={(e) => setInflacaoTabelaStr(e.target.value)}
                  placeholder="Ex.: 0,04, 0,05, 0,035, 0,04"
                  style={{ minHeight: 90, padding: 8, borderRadius: 8, border: "1px solid #e2e8f0" }}
                />
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Ao acabar a lista, repete o último valor para os anos seguintes.
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={salvarConfig} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc" }}>
                Salvar parâmetros
              </button>
              <button onClick={limparConfig} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc" }}>
                Limpar salvos
              </button>
            </div>
          </div>
        </Section>

        <div style={{ display: "grid", gap: 16 }}>
          <Section title="Resumo da simulação">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
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
            <div style={{ height: 320 }}>
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
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
              {usarTaxaReal ? (
                <>Simulação em termos reais: inflação mensal média ≈ {fmtPct(taxaMensalInflacaoMedia)}; nominal mensal ≈ {fmtPct(taxaMensalNominalConst)}.</>
              ) : (
                <>Simulação em termos nominais: taxa mensal nominal ≈ {fmtPct(taxaMensalNominalConst)}.</>
              )}
            </div>
          </Section>

          <div style={{ display: "flex", gap: 8 }}>
            {(["planejar", "sensibilidade", "dados", "testes"] as const).map((t) => (
              <button
                key={t}
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
          </div>

          {tab === "planejar" && (
            <Section title="Planejar por prazo">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: "#475569" }}>Prazo desejado (anos)</label>
                  <input
                    type="range"
                    min={1}
                    max={60}
                    step={1}
                    value={prazoDesejado}
                    onChange={(e) => setPrazoDesejado(parseInt(e.target.value, 10))}
                    style={{ width: "100%" }}
                  />
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {prazoDesejado} {prazoDesejado === 1 ? "ano" : "anos"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "#475569" }}>Aporte mensal necessário (base)</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtBRL(aporteParaPrazo)}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    Respeita a política de reajuste e a tabela de inflação (se ativa).
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "#475569" }}>Taxa anual necessária</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{taxaParaPrazo === null ? "—" : fmtPct(taxaParaPrazo)}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Mantendo a política de aportes selecionada.</div>
                </div>
              </div>
            </Section>
          )}

          {tab === "sensibilidade" && (
            <Section title="Análise de sensibilidade (tempo até a meta)">
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                Linhas: variação do aporte mensal base (−20% a +20%). Colunas: variação da rentabilidade anual (−2 a +2 p.p.).
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
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
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button onClick={exportarCSV} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc" }}>
                  Exportar CSV
                </button>
              </div>
              <div style={{ maxHeight: 300, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
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
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button onClick={() => setTesteResultados(rodarTestes())} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc" }}>
                  Reexecutar testes
                </button>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {(testeResultados ?? []).map((t) => (
                  <div
                    key={t.nome}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      padding: "6px 10px",
                      background: t.passou ? "#dcfce7" : "#fee2e2"
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{t.nome}</div>
                    <div style={{ fontSize: 12 }}>
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
