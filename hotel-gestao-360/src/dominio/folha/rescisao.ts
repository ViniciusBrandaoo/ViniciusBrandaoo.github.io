import {
  arredondar,
  fracaoDe,
  formatarBRL,
  percentualDe,
  type Centavos,
} from "../comum/dinheiro.js";
import { janelaTrabalhada } from "../comum/competencia.js";
import { calcularInss, calcularIrrf } from "./impostos.js";
import type { TabelaINSS, TabelaIRRF } from "./parametros.js";
import type { Aviso, PassoMemoria, Rubrica } from "./tipos.js";

/**
 * Cada verba da rescisão tem uma incidência tributária DIFERENTE — o erro
 * mais comum de planilha de rescisão é tratar tudo como "salário" e
 * descontar INSS/IRRF de verba indenizatória, ou o oposto. A tabela abaixo é
 * a referência que este módulo segue à risca:
 *
 *  Verba                          | INSS | IRRF | FGTS
 *  --------------------------------|------|------|------
 *  Saldo de salário                | sim  | sim  | sim
 *  Aviso prévio indenizado         | não  | sim  | sim   (Súmula 371 TST projeta o contrato, mas o valor pago é indenização — IN RFB 1.500/2014 art. 5º IV)
 *  13º salário proporcional        | sim  | sim  | sim   (mesma regra do 13º normal, parcela única)
 *  Férias vencidas + 1/3           | não  | não  | sim   (Lei 7.713/88 art. 6º V; Lei 8.212/91 art. 28 §9º 'd')
 *  Férias proporcionais + 1/3      | não  | não  | sim   (mesma isenção das vencidas)
 *  Multa de 40% (ou 20%) do FGTS   | não  | não  | —     (incide sobre o saldo já depositado, não gera FGTS novo)
 */

export type TipoRescisao =
  | "SEM_JUSTA_CAUSA"
  | "PEDIDO_DEMISSAO"
  | "JUSTA_CAUSA"
  | "ACORDO";

/**
 * Dias de aviso prévio: 30 dias-base + 3 dias por ano completo de serviço,
 * até o teto de 90 dias — Lei 12.506/2011.
 */
export function diasAvisoPrevio(
  dataAdmissao: string,
  dataDesligamento: string,
): number {
  const anos = anosCompletos(dataAdmissao, dataDesligamento);
  return Math.min(30 + 3 * anos, 90);
}

function anosCompletos(dataInicio: string, dataFim: string): number {
  const [ai, am, ad] = dataInicio.split("-").map(Number) as [number, number, number];
  const [fi, fm, fd] = dataFim.split("-").map(Number) as [number, number, number];
  let anos = fi - ai;
  if (fm < am || (fm === am && fd < ad)) anos -= 1;
  return Math.max(0, anos);
}

/**
 * Projeta uma data adiante em N dias corridos — usada para a data de saída
 * "para todos os efeitos" quando o aviso prévio é indenizado (Súmula 371
 * TST: o tempo do aviso conta para 13º, férias e todo o resto, mesmo sem
 * trabalho efetivo).
 */
export function projetarData(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(a, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

export interface ParametrosRescisao {
  inss: TabelaINSS;
  irrf: TabelaIRRF;
  fgtsPercentual: number;
  tercoConstitucional: number;
}

export interface EntradaRescisao {
  funcionarioId: string;
  tipo: TipoRescisao;
  dataAdmissao: string;
  dataDesligamento: string;
  /** Mesma convenção do 13º/férias: salário-base ou média, decidido por quem chama. */
  baseRemuneracaoMensal: Centavos;
  dependentesIrrf: number;
  /**
   * true = cumprido em serviço (já pago como salário normal do mês, não
   * entra de novo aqui); false = indenizado (pago nesta rescisão). Sem
   * efeito em PEDIDO_DEMISSAO/JUSTA_CAUSA, que não geram aviso prévio
   * indenizado por parte do empregador.
   */
  avisoPrevioIndenizado: boolean;
  /** Dias de férias vencidas não gozadas (0 se não há; 30, ou reduzido por falta via `diasFeriasPorFaltas`). */
  diasFeriasVencidas: number;
  /**
   * Meses do período aquisitivo de férias ATUAL já trabalhados (0-12) — o
   * início desse período aquisitivo depende do histórico do contrato
   * (admissão ou fim do período aquisitivo anterior), que este módulo não
   * tem como reconstruir sozinho; quem chama informa já calculado.
   */
  mesesFeriasProporcionais: number;
  /**
   * Meses trabalhados no ano corrente para o 13º proporcional — usar
   * `mesesTrabalhadosNoAno` de `decimo-terceiro.ts`, com a data projetada
   * quando o aviso prévio for indenizado (Súmula 371 TST).
   */
  mesesDecimoTerceiro: number;
  /** Saldo total já depositado de FGTS no contrato — este módulo não tem histórico de depósitos, quem chama informa. */
  saldoFgtsDepositado: Centavos;
}

export interface ResultadoRescisao {
  funcionarioId: string;
  tipo: TipoRescisao;
  rubricas: Rubrica[];
  totalProventos: Centavos;
  totalDescontos: Centavos;
  liquido: Centavos;
  fgts: Centavos;
  multaFgts: Centavos;
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

/** O que cada tipo de rescisão dá direito, além de saldo de salário e férias vencidas (essas duas ninguém perde, nem por justa causa). */
function direitos(tipo: TipoRescisao) {
  return {
    avisoPrevioIndenizado: tipo === "SEM_JUSTA_CAUSA" || tipo === "ACORDO",
    decimoTerceiroProporcional: tipo !== "JUSTA_CAUSA",
    feriasProporcionais: tipo !== "JUSTA_CAUSA",
    percentualMultaFgts:
      tipo === "SEM_JUSTA_CAUSA" ? 40 : tipo === "ACORDO" ? 20 : 0,
    // No acordo (art. 484-A CLT) o aviso prévio indenizado é pago pela metade.
    fatorAvisoPrevio: tipo === "ACORDO" ? 0.5 : 1,
  };
}

/**
 * Dias de saldo de salário: dias trabalhados no mês do desligamento (mês
 * comercial de 30 dias; o dia 31 conta como 30). Quem foi admitido no mesmo
 * mês conta a partir do dia da admissão.
 */
export function diasSaldoDeSalario(dataAdmissao: string, dataDesligamento: string): number {
  const [da, dm, dd] = dataDesligamento.split("-").map(Number) as [number, number, number];
  const [aa, am, ad] = dataAdmissao.split("-").map(Number) as [number, number, number];
  const inicio = aa === da && am === dm ? ad : 1;
  return Math.max(0, Math.min(dd, 30) - inicio + 1);
}

/**
 * Rescisão contratual. Inclui o saldo de salário (dias trabalhados no mês do
 * desligamento): quem se desliga sai da folha mensal do mês, então é aqui que
 * esses dias são pagos — e só aqui, para não pagar duas vezes. Cobre também as
 * verbas exclusivas: aviso prévio, 13º e férias proporcionais, férias vencidas
 * e a multa do FGTS.
 */
export function calcularRescisao(
  entrada: EntradaRescisao,
  parametros: ParametrosRescisao,
): ResultadoRescisao {
  const rubricas: Rubrica[] = [];
  const memoria: PassoMemoria[] = [];
  const avisos: Aviso[] = [];
  const d = direitos(entrada.tipo);
  const valorDiario = fracaoDe(entrada.baseRemuneracaoMensal, 1, 30);

  // ---------------------------------------------------------- saldo de salário

  let fgtsSobreSaldo = 0;
  let saldoValor = 0;
  const diasSaldo = diasSaldoDeSalario(entrada.dataAdmissao, entrada.dataDesligamento);
  if (diasSaldo > 0) {
    saldoValor = arredondar(diasSaldo * valorDiario);
    rubricas.push(
      rubrica(
        "960",
        "Saldo de salário",
        `${diasSaldo} dia(s) × ${formatarBRL(valorDiario)}`,
        "PROVENTO",
        saldoValor,
        { inss: true, irrf: true, fgts: true },
      ),
    );
    memoria.push({
      titulo: "Saldo de salário",
      formula: "dias trabalhados no mês do desligamento × valor-dia",
      substituicao: `${diasSaldo} × ${formatarBRL(valorDiario)}`,
      resultado: saldoValor,
      fundamento: "CLT art. 477 — dias trabalhados e ainda não pagos; mês comercial de 30 dias",
    });
    fgtsSobreSaldo = percentualDe(saldoValor, parametros.fgtsPercentual);
  }

  // ---------------------------------------------------------- aviso prévio

  let fgtsSobreAvisoPrevio = 0;
  if (d.avisoPrevioIndenizado && entrada.avisoPrevioIndenizado) {
    const dias = diasAvisoPrevio(entrada.dataAdmissao, entrada.dataDesligamento);
    const valorCheio = dias * valorDiario;
    const valor = arredondar(valorCheio * d.fatorAvisoPrevio);
    rubricas.push(
      rubrica(
        "961",
        "Aviso prévio indenizado",
        `${dias} dia(s) × ${formatarBRL(valorDiario)}${d.fatorAvisoPrevio < 1 ? " × 50% (acordo)" : ""}`,
        "PROVENTO",
        valor,
        { irrf: true, fgts: true },
      ),
    );
    memoria.push({
      titulo: "Aviso prévio indenizado",
      formula: "dias de aviso × valor-dia" + (d.fatorAvisoPrevio < 1 ? " × 50%" : ""),
      substituicao: `${dias} × ${formatarBRL(valorDiario)}`,
      resultado: valor,
      fundamento: "Lei 12.506/2011 — isento de INSS (IN RFB 1.500/2014 art. 5º IV), sujeito a IRRF",
    });
    fgtsSobreAvisoPrevio = percentualDe(valor, parametros.fgtsPercentual);
  }

  // ---------------------------------------------------------- 13º proporcional

  let baseInssIrrf13 = 0;
  let fgtsSobre13 = 0;
  if (d.decimoTerceiroProporcional && entrada.mesesDecimoTerceiro > 0) {
    const base13 = fracaoDe(entrada.baseRemuneracaoMensal, entrada.mesesDecimoTerceiro, 12);
    rubricas.push(
      rubrica(
        "962",
        "13º salário proporcional (rescisão)",
        `${entrada.mesesDecimoTerceiro}/12`,
        "PROVENTO",
        base13,
        { inss: true, irrf: true, fgts: true },
      ),
    );
    memoria.push({
      titulo: "13º salário proporcional na rescisão",
      formula: "base mensal × meses trabalhados no ano ÷ 12",
      substituicao: `${formatarBRL(entrada.baseRemuneracaoMensal)} × ${entrada.mesesDecimoTerceiro}/12`,
      resultado: base13,
      fundamento: "Lei 4.090/1962 art. 3º — pago integral na rescisão, sem split de parcelas",
    });
    baseInssIrrf13 = base13;
    fgtsSobre13 = percentualDe(base13, parametros.fgtsPercentual);
  }

  // ---------------------------------------------------------- férias (vencidas + proporcionais, sempre indenizadas)

  let fgtsSobreFerias = 0;
  if (entrada.diasFeriasVencidas > 0) {
    const valor = entrada.diasFeriasVencidas * valorDiario;
    const terco = percentualDe(valor, parametros.tercoConstitucional);
    rubricas.push(
      rubrica(
        "963",
        "Férias vencidas",
        `${entrada.diasFeriasVencidas} dia(s) × ${formatarBRL(valorDiario)}`,
        "PROVENTO",
        valor,
        { fgts: true },
      ),
    );
    rubricas.push(
      rubrica(
        "964",
        "Terço constitucional — férias vencidas",
        `${parametros.tercoConstitucional}% sobre ${formatarBRL(valor)}`,
        "PROVENTO",
        terco,
        { fgts: true },
      ),
    );
    fgtsSobreFerias += percentualDe(valor + terco, parametros.fgtsPercentual);
  }

  if (d.feriasProporcionais && entrada.mesesFeriasProporcionais > 0) {
    const diasProporcionais = fracaoDe(30 * 100, entrada.mesesFeriasProporcionais, 12) / 100;
    const valor = arredondar(diasProporcionais * valorDiario);
    const terco = percentualDe(valor, parametros.tercoConstitucional);
    rubricas.push(
      rubrica(
        "965",
        "Férias proporcionais",
        `${entrada.mesesFeriasProporcionais}/12 avos`,
        "PROVENTO",
        valor,
        { fgts: true },
      ),
    );
    rubricas.push(
      rubrica(
        "966",
        "Terço constitucional — férias proporcionais",
        `${parametros.tercoConstitucional}% sobre ${formatarBRL(valor)}`,
        "PROVENTO",
        terco,
        { fgts: true },
      ),
    );
    fgtsSobreFerias += percentualDe(valor + terco, parametros.fgtsPercentual);
  }

  // ---------------------------------------------------------- impostos (só sobre o 13º — férias e aviso são isentos de INSS; aviso ainda deve IRRF)

  let inssValor = 0;
  if (baseInssIrrf13 > 0) {
    const resultadoInss = calcularInss(
      { base: baseInssIrrf13, remuneracaoOutrosVinculos: 0, inssDescontadoOutrosVinculos: 0 },
      parametros.inss,
    );
    memoria.push(
      ...resultadoInss.memoria.map((p) => ({ ...p, titulo: p.titulo.replace("INSS", "INSS sobre 13º") })),
    );
    inssValor = resultadoInss.valor;
    rubricas.push(
      rubrica("967", "INSS sobre 13º proporcional", `base ${formatarBRL(baseInssIrrf13)}`, "DESCONTO", inssValor),
    );
  }

  // Saldo de salário: INSS e IRRF próprios, como o salário do mês.
  if (saldoValor > 0) {
    const inssSaldo = calcularInss(
      { base: saldoValor, remuneracaoOutrosVinculos: 0, inssDescontadoOutrosVinculos: 0 },
      parametros.inss,
    );
    memoria.push(
      ...inssSaldo.memoria.map((p) => ({ ...p, titulo: p.titulo.replace("INSS", "INSS sobre saldo de salário") })),
    );
    if (inssSaldo.valor > 0) {
      rubricas.push(
        rubrica("971", "INSS sobre saldo de salário", `base ${formatarBRL(saldoValor)}`, "DESCONTO", inssSaldo.valor),
      );
    }
    const irrfSaldo = calcularIrrf(
      {
        baseTributavel: saldoValor,
        inssDescontado: inssSaldo.valor,
        dependentes: entrada.dependentesIrrf,
        pensaoAlimenticia: 0,
      },
      parametros.irrf,
    );
    memoria.push(
      ...irrfSaldo.memoria.map((p) => ({ ...p, titulo: p.titulo.replace("IRRF", "IRRF sobre saldo de salário") })),
    );
    if (irrfSaldo.valor > 0) {
      rubricas.push(
        rubrica("972", "IRRF sobre saldo de salário", `base ${formatarBRL(saldoValor)}`, "DESCONTO", irrfSaldo.valor),
      );
    }
  }

  // IRRF: aviso prévio indenizado E 13º são tributáveis, mas cada um por uma
  // base própria (o 13º sempre teve tributação exclusiva, separada do
  // salário do mês) — aqui cada verba é ela mesma a base do seu IRRF.
  const avisoRubrica = rubricas.find((r) => r.codigo === "961");
  if (avisoRubrica && avisoRubrica.valor > 0) {
    const resultadoIrrfAviso = calcularIrrf(
      {
        baseTributavel: avisoRubrica.valor,
        inssDescontado: 0,
        dependentes: entrada.dependentesIrrf,
        pensaoAlimenticia: 0,
      },
      parametros.irrf,
    );
    memoria.push(
      ...resultadoIrrfAviso.memoria.map((p) => ({ ...p, titulo: p.titulo.replace("IRRF", "IRRF sobre aviso prévio") })),
    );
    if (resultadoIrrfAviso.valor > 0) {
      rubricas.push(
        rubrica("968", "IRRF sobre aviso prévio", `base ${formatarBRL(avisoRubrica.valor)}`, "DESCONTO", resultadoIrrfAviso.valor),
      );
    }
  }

  let irrf13Valor = 0;
  if (baseInssIrrf13 > 0) {
    const resultadoIrrf13 = calcularIrrf(
      {
        baseTributavel: baseInssIrrf13,
        inssDescontado: inssValor,
        dependentes: entrada.dependentesIrrf,
        pensaoAlimenticia: 0,
      },
      parametros.irrf,
    );
    memoria.push(
      ...resultadoIrrf13.memoria.map((p) => ({ ...p, titulo: p.titulo.replace("IRRF", "IRRF sobre 13º") })),
    );
    irrf13Valor = resultadoIrrf13.valor;
    if (irrf13Valor > 0) {
      rubricas.push(
        rubrica("969", "IRRF sobre 13º proporcional", `base ${formatarBRL(baseInssIrrf13)}`, "DESCONTO", irrf13Valor),
      );
    }
  }

  // ---------------------------------------------------------- multa do FGTS

  let multaFgts = 0;
  if (d.percentualMultaFgts > 0 && entrada.saldoFgtsDepositado > 0) {
    multaFgts = percentualDe(entrada.saldoFgtsDepositado, d.percentualMultaFgts);
    rubricas.push(
      rubrica(
        "970",
        `Multa de ${d.percentualMultaFgts}% do FGTS`,
        `${d.percentualMultaFgts}% sobre ${formatarBRL(entrada.saldoFgtsDepositado)} depositado`,
        "PROVENTO",
        multaFgts,
      ),
    );
    memoria.push({
      titulo: `Multa rescisória do FGTS (${d.percentualMultaFgts}%)`,
      formula: "saldo depositado × percentual",
      substituicao: `${formatarBRL(entrada.saldoFgtsDepositado)} × ${d.percentualMultaFgts}%`,
      resultado: multaFgts,
      fundamento:
        entrada.tipo === "ACORDO"
          ? "CLT art. 484-A §2º — metade da multa no distrato por acordo"
          : "Lei 8.036/90 art. 18 §1º",
    });
  }

  if (entrada.tipo === "JUSTA_CAUSA") {
    avisos.push({
      severidade: "INFO",
      mensagem:
        "Justa causa: sem aviso prévio, sem 13º proporcional, sem férias proporcionais e sem multa de FGTS — mantém apenas saldo de salário e férias vencidas (se houver), que nunca se perdem.",
    });
  }

  const fgts = fgtsSobreSaldo + fgtsSobreAvisoPrevio + fgtsSobreFerias + fgtsSobre13;
  const totalProventos = rubricas
    .filter((r) => r.tipo === "PROVENTO")
    .reduce((a, r) => a + r.valor, 0);
  const totalDescontos = rubricas
    .filter((r) => r.tipo === "DESCONTO")
    .reduce((a, r) => a + r.valor, 0);
  const liquido = totalProventos - totalDescontos;

  if (liquido < 0) {
    avisos.push({
      severidade: "DIVERGENCIA",
      mensagem: "Líquido da rescisão negativo — confira as entradas antes de usar este resultado.",
    });
  }

  return {
    funcionarioId: entrada.funcionarioId,
    tipo: entrada.tipo,
    rubricas,
    totalProventos,
    totalDescontos,
    liquido,
    fgts,
    multaFgts,
    memoria,
    avisos,
  };
}
