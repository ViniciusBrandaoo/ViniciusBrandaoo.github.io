import { readFileSync } from "node:fs";
import pg from "pg";
import { configurarTiposPg } from "./tipos-pg.js";

configurarTiposPg(pg);

/**
 * Conexão com o PostgreSQL.
 *
 * Não há nada aqui preso a um provedor: a mesma `DATABASE_URL` serve para
 * Neon, Supabase, um servidor próprio ou o Postgres da sua máquina. Trocar de
 * hospedagem é trocar uma variável de ambiente.
 */

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    'DATABASE_URL não definida. Ex.: postgresql://usuario:senha@host:5432/hotel?sslmode=require',
  );
}

// Postgres local dispensa TLS; provedor gerenciado exige.
const semTls = url.includes("sslmode=disable") || /@(localhost|127\.0\.0\.1)/.test(url);

/**
 * `rejectUnauthorized:false` aceitaria QUALQUER certificado (inclusive de um
 * atacante entre o servidor e o banco) — validar de verdade exige apontar
 * para o CA certo do provedor, não desligar a checagem. `PG_CA_PATH` (ex.:
 * `servidor/supabase-ca.pem`, incluso neste repo) faz a validação real; sem
 * ela, cai no comportamento antigo para não quebrar outro provedor não
 * configurado — mas avisa no log, porque esse fallback é inseguro.
 */
const caminhoCa = process.env.PG_CA_PATH;
const ssl = semTls
  ? false
  : caminhoCa
    ? { ca: readFileSync(caminhoCa, "utf8") }
    : (console.warn(
        "[banco] PG_CA_PATH não definida — conexão TLS sem validar o certificado do servidor (risco de MITM). Configure PG_CA_PATH.",
      ),
      { rejectUnauthorized: false });

export const pool = new pg.Pool({
  connectionString: url,
  ssl,
  // O free tier de qualquer provedor limita conexões. Uma escola com 43
  // funcionários não precisa de mais que isto, e estourar o limite derruba
  // a aplicação inteira.
  max: Number(process.env.DB_POOL_MAX ?? 8),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (erro) => {
  console.error("[banco] conexão ociosa caiu:", erro.message);
});

export interface Ator {
  userId: string | null;
}

/**
 * Executa dentro de uma transação, declarando quem está agindo.
 *
 * O `SET LOCAL app.user_id` é o que faz a trilha de auditoria gravar o autor:
 * as triggers da migration 007 leem essa variável de sessão. Sem ela o fato
 * ainda é registrado, só que sem autor.
 */
export async function transacao<T>(
  ator: Ator,
  fn: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    if (ator.userId) {
      await cliente.query("SELECT set_config('app.user_id', $1, true)", [ator.userId]);
    }
    const resultado = await fn(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }
}

/** Leitura simples, fora de transação. */
export async function consultar<T = Record<string, unknown>>(
  sql: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  const { rows } = await pool.query(sql, parametros);
  return rows as T[];
}

export async function encerrar(): Promise<void> {
  await pool.end();
}
