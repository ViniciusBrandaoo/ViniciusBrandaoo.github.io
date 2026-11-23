import ExcelJS from "exceljs";
import { arredondar, reais, type Centavos } from "../dominio/comum/dinheiro.js";

/**
 * Importador da planilha de folha de professores do Hotel.
 *
 * A planilha traz uma aba por competência e, em cada linha, a carga do
 * professor dividida por segmento (Infantil, Fundamental, Fundamental 2,
 * Médio, PV), cada um com a sua própria hora-aula. O subtotal é
 *
 *   Σ(H/A do segmento × valor-hora do segmento) × 4,5 semanas × 7/6
 *
 * — as 4,5 semanas do art. 320 §1º da CLT e o acréscimo de 1/6 de DSR da
 * Súmula 351 do TST, que é exatamente a regra do motor.
 *
 * O importador não corrige nada em silêncio: o que não bate vira aviso.
 */

export const SEMANAS_POR_MES = 4.5;
export const FATOR_DSR = 7 / 6;

export type FormaPagamento = "CLT" | "CLT_TICKET" | "MEI" | "INDEFINIDA";

export const EMPRESAS: Record<string, string> = {
  "1": "Empresa Hotel",
  "2": "ServJU",
  "3": "ServMA",
};

export const FORMAS: Record<string, FormaPagamento> = {
  "1": "CLT",
  "2": "CLT_TICKET",
  "3": "MEI",
};

export interface CargaSegmento {
  segmento: string;
  aulasSemanais: number;
  /** Arredondado ao centavo, que é o que vale como valor contratual. */
  valorHoraAula: Centavos;
  /**
   * O valor cru da célula, em reais. Várias linhas trazem hora-aula com mais
   * de duas casas (30,303030…) porque a escola resolveu a taxa de trás para
   * frente, a partir de um total redondo. A conferência usa este número; o
   * contrato precisa do outro.
   */
  valorHoraAulaBruto: number;
}

export interface ProfessorImportado {
  competencia: string;
  linha: number;
  nome: string;
  disciplina: string;
  titulacao: string;
  empresa: string;
  empresaCodigo: string;
  dataAdmissao: string | null;
  formaPagamento: FormaPagamento;
  opcaoBruta: string;
  cargas: CargaSegmento[];
  totalAulasSemanais: number;
  /** Aulas eventuais semanais (Tb.Ex, Raízes, Câmara, Monitoria e afins). */
  aulasExtras: number;
  valorHoraExtra: Centavos;
  /** O que a planilha declara. */
  subtotalPlanilha: Centavos;
  extrasPlanilha: Centavos;
  totalPlanilha: Centavos;
  /** O que a regra produz a partir das mesmas cargas. */
  subtotalCalculado: Centavos;
  extrasCalculado: Centavos;
  totalCalculado: Centavos;
  valorCltPlanilha: Centavos;
  valorTicketPlanilha: Centavos;
  valorMeiPlanilha: Centavos;
  observacao: string;
}

export interface AvisoImportacao {
  severidade: "ATENCAO" | "DIVERGENCIA";
  competencia: string;
  linha: number;
  nome: string;
  mensagem: string;
  diferenca?: Centavos;
}

export interface ResultadoImportacao {
  professores: ProfessorImportado[];
  avisos: AvisoImportacao[];
  competencias: string[];
}

// ---------------------------------------------------------------- leitura

function texto(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((p) => p.text).join("").trim();
    }
    if ("text" in v && typeof v.text === "string") return v.text.trim();
    if ("result" in v) return texto(v.result as ExcelJS.CellValue);
  }
  return String(v).trim();
}

/**
 * Converte só o que já é número ou parece número. Extrair dígitos de texto
 * livre transformaria o rodapé "Rondonópolis, MT 06 de Abril de 2026." em
 * R$ 0,06 — e o ExcelJS devolve o texto de uma célula mesclada em todas as
 * colunas da mesclagem, então isso acontece de verdade.
 */
function numero(v: ExcelJS.CellValue): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "result" in v) {
    return numero(v.result as ExcelJS.CellValue);
  }
  const t = String(v).trim();
  if (!/^-?[\d.]*\d(?:[.,]\d+)?$/.test(t)) return 0;
  const limpo = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number.parseFloat(limpo);
  return Number.isFinite(n) ? n : 0;
}

/**
 * A planilha mistura data real, "16.06.26" e texto livre. Devolve ISO ou null
 * — jamais adivinha um ano.
 */
function dataAdmissao(v: ExcelJS.CellValue): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const t = texto(v);
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = t.match(/^(\d{2})[./](\d{2})[./](\d{2}(?:\d{2})?)$/);
  if (br) {
    const ano = br[3]!.length === 2 ? `20${br[3]}` : br[3]!;
    return `${ano}-${br[2]}-${br[1]}`;
  }
  return null;
}

/** Restos de anotação: "Jose Rubens Neris Junior 71.42". */
function limparNome(bruto: string): { nome: string; sufixo: string } {
  const m = bruto.match(/^(.*?)\s+(\d{1,3}[.,]\d{2})\s*$/);
  if (m) return { nome: m[1]!.trim(), sufixo: m[2]! };
  return { nome: bruto.trim(), sufixo: "" };
}

const MESES: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

/**
 * Converte o nome da aba em competência ISO. Os nomes variam bastante
 * ("Jan. 2026", "Maio.2026)", "junho.2026"), então normaliza acento e
 * pontuação e usa as três primeiras letras do mês.
 */
export function competenciaDaAba(nome: string): string | null {
  const limpo = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const ano = limpo.match(/(20\d{2})/)?.[1];
  const mes = MESES[limpo.replace(/[^a-z]/g, "").slice(0, 3)];
  return ano && mes ? `${ano}-${mes}` : null;
}

const LINHAS_NAO_PROFESSOR =
  /^(quantitativo|legenda|ppp|obs\b|gerente|sal[áa]rio|fundamental|m[ée]dio|infantil)/i;

interface Colunas {
  nome: number;
  disciplina: number;
  registro: number;
  titulacao: number;
  empresa: number;
  paresCarga: number[];
  totalHa: number;
  subtotal: number;
  quantidadesExtra: number[];
  valorHoraExtra: number;
  subtotalExtra: number;
  totalGeral: number;
  opcao: number;
  clt: number;
  ticket: number;
  mei: number;
  observacao: number;
}

/** Mapeia pelo cabeçalho da linha 3 — a ordem das colunas varia entre abas. */
function mapearColunas(aba: ExcelJS.Worksheet): Colunas | null {
  const cab = new Map<string, number>();
  const paresCarga: number[] = [];
  const linha = aba.getRow(3);

  for (let c = 1; c <= aba.columnCount; c++) {
    const rotulo = texto(linha.getCell(c).value);
    if (!rotulo) continue;
    if (rotulo.startsWith("Nº H/A")) paresCarga.push(c);
    if (!cab.has(rotulo)) cab.set(rotulo, c);
  }

  const acha = (prefixo: string) => {
    for (const [rotulo, col] of cab) if (rotulo.startsWith(prefixo)) return col;
    return 0;
  };

  const nome = cab.get("Nome") ?? 0;
  const subtotal = acha("Valores SUB TOTAL");
  if (!nome || !subtotal || paresCarga.length === 0) return null;

  // A segunda ocorrência de "Valor (Hora) R$" depois do subtotal é a dos extras.
  let valorHoraExtra = 0;
  for (let c = subtotal + 1; c <= aba.columnCount; c++) {
    if (texto(linha.getCell(c).value) === "Valor (Hora) R$") {
      valorHoraExtra = c;
      break;
    }
  }

  const quantidadesExtra: number[] = [];
  for (let c = subtotal + 1; c < valorHoraExtra; c++) quantidadesExtra.push(c);

  return {
    nome,
    disciplina: cab.get("Disciplina") ?? 0,
    registro: cab.get("Registro") ?? 0,
    titulacao: cab.get("Titulação") ?? 0,
    // Só de maio em diante existe "Código da Empesa" (com o erro de digitação
    // da própria planilha). Antes disso a coluna "CÓDIGO" é o número
    // sequencial do professor — mapeá-la como empresa daria empresa "1", "2",
    // "3" para todo mundo, o que é pior que não ter dado nenhum.
    empresa: acha("Código da Emp"),
    paresCarga,
    totalHa: cab.get("Total de H/A") ?? 0,
    subtotal,
    quantidadesExtra,
    valorHoraExtra,
    subtotalExtra: acha("Valores SubTotal 01"),
    totalGeral: acha("TOTAL Geral"),
    opcao: cab.get("Opção") ?? 0,
    clt: acha("CLT"),
    ticket: acha("Tickt") || acha("Ticket"),
    mei: cab.get("MEI") ?? 0,
    observacao: acha("Houve Mudança"),
  };
}

const SEGMENTOS = ["Infantil", "Fundamental", "Fundamental 2", "Ensino Médio", "PV"];

/**
 * Coluna 0 significa "cabeçalho não encontrado nesta aba" — as abas de
 * fevereiro a abril têm menos colunas que as demais. Ler a coluna 0 explode
 * no ExcelJS, então toda leitura opcional passa por aqui.
 */
function celula(linha: ExcelJS.Row, coluna: number): ExcelJS.CellValue {
  return coluna > 0 ? linha.getCell(coluna).value : null;
}

/**
 * Subtotal pela regra: carga × hora-aula × 4,5 semanas × 7/6 de DSR.
 * Multiplica na precisão original e arredonda só no fim — fixar o centavo da
 * hora antes de multiplicar produz divergência sistemática com a planilha.
 */
export function calcularSubtotal(cargas: CargaSegmento[]): Centavos {
  const base = cargas.reduce(
    (acc, c) => acc + c.aulasSemanais * c.valorHoraAulaBruto,
    0,
  );
  return arredondar(base * 100 * SEMANAS_POR_MES * FATOR_DSR);
}

/** Um centavo de folga absorve a ordem de arredondamento da planilha. */
const TOLERANCIA: Centavos = 1;

export async function importarPlanilha(
  caminho: string,
): Promise<ResultadoImportacao> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);

  const professores: ProfessorImportado[] = [];
  const avisos: AvisoImportacao[] = [];
  const competencias: string[] = [];

  for (const aba of wb.worksheets) {
    const cols = mapearColunas(aba);
    if (!cols) {
      avisos.push({
        severidade: "ATENCAO",
        competencia: aba.name,
        linha: 3,
        nome: "—",
        mensagem: `Cabeçalho da aba "${aba.name}" não reconhecido — a aba foi ignorada.`,
      });
      continue;
    }
    competencias.push(aba.name);

    for (let l = 4; l <= aba.rowCount; l++) {
      const linha = aba.getRow(l);
      const bruto = texto(celula(linha, cols.nome));
      if (!bruto || LINHAS_NAO_PROFESSOR.test(bruto)) continue;

      const subtotalPlanilha = reais(numero(celula(linha, cols.subtotal)));
      if (subtotalPlanilha === 0) continue;

      const { nome, sufixo } = limparNome(bruto);

      const cargas: CargaSegmento[] = [];
      cols.paresCarga.forEach((c, i) => {
        const aulas = numero(linha.getCell(c).value);
        const bruto = numero(linha.getCell(c + 1).value);
        if (aulas === 0 && bruto === 0) return;
        cargas.push({
          segmento: SEGMENTOS[i] ?? `Segmento ${i + 1}`,
          aulasSemanais: aulas,
          valorHoraAula: reais(bruto),
          valorHoraAulaBruto: bruto,
        });
      });

      // Sem nenhum par carga/valor a linha não é de professor — é rodapé,
      // assinatura ou nota de rodapé que sobrou na área de dados.
      if (cargas.length === 0) continue;

      const aulasExtras = cols.quantidadesExtra.reduce(
        (acc, c) => acc + numero(linha.getCell(c).value),
        0,
      );
      const valorHoraExtraBruto = numero(celula(linha, cols.valorHoraExtra));
      const valorHoraExtra = reais(valorHoraExtraBruto);

      const subtotalCalculado = calcularSubtotal(cargas);
      const extrasCalculado = arredondar(
        aulasExtras * valorHoraExtraBruto * 100 * SEMANAS_POR_MES * FATOR_DSR,
      );
      const extrasPlanilha = cols.subtotalExtra
        ? reais(numero(celula(linha, cols.subtotalExtra)))
        : 0;
      const totalPlanilha = cols.totalGeral
        ? reais(numero(celula(linha, cols.totalGeral)))
        : 0;

      const opcaoBruta = texto(celula(linha, cols.opcao));
      const empresaCodigo = texto(celula(linha, cols.empresa));
      const admissao = dataAdmissao(celula(linha, cols.registro));

      const professor: ProfessorImportado = {
        competencia: aba.name,
        linha: l,
        nome,
        disciplina: texto(celula(linha, cols.disciplina)),
        titulacao: texto(celula(linha, cols.titulacao)),
        empresaCodigo,
        empresa: EMPRESAS[empresaCodigo] ?? "(não informada)",
        dataAdmissao: admissao,
        formaPagamento: FORMAS[opcaoBruta] ?? "INDEFINIDA",
        opcaoBruta,
        cargas,
        totalAulasSemanais: cargas.reduce((a, c) => a + c.aulasSemanais, 0),
        aulasExtras,
        valorHoraExtra,
        subtotalPlanilha,
        extrasPlanilha,
        totalPlanilha,
        subtotalCalculado,
        extrasCalculado,
        totalCalculado: subtotalCalculado + extrasCalculado,
        valorCltPlanilha: cols.clt ? reais(numero(celula(linha, cols.clt))) : 0,
        valorTicketPlanilha: cols.ticket ? reais(numero(celula(linha, cols.ticket))) : 0,
        valorMeiPlanilha: cols.mei ? reais(numero(celula(linha, cols.mei))) : 0,
        observacao: cols.observacao ? texto(celula(linha, cols.observacao)) : "",
      };
      professores.push(professor);

      // -------------------------------------------------- conferências
      const base = { competencia: aba.name, linha: l, nome };

      const difSubtotal = professor.subtotalCalculado - professor.subtotalPlanilha;
      const difExtras = professor.extrasCalculado - professor.extrasPlanilha;
      const difTotal = professor.totalCalculado - professor.totalPlanilha;

      if (Math.abs(difSubtotal) > TOLERANCIA) {
        avisos.push({
          ...base,
          severidade: "DIVERGENCIA",
          mensagem: `Subtotal diverge da regra: a planilha traz ${fmt(professor.subtotalPlanilha)} e a carga lançada produz ${fmt(professor.subtotalCalculado)}.`,
          diferenca: difSubtotal,
        });
      }
      if (Math.abs(difExtras) > TOLERANCIA) {
        avisos.push({
          ...base,
          severidade: "DIVERGENCIA",
          mensagem: `Extras divergem: ${professor.aulasExtras} aula(s) eventual(is) a ${fmt(professor.valorHoraExtra)} valem ${fmt(professor.extrasCalculado)}, mas a planilha traz ${fmt(professor.extrasPlanilha)}.`,
          diferenca: difExtras,
        });
      }
      if (Math.abs(difTotal) > TOLERANCIA) {
        avisos.push({
          ...base,
          severidade: "DIVERGENCIA",
          mensagem: `Total geral diverge: planilha ${fmt(professor.totalPlanilha)} contra ${fmt(professor.totalCalculado)} pela regra.`,
          diferenca: difTotal,
        });
      }

      // Hora-aula com mais de duas casas é taxa resolvida de trás para frente
      // a partir de um total redondo. Funciona na planilha, mas não é um valor
      // contratual pagável nem declarável.
      for (const c of cargas) {
        if (Math.abs(c.valorHoraAulaBruto * 100 - Math.round(c.valorHoraAulaBruto * 100)) > 1e-6) {
          avisos.push({
            ...base,
            severidade: "ATENCAO",
            mensagem: `Hora-aula de ${c.segmento} com mais de duas casas decimais (${c.valorHoraAulaBruto.toFixed(6)}). O contrato precisa de um valor em centavos; ao arredondar para ${fmt(c.valorHoraAula)} o total muda.`,
          });
          break;
        }
      }

      if (!admissao) {
        avisos.push({
          ...base,
          severidade: "ATENCAO",
          mensagem: `Sem data de admissão utilizável${texto(celula(linha, cols.registro)) ? ` (registro: "${texto(celula(linha, cols.registro))}")` : ""}. Sem ela não há como proporcionalizar mês de entrada nem apurar férias e 13º.`,
        });
      }
      if (professor.formaPagamento === "INDEFINIDA") {
        avisos.push({
          ...base,
          severidade: "ATENCAO",
          mensagem: opcaoBruta
            ? `Opção de pagamento "${opcaoBruta}" fora da legenda (1=CLT, 2=CLT+Ticket, 3=MEI).`
            : "Opção de pagamento em branco.",
        });
      }
      if (cols.empresa === 0) {
        avisos.push({
          ...base,
          severidade: "ATENCAO",
          mensagem: "A aba não tem coluna de empresa — não dá para saber por qual CNPJ este professor foi pago nesta competência.",
        });
      } else if (!EMPRESAS[empresaCodigo]) {
        avisos.push({
          ...base,
          severidade: "ATENCAO",
          mensagem: "Sem código de empresa. Cada CNPJ tem eSocial, FGTS e guias próprios — a folha precisa saber a qual pertence.",
        });
      }
      if (sufixo) {
        avisos.push({
          ...base,
          severidade: "ATENCAO",
          mensagem: `O nome carrega o valor "${sufixo}" colado. Retirei do nome, mas confira: a hora-aula em uso é ${fmt(cargas[0]?.valorHoraAula ?? 0)}.`,
        });
      }
      for (const c of cargas) {
        if (c.aulasSemanais > 0 && c.valorHoraAula === 0) {
          avisos.push({
            ...base,
            severidade: "DIVERGENCIA",
            mensagem: `${c.aulasSemanais} aula(s) de ${c.segmento} sem valor-hora preenchido — essas aulas não estão sendo pagas.`,
          });
        }
      }
    }
  }

  return { professores, avisos, competencias };
}

const fmt = (c: Centavos) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
