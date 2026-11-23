import type { CredenciaisConector, StatusConector } from "./tipos.js";

/**
 * Conector do ClipEscola.
 *
 * A forma exata da API (endpoint, cabeçalho de autenticação, paginação,
 * nome dos campos) ainda não é conhecida: o suporte do ClipEscola libera o
 * acesso por pedido, caso a caso, e o prazo mínimo informado por eles é de
 * ~7 dias. Este arquivo é o único lugar a preencher quando a credencial
 * chegar — troque os TODOs abaixo pelo que a documentação deles trouxer,
 * sem mexer em mais nada do sistema. As funções de busca de dados ficam de
 * fora por enquanto porque o escopo (só financeiro agregado? matrícula por
 * turma? financeiro por aluno?) ainda não foi decidido.
 *
 * O que perguntar ao suporte do ClipEscola antes de codar o resto:
 *   1. URL base da API em produção, e se existe ambiente de teste/sandbox.
 *   2. Autenticação: API key fixa (em qual cabeçalho?) ou token que expira
 *      e precisa ser renovado sozinho (OAuth2 client credentials, etc.)?
 *   3. Endpoint (e nome exato dos campos) para o que for decidido usar —
 *      candidatos: mensalidades previstas x recebidas por competência,
 *      inadimplência agregada, matrícula por turma/segmento.
 *   4. Limite de chamadas por minuto/dia (rate limit) e se há paginação.
 *   5. Se os dados incluem CPF/nome de responsável — se sim, entra no
 *      mesmo regime de cifra que `pessoas.documento_cifrado` já usa para
 *      fornecedores e funcionários (ver db/migrations/001_nucleo.sql).
 */

function credenciais(): CredenciaisConector | null {
  const baseUrl = process.env.CLIPESCOLA_API_URL;
  const chave = process.env.CLIPESCOLA_API_KEY;
  if (!baseUrl || !chave) return null;
  return { baseUrl, chave };
}

export function configurado(): boolean {
  return credenciais() !== null;
}

/**
 * Confirma que a credencial funciona. O endpoint de verificação abaixo é um
 * palpite ("/status") — troque pelo que a documentação do ClipEscola indicar
 * assim que ela chegar.
 */
export async function testarConexao(): Promise<StatusConector> {
  const cred = credenciais();
  if (!cred) {
    return {
      sistema: "CLIPESCOLA", configurado: false,
      erro: "CLIPESCOLA_API_URL e/ou CLIPESCOLA_API_KEY não configuradas no ambiente.",
    };
  }
  try {
    // TODO: confirmar endpoint e esquema de autenticação com o suporte do ClipEscola.
    const resposta = await fetch(`${cred.baseUrl}/status`, {
      headers: { Authorization: `Bearer ${cred.chave}` },
    });
    return {
      sistema: "CLIPESCOLA", configurado: true, ultimaVerificacao: new Date().toISOString(),
      ok: resposta.ok, erro: resposta.ok ? undefined : `HTTP ${resposta.status}`,
    };
  } catch (erro) {
    return {
      sistema: "CLIPESCOLA", configurado: true, ultimaVerificacao: new Date().toISOString(),
      ok: false, erro: (erro as Error).message,
    };
  }
}

// TODO: funções de sincronização de dados de verdade (ex.: buscarReceitasDoMes)
// entram aqui assim que o escopo e a credencial estiverem definidos.
