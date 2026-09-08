import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../src/App";

// Layout is checked in a real browser; jsdom has no chart dimensions.
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AreaChart: () => <div data-testid="projection-chart" />,
  Area: () => null,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));
const fill = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const go = (goal = /Quanto posso juntar\?/) => {
  render(<App />);
  click(goal);
};
const viewSummary = () => {
  click(/Ver meu plano/);
  const summary = screen.queryByRole("button", { name: "Resumo guiado" });
  if (summary) fireEvent.click(summary);
};
const result = () => {
  click("Continuar");
  viewSummary();
};

describe("Planejamento guiado", () => {
  it("aceita moeda brasileira e mantém a vírgula durante a digitação", () => {
    go();
    fill("Quanto você já tem guardado?", "1");
    fill("Quanto você já tem guardado?", "1,");
    expect(
      (
        screen.getByLabelText(
          "Quanto você já tem guardado?",
        ) as HTMLInputElement
      ).value,
    ).toBe("1,");
    fill("Quanto você já tem guardado?", "1.000,50");
    fill("Quanto consegue guardar por mês?", "0");
    click("Continuar");
    fireEvent.click(screen.getByLabelText(/Quero informar uma taxa/));
    fill("Rendimento estimado por ano", "0%");
    viewSummary();
    expect(
      screen.getByRole("heading", {
        name: /Você poderia juntar R\$\s*1\.000,50/,
      }),
    ).toBeTruthy();
  });
  it("bloqueia valores inválidos e permite começar do zero", () => {
    go();
    fill("Quanto você já tem guardado?", "texto");
    click("Continuar");
    expect(
      screen.getByRole("heading", { name: "Vamos dar forma ao seu plano." }),
    ).toBeTruthy();
    expect(
      screen
        .getByLabelText("Quanto você já tem guardado?")
        .getAttribute("aria-invalid"),
    ).toBe("true");
    click("Ainda não tenho dinheiro guardado");
    click("Continuar");
    expect(
      screen.getByRole("heading", {
        name: "Uma estimativa, com tudo às claras.",
      }),
    ).toBeTruthy();
  });
  it("trata 6% como seis por cento, sem converter duas vezes", () => {
    go();
    fill("Quanto você já tem guardado?", "1000");
    fill("Quanto consegue guardar por mês?", "0");
    fill("Por quantos anos pretende guardar?", "1");
    click("Continuar");
    fireEvent.click(screen.getByLabelText(/Quero informar uma taxa/));
    fill("Rendimento estimado por ano", "6%");
    viewSummary();
    expect(
      screen.getByRole("heading", {
        name: /Você poderia juntar R\$\s*1\.060,00/,
      }),
    ).toBeTruthy();
  });
  it("pede apenas meta e prazo quando calcula o valor mensal", () => {
    go(/Quanto preciso guardar por mês\?/);
    expect(
      screen.queryByLabelText("Quanto consegue guardar por mês?"),
    ).toBeNull();
    fill("Quanto você quer juntar?", "1200");
    fill("Em quantos anos quer chegar lá?", "1");
    click("Continuar");
    fireEvent.click(screen.getByLabelText(/Quero informar uma taxa/));
    fill("Rendimento estimado por ano", "0");
    viewSummary();
    expect(
      screen.getByRole("heading", {
        name: /Comece guardando R\$\s*100,00 por mês/,
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "+ R$ 100 por mês" }),
    ).toBeNull();
  });
  it("explica meta inalcançada e permite voltar sem perder os campos", () => {
    go(/Quando consigo chegar à minha meta\?/);
    fill("Quanto consegue guardar por mês?", "0");
    result();
    expect(
      screen.getByRole("heading", {
        name: "A meta não seria alcançada em 50 anos.",
      }),
    ).toBeTruthy();
    click(/Editar meu plano/);
    expect(
      (
        screen.getByLabelText(
          "Quanto consegue guardar por mês?",
        ) as HTMLInputElement
      ).value,
    ).toBe("0");
  });
  it("simula mudanças sem sobrescrever o plano salvo", () => {
    go();
    result();
    const original = screen.getByRole("heading", {
      name: /Você poderia juntar/,
    }).textContent;
    click("+ R$ 100 por mês");
    expect(
      screen.getByRole("heading", { name: /Você poderia juntar/ }).textContent,
    ).not.toBe(original);
    click(/Salvar neste dispositivo/);
    expect(
      JSON.parse(localStorage.getItem("simulador_plano_v3")!).monthly,
    ).toBe(300);
    click("Voltar ao plano original");
    expect(
      screen.getByRole("heading", { name: /Você poderia juntar/ }).textContent,
    ).toBe(original);
  });
  it("mostra inflação em dinheiro de hoje e rejeita tabela inválida", () => {
    go();
    click("Continuar");
    fireEvent.click(
      screen.getByLabelText(/Considerar que os preços podem aumentar/),
    );
    fireEvent.click(
      screen.getByLabelText(/Usar uma inflação diferente em cada ano/),
    );
    fill("Inflação de cada ano, em porcentagem", "abc");
    viewSummary();
    expect(
      screen.getByRole("heading", {
        name: "Uma estimativa, com tudo às claras.",
      }),
    ).toBeTruthy();
    fill("Inflação de cada ano, em porcentagem", "4%; 3,5%");
    viewSummary();
    expect(screen.getByText("em dinheiro de hoje")).toBeTruthy();
    click(/Salvar neste dispositivo/);
    expect(
      JSON.parse(localStorage.getItem("simulador_plano_v3")!).inflationTable,
    ).toEqual([0.04, 0.035]);
  });
  it("recupera os valores antigos e sua política de reajuste", () => {
    localStorage.setItem(
      "simulador_meta_config_v2",
      JSON.stringify({
        montanteInicial: 1234,
        aporteMensal: 567,
        rentabAnual: 0.08,
        meta: 100000,
        anosLimite: 50,
        contribuicaoNoInicio: true,
        usarTaxaReal: false,
        inflacaoAnual: 0.04,
        tipoAporte: "anual_pct",
        anualPct: 0.05,
      }),
    );
    go(/Quando consigo chegar à minha meta\?/);
    expect(
      (
        screen.getByLabelText(
          "Quanto você já tem guardado?",
        ) as HTMLInputElement
      ).value,
    ).toBe("1.234");
    click("Continuar");
    expect(
      (
        screen.getByLabelText(
          "Como seus depósitos mudam com o tempo?",
        ) as HTMLSelectElement
      ).value,
    ).toBe("anual_pct");
  });
  it("continua funcionando quando o armazenamento é bloqueado", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    go();
    result();
    click(/Salvar neste dispositivo/);
    expect(screen.getByText(/O navegador não permitiu salvar/)).toBeTruthy();
  });
});
