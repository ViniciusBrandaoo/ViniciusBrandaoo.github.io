/**
 * Importação de relatórios do DataHotel — regras puras (sem banco).
 *
 * O servidor usa este módulo para ler o arquivo, validar e classificar cada
 * linha antes de gravar. Nada aqui grava: a decisão de confirmar é do usuário.
 *
 * Os nomes de coluna ainda são apelidos prováveis: o layout real do DataHotel
 * depende das amostras exportadas (docs/ETAPA-1-DESCOBERTA.md, seção 2).
 * Quando elas chegarem, só `LAYOUTS` muda.
 */
import { createHash } from "node:crypto";

export type TipoImportacao = "hospedagens" | "recebimentos";
export type TipoCampo = "texto" | "data" | "valor" | "inteiro" | "booleano" | "forma";
export type Forma = "DINHEIRO" | "DEBITO" | "CREDITO" | "PIX" | "BOLETO" | "FATURADO" | "OUTRO";

export interface CampoLayout {
  de: string[];
  tipo?: TipoCampo;
  obrigatorio?: boolean;
}

export interface Layout {
  tipo: TipoImportacao;
  nome: string;
  /** Versão do mapeamento. Mude quando o mapeamento mudar. */
  versao: string;
  codigo: string[];
  campos: Record<string, CampoLayout>;
}

export const LAYOUTS: Record<TipoImportacao, Layout> = {
  hospedagens: {
    tipo: "hospedagens",
    nome: "Hospedagens / reservas",
    versao: "provisorio-1",
    codigo: ["codigo", "reserva", "id_reserva", "localizador"],
    campos: {
      hospede: { de: ["hospede", "nome", "nome_hospede"], obrigatorio: true },
      apartamento: { de: ["apartamento", "apto", "uh", "quarto"], obrigatorio: true },
      checkin: { de: ["checkin", "check_in", "entrada", "data_entrada"], tipo: "data", obrigatorio: true },
      checkoutPrevisto: { de: ["checkout", "check_out", "saida", "data_saida", "checkout_previsto"], tipo: "data", obrigatorio: true },
      checkoutReal: { de: ["checkout_realizado", "saida_realizada"], tipo: "data" },
      adultos: { de: ["adultos", "qtd_adultos", "pax"], tipo: "inteiro" },
      criancas: { de: ["criancas", "qtd_criancas", "chd"], tipo: "inteiro" },
      valorDiaria: { de: ["valor_diaria", "diaria", "tarifa"], tipo: "valor" },
      consumos: { de: ["consumos", "extras", "valor_consumos"], tipo: "valor" },
      descontos: { de: ["descontos", "desconto"], tipo: "valor" },
      valorPago: { de: ["valor_pago", "pago"], tipo: "valor" },
      formaPagamento: { de: ["forma_pagamento", "pagamento", "forma"], tipo: "forma" },
      empresa: { de: ["empresa", "empresa_pagadora"] },
      cafeIncluido: { de: ["cafe", "cafe_incluido", "cafe_da_manha"], tipo: "booleano" },
      situacaoOrigem: { de: ["status", "situacao"] },
    },
  },
  recebimentos: {
    tipo: "recebimentos",
    nome: "Pagamentos / recebimentos",
    versao: "provisorio-1",
    codigo: ["codigo", "id", "id_pagamento", "documento"],
    campos: {
      data: { de: ["data", "data_operacao", "data_pagamento"], tipo: "data", obrigatorio: true },
      descricao: { de: ["descricao", "historico"] },
      pagador: { de: ["pagador", "hospede", "empresa", "cliente"] },
      apartamento: { de: ["apartamento", "apto", "uh", "referencia"] },
      reserva: { de: ["reserva", "localizador", "codigo_reserva"] },
      forma: { de: ["forma", "forma_pagamento", "modalidade"], tipo: "forma", obrigatorio: true },
      bruto: { de: ["valor", "valor_bruto"], tipo: "valor", obrigatorio: true },
      desconto: { de: ["desconto"], tipo: "valor" },
      taxa: { de: ["taxa", "taxa_financeira"], tipo: "valor" },
      codigoTransacao: { de: ["nsu", "codigo_transacao", "autorizacao"] },
      bandeira: { de: ["bandeira"] },
      operadora: { de: ["operadora", "adquirente"] },
      parcelas: { de: ["parcelas", "parcelamento"], tipo: "inteiro" },
    },
  },
};

export type LinhaBruta = Record<string, string>;
export type Registro = Record<string, string | number | boolean | null>;

// ------------------------------------------------------------------ leitura

export function sha256(buffer: Buffer | Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** "Data Entrada" → "data_entrada"; "Crianças" → "criancas". */
export function normalizarCabecalho(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** CSV com `;` ou `,`, aspas e cabeçalho na primeira linha. */
export function lerCsv(texto: string): { colunas: string[]; linhas: LinhaBruta[] } {
  const brutas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const primeira = brutas[0];
  if (primeira === undefined) return { colunas: [], linhas: [] };
  const sep = primeira.split(";").length >= primeira.split(",").length ? ";" : ",";
  const quebrar = (l: string): string[] => {
    const out: string[] = [];
    let atual = "";
    let aspas = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') {
        if (aspas && l[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas;
      } else if (ch === sep && !aspas) { out.push(atual); atual = ""; } else atual += ch;
    }
    out.push(atual);
    return out.map((s) => s.trim());
  };
  const colunas = quebrar(primeira).map(normalizarCabecalho);
  const linhas = brutas.slice(1).map((l) => {
    const v = quebrar(l);
    const o: LinhaBruta = {};
    colunas.forEach((c, i) => { if (c) o[c] = v[i] ?? ""; });
    return o;
  });
  return { colunas, linhas };
}

/** Primeira aba do .xlsx; cabeçalho na primeira linha não vazia. */
export async function lerXlsx(buffer: Buffer): Promise<{ colunas: string[]; linhas: LinhaBruta[] }> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  // exceljs tipa `load` com o Buffer antigo do Node; o conteúdo é o mesmo.
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const aba = wb.worksheets[0];
  if (!aba) return { colunas: [], linhas: [] };
  const texto = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "object") {
      const o = v as { text?: unknown; result?: unknown; richText?: Array<{ text: string }> };
      if (o.richText) return o.richText.map((r) => r.text).join("");
      if (o.result !== undefined) return texto(o.result);
      if (o.text !== undefined) return String(o.text);
    }
    return String(v).trim();
  };
  const matriz: string[][] = [];
  aba.eachRow({ includeEmpty: false }, (row) => {
    const valores = Array.isArray(row.values) ? row.values.slice(1) : [];
    matriz.push(valores.map(texto));
  });
  const [cab, ...resto] = matriz;
  if (!cab) return { colunas: [], linhas: [] };
  const colunas = cab.map(normalizarCabecalho);
  const linhas = resto
    .filter((r) => r.some((c) => c !== ""))
    .map((r) => {
      const o: LinhaBruta = {};
      colunas.forEach((c, i) => { if (c) o[c] = r[i] ?? ""; });
      return o;
    });
  return { colunas, linhas };
}

// ------------------------------------------------------------------ conversão

/** "1.234,56" / "1234.56" / "R$ 10" → centavos. Vazio → null. Inválido → NaN. */
export function lerValor(s: string): number | null {
  const t0 = s.replace(/[R$\s]/g, "");
  if (t0 === "") return null;
  const t = t0.includes(",") ? t0.replace(/\./g, "").replace(",", ".") : t0;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return Number.NaN;
  return Math.round(Number(t) * 100);
}

export function dataValida(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** "31/12/2026" ou "2026-12-31" → "2026-12-31". Vazio → null. Inválido → NaN. */
export function lerData(s: string): string | null | number {
  const t = s.trim();
  if (!t) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : t.slice(0, 10);
  return dataValida(iso) ? iso : Number.NaN;
}

export function normalizarForma(s: string): Forma | null {
  const t = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (!t) return null;
  if (/dinheiro|especie/.test(t)) return "DINHEIRO";
  if (/debito/.test(t)) return "DEBITO";
  if (/credito|cartao/.test(t)) return "CREDITO";
  if (/pix|transf|ted\b|doc\b/.test(t)) return "PIX";
  if (/boleto/.test(t)) return "BOLETO";
  if (/fatur|empresa/.test(t)) return "FATURADO";
  return "OUTRO";
}

function pegar(linha: LinhaBruta, nomes: string[]): string | undefined {
  for (const n of nomes) if (linha[n] !== undefined) return linha[n];
  return undefined;
}

/**
 * Colunas obrigatórias ausentes do arquivo. Se faltar alguma, o arquivo
 * inteiro é recusado: não se importa metade em silêncio.
 */
export function colunasFaltantes(layout: Layout, colunas: string[]): string[] {
  const tem = new Set(colunas);
  const faltam: string[] = [];
  if (!layout.codigo.some((c) => tem.has(c))) faltam.push(`código (${layout.codigo.join(" / ")})`);
  for (const [nome, c] of Object.entries(layout.campos)) {
    if (c.obrigatorio && !c.de.some((d) => tem.has(d))) faltam.push(`${nome} (${c.de.join(" / ")})`);
  }
  return faltam;
}

export function converterLinha(layout: Layout, linha: LinhaBruta): { codigo: string | null; registro: Registro; problemas: string[] } {
  const problemas: string[] = [];
  const registro: Registro = {};
  const codigo = (pegar(linha, layout.codigo) ?? "").trim() || null;
  if (!codigo) problemas.push("Sem código de origem: a linha não teria como ser reconhecida numa próxima importação.");
  for (const [k, c] of Object.entries(layout.campos)) {
    const bruto = (pegar(linha, c.de) ?? "").trim();
    if (bruto === "") {
      if (c.obrigatorio) problemas.push(`Campo obrigatório vazio: ${k}.`);
      continue; // vazio não vira campo: não apaga o que já existe
    }
    switch (c.tipo ?? "texto") {
      case "data": {
        const v = lerData(bruto);
        if (typeof v === "number") problemas.push(`Data inválida em ${k}: ${bruto}`); else registro[k] = v;
        break;
      }
      case "valor": {
        const v = lerValor(bruto);
        if (v === null) break;
        if (Number.isNaN(v)) problemas.push(`Valor inválido em ${k}: ${bruto}`);
        else if (v < 0) problemas.push(`Valor negativo em ${k}.`);
        else registro[k] = v;
        break;
      }
      case "inteiro": {
        if (!/^\d+$/.test(bruto)) problemas.push(`Número inválido em ${k}: ${bruto}`); else registro[k] = Number(bruto);
        break;
      }
      case "booleano":
        registro[k] = /^(s|sim|1|true|x|incluido|incluso)$/i.test(bruto);
        break;
      case "forma":
        registro[k] = normalizarForma(bruto);
        break;
      default:
        registro[k] = bruto;
    }
  }
  if (layout.tipo === "hospedagens") {
    const ci = registro.checkin, co = registro.checkoutPrevisto, cr = registro.checkoutReal;
    if (typeof ci === "string" && typeof co === "string" && co < ci) problemas.push("Check-out antes do check-in.");
    if (typeof ci === "string" && typeof cr === "string" && cr < ci) problemas.push("Check-out realizado antes do check-in.");
  }
  if (layout.tipo === "recebimentos") {
    const bruto = Number(registro.bruto ?? 0), desc = Number(registro.desconto ?? 0), taxa = Number(registro.taxa ?? 0);
    if (bruto - desc - taxa < 0) problemas.push("Desconto e taxa maiores que o valor bruto.");
    const p = registro.parcelas;
    if (typeof p === "number" && (p < 1 || p > 48)) problemas.push("Parcelas fora de 1 a 48.");
  }
  return { codigo, registro, problemas };
}

// ------------------------------------------------------------------ classificação

export type Situacao = "NOVO" | "ATUALIZADO" | "IDENTICO" | "REJEITADO";

export interface ItemPrevia {
  numeroLinha: number;
  codigo: string | null;
  dadosBrutos: LinhaBruta;
  registro: Registro | null;
  situacao: Situacao;
  problemas: string[];
  camposAlterados: string[];
}

export interface Previa {
  tipo: TipoImportacao;
  layoutVersao: string;
  erroGeral: string | null;
  itens: ItemPrevia[];
  resumo: { total: number; novo: number; atualizado: number; identico: number; rejeitado: number };
}

/**
 * Classifica cada linha sem gravar.
 * `existentes`: registros já gravados para esta origem, por código (só os
 * campos do layout, no mesmo formato do `registro`).
 */
export function preverImportacao(
  tipo: TipoImportacao,
  colunas: string[],
  linhas: LinhaBruta[],
  existentes: Map<string, Registro>,
): Previa {
  const layout = LAYOUTS[tipo];
  const faltam = colunasFaltantes(layout, colunas);
  const vazio = { total: linhas.length, novo: 0, atualizado: 0, identico: 0, rejeitado: 0 };
  if (faltam.length) {
    const msg = `O arquivo não tem as colunas obrigatórias: ${faltam.join("; ")}. Nada foi importado.`;
    return {
      tipo, layoutVersao: layout.versao, erroGeral: msg,
      itens: linhas.map((l, i) => ({
        numeroLinha: i + 2, codigo: null, dadosBrutos: l, registro: null,
        situacao: "REJEITADO", problemas: [msg], camposAlterados: [],
      })),
      resumo: { ...vazio, rejeitado: linhas.length },
    };
  }
  if (!linhas.length) {
    return { tipo, layoutVersao: layout.versao, erroGeral: "O arquivo não tem nenhuma linha de dados.", itens: [], resumo: vazio };
  }
  const vistos = new Map<string, number>();
  const itens = linhas.map((l, i): ItemPrevia => {
    const numeroLinha = i + 2;
    const c = converterLinha(layout, l);
    const base = { numeroLinha, codigo: c.codigo, dadosBrutos: l, registro: c.registro, camposAlterados: [] as string[] };
    if (c.problemas.length || !c.codigo) return { ...base, registro: null, situacao: "REJEITADO", problemas: c.problemas };
    const repetida = vistos.get(c.codigo);
    if (repetida !== undefined) {
      return { ...base, registro: null, situacao: "REJEITADO", problemas: [`Código ${c.codigo} repetido no próprio arquivo (linha ${repetida}).`] };
    }
    vistos.set(c.codigo, numeroLinha);
    const atual = existentes.get(c.codigo);
    if (!atual) return { ...base, situacao: "NOVO", problemas: [] };
    const mudou = Object.keys(c.registro).filter((k) => atual[k] !== c.registro[k]);
    return { ...base, situacao: mudou.length ? "ATUALIZADO" : "IDENTICO", problemas: [], camposAlterados: mudou };
  });
  const resumo = { ...vazio };
  for (const it of itens) {
    if (it.situacao === "NOVO") resumo.novo++;
    else if (it.situacao === "ATUALIZADO") resumo.atualizado++;
    else if (it.situacao === "IDENTICO") resumo.identico++;
    else resumo.rejeitado++;
  }
  return { tipo, layoutVersao: layout.versao, erroGeral: null, itens, resumo };
}
