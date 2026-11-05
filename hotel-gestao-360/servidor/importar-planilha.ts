#!/usr/bin/env node
/**
 * Sobe a planilha de professores para o banco.
 *
 *   DATABASE_URL="..." CPF_PEPPER="..." CPF_CHAVE="..." \
 *     npm run subir-planilha -- "caminho/planilha.xlsx" [--competencia 2026-08]
 *
 * Lê a planilha, cadastra quem ainda não existe e abre a competência com o
 * movimento de cada professor. Depois disso o cálculo é feito pela API, pelo
 * mesmo motor testado — ninguém redigita nada.
 */

import { importarPlanilha, competenciaDaAba } from "../src/importacao/planilha-professores.js";

// `planilha-professores.ts` nomeia os segmentos como a planilha abrevia
// ("Fundamental", "PV") — o banco (migration 019) e a tela usam o nome por
// extenso. Mapeados aqui, não lá: aquele arquivo é fiel à fonte, esta função
// é que fala com o banco.
const SEGMENTO_PLANILHA_PARA_BANCO: Record<string, string> = {
  Infantil: "Infantil",
  Fundamental: "Fundamental 1",
  "Fundamental 2": "Fundamental 2",
  "Ensino Médio": "Ensino Médio",
  PV: "Pré-Vestibular",
};
import { criarFuncionario } from "./repositorio.js";
import { consultar, transacao, encerrar } from "./banco.js";

const caminho = process.argv[2];
if (!caminho) {
  console.error('Uso: npm run subir-planilha -- "planilha.xlsx" [--competencia 2026-08]');
  process.exit(1);
}
const iComp = process.argv.indexOf("--competencia");
const competenciaAlvo = iComp > -1 ? process.argv[iComp + 1] : null;

const { professores, competencias } = await importarPlanilha(caminho);

// Sem competência escolhida, usa a última aba da planilha.
const abaAlvo = competenciaAlvo
  ? competencias.find((a) => competenciaDaAba(a) === competenciaAlvo)
  : competencias[competencias.length - 1];
if (!abaAlvo) {
  console.error(`Competência ${competenciaAlvo} não encontrada na planilha.`);
  process.exit(1);
}
const competencia = competenciaDaAba(abaAlvo)!;
const doMes = professores.filter((p) => p.competencia === abaAlvo);

console.log(`\nPlanilha: ${caminho}`);
console.log(`Competência: ${competencia} (aba "${abaAlvo}")`);
console.log(`Professores na aba: ${doMes.length}\n`);

// O ator é o primeiro usuário: a trilha precisa de autor.
const [ator] = await consultar<{ id: string }>("SELECT id FROM users ORDER BY criado_em LIMIT 1");
if (!ator) {
  console.error("Nenhum usuário cadastrado. Rode `npm run semear` primeiro.");
  process.exit(1);
}

let criados = 0;
let jaExistiam = 0;
const problemas: string[] = [];

for (const [i, p] of doMes.entries()) {
  const matricula = `P-${String(i + 1).padStart(4, "0")}`;

  const [existe] = await consultar<{ id: string }>(
    "SELECT id FROM employees WHERE matricula = $1",
    [matricula],
  );
  if (existe) { jaExistiam++; continue; }

  // A hora-aula do contrato é a média ponderada pelas aulas de cada segmento:
  // o banco guarda um valor por contrato, e a soma dos produtos é preservada.
  const aulas = p.cargas.reduce((a, c) => a + c.aulasSemanais, 0);
  if (aulas === 0) { problemas.push(`${p.nome}: sem carga lançada`); continue; }
  const valorHora = Math.round(
    p.cargas.reduce((a, c) => a + c.aulasSemanais * c.valorHoraAula, 0) / aulas,
  );

  try {
    await criarFuncionario({ userId: ator.id }, {
      nome: p.nome,
      matricula,
      cargo: p.disciplina || "Professor",
      departamento: "Docente",
      // Sem data na planilha, entra no primeiro dia da competência e o
      // importador avisa — inventar admissão falsearia férias e 13º.
      dataAdmissao: p.dataAdmissao ?? `${competencia}-01`,
      regime: "HORISTA_AULA",
      dependentesIrrf: 0,
      valorHoraAulaCentavos: valorHora,
      aulasSemanais: aulas,
      // A divisão por segmento não entra na conta do salário (só a hora
      // ponderada acima entra) — só fica registrada para o filtro "por
      // módulo" da tela de Funcionários enxergar onde cada um dá aula.
      cargasPorSegmento: p.cargas.map((carga) => ({
        segmento: SEGMENTO_PLANILHA_PARA_BANCO[carga.segmento] ?? carga.segmento,
        aulas: carga.aulasSemanais,
        valorHoraCentavos: carga.valorHoraAula,
      })),
    });
    criados++;
    if (!p.dataAdmissao) problemas.push(`${p.nome}: sem data de admissão na planilha`);
  } catch (erro) {
    problemas.push(`${p.nome}: ${(erro as Error).message}`);
  }
}

console.log(`Cadastrados: ${criados}`);
console.log(`Já existiam: ${jaExistiam}`);

// Abre a competência e grava o movimento (carga extra semanal de cada um).
const [periodo] = await consultar<{ id: string }>(
  `SELECT id FROM folha_periodos WHERE competencia = $1 AND tipo_folha = 'MENSAL'`,
  [competencia],
);

if (periodo) {
  let comExtra = 0;
  await transacao({ userId: ator.id }, async (c) => {
    for (const [i, p] of doMes.entries()) {
      if (p.aulasExtras <= 0) continue;
      const matricula = `P-${String(i + 1).padStart(4, "0")}`;
      const emp = await c.query("SELECT id FROM employees WHERE matricula = $1", [matricula]);
      if (!emp.rowCount) continue;
      // As colunas Tb.Ex, Raízes, Câmara e Monitoria são carga SEMANAL, não
      // aula avulsa: entram no campo que multiplica pelas semanas do mês.
      await c.query(
        `INSERT INTO folha_movimentos
           (periodo_id, employee_id, aulas_extras_semanais, valor_hora_extra_centavos, origem)
         VALUES ($1, $2, $3, $4, 'IMPORTACAO')
         ON CONFLICT (periodo_id, employee_id)
         DO UPDATE SET aulas_extras_semanais = EXCLUDED.aulas_extras_semanais,
                       valor_hora_extra_centavos = EXCLUDED.valor_hora_extra_centavos,
                       atualizado_em = now()`,
        [periodo.id, emp.rows[0].id, p.aulasExtras, p.valorHoraExtra],
      );
      comExtra++;
    }
  });
  console.log(`Movimento gravado para ${comExtra} professor(es) com carga extra.`);
} else {
  console.log(`\nCompetência ${competencia} ainda não aberta.`);
  console.log("Abra pela API (POST /api/competencias) e rode este comando de novo");
  console.log("para gravar o movimento.");
}

if (problemas.length) {
  console.log(`\n${problemas.length} ponto(s) de atenção:`);
  for (const p of problemas.slice(0, 20)) console.log(`  ${p}`);
}

console.log(`\nPróximo passo: POST /api/folha/${competencia}/calcular`);
await encerrar();
