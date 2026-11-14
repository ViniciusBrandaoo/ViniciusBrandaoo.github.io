import {
  formatarBRL,
  fracaoDe,
  percentualDe,
  type Centavos,
} from "../comum/dinheiro.js";
import { janelaTrabalhada, type Competencia } from "../comum/competencia.js";
import type { Aviso, PassoMemoria } from "./tipos.js";

/**
 * MEI e PJ prestadora de serviço.
 *
 * Não é folha: não há salário, INSS de segurado, FGTS, 13º nem férias. O que
 * existe é uma nota fiscal de serviço, eventuais retenções e um pagamento —
 * por isso mora em módulo próprio e desemboca em contas a pagar, não em
 * holerite. Tratar MEI dentro do motor da CLT produziria rubricas que não
 * existem e um custo de empregador falso.
 */

export type EnquadramentoPrestador = "MEI" | "PJ_SIMPLES" | "PJ_LUCRO_PRESUMIDO";

export interface ParametrosPrestador {
  /**
   * LC 123 art. 18-B: a contratante recolhe 20% de CPP sobre o serviço de MEI
   * apenas em hidráulica, eletricidade, pintura, alvenaria, carpintaria e
   * manutenção/reparo de veículos. Aula não está na lista.
   */
  cppPercentualSobreMei: number;
  /** IRRF sobre serviço profissional de PJ. Optante do Simples não sofre. */
  irrfPercentual: number;
  /** PIS/COFINS/CSLL. Optante do Simples não sofre. */
  csrfPercentual: number;
  /** Piso de valor mensal abaixo do qual a CSRF não é retida. */
  csrfValorMinimo: Centavos;
  /** ISS retido na fonte — alíquota do município, quando houver retenção. */
  issPercentual: number;
}

export const PARAMETROS_PRESTADOR_PADRAO: ParametrosPrestador = {
  cppPercentualSobreMei: 20,
  irrfPercentual: 1.5,
  csrfPercentual: 4.65,
  csrfValorMinimo: 21500, // R$ 215,00
  issPercentual: 0,
};

export interface ContratoPrestador {
  prestadorId: string;
  nome: string;
  enquadramento: EnquadramentoPrestador;
  /** CNPJ do prestador. MEI sem CNPJ é pessoa física — outro regime. */
  cnpj: string;
  /** Serviço contratado, para decidir a incidência de CPP no MEI. */
  servico: string;
  /**
   * Serviço da lista do art. 18-B da LC 123. Só isso liga a CPP de 20% no MEI.
   */
  servicoComCppNoMei: boolean;
  /** Retenção de ISS conforme a legislação do município. */
  issRetidoNaFonte: boolean;
  valorMensal: Centavos;
  dataInicio: string;
  dataFim: string | null;
  /** Sinais de subordinação — alimentam a checagem de risco de vínculo. */
  temHorarioFixo: boolean;
  temExclusividade: boolean;
  temSubordinacaoDireta: boolean;
  substituivelPorOutro: boolean;
}

export interface ResultadoPrestador {
  prestadorId: string;
  competencia: Competencia;
  valorBruto: Centavos;
  retencoes: Array<{ descricao: string; base: Centavos; valor: Centavos }>;
  totalRetencoes: Centavos;
  /** O que sai da conta da escola para o prestador. */
  liquidoAPagar: Centavos;
  /** Encargo da contratante, que não sai do valor do prestador. */
  encargoContratante: Centavos;
  custoTotal: Centavos;
  memoria: PassoMemoria[];
  avisos: Aviso[];
}

export function calcularPrestador(
  contrato: ContratoPrestador,
  competencia: Competencia,
  parametros: ParametrosPrestador = PARAMETROS_PRESTADOR_PADRAO,
): ResultadoPrestador {
  const memoria: PassoMemoria[] = [];
  const avisos: Aviso[] = [];
  const retencoes: ResultadoPrestador["retencoes"] = [];
  let bruto = contrato.valorMensal;

  memoria.push({
    titulo: "Valor da nota fiscal de serviço",
    formula: "valor mensal contratado",
    substituicao: formatarBRL(bruto),
    resultado: bruto,
    fundamento: `Contrato de prestação de serviço — ${contrato.enquadramento}`,
  });

  // Mês em que o contrato começa: valor proporcional aos dias, como no
  // mensalista (quem começa dia 19 não fatura o mês inteiro).
  const janela = contrato.dataInicio ? janelaTrabalhada(competencia, contrato.dataInicio, null) : null;
  if (janela && janela.admitiuNoMes && janela.parcial && janela.dias > 0) {
    const cheio = bruto;
    bruto = fracaoDe(cheio, janela.dias, janela.totalDeDias);
    memoria.push({
      titulo: "Mês de início — valor proporcional aos dias",
      formula: "valor mensal × dias de contrato ÷ dias do mês",
      substituicao: `${formatarBRL(cheio)} × ${janela.dias}/${janela.totalDeDias}`,
      resultado: bruto,
      fundamento: `Contrato iniciado em ${contrato.dataInicio.split("-").reverse().join("/")}`,
    });
    avisos.push({
      severidade: "INFO",
      mensagem: `Mês de início: valor proporcional a ${janela.dias} de ${janela.totalDeDias} dias (${formatarBRL(bruto)} de ${formatarBRL(cheio)}). Confira com a nota fiscal do prestador.`,
    });
  }

  const optanteSimples =
    contrato.enquadramento === "MEI" ||
    contrato.enquadramento === "PJ_SIMPLES";

  if (!optanteSimples && parametros.irrfPercentual > 0) {
    const valor = percentualDe(bruto, parametros.irrfPercentual);
    retencoes.push({ descricao: "IRRF sobre serviço", base: bruto, valor });
    memoria.push({
      titulo: "IRRF retido na fonte",
      formula: "valor do serviço × alíquota",
      substituicao: `${formatarBRL(bruto)} × ${parametros.irrfPercentual}%`,
      resultado: valor,
      fundamento: "Lei 7.713/88 art. 52 — serviço profissional prestado por PJ",
    });
  }

  if (
    !optanteSimples &&
    parametros.csrfPercentual > 0 &&
    bruto >= parametros.csrfValorMinimo
  ) {
    const valor = percentualDe(bruto, parametros.csrfPercentual);
    retencoes.push({ descricao: "PIS, COFINS e CSLL", base: bruto, valor });
    memoria.push({
      titulo: "CSRF retida na fonte",
      formula: "valor do serviço × alíquota conjunta",
      substituicao: `${formatarBRL(bruto)} × ${parametros.csrfPercentual}%`,
      resultado: valor,
      fundamento: "Lei 10.833/2003 art. 30",
    });
  }

  if (optanteSimples) {
    memoria.push({
      titulo: "Sem retenção de IRRF e CSRF",
      formula: "optante do Simples Nacional",
      substituicao: contrato.enquadramento,
      resultado: 0,
      fundamento:
        "LC 123/2006 art. 13 §1º — o recolhimento é unificado no DAS do prestador",
    });
  }

  if (contrato.issRetidoNaFonte && parametros.issPercentual > 0) {
    const valor = percentualDe(bruto, parametros.issPercentual);
    retencoes.push({ descricao: "ISS retido na fonte", base: bruto, valor });
    memoria.push({
      titulo: "ISS retido na fonte",
      formula: "valor do serviço × alíquota do município",
      substituicao: `${formatarBRL(bruto)} × ${parametros.issPercentual}%`,
      resultado: valor,
      fundamento: "LC 116/2003 art. 6º — conforme legislação municipal",
    });
  }

  let encargoContratante = 0;
  if (contrato.enquadramento === "MEI" && contrato.servicoComCppNoMei) {
    encargoContratante = percentualDe(bruto, parametros.cppPercentualSobreMei);
    memoria.push({
      titulo: "CPP da contratante sobre serviço de MEI",
      formula: "valor do serviço × 20%",
      substituicao: `${formatarBRL(bruto)} × ${parametros.cppPercentualSobreMei}%`,
      resultado: encargoContratante,
      fundamento:
        "LC 123/2006 art. 18-B — devida apenas em hidráulica, eletricidade, pintura, alvenaria, carpintaria e manutenção de veículos",
    });
  } else if (contrato.enquadramento === "MEI") {
    memoria.push({
      titulo: "Sem CPP sobre o serviço de MEI",
      formula: "serviço fora da lista do art. 18-B",
      substituicao: contrato.servico,
      resultado: 0,
      fundamento: "LC 123/2006 art. 18-B",
    });
  }

  const totalRetencoes = retencoes.reduce((a, r) => a + r.valor, 0);
  const liquidoAPagar = bruto - totalRetencoes;

  // ---------------------------------------------------------- risco de vínculo
  // O maior risco de contratar professor como MEI não é tributário: é a ação
  // trabalhista de reconhecimento de vínculo. Se vier, a escola paga tudo o
  // que não pagou — retroativo, com FGTS, 13º, férias e multa.
  const sinais: string[] = [];
  if (contrato.temHorarioFixo) sinais.push("cumpre horário fixo");
  if (contrato.temExclusividade) sinais.push("presta serviço com exclusividade");
  if (contrato.temSubordinacaoDireta) sinais.push("recebe ordens diretas");
  if (!contrato.substituivelPorOutro) sinais.push("não pode ser substituído por outro profissional");

  if (sinais.length >= 2) {
    avisos.push({
      severidade: "DIVERGENCIA",
      mensagem:
        `Risco alto de reconhecimento de vínculo empregatício para ${contrato.nome}: ${sinais.join(", ")}. ` +
        "Reunidos pessoalidade, habitualidade, subordinação e onerosidade (CLT art. 3º), a contratação como MEI pode ser desconsiderada e a escola responder por todo o passivo trabalhista retroativo. Recomenda-se revisão jurídica do contrato.",
    });
  } else if (sinais.length === 1) {
    avisos.push({
      severidade: "ATENCAO",
      mensagem: `Atenção ao contrato de ${contrato.nome}: ${sinais[0]}. Sinal isolado não caracteriza vínculo, mas convém documentar a autonomia do prestador.`,
    });
  }

  avisos.push({
    severidade: "INFO",
    mensagem:
      "Prestador de serviço não gera FGTS, 13º salário, férias nem provisões. O custo da escola é a nota fiscal mais eventuais encargos da contratante.",
  });

  return {
    prestadorId: contrato.prestadorId,
    competencia,
    valorBruto: bruto,
    retencoes,
    totalRetencoes,
    liquidoAPagar,
    encargoContratante,
    custoTotal: bruto + encargoContratante,
    memoria,
    avisos,
  };
}
