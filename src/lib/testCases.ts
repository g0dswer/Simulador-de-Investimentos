import { aporteNecessario, calcularProjecao, mesesParaAnosMeses, taxaNecessaria, approxEq } from "./calculos";

export type TestRes = { nome: string; passou: boolean; detalhe?: string };

export function rodarTestes(): TestRes[] {
  const T: TestRes[] = [];

  T.push({ nome: "0 meses", passou: mesesParaAnosMeses(0) === "0 meses", detalhe: mesesParaAnosMeses(0) });
  T.push({ nome: "13 meses", passou: mesesParaAnosMeses(13) === "1 ano e 1 mês", detalhe: mesesParaAnosMeses(13) });

  const p1 = calcularProjecao({
    montanteInicial: 0,
    aporteMensal: 100,
    rentabAnual: 0,
    meta: 1200,
    anosLimite: 2,
    contribuicaoNoInicio: true,
    usarTaxaReal: false,
    inflacaoAnual: 0
  });
  T.push({ nome: "Projeção sem juros (início)", passou: p1.mesAlvo === 12, detalhe: String(p1.mesAlvo) });

  const p2 = calcularProjecao({
    montanteInicial: 0,
    aporteMensal: 100,
    rentabAnual: 0,
    meta: 1200,
    anosLimite: 2,
    contribuicaoNoInicio: false,
    usarTaxaReal: false,
    inflacaoAnual: 0
  });
  T.push({ nome: "Projeção sem juros (fim)", passou: p2.mesAlvo === 12, detalhe: String(p2.mesAlvo) });

  const aNec = aporteNecessario({
    montanteInicial: 0,
    rentabAnual: 0,
    anos: 10,
    meta: 12000,
    contribuicaoNoInicio: true,
    usarTaxaReal: false,
    inflacaoAnual: 0
  });
  T.push({ nome: "Aporte necessário (taxa zero)", passou: approxEq(aNec, 100), detalhe: aNec.toFixed(4) });

  const tNec = taxaNecessaria({
    montanteInicial: 0,
    aporteMensal: 100,
    anos: 10,
    meta: 12000,
    contribuicaoNoInicio: true,
    usarTaxaReal: false,
    inflacaoAnual: 0
  });
  T.push({
    nome: "Taxa necessária ~0",
    passou: tNec !== null && Math.abs(tNec) < 1e-4,
    detalhe: tNec === null ? "null" : tNec.toExponential(2)
  });

  const rentAA = 0.12;
  const r = Math.pow(1 + rentAA, 1 / 12) - 1;
  const n = 240;
  const A = 1000;
  const P = 10000;
  const sim = calcularProjecao({
    montanteInicial: P,
    aporteMensal: A,
    rentabAnual: rentAA,
    meta: 1e12,
    anosLimite: n / 12,
    contribuicaoNoInicio: true,
    usarTaxaReal: false,
    inflacaoAnual: 0
  });
  const vfInicial = P * Math.pow(1 + r, n);
  const fatorFim = (Math.pow(1 + r, n) - 1) / r;
  const vfAportes = A * fatorFim * (1 + r);
  const esperado = vfInicial + vfAportes;
  const passou = approxEq(sim.dados[n].saldo, esperado, 1e-9);
  T.push({
    nome: "Fechada vs simulação (início)",
    passou,
    detalhe: `${sim.dados[n].saldo.toFixed(2)} vs ${esperado.toFixed(2)}`
  });

  const p3 = calcularProjecao({
    montanteInicial: 0,
    aporteMensal: 10,
    rentabAnual: 0.02,
    meta: 1_000_000,
    anosLimite: 1,
    contribuicaoNoInicio: true,
    usarTaxaReal: false,
    inflacaoAnual: 0
  });
  T.push({ nome: "Meta não alcançada (limite curto)", passou: p3.mesAlvo === null });

  const gMensal = 0.01;
  const n12 = 12;
  const base = 100;
  const simVar1 = calcularProjecao({
    montanteInicial: 0,
    aporteMensal: base,
    rentabAnual: 0,
    meta: 1e12,
    anosLimite: n12 / 12,
    contribuicaoNoInicio: false,
    usarTaxaReal: false,
    inflacaoAnual: 0,
    politicaAporte: { tipo: "mensal_pct", mensalPct: gMensal }
  });
  const somaGeom = base * ((Math.pow(1 + gMensal, n12) - 1) / gMensal);
  T.push({
    nome: "Crescimento mensal (r=0)",
    passou: approxEq(simVar1.dados[n12].saldo, somaGeom, 1e-9),
    detalhe: `${simVar1.dados[n12].saldo.toFixed(2)} vs ${somaGeom.toFixed(2)}`
  });

  const simVar2 = calcularProjecao({
    montanteInicial: 0,
    aporteMensal: 100,
    rentabAnual: 0,
    meta: 1e12,
    anosLimite: 2,
    contribuicaoNoInicio: false,
    usarTaxaReal: false,
    inflacaoAnual: 0,
    politicaAporte: { tipo: "anual_pct", anualPct: 0.1 }
  });
  const esperado2 = 11 * 100 + 110 + 11 * 110 + 121;
  T.push({
    nome: "Reajuste anual 10% no mês 12/24 (r=0)",
    passou: approxEq(simVar2.dados[24].saldo, esperado2, 1e-9),
    detalhe: `${simVar2.dados[24].saldo.toFixed(2)} vs ${esperado2.toFixed(2)}`
  });

  const simVar3 = calcularProjecao({
    montanteInicial: 0,
    aporteMensal: 100,
    rentabAnual: 0,
    meta: 1e12,
    anosLimite: 2,
    contribuicaoNoInicio: false,
    usarTaxaReal: false,
    inflacaoAnual: 0,
    inflacaoTabela: [0.1, 0.0],
    politicaAporte: { tipo: "anual_inflacao" }
  });
  const esperado3 = 11 * 100 + 110 + 11 * 110 + 110;
  T.push({
    nome: "Reajuste por inflação tabelada (r=0)",
    passou: approxEq(simVar3.dados[24].saldo, esperado3, 1e-9),
    detalhe: `${simVar3.dados[24].saldo.toFixed(2)} vs ${esperado3.toFixed(2)}`
  });

  const simVar4 = calcularProjecao({
    montanteInicial: 10000,
    aporteMensal: 0,
    rentabAnual: 0.12,
    meta: 1e12,
    anosLimite: 1,
    contribuicaoNoInicio: false,
    usarTaxaReal: true,
    inflacaoAnual: 0,
    inflacaoTabela: [0.12]
  });
  T.push({
    nome: "Taxa real com inflação=nominal (12m)",
    passou: approxEq(simVar4.dados[12].saldo, 10000, 1e-6),
    detalhe: `${simVar4.dados[12].saldo.toFixed(2)} vs 10000.00`
  });

  const simVar5 = calcularProjecao({
    montanteInicial: 0,
    aporteMensal: 100,
    rentabAnual: 0,
    meta: 1e9,
    anosLimite: 2,
    contribuicaoNoInicio: false,
    usarTaxaReal: false,
    inflacaoAnual: 0,
    politicaAporte: { tipo: "anual_pct", anualPct: 0.1 }
  });
  const ap11 = simVar5.dados[11].aporte;
  const ap12 = simVar5.dados[12].aporte;
  T.push({
    nome: "Reajuste em 12 (não em 11)",
    passou: approxEq(ap11, 100) && approxEq(ap12, 110),
    detalhe: `${ap11.toFixed(2)} -> ${ap12.toFixed(2)}`
  });

  const simVar6 = calcularProjecao({
    montanteInicial: 0,
    aporteMensal: 100,
    rentabAnual: 0,
    meta: 1e9,
    anosLimite: 1.1,
    contribuicaoNoInicio: false,
    usarTaxaReal: false,
    inflacaoAnual: 0.05,
    politicaAporte: { tipo: "anual_real", realExtra: 0.02 }
  });
  const ap12r = simVar6.dados[12].aporte;
  T.push({
    nome: "Anual real = inflação + extra",
    passou: approxEq(ap12r, 100 * 1.071, 1e-6),
    detalhe: ap12r.toFixed(4)
  });

  return T;
}
