import { describe, expect, it } from "vitest";
import { reais } from "@/dominio/comum/dinheiro.js";
import {
  calcular13Salario,
  mesesTrabalhadosNoAno,
} from "@/dominio/folha/decimo-terceiro.js";
import {
  TABELA_INSS_2025,
  TABELA_IRRF_2025,
} from "@/dominio/folha/tabelas-seed.js";

const PARAMETROS = {
  inss: TABELA_INSS_2025,
  irrf: TABELA_IRRF_2025,
  fgtsPercentual: 8,
};

describe("mesesTrabalhadosNoAno", () => {
  it("conta os 12 meses para quem trabalhou o ano inteiro", () => {
    expect(mesesTrabalhadosNoAno("2020-01-01", null, "2026")).toBe(12);
  });

  it("conta o mês de admissão quando tem 15 dias ou mais", () => {
    // Admitido 10/07: 22 dias em julho (10 a 31) — conta julho + ago a dez.
    expect(mesesTrabalhadosNoAno("2026-07-10", null, "2026")).toBe(6);
  });

  it("não conta o mês de admissão com menos de 15 dias", () => {
    // Admitido 20/07: 12 dias em julho — não conta, só ago a dez.
    expect(mesesTrabalhadosNoAno("2026-07-20", null, "2026")).toBe(5);
  });

  it("não conta o mês de desligamento com menos de 15 dias", () => {
    // Desligado 10/06: só 10 dias em junho — jan a mai contam, junho não.
    expect(mesesTrabalhadosNoAno("2020-01-01", "2026-06-10", "2026")).toBe(5);
  });

  it("conta o mês de desligamento com 15 dias ou mais", () => {
    // Desligado 16/06: 16 dias em junho — jan a jun contam.
    expect(mesesTrabalhadosNoAno("2020-01-01", "2026-06-16", "2026")).toBe(6);
  });

  it("devolve zero para quem não teve nenhum mês com 15 dias no ano", () => {
    expect(mesesTrabalhadosNoAno("2026-12-20", null, "2026")).toBe(0);
  });
});

describe("calcular13Salario — 1ª parcela", () => {
  it("paga metade do proporcional, sem nenhum desconto", () => {
    const r = calcular13Salario(
      {
        funcionarioId: "f1",
        ano: "2026",
        baseRemuneracaoMensal: reais(3000),
        mesesTrabalhados: 12,
        dependentesIrrf: 0,
        parcela: 1,
      },
      PARAMETROS,
    );
    expect(r.baseProporcional).toBe(reais(3000));
    expect(r.totalProventos).toBe(reais(1500));
    expect(r.totalDescontos).toBe(0);
    expect(r.liquido).toBe(reais(1500));
  });

  it("recolhe FGTS sobre a 1ª parcela mesmo sem INSS/IRRF", () => {
    const r = calcular13Salario(
      {
        funcionarioId: "f1",
        ano: "2026",
        baseRemuneracaoMensal: reais(3000),
        mesesTrabalhados: 12,
        dependentesIrrf: 0,
        parcela: 1,
      },
      PARAMETROS,
    );
    expect(r.fgts).toBe(reais(120)); // 8% de 1.500
  });

  it("proporcionaliza pelos meses trabalhados, não assume ano cheio", () => {
    const r = calcular13Salario(
      {
        funcionarioId: "f2",
        ano: "2026",
        baseRemuneracaoMensal: reais(1500),
        mesesTrabalhados: 6,
        dependentesIrrf: 0,
        parcela: 1,
      },
      PARAMETROS,
    );
    expect(r.baseProporcional).toBe(reais(750)); // 1.500 × 6/12
    expect(r.totalProventos).toBe(reais(375));
  });

  it("acusa divergência quando não há nenhum mês trabalhado", () => {
    const r = calcular13Salario(
      {
        funcionarioId: "f3",
        ano: "2026",
        baseRemuneracaoMensal: reais(2000),
        mesesTrabalhados: 0,
        dependentesIrrf: 0,
        parcela: 1,
      },
      PARAMETROS,
    );
    expect(r.totalProventos).toBe(0);
    expect(r.avisos.some((a) => a.severidade === "DIVERGENCIA")).toBe(true);
  });
});

describe("calcular13Salario — 2ª parcela", () => {
  it("desconta INSS e IRRF sobre o valor CHEIO do 13º, não só a 2ª parcela", () => {
    const r = calcular13Salario(
      {
        funcionarioId: "f1",
        ano: "2026",
        baseRemuneracaoMensal: reais(3000),
        mesesTrabalhados: 12,
        dependentesIrrf: 0,
        parcela: 2,
      },
      PARAMETROS,
    );
    expect(r.totalProventos).toBe(reais(3000)); // valor integral, não metade
    expect(r.rubricas.find((x) => x.codigo === "923")?.valor).toBe(reais(1500)); // 1ª parcela deduzida
    expect(r.rubricas.find((x) => x.codigo === "924")?.valor).toBe(reais(253.41)); // INSS
    expect(r.totalDescontos).toBe(reais(1753.41)); // 1.500 + 253,41 + 0 de IRRF
    expect(r.liquido).toBe(reais(1246.59));
  });

  it("bate com a base proporcional também para quem não trabalhou o ano inteiro", () => {
    const r = calcular13Salario(
      {
        funcionarioId: "f2",
        ano: "2026",
        baseRemuneracaoMensal: reais(1500),
        mesesTrabalhados: 6,
        dependentesIrrf: 0,
        parcela: 2,
      },
      PARAMETROS,
    );
    expect(r.totalProventos).toBe(reais(750));
  });

  it("usa o valor REAL pago na 1ª parcela (valorJaAntecipado), não recalcula pela base atual", () => {
    // Horista: a base da 2ª parcela (média de folha_calculos, mais recente)
    // é maior que a da época em que a 1ª parcela foi paga. Sem
    // `valorJaAntecipado`, o motor deduziria metade da base ATUAL (errado);
    // com ele, deduz o que realmente saiu na 1ª parcela.
    const r = calcular13Salario(
      {
        funcionarioId: "f5",
        ano: "2026",
        baseRemuneracaoMensal: reais(4000), // base subiu desde a 1ª parcela
        mesesTrabalhados: 12,
        dependentesIrrf: 0,
        parcela: 2,
        valorJaAntecipado: reais(1500), // valor real pago na 1ª parcela (base era 3.000)
      },
      PARAMETROS,
    );
    expect(r.rubricas.find((x) => x.codigo === "923")?.valor).toBe(reais(1500));
    expect(r.totalDescontos).toBe(reais(1500) + r.rubricas.find((x) => x.codigo === "924")!.valor + r.rubricas.find((x) => x.codigo === "925")!.valor);
    // FGTS da 2ª parcela incide sobre (base atual − o que já foi pago), não sobre metade da base atual.
    expect(r.fgts).toBe(Math.round((reais(4000) - reais(1500)) * 0.08));
  });

  it("líquido pode sair negativo de verdade (sem clamp) quando a entrada é inconsistente, e acusa divergência", () => {
    // 1ª parcela informada maior que o próprio proporcional da 2ª: cenário
    // de dado errado rio acima. O motor não deve mascarar isso com um
    // líquido zerado — precisa refletir a inconsistência real para o
    // `liquido_centavos = proventos - descontos` do banco continuar coerente,
    // e para o aviso de divergência aparecer para quem for revisar.
    const r = calcular13Salario(
      {
        funcionarioId: "f4",
        ano: "2026",
        baseRemuneracaoMensal: reais(100),
        mesesTrabalhados: 12,
        dependentesIrrf: 0,
        parcela: 2,
        valorJaAntecipado: reais(500), // "pago" mais que o proporcional inteiro (100)
      },
      PARAMETROS,
    );
    expect(r.liquido).toBeLessThan(0);
    expect(r.liquido).toBe(r.totalProventos - r.totalDescontos);
    expect(r.avisos.some((a) => a.severidade === "DIVERGENCIA")).toBe(true);
  });

  it("recolhe FGTS sobre a diferença entre o valor integral e a 1ª parcela", () => {
    const r = calcular13Salario(
      {
        funcionarioId: "f1",
        ano: "2026",
        baseRemuneracaoMensal: reais(3000),
        mesesTrabalhados: 12,
        dependentesIrrf: 0,
        parcela: 2,
      },
      PARAMETROS,
    );
    expect(r.fgts).toBe(reais(120)); // 8% de (3.000 − 1.500)
  });
});

describe("calcular13Salario — invariantes entre as duas parcelas", () => {
  it("a soma líquida das duas parcelas bate com o proporcional menos os impostos", () => {
    for (const [base, meses] of [
      [reais(2625), 12],
      [reais(4500), 9],
      [reais(1518), 3],
      [reais(8000), 12],
    ] as const) {
      const p1 = calcular13Salario(
        { funcionarioId: "f", ano: "2026", baseRemuneracaoMensal: base, mesesTrabalhados: meses, dependentesIrrf: 0, parcela: 1 },
        PARAMETROS,
      );
      const p2 = calcular13Salario(
        { funcionarioId: "f", ano: "2026", baseRemuneracaoMensal: base, mesesTrabalhados: meses, dependentesIrrf: 0, parcela: 2 },
        PARAMETROS,
      );
      const proporcional = p1.baseProporcional;
      const inssMaisIrrf = p2.rubricas
        .filter((r) => r.codigo === "924" || r.codigo === "925")
        .reduce((a, r) => a + r.valor, 0);
      expect(p1.liquido + p2.liquido).toBe(proporcional - inssMaisIrrf);
      expect(p1.liquido).toBeGreaterThanOrEqual(0);
      expect(p2.liquido).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(p1.liquido)).toBe(true);
      expect(Number.isFinite(p2.liquido)).toBe(true);
    }
  });
});
