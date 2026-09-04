export const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export const fmtPct = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 2 }).format(v);

const MAX_HORIZONTE_MESES = 120_000;
const MAX_APORTE_MENSAL = 1e12;
const MAX_TAXA_MENSAL = 1e6;
const MIN_TAXA_MENSAL = -0.999999999999;

/** Converts a non-negative duration in years to complete months.
 *
 * Durations are truncated because a projection cannot include a fraction of a
 * month.  Non-finite and negative durations fail closed as zero months; the
 * public calculations still validate the original duration before iterating.
 */
export function anosParaMeses(anos: number): number {
  if (!Number.isFinite(anos) || anos <= 0) return 0;
  const meses = anos * 12;
  return Number.isFinite(meses) ? Math.floor(meses) : Number.POSITIVE_INFINITY;
}

export function mesesParaAnosMeses(totalMeses: number) {
  const mesesTotais = Number.isFinite(totalMeses) && totalMeses > 0 ? Math.floor(totalMeses) : 0;
  const anos = Math.floor(mesesTotais / 12);
  const meses = mesesTotais % 12;
  const partes: string[] = [];
  if (anos > 0) partes.push(`${anos} ${anos === 1 ? "ano" : "anos"}`);
  partes.push(`${meses} ${meses === 1 ? "mês" : "meses"}`);
  return partes.join(" e ");
}

export function parseInflacaoTabela(str: string): number[] {
  if (typeof str !== "string" || str.trim() === "") return [];

  const valores: number[] = [];

  // Semicolons, line breaks, tabs and spaces are unambiguous list
  // separators.  A comma is retained here because it can be the decimal
  // separator (for example, the UI's `0,04, 0,05` placeholder).
  const tokens = str.split(/[;\n\r\t\s]+/).filter(Boolean);

  const adicionar = (raw: string) => {
    let token = raw.trim();
    if (!token) return;

    // A comma immediately before a structural separator belongs to the list
    // syntax, not to the numeric value (`0,04, 0,05`).
    token = token.replace(/,+$/, "");
    if (!token) return;

    const percentual = /%$/.test(token);
    token = token.replace(/%$/g, "");

    const commaParts = token.split(",");
    const temPonto = token.includes(".");

    if (commaParts.length > 1 && temPonto) {
      // With a decimal point, commas are list separators: `0.04,0.05`.
      commaParts.forEach((parte) => adicionar(parte + (percentual ? "%" : "")));
      return;
    }

    if (commaParts.length > 2) {
      // A sequence of comma-decimal values without spaces is still
      // recoverable when each integer part is zero (`0,04,0,05`).  Other
      // ambiguous sequences are interpreted as comma-separated integers.
      const paresDecimais = commaParts.length % 2 === 0 && commaParts.every((parte, index) => {
        if (index % 2 === 0) return /^[-+]?0$/.test(parte);
        return /^\d+$/.test(parte);
      });
      if (paresDecimais) {
        for (let i = 0; i < commaParts.length; i += 2) {
          adicionar(`${commaParts[i]}.${commaParts[i + 1]}${percentual ? "%" : ""}`);
        }
        return;
      }
      commaParts.forEach((parte) => adicionar(parte + (percentual ? "%" : "")));
      return;
    }

    const normalizado = token.replace(",", ".");
    const valor = Number(normalizado);
    if (!Number.isFinite(valor)) return;
    const valorDecimal = percentual ? valor / 100 : valor;
    if (Number.isFinite(valorDecimal) && valorDecimal > -1) valores.push(valorDecimal);
  };

  tokens.forEach(adicionar);
  return valores;
}

export function inflacaoAnualDoAno(anoIndex: number, inflacaoPadrao: number, tabela?: number[]) {
  if (!tabela || tabela.length === 0) return inflacaoPadrao;
  if (anoIndex - 1 < tabela.length) return tabela[anoIndex - 1];
  return tabela[tabela.length - 1];
}

export function inflacaoMensalDoMes(mes: number, inflacaoPadrao: number, tabela?: number[]) {
  if (!Number.isFinite(mes) || mes <= 0) return 0;
  const ano = Math.ceil(mes / 12);
  const ia = inflacaoAnualDoAno(ano, inflacaoPadrao, tabela);
  if (!Number.isFinite(ia) || ia <= -1) return 0;
  return Math.pow(1 + ia, 1 / 12) - 1;
}

export type PoliticaAporte =
  | { tipo: "constante" }
  | { tipo: "mensal_pct"; mensalPct: number }
  | { tipo: "anual_pct"; anualPct: number }
  | { tipo: "anual_inflacao" }
  | { tipo: "anual_real"; realExtra: number };

export type ParametrosFinanceiros = {
  montanteInicial: number;
  aporteMensal?: number;
  rentabAnual: number;
  anos: number;
  meta: number;
  contribuicaoNoInicio?: boolean;
  usarTaxaReal?: boolean;
  inflacaoAnual: number;
  inflacaoTabela?: number[];
  politicaAporte?: PoliticaAporte;
};

function politicaAporteValida(politica: PoliticaAporte): boolean {
  switch (politica.tipo) {
    case "constante":
    case "anual_inflacao":
      return true;
    case "mensal_pct":
      return Number.isFinite(politica.mensalPct) && politica.mensalPct > -1;
    case "anual_pct":
      return Number.isFinite(politica.anualPct) && politica.anualPct > -1;
    case "anual_real":
      return Number.isFinite(politica.realExtra) && politica.realExtra > -1;
    default:
      return false;
  }
}

/**
 * Runtime domain guard shared by projection and both numerical solvers.
 * Invalid financial inputs are rejected instead of being allowed to create
 * NaN/Infinity or unbounded loops.  Amounts and the target are non-negative;
 * rates and inflation must be strictly greater than -1.
 */
export function validarParametros({
  montanteInicial,
  aporteMensal,
  rentabAnual,
  anos,
  meta,
  contribuicaoNoInicio,
  usarTaxaReal,
  inflacaoAnual,
  inflacaoTabela,
  politicaAporte = { tipo: "constante" }
}: ParametrosFinanceiros): boolean {
  const numeros = [montanteInicial, rentabAnual, anos, meta, inflacaoAnual];
  if (aporteMensal !== undefined) numeros.push(aporteMensal);
  if (!numeros.every(Number.isFinite)) return false;
  if (montanteInicial < 0 || (aporteMensal !== undefined && aporteMensal < 0) || meta < 0) return false;
  if (anos < 0 || rentabAnual <= -1 || inflacaoAnual <= -1) return false;
  const meses = anosParaMeses(anos);
  if (!Number.isSafeInteger(meses) || meses > MAX_HORIZONTE_MESES) return false;
  if (contribuicaoNoInicio !== undefined && typeof contribuicaoNoInicio !== "boolean") return false;
  if (usarTaxaReal !== undefined && typeof usarTaxaReal !== "boolean") return false;
  if (inflacaoTabela?.some((valor) => !Number.isFinite(valor) || valor <= -1)) return false;
  return politicaAporteValida(politicaAporte);
}

function snapshotInicial(montanteInicial: number): ProjecaoDado[] {
  const saldo = Number.isFinite(montanteInicial) ? Math.max(0, montanteInicial) : 0;
  return [{ mes: 0, saldo, contribuicoesAcum: saldo, ganhosAcum: 0, aporte: 0 }];
}

function valorFinitoOuSaturado(valor: number, fallback: number): number {
  if (Number.isFinite(valor)) return valor;
  if (valor === Number.POSITIVE_INFINITY) return Number.MAX_VALUE;
  return fallback;
}

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
  const dadosIniciais = snapshotInicial(montanteInicial);
  const valido = validarParametros({
    montanteInicial,
    aporteMensal,
    rentabAnual,
    anos: anosLimite,
    meta,
    contribuicaoNoInicio,
    usarTaxaReal,
    inflacaoAnual,
    inflacaoTabela,
    politicaAporte
  });
  const mesesCalculados = anosParaMeses(anosLimite);
  if (!valido || !Number.isSafeInteger(mesesCalculados) || mesesCalculados > MAX_HORIZONTE_MESES) {
    return {
      dados: dadosIniciais,
      mesAlvo: null,
      taxaMensalNominalConst: 0,
      taxaMensalInflacaoMedia: 0
    };
  }

  const taxaMensalNominalConst = Math.pow(1 + rentabAnual, 1 / 12) - 1;

  const dados: ProjecaoDado[] = [];

  let saldo = montanteInicial;
  let contribuicoesAcum = montanteInicial;
  const mesesLimite = mesesCalculados;

  dados.push({ mes: 0, saldo, contribuicoesAcum, ganhosAcum: saldo - contribuicoesAcum, aporte: 0 });

  let mesAlvo: number | null = saldo >= meta ? 0 : null;

  let somaInflacaoMensal = 0;

  for (let m = 1; m <= mesesLimite; m++) {
    const inflMensal = inflacaoMensalDoMes(m, inflacaoAnual, inflacaoTabela);
    somaInflacaoMensal += inflMensal;
    const taxaMensalEfetiva = usarTaxaReal ? (1 + taxaMensalNominalConst) / (1 + inflMensal) - 1 : taxaMensalNominalConst;

    const aporteMes = valorFinitoOuSaturado(
      aporteNoMes(m, aporteMensal, politicaAporte, inflacaoAnual, inflacaoTabela),
      0
    );

    if (contribuicaoNoInicio) {
      saldo = valorFinitoOuSaturado(saldo + aporteMes, saldo);
      contribuicoesAcum = valorFinitoOuSaturado(contribuicoesAcum + aporteMes, contribuicoesAcum);
      saldo = valorFinitoOuSaturado(saldo * (1 + taxaMensalEfetiva), saldo);
    } else {
      saldo = valorFinitoOuSaturado(saldo * (1 + taxaMensalEfetiva), saldo);
      saldo = valorFinitoOuSaturado(saldo + aporteMes, saldo);
      contribuicoesAcum = valorFinitoOuSaturado(contribuicoesAcum + aporteMes, contribuicoesAcum);
    }

    const ganhosAcum = valorFinitoOuSaturado(saldo - contribuicoesAcum, 0);
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
}): number | null {
  const valido = validarParametros({
    montanteInicial,
    aporteMensal: 0,
    rentabAnual,
    anos,
    meta,
    contribuicaoNoInicio,
    usarTaxaReal,
    inflacaoAnual,
    inflacaoTabela,
    politicaAporte
  });
  const nMeses = anosParaMeses(anos);
  if (!valido || !Number.isSafeInteger(nMeses) || nMeses > MAX_HORIZONTE_MESES) return null;

  if (montanteInicial >= meta) return 0;
  if (nMeses === 0) return null;

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
    return Number.isFinite(saldoFinal) && saldoFinal >= meta;
  };

  let lo = 0;
  let hi = Math.max(100, meta / nMeses);
  let encontrouBracket = atingeMetaComAporte(hi);
  for (let safety = 0; !encontrouBracket && safety < 80; safety++) {
    if (!Number.isFinite(hi) || hi >= MAX_APORTE_MENSAL) break;
    hi = Math.min(MAX_APORTE_MENSAL, hi * 2);
    encontrouBracket = atingeMetaComAporte(hi);
  }
  if (!encontrouBracket) return null;

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
}): number | null {
  const valido = validarParametros({
    montanteInicial,
    aporteMensal,
    rentabAnual: 0,
    anos,
    meta,
    contribuicaoNoInicio,
    usarTaxaReal,
    inflacaoAnual,
    inflacaoTabela,
    politicaAporte
  });
  const n = anosParaMeses(anos);
  if (!valido || !Number.isSafeInteger(n) || n > MAX_HORIZONTE_MESES) return null;

  if (n === 0) return null;

  const saldoFinalComTaxa = (rMensalNominalConst: number) => {
    if (!Number.isFinite(rMensalNominalConst) || rMensalNominalConst <= -1) return Number.NaN;
    let saldo = montanteInicial;
    for (let m = 1; m <= n; m++) {
      const inflMensal = inflacaoMensalDoMes(m, inflacaoAnual, inflacaoTabela);
      const rEfetivo = usarTaxaReal ? (1 + rMensalNominalConst) / (1 + inflMensal) - 1 : rMensalNominalConst;
      const aporteMes = valorFinitoOuSaturado(
        aporteNoMes(m, aporteMensal, politicaAporte, inflacaoAnual, inflacaoTabela),
        0
      );
      if (contribuicaoNoInicio) {
        saldo = valorFinitoOuSaturado(saldo + aporteMes, saldo);
        saldo = valorFinitoOuSaturado(saldo * (1 + rEfetivo), saldo);
      } else {
        saldo = valorFinitoOuSaturado(saldo * (1 + rEfetivo), saldo);
        saldo = valorFinitoOuSaturado(saldo + aporteMes, saldo);
      }
    }
    return saldo;
  };

  let lo = MIN_TAXA_MENSAL;
  let hi = 1.0;

  // A zero-rate result is the natural answer when the target is already
  // reached without return; only search negative rates when zero is not enough.
  if (saldoFinalComTaxa(0) >= meta) return 0;

  const saldoNoLimiteInferior = saldoFinalComTaxa(lo);
  if (!Number.isFinite(saldoNoLimiteInferior) || saldoNoLimiteInferior >= meta) return null;

  let saldoNoLimiteSuperior = saldoFinalComTaxa(hi);
  for (let safety = 0; saldoNoLimiteSuperior < meta && safety < 80; safety++) {
    if (!Number.isFinite(hi) || hi >= MAX_TAXA_MENSAL) break;
    hi = Math.min(MAX_TAXA_MENSAL, hi * 2);
    saldoNoLimiteSuperior = saldoFinalComTaxa(hi);
  }
  if (!Number.isFinite(saldoNoLimiteSuperior) || saldoNoLimiteSuperior < meta) return null;

  const toAnualNominal = (rMensal: number) => {
    // The bisection variable is nominal even when the projection applies the
    // real-rate adjustment month by month.  Annualize it exactly once.
    return Math.pow(1 + rMensal, 12) - 1;
  };

  let found: number | null = null;
  for (let i = 0; i < 160; i++) {
    const mid = (lo + hi) / 2;
    const sf = saldoFinalComTaxa(mid);
    if (!Number.isFinite(sf)) return null;
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
