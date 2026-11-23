import { describe, expect, it } from "vitest";
import { reais } from "@/dominio/comum/dinheiro.js";
import {
  calcularSubtotal,
  FATOR_DSR,
  SEMANAS_POR_MES,
  type CargaSegmento,
} from "@/importacao/planilha-professores.js";

function carga(aulas: number, valor: number): CargaSegmento {
  return {
    segmento: "Fundamental",
    aulasSemanais: aulas,
    valorHoraAula: reais(valor),
    valorHoraAulaBruto: valor,
  };
}

describe("regra da planilha de professores", () => {
  it("é 4,5 semanas com acréscimo de 1/6 de DSR", () => {
    expect(SEMANAS_POR_MES).toBe(4.5);
    expect(FATOR_DSR).toBeCloseTo(7 / 6, 10);
    // O fator conjunto é 5,25 — é ele que aparece em toda a planilha.
    expect(SEMANAS_POR_MES * FATOR_DSR).toBeCloseTo(5.25, 10);
  });

  it("reproduz o cálculo de um professor com um só segmento", () => {
    // 30 aulas semanais a R$ 45,00 → R$ 7.087,50
    expect(calcularSubtotal([carga(30, 45)])).toBe(reais(7087.5));
  });

  it("soma segmentos com horas-aula diferentes", () => {
    // 10 aulas a R$ 41,60 + 20 aulas a R$ 41,60 = 30 × 41,60 → R$ 6.552,00
    expect(calcularSubtotal([carga(10, 41.6), carga(20, 41.6)])).toBe(reais(6552));
  });

  it("ignora aulas lançadas sem valor-hora, como a planilha faz", () => {
    // 5 aulas sem valor + 19 a R$ 35,00 → só as 19 são pagas.
    expect(calcularSubtotal([carga(5, 0), carga(19, 35)])).toBe(reais(3491.25));
  });

  it("não fixa o centavo da hora antes de multiplicar", () => {
    // Hora-aula resolvida de trás para frente para fechar R$ 7.000,00 em
    // 40 aulas: 7000 / 5,25 / 40 = 33,3333… Arredondar a hora para R$ 33,33
    // antes de multiplicar custaria setenta centavos no total do mês — é o
    // desvio que aparece nas linhas de Educação Infantil da planilha real.
    const exato = calcularSubtotal([carga(40, 7000 / 5.25 / 40)]);
    expect(exato).toBe(reais(7000));

    const arredondadoAntes = calcularSubtotal([carga(40, 33.33)]);
    expect(exato - arredondadoAntes).toBe(reais(0.7));
  });

  it("devolve zero para carga vazia", () => {
    expect(calcularSubtotal([])).toBe(0);
  });
});
