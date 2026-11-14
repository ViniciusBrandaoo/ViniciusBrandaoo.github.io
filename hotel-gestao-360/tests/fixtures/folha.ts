import { reais } from "@/dominio/comum/dinheiro.js";
import type { ParametrosFolha } from "@/dominio/folha/parametros.js";
import {
  CCT_ADMINISTRATIVO_PADRAO,
  CCT_DOCENTE_PADRAO,
  SALARIO_MINIMO_2025,
  TABELA_INSS_2025,
  TABELA_IRRF_2025,
} from "@/dominio/folha/tabelas-seed.js";
import {
  movimentoVazio,
  type Competencia,
  type ContratoHoristaAula,
  type ContratoHoristaRelogio,
  type ContratoMensalista,
  type MovimentoMensal,
  type ResultadoFolha,
} from "@/dominio/folha/tipos.js";

const VIGENCIA_ABERTA = { inicio: "2020-01-01", fim: null };

/**
 * Tabelas do seed com vigência aberta e conferidas, para que os testes de
 * cálculo não fiquem acoplados às datas do seed de produção.
 */
export function parametros(
  ajustes: Partial<ParametrosFolha> = {},
): ParametrosFolha {
  return {
    inss: {
      ...TABELA_INSS_2025,
      vigencia: VIGENCIA_ABERTA,
      conferidaPorRh: true,
    },
    irrf: {
      ...TABELA_IRRF_2025,
      vigencia: VIGENCIA_ABERTA,
      conferidaPorRh: true,
    },
    salarioMinimo: {
      ...SALARIO_MINIMO_2025,
      vigencia: VIGENCIA_ABERTA,
      conferidoPorRh: true,
    },
    cct: { ...CCT_DOCENTE_PADRAO, conferidaPorRh: true },
    ...ajustes,
  };
}

/** Parâmetros com a convenção ajustada, sem repetir o spread em cada teste. */
export function parametrosComCct(
  ajusteCct: (cct: ParametrosFolha["cct"]) => ParametrosFolha["cct"],
): ParametrosFolha {
  const p = parametros();
  return { ...p, cct: ajusteCct(p.cct) };
}

/** Professor com 20 aulas semanais a R$ 25,00 a hora-aula. */
export function professor(
  ajustes: Partial<ContratoHoristaAula> = {},
): ContratoHoristaAula {
  return {
    funcionarioId: "prof-001",
    regime: "HORISTA_AULA",
    dataAdmissao: "2022-02-01",
    dataDesligamento: null,
    cctId: CCT_DOCENTE_PADRAO.id,
    dependentesIrrf: 0,
    periodosTempoServico: 0,
    remuneracaoOutrosVinculos: 0,
    inssDescontadoOutrosVinculos: 0,
    valorHoraAula: reais(25),
    aulasSemanais: 20,
    ...ajustes,
  };
}

/** Auxiliar administrativo mensalista, jornada de 44h. */
export function mensalista(
  ajustes: Partial<ContratoMensalista> = {},
): ContratoMensalista {
  return {
    funcionarioId: "adm-001",
    regime: "MENSALISTA",
    dataAdmissao: "2021-03-01",
    dataDesligamento: null,
    cctId: CCT_ADMINISTRATIVO_PADRAO.id,
    dependentesIrrf: 0,
    periodosTempoServico: 0,
    remuneracaoOutrosVinculos: 0,
    inssDescontadoOutrosVinculos: 0,
    salarioBaseMensal: reais(3000),
    cargaHorariaSemanal: 44,
    ...ajustes,
  };
}

export function horistaRelogio(
  ajustes: Partial<ContratoHoristaRelogio> = {},
): ContratoHoristaRelogio {
  return {
    funcionarioId: "apo-001",
    regime: "HORISTA_RELOGIO",
    dataAdmissao: "2023-01-09",
    dataDesligamento: null,
    cctId: CCT_ADMINISTRATIVO_PADRAO.id,
    dependentesIrrf: 0,
    periodosTempoServico: 0,
    remuneracaoOutrosVinculos: 0,
    inssDescontadoOutrosVinculos: 0,
    valorHora: reais(12),
    horasSemanais: 40,
    ...ajustes,
  };
}

export function movimento(
  ajustes: Partial<MovimentoMensal> = {},
  competencia: Competencia = "2025-08",
): MovimentoMensal {
  return { ...movimentoVazio(competencia), ...ajustes };
}

export const valorDaRubrica = (r: ResultadoFolha, codigo: string) =>
  r.rubricas.find((x) => x.codigo === codigo)?.valor;

export const temDivergencia = (r: ResultadoFolha) =>
  r.avisos.some((a) => a.severidade === "DIVERGENCIA");

export const divergenciasSobre = (r: ResultadoFolha, trecho: string) =>
  r.avisos.filter(
    (a) => a.severidade === "DIVERGENCIA" && a.mensagem.includes(trecho),
  );
