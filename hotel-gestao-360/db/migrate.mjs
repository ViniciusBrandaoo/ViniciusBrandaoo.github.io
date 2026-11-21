#!/usr/bin/env node
/**
 * Executor de migrations do Hotel Gestão 360.
 *
 * Roda contra QUALQUER PostgreSQL 16+ — Neon, Supabase, RDS, Cloud SQL,
 * Railway, Render ou um servidor próprio. Não depende de Docker: o container
 * é só bancada de teste local.
 *
 *   DATABASE_URL="postgresql://user:senha@host/banco?sslmode=require" node db/migrate.mjs
 *
 * Flags:
 *   --dry    mostra o que aplicaria, sem escrever nada
 *   --status lista o que já foi aplicado
 */

import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const AQUI = dirname(fileURLToPath(import.meta.url));
const PASTA = join(AQUI, "migrations");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL não definida.\n" +
      'Ex.: DATABASE_URL="postgresql://usuario:senha@host:5432/hotel?sslmode=require"',
  );
  process.exit(1);
}

const soMostrar = process.argv.includes("--dry");
const soStatus = process.argv.includes("--status");

const checksum = (texto) =>
  createHash("sha256").update(texto).digest("hex").slice(0, 16);

const arquivos = readdirSync(PASTA)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const cliente = new pg.Client({
  connectionString: url,
  // Provedores gerenciados exigem TLS; o certificado é do próprio provedor.
  ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
});

await cliente.connect();

try {
  // O ledger precisa existir antes de consultar o que já rodou.
  await cliente.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      versao      text PRIMARY KEY,
      descricao   text NOT NULL,
      aplicada_em timestamptz NOT NULL DEFAULT now(),
      checksum    text
    )`);

  const { rows: aplicadas } = await cliente.query(
    "SELECT versao, checksum, aplicada_em FROM schema_migrations ORDER BY versao",
  );
  const jaAplicada = new Map(aplicadas.map((r) => [r.versao, r]));

  if (soStatus) {
    console.log(`Banco: ${url.replace(/:[^:@/]+@/, ":***@")}\n`);
    for (const arquivo of arquivos) {
      const versao = arquivo.replace(/\.sql$/, "");
      const registro = jaAplicada.get(versao);
      if (!registro) {
        console.log(`  pendente  ${versao}`);
        continue;
      }
      const atual = checksum(readFileSync(join(PASTA, arquivo), "utf8"));
      const alterada = registro.checksum && registro.checksum !== atual;
      console.log(
        `  ${alterada ? "ALTERADA " : "aplicada "} ${versao}` +
          `  ${new Date(registro.aplicada_em).toLocaleString("pt-BR")}` +
          (alterada ? "  <-- o arquivo mudou depois de aplicado" : ""),
      );
    }
    process.exit(0);
  }

  let aplicou = 0;

  for (const arquivo of arquivos) {
    const versao = arquivo.replace(/\.sql$/, "");
    const sql = readFileSync(join(PASTA, arquivo), "utf8");
    const soma = checksum(sql);
    const registro = jaAplicada.get(versao);

    if (registro) {
      // Migration já aplicada que foi editada depois é sinal de que o histórico
      // do banco e o do repositório divergiram. Avisa, mas não reaplica.
      if (registro.checksum && registro.checksum !== soma) {
        console.warn(
          `  ATENÇÃO  ${versao} foi alterada depois de aplicada. ` +
            "Crie uma migration nova em vez de editar uma já aplicada.",
        );
      }
      continue;
    }

    if (soMostrar) {
      console.log(`  aplicaria  ${versao}`);
      aplicou++;
      continue;
    }

    process.stdout.write(`  aplicando  ${versao} ... `);
    // Cada migration já abre e fecha a sua própria transação (BEGIN/COMMIT).
    // O lock_timeout evita que uma migration fique presa atrás de uma query
    // longa e trave a aplicação inteira em produção.
    await cliente.query("SET lock_timeout = '10s'");
    await cliente.query("SET statement_timeout = '300s'");
    try {
      await cliente.query(sql);
    } catch (erro) {
      console.log("FALHOU");
      console.error(`\n${erro.message}\n`);
      process.exit(1);
    }
    await cliente.query(
      "INSERT INTO schema_migrations (versao, descricao, checksum) VALUES ($1, $2, $3)",
      [versao, arquivo, soma],
    );
    console.log("ok");
    aplicou++;
  }

  console.log(
    aplicou === 0
      ? "\nBanco já está atualizado."
      : `\n${aplicou} migration(s) ${soMostrar ? "a aplicar" : "aplicada(s)"}.`,
  );
} finally {
  await cliente.end();
}
