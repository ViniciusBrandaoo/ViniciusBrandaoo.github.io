import { describe, expect, it } from "vitest";
import { calcularFolha } from "@/dominio/folha/motor.js";
import { movimento, parametros, professor } from "../fixtures/folha.js";

describe("impostos e encargos apurados pela contabilidade", () => {
  it("não desconta INSS nem IRRF e não lança encargos da escola", () => {
    const normal = calcularFolha(professor(), movimento({}), parametros());
    const semImpostos = calcularFolha(professor(), movimento({}), { ...parametros(), impostosPelaContabilidade: true });

    const codigos = (r: typeof normal) => r.rubricas.map((x) => x.codigo);
    expect(codigos(normal)).toContain("601");
    expect(codigos(semImpostos)).not.toContain("601");
    expect(codigos(semImpostos)).not.toContain("602");
    expect(semImpostos.totalProventos).toBe(normal.totalProventos);
    expect(semImpostos.liquido).toBe(semImpostos.totalProventos - semImpostos.totalDescontos);
    expect(semImpostos.liquido).toBeGreaterThan(normal.liquido);
    expect(semImpostos.rubricas.some((x) => x.tipo === "ENCARGO_EMPREGADOR")).toBe(false);
    expect(normal.rubricas.some((x) => x.tipo === "ENCARGO_EMPREGADOR")).toBe(true);
    expect(semImpostos.custoTotalEmpregador).toBe(semImpostos.remuneracaoBruta);
  });
});
