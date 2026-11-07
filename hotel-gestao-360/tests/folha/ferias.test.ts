import { describe, expect, it } from "vitest";
import { reais } from "@/dominio/comum/dinheiro.js";
import { calcularFerias, diasFeriasPorFaltas } from "@/dominio/folha/ferias.js";
import {
  TABELA_INSS_2025,
  TABELA_IRRF_2025,
} from "@/dominio/folha/tabelas-seed.js";

const PARAMETROS = {
  inss: TABELA_INSS_2025,
  irrf: TABELA_IRRF_2025,
  fgtsPercentual: 8,
  tercoConstitucional: 33.3333,
};

describe("diasFeriasPorFaltas", () => {
  it("segue a escala do art. 130 da CLT", () => {
    expect(diasFeriasPorFaltas(0)).toBe(30);
    expect(diasFeriasPorFaltas(5)).toBe(30);
    expect(diasFeriasPorFaltas(6)).toBe(24);
    expect(diasFeriasPorFaltas(14)).toBe(24);
    expect(diasFeriasPorFaltas(15)).toBe(18);
    expect(diasFeriasPorFaltas(23)).toBe(18);
    expect(diasFeriasPorFaltas(24)).toBe(12);
    expect(diasFeriasPorFaltas(32)).toBe(12);
  });

  it("perde o direito acima de 32 faltas injustificadas", () => {
    expect(diasFeriasPorFaltas(33)).toBe(0);
    expect(diasFeriasPorFaltas(100)).toBe(0);
  });

  it("é monotônico: mais falta nunca dá mais dia de férias", () => {
    let anterior = 30;
    for (let f = 0; f <= 40; f++) {
      const dias = diasFeriasPorFaltas(f);
      expect(dias).toBeLessThanOrEqual(anterior);
      anterior = dias;
    }
  });
});

describe("calcularFerias — dias gozados", () => {
  it("paga o valor-dia (mensal ÷ 30) vezes os dias gozados, mais 1/3", () => {
    const r = calcularFerias(
      { funcionarioId: "f1", baseRemuneracaoMensal: reais(3000), diasFerias: 30, diasVendidos: 0, dependentesIrrf: 0 },
      PARAMETROS,
    );
    expect(r.diasGozados).toBe(30);
    expect(r.rubricas.find((x) => x.codigo === "941")?.valor).toBe(reais(3000)); // 30 × 100
    expect(r.rubricas.find((x) => x.codigo === "942")?.valor).toBe(reais(1000)); // 1/3 de 3.000
    expect(r.totalProventos).toBe(reais(4000));
  });

  it("desconta INSS e IRRF sobre a base COMBINADA (férias + terço), não separadamente", () => {
    const r = calcularFerias(
      { funcionarioId: "f1", baseRemuneracaoMensal: reais(3000), diasFerias: 30, diasVendidos: 0, dependentesIrrf: 0 },
      PARAMETROS,
    );
    expect(r.rubricas.find((x) => x.codigo === "943")?.valor).toBe(reais(373.41));
    expect(r.rubricas.find((x) => x.codigo === "944")?.valor).toBe(reais(114.76));
    expect(r.totalDescontos).toBe(reais(488.17));
    expect(r.liquido).toBe(reais(3511.83));
  });

  it("recolhe FGTS sobre férias + terço", () => {
    const r = calcularFerias(
      { funcionarioId: "f1", baseRemuneracaoMensal: reais(3000), diasFerias: 30, diasVendidos: 0, dependentesIrrf: 0 },
      PARAMETROS,
    );
    expect(r.fgts).toBe(reais(320)); // 8% de 4.000
  });

  it("proporcionaliza corretamente para dias reduzidos (por falta ou período incompleto)", () => {
    const r = calcularFerias(
      { funcionarioId: "f4", baseRemuneracaoMensal: reais(1500), diasFerias: 15, diasVendidos: 0, dependentesIrrf: 0 },
      PARAMETROS,
    );
    expect(r.diasGozados).toBe(15);
    expect(r.totalProventos).toBe(reais(1000)); // 15 × 50 + 1/3
  });
});

describe("calcularFerias — abono pecuniário", () => {
  it("o total pago é o mesmo com ou sem venda de dias — só muda a tributação", () => {
    const semVenda = calcularFerias(
      { funcionarioId: "f1", baseRemuneracaoMensal: reais(3000), diasFerias: 30, diasVendidos: 0, dependentesIrrf: 0 },
      PARAMETROS,
    );
    const comVenda = calcularFerias(
      { funcionarioId: "f2", baseRemuneracaoMensal: reais(3000), diasFerias: 30, diasVendidos: 10, dependentesIrrf: 0 },
      PARAMETROS,
    );
    expect(comVenda.totalProventos).toBe(semVenda.totalProventos);
  });

  it("não desconta INSS, IRRF nem FGTS sobre o abono — só sobre os dias gozados", () => {
    const r = calcularFerias(
      { funcionarioId: "f2", baseRemuneracaoMensal: reais(3000), diasFerias: 30, diasVendidos: 10, dependentesIrrf: 0 },
      PARAMETROS,
    );
    expect(r.diasGozados).toBe(20);
    expect(r.rubricas.find((x) => x.codigo === "945")?.valor).toBe(reais(1000)); // 10 × 100
    expect(r.rubricas.find((x) => x.codigo === "946")?.valor).toBe(reais(333.33));
    expect(r.fgts).toBe(reais(213.33)); // 8% só sobre os 20 dias gozados + terço, não sobre o abono
  });

  it("acusa divergência quando o abono excede 1/3 do período de direito", () => {
    const r = calcularFerias(
      { funcionarioId: "f3", baseRemuneracaoMensal: reais(3000), diasFerias: 30, diasVendidos: 15, dependentesIrrf: 0 },
      PARAMETROS,
    );
    expect(r.avisos.some((a) => a.severidade === "DIVERGENCIA" && /1\/3/.test(a.mensagem))).toBe(true);
  });

  it("aceita exatamente 1/3 do período sem acusar divergência", () => {
    const r = calcularFerias(
      { funcionarioId: "f5", baseRemuneracaoMensal: reais(3000), diasFerias: 30, diasVendidos: 10, dependentesIrrf: 0 },
      PARAMETROS,
    );
    expect(r.avisos.filter((a) => a.severidade === "DIVERGENCIA")).toHaveLength(0);
  });
});

describe("calcularFerias — invariantes", () => {
  it("nunca devolve líquido negativo nem NaN, para qualquer combinação razoável", () => {
    for (const base of [reais(1518), reais(2625), reais(4500), reais(8000)]) {
      for (const dias of [30, 24, 18, 12]) {
        for (const vendidos of [0, Math.floor(dias / 3)]) {
          const r = calcularFerias(
            { funcionarioId: "f", baseRemuneracaoMensal: base, diasFerias: dias, diasVendidos: vendidos, dependentesIrrf: 0 },
            PARAMETROS,
          );
          expect(Number.isFinite(r.liquido)).toBe(true);
          expect(r.liquido).toBeGreaterThanOrEqual(0);
          expect(r.totalProventos).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
