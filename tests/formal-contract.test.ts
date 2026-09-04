import { describe, expect, it } from "vitest";
import {
  aporteNecessario,
  approxEq,
  calcularProjecao,
  taxaNecessaria
} from "../src/lib/calculos";

/**
 * Executable bridge to formal/Investment.lean.
 *
 * Lean proves these identities over exact rationals. These tests check that
 * the public TypeScript calculation follows the same contract for controlled
 * IEEE-754 inputs.
 */
describe("contrato executável da especificação Lean", () => {
  it("acumula principal mais n aportes quando a taxa é zero", () => {
    const months = 24;
    const principal = 10_000;
    const contribution = 500;
    const result = calcularProjecao({
      montanteInicial: principal,
      aporteMensal: contribution,
      rentabAnual: 0,
      meta: Number.MAX_VALUE,
      anosLimite: months / 12,
      contribuicaoNoInicio: false,
      usarTaxaReal: false,
      inflacaoAnual: 0,
    });

    expect(result.dados.at(-1)?.saldo).toBe(principal + months * contribution);
  });

  it("diferencia aporte no início e no fim por aporte vezes taxa em um mês", () => {
    const monthlyRate = 0.01;
    const annualRate = Math.pow(1 + monthlyRate, 12) - 1;
    const common = {
      montanteInicial: 10_000,
      aporteMensal: 500,
      rentabAnual: annualRate,
      meta: Number.MAX_VALUE,
      anosLimite: 1 / 12,
      usarTaxaReal: false,
      inflacaoAnual: 0,
    };

    const beginning = calcularProjecao({ ...common, contribuicaoNoInicio: true });
    const end = calcularProjecao({ ...common, contribuicaoNoInicio: false });
    const difference = beginning.dados.at(-1)!.saldo - end.dados.at(-1)!.saldo;

    expect(difference).toBeCloseTo(common.aporteMensal * monthlyRate, 10);
  });

  it("produz taxa real zero quando nominal e inflação são iguais", () => {
    const principal = 10_000;
    const result = calcularProjecao({
      montanteInicial: principal,
      aporteMensal: 0,
      rentabAnual: 0.12,
      meta: Number.MAX_VALUE,
      anosLimite: 1,
      contribuicaoNoInicio: false,
      usarTaxaReal: true,
      inflacaoAnual: 0.12,
    });

    expect(result.dados.at(-1)?.saldo).toBeCloseTo(principal, 10);
  });

  it("coincide com a forma fechada em 500 cenários determinísticos", () => {
    let state = 0x5eed1234;
    const random = () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    };

    for (let index = 0; index < 500; index++) {
      const months = 1 + Math.floor(random() * 360);
      const principal = random() * 100_000;
      const contribution = random() * 5_000;
      const monthlyRate = -0.005 + random() * 0.025;
      const annualRate = Math.pow(1 + monthlyRate, 12) - 1;
      const growth = Math.pow(1 + monthlyRate, months);
      const annuityEnd = contribution * ((growth - 1) / monthlyRate);

      for (const beginning of [false, true]) {
        const result = calcularProjecao({
          montanteInicial: principal,
          aporteMensal: contribution,
          rentabAnual: annualRate,
          meta: Number.MAX_VALUE,
          anosLimite: months / 12,
          contribuicaoNoInicio: beginning,
          usarTaxaReal: false,
          inflacaoAnual: 0
        });
        const expected = principal * growth + annuityEnd * (beginning ? 1 + monthlyRate : 1);

        expect(
          approxEq(result.dados.at(-1)!.saldo, expected, 1e-9),
          `cenário ${index}, aporte ${beginning ? "início" : "fim"}`
        ).toBe(true);
      }
    }
  });

  it("mantém o bracket do aporte: o limite superior atinge e um valor menor falha", () => {
    const target = 2_400;
    const months = 23;
    const required = aporteNecessario({
      montanteInicial: 0,
      rentabAnual: 0,
      anos: months / 12,
      meta: target,
      contribuicaoNoInicio: false,
      usarTaxaReal: false,
      inflacaoAnual: 0
    });
    expect(required).not.toBeNull();

    const finalBalance = (contribution: number) => calcularProjecao({
      montanteInicial: 0,
      aporteMensal: contribution,
      rentabAnual: 0,
      meta: target,
      anosLimite: months / 12,
      contribuicaoNoInicio: false,
      usarTaxaReal: false,
      inflacaoAnual: 0
    }).dados.at(-1)!.saldo;

    expect(finalBalance(required as number)).toBeGreaterThanOrEqual(target);
    expect(finalBalance((required as number) - 1e-8)).toBeLessThan(target);
  });

  it("mantém o bracket da taxa e devolve o limite superior que atinge a meta", () => {
    const target = 11_000;
    const required = taxaNecessaria({
      montanteInicial: 10_000,
      aporteMensal: 0,
      anos: 1,
      meta: target,
      contribuicaoNoInicio: false,
      usarTaxaReal: false,
      inflacaoAnual: 0
    });
    expect(required).not.toBeNull();

    const finalBalance = (annualRate: number) => calcularProjecao({
      montanteInicial: 10_000,
      aporteMensal: 0,
      rentabAnual: annualRate,
      meta: target,
      anosLimite: 1,
      contribuicaoNoInicio: false,
      usarTaxaReal: false,
      inflacaoAnual: 0
    }).dados.at(-1)!.saldo;

    expect(required as number).toBeCloseTo(0.1, 10);
    expect(finalBalance(required as number)).toBeGreaterThanOrEqual(target);
    expect(finalBalance((required as number) - 1e-8)).toBeLessThan(target);
  });

  it("retorna falha explícita quando nenhuma taxa pode formar bracket", () => {
    expect(taxaNecessaria({
      montanteInicial: 0,
      aporteMensal: 0,
      anos: 10,
      meta: 1,
      contribuicaoNoInicio: false,
      usarTaxaReal: false,
      inflacaoAnual: 0
    })).toBeNull();
  });
});
