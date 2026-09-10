import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtBRL, fmtPct } from "./lib/calculos";
import type { PlannerConfig } from "./lib/planner";
import {
  analyzeRetirement,
  type RetirementConfig as EngineRetirementConfig,
} from "./lib/retirement";
import "./retirement-dashboard.css";

const SCENARIO_STORAGE_KEY = "simulador_aposentadoria_cenarios_v1";
const MAX_MONEY = 1_000_000_000_000;
const MIN_AGE = 18;
const MAX_AGE = 110;
const COLORS = ["#3d83c6", "#e4aa43"];

export type RetirementCashflow = {
  id: string;
  startAge: number;
  endAge: number;
  monthlyContribution: number;
  monthlyWithdrawal: number;
};

export type RetirementValues = {
  liquidAssets: number;
  illiquidAssets: number;
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  cdiAnnualPct: number;
  cdiPct: number;
  inflationPct: number;
  usePostRetirementReturn: boolean;
  postRetirementReturnPct: number;
  realMode: boolean;
  indexContributions: boolean;
  indexWithdrawals: boolean;
  monthlyIncome: number;
  monthlyExpenses: number;
  desiredRetirementIncome: number;
  strategy: "consume" | "preserve";
  preserveMode: "lifespan" | "perpetuity";
  reportIntervalYears: number;
  successionCostPct: number;
  cashflows: RetirementCashflow[];
};

export type RetirementScenario = {
  id: string;
  name: string;
  savedAt: string;
  values: RetirementValues;
};

export type RetirementDashboardProps = {
  initialConfig: PlannerConfig;
  onChange?: (config: PlannerConfig) => void;
};

type ProjectionPoint = {
  month: number;
  age: number;
  balance: number;
  realBalance: number;
  contributions: number;
  withdrawals: number;
  realContributions: number;
  realWithdrawals: number;
  nominalContributions: number;
  nominalWithdrawals: number;
  contribution: number;
  withdrawal: number;
};

type RetirementModel = {
  points: ProjectionPoint[];
  reserveAtRetirement: number;
  reserveAtRetirementReal: number;
  finalBalance: number;
  finalBalanceReal: number;
  totalContributions: number;
  totalWithdrawals: number;
  annualReturn: number;
  postRetirementReturn: number;
  realReturn: number;
  postRetirementRealReturn: number;
  reserveTarget: number | null;
  reserveTargetReal: number | null;
  additionalMonthly: number | null;
  additionalLumpSum: number | null;
  consumeMonthly: number | null;
  preserveAdditionalMonthly: number | null;
  preserveAdditionalLumpSum: number | null;
  preserveMonthly: number | null;
  preserveTarget: number | null;
  preserveTargetReal: number | null;
  preserveReason?: string;
  withdrawalShortfall: number;
  depletionAge: number | null;
  error?: string;
};

type ReportPoint = ProjectionPoint & { label: string };

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

const safeNumber = (
  value: string,
  fallback: number,
  min: number,
  max: number,
) => {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
};

const idFor = () =>
  `cf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const formatMoney = (value: number) =>
  Number.isFinite(value) ? fmtBRL(value) : "—";
const formatPercent = (value: number) =>
  Number.isFinite(value) ? fmtPct(value) : "—";
const formatMaybeMoney = (value: number | null | undefined) =>
  value === null || value === undefined ? "Não disponível" : formatMoney(value);
const axisMoney = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const defaultValues = (config: PlannerConfig): RetirementValues => {
  const startingRate = clamp(config.rate * 100, -99, 1000);
  const cdiAnnualPct = startingRate < 0 ? -10 : 10;
  const cdiPct = clamp((startingRate / cdiAnnualPct) * 100, 0, 500);
  const currentAge = 30;
  const retirementAge = clamp(
    currentAge + Math.max(1, Math.round(config.years)),
    currentAge + 1,
    100,
  );
  return {
    liquidAssets: clamp(config.initial, 0, MAX_MONEY),
    illiquidAssets: 0,
    currentAge,
    retirementAge,
    lifeExpectancy: Math.max(retirementAge + 1, 90),
    cdiAnnualPct,
    cdiPct,
    inflationPct: clamp(config.inflation * 100, -99, 1000),
    usePostRetirementReturn: false,
    postRetirementReturnPct: startingRate,
    realMode: config.inflationAdjusted,
    indexContributions: false,
    indexWithdrawals: true,
    monthlyIncome: Math.max(3000, config.monthly * 10),
    monthlyExpenses: Math.max(2100, config.monthly * 7),
    desiredRetirementIncome: Math.max(2500, config.monthly * 8),
    strategy: "consume",
    preserveMode: "perpetuity",
    reportIntervalYears: 1,
    successionCostPct: 0,
    cashflows: [
      {
        id: "initial-cashflow",
        startAge: currentAge,
        endAge: retirementAge,
        monthlyContribution: clamp(config.monthly, 0, MAX_MONEY),
        monthlyWithdrawal: 0,
      },
    ],
  };
};

const normalizeCashflow = (flow: RetirementCashflow): RetirementCashflow => {
  const startAge = clamp(Math.round(flow.startAge), MIN_AGE, MAX_AGE - 1);
  return {
    id: typeof flow.id === "string" && flow.id ? flow.id : idFor(),
    startAge,
    endAge: clamp(
      Math.max(startAge + 1, Math.round(flow.endAge)),
      startAge + 1,
      MAX_AGE,
    ),
    monthlyContribution: clamp(flow.monthlyContribution, 0, MAX_MONEY),
    monthlyWithdrawal: clamp(flow.monthlyWithdrawal, 0, MAX_MONEY),
  };
};

const normalizeValues = (
  raw: Partial<RetirementValues>,
  fallback: RetirementValues,
): RetirementValues => {
  const currentAge = clamp(
    Math.round(raw.currentAge ?? fallback.currentAge),
    MIN_AGE,
    85,
  );
  const retirementAge = clamp(
    Math.round(raw.retirementAge ?? fallback.retirementAge),
    currentAge + 1,
    100,
  );
  const lifeExpectancy = clamp(
    Math.round(raw.lifeExpectancy ?? fallback.lifeExpectancy),
    retirementAge + 1,
    MAX_AGE,
  );
  const cashflows = Array.isArray(raw.cashflows)
    ? raw.cashflows
        .filter(
          (flow): flow is RetirementCashflow =>
            !!flow && typeof flow === "object",
        )
        .map(normalizeCashflow)
    : fallback.cashflows.map(normalizeCashflow);
  return {
    successionCostPct: clamp(
      raw.successionCostPct ?? fallback.successionCostPct ?? 0,
      0,
      100,
    ),
    liquidAssets: clamp(
      raw.liquidAssets ?? fallback.liquidAssets,
      0,
      MAX_MONEY,
    ),
    illiquidAssets: clamp(
      raw.illiquidAssets ?? fallback.illiquidAssets,
      0,
      MAX_MONEY,
    ),
    currentAge,
    retirementAge,
    lifeExpectancy,
    cdiAnnualPct: clamp(raw.cdiAnnualPct ?? fallback.cdiAnnualPct, -99, 1000),
    cdiPct: clamp(raw.cdiPct ?? fallback.cdiPct, 0, 500),
    inflationPct: clamp(raw.inflationPct ?? fallback.inflationPct, -99, 1000),
    usePostRetirementReturn: Boolean(
      raw.usePostRetirementReturn ?? fallback.usePostRetirementReturn,
    ),
    postRetirementReturnPct: clamp(
      raw.postRetirementReturnPct ?? fallback.postRetirementReturnPct,
      -99,
      1000,
    ),
    realMode: Boolean(raw.realMode ?? fallback.realMode),
    indexContributions: Boolean(
      raw.indexContributions ?? fallback.indexContributions,
    ),
    indexWithdrawals: Boolean(
      raw.indexWithdrawals ?? fallback.indexWithdrawals,
    ),
    monthlyIncome: clamp(
      raw.monthlyIncome ?? fallback.monthlyIncome,
      0,
      MAX_MONEY,
    ),
    monthlyExpenses: clamp(
      raw.monthlyExpenses ?? fallback.monthlyExpenses,
      0,
      MAX_MONEY,
    ),
    desiredRetirementIncome: clamp(
      raw.desiredRetirementIncome ?? fallback.desiredRetirementIncome,
      0,
      MAX_MONEY,
    ),
    strategy: raw.strategy === "preserve" ? "preserve" : "consume",
    preserveMode: raw.preserveMode === "lifespan" ? "lifespan" : "perpetuity",
    reportIntervalYears: clamp(
      Math.round(raw.reportIntervalYears ?? fallback.reportIntervalYears),
      1,
      20,
    ),
    cashflows,
  };
};

const isRetirementScenario = (value: unknown): value is RetirementScenario => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RetirementScenario>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.savedAt === "string" &&
    !!candidate.values &&
    typeof candidate.values === "object"
  );
};

const isRetirementValues = (value: unknown): value is RetirementValues => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RetirementValues>;
  const numericKeys: Array<keyof RetirementValues> = [
    "liquidAssets",
    "illiquidAssets",
    "currentAge",
    "retirementAge",
    "lifeExpectancy",
    "cdiAnnualPct",
    "cdiPct",
    "inflationPct",
    "postRetirementReturnPct",
    "monthlyIncome",
    "monthlyExpenses",
    "desiredRetirementIncome",
    "reportIntervalYears",
  ];
  if (numericKeys.some((key) => !Number.isFinite(candidate[key] as number)))
    return false;
  if (
    candidate.currentAge! < MIN_AGE ||
    candidate.currentAge! >= candidate.retirementAge! ||
    candidate.retirementAge! >= candidate.lifeExpectancy! ||
    candidate.lifeExpectancy! > MAX_AGE ||
    candidate.cdiPct! < 0 ||
    candidate.cashflows === undefined ||
    !Array.isArray(candidate.cashflows) ||
    candidate.cashflows.length > 500 ||
    candidate.cashflows.some((flow) => {
      if (!flow || typeof flow !== "object") return true;
      return (
        !Number.isFinite(flow.startAge) ||
        !Number.isFinite(flow.endAge) ||
        flow.endAge <= flow.startAge ||
        !Number.isFinite(flow.monthlyContribution) ||
        !Number.isFinite(flow.monthlyWithdrawal)
      );
    })
  )
    return false;
  const normalized = normalizeValues(candidate, candidate as RetirementValues);
  if (numericKeys.some((key) => candidate[key] !== normalized[key]))
    return false;
  if (
    candidate.successionCostPct !== undefined &&
    (!Number.isFinite(candidate.successionCostPct) ||
      candidate.successionCostPct < 0 ||
      candidate.successionCostPct > 100)
  )
    return false;
  if (
    candidate.cashflows.some((flow, index) => {
      const clean = normalized.cashflows[index];
      return (
        !flow.id ||
        flow.id !== clean.id ||
        flow.startAge !== clean.startAge ||
        flow.endAge !== clean.endAge ||
        flow.monthlyContribution !== clean.monthlyContribution ||
        flow.monthlyWithdrawal !== clean.monthlyWithdrawal
      );
    })
  )
    return false;
  return (
    typeof candidate.usePostRetirementReturn === "boolean" &&
    typeof candidate.realMode === "boolean" &&
    typeof candidate.indexContributions === "boolean" &&
    typeof candidate.indexWithdrawals === "boolean" &&
    (candidate.strategy === "consume" || candidate.strategy === "preserve") &&
    (candidate.preserveMode === "lifespan" ||
      candidate.preserveMode === "perpetuity")
  );
};

const readScenarios = (fallback: RetirementValues): RetirementScenario[] => {
  try {
    const raw = JSON.parse(
      localStorage.getItem(SCENARIO_STORAGE_KEY) ?? "null",
    );
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (scenario): scenario is RetirementScenario =>
          isRetirementScenario(scenario) && isRetirementValues(scenario.values),
      )
      .slice(0, 30)
      .map((scenario) => ({
        id: scenario.id,
        name: scenario.name.slice(0, 80) || "Cenário sem nome",
        savedAt: scenario.savedAt,
        values: normalizeValues(scenario.values, fallback),
      }));
  } catch {
    return [];
  }
};

const saveScenarios = (scenarios: RetirementScenario[]) => {
  try {
    localStorage.setItem(
      SCENARIO_STORAGE_KEY,
      JSON.stringify(scenarios.slice(0, 30)),
    );
    return true;
  } catch {
    return false;
  }
};

const scenarioConfig = (
  initialConfig: PlannerConfig,
  values: RetirementValues,
): PlannerConfig => ({
  ...initialConfig,
  goal: "grow",
  initial: values.liquidAssets,
  monthly: values.cashflows.reduce(
    (total, flow) => total + flow.monthlyContribution,
    0,
  ),
  years: Math.max(1, values.retirementAge - values.currentAge),
  rate: clamp(
    (values.cdiAnnualPct / 100) * (values.cdiPct / 100),
    -0.999999,
    10,
  ),
  inflationAdjusted: values.realMode,
  inflation: clamp(values.inflationPct / 100, -0.999999, 10),
});

const buildRetirementModel = (values: RetirementValues): RetirementModel => {
  const annualReturn = clamp(
    (values.cdiAnnualPct / 100) * (values.cdiPct / 100),
    -0.999999,
    10,
  );
  const postRetirementReturn = values.usePostRetirementReturn
    ? clamp(values.postRetirementReturnPct / 100, -0.999999, 10)
    : annualReturn;
  const engineConfig: EngineRetirementConfig = {
    currentAge: values.currentAge,
    retirementAge: values.retirementAge,
    lifeExpectancy: values.lifeExpectancy,
    liquidAssets: values.liquidAssets,
    illiquidAssets: values.illiquidAssets,
    monthlyIncome: values.monthlyIncome,
    monthlyExpenses: values.monthlyExpenses,
    monthlyContribution: values.cashflows[0]?.monthlyContribution ?? 0,
    monthlyWithdrawal: values.desiredRetirementIncome,
    annualReturn,
    inflation: clamp(values.inflationPct / 100, -0.999999, 10),
    postRetirementReturn,
    differentPostRetirementRate: values.usePostRetirementReturn,
    indexContributions: values.indexContributions,
    indexWithdrawals: values.indexWithdrawals,
    cashflows: values.cashflows.slice(1).map((flow) => ({
      id: flow.id,
      startAge: flow.startAge,
      endAge: flow.endAge,
      contribution: flow.monthlyContribution,
      withdrawal: flow.monthlyWithdrawal,
      indexContribution: values.indexContributions,
      indexWithdrawal: values.indexWithdrawals,
    })),
    strategy: {
      preserveMode: values.preserveMode,
      requiredReserve: values.desiredRetirementIncome > 0 ? undefined : 0,
    },
    cdiRate: values.cdiAnnualPct / 100,
    returnOverCdi: values.cdiPct,
  };
  const analysis = analyzeRetirement(engineConfig);
  const inflation = clamp(values.inflationPct / 100, -0.99, 10);
  const asNominal = (value: number, month: number) =>
    value * Math.pow(1 + inflation, month / 12);
  let contributionTotal = values.liquidAssets;
  let withdrawalTotal = 0;
  let nominalContributionTotal = values.liquidAssets;
  let nominalWithdrawalTotal = 0;
  const points: ProjectionPoint[] = analysis.series.map((point) => {
    const inflationFactor = Math.pow(1 + inflation, point.month / 12);
    contributionTotal += point.contribution;
    withdrawalTotal += point.withdrawal;
    nominalContributionTotal += point.contribution * inflationFactor;
    nominalWithdrawalTotal += point.withdrawal * inflationFactor;
    return {
      month: point.month,
      age: point.age,
      balance: values.realMode
        ? point.balance
        : asNominal(point.balance, point.month),
      realBalance: point.balance,
      contributions: values.realMode
        ? contributionTotal
        : nominalContributionTotal,
      withdrawals: values.realMode ? withdrawalTotal : nominalWithdrawalTotal,
      realContributions: contributionTotal,
      realWithdrawals: withdrawalTotal,
      nominalContributions: nominalContributionTotal,
      nominalWithdrawals: nominalWithdrawalTotal,
      contribution: point.contribution,
      withdrawal: point.withdrawal,
    };
  });
  const projection = analysis.projection;
  const consume = analysis.consume;
  const preserve = analysis.preserve;
  const displayReserve = values.realMode
    ? projection.retirementBalance
    : asNominal(projection.retirementBalance, projection.accumulationMonths);
  const displayFinal = values.realMode
    ? projection.endingBalance
    : asNominal(projection.endingBalance, projection.points.length - 1);
  const realReturn = (1 + annualReturn) / (1 + inflation) - 1;
  const postRetirementRealReturn =
    (1 + postRetirementReturn) / (1 + inflation) - 1;
  return {
    points,
    reserveAtRetirement: displayReserve,
    reserveAtRetirementReal: projection.retirementBalance,
    finalBalance: displayFinal,
    finalBalanceReal: projection.endingBalance,
    totalContributions: projection.totalContributions + values.liquidAssets,
    totalWithdrawals: projection.totalWithdrawals,
    annualReturn,
    postRetirementReturn,
    realReturn,
    postRetirementRealReturn,
    reserveTarget: values.realMode
      ? consume.requiredReserve
      : consume.requiredReserve === null
        ? null
        : asNominal(consume.requiredReserve, projection.accumulationMonths),
    reserveTargetReal: consume.requiredReserve,
    additionalMonthly: consume.additionalMonthly,
    additionalLumpSum: consume.additionalLumpSum,
    consumeMonthly: consume.maxMonthlyWithdrawal,
    preserveAdditionalMonthly: preserve.additionalMonthly,
    preserveAdditionalLumpSum: preserve.additionalLumpSum,
    preserveMonthly: preserve.maxMonthlyWithdrawal,
    preserveTarget: values.realMode
      ? preserve.requiredReserve
      : preserve.requiredReserve === null
        ? null
        : asNominal(preserve.requiredReserve, projection.accumulationMonths),
    preserveTargetReal: preserve.requiredReserve,
    preserveReason: preserve.reason,
    withdrawalShortfall: projection.totalWithdrawalShortfall,
    depletionAge:
      projection.depletionMonth === null
        ? null
        : values.currentAge + projection.depletionMonth / 12,
    error: projection.valid ? undefined : projection.errors.join("; "),
  };
};

const sampleReport = (
  points: ProjectionPoint[],
  intervalYears: number,
): ReportPoint[] => {
  const step = Math.max(1, intervalYears * 12);
  const sampled = points.filter((point) => point.month % step === 0);
  const final = points[points.length - 1];
  if (final && sampled[sampled.length - 1]?.month !== final.month)
    sampled.push(final);
  return sampled.map((point) => ({
    ...point,
    label: `${point.age.toFixed(0)} anos`,
  }));
};

const csvCell = (value: string | number) =>
  `"${String(value).replace(/"/g, '""')}"`;

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  hint,
  className = "",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint?: string;
  className?: string;
}) {
  const id = useRef(`ret-field-${Math.random().toString(36).slice(2)}`).current;
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  return (
    <div className={`ret-field ${className}`}>
      <label htmlFor={id}>{label}</label>
      <div className={`ret-input-wrap ${invalid ? "is-invalid" : ""}`}>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={draft}
          aria-invalid={invalid}
          onChange={(event) => {
            const raw = event.target.value;
            setDraft(raw);
            if (raw.trim() === "") {
              setInvalid(true);
              return;
            }
            const parsed = Number(raw);
            const ok =
              Number.isFinite(parsed) && parsed >= min && parsed <= max;
            setInvalid(!ok);
            if (ok) onChange(parsed);
          }}
          onBlur={() => {
            const parsed = safeNumber(draft, value, min, max);
            setInvalid(false);
            setDraft(String(parsed));
            onChange(parsed);
          }}
        />
        {suffix && <span>{suffix}</span>}
      </div>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useRef(
    `ret-switch-${Math.random().toString(36).slice(2)}`,
  ).current;
  return (
    <label className="ret-switch-row" htmlFor={id}>
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}

function RetSection({
  title,
  eyebrow,
  children,
  action,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ret-card ${className}`}>
      <div className="ret-section-heading">
        <div>
          {eyebrow && <span className="ret-eyebrow">{eyebrow}</span>}
          <h3>{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function RetirementDashboard({
  initialConfig,
  onChange,
}: RetirementDashboardProps) {
  const [values, setValues] = useState<RetirementValues>(() =>
    defaultValues(initialConfig),
  );
  const initialValuesRef = useRef(values);
  const [scenarios, setScenarios] = useState<RetirementScenario[]>(() =>
    readScenarios(initialValuesRef.current),
  );
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    null,
  );
  const [scenarioName, setScenarioName] = useState(
    "Meu plano de aposentadoria",
  );
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [report, setReport] = useState<
    "diagnosis" | "evolution" | "comparison"
  >("diagnosis");
  const [notice, setNotice] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [successionOpen, setSuccessionOpen] = useState(false);

  const update = <K extends keyof RetirementValues>(
    key: K,
    value: RetirementValues[K],
  ) => {
    setValues((current) => {
      const next = normalizeValues({ ...current, [key]: value }, current);
      if (key === "currentAge" || key === "retirementAge") {
        next.cashflows = next.cashflows.map((flow) =>
          flow.id !== "initial-cashflow"
            ? flow
            : {
                ...flow,
                startAge:
                  flow.startAge === current.currentAge
                    ? next.currentAge
                    : flow.startAge,
                endAge:
                  flow.endAge === current.retirementAge
                    ? next.retirementAge
                    : flow.endAge,
              },
        );
      }
      return next;
    });
  };

  const model = useMemo(() => buildRetirementModel(values), [values]);
  const reportPoints = useMemo(
    () => sampleReport(model.points, values.reportIntervalYears),
    [model.points, values.reportIntervalYears],
  );
  const annualReturn = model.annualReturn;
  const liquidTotal = values.liquidAssets + values.illiquidAssets;
  const savingsCapacity = values.monthlyIncome - values.monthlyExpenses;
  const successionCost = liquidTotal * (values.successionCostPct / 100);
  const successionNetEstate = Math.max(0, liquidTotal - successionCost);
  const selectedStrategy =
    values.strategy === "consume"
      ? {
          additionalMonthly: model.additionalMonthly,
          additionalLumpSum: model.additionalLumpSum,
          maxMonthlyWithdrawal: model.consumeMonthly,
          target: model.reserveTarget,
          targetReal: model.reserveTargetReal,
        }
      : {
          additionalMonthly: model.preserveAdditionalMonthly,
          additionalLumpSum: model.preserveAdditionalLumpSum,
          maxMonthlyWithdrawal: model.preserveMonthly,
          target: model.preserveTarget,
          targetReal: model.preserveTargetReal,
        };
  const activeScenario = selectedScenarioId
    ? (scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null)
    : null;

  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const plannerSync = useMemo(
    () => scenarioConfig(initialConfig, values),
    [initialConfig, values],
  );
  const plannerSyncSignature = JSON.stringify(plannerSync);
  useEffect(() => {
    changeRef.current?.(plannerSync);
  }, [plannerSyncSignature]);

  const persistScenarioList = (next: RetirementScenario[]) => {
    if (!saveScenarios(next)) return false;
    setScenarios(next);
    return true;
  };

  const startNewScenario = () => {
    setSelectedScenarioId(null);
    setScenarioName(`Cenário ${scenarios.length + 1}`);
    setNotice("Edite os valores e clique em Salvar para guardar este cenário.");
  };

  const saveCurrentScenario = () => {
    if (!selectedScenarioId && scenarios.length >= 30) {
      setNotice(
        "Limite de 30 cenários: atualize um existente ou remova um cenário antes de criar outro.",
      );
      return;
    }
    if (model.error) {
      setNotice("Corrija os parâmetros antes de salvar este cenário.");
      return;
    }
    const name = scenarioName.trim() || `Cenário ${scenarios.length + 1}`;
    const nextScenario: RetirementScenario = {
      id: selectedScenarioId ?? idFor(),
      name: name.slice(0, 80),
      savedAt: new Date().toISOString(),
      values: normalizeValues(values, values),
    };
    const next = selectedScenarioId
      ? scenarios.map((scenario) =>
          scenario.id === selectedScenarioId ? nextScenario : scenario,
        )
      : [nextScenario, ...scenarios];
    if (persistScenarioList(next)) {
      setSelectedScenarioId(nextScenario.id);
      setScenarioName(nextScenario.name);
      setNotice(`“${nextScenario.name}” foi salvo neste dispositivo.`);
    } else {
      setNotice("Não foi possível salvar os cenários neste navegador.");
    }
  };

  const loadSelectedScenario = () => {
    if (!activeScenario) return;
    setValues(normalizeValues(activeScenario.values, values));
    setScenarioName(activeScenario.name);
    setNotice(`“${activeScenario.name}” foi carregado.`);
  };

  const deleteSelectedScenario = () => {
    if (!activeScenario) return;
    const next = scenarios.filter(
      (scenario) => scenario.id !== activeScenario.id,
    );
    const persisted = persistScenarioList(next);
    if (!persisted) {
      setNotice("Não foi possível atualizar os cenários salvos.");
      return;
    }
    setCompareIds((ids) => ids.filter((id) => id !== activeScenario.id));
    setSelectedScenarioId(null);
    setNotice(
      persisted
        ? `“${activeScenario.name}” foi removido.`
        : "Não foi possível atualizar os cenários salvos.",
    );
  };

  const addCashflow = () => {
    const nextStart = Math.min(values.retirementAge, values.currentAge + 1);
    setValues((current) => ({
      ...current,
      cashflows: [
        ...current.cashflows,
        {
          id: idFor(),
          startAge: nextStart,
          endAge: Math.min(MAX_AGE, nextStart + 1),
          monthlyContribution: 0,
          monthlyWithdrawal: 0,
        },
      ],
    }));
  };

  const updateCashflow = (
    id: string,
    key: keyof Omit<RetirementCashflow, "id">,
    value: number,
  ) => {
    setValues((current) => ({
      ...current,
      cashflows: current.cashflows.map((flow) =>
        flow.id === id ? normalizeCashflow({ ...flow, [key]: value }) : flow,
      ),
    }));
  };

  const removeCashflow = (id: string) => {
    setValues((current) => ({
      ...current,
      cashflows: current.cashflows.filter((flow) => flow.id !== id),
    }));
  };

  const exportReport = () => {
    if (!model.points.length || model.error) {
      setNotice("Corrija os valores para gerar o relatório.");
      return;
    }
    try {
      const header = [
        "mes",
        "idade",
        "saldo_nominal",
        "saldo_real",
        "aportes_nominais",
        "retiradas_nominais",
        "aportes_reais",
        "retiradas_reais",
      ];
      const rows = model.points.map((point) => [
        point.month,
        point.age.toFixed(2),
        (
          point.realBalance *
          Math.pow(1 + values.inflationPct / 100, point.month / 12)
        ).toFixed(2),
        point.realBalance.toFixed(2),
        point.nominalContributions.toFixed(2),
        point.nominalWithdrawals.toFixed(2),
        point.realContributions.toFixed(2),
        point.realWithdrawals.toFixed(2),
      ]);
      const content = [header, ...rows]
        .map((row) => row.map(csvCell).join(","))
        .join("\n");
      const url = window.URL.createObjectURL(
        new Blob([content], { type: "text/csv;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "relatorio-aposentadoria.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setNotice("Relatório CSV exportado.");
    } catch {
      setNotice("O navegador não permitiu exportar o relatório.");
    }
  };

  const chartData = reportPoints.map((point) => ({
    ...point,
    saldo: values.realMode ? point.realBalance : point.balance,
    aportes: values.realMode ? point.contributions : point.contributions,
    retiradas: values.realMode ? point.withdrawals : point.withdrawals,
  }));
  const unitLabel = values.realMode ? "dinheiro de hoje" : "valores futuros";

  return (
    <div className="ret-dashboard" aria-labelledby="retirement-dashboard-title">
      <header className="ret-header">
        <div>
          <span className="ret-eyebrow">PLANEJAMENTO DE LONGO PRAZO</span>
          <h2 id="retirement-dashboard-title">Planejamento da aposentadoria</h2>
          <p>
            Organize seus ativos, renda desejada e hipóteses para entender os
            próximos passos.
          </p>
        </div>
        <div className="ret-header-actions">
          <button
            type="button"
            className="ret-button ret-button-muted"
            onClick={startNewScenario}
          >
            + Cenário
          </button>
          <button
            type="button"
            className="ret-button ret-button-primary"
            onClick={saveCurrentScenario}
          >
            Salvar
          </button>
        </div>
      </header>

      {notice && (
        <div className="ret-notice" role="status">
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Fechar aviso"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
      {model.error && (
        <div className="ret-error" role="alert">
          {model.error} Ajuste os valores ou reduza o prazo.
        </div>
      )}
      {!model.error && model.withdrawalShortfall > 0 && (
        <div className="ret-error" role="alert">
          A reserva líquida não cobriria todas as retiradas configuradas. O
          primeiro déficit aparece por volta dos{" "}
          {model.depletionAge?.toFixed(0)} anos; revise a renda desejada, os
          aportes ou a idade de aposentadoria.
        </div>
      )}

      <section className="ret-scenario-toolbar" aria-label="Cenários salvos">
        <div className="ret-scenario-name">
          <label htmlFor="ret-scenario-name">Nome do cenário</label>
          <input
            id="ret-scenario-name"
            value={scenarioName}
            maxLength={80}
            onChange={(e) => setScenarioName(e.target.value)}
          />
        </div>
        <div className="ret-scenario-select">
          <label htmlFor="ret-scenario-select">Cenário salvo</label>
          <select
            id="ret-scenario-select"
            value={selectedScenarioId ?? ""}
            onChange={(e) => {
              const selected = scenarios.find(
                (item) => item.id === e.target.value,
              );
              setSelectedScenarioId(selected?.id ?? null);
              if (selected) {
                setValues(normalizeValues(selected.values, values));
                setScenarioName(selected.name);
              }
            }}
          >
            <option value="">Simulação atual</option>
            {scenarios.map((scenario) => (
              <option value={scenario.id} key={scenario.id}>
                {scenario.name}
              </option>
            ))}
          </select>
        </div>
        <div className="ret-scenario-actions">
          <button
            type="button"
            className="ret-button ret-button-small"
            disabled={!activeScenario}
            onClick={loadSelectedScenario}
          >
            Carregar
          </button>
          <button
            type="button"
            className="ret-button ret-button-small ret-button-danger"
            disabled={!activeScenario}
            onClick={deleteSelectedScenario}
          >
            Excluir
          </button>
        </div>
      </section>

      <div className="ret-layout">
        <div className="ret-main-column">
          <RetSection
            title="Ativos"
            eyebrow="PONTO DE PARTIDA"
            action={
              <button
                type="button"
                className="ret-link-button"
                onClick={() => setIsSettingsOpen((open) => !open)}
              >
                {isSettingsOpen ? "Fechar edição" : "Editar ativos"}
              </button>
            }
          >
            <div className="ret-asset-summary">
              <div className="ret-asset-metric">
                <span>Patrimônio financeiro</span>
                <strong>{formatMoney(values.liquidAssets)}</strong>
              </div>
              <div className="ret-asset-metric">
                <span>Patrimônio imobilizado</span>
                <strong>{formatMoney(values.illiquidAssets)}</strong>
              </div>
              <div
                className="ret-asset-chart"
                aria-label={`Patrimônio total ${formatMoney(liquidTotal)}`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        {
                          name: "Recursos financeiros",
                          value: values.liquidAssets,
                        },
                        { name: "Imobilizado", value: values.illiquidAssets },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="58%"
                      outerRadius="82%"
                      paddingAngle={2}
                      stroke="none"
                    >
                      {[values.liquidAssets, values.illiquidAssets].map(
                        (value, index) => (
                          <Cell
                            key={`${index}-${value}`}
                            fill={COLORS[index]}
                          />
                        ),
                      )}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => formatMoney(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="ret-donut-label">
                  <strong>{formatMoney(liquidTotal)}</strong>
                  <span>ativos totais</span>
                </div>
              </div>
            </div>
            <div className="ret-asset-legend">
              <span>
                <i style={{ background: COLORS[0] }} />
                Recursos financeiros{" "}
                <b>
                  {liquidTotal
                    ? `${((values.liquidAssets / liquidTotal) * 100).toFixed(0)}%`
                    : "0%"}
                </b>
              </span>
              <span>
                <i style={{ background: COLORS[1] }} />
                Imobilizado{" "}
                <b>
                  {liquidTotal
                    ? `${((values.illiquidAssets / liquidTotal) * 100).toFixed(0)}%`
                    : "0%"}
                </b>
              </span>
            </div>
            {isSettingsOpen && (
              <div className="ret-inline-fields">
                <NumberInput
                  label="Patrimônio financeiro"
                  value={values.liquidAssets}
                  onChange={(v) => update("liquidAssets", v)}
                  min={0}
                  max={MAX_MONEY}
                  step={1000}
                  suffix="R$"
                />
                <NumberInput
                  label="Patrimônio imobilizado"
                  value={values.illiquidAssets}
                  onChange={(v) => update("illiquidAssets", v)}
                  min={0}
                  max={MAX_MONEY}
                  step={1000}
                  suffix="R$"
                />
              </div>
            )}
            <button
              type="button"
              className="ret-status-pill"
              aria-expanded={successionOpen}
              onClick={() => setSuccessionOpen((open) => !open)}
            >
              Sucessão Patrimonial
            </button>
            {successionOpen && (
              <div className="ret-succession-panel">
                <div>
                  <span className="ret-eyebrow">ESTIMATIVA OPCIONAL</span>
                  <h4>O que poderia ficar para seus herdeiros?</h4>
                  <p>
                    Simule um custo percentual sobre o patrimônio total. Não
                    aplicamos imposto, regra ou alíquota de nenhuma jurisdição.
                  </p>
                </div>
                <NumberInput
                  label="Custo estimado da sucessão"
                  value={values.successionCostPct}
                  onChange={(value) => update("successionCostPct", value)}
                  min={0}
                  max={100}
                  step={0.1}
                  suffix="%"
                />
                <div className="ret-succession-metrics">
                  <div>
                    <span>Patrimônio total</span>
                    <strong>{formatMoney(liquidTotal)}</strong>
                  </div>
                  <div>
                    <span>Custo estimado</span>
                    <strong>{formatMoney(successionCost)}</strong>
                  </div>
                  <div>
                    <span>Patrimônio líquido estimado</span>
                    <strong>{formatMoney(successionNetEstate)}</strong>
                  </div>
                </div>
              </div>
            )}
          </RetSection>

          <RetSection
            title="Aposentadoria e expectativa de vida"
            eyebrow="HORIZONTE DO PLANO"
          >
            <div className="ret-age-fields">
              <NumberInput
                label="Idade atual"
                value={values.currentAge}
                onChange={(v) => update("currentAge", v)}
                min={MIN_AGE}
                max={85}
                step={1}
                suffix="anos"
              />
              <NumberInput
                label="Idade de aposentadoria"
                value={values.retirementAge}
                onChange={(v) =>
                  update("retirementAge", Math.max(values.currentAge + 1, v))
                }
                min={values.currentAge + 1}
                max={100}
                step={1}
                suffix="anos"
              />
              <NumberInput
                label="Expectativa de vida"
                value={values.lifeExpectancy}
                onChange={(v) =>
                  update(
                    "lifeExpectancy",
                    Math.max(values.retirementAge + 1, v),
                  )
                }
                min={values.retirementAge + 1}
                max={MAX_AGE}
                step={1}
                suffix="anos"
              />
            </div>
            <div
              className="ret-age-track"
              aria-label="Linha do tempo da aposentadoria"
            >
              <div className="ret-age-line" />
              <span
                className="ret-age-marker ret-age-current"
                style={{ left: "4%" }}
              >
                <b>{values.currentAge}</b>
                <small>hoje</small>
              </span>
              <span
                className="ret-age-marker ret-age-retire"
                style={{
                  left: `${clamp(((values.retirementAge - values.currentAge) / Math.max(values.lifeExpectancy - values.currentAge, 1)) * 92 + 4, 8, 96)}%`,
                }}
              >
                <b>{values.retirementAge}</b>
                <small>aposentadoria</small>
              </span>
              <span
                className="ret-age-marker ret-age-end"
                style={{ left: "96%" }}
              >
                <b>{values.lifeExpectancy}</b>
                <small>expectativa</small>
              </span>
            </div>
          </RetSection>

          <RetSection title="Taxa de juros e inflação" eyebrow="HIPÓTESES">
            <div className="ret-rate-fields">
              <NumberInput
                label="CDI anual hipotético"
                value={values.cdiAnnualPct}
                onChange={(v) => update("cdiAnnualPct", v)}
                min={-99}
                max={1000}
                step={0.1}
                suffix="% a.a."
                hint="Referência editável, não é cotação atual."
              />
              <NumberInput
                label="Retorno sobre o CDI"
                value={values.cdiPct}
                onChange={(v) => update("cdiPct", v)}
                min={0}
                max={500}
                step={1}
                suffix="%"
              />
              <div className="ret-derived-metric">
                <span>Taxa de juros anual</span>
                <strong>{formatPercent(annualReturn)}</strong>
                <small>CDI × retorno sobre CDI</small>
              </div>
              <NumberInput
                label="Inflação anual"
                value={values.inflationPct}
                onChange={(v) => update("inflationPct", v)}
                min={-99}
                max={1000}
                step={0.1}
                suffix="% a.a."
              />
              <div className="ret-derived-metric">
                <span>Retorno real anual</span>
                <strong>{formatPercent(model.realReturn)}</strong>
                <small>Depois da inflação informada</small>
              </div>
              <SwitchRow
                label="Usar retorno diferente após aposentadoria"
                checked={values.usePostRetirementReturn}
                onChange={(v) => update("usePostRetirementReturn", v)}
              />
              {values.usePostRetirementReturn && (
                <NumberInput
                  label="Retorno após aposentadoria"
                  value={values.postRetirementReturnPct}
                  onChange={(v) => update("postRetirementReturnPct", v)}
                  min={-99}
                  max={1000}
                  step={0.1}
                  suffix="% a.a."
                />
              )}
            </div>
            <div className="ret-toggle-grid">
              <SwitchRow
                label="Corrigir aportes pela inflação"
                description="Mantém o poder de compra do aporte mês a mês."
                checked={values.indexContributions}
                onChange={(v) => update("indexContributions", v)}
              />
              <SwitchRow
                label="Corrigir retiradas pela inflação"
                description="Mantém o poder de compra na aposentadoria."
                checked={values.indexWithdrawals}
                onChange={(v) => update("indexWithdrawals", v)}
              />
              <SwitchRow
                label="Mostrar valores em dinheiro de hoje"
                description="Alterna a leitura nominal/real dos relatórios."
                checked={values.realMode}
                onChange={(v) => update("realMode", v)}
              />
            </div>
          </RetSection>

          <RetSection title="Capacidade de poupança" eyebrow="FLUXO MENSAL">
            <div className="ret-capacity-grid">
              <NumberInput
                label="Renda mensal atual"
                value={values.monthlyIncome}
                onChange={(v) => update("monthlyIncome", v)}
                min={0}
                max={MAX_MONEY}
                step={100}
                suffix="R$"
              />
              <NumberInput
                label="Despesa mensal atual"
                value={values.monthlyExpenses}
                onChange={(v) => update("monthlyExpenses", v)}
                min={0}
                max={MAX_MONEY}
                step={100}
                suffix="R$"
              />
              <div
                className={`ret-capacity-result ${savingsCapacity < 0 ? "is-negative" : ""}`}
              >
                <span>Capacidade de poupança</span>
                <strong>{formatMoney(savingsCapacity)}</strong>
                <small>
                  {savingsCapacity < 0
                    ? "Revise o orçamento antes de assumir novos aportes."
                    : "Valor disponível antes de outras escolhas."}
                </small>
              </div>
            </div>
          </RetSection>
        </div>

        <div className="ret-side-column">
          <RetSection
            title="Planejamento da aposentadoria"
            eyebrow="QUANTO VOCÊ PRECISA"
          >
            <div className="ret-planning-inputs">
              <NumberInput
                label="Renda mensal desejada na aposentadoria"
                value={values.desiredRetirementIncome}
                onChange={(v) => update("desiredRetirementIncome", v)}
                min={0}
                max={MAX_MONEY}
                step={100}
                suffix="R$"
                hint="Informe o poder de compra desejado em reais de hoje."
              />
              <div className="ret-planning-balance">
                <span>Reserva estimada na aposentadoria</span>
                <strong>
                  {formatMoney(
                    values.realMode
                      ? model.reserveAtRetirementReal
                      : model.reserveAtRetirement,
                  )}
                </strong>
                <small>Com os aportes e retiradas configurados</small>
              </div>
            </div>
            <div
              className="ret-strategy-tabs"
              role="tablist"
              aria-label="Estratégia de aposentadoria"
            >
              <button
                type="button"
                role="tab"
                aria-selected={values.strategy === "consume"}
                className={values.strategy === "consume" ? "is-active" : ""}
                onClick={() => update("strategy", "consume")}
              >
                Consumir a reserva
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={values.strategy === "preserve"}
                className={values.strategy === "preserve" ? "is-active" : ""}
                onClick={() => update("strategy", "preserve")}
              >
                Preservar a reserva
              </button>
            </div>
            <div className="ret-strategy-card">
              <div className="ret-strategy-title">
                <span>
                  {values.strategy === "consume"
                    ? "Consumir a Reserva"
                    : "Preservar a Reserva"}
                </span>
                <b>
                  {values.strategy === "consume"
                    ? "Plano até a expectativa de vida"
                    : "Renda com preservação do principal"}
                </b>
              </div>
              <p className="ret-help">
                Todos os valores desta estratégia estão em reais de hoje. Aporte
                mensal e aporte único são alternativas, não valores a somar.
              </p>
              <div className="ret-strategy-metrics">
                <div>
                  <span>
                    {values.strategy === "consume"
                      ? "Retirada mensal máxima"
                      : "Renda mensal estimada"}
                  </span>
                  <strong>
                    {formatMaybeMoney(selectedStrategy.maxMonthlyWithdrawal)}
                  </strong>
                </div>
                <div>
                  <span>Aporte mensal adicional</span>
                  <strong>
                    {formatMaybeMoney(selectedStrategy.additionalMonthly)}
                  </strong>
                </div>
                <div>
                  <span>Aporte único na aposentadoria</span>
                  <strong>
                    {formatMaybeMoney(selectedStrategy.additionalLumpSum)}
                  </strong>
                </div>
                <div>
                  <span>Reserva necessária na aposentadoria</span>
                  <strong>
                    {formatMaybeMoney(selectedStrategy.targetReal)}
                  </strong>
                </div>
              </div>
              <p>
                {values.strategy === "consume"
                  ? "A reserva é usada gradualmente para financiar a renda desejada até a expectativa de vida."
                  : "A retirada considera uma renda menor para manter o principal como patrimônio ou herança."}
              </p>
              {values.strategy === "preserve" && model.preserveReason && (
                <div className="ret-strategy-unavailable" role="status">
                  Observação da estratégia: {model.preserveReason}.
                </div>
              )}
              {values.strategy === "preserve" && (
                <label className="ret-preserve-mode">
                  <span>Horizonte da preservação</span>
                  <select
                    value={values.preserveMode}
                    onChange={(event) =>
                      update(
                        "preserveMode",
                        event.target.value === "lifespan"
                          ? "lifespan"
                          : "perpetuity",
                      )
                    }
                  >
                    <option value="perpetuity">
                      Indefinidamente (perpetuidade)
                    </option>
                    <option value="lifespan">Até a expectativa de vida</option>
                  </select>
                </label>
              )}
            </div>
          </RetSection>

          <RetSection title="Gráficos e relatórios" eyebrow="LEIA O PLANO">
            <div
              className="ret-report-buttons"
              role="tablist"
              aria-label="Relatórios da aposentadoria"
            >
              <button
                type="button"
                role="tab"
                aria-selected={report === "diagnosis"}
                className={report === "diagnosis" ? "is-active" : ""}
                onClick={() => setReport("diagnosis")}
              >
                Gráfico Diagnóstico Aposentadoria
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={report === "evolution"}
                className={report === "evolution" ? "is-active" : ""}
                onClick={() => setReport("evolution")}
              >
                Evolução da Reserva
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={report === "comparison"}
                className={report === "comparison" ? "is-active" : ""}
                onClick={() => setReport("comparison")}
              >
                Comparação de Cenários
              </button>
            </div>
            <div className="ret-report-controls">
              <NumberInput
                label="Intervalo do relatório"
                value={values.reportIntervalYears}
                onChange={(v) => update("reportIntervalYears", v)}
                min={1}
                max={20}
                step={1}
                suffix="ano(s)"
              />
              <button
                type="button"
                className="ret-button ret-button-small"
                onClick={exportReport}
              >
                Exportar CSV
              </button>
            </div>
            {report !== "comparison" ? (
              <div
                className="ret-report-chart"
                role="img"
                aria-label={`Gráfico de ${report === "diagnosis" ? "diagnóstico" : "evolução"}, em ${unitLabel}`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 12, right: 16, left: 4, bottom: 4 }}
                  >
                    <defs>
                      <linearGradient
                        id="ret-balance-fill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#3d83c6"
                          stopOpacity={0.42}
                        />
                        <stop
                          offset="95%"
                          stopColor="#3d83c6"
                          stopOpacity={0.04}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e9ec" />
                    <XAxis
                      dataKey="label"
                      minTickGap={24}
                      tickFormatter={(value: string) =>
                        value.replace(" anos", "")
                      }
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      tickFormatter={axisMoney}
                      width={58}
                      tick={{ fontSize: 10 }}
                    />
                    <Tooltip
                      formatter={(value: number) => formatMoney(value)}
                      labelFormatter={(label) => `Idade ${label}`}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="saldo"
                      name={
                        values.realMode ? "Saldo (real)" : "Saldo (nominal)"
                      }
                      stroke="#3d83c6"
                      fill="url(#ret-balance-fill)"
                      strokeWidth={2}
                    />
                    {report === "diagnosis" &&
                      (values.realMode
                        ? selectedStrategy.targetReal
                        : selectedStrategy.target) !== null && (
                        <ReferenceLine
                          ifOverflow="extendDomain"
                          y={
                            (values.realMode
                              ? selectedStrategy.targetReal
                              : selectedStrategy.target) ?? 0
                          }
                          stroke="#cf8f35"
                          strokeDasharray="5 5"
                          label="Reserva alvo"
                        />
                      )}
                    {report === "evolution" && (
                      <>
                        <Area
                          type="monotone"
                          dataKey="aportes"
                          name="Aportes acumulados"
                          stroke="#5c9d72"
                          fill="none"
                          strokeWidth={1.5}
                        />
                        <Area
                          type="monotone"
                          dataKey="retiradas"
                          name="Retiradas acumuladas"
                          stroke="#d27a65"
                          fill="none"
                          strokeWidth={1.5}
                        />
                      </>
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <ComparisonReport
                scenarios={scenarios}
                compareIds={compareIds}
                setCompareIds={setCompareIds}
                currentValues={values}
                intervalYears={values.reportIntervalYears}
              />
            )}
            <div className="ret-report-summary">
              <span>
                Unidade: <strong>{unitLabel}</strong>
              </span>
              <span>
                Reserva alvo:{" "}
                <strong>
                  {formatMaybeMoney(
                    values.realMode
                      ? selectedStrategy.targetReal
                      : selectedStrategy.target,
                  )}
                </strong>
              </span>
              <span>
                Fim da projeção:{" "}
                <strong>
                  {formatMoney(
                    values.realMode
                      ? model.finalBalanceReal
                      : model.finalBalance,
                  )}
                </strong>
              </span>
            </div>
            <div
              className="ret-table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Tabela acessível do relatório"
            >
              <table className="ret-table">
                <caption>Resumo do relatório em {unitLabel}</caption>
                <thead>
                  <tr>
                    <th scope="col">Idade</th>
                    <th scope="col">Saldo</th>
                    <th scope="col">Aportes acum.</th>
                    <th scope="col">Retiradas acum.</th>
                  </tr>
                </thead>
                <tbody>
                  {reportPoints.map((point) => (
                    <tr key={point.month}>
                      <th scope="row">{point.label}</th>
                      <td>
                        {formatMoney(
                          values.realMode ? point.realBalance : point.balance,
                        )}
                      </td>
                      <td>{formatMoney(point.contributions)}</td>
                      <td>{formatMoney(point.withdrawals)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </RetSection>

          <RetSection
            title="Aportes e retiradas mensais"
            eyebrow="FLUXOS POR IDADE"
            action={
              <button
                type="button"
                className="ret-link-button"
                onClick={addCashflow}
              >
                + Adicionar período
              </button>
            }
          >
            <p className="ret-help">
              Defina quando cada aporte ou retirada acontece. Os campos podem se
              sobrepor para testar mudanças de fase.
            </p>
            {values.cashflows.length === 0 && (
              <div className="ret-empty">
                Nenhum período configurado. Adicione um período para simular
                aportes ou retiradas.
              </div>
            )}
            <div className="ret-cashflow-list">
              {values.cashflows.map((flow, index) => (
                <div className="ret-cashflow-row" key={flow.id}>
                  <div className="ret-cashflow-title">
                    <span>Período {index + 1}</span>
                    <button
                      type="button"
                      aria-label={`Remover período ${index + 1}`}
                      onClick={() => removeCashflow(flow.id)}
                    >
                      ×
                    </button>
                  </div>
                  <NumberInput
                    label="Idade inicial"
                    value={flow.startAge}
                    onChange={(v) => updateCashflow(flow.id, "startAge", v)}
                    min={values.currentAge}
                    max={MAX_AGE - 1}
                    step={1}
                    suffix="anos"
                  />
                  <NumberInput
                    label="Idade final"
                    value={flow.endAge}
                    onChange={(v) =>
                      updateCashflow(
                        flow.id,
                        "endAge",
                        Math.max(flow.startAge + 1, v),
                      )
                    }
                    min={values.currentAge + 1}
                    max={MAX_AGE}
                    step={1}
                    suffix="anos"
                  />
                  <NumberInput
                    label="Aporte mensal"
                    value={flow.monthlyContribution}
                    onChange={(v) =>
                      updateCashflow(flow.id, "monthlyContribution", v)
                    }
                    min={0}
                    max={MAX_MONEY}
                    step={100}
                    suffix="R$"
                    hint={
                      index === 0
                        ? "Aporte mensal até a aposentadoria."
                        : undefined
                    }
                  />
                  <NumberInput
                    label="Retirada mensal"
                    value={flow.monthlyWithdrawal}
                    onChange={(v) =>
                      updateCashflow(flow.id, "monthlyWithdrawal", v)
                    }
                    min={0}
                    max={MAX_MONEY}
                    step={100}
                    suffix="R$"
                  />
                </div>
              ))}
            </div>
          </RetSection>
        </div>
      </div>
    </div>
  );
}

function ComparisonReport({
  scenarios,
  compareIds,
  setCompareIds,
  currentValues,
  intervalYears,
}: {
  scenarios: RetirementScenario[];
  compareIds: string[];
  setCompareIds: (ids: string[]) => void;
  currentValues: RetirementValues;
  intervalYears: number;
}) {
  const currentModel = buildRetirementModel(currentValues);
  const selected = scenarios.filter((scenario) =>
    compareIds.includes(scenario.id),
  );
  const currentPoints = sampleReport(currentModel.points, intervalYears);
  const scenarioSeries = selected.map((scenario) => ({
    scenario,
    points: sampleReport(
      buildRetirementModel(scenario.values).points,
      intervalYears,
    ),
  }));
  const months = Array.from(
    new Set([
      ...currentPoints.map((point) => point.month),
      ...scenarioSeries.flatMap(({ points }) =>
        points.map((point) => point.month),
      ),
    ]),
  ).sort((left, right) => left - right);
  const pointByMonth = (points: ReportPoint[]) =>
    new Map(points.map((point) => [point.month, point]));
  const currentByMonth = pointByMonth(currentPoints);
  const scenarioMaps = scenarioSeries.map(({ scenario, points }) => ({
    scenario,
    points: pointByMonth(points),
  }));
  const comparisonData = months.map((month) => {
    const row: Record<string, string | number | undefined> = {
      month,
      label: `+${Number((month / 12).toFixed(1))} anos`,
      atual: currentByMonth.get(month)?.realBalance,
    };
    for (const { scenario, points } of scenarioMaps)
      row[scenario.id] = points.get(month)?.realBalance;
    return row;
  });
  return (
    <div className="ret-comparison">
      <p className="ret-help">
        Comparação sempre em reais de hoje, por tempo a partir de agora. Cada
        cenário mantém sua própria idade de aposentadoria e horizonte.
      </p>
      <div className="ret-comparison-picks">
        <label className="ret-check-option">
          <input type="checkbox" checked readOnly />
          <span>Simulação atual</span>
        </label>
        {scenarios.length === 0 && (
          <small>Salve pelo menos um cenário para comparar.</small>
        )}
        {scenarios.map((scenario) => (
          <label className="ret-check-option" key={scenario.id}>
            <input
              type="checkbox"
              checked={compareIds.includes(scenario.id)}
              onChange={(event) =>
                setCompareIds(
                  event.target.checked
                    ? [...compareIds, scenario.id]
                    : compareIds.filter((id) => id !== scenario.id),
                )
              }
            />
            <span>{scenario.name}</span>
          </label>
        ))}
      </div>
      <div className="ret-report-chart ret-comparison-chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={comparisonData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e9ec" />
            <XAxis dataKey="label" minTickGap={24} tick={{ fontSize: 11 }} />
            <YAxis
              tickFormatter={axisMoney}
              width={58}
              tick={{ fontSize: 10 }}
            />
            <Tooltip formatter={(value: number) => formatMoney(value)} />
            <Legend />
            <Area
              type="monotone"
              dataKey="atual"
              name="Simulação atual (reais de hoje)"
              stroke="#3d83c6"
              fill="none"
              strokeWidth={2}
              connectNulls={false}
            />
            {selected.map((scenario, index) => (
              <Area
                key={scenario.id}
                type="monotone"
                dataKey={scenario.id}
                name={`${scenario.name} (reais de hoje)`}
                stroke={COLORS[(index + 1) % COLORS.length]}
                fill="none"
                strokeWidth={1.8}
                connectNulls={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="ret-comparison-table-wrap">
        <table className="ret-table">
          <caption>Comparação de cenários salvos</caption>
          <thead>
            <tr>
              <th scope="col">Cenário</th>
              <th scope="col">Idade de aposentadoria</th>
              <th scope="col">Reserva na aposentadoria</th>
              <th scope="col">Saldo final</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Simulação atual</th>
              <td>{currentValues.retirementAge}</td>
              <td>{formatMoney(currentModel.reserveAtRetirementReal)}</td>
              <td>{formatMoney(currentModel.finalBalanceReal)}</td>
            </tr>
            {selected.map((scenario) => {
              const result = buildRetirementModel(scenario.values);
              return (
                <tr key={scenario.id}>
                  <th scope="row">{scenario.name}</th>
                  <td>{scenario.values.retirementAge}</td>
                  <td>{formatMoney(result.reserveAtRetirementReal)}</td>
                  <td>{formatMoney(result.finalBalanceReal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
