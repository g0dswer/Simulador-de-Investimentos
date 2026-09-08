import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import AdvancedDashboard from "../src/AdvancedDashboard";
import { DEFAULT_CONFIG, projectPlan } from "../src/lib/planner";
import { fmtBRL } from "../src/lib/calculos";
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AreaChart: () => null,
  Area: () => null,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
  Tooltip: () => null,
  Legend: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
const fill = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
it("restaura a matriz 5×5 e recalcula após editar os parâmetros", () => {
  render(
    <AdvancedDashboard
      initialConfig={{
        ...DEFAULT_CONFIG,
        initial: 0,
        monthly: 100,
        rate: 0,
        target: 1200,
        years: 1,
      }}
      onChange={() => {}}
    />,
  );
  click("sensibilidade");
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("row")).toHaveLength(6);
  expect(within(table).getAllByRole("cell")).toHaveLength(30);
  expect(table.textContent).toContain("1 ano e 0 meses");
  fill("Aporte mensal (base)", "200");
  expect(table.textContent).toContain("6 meses");
  click("planejar");
  expect(
    screen.getByText("Aporte mensal necessário (base)").parentElement
      ?.textContent,
  ).toContain(fmtBRL(100));
  click("testes");
  click("Reexecutar testes");
  expect(screen.getByText("Testes automatizados (embutidos)")).toBeTruthy();
  expect(
    document.querySelectorAll(".legacy-test-result").length,
  ).toBeGreaterThan(5);
});
it("exporta todos os meses atuais e mantém as hipóteses de inflação/reajuste ao salvar", async () => {
  const callback = vi.fn();
  const cfg = {
    ...DEFAULT_CONFIG,
    years: 1,
    monthly: 100,
    rate: 0.06,
    inflationAdjusted: true,
    inflationTable: [0.04],
    policy: { tipo: "anual_pct" as const, anualPct: 0.1 },
  };
  render(<AdvancedDashboard initialConfig={cfg} onChange={callback} />);
  expect(
    (screen.getByLabelText("Reajuste do aporte") as HTMLSelectElement).value,
  ).toBe("anual_pct");
  expect(
    (
      screen.getByLabelText(
        "Usar taxa real (ajustada pela inflação)",
      ) as HTMLInputElement
    ).checked,
  ).toBe(true);
  click("Salvar parâmetros");
  expect(
    JSON.parse(localStorage.getItem("simulador_plano_v3")!).inflationTable,
  ).toEqual([0.04]);
  fill("Aporte mensal (base)", "200");
  const create = vi.fn(() => "blob:download");
  Object.defineProperty(URL, "createObjectURL", {
    value: create,
    configurable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: vi.fn(),
    configurable: true,
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  click("dados");
  click("Exportar CSV");
  const blob = create.mock.calls[0]?.[0] as unknown as Blob;
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
  expect(text.trim().split("\n")).toHaveLength(14);
  const last = text.trim().split("\n").at(-1)!.split(",");
  expect(Number(last[2])).toBeCloseTo(
    projectPlan({ ...cfg, goal: "grow", monthly: 200 }).end.saldo,
    6,
  );
});
