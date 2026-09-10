import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETIREMENT,
  projectRetirement,
  RetirementConfig,
  validateRetirementConfig,
} from "../src/lib/retirement";

const base: RetirementConfig = {
  ...DEFAULT_RETIREMENT,
  currentAge: 30,
  retirementAge: 31,
  lifeExpectancy: 32,
  liquidAssets: 0,
  illiquidAssets: 0,
  monthlyContribution: 100,
  monthlyWithdrawal: 100,
  annualReturn: 0,
  inflation: 0,
  differentPostRetirementRate: false,
  cashflows: [],
  strategy: { preserveMode: "lifespan" },
};

describe("independent retirement cashflow oracles", () => {
  it("separates twelve deposits from twelve retirement withdrawals", () => {
    const p = projectRetirement(base);
    expect(p.valid).toBe(true);
    expect(p.retirementBalance).toBeCloseTo(1200, 6);
    expect(p.endingBalance).toBeCloseTo(0, 6);
    expect(p.totalWithdrawals).toBeCloseTo(1200, 6);
    expect(p.totalWithdrawalShortfall).toBe(0);
    expect(p.consume.requiredReserve).toBeCloseTo(1200, 6);
    expect(p.consume.additionalMonthly).toBeCloseTo(0, 6);
    expect(p.consume.maxMonthlyWithdrawal).toBeCloseTo(100, 6);
  });

  it("counts additional retirement income instead of discarding its net credit", () => {
    const p = projectRetirement({
      ...base,
      cashflows: [{ startAge: 31, endAge: 32, contribution: 50 }],
    });
    // An extra R$50 at each of the 12 retirement month-ends funds half the R$100 withdrawal.
    expect(p.consume.requiredReserve).toBeCloseTo(600, 6);
    expect(p.endingBalance).toBeCloseTo(600, 6);
  });

  it("does not fund an early retirement withdrawal with a later contribution", () => {
    const p = projectRetirement({
      ...base,
      monthlyContribution: 0,
      monthlyWithdrawal: 0,
      cashflows: [
        { startAge: 31, endAge: 31.5, withdrawal: 100 },
        { startAge: 31.5, endAge: 32, contribution: 100 },
      ],
    });
    expect(p.consume.requiredReserve).toBeCloseTo(600, 6);
    expect(p.totalWithdrawalShortfall).toBeCloseTo(600, 6);
  });

  it("accepts a 130 percent CDI multiplier", () => {
    expect(
      validateRetirementConfig({ ...base, cdiRate: 0.1, returnOverCdi: 130 }),
    ).toEqual([]);
  });

  it("additional deposits cover pre-retirement shortages as well as the target reserve", () => {
    const p = projectRetirement({
      ...base,
      monthlyContribution: 0,
      cashflows: [
        { startAge: 30, endAge: 30.5, withdrawal: 100 },
        { startAge: 30.5, endAge: 31, contribution: 100 },
      ],
    });
    // R$100 extra every month pays the first six withdrawals, then builds
    // R$1,200 in the final six months. R$50 would incorrectly ignore shortfalls.
    expect(p.consume.additionalMonthly).toBeCloseTo(100, 5);
    const funded = projectRetirement({
      ...base,
      monthlyContribution: p.consume.additionalMonthly!,
      cashflows: [
        { startAge: 30, endAge: 30.5, withdrawal: 100 },
        { startAge: 30.5, endAge: 31, contribution: 100 },
      ],
    });
    expect(funded.totalWithdrawalShortfall).toBeLessThan(0.001);
  });

  it("rejects overflow and malformed runtime data instead of showing capped money", () => {
    const huge = projectRetirement({
      ...base,
      liquidAssets: 1e12,
      annualReturn: 10,
      retirementAge: 90,
      lifeExpectancy: 120,
    });
    expect(huge.valid).toBe(false);
    expect(projectRetirement(null as unknown as RetirementConfig).valid).toBe(
      false,
    );
  });

  it("matches ordinary annuity and perpetuity oracles at a positive real rate", () => {
    const rate = 0.01;
    const p = projectRetirement({
      ...base,
      monthlyContribution: 0,
      liquidAssets: 10000,
      annualReturn: Math.pow(1 + rate, 12) - 1,
      strategy: { preserveMode: "perpetuity" },
    });
    const reserve = 10000 * Math.pow(1 + rate, 12);
    const annuity = (1 - Math.pow(1 + rate, -12)) / rate;
    expect(p.retirementBalance).toBeCloseTo(reserve, 6);
    expect(p.consume.requiredReserve).toBeCloseTo(100 * annuity, 6);
    expect(p.consume.maxMonthlyWithdrawal).toBeCloseTo(reserve / annuity, 5);
    expect(p.preserve.requiredReserve).toBeCloseTo(100 / rate, 5);
    expect(p.preserve.maxMonthlyWithdrawal).toBeCloseTo(reserve * rate, 5);
  });

  it("deflates each fixed nominal deposit at its own month, not at the final date", () => {
    const inflation = Math.pow(1.01, 12) - 1;
    const p = projectRetirement({
      ...base,
      annualReturn: inflation,
      inflation,
      indexContributions: false,
      monthlyWithdrawal: 0,
    });
    const expected = Array.from(
      { length: 12 },
      (_, i) => 100 / Math.pow(1.01, i + 1),
    ).reduce((a, b) => a + b, 0);
    expect(p.retirementBalance).toBeCloseTo(expected, 6);
    expect(p.endingBalance).toBeCloseTo(expected, 6);
  });
});
