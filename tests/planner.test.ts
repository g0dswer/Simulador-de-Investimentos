import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  parseBrazilianNumber,
  projectPlan,
  sanitizeConfig,
} from "../src/lib/planner";

describe("adaptador do planejador para iniciantes", () => {
  it("interpreta moeda brasileira, decimal com ponto e percentuais negativos", () => {
    expect(parseBrazilianNumber("1.000,50")).toBe(1_000.5);
    expect(parseBrazilianNumber("1000,50")).toBe(1_000.5);
    expect(parseBrazilianNumber("1000.50")).toBe(1_000.5);
    expect(parseBrazilianNumber("1.000")).toBe(1_000);
    expect(parseBrazilianNumber("-12,5%")).toBeCloseTo(-0.125);
  });

  it("recusa entradas ambíguas ou com texto", () => {
    for (const value of [
      "",
      "   ",
      "R$ 1.000",
      "1,000.50",
      "1e3",
      "1.00.0",
      "12 %",
    ]) {
      expect(parseBrazilianNumber(value)).toBeNull();
    }
  });

  it("valida o payload v3 de armazenamento e retorna fallback isolado", () => {
    const saved = sanitizeConfig({ version: 3, ...DEFAULT_CONFIG });
    expect(saved).toEqual(DEFAULT_CONFIG);

    const changed = sanitizeConfig({
      ...DEFAULT_CONFIG,
      goal: "monthly",
      initial: 1_000,
      policy: { tipo: "anual_pct", anualPct: 0.05 },
    });
    expect(changed.goal).toBe("monthly");
    expect(changed.initial).toBe(1_000);
    expect(changed.policy).toEqual({ tipo: "anual_pct", anualPct: 0.05 });

    expect(sanitizeConfig({ ...DEFAULT_CONFIG, years: 0 })).toEqual(
      DEFAULT_CONFIG,
    );
    expect(sanitizeConfig({ ...DEFAULT_CONFIG, rate: -1 })).toEqual(
      DEFAULT_CONFIG,
    );
    expect(sanitizeConfig({ ...DEFAULT_CONFIG, monthly: 1e12 + 1 })).toEqual(
      DEFAULT_CONFIG,
    );
    expect(sanitizeConfig({ version: 2, ...DEFAULT_CONFIG })).toEqual(
      DEFAULT_CONFIG,
    );
    expect(
      sanitizeConfig({ ...DEFAULT_CONFIG, policy: { tipo: "unknown" } }),
    ).toEqual(DEFAULT_CONFIG);
    expect(
      sanitizeConfig({
        ...DEFAULT_CONFIG,
        policy: { tipo: "constante", mensalPct: 0 },
      }),
    ).toEqual(DEFAULT_CONFIG);
  });

  it("mantém o horizonte inteiro no modo de crescimento", () => {
    const plan = projectPlan({
      ...DEFAULT_CONFIG,
      years: 2,
      initial: 10_000,
      monthly: 500,
      target: 1_000_000,
      rate: 0,
    });

    expect(plan.overflow).toBe(false);
    expect(plan.data).toHaveLength(25);
    expect(plan.data.at(-1)?.mes).toBe(24);
    expect(plan.end).toEqual(plan.data.at(-1));
    expect(plan.monthTarget).toBeNull();
    expect(plan.monthly).toBe(500);
  });

  it("converte saldos e cada aporte para o valor de hoje", () => {
    const beginning = projectPlan({
      ...DEFAULT_CONFIG,
      years: 1,
      initial: 0,
      monthly: 100,
      target: 99.5,
      rate: 0.12,
      inflation: 0.12,
      inflationAdjusted: true,
      beginning: true,
    });
    const end = projectPlan({
      ...beginningConfig(beginning),
      beginning: false,
    });

    // A contribution at the beginning of month one is still worth R$ 100 in
    // today's money; an end-of-month contribution is discounted by one month.
    expect(beginning.data[1].aporte).toBeCloseTo(100, 10);
    expect(end.data[1].aporte).toBeCloseTo(100 / Math.pow(1.12, 1 / 12), 10);
    expect(beginning.monthTarget).toBe(1);
    expect(end.monthTarget).toBe(2);
    const expectedBeginningContributions = Array.from(
      { length: 12 },
      (_, index) => 100 / Math.pow(1.12, index / 12),
    ).reduce((sum, value) => sum + value, 0);
    const monthlyGrowth = Math.pow(1.12, 1 / 12) - 1;
    const expectedEndBalance =
      (100 * ((Math.pow(1 + monthlyGrowth, 12) - 1) / monthlyGrowth)) / 1.12;
    expect(beginning.data[12].contribuicoesAcum).toBeCloseTo(
      expectedBeginningContributions,
      8,
    );
    expect(end.data[12].saldo).toBeCloseTo(expectedEndBalance, 8);
    expect(end.data[12].ganhosAcum).toBeCloseTo(
      end.data[12].saldo - end.data[12].contribuicoesAcum,
      8,
    );
  });

  it("corta o gráfico no primeiro cruzamento do modo tempo", () => {
    const plan = projectPlan({
      ...DEFAULT_CONFIG,
      goal: "time",
      years: 10,
      initial: 0,
      monthly: 100,
      target: 250,
      rate: 0,
      inflation: 0,
    });

    expect(plan.monthTarget).toBe(3);
    expect(plan.data).toHaveLength(4);
    expect(plan.end.mes).toBe(3);
    expect(plan.monthly).toBe(100);
  });

  it("resolve o aporte pelo saldo no fim do prazo mesmo com inflação que deteriora o saldo real", () => {
    const plan = projectPlan({
      ...DEFAULT_CONFIG,
      goal: "monthly",
      years: 2,
      initial: 0,
      monthly: 100,
      target: 100,
      rate: 0,
      inflation: 10,
      inflationAdjusted: true,
      beginning: false,
    });

    expect(plan.overflow).toBe(false);
    expect(plan.monthly).not.toBeNull();
    expect(plan.monthly as number).toBeGreaterThan(500);
    expect(plan.data).toHaveLength(25);
    expect(plan.end.saldo).toBeGreaterThanOrEqual(100);
  });

  it("arredonda o aporte resolvido para cima no centavo exibido", () => {
    const plan = projectPlan({
      ...DEFAULT_CONFIG,
      goal: "monthly",
      years: 1,
      initial: 0,
      monthly: 0,
      target: 100,
      rate: 0,
      inflation: 0,
      inflationAdjusted: false,
      beginning: false,
    });

    expect(plan.monthly).toBe(8.34);
    expect(plan.end.saldo).toBeGreaterThanOrEqual(100);
    const oneCentLess = projectPlan({
      ...DEFAULT_CONFIG,
      goal: "grow",
      years: 1,
      initial: 0,
      monthly: 8.33,
      target: 100,
      rate: 0,
      inflation: 0,
      inflationAdjusted: false,
      beginning: false,
    });
    expect(oneCentLess.end.saldo).toBeLessThan(100);
  });

  it("não assume que a meta já está garantida quando o saldo deprecia até o fim", () => {
    const plan = projectPlan({
      ...DEFAULT_CONFIG,
      goal: "monthly",
      years: 1,
      initial: 100,
      monthly: 0,
      target: 100,
      rate: -0.99,
      inflation: 0,
      inflationAdjusted: false,
      beginning: false,
    });

    expect(plan.monthly).not.toBeNull();
    expect(plan.monthly as number).toBeGreaterThan(0);
    expect(plan.end.saldo).toBeGreaterThanOrEqual(100);
  });

  it("falha fechado para um saldo finito que já não cabe em centavos seguros", () => {
    const plan = projectPlan({
      ...DEFAULT_CONFIG,
      years: 80,
      initial: 1e12,
      monthly: 1e12,
      target: 1e12,
      rate: 10,
      inflation: 0,
      inflationAdjusted: false
    });

    expect(plan.overflow).toBe(true);
    expect(plan.monthly).toBeNull();
    expect(plan.data).toHaveLength(1);
    expect(plan.end.saldo).toBe(1e12);
  });

  it("não troca um config runtime inválido por uma projeção default bem-sucedida", () => {
    const invalid = { ...DEFAULT_CONFIG, years: 0 } as unknown as Parameters<typeof projectPlan>[0];
    const plan = projectPlan(invalid);

    expect(plan).toMatchObject({ overflow: false, monthly: null, monthTarget: null });
    expect(plan.data).toHaveLength(1);
    expect(plan.end.saldo).toBe(DEFAULT_CONFIG.initial);
  });

  it("falha fechado em uma projeção saturada", () => {
    const plan = projectPlan({
      ...DEFAULT_CONFIG,
      years: 80,
      monthly: 1e12,
      policy: { tipo: "mensal_pct", mensalPct: 10 },
    });

    expect(plan.overflow).toBe(true);
    expect(plan.monthly).toBeNull();
    expect(plan.data).toHaveLength(1);
    expect(plan.end.mes).toBe(0);
  });
});

function beginningConfig(_plan: ReturnType<typeof projectPlan>) {
  return {
    ...DEFAULT_CONFIG,
    years: 1,
    initial: 0,
    monthly: 100,
    target: 99.5,
    rate: 0.12,
    inflation: 0.12,
    inflationAdjusted: true,
    beginning: true,
  };
}
