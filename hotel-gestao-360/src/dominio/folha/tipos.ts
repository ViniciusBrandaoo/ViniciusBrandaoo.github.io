import type { Centavos } from "../comum/dinheiro.js";
import type { Competencia } from "../comum/competencia.js";

export type { Competencia };

export type RegimeRemuneracao =
  /** Professor: remunerado por hora-aula, com reflexo de DSR (Súmula 351 TST). */
  | "HORISTA_AULA"
  /** Administrativo/coordenação: salário mensal fixo. */
  | "MENSALISTA"
  /** Apoio: hora-relógio. */
  | "HORISTA_RELOGIO";

export type ModoPensao =
  | "VALOR"
  | "PERCENTUAL_LIQUIDO"
  | "PERCENTUAL_SALARIO_MINIMO";

export interface PensaoAlimenticia {
  modo: ModoPensao;
  /** Centavos quando modo = VALOR; percentual (15 = 15%) nos demais. */
  quantidade: number;
}

interface ContratoBase {
  funcionarioId: string;
  dataAdmissao: string;
  dataDesligamento: string | null;
  cctId: string;
  dependentesIrrf: number;
  periodosTempoServico: number;
  /**
   * Professor com duas escolas é regra, não exceção. Sem isto o motor aplica a
   * tabela progressiva desde a primeira faixa e desconta INSS a maior.
   */
  remuneracaoOutrosVinculos: Centavos;
  inssDescontadoOutrosVinculos: Centavos;
  /**
   * Parte da remuneração paga à parte como Ticket. O valor calculado pelas aulas/salário
   * já a inclui, então ela sai da folha como desconto (fora das bases de INSS/FGTS).
   */
  valorTicket?: Centavos;
}

export interface ContratoHoristaAula extends ContratoBase {
  regime: "HORISTA_AULA";
  valorHoraAula: Centavos;
  /** Carga contratual semanal em aulas (grade fixa do professor). */
  aulasSemanais: number;
  /**
   * Carga por segmento, quando cada segmento tem hora-aula própria. Com valor
   * em algum deles, as aulas valem a soma (aulas × hora do segmento) em vez da
   * hora-aula média arredondada, que perdia centavos. Segmento sem valor
   * conta zero, como na planilha da escola.
   */
  cargas?: Array<{ aulas: number; valorHora: Centavos | null }>;
}

export interface ContratoMensalista extends ContratoBase {
  regime: "MENSALISTA";
  salarioBaseMensal: Centavos;
  cargaHorariaSemanal: number;
}

export interface ContratoHoristaRelogio extends ContratoBase {
  regime: "HORISTA_RELOGIO";
  valorHora: Centavos;
  horasSemanais: number;
}

export type Contrato =
  | ContratoHoristaAula
  | ContratoMensalista
  | ContratoHoristaRelogio;

// ---------------------------------------------------------------- movimento do mês

export type NaturezaBase =
  /** Compõe as bases de incidência (proventos). */
  | "INTEGRA"
  /** Reduz as bases: falta, DSR perdido, banco de horas negativo. */
  | "REDUZ"
  /** Não toca base alguma: INSS, IRRF, VT, pensão, adiantamento, encargos. */
  | "NEUTRA";

export interface LancamentoAvulso {
  descricao: string;
  valor: Centavos;
  /**
   * O default seguro para desconto é NEUTRA: consignado, coparticipação e
   * adiantamento não reduzem base de INSS/IRRF/FGTS.
   */
  naturezaBase: NaturezaBase;
  incideInss: boolean;
  incideIrrf: boolean;
  incideFgts: boolean;
}

/**
 * O que muda de um mês para o outro. Vem do Ponto, do Banco de Horas e das
 * solicitações aprovadas — o RH não redigita nada disso na folha.
 */
export interface MovimentoMensal {
  competencia: Competencia;
  /** Aulas efetivamente lançadas no mês (usado quando modoApuracao = AULAS_EFETIVAS). */
  aulasEfetivas: number;
  /**
   * Carga extra que se repete toda semana (monitoria, projetos, plantão).
   * Multiplica pelas semanas do mês, como a carga regular — tratá-la como
   * avulsa paga um quarto do devido.
   */
  aulasExtrasSemanais: number;
  /** Aulas avulsas do mês: substituição pontual, reposição. Não multiplica. */
  aulasExtras: number;
  aulasSubstituicao: number;
  /** Hora-aula das extras, quando difere da carga regular. 0 usa a regular. */
  valorHoraExtra: Centavos;
  aulasNoturnas: number;
  /** Aulas da grade não ministradas por falta do professor. */
  aulasNaoDadas: number;
  /** Semanas do mês com ao menos uma falta injustificada — derruba o DSR da semana. */
  semanasComFaltaInjustificada: number;
  /** Faltas de mensalista e horista-relógio, em dias. */
  diasFalta: number;
  diasFaltaInjustificada: number;
  /** Horas extras já convertidas em horas decimais. */
  horasExtras50: number;
  horasExtras100: number;
  horasNoturnas: number;
  /** Horas negativas de banco de horas autorizadas a descontar em folha. */
  horasBancoADescontar: number;
  /**
   * Dias úteis e repousos do mês, vindos do calendário escolar. Enquanto o
   * calendário não existir vêm nulos e o DSR sobre parcelas variáveis usa a
   * razão da CCT (1/6), que ignora os feriados da competência.
   */
  diasUteisCompetencia: number | null;
  repousosCompetencia: number | null;
  valeTransporteCusto: Centavos;
  pensao: PensaoAlimenticia | null;
  outrosProventos: LancamentoAvulso[];
  outrosDescontos: LancamentoAvulso[];
}

export const movimentoVazio = (competencia: Competencia): MovimentoMensal => ({
  competencia,
  aulasEfetivas: 0,
  aulasExtrasSemanais: 0,
  aulasExtras: 0,
  aulasSubstituicao: 0,
  valorHoraExtra: 0,
  aulasNoturnas: 0,
  aulasNaoDadas: 0,
  semanasComFaltaInjustificada: 0,
  diasFalta: 0,
  diasFaltaInjustificada: 0,
  horasExtras50: 0,
  horasExtras100: 0,
  horasNoturnas: 0,
  horasBancoADescontar: 0,
  diasUteisCompetencia: null,
  repousosCompetencia: null,
  valeTransporteCusto: 0,
  pensao: null,
  outrosProventos: [],
  outrosDescontos: [],
});

// ---------------------------------------------------------------- resultado

export type TipoRubrica = "PROVENTO" | "DESCONTO" | "ENCARGO_EMPREGADOR";

export interface Rubrica {
  codigo: string;
  descricao: string;
  /** Ex.: "90 aulas", "1/6", "8%" — o que aparece no holerite. */
  referencia: string;
  tipo: TipoRubrica;
  /** Separado de `tipo`: dois descontos podem ter efeito oposto sobre a base. */
  naturezaBase: NaturezaBase;
  valor: Centavos;
  incideInss: boolean;
  incideIrrf: boolean;
  incideFgts: boolean;
}

export interface PassoMemoria {
  titulo: string;
  formula: string;
  substituicao: string;
  resultado: Centavos;
  /** Base legal / cláusula da CCT que sustenta o passo. */
  fundamento: string;
}

export type SeveridadeAviso = "INFO" | "ATENCAO" | "DIVERGENCIA";

export interface Aviso {
  severidade: SeveridadeAviso;
  mensagem: string;
}

export interface ResultadoFolha {
  funcionarioId: string;
  competencia: Competencia;
  rubricas: Rubrica[];
  baseInss: Centavos;
  baseIrrf: Centavos;
  baseFgts: Centavos;
  totalProventos: Centavos;
  totalDescontos: Centavos;
  liquido: Centavos;
  /** Bruto efetivamente pago: proventos menos o que reduz a remuneração. */
  remuneracaoBruta: Centavos;
  /** Bruto + FGTS + CPP + RAT + terceiros + provisões. O custo real do mês. */
  custoTotalEmpregador: Centavos;
  memoria: PassoMemoria[];
  avisos: Aviso[];
}
