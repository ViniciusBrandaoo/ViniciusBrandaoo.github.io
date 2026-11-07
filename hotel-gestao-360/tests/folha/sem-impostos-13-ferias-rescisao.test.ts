import { describe, expect, it } from "vitest";
import { reais } from "@/dominio/comum/dinheiro.js";
import { calcularFerias } from "@/dominio/folha/ferias.js";
import { calcular13Salario } from "@/dominio/folha/decimo-terceiro.js";
import { semImpostosDaContabilidade } from "@/dominio/folha/sem-impostos.js";
import { TABELA_INSS_2025, TABELA_IRRF_2025 } from "@/dominio/folha/tabelas-seed.js";

const P = { inss: TABELA_INSS_2025, irrf: TABELA_IRRF_2025, fgtsPercentual: 8, tercoConstitucional: 33.3333 };

describe("13º, férias e rescisão sem impostos (contabilidade)", () => {
  it("férias: sai INSS/IRRF/FGTS, proventos iguais, líquido = proventos − descontos restantes", () => {
    const r = calcularFerias({ funcionarioId: "f", baseRemuneracaoMensal: reais(5000), diasFerias: 30, diasVendidos: 0, dependentesIrrf: 0 }, P);
    const s = semImpostosDaContabilidade(r);
    expect(r.rubricas.some((x) => /INSS|IRRF/i.test(x.descricao))).toBe(true);
    expect(s.rubricas.some((x) => /INSS|IRRF/i.test(x.descricao) || x.tipo === "ENCARGO_EMPREGADOR")).toBe(false);
    expect(s.totalProventos).toBe(r.totalProventos);
    expect(s.liquido).toBe(s.totalProventos - s.totalDescontos);
    expect(s.liquido).toBeGreaterThan(r.liquido);
    expect(s.fgts).toBe(0);
    expect(s.memoria.some((m) => /INSS|IRRF|FGTS/i.test(m.titulo))).toBe(false);
  });
  it("13º 2ª parcela: líquido sai bruto menos a 1ª parcela já paga", () => {
    const r = calcular13Salario({ funcionarioId: "f", ano: "2026", baseRemuneracaoMensal: reais(4000), mesesTrabalhados: 12, dependentesIrrf: 0, parcela: 2 }, P);
    const s = semImpostosDaContabilidade(r);
    expect(s.rubricas.some((x) => /INSS|IRRF/i.test(x.descricao))).toBe(false);
    expect(s.liquido).toBe(s.totalProventos - s.totalDescontos);
    expect(s.liquido).toBeGreaterThanOrEqual(r.liquido);
  });
});
