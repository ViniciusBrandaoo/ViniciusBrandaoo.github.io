import { describe, expect, it } from "vitest";
import {
  arredondar,
  fracaoDe,
  paraReais,
  percentualDe,
  reais,
} from "@/dominio/comum/dinheiro.js";

describe("arredondamento", () => {
  it("arredonda meio-para-cima, não para o par mais próximo", () => {
    expect(arredondar(2.5)).toBe(3);
    expect(arredondar(3.5)).toBe(4);
    expect(arredondar(0.5)).toBe(1);
  });

  it("afasta do zero em valores negativos", () => {
    expect(arredondar(-2.5)).toBe(-3);
    expect(arredondar(-0.6)).toBe(-1);
  });

  it("não devolve -0, que quebraria comparação com toBe(0)", () => {
    expect(Object.is(arredondar(-0.4), -0)).toBe(false);
    expect(arredondar(-0.4)).toBe(0);
  });

  it("corrige a representação binária que engoliria um centavo", () => {
    // 1.005 * 100 = 100.49999999999999 em ponto flutuante.
    expect(reais(1.005)).toBe(101);
    expect(reais(0.005)).toBe(1);
    expect(reais(2.675)).toBe(268);
  });

  it("é idempotente sobre valores já inteiros", () => {
    for (const v of [0, 1, 7, 12345, 999999]) {
      expect(arredondar(arredondar(v))).toBe(arredondar(v));
      expect(reais(paraReais(v))).toBe(v);
    }
  });
});

describe("percentual e fração", () => {
  it("calcula percentual sobre centavos", () => {
    expect(percentualDe(reais(2625), 8)).toBe(reais(210));
    expect(percentualDe(reais(1518), 7.5)).toBe(reais(113.85));
  });

  it("calcula a fração de DSR arredondando a dízima para cima", () => {
    // 250,00 ÷ 6 = 41,6666… → 41,67
    expect(fracaoDe(reais(250), 1, 6)).toBe(reais(41.67));
    // 500,00 ÷ 6 = 83,3333… → 83,33
    expect(fracaoDe(reais(500), 1, 6)).toBe(reais(83.33));
  });

  it("devolve zero quando o denominador é zero, em vez de Infinity", () => {
    expect(fracaoDe(reais(100), 1, 0)).toBe(0);
  });
});
