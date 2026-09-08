import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../src/App";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AreaChart: () => <div />,
  Area: () => null,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
  Tooltip: () => null,
  Legend: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));
beforeEach(() => localStorage.clear());
afterEach(cleanup);

it("abre o dashboard anterior com o aporte resolvido e preserva edições entre visualizações", async () => {
  render(<App />);
  fireEvent.click(
    screen.getByRole("button", { name: /Quanto preciso guardar por mês\?/ }),
  );
  fireEvent.change(screen.getByLabelText("Quanto você quer juntar?"), {
    target: { value: "1200" },
  });
  fireEvent.change(screen.getByLabelText("Em quantos anos quer chegar lá?"), {
    target: { value: "1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByLabelText(/Quero informar uma taxa/));
  fireEvent.change(screen.getByLabelText("Rendimento estimado por ano"), {
    target: { value: "0" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ver meu plano" }));
  expect(await screen.findByLabelText("Montante inicial")).toBeTruthy();
  expect(
    (screen.getByLabelText("Aporte mensal (base)") as HTMLInputElement).value,
  ).toBe("100");
  for (const name of ["planejar", "sensibilidade", "dados", "testes"])
    expect(screen.getByRole("button", { name, exact: true })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Montante inicial"), {
    target: { value: "100" },
  });
  fireEvent.change(screen.getByLabelText("Aporte mensal (base)"), {
    target: { value: "250" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Resumo guiado" }));
  expect(
    await screen.findByRole("heading", {
      name: /Você poderia juntar R\$\s*3\.100,00/,
    }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Dashboard completo" }));
  expect(
    ((await screen.findByLabelText("Aporte mensal (base)")) as HTMLInputElement)
      .value,
  ).toBe("250");
  fireEvent.click(screen.getByRole("button", { name: "Voltar às perguntas" }));
  expect(
    (
      screen.getByLabelText(
        "Quanto consegue guardar por mês?",
      ) as HTMLInputElement
    ).value,
  ).toBe("250");
});
