/**
 * Hotel — importação do DataHotel para o banco.
 *
 * Fluxo: enviar arquivo → prévia gravada (lote PREVIA + linhas) → o usuário
 * confere → confirmar (grava hospedagens/recebimentos numa transação) ou
 * descartar. Linhas rejeitadas ficam em quarentena no lote e nunca viram
 * registro. O mesmo arquivo não é confirmado duas vezes (índice único).
 */
import type pg from "pg";
import { consultar, transacao, type Ator } from "./banco.js";
import {
  LAYOUTS, conferirTotais, lerCsv, lerRelatorioReservasDataHotel, lerXlsx, preverImportacao, sha256,
  type Conferencia,
  type LinhaBruta, type Registro, type TipoImportacao,
} from "../src/dominio/hotel/importacao.js";

function erro(status: number, mensagem: string): Error {
  const e = new Error(mensagem) as Error & { statusCode?: number };
  e.statusCode = status;
  return e;
}

export function tipoValido(t: string): t is TipoImportacao {
  return t === "hospedagens" || t === "recebimentos";
}

/** Campo do registro → coluna da tabela. */
const COLUNAS: Record<TipoImportacao, { tabela: string; campos: Record<string, string> }> = {
  hospedagens: {
    tabela: "hotel_hospedagens",
    campos: {
      hospede: "hospede", apartamento: "apartamento", checkin: "checkin",
      checkoutPrevisto: "checkout_previsto", checkoutReal: "checkout_real",
      adultos: "adultos", criancas: "criancas", valorDiaria: "valor_diaria_centavos",
      consumos: "consumos_centavos", descontos: "descontos_centavos", valorPago: "valor_pago_centavos",
      formaPagamento: "forma_pagamento", empresa: "empresa", cafeIncluido: "cafe_incluido",
      situacaoOrigem: "situacao_origem", hospedes: "total_hospedes", diarias: "diarias",
      valorTotal: "valor_total_centavos", canalVenda: "canal_venda", funcionario: "funcionario",
    },
  },
  recebimentos: {
    tabela: "hotel_recebimentos",
    campos: {
      data: "data", descricao: "descricao", pagador: "pagador", apartamento: "apartamento",
      reserva: "reserva", forma: "forma", bruto: "bruto_centavos", desconto: "desconto_centavos",
      taxa: "taxa_centavos", codigoTransacao: "codigo_transacao", bandeira: "bandeira",
      operadora: "operadora", parcelas: "parcelas",
    },
  },
};

async function unidadePadrao(): Promise<string> {
  const r = await consultar<{ id: string }>(
    `SELECT id FROM hotel_unidades WHERE ativo ORDER BY criado_em LIMIT 1`);
  const id = r[0]?.id;
  if (!id) throw erro(500, "Nenhuma unidade do hotel cadastrada.");
  return id;
}

/** Registros já gravados, no mesmo formato do `registro` da prévia. */
async function existentes(
  db: pg.PoolClient | null, tipo: TipoImportacao, unidadeId: string, origem: string, codigos: string[],
): Promise<Map<string, Registro & { __id: string }>> {
  const mapa = new Map<string, Registro & { __id: string }>();
  if (!codigos.length) return mapa;
  const { tabela, campos } = COLUNAS[tipo];
  const sel = Object.entries(campos).map(([k, col]) => {
    // datas voltam como texto ISO para comparar com o arquivo
    const exp = ["checkin", "checkout_previsto", "checkout_real", "data"].includes(col) ? `to_char(${col}, 'YYYY-MM-DD')` : col;
    return `${exp} AS "${k}"`;
  }).join(", ");
  const sql = `SELECT id AS "__id", codigo_origem AS "__codigo", ${sel}
                 FROM ${tabela} WHERE unidade_id = $1 AND origem = $2 AND codigo_origem = ANY($3)`;
  const rows = db ? (await db.query(sql, [unidadeId, origem, codigos])).rows : await consultar(sql, [unidadeId, origem, codigos]);
  for (const r of rows as Array<Record<string, unknown>>) {
    const reg: Registro & { __id: string } = { __id: String(r.__id) };
    for (const k of Object.keys(campos)) {
      const v = r[k];
      if (v === null || v === undefined) continue; // ausente = não comparar
      reg[k] = typeof v === "string" && /_centavos$/.test(campos[k] ?? "") ? Number(v) : (v as string | number | boolean);
    }
    mapa.set(String(r.__codigo), reg);
  }
  return mapa;
}

export interface EntradaArquivo {
  tipo: TipoImportacao;
  nome: string;
  buffer: Buffer;
  periodoInicio?: string | null;
  periodoFim?: string | null;
}

async function lerArquivo(nome: string, buffer: Buffer): Promise<{ formato: "CSV" | "XLSX"; colunas: string[]; linhas: LinhaBruta[]; conferencia?: Conferencia | null }> {
  const ehXlsx = /\.xlsx$/i.test(nome) || (buffer[0] === 0x50 && buffer[1] === 0x4b);
  if (ehXlsx) {
    try {
      return { formato: "XLSX", ...(await lerXlsx(buffer)) };
    } catch {
      throw erro(422, "Não consegui abrir este arquivo Excel. Confira se é .xlsx (não .xls antigo) e tente de novo.");
    }
  }
  if (/\.(xls|pdf)$/i.test(nome)) {
    throw erro(422, "Formato ainda não aceito. Exporte do DataHotel em .xlsx ou .csv.");
  }
  // CSV: tenta UTF-8; se vier com caractere inválido, lê como Latin-1 (Excel brasileiro).
  let texto = buffer.toString("utf8");
  if (texto.includes("�")) texto = buffer.toString("latin1");
  // Relatório de Reservas exportado do DataHotel: lido pelo conteúdo.
  const relatorio = lerRelatorioReservasDataHotel(texto);
  if (relatorio) return { formato: "CSV", ...relatorio };
  return { formato: "CSV", ...lerCsv(texto) };
}

/** Lê o arquivo, classifica e grava a prévia. Não altera hospedagens nem recebimentos. */
export async function criarPrevia(ator: Ator, entrada: EntradaArquivo): Promise<Record<string, unknown>> {
  const unidadeId = await unidadePadrao();
  const origem = "DATAHOTEL";
  const hash = sha256(entrada.buffer);
  const jaConfirmado = await consultar<{ id: string; confirmado_em: string }>(
    `SELECT id, to_char(confirmado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS confirmado_em
       FROM hotel_import_lotes
      WHERE unidade_id = $1 AND tipo = $2 AND arquivo_sha256 = $3 AND situacao = 'CONFIRMADO'`,
    [unidadeId, entrada.tipo, hash]);
  if (jaConfirmado[0]) {
    throw erro(409, `Este mesmo arquivo já foi importado em ${jaConfirmado[0].confirmado_em}. Nada foi alterado.`);
  }
  const lido = await lerArquivo(entrada.nome, entrada.buffer);
  const codigos = [...new Set(lido.linhas.map((l) => {
    for (const c of LAYOUTS[entrada.tipo].codigo) if (l[c]) return l[c].trim();
    return "";
  }).filter(Boolean))];
  const atuais = await existentes(null, entrada.tipo, unidadeId, origem, codigos);
  const erroArquivo = lido.conferencia !== undefined ? conferirTotais(lido.linhas, lido.conferencia) : null;
  const previa = preverImportacao(entrada.tipo, lido.colunas, lido.linhas, atuais, erroArquivo);

  return transacao(ator, async (db) => {
    const lote = await db.query<{ id: string }>(
      `INSERT INTO hotel_import_lotes
         (unidade_id, tipo, origem, layout_versao, arquivo_nome, arquivo_formato, arquivo_sha256,
          periodo_inicio, periodo_fim, qtd_total, qtd_novo, qtd_atualizado, qtd_identico, qtd_rejeitado,
          erro_geral, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [unidadeId, entrada.tipo, origem, previa.layoutVersao, entrada.nome.slice(0, 200), lido.formato, hash,
        entrada.periodoInicio || null, entrada.periodoFim || null,
        previa.resumo.total, previa.resumo.novo, previa.resumo.atualizado, previa.resumo.identico, previa.resumo.rejeitado,
        previa.erroGeral, ator.userId]);
    const loteId = lote.rows[0]!.id;
    // Grava as linhas em blocos para não estourar o limite de parâmetros.
    const BLOCO = 500;
    for (let i = 0; i < previa.itens.length; i += BLOCO) {
      const parte = previa.itens.slice(i, i + BLOCO);
      const vals: unknown[] = [];
      const tuplas = parte.map((it, j) => {
        const b = j * 8;
        vals.push(loteId, it.numeroLinha, it.codigo, JSON.stringify(it.dadosBrutos),
          it.registro ? JSON.stringify(it.registro) : null, it.situacao, it.problemas, it.camposAlterados);
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4}::jsonb,$${b + 5}::jsonb,$${b + 6},$${b + 7}::text[],$${b + 8}::text[])`;
      });
      await db.query(
        `INSERT INTO hotel_import_linhas
           (lote_id, numero_linha, codigo_origem, dados_brutos, registro, situacao, problemas, campos_alterados)
         VALUES ${tuplas.join(",")}`, vals);
    }
    return {
      loteId, tipo: entrada.tipo, formato: lido.formato, layoutVersao: previa.layoutVersao,
      erroGeral: previa.erroGeral, resumo: previa.resumo,
      // Na resposta vão só as linhas que pedem atenção e uma amostra das novas.
      rejeitadas: previa.itens.filter((i) => i.situacao === "REJEITADO").slice(0, 200)
        .map((i) => ({ linha: i.numeroLinha, codigo: i.codigo, problemas: i.problemas })),
      atualizadas: previa.itens.filter((i) => i.situacao === "ATUALIZADO").slice(0, 200)
        .map((i) => ({ linha: i.numeroLinha, codigo: i.codigo, campos: i.camposAlterados })),
      amostraNovas: previa.itens.filter((i) => i.situacao === "NOVO").slice(0, 20)
        .map((i) => ({ linha: i.numeroLinha, codigo: i.codigo, registro: i.registro })),
    };
  });
}

/**
 * Confirma a prévia. Reclassifica dentro da transação (com trava no lote),
 * porque entre a prévia e a confirmação outro lote pode ter gravado.
 */
export async function confirmar(ator: Ator, loteId: string): Promise<Record<string, unknown>> {
  return transacao(ator, async (db) => {
    const r = await db.query<{
      id: string; unidade_id: string; tipo: string; origem: string; situacao: string;
      erro_geral: string | null; arquivo_sha256: string;
    }>(`SELECT id, unidade_id, tipo, origem, situacao, erro_geral, arquivo_sha256
          FROM hotel_import_lotes WHERE id = $1 FOR UPDATE`, [loteId]);
    const lote = r.rows[0];
    if (!lote) throw erro(404, "Importação não encontrada.");
    if (lote.situacao !== "PREVIA") throw erro(409, `Esta importação já está ${lote.situacao === "CONFIRMADO" ? "confirmada" : "descartada"}.`);
    if (lote.erro_geral) throw erro(422, `${lote.erro_geral} Corrija o arquivo e envie de novo.`);
    if (!tipoValido(lote.tipo)) throw erro(422, "Tipo de importação desconhecido.");
    const tipo = lote.tipo;
    const dup = await db.query(
      `SELECT 1 FROM hotel_import_lotes WHERE unidade_id = $1 AND tipo = $2 AND arquivo_sha256 = $3 AND situacao = 'CONFIRMADO'`,
      [lote.unidade_id, tipo, lote.arquivo_sha256]);
    if (dup.rowCount) throw erro(409, "Este mesmo arquivo já foi importado. Nada foi alterado.");

    const linhas = await db.query<{ id: string; codigo_origem: string; registro: Registro }>(
      `SELECT id, codigo_origem, registro FROM hotel_import_linhas
        WHERE lote_id = $1 AND situacao <> 'REJEITADO' ORDER BY numero_linha`, [loteId]);
    const atuais = await existentes(db, tipo, lote.unidade_id, lote.origem, linhas.rows.map((l) => l.codigo_origem));
    const { tabela, campos } = COLUNAS[tipo];
    const cont = { novo: 0, atualizado: 0, identico: 0 };

    for (const l of linhas.rows) {
      const reg = l.registro;
      const atual = atuais.get(l.codigo_origem);
      const chaves = Object.keys(reg).filter((k) => campos[k]);
      if (tipo === "recebimentos" && !atual) {
        // líquido é derivado; desconto e taxa ausentes valem zero
        const bruto = Number(reg.bruto ?? 0), desc = Number(reg.desconto ?? 0), taxa = Number(reg.taxa ?? 0);
        const cols = [...chaves.map((k) => campos[k]!), "liquido_centavos"];
        const vals = [...chaves.map((k) => reg[k]), bruto - desc - taxa];
        const ins = await db.query<{ id: string }>(
          `INSERT INTO ${tabela} (unidade_id, origem, codigo_origem, lote_id, ${cols.join(", ")})
           VALUES ($1,$2,$3,$4, ${cols.map((_, i) => `$${i + 5}`).join(", ")}) RETURNING id`,
          [lote.unidade_id, lote.origem, l.codigo_origem, loteId, ...vals]);
        await db.query(`UPDATE hotel_import_linhas SET situacao = 'NOVO', registro_id = $2 WHERE id = $1`, [l.id, ins.rows[0]!.id]);
        cont.novo++;
        continue;
      }
      if (!atual) {
        const cols = chaves.map((k) => campos[k]!);
        const ins = await db.query<{ id: string }>(
          `INSERT INTO ${tabela} (unidade_id, origem, codigo_origem, lote_id, ${cols.join(", ")})
           VALUES ($1,$2,$3,$4, ${cols.map((_, i) => `$${i + 5}`).join(", ")}) RETURNING id`,
          [lote.unidade_id, lote.origem, l.codigo_origem, loteId, ...chaves.map((k) => reg[k])]);
        await db.query(`UPDATE hotel_import_linhas SET situacao = 'NOVO', registro_id = $2 WHERE id = $1`, [l.id, ins.rows[0]!.id]);
        cont.novo++;
        continue;
      }
      const mudou = chaves.filter((k) => atual[k] !== reg[k]);
      if (!mudou.length) {
        await db.query(`UPDATE hotel_import_linhas SET situacao = 'IDENTICO', campos_alterados = '{}', registro_id = $2 WHERE id = $1`, [l.id, atual.__id]);
        cont.identico++;
        continue;
      }
      // Atualização é MERGE: só os campos que vieram no arquivo; o valor
      // anterior fica na trilha de auditoria (trigger).
      const sets = mudou.map((k, i) => `${campos[k]} = $${i + 2}`);
      if (tipo === "recebimentos") {
        sets.push(`liquido_centavos = ${["bruto", "desconto", "taxa"].map((k) => {
          const i = mudou.indexOf(k);
          const col = campos[k]!;
          return i >= 0 ? `$${i + 2}::bigint` : col;
        }).join(" - ")}`);
      }
      await db.query(`UPDATE ${tabela} SET ${sets.join(", ")}, lote_id = $${mudou.length + 2} WHERE id = $1`,
        [atual.__id, ...mudou.map((k) => reg[k]), loteId]);
      await db.query(`UPDATE hotel_import_linhas SET situacao = 'ATUALIZADO', campos_alterados = $3, registro_id = $2 WHERE id = $1`,
        [l.id, atual.__id, mudou]);
      cont.atualizado++;
    }

    if (tipo === "hospedagens") {
      // Situação interna a partir da situação do DataHotel.
      await db.query(
        `UPDATE hotel_hospedagens SET situacao = CASE
            WHEN situacao_origem ILIKE 'cancel%' THEN 'CANCELADA'
            WHEN situacao_origem ILIKE 'checked-out%' THEN 'ENCERRADA'
            ELSE 'ATIVA' END
          WHERE lote_id = $1`, [loteId]);
    }
    const rej = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM hotel_import_linhas WHERE lote_id = $1 AND situacao = 'REJEITADO'`, [loteId]);
    await db.query(
      `UPDATE hotel_import_lotes
          SET situacao = 'CONFIRMADO', confirmado_por = $2, confirmado_em = now(),
              qtd_novo = $3, qtd_atualizado = $4, qtd_identico = $5, qtd_rejeitado = $6
        WHERE id = $1`,
      [loteId, ator.userId, cont.novo, cont.atualizado, cont.identico, rej.rows[0]!.n]);
    return { loteId, situacao: "CONFIRMADO", ...cont, rejeitado: rej.rows[0]!.n };
  });
}

export async function descartar(ator: Ator, loteId: string): Promise<{ loteId: string; situacao: string }> {
  return transacao(ator, async (db) => {
    const r = await db.query(
      `UPDATE hotel_import_lotes SET situacao = 'DESCARTADO' WHERE id = $1 AND situacao = 'PREVIA' RETURNING id`, [loteId]);
    if (!r.rowCount) throw erro(409, "Só uma prévia ainda não confirmada pode ser descartada.");
    return { loteId, situacao: "DESCARTADO" };
  });
}

export async function listarLotes(): Promise<Record<string, unknown>[]> {
  return consultar(
    `SELECT l.id, l.tipo, l.arquivo_nome AS "arquivo", l.arquivo_formato AS "formato", l.situacao,
            l.qtd_total AS "total", l.qtd_novo AS "novo", l.qtd_atualizado AS "atualizado",
            l.qtd_identico AS "identico", l.qtd_rejeitado AS "rejeitado", l.erro_geral AS "erroGeral",
            l.criado_em AS "criadoEm", u.nome AS "criadoPor", l.confirmado_em AS "confirmadoEm", c.nome AS "confirmadoPor"
       FROM hotel_import_lotes l
       LEFT JOIN users u ON u.id = l.criado_por
       LEFT JOIN users c ON c.id = l.confirmado_por
      ORDER BY l.criado_em DESC LIMIT 100`);
}

export async function linhasDoLote(loteId: string, situacao?: string): Promise<Record<string, unknown>[]> {
  return consultar(
    `SELECT numero_linha AS "linha", codigo_origem AS "codigo", situacao, problemas,
            campos_alterados AS "camposAlterados", dados_brutos AS "dados"
       FROM hotel_import_linhas
      WHERE lote_id = $1 AND ($2::text IS NULL OR situacao = $2)
      ORDER BY numero_linha LIMIT 2000`, [loteId, situacao ?? null]);
}

/** Data da última importação confirmada de cada tipo (para o aviso de dado desatualizado). */
export async function ultimaImportacao(): Promise<Record<string, string | null>> {
  const r = await consultar<{ tipo: string; em: string }>(
    `SELECT tipo, max(confirmado_em) AS em FROM hotel_import_lotes WHERE situacao = 'CONFIRMADO' GROUP BY tipo`);
  const out: Record<string, string | null> = { hospedagens: null, recebimentos: null };
  for (const x of r) out[x.tipo] = x.em;
  return out;
}
