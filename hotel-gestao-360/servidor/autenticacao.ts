import { randomBytes, scrypt, timingSafeEqual, createHash, createHmac, createCipheriv, createDecipheriv } from "node:crypto";
import { promisify } from "node:util";
import { consultar, transacao } from "./banco.js";

const scryptAsync = promisify(scrypt);

/**
 * Senha e sessão.
 *
 * Uso `scrypt`, que vem no próprio Node. Argon2id seria a primeira escolha,
 * mas exige compilação nativa — e uma dependência que falha na instalação é
 * uma dependência que ninguém consegue implantar. scrypt é KDF reconhecido
 * (RFC 7914), resiste a hardware dedicado e não precisa de nada além do Node.
 *
 * Os parâmetros abaixo custam ~100ms por verificação num servidor modesto, o
 * que é o ponto: torna ataque de força bruta caro sem incomodar quem entra.
 */
// `maxmem` precisa ser declarado: scrypt exige 128 × N × r bytes — aqui
// 33,5 MB — e o Node recusa acima de 32 MB se não for dito explicitamente.
const CUSTO = { N: 2 ** 15, r: 8, p: 1, keylen: 64, maxmem: 96 * 1024 * 1024 };

export async function criarHashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const derivada = (await scryptAsync(senha.normalize("NFKC"), sal, CUSTO.keylen, CUSTO)) as Buffer;
  return ["scrypt", CUSTO.N, CUSTO.r, CUSTO.p, sal.toString("base64"), derivada.toString("base64")].join("$");
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const partes = guardado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [, n, r, p, salB64, esperadaB64] = partes;
  const sal = Buffer.from(salB64!, "base64");
  const esperada = Buffer.from(esperadaB64!, "base64");
  const derivada = (await scryptAsync(senha.normalize("NFKC"), sal, esperada.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: CUSTO.maxmem,
  })) as Buffer;
  // Comparação em tempo constante: comparar com === vaza o tamanho do prefixo
  // correto e permite descobrir o hash caractere a caractere.
  return derivada.length === esperada.length && timingSafeEqual(derivada, esperada);
}

/**
 * CPF: cifra reversível para exibir, HMAC para buscar.
 *
 * O pepper fica fora do banco. Hash simples de CPF se reverte em minutos —
 * são só 10⁹ candidatos e o dígito verificador reduz mais ainda —, então sem
 * segredo externo a coluna `cpf_hash` não protege nada.
 */
const PEPPER = process.env.CPF_PEPPER;

export function hashDocumento(documento: string): string {
  if (!PEPPER) {
    throw new Error(
      "CPF_PEPPER não definida. Sem pepper o hash de CPF é reversível em minutos.",
    );
  }
  const limpo = documento.replace(/\D/g, "");
  return createHmac("sha256", PEPPER).update(limpo).digest("hex");
}

/**
 * Cifra reversível do CPF (AES-256-GCM). `hashDocumento` acima serve para
 * BUSCAR (é HMAC, de mão única); isto serve para GUARDAR o CPF de um jeito
 * que dá para recuperar depois — eSocial e informe de rendimentos precisam
 * do número de verdade, não só de saber se duas pessoas têm o mesmo.
 *
 * Layout do buffer: 1 byte de versão + 12 bytes de IV + 16 bytes de tag de
 * autenticação + texto cifrado. O IV é aleatório a cada chamada (nunca reuse
 * IV com a mesma chave em GCM — reaproveitar quebra a autenticação inteira),
 * por isso duas cifras do mesmo CPF nunca ficam iguais no banco.
 */
const CIFRA_ALGORITMO = "aes-256-gcm";
const CIFRA_VERSAO = 1;

function chaveCpf(): Buffer {
  const b64 = process.env.CPF_CHAVE;
  if (!b64) {
    throw new Error(
      "CPF_CHAVE não definida. Em produção use KMS; guardar chave e dado no mesmo banco não protege nada.",
    );
  }
  const chave = Buffer.from(b64, "base64");
  if (chave.length !== 32) {
    throw new Error("CPF_CHAVE precisa decodificar para 32 bytes (AES-256). Gere com: openssl rand -base64 32");
  }
  return chave;
}

export function cifrarDocumento(documento: string): Buffer {
  const limpo = documento.replace(/\D/g, "");
  const iv = randomBytes(12);
  const cifra = createCipheriv(CIFRA_ALGORITMO, chaveCpf(), iv);
  const cifrado = Buffer.concat([cifra.update(limpo, "utf8"), cifra.final()]);
  return Buffer.concat([Buffer.from([CIFRA_VERSAO]), iv, cifra.getAuthTag(), cifrado]);
}

export function decifrarDocumento(guardado: Buffer): string {
  if (guardado[0] !== CIFRA_VERSAO) throw new Error("Versão de cifra de CPF desconhecida.");
  const iv = guardado.subarray(1, 13);
  const tag = guardado.subarray(13, 29);
  const cifrado = guardado.subarray(29);
  const decifra = createDecipheriv(CIFRA_ALGORITMO, chaveCpf(), iv);
  decifra.setAuthTag(tag);
  return Buffer.concat([decifra.update(cifrado), decifra.final()]).toString("utf8");
}

// ---------------------------------------------------------------- sessão

const DURACAO_HORAS = Number(process.env.SESSAO_HORAS ?? 12);

export interface Sessao {
  userId: string;
  nome: string;
  email: string;
  perfis: string[];
}

/** O token vai para o cookie; no banco fica só o hash dele. */
export async function abrirSessao(
  userId: string,
  ip: string | undefined,
  userAgent: string | undefined,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expira = new Date(Date.now() + DURACAO_HORAS * 3_600_000);

  await transacao({ userId }, async (c) => {
    await c.query(
      `INSERT INTO sessions (user_id, token_hash, ip, user_agent, expira_em)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, tokenHash, ip ?? null, userAgent ?? null, expira],
    );
    await c.query("UPDATE users SET ultimo_acesso = now() WHERE id = $1", [userId]);
  });

  return token;
}

export async function lerSessao(token: string | undefined): Promise<Sessao | null> {
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const linhas = await consultar<{
    user_id: string; nome: string; email: string; perfis: string[] | null;
  }>(
    `SELECT s.user_id, u.nome, u.email,
            array_remove(array_agg(r.chave), NULL) AS perfis
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
      WHERE s.token_hash = $1
        AND s.revogada_em IS NULL
        AND s.expira_em > now()
        AND u.ativo
      GROUP BY s.user_id, u.nome, u.email`,
    [tokenHash],
  );
  const s = linhas[0];
  if (!s) return null;
  return { userId: s.user_id, nome: s.nome, email: s.email, perfis: s.perfis ?? [] };
}

export async function encerrarSessao(token: string | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await consultar(
    "UPDATE sessions SET revogada_em = now() WHERE token_hash = $1 AND revogada_em IS NULL",
    [tokenHash],
  );
}

/** Limpa sessão vencida. Um job diário deve chamar isto. */
export async function limparSessoesVencidas(): Promise<number> {
  const linhas = await consultar<{ id: string }>(
    "DELETE FROM sessions WHERE expira_em < now() - interval '30 days' RETURNING id",
  );
  return linhas.length;
}
