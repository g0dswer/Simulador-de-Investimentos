export const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export const fmtPct = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 2 }).format(v);

export function mesesParaAnosMeses(totalMeses: number) {
  const anos = Math.floor(totalMeses / 12);
  const meses = totalMeses % 12;
  const partes: string[] = [];
  if (anos > 0) partes.push(`${anos} ${anos === 1 ? "ano" : "anos"}`);
  partes.push(`${meses} ${meses === 1 ? "mês" : "meses"}`);
  return partes.join(" e ");
}

export function parseInflacaoTabela(str: string): number[] {
  return str
    .split(/[,;\n\t\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/%/g, "").replace(",", "."))
    .map((s) => Number(s))
    .filter((x) => Number.isFinite(x))
    .map((x) => Math.max(-0.99, x));
}

export function inflacaoAnualDoAno(anoIndex: number, inflacaoPadrao: number, tabela?: number[]) {
  if (!tabela || tabela.length === 0) return inflacaoPadrao;
  if (anoIndex - 1 < tabela.length) return tabela[anoIndex - 1];
  return tabela[tabela.length - 1];
}

export function inflacaoMensalDoMes(mes: number, inflacaoPadrao: number, tabela?: number[]) {
  const ano = Math.ceil(mes / 12);
  const ia = inflacaoAnualDoAno(ano, inflacaoPadrao, tabela);
  return Math.pow(1 + ia, 1 / 12) - 1;
}

export type PoliticaAporte =
  | { tipo: "constante" }
  | { tipo: "mensal_pct"; mensalPct: number }
  | { tipo: "anual_pct"; anualPct: number }
  | { tipo: "anual_inflacao" }
  | { tipo: "anual_real"; realExtra: number };

export function aporteNoMes(
  mes: number,
  base: number,
  politica: PoliticaAporte,
  inflacaoAnual: number,
  inflacaoTabela?: number[]
) {
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

export type ProjecaoDado = {
  mes: number;
  saldo: number;
  contribuicoesAcum: number;
  ganhosAcum: number;
  aporte: number;
};

export function calcularProjecao({
  montanteInicial,
  aporteMensal,
  rentabAnual,
  meta,
  anosLimite,
  contribuicaoNoInicio,
  usarTaxaReal,
  inflacaoAnual,
  inflacaoTabela,
  politicaAporte = { tipo: "constante" }
}: {
  montanteInicial: number;
  aporteMensal: number;
  rentabAnual: number;
  meta: number;
  anosLimite: number;
  contribuicaoNoInicio: boolean;
  usarTaxaReal: boolean;
  inflacaoAnual: number;
  inflacaoTabela?: number[];
  politicaAporte?: PoliticaAporte;
}) {
  const taxaMensalNominalConst = Math.pow(1 + rentabAnual, 1 / 12) - 1;

  const dados: ProjecaoDado[] = [];

  let saldo = montanteInicial;
  let contribuicoesAcum = montanteInicial;
  const mesesLimite = Math.max(1, Math.floor(anosLimite * 12));

  dados.push({ mes: 0, saldo, contribuicoesAcum, ganhosAcum: saldo - contribuicoesAcum, aporte: 0 });

  let mesAlvo: number | null = saldo >= meta ? 0 : null;

  let somaInflacaoMensal = 0;

  for (let m = 1; m <= mesesLimite; m++) {
    const inflMensal = inflacaoMensalDoMes(m, inflacaoAnual, inflacaoTabela);
    somaInflacaoMensal += inflMensal;
    const taxaMensalEfetiva = usarTaxaReal ? (1 + taxaMensalNominalConst) / (1 + inflMensal) - 1 : taxaMensalNominalConst;

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

export function aporteNecessario({
  montanteInicial,
  rentabAnual,
  anos,
  meta,
  contribuicaoNoInicio,
  usarTaxaReal,
  inflacaoAnual,
  inflacaoTabela,
  politicaAporte = { tipo: "constante" }
}: {
  montanteInicial: number;
  rentabAnual: number;
  anos: number;
  meta: number;
  contribuicaoNoInicio: boolean;
  usarTaxaReal: boolean;
  inflacaoAnual: number;
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
      politicaAporte
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
    if (atingeMetaComAporte(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

export function taxaNecessaria({
  montanteInicial,
  aporteMensal,
  anos,
  meta,
  contribuicaoNoInicio,
  usarTaxaReal,
  inflacaoAnual,
  inflacaoTabela,
  politicaAporte = { tipo: "constante" }
}: {
  montanteInicial: number;
  aporteMensal: number;
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

  const inflacaoMediaAnual = inflacaoTabela && inflacaoTabela.length > 0
    ? inflacaoTabela.reduce((acc, val) => acc + val, 0) / inflacaoTabela.length
    : inflacaoAnual;

  const toAnualNominal = (rMensal: number) => {
    const rAnualReal = Math.pow(1 + rMensal, 12) - 1;
    if (!usarTaxaReal) return rAnualReal;
    return (1 + rAnualReal) * (1 + inflacaoMediaAnual) - 1;
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

export function approxEq(a: number, b: number, tol = 1e-6) {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}
