#!/usr/bin/env node
/**
 * Importa a folha de professores no formato CSV exportado da planilha da
 * escola e gera `prototipo/partes/dados-reais.js`.
 *
 *   node src/importacao/csv-folha.mjs "<caminho do csv>"
 *
 * O que a planilha carrega, além do óbvio, e que o importador anterior perdia:
 *
 *   Código da empresa   1 Hotel · 2 ServJU · 3 ServMA
 *   Opção (vínculo)     1 CLT · 2 CLT+Ticket · 3 MEI · 4 CLT+MEI · 5 CLT+MEI+Ticket
 *   CLT / Ticket / MEI  os valores acordados, quando existem
 *   Extras nomeados     Tb.Ex, Raízes, Câmara, Monit. e uma quinta coluna
 *   PPP                 a carga prevista por segmento, para conferir contra a real
 *   Observações         a legenda de mudanças do mês
 */
import { readFileSync, writeFileSync } from "node:fs";

const caminho = process.argv[2];
if (!caminho) { console.error("uso: node src/importacao/csv-folha.mjs <csv>"); process.exit(1); }

// A planilha é exportada em latin1; ler como utf8 quebra todo acento.
const linhas = readFileSync(caminho, "latin1").split(/\r?\n/);

/** Divide respeitando aspas: um campo como "1;4" é um valor só, não dois. */
function campos(linha) {
  const saida = []; let atual = ""; let dentroDeAspas = false;
  for (const c of linha) {
    if (c === '"') { dentroDeAspas = !dentroDeAspas; continue; }
    if (c === ";" && !dentroDeAspas) { saida.push(atual); atual = ""; continue; }
    atual += c;
  }
  saida.push(atual);
  return saida.map((s) => s.trim());
}

/** "6.552,00" → 655200 centavos. Vazio e "-" viram 0. */
function centavos(txt) {
  const limpo = String(txt || "").replace(/\s|R\$|\u00a0/g, "").replace(/^-$/, "");
  if (!limpo) return 0;
  const n = Number(limpo.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function inteiro(txt) {
  const n = Number(String(txt || "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * A coluna "Registro" traz a admissão em formatos misturados: "06/02/24",
 * "16.06.26", "01/02/22". Normaliza para ISO; o que não reconhecer volta
 * como veio, para não inventar data.
 *
 * Ano de dois dígitos vira 20xx — a escola foi fundada em 2019, então não há
 * admissão de 1924 para confundir.
 */
function dataISO(txt) {
  const bruto = String(txt || "").trim();
  const m = bruto.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (!m) return bruto;
  const dia = m[1].padStart(2, "0");
  const mes = m[2].padStart(2, "0");
  const ano = m[3].length === 2 ? "20" + m[3] : m[3];
  return `${ano}-${mes}-${dia}`;
}

const EMPRESAS = { "1": "Hotel", "2": "ServJU", "3": "ServMA" };
const SEGMENTOS = ["Infantil", "Fundamental 1", "Fundamental 2", "Ensino Médio", "Pré-Vestibular"];
// Colunas de carga: pares (nº h/a, valor hora) a partir do índice 6.
const COL_CARGA = [6, 8, 10, 12, 14];
const EXTRAS = [
  { nome: "Tb. Extra", col: 18 },
  { nome: "Raízes", col: 19 },
  { nome: "Câmara", col: 20 },
  { nome: "Monitoria", col: 21 },
  { nome: "Outros", col: 22 },
];
const COL = {
  numero: 0, empresa: 1, nome: 2, disciplina: 3, registro: 4, titulacao: 5,
  totalHA: 16, subtotal: 17, valorHoraExtra: 23, subtotalExtras: 24,
  totalGeral: 25, opcao: 26, clt: 27, ticket: 28, mei: 29, mudanca: 30,
};

const professores = [];
const observacoes = [];
// Tabela de salário-hora por nível e titulação, no rodapé da planilha.
let salarioHora = null;
let ppp = null;
let totaisPlanilha = null;

for (let i = 3; i < linhas.length; i++) {
  const c = campos(linhas[i]);
  // As observações vêm com o rótulo na coluna 1 e o texto na 3 — a coluna do
  // nome fica vazia, então precisam ser lidas ANTES do descarte por nome.
  if (/^obs\.?\s*\d*\s*:?/i.test(c[1] || "")) {
    const texto = (c[3] || "").trim();
    if (texto) observacoes.push({ rotulo: c[1].trim().replace(/:$/, ""), texto });
    continue;
  }

  const nome = (c[COL.nome] || "").replace(/\s+/g, " ").trim();
  if (!nome) continue;

  // A linha "Quantitativo" carrega os totais conferidos pela escola.
  if (/^quantitativo de aulas de acordo/i.test(nome)) {
    totaisPlanilha = {
      aulasPorSegmento: COL_CARGA.map((col, k) => ({ segmento: SEGMENTOS[k], aulas: inteiro(c[col]) })),
      totalAulas: inteiro(c[COL.totalHA]),
      subtotal: centavos(c[COL.subtotal]),
      extras: centavos(c[COL.valorHoraExtra]),
      total: centavos(c[COL.totalGeral]),
    };
    continue;
  }
  // A linha PPP é a carga PREVISTA — é contra ela que se confere a real.
  if (/^ppp$/i.test(nome)) {
    ppp = COL_CARGA.map((col, k) => ({ segmento: SEGMENTOS[k], aulas: inteiro(c[col]) }));
    continue;
  }
  // Rodapé "Gerente Administrativa": a linha do nível traz os rótulos de
  // titulação e a linha seguinte, os valores. Lê o par de uma vez, antes do
  // descarte por nome — que joga fora justamente linhas chamadas
  // "Fundamental" e "Médio".
  if (/^(fundamental|m[ée]dio)$/i.test(nome) && /especialista/i.test(c[5] || "")) {
    const valores = campos(linhas[i + 1] || "");
    const titulacoes = [c[5], c[7], c[9], c[11]].map((t) => (t || "").trim());
    const faixas = titulacoes
      .map((t, k) => ({ titulacao: t, salarioHora: centavos(valores[5 + k * 2]) }))
      .filter((x) => x.titulacao && x.salarioHora > 0);
    if (faixas.length) {
      salarioHora = salarioHora || { rotulo: "Gerente Administrativa", niveis: [] };
      salarioHora.niveis.push({ nivel: nome, faixas });
    }
    continue;
  }
  if (/^(legenda|quantitativo|obs\b|gerente|sal[áa]rio|fundamental|m[ée]dio|infantil)/i.test(nome)) continue;

  const cargas = [];
  COL_CARGA.forEach((col, k) => {
    const aulas = inteiro(c[col]);
    const valor = centavos(c[col + 1]);
    if (!aulas && !valor) return;
    cargas.push({ segmento: SEGMENTOS[k], aulas: aulas, valorHora: valor });
  });
  if (cargas.length === 0) continue;

  const extras = EXTRAS
    .map((e) => ({ nome: e.nome, aulas: inteiro(c[e.col]) }))
    .filter((e) => e.aulas > 0);

  // "Nome 71.42" traz a hora-aula colada no nome; separa para não virar apelido.
  const limpo = nome.replace(/\s+\d+[.,]\d+\s*$/, "").trim();
  const opcaoBruta = (c[COL.opcao] || "").trim();

  const numeroBruto = (c[COL.numero] || "").trim();
  const numeroLimpo = /^\d+$/.test(numeroBruto) ? numeroBruto : "";

  professores.push({
    numeroPlanilha: numeroBruto,
    matricula: numeroLimpo,
    nome: limpo,
    disciplina: c[COL.disciplina] || "",
    registro: dataISO(c[COL.registro]),
    titulacao: c[COL.titulacao] || "",
    empresaCodigo: (c[COL.empresa] || "").trim(),
    empresa: EMPRESAS[(c[COL.empresa] || "").trim()] || "",
    // "1;4" na planilha significa dois códigos na mesma linha.
    vinculoCodigos: opcaoBruta ? opcaoBruta.split(/[;,]/).map((s) => s.trim()).filter(Boolean) : [],
    cargas,
    extras,
    valorHoraExtra: centavos(c[COL.valorHoraExtra]),
    totalAulasPlanilha: inteiro(c[COL.totalHA]),
    subtotalPlanilha: centavos(c[COL.subtotal]),
    subtotalExtrasPlanilha: centavos(c[COL.subtotalExtras]),
    totalPlanilha: centavos(c[COL.totalGeral]) || centavos(c[COL.subtotal]),
    valorClt: centavos(c[COL.clt]),
    valorTicket: centavos(c[COL.ticket]),
    valorMei: centavos(c[COL.mei]),
    mudancaNoMes: (c[COL.mudanca] || "").trim(),
  });
}

const arquivo = `/* Gerado por \`node src/importacao/csv-folha.mjs <csv>\`.
   Folha de Agosto/2026 — ${professores.length} professores.
   Contém dado pessoal: arquivo local, não publicar nem versionar. */

L.DADOS_REAIS = {
  competencia: "2026-08",
  origem: "Agosto.2026",
  empresas: ${JSON.stringify(EMPRESAS)},
  ppp: ${JSON.stringify(ppp)},
  salarioHora: ${JSON.stringify(salarioHora)},
  totaisPlanilha: ${JSON.stringify(totaisPlanilha)},
  observacoes: ${JSON.stringify(observacoes, null, 2).replace(/\n/g, "\n  ")},
  historico: [],
  professores: ${JSON.stringify(professores, null, 2).replace(/\n/g, "\n  ")}
};
`;
writeFileSync("prototipo/partes/dados-reais.js", arquivo);

const comEmpresa = professores.filter((p) => p.empresa).length;
const comVinculo = professores.filter((p) => p.vinculoCodigos.length).length;
const comExtras = professores.filter((p) => p.extras.length).length;
console.log(`${professores.length} professores`);
console.log(`  ${comEmpresa} com empresa · ${comVinculo} com código de vínculo · ${comExtras} com extras`);
console.log(`  ${observacoes.length} observações · PPP ${ppp ? "lido" : "não encontrado"} · tabela salário-hora ${salarioHora ? salarioHora.niveis.length + " nível(is)" : "não encontrada"}`);
if (totaisPlanilha) {
  const fmt = (c) => "R$ " + (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  console.log(`  totais da planilha: ${fmt(totaisPlanilha.subtotal)} + ${fmt(totaisPlanilha.extras)} = ${fmt(totaisPlanilha.total)}`);
}
