import type pg from "pg";

/** OID do tipo `date` do PostgreSQL. */
const OID_DATE = 1082;

/**
 * Coluna `date` volta do driver como string "AAAA-MM-DD", nunca como `Date`.
 *
 * O driver `pg` converte `date` em objeto `Date` por padrão. O motor da folha
 * compara datas como texto (`dataAdmissao > primeiroDia(competencia)`); com um
 * `Date` dos dois lados dessa comparação o resultado é sempre falso, e o
 * servidor pagava o mês inteiro de quem foi admitido (ou saiu) no meio do mês,
 * enquanto a prévia da tela, que recebe texto, pagava proporcional. Tratar
 * a data como texto também evita o deslocamento de um dia por fuso horário.
 */
export function configurarTiposPg(driver: typeof pg): void {
  driver.types.setTypeParser(OID_DATE, (valor: string) => valor);
}
