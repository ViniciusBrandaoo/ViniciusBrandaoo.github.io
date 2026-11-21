/**
 * Quem pode fazer o quê no hotel. A checagem é feita no servidor, antes de
 * ler ou gravar qualquer dado (docs/ETAPA-1-DESCOBERTA.md, seção 4).
 */
export type AcaoHotel =
  | "importacao.ver"
  | "importacao.enviar"
  | "importacao.confirmar"
  | "hospedagem.ver"
  | "recebimento.ver"
  | "conferencia.ver"
  | "conferencia.executar"
  | "salario.ver";

const MATRIZ: Record<AcaoHotel, readonly string[]> = {
  "importacao.ver": ["DIRECAO", "FINANCEIRO", "RECEPCAO", "AUDITOR"],
  "importacao.enviar": ["DIRECAO", "FINANCEIRO", "RECEPCAO"],
  "importacao.confirmar": ["DIRECAO", "FINANCEIRO", "RECEPCAO"],
  "hospedagem.ver": ["DIRECAO", "FINANCEIRO", "RECEPCAO", "GOVERNANCA", "AUDITOR"],
  "recebimento.ver": ["DIRECAO", "FINANCEIRO", "RECEPCAO", "AUDITOR"],
  // A conferência mostra dinheiro: Governança não vê. Quem fecha o caixa roda.
  "conferencia.ver": ["DIRECAO", "FINANCEIRO", "RECEPCAO", "AUDITOR"],
  "conferencia.executar": ["DIRECAO", "FINANCEIRO", "RECEPCAO"],
  // Salário é da Direção e do RH (o restante do sistema já aplica esta regra).
  "salario.ver": ["DIRECAO", "RH"],
};

export function perfisQuePodem(acao: AcaoHotel): readonly string[] {
  return MATRIZ[acao];
}

export function pode(perfis: readonly string[], acao: AcaoHotel): boolean {
  return MATRIZ[acao].some((p) => perfis.includes(p));
}
