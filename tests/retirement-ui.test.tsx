import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import App from "../src/App";
import RetirementDashboard from "../src/RetirementDashboard";
import { DEFAULT_CONFIG } from "../src/lib/planner";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AreaChart: () => <div />,
  Area: () => null,
  LineChart: () => <div />,
  Line: () => null,
  BarChart: () => <div />,
  Bar: () => null,
  PieChart: () => <div />,
  Pie: () => null,
  Cell: () => null,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
  Tooltip: () => null,
  Legend: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("mantém o dashboard antigo e preenche a aposentadoria a partir do guia", async () => {
  render(<App />);
  fireEvent.click(
    screen.getByRole("button", { name: /Quanto posso juntar\?/ }),
  );
  fireEvent.change(screen.getByLabelText("Quanto você já tem guardado?"), {
    target: { value: "10000" },
  });
  fireEvent.change(screen.getByLabelText("Quanto consegue guardar por mês?"), {
    target: { value: "500" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: "Ver meu plano" }));
  expect(await screen.findByLabelText("Montante inicial")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Aposentadoria", exact: true }),
  );
  const edit = await screen.findByRole("button", { name: "Editar ativos" });
  fireEvent.click(edit);
  const financial = await screen.findByLabelText("Patrimônio financeiro", {
    exact: true,
  });
  expect((financial as HTMLInputElement).value).toBe("10000");
  fireEvent.change(financial, { target: { value: "20000" } });
  fireEvent.click(screen.getByRole("button", { name: "Dashboard completo" }));
  expect(await screen.findByLabelText("Montante inicial")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "sensibilidade", exact: true }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Aposentadoria", exact: true }),
  );
  expect(
    (
      screen.getByLabelText("Patrimônio financeiro", {
        exact: true,
      }) as HTMLInputElement
    ).value,
  ).toBe("20000");
});

it("does not report saved when local storage rejects the write", () => {
  render(<RetirementDashboard initialConfig={DEFAULT_CONFIG} />);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar", exact: true }));
  expect(screen.getByText(/Não foi possível salvar/)).toBeTruthy();
  expect(screen.queryByText(/foi salvo neste dispositivo/)).toBeNull();
});

it("saves and reloads a named scenario including editable age-based cashflows", () => {
  const first = render(<RetirementDashboard initialConfig={DEFAULT_CONFIG} />);
  fireEvent.change(screen.getByLabelText("Nome do cenário"), {
    target: { value: "Plano teste" },
  });
  fireEvent.change(screen.getByLabelText("Aporte mensal", { exact: true }), {
    target: { value: "700" },
  });
  fireEvent.click(screen.getByRole("button", { name: "+ Adicionar período" }));
  expect(
    screen.getAllByLabelText("Aporte mensal", { exact: true }),
  ).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Remover período 2" }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar", exact: true }));
  first.unmount();
  render(<RetirementDashboard initialConfig={DEFAULT_CONFIG} />);
  const option = screen.getByRole("option", {
    name: "Plano teste",
  }) as HTMLOptionElement;
  fireEvent.change(screen.getByLabelText("Cenário salvo"), {
    target: { value: option.value },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Carregar", exact: true }),
  );
  expect(
    (
      screen.getByLabelText("Aporte mensal", {
        exact: true,
      }) as HTMLInputElement
    ).value,
  ).toBe("700");
  fireEvent.click(
    screen.getByRole("tab", { name: "Comparação de Cenários", exact: true }),
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Plano teste", exact: true }),
  );
  const comparison = screen.getByRole("table", {
    name: /Comparação de cenários salvos/,
  });
  expect(
    within(comparison).getByRole("rowheader", { name: "Plano teste" }),
  ).toBeTruthy();
});

it("exports canonical nominal cashflows even while viewing today's money", async () => {
  const createObjectURL = vi.fn((_blob: Blob) => "blob:retirement-test");
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = vi.fn();
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(
    <RetirementDashboard
      initialConfig={{
        ...DEFAULT_CONFIG,
        initial: 10000,
        monthly: 300,
        years: 1,
        rate: 0,
        inflation: 0.04,
        inflationAdjusted: true,
      }}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Exportar CSV", exact: true }),
  );
  expect(createObjectURL).toHaveBeenCalledOnce();
  const content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(createObjectURL.mock.calls[0][0]);
  });
  const line = content.split("\n").find((row) => row.startsWith('"12",'))!;
  const cells = line.split(",").map((s) => s.replaceAll('"', ""));
  expect(Number(cells[2])).toBeCloseTo(13600, 2);
  expect(Number(cells[3])).toBeCloseTo(13600 / 1.04, 2);
  expect(Number(cells[4])).toBeCloseTo(13600, 2);
  expect(Number(cells[5])).toBe(0);
});
