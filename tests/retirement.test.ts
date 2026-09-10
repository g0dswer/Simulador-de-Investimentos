import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETIREMENT,
  analyzeRetirement,
  projectRetirement,
  validateRetirementConfig,
  type RetirementConfig,
} from "../src/lib/retirement";

const zeroRateConfig = (
  overrides: Partial<RetirementConfig> = {},
): RetirementConfig => ({
  ...DEFAULT_RETIREMENT,
  currentAge: 30,
  retirementAge: 31,
  lifeExpectancy: 32,
  liquidAssets: 0,
  illiquidAssets: 0,
  monthlyIncome: 2_000,
  monthlyExpenses: 1_000,
  monthlyContribution: 100,
  monthlyWithdrawal: 100,
  annualReturn: 0,
  inflation: 0,
  postRetirementReturn: 0,
  differentPostRetirementRate: false,
  indexContributions: true,
  indexWithdrawals: true,
  cashflows: [],
  strategy: { preserveMode: "lifespan" },
  ...overrides,
});

describe("núcleo de aposentadoria", () => {
  it("acumula doze aportes antes de começar as retiradas", () => {
    const result = projectRetirement(zeroRateConfig());

    expect(result.valid).toBe(true);
    expect(result.accumulationMonths).toBe(12);
    expect(result.retirementMonths).toBe(12);
    expect(result.retirementBalance).toBe(1_200);
    expect(result.endingBalance).toBe(0);
    expect(result.totalContributions).toBe(1_200);
    expect(result.totalWithdrawals).toBe(1_200);
    expect(result.totalWithdrawalShortfall).toBe(0);
    expect(
      result.points.filter((point) => point.phase === "retirement"),
    ).toHaveLength(12);
  });

  it("mantém o poder de compra quando aportes e retiradas são indexados", () => {
    const result = projectRetirement(
      zeroRateConfig({
        currentAge: 30,
        retirementAge: 31,
        lifeExpectancy: 31.5,
        monthlyContribution: 100,
        monthlyWithdrawal: 100,
        annualReturn: 0.1,
        inflation: 0.1,
        postRetirementReturn: 0.1,
        differentPostRetirementRate: true,
      }),
    );

    // Equal nominal return and inflation means zero real growth.  Indexed
    // cash flows therefore remain R$100 in today's purchasing power.
    expect(result.retirementBalance).toBeCloseTo(1_200, 7);
    expect(result.endingBalance).toBeCloseTo(600, 7);
    expect(result.points.at(1)?.contribution).toBeCloseTo(100, 7);
    expect(result.points.at(-1)?.requestedWithdrawal).toBeCloseTo(100, 7);
  });

  it("não converte ativos ilíquidos em reserva disponível", () => {
    const result = analyzeRetirement(
      zeroRateConfig({
        liquidAssets: 0,
        illiquidAssets: 1_000_000,
        monthlyContribution: 0,
        monthlyWithdrawal: 500,
      }),
    );

    expect(result.projection.retirementBalance).toBe(0);
    expect(result.projection.totalWithdrawalShortfall).toBe(6_000);
    expect(result.diagnostics).toContain(
      "ativos ilíquidos não foram usados para financiar retiradas",
    );
    expect(result.projection.illiquidAssets).toBe(1_000_000);
  });

  it("calcula a reserva de consumo como o valor presente das retiradas", () => {
    const result = projectRetirement(
      zeroRateConfig({
        monthlyContribution: 0,
        monthlyWithdrawal: 100,
        liquidAssets: 1_200,
        annualReturn: 0,
        inflation: 0,
      }),
    );

    expect(result.consume.requiredReserve).toBeCloseTo(1_200, 7);
    expect(result.consume.maxMonthlyWithdrawal).toBeCloseTo(100, 7);
    expect(result.consume.additionalLumpSum).toBe(0);
  });

  it("recusa preservação perpétua com taxa real nula", () => {
    const result = projectRetirement(
      zeroRateConfig({
        monthlyContribution: 0,
        liquidAssets: 10_000,
        monthlyWithdrawal: 100,
        strategy: { preserveMode: "perpetuity" },
        annualReturn: 0,
        inflation: 0,
      }),
    );

    expect(result.preserve.available).toBe(false);
    expect(result.preserve.requiredReserve).toBeNull();
    expect(result.preserve.maxMonthlyWithdrawal).toBeNull();
    expect(result.preserve.reason).toMatch(/taxa real mensal positiva/);
  });

  it("marca entradas inválidas e nunca lança para dados de runtime corrompidos", () => {
    const invalid = { ...zeroRateConfig(), retirementAge: 29 };
    expect(validateRetirementConfig(invalid)).not.toHaveLength(0);
    expect(projectRetirement(null as unknown as RetirementConfig).valid).toBe(
      false,
    );
    expect(projectRetirement(invalid).points).toHaveLength(0);
  });
});
