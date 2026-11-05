/**
 * Competência é sempre "AAAA-MM". O tipo `Competencia` aceita "2025-8" por ser
 * template literal, e comparar "2025-8-01" com "2025-12-31" lexicograficamente
 * dá resultado errado — por isso tudo aqui normaliza antes de comparar.
 */
export type Competencia = `${number}-${string}`;

export interface Vigencia {
  inicio: string; // "2026-01-01"
  fim: string | null; // null = vigente
}

export function normalizar(competencia: string): string {
  const [ano = "", mes = ""] = competencia.split("-");
  return `${ano.padStart(4, "0")}-${mes.padStart(2, "0")}`;
}

export function ehCompetenciaValida(competencia: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(normalizar(competencia));
}

export function primeiroDia(competencia: string): string {
  return `${normalizar(competencia)}-01`;
}

export function diasNoMes(competencia: string): number {
  const [ano, mes] = normalizar(competencia).split("-").map(Number);
  return new Date(Date.UTC(ano ?? 1970, mes ?? 1, 0)).getUTCDate();
}

export function ultimoDia(competencia: string): string {
  return `${normalizar(competencia)}-${String(diasNoMes(competencia)).padStart(2, "0")}`;
}

export function dentroDaVigencia(
  competencia: string,
  vigencia: Vigencia,
): boolean {
  const referencia = primeiroDia(competencia);
  if (referencia < vigencia.inicio) return false;
  if (vigencia.fim !== null && referencia > vigencia.fim) return false;
  return true;
}

export interface JanelaTrabalhada {
  /** Dias do mês em que o vínculo esteve ativo. */
  dias: number;
  totalDeDias: number;
  /** 1 quando o mês é integral. Usado para proporcionalizar o salário. */
  fator: number;
  parcial: boolean;
  admitiuNoMes: boolean;
  desligouNoMes: boolean;
}

/**
 * Quantos dias do mês o vínculo esteve ativo. Não conhece "hoje": o resultado
 * depende só da competência e das datas do contrato, o que mantém o recálculo
 * de uma competência fechada reproduzível.
 */
export function janelaTrabalhada(
  competencia: string,
  dataAdmissao: string,
  dataDesligamento: string | null,
): JanelaTrabalhada {
  const inicioMes = primeiroDia(competencia);
  const fimMes = ultimoDia(competencia);
  const total = diasNoMes(competencia);

  const inicio = dataAdmissao > inicioMes ? dataAdmissao : inicioMes;
  const fim = dataDesligamento && dataDesligamento < fimMes ? dataDesligamento : fimMes;

  if (inicio > fim) {
    return {
      dias: 0,
      totalDeDias: total,
      fator: 0,
      parcial: true,
      admitiuNoMes: false,
      desligouNoMes: false,
    };
  }

  const diaInicio = Number(inicio.slice(8, 10));
  const diaFim = Number(fim.slice(8, 10));
  const dias = diaFim - diaInicio + 1;

  return {
    dias,
    totalDeDias: total,
    fator: dias / total,
    parcial: dias < total,
    admitiuNoMes: dataAdmissao >= inicioMes && dataAdmissao <= fimMes,
    desligouNoMes:
      dataDesligamento !== null &&
      dataDesligamento >= inicioMes &&
      dataDesligamento <= fimMes,
  };
}
