import { describe, expect, it } from "vitest";
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
