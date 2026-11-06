/**
 * Hotel — leitura e gravação de todas as áreas no banco (tabela hotel_registros).
 *
 * Hospedagens e recebimentos importados (032) são a base; o que a equipe
 * corrige vira complemento com o mesmo id e é sobreposto na leitura. O dado
 * importado nunca é alterado por aqui.
 */
import type pg from "pg";
import { consultar, transacao, type Ator } from "./banco.js";
import {
  COLECOES, colecaoValida, complementoDe, conferirTrava, podeGravar, podeLer, validarDados,
  type Colecao, type Dados,
} from "../src/dominio/hotel/registros.js";

function erro(status: number, mensagem: string): Error {
  const e = new Error(mensagem) as Error & { statusCode?: number };
  e.statusCode = status;
  return e;
}

async function unidadePadrao(): Promise<string> {
  const r = await consultar<{ id: string }>(`SELECT id FROM hotel_unidades WHERE ativo ORDER BY criado_em LIMIT 1`);
  if (!r[0]) throw erro(500, "Nenhuma unidade do hotel cadastrada.");
  return r[0].id;
}

const n = (v: unknown): number | undefined => (v === null || v === undefined ? undefined : Number(v));
const limpar = (o: Dados): Dados => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));

/** Hospedagens importadas no formato que as telas usam. */
type Consulta = (sql: string, p: unknown[]) => Promise<Array<Record<string, unknown>>>;
const pelaPool: Consulta = (sql, p) => consultar<Record<string, unknown>>(sql, p);
const peloCliente = (db: pg.PoolClient): Consulta => async (sql, p) => (await db.query(sql, p)).rows as Array<Record<string, unknown>>;

/** `id` limita a um registro (usado dentro da transação de gravação). */
async function hospedagensImportadas(q: Consulta, unidadeId: string, id?: string): Promise<Map<string, Dados>> {
  const rows = await q(
    `SELECT id, origem, codigo_origem, apartamento, hospede, empresa,
            to_char(checkin,'YYYY-MM-DD') AS checkin, to_char(checkout_previsto,'YYYY-MM-DD') AS checkout,
            to_char(checkout_real,'YYYY-MM-DD') AS checkout_real, adultos, criancas, cafe_incluido,
            valor_diaria_centavos, consumos_centavos, descontos_centavos, valor_pago_centavos,
            forma_pagamento, situacao_origem, situacao
       FROM hotel_hospedagens WHERE unidade_id = $1 AND ($2::uuid IS NULL OR id = $2::uuid)`, [unidadeId, id ?? null]);
  const m = new Map<string, Dados>();
  for (const r of rows) {
    m.set(String(r.id), limpar({
      id: r.id, origem: r.origem, codigoOrigem: r.codigo_origem, importado: true,
      apartamento: r.apartamento, hospede: r.hospede, empresa: r.empresa,
      checkin: r.checkin, checkout: r.checkout, checkoutRealizado: r.checkout_real,
      adultos: r.adultos, criancas: r.criancas, cafeIncluido: r.cafe_incluido,
      valorDiaria: n(r.valor_diaria_centavos), consumos: n(r.consumos_centavos), descontos: n(r.descontos_centavos),
      valorPago: n(r.valor_pago_centavos), formaPagamento: r.forma_pagamento, situacaoOrigem: r.situacao_origem,
      status: r.situacao === "CANCELADA" ? "CANCELADA" : undefined,
    }));
  }
  return m;
}

async function recebimentosImportados(q: Consulta, unidadeId: string, id?: string): Promise<Map<string, Dados>> {
  const rows = await q(
    `SELECT id, origem, codigo_origem, to_char(data,'YYYY-MM-DD') AS data, descricao, pagador, apartamento, reserva,
            forma, bruto_centavos, desconto_centavos, taxa_centavos, parcelas, codigo_transacao, bandeira, operadora, situacao
       FROM hotel_recebimentos WHERE unidade_id = $1 AND ($2::uuid IS NULL OR id = $2::uuid)`, [unidadeId, id ?? null]);
  const m = new Map<string, Dados>();
  for (const r of rows) {
    m.set(String(r.id), limpar({
      id: r.id, origem: r.origem, codigoOrigem: r.codigo_origem, importado: true,
      data: r.data, descricao: r.descricao, pagador: r.pagador, apartamento: r.apartamento, reserva: r.reserva,
      forma: r.forma, valorBruto: n(r.bruto_centavos), desconto: n(r.desconto_centavos), taxa: n(r.taxa_centavos),
      parcelas: r.parcelas, codigoTransacao: r.codigo_transacao, bandeira: r.bandeira, operadora: r.operadora,
      status: r.situacao === "CANCELADO" || r.situacao === "ESTORNADO" ? r.situacao : undefined,
    }));
  }
  return m;
}

async function baseImportada(q: Consulta, unidadeId: string, colecao: Colecao, id?: string): Promise<Map<string, Dados> | null> {
  if (colecao === "hospedagens") return hospedagensImportadas(q, unidadeId, id);
  if (colecao === "recebimentos") return recebimentosImportados(q, unidadeId, id);
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tudo que o perfil pode ver, por coleção, com a versão de cada registro. */
export async function carregar(perfis: readonly string[]): Promise<Record<string, unknown>> {
  const unidadeId = await unidadePadrao();
  const visiveis = (Object.keys(COLECOES) as Colecao[]).filter((c) => podeLer(perfis, c));
  const rows = await consultar<{ colecao: Colecao; id: string; dados: Dados; versao: number; complemento: boolean }>(
    `SELECT colecao, id, dados, versao, complemento FROM hotel_registros
      WHERE unidade_id = $1 AND NOT excluido AND colecao = ANY($2)`, [unidadeId, visiveis]);
  const out: Record<string, unknown> = {};
  const versoes: Record<string, Record<string, number>> = {};
  for (const c of visiveis) {
    if (c === "config") continue;
    const base = await baseImportada(pelaPool, unidadeId, c);
    const lista: Dados[] = [];
    const proprios = rows.filter((r) => r.colecao === c);
    const compl = new Map(proprios.filter((r) => r.complemento).map((r) => [r.id, r]));
    versoes[c] = {};
    if (base) {
      for (const [id, b] of base) {
        const cp = compl.get(id);
        lista.push(cp ? { ...b, ...cp.dados, id } : b);
        versoes[c]![id] = cp ? cp.versao : 0;
      }
    }
    for (const r of proprios) {
      if (r.complemento) continue;
      lista.push({ ...r.dados, id: r.id });
      versoes[c]![r.id] = r.versao;
    }
    out[c] = lista;
  }
  const cfg = rows.find((r) => r.colecao === "config" && r.id === "configHotel");
  return { colecoes: out, versoes, config: cfg ? cfg.dados : null, configVersao: cfg ? cfg.versao : 0 };
}

export interface Gravacao {
  colecao: string;
  id: string;
  dados: unknown;
  /** Versão que o usuário viu (0 = registro novo). Ausente: não confere. */
  versao?: number;
}

export async function gravar(ator: Ator, perfis: readonly string[], g: Gravacao): Promise<{ id: string; versao: number }> {
  if (!colecaoValida(g.colecao)) throw erro(400, "Área desconhecida.");
  const colecao = g.colecao;
  if (!podeGravar(perfis, colecao)) throw erro(403, "O seu perfil não pode alterar esta área. Peça à Direção para ajustar o seu acesso.");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(g.id)) throw erro(400, "Identificador inválido.");
  const problemas = validarDados(colecao, g.dados);
  if (problemas.length) throw erro(422, problemas.join(" "));
  const dados = { ...(g.dados as Dados) };
  delete dados.id;
  const unidadeId = await unidadePadrao();

  return transacao(ator, async (db) => {
    const atualR = await db.query<{ dados: Dados; versao: number; complemento: boolean; excluido: boolean }>(
      `SELECT dados, versao, complemento, excluido FROM hotel_registros WHERE colecao = $1 AND id = $2 FOR UPDATE`, [colecao, g.id]);
    const atual = atualR.rows[0];
    if (atual?.excluido) throw erro(409, "Este registro foi excluído por outra pessoa. Recarregue a página.");

    // Registro importado: grava só a diferença, como complemento.
    let base: Dados | null = null;
    // Só id em formato UUID pode ser de registro importado; lançamento manual usa outro formato.
    if ((colecao === "hospedagens" || colecao === "recebimentos") && UUID.test(g.id)) {
      const mapa = await baseImportada(peloCliente(db), unidadeId, colecao, g.id);
      base = mapa?.get(g.id) ?? null;
    }
    const antes: Dados | null = atual ? (base ? { ...base, ...atual.dados } : atual.dados) : base;
    const versaoAtual = atual?.versao ?? 0;
    if (g.versao !== undefined && g.versao !== versaoAtual) {
      throw erro(409, "Outra pessoa alterou este registro enquanto você editava. Recarregue a página e confira antes de salvar de novo.");
    }
    const trava = conferirTrava(colecao, antes, { ...(antes ?? {}), ...dados }, perfis);
    if (trava) throw erro(409, trava);

    const gravado = base ? complementoDe(base, { ...(atual?.dados ?? {}), ...dados }) : { ...(atual?.dados ?? {}), ...dados };
    if (!atual) {
      await db.query(
        `INSERT INTO hotel_registros (colecao, id, unidade_id, dados, complemento, criado_por, atualizado_por)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,$6)`,
        [colecao, g.id, unidadeId, JSON.stringify(gravado), !!base, ator.userId]);
      return { id: g.id, versao: 1 };
    }
    const r = await db.query<{ versao: number }>(
      `UPDATE hotel_registros SET dados = $3::jsonb, versao = versao + 1, atualizado_por = $4
        WHERE colecao = $1 AND id = $2 RETURNING versao`,
      [colecao, g.id, JSON.stringify(gravado), ator.userId]);
    return { id: g.id, versao: r.rows[0]!.versao };
  });
}

export async function excluir(ator: Ator, perfis: readonly string[], colecao: string, id: string, motivo: string): Promise<{ id: string }> {
  if (!colecaoValida(colecao)) throw erro(400, "Área desconhecida.");
  if (!podeGravar(perfis, colecao)) throw erro(403, "O seu perfil não pode alterar esta área.");
  if (COLECOES[colecao].semExclusao) {
    throw erro(409, "Registro financeiro ou de fechamento não se exclui: mude a situação para cancelado, com motivo.");
  }
  if (!motivo.trim()) throw erro(422, "Informe o motivo da exclusão.");
  return transacao(ator, async (db) => {
    const r = await db.query(
      `UPDATE hotel_registros SET excluido = true, motivo = $3, versao = versao + 1, atualizado_por = $4
        WHERE colecao = $1 AND id = $2 AND NOT excluido RETURNING id`, [colecao, id, motivo.slice(0, 500), ator.userId]);
    if (!r.rowCount) throw erro(404, "Registro não encontrado.");
    return { id };
  });
}

export async function gravarConfig(ator: Ator, perfis: readonly string[], dados: unknown, versao?: number): Promise<{ versao: number }> {
  const r = await gravar(ator, perfis, { colecao: "config", id: "configHotel", dados, ...(versao !== undefined ? { versao } : {}) });
  return { versao: r.versao };
}
