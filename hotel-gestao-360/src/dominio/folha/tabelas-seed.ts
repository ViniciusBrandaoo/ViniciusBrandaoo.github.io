import { reais } from "../comum/dinheiro.js";
import type {
  ParametrosCct,
  SalarioMinimo,
  TabelaINSS,
  TabelaIRRF,
} from "./parametros.js";

/**
 * SEED INICIAL — carga inicial do banco, não é fonte de verdade.
 *
 * As tabelas abaixo têm vigência encerrada em 31/12/2025 e `conferidaPorRh: false`.
 * O RH deve cadastrar a tabela do exercício corrente em Configurações > Folha >
 * Tabelas legais e conferir contra a portaria oficial. Enquanto isso não
 * acontecer, o motor calcula para simulação mas emite DIVERGENCIA e a folha não
 * pode ser fechada.
 */

export const TABELA_INSS_2025: TabelaINSS = {
  id: "inss-2025",
  vigencia: { inicio: "2025-01-01", fim: "2025-12-31" },
  faixas: [
    { ate: reais(1518.0), aliquota: 7.5 },
    { ate: reais(2793.88), aliquota: 9 },
    { ate: reais(4190.83), aliquota: 12 },
    { ate: reais(8157.41), aliquota: 14 },
  ],
  teto: reais(8157.41),
  fonte: "Portaria Interministerial MPS/MF nº 6/2025",
  conferidaPorRh: false,
};

export const TABELA_IRRF_2025: TabelaIRRF = {
  id: "irrf-2025-05",
  vigencia: { inicio: "2025-05-01", fim: "2025-12-31" },
  faixas: [
    { ate: reais(2428.8), aliquota: 0, parcelaDeduzir: reais(0) },
    { ate: reais(2826.65), aliquota: 7.5, parcelaDeduzir: reais(182.16) },
    { ate: reais(3751.05), aliquota: 15, parcelaDeduzir: reais(394.16) },
    { ate: reais(4664.68), aliquota: 22.5, parcelaDeduzir: reais(675.49) },
    { ate: null, aliquota: 27.5, parcelaDeduzir: reais(908.73) },
  ],
  deducaoPorDependente: reais(189.59),
  descontoSimplificado: reais(607.2),
  // Os VALORES são os da tabela que passou a valer em maio/2025 (a isenção de
  // R$ 2.428,80 somada ao simplificado de R$ 607,20 dá exatamente dois
  // salários mínimos daquele ano). O ato que a instituiu é que não está
  // confirmado aqui — por isso `conferidaPorRh: false`: quem declara a norma
  // é o RH, no cadastro, contra o documento oficial.
  fonte: "Tabela vigente a partir de maio/2025 — conferir o ato oficial",
  conferidaPorRh: false,
};

export const SALARIO_MINIMO_2025: SalarioMinimo = {
  id: "minimo-2025",
  vigencia: { inicio: "2025-01-01", fim: "2025-12-31" },
  valor: reais(1518.0),
  fonte: "Decreto 12.342/2024",
  conferidoPorRh: false,
};

/**
 * Parâmetros da convenção coletiva dos professores (SINPRO/SINEPE).
 * Os defaults refletem a regra legal geral; os percentuais específicos da CCT
 * vigente do Hotel devem ser conferidos e ajustados pelo RH.
 */
export const CCT_DOCENTE_PADRAO: ParametrosCct = {
  id: "cct-docente-padrao",
  nome: "CCT Docente — parâmetros legais gerais (ajustar à CCT vigente)",
  categoria: "DOCENTE",
  vigencia: { inicio: "2025-01-01", fim: null },
  horaAula: {
    modoApuracao: "SEMANAS_FIXAS",
    minutosPorHoraAula: 50,
    semanasPorMes: 4.5,
    diasUteisSemana: 6,
    diasDescansoSemana: 1,
    percentualHoraAtividade: 0,
    percentualAulaExtra: 0,
    percentualAdicionalNoturno: 20,
    reflexoDsrSobreAdicionalNoturno: true,
    perdeDsrPorFaltaInjustificada: true,
    pisoArt322: true,
    valorMinimoHoraAula: 0,
  },
  mensalista: {
    divisorMensalHoras: 220,
    reflexoDsrSobreHorasExtras: true,
  },
  horistaRelogio: {
    semanasPorMes: 5,
    reflexoDsrSobreHorasExtras: true,
  },
  adicionalTempoServico: {
    tipo: "NENHUM",
    percentualPorPeriodo: 0,
    limitePeriodos: null,
  },
  encargos: {
    fgtsPercentual: 8,
    cppPercentual: 20,
    ratPercentual: 1,
    terceirosPercentual: 5.8,
    provisionarDecimoTerceiro: true,
    provisionarFerias: true,
    tercoConstitucional: 33.3333,
  },
  beneficios: {
    valeTransportePercentualMaximo: 6,
  },
  conferidaPorRh: false,
};

/** Administrativo, coordenação, secretaria e apoio: mensalistas. */
export const CCT_ADMINISTRATIVO_PADRAO: ParametrosCct = {
  ...CCT_DOCENTE_PADRAO,
  id: "cct-administrativo-padrao",
  nome: "CCT Administrativo — parâmetros legais gerais (ajustar à CCT vigente)",
  categoria: "ADMINISTRATIVO",
};

export const PARAMETROS_SEED = {
  inss: TABELA_INSS_2025,
  irrf: TABELA_IRRF_2025,
  salarioMinimo: SALARIO_MINIMO_2025,
  cctDocente: CCT_DOCENTE_PADRAO,
  cctAdministrativo: CCT_ADMINISTRATIVO_PADRAO,
};
