#!/usr/bin/env node
/**
 * Importa planilha(s) de colaboradores (não-professores) e gera
 * `prototipo/partes/dados-colaboradores.js`.
 *
 *   node src/importacao/xlsx-colaboradores.mjs \
 *     --hotel "HOTEL COLABORADORES.xlsx" \
 *     --servju "SERV JU COLABORADOR.xlsx" \
 *     --servma "COLABORADORES MA.xlsx"
 *
 * Cada planilha é de uma empresa (CNPJ) diferente — passa só as que tiver;
 * a próxima rodada acrescenta as que faltarem sem apagar as já importadas
 * (roda de novo com todas juntas, ou edite o arquivo gerado à mão).
 *
 * O cabeçalho é lido pelo NOME da coluna, não pela posição — cada planilha
 * desta escola trouxe uma ordem e um conjunto de colunas diferente (a de
 * Hotel tem "Bruto"; as de ServJU e ServMA não trouxeram essa coluna, e
 * por isso ficam de fora do cálculo de folha até o bruto delas chegar).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import ExcelJS from "exceljs";

const EMPRESAS = { hotel: { codigo: "1", nome: "Hotel" }, servju: { codigo: "2", nome: "ServJU" }, servma: { codigo: "3", nome: "ServMA" } };

/** Uma célula com formatação mista (ex.: "(FÉRIAS)" colorido dentro do nome)
 * vem do ExcelJS como `{richText:[...]}`, não como string — direto na tela
 * vira o texto literal "[object Object]" em vez do nome. */
function texto(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (Array.isArray(v.richText)) return v.richText.map(function (p) { return p.text; }).join("").trim();
    if (typeof v.text === "string") return v.text.trim();
    if ("result" in v) return texto(v.result);
  }
  return String(v).trim();
}

function centavos(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Math.round(v * 100);
  var t = String(v).trim().replace(/\s|R\$| /g, "");
  if (!t) return 0;
  var n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function dataISO(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  var t = String(v || "").trim();
  var m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (!m) return null; // texto livre ("APENAS MEI" etc.) não vira data — melhor null do que data errada
  var ano = m[3].length === 2 ? "20" + m[3] : m[3];
  return ano + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
}

/** Nomes das colunas de desconto, como aparecem na planilha → rótulo bonito. */
var COLUNAS_DESCONTO = { "Cantina": "Cantina", "Saúde": "Saúde", "Mensalidade": "Mensalidade", "Material": "Material", "Armário": "Armário" };

async function lerPlanilha(caminho, empresaChave) {
  var empresa = EMPRESAS[empresaChave];
  var wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);
  var aba = wb.worksheets[0];

  var colunas = {};
  var linhaCabecalho = aba.getRow(1);
  for (var c = 1; c <= aba.columnCount; c++) {
    var rotulo = texto(linhaCabecalho.getCell(c).value);
    if (rotulo) colunas[rotulo] = c;
  }

  var colaboradores = [];
  var ignorados = [];
  var semBruto = colunas["Bruto"] === undefined;

  for (var l = 2; l <= aba.rowCount; l++) {
    var linha = aba.getRow(l);
    var nomeBruto = texto(linha.getCell(colunas["Colaborador"]).value);
    if (!nomeBruto) continue;

    // "GIOVANA DE SOUZA ROCHA (FÉRIAS)" — a observação entre parênteses não é
    // nome, é status; tira do nome e guarda para quem for cadastrar conferir.
    var obsMatch = nomeBruto.match(/\(([^)]+)\)\s*$/);
    var nome = nomeBruto.replace(/\s*\([^)]+\)\s*$/, "").trim();
    var observacao = obsMatch ? obsMatch[1].trim() : "";

    var admissaoValor = linha.getCell(colunas["Data Admissão"]).value;
    var admissao = dataISO(admissaoValor);
    var textoAdmissao = admissaoValor ? texto(admissaoValor) : "";
    if (!admissao && textoAdmissao) {
      // Texto livre no lugar da data ("APENAS MEI") é sinal de cadastro fora
      // do padrão — colaboradorDaPlanilha monta MENSALISTA CLT; PJ/MEI é
      // outro regime, com outros campos (CNPJ, valor da nota), que esta
      // planilha nem traz. Melhor pular do que cadastrar como CLT errado.
      if (/mei|\bpj\b/i.test(textoAdmissao)) {
        ignorados.push({ nome: nomeBruto, motivo: "Admissão traz \"" + textoAdmissao + "\" — parece prestador MEI/PJ, não colaborador CLT. Cadastre à parte, com CNPJ e valor da nota." });
        continue;
      }
      observacao = observacao || textoAdmissao;
    }

    var descontosFixos = [];
    Object.keys(COLUNAS_DESCONTO).forEach(function (col) {
      if (colunas[col] === undefined) return;
      var v = centavos(linha.getCell(colunas[col]).value);
      if (v > 0) descontosFixos.push({ nome: COLUNAS_DESCONTO[col], valor: v });
    });

    var bruto = semBruto ? 0 : centavos(linha.getCell(colunas["Bruto"]).value);

    colaboradores.push({
      nome: nome,
      cargo: texto(linha.getCell(colunas["Cargo"]).value),
      admissao: admissao,
      empresaCodigo: empresa.codigo,
      empresa: empresa.nome,
      salarioBase: bruto,
      descontosFixos: descontosFixos,
      observacao: observacao,
      // Marca quem ainda não tem bruto: entra no cadastro (nome, cargo,
      // descontos) mas fica com salário zerado até a planilha certa chegar —
      // não inventa valor nenhum.
      semBruto: semBruto
    });
  }
  return { colaboradores: colaboradores, ignorados: ignorados };
}

// ---------------------------------------------------------------- cli

var args = process.argv.slice(2);
var caminhos = {};
["hotel", "servju", "servma"].forEach(function (chave) {
  var i = args.indexOf("--" + chave);
  if (i > -1) caminhos[chave] = args[i + 1];
});

if (Object.keys(caminhos).length === 0) {
  console.error("uso: node src/importacao/xlsx-colaboradores.mjs --hotel <arq> [--servju <arq>] [--servma <arq>]");
  process.exit(1);
}

var todos = [];
var todosIgnorados = [];
for (var chave in caminhos) {
  var resultado = await lerPlanilha(caminhos[chave], chave);
  todos = todos.concat(resultado.colaboradores);
  todosIgnorados = todosIgnorados.concat(resultado.ignorados.map(function (i) { return Object.assign({ empresa: EMPRESAS[chave].nome }, i); }));
  var comBruto = resultado.colaboradores.filter(function (c) { return !c.semBruto; }).length;
  console.log(EMPRESAS[chave].nome + ": " + resultado.colaboradores.length + " colaborador(es), " + comBruto + " com bruto lançado.");
}

var destino = "prototipo/partes/dados-colaboradores.js";
var arquivo = "/* Gerado por `node src/importacao/xlsx-colaboradores.mjs`.\n" +
  "   " + todos.length + " colaboradores (não-professores). Contém dado pessoal:\n" +
  "   arquivo local, não publicar nem versionar. */\n\n" +
  "L.DADOS_COLABORADORES = " + JSON.stringify({ colaboradores: todos }, null, 2) + ";\n";

writeFileSync(destino, arquivo, "utf8");
console.log("\n" + todos.length + " colaborador(es) gravados em " + destino);
var semBrutoTotal = todos.filter(function (c) { return c.semBruto; }).length;
if (semBrutoTotal > 0) {
  console.log(semBrutoTotal + " sem coluna de Bruto na planilha de origem — cadastrados com salário R$ 0,00 até a planilha certa chegar.");
}
var comObs = todos.filter(function (c) { return c.observacao; });
if (comObs.length) {
  console.log("\nObservações para conferir:");
  comObs.forEach(function (c) { console.log("  " + c.nome + ": " + c.observacao); });
}
if (todosIgnorados.length) {
  console.log("\n" + todosIgnorados.length + " linha(s) ignorada(s) — não entraram no cadastro:");
  todosIgnorados.forEach(function (i) { console.log("  [" + i.empresa + "] " + i.nome + " — " + i.motivo); });
}
