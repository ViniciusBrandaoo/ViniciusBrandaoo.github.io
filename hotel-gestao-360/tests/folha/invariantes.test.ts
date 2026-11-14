import { describe, expect, it } from "vitest";
import { reais } from "@/dominio/comum/dinheiro.js";
import { calcularFolha } from "@/dominio/folha/motor.js";
import type { ResultadoFolha } from "@/dominio/folha/tipos.js";
import {
  movimento,
  parametros,
  professor,
  temDivergencia,
} from "../fixtures/folha.js";

/**
 * Invariantes valem mais que exemplos: pegam a regressão que um caso pontual
 * não cobre, e principalmente pegam tabela cadastrada errada pelo RH.
 */

const cenarios: Array<{ nome: string; resultado: () => ResultadoFolha }> = [];

for (const valorHoraAula of [15, 25, 45, 65, 120]) {
  for (const aulasSemanais of [4, 12, 20, 25]) {
    for (const extras of [0, 8]) {
      for (const faltas of [0, 3]) {
        cenarios.push({
          nome: `R$ ${valorHoraAula}/aula, ${aulasSemanais} aulas/sem, ${extras} extras, ${faltas} faltas`,
          resultado: () =>
            calcularFolha(
              professor({
                valorHoraAula: reais(valorHoraAula),
                aulasSemanais,
                dependentesIrrf: extras > 0 ? 2 : 0,
              }),
              movimento({
                aulasExtras: extras,
                aulasNaoDadas: faltas,
                aulasNoturnas: extras,
                valeTransporteCusto: reais(200),
              }),
              parametros(),
            ),
        });
      }
    }
  }
}

describe(`invariantes em ${cenarios.length} combinações de contrato e movimento`, () => {
  it("líquido é sempre proventos menos descontos", () => {
    for (const c of cenarios) {
      const r = c.resultado();
      const proventos = r.rubricas
        .filter((x) => x.tipo === "PROVENTO")
        .reduce((a, x) => a + x.valor, 0);
      const descontos = r.rubricas
        .filter((x) => x.tipo === "DESCONTO")
        .reduce((a, x) => a + x.valor, 0);
      expect(r.liquido, c.nome).toBe(proventos - descontos);
    }
  });

  it("encargo do empregador nunca entra no líquido", () => {
    for (const c of cenarios) {
      const r = c.resultado();
      const encargos = r.rubricas.filter(
        (x) => x.tipo === "ENCARGO_EMPREGADOR",
      );
      expect(encargos.length, c.nome).toBeGreaterThan(0);
      expect(
        r.totalProventos + r.totalDescontos,
        c.nome,
      ).toBe(
        r.rubricas
          .filter((x) => x.tipo !== "ENCARGO_EMPREGADOR")
          .reduce((a, x) => a + x.valor, 0),
      );
    }
  });

  it("custo do empregador é sempre maior que o bruto pago", () => {
    for (const c of cenarios) {
      const r = c.resultado();
      expect(r.custoTotalEmpregador, c.nome).toBeGreaterThan(r.remuneracaoBruta);
    }
  });

  it("nenhuma rubrica sai com valor negativo nem com -0", () => {
    for (const c of cenarios) {
      const r = c.resultado();
      for (const rubrica of r.rubricas) {
        expect(rubrica.valor, `${c.nome} — ${rubrica.codigo}`).toBeGreaterThanOrEqual(0);
        expect(Object.is(rubrica.valor, -0)).toBe(false);
      }
    }
  });

  it("bases negativas nunca passam caladas", () => {
    for (const c of cenarios) {
      const r = c.resultado();
      if (r.baseInss < 0 || r.baseIrrf < 0 || r.baseFgts < 0) {
        expect(temDivergencia(r), c.nome).toBe(true);
      }
    }
  });

  it("INSS respeita o teto e nunca supera a própria base", () => {
    for (const c of cenarios) {
      const r = c.resultado();
      const inss = r.rubricas.find((x) => x.codigo === "601")?.valor ?? 0;
      expect(inss, c.nome).toBeLessThanOrEqual(reais(951.63));
      expect(inss, c.nome).toBeLessThanOrEqual(Math.max(0, r.baseInss));
    }
  });

  it("a memória do INSS soma exatamente o valor da rubrica", () => {
    for (const c of cenarios) {
      const r = c.resultado();
      const rubrica = r.rubricas.find((x) => x.codigo === "601")?.valor ?? 0;
      const somaFaixas = r.memoria
        .filter((p) => p.titulo.startsWith("INSS — faixa"))
        .reduce((a, p) => a + p.resultado, 0);
      // A memória é o que a contabilidade audita: se divergir da rubrica, o
      // holerite fica indefensável.
      expect(somaFaixas, c.nome).toBe(rubrica);
    }
  });

  it("o desconto de vale-transporte nunca passa do teto legal", () => {
    for (const c of cenarios) {
      const r = c.resultado();
      const vt = r.rubricas.find((x) => x.codigo === "603");
      if (!vt) continue;
      expect(vt.valor, c.nome).toBeLessThanOrEqual(reais(200));
    }
  });
});
