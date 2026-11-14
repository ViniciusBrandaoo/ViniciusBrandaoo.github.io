/**
 * Contrato comum dos conectores com sistemas de terceiros (ClipEscola,
 * Easyschool). O Gestão 360 não duplica o que esses sistemas já fazem —
 * secretaria, matrícula, diário de classe continuam lá. O que atravessa a
 * fronteira é só o que a camada executiva precisa enxergar, e isso ainda
 * está em aberto (ver `clipescola.ts` e `easyschool.ts`).
 */

export type Sistema = "CLIPESCOLA" | "EASYSCHOOL";

export interface CredenciaisConector {
  baseUrl: string;
  chave: string;
}

export interface StatusConector {
  sistema: Sistema;
  /** Há URL e chave nas variáveis de ambiente — não significa que funcionam. */
  configurado: boolean;
  ultimaVerificacao?: string;
  ok?: boolean;
  erro?: string;
}
