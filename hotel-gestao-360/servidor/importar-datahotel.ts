/**
 * Importa os relatórios exportados do DataHotel de uma pasta e roda a conferência.
 *
 *   node --import tsx servidor/importar-datahotel.ts <pasta> [AAAA-MM-DD desde] [e-mail do autor]
 *
 * Para cada tipo (apartamentos, café, reservas, recebimentos) gera a prévia e SÓ
 * confirma se ela vier limpa: sem erro de arquivo e sem linha recusada. Qualquer
 * outra coisa para ali, com a mensagem, e nada daquele arquivo é gravado.
 * Arquivo já importado (mesmo conteúdo) é pulado. O autor é um usuário real
 * (por padrão o único usuário existente): a auditoria registra quem importou.
 * Não altera nada no DataHotel.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { consultar, encerrar } from "./banco.js";
import * as hotel from "./hotel.js";
import * as conferencia from "./hotel-conferencia.js";
import type { TipoImportacao } from "../src/dominio/hotel/importacao.js";

const pasta = process.argv[2];
const desde = process.argv[3] ?? "2026-10-26";
const emailAutor = process.argv[4];
if (!pasta) { console.error("Uso: importar-datahotel.ts <pasta> [desde AAAA-MM-DD] [e-mail do autor]"); process.exit(1); }

const usuarios = await consultar<{ id: string; email: string; nome: string }>(
  emailAutor ? `SELECT id, email, nome FROM users WHERE lower(email) = lower($1)` : `SELECT id, email, nome FROM users ORDER BY criado_em`,
  emailAutor ? [emailAutor] : []);
if (!usuarios.length) { console.error("Nenhum usuário encontrado para ser o autor da importação."); process.exit(1); }
if (!emailAutor && usuarios.length > 1) { console.error("Há mais de um usuário: informe o e-mail do autor como 3º argumento."); process.exit(1); }
const autor = usuarios[0]!;
console.log(`Autor da importação: ${autor.nome} <${autor.email}>`);
const ator = { userId: autor.id };

const todos = readdirSync(pasta).filter((n) => n.toLowerCase().endsWith(".csv") && !n.includes("transcrito") && !n.startsWith("conferencia_")).sort();
const acha = (prefixo: string) => todos.filter((n) => n.startsWith(prefixo));

let parou = false;
async function importar(tipo: TipoImportacao, arquivo: string, inicio: string | null): Promise<void> {
  const rotulo = `${tipo.padEnd(13)} ${arquivo}`;
  try {
    const p = await hotel.criarPrevia(ator, { tipo, nome: arquivo, buffer: readFileSync(join(pasta, arquivo)), periodoInicio: inicio }) as {
      loteId: string; erroGeral: string | null; resumo: { total: number; novo: number; atualizado: number; identico: number; rejeitado: number };
    };
    if (p.erroGeral) { console.log(`PAROU  ${rotulo}\n         ${p.erroGeral}`); parou = true; return; }
    if (p.resumo.rejeitado > 0) {
      console.log(`PAROU  ${rotulo}\n         ${p.resumo.rejeitado} linha(s) recusada(s): a prévia ficou salva em Importações para você conferir; nada foi gravado.`);
      parou = true; return;
    }
    const c = await hotel.confirmar(ator, p.loteId) as { novo: number; atualizado: number; identico: number };
    console.log(`OK     ${rotulo}\n         ${p.resumo.total} linha(s): ${c.novo} novas, ${c.atualizado} atualizadas, ${c.identico} iguais.`);
  } catch (e) {
    const err = e as Error & { statusCode?: number };
    if (err.statusCode === 409 && /já foi importado/.test(err.message)) { console.log(`PULOU  ${rotulo}\n         ${err.message}`); return; }
    console.log(`ERRO   ${rotulo}\n         ${err.message}`);
    parou = true;
  }
}

// Ordem: apartamentos e reservas antes dos recebimentos (que citam reservas) e do café.
for (const f of acha("camareira_apartamentos")) await importar("apartamentos", f, null);
for (const f of acha("reservas_")) await importar("hospedagens", f, null);
for (const f of acha("contas_recebidas")) await importar("recebimentos", f, desde);
for (const f of acha("cafe_manha")) await importar("cafe", f, desde);

// Conferência com tudo o que a pasta tem (arquivos desconhecidos são ignorados e listados).
const periodoFim = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const arquivos = todos.map((n) => ({ nome: n, buffer: readFileSync(join(pasta, n)) }));
try {
  const r = await conferencia.executar(ator, arquivos, desde, periodoFim) as { resumo: { ok: number; divergentes: number; atencao: number }; naoReconhecidos: string[]; erros: string[] };
  console.log(`CONFERÊNCIA ${desde} a ${periodoFim}: ${r.resumo.ok} batem, ${r.resumo.divergentes} divergentes, ${r.resumo.atencao} com atenção.`);
  if (r.naoReconhecidos.length) console.log(`  não usados: ${r.naoReconhecidos.join(", ")}`);
  if (r.erros.length) console.log(`  erros de leitura: ${r.erros.join("; ")}`);
} catch (e) {
  console.log(`ERRO   conferência: ${(e as Error).message}`);
  parou = true;
}

const [t] = await consultar<{ apt: number; hosp: number; rec: number; cafe: number }>(
  `SELECT (SELECT count(*) FROM hotel_apartamentos)::int AS apt, (SELECT count(*) FROM hotel_hospedagens)::int AS hosp,
          (SELECT count(*) FROM hotel_recebimentos)::int AS rec, (SELECT count(*) FROM hotel_cafe_dia)::int AS cafe`);
console.log(`NO BANCO: ${t!.apt} apartamentos, ${t!.hosp} hospedagens, ${t!.rec} recebimentos, ${t!.cafe} linhas de café.`);
await encerrar();
process.exit(parou ? 2 : 0);
