import type { Centavos } from "../comum/dinheiro.js";
import type { Competencia, Vigencia } from "../comum/competencia.js";

export type { Competencia, Vigencia };

/**
 * Nenhuma alíquota, faixa ou regra de convenção fica travada no código.
 * Tudo aqui é carregado do banco (tabelas `folha_tabela_*` e `folha_cct`)
 * e editável por RH/contabilidade, com vigência e trilha de auditoria.
 */

// ---------------------------------------------------------------- INSS

export interface FaixaINSS {
  ate: Centavos;
  aliquota: number; // 7.5 = 7,5%
}

export interface TabelaINSS {
  id: string;
  vigencia: Vigencia;
  /** Progressiva por faixa (Lei 8.212/91 c/ EC 103/2019) — não é alíquota única. */
  faixas: FaixaINSS[];
  teto: Centavos;
  fonte: string;
  /** RH marca `true` depois de conferir contra a portaria oficial do ano. */
  conferidaPorRh: boolean;
}

// ---------------------------------------------------------------- IRRF

export interface FaixaIRRF {
  ate: Centavos | null; // null = última faixa, sem limite
  aliquota: number;
  parcelaDeduzir: Centavos;
}

export interface TabelaIRRF {
  id: string;
  vigencia: Vigencia;
  faixas: FaixaIRRF[];
  deducaoPorDependente: Centavos;
  /** Desconto simplificado — substitui todas as deduções legais quando mais vantajoso. */
  descontoSimplificado: Centavos;
  fonte: string;
  conferidaPorRh: boolean;
  /**
   * Redutor da Lei 15.270/2025 (Reforma da Renda) — os quatro campos vêm
   * juntos ou nenhum vem: uma tabela sem eles (ex.: a de 2025, anterior à
   * lei) simplesmente não tem redutor algum. Incide DEPOIS do imposto da
   * tabela normal, e olha o RENDIMENTO TRIBUTÁVEL (bruto), não a base já
   * reduzida por dependente/INSS/simplificado — são duas variáveis
   * diferentes no cálculo, não a mesma reaproveitada.
   *   - até `isencaoTotalAte`: imposto zera.
   *   - até `reducaoAte`: redutor = max(0, reducaoBase − rendimento × reducaoFator);
   *     imposto final = max(0, imposto da tabela − redutor).
   *   - acima de `reducaoAte`: tabela cheia, sem redutor.
   */
  isencaoTotalAte?: Centavos;
  reducaoAte?: Centavos;
  reducaoBase?: Centavos;
  reducaoFator?: number;
}

// ---------------------------------------------------------------- salário mínimo

export interface SalarioMinimo {
  id: string;
  vigencia: Vigencia;
  valor: Centavos;
  fonte: string;
  conferidoPorRh: boolean;
}

// ---------------------------------------------------------------- CCT

export type ModoApuracaoHoraAula =
  /** CLT art. 320 §1º: mês = 4,5 semanas fixas, independente do calendário. */
  | "SEMANAS_FIXAS"
  /** Paga as aulas efetivamente lançadas no diário, respeitando o piso do art. 322. */
  | "AULAS_EFETIVAS";

export interface ParametrosHoraAula {
  modoApuracao: ModoApuracaoHoraAula;
  minutosPorHoraAula: number;
  /** CLT art. 320 §1º. */
  semanasPorMes: number;
  /** DSR = aulas × (diasDescansoSemana / diasUteisSemana) — Súmula 351 TST => 1/6. */
  diasUteisSemana: number;
  diasDescansoSemana: number;
  /** % da carga de aulas pago como hora-atividade/planejamento, se a CCT previr. */
  percentualHoraAtividade: number;
  /** Adicional sobre a hora-aula em aulas extras/substituição, se a CCT previr. */
  percentualAulaExtra: number;
  /** CLT art. 73 — aulas após as 22h. */
  percentualAdicionalNoturno: number;
  /** Súmula 60 do TST: o adicional noturno habitual integra a base do repouso. */
  reflexoDsrSobreAdicionalNoturno: boolean;
  /** Lei 605/49 art. 6º — falta injustificada na semana faz perder o DSR da semana. */
  perdeDsrPorFaltaInjustificada: boolean;
  /**
   * CLT art. 322: em período de exames e férias escolares o professor recebe a
   * remuneração normal. Com isto ligado, a apuração por aulas efetivas nunca paga
   * menos que a grade contratual descontadas as faltas do próprio professor.
   */
  pisoArt322: boolean;
  /** Piso da hora-aula da convenção. 0 desliga a checagem. */
  valorMinimoHoraAula: Centavos;
}

export interface ParametrosMensalista {
  /** Divisor mensal de horas. 220 para jornada de 44h; muda por jornada e por CCT. */
  divisorMensalHoras: number;
  /** Súmula 172 do TST — hora extra habitual reflete no repouso. */
  reflexoDsrSobreHorasExtras: boolean;
}

export interface ParametrosHoristaRelogio {
  /** Divisor próprio: 4,5 semanas é regra de professor, não de horista comum. */
  semanasPorMes: number;
  reflexoDsrSobreHorasExtras: boolean;
}

export type TipoAdicionalTempoServico =
  | "NENHUM"
  | "ANUENIO"
  | "TRIENIO"
  | "QUINQUENIO";

export interface ParametrosAdicionalTempoServico {
  tipo: TipoAdicionalTempoServico;
  percentualPorPeriodo: number;
  limitePeriodos: number | null;
}

export interface ParametrosEncargos {
  fgtsPercentual: number;
  /** Contribuição previdenciária patronal — o maior custo depois do salário. */
  cppPercentual: number;
  /** RAT ajustado pelo FAP; varia por CNAE e por ano. */
  ratPercentual: number;
  /** Terceiros: salário-educação, SESC/SENAC, INCRA, SEBRAE. */
  terceirosPercentual: number;
  /** Provisões não entram no líquido — compõem o custo real por funcionário. */
  provisionarDecimoTerceiro: boolean;
  provisionarFerias: boolean;
  tercoConstitucional: number; // 33.3333
}

export interface ParametrosBeneficios {
  /** Lei 7.418/85 — desconto de VT limitado a % do salário base. */
  valeTransportePercentualMaximo: number;
}

export type CategoriaCct = "DOCENTE" | "ADMINISTRATIVO" | "APOIO";

export interface ParametrosCct {
  id: string;
  nome: string;
  /** Duas CCTs coexistem (docente e administrativo); a categoria é o que as separa. */
  categoria: CategoriaCct;
  vigencia: Vigencia;
  horaAula: ParametrosHoraAula;
  mensalista: ParametrosMensalista;
  horistaRelogio: ParametrosHoristaRelogio;
  adicionalTempoServico: ParametrosAdicionalTempoServico;
  encargos: ParametrosEncargos;
  beneficios: ParametrosBeneficios;
  conferidaPorRh: boolean;
}

export interface ParametrosFolha {
  inss: TabelaINSS;
  irrf: TabelaIRRF;
  cct: ParametrosCct;
  salarioMinimo: SalarioMinimo;
  /**
   * INSS e IRRF do empregado são apurados e recolhidos pela contabilidade:
   * a folha daqui não os desconta. Encargos da escola não mudam.
   */
  impostosPelaContabilidade?: boolean;
  /** O DSR continua sendo pago, mas some como linha: entra somado na rubrica de origem. */
  ocultarDsr?: boolean;
}

// ---------------------------------------------------------------- validação

/**
 * As tabelas vêm do banco e são digitadas pelo RH. O motor assume faixas em
 * ordem crescente; uma linha fora de ordem produz desconto errado em toda a
 * folha sem nenhum sintoma. Validar na carga é mais barato que auditar depois.
 */
export function validarTabelaInss(tabela: TabelaINSS): string[] {
  const problemas: string[] = [];
  if (tabela.faixas.length === 0) {
    problemas.push("Tabela de INSS sem nenhuma faixa cadastrada.");
    return problemas;
  }
  let anterior = 0;
  tabela.faixas.forEach((faixa, i) => {
    if (faixa.ate <= anterior) {
      problemas.push(
        `Faixa ${i + 1} do INSS tem limite menor ou igual ao da faixa anterior — as faixas precisam estar em ordem crescente.`,
      );
    }
    if (faixa.aliquota < 0 || faixa.aliquota > 100) {
      problemas.push(`Faixa ${i + 1} do INSS tem alíquota fora de 0% a 100%.`);
    }
    anterior = faixa.ate;
  });
  const ultima = tabela.faixas[tabela.faixas.length - 1];
  if (ultima && ultima.ate !== tabela.teto) {
    problemas.push(
      "O limite da última faixa do INSS precisa ser igual ao teto de contribuição.",
    );
  }
  return problemas;
}

export function validarTabelaIrrf(tabela: TabelaIRRF): string[] {
  const problemas: string[] = [];
  if (tabela.faixas.length === 0) {
    problemas.push("Tabela de IRRF sem nenhuma faixa cadastrada.");
    return problemas;
  }
  const semTeto = tabela.faixas.filter((f) => f.ate === null);
  if (semTeto.length !== 1) {
    problemas.push(
      "A tabela de IRRF precisa ter exatamente uma faixa sem limite superior.",
    );
  }
  const ultima = tabela.faixas[tabela.faixas.length - 1];
  if (ultima && ultima.ate !== null) {
    problemas.push(
      "A faixa sem limite superior do IRRF precisa ser a última da tabela.",
    );
  }
  let anterior = -1;
  tabela.faixas.forEach((faixa, i) => {
    if (faixa.ate !== null) {
      if (faixa.ate <= anterior) {
        problemas.push(
          `Faixa ${i + 1} do IRRF tem limite menor ou igual ao da faixa anterior — as faixas precisam estar em ordem crescente.`,
        );
      }
      anterior = faixa.ate;
    }
    if (faixa.aliquota < 0 || faixa.aliquota > 100) {
      problemas.push(`Faixa ${i + 1} do IRRF tem alíquota fora de 0% a 100%.`);
    }
  });
  return problemas;
}
