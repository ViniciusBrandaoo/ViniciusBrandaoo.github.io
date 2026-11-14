/**
 * Verificação de saúde do Acácia Hotel (roda dentro do servidor, só leitura):
 *   node --import tsx scripts/verificar-producao.mts
 * Chama as mesmas funções que as telas chamam e cruza os totais do banco com os
 * relatórios gravados na última conferência. Não grava nada.
 */
import { consultar, encerrar } from "../servidor/banco.js";
import * as conferencia from "../servidor/hotel-conferencia.js";
import * as dados from "../servidor/hotel-dados.js";
import * as hotel from "../servidor/hotel.js";
import { listarContasPagar, listarFornecedores, listarUsuariosAcesso } from "../servidor/repositorio.js";

let falhas = 0;
const ok = (nome: string, cond: boolean, detalhe = "") => { if (!cond) falhas++; console.log(`${cond ? "OK   " : "FALHA"} ${nome}${detalhe ? " — " + detalhe : ""}`); };
const tenta = async <T>(nome: string, f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch (e) { ok(nome, false, (e as Error).message); return null; } };
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");
const texto = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

// ---------------------------------------------------------------- telas: carga de dados por perfil
for (const perfis of [["DIRECAO"], ["FINANCEIRO"], ["RECEPCAO"], ["GOVERNANCA"], ["RH"], ["CONSULTA"]]) {
  const r = await tenta(`carga das telas (${perfis[0]})`, () => dados.carregar(perfis));
  if (r) ok(`carga das telas (${perfis[0]})`, true, Object.entries((r.colecoes ?? {}) as Record<string, unknown[]>).map(([k, v]) => `${k}:${v.length}`).join(" "));
}
const carga = ((await dados.carregar(["DIRECAO", "RH"])) as { colecoes: Record<string, any[]> }).colecoes;
const contas = await tenta("contas a pagar", listarContasPagar);
const forn = await tenta("fornecedores", listarFornecedores);
const usuarios = await tenta("usuários", listarUsuariosAcesso);
const lotes = await tenta("importações (lotes)", hotel.listarLotes);
const ultimaImp = await tenta("última importação", hotel.ultimaImportacao);
if (contas) ok("contas a pagar", contas.length > 0, `${contas.length} contas`);
if (forn) ok("fornecedores", forn.length > 0, `${forn.length} fornecedores`);
if (usuarios) ok("usuários", usuarios.length > 0, `${usuarios.length} usuário(s)`);
if (lotes) ok("importações (lotes)", lotes.length > 0, `${lotes.length} lotes; última: ${JSON.stringify(ultimaImp)}`);

// ---------------------------------------------------------------- conferência e relatórios gravados
const lista = await tenta("lista de conferências", conferencia.listar);
const alerta = await tenta("alerta do dia", conferencia.alertaDoDia);
if (alerta) ok("alerta do dia", true, `feita hoje: ${alerta.feitaHoje}; divergentes: ${alerta.divergentes}`);
const ult = lista?.[0] as Record<string, any> | undefined;
ok("existe conferência gravada", !!ult, ult ? `${ult.inicio} a ${ult.fim}` : "");
const c = ult ? ((await tenta("abrir a última conferência", () => conferencia.obter(String(ult.id)))) as Record<string, any> | null) : null;
const rels: { nome: string; titulo: string; html: string }[] = c?.relatorios ?? [];
ok("5 relatórios gravados", rels.length === 5, rels.map((r) => `${r.nome} ${Math.round(r.html.length / 1024)}KB`).join(", "));
const T: Record<string, string> = Object.fromEntries(rels.map((r) => [r.nome, texto(r.html)]));
const tem = (rel: string, trechos: string[]) => { const t = T[rel] ?? ""; const faltam = trechos.filter((x) => !t.includes(x)); ok(`relatório ${rel}: seções`, faltam.length === 0, faltam.length ? "faltam: " + faltam.join(" | ") : `${trechos.length} seções`); };
tem("1_resumo_executivo", ["Resumo executivo", "O que precisa de decisão", "Como estão as contas"]);
tem("2_conferencia_do_fechamento", ["O que foi conferido e bate"]);
tem("3_financeiro", ["Recebido por dia", "Recebido por forma de pagamento", "Conciliação bancária", "Cada saída, com o favorecido", "Saldos do extrato", "Contas a pagar", "Empresas a receber", "Contas fixas e variáveis", "Fechamentos de caixa", "Caixa da recepção dia a dia", "Receita lançada por dia", "Faturado por empresa", "Previsão de recebimento"]);
tem("4_hospedagem_e_operacao", ["Ocupação por noite", "Café da manhã", "Extrato das hospedagens", "Frigobar e balcão", "Pendências de hospedagem", "Funcionários e folha"]);
tem("5_itens_pedidos", ["Checklist", "Extrato diário de hospedagem", "Fechamento do mês"]);
for (const r of rels) ok(`relatório ${r.nome}: marca nova`, r.html.includes("Acácia Hotel") && !r.html.includes("Gestão 360") && !r.html.includes("#0B2547"));

// ---------------------------------------------------------------- cruzamento banco × relatório (período da conferência)
if (c) {
  const ini = String(c.inicio).slice(0, 10), fim = String(c.fim).slice(0, 10);
  const [rec] = await consultar<{ n: number; total: string }>(
    `SELECT count(*)::int n, coalesce(sum(bruto_centavos),0) total FROM hotel_recebimentos WHERE ausente_na_origem_desde IS NULL AND data BETWEEN $1 AND $2`, [ini, fim]);
  const total = Number(rec!.total);
  ok("recebido no banco aparece no Resumo", (T["1_resumo_executivo"] ?? "").includes(brl(total)), `${rec!.n} recebimentos, ${brl(total)}`);
  ok("recebido no banco aparece no Financeiro", (T["3_financeiro"] ?? "").includes(brl(total)));
  const porForma = await consultar<{ forma: string; total: string }>(
    `SELECT forma, sum(bruto_centavos) total FROM hotel_recebimentos WHERE ausente_na_origem_desde IS NULL AND data BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 2 DESC`, [ini, fim]);
  for (const f of porForma) ok(`forma ${f.forma} no Financeiro`, (T["3_financeiro"] ?? "").includes(brl(Number(f.total))), brl(Number(f.total)));
  const soma = porForma.reduce((a, f) => a + Number(f.total), 0);
  ok("soma das formas = total recebido", soma === total, `${brl(soma)} = ${brl(total)}`);
  const cp = (contas ?? []) as Record<string, any>[];
  const aPagar = cp.filter((x) => !["PAGO", "CANCELADO"].includes(x.status)).reduce((a, x) => a + Number(x.valor), 0);
  ok("contas em aberto no Financeiro", (T["3_financeiro"] ?? "").includes(brl(aPagar)), brl(aPagar));
  const [pg] = await consultar<{ t: string }>(`SELECT coalesce(sum(valor_centavos),0) t FROM pagamentos`);
  ok("total pago (com juros) no Financeiro", (T["3_financeiro"] ?? "").includes(brl(Number(pg!.t))), brl(Number(pg!.t)));
  const receber = (carga.boletos ?? []).reduce((a, b: any) => a + (b.valor ?? 0) - (b.valorPago ?? 0), 0);
  ok("empresas a receber no Financeiro", (T["3_financeiro"] ?? "").includes(brl(receber)), `${(carga.boletos ?? []).length} títulos, ${brl(receber)}`);
  const pend = (carga.pendencias ?? []).filter((p: any) => p.status !== "Resolvida");
  ok("pendências abertas no relatório 4", pend.every((p: any) => (T["4_hospedagem_e_operacao"] ?? "").includes(String(p.tipo))), `${pend.length} pendências`);
  const folha = carga.folhaMes ?? [];
  ok("folha no relatório 4", folha.length > 0 && folha.every((f: any) => (T["4_hospedagem_e_operacao"] ?? "").includes(String(f.nome).replace(/\s+/g, " ").trim())), `${folha.length} pessoas`);
  ok("resumo da conferência", Number(c.ok) > 0, `${c.ok} batem, ${c.divergentes} divergentes, ${c.atencao} atenção`);
  const div = ((Array.isArray(c.resultado) ? c.resultado : c.resultado?.resultados) ?? []).filter((r: any) => r.situacao === "DIVERGENTE").map((r: any) => `${r.regra} ${r.titulo}`);
  console.log("      divergências atuais: " + (div.join("; ") || "nenhuma"));
}

// ---------------------------------------------------------------- integridade
const [dup] = await consultar<{ n: number }>(`SELECT count(*)::int n FROM (SELECT codigo_origem FROM hotel_recebimentos GROUP BY 1 HAVING count(*) > 1) x`);
ok("recebimentos sem duplicidade", dup!.n === 0);
const [dupH] = await consultar<{ n: number }>(`SELECT count(*)::int n FROM (SELECT codigo_origem FROM hotel_hospedagens GROUP BY 1 HAVING count(*) > 1) x`);
ok("hospedagens sem duplicidade", dupH!.n === 0);
const [antes] = await consultar<{ n: number }>(`SELECT count(*)::int n FROM hotel_recebimentos WHERE data < '2026-10-26'`);
ok("nenhum recebimento anterior a 26/10", antes!.n === 0);
const [orf] = await consultar<{ n: number }>(`SELECT count(*)::int n FROM contas_pagar cp WHERE status = 'PAGO' AND NOT EXISTS (SELECT 1 FROM pagamentos p WHERE p.conta_id = cp.id)`);
ok("toda conta paga tem pagamento", orf!.n === 0);
const [mig] = await consultar<{ n: number }>(`SELECT count(*)::int n FROM information_schema.tables WHERE table_name IN ('convites_acesso','hotel_conferencias','hotel_registros')`);
ok("tabelas das últimas migrações existem", mig!.n === 3);

console.log(`\n${falhas === 0 ? "TUDO CERTO" : falhas + " FALHA(S)"}`);
await encerrar();
