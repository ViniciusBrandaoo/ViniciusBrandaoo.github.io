import type { Centavos } from "../comum/dinheiro.js";
import type { PassoMemoria, Rubrica } from "./tipos.js";

/** Parte comum dos resultados de 13º, férias e rescisão que esta regra toca. */
export interface ResultadoComImpostos {
  rubricas: Rubrica[];
  totalDescontos: Centavos;
  liquido: Centavos;
  fgts: Centavos;
  multaFgts?: Centavos;
  memoria: PassoMemoria[];
}

/**
 * INSS, IRRF e encargos (FGTS, multa do FGTS, INSS patronal) são apurados pela
 * contabilidade: com a chave `impostosPelaContabilidade` ligada, 13º, férias e
 * rescisão saem brutas, igual à folha mensal. Os proventos não mudam; só saem
 * os descontos de INSS/IRRF, os encargos da escola e os passos da memória
 * deles, e o líquido passa a ser proventos menos o que sobrou de desconto.
 */
export function semImpostosDaContabilidade<T extends ResultadoComImpostos>(r: T): T {
  const ehImposto = (x: Rubrica) => /INSS|IRRF/i.test(x.descricao);
  const retirados = r.rubricas.filter(
    (x) => x.tipo === "ENCARGO_EMPREGADOR" || (x.tipo === "DESCONTO" && ehImposto(x)),
  );
  const descontoRetirado = retirados
    .filter((x) => x.tipo === "DESCONTO")
    .reduce((t, x) => t + x.valor, 0);
  return {
    ...r,
    rubricas: r.rubricas.filter((x) => !retirados.includes(x)),
    totalDescontos: r.totalDescontos - descontoRetirado,
    liquido: r.liquido + descontoRetirado,
    fgts: 0,
    ...(r.multaFgts !== undefined ? { multaFgts: 0 } : {}),
    memoria: r.memoria.filter((m) => !/INSS|IRRF|FGTS/i.test(m.titulo)),
  };
}
