import { describe, expect, it } from "vitest";
import { ocultarValores } from "../../servidor/salario-restrito.js";

const RESTRITO = "85dffe2d-dda7-4144-bd03-a23d6ca9576a";
const OUTRO = "79752bde-6b0c-4fde-8e63-7991e2c88fd5";

describe("salário restrito: ocultar valores para quem não é Direção", () => {
  it("linha da folha (GET /api/folha/:competencia) esconde o líquido de quem é restrito", () => {
    // Antes, a linha só trazia o id do cálculo e o líquido vazava.
    const linhas = [
      { id: "c1", employeeId: RESTRITO, nome: "A", liquido_centavos: "777700", total_proventos_centavos: "777700", tem_divergencia: false },
      { id: "c2", employeeId: OUTRO, nome: "B", liquido_centavos: "850000", total_proventos_centavos: "850000", tem_divergencia: false },
    ];
    const [a, b] = ocultarValores(linhas, new Set([RESTRITO])) as Array<Record<string, unknown>>;
    expect(a).toMatchObject({ liquido_centavos: null, total_proventos_centavos: null, salarioOculto: true, nome: "A" });
    expect(b).toMatchObject({ liquido_centavos: "850000", total_proventos_centavos: "850000" });
  });

  it("sem identificar o dono da linha, nada é ocultado (por isso a rota precisa devolver employeeId)", () => {
    const [a] = ocultarValores([{ id: "c1", liquido_centavos: "777700" }], new Set([RESTRITO])) as Array<Record<string, unknown>>;
    expect(a?.liquido_centavos).toBe("777700");
  });
});
