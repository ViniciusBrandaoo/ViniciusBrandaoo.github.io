/**
 * Lotação de aulas (lotacionograma): professor × disciplina × turma, por ano
 * letivo. Planejamento pedagógico — nada aqui altera contrato nem folha; o
 * vínculo com o cadastro (`employee_id`) só permite comparar as aulas
 * distribuídas com as aulas semanais do contrato.
 */
import type pg from "pg";
import { consultar, transacao, type Ator } from "./banco.js";
import { casarProfessor, type LotacionogramaLido, type Etapa } from "../src/importacao/lotacionograma.js";

export const ETAPAS: Etapa[] = ["INFANTIL", "FUND_I", "FUND_II", "MEDIO", "PREP"];

function erro(status: number, mensagem: string): Error {
  const e = new Error(mensagem) as Error & { statusCode?: number };
  e.statusCode = status;
  return e;
}

export async function anosLotacao(): Promise<number[]> {
  const r = await consultar<{ ano: number }>(
    `SELECT ano FROM lotacao_turmas UNION SELECT ano FROM lotacao_linhas ORDER BY ano`,
  );
  return r.map((x) => x.ano);
}

export async function obterLotacao(ano: number): Promise<Record<string, unknown>> {
  const turmas = await consultar(
    `SELECT id, codigo, etapa, ordem, aulas_semana::float8 AS "aulasSemana"
       FROM lotacao_turmas WHERE ano = $1 ORDER BY ordem, codigo`, [ano]);
  const linhas = await consultar(
    `SELECT l.id, l.disciplina, l.professor, l.employee_id AS "employeeId", p.nome AS "nomeCadastro",
            l.camara::float8 AS camara, l.outros::float8 AS outros, l.disponibilidade, l.ordem,
            coalesce((SELECT json_object_agg(a.turma_id, a.aulas::float8) FROM lotacao_aulas a
                       WHERE a.linha_id = l.id), '{}') AS aulas
       FROM lotacao_linhas l
       LEFT JOIN employees e ON e.id = l.employee_id
       LEFT JOIN pessoas p ON p.id = e.pessoa_id
      WHERE l.ano = $1
      ORDER BY l.ordem, l.disciplina, l.professor`, [ano]);
  const previsto = await consultar(
    `SELECT p.turma_id AS "turmaId", p.disciplina, p.aulas::float8 AS aulas
       FROM lotacao_previsto p JOIN lotacao_turmas t ON t.id = p.turma_id
      WHERE t.ano = $1`, [ano]);
  return { ano, turmas, linhas, previsto };
}

// ---------------------------------------------------------------- grade prevista por disciplina

/** Grava quantas aulas da disciplina a turma precisa; 0 (ou vazio) apaga. */
export async function definirPrevisto(ator: Ator, ano: number, turmaId: string, disciplina: string, aulas: number): Promise<void> {
  const disc = String(disciplina ?? "").trim();
  if (!disc || disc.length > 120) throw erro(422, "Informe a disciplina.");
  const n = Number(aulas);
  if (!Number.isFinite(n) || n < 0 || n > 40) throw erro(422, "Aulas previstas por semana precisa ser um número de 0 a 40.");
  if (Math.round(n * 2) !== n * 2) throw erro(422, "Use aulas inteiras ou meia aula (ex.: 1,5).");
  await transacao(ator, async (c) => {
    const ok = await c.query(`SELECT 1 FROM lotacao_turmas WHERE id = $1 AND ano = $2`, [turmaId, ano]);
    if (!ok.rowCount) throw erro(404, "Turma não encontrada neste ano. Atualize a tela (F5).");
    if (n === 0) {
      await c.query(`DELETE FROM lotacao_previsto WHERE turma_id = $1 AND disciplina = $2`, [turmaId, disc]);
    } else {
      await c.query(
        `INSERT INTO lotacao_previsto (turma_id, disciplina, aulas) VALUES ($1,$2,$3)
         ON CONFLICT (turma_id, disciplina) DO UPDATE SET aulas = EXCLUDED.aulas`, [turmaId, disc, n]);
    }
  });
}

/**
 * Ponto de partida da grade prevista: copia o que já está distribuído hoje,
 * só nas combinações disciplina × turma que ainda não têm previsão (nunca
 * sobrescreve o que alguém já digitou).
 */
export async function preverPeloDistribuido(ator: Ator, ano: number): Promise<{ criadas: number }> {
  return transacao(ator, async (c) => {
    const r = await c.query(
      `INSERT INTO lotacao_previsto (turma_id, disciplina, aulas)
       SELECT a.turma_id, l.disciplina, least(sum(a.aulas), 40)
         FROM lotacao_aulas a JOIN lotacao_linhas l ON l.id = a.linha_id
        WHERE l.ano = $1
        GROUP BY a.turma_id, l.disciplina
       ON CONFLICT (turma_id, disciplina) DO NOTHING`, [ano]);
    return { criadas: r.rowCount ?? 0 };
  });
}

// ---------------------------------------------------------------- vínculo com o cadastro

async function cadastroParaCasar(c: pg.PoolClient): Promise<Array<{ id: string; nome: string; professor: boolean }>> {
  const r = await c.query(
    `SELECT e.id, p.nome,
            EXISTS (SELECT 1 FROM contratos_remuneracao cr WHERE cr.employee_id = e.id
                     AND cr.regime = 'HORISTA_AULA') AS professor
       FROM employees e JOIN pessoas p ON p.id = e.pessoa_id
      WHERE e.status <> 'DESLIGADO'`);
  return r.rows;
}

// ---------------------------------------------------------------- importação

export async function importarLotacao(
  ator: Ator,
  ano: number,
  lido: LotacionogramaLido,
  substituir: boolean,
): Promise<{ turmas: number; linhas: number; aulas: number; vinculados: number; semVinculo: string[] }> {
  return transacao(ator, async (c) => {
    const existe = await c.query(`SELECT count(*)::int AS n FROM lotacao_linhas WHERE ano = $1`, [ano]);
    if (existe.rows[0].n > 0 && !substituir) {
      throw erro(409, `Já existe lotação de ${ano} no sistema (${existe.rows[0].n} linhas). Marque "substituir" para trocar pelo conteúdo da planilha.`);
    }
    await c.query(`DELETE FROM lotacao_linhas WHERE ano = $1`, [ano]);
    await c.query(`DELETE FROM lotacao_turmas WHERE ano = $1`, [ano]);

    const idTurma: Record<string, string> = {};
    for (const t of lido.turmas) {
      const r = await c.query(
        `INSERT INTO lotacao_turmas (ano, codigo, etapa, ordem, aulas_semana) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [ano, t.codigo, t.etapa, t.ordem, t.aulasSemana]);
      idTurma[t.codigo] = r.rows[0].id;
    }

    const cadastro = await cadastroParaCasar(c);
    let aulas = 0;
    let vinculados = 0;
    const semVinculo = new Set<string>();
    let ordem = 0;
    for (const l of lido.linhas) {
      const empId = l.professor ? casarProfessor(l.professor, cadastro) : null;
      if (empId) vinculados++; else if (l.professor) semVinculo.add(l.professor);
      const r = await c.query(
        `INSERT INTO lotacao_linhas (ano, disciplina, professor, employee_id, camara, outros, disponibilidade, ordem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [ano, l.disciplina, l.professor, empId, l.camara, l.outros, l.disponibilidade, ++ordem]);
      for (const [codigo, n] of Object.entries(l.aulas)) {
        if (!idTurma[codigo] || !(n > 0)) continue;
        await c.query(`INSERT INTO lotacao_aulas (linha_id, turma_id, aulas) VALUES ($1,$2,$3)`,
          [r.rows[0].id, idTurma[codigo], Math.min(n, 40)]);
        aulas++;
      }
    }
    return { turmas: lido.turmas.length, linhas: lido.linhas.length, aulas, vinculados, semVinculo: [...semVinculo] };
  });
}

/** Começa um ano novo com as mesmas turmas e linhas de outro (aulas inclusas). */
export async function copiarLotacao(ator: Ator, origem: number, destino: number): Promise<{ linhas: number }> {
  return transacao(ator, async (c) => {
    const ja = await c.query(`SELECT 1 FROM lotacao_turmas WHERE ano = $1 UNION SELECT 1 FROM lotacao_linhas WHERE ano = $1 LIMIT 1`, [destino]);
    if (ja.rowCount) throw erro(409, `${destino} já tem lotação. Edite a existente.`);
    const turmas = await c.query(`SELECT id, codigo, etapa, ordem, aulas_semana FROM lotacao_turmas WHERE ano = $1`, [origem]);
    if (!turmas.rowCount) throw erro(404, `Não há lotação de ${origem} para copiar.`);
    const mapa: Record<string, string> = {};
    for (const t of turmas.rows) {
      const r = await c.query(
        `INSERT INTO lotacao_turmas (ano, codigo, etapa, ordem, aulas_semana) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [destino, t.codigo, t.etapa, t.ordem, t.aulas_semana]);
      mapa[t.id] = r.rows[0].id;
    }
    const prev = await c.query(
      `SELECT p.turma_id, p.disciplina, p.aulas FROM lotacao_previsto p JOIN lotacao_turmas t ON t.id = p.turma_id WHERE t.ano = $1`, [origem]);
    for (const p of prev.rows) {
      await c.query(`INSERT INTO lotacao_previsto (turma_id, disciplina, aulas) VALUES ($1,$2,$3)`, [mapa[p.turma_id], p.disciplina, p.aulas]);
    }
    const linhas = await c.query(`SELECT * FROM lotacao_linhas WHERE ano = $1 ORDER BY ordem`, [origem]);
    for (const l of linhas.rows) {
      const r = await c.query(
        `INSERT INTO lotacao_linhas (ano, disciplina, professor, employee_id, camara, outros, disponibilidade, ordem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [destino, l.disciplina, l.professor, l.employee_id, l.camara, l.outros, l.disponibilidade, l.ordem]);
      const aulas = await c.query(`SELECT turma_id, aulas FROM lotacao_aulas WHERE linha_id = $1`, [l.id]);
      for (const a of aulas.rows) {
        await c.query(`INSERT INTO lotacao_aulas (linha_id, turma_id, aulas) VALUES ($1,$2,$3)`,
          [r.rows[0].id, mapa[a.turma_id], a.aulas]);
      }
    }
    return { linhas: linhas.rowCount ?? 0 };
  });
}

// ---------------------------------------------------------------- edição

export interface LinhaEntrada {
  disciplina?: string;
  professor?: string | null;
  employeeId?: string | null;
  camara?: number;
  outros?: number;
  disponibilidade?: string | null;
}

function validarLinha(d: LinhaEntrada, criando: boolean): LinhaEntrada {
  const v: LinhaEntrada = {};
  if (d.disciplina !== undefined || criando) {
    const t = String(d.disciplina ?? "").trim();
    if (!t) throw erro(422, "Informe a disciplina.");
    if (t.length > 120) throw erro(422, "Nome da disciplina muito longo (máximo 120 letras).");
    v.disciplina = t;
  }
  if (d.professor !== undefined) {
    const t = String(d.professor ?? "").trim();
    if (t.length > 120) throw erro(422, "Nome do professor muito longo (máximo 120 letras).");
    v.professor = t || null;
  }
  if (d.employeeId !== undefined) {
    if (d.employeeId && !/^[0-9a-f-]{36}$/i.test(d.employeeId)) throw erro(422, "Professor do cadastro inválido.");
    v.employeeId = d.employeeId || null;
  }
  for (const k of ["camara", "outros"] as const) {
    if (d[k] === undefined) continue;
    const n = Number(d[k]);
    if (!Number.isFinite(n) || n < 0 || n > 80) throw erro(422, `"${k === "camara" ? "Câmara" : "Outros"}" precisa ser um número de 0 a 80 aulas.`);
    v[k] = Math.round(n * 10) / 10;
  }
  if (d.disponibilidade !== undefined) {
    const t = String(d.disponibilidade ?? "").trim();
    if (t.length > 300) throw erro(422, "Disponibilidade muito longa (máximo 300 letras).");
    v.disponibilidade = t || null;
  }
  return v;
}

export async function criarLinha(ator: Ator, ano: number, d: LinhaEntrada): Promise<{ id: string }> {
  const v = validarLinha(d, true);
  return transacao(ator, async (c) => {
    const r = await c.query(
      `INSERT INTO lotacao_linhas (ano, disciplina, professor, employee_id, camara, outros, disponibilidade, ordem)
       VALUES ($1,$2,$3,$4,$5,$6,$7,
         coalesce((SELECT max(ordem) FROM lotacao_linhas WHERE ano = $1 AND disciplina = $2),
                  (SELECT max(ordem) FROM lotacao_linhas WHERE ano = $1), 0) + 1)
       RETURNING id`,
      [ano, v.disciplina, v.professor ?? null, v.employeeId ?? null, v.camara ?? 0, v.outros ?? 0, v.disponibilidade ?? null]);
    // Abre espaço logo abaixo da mesma disciplina, para a linha nova não cair no fim da grade.
    await c.query(
      `UPDATE lotacao_linhas SET ordem = ordem + 1
        WHERE ano = $1 AND id <> $2 AND ordem >= (SELECT ordem FROM lotacao_linhas WHERE id = $2)`,
      [ano, r.rows[0].id]);
    return { id: r.rows[0].id };
  });
}

export async function atualizarLinha(ator: Ator, id: string, d: LinhaEntrada): Promise<void> {
  const v = validarLinha(d, false);
  const mapa: Record<string, string> = {
    disciplina: "disciplina", professor: "professor", employeeId: "employee_id",
    camara: "camara", outros: "outros", disponibilidade: "disponibilidade",
  };
  const chaves = Object.keys(v) as Array<keyof LinhaEntrada>;
  if (!chaves.length) return;
  await transacao(ator, async (c) => {
    const sets = chaves.map((k, i) => `${mapa[k]} = $${i + 2}`).join(", ");
    const r = await c.query(`UPDATE lotacao_linhas SET ${sets}, atualizado_em = now() WHERE id = $1`,
      [id, ...chaves.map((k) => v[k])]);
    if (!r.rowCount) throw erro(404, "Linha da lotação não encontrada. Atualize a tela (F5).");
  });
}

export async function excluirLinha(ator: Ator, id: string): Promise<void> {
  await transacao(ator, async (c) => {
    const r = await c.query(`DELETE FROM lotacao_linhas WHERE id = $1`, [id]);
    if (!r.rowCount) throw erro(404, "Linha da lotação não encontrada. Atualize a tela (F5).");
  });
}

/** Grava as aulas de uma linha numa turma; 0 (ou vazio) apaga. */
export async function definirAulas(ator: Ator, linhaId: string, turmaId: string, aulas: number): Promise<void> {
  const n = Number(aulas);
  if (!Number.isFinite(n) || n < 0 || n > 40) throw erro(422, "Aulas por semana precisa ser um número de 0 a 40.");
  if (Math.round(n * 2) !== n * 2) throw erro(422, "Use aulas inteiras ou meia aula (ex.: 1,5).");
  await transacao(ator, async (c) => {
    const ok = await c.query(
      `SELECT 1 FROM lotacao_linhas l JOIN lotacao_turmas t ON t.ano = l.ano WHERE l.id = $1 AND t.id = $2`,
      [linhaId, turmaId]);
    if (!ok.rowCount) throw erro(404, "Linha ou turma não encontrada neste ano. Atualize a tela (F5).");
    if (n === 0) {
      await c.query(`DELETE FROM lotacao_aulas WHERE linha_id = $1 AND turma_id = $2`, [linhaId, turmaId]);
    } else {
      await c.query(
        `INSERT INTO lotacao_aulas (linha_id, turma_id, aulas) VALUES ($1,$2,$3)
         ON CONFLICT (linha_id, turma_id) DO UPDATE SET aulas = EXCLUDED.aulas`,
        [linhaId, turmaId, n]);
    }
  });
}

export async function criarTurma(ator: Ator, ano: number, d: { codigo?: string; etapa?: string; aulasSemana?: number | null }): Promise<{ id: string }> {
  const codigo = String(d.codigo ?? "").trim();
  if (!codigo || codigo.length > 20) throw erro(422, "Informe o nome da turma (até 20 letras), ex.: 6ºD.");
  if (!ETAPAS.includes(d.etapa as Etapa)) throw erro(422, "Escolha a etapa da turma.");
  return transacao(ator, async (c) => {
    const dup = await c.query(`SELECT 1 FROM lotacao_turmas WHERE ano = $1 AND lower(codigo) = lower($2)`, [ano, codigo]);
    if (dup.rowCount) throw erro(409, `Já existe a turma ${codigo} em ${ano}.`);
    // Entra no fim da própria etapa, não no fim da grade.
    const pos = await c.query(
      `SELECT coalesce(max(ordem), (SELECT coalesce(max(ordem),0) FROM lotacao_turmas WHERE ano = $1 AND
                array_position($3::text[], etapa) < array_position($3::text[], $2))) + 1 AS o
         FROM lotacao_turmas WHERE ano = $1 AND etapa = $2`, [ano, d.etapa, ETAPAS]);
    const ordem = pos.rows[0].o;
    await c.query(`UPDATE lotacao_turmas SET ordem = ordem + 1 WHERE ano = $1 AND ordem >= $2`, [ano, ordem]);
    const r = await c.query(
      `INSERT INTO lotacao_turmas (ano, codigo, etapa, ordem, aulas_semana) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [ano, codigo, d.etapa, ordem, d.aulasSemana ?? null]);
    return { id: r.rows[0].id };
  });
}

export async function atualizarTurma(ator: Ator, id: string, d: { codigo?: string; aulasSemana?: number | null }): Promise<void> {
  await transacao(ator, async (c) => {
    if (d.aulasSemana !== undefined) {
      const n = d.aulasSemana === null || (d.aulasSemana as unknown) === "" ? null : Number(d.aulasSemana);
      if (n !== null && (!Number.isFinite(n) || n < 0 || n > 80)) throw erro(422, "Aulas da turma por semana precisa ser de 0 a 80.");
      const r = await c.query(`UPDATE lotacao_turmas SET aulas_semana = $2 WHERE id = $1`, [id, n]);
      if (!r.rowCount) throw erro(404, "Turma não encontrada. Atualize a tela (F5).");
    }
    if (d.codigo !== undefined) {
      const codigo = String(d.codigo).trim();
      if (!codigo || codigo.length > 20) throw erro(422, "Informe o nome da turma (até 20 letras).");
      const r = await c.query(
        `UPDATE lotacao_turmas t SET codigo = $2 WHERE id = $1
           AND NOT EXISTS (SELECT 1 FROM lotacao_turmas o WHERE o.ano = t.ano AND o.id <> t.id AND lower(o.codigo) = lower($2))`,
        [id, codigo]);
      if (!r.rowCount) throw erro(409, `Já existe outra turma chamada ${codigo} neste ano (ou a turma não existe mais).`);
    }
  });
}

export async function excluirTurma(ator: Ator, id: string): Promise<void> {
  await transacao(ator, async (c) => {
    const r = await c.query(`DELETE FROM lotacao_turmas WHERE id = $1`, [id]);
    if (!r.rowCount) throw erro(404, "Turma não encontrada. Atualize a tela (F5).");
  });
}

/**
 * Troca o ano letivo de uma lotação inteira (ex.: importada como 2027 mas é
 * a de 2026). Mantém os mesmos registros — ligações ao cadastro e pedidos em
 * Aprovações continuam apontando para as mesmas linhas.
 */
export async function moverLotacao(ator: Ator, origem: number, destino: number): Promise<{ linhas: number; turmas: number }> {
  if (origem === destino) throw erro(422, "Escolha um ano diferente.");
  return transacao(ator, async (c) => {
    const ja = await c.query(`SELECT 1 FROM lotacao_turmas WHERE ano = $1 UNION SELECT 1 FROM lotacao_linhas WHERE ano = $1 LIMIT 1`, [destino]);
    if (ja.rowCount) throw erro(409, `${destino} já tem lotação. Apague ou edite a existente antes.`);
    const t = await c.query(`UPDATE lotacao_turmas SET ano = $2 WHERE ano = $1`, [origem, destino]);
    const l = await c.query(`UPDATE lotacao_linhas SET ano = $2, atualizado_em = now() WHERE ano = $1`, [origem, destino]);
    if (!t.rowCount && !l.rowCount) throw erro(404, `Não há lotação de ${origem}.`);
    // Os pedidos de vínculo citam o ano no texto: acompanha a troca.
    await c.query(
      `UPDATE solicitacoes
          SET titulo = replace(titulo, 'Lotação ' || $1, 'Lotação ' || $2),
              justificativa = replace(justificativa, 'lotação de ' || $1, 'lotação de ' || $2),
              revisao = jsonb_set(revisao, '{nome}', to_jsonb('Lotação ' || $2))
        WHERE revisao->>'acao' = 'LOTACAO_VINCULO' AND revisao->>'nome' = 'Lotação ' || $1`,
      [String(origem), String(destino)]);
    return { linhas: l.rowCount ?? 0, turmas: t.rowCount ?? 0 };
  });
}
