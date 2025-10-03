import React, { useEffect, useMemo, useState } from "react";
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

/**
 * Versão "vanilla" compatível com o preview do ChatGPT (sem shadcn/ui, sem icons, sem framer-motion).
 * Mantém toda a lógica de aportes variáveis, inflação tabelada e testes.
 *
 * Deploy em GitHub Pages: este arquivo pode ser colado em src/App.tsx
 * de um template Vite React-TS padrão sem dependências extra.
 */

// ==========================
// Utilidades de formatação
// ==========================
const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtPct = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 2 }).format(v);

function mesesParaAnosMeses(totalMeses: number) {
  const anos = Math.floor(totalMeses / 12);
  const meses = totalMeses % 12;
  const partes: string[] = [];
  if (anos > 0) partes.push(`${anos} ${anos === 1 ? "ano" : "anos"}`);
  partes.push(`${meses} ${meses === 1 ? "mês" : "meses"}`);
  return partes.join(" e ");
}

// ==========================
// Tabela/agenda de inflação
// ==========================
function parseInflacaoTabela(str: string): number[] {
  // aceita "0.04, 0.05 0,035; 0.03" etc (decimais)
  return str
    .split(/[,;\n\t\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/%/g, "").replace(",", "."))
    .map((s) => Number(s))
    .filter((x) => Number.isFinite(x))
    .map((x) => Math.max(-0.99, x));
}

function inflacaoAnualDoAno(anoIndex: number, inflacaoPadrao: number, tabela?: number[]) {
  if (!tabela || tabela.length === 0) return inflacaoPadrao;
  if (anoIndex - 1 < tabela.length) return tabela[anoIndex - 1];
  return tabela[tabela.length - 1]; // extrapola com o último valor
}

function inflacaoMensalDoMes(mes: number, inflacaoPadrao: number, tabela?: number[]) {
  const ano = Math.ceil(mes / 12); // 1..12 => ano 1; 13..24 => ano 2
  const ia = inflacaoAnualDoAno(ano, inflacaoPadrao, tabela);
  return Math.pow(1 + ia, 1 / 12) - 1;
}

// ==========================
// Política de aporte variável
// ==========================
export type PoliticaAporte =
  | { tipo: "constante" }
  | { tipo: "mensal_pct"; mensalPct: number } // decimal, ex.: 0.01 = +1% ao mês
  | { tipo: "anual_pct"; anualPct: number } // decimal, ex.: 0.10 = +10% ao ano
  | { tipo: "anual_inflacao" }
  | { tipo: "anual_real"; realExtra: number }; // decimal, ex.: 0.02 = +2% acima da inflação (ao ano)

function aporteNoMes(
  mes: number, // 1..n
  base: number,
  politica: PoliticaAporte,
  inflacaoAnual: number,
  inflacaoTabela?: number[]
) {
  // Regra pedida: reajuste ANUAL ocorre nos MESES 12, 24, 36, ...
  const anosDecorridosAjuste = Math.floor(mes / 12);
  switch (politica.tipo) {
    case "constante":
      return base;
    case "mensal_pct":
      return base * Math.pow(1 + (politica.mensalPct ?? 0), mes - 1);
    case "anual_pct":
      return base * Math.pow(1 + (politica.anualPct ?? 0), anosDecorridosAjuste);
    case "anual_inflacao": {
      let fator = 1;
      for (let k = 1; k <= anosDecorridosAjuste; k++) {
        fator *= 1 + inflacaoAnualDoAno(k, inflacaoAnual, inflacaoTabela);
      }
      return base * fator;
    }
    case "anual_real": {
      let fator = 1;
      for (let k = 1; k <= anosDecorridosAjuste; k++) {
        fator *= (1 + inflacaoAnualDoAno(k, inflacaoAnual, inflacaoTabela)) * (1 + (politica.realExtra ?? 0));
      }
      return base * fator;
    }
    default:
      return base;
  }
}

// ==================================
// Núcleo de cálculo e projeções
// ==================================
function calcularProjecao({
  montanteInicial,
  aporteMensal,
  rentabAnual,
  meta,
  anosLimite,
  contribuicaoNoInicio,
  usarTaxaReal,
  inflacaoAnual,
  inflacaoTabela,
  politicaAporte = { tipo: "constante" },
}: {
  montanteInicial: number;
  aporteMensal: number; // base
  rentabAnual: number; // decimal (ex.: 0.12 = 12% a.a.)
  meta: number;
  anosLimite: number;
  contribuicaoNoInicio: boolean;
  usarTaxaReal: boolean;
  inflacaoAnual: number; // decimal
  inflacaoTabela?: number[];
  politicaAporte?: PoliticaAporte;
}) {
  const taxaMensalNominalConst = Math.pow(1 + rentabAnual, 1 / 12) - 1;

  const dados: Array<{ mes: number; saldo: number; contribuicoesAcum: number; ganhosAcum: number; aporte: number }> = [];

  let saldo = montanteInicial;
  let contribuicoesAcum = montanteInicial;
  const mesesLimite = Math.max(1, Math.floor(anosLimite * 12));

  dados.push({ mes: 0, saldo, contribuicoesAcum, ganhosAcum: saldo - contribuicoesAcum, aporte: 0 });

  let mesAlvo: number | null = saldo >= meta ? 0 : null;

  let somaInflacaoMensal = 0;

  for (let m = 1; m <= mesesLimite; m++) {
    const inflMensal = inflacaoMensalDoMes(m, inflacaoAnual, inflacaoTabela);
    somaInflacaoMensal += inflMensal;
    const taxaMensalEfetiva = usarTaxaReal
      ? (1 + taxaMensalNominalConst) / (1 + inflMensal) - 1
      : taxaMensalNominalConst;

    const aporteMes = aporteNoMes(m, aporteMensal, politicaAporte, inflacaoAnual, inflacaoTabela);

    if (contribuicaoNoInicio) {
      saldo += aporteMes;
      contribuicoesAcum += aporteMes;
      saldo *= 1 + taxaMensalEfetiva;
    } else {
      saldo *= 1 + taxaMensalEfetiva;
      saldo += aporteMes;
      contribuicoesAcum += aporteMes;
    }

    const ganhosAcum = saldo - contribuicoesAcum;
    dados.push({ mes: m, saldo, contribuicoesAcum, ganhosAcum, aporte: aporteMes });

    if (mesAlvo === null && saldo >= meta) mesAlvo = m;
  }

  const taxaMensalInflacaoMedia = somaInflacaoMensal / Math.max(1, mesesLimite);

  return { dados, mesAlvo, taxaMensalNominalConst, taxaMensalInflacaoMedia };
}

// Aporte necessário com política variável (busca numérica no aporte base)
function aporteNecessario({
  montanteInicial,
  rentabAnual,
  anos,
  meta,
  contribuicaoNoInicio,
  usarTaxaReal,
  inflacaoAnual,
  inflacaoTabela,
  politicaAporte = { tipo: "constante" },
}: {
  montanteInicial: number;
  rentabAnual: number; // decimal
  anos: number;
  meta: number;
  contribuicaoNoInicio: boolean;
  usarTaxaReal: boolean;
  inflacaoAnual: number; // decimal
  inflacaoTabela?: number[];
  politicaAporte?: PoliticaAporte;
}) {
  const nMeses = Math.max(1, Math.round(anos * 12));

  const atingeMetaComAporte = (A: number) => {
    const { mesAlvo, dados } = calcularProjecao({
      montanteInicial,
      aporteMensal: A,
      rentabAnual,
      meta,
      anosLimite: anos,
      contribuicaoNoInicio,
      usarTaxaReal,
      inflacaoAnual,
      inflacaoTabela,
      politicaAporte,
    });
    if (mesAlvo !== null && mesAlvo <= nMeses) return true;
    const saldoFinal = dados[nMeses]?.saldo ?? dados[dados.length - 1].saldo;
    return saldoFinal >= meta;
  };

  let lo = 0;
  let hi = Math.max(100, meta / nMeses);
  let safety = 0;
  while (!atingeMetaComAporte(hi) && safety < 50) {
    hi *= 2;
    safety++;
    if (hi > 1e9) break;
  }

  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (atingeMetaComAporte(mid)) hi = mid; else lo = mid;
  }
  return hi; // aproximação superior mínima
}

// Taxa necessária mantendo política de aportes (busca binária na taxa mensal)
function taxaNecessaria({
  montanteInicial,
  aporteMensal,
  anos,
  meta,
  contribuicaoNoInicio,
  usarTaxaReal,
  inflacaoAnual,
  inflacaoTabela,
  politicaAporte = { tipo: "constante" },
}: {
  montanteInicial: number;
  aporteMensal: number; // base
  anos: number;
  meta: number;
  contribuicaoNoInicio: boolean;
  usarTaxaReal: boolean;
  inflacaoAnual: number;
  inflacaoTabela?: number[];
  politicaAporte?: PoliticaAporte;
}) {
  const n = Math.max(1, Math.round(anos * 12));

  const saldoFinalComTaxa = (rMensalNominalConst: number) => {
    let saldo = montanteInicial;
    for (let m = 1; m <= n; m++) {
      const inflMensal = inflacaoMensalDoMes(m, inflacaoAnual, inflacaoTabela);
      const rEfetivo = usarTaxaReal ? (1 + rMensalNominalConst) / (1 + inflMensal) - 1 : rMensalNominalConst;
      const aporteMes = aporteNoMes(m, aporteMensal, politicaAporte, inflacaoAnual, inflacaoTabela);
      if (contribuicaoNoInicio) {
        saldo += aporteMes;
        saldo *= 1 + rEfetivo;
      } else {
        saldo *= 1 + rEfetivo;
        saldo += aporteMes;
      }
    }
    return saldo;
  };

  let lo = -0.9;
  let hi = 1.0;

  const toAnualNominal = (rMensal: number) => {
    const rAnualReal = Math.pow(1 + rMensal, 12) - 1;
    if (!usarTaxaReal) return rAnualReal;
    const infMedia = inflacaoTabela && inflacaoTabela.length > 0 ? inflacaoTabela[0] : inflacaoAnual;
    return (1 + rAnualReal) * (1 + infMedia) - 1;
  };

  let found: number | null = null;
  for (let i = 0; i < 160; i++) {
    const mid = (lo + hi) / 2;
    const sf = saldoFinalComTaxa(mid);
    if (!Number.isFinite(sf)) break;
    if (sf >= meta) {
      found = mid;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  if (found === null) return null;
  return toAnualNominal(found);
}

// ==================================
// Helpers de UI simples
// ==================================
function Row({ children, style = {} as React.CSSProperties }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", ...style }}>{children}</div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  prefix,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ fontSize: 13, color: "#475569" }}>{label}</label>
      <Row>
        {prefix && <span style={{ color: "#64748b" }}>{prefix}</span>}
        <input
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(parseFloat(e.target.value || "0"))}
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

// ==================================
// Componente principal
// ==================================
export default function SimuladorMetaPatrimonial() {
  const [montanteInicial, setMontanteInicial] = useState(10000);
  const [aporteMensal, setAporteMensal] = useState(1000);
  const [rentabAnual, setRentabAnual] = useState(0.12);
  const [meta, setMeta] = useState(1000000);
  const [anosLimite, setAnosLimite] = useState(50);
  const [contribuicaoNoInicio, setContribuicaoNoInicio] = useState(true);
  const [usarTaxaReal, setUsarTaxaReal] = useState(false);
  const [inflacaoAnual, setInflacaoAnual] = useState(0.04);
  const [prazoDesejado, setPrazoDesejado] = useState(15);

  // Tabela de inflação opcional
  const [usaTabelaInflacao, setUsaTabelaInflacao] = useState(false);
  const [inflacaoTabelaStr, setInflacaoTabelaStr] = useState("");
  const inflacaoTabela = useMemo(() => parseInflacaoTabela(inflacaoTabelaStr), [inflacaoTabelaStr]);

  // Política de aporte variável
  const [tipoAporte, setTipoAporte] = useState<PoliticaAporte["tipo"]>("constante");
  const [mensalPct, setMensalPct] = useState(0.0);
  const [anualPct, setAnualPct] = useState(0.10);
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

  // Persistência local simples
  useEffect(() => {
    const salvo = localStorage.getItem("simulador_meta_config_v2");
    if (salvo) {
      try {
        const cfg = JSON.parse(salvo);
        setMontanteInicial(cfg.montanteInicial ?? 10000);
        setAporteMensal(cfg.aporteMensal ?? 1000);
        setRentabAnual(cfg.rentabAnual ?? 0.12);
        setMeta(cfg.meta ?? 1000000);
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
      } catch {}
    }
  }, []);

  const salvarConfig = () => {
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
      inflacaoTabelaStr,
    };
    localStorage.setItem("simulador_meta_config_v2", JSON.stringify(cfg));
  };

  const limparConfig = () => {
    localStorage.removeItem("simulador_meta_config_v2");
  };

  const inflTabelaOpt = usaTabelaInflacao ? inflacaoTabela : undefined;

  // Projeção principal
  const proj = useMemo(
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
    ]
  );

  const { dados, mesAlvo, taxaMensalNominalConst, taxaMensalInflacaoMedia } = proj;

  const saldoFinal = dados[dados.length - 1]?.saldo ?? 0;
  const contribFinal = dados[dados.length - 1]?.contribuicoesAcum ?? 0;
  const ganhosFinais = Math.max(0, saldoFinal - contribFinal);

  // Planejamento por prazo
  const aporteParaPrazo = useMemo(
    () =>
      Math.max(
        0,
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
        })
      ),
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
    ]
  );

  // Sensibilidade
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
          politicaAporte,
        });
        return { va, vr, meses: ma };
      })
    );
  }, [montanteInicial, aporteMensal, rentabAnual, meta, anosLimite, contribuicaoNoInicio, usarTaxaReal, inflacaoAnual, inflTabelaOpt, politicaAporte]);

  // Exportação CSV
  const exportarCSV = () => {
    const linhas = [
      ["mes", "aporte_mes", "saldo", "contribuicoes_acumuladas", "ganhos_acumulados"],
      ...dados.map((d) => [d.mes, d.aporte, d.saldo, d.contribuicoesAcum, d.ganhosAcum]),
    ];
    const conteudo = linhas.map((l) => l.join(",")).join("\n");
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "projecao_meta_patrimonial.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const naoAtingida = "> limite";
  const mesesAteMetaTexto = mesAlvo !== null ? mesesParaAnosMeses(mesAlvo) : naoAtingida;

  // ==========================
  // Testes (não alterados, só acrescidos)
  // ==========================
  type TestRes = { nome: string; passou: boolean; detalhe?: string };
  const approxEq = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

  const rodarTestes = (): TestRes[] => {
    const T: TestRes[] = [];

    // 1) mesesParaAnosMeses
    T.push({ nome: "0 meses", passou: mesesParaAnosMeses(0) === "0 meses", detalhe: mesesParaAnosMeses(0) });
    T.push({ nome: "13 meses", passou: mesesParaAnosMeses(13) === "1 ano e 1 mês", detalhe: mesesParaAnosMeses(13) });

    // 2) Projeção sem juros, aporte 100 até 1200
    const p1 = calcularProjecao({ montanteInicial: 0, aporteMensal: 100, rentabAnual: 0, meta: 1200, anosLimite: 2, contribuicaoNoInicio: true, usarTaxaReal: false, inflacaoAnual: 0 });
    T.push({ nome: "Projeção sem juros (início)", passou: p1.mesAlvo === 12, detalhe: String(p1.mesAlvo) });

    const p2 = calcularProjecao({ montanteInicial: 0, aporteMensal: 100, rentabAnual: 0, meta: 1200, anosLimite: 2, contribuicaoNoInicio: false, usarTaxaReal: false, inflacaoAnual: 0 });
    T.push({ nome: "Projeção sem juros (fim)", passou: p2.mesAlvo === 12, detalhe: String(p2.mesAlvo) });

    // 3) Aporte necessário com taxa zero (constante)
    const aNec = aporteNecessario({ montanteInicial: 0, rentabAnual: 0, anos: 10, meta: 12000, contribuicaoNoInicio: true, usarTaxaReal: false, inflacaoAnual: 0 });
    T.push({ nome: "Aporte necessário (taxa zero)", passou: approxEq(aNec, 100), detalhe: aNec.toFixed(4) });

    // 4) Taxa necessária quando meta = aportes totais (deve ~0)
    const tNec = taxaNecessaria({ montanteInicial: 0, aporteMensal: 100, anos: 10, meta: 12000, contribuicaoNoInicio: true, usarTaxaReal: false, inflacaoAnual: 0 });
    T.push({ nome: "Taxa necessária ~0", passou: tNec !== null && Math.abs(tNec) < 1e-4, detalhe: tNec === null ? "null" : tNec.toExponential(2) });

    // 5) Fórmula fechada vs simulação (12% a.a., início, constante)
    const rentAA = 0.12;
    const r = Math.pow(1 + rentAA, 1 / 12) - 1;
    const n = 240; // 20 anos
    const A = 1000;
    const P = 10000;
    const sim = calcularProjecao({ montanteInicial: P, aporteMensal: A, rentabAnual: rentAA, meta: 1e12, anosLimite: n / 12, contribuicaoNoInicio: true, usarTaxaReal: false, inflacaoAnual: 0 });
    const vfInicial = P * Math.pow(1 + r, n);
    const fatorFim = (Math.pow(1 + r, n) - 1) / r;
    const vfAportes = A * fatorFim * (1 + r);
    const esperado = vfInicial + vfAportes;
    const passou = approxEq(sim.dados[n].saldo, esperado, 1e-9);
    T.push({ nome: "Fechada vs simulação (início)", passou, detalhe: `${sim.dados[n].saldo.toFixed(2)} vs ${esperado.toFixed(2)}` });

    // 6) Não alcança meta dentro do limite
    const p3 = calcularProjecao({ montanteInicial: 0, aporteMensal: 10, rentabAnual: 0.02, meta: 1_000_000, anosLimite: 1, contribuicaoNoInicio: true, usarTaxaReal: false, inflacaoAnual: 0 });
    T.push({ nome: "Meta não alcançada (limite curto)", passou: p3.mesAlvo === null });

    // 7) Aporte com crescimento mensal (g=1%/m), r=0, fim do mês — soma geométrica
    const gMensal = 0.01;
    const n12 = 12;
    const base = 100;
    const simVar1 = calcularProjecao({ montanteInicial: 0, aporteMensal: base, rentabAnual: 0, meta: 1e12, anosLimite: n12 / 12, contribuicaoNoInicio: false, usarTaxaReal: false, inflacaoAnual: 0, politicaAporte: { tipo: "mensal_pct", mensalPct: gMensal } });
    const somaGeom = base * ((Math.pow(1 + gMensal, n12) - 1) / gMensal);
    T.push({ nome: "Crescimento mensal (r=0)", passou: approxEq(simVar1.dados[n12].saldo, somaGeom, 1e-9), detalhe: `${simVar1.dados[n12].saldo.toFixed(2)} vs ${somaGeom.toFixed(2)}` });

    // 8) Reajuste anual de 10% **no mês 12, 24**, r=0, fim do mês, 24 meses — 11*100 + 110 + 11*110 + 121
    const simVar2 = calcularProjecao({ montanteInicial: 0, aporteMensal: 100, rentabAnual: 0, meta: 1e12, anosLimite: 2, contribuicaoNoInicio: false, usarTaxaReal: false, inflacaoAnual: 0, politicaAporte: { tipo: "anual_pct", anualPct: 0.10 } });
    const esperado2 = 11 * 100 + 110 + 11 * 110 + 121; // 2541
    T.push({ nome: "Reajuste anual 10% no mês 12/24 (r=0)", passou: approxEq(simVar2.dados[24].saldo, esperado2, 1e-9), detalhe: `${simVar2.dados[24].saldo.toFixed(2)} vs ${esperado2.toFixed(2)}` });

    // 9) Reajuste anual pela inflação tabelada: [10%, 0%], r=0, fim do mês, 24 meses — 11*100 + 110 + 11*110 + 110
    const simVar3 = calcularProjecao({ montanteInicial: 0, aporteMensal: 100, rentabAnual: 0, meta: 1e12, anosLimite: 2, contribuicaoNoInicio: false, usarTaxaReal: false, inflacaoAnual: 0.00, inflacaoTabela: [0.10, 0.0], politicaAporte: { tipo: "anual_inflacao" } });
    const esperado3 = 11 * 100 + 110 + 11 * 110 + 110; // 2530
    T.push({ nome: "Reajuste por inflação tabelada (r=0)", passou: approxEq(simVar3.dados[24].saldo, esperado3, 1e-9), detalhe: `${simVar3.dados[24].saldo.toFixed(2)} vs ${esperado3.toFixed(2)}` });

    // 10) Taxa real com inflação=nominal => crescimento real ~0 (P=10000, A=0, 12m)
    const simVar4 = calcularProjecao({ montanteInicial: 10000, aporteMensal: 0, rentabAnual: 0.12, meta: 1e12, anosLimite: 1, contribuicaoNoInicio: false, usarTaxaReal: true, inflacaoAnual: 0.00, inflacaoTabela: [0.12] });
    T.push({ nome: "Taxa real com inflação=nominal (12m)", passou: approxEq(simVar4.dados[12].saldo, 10000, 1e-6), detalhe: `${simVar4.dados[12].saldo.toFixed(2)} vs 10000.00` });

    // 11) Reajuste anual acontece exatamente em 12 e 24 (não em 11)
    const simVar5 = calcularProjecao({ montanteInicial: 0, aporteMensal: 100, rentabAnual: 0, meta: 1e9, anosLimite: 2, contribuicaoNoInicio: false, usarTaxaReal: false, inflacaoAnual: 0, politicaAporte: { tipo: "anual_pct", anualPct: 0.10 } });
    const ap11 = simVar5.dados[11].aporte; // mês 11
    const ap12 = simVar5.dados[12].aporte; // mês 12
    T.push({ nome: "Reajuste em 12 (não em 11)", passou: approxEq(ap11, 100) && approxEq(ap12, 110), detalhe: `${ap11.toFixed(2)} -> ${ap12.toFixed(2)}` });

    // 12) Reajuste anual real: inflação 5% + extra 2% => 7,1% após 12m
    const simVar6 = calcularProjecao({ montanteInicial: 0, aporteMensal: 100, rentabAnual: 0, meta: 1e9, anosLimite: 1.1, contribuicaoNoInicio: false, usarTaxaReal: false, inflacaoAnual: 0.05, politicaAporte: { tipo: "anual_real", realExtra: 0.02 } });
    const ap12r = simVar6.dados[12].aporte;
    T.push({ nome: "Anual real = inflação + extra", passou: approxEq(ap12r, 100 * 1.071, 1e-6), detalhe: ap12r.toFixed(4) });

    return T;
  };

  const [testeResultados, setTesteResultados] = useState<TestRes[] | null>(null);
  useEffect(() => {
    setTesteResultados(rodarTestes());
  }, []);

  // ==========================
  // UI
  // ==========================
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
                onChange={(e) => setTipoAporte(e.target.value as any)}
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
              <input type="range" min={1} max={80} step={1} value={anosLimite} onChange={(e) => setAnosLimite(parseInt(e.target.value))} />
            </div>

            <Row style={{ justifyContent: "space-between" }}>
              <label style={{ fontSize: 13, color: "#475569" }}>Contribuição no início do mês</label>
              <input type="checkbox" checked={contribuicaoNoInicio} onChange={(e) => setContribuicaoNoInicio(e.target.checked)} />
            </Row>

            <Row style={{ justifyContent: "space-between" }}>
              <label title="Usa (1+nominal)/(1+inflação_do_mês)-1 para cada mês" style={{ fontSize: 13, color: "#475569" }}>
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

            <Row>
              <button onClick={salvarConfig} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc" }}>
                Salvar parâmetros
              </button>
              <button onClick={limparConfig} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "white" }}>
                Limpar
              </button>
            </Row>
          </div>
        </Section>

        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <Section title="Tempo até a meta">
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Se alcançada dentro do limite</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{mesAlvo !== null ? mesesAteMetaTexto : naoAtingida}</div>
            </Section>
            <Section title="Saldo final (no limite)">
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Se não alcançar antes</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtBRL(saldoFinal)}</div>
            </Section>
            <Section title="Total investido">
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Inicial + aportes</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtBRL(contribFinal)}</div>
            </Section>
            <Section title="Ganhos acumulados">
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Saldo − total investido</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtBRL(ganhosFinais)}</div>
            </Section>
          </div>

          <Section title="Curvas de evolução">
            <div style={{ height: 360 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dados} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tickFormatter={(m) => `${Math.floor(m / 12)}a ${m % 12}m`} />
                  <YAxis tickFormatter={(v) => fmtBRL(v).replace("R$\u00a0", "R$ ")} width={95} />
                  <ChartTooltip
                    formatter={(v: any, name: any, p: any) => {
                      const ponto = p?.payload as any;
                      const extra = ponto?.aporte !== undefined ? `\nAporte do mês: ${fmtBRL(ponto.aporte)}` : "";
                      return [`${fmtBRL(v)}${extra}`, name];
                    }}
                    labelFormatter={(m: any) => `Mês ${m} (${mesesParaAnosMeses(m)})`}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="saldo" name="Saldo" stroke="#2563eb" fill="url(#g1)" strokeWidth={2} />
                  <Area type="monotone" dataKey="contribuicoesAcum" name="Contribuições acumuladas" stroke="#10b981" fill="url(#g2)" strokeWidth={2} />
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
                  background: tab === t ? "#e2e8f0" : "#f8fafc",
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
                    onChange={(e) => setPrazoDesejado(parseInt(e.target.value))}
                    style={{ width: "100%" }}
                  />
                  <div style={{ fontSize: 12, color: "#64748b" }}>{prazoDesejado} {prazoDesejado === 1 ? "ano" : "anos"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "#475569" }}>Aporte mensal necessário (base)</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtBRL(aporteParaPrazo)}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Respeita a política de reajuste e a tabela de inflação (se ativa).</div>
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
                <button onClick={() => setTesteResultados(rodarTestes())} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid 