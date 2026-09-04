import {
  calcularProjecao,
  inflacaoMensalDoMes,
  PoliticaAporte,
  ProjecaoDado,
} from "./calculos";

/** The three questions the beginner flow can answer. */
export type Goal = "grow" | "monthly" | "time";

export type PlannerConfig = {
  goal: Goal;
  initial: number;
  monthly: number;
  target: number;
  years: number;
  rate: number;
  compare: boolean;
  inflationAdjusted: boolean;
  inflation: number;
  policy: PoliticaAporte;
  beginning: boolean;
  inflationTable?: number[];
};

const MAX_MONEY = 1_000_000_000_000;
const MAX_YEARS = 80;
const MAX_TABLE_LENGTH = MAX_YEARS;
const MAX_RATE = 10;
const MIN_RATE_EXCLUSIVE = -1;
// Currency is displayed to cents by the UI.  Keeping the value below the
// largest exactly representable integer number of cents prevents a finite but
// astronomical projection from being rendered as a misleading amount.
const MAX_CURRENCY_VALUE = Number.MAX_SAFE_INTEGER / 100;

/**
 * Default values are intentionally modest.  They are safe to show to a
 * first-time user and are also a useful fallback for old/corrupt localStorage
 * values.
 */
export const DEFAULT_CONFIG: PlannerConfig = {
  goal: "grow",
  initial: 0,
  monthly: 300,
  target: 50_000,
  years: 10,
  rate: 0.06,
  compare: true,
  inflationAdjusted: false,
  inflation: 0.04,
  policy: { tipo: "constante" },
  beginning: false,
};

type RecordLike = Record<string, unknown>;

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clonePolicy(policy: PoliticaAporte): PoliticaAporte {
  switch (policy.tipo) {
    case "mensal_pct":
      return { tipo: "mensal_pct", mensalPct: policy.mensalPct };
    case "anual_pct":
      return { tipo: "anual_pct", anualPct: policy.anualPct };
    case "anual_real":
      return { tipo: "anual_real", realExtra: policy.realExtra };
    case "anual_inflacao":
      return { tipo: "anual_inflacao" };
    case "constante":
      return { tipo: "constante" };
  }
}

function cloneConfig(config: PlannerConfig): PlannerConfig {
  return {
    ...config,
    policy: clonePolicy(config.policy),
    ...(config.inflationTable
      ? { inflationTable: [...config.inflationTable] }
      : {}),
  };
}

function hasOnlyKeys(value: RecordLike, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function boundedMoney(value: unknown): value is number {
  return finiteNumber(value) && value >= 0 && value <= MAX_MONEY;
}

function boundedRate(value: unknown): value is number {
  return finiteNumber(value) && value > MIN_RATE_EXCLUSIVE && value <= MAX_RATE;
}

function validPolicy(value: unknown): value is PoliticaAporte {
  if (!isRecord(value) || typeof value.tipo !== "string") return false;

  switch (value.tipo) {
    case "constante":
    case "anual_inflacao":
      return hasOnlyKeys(value, ["tipo"]);
    case "mensal_pct":
      return (
        hasOnlyKeys(value, ["tipo", "mensalPct"]) &&
        boundedRate(value.mensalPct)
      );
    case "anual_pct":
      return (
        hasOnlyKeys(value, ["tipo", "anualPct"]) && boundedRate(value.anualPct)
      );
    case "anual_real":
      return (
        hasOnlyKeys(value, ["tipo", "realExtra"]) &&
        boundedRate(value.realExtra)
      );
    default:
      return false;
  }
}

function validPlannerRecord(value: unknown): value is PlannerConfig {
  if (!isRecord(value)) return false;

  const keys = [
    "goal",
    "initial",
    "monthly",
    "target",
    "years",
    "rate",
    "compare",
    "inflationAdjusted",
    "inflation",
    "policy",
    "beginning",
    "inflationTable",
  ] as const;
  if (!hasOnlyKeys(value, keys)) return false;

  if (
    value.goal !== "grow" &&
    value.goal !== "monthly" &&
    value.goal !== "time"
  ) {
    return false;
  }
  if (
    !boundedMoney(value.initial) ||
    !boundedMoney(value.monthly) ||
    !boundedMoney(value.target) ||
    !finiteNumber(value.years) ||
    !Number.isInteger(value.years) ||
    value.years < 1 ||
    value.years > MAX_YEARS ||
    !boundedRate(value.rate) ||
    typeof value.compare !== "boolean" ||
    typeof value.inflationAdjusted !== "boolean" ||
    !boundedRate(value.inflation) ||
    typeof value.beginning !== "boolean" ||
    !validPolicy(value.policy)
  ) {
    return false;
  }

  if (value.inflationTable !== undefined) {
    if (
      !Array.isArray(value.inflationTable) ||
      value.inflationTable.length > MAX_TABLE_LENGTH ||
      value.inflationTable.some((rate) => !boundedRate(rate))
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Parse a monetary/percentage value written by a Brazilian user.
 *
 * Grouping dots and a decimal comma are accepted (`1.000,50`), as are plain
 * decimal points (`1000.50`).  A trailing percent sign changes the result to
 * its decimal representation (`-12,5%` becomes `-0.125`).  The parser is
 * deliberately strict so a malformed value never becomes zero by accident.
 */
export function parseBrazilianNumber(raw: string): number | null {
  if (typeof raw !== "string") return null;

  const input = raw.trim();
  if (input === "") return null;

  const isPercent = input.endsWith("%");
  const token = isPercent ? input.slice(0, -1) : input;
  if (token === "" || /\s/.test(token)) return null;

  const sign = token[0] === "+" || token[0] === "-" ? token[0] : "";
  const unsigned = sign ? token.slice(1) : token;
  if (unsigned === "" || !/^\d[\d.,]*$/.test(unsigned)) return null;

  let normalized: string;

  if (unsigned.includes(",") && unsigned.includes(".")) {
    // Mixed notation only has one decimal comma and a correctly grouped
    // integer part.  This rejects US-style `1,000.50` rather than guessing.
    const commaParts = unsigned.split(",");
    if (commaParts.length !== 2) return null;
    const [integerPart, decimalPart] = commaParts;
    if (!/^\d{1,3}(?:\.\d{3})+$/.test(integerPart)) return null;
    if (!/^\d+$/.test(decimalPart)) return null;
    normalized = `${integerPart.replace(/\./g, "")}.${decimalPart}`;
  } else if (unsigned.includes(",")) {
    // Brazilian comma decimal notation.  Thousands separated by commas are
    // intentionally not accepted because they are ambiguous in this locale.
    if (!/^\d+,\d+$/.test(unsigned)) return null;
    normalized = unsigned.replace(",", ".");
  } else if (unsigned.includes(".")) {
    // A dot followed by groups of exactly three digits is a thousands form;
    // otherwise it is an ordinary decimal point.
    if (/^\d{1,3}(?:\.\d{3})+$/.test(unsigned)) {
      normalized = unsigned.replace(/\./g, "");
    } else {
      if (!/^\d+\.\d+$/.test(unsigned)) return null;
      normalized = unsigned;
    }
  } else {
    if (!/^\d+$/.test(unsigned)) return null;
    normalized = unsigned;
  }

  const parsed = Number(`${sign}${normalized}`);
  if (!Number.isFinite(parsed)) return null;
  const result = isPercent ? parsed / 100 : parsed;
  return Number.isFinite(result) ? result : null;
}

function unwrapVersionedStorage(raw: unknown): unknown {
  if (!isRecord(raw)) return null;

  // The UI stores a v3 payload.  Accepting the direct form keeps this helper
  // useful in tests and for callers that already selected the v3 key, while a
  // version marker is always checked strictly when present.
  const versionKeys = ["version", "schemaVersion", "v"].filter(
    (key) => key in raw,
  );
  if (versionKeys.some((key) => raw[key] !== 3)) return null;

  if ("config" in raw) {
    if (versionKeys.length === 0 || !isRecord(raw.config)) return null;
    return raw.config;
  }

  const allowed = new Set([
    "version",
    "schemaVersion",
    "v",
    "goal",
    "initial",
    "monthly",
    "target",
    "years",
    "rate",
    "compare",
    "inflationAdjusted",
    "inflation",
    "policy",
    "beginning",
    "inflationTable",
  ]);
  if (Object.keys(raw).some((key) => !allowed.has(key))) return null;

  const direct = { ...raw } as RecordLike;
  delete direct.version;
  delete direct.schemaVersion;
  delete direct.v;
  return direct;
}

/**
 * Validate data read from the planner's v3 localStorage entry.
 *
 * Validation is all-or-nothing: old schemas, strings, unknown enum values,
 * malformed policies, non-finite numbers and out-of-range values return a
 * fresh copy of DEFAULT_CONFIG.  This keeps persistence fail-closed and
 * prevents an untrusted storage payload from creating an unbounded loop.
 */
export function sanitizeConfig(raw: unknown): PlannerConfig {
  const unwrapped = unwrapVersionedStorage(raw);
  if (!validPlannerRecord(unwrapped)) return cloneConfig(DEFAULT_CONFIG);

  return {
    goal: unwrapped.goal,
    initial: unwrapped.initial,
    monthly: unwrapped.monthly,
    target: unwrapped.target,
    years: unwrapped.years,
    rate: unwrapped.rate,
    compare: unwrapped.compare,
    inflationAdjusted: unwrapped.inflationAdjusted,
    inflation: unwrapped.inflation,
    policy: clonePolicy(unwrapped.policy),
    beginning: unwrapped.beginning,
    ...(unwrapped.inflationTable
      ? { inflationTable: [...unwrapped.inflationTable] }
      : {}),
  };
}

function emptyProjection(initial: number): ProjecaoDado {
  return {
    mes: 0,
    saldo: initial,
    contribuicoesAcum: initial,
    ganhosAcum: 0,
    aporte: 0,
  };
}

function isUnsafeNumber(value: unknown): boolean {
  // calcularProjecao uses Number.MAX_VALUE as its explicit positive overflow
  // sentinel.  The broad threshold also catches a finite value that is too
  // close to that sentinel to be meaningfully displayed or discounted.
  return (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) >= Number.MAX_VALUE / 4
  );
}

function isUnsafeCurrency(value: unknown): boolean {
  return isUnsafeNumber(value) || Math.abs(value as number) > MAX_CURRENCY_VALUE;
}

function rowIsUnsafe(row: ProjecaoDado): boolean {
  return (
    !Number.isSafeInteger(row.mes) ||
    isUnsafeCurrency(row.saldo) ||
    isUnsafeCurrency(row.contribuicoesAcum) ||
    isUnsafeCurrency(row.ganhosAcum) ||
    isUnsafeCurrency(row.aporte)
  );
}

function nominalProjection(
  config: PlannerConfig,
  monthly: number,
): ProjecaoDado[] {
  const result = calcularProjecao({
    montanteInicial: config.initial,
    aporteMensal: monthly,
    rentabAnual: config.rate,
    meta: config.target,
    anosLimite: config.years,
    contribuicaoNoInicio: config.beginning,
    // The planner always requests nominal arithmetic and performs the
    // real-value conversion below, preserving one source of truth for the
    // Lean-validated recurrence.
    usarTaxaReal: false,
    inflacaoAnual: config.inflation,
    inflacaoTabela: config.inflationTable,
    politicaAporte: config.policy,
  });
  return result.dados;
}

function realProjection(
  config: PlannerConfig,
  nominal: ProjecaoDado[],
): { data: ProjecaoDado[]; overflow: boolean } {
  if (!config.inflationAdjusted) {
    return {
      data: nominal.map((row) => ({ ...row })),
      overflow: nominal.some(rowIsUnsafe),
    };
  }

  const deflator: number[] = [1];
  for (let m = 1; m < nominal.length; m++) {
    const monthlyInflation = inflacaoMensalDoMes(
      m,
      config.inflation,
      config.inflationTable,
    );
    const next = deflator[m - 1] * (1 + monthlyInflation);
    if (isUnsafeNumber(next) || next <= 0) {
      return { data: [], overflow: true };
    }
    deflator.push(next);
  }

  const first = nominal[0];
  if (!first || rowIsUnsafe(first)) return { data: [], overflow: true };

  const data: ProjecaoDado[] = [emptyProjection(first.saldo)];
  let realContributions = first.contribuicoesAcum;
  if (isUnsafeCurrency(realContributions)) return { data: [], overflow: true };

  for (let index = 1; index < nominal.length; index++) {
    const row = nominal[index];
    const balanceDeflator = deflator[index];
    const contributionDeflator = deflator[config.beginning ? index - 1 : index];
    if (
      !row ||
      rowIsUnsafe(row) ||
      !balanceDeflator ||
      !contributionDeflator ||
      isUnsafeNumber(balanceDeflator) ||
      isUnsafeNumber(contributionDeflator)
    ) {
      return { data: [], overflow: true };
    }

    const realBalance = row.saldo / balanceDeflator;
    const realContribution = row.aporte / contributionDeflator;
    realContributions += realContribution;
    const realGains = realBalance - realContributions;
    const converted = {
      mes: row.mes,
      saldo: realBalance,
      contribuicoesAcum: realContributions,
      ganhosAcum: realGains,
      aporte: realContribution,
    };
    if (rowIsUnsafe(converted)) return { data: [], overflow: true };
    data.push(converted);
  }

  return { data, overflow: false };
}

function findFirstTarget(data: ProjecaoDado[], target: number): number | null {
  for (const row of data) {
    if (row.saldo >= target) return row.mes;
  }
  return null;
}

function finalBalance(
  config: PlannerConfig,
  monthly: number,
): { value: number; data: ProjecaoDado[] } | null {
  const nominal = nominalProjection(config, monthly);
  const converted = realProjection(config, nominal);
  if (converted.overflow || converted.data.length === 0) return null;
  const end = converted.data[converted.data.length - 1];
  if (!end || rowIsUnsafe(end)) return null;
  return { value: end.saldo, data: converted.data };
}

/**
 * Solve the monthly base contribution against the balance at the end of the
 * selected horizon.  This intentionally does not use calcularProjecao's
 * first-crossing metadata: a plan may cross a target early and later fall
 * below it when the return is depreciating.
 */
function solveMonthlyAtEnd(config: PlannerConfig): number | null {
  if (config.target === 0) return 0;

  const months = config.years * 12;
  if (!Number.isSafeInteger(months) || months <= 0) return null;

  const reachesAtEnd = (monthly: number): boolean => {
    if (!boundedMoney(monthly)) return false;
    const evaluated = finalBalance(config, monthly);
    return evaluated !== null && evaluated.value >= config.target;
  };

  // Reaching the target today is not enough for this goal: with a negative
  // return (or a real-value deflator) the balance can fall below it by the
  // selected horizon.  Check the zero-contribution balance at the endpoint
  // before taking the shortcut used by a first-crossing solver.
  if (reachesAtEnd(0)) return 0;

  let lo = 0;
  let hi = Math.min(MAX_MONEY, Math.max(1, config.target / months));
  if (!reachesAtEnd(hi)) {
    for (let i = 0; i < 80 && hi < MAX_MONEY; i++) {
      hi = Math.min(MAX_MONEY, hi * 2);
      if (reachesAtEnd(hi)) break;
    }
  }
  if (!reachesAtEnd(hi)) return null;

  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    if (reachesAtEnd(mid)) hi = mid;
    else lo = mid;
  }

  // The UI displays currency with two decimal places.  Returning the raw
  // bisection boundary could therefore be rounded down on screen by a few
  // fractions of a cent and make the visible recommendation insufficient.
  // Round upward to the displayed cent and re-check the postcondition after
  // rounding; the latter also protects against floating-point edge cases.
  let rounded = Math.ceil(hi * 100) / 100;
  if (!Number.isFinite(rounded) || rounded > MAX_MONEY) return null;
  if (!reachesAtEnd(rounded)) {
    if (rounded >= MAX_MONEY) return null;
    rounded = Math.min(MAX_MONEY, rounded + 0.01);
    if (!reachesAtEnd(rounded)) return null;
  }
  return rounded;
}

export type ProjectPlan = {
  data: ProjecaoDado[];
  monthTarget: number | null;
  monthly: number | null;
  end: ProjecaoDado;
  overflow: boolean;
};

function failedPlan(config: PlannerConfig, overflow: boolean): ProjectPlan {
  const row = emptyProjection(config.initial);
  return {
    data: [row],
    monthTarget: null,
    monthly: null,
    end: row,
    overflow,
  };
}

/**
 * Build the beginner-facing projection.
 *
 * `grow` keeps the complete selected horizon. `time` uses that same horizon
 * as a cap and trims the chart at the first displayed crossing. `monthly`
 * solves the contribution needed at the end of the horizon and then returns
 * the complete horizon using that solved contribution.
 */
export function projectPlan(input: PlannerConfig): ProjectPlan {
  // `sanitizeConfig` is intentionally a storage boundary and falls back to a
  // default for corrupt persisted data.  A runtime call with a malformed
  // direct config must fail closed instead of silently showing a projection
  // for unrelated default values.
  const unwrapped = unwrapVersionedStorage(input);
  if (!validPlannerRecord(unwrapped)) return failedPlan(DEFAULT_CONFIG, false);
  const config = sanitizeConfig(input);
  let monthly = config.monthly;

  if (config.goal === "monthly") {
    const solved = solveMonthlyAtEnd(config);
    if (solved === null) {
      const fallback = finalBalance(config, config.monthly);
      if (fallback === null) return failedPlan(config, true);
      const data = fallback.data;
      return {
        data,
        monthTarget: findFirstTarget(data, config.target),
        monthly: null,
        end: data[data.length - 1],
        overflow: false,
      };
    }
    monthly = solved;
  }

  const evaluated = finalBalance(config, monthly);
  if (evaluated === null) return failedPlan(config, true);

  let data = evaluated.data;
  const monthTarget = findFirstTarget(data, config.target);
  if (config.goal === "time" && monthTarget !== null) {
    const crossingIndex = data.findIndex((row) => row.mes === monthTarget);
    if (crossingIndex >= 0) data = data.slice(0, crossingIndex + 1);
  }

  const end = data[data.length - 1];
  if (!end) return failedPlan(config, true);

  return {
    data,
    monthTarget,
    // Expose the contribution used to build the returned data for every
    // successful goal.  For `monthly` this is the solved value; for `grow`
    // and `time` it is the user's configured value.  Keeping this populated
    // lets the UI render one common success state while the nullable value
    // still signals an unavailable solver/overflow result.
    monthly,
    end,
    overflow: false,
  };
}
