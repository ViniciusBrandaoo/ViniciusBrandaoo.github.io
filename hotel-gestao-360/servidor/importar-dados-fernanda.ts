/**
 * Importa o arquivo de dados que a Direção enviou ("Acacia_Hotel_Dados_<data>.json",
 * gerado pela planilha/plataforma dela): empresas conveniadas com as regras de cada
 * convênio, contas a receber, inconsistências de hospedagem, folha do mês,
 * tabela de diárias e a conferência dela das contas a pagar com o extrato.
 *
 *   node --import tsx servidor/importar-dados-fernanda.ts <arquivo.json> [e-mail do autor]
 *
 * Idempotente: grava cada registro com o mesmo id do arquivo (rodar de novo atualiza).
 * O extrato de jan–ago não entra (dados só a partir de 26/10/2026; set–nov já vêm do PDF do BB).
 */
import { readFileSync } from "node:fs";
import { consultar, encerrar, transacao } from "./banco.js";
import { gravar } from "./hotel-dados.js";

const [arquivo, emailAutor] = process.argv.slice(2);
if (!arquivo) { console.error("Uso: importar-dados-fernanda.ts <arquivo.json> [e-mail do autor]"); process.exit(1); }
const d = JSON.parse(readFileSync(arquivo, "utf8")) as Record<string, any>;
const usuarios = await consultar<{ id: string; nome: string }>(
  `SELECT id, nome FROM users WHERE ($1::text IS NULL OR lower(email) = lower($1)) ORDER BY criado_em LIMIT 2`, [emailAutor ?? null]);
if (usuarios.length !== 1) { console.error("Informe o e-mail do autor."); process.exit(1); }
const ator = { userId: usuarios[0]!.id };
const PERFIS = ["DIRECAO", "RH"];
const cent = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Math.round(Number(v) * 100));
const linhas = (s: unknown) => String(s ?? "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
const so = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const g = (colecao: string, id: string, dados: Record<string, unknown>) => gravar(ator, PERFIS, { colecao, id, dados });

// ---------------------------------------------------------------- empresas conveniadas
const idEmpresa = new Map<string, string>();
for (const e of d.empresas_conveniadas as any[]) {
  const emails = linhas(e.emails), tels = linhas(e.telefones);
  await g("empresas", e.id, {
    razaoSocial: e.empresa, cnpj: so(e.cnpj).length === 14 ? e.cnpj : "",
    responsavel: e.contato || "", telefone: e.whatsapp || tels[0] || "", emailFinanceiro: emails[0] || "",
    telefones: tels.join("\n"), emails: emails.join("\n"),
    tabelaDiarias: e.tabela || "", regraVoucher: e.voucher || "", regraReserva: e.reserva || "",
    regraConsumo: e.consumo || "", regraFaturamento: e.faturamento || "", condicoes: e.faturamento || "",
    pendenciaCadastro: e.status || "", origem: "Planilha Empresas Conveniadas (Direção)",
  });
  idEmpresa.set(String(e.empresa).toUpperCase(), e.id);
}
console.log(`Empresas conveniadas: ${d.empresas_conveniadas.length}`);

// ---------------------------------------------------------------- contas a receber (títulos das empresas)
const acharEmpresa = (nome: string) => [...idEmpresa].find(([k]) => k.startsWith(nome.toUpperCase()))?.[1] ?? "";
let totalReceber = 0;
for (const r of d.contas_a_receber as any[]) {
  const empresaId = acharEmpresa(r.empresa);
  if (!empresaId) throw new Error(`Empresa "${r.empresa}" não está na lista de conveniadas.`);
  totalReceber += cent(r.valor);
  await g("boletos", r.id, {
    empresaId, documento: `NF ${r.nf}`, notaFiscal: String(r.nf), vencimento: r.venc || "", previsao: r.previsao || "",
    valor: cent(r.valor), formaCobranca: r.forma || "", situacaoDirecao: r.status || "",
    observacoes: [r.obs, r.conf].filter(Boolean).join(" · "), origem: "Contas a receber (Direção)",
  });
}
console.log(`Contas a receber: ${d.contas_a_receber.length} títulos, R$ ${(totalReceber / 100).toFixed(2)}`);

// ---------------------------------------------------------------- inconsistências de hospedagem
for (const p of d.inconsistencias_hospedagem as any[]) {
  await g("pendencias", p.id, {
    data: p.data || "", apto: p.apto || "", hospede: p.hospede || "", tipo: p.tipo || "", descricao: p.inconsistencia || "",
    solucao: p.solucao || "", responsavel: p.responsavel || "", prazo: p.prazo || "", decisao: p.decisao || "",
    status: p.status || "Aberta", observacoes: p.obs || "", origem: "Direção",
  });
}
console.log(`Pendências: ${d.inconsistencias_hospedagem.length}`);

// ---------------------------------------------------------------- folha do mês
let totalFolha = 0;
for (const f of d.folha_pagamento as any[]) {
  totalFolha += cent(f.salario);
  await g("folhaMes", f.id, {
    competencia: f.mes, nome: f.nome, funcao: f.funcao || "", vinculo: f.vinculo || "", telefone: f.telefone || "",
    valorSalario: cent(f.salario), valorProdutividade: cent(f.produtividade), formaProdutividade: f.forma_bonus || "",
    dataProdutividade: f.bonus_pag || "", situacaoProdutividade: f.bonus_status || "", valorTicket: cent(f.ticket),
    he50: f.he50 || "0:00", he100: f.he100 || "0:00", noturnas: f.noturnas || "0:00", atrasos: f.atrasos || "0:00", faltas: Number(f.faltas || 0),
    dataPagamento: f.pagamento || "", situacao: f.status || "", observacoes: f.obs || "", origem: "Folha de Pagamento (Direção)",
  });
}
console.log(`Folha: ${d.folha_pagamento.length} pessoas, salários R$ ${(totalFolha / 100).toFixed(2)}`);

// ---------------------------------------------------------------- tabela de diárias (na configuração do hotel)
const cfg = await consultar<{ dados: Record<string, unknown> }>(`SELECT dados FROM hotel_registros WHERE colecao = 'config' AND id = 'configHotel'`);
const tab = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, cent(v)]));
await g("config", "configHotel", { ...(cfg[0]?.dados ?? {}), tabelaDiarias: { padrao: tab(d.tabela_diarias.padrao), especial: tab(d.tabela_diarias.especial) } });
console.log("Tabela de diárias gravada.");

// ---------------------------------------------------------------- conferência da Direção nas contas a pagar
let anotadas = 0;
for (const c of d.contas_a_pagar as any[]) {
  if (!c.obs) continue;
  const n = await transacao(ator, async (q) => (await q.query(
    `UPDATE contas_pagar SET observacoes = observacoes || ' · Conferência da Direção (13/11): ' || $2
      WHERE observacoes ~ ('· ' || replace($1, '.', '\\.') || '( ·|$)') AND observacoes NOT LIKE '%Conferência da Direção%' RETURNING id`,
    [c.cp, c.obs])).rowCount ?? 0);
  anotadas += n;
}
console.log(`Contas a pagar anotadas com a conferência da Direção: ${anotadas}`);
await encerrar();
