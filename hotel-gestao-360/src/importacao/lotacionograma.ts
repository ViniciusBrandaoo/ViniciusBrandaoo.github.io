import ExcelJS from "exceljs";

/**
 * Leitor do lotacionograma (Professores × Disciplina × Turma) da coordenação.
 *
 * A planilha tem uma linha por professor dentro de cada disciplina e uma
 * coluna por turma (Infantil I2…I5, Fundamental I 1º…5º, Fundamental II
 * 6º…9º, Médio e Pré-vestibular), com o número de aulas semanais no
 * cruzamento. À direita ficam os totais por etapa (fórmulas), "Câmara",
 * "Outros", "Total Geral" e "Disponibilidade" (texto livre).
 *
 * Os totais por etapa NÃO são importados: o sistema recalcula a partir das
 * turmas. Quando o total digitado na planilha não bate com a soma das turmas,
 * vira aviso — nada é corrigido em silêncio.
 */

export type Etapa = "INFANTIL" | "FUND_I" | "FUND_II" | "MEDIO" | "PREP";

export const ROTULO_ETAPA: Record<Etapa, string> = {
  INFANTIL: "Infantil",
  FUND_I: "Fundamental I",
  FUND_II: "Fundamental II",
  MEDIO: "Ensino Médio",
  PREP: "Pré-vestibular",
};

export interface TurmaLida {
  codigo: string;
  etapa: Etapa;
  ordem: number;
  aulasSemana: number | null;
}

export interface LinhaLida {
  disciplina: string;
  professor: string | null;
  camara: number;
  outros: number;
  disponibilidade: string | null;
  /** codigo da turma → aulas semanais (só as diferentes de zero) */
  aulas: Record<string, number>;
  linhaPlanilha: number;
}

export interface LotacionogramaLido {
  aba: string;
  titulo: string | null;
  turmas: TurmaLida[];
  linhas: LinhaLida[];
  avisos: string[];
}

function texto(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ("richText" in v && Array.isArray(v.richText)) return v.richText.map((p) => p.text).join("").trim();
    if ("text" in v && typeof v.text === "string") return v.text.trim();
    if ("error" in v) return "";
    if ("result" in v) return texto(v.result as ExcelJS.CellValue);
    if ("formula" in v || "sharedFormula" in v) return "";
  }
  return String(v).replace(/\s+/g, " ").trim();
}

/** Número de verdade ou null (vazio, texto, erro #REF!). */
function numero(v: ExcelJS.CellValue): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object") {
    if ("error" in v) return null;
    if ("result" in v) return numero(v.result as ExcelJS.CellValue);
    return null;
  }
  const t = String(v).trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(t)) return null;
  return Number.parseFloat(t.replace(",", "."));
}

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Etapa pelo código da turma, na ordem em que as colunas aparecem: o "1º"
 * depois do 9º ano é do Médio, não do Fundamental I.
 */
function etapaDe(codigo: string, jaPassouFundII: boolean): Etapa | null {
  const c = semAcento(codigo).replace(/\s+/g, "");
  if (/^pre/.test(c)) return "PREP";
  if (/^i\d/.test(c)) return "INFANTIL";
  if (/em$|^\dºm|^\dom|^\d[ºo]?m[ab]?$/.test(c) || /^[1-3][ºo]?m[a-c]$/.test(c)) return "MEDIO";
  const ano = Number.parseInt(c, 10);
  if (ano >= 6 && ano <= 9) return "FUND_II";
  if (ano >= 1 && ano <= 5) return jaPassouFundII ? "MEDIO" : "FUND_I";
  return null;
}

function acharCabecalho(aba: ExcelJS.Worksheet): { linha: number; colProfessor: number; colDisciplina: number } | null {
  for (let r = 1; r <= Math.min(aba.rowCount, 30); r++) {
    const row = aba.getRow(r);
    for (let c = 1; c <= Math.min(aba.columnCount, 10); c++) {
      if (semAcento(texto(row.getCell(c).value)) === "professor") {
        let colDisciplina = 0;
        for (let k = 1; k < c; k++) if (semAcento(texto(row.getCell(k).value)).startsWith("disciplina")) colDisciplina = k;
        return { linha: r, colProfessor: c, colDisciplina: colDisciplina || c - 1 };
      }
    }
  }
  return null;
}

/** Procura um rótulo ("Outros", "Câmara"…) nas linhas de cabeçalho acima. */
function colunaDoRotulo(aba: ExcelJS.Worksheet, ateLinha: number, alvo: RegExp): number {
  for (let r = 1; r <= ateLinha; r++) {
    const row = aba.getRow(r);
    for (let c = 1; c <= aba.columnCount; c++) {
      if (alvo.test(semAcento(texto(row.getCell(c).value)).replace(/\s+/g, ""))) return c;
    }
  }
  return 0;
}

export function lerLotacionograma(aba: ExcelJS.Worksheet): LotacionogramaLido | null {
  const cab = acharCabecalho(aba);
  if (!cab) return null;
  const avisos: string[] = [];
  const header = aba.getRow(cab.linha);

  // ---- turmas: colunas com código logo à direita de "Professor"
  const colunasTurma: Array<{ col: number; codigo: string; etapa: Etapa }> = [];
  let passouFundII = false;
  for (let c = cab.colProfessor + 1; c <= aba.columnCount; c++) {
    const cod = texto(header.getCell(c).value);
    if (!cod) {
      if (colunasTurma.length) break;
      continue;
    }
    const etapa = etapaDe(cod, passouFundII);
    if (!etapa) break;
    if (etapa === "FUND_II") passouFundII = true;
    colunasTurma.push({ col: c, codigo: cod.replace(/\s+/g, ""), etapa });
  }
  // Códigos repetidos (dois "I2", três "1ºEM") são turmas diferentes: A, B, C.
  const vistos: Record<string, number> = {};
  for (const t of colunasTurma) vistos[t.codigo] = (vistos[t.codigo] || 0) + 1;
  const contagem: Record<string, number> = {};
  for (const t of colunasTurma) {
    if ((vistos[t.codigo] ?? 0) > 1) {
      const n = (contagem[t.codigo] = (contagem[t.codigo] || 0) + 1);
      t.codigo = `${t.codigo} ${String.fromCharCode(64 + n)}`;
    }
  }

  const colCamara = colunaDoRotulo(aba, cab.linha, /^camara$/);
  const colOutros = colunaDoRotulo(aba, cab.linha, /^outros$/);
  const colDisp = colunaDoRotulo(aba, cab.linha, /^disponibilidade$/);
  const colTotalEtapa: Partial<Record<Etapa, number>> = {
    INFANTIL: colunaDoRotulo(aba, cab.linha, /^totalinfantil$/),
    FUND_I: colunaDoRotulo(aba, cab.linha, /^totalfi$/),
    FUND_II: colunaDoRotulo(aba, cab.linha, /^totalfundii$/),
    MEDIO: colunaDoRotulo(aba, cab.linha, /^totalmedio$/),
  };

  // ---- linhas
  const linhas: LinhaLida[] = [];
  const metaPorCol: Record<number, number> = {};
  let disciplina = "";
  for (let r = cab.linha + 1; r <= aba.rowCount; r++) {
    const row = aba.getRow(r);
    const a = semAcento(texto(row.getCell(1).value));
    const d = texto(row.getCell(cab.colDisciplina).value);
    if (a.startsWith("total por serie")) {
      for (const t of colunasTurma) {
        const n = numero(row.getCell(t.col).value);
        if (n !== null && n > 0) metaPorCol[t.col] = n;
      }
      break;
    }
    if (semAcento(d).startsWith("total por turma")) continue;
    if (d) disciplina = d;
    const professor = texto(row.getCell(cab.colProfessor).value) || null;
    const aulas: Record<string, number> = {};
    for (const t of colunasTurma) {
      const n = numero(row.getCell(t.col).value);
      if (n !== null && n > 0) aulas[t.codigo] = n;
    }
    const camara = colCamara ? numero(row.getCell(colCamara).value) ?? 0 : 0;
    const outros = colOutros ? numero(row.getCell(colOutros).value) ?? 0 : 0;
    const dispTxt = colDisp ? texto(row.getCell(colDisp).value) : "";
    const temAula = Object.keys(aulas).length > 0 || camara > 0 || outros > 0;
    if (!professor && !temAula) continue;
    if (!disciplina) disciplina = "Sem disciplina";

    for (const [etapa, col] of Object.entries(colTotalEtapa) as Array<[Etapa, number]>) {
      if (!col) continue;
      const v = row.getCell(col).value;
      // Só total DIGITADO (número solto); fórmula é recalculada pelo sistema.
      if (typeof v !== "number") continue;
      const soma = colunasTurma.filter((t) => t.etapa === etapa).reduce((s, t) => s + (aulas[t.codigo] || 0), 0);
      if (Math.abs(soma - v) > 0.01) {
        avisos.push(`Linha ${r} (${professor || "sem professor"}, ${disciplina}): a planilha diz ${v} aula(s) no ${ROTULO_ETAPA[etapa]}, mas as turmas somam ${soma}. Vale a soma das turmas.`);
      }
    }
    linhas.push({
      disciplina,
      professor,
      camara,
      outros,
      disponibilidade: dispTxt && dispTxt.length > 1 ? dispTxt : null,
      aulas,
      linhaPlanilha: r,
    });
  }

  const turmas: TurmaLida[] = colunasTurma.map((t, i) => ({
    codigo: t.codigo, etapa: t.etapa, ordem: i + 1, aulasSemana: metaPorCol[t.col] ?? null,
  }));

  let titulo: string | null = null;
  for (let r = 1; r < cab.linha && !titulo; r++) {
    aba.getRow(r).eachCell((cel) => { const t = texto(cel.value); if (!titulo && /lotacionograma/i.test(t)) titulo = t; });
  }
  return { aba: aba.name, titulo, turmas, linhas, avisos };
}

export async function lerLotacionogramaDeBuffer(buf: Buffer | ArrayBuffer): Promise<LotacionogramaLido> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  for (const aba of wb.worksheets) {
    const lido = lerLotacionograma(aba);
    if (lido && lido.turmas.length) return lido;
  }
  throw new Error('Não achei o lotacionograma nesta planilha: falta a linha de cabeçalho com "Professor" e as turmas ao lado.');
}

// ---------------------------------------------------------------- vínculo com o cadastro

const normal = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Liga "Rafael Hen." a "Rafael Henrique da Silva": todo pedaço do nome da
 * planilha precisa ser começo de um pedaço do nome do cadastro, e o primeiro
 * nome precisa bater. Só liga quando há UM candidato (dois "Paulo" ficam
 * sem vínculo para alguém escolher na tela — melhor vazio que errado).
 */
export function casarProfessor(
  nomePlanilha: string,
  cadastro: Array<{ id: string; nome: string; professor: boolean }>,
): string | null {
  const partes = normal(nomePlanilha).split(" ").filter((p) => p.length >= 2);
  if (!partes.length || /\//.test(nomePlanilha)) return null;
  const primeiro = partes[0]!;
  const casam = (c: { nome: string }) => {
    const tokens = normal(c.nome).split(" ");
    const t0 = tokens[0] ?? "";
    if (t0 !== primeiro && !(primeiro.length >= 4 && t0.startsWith(primeiro))) return false;
    return partes.slice(1).every((p) => tokens.slice(1).some((t) => t.startsWith(p)));
  };
  const todos = cadastro.filter(casam);
  if (todos.length === 1) return todos[0]!.id;
  const professores = todos.filter((c) => c.professor);
  return professores.length === 1 ? professores[0]!.id : null;
}
