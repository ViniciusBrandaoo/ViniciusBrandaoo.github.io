/**
 * Todo valor monetário do sistema trafega em CENTAVOS INTEIROS.
 * Float em folha de pagamento gera divergência de centavos que a contabilidade
 * rejeita no fechamento — nunca usar `number` em reais para acumular.
 */
export type Centavos = number;

const EPSILON_CENTAVO = 1e-9;

/**
 * Arredondamento meio-para-cima, padrão usado em folha e recolhimentos.
 * O `|| 0` normaliza o -0 que sai de valores negativos que arredondam para zero:
 * `expect(x).toBe(0)` usa Object.is e falharia contra -0.
 */
export function arredondar(valor: number): number {
  const sinal = valor < 0 ? -1 : 1;
  return sinal * Math.floor(Math.abs(valor) + 0.5 + EPSILON_CENTAVO) || 0;
}

export function reais(valor: number): Centavos {
  return arredondar(valor * 100);
}

export function paraReais(centavos: Centavos): number {
  return centavos / 100;
}

export function formatarBRL(centavos: Centavos): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(paraReais(centavos));
}

/** Percentual sobre base em centavos. `percentual` é 7.5 para 7,5%. */
export function percentualDe(base: Centavos, percentual: number): Centavos {
  return arredondar((base * percentual) / 100);
}

/** Fração sobre base em centavos, ex.: DSR = fracaoDe(base, 1, 6). */
export function fracaoDe(
  base: Centavos,
  numerador: number,
  denominador: number,
): Centavos {
  if (denominador === 0) return 0;
  return arredondar((base * numerador) / denominador);
}

export function multiplicar(base: Centavos, fator: number): Centavos {
  return arredondar(base * fator);
}

export function somar(...valores: Centavos[]): Centavos {
  return valores.reduce((acc, v) => acc + v, 0);
}

export function limitar(
  valor: Centavos,
  minimo: Centavos,
  maximo: Centavos,
): Centavos {
  return Math.min(Math.max(valor, minimo), maximo);
}
