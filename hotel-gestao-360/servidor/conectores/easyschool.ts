import type { CredenciaisConector, StatusConector } from "./tipos.js";

/**
 * Conector do Easyschool (Swisslink).
 *
 * Mesma situação do `clipescola.ts`: a forma exata da API ainda não é
 * conhecida publicamente — o material do fornecedor fala em módulos
 * integrados entre si (Secretaria, Coordenação, EasyApp), mas nada sobre
 * abrir esses dados para um sistema de fora. Preencha os TODOs abaixo
 * quando o contato com a Swisslink trouxer a documentação real.
 *
 * O que perguntar a eles antes de codar o resto:
 *   1. URL base da API e se existe ambiente de teste/sandbox.
 *   2. Autenticação: API key, token OAuth2, certificado?
 *   3. Endpoint (e nome exato dos campos) para o que for decidido usar —
 *      mesmos candidatos do ClipEscola: financeiro agregado por
 *      competência, matrícula por turma, ou financeiro por aluno.
 *   4. Limite de chamadas por minuto/dia e paginação.
 *   5. Se os dados incluem CPF/nome de responsável — mesmo regime de cifra
 *      já usado para fornecedores e funcionários
 *      (ver db/migrations/001_nucleo.sql).
 */

function credenciais(): CredenciaisConector | null {
  const baseUrl = process.env.EASYSCHOOL_API_URL;
  const chave = process.env.EASYSCHOOL_API_KEY;
  if (!baseUrl || !chave) return null;
  return { baseUrl, chave };
}

export function configurado(): boolean {
  return credenciais() !== null;
}

/**
 * Confirma que a credencial funciona. O endpoint de verificação abaixo é um
 * palpite ("/status") — troque pelo que a documentação do Easyschool indicar
 * assim que ela chegar.
 */
export async function testarConexao(): Promise<StatusConector> {
  const cred = credenciais();
  if (!cred) {
    return {
      sistema: "EASYSCHOOL", configurado: false,
      erro: "EASYSCHOOL_API_URL e/ou EASYSCHOOL_API_KEY não configuradas no ambiente.",
    };
  }
  try {
    // TODO: confirmar endpoint e esquema de autenticação com a Swisslink.
    const resposta = await fetch(`${cred.baseUrl}/status`, {
      headers: { Authorization: `Bearer ${cred.chave}` },
    });
    return {
      sistema: "EASYSCHOOL", configurado: true, ultimaVerificacao: new Date().toISOString(),
      ok: resposta.ok, erro: resposta.ok ? undefined : `HTTP ${resposta.status}`,
    };
  } catch (erro) {
    return {
      sistema: "EASYSCHOOL", configurado: true, ultimaVerificacao: new Date().toISOString(),
      ok: false, erro: (erro as Error).message,
    };
  }
}

// TODO: funções de sincronização de dados de verdade entram aqui assim que
// o escopo e a credencial estiverem definidos.
