/**
 * Hotel — conferência automática do fechamento (servidor).
 *
 * Recebe os CSVs exportados do DataHotel, reconhece cada relatório pelo título,
 * roda as regras de src/dominio/hotel/conferencia.ts e guarda o resultado.
 * Não altera nada além de gravar o próprio histórico.
 */
import { consultar, transacao, type Ator } from "./banco.js";
import { montarDados } from "../src/dominio/hotel/conferencia-arquivos.js";
import { conferir, resumo, type Resultado } from "../src/dominio/hotel/conferencia.js";
import { sha256 } from "../src/dominio/hotel/importacao.js";
import { reconhecer } from "../src/dominio/hotel/conferencia-arquivos.js";
import { gerarRelatorios, type ContaRelatorio, type ExtrasRelatorio } from "../src/dominio/hotel/relatorios.js";
import type { Fonte } from "../src/dominio/hotel/conferencia.js";

function erro(status: number, mensagem: string): Error {
  const e = new Error(mensagem) as Error & { statusCode?: number };
  e.statusCode = status;
  return e;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dataValida = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(s));
const hojeSP = (): string => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function unidadePadrao(): Promise<string> {
  const r = await consultar<{ id: string }>(`SELECT id FROM hotel_unidades WHERE ativo ORDER BY criado_em LIMIT 1`);
  if (!r[0]) throw erro(500, "Nenhuma unidade do hotel cadastrada.");
  return r[0].id;
}

export interface ArquivoEnviado { nome: string; buffer: Buffer }

function texto(b: Buffer): string {
  let t = b.toString("utf8");
  if (t.includes("�")) t = b.toString("latin1");
  return t;
}

export async function executar(ator: Ator, arquivos: ArquivoEnviado[], inicio: string, fim: string): Promise<Record<string, unknown>> {
  if (!arquivos.length) throw erro(400, "Envie os relatórios exportados do DataHotel (.csv).");
  if (arquivos.length > 30) throw erro(400, "No máximo 30 arquivos por conferência.");
  if (!dataValida(inicio) || !dataValida(fim)) throw erro(400, "Informe o período da conferência (início e fim).");
  if (fim < inicio) throw erro(400, "O fim do período não pode ser antes do início.");
  for (const a of arquivos) {
    if (!/\.(csv|txt)$/i.test(a.nome)) throw erro(422, `"${a.nome}" não é .csv. Exporte do DataHotel em Ficheiro CSV (extrato do banco: .txt).`);
  }
  const textos = arquivos.map((a) => ({ nome: a.nome, texto: texto(a.buffer) }));
  const m = montarDados(textos, inicio, fim, fim > hojeSP() ? hojeSP() : fim);
  if (!m.reconhecidos.length) throw erro(422, "Nenhum dos arquivos é um relatório que a conferência conhece. Confira se exportou do DataHotel em CSV.");
  const resultados: Resultado[] = conferir(m.dados);
  const r = resumo(resultados);
  // Os 5 relatórios da Direção saem dos mesmos arquivos (o mais recente de cada relatório vale).
  const porFonte = new Map<Fonte, string>();
  for (const t of [...textos].sort((a, b) => a.nome.localeCompare(b.nome))) { const f = reconhecer(t.texto); if (f) porFonte.set(f, t.texto); }
  const contas = await contasParaRelatorio();
  const extras = await extrasParaRelatorio();
  const relatorios = gerarRelatorios({ texto: (f) => porFonte.get(f) ?? null, conf: { inicio, fim, resumo: r, resultados }, inicio, fim, hoje: hojeSP(), contas, extras });
  const unidadeId = await unidadePadrao();
  const lista = arquivos.map((a) => ({
    nome: a.nome.slice(0, 200), sha256: sha256(a.buffer),
    relatorio: m.reconhecidos.find((x) => x.nome === a.nome)?.fonte ?? null,
  }));
  return transacao(ator, async (db) => {
    const ins = await db.query<{ id: string; criado_em: string }>(
      `INSERT INTO hotel_conferencias
         (unidade_id, periodo_inicio, periodo_fim, arquivos, resultado, qtd_ok, qtd_divergente, qtd_atencao, criado_por, relatorios)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10::jsonb) RETURNING id, criado_em`,
      [unidadeId, inicio, fim, JSON.stringify(lista), JSON.stringify(resultados), r.ok, r.divergentes, r.atencao, ator.userId, JSON.stringify(relatorios)]);
    return {
      id: ins.rows[0]!.id, criadoEm: ins.rows[0]!.criado_em, inicio, fim, resumo: r, resultados,
      naoReconhecidos: m.naoReconhecidos, erros: m.erros, relatorios,
    };
  });
}

export async function listar(): Promise<Record<string, unknown>[]> {
  return consultar(
    `SELECT c.id, to_char(c.periodo_inicio,'YYYY-MM-DD') AS inicio, to_char(c.periodo_fim,'YYYY-MM-DD') AS fim,
            c.qtd_ok AS "ok", c.qtd_divergente AS "divergentes", c.qtd_atencao AS "atencao",
            c.criado_em AS "criadoEm", u.nome AS "criadoPor",
            to_char(c.criado_em AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS "diaCriado"
       FROM hotel_conferencias c LEFT JOIN users u ON u.id = c.criado_por
      ORDER BY c.criado_em DESC LIMIT 60`);
}

export async function obter(id: string): Promise<Record<string, unknown>> {
  const r = await consultar<Record<string, unknown>>(
    `SELECT c.id, to_char(c.periodo_inicio,'YYYY-MM-DD') AS inicio, to_char(c.periodo_fim,'YYYY-MM-DD') AS fim,
            c.arquivos, c.resultado, c.relatorios, c.qtd_ok AS "ok", c.qtd_divergente AS "divergentes", c.qtd_atencao AS "atencao",
            c.criado_em AS "criadoEm", u.nome AS "criadoPor"
       FROM hotel_conferencias c LEFT JOIN users u ON u.id = c.criado_por WHERE c.id = $1`, [id]);
  if (!r[0]) throw erro(404, "Conferência não encontrada.");
  return r[0];
}

/** Alerta do dia: já houve conferência hoje? Quantas divergências na última? */
export async function alertaDoDia(): Promise<{ hoje: string; feitaHoje: boolean; ultima: Record<string, unknown> | null; divergentes: number }> {
  const hoje = hojeSP();
  const l = await listar();
  const ultima = l[0] ?? null;
  return {
    hoje, feitaHoje: !!ultima && ultima.diaCriado === hoje, ultima,
    divergentes: ultima ? Number(ultima.divergentes) : 0,
  };
}

/** Contas a pagar lançadas no Hotel 360, no formato dos relatórios da Direção. */
export async function contasParaRelatorio(): Promise<ContaRelatorio[]> {
  const linhas = await consultar<Record<string, unknown>>(`
    SELECT cp.descricao, f.razao_social AS fornecedor, cat.nome AS categoria, to_char(cp.vencimento,'YYYY-MM-DD') AS vencimento,
           cp.valor_centavos::int AS valor, cp.status, cp.competencia::text AS competencia,
           (SELECT sum(p.valor_centavos)::int FROM pagamentos p WHERE p.conta_id = cp.id) AS pago,
           (SELECT to_char(max(p.data_pagamento),'YYYY-MM-DD') FROM pagamentos p WHERE p.conta_id = cp.id) AS "dataPagamento"
      FROM contas_pagar cp JOIN categorias_financeiras cat ON cat.id = cp.categoria_id LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id`);
  return linhas as unknown as ContaRelatorio[];
}

/** Empresas a receber, pendências e folha lançadas no Hotel 360, para os relatórios. */
export async function extrasParaRelatorio(): Promise<ExtrasRelatorio> {
  const reg = await consultar<{ colecao: string; dados: Record<string, any> }>(
    `SELECT colecao, dados FROM hotel_registros WHERE NOT excluido AND colecao IN ('empresas','boletos','pendencias','folhaMes')`);
  const de = (c: string) => reg.filter((r) => r.colecao === c).map((r) => r.dados);
  const ids = await consultar<{ id: string; dados: Record<string, any> }>(`SELECT id, dados FROM hotel_registros WHERE colecao = 'empresas' AND NOT excluido`);
  const nomeEmp = new Map(ids.map((x) => [x.id, String(x.dados.nomeFantasia || x.dados.razaoSocial || "")]));
  const boletos = await consultar<{ dados: Record<string, any> }>(`SELECT dados FROM hotel_registros WHERE colecao = 'boletos' AND NOT excluido`);
  return {
    receber: boletos.map((b) => b.dados).filter((b) => (b.valorPago ?? 0) < (b.valor ?? 0) && b.status !== "CANCELADO")
      .map((b) => ({ empresa: nomeEmp.get(b.empresaId) ?? "", nf: String(b.notaFiscal ?? ""), vencimento: b.vencimento ?? "", previsao: b.previsao ?? "", valor: (b.valor ?? 0) - (b.valorPago ?? 0), forma: b.formaCobranca ?? "", observacoes: b.observacoes ?? "" })),
    pendencias: de("pendencias") as ExtrasRelatorio["pendencias"],
    folha: de("folhaMes") as ExtrasRelatorio["folha"],
    recorrentes: (await consultar<{ dados: Record<string, any> }>(`SELECT dados FROM hotel_registros WHERE colecao = 'contasRecorrentes' AND NOT excluido`)).map((r) => r.dados) as ExtrasRelatorio["recorrentes"],
    empresas: { total: ids.length, incompletas: ids.filter((x) => x.dados.pendenciaCadastro && x.dados.pendenciaCadastro !== "Completo").length },
  };
}
