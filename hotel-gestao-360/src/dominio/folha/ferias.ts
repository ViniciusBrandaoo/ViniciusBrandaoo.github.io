import {
  arredondar,
  fracaoDe,
  formatarBRL,
  percentualDe,
  type Centavos,
} from "../comum/dinheiro.js";
import { calcularInss, calcularIrrf } from "./impostos.js";
import type { TabelaINSS, TabelaIRRF } from "./parametros.js";
import type { Aviso, PassoMemoria, Rubrica } from "./tipos.js";

/**
 * Dias de férias devidos conforme as faltas injustificadas no período
 * aquisitivo — art. 130 da CLT. Acima de 32 faltas o direito se perde
 * inteiro (não é "0 dias de férias remuneradas", é ausência do próprio
 * direito — quem chama decide o que fazer com esse caso, aqui só devolve 0).
 */
export function diasFeriasPorFaltas(faltasInjustificadas: number): number {
  if (faltasInjustificadas <= 5) return 30;
  if (faltasInjustificadas <= 14) return 24;
  if (faltasInjustificadas <= 23) return 18;
  if (faltasInjustificadas <= 32) return 12;
  return 0;
}

export interface ParametrosFerias {
  inss: TabelaINSS;
  irrf: TabelaIRRF;
  fgtsPercentual: number;
  tercoConstitucional: number; // 33.3333, vem da CCT — CF art. 7º XVII fixa o mínimo em 1/3
}

export interface EntradaFerias {
  funcionarioId: string;
  /**
   * Base mensal para o cálculo: salário do mês anterior ao início das férias
   * (mensalista) ou média das remunerações variáveis do período aquisitivo
   * (horista, Súmula 172 TST) — como no 13º, quem chama decide e informa,
   * este módulo não lê histórico de folha sozinho.
   */
  baseRemuneracaoMensal: Centavos;
  /**
   * Dias de férias a que o empregado tem direito, já líquidos de falta
   * (`diasFeriasPorFaltas`) e já proporcionalizados se for o caso (período
   * aquisitivo incompleto: `arredondar(30 × mesesTrabalhados / 12)`, usando
   * `mesesTrabalhadosNoAno` de `decimo-terceiro.ts`). Este módulo só faz a
   * conta de quanto pagar por esses dias, não decide quantos dias são.
   */
  diasFerias: number;
  /** Abono pecuniário: dias vendidos em vez de gozados, até 1/3 do período (art. 143 CLT). */
  diasVendidos: number;
  dependentesIrrf: number;
}

export interface ResultadoFerias {
  funcionarioId: string;
  diasGozados: number;
  diasVendidos: number;
  rubricas: Rubrica[];
  totalProventos: Centavos;
  totalDescontos: Centavos;
  liquido: Centavos;
  fgts: Centavos;
  memoria: PassoMemoria[];
  avisos: Aviso[];
}

function rubrica(
  codigo: string,
  descricao: string,
  referencia: string,
  tipo: Rubrica["tipo"],
  valor: Centavos,
  incide: { inss?: boolean; irrf?: boolean; fgts?: boolean } = {},
): Rubrica {
  return {
    codigo,
    descricao,
    referencia,
    tipo,
    naturezaBase: "NEUTRA",
    valor,
    incideInss: incide.inss ?? false,
    incideIrrf: incide.irrf ?? false,
    incideFgts: incide.fgts ?? false,
  };
}

/**
 * Férias. O valor-dia é sempre a remuneração mensal ÷ 30 (a CLT trata o mês
 * como 30 dias corridos para este fim, art. 142 §1º), independente do
 * regime de jornada.
 *
 *  - Dias gozados: pagos com 1/3 constitucional, INSS e IRRF incidindo
 *    sobre a base combinada (férias + terço) — calculado numa tacada só,
 *    não faixa a faixa separadamente, senão o valor sai maior que o devido
 *    (a Receita e o INSS tratam férias + terço como uma única base).
 *  - Dias vendidos (abono pecuniário, art. 143 CLT): natureza indenizatória
 *    — SEM INSS, SEM IRRF, SEM FGTS. Também leva 1/3.
 */
export function calcularFerias(
  entrada: EntradaFerias,
  parametros: ParametrosFerias,
): ResultadoFerias {
  const rubricas: Rubrica[] = [];
  const memoria: PassoMemoria[] = [];
  const avisos: Aviso[] = [];

  const totalDias = entrada.diasFerias;
  const diasGozados = totalDias - entrada.diasVendidos;

  const tercoDoDireito = totalDias / 3;
  if (entrada.diasVendidos > tercoDoDireito) {
    avisos.push({
      severidade: "DIVERGENCIA",
      mensagem: `Abono pecuniário de ${entrada.diasVendidos} dia(s) excede 1/3 dos ${totalDias} dia(s) de direito (máximo ${Math.floor(tercoDoDireito)}).`,
    });
  }
  if (diasGozados < 0) {
    avisos.push({
      severidade: "DIVERGENCIA",
      mensagem: "Dias vendidos superam os dias de férias — confira o abono pecuniário antes de usar este resultado.",
    });
  }

  const valorDiario = fracaoDe(entrada.baseRemuneracaoMensal, 1, 30);
  memoria.push({
    titulo: "Férias — valor do dia",
    formula: "remuneração mensal ÷ 30",
    substituicao: `${formatarBRL(entrada.baseRemuneracaoMensal)} ÷ 30`,
    resultado: valorDiario,
    fundamento: "CLT art. 142 §1º",
  });

  // ---------------------------------------------------------- dias gozados

  const valorGozado = Math.max(0, diasGozados) * valorDiario;
  const tercoGozado = percentualDe(valorGozado, parametros.tercoConstitucional);
  const brutoGozado = valorGozado + tercoGozado;

  rubricas.push(
    rubrica(
      "941",
      "Férias",
      `${Math.max(0, diasGozados)} dia(s) × ${formatarBRL(valorDiario)}`,
      "PROVENTO",
      valorGozado,
      { inss: true, irrf: true, fgts: true },
    ),
  );
  rubricas.push(
    rubrica(
      "942",
      "Terço constitucional de férias",
      `${parametros.tercoConstitucional}% sobre ${formatarBRL(valorGozado)}`,
      "PROVENTO",
      tercoGozado,
      { inss: true, irrf: true, fgts: true },
    ),
  );
  memoria.push({
    titulo: "Férias — terço constitucional",
    formula: "valor das férias gozadas × 1/3",
    substituicao: `${formatarBRL(valorGozado)} × ${parametros.tercoConstitucional}%`,
    resultado: tercoGozado,
    fundamento: "Constituição Federal art. 7º XVII",
  });

  const resultadoInss = calcularInss(
    { base: brutoGozado, remuneracaoOutrosVinculos: 0, inssDescontadoOutrosVinculos: 0 },
    parametros.inss,
  );
  memoria.push(
    ...resultadoInss.memoria.map((p) => ({ ...p, titulo: p.titulo.replace("INSS", "INSS sobre férias") })),
  );

  const resultadoIrrf = calcularIrrf(
    {
      baseTributavel: brutoGozado,
      inssDescontado: resultadoInss.valor,
      dependentes: entrada.dependentesIrrf,
      pensaoAlimenticia: 0,
    },
    parametros.irrf,
  );
  memoria.push(
    ...resultadoIrrf.memoria.map((p) => ({ ...p, titulo: p.titulo.replace("IRRF", "IRRF sobre férias") })),
  );

  rubricas.push(
    rubrica("943", "INSS sobre férias", `base ${formatarBRL(brutoGozado)}`, "DESCONTO", resultadoInss.valor),
  );
  rubricas.push(
    rubrica("944", "IRRF sobre férias", `base ${formatarBRL(brutoGozado)}`, "DESCONTO", resultadoIrrf.valor),
  );

  const fgtsGozado = percentualDe(brutoGozado, parametros.fgtsPercentual);
  rubricas.push(
    rubrica(
      "947",
      "FGTS sobre férias",
      `${parametros.fgtsPercentual}% sobre ${formatarBRL(brutoGozado)}`,
      "ENCARGO_EMPREGADOR",
      fgtsGozado,
    ),
  );

  // ---------------------------------------------------------- abono pecuniário

  let valorAbono = 0;
  let tercoAbono = 0;
  if (entrada.diasVendidos > 0) {
    valorAbono = entrada.diasVendidos * valorDiario;
    tercoAbono = percentualDe(valorAbono, parametros.tercoConstitucional);
    rubricas.push(
      rubrica(
        "945",
        "Abono pecuniário (venda de férias)",
        `${entrada.diasVendidos} dia(s) × ${formatarBRL(valorDiario)}`,
        "PROVENTO",
        valorAbono,
      ),
    );
    rubricas.push(
      rubrica(
        "946",
        "Terço constitucional sobre o abono",
        `${parametros.tercoConstitucional}% sobre ${formatarBRL(valorAbono)}`,
        "PROVENTO",
        tercoAbono,
      ),
    );
    memoria.push({
      titulo: "Abono pecuniário — natureza indenizatória",
      formula: "sem INSS, sem IRRF, sem FGTS",
      substituicao: `${formatarBRL(valorAbono)} + ${formatarBRL(tercoAbono)} de terço`,
      resultado: valorAbono + tercoAbono,
      fundamento: "CLT art. 143 c/ Lei 8.212/91 art. 28 §9º 'd' (isenção previdenciária)",
    });
  }

  const totalProventos = valorGozado + tercoGozado + valorAbono + tercoAbono;
  const totalDescontos = resultadoInss.valor + resultadoIrrf.valor;
  const liquido = totalProventos - totalDescontos;

  if (liquido < 0) {
    avisos.push({
      severidade: "DIVERGENCIA",
      mensagem: "Líquido de férias negativo — confira a base de remuneração e os dias informados antes de usar este resultado.",
    });
  }

  return {
    funcionarioId: entrada.funcionarioId,
    diasGozados: Math.max(0, diasGozados),
    diasVendidos: entrada.diasVendidos,
    rubricas,
    totalProventos,
    totalDescontos,
    liquido,
    fgts: fgtsGozado,
    memoria,
    avisos,
  };
}
