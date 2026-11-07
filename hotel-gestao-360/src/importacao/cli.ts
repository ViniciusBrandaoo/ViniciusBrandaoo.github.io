#!/usr/bin/env node
/**
 * Confere e importa a planilha de folha de professores.
 *
 *   npm run importar -- "caminho/da/planilha.xlsx"
 *   npm run importar -- "planilha.xlsx" --json saida.json
 *
 * Não altera a planilha. Recalcula cada linha pela regra do motor e relata
 * o que não bate, para o RH decidir.
 */

import { writeFileSync } from "node:fs";
import {
  competenciaDaAba,
  importarPlanilha,
  type ProfessorImportado,
} from "./planilha-professores.js";
import type { Centavos } from "../dominio/comum/dinheiro.js";

const brl = (c: Centavos) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const caminho = process.argv[2];
if (!caminho) {
  console.error('Uso: npm run importar -- "caminho/da/planilha.xlsx" [--json saida.json]');
  process.exit(1);
}

const indiceJson = process.argv.indexOf("--json");
const saidaJson = indiceJson > -1 ? process.argv[indiceJson + 1] : null;

const { professores, avisos, competencias } = await importarPlanilha(caminho);

console.log(`\nPlanilha: ${caminho}`);
console.log(`Competências: ${competencias.join(", ")}`);
console.log(`Linhas de professor lidas: ${professores.length}\n`);

// ---------------------------------------------------------------- por competência

const porCompetencia = new Map<string, ProfessorImportado[]>();
for (const p of professores) {
  const lista = porCompetencia.get(p.competencia) ?? [];
  lista.push(p);
  porCompetencia.set(p.competencia, lista);
}

console.log("Competência        prof.   aulas/sem      total pela planilha        pela regra");
for (const [comp, lista] of porCompetencia) {
  const aulas = lista.reduce((a, p) => a + p.totalAulasSemanais + p.aulasExtras, 0);
  const planilha = lista.reduce((a, p) => a + p.totalPlanilha, 0);
  const regra = lista.reduce((a, p) => a + p.totalCalculado, 0);
  // Um centavo por linha de folga: a planilha arredonda em ordem diferente.
  const marca = Math.abs(planilha - regra) <= lista.length ? " " : "≠";
  console.log(
    `${comp.padEnd(18)} ${String(lista.length).padStart(4)}   ${String(aulas).padStart(8)}   ${brl(planilha).padStart(18)} ${brl(regra).padStart(18)} ${marca}`,
  );
}

// ---------------------------------------------------------------- divergências

const divergencias = avisos.filter((a) => a.severidade === "DIVERGENCIA");
const atencoes = avisos.filter((a) => a.severidade === "ATENCAO");

console.log(`\n${divergencias.length} divergência(s) de cálculo:`);
if (divergencias.length === 0) {
  console.log("  Nenhuma. A aritmética da planilha bate com a regra em todas as linhas.");
}
for (const d of divergencias) {
  const dif = d.diferenca ? `  (${d.diferenca > 0 ? "+" : ""}${brl(d.diferenca)})` : "";
  console.log(`  ${d.competencia} L${d.linha} · ${d.nome}\n    ${d.mensagem}${dif}`);
}

// ---------------------------------------------------------------- cadastro

const porTipo = new Map<string, number>();
for (const a of atencoes) {
  const chave = a.mensagem.split(/\s\(|:|\.\s/)[0]!.trim();
  porTipo.set(chave, (porTipo.get(chave) ?? 0) + 1);
}
console.log(`\n${atencoes.length} pendência(s) de cadastro, por tipo:`);
for (const [tipo, n] of [...porTipo.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}×  ${tipo}`);
}

// ---------------------------------------------------------------- panorama

const ultima = competencias[competencias.length - 1]!;
const atual = porCompetencia.get(ultima) ?? [];

const porEmpresa = new Map<string, { n: number; total: Centavos }>();
const porForma = new Map<string, { n: number; total: Centavos }>();
for (const p of atual) {
  const e = porEmpresa.get(p.empresa) ?? { n: 0, total: 0 };
  porEmpresa.set(p.empresa, { n: e.n + 1, total: e.total + p.totalPlanilha });
  const f = porForma.get(p.formaPagamento) ?? { n: 0, total: 0 };
  porForma.set(p.formaPagamento, { n: f.n + 1, total: f.total + p.totalPlanilha });
}

console.log(`\nPanorama de ${ultima}:`);
console.log("  Por empresa (cada CNPJ tem eSocial, FGTS e guias próprios):");
for (const [nome, v] of porEmpresa) {
  console.log(`    ${nome.padEnd(22)} ${String(v.n).padStart(3)} prof.  ${brl(v.total).padStart(15)}`);
}
console.log("  Por forma de pagamento:");
for (const [nome, v] of porForma) {
  console.log(`    ${nome.padEnd(22)} ${String(v.n).padStart(3)} prof.  ${brl(v.total).padStart(15)}`);
}

if (saidaJson) {
  writeFileSync(saidaJson, JSON.stringify({ professores, avisos }, null, 2), "utf8");
  console.log(`\nDados completos gravados em ${saidaJson}`);
}

// ---------------------------------------------------------------- carga no protótipo

const indiceSeed = process.argv.indexOf("--seed");
if (indiceSeed > -1) {
  const destino = process.argv[indiceSeed + 1];
  if (!destino) {
    console.error("--seed exige o caminho do arquivo de saída.");
    process.exit(1);
  }

  const SETOR: Record<string, string> = {
    Infantil: "Infantil",
    Fundamental: "Fundamental I",
    "Fundamental 2": "Fundamental II",
    "Ensino Médio": "Ensino Médio",
    PV: "Pré-vestibular",
  };

  const registros = atual.map((p, i) => {
    // O segmento com mais aulas define o setor do professor.
    const principal = [...p.cargas].sort((a, b) => b.aulasSemanais - a.aulasSemanais)[0];
    return {
      nome: p.nome,
      matricula: `P-${String(i + 1).padStart(4, "0")}`,
      cargo: p.disciplina || "Professor",
      departamento: principal ? (SETOR[principal.segmento] ?? "Docente") : "Docente",
      admissao: p.dataAdmissao,
      titulacao: p.titulacao,
      empresa: p.empresa,
      formaPagamento: p.formaPagamento,
      regime: "HORISTA_AULA",
      dependentes: 0,
      cargas: p.cargas
        .filter((c) => c.aulasSemanais > 0)
        .map((c) => ({
          segmento: c.segmento,
          aulas: c.aulasSemanais,
          valorHora: c.valorHoraAula,
        })),
      aulasExtras: p.aulasExtras,
      valorHoraExtra: p.valorHoraExtra,
      totalPlanilha: p.totalPlanilha,
    };
  });

  // Histórico: um resumo por competência, para o Fechamento Mensal mostrar a
  // evolução real da folha em vez de um mês solto.
  const historico = [...porCompetencia.entries()]
    .map(([aba, lista]) => ({
      aba,
      competencia: competenciaDaAba(aba),
      professores: lista.length,
      aulasSemanais: lista.reduce((a, p) => a + p.totalAulasSemanais + p.aulasExtras, 0),
      totalPlanilha: lista.reduce((a, p) => a + p.totalPlanilha, 0),
      totalCalculado: lista.reduce((a, p) => a + p.totalCalculado, 0),
      porEmpresa: [...new Set(lista.map((p) => p.empresa))].map((nome) => ({
        nome,
        professores: lista.filter((p) => p.empresa === nome).length,
        total: lista
          .filter((p) => p.empresa === nome)
          .reduce((a, p) => a + p.totalPlanilha, 0),
      })),
    }))
    .filter((h) => h.competencia !== null)
    .sort((a, b) => a.competencia!.localeCompare(b.competencia!));

  const arquivo =
    `/* Gerado por \`npm run importar -- <planilha> --seed\`.\n` +
    `   Cadastro de ${ultima} (${registros.length} professores) e histórico de\n` +
    `   ${historico.length} competências. Contém dado pessoal: é arquivo local,\n` +
    `   não deve ser publicado nem versionado. */\n\n` +
    `L.DADOS_REAIS = {\n` +
    `  competencia: ${JSON.stringify(competenciaDaAba(ultima) ?? ultima)},\n` +
    `  origem: ${JSON.stringify(ultima)},\n` +
    `  historico: ${JSON.stringify(historico, null, 2).replace(/\n/g, "\n  ")},\n` +
    `  professores: ${JSON.stringify(registros, null, 2).replace(/\n/g, "\n  ")}\n` +
    `};\n`;

  writeFileSync(destino, arquivo, "utf8");
  console.log(`\n${registros.length} professores de ${ultima} gravados em ${destino}`);
  console.log("Rode `npm run build:prototipo` para carregá-los no sistema.");
}
console.log();
