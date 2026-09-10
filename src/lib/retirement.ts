/**
 * Retirement planning calculations used by the optional retirement view.
 *
 * The public amounts are expressed in BRL at today's purchasing power.  The
 * engine converts the nominal annual return and inflation to a real monthly
 * rate before it iterates.  A non-indexed cash flow is a nominally fixed
 * amount, so its real value falls with inflation; an indexed cash flow keeps
 * its purchasing power.  All cash flows are applied at the end of a month.
 *
 * This is a deterministic planning model, not a forecast or investment
 * recommendation.  Illiquid assets are reported separately and are not
 * available to fund withdrawals.
 */

export type RetirementPhase = "accumulation" | "retirement";

export type RetirementCashflow = {
  id?: string;
  label?: string;
  /** First age at which the row is active (inclusive). */
  startAge: number;
  /** Age at which the row stops being active (exclusive). */
  endAge: number;
  /** Positive monthly contribution while the row is active. */
  contribution?: number;
  /** Positive monthly withdrawal while the row is active. */
  withdrawal?: number;
  /** Per-row override. Defaults to indexContributions/indexWithdrawals. */
  indexContribution?: boolean;
  indexWithdrawal?: boolean;
};

export type RetirementStrategyConfig = {
  /** Optional desired terminal reserve in today's money. */
  requiredReserve?: number;
  /** Extra monthly contribution during accumulation, solved independently. */
  additionalMonthly?: number;
  /** Extra one-time contribution at retirement, solved independently. */
  additionalLumpSum?: number;
  /** Optional desired monthly retirement withdrawal. */
  maxMonthlyWithdrawal?: number;
  /** Preserve through the selected life expectancy or indefinitely. */
  preserveMode?: "lifespan" | "perpetuity";
};

export type RetirementConfig = {
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  liquidAssets: number;
  illiquidAssets: number;
  /** Monthly income before retirement, used for display and fallbacks. */
  monthlyIncome: number;
  /** Monthly expenses in today's money. */
  monthlyExpenses: number;
  /** Base monthly accumulation contribution. */
  monthlyContribution: number;
  /** Base monthly retirement withdrawal. */
  monthlyWithdrawal: number;
  /** Nominal annual portfolio return (0.10 means 10%). */
  annualReturn: number;
  /** Annual inflation (0.04 means 4%). */
  inflation: number;
  /** Nominal annual return after retirement when the flag is enabled. */
  postRetirementReturn: number;
  /** Use postRetirementReturn rather than annualReturn after retirement. */
  differentPostRetirementRate: boolean;
  /** Keep contributions at their current purchasing power. */
  indexContributions: boolean;
  /** Keep withdrawals at their current purchasing power. */
  indexWithdrawals: boolean;
  cashflows?: RetirementCashflow[];
  strategy?: RetirementStrategyConfig;
  /** Optional annual CDI used by the UI to derive annualReturn. */
  cdiRate?: number;
  /** Optional percentage of CDI (e.g. 130 means 130% of CDI). */
  returnOverCdi?: number;
  /** Compatibility aliases accepted by the runtime validator. */
  income?: number;
  expenses?: number;
};

export type RetirementProjectionPoint = {
  month: number;
  age: number;
  phase: RetirementPhase;
  balance: number;
  /** Alias useful to chart consumers. */
  reserve: number;
  interest: number;
  contribution: number;
  withdrawal: number;
  requestedWithdrawal: number;
  withdrawalShortfall: number;
  liquidAssets: number;
  illiquidAssets: number;
};

export type RetirementStrategyResult = {
  kind: "consume" | "preserve";
  preserveMode: "lifespan" | "perpetuity";
  available: boolean;
  reason?: string;
  /** Reserve required at retirement for the base withdrawal and terminal goal. */
  requiredReserve: number | null;
  /** Extra monthly contribution needed, assuming no extra lump sum. */
  additionalMonthly: number | null;
  /** Extra retirement-date lump sum needed, assuming no extra monthly amount. */
  additionalLumpSum: number | null;
  /** Maximum monthly base withdrawal under the strategy. */
  maxMonthlyWithdrawal: number | null;
  startingReserve: number;
  terminalReserve: number | null;
  endingReserve: number | null;
  /** Whether the unmodified scenario funded every withdrawal. */
  baseScenarioFeasible: boolean;
  projectedShortfall: number;
  depleted: boolean;
};

export type RetirementProjection = {
  valid: boolean;
  errors: string[];
  points: RetirementProjectionPoint[];
  /** Alias for consumers that call the series `series`. */
  series: RetirementProjectionPoint[];
  accumulationMonths: number;
  retirementMonths: number;
  retirementBalance: number;
  endingBalance: number;
  totalContributions: number;
  totalWithdrawals: number;
  totalWithdrawalShortfall: number;
  depleted: boolean;
  depletionMonth: number | null;
  liquidAssets: number;
  illiquidAssets: number;
  /** True when an internal arithmetic result exceeded the finite display bound. */
  overflowed: boolean;
  consume: RetirementStrategyResult;
  preserve: RetirementStrategyResult;
};

export type RetirementAnalysis = {
  config: RetirementConfig;
  projection: RetirementProjection;
  series: RetirementProjectionPoint[];
  consume: RetirementStrategyResult;
  preserve: RetirementStrategyResult;
  diagnostics: string[];
};

const MAX_AGE = 150;
const MAX_MONTHS = MAX_AGE * 12;
const MAX_CASHFLOWS = 500;
const MAX_MONEY = 1_000_000_000_000;
const MAX_RESULT = Number.MAX_SAFE_INTEGER / 100;
const EPS = 1e-12;

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const nonNegative = (value: unknown): value is number =>
  finite(value) && value >= 0 && value <= MAX_MONEY;

const validRate = (value: unknown): value is number =>
  finite(value) && value > -1 && value <= 10;

const validCdiPercentage = (value: unknown): value is number =>
  finite(value) && value >= 0 && value <= 1_000;

function cap(value: number): number {
  if (!Number.isFinite(value)) return value > 0 ? MAX_RESULT : 0;
  if (value > MAX_RESULT) return MAX_RESULT;
  if (value < -MAX_RESULT) return -MAX_RESULT;
  return value;
}

function safeAdd(left: number, right: number): number {
  return cap(left + right);
}

function safeMultiply(left: number, right: number): number {
  return cap(left * right);
}

function safePow(base: number, exponent: number): number {
  if (!finite(base) || base <= 0 || !finite(exponent)) return MAX_RESULT;
  const value = Math.exp(
    Math.min(700, Math.max(-700, Math.log(base) * exponent)),
  );
  return cap(value);
}

function realMonthlyRate(
  nominalAnnual: number,
  inflationAnnual: number,
): number {
  const nominalFactor = Math.pow(Math.max(EPS, 1 + nominalAnnual), 1 / 12);
  const inflationFactor = Math.pow(Math.max(EPS, 1 + inflationAnnual), 1 / 12);
  return cap(nominalFactor / inflationFactor - 1);
}

function monthlyAmount(
  base: number,
  indexed: boolean,
  inflationAnnual: number,
  absoluteMonth: number,
): number {
  if (base <= 0) return 0;
  if (indexed) return base;
  return cap(base / safePow(1 + inflationAnnual, absoluteMonth / 12));
}

function monthsBetween(startAge: number, endAge: number): number {
  const months = Math.floor((endAge - startAge) * 12 + EPS);
  return Math.max(0, Math.min(MAX_MONTHS, months));
}

function ageInMonths(age: number): number {
  return Math.floor(age * 12 + EPS);
}

function isValidCashflow(value: unknown, index: number): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [`cashflows[${index}] precisa ser um objeto`];
  }
  const row = value as Record<string, unknown>;
  const errors: string[] = [];
  if (!finite(row.startAge) || row.startAge < 0 || row.startAge > MAX_AGE) {
    errors.push(`cashflows[${index}].startAge inválido`);
  }
  if (!finite(row.endAge) || row.endAge < 0 || row.endAge > MAX_AGE) {
    errors.push(`cashflows[${index}].endAge inválido`);
  }
  if (finite(row.startAge) && finite(row.endAge) && row.endAge < row.startAge) {
    errors.push(`cashflows[${index}] termina antes de começar`);
  }
  for (const key of ["contribution", "withdrawal"]) {
    if (row[key] !== undefined && !nonNegative(row[key])) {
      errors.push(`cashflows[${index}].${key} inválido`);
    }
  }
  for (const key of ["indexContribution", "indexWithdrawal"]) {
    if (row[key] !== undefined && typeof row[key] !== "boolean") {
      errors.push(`cashflows[${index}].${key} inválido`);
    }
  }
  if (row.id !== undefined && typeof row.id !== "string") {
    errors.push(`cashflows[${index}].id inválido`);
  }
  if (row.label !== undefined && typeof row.label !== "string") {
    errors.push(`cashflows[${index}].label inválido`);
  }
  return errors;
}

function validateStrategy(value: unknown): string[] {
  if (value === undefined) return [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return ["strategy precisa ser um objeto"];
  }
  const strategy = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of [
    "requiredReserve",
    "additionalMonthly",
    "additionalLumpSum",
    "maxMonthlyWithdrawal",
  ]) {
    if (strategy[key] !== undefined && !nonNegative(strategy[key])) {
      errors.push(`strategy.${key} inválido`);
    }
  }
  if (
    strategy.preserveMode !== undefined &&
    strategy.preserveMode !== "lifespan" &&
    strategy.preserveMode !== "perpetuity"
  ) {
    errors.push("strategy.preserveMode inválido");
  }
  return errors;
}

/** Return all domain errors without throwing or silently correcting input. */
export function validateRetirementConfig(config: unknown): string[] {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return ["configuração de aposentadoria precisa ser um objeto"];
  }
  const value = config as Record<string, unknown>;
  const errors: string[] = [];
  const ages: Array<[string, unknown]> = [
    ["currentAge", value.currentAge],
    ["retirementAge", value.retirementAge],
    ["lifeExpectancy", value.lifeExpectancy],
  ];
  for (const [key, raw] of ages) {
    if (!finite(raw) || raw < 0 || raw > MAX_AGE) {
      errors.push(`${key} inválido`);
    }
  }
  if (
    finite(value.currentAge) &&
    finite(value.retirementAge) &&
    value.retirementAge <= value.currentAge
  ) {
    errors.push("retirementAge precisa ser maior que currentAge");
  }
  if (
    finite(value.retirementAge) &&
    finite(value.lifeExpectancy) &&
    value.lifeExpectancy <= value.retirementAge
  ) {
    errors.push("lifeExpectancy precisa ser maior que retirementAge");
  }

  const amounts = [
    "liquidAssets",
    "illiquidAssets",
    "monthlyIncome",
    "monthlyExpenses",
    "monthlyContribution",
    "monthlyWithdrawal",
  ];
  for (const key of amounts) {
    if (!nonNegative(value[key])) errors.push(`${key} inválido`);
  }
  if (value.income !== undefined && !nonNegative(value.income))
    errors.push("income inválido");
  if (value.expenses !== undefined && !nonNegative(value.expenses))
    errors.push("expenses inválido");

  for (const key of ["annualReturn", "inflation", "postRetirementReturn"]) {
    if (!validRate(value[key])) errors.push(`${key} inválido`);
  }
  if (value.cdiRate !== undefined && !validRate(value.cdiRate))
    errors.push("cdiRate inválido");
  if (
    value.returnOverCdi !== undefined &&
    !validCdiPercentage(value.returnOverCdi)
  )
    errors.push("returnOverCdi inválido");
  for (const key of [
    "differentPostRetirementRate",
    "indexContributions",
    "indexWithdrawals",
  ]) {
    if (typeof value[key] !== "boolean") errors.push(`${key} inválido`);
  }
  if (value.cashflows !== undefined) {
    if (
      !Array.isArray(value.cashflows) ||
      value.cashflows.length > MAX_CASHFLOWS
    ) {
      errors.push("cashflows inválido");
    } else {
      value.cashflows.forEach((row, index) =>
        errors.push(...isValidCashflow(row, index)),
      );
    }
  }
  errors.push(...validateStrategy(value.strategy));
  return errors;
}

export const DEFAULT_RETIREMENT: RetirementConfig = {
  currentAge: 30,
  retirementAge: 60,
  lifeExpectancy: 90,
  liquidAssets: 0,
  illiquidAssets: 0,
  monthlyIncome: 5_000,
  monthlyExpenses: 3_000,
  monthlyContribution: 2_000,
  monthlyWithdrawal: 3_000,
  annualReturn: 0.1,
  inflation: 0.04,
  postRetirementReturn: 0.06,
  differentPostRetirementRate: true,
  indexContributions: true,
  indexWithdrawals: true,
  cashflows: [],
  strategy: { preserveMode: "lifespan" },
};

function normalizeConfig(input: unknown): RetirementConfig {
  const value: Partial<RetirementConfig> =
    typeof input === "object" && input !== null && !Array.isArray(input)
      ? (input as Partial<RetirementConfig>)
      : {};
  const monthlyIncome = finite(value.monthlyIncome)
    ? value.monthlyIncome
    : finite(value.income)
      ? value.income
      : DEFAULT_RETIREMENT.monthlyIncome;
  const monthlyExpenses = finite(value.monthlyExpenses)
    ? value.monthlyExpenses
    : finite(value.expenses)
      ? value.expenses
      : DEFAULT_RETIREMENT.monthlyExpenses;
  const annualReturn = finite(value.annualReturn)
    ? value.annualReturn
    : finite(value.cdiRate) && finite(value.returnOverCdi)
      ? (value.cdiRate * value.returnOverCdi) / 100
      : DEFAULT_RETIREMENT.annualReturn;
  const cashflows = Array.isArray(value.cashflows)
    ? value.cashflows.map((row) => ({
        ...row,
        contribution: row.contribution ?? 0,
        withdrawal: row.withdrawal ?? 0,
      }))
    : [];
  return {
    ...DEFAULT_RETIREMENT,
    ...value,
    monthlyIncome,
    monthlyExpenses,
    annualReturn,
    cashflows,
    strategy: { ...DEFAULT_RETIREMENT.strategy, ...(value.strategy ?? {}) },
  };
}

type SchedulePoint = {
  contribution: number;
  withdrawal: number;
};

function scheduledCashflows(
  config: RetirementConfig,
  absoluteMonth: number,
  phase: RetirementPhase,
): SchedulePoint {
  // A row belongs to the age at the beginning of the month.  Therefore month
  // one at age 30 is still in the [30,31) window and month 13 is the first
  // month in the [31,32) window.
  const ageMonths =
    ageInMonths(config.currentAge) + Math.max(0, absoluteMonth - 1);
  let contribution =
    phase === "accumulation"
      ? monthlyAmount(
          config.monthlyContribution,
          config.indexContributions,
          config.inflation,
          absoluteMonth,
        )
      : 0;
  let withdrawal =
    phase === "retirement"
      ? monthlyAmount(
          config.monthlyWithdrawal,
          config.indexWithdrawals,
          config.inflation,
          absoluteMonth,
        )
      : 0;
  for (const row of config.cashflows ?? []) {
    const start = ageInMonths(row.startAge);
    const end = ageInMonths(row.endAge);
    if (ageMonths < start || ageMonths >= end) continue;
    contribution = safeAdd(
      contribution,
      monthlyAmount(
        row.contribution ?? 0,
        row.indexContribution ?? config.indexContributions,
        config.inflation,
        absoluteMonth,
      ),
    );
    withdrawal = safeAdd(
      withdrawal,
      monthlyAmount(
        row.withdrawal ?? 0,
        row.indexWithdrawal ?? config.indexWithdrawals,
        config.inflation,
        absoluteMonth,
      ),
    );
  }
  return { contribution, withdrawal };
}

function projectSeries(config: RetirementConfig): {
  points: RetirementProjectionPoint[];
  accumulationMonths: number;
  retirementMonths: number;
  retirementBalance: number;
  endingBalance: number;
  totalContributions: number;
  totalWithdrawals: number;
  totalWithdrawalShortfall: number;
  depleted: boolean;
  depletionMonth: number | null;
  overflowed: boolean;
} {
  const accumulationMonths = monthsBetween(
    config.currentAge,
    config.retirementAge,
  );
  const retirementMonths = monthsBetween(
    config.retirementAge,
    config.lifeExpectancy,
  );
  const totalMonths = Math.min(
    MAX_MONTHS,
    accumulationMonths + retirementMonths,
  );
  const preRate = realMonthlyRate(config.annualReturn, config.inflation);
  const postAnnualRate = config.differentPostRetirementRate
    ? config.postRetirementReturn
    : config.annualReturn;
  const postRate = realMonthlyRate(postAnnualRate, config.inflation);
  const points: RetirementProjectionPoint[] = [
    {
      month: 0,
      age: config.currentAge,
      phase: "accumulation",
      balance: cap(config.liquidAssets),
      reserve: cap(config.liquidAssets),
      interest: 0,
      contribution: 0,
      withdrawal: 0,
      requestedWithdrawal: 0,
      withdrawalShortfall: 0,
      liquidAssets: cap(config.liquidAssets),
      illiquidAssets: cap(config.illiquidAssets),
    },
  ];
  let balance = cap(config.liquidAssets);
  let totalContributions = 0;
  let totalWithdrawals = 0;
  let totalWithdrawalShortfall = 0;
  let depletionMonth: number | null = null;
  let overflowed = false;

  for (let month = 1; month <= totalMonths; month += 1) {
    const phase: RetirementPhase =
      month <= accumulationMonths ? "accumulation" : "retirement";
    const rate = phase === "accumulation" ? preRate : postRate;
    const before = balance;
    const interest = safeMultiply(before, rate);
    const schedule = scheduledCashflows(config, month, phase);
    const availableAfterContribution = Math.max(
      0,
      safeAdd(safeAdd(before, interest), schedule.contribution),
    );
    const withdrawal = Math.min(
      schedule.withdrawal,
      availableAfterContribution,
    );
    const shortfall = Math.max(0, schedule.withdrawal - withdrawal);
    balance = Math.max(0, cap(availableAfterContribution - withdrawal));
    if (
      Math.abs(before) >= MAX_RESULT ||
      Math.abs(interest) >= MAX_RESULT ||
      Math.abs(schedule.contribution) >= MAX_RESULT ||
      Math.abs(schedule.withdrawal) >= MAX_RESULT ||
      Math.abs(balance) >= MAX_RESULT
    ) {
      overflowed = true;
    }
    if (shortfall > 0 && depletionMonth === null) depletionMonth = month;
    totalContributions = safeAdd(totalContributions, schedule.contribution);
    totalWithdrawals = safeAdd(totalWithdrawals, withdrawal);
    totalWithdrawalShortfall = safeAdd(totalWithdrawalShortfall, shortfall);
    points.push({
      month,
      age: config.currentAge + month / 12,
      phase,
      balance,
      reserve: balance,
      interest,
      contribution: schedule.contribution,
      withdrawal,
      requestedWithdrawal: schedule.withdrawal,
      withdrawalShortfall: shortfall,
      liquidAssets: balance,
      illiquidAssets: cap(config.illiquidAssets),
    });
  }
  return {
    points,
    accumulationMonths,
    retirementMonths,
    retirementBalance: points[accumulationMonths]?.balance ?? balance,
    endingBalance: balance,
    totalContributions,
    totalWithdrawals,
    totalWithdrawalShortfall,
    depleted: depletionMonth !== null,
    depletionMonth,
    overflowed,
  };
}

function presentValue(values: number[], monthlyRate: number): number {
  let factor = 1;
  let value = 0;
  for (const amount of values) {
    factor = safeMultiply(factor, 1 + monthlyRate);
    if (factor <= 0 || !finite(factor)) return MAX_RESULT;
    value = safeAdd(value, amount / factor);
  }
  return Math.max(0, cap(value));
}

function futureValueOfContributions(
  values: number[],
  monthlyRate: number,
): number {
  let value = 0;
  for (const amount of values)
    value = safeAdd(safeMultiply(value, 1 + monthlyRate), amount);
  return Math.max(0, cap(value));
}

function fallbackStrategy(
  kind: "consume" | "preserve",
  mode: "lifespan" | "perpetuity",
  startingReserve: number,
  reason: string,
): RetirementStrategyResult {
  return {
    kind,
    preserveMode: mode,
    available: false,
    reason,
    requiredReserve: null,
    additionalMonthly: null,
    additionalLumpSum: null,
    maxMonthlyWithdrawal: null,
    startingReserve,
    terminalReserve: null,
    endingReserve: null,
    baseScenarioFeasible: false,
    projectedShortfall: 0,
    depleted: false,
  };
}

function strategyResults(
  config: RetirementConfig,
  base: ReturnType<typeof projectSeries>,
): { consume: RetirementStrategyResult; preserve: RetirementStrategyResult } {
  const mode = config.strategy?.preserveMode ?? "lifespan";
  const start = base.retirementBalance;
  const preMonths = base.accumulationMonths;
  const postMonths = base.retirementMonths;
  const postAnnualRate = config.differentPostRetirementRate
    ? config.postRetirementReturn
    : config.annualReturn;
  const postRate = realMonthlyRate(postAnnualRate, config.inflation);
  const preRate = realMonthlyRate(config.annualReturn, config.inflation);

  if (base.overflowed) {
    const reason = "a projeção excedeu o limite numérico seguro";
    return {
      consume: fallbackStrategy("consume", mode, start, reason),
      preserve: fallbackStrategy("preserve", mode, start, reason),
    };
  }
  if (postMonths <= 0) {
    const reason = "o período após a aposentadoria precisa ter ao menos um mês";
    return {
      consume: fallbackStrategy("consume", mode, start, reason),
      preserve: fallbackStrategy("preserve", mode, start, reason),
    };
  }

  const postContributions: number[] = [];
  const postOtherWithdrawals: number[] = [];
  const postBaseWithdrawals: number[] = [];
  const unitWithdrawals: number[] = [];
  for (let index = 1; index <= postMonths; index += 1) {
    const month = preMonths + index;
    const schedule = scheduledCashflows(config, month, "retirement");
    const baseWithdrawal = monthlyAmount(
      config.monthlyWithdrawal,
      config.indexWithdrawals,
      config.inflation,
      month,
    );
    postContributions.push(schedule.contribution);
    postBaseWithdrawals.push(baseWithdrawal);
    postOtherWithdrawals.push(
      Math.max(0, schedule.withdrawal - baseWithdrawal),
    );
    unitWithdrawals.push(
      monthlyAmount(1, config.indexWithdrawals, config.inflation, month),
    );
  }

  /**
   * Backward cash-flow recurrence.  Unlike a terminal-value subtraction, it
   * keeps every intermediate reserve non-negative, so an early withdrawal
   * cannot be hidden by a later contribution.
   */
  const requiredFor = (baseAmount: number, terminal: number): number => {
    let need = Math.max(0, terminal);
    const denominator = Math.max(EPS, 1 + postRate);
    for (let index = postMonths - 1; index >= 0; index -= 1) {
      const withdrawal =
        postOtherWithdrawals[index] + baseAmount * unitWithdrawals[index];
      const numerator = need + withdrawal - postContributions[index];
      need = numerator > 0 ? cap(numerator / denominator) : 0;
      if (need >= MAX_RESULT) return MAX_RESULT;
    }
    return Math.max(0, cap(need));
  };

  const simulateAccumulation = (
    extraMonthly: number,
  ): { balance: number; feasible: boolean; overflowed: boolean } => {
    let balance = cap(config.liquidAssets);
    let feasible = true;
    let overflowed = false;
    for (let month = 1; month <= preMonths; month += 1) {
      const schedule = scheduledCashflows(config, month, "accumulation");
      const extra = monthlyAmount(
        extraMonthly,
        config.indexContributions,
        config.inflation,
        month,
      );
      const next = safeAdd(
        safeAdd(safeMultiply(balance, 1 + preRate), schedule.contribution),
        extra - schedule.withdrawal,
      );
      if (next < -EPS) feasible = false;
      if (Math.abs(next) >= MAX_RESULT) overflowed = true;
      balance = Math.max(0, cap(next));
    }
    return { balance, feasible, overflowed };
  };

  const solveAdditionalMonthly = (required: number): number | null => {
    const zero = simulateAccumulation(0);
    if (!zero.overflowed && zero.feasible && zero.balance + EPS >= required)
      return 0;
    if (preMonths <= 0) return null;
    let low = 0;
    let high = Math.max(1, required / Math.max(1, preMonths));
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const result = simulateAccumulation(high);
      if (
        !result.overflowed &&
        result.feasible &&
        result.balance + EPS >= required
      ) {
        for (let iteration = 0; iteration < 70; iteration += 1) {
          const middle = (low + high) / 2;
          const trial = simulateAccumulation(middle);
          if (
            !trial.overflowed &&
            trial.feasible &&
            trial.balance + EPS >= required
          )
            high = middle;
          else low = middle;
        }
        return cap(high);
      }
      if (high >= MAX_MONEY) return null;
      high = Math.min(MAX_MONEY, high * 2);
    }
    return null;
  };

  const baseAccumulation = simulateAccumulation(0);
  const baseScenarioFeasible = !base.depleted && baseAccumulation.feasible;
  const preRetirementReason = baseAccumulation.feasible
    ? undefined
    : "o cenário base tem retiradas não financiadas antes da aposentadoria";

  const solveMaxWithdrawal = (
    terminal: number,
    terminalForBase: (baseAmount: number) => number = () => terminal,
  ): number | null => {
    const canFund = (amount: number) =>
      requiredFor(amount, terminalForBase(amount)) <= start + 1e-7;
    if (!canFund(0)) return null;
    let low = 0;
    let high = Math.max(1, start / Math.max(1, postMonths));
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (!canFund(high)) {
        for (let iteration = 0; iteration < 70; iteration += 1) {
          const middle = (low + high) / 2;
          if (canFund(middle)) low = middle;
          else high = middle;
        }
        return cap(low);
      }
      if (high >= MAX_MONEY) return null;
      low = high;
      high = Math.min(MAX_MONEY, high * 2);
    }
    return null;
  };

  const requestedTerminal = config.strategy?.requiredReserve ?? 0;
  const preserveTerminal = config.strategy?.requiredReserve ?? start;
  const consumeReserve = requiredFor(
    config.monthlyWithdrawal,
    requestedTerminal,
  );
  if (!finite(consumeReserve) || consumeReserve >= MAX_RESULT) {
    const unavailable = fallbackStrategy(
      "consume",
      mode,
      start,
      "a reserva necessária excede o limite numérico seguro",
    );
    unavailable.baseScenarioFeasible = baseScenarioFeasible;
    unavailable.projectedShortfall = base.totalWithdrawalShortfall;
    unavailable.depleted = base.depleted;
    return {
      consume: unavailable,
      preserve: fallbackStrategy(
        "preserve",
        mode,
        start,
        "a reserva necessária excede o limite numérico seguro",
      ),
    };
  }
  const consumeAdditionalMonthly = solveAdditionalMonthly(consumeReserve);
  const consumeAdditionalLump = baseAccumulation.feasible
    ? Math.max(0, cap(consumeReserve - start))
    : null;
  const consume: RetirementStrategyResult = {
    kind: "consume",
    preserveMode: mode,
    available: true,
    reason: preRetirementReason,
    requiredReserve: consumeReserve,
    additionalMonthly: consumeAdditionalMonthly,
    additionalLumpSum: consumeAdditionalLump,
    maxMonthlyWithdrawal: solveMaxWithdrawal(requestedTerminal),
    startingReserve: start,
    terminalReserve: requestedTerminal,
    endingReserve: base.endingBalance,
    baseScenarioFeasible,
    projectedShortfall: base.totalWithdrawalShortfall,
    depleted: base.depleted,
  };

  let preserve: RetirementStrategyResult;
  if (mode === "perpetuity") {
    // With a positive real monthly return and indexed withdrawals, a
    // perpetuity has a finite reserve.  Otherwise it is deliberately marked
    // unavailable instead of presenting a misleading zero requirement.
    if (!config.indexWithdrawals || postRate <= EPS) {
      preserve = fallbackStrategy(
        "preserve",
        mode,
        start,
        "preservação perpétua exige retirada indexada e taxa real mensal positiva",
      );
      preserve.reason = preRetirementReason ?? preserve.reason;
      preserve.baseScenarioFeasible = baseScenarioFeasible;
      preserve.projectedShortfall = base.totalWithdrawalShortfall;
      preserve.depleted = base.depleted;
    } else {
      const perpetuityTerminal = (amount: number) => cap(amount / postRate);
      const perpetualReserve = requiredFor(
        config.monthlyWithdrawal,
        perpetuityTerminal(config.monthlyWithdrawal),
      );
      if (perpetualReserve >= MAX_RESULT || !finite(perpetualReserve)) {
        preserve = fallbackStrategy(
          "preserve",
          mode,
          start,
          "a reserva perpétua excede o limite numérico seguro",
        );
        preserve.reason = preRetirementReason ?? preserve.reason;
        preserve.baseScenarioFeasible = baseScenarioFeasible;
        preserve.projectedShortfall = base.totalWithdrawalShortfall;
        preserve.depleted = base.depleted;
      } else {
        preserve = {
          kind: "preserve",
          preserveMode: mode,
          available: true,
          reason: preRetirementReason,
          requiredReserve: perpetualReserve,
          additionalMonthly: solveAdditionalMonthly(perpetualReserve),
          additionalLumpSum: baseAccumulation.feasible
            ? Math.max(0, cap(perpetualReserve - start))
            : null,
          maxMonthlyWithdrawal: solveMaxWithdrawal(0, perpetuityTerminal),
          startingReserve: start,
          terminalReserve: null,
          endingReserve: null,
          baseScenarioFeasible,
          projectedShortfall: base.totalWithdrawalShortfall,
          depleted: base.depleted,
        };
      }
    }
  } else {
    const preserveReserve = requiredFor(
      config.monthlyWithdrawal,
      preserveTerminal,
    );
    if (preserveReserve >= MAX_RESULT || !finite(preserveReserve)) {
      preserve = fallbackStrategy(
        "preserve",
        mode,
        start,
        "a reserva necessária excede o limite numérico seguro",
      );
      preserve.reason = preRetirementReason ?? preserve.reason;
      preserve.baseScenarioFeasible = baseScenarioFeasible;
      preserve.projectedShortfall = base.totalWithdrawalShortfall;
      preserve.depleted = base.depleted;
    } else {
      preserve = {
        kind: "preserve",
        preserveMode: mode,
        available: true,
        reason: preRetirementReason,
        requiredReserve: preserveReserve,
        additionalMonthly: solveAdditionalMonthly(preserveReserve),
        additionalLumpSum: baseAccumulation.feasible
          ? Math.max(0, cap(preserveReserve - start))
          : null,
        maxMonthlyWithdrawal: solveMaxWithdrawal(preserveTerminal),
        startingReserve: start,
        terminalReserve: preserveTerminal,
        endingReserve: base.endingBalance,
        baseScenarioFeasible,
        projectedShortfall: base.totalWithdrawalShortfall,
        depleted: base.depleted,
      };
    }
  }
  return { consume, preserve };
}

/** Project the liquid reserve and solve both retirement strategies. */
export function projectRetirement(
  config: RetirementConfig,
): RetirementProjection {
  const errors = validateRetirementConfig(config);
  if (errors.length > 0) {
    const unavailable = fallbackStrategy(
      "consume",
      "lifespan",
      0,
      "configuração inválida",
    );
    const unavailablePreserve = fallbackStrategy(
      "preserve",
      "lifespan",
      0,
      "configuração inválida",
    );
    return {
      valid: false,
      errors,
      points: [],
      series: [],
      accumulationMonths: 0,
      retirementMonths: 0,
      retirementBalance: 0,
      endingBalance: 0,
      totalContributions: 0,
      totalWithdrawals: 0,
      totalWithdrawalShortfall: 0,
      depleted: false,
      depletionMonth: null,
      liquidAssets: 0,
      illiquidAssets: 0,
      overflowed: false,
      consume: unavailable,
      preserve: unavailablePreserve,
    };
  }
  const safe = normalizeConfig(config);
  const base = projectSeries(safe);
  const strategies = strategyResults(safe, base);
  const projectionErrors = base.overflowed
    ? ["a projeção excedeu o limite numérico seguro"]
    : [];
  return {
    valid: projectionErrors.length === 0,
    errors: projectionErrors,
    points: base.points,
    series: base.points,
    accumulationMonths: base.accumulationMonths,
    retirementMonths: base.retirementMonths,
    retirementBalance: base.retirementBalance,
    endingBalance: base.endingBalance,
    totalContributions: base.totalContributions,
    totalWithdrawals: base.totalWithdrawals,
    totalWithdrawalShortfall: base.totalWithdrawalShortfall,
    depleted: base.depleted,
    depletionMonth: base.depletionMonth,
    liquidAssets: safe.liquidAssets,
    illiquidAssets: safe.illiquidAssets,
    overflowed: base.overflowed,
    ...strategies,
  };
}

/** Return the projection, strategy cards, and concise user-facing diagnostics. */
export function analyzeRetirement(
  config: RetirementConfig,
): RetirementAnalysis {
  const projection = projectRetirement(config);
  const diagnostics: string[] = [];
  if (!projection.valid) diagnostics.push(...projection.errors);
  if (projection.illiquidAssets > 0) {
    diagnostics.push(
      "ativos ilíquidos não foram usados para financiar retiradas",
    );
  }
  if (projection.depleted) {
    diagnostics.push("a reserva líquida se esgota antes do fim do horizonte");
  }
  if (projection.preserve.available === false && projection.preserve.reason) {
    diagnostics.push(projection.preserve.reason);
  }
  return {
    config: normalizeConfig(config),
    projection,
    series: projection.series,
    consume: projection.consume,
    preserve: projection.preserve,
    diagnostics,
  };
}
