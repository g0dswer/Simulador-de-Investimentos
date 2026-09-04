import { describe, expect, it } from "vitest";
import {
  anosParaMeses,
  calcularProjecao,
  parseInflacaoTabela,
  taxaNecessaria,
  aporteNecessario,
  validarParametros
} from "../src/lib/calculos";
import { rodarTestes } from "../src/lib/testCases";

describe("Simulador - testes embutidos", () => {
  it("passa em todos os cenários de regressão", () => {
    const resultados = rodarTestes();
    const falhas = resultados.filter((r) => !r.passou);
    if (falhas.length > 0) {
      const detalhes = falhas.map((f) => `${f.nome}: ${f.detalhe ?? ""}`).join("\n");
      throw new Error(`Falhas encontradas:\n${detalhes}`);
    }
    expect(falhas).toHaveLength(0);
  });
});

describe("Núcleo de cálculos - contratos", () => {
  it("interpreta decimal com vírgula no exemplo da interface", () => {
    expect(parseInflacaoTabela("0,04, 0,05, 0,035, 0,04")).toEqual([
      0.04,
      0.05,
      0.035,
      0.04
    ]);
  });

  it("aceita ponto, separadores estruturais e sufixo de porcentagem", () => {
    expect(parseInflacaoTabela("0.04; 0.05\n0.035\t4%")).toEqual([
      0.04,
      0.05,
      0.035,
      0.04
    ]);
  });

  it("descarta inflações fora do domínio em vez de corrigi-las silenciosamente", () => {
    expect(parseInflacaoTabela("-100%; -1; -2")).toEqual([]);
  });

  it("não cria um mês oculto para horizonte zero", () => {
    expect(anosParaMeses(0)).toBe(0);
    const projection = calcularProjecao({
      montanteInicial: 100,
      aporteMensal: 50,
      rentabAnual: 0,
      meta: 1_000,
      anosLimite: 0,
      contribuicaoNoInicio: true,
      usarTaxaReal: false,
      inflacaoAnual: 0
    });
    expect(projection.dados).toHaveLength(1);
    expect(projection.dados[0]).toMatchObject({ mes: 0, saldo: 100, aporte: 0 });
    expect(projection.mesAlvo).toBeNull();
  });

  it("usa os mesmos meses completos na projeção e nos dois solvers", () => {
    const anos = 1.999;
    const projection = calcularProjecao({
      montanteInicial: 0,
      aporteMensal: 100,
      rentabAnual: 0,
      meta: 2_400,
      anosLimite: anos,
      contribuicaoNoInicio: false,
      usarTaxaReal: false,
      inflacaoAnual: 0
    });
    const contribution = aporteNecessario({
      montanteInicial: 0,
      rentabAnual: 0,
      anos,
      meta: 2_400,
      contribuicaoNoInicio: false,
      usarTaxaReal: false,
      inflacaoAnual: 0
    });
    const rate = taxaNecessaria({
      montanteInicial: 0,
      aporteMensal: 100,
      anos,
      meta: 2_400,
      contribuicaoNoInicio: false,
      usarTaxaReal: false,
      inflacaoAnual: 0
    });

    expect(anosParaMeses(anos)).toBe(23);
    expect(projection.dados.at(-1)).toMatchObject({ mes: 23, saldo: 2_300 });
    expect(contribution).toBeCloseTo(2_400 / 23, 8);
    expect(rate).not.toBeNull();
    expect(rate as number).toBeGreaterThan(0);
  });

  it("retorna a anualização nominal sem reaplicar inflação no modo real", () => {
    const result = taxaNecessaria({
      montanteInicial: 10_000,
      aporteMensal: 0,
      anos: 1,
      meta: 10_000,
      contribuicaoNoInicio: false,
      usarTaxaReal: true,
      inflacaoAnual: 0.12
    });
    expect(result).not.toBeNull();
    expect(result as number).toBeCloseTo(0.12, 8);
  });

  it("expande o bracket acima de 100% ao mês quando necessário", () => {
    const result = taxaNecessaria({
      montanteInicial: 1,
      aporteMensal: 0,
      anos: 1,
      meta: 1_000_000,
      contribuicaoNoInicio: false,
      usarTaxaReal: false,
      inflacaoAnual: 0
    });
    expect(result).not.toBeNull();
    expect(result as number).toBeCloseTo(999_999, 2);
  });

  it("falha fechado quando aporte não tem horizonte para formar bracket", () => {
    const result = aporteNecessario({
      montanteInicial: 0,
      rentabAnual: 0,
      anos: 0,
      meta: 100,
      contribuicaoNoInicio: true,
      usarTaxaReal: false,
      inflacaoAnual: 0
    });
    expect(result).toBeNull();
  });

  it("não itera nem retorna NaN com horizonte não finito", () => {
    const result = taxaNecessaria({
      montanteInicial: 0,
      aporteMensal: 100,
      anos: Number.POSITIVE_INFINITY,
      meta: 1_000,
      contribuicaoNoInicio: true,
      usarTaxaReal: false,
      inflacaoAnual: 0
    });
    expect(result).toBeNull();
  });

  it("rejeita domínio inválido e mantém a projeção finita", () => {
    expect(validarParametros({
      montanteInicial: 100,
      aporteMensal: 10,
      rentabAnual: -1,
      anos: 1,
      meta: 1_000,
      inflacaoAnual: 0
    })).toBe(false);
    expect(validarParametros({
      montanteInicial: 100,
      aporteMensal: 10,
      rentabAnual: 0,
      anos: 1,
      meta: 1_000,
      inflacaoAnual: -1
    })).toBe(false);

    for (const rentabAnual of [-1, -2]) {
      const projection = calcularProjecao({
        montanteInicial: 100,
        aporteMensal: 10,
        rentabAnual,
        meta: 1_000,
        anosLimite: 1,
        contribuicaoNoInicio: true,
        usarTaxaReal: false,
        inflacaoAnual: 0
      });
      expect(projection.dados.every((row) => Object.values(row).every(Number.isFinite))).toBe(true);
      expect(projection.mesAlvo).toBeNull();
    }

    const projection = calcularProjecao({
      montanteInicial: 100,
      aporteMensal: 10,
      rentabAnual: 0.1,
      meta: 1_000,
      anosLimite: 1,
      contribuicaoNoInicio: true,
      usarTaxaReal: true,
      inflacaoAnual: -1
    });
    expect(projection.dados.every((row) => Object.values(row).every(Number.isFinite))).toBe(true);
  });
});
