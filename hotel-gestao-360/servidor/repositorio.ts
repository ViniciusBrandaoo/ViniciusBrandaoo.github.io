import type pg from "pg";
import { consultar, transacao, type Ator } from "./banco.js";
import { criarHashSenha, hashDocumento, cifrarDocumento } from "./autenticacao.js";
import { normalizar, primeiroDia } from "../src/dominio/comum/competencia.js";
import type {
  Contrato, MovimentoMensal, ResultadoFolha,
} from "../src/dominio/folha/tipos.js";
import { movimentoVazio } from "../src/dominio/folha/tipos.js";
import type { ParametrosFolha } from "../src/dominio/folha/parametros.js";
import { calcularFolha } from "../src/dominio/folha/motor.js";
import { calcular13Salario, mesesTrabalhadosNoAno } from "../src/dominio/folha/decimo-terceiro.js";
import { calcularFerias } from "../src/dominio/folha/ferias.js";
import { semImpostosDaContabilidade } from "../src/dominio/folha/sem-impostos.js";
import { calcularRescisao, type TipoRescisao } from "../src/dominio/folha/rescisao.js";
import {
  calcularPrestador,
  PARAMETROS_PRESTADOR_PADRAO,
  type ContratoPrestador,
  type EnquadramentoPrestador,
} from "../src/dominio/folha/prestador.js";

/**
 * Tradução entre o banco e o domínio.
 *
 * O motor de folha não sabe o que é SQL, e o banco não sabe o que é
 * `ContratoHoristaAula`. Este arquivo é a única costura entre os dois — o
 * resto do sistema fica livre dos dois lados.
 */

// ---------------------------------------------------------------- funcionários

export interface FuncionarioEntrada {
  nome: string;
  cpf?: string;
  matricula: string;
  cargo?: string;
  departamento?: string;
  dataAdmissao: string;
  regime: "HORISTA_AULA" | "MENSALISTA" | "HORISTA_RELOGIO";
  dependentesIrrf?: number;
  valorHoraAulaCentavos?: number;
  aulasSemanais?: number;
  salarioBaseCentavos?: number;
  cargaHorariaSemanal?: number;
  valorHoraCentavos?: number;
  horasSemanais?: number;
  cctId?: string;
  // Empresa pagadora ("1"/"2"/"3" — código de `empresas.codigo`, migration
  // 010) e divisão CLT/Ticket/MEI. `temClt` não entra aqui: os três regimes
  // que este formulário aceita já SÃO CLT, então a bandeira é sempre true —
  // só Ticket e MEI variam de pessoa pra pessoa.
  empresaCodigo?: string;
  temTicket?: boolean;
  /** Professor cujo Ticket soma (como colaborador) em vez de ser descontado. */
  ticketSoma?: boolean;
  temMei?: boolean;
  valorTicketCentavos?: number;
  valorMeiCentavos?: number;
  /** Informativo (vínculo CLT + Ticket na lista); não entra no cálculo. */
  valorCltCentavos?: number;
  // Só para HORISTA_AULA: como as `aulasSemanais` se dividem entre os
  // segmentos (Infantil, Fundamental 1/2, Médio, Pré-Vestibular). A soma
  // precisa bater com `aulasSemanais` — ver `validarCargasSegmento`.
  cargasPorSegmento?: Array<{ segmento: string; aulas: number; valorHoraCentavos?: number }>;
}

export const SEGMENTOS_ENSINO = ["Infantil", "Fundamental 1", "Fundamental 2", "Ensino Médio", "Pré-Vestibular"];

/**
 * Mesma regra que `aulas_semanais` já cobra sozinha hoje (é ela quem entra
 * na conta do salário) — a divisão por segmento só existe para dizer ONDE
 * essas aulas acontecem, nunca pode divergir do total que já paga.
 */
function validarCargasSegmento(
  cargas: Array<{ segmento: string; aulas: number }> | undefined,
  aulasSemanais: number | undefined,
): void {
  if (!cargas || !cargas.length) return;
  for (const c of cargas) {
    if (!SEGMENTOS_ENSINO.includes(c.segmento)) {
      throw Object.assign(new Error(`Segmento desconhecido: ${c.segmento}`), { statusCode: 422 });
    }
    if (!(c.aulas > 0)) {
      throw Object.assign(new Error(`Aulas do segmento ${c.segmento} precisam ser maiores que zero.`), { statusCode: 422 });
    }
  }
  const soma = cargas.reduce((a, c) => a + c.aulas, 0);
  if (Math.abs(soma - (aulasSemanais ?? 0)) > 0.01) {
    throw Object.assign(
      new Error(`A soma das aulas por segmento (${soma}) precisa bater com o total de aulas semanais (${aulasSemanais ?? 0}).`),
      { statusCode: 422 },
    );
  }
}

async function gravarCargasSegmento(
  c: pg.PoolClient,
  contratoId: string,
  cargas: Array<{ segmento: string; aulas: number; valorHoraCentavos?: number }> | undefined,
): Promise<void> {
  await c.query("DELETE FROM contrato_cargas_segmento WHERE contrato_id = $1", [contratoId]);
  if (!cargas || !cargas.length) return;
  for (const carga of cargas) {
    await c.query(
      `INSERT INTO contrato_cargas_segmento (contrato_id, segmento, aulas, valor_hora_centavos)
       VALUES ($1, $2, $3, $4)`,
      [contratoId, carga.segmento, carga.aulas, carga.valorHoraCentavos ?? null],
    );
  }
}

/**
 * Mudou o total de aulas semanais do horista: a divisão por segmento acompanha.
 * Um segmento só leva o total novo; vários segmentos precisam continuar somando o total
 * (senão o cálculo usa a divisão antiga e a mudança "não pega").
 */
async function acompanharAulasNosSegmentos(c: pg.PoolClient, contratoId: string, aulasSemanais: number): Promise<void> {
  const linhas = (await c.query("SELECT segmento, aulas FROM contrato_cargas_segmento WHERE contrato_id = $1", [contratoId])).rows as Array<{ segmento: string; aulas: string | number }>;
  if (linhas.length === 0) return;
  if (linhas.length === 1) {
    await c.query("UPDATE contrato_cargas_segmento SET aulas = $2 WHERE contrato_id = $1", [contratoId, aulasSemanais]);
    return;
  }
  const soma = linhas.reduce((a, l) => a + Number(l.aulas), 0);
  if (Math.abs(soma - aulasSemanais) > 0.01) {
    throw Object.assign(new Error(`O total de ${aulasSemanais} aula(s) semanais não bate com a divisão por segmento (${soma} aula(s)). Ajuste também a "Carga por segmento" para somar ${aulasSemanais}.`), { statusCode: 422 });
  }
}

async function empresaIdPorCodigo(c: pg.PoolClient, codigo: string): Promise<string> {
  const r = await c.query("SELECT id FROM empresas WHERE codigo = $1", [codigo]);
  if (!r.rowCount) throw Object.assign(new Error("Empresa pagadora desconhecida. Escolha uma das empresas da lista."), { statusCode: 422 });
  return r.rows[0].id;
}

async function acharOuCriar(
  c: pg.PoolClient,
  tabela: "cargos" | "departments",
  nome: string | undefined,
): Promise<string | null> {
  if (!nome || !nome.trim()) return null;
  const existente = await c.query(`SELECT id FROM ${tabela} WHERE nome = $1`, [nome.trim()]);
  if (existente.rowCount) return existente.rows[0].id;
  const criado = await c.query(
    `INSERT INTO ${tabela} (nome) VALUES ($1) RETURNING id`,
    [nome.trim()],
  );
  return criado.rows[0].id;
}

/** Acha a pessoa pelo CPF, ou cria — com ou sem CPF ainda (ver `criarFuncionario`). */
/** Ids dos funcionários cujo salário só a Direção enxerga. */
export async function idsSalarioRestrito(): Promise<string[]> {
  const l = await consultar<{ id: string }>("SELECT id FROM employees WHERE salario_restrito");
  return l.map((x) => x.id);
}

/** Marca ou desmarca a restrição de salário da pessoa com este CPF. */
export async function definirSalarioRestrito(ator: Ator, cpf: string, restrito: boolean): Promise<number> {
  validarCpf(cpf);
  return transacao(ator, async (c) => {
    const r = await c.query(
      `UPDATE employees SET salario_restrito = $2
        WHERE pessoa_id IN (SELECT id FROM pessoas WHERE cpf_hash = $1)`,
      [hashDocumento(cpf), restrito],
    );
    return r.rowCount ?? 0;
  });
}

/** CPF com 11 dígitos e dígitos verificadores certos; recusa 111.111.111-11 e afins. */
export function validarCpf(cpf: string): void {
  const n = cpf.replace(/\D/g, "");
  const dv = (base: string) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const ok = n.length === 11 && !/^(\d)\1{10}$/.test(n) &&
    dv(n.slice(0, 9)) === Number(n[9]) && dv(n.slice(0, 10)) === Number(n[10]);
  if (!ok) throw Object.assign(new Error("CPF inválido: confira os 11 números."), { statusCode: 422 });
}

async function resolverPessoaId(
  c: pg.PoolClient,
  nome: string,
  cpf: string | undefined,
  matricula: string,
  permitirSegundoVinculo = false,
): Promise<string> {
  if (cpf) validarCpf(cpf);
  const cpfHash = cpf ? hashDocumento(cpf) : null;
  if (cpfHash) {
    const existente = await c.query("SELECT id FROM pessoas WHERE cpf_hash = $1", [cpfHash]);
    if (existente.rowCount) {
      // Mesmo CPF com cadastro ativo é, quase sempre, duplicidade (a pessoa aparece
      // duas vezes na folha). Segundo vínculo de verdade exige confirmação explícita.
      if (!permitirSegundoVinculo) {
        const ativo = await c.query(
          `SELECT p.nome, e.matricula FROM employees e JOIN pessoas p ON p.id = e.pessoa_id
            WHERE e.pessoa_id = $1 AND e.status <> 'DESLIGADO' LIMIT 1`,
          [existente.rows[0].id],
        );
        if (ativo.rowCount) {
          throw Object.assign(new Error(
            `Já existe um cadastro ativo com este CPF: ${ativo.rows[0].nome} (matrícula ${ativo.rows[0].matricula}). Edite aquele cadastro em vez de criar outro.`,
          ), { statusCode: 409 });
        }
      }
      return existente.rows[0].id;
    }
    return (await c.query(
      `INSERT INTO pessoas (nome, cpf_cifrado, cpf_hash) VALUES ($1, $2, $3) RETURNING id`,
      [nome, cifrarDocumento(cpf!), cpfHash],
    )).rows[0].id;
  }
  // Sem CPF ainda dá para cadastrar, mas o registro fica marcado: sem ele
  // não há eSocial nem informe de rendimentos.
  return (await c.query(
    `INSERT INTO pessoas (nome, cpf_cifrado, cpf_hash) VALUES ($1, $2, $3) RETURNING id`,
    [nome, Buffer.from("SEM_CPF", "utf8"), "pendente:" + matricula],
  )).rows[0].id;
}

/**
 * Cria pessoa, vínculo e contrato de remuneração numa transação só.
 * São três tabelas porque uma pessoa pode ter mais de um vínculo, e um
 * vínculo tem histórico de remuneração — mas para quem cadastra é um só ato.
 */
/**
 * Remuneração é de um regime só. Valor que sobrou de outro regime (campo
 * escondido no formulário, contrato antigo) sai antes de gravar — o banco
 * recusa dois regimes ao mesmo tempo ("carga exclusiva").
 */
function soDoRegime<T extends {
  regime: string;
  valorHoraAulaCentavos?: number | null; aulasSemanais?: number | null;
  salarioBaseCentavos?: number | null; cargaHorariaSemanal?: number | null;
  valorHoraCentavos?: number | null; horasSemanais?: number | null;
}>(v: T): T {
  const limpo = { ...v };
  if (v.regime !== "HORISTA_AULA") { limpo.valorHoraAulaCentavos = null; limpo.aulasSemanais = null; }
  if (v.regime !== "MENSALISTA") { limpo.salarioBaseCentavos = null; limpo.cargaHorariaSemanal = null; }
  if (v.regime !== "HORISTA_RELOGIO") { limpo.valorHoraCentavos = null; limpo.horasSemanais = null; }
  return limpo;
}

/** Nome em branco e data que não existe (30/02) são erro de preenchimento, não do servidor. */
export function validarNomeEData(nome: string | undefined, data: string | undefined): void {
  if (!nome || !nome.trim()) throw Object.assign(new Error("Informe o nome."), { statusCode: 422 });
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data ?? "");
  const d = m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)) : null;
  if (!m || !d || d.getUTCMonth() !== +m[2]! - 1 || d.getUTCDate() !== +m[3]!) {
    throw Object.assign(new Error("Data de admissão inválida. Use uma data que exista no calendário."), { statusCode: 422 });
  }
}

export async function criarFuncionario(
  ator: Ator,
  entrada: FuncionarioEntrada,
): Promise<{ id: string; pessoaId: string; contratoId: string }> {
  const dados = soDoRegime(entrada as never) as FuncionarioEntrada;
  validarNomeEData(dados.nome, dados.dataAdmissao);
  return transacao(ator, async (c) => {
    const pessoaId = await resolverPessoaId(c, dados.nome, dados.cpf, dados.matricula, (dados as { permitirSegundoVinculo?: boolean }).permitirSegundoVinculo);

    const cargoId = await acharOuCriar(c, "cargos", dados.cargo);
    const departamentoId = await acharOuCriar(c, "departments", dados.departamento);

    const emp = await c.query(
      `INSERT INTO employees (pessoa_id, matricula, cargo_id, department_id, data_admissao)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [pessoaId, dados.matricula, cargoId, departamentoId, dados.dataAdmissao],
    );
    const employeeId = emp.rows[0].id;

    const cct = dados.cctId ?? (await c.query(
      `SELECT id FROM folha_cct WHERE categoria = $1 ORDER BY vigencia_inicio DESC LIMIT 1`,
      [dados.regime === "HORISTA_AULA" ? "DOCENTE" : "ADMINISTRATIVO"],
    )).rows[0]?.id;
    if (!cct) throw new Error("Nenhuma convenção coletiva cadastrada para este regime.");

    // Vigência sempre no dia 1: o CHECK do banco exige mês fechado.
    const vigencia = dados.dataAdmissao.slice(0, 7) + "-01";

    const empresaId = dados.empresaCodigo ? await empresaIdPorCodigo(c, dados.empresaCodigo) : null;
    const valorTicket = dados.valorTicketCentavos ?? 0;
    const valorMei = dados.valorMeiCentavos ?? 0;
    // O valor sozinho já implica a bandeira — sem isto, digitar um valor e
    // esquecer de marcar "Sim" faria o CHECK `vinculo_valor_coerente_com_bandeira`
    // recusar o cadastro por um detalhe que devia ser óbvio pra quem preencheu.
    const temTicket = !!dados.temTicket || valorTicket > 0;
    const temMei = !!dados.temMei || valorMei > 0;

    validarCargasSegmento(dados.cargasPorSegmento, dados.aulasSemanais);

    const contrato = await c.query(
      `INSERT INTO contratos_remuneracao
         (employee_id, cct_id, regime, vigencia_inicio, dependentes_irrf,
          valor_hora_aula_centavos, aulas_semanais,
          salario_base_centavos, carga_horaria_semanal,
          valor_hora_centavos, horas_semanais,
          empresa_id, tem_clt, tem_ticket, tem_mei, valor_ticket_centavos, valor_mei_centavos,
          criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
      [
        employeeId, cct, dados.regime, vigencia, dados.dependentesIrrf ?? 0,
        dados.valorHoraAulaCentavos ?? null, dados.aulasSemanais ?? null,
        dados.salarioBaseCentavos ?? null, dados.cargaHorariaSemanal ?? null,
        dados.valorHoraCentavos ?? null, dados.horasSemanais ?? null,
        empresaId, true, temTicket, temMei, valorTicket, valorMei,
        ator.userId,
      ],
    );
    await gravarCargasSegmento(c, contrato.rows[0].id, dados.cargasPorSegmento);

    return { id: employeeId, pessoaId, contratoId: contrato.rows[0].id };
  });
}

// ---------------------------------------------------------------- funcionário PJ/MEI (prestador)
//
// Vínculo sem CLT nenhum: nada de contratos_remuneracao, nada de folha
// mensal. `employees.tipo_contrato = 'PJ'` já existia no CHECK desde a
// migration 001, mas até aqui nunca era setado — `criarFuncionario` sempre
// grava 'CLT' (o padrão da coluna). Este é o par com `criarFuncionario`
// para quem não tem CLT algum, só nota fiscal de serviço.

export interface FuncionarioPrestadorEntrada {
  nome: string;
  cpf?: string;
  matricula: string;
  cargo?: string;
  departamento?: string;
  dataAdmissao: string;
  enquadramento: EnquadramentoPrestador;
  cnpj?: string;
  servico: string;
  servicoComCppNoMei?: boolean;
  issRetidoNaFonte?: boolean;
  empresaCodigo?: string;
  valorMensalCentavos: number;
  // `{nome, valor}`, não `{descricao, valorCentavos}` — mesmo formato que
  // `dados-colaboradores.js` já usava e que `L.calcularPrestador` (front) já
  // lê; nomear diferente aqui criaria a MESMA divergência de campo que já
  // aconteceu antes com `parcelaDeduzir`/`deduzir` no IRRF.
  descontosFixos?: Array<{ nome: string; valor: number }>;
  temHorarioFixo?: boolean;
  temExclusividade?: boolean;
  temSubordinacaoDireta?: boolean;
  substituivelPorOutro?: boolean;
  temTicket?: boolean;
  valorTicketCentavos?: number;
}

export async function criarFuncionarioPrestador(
  ator: Ator,
  dados: FuncionarioPrestadorEntrada,
): Promise<{ id: string; pessoaId: string; contratoPrestadorId: string }> {
  validarNomeEData(dados.nome, dados.dataAdmissao);
  return transacao(ator, async (c) => {
    const pessoaId = await resolverPessoaId(c, dados.nome, dados.cpf, dados.matricula, (dados as { permitirSegundoVinculo?: boolean }).permitirSegundoVinculo);

    const cargoId = await acharOuCriar(c, "cargos", dados.cargo);
    const departamentoId = await acharOuCriar(c, "departments", dados.departamento);

    const emp = await c.query(
      `INSERT INTO employees (pessoa_id, matricula, cargo_id, department_id, data_admissao, tipo_contrato)
       VALUES ($1, $2, $3, $4, $5, 'PJ') RETURNING id`,
      [pessoaId, dados.matricula, cargoId, departamentoId, dados.dataAdmissao],
    );
    const employeeId = emp.rows[0].id;

    const empresaId = dados.empresaCodigo ? await empresaIdPorCodigo(c, dados.empresaCodigo) : null;
    const cnpjHash = dados.cnpj ? hashDocumento(dados.cnpj) : null;
    const cnpjCifrado = dados.cnpj ? cifrarDocumento(dados.cnpj) : null;

    const contrato = await c.query(
      `INSERT INTO contratos_prestador
         (employee_id, enquadramento, cnpj_cifrado, cnpj_hash, servico, servico_com_cpp_no_mei,
          iss_retido_na_fonte, empresa_id, valor_mensal_centavos, descontos_fixos, data_inicio,
          tem_horario_fixo, tem_exclusividade, tem_subordinacao_direta, substituivel_por_outro,
          tem_ticket, valor_ticket_centavos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [
        employeeId, dados.enquadramento, cnpjCifrado, cnpjHash, dados.servico,
        !!dados.servicoComCppNoMei, !!dados.issRetidoNaFonte, empresaId, dados.valorMensalCentavos,
        JSON.stringify((dados.descontosFixos ?? []).map((d) => ({ nome: d.nome, valor: d.valor }))),
        dados.dataAdmissao, !!dados.temHorarioFixo, !!dados.temExclusividade,
        !!dados.temSubordinacaoDireta, dados.substituivelPorOutro ?? true,
        !!dados.temTicket || (dados.valorTicketCentavos ?? 0) > 0, dados.valorTicketCentavos ?? 0,
      ],
    );

    return { id: employeeId, pessoaId, contratoPrestadorId: contrato.rows[0].id };
  });
}

/**
 * Passa quem é CLT (ou outro vínculo) para prestador MEI/PJ, mantendo o mesmo
 * cadastro e a matrícula. O contrato de remuneração em aberto termina no dia
 * anterior ao início do novo vínculo — o que já foi pago fica como está — e os
 * rascunhos de folha CLT dos meses ainda abertos saem.
 */
export async function converterParaPrestador(
  ator: Ator,
  employeeId: string,
  dados: Omit<FuncionarioPrestadorEntrada, "nome" | "matricula" | "dataAdmissao"> & { dataInicio?: string },
): Promise<{ contratoPrestadorId: string; dataInicio: string }> {
  return transacao(ator, async (c) => {
    const emp = await c.query("SELECT tipo_contrato, data_desligamento FROM employees WHERE id = $1 FOR UPDATE", [employeeId]);
    if (!emp.rowCount) throw Object.assign(new Error("Funcionário não encontrado."), { statusCode: 404 });
    if (emp.rows[0].tipo_contrato === "PJ") {
      throw Object.assign(new Error("Este cadastro já é de prestador."), { statusCode: 409 });
    }
    if (emp.rows[0].data_desligamento) {
      throw Object.assign(new Error("Cadastro desligado não pode virar prestador."), { statusCode: 422 });
    }
    if (!dados.servico) throw Object.assign(new Error("Informe o serviço prestado."), { statusCode: 400 });

    // Começa no primeiro mês ainda aberto, salvo data informada.
    const aberto = await c.query(
      `SELECT competencia FROM folha_periodos
        WHERE tipo_folha = 'MENSAL' AND NOT folha_periodo_travado(status)
        ORDER BY competencia LIMIT 1`,
    );
    const dataInicio = dados.dataInicio ?? (aberto.rowCount ? `${aberto.rows[0].competencia}-01` : new Date().toISOString().slice(0, 10));

    try {
      await c.query(
        `UPDATE contratos_remuneracao SET vigencia_fim = ($2::date - 1)
          WHERE employee_id = $1 AND (vigencia_fim IS NULL OR vigencia_fim >= $2::date)
            AND vigencia_inicio < $2::date`,
        [employeeId, dataInicio],
      );
    } catch (erro) {
      if (/sustenta|restrict/.test((erro as Error).message)) {
        throw Object.assign(new Error("Há folha fechada depois dessa data: o vínculo CLT não pode terminar antes dela."), { statusCode: 422 });
      }
      throw erro;
    }
    // Rascunhos CLT dos meses abertos a partir do início saem da folha.
    const periodos = `(SELECT id FROM folha_periodos WHERE NOT folha_periodo_travado(status) AND (competencia || '-01')::date >= $2::date)`;
    await c.query(`DELETE FROM folha_rubricas WHERE calculo_id IN (SELECT id FROM folha_calculos WHERE employee_id = $1 AND periodo_id IN ${periodos})`, [employeeId, dataInicio]);
    await c.query(`DELETE FROM folha_contas_geradas WHERE calculo_id IN (SELECT id FROM folha_calculos WHERE employee_id = $1 AND periodo_id IN ${periodos})`, [employeeId, dataInicio]);
    await c.query(`DELETE FROM folha_calculos WHERE employee_id = $1 AND periodo_id IN ${periodos}`, [employeeId, dataInicio]);
    await c.query(`DELETE FROM folha_movimentos WHERE employee_id = $1 AND periodo_id IN ${periodos}`, [employeeId, dataInicio]);

    // Contrato que começa na própria data ou depois não tem mais o que pagar.
    await c.query(
      `DELETE FROM contratos_remuneracao r WHERE r.employee_id = $1 AND r.vigencia_inicio >= $2::date
          AND NOT EXISTS (SELECT 1 FROM folha_calculos x WHERE x.contrato_remuneracao_id = r.id)
          AND NOT EXISTS (SELECT 1 FROM folha_ferias x WHERE x.contrato_remuneracao_id = r.id)
          AND NOT EXISTS (SELECT 1 FROM folha_decimo_terceiro x WHERE x.contrato_remuneracao_id = r.id)
          AND NOT EXISTS (SELECT 1 FROM folha_rescisoes x WHERE x.contrato_remuneracao_id = r.id)`,
      [employeeId, dataInicio],
    );
    const restante = await c.query(
      "SELECT 1 FROM contratos_remuneracao WHERE employee_id = $1 AND (vigencia_fim IS NULL OR vigencia_fim >= $2::date)",
      [employeeId, dataInicio],
    );
    if (restante.rowCount) {
      throw Object.assign(new Error(
        "Este cadastro tem contrato CLT com férias, 13º ou rescisão ligados a essa data. Resolva isso antes de passar para prestador.",
      ), { statusCode: 422 });
    }

    await c.query("UPDATE employees SET tipo_contrato = 'PJ' WHERE id = $1", [employeeId]);

    const empresaId = dados.empresaCodigo ? await empresaIdPorCodigo(c, dados.empresaCodigo) : null;
    const contrato = await c.query(
      `INSERT INTO contratos_prestador
         (employee_id, enquadramento, cnpj_cifrado, cnpj_hash, servico, servico_com_cpp_no_mei,
          iss_retido_na_fonte, empresa_id, valor_mensal_centavos, descontos_fixos, data_inicio,
          tem_horario_fixo, tem_exclusividade, tem_subordinacao_direta, substituivel_por_outro,
          tem_ticket, valor_ticket_centavos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [
        employeeId, dados.enquadramento, dados.cnpj ? cifrarDocumento(dados.cnpj) : null,
        dados.cnpj ? hashDocumento(dados.cnpj) : null, dados.servico,
        !!dados.servicoComCppNoMei, !!dados.issRetidoNaFonte, empresaId, dados.valorMensalCentavos ?? 0,
        JSON.stringify((dados.descontosFixos ?? []).map((d) => ({ nome: d.nome, valor: d.valor }))),
        dataInicio, !!dados.temHorarioFixo, !!dados.temExclusividade,
        !!dados.temSubordinacaoDireta, dados.substituivelPorOutro ?? true,
        !!dados.temTicket || (dados.valorTicketCentavos ?? 0) > 0, dados.valorTicketCentavos ?? 0,
      ],
    );
    return { contratoPrestadorId: contrato.rows[0].id, dataInicio };
  });
}

/** Preenche/atualiza o CNPJ de um contrato de prestador já cadastrado — o único
 * campo que o trigger de congelamento libera mesmo com pagamento já feito. */
export async function atualizarCnpjPrestador(
  ator: Ator,
  contratoPrestadorId: string,
  cnpj: string,
): Promise<void> {
  await transacao(ator, async (c) => {
    const r = await c.query(
      `UPDATE contratos_prestador SET cnpj_cifrado = $2, cnpj_hash = $3 WHERE id = $1 RETURNING id`,
      [contratoPrestadorId, cifrarDocumento(cnpj), hashDocumento(cnpj)],
    );
    if (!r.rowCount) throw Object.assign(new Error("Contrato de prestador não encontrado."), { statusCode: 404 });
  });
}

/** Ajusta valor e descontos fixos do contrato vigente do prestador (travado só após pagamento). */
type DadosPrestador = {
  valorMensalCentavos?: number; descontosFixos?: Array<{ nome: string; valor: number }>;
  empresaCodigo?: string; servico?: string; enquadramento?: EnquadramentoPrestador; servicoComCppNoMei?: boolean;
  dataAdmissao?: string; temTicket?: boolean; valorTicketCentavos?: number;
} & DadosIdentidade;

export async function atualizarPrestador(ator: Ator, employeeId: string, dados: DadosPrestador): Promise<void> {
  await transacao(ator, (c) => atualizarPrestadorTx(c, employeeId, dados));
}

async function atualizarPrestadorTx(c: pg.PoolClient, employeeId: string, dados: DadosPrestador): Promise<void> {
  if (dados.nome !== undefined || dados.cpf || dados.matricula || dados.cargo !== undefined || dados.departamento !== undefined) {
    const pessoa = (await c.query("SELECT pessoa_id FROM employees WHERE id = $1", [employeeId])).rows[0] as { pessoa_id: string } | undefined;
    if (!pessoa) throw Object.assign(new Error("Funcionário não encontrado."), { statusCode: 404 });
    await atualizarIdentidadeTx(c, employeeId, pessoa.pessoa_id, dados);
  }
  const empresaId = dados.empresaCodigo ? await empresaIdPorCodigo(c, dados.empresaCodigo) : null;
  const r = await c.query(
    `UPDATE contratos_prestador
        SET valor_mensal_centavos = COALESCE($2, valor_mensal_centavos),
            descontos_fixos = COALESCE($3::jsonb, descontos_fixos),
            empresa_id = COALESCE($4, empresa_id),
            servico = COALESCE($5, servico),
            enquadramento = COALESCE($6, enquadramento),
            servico_com_cpp_no_mei = COALESCE($7, servico_com_cpp_no_mei),
            tem_ticket = COALESCE($8, tem_ticket),
            valor_ticket_centavos = COALESCE($9, valor_ticket_centavos)
      WHERE employee_id = $1 AND data_fim IS NULL RETURNING id`,
    [employeeId, dados.valorMensalCentavos ?? null,
      dados.descontosFixos ? JSON.stringify(dados.descontosFixos.map((d) => ({ nome: d.nome, valor: d.valor }))) : null,
      empresaId, dados.servico || null, dados.enquadramento ?? null, dados.servicoComCppNoMei ?? null,
      dados.temTicket ?? null, dados.valorTicketCentavos ?? null],
  );
  if (!r.rowCount) throw Object.assign(new Error("Contrato de prestador não encontrado."), { statusCode: 404 });

  // Data de admissão: corrige a da pessoa e, se o contrato vigente começava nela
  // (prestador que não veio de CLT), o início do contrato acompanha.
  if (dados.dataAdmissao !== undefined) {
    validarNomeEData("x", dados.dataAdmissao);
    const antiga = (await c.query("SELECT to_char(data_admissao,'YYYY-MM-DD') AS d FROM employees WHERE id = $1", [employeeId])).rows[0] as { d: string } | undefined;
    if (antiga && antiga.d !== dados.dataAdmissao) {
      await c.query("UPDATE employees SET data_admissao = $2 WHERE id = $1", [employeeId, dados.dataAdmissao]);
      await c.query(
        `UPDATE contratos_prestador SET data_inicio = $2::date
          WHERE employee_id = $1 AND data_fim IS NULL AND data_inicio = $3::date`,
        [employeeId, dados.dataAdmissao, antiga.d],
      );
    }
  }
}

export async function contratoPrestadorVigente(
  employeeId: string,
): Promise<{ contrato: ContratoPrestador; contratoId: string } | null> {
  const [l] = await consultar<Record<string, never>>(
    `SELECT * FROM contratos_prestador WHERE employee_id = $1 AND data_fim IS NULL LIMIT 1`,
    [employeeId],
  );
  if (!l) return null;
  const linha = l as never as Record<string, never>;
  const contrato: ContratoPrestador = {
    prestadorId: employeeId as unknown as string,
    nome: "",
    enquadramento: linha.enquadramento as unknown as EnquadramentoPrestador,
    cnpj: "",
    servico: linha.servico as unknown as string,
    servicoComCppNoMei: linha.servico_com_cpp_no_mei as unknown as boolean,
    issRetidoNaFonte: linha.iss_retido_na_fonte as unknown as boolean,
    valorMensal: Number(linha.valor_mensal_centavos),
    dataInicio: linha.data_inicio as unknown as string,
    dataFim: linha.data_fim as unknown as string | null,
    temHorarioFixo: linha.tem_horario_fixo as unknown as boolean,
    temExclusividade: linha.tem_exclusividade as unknown as boolean,
    temSubordinacaoDireta: linha.tem_subordinacao_direta as unknown as boolean,
    substituivelPorOutro: linha.substituivel_por_outro as unknown as boolean,
  };
  return { contrato, contratoId: linha.id as unknown as string };
}

export async function gravarPagamentoPrestador(
  c: pg.PoolClient,
  employeeId: string,
  contratoPrestadorId: string,
  contrato: ContratoPrestador,
  competencia: string,
  nome: string,
): Promise<{ id: string; resultado: ReturnType<typeof calcularPrestador> }> {
  const resultado = calcularPrestador({ ...contrato, nome }, competencia as never, PARAMETROS_PRESTADOR_PADRAO);

  const [descontosLinha] = await c.query(
    `SELECT descontos_fixos FROM contratos_prestador WHERE id = $1`, [contratoPrestadorId],
  ).then((r) => r.rows as { descontos_fixos: Array<{ nome: string; valor: number }> }[]);
  const descontosFixos = descontosLinha?.descontos_fixos ?? [];
  // Descontos do mês (Cantina, Plano de saúde...) lançados no movimento desta
  // competência: não se repetem no mês seguinte, ao contrário dos fixos.
  const [mov] = (await c.query(
    `SELECT ${DESCONTOS_MES.map((d) => `m.${d.coluna}::int AS "${d.campo}"`).join(", ")}
       FROM folha_movimentos m JOIN folha_periodos p ON p.id = m.periodo_id
      WHERE m.employee_id = $1 AND p.competencia = $2 AND p.tipo_folha = 'MENSAL' LIMIT 1`,
    [employeeId, competencia],
  )).rows as Array<Record<string, number>>;
  for (const d of DESCONTOS_MES) {
    const v = Number(mov?.[d.campo] ?? 0);
    if (v > 0) descontosFixos.push({ nome: d.rotulo, valor: v });
  }
  const totalDescontosFixos = descontosFixos.reduce((a, d) => a + d.valor, 0);
  const liquido = resultado.liquidoAPagar - totalDescontosFixos;

  const anterior = await c.query(
    "SELECT id FROM prestador_pagamentos WHERE employee_id = $1 AND competencia = $2",
    [employeeId, competencia],
  );
  if (anterior.rowCount) {
    await c.query("DELETE FROM prestador_pagamentos WHERE id = $1", [anterior.rows[0].id]);
  }

  const ins = await c.query(
    `INSERT INTO prestador_pagamentos
       (employee_id, contrato_prestador_id, competencia, valor_bruto_centavos, total_retencoes_centavos,
        total_descontos_fixos_centavos, liquido_a_pagar_centavos, encargo_contratante_centavos,
        custo_total_centavos, retencoes, memoria, avisos)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [
      employeeId, contratoPrestadorId, competencia, resultado.valorBruto, resultado.totalRetencoes,
      totalDescontosFixos, liquido, resultado.encargoContratante, resultado.custoTotal,
      JSON.stringify(resultado.retencoes), JSON.stringify(resultado.memoria), JSON.stringify(resultado.avisos),
    ],
  );

  return { id: ins.rows[0].id, resultado: { ...resultado, liquidoAPagar: liquido } };
}

const CAMPOS_REMUNERACAO_ALTERAM_CONTRATO = [
  "regime", "dependentesIrrf", "valorHoraAulaCentavos", "aulasSemanais",
  "salarioBaseCentavos", "cargaHorariaSemanal", "valorHoraCentavos", "horasSemanais",
  // Empresa e vínculo entram aqui pelo mesmo motivo do salário: migrar de
  // CNPJ pagador ou passar a receber parte como Ticket/MEI é uma mudança de
  // contrato, não um detalhe cadastral — datada como as demais.
  "empresaCodigo", "temTicket", "temMei", "valorTicketCentavos", "valorMeiCentavos",
] as const;

/**
 * Edita um funcionário já existente. Nome/cargo/departamento são mutáveis no
 * próprio registro (não têm efeito retroativo). Já regime e valores de
 * remuneração são histórico: mudar o valor da hora-aula em setembro não pode
 * reescrever o que foi pago em agosto — por isso, quando algum desses campos
 * muda, fecha o contrato vigente (`vigencia_fim`) e abre um novo, em vez de
 * fazer UPDATE nas colunas de valor da linha antiga.
 *
 * Exceção: editar de novo dentro do MESMO mês em que o contrato atual já
 * começou (corrigir um erro de digitação minutos depois de cadastrar, por
 * exemplo) faz UPDATE na própria linha — abrir uma segunda vigência com a
 * mesma data de início violaria a exclusão de sobreposição do banco
 * (`EXCLUDE USING gist` em `002_folha.sql`), e semanticamente não houve dois
 * contratos, só uma correção do mesmo.
 */
export async function atualizarFuncionario(
  ator: Ator,
  employeeId: string,
  dados: Partial<FuncionarioEntrada>,
): Promise<void> {
  await transacao(ator, (c) => atualizarFuncionarioTx(c, ator, employeeId, dados));
}

// ---------------------------------------------------------------- aprovação das alterações do RH
//
// Tudo que o RH muda e que importa (salário, vínculo, lançamentos do mês, criar, desligar, excluir)
// VALE NA HORA e abre uma solicitação para a Direção aceitar ou recusar. Recusar devolve ao que era.
// Exceção: excluir não tem volta, então o pedido só executa quando a Direção aceita.

type Foto = Record<string, unknown>;
interface Revisao {
  acao: "EDITAR" | "MOVIMENTO" | "PRESTADOR" | "CRIAR" | "DESLIGAR" | "EXCLUIR" | "LOTACAO_VINCULO";
  /** Só LOTACAO_VINCULO: cada linha da lotação ligada (antes → depois). */
  itens?: Array<{ linhaId: string; antes: string | null; depois: string | null; professor: string | null; disciplina: string; nomeCadastro: string | null }>;
  chave?: string;
  employeeId: string;
  campos?: string[];
  antes?: Foto;
  depois?: Foto;
  competencia?: string;
  nome?: string;
}

/** Campos do cadastro que mexem em quanto a pessoa recebe. */
const CAMPOS_SENSIVEIS = [
  "regime", "salarioBaseCentavos", "cargaHorariaSemanal", "valorHoraAulaCentavos", "aulasSemanais",
  "valorHoraCentavos", "horasSemanais", "empresaCodigo", "temTicket", "valorTicketCentavos", "ticketSoma",
  "temMei", "valorMeiCentavos", "valorCltCentavos", "dataAdmissao", "cargasPorSegmento",
] as const;

const ROTULO_CAMPO: Record<string, string> = {
  regime: "Regime", salarioBaseCentavos: "Salário base", cargaHorariaSemanal: "Carga horária semanal",
  valorHoraAulaCentavos: "Valor da hora-aula", aulasSemanais: "Aulas por semana", valorHoraCentavos: "Valor da hora",
  horasSemanais: "Horas por semana", empresaCodigo: "Empresa pagadora", temTicket: "Recebe Ticket",
  valorTicketCentavos: "Valor do Ticket", ticketSoma: "Ticket soma (em vez de descontar)", temMei: "Recebe parte como MEI",
  valorMeiCentavos: "Valor do MEI", valorCltCentavos: "Valor CLT informado", dataAdmissao: "Data de admissão",
  cargasPorSegmento: "Carga por segmento",
  // lançamento do mês
  aulasExtrasSemanais: "Aula extra / projeto semanal", valorHoraExtra: "Hora-aula da carga extra", aulasExtras: "Aulas extras",
  aulasSubstituicao: "Aulas avulsas", aulasNoturnas: "Aulas noturnas", aulasNaoDadas: "Aulas não dadas",
  semanasFalta: "Semanas de falta", horasExtras50: "Horas extras 50%", horasExtras100: "Horas extras 100%",
  diasFalta: "Dias de falta", horasNoturnas: "Horas noturnas", valeTransporte: "Vale-transporte",
  pensaoModo: "Pensão (modo)", pensaoQuantidade: "Pensão (valor)", remuneracaoOutrosVinculos: "Remuneração em outros vínculos",
  inssOutrosVinculos: "INSS em outros vínculos", descontoOutrosObs: "Observação dos outros descontos",
  descontoCantina: "Desconto: Cantina", descontoMaterial: "Desconto: Material escolar", descontoMensalidade: "Desconto: Mensalidade",
  descontoPlanoSaude: "Desconto: Plano de saúde", descontoAdiantamento: "Desconto: Adiantamento (vale)",
  descontoRobotica: "Desconto: Robótica", descontoEmprestimos: "Desconto: Empréstimos", descontoOutros: "Desconto: Outros",
  // prestador (MEI/PJ)
  valorMensalCentavos: "Valor da nota (mensal)", descontosFixos: "Descontos fixos", servico: "Serviço",
  enquadramento: "Enquadramento", servicoComCppNoMei: "Serviço com CPP no MEI",
};

const CAMPOS_DINHEIRO = new Set([
  "valorHoraExtra", "valeTransporte", "remuneracaoOutrosVinculos", "inssOutrosVinculos",
  "descontoCantina", "descontoMaterial", "descontoMensalidade", "descontoPlanoSaude", "descontoAdiantamento",
  "descontoRobotica", "descontoEmprestimos", "descontoOutros",
]);

function textoValorCampo(campo: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (campo.endsWith("Centavos") || CAMPOS_DINHEIRO.has(campo)) {
    return "R$ " + (Number(v) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (campo === "cargasPorSegmento") {
    const l = v as Array<{ segmento: string; aulas: number }>;
    return l.length ? l.map((x) => `${x.segmento} ${x.aulas}`).join(", ") : "—";
  }
  if (campo === "descontosFixos") {
    const l = v as Array<{ nome: string; valor: number }>;
    return l.length ? l.map((x) => `${x.nome} ${(x.valor / 100).toFixed(2).replace(".", ",")}`).join(", ") : "—";
  }
  if (campo === "dataAdmissao") return String(v).split("-").reverse().join("/");
  return String(v);
}

function diferencas(antes: Foto, depois: Foto): string[] {
  const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  return [...chaves].filter((k) => JSON.stringify(antes[k] ?? null) !== JSON.stringify(depois[k] ?? null));
}

async function nomeDaPessoa(c: pg.PoolClient, employeeId: string): Promise<string> {
  const r = await c.query("SELECT p.nome FROM employees e JOIN pessoas p ON p.id = e.pessoa_id WHERE e.id = $1", [employeeId]);
  return (r.rows[0]?.nome as string) ?? "";
}

async function nomeDoUsuario(c: pg.PoolClient, userId: string | null): Promise<string> {
  if (!userId) return "RH";
  return ((await c.query("SELECT nome FROM users WHERE id = $1", [userId])).rows[0]?.nome as string) ?? "RH";
}

/**
 * Abre a solicitação para a Direção. Se o mesmo autor já tem uma aberta para a mesma coisa (mesma `chave`),
 * junta nela — a Direção vê um pedido só, do primeiro "antes" ao último "depois". Se a pessoa desfez tudo, cancela.
 */
async function registrarRevisao(
  c: pg.PoolClient,
  ator: Ator,
  p: { titulo: string; textoAcao: string; revisao: Revisao },
): Promise<{ numero: number }> {
  const quem = await nomeDoUsuario(c, ator.userId);
  const juntavel = p.revisao.chave && (p.revisao.acao === "EDITAR" || p.revisao.acao === "MOVIMENTO" || p.revisao.acao === "PRESTADOR");
  if (juntavel) {
    const aberta = (await c.query(
      `SELECT id, numero, revisao FROM solicitacoes
        WHERE tipo = 'ALTERACAO_CADASTRO' AND status = 'EM_APROVACAO' AND solicitante_id = $1 AND revisao->>'chave' = $2
        FOR UPDATE`,
      [ator.userId, p.revisao.chave],
    )).rows[0] as { id: string; numero: string; revisao: Revisao } | undefined;
    // Só junta se ninguém (por exemplo a Direção) mexeu nisso depois do pedido aberto.
    if (aberta && diferencas(aberta.revisao.depois ?? {}, p.revisao.antes ?? {}).length === 0) {
      const antes = aberta.revisao.antes ?? {};
      const depois = p.revisao.depois ?? {};
      const campos = diferencas(antes, depois);
      if (!campos.length) {
        await c.query("UPDATE solicitacoes SET status = 'CANCELADO' WHERE id = $1", [aberta.id]);
        return { numero: Number(aberta.numero) };
      }
      const resumo = campos.map((k) => `${ROTULO_CAMPO[k] ?? k}: ${textoValorCampo(k, antes[k])} → ${textoValorCampo(k, depois[k])}`).join("; ");
      await c.query(
        "UPDATE solicitacoes SET revisao = $2, justificativa = $3 WHERE id = $1",
        [aberta.id, JSON.stringify({ ...aberta.revisao, depois, campos }),
          `${quem} alterou (já está valendo): ${resumo}. Aceitar mantém; recusar volta como estava.`],
      );
      return { numero: Number(aberta.numero) };
    }
  }
  const r = await c.query(
    `INSERT INTO solicitacoes
       (tipo, titulo, justificativa, solicitante_id, perfil_solicitante, urgencia, cadeia_perfis, etapa_atual, status, revisao)
     VALUES ('ALTERACAO_CADASTRO', $1, $2, $3, 'RH', 'NORMAL', ARRAY['DIRECAO'], 0, 'EM_APROVACAO', $4) RETURNING numero`,
    [p.titulo, p.textoAcao.replace("{quem}", quem), ator.userId, JSON.stringify(p.revisao)],
  );
  return { numero: Number(r.rows[0].numero) };
}

function textoResumo(antes: Foto, depois: Foto, campos: string[]): string {
  return campos.map((k) => `${ROTULO_CAMPO[k] ?? k}: ${textoValorCampo(k, antes[k])} → ${textoValorCampo(k, depois[k])}`).join("; ");
}

// ---- cadastro (salário, vínculo...)

async function fotoSensivel(c: pg.PoolClient, employeeId: string): Promise<Foto> {
  const r = await c.query(
    `SELECT to_char(e.data_admissao,'YYYY-MM-DD') AS adm, e.ticket_soma, emp.codigo AS empresa,
            cr.id AS contrato_id, cr.regime, cr.salario_base_centavos, cr.carga_horaria_semanal,
            cr.valor_hora_aula_centavos, cr.aulas_semanais, cr.valor_hora_centavos, cr.horas_semanais,
            cr.tem_ticket, cr.valor_ticket_centavos, cr.tem_mei, cr.valor_mei_centavos, cr.valor_clt_centavos
       FROM employees e
       LEFT JOIN LATERAL (SELECT * FROM contratos_remuneracao x WHERE x.employee_id = e.id
                           ORDER BY x.vigencia_inicio DESC LIMIT 1) cr ON true
       LEFT JOIN empresas emp ON emp.id = cr.empresa_id
      WHERE e.id = $1`,
    [employeeId],
  );
  if (!r.rowCount) throw Object.assign(new Error("Funcionário não encontrado."), { statusCode: 404 });
  const l = r.rows[0];
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const cargas = l.contrato_id
    ? (await c.query(
        "SELECT segmento, aulas, valor_hora_centavos FROM contrato_cargas_segmento WHERE contrato_id = $1 ORDER BY segmento",
        [l.contrato_id],
      )).rows.map((x: { segmento: string; aulas: string; valor_hora_centavos: string | null }) => ({
        segmento: x.segmento, aulas: Number(x.aulas), valorHoraCentavos: n(x.valor_hora_centavos),
      }))
    : [];
  return {
    regime: l.regime ?? null, salarioBaseCentavos: n(l.salario_base_centavos), cargaHorariaSemanal: n(l.carga_horaria_semanal),
    valorHoraAulaCentavos: n(l.valor_hora_aula_centavos), aulasSemanais: n(l.aulas_semanais),
    valorHoraCentavos: n(l.valor_hora_centavos), horasSemanais: n(l.horas_semanais), empresaCodigo: l.empresa ?? null,
    temTicket: !!l.tem_ticket, valorTicketCentavos: n(l.valor_ticket_centavos) ?? 0, ticketSoma: !!l.ticket_soma,
    temMei: !!l.tem_mei, valorMeiCentavos: n(l.valor_mei_centavos) ?? 0, valorCltCentavos: n(l.valor_clt_centavos) ?? 0,
    dataAdmissao: l.adm ?? null, cargasPorSegmento: cargas,
  };
}

/** Edita o cadastro; RH: vale na hora e abre pedido para a Direção. */
export async function atualizarFuncionarioComRevisao(
  ator: Ator,
  ehDirecao: boolean,
  employeeId: string,
  dados: Partial<FuncionarioEntrada>,
): Promise<{ aprovacao?: { numero: number } }> {
  return transacao(ator, async (c) => {
    if (ehDirecao) {
      await atualizarFuncionarioTx(c, ator, employeeId, dados);
      return {};
    }
    const antes = await fotoSensivel(c, employeeId);
    await atualizarFuncionarioTx(c, ator, employeeId, dados);
    const depois = await fotoSensivel(c, employeeId);
    const campos = diferencas(antes, depois);
    if (!campos.length) return {};
    const nome = await nomeDaPessoa(c, employeeId);
    const aprovacao = await registrarRevisao(c, ator, {
      titulo: `Alteração de cadastro — ${nome}`,
      textoAcao: `{quem} alterou (já está valendo): ${textoResumo(antes, depois, campos)}. Aceitar mantém; recusar volta como estava.`,
      revisao: { acao: "EDITAR", chave: `cad:${employeeId}`, employeeId, campos, antes, depois, nome },
    });
    return { aprovacao };
  });
}

/** Dos campos que o RH mudou, só os que continuam como ele deixou (se a Direção mexeu depois, isso fica). */
function camposAindaComoRhDeixou(rv: Revisao, atual: Foto): string[] {
  return (rv.campos ?? []).filter((k) => JSON.stringify(atual[k] ?? null) === JSON.stringify((rv.depois ?? {})[k] ?? null));
}

async function reverterCadastro(c: pg.PoolClient, ator: Ator, rv: Revisao): Promise<void> {
  const antes = rv.antes ?? {};
  const dados: Record<string, unknown> = {};
  const campos = camposAindaComoRhDeixou(rv, await fotoSensivel(c, rv.employeeId));
  rv = { ...rv, campos };
  if (!campos.length) return;
  for (const k of rv.campos ?? []) {
    const v = antes[k];
    if (v !== null && v !== undefined) dados[k] = v;
  }
  if ((rv.campos ?? []).some((k) => k === "temTicket" || k === "valorTicketCentavos")) {
    dados.temTicket = antes.temTicket; dados.valorTicketCentavos = antes.valorTicketCentavos;
  }
  if ((rv.campos ?? []).some((k) => k === "temMei" || k === "valorMeiCentavos")) {
    dados.temMei = antes.temMei; dados.valorMeiCentavos = antes.valorMeiCentavos;
  }
  await atualizarFuncionarioTx(c, ator, rv.employeeId, dados as Partial<FuncionarioEntrada>);
}

// ---- lançamento do mês (movimento)

function colunasMovimento(): Array<[string, string]> {
  return [
  ["aulasExtrasSemanais", "aulas_extras_semanais"], ["valorHoraExtra", "valor_hora_extra_centavos"], ["aulasExtras", "aulas_extras"],
  ["aulasSubstituicao", "aulas_substituicao"], ["aulasNoturnas", "aulas_noturnas"], ["aulasNaoDadas", "aulas_nao_dadas"],
  ["semanasFalta", "semanas_falta_injustificada"], ["horasExtras50", "horas_extras_50"], ["horasExtras100", "horas_extras_100"],
  ["diasFalta", "dias_falta"], ["horasNoturnas", "horas_noturnas"], ["valeTransporte", "vale_transporte_centavos"],
  ["pensaoModo", "pensao_modo"], ["pensaoQuantidade", "pensao_quantidade"],
  ["remuneracaoOutrosVinculos", "remuneracao_outros_vinculos_centavos"], ["inssOutrosVinculos", "inss_outros_vinculos_centavos"],
  ["descontoOutrosObs", "desconto_outros_obs"],
  ...DESCONTOS_MES.map((d) => [d.campo, d.coluna] as [string, string]),
];
}

async function fotoMovimento(c: pg.PoolClient, periodoId: string, employeeId: string): Promise<Foto> {
  const r = await c.query(
    `SELECT ${colunasMovimento().map(([, col]) => col).join(", ")} FROM folha_movimentos WHERE periodo_id = $1 AND employee_id = $2`,
    [periodoId, employeeId],
  );
  const l = r.rows[0] ?? {};
  const foto: Foto = {};
  for (const [campo, col] of colunasMovimento()) {
    const v = l[col];
    foto[campo] = v === null || v === undefined ? null : (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
  }
  return foto;
}

/** Lançamento do mês (aula extra, projeto, faltas, descontos...); RH: vale na hora e abre pedido. */
export async function atualizarMovimentoComRevisao(
  ator: Ator,
  ehDirecao: boolean,
  competencia: string,
  employeeId: string,
  dados: MovimentoEntrada,
): Promise<{ aprovacao?: { numero: number } }> {
  validarMovimento(dados);
  const comp = normalizar(competencia);
  return transacao(ator, async (c) => {
    if (ehDirecao) {
      await atualizarMovimentoTx(c, comp, employeeId, dados);
      return {};
    }
    const per = (await c.query(
      `SELECT id, status FROM folha_periodos WHERE competencia = $1 AND tipo_folha = 'MENSAL'`, [comp],
    )).rows[0] as { id: string; status: string } | undefined;
    if (per && per.status !== "FECHADO") await garantirMovimento(c, per.id, employeeId);
    const antes = per ? await fotoMovimento(c, per.id, employeeId) : {};
    const { periodoId } = await atualizarMovimentoTx(c, comp, employeeId, dados);
    const depois = await fotoMovimento(c, periodoId, employeeId);
    const campos = diferencas(antes, depois);
    if (!campos.length) return {};
    const nome = await nomeDaPessoa(c, employeeId);
    const mes = `${comp.slice(5)}/${comp.slice(0, 4)}`;
    const aprovacao = await registrarRevisao(c, ator, {
      titulo: `Lançamento de ${mes} — ${nome}`,
      textoAcao: `{quem} lançou em ${mes} (já está valendo): ${textoResumo(antes, depois, campos)}. Aceitar mantém; recusar volta como estava.`,
      revisao: { acao: "MOVIMENTO", chave: `mov:${comp}:${employeeId}`, employeeId, competencia: comp, campos, antes, depois, nome },
    });
    return { aprovacao };
  });
}

async function reverterMovimento(c: pg.PoolClient, rv: Revisao): Promise<void> {
  const comp = rv.competencia as string;
  const per = (await c.query(
    `SELECT id, status FROM folha_periodos WHERE competencia = $1 AND tipo_folha = 'MENSAL'`, [comp],
  )).rows[0] as { id: string; status: string } | undefined;
  if (!per) throw Object.assign(new Error("A competência desse lançamento não existe mais."), { statusCode: 409 });
  if (per.status === "FECHADO") {
    throw Object.assign(new Error("A competência desse lançamento já foi fechada: reabra antes de recusar e voltar o lançamento."), { statusCode: 409 });
  }
  const sets: string[] = [];
  const valores: unknown[] = [];
  const aindaCampos = camposAindaComoRhDeixou(rv, await fotoMovimento(c, per.id, rv.employeeId));
  for (const k of aindaCampos) {
    const col = colunasMovimento().find(([campo]) => campo === k)?.[1];
    if (!col) continue;
    valores.push((rv.antes ?? {})[k] ?? null);
    sets.push(`${col} = $${valores.length}`);
  }
  if (!sets.length) return;
  valores.push(per.id, rv.employeeId);
  await c.query(
    `UPDATE folha_movimentos SET ${sets.join(", ")} WHERE periodo_id = $${valores.length - 1} AND employee_id = $${valores.length}`,
    valores,
  );
}

// ---- prestador (MEI/PJ): valor da nota, descontos, serviço

async function fotoPrestador(c: pg.PoolClient, employeeId: string): Promise<Foto> {
  const r = await c.query(
    `SELECT cp.valor_mensal_centavos, cp.descontos_fixos, cp.servico, cp.enquadramento, cp.servico_com_cpp_no_mei, emp.codigo AS empresa,
            cp.tem_ticket, cp.valor_ticket_centavos,
            to_char(e.data_admissao,'YYYY-MM-DD') AS adm
       FROM contratos_prestador cp LEFT JOIN empresas emp ON emp.id = cp.empresa_id
       JOIN employees e ON e.id = cp.employee_id
      WHERE cp.employee_id = $1 AND cp.data_fim IS NULL LIMIT 1`,
    [employeeId],
  );
  const l = r.rows[0];
  if (!l) return {};
  return {
    valorMensalCentavos: l.valor_mensal_centavos === null ? null : Number(l.valor_mensal_centavos),
    descontosFixos: l.descontos_fixos ?? [], servico: l.servico ?? null, enquadramento: l.enquadramento ?? null,
    servicoComCppNoMei: !!l.servico_com_cpp_no_mei, empresaCodigo: l.empresa ?? null,
    dataAdmissao: l.adm ?? null,
    temTicket: !!l.tem_ticket, valorTicketCentavos: Number(l.valor_ticket_centavos ?? 0),
  };
}

export async function atualizarPrestadorComRevisao(
  ator: Ator,
  ehDirecao: boolean,
  employeeId: string,
  dados: DadosPrestador,
): Promise<{ aprovacao?: { numero: number } }> {
  return transacao(ator, async (c) => {
    if (ehDirecao) {
      await atualizarPrestadorTx(c, employeeId, dados);
      return {};
    }
    const antes = await fotoPrestador(c, employeeId);
    await atualizarPrestadorTx(c, employeeId, dados);
    const depois = await fotoPrestador(c, employeeId);
    const campos = diferencas(antes, depois);
    if (!campos.length) return {};
    const nome = await nomeDaPessoa(c, employeeId);
    const aprovacao = await registrarRevisao(c, ator, {
      titulo: `Alteração de prestador — ${nome}`,
      textoAcao: `{quem} alterou (já está valendo): ${textoResumo(antes, depois, campos)}. Aceitar mantém; recusar volta como estava.`,
      revisao: { acao: "PRESTADOR", chave: `prest:${employeeId}`, employeeId, campos, antes, depois, nome },
    });
    return { aprovacao };
  });
}

async function reverterPrestador(c: pg.PoolClient, rv: Revisao): Promise<void> {
  const antes = rv.antes ?? {};
  const dados: Record<string, unknown> = {};
  for (const k of camposAindaComoRhDeixou(rv, await fotoPrestador(c, rv.employeeId))) {
    if (antes[k] !== null && antes[k] !== undefined) dados[k] = antes[k];
  }
  if (!Object.keys(dados).length) return;
  await atualizarPrestadorTx(c, rv.employeeId, dados as DadosPrestador);
}

// ---- criar, desligar e excluir

/** Cadastro novo feito pelo RH: já existe, e a Direção aceita ou recusa (recusar apaga o cadastro novo). */
export async function registrarCriacaoParaAprovacao(
  ator: Ator,
  ehDirecao: boolean,
  employeeId: string,
): Promise<{ aprovacao?: { numero: number } }> {
  if (ehDirecao) return {};
  return transacao(ator, async (c) => {
    const nome = await nomeDaPessoa(c, employeeId);
    const aprovacao = await registrarRevisao(c, ator, {
      titulo: `Cadastro novo — ${nome}`,
      textoAcao: `{quem} cadastrou ${nome} (já está no sistema). Aceitar mantém; recusar apaga o cadastro novo.`,
      revisao: { acao: "CRIAR", employeeId, nome },
    });
    return { aprovacao };
  });
}

/** Desligamento feito pelo RH: já vale; recusar reativa a pessoa. */
export async function desligarFuncionarioComRevisao(
  ator: Ator,
  ehDirecao: boolean,
  employeeId: string,
  dataDesligamento: string,
): Promise<{ aprovacao?: { numero: number } }> {
  if (ehDirecao) {
    await desligarFuncionario(ator, employeeId, dataDesligamento);
    return {};
  }
  return transacao(ator, async (c) => {
    const e = (await c.query(
      "SELECT status, to_char(data_desligamento,'YYYY-MM-DD') AS d FROM employees WHERE id = $1", [employeeId],
    )).rows[0] as { status: string; d: string | null } | undefined;
    if (!e) throw Object.assign(new Error("Funcionário não encontrado."), { statusCode: 404 });
    await c.query("UPDATE employees SET status = 'DESLIGADO', data_desligamento = $2 WHERE id = $1", [employeeId, dataDesligamento]);
    const nome = await nomeDaPessoa(c, employeeId);
    const aprovacao = await registrarRevisao(c, ator, {
      titulo: `Desligamento — ${nome}`,
      textoAcao: `{quem} desligou ${nome} a partir de ${dataDesligamento.split("-").reverse().join("/")} (já está valendo). Aceitar mantém; recusar reativa a pessoa.`,
      revisao: { acao: "DESLIGAR", employeeId, nome, antes: { status: e.status, dataDesligamento: e.d }, depois: { status: "DESLIGADO", dataDesligamento } },
    });
    return { aprovacao };
  });
}

/** Exclusão pedida pelo RH: não tem volta, então só executa quando a Direção aceitar. */
export async function pedirExclusaoFuncionario(
  ator: Ator,
  employeeId: string,
): Promise<{ aprovacao: { numero: number; executaDepois: true } }> {
  return transacao(ator, async (c) => {
    await verificarExclusaoPossivel(c, employeeId);
    const nome = await nomeDaPessoa(c, employeeId);
    const aprovacao = await registrarRevisao(c, ator, {
      titulo: `Exclusão de cadastro — ${nome}`,
      textoAcao: `{quem} pediu para EXCLUIR o cadastro de ${nome}. Nada foi apagado ainda: aceitar exclui de vez; recusar mantém.`,
      revisao: { acao: "EXCLUIR", employeeId, nome },
    });
    return { aprovacao: { ...aprovacao, executaDepois: true as const } };
  });
}

/** O que acontece quando a Direção decide uma alteração do RH. */
async function aplicarDecisaoRevisao(
  c: pg.PoolClient,
  ator: Ator,
  rv: Revisao,
  status: "APROVADO" | "REJEITADO",
): Promise<void> {
  const acao = rv.acao ?? "EDITAR";
  if (status === "REJEITADO") {
    if (acao === "EDITAR") await reverterCadastro(c, ator, rv);
    else if (acao === "MOVIMENTO") await reverterMovimento(c, rv);
    else if (acao === "PRESTADOR") await reverterPrestador(c, rv);
    else if (acao === "CRIAR") await excluirFuncionarioTx(c, rv.employeeId);
    else if (acao === "LOTACAO_VINCULO") {
      // Desfaz só a ligação que continua como ficou — se alguém já trocou
      // depois, vale a troca mais nova.
      for (const it of rv.itens ?? []) {
        await c.query(
          "UPDATE lotacao_linhas SET employee_id = $2, atualizado_em = now() WHERE id = $1 AND employee_id IS NOT DISTINCT FROM $3",
          [it.linhaId, it.antes, it.depois]);
      }
    }
    else if (acao === "DESLIGAR") {
      const a = rv.antes as { status: string; dataDesligamento: string | null };
      await c.query("UPDATE employees SET status = $2, data_desligamento = $3 WHERE id = $1", [rv.employeeId, a.status, a.dataDesligamento]);
    }
  } else if (acao === "EXCLUIR") {
    await excluirFuncionarioTx(c, rv.employeeId);
  }
}

type DadosIdentidade = { nome?: string; cpf?: string; matricula?: string; cargo?: string; departamento?: string };

/** Nome, CPF, matrícula, cargo e setor: iguais para CLT e prestador. */
async function atualizarIdentidadeTx(c: pg.PoolClient, employeeId: string, pessoaId: string, dados: DadosIdentidade): Promise<void> {
  if (dados.nome !== undefined && !String(dados.nome).trim()) {
    throw Object.assign(new Error("O nome não pode ficar em branco."), { statusCode: 422 });
  }
  if (dados.nome) await c.query("UPDATE pessoas SET nome = $2 WHERE id = $1", [pessoaId, dados.nome]);
  if (dados.cpf) {
    validarCpf(dados.cpf);
    const cpfHash = hashDocumento(dados.cpf);
    await c.query("UPDATE pessoas SET cpf_cifrado = $2, cpf_hash = $3 WHERE id = $1",
      [pessoaId, cifrarDocumento(dados.cpf), cpfHash]);
  }
  if (dados.matricula || dados.cargo !== undefined || dados.departamento !== undefined) {
    const cargoId = dados.cargo !== undefined ? await acharOuCriar(c, "cargos", dados.cargo) : undefined;
    const departamentoId = dados.departamento !== undefined ? await acharOuCriar(c, "departments", dados.departamento) : undefined;
    const campos: string[] = [];
    const valores: unknown[] = [];
    if (dados.matricula) { valores.push(dados.matricula); campos.push(`matricula = $${valores.length}`); }
    if (cargoId !== undefined) { valores.push(cargoId); campos.push(`cargo_id = $${valores.length}`); }
    if (departamentoId !== undefined) { valores.push(departamentoId); campos.push(`department_id = $${valores.length}`); }
    valores.push(employeeId);
    await c.query(`UPDATE employees SET ${campos.join(", ")} WHERE id = $${valores.length}`, valores);
  }
}

async function atualizarFuncionarioTx(
  c: pg.PoolClient,
  ator: Ator,
  employeeId: string,
  dados: Partial<FuncionarioEntrada>,
): Promise<void> {
  const atual = await c.query(
    `SELECT e.pessoa_id, e.tipo_contrato, cr.id AS contrato_id, to_char(cr.vigencia_inicio, 'YYYY-MM-DD') AS vigencia_inicio,
            cr.regime, cr.dependentes_irrf, cr.valor_hora_aula_centavos, cr.aulas_semanais,
            cr.salario_base_centavos, cr.carga_horaria_semanal, cr.valor_hora_centavos, cr.horas_semanais,
            cr.cct_id, cr.empresa_id, cr.tem_clt, cr.tem_ticket, cr.tem_mei,
            cr.valor_clt_centavos, cr.valor_ticket_centavos, cr.valor_mei_centavos
       FROM employees e
       LEFT JOIN LATERAL (
         SELECT * FROM contratos_remuneracao cr2
          WHERE cr2.employee_id = e.id ORDER BY cr2.vigencia_inicio DESC LIMIT 1
       ) cr ON true
      WHERE e.id = $1`,
    [employeeId],
  );
  if (!atual.rowCount) throw Object.assign(new Error("Funcionário não encontrado."), { statusCode: 404 });
  const linha = atual.rows[0];
  // Prestador MEI/PJ tem contrato próprio: pedir regime CLT aqui não faria
  // nada e o formulário diria "salvo" — melhor recusar com a explicação.
  if (linha.tipo_contrato === "PJ" && dados.regime && dados.regime !== ("PRESTADOR_PJ" as never)) {
    throw Object.assign(new Error("Este cadastro é de prestador MEI/PJ e não pode virar CLT por aqui. Desligue e cadastre como CLT."), { statusCode: 422 });
  }

  await atualizarIdentidadeTx(c, employeeId, linha.pessoa_id, dados);

  // Independente do resto: editar QUEM dá aula em qual segmento não muda
  // valor nem abre um contrato novo (não é reajuste), só descreve melhor
  // o contrato vigente — por isso fica fora do `mudouRemuneracao` abaixo.
  if (dados.cargasPorSegmento !== undefined && linha.contrato_id) {
    validarCargasSegmento(dados.cargasPorSegmento, dados.aulasSemanais ?? linha.aulas_semanais);
    // Editar só as aulas de cada segmento não pode apagar o valor da hora-aula:
    // o segmento herda o que já tinha ou, se não tinha, a hora-aula do contrato
    // (antes ficava em branco e o segmento era pago como R$ 0,00).
    const anteriores = await c.query(
      "SELECT segmento, valor_hora_centavos AS v FROM contrato_cargas_segmento WHERE contrato_id = $1",
      [linha.contrato_id],
    );
    const valorAnterior = new Map<string, number | null>(anteriores.rows.map((r: { segmento: string; v: number | null }) => [r.segmento, r.v]));
    const horaDoContrato = (dados.valorHoraAulaCentavos ?? linha.valor_hora_aula_centavos) as number | null;
    await gravarCargasSegmento(c, linha.contrato_id, dados.cargasPorSegmento.map((carga) => {
      const valor = carga.valorHoraCentavos ?? valorAnterior.get(carga.segmento) ?? horaDoContrato ?? undefined;
      return valor === undefined || valor === null ? carga : { ...carga, valorHoraCentavos: valor };
    }));
  }

  // Valor "CLT" mostrado no vínculo (CLT + Ticket): é informativo, não entra no cálculo.
  // Corrige o contrato vigente no lugar, sem abrir contrato novo.
  if (dados.valorCltCentavos !== undefined && linha.contrato_id) {
    await c.query("UPDATE contratos_remuneracao SET valor_clt_centavos = $2 WHERE id = $1", [linha.contrato_id, dados.valorCltCentavos]);
  }

  // Data de admissão: corrige a data da pessoa. Se ela passa a começar antes do primeiro contrato,
  // o primeiro contrato passa a valer desde o mês da nova admissão (senão a folha daquele mês ficaria sem contrato).
  if (dados.dataAdmissao !== undefined) {
    validarNomeEData("x", dados.dataAdmissao);
    const antiga = (await c.query("SELECT to_char(data_admissao,'YYYY-MM-DD') AS d FROM employees WHERE id = $1", [employeeId])).rows[0] as { d: string } | undefined;
    await c.query("UPDATE employees SET data_admissao = $2 WHERE id = $1", [employeeId, dados.dataAdmissao]);
    const primeiro = (await c.query(
      `SELECT id, to_char(vigencia_inicio,'YYYY-MM-DD') AS ini FROM contratos_remuneracao
        WHERE employee_id = $1 ORDER BY vigencia_inicio ASC LIMIT 1`,
      [employeeId],
    )).rows[0] as { id: string; ini: string } | undefined;
    const novoInicio = dados.dataAdmissao.slice(0, 7) + "-01";
    // Admissão que anda para a frente: o primeiro contrato, se começava no mês da admissão antiga, acompanha.
    const inicioAntigo = antiga ? antiga.d.slice(0, 7) + "-01" : null;
    if (primeiro && novoInicio > primeiro.ini && primeiro.ini === inicioAntigo) {
      const segundo = (await c.query(
        `SELECT to_char(vigencia_inicio,'YYYY-MM-DD') AS ini FROM contratos_remuneracao
          WHERE employee_id = $1 AND id <> $2 ORDER BY vigencia_inicio ASC LIMIT 1`,
        [employeeId, primeiro.id],
      )).rows[0] as { ini: string } | undefined;
      const travadoAntes = await c.query(
        `SELECT 1 FROM folha_calculos fc JOIN folha_periodos p ON p.id = fc.periodo_id
          WHERE fc.employee_id = $1 AND folha_periodo_travado(p.status) AND (p.competencia || '-01') < $2 LIMIT 1`,
        [employeeId, novoInicio],
      );
      if (travadoAntes.rowCount) {
        throw Object.assign(new Error("Há folha fechada antes dessa admissão: reabra antes de adiar a admissão."), { statusCode: 422 });
      }
      if (!segundo || segundo.ini > novoInicio) {
        await c.query("UPDATE contratos_remuneracao SET vigencia_inicio = $2::date WHERE id = $1", [primeiro.id, novoInicio]);
      }
    }
    if (primeiro && novoInicio < primeiro.ini) {
      const travado = await c.query(
        `SELECT 1 FROM folha_calculos fc JOIN folha_periodos p ON p.id = fc.periodo_id
          WHERE fc.employee_id = $1 AND folha_periodo_travado(p.status) AND (p.competencia || '-01') >= $2 LIMIT 1`,
        [employeeId, novoInicio],
      );
      if (travado.rowCount) {
        throw Object.assign(new Error("Há folha fechada a partir do mês dessa admissão: reabra antes de antecipar a admissão."), { statusCode: 422 });
      }
      await c.query("UPDATE contratos_remuneracao SET vigencia_inicio = $2::date WHERE id = $1", [primeiro.id, novoInicio]);
    }
  }

  // Marca da pessoa (não do contrato): como o Ticket entra na folha. Não abre contrato novo.
  if (dados.ticketSoma !== undefined) {
    await c.query("UPDATE employees SET ticket_soma = $2 WHERE id = $1", [employeeId, dados.ticketSoma]);
  }

  const mudouRemuneracao = CAMPOS_REMUNERACAO_ALTERAM_CONTRATO.some(
    (campo) => dados[campo] !== undefined,
  );
  if (!mudouRemuneracao || !linha.contrato_id) return;

  const empresaId = dados.empresaCodigo !== undefined
    ? await empresaIdPorCodigo(c, dados.empresaCodigo)
    : linha.empresa_id;
  // Desmarcar a bandeira zera o valor: o valor antigo não pode sobreviver
  // e reacender o vínculo (o banco exige valor e bandeira coerentes).
  const valorTicket = dados.temTicket === false ? 0 : (dados.valorTicketCentavos ?? linha.valor_ticket_centavos);
  const valorMei = dados.temMei === false ? 0 : (dados.valorMeiCentavos ?? linha.valor_mei_centavos);
  const mesclado = {
    regime: dados.regime ?? linha.regime,
    dependentesIrrf: dados.dependentesIrrf ?? linha.dependentes_irrf,
    valorHoraAulaCentavos: dados.valorHoraAulaCentavos ?? linha.valor_hora_aula_centavos,
    aulasSemanais: dados.aulasSemanais ?? linha.aulas_semanais,
    salarioBaseCentavos: dados.salarioBaseCentavos ?? linha.salario_base_centavos,
    cargaHorariaSemanal: dados.cargaHorariaSemanal ?? linha.carga_horaria_semanal,
    valorHoraCentavos: dados.valorHoraCentavos ?? linha.valor_hora_centavos,
    horasSemanais: dados.horasSemanais ?? linha.horas_semanais,
    empresaId,
    // O valor sozinho já implica a bandeira, igual em `criarFuncionario` —
    // sem isto, editar só o valor e esquecer o "Sim" faria o CHECK
    // `vinculo_valor_coerente_com_bandeira` recusar por um detalhe óbvio.
    temTicket: dados.temTicket === false ? false : (dados.temTicket ?? linha.tem_ticket) || valorTicket > 0,
    temMei: dados.temMei === false ? false : (dados.temMei ?? linha.tem_mei) || valorMei > 0,
    valorTicketCentavos: valorTicket,
    valorMeiCentavos: valorMei,
  };
  Object.assign(mesclado, soDoRegime(mesclado as never));
  let hoje = new Date().toISOString().slice(0, 7) + "-01";
  // Virou o mês mas a folha anterior ainda está aberta: a mudança vale desde
  // o mês que ainda está sendo trabalhado, não só do mês do calendário.
  const aberta = await c.query(
    `SELECT min(competencia) AS c FROM folha_periodos WHERE tipo_folha = 'MENSAL' AND NOT folha_periodo_travado(status)`,
  );
  const abertaDia = aberta.rows[0]?.c ? `${aberta.rows[0].c}-01` : null;
  if (abertaDia && abertaDia < hoje) hoje = abertaDia;
  // Contrato que sustenta folha fechada ou evento pago não muda: a
  // alteração abre um contrato novo, a partir do mês seguinte ao último
  // mês fechado com ele.
  const trava = (await c.query(
    `SELECT (SELECT max(p.competencia) FROM folha_calculos fc
               JOIN folha_periodos p ON p.id = fc.periodo_id
              WHERE fc.contrato_remuneracao_id = $1 AND folha_periodo_travado(p.status)) AS ultima,
            (SELECT count(*) FROM folha_decimo_terceiro WHERE contrato_remuneracao_id = $1 AND pago)
            + (SELECT count(*) FROM folha_ferias WHERE contrato_remuneracao_id = $1 AND pago)
            + (SELECT count(*) FROM folha_rescisoes WHERE contrato_remuneracao_id = $1 AND homologada) AS eventos`,
    [linha.contrato_id],
  )).rows[0] as { ultima: string | null; eventos: string };
  const congelado = !!trava.ultima || Number(trava.eventos) > 0;
  if (trava.ultima && `${trava.ultima}-01` >= hoje) {
    const [a, m] = trava.ultima.split("-").map(Number) as [number, number];
    hoje = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
  }

  // Contrato que começou neste mês (ou depois, admissão no meio do mês) e
  // não sustenta nada fechado: corrige a própria linha em vez de abrir outra.
  if (!congelado && hoje <= linha.vigencia_inicio) {
    // Mesmo mês do contrato vigente: corrige a linha em vez de abrir outra.
    await c.query(
      `UPDATE contratos_remuneracao SET
         regime = $2, dependentes_irrf = $3, valor_hora_aula_centavos = $4, aulas_semanais = $5,
         salario_base_centavos = $6, carga_horaria_semanal = $7, valor_hora_centavos = $8, horas_semanais = $9,
         empresa_id = $10, tem_ticket = $11, tem_mei = $12,
         valor_ticket_centavos = $13, valor_mei_centavos = $14
       WHERE id = $1`,
      [linha.contrato_id, mesclado.regime, mesclado.dependentesIrrf, mesclado.valorHoraAulaCentavos,
        mesclado.aulasSemanais, mesclado.salarioBaseCentavos, mesclado.cargaHorariaSemanal,
        mesclado.valorHoraCentavos, mesclado.horasSemanais,
        mesclado.empresaId, mesclado.temTicket, mesclado.temMei,
        mesclado.valorTicketCentavos, mesclado.valorMeiCentavos],
    );
    if (mesclado.regime === "HORISTA_AULA" && dados.cargasPorSegmento === undefined && dados.aulasSemanais !== undefined && mesclado.aulasSemanais) {
      await acompanharAulasNosSegmentos(c, linha.contrato_id, Number(mesclado.aulasSemanais));
    }
    // A hora-aula que era igual à do contrato (ou estava em branco) acompanha a nova.
    if (mesclado.regime === "HORISTA_AULA" && dados.cargasPorSegmento === undefined && mesclado.valorHoraAulaCentavos) {
      await c.query(
        `UPDATE contrato_cargas_segmento SET valor_hora_centavos = $3
          WHERE contrato_id = $1 AND (valor_hora_centavos IS NULL OR valor_hora_centavos = $2
                OR (SELECT count(*) FROM contrato_cargas_segmento WHERE contrato_id = $1) = 1)`,
        [linha.contrato_id, linha.valor_hora_aula_centavos, mesclado.valorHoraAulaCentavos],
      );
    }
    return;
  }

  const cctId = mesclado.regime === linha.regime
    ? linha.cct_id
    : (await c.query(
        `SELECT id FROM folha_cct WHERE categoria = $1 ORDER BY vigencia_inicio DESC LIMIT 1`,
        [mesclado.regime === "HORISTA_AULA" ? "DOCENTE" : "ADMINISTRATIVO"],
      )).rows[0]?.id;
  if (!cctId) throw new Error("Nenhuma convenção coletiva cadastrada para este regime.");

  const ontem = new Date(new Date(hoje).getTime() - 86400000).toISOString().slice(0, 10);
  await c.query("UPDATE contratos_remuneracao SET vigencia_fim = $2 WHERE id = $1", [linha.contrato_id, ontem]);
  const novo = await c.query(
    `INSERT INTO contratos_remuneracao
       (employee_id, cct_id, regime, vigencia_inicio, dependentes_irrf,
        valor_hora_aula_centavos, aulas_semanais, salario_base_centavos, carga_horaria_semanal,
        valor_hora_centavos, horas_semanais, empresa_id, tem_clt, tem_ticket, tem_mei,
        valor_clt_centavos, valor_ticket_centavos, valor_mei_centavos, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
    [
      employeeId, cctId, mesclado.regime, hoje, mesclado.dependentesIrrf,
      mesclado.valorHoraAulaCentavos, mesclado.aulasSemanais, mesclado.salarioBaseCentavos, mesclado.cargaHorariaSemanal,
      mesclado.valorHoraCentavos, mesclado.horasSemanais,
      mesclado.empresaId, linha.tem_clt, mesclado.temTicket, mesclado.temMei,
      linha.valor_clt_centavos, mesclado.valorTicketCentavos, mesclado.valorMeiCentavos,
      ator.userId,
    ],
  );
  // A divisão por segmento acompanha o contrato novo (senão sumia a cada
  // reajuste). Hora-aula que era igual à do contrato acompanha o reajuste.
  if (mesclado.regime === "HORISTA_AULA" && dados.cargasPorSegmento === undefined) {
    await c.query(
      `INSERT INTO contrato_cargas_segmento (contrato_id, segmento, aulas, valor_hora_centavos)
       SELECT $2, segmento, aulas,
              CASE WHEN valor_hora_centavos IS NULL OR valor_hora_centavos = $3::int
                   OR (SELECT count(*) FROM contrato_cargas_segmento WHERE contrato_id = $1) = 1
              THEN $4::int ELSE valor_hora_centavos END
         FROM contrato_cargas_segmento WHERE contrato_id = $1`,
      [linha.contrato_id, novo.rows[0].id, linha.valor_hora_aula_centavos, mesclado.valorHoraAulaCentavos],
    );
    if (dados.aulasSemanais !== undefined && mesclado.aulasSemanais) {
      await acompanharAulasNosSegmentos(c, novo.rows[0].id, Number(mesclado.aulasSemanais));
    }
  }
}

/**
 * Faz o contrato de remuneração mais recente valer desde a competência
 * informada (ex.: um reajuste digitado quando o sistema ainda o datava no mês
 * seguinte). Só com folha ainda aberta: nenhum mês travado a partir dela e o
 * contrato anterior começando antes. O contrato anterior termina no mês de trás.
 */
export async function anteciparContratoVigente(
  ator: Ator,
  employeeId: string,
  competencia: string,
): Promise<{ de: string; para: string }> {
  const comp = normalizar(competencia);
  const dia = `${comp}-01`;
  return transacao(ator, async (c) => {
    const contratos = (await c.query(
      `SELECT id, to_char(vigencia_inicio,'YYYY-MM-DD') ini, to_char(vigencia_fim,'YYYY-MM-DD') fim
         FROM contratos_remuneracao WHERE employee_id = $1 ORDER BY vigencia_inicio DESC LIMIT 2`,
      [employeeId],
    )).rows as { id: string; ini: string; fim: string | null }[];
    const ultimo = contratos[0];
    const anterior = contratos[1];
    if (!ultimo) throw Object.assign(new Error("Este cadastro não tem contrato de remuneração."), { statusCode: 404 });
    if (ultimo.ini <= dia) {
      throw Object.assign(new Error(`O contrato mais recente já vale desde ${ultimo.ini}; nada a antecipar.`), { statusCode: 409 });
    }
    const travado = await c.query(
      `SELECT 1 FROM folha_calculos fc JOIN folha_periodos p ON p.id = fc.periodo_id
        WHERE fc.employee_id = $1 AND folha_periodo_travado(p.status) AND (p.competencia || '-01') >= $2 LIMIT 1`,
      [employeeId, dia],
    );
    if (travado.rowCount) {
      throw Object.assign(new Error("Há folha fechada a partir dessa competência: reabra antes de antecipar o contrato."), { statusCode: 422 });
    }
    if (anterior) {
      if (anterior.ini >= dia) {
        throw Object.assign(new Error("O contrato anterior começa nessa competência ou depois: não dá para antecipar sem sobrepor."), { statusCode: 422 });
      }
      await c.query("UPDATE contratos_remuneracao SET vigencia_fim = ($2::date - 1) WHERE id = $1", [anterior.id, dia]);
    }
    await c.query("UPDATE contratos_remuneracao SET vigencia_inicio = $2::date WHERE id = $1", [ultimo.id, dia]);
    return { de: ultimo.ini, para: dia };
  });
}

export async function desligarFuncionario(
  ator: Ator,
  employeeId: string,
  dataDesligamento: string,
): Promise<void> {
  await transacao(ator, async (c) => {
    const r = await c.query(
      `UPDATE employees SET status = 'DESLIGADO', data_desligamento = $2 WHERE id = $1`,
      [employeeId, dataDesligamento],
    );
    if (!r.rowCount) throw Object.assign(new Error("Funcionário não encontrado."), { statusCode: 404 });
  });
}

/**
 * Apaga de vez. Não replica aqui a regra "só se nunca esteve em folha
 * FECHADA" do protótipo local — mais simples e mais seguro é deixar o
 * próprio banco decidir: `contratos_remuneracao`, `folha_movimentos` e
 * `folha_calculos` referenciam `employees` com `ON DELETE RESTRICT`, então
 * qualquer cálculo já feito (fechado ou não) barra a exclusão sozinho. Quem
 * chama só precisa traduzir a violação de FK numa mensagem legível.
 */
/**
 * Exclui um cadastro feito por engano. Só vale para quem não tem nada que já
 * produziu efeito: folha fechada, 13º/férias/rescisão pagos, pagamento de
 * prestador ou banco de horas (que é só de acréscimo). Havendo, a resposta é
 * "Desligar", que preserva o histórico. O que é rascunho de mês aberto
 * (lançamento e cálculo) sai junto com o cadastro.
 */
export async function excluirFuncionario(ator: Ator, employeeId: string): Promise<void> {
  await transacao(ator, (c) => excluirFuncionarioTx(c, employeeId));
}

/** Confere se o cadastro pode ser excluído (sem folha fechada, pagamento ou banco de horas) e devolve o id da pessoa. */
async function verificarExclusaoPossivel(c: pg.PoolClient, employeeId: string): Promise<string> {
  const pessoa = await c.query("SELECT pessoa_id FROM employees WHERE id = $1", [employeeId]);
  if (!pessoa.rowCount) throw Object.assign(new Error("Funcionário não encontrado."), { statusCode: 404 });
  const pessoaId = pessoa.rows[0].pessoa_id;

  const trava = (await c.query(
    `SELECT
       (SELECT count(*) FROM folha_calculos fc JOIN folha_periodos p ON p.id = fc.periodo_id
         WHERE fc.employee_id = $1 AND folha_periodo_travado(p.status))::int AS folha,
       (SELECT count(*) FROM folha_decimo_terceiro WHERE employee_id = $1 AND pago)::int
       + (SELECT count(*) FROM folha_ferias WHERE employee_id = $1 AND pago)::int
       + (SELECT count(*) FROM folha_rescisoes WHERE employee_id = $1 AND homologada)::int
       + (SELECT count(*) FROM prestador_pagamentos WHERE employee_id = $1 AND pago)::int AS pagos,
       (SELECT count(*) FROM banco_horas_lancamentos WHERE employee_id = $1)::int AS banco`,
    [employeeId],
  )).rows[0] as { folha: number; pagos: number; banco: number };
  const motivos = [
    trava.folha ? "folha fechada" : "",
    trava.pagos ? "pagamento registrado" : "",
    trava.banco ? "lançamento no banco de horas" : "",
  ].filter(Boolean);
  if (motivos.length) {
    throw Object.assign(new Error(
      `Não é possível excluir: este cadastro já tem ${motivos.join(", ")}. Use "Desligar" para encerrar e preservar o histórico.`,
    ), { statusCode: 422 });
  }
  return pessoaId;
}

async function excluirFuncionarioTx(c: pg.PoolClient, employeeId: string): Promise<void> {
  const pessoaId = await verificarExclusaoPossivel(c, employeeId);
  const params = [employeeId];
  // Rascunhos de meses abertos e eventos não pagos.
  await c.query(`DELETE FROM folha_rubricas WHERE calculo_id IN (SELECT id FROM folha_calculos WHERE employee_id = $1)`, params);
  await c.query(`DELETE FROM folha_contas_geradas WHERE calculo_id IN (SELECT id FROM folha_calculos WHERE employee_id = $1)`, params);
  await c.query("DELETE FROM folha_calculos WHERE employee_id = $1", params);
  await c.query("DELETE FROM folha_movimentos WHERE employee_id = $1", params);
  for (const [tabela, chave] of [["folha_decimo_terceiro", "decimo_id"], ["folha_ferias", "ferias_id"], ["folha_rescisoes", "rescisao_id"]]) {
    await c.query(`DELETE FROM ${tabela}_rubricas WHERE ${chave} IN (SELECT id FROM ${tabela} WHERE employee_id = $1)`, params);
    await c.query(`DELETE FROM ${tabela} WHERE employee_id = $1`, params);
  }
  await c.query("DELETE FROM prestador_pagamentos WHERE employee_id = $1", params);
  await c.query("DELETE FROM contratos_prestador WHERE employee_id = $1", params);
  await c.query("DELETE FROM ausencias WHERE employee_id = $1", params);
  await c.query("DELETE FROM ponto_registros WHERE employee_id = $1", params);
  await c.query("UPDATE departments SET gestor_id = NULL WHERE gestor_id = $1", params);
  await c.query("UPDATE employees SET gestor_id = NULL WHERE gestor_id = $1", params);
  await c.query("DELETE FROM contratos_remuneracao WHERE employee_id = $1", params);
  await c.query("DELETE FROM employees WHERE id = $1", params);
  // Só apaga a pessoa se não sobrar nenhum outro vínculo empregatício
  // apontando pra ela (alguém pode ter mais de um `employees` histórico).
  await c.query(
    `DELETE FROM pessoas WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM employees WHERE pessoa_id = $1)`,
    [pessoaId],
  );
}

async function categoriaIdPorNome(c: pg.PoolClient, nome: string): Promise<string | null> {
  if (!nome) return null;
  const r = await c.query("SELECT id FROM categorias_financeiras WHERE nome = $1", [nome]);
  return r.rowCount ? r.rows[0].id : null;
}

// ---------------------------------------------------------------- fornecedores

export interface FornecedorEntrada {
  razaoSocial: string;
  nomeFantasia?: string;
  tipoDocumento?: "CNPJ" | "CPF";
  documento?: string;
  categoria?: string;
  contatoNome?: string;
  telefone?: string;
  email?: string;
  canalCobranca?: string;
}

const SELECAO_FORNECEDOR = `
  SELECT id, razao_social AS "razaoSocial", nome_fantasia AS "nomeFantasia",
         tipo_documento AS "tipoDocumento", categoria, canal_cobranca AS "canalCobranca",
         contato_nome AS "contatoNome", telefone, email, ativo
    FROM fornecedores
`;

export async function listarFornecedores(): Promise<Record<string, unknown>[]> {
  return consultar(`${SELECAO_FORNECEDOR} WHERE ativo ORDER BY razao_social`);
}

export async function criarFornecedor(
  ator: Ator,
  dados: FornecedorEntrada,
): Promise<{ id: string }> {
  return transacao(ator, async (c) => {
    const doc = dados.documento || null;
    const r = await c.query(
      `INSERT INTO fornecedores
         (razao_social, nome_fantasia, tipo_documento, documento_cifrado, documento_hash,
          categoria, contato_nome, telefone, email, criado_por, canal_cobranca)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        dados.razaoSocial, dados.nomeFantasia || null, doc ? dados.tipoDocumento : null,
        doc ? cifrarDocumento(doc) : null, doc ? hashDocumento(doc) : null,
        dados.categoria || null, dados.contatoNome || null, dados.telefone || null,
        dados.email || null, ator.userId, (dados as { canalCobranca?: string }).canalCobranca || null,
      ],
    );
    return { id: r.rows[0].id };
  });
}

export async function atualizarFornecedor(
  ator: Ator,
  id: string,
  dados: Partial<FornecedorEntrada>,
): Promise<void> {
  await transacao(ator, async (c) => {
    const campos: string[] = [];
    const valores: unknown[] = [];
    const add = (coluna: string, valor: unknown) => { valores.push(valor); campos.push(`${coluna} = $${valores.length}`); };
    if (dados.razaoSocial !== undefined) add("razao_social", dados.razaoSocial);
    if (dados.nomeFantasia !== undefined) add("nome_fantasia", dados.nomeFantasia || null);
    if (dados.categoria !== undefined) add("categoria", dados.categoria || null);
    if (dados.contatoNome !== undefined) add("contato_nome", dados.contatoNome || null);
    if (dados.telefone !== undefined) add("telefone", dados.telefone || null);
    if (dados.email !== undefined) add("email", dados.email || null);
    if (dados.canalCobranca !== undefined) add("canal_cobranca", dados.canalCobranca || null);
    if (dados.documento !== undefined) {
      add("documento_cifrado", cifrarDocumento(dados.documento));
      add("documento_hash", hashDocumento(dados.documento));
    }
    if (!campos.length) return;
    valores.push(id);
    const r = await c.query(`UPDATE fornecedores SET ${campos.join(", ")} WHERE id = $${valores.length}`, valores);
    if (!r.rowCount) throw Object.assign(new Error("Fornecedor não encontrado."), { statusCode: 404 });
  });
}

// ---------------------------------------------------------------- contas a pagar

export interface ContaPagarEntrada {
  descricao: string;
  fornecedorId?: string;
  categoria: string;
  valorCentavos: number;
  competencia: string;
  vencimento: string;
  numeroDocumento?: string;
  formaPagamento?: string;
  status?: string;
  observacoes?: string;
}

const SELECAO_CONTA = `
  SELECT cp.id, cp.descricao, cp.fornecedor_id AS "fornecedorId", cat.nome AS categoria,
         cp.competencia, to_char(cp.vencimento, 'YYYY-MM-DD') AS vencimento,
         cp.valor_centavos::int AS valor, cp.forma_pagamento AS "formaPagamento",
         cp.status, cp.numero_documento AS "numeroDocumento", cp.observacoes
    FROM contas_pagar cp
    LEFT JOIN categorias_financeiras cat ON cat.id = cp.categoria_id
`;

export async function listarContasPagar(): Promise<Record<string, unknown>[]> {
  return consultar(`${SELECAO_CONTA} ORDER BY cp.vencimento`);
}

export async function criarContaPagar(
  ator: Ator,
  dados: ContaPagarEntrada,
): Promise<{ id: string }> {
  return transacao(ator, async (c) => {
    const categoriaId = await categoriaIdPorNome(c, dados.categoria);
    if (!categoriaId) throw Object.assign(new Error(`A categoria "${dados.categoria}" não existe. Escolha uma da lista de categorias.`), { statusCode: 422 });
    const r = await c.query(
      `INSERT INTO contas_pagar
         (descricao, fornecedor_id, categoria_id, competencia, vencimento, valor_centavos,
          forma_pagamento, status, numero_documento, observacoes, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        dados.descricao, dados.fornecedorId || null, categoriaId, dados.competencia, dados.vencimento,
        dados.valorCentavos, dados.formaPagamento || null, dados.status || "RASCUNHO",
        dados.numeroDocumento || null, dados.observacoes || null, ator.userId,
      ],
    );
    return { id: r.rows[0].id };
  });
}

export async function atualizarContaPagar(
  ator: Ator,
  id: string,
  dados: Partial<ContaPagarEntrada>,
): Promise<void> {
  await transacao(ator, async (c) => {
    // Conta paga é fato consumado: o pagamento gravado tem o valor da época.
    // Mudar valor, vencimento, competência ou categoria depois deixaria a conta
    // e o pagamento contando histórias diferentes.
    const atual = await c.query(
      `SELECT status, valor_centavos::bigint AS valor, competencia, to_char(vencimento,'YYYY-MM-DD') AS vencimento, cat.nome AS categoria
         FROM contas_pagar cp LEFT JOIN categorias_financeiras cat ON cat.id = cp.categoria_id WHERE cp.id = $1 FOR UPDATE OF cp`,
      [id],
    );
    const a = atual.rows[0] as { status: string; valor: string; competencia: string; vencimento: string; categoria: string } | undefined;
    if (a && a.status === "PAGO") {
      const mudou = (dados.valorCentavos !== undefined && String(dados.valorCentavos) !== String(a.valor))
        || (dados.competencia !== undefined && dados.competencia !== a.competencia)
        || (dados.vencimento !== undefined && dados.vencimento !== a.vencimento)
        || (dados.categoria !== undefined && dados.categoria !== a.categoria)
        || (dados.status !== undefined && dados.status !== "PAGO");
      if (mudou) {
        throw Object.assign(new Error("Esta conta já foi paga: valor, vencimento, competência, categoria e status não mudam mais. Se o pagamento foi lançado errado, peça à Direção."), { statusCode: 409 });
      }
    }
    const campos: string[] = [];
    const valores: unknown[] = [];
    const add = (coluna: string, valor: unknown) => { valores.push(valor); campos.push(`${coluna} = $${valores.length}`); };
    if (dados.descricao !== undefined) add("descricao", dados.descricao);
    if (dados.fornecedorId !== undefined) add("fornecedor_id", dados.fornecedorId || null);
    if (dados.categoria !== undefined) {
      const categoriaId = await categoriaIdPorNome(c, dados.categoria);
      if (!categoriaId) throw Object.assign(new Error(`A categoria "${dados.categoria}" não existe. Escolha uma da lista de categorias.`), { statusCode: 422 });
      add("categoria_id", categoriaId);
    }
    if (dados.competencia !== undefined) add("competencia", dados.competencia);
    if (dados.vencimento !== undefined) add("vencimento", dados.vencimento);
    if (dados.valorCentavos !== undefined) add("valor_centavos", dados.valorCentavos);
    if (dados.formaPagamento !== undefined) add("forma_pagamento", dados.formaPagamento || null);
    if (dados.status !== undefined) add("status", dados.status);
    if (dados.numeroDocumento !== undefined) add("numero_documento", dados.numeroDocumento || null);
    if (dados.observacoes !== undefined) add("observacoes", dados.observacoes || null);
    if (!campos.length) return;
    valores.push(id);
    const r = await c.query(`UPDATE contas_pagar SET ${campos.join(", ")} WHERE id = $${valores.length}`, valores);
    if (!r.rowCount) throw Object.assign(new Error("Conta não encontrada."), { statusCode: 404 });
  });
}

export interface PagamentoEntrada {
  dataPagamento: string;
  formaPagamento: string;
  observacoes?: string;
  /** Valor efetivamente pago, quando difere do documento (juros, multa, desconto). */
  valorPagoCentavos?: number;
}

/**
 * "Marcar como paga" no protótipo local é só um status na própria conta;
 * o banco real separa isso — `contas_pagar.status` muda, e o pagamento em si
 * vira sua própria linha em `pagamentos` (suporta pagamento parcial: uma
 * conta pode ter mais de um). O valor do pagamento é o valor da conta —
 * dividir em parcelas fica para quando essa tela precisar disso de verdade.
 */
export async function registrarPagamento(
  ator: Ator,
  contaId: string,
  dados: PagamentoEntrada,
): Promise<void> {
  await transacao(ator, async (c) => {
    const achada = await c.query(
      "SELECT valor_centavos AS valor, status FROM contas_pagar WHERE id = $1 FOR UPDATE",
      [contaId],
    );
    const conta = achada.rows[0] as { valor: string; status: string } | undefined;
    if (!conta) throw Object.assign(new Error("Conta não encontrada."), { statusCode: 404 });
    // Sem esta trava, clicar duas vezes em "Pagar" registrava o pagamento em dobro.
    if (conta.status === "PAGO") throw Object.assign(new Error("Esta conta já foi paga."), { statusCode: 409 });
    if (conta.status === "CANCELADO") throw Object.assign(new Error("Esta conta foi cancelada e não pode ser paga."), { statusCode: 409 });

    await c.query(
      `INSERT INTO pagamentos (conta_id, data_pagamento, valor_centavos, forma_pagamento, observacoes, registrado_por)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [contaId, dados.dataPagamento, dados.valorPagoCentavos ?? conta.valor, dados.formaPagamento, dados.observacoes || null, ator.userId],
    );
    await c.query(
      `UPDATE contas_pagar SET status = 'PAGO', forma_pagamento = $2 WHERE id = $1`,
      [contaId, dados.formaPagamento],
    );
  });
}

// ---------------------------------------------------------------- contratos

export interface ContratoEntrada {
  objeto: string;
  tipo?: string;
  fornecedorId?: string;
  dataInicio: string;
  dataFim?: string;
  valorCentavos: number;
  periodicidade?: string;
  status?: string;
  observacoes?: string;
}

const SELECAO_CONTRATO = `
  SELECT id, objeto, tipo, fornecedor_id AS "fornecedorId",
         to_char(data_inicio, 'YYYY-MM-DD') AS inicio, to_char(data_fim, 'YYYY-MM-DD') AS fim,
         valor_centavos::int AS valor, periodicidade, status, observacoes
    FROM contratos
`;

export async function listarContratos(): Promise<Record<string, unknown>[]> {
  return consultar(`${SELECAO_CONTRATO} ORDER BY data_fim NULLS LAST`);
}

// Sem prazo de fim = renovação automática (mesma leitura que a tela já mostra
// no estado vazio: "esquecido é renovação automática por mais um ano") — o
// formulário local não tem um campo próprio pra isso, então deriva do fim.
function contratoAtivoSemPrazoPrecisaRenovacao(dataFim: string | undefined, status: string | undefined): boolean {
  return !dataFim && (status ?? "ATIVO") === "ATIVO";
}

export async function criarContrato(
  ator: Ator,
  dados: ContratoEntrada,
): Promise<{ id: string }> {
  return transacao(ator, async (c) => {
    const renovacaoAutomatica = contratoAtivoSemPrazoPrecisaRenovacao(dados.dataFim, dados.status);
    const r = await c.query(
      `INSERT INTO contratos
         (objeto, tipo, fornecedor_id, data_inicio, data_fim, valor_centavos,
          periodicidade, renovacao_automatica, status, observacoes, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        dados.objeto, dados.tipo || "OUTRO", dados.fornecedorId || null, dados.dataInicio, dados.dataFim || null,
        dados.valorCentavos, dados.periodicidade || "MENSAL", renovacaoAutomatica, dados.status || "ATIVO",
        dados.observacoes || null, ator.userId,
      ],
    );
    return { id: r.rows[0].id };
  });
}

export async function atualizarContrato(
  ator: Ator,
  id: string,
  dados: Partial<ContratoEntrada>,
): Promise<void> {
  await transacao(ator, async (c) => {
    const atual = await c.query("SELECT to_char(data_fim,'YYYY-MM-DD') AS fim, status FROM contratos WHERE id = $1", [id]);
    if (!atual.rowCount) throw Object.assign(new Error("Contrato não encontrado."), { statusCode: 404 });
    const fimFinal = dados.dataFim !== undefined ? dados.dataFim : atual.rows[0].fim;
    const statusFinal = dados.status ?? atual.rows[0].status;

    const campos: string[] = [];
    const valores: unknown[] = [];
    const add = (coluna: string, valor: unknown) => { valores.push(valor); campos.push(`${coluna} = $${valores.length}`); };
    if (dados.objeto !== undefined) add("objeto", dados.objeto);
    if (dados.tipo !== undefined) add("tipo", dados.tipo);
    if (dados.fornecedorId !== undefined) add("fornecedor_id", dados.fornecedorId || null);
    if (dados.dataInicio !== undefined) add("data_inicio", dados.dataInicio);
    if (dados.dataFim !== undefined) add("data_fim", dados.dataFim || null);
    if (dados.valorCentavos !== undefined) add("valor_centavos", dados.valorCentavos);
    if (dados.periodicidade !== undefined) add("periodicidade", dados.periodicidade);
    if (dados.status !== undefined) add("status", dados.status);
    if (dados.observacoes !== undefined) add("observacoes", dados.observacoes || null);
    add("renovacao_automatica", contratoAtivoSemPrazoPrecisaRenovacao(fimFinal, statusFinal));
    valores.push(id);
    const r = await c.query(`UPDATE contratos SET ${campos.join(", ")} WHERE id = $${valores.length}`, valores);
    if (!r.rowCount) throw Object.assign(new Error("Contrato não encontrado."), { statusCode: 404 });
  });
}

// ---------------------------------------------------------------- ausências

export interface AusenciaEntrada {
  funcionarioId: string;
  tipo?: string | undefined;
  inicio: string;
  fim: string;
  observacoes?: string | undefined;
}

const SELECAO_AUSENCIA = `
  SELECT a.id, a.employee_id AS "funcionarioId", pe.nome, a.tipo,
         to_char(a.data_inicio, 'YYYY-MM-DD') AS inicio, to_char(a.data_fim, 'YYYY-MM-DD') AS fim,
         a.status, a.observacoes
    FROM ausencias a
    JOIN employees em ON em.id = a.employee_id
    JOIN pessoas pe ON pe.id = em.pessoa_id
`;

export async function listarAusencias(): Promise<Record<string, unknown>[]> {
  return consultar(`${SELECAO_AUSENCIA} ORDER BY a.data_inicio`);
}

/**
 * A tela local não tem etapa de aprovação separada — quem registra já marca
 * como aprovada (`v.status = "APROVADA"` em `telas-c.js`). Aqui é igual: sem
 * fluxo de solicitação por trás ainda, então "registrar" já é "aprovar".
 */
export async function criarAusencia(
  ator: Ator,
  dados: AusenciaEntrada,
): Promise<{ id: string }> {
  return transacao(ator, async (c) => {
    const r = await c.query(
      `INSERT INTO ausencias (employee_id, tipo, data_inicio, data_fim, status, observacoes, criado_por)
       VALUES ($1,$2,$3,$4,'APROVADA',$5,$6) RETURNING id`,
      [dados.funcionarioId, dados.tipo || "OUTRO", dados.inicio, dados.fim, dados.observacoes || null, ator.userId],
    );
    return { id: r.rows[0].id };
  });
}

// ---------------------------------------------------------------- banco de horas

export interface LancamentoBancoEntrada {
  funcionarioId: string;
  dia: string;
  minutos: number;
  origem?: string | undefined;
  justificativa?: string | undefined;
}

/**
 * Ledger imutável (migration 006 bloqueia UPDATE/DELETE por trigger) — por
 * isso só existe `criar`/`listar`, nunca editar. Corrigir um lançamento
 * errado é lançar o inverso, igual ao aviso que a tela local já mostra
 * ("o lançamento não se apaga — correção se faz com lançamento inverso").
 */
export async function listarLancamentosBanco(): Promise<Record<string, unknown>[]> {
  return consultar(
    `SELECT id, employee_id AS "funcionarioId", to_char(dia, 'YYYY-MM-DD') AS dia,
            minutos, origem, justificativa
       FROM banco_horas_lancamentos ORDER BY dia DESC`,
  );
}

export async function criarLancamentoBanco(
  ator: Ator,
  dados: LancamentoBancoEntrada,
): Promise<{ id: string }> {
  return transacao(ator, async (c) => {
    const r = await c.query(
      `INSERT INTO banco_horas_lancamentos (employee_id, dia, minutos, origem, justificativa, registrado_por)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [
        dados.funcionarioId, dados.dia, dados.minutos, dados.origem || "AJUSTE_MANUAL",
        dados.justificativa || null, ator.userId,
      ],
    );
    return { id: r.rows[0].id };
  });
}

// ---------------------------------------------------------------- solicitações
//
// Porta fiel do motor já testado em `prototipo/partes/dominio.js`
// (`L.cadeiaDeAprovacao`, `L.decidirSolicitacao`, `L.delegar`) — mesma tabela
// de níveis/alçada, mesmas regras (ninguém aprova o próprio pedido, Direção
// decide em qualquer etapa e encerra ali). Ver `db/migrations/012_...sql`
// para por que a cadeia fica gravada na própria linha em vez de usar o
// template fixo de `fluxos_aprovacao`/`fluxos_etapas`.

export const NIVEIS: Record<string, { ordem: number; nome: string; aprovaAte: number | null }> = {
  DIRECAO:        { ordem: 1, nome: "Direção", aprovaAte: null },
  FINANCEIRO:     { ordem: 2, nome: "Financeiro", aprovaAte: 2_000_000 },
  RH:             { ordem: 2, nome: "Recursos Humanos", aprovaAte: 1_000_000 },
  ADMINISTRATIVO: { ordem: 3, nome: "Administrativo", aprovaAte: 500_000 },
  COORDENACAO:    { ordem: 3, nome: "Coordenação", aprovaAte: 200_000 },
  GESTOR:         { ordem: 4, nome: "Gestor de equipe", aprovaAte: 100_000 },
  SECRETARIA:     { ordem: 5, nome: "Secretaria", aprovaAte: 0 },
  CONSULTA:       { ordem: 6, nome: "Consulta", aprovaAte: 0 },
};

function alcadaDe(perfil: string): number | null {
  return NIVEIS[perfil]?.aprovaAte ?? 0;
}

function podeAprovarValor(perfil: string, valor: number): boolean {
  const teto = alcadaDe(perfil);
  if (teto === null) return true;
  return teto > 0 && (valor || 0) <= teto;
}

function cadeiaDeAprovacao(valor: number): string[] {
  const v = valor || 0;
  const niveis = Object.keys(NIVEIS)
    .filter((p) => NIVEIS[p].aprovaAte !== 0)
    .sort((a, b) => {
      const ta = NIVEIS[a].aprovaAte, tb = NIVEIS[b].aprovaAte;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return ta - tb;
    });
  const cadeia: string[] = [];
  let resolvido = false;
  for (const p of niveis) {
    cadeia.push(p);
    if (podeAprovarValor(p, v)) { resolvido = true; break; }
  }
  if (!resolvido && !cadeia.includes("DIRECAO")) cadeia.push("DIRECAO");
  return cadeia;
}

function responsavelPor(cadeia: string[], etapa: number, delegacoes: Record<string, string>): string | null {
  if (!cadeia.length || etapa >= cadeia.length) return null;
  const perfil = cadeia[etapa];
  return delegacoes[perfil] || perfil;
}

function estaAberta(status: string): boolean {
  return status === "SOLICITADO" || status === "EM_APROVACAO" || status === "ALTERACAO_SOLICITADA";
}

/** Mesma dupla trava do protótipo: Direção decide em qualquer etapa; mais
 * ninguém decide fora da própria vez, nem mesmo o autor do próprio pedido. */
export function podeDecidirSolicitacao(
  s: { status: string; cadeiaPerfis: string[]; etapa: number; delegacoes: Record<string, string>; perfilSolicitante: string | null },
  perfil: string,
): boolean {
  if (!estaAberta(s.status)) return false;
  if (perfil && perfil === s.perfilSolicitante && perfil !== "DIRECAO") return false;
  if (perfil === "DIRECAO") return true;
  return responsavelPor(s.cadeiaPerfis, s.etapa, s.delegacoes) === perfil;
}

export interface SolicitacaoEntrada {
  tipo: string;
  titulo: string;
  justificativa: string;
  valorCentavos?: number | undefined;
  urgencia?: string | undefined;
  fornecedorId?: string | undefined;
}

const SELECAO_SOLICITACAO = `
  SELECT s.id, s.numero::int AS numero, s.tipo, s.titulo, s.justificativa,
         s.valor_centavos::int AS valor, s.urgencia, s.status,
         s.cadeia_perfis AS cadeia, s.etapa_atual AS etapa, s.delegacoes,
         s.perfil_solicitante AS "perfilSolicitante", s.fornecedor_id AS "fornecedorId",
         u.nome AS solicitante, s.gerou_entidade AS "gerouEntidade", s.gerou_entidade_id AS "gerouEntidadeId",
         to_char(s.criado_em, 'YYYY-MM-DD"T"HH24:MI:SS') AS "criadoEm", s.revisao
    FROM solicitacoes s
    JOIN users u ON u.id = s.solicitante_id
`;

/** Decisões vêm num array por solicitação, na mesma forma que o protótipo já
 * usa (`s.decisoes`) — uma query à parte é mais simples que agregar em JSON
 * dentro do SQL para um volume que nunca vai ser grande por solicitação. */
async function decisoesDaSolicitacao(id: string): Promise<Record<string, unknown>[]> {
  return consultar(
    `SELECT d.decisao, u.nome AS por, d.etapa, d.na_vez AS "naVez", d.comentario,
            to_char(d.decidido_em, 'YYYY-MM-DD"T"HH24:MI:SS') AS quando
       FROM solicitacao_decisoes d
       JOIN users u ON u.id = d.decidido_por
      WHERE d.solicitacao_id = $1
      ORDER BY d.decidido_em`,
    [id],
  );
}

export async function listarSolicitacoes(): Promise<Record<string, unknown>[]> {
  // Uma ida ao banco só: antes era 1 consulta por pedido (N+1), e em produção
  // cada ida custa dezenas de ms — a lista levava ~2,5 s.
  const linhas = await consultar<Record<string, unknown>>(`${SELECAO_SOLICITACAO} ORDER BY s.numero DESC`);
  if (!linhas.length) return [];
  const decisoes = await consultar<Record<string, unknown> & { solicitacao_id: string }>(
    `SELECT d.solicitacao_id, d.decisao, u.nome AS por, d.etapa, d.na_vez AS "naVez", d.comentario,
            to_char(d.decidido_em, 'YYYY-MM-DD"T"HH24:MI:SS') AS quando
       FROM solicitacao_decisoes d
       JOIN users u ON u.id = d.decidido_por
      WHERE d.solicitacao_id = ANY($1::uuid[])
      ORDER BY d.decidido_em`,
    [linhas.map((l) => l.id)],
  );
  const por = new Map<string, Record<string, unknown>[]>();
  for (const { solicitacao_id, ...d } of decisoes) {
    if (!por.has(solicitacao_id)) por.set(solicitacao_id, []);
    por.get(solicitacao_id)!.push(d);
  }
  return linhas.map((l) => ({ ...l, decisoes: por.get(l.id as string) ?? [] }));
}

/**
 * Abre a solicitação com a cadeia já fixada pelo valor — igual a
 * `L.abrirSolicitacao`: tira o próprio solicitante da cadeia (ninguém aprova
 * o próprio pedido) e, se isso deixar a cadeia terminando em alguém sem
 * alçada para o valor, empurra para a Direção.
 */
export async function abrirSolicitacao(
  ator: Ator,
  perfilSolicitante: string,
  dados: SolicitacaoEntrada,
): Promise<{ id: string; numero: number }> {
  const valor = dados.valorCentavos ?? 0;
  let cadeia = cadeiaDeAprovacao(valor);
  if (perfilSolicitante && perfilSolicitante !== "DIRECAO") {
    cadeia = cadeia.filter((p) => p !== perfilSolicitante);
    const ultimo = cadeia[cadeia.length - 1];
    if ((!ultimo || !podeAprovarValor(ultimo, valor)) && !cadeia.includes("DIRECAO")) {
      cadeia.push("DIRECAO");
    }
  }
  return transacao(ator, async (c) => {
    const r = await c.query(
      `INSERT INTO solicitacoes
         (tipo, titulo, justificativa, solicitante_id, perfil_solicitante, valor_centavos,
          urgencia, fornecedor_id, cadeia_perfis, etapa_atual, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,'EM_APROVACAO') RETURNING id, numero`,
      [
        dados.tipo, dados.titulo, dados.justificativa, ator.userId, perfilSolicitante,
        dados.valorCentavos ?? null, dados.urgencia || "NORMAL", dados.fornecedorId || null, cadeia,
      ],
    );
    return { id: r.rows[0].id, numero: Number(r.rows[0].numero) };
  });
}

/**
 * Registra a decisão e avança o fluxo — mesma máquina de estados de
 * `L.decidirSolicitacao`. Quando o resultado é APROVADO com valor > 0 e a
 * solicitação ainda não gerou nada, cria a conta a pagar correspondente
 * (mesmo efeito que `T.acoes["abrir-solicitacao"]` faz no protótipo),
 * carimbando a origem em `gerou_entidade`/`gerou_entidade_id`.
 */
export async function decidirSolicitacao(
  ator: Ator,
  perfil: string,
  id: string,
  decisao: "APROVAR" | "REJEITAR" | "SOLICITAR_ALTERACAO",
  comentario: string | undefined,
): Promise<{ status: string }> {
  if (!["APROVAR", "REJEITAR", "SOLICITAR_ALTERACAO"].includes(decisao)) {
    throw Object.assign(new Error("Decisão inválida. Use aprovar, rejeitar ou pedir alteração."), { statusCode: 400 });
  }
  return transacao(ator, async (c) => {
    const atual = await c.query(
      `SELECT status, cadeia_perfis AS cadeia, etapa_atual AS etapa, delegacoes,
              perfil_solicitante AS "perfilSolicitante", valor_centavos AS valor, titulo, numero,
              fornecedor_id AS "fornecedorId", gerou_entidade AS "gerouEntidade", tipo, revisao
         FROM solicitacoes WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!atual.rowCount) throw Object.assign(new Error("Solicitação não encontrada."), { statusCode: 404 });
    const s = atual.rows[0];

    if (!estaAberta(s.status)) {
      const rotulo: Record<string, string> = { APROVADO: "aprovada", REJEITADO: "rejeitada", CANCELADO: "cancelada" };
      throw Object.assign(
        new Error(`Esta solicitação já foi ${rotulo[s.status] ?? "encerrada"} e não aceita nova decisão.`),
        { statusCode: 409 },
      );
    }
    if (!podeDecidirSolicitacao(
      { status: s.status, cadeiaPerfis: s.cadeia, etapa: s.etapa, delegacoes: s.delegacoes, perfilSolicitante: s.perfilSolicitante },
      perfil,
    )) {
      throw Object.assign(new Error("Não é a sua vez de decidir esta solicitação."), { statusCode: 403 });
    }
    if (decisao === "REJEITAR" && !comentario) {
      throw Object.assign(new Error("Rejeição exige motivo."), { statusCode: 400 });
    }

    const naVez = responsavelPor(s.cadeia, s.etapa, s.delegacoes) === perfil;
    let novaEtapa = s.etapa;
    let novoStatus: string;
    if (decisao === "REJEITAR") {
      novoStatus = "REJEITADO";
    } else if (decisao === "SOLICITAR_ALTERACAO") {
      novoStatus = "ALTERACAO_SOLICITADA";
    } else if (perfil === "DIRECAO") {
      novaEtapa = s.cadeia.length;
      novoStatus = "APROVADO";
    } else {
      novaEtapa = s.etapa + 1;
      novoStatus = novaEtapa >= s.cadeia.length ? "APROVADO" : "EM_APROVACAO";
    }

    await c.query(
      `INSERT INTO solicitacao_decisoes (solicitacao_id, etapa, decisao, decidido_por, comentario, na_vez)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, s.etapa, decisao, ator.userId, comentario || null, naVez],
    );
    await c.query(
      `UPDATE solicitacoes SET etapa_atual = $2, status = $3 WHERE id = $1`,
      [id, novaEtapa, novoStatus],
    );

    // Alteração do RH: recusar devolve ao que era; aceitar exclusão executa a exclusão.
    if (s.tipo === "ALTERACAO_CADASTRO" && s.revisao && (novoStatus === "REJEITADO" || novoStatus === "APROVADO")) {
      await aplicarDecisaoRevisao(c, ator, s.revisao, novoStatus);
    }

    if (novoStatus === "APROVADO" && Number(s.valor) > 0 && !s.gerouEntidade) {
      const categoriaId = await categoriaIdPorNome(c, "Administrativo");
      const conta = await c.query(
        `INSERT INTO contas_pagar
           (descricao, fornecedor_id, categoria_id, competencia, vencimento, valor_centavos, status, observacoes, criado_por)
         VALUES ($1,$2,$3, to_char(now(),'YYYY-MM'), CURRENT_DATE, $4, 'APROVADO', $5, $6) RETURNING id`,
        [
          s.titulo, s.fornecedorId, categoriaId, s.valor,
          "Gerada pela solicitação #" + s.numero, ator.userId,
        ],
      );
      await c.query(
        `UPDATE solicitacoes SET gerou_entidade = 'contas_pagar', gerou_entidade_id = $2 WHERE id = $1`,
        [id, conta.rows[0].id],
      );
    }

    return { status: novoStatus };
  });
}

/** Só quem já pode decidir a etapa (responsável atual ou Direção) delega —
 * e só para um perfil com alçada real para o valor, igual a
 * `L.candidatosDelegacao`. */
export async function delegarSolicitacao(
  ator: Ator,
  perfil: string,
  id: string,
  paraPerfil: string,
  motivo: string | undefined,
): Promise<void> {
  await transacao(ator, async (c) => {
    const atual = await c.query(
      `SELECT status, cadeia_perfis AS cadeia, etapa_atual AS etapa, delegacoes,
              perfil_solicitante AS "perfilSolicitante", valor_centavos AS valor
         FROM solicitacoes WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!atual.rowCount) throw Object.assign(new Error("Solicitação não encontrada."), { statusCode: 404 });
    const s = atual.rows[0];

    if (!podeDecidirSolicitacao(
      { status: s.status, cadeiaPerfis: s.cadeia, etapa: s.etapa, delegacoes: s.delegacoes, perfilSolicitante: s.perfilSolicitante },
      perfil,
    )) {
      throw Object.assign(new Error("Não é a sua vez de decidir esta solicitação."), { statusCode: 403 });
    }
    if (!podeAprovarValor(paraPerfil, Number(s.valor) || 0)) {
      throw Object.assign(new Error("Este perfil não tem alçada para o valor da solicitação."), { statusCode: 422 });
    }

    const delegacoes = { ...s.delegacoes, [perfil]: paraPerfil };
    await c.query(`UPDATE solicitacoes SET delegacoes = $2 WHERE id = $1`, [id, delegacoes]);
    await c.query(
      `INSERT INTO solicitacao_decisoes (solicitacao_id, etapa, decisao, decidido_por, comentario, na_vez)
       VALUES ($1,$2,'DELEGAR',$3,$4,true)`,
      [id, s.etapa, ator.userId, "Delegado para " + (NIVEIS[paraPerfil]?.nome || paraPerfil) + (motivo ? " — " + motivo : "")],
    );
  });
}

// ---------------------------------------------------------------- parâmetros

/** Monta o `ParametrosFolha` que o motor espera, a partir do banco. */
/** Configuração booleana da escola (tabela `configuracoes`, migração 023). */
export async function configuracaoAtiva(chave: string): Promise<boolean> {
  const [l] = await consultar<{ valor: unknown }>("SELECT valor FROM configuracoes WHERE chave = $1", [chave]);
  return l?.valor === true;
}

export async function listarConfiguracoes(): Promise<Record<string, unknown>> {
  const linhas = await consultar<{ chave: string; valor: unknown }>("SELECT chave, valor FROM configuracoes");
  return Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
}

export async function gravarConfiguracao(ator: Ator, chave: string, valor: unknown): Promise<void> {
  await transacao(ator, async (c) => {
    await c.query(
      `INSERT INTO configuracoes (chave, valor, atualizado_por, atualizado_em) VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now()`,
      [chave, JSON.stringify(valor), ator.userId],
    );
  });
}

export async function parametrosDaCompetencia(
  competencia: string,
  categoriaCct: "DOCENTE" | "ADMINISTRATIVO" | "APOIO" = "DOCENTE",
): Promise<ParametrosFolha> {
  const dia = primeiroDia(competencia);

  const [inss] = await consultar<Record<string, never>>(
    `SELECT t.*, json_agg(json_build_object('ate', f.ate_centavos, 'aliquota', f.aliquota)
              ORDER BY f.ordem) AS faixas
       FROM folha_tabela_inss t
       JOIN folha_tabela_inss_faixa f ON f.tabela_id = t.id
      WHERE daterange(t.vigencia_inicio, t.vigencia_fim, '[]') @> $1::date
      GROUP BY t.id`,
    [dia],
  );
  const [irrf] = await consultar<Record<string, never>>(
    `SELECT t.*, json_agg(json_build_object('ate', f.ate_centavos, 'aliquota', f.aliquota,
              'parcelaDeduzir', f.parcela_deduzir_centavos) ORDER BY f.ordem) AS faixas
       FROM folha_tabela_irrf t
       JOIN folha_tabela_irrf_faixa f ON f.tabela_id = t.id
      WHERE daterange(t.vigencia_inicio, t.vigencia_fim, '[]') @> $1::date
      GROUP BY t.id`,
    [dia],
  );
  const [minimo] = await consultar<Record<string, never>>(
    `SELECT * FROM folha_salario_minimo
      WHERE daterange(vigencia_inicio, vigencia_fim, '[]') @> $1::date`,
    [dia],
  );
  const [cct] = await consultar<Record<string, never>>(
    `SELECT * FROM folha_cct
      WHERE categoria = $2 AND daterange(vigencia_inicio, vigencia_fim, '[]') @> $1::date`,
    [dia, categoriaCct],
  );

  const faltando = [
    !inss && "tabela de INSS", !irrf && "tabela de IRRF",
    !minimo && "salário mínimo", !cct && `convenção coletiva (${categoriaCct})`,
  ].filter(Boolean);
  if (faltando.length) {
    throw Object.assign(
      new Error(`Sem parâmetro vigente para ${competencia}: ${faltando.join(", ")}.`),
      { statusCode: 422 },
    );
  }

  const n = (v: unknown) => Number(v);
  const t = inss as never as Record<string, never>;
  const r = irrf as never as Record<string, never>;
  const m = minimo as never as Record<string, never>;
  const k = cct as never as Record<string, never>;
  const impostosPelaContabilidade = await configuracaoAtiva("impostosPelaContabilidade");

  const ocultarDsr = await configuracaoAtiva("ocultarDsr");

  return {
    impostosPelaContabilidade,
    ocultarDsr,
    inss: {
      id: t.id, vigencia: { inicio: t.vigencia_inicio, fim: t.vigencia_fim },
      teto: n(t.teto_centavos), fonte: t.fonte, conferidaPorRh: t.conferida_por_rh,
      faixas: (t.faixas as never as Array<{ ate: string; aliquota: string }>)
        .map((f) => ({ ate: n(f.ate), aliquota: n(f.aliquota) })),
    },
    irrf: {
      id: r.id, vigencia: { inicio: r.vigencia_inicio, fim: r.vigencia_fim },
      deducaoPorDependente: n(r.deducao_dependente_centavos),
      descontoSimplificado: n(r.desconto_simplificado_centavos),
      fonte: r.fonte, conferidaPorRh: r.conferida_por_rh,
      faixas: (r.faixas as never as Array<{ ate: string | null; aliquota: string; parcelaDeduzir: string }>)
        .map((f) => ({
          ate: f.ate === null ? null : n(f.ate),
          aliquota: n(f.aliquota), parcelaDeduzir: n(f.parcelaDeduzir),
        })),
      // Redutor da Lei 15.270/2025 (migration 014) — os quatro só existem
      // juntos (CHECK `irrf_redutor_completo`); ausentes numa tabela anterior
      // à lei (ex.: 2025), `undefined` aqui é o que faz `calcularIrrf` pular
      // o mecanismo inteiro, igual a uma tabela que nunca teve redutor.
      isencaoTotalAte: r.isencao_total_ate_centavos == null ? undefined : n(r.isencao_total_ate_centavos),
      reducaoAte: r.reducao_ate_centavos == null ? undefined : n(r.reducao_ate_centavos),
      reducaoBase: r.reducao_base_centavos == null ? undefined : n(r.reducao_base_centavos),
      reducaoFator: r.reducao_fator == null ? undefined : n(r.reducao_fator),
    },
    salarioMinimo: {
      id: m.id, vigencia: { inicio: m.vigencia_inicio, fim: m.vigencia_fim },
      valor: n(m.valor_centavos), fonte: m.fonte, conferidoPorRh: m.conferido_por_rh,
    },
    cct: {
      id: k.id, nome: k.nome, categoria: k.categoria,
      vigencia: { inicio: k.vigencia_inicio, fim: k.vigencia_fim },
      conferidaPorRh: k.conferida_por_rh,
      horaAula: {
        modoApuracao: k.modo_apuracao_hora_aula,
        minutosPorHoraAula: n(k.minutos_por_hora_aula),
        semanasPorMes: n(k.semanas_por_mes),
        diasUteisSemana: n(k.dias_uteis_semana),
        diasDescansoSemana: n(k.dias_descanso_semana),
        percentualHoraAtividade: n(k.percentual_hora_atividade),
        percentualAulaExtra: n(k.percentual_aula_extra),
        percentualAdicionalNoturno: n(k.percentual_adicional_noturno),
        reflexoDsrSobreAdicionalNoturno: k.reflexo_dsr_adicional_noturno,
        perdeDsrPorFaltaInjustificada: k.perde_dsr_por_falta_injustificada,
        pisoArt322: k.piso_art_322,
        valorMinimoHoraAula: n(k.valor_minimo_hora_aula_centavos),
      },
      mensalista: {
        divisorMensalHoras: n(k.divisor_mensal_horas),
        reflexoDsrSobreHorasExtras: k.reflexo_dsr_horas_extras,
      },
      horistaRelogio: {
        semanasPorMes: n(k.semanas_por_mes_horista_relogio),
        reflexoDsrSobreHorasExtras: k.reflexo_dsr_horas_extras,
      },
      adicionalTempoServico: {
        tipo: k.ats_tipo,
        percentualPorPeriodo: n(k.ats_percentual_por_periodo),
        limitePeriodos: k.ats_limite_periodos === null ? null : n(k.ats_limite_periodos),
      },
      encargos: {
        fgtsPercentual: n(k.fgts_percentual), cppPercentual: n(k.cpp_percentual),
        ratPercentual: n(k.rat_percentual), terceirosPercentual: n(k.terceiros_percentual),
        provisionarDecimoTerceiro: k.provisionar_decimo_terceiro,
        provisionarFerias: k.provisionar_ferias,
        tercoConstitucional: n(k.terco_constitucional),
      },
      beneficios: { valeTransportePercentualMaximo: n(k.vt_percentual_maximo) },
    },
  } as ParametrosFolha;
}

// ---------------------------------------------------------------- contratos

export async function contratoVigente(
  employeeId: string,
  competencia: string,
): Promise<{ contrato: Contrato; contratoId: string; cctId: string } | null> {
  const [linha] = await consultar<Record<string, never>>(
    // Datas como texto 'AAAA-MM-DD': o motor compara datas como texto, e o
    // driver devolveria um Date (a comparação com texto dava sempre "falso" e
    // o mês de admissão/desligamento saía sem proporcionalizar).
    `SELECT r.*, e.ticket_soma, to_char(e.data_admissao, 'YYYY-MM-DD') AS data_admissao,
            to_char(e.data_desligamento, 'YYYY-MM-DD') AS data_desligamento
       FROM contratos_remuneracao r
       JOIN employees e ON e.id = r.employee_id
      WHERE r.employee_id = $1
        AND daterange(r.vigencia_inicio, r.vigencia_fim, '[]') @> $2::date
      ORDER BY r.vigencia_inicio DESC LIMIT 1`,
    [employeeId, primeiroDia(competencia)],
  );
  if (!linha) return null;

  const l = linha as never as Record<string, never>;
  let cargas: Array<{ aulas: string; valor: string | null }> = [];
  if (l.regime === "HORISTA_AULA") {
    cargas = await consultar<{ aulas: string; valor: string | null }>(
      `SELECT aulas, valor_hora_centavos AS valor FROM contrato_cargas_segmento WHERE contrato_id = $1`,
      [l.id],
    );
  }
  return montarContratoVigente(employeeId, l, cargas);
}

/** Monta o contrato do motor a partir da linha do banco (e das cargas, no horista de aula). */
function montarContratoVigente(
  employeeId: string,
  l: Record<string, never>,
  cargas: Array<{ aulas: string; valor: string | null }>,
): { contrato: Contrato; contratoId: string; cctId: string } {
  const n = (v: unknown) => Number(v);
  const base = {
    funcionarioId: employeeId,
    dataAdmissao: l.data_admissao,
    dataDesligamento: l.data_desligamento,
    cctId: l.cct_id,
    dependentesIrrf: n(l.dependentes_irrf),
    periodosTempoServico: n(l.periodos_tempo_servico),
    remuneracaoOutrosVinculos: n(l.remuneracao_outros_vinculos_centavos),
    inssDescontadoOutrosVinculos: n(l.inss_outros_vinculos_centavos),
    // Só professor (hora-aula) tem o Ticket descontado da folha; para colaborador o Ticket é positivo.
    // Exceção por pessoa: professor marcado "ticket_soma" recebe como colaborador (não desconta).
    valorTicket: l.tem_ticket && l.regime === "HORISTA_AULA" && !l.ticket_soma ? n(l.valor_ticket_centavos) : 0,
  };

  let contrato: Contrato;
  if (l.regime === "HORISTA_AULA") {
    contrato = { ...base, regime: "HORISTA_AULA",
      valorHoraAula: n(l.valor_hora_aula_centavos), aulasSemanais: n(l.aulas_semanais),
      cargas: cargas.map((c) => ({ aulas: Number(c.aulas), valorHora: c.valor === null ? null : Number(c.valor) })) };
  } else if (l.regime === "MENSALISTA") {
    contrato = { ...base, regime: "MENSALISTA",
      salarioBaseMensal: n(l.salario_base_centavos), cargaHorariaSemanal: n(l.carga_horaria_semanal) };
  } else {
    contrato = { ...base, regime: "HORISTA_RELOGIO",
      valorHora: n(l.valor_hora_centavos), horasSemanais: n(l.horas_semanais) };
  }
  return { contrato, contratoId: l.id, cctId: l.cct_id };
}

/**
 * Contrato vigente de muita gente de uma vez (2 consultas no total, em vez de
 * 1 ou 2 por pessoa). Mesmo critério e mesmo resultado de `contratoVigente`.
 */
export async function contratosVigentesEmLote(
  employeeIds: string[],
  competencia: string,
): Promise<Map<string, { contrato: Contrato; contratoId: string; cctId: string }>> {
  const resultado = new Map<string, { contrato: Contrato; contratoId: string; cctId: string }>();
  if (employeeIds.length === 0) return resultado;
  const linhas = await consultar<Record<string, never>>(
    `SELECT DISTINCT ON (r.employee_id) r.*, e.ticket_soma, to_char(e.data_admissao, 'YYYY-MM-DD') AS data_admissao,
            to_char(e.data_desligamento, 'YYYY-MM-DD') AS data_desligamento
       FROM contratos_remuneracao r
       JOIN employees e ON e.id = r.employee_id
      WHERE r.employee_id = ANY($1::uuid[])
        AND daterange(r.vigencia_inicio, r.vigencia_fim, '[]') @> $2::date
      ORDER BY r.employee_id, r.vigencia_inicio DESC`,
    [employeeIds, primeiroDia(competencia)],
  );
  const idsHorista = linhas.filter((l) => (l as never as Record<string, string>).regime === "HORISTA_AULA")
    .map((l) => (l as never as Record<string, string>).id);
  const cargasPorContrato = new Map<string, Array<{ aulas: string; valor: string | null }>>();
  if (idsHorista.length > 0) {
    const cargas = await consultar<{ contrato_id: string; aulas: string; valor: string | null }>(
      `SELECT contrato_id, aulas, valor_hora_centavos AS valor
         FROM contrato_cargas_segmento WHERE contrato_id = ANY($1::uuid[])`,
      [idsHorista],
    );
    for (const c of cargas) {
      const lista = cargasPorContrato.get(c.contrato_id) ?? [];
      lista.push({ aulas: c.aulas, valor: c.valor });
      cargasPorContrato.set(c.contrato_id, lista);
    }
  }
  for (const linha of linhas) {
    const l = linha as never as Record<string, never>;
    const idFuncionario = String(l.employee_id);
    resultado.set(idFuncionario, montarContratoVigente(idFuncionario, l, cargasPorContrato.get(String(l.id)) ?? []));
  }
  return resultado;
}

// ---------------------------------------------------------------- movimento

export async function movimentoDaCompetencia(
  periodoId: string,
  employeeId: string,
  competencia: string,
): Promise<MovimentoMensal> {
  const [l] = await consultar<Record<string, never>>(
    `SELECT * FROM folha_movimentos WHERE periodo_id = $1 AND employee_id = $2`,
    [periodoId, employeeId],
  );
  return movimentoDeLinha(l, competencia);
}

/** Converte a linha de `folha_movimentos` (ou a falta dela) no movimento do motor. */
export function movimentoDeLinha(l: Record<string, never> | undefined, competencia: string): MovimentoMensal {
  const vazio = movimentoVazio(normalizar(competencia) as never);
  if (!l) return vazio;

  const m = l as never as Record<string, never>;
  const n = (v: unknown) => Number(v ?? 0);
  return {
    ...vazio,
    aulasEfetivas: n(m.aulas_efetivas),
    aulasExtrasSemanais: n(m.aulas_extras_semanais),
    valorHoraExtra: n(m.valor_hora_extra_centavos),
    aulasExtras: n(m.aulas_extras),
    aulasSubstituicao: n(m.aulas_substituicao),
    aulasNoturnas: n(m.aulas_noturnas),
    aulasNaoDadas: n(m.aulas_nao_dadas),
    semanasComFaltaInjustificada: n(m.semanas_falta_injustificada),
    diasFalta: n(m.dias_falta),
    diasFaltaInjustificada: n(m.dias_falta_injustificada),
    horasExtras50: n(m.horas_extras_50),
    horasExtras100: n(m.horas_extras_100),
    horasNoturnas: n(m.horas_noturnas),
    horasBancoADescontar: n(m.horas_banco_a_descontar),
    diasUteisCompetencia: m.dias_uteis_competencia === null ? null : n(m.dias_uteis_competencia),
    repousosCompetencia: m.repousos_competencia === null ? null : n(m.repousos_competencia),
    valeTransporteCusto: n(m.vale_transporte_centavos),
    pensao: m.pensao_modo && n(m.pensao_quantidade) > 0
      ? { modo: m.pensao_modo as never, quantidade: n(m.pensao_quantidade) }
      : null,
    // Valor cheio, fora das bases (NEUTRA) — igual à prévia do navegador.
    outrosDescontos: DESCONTOS_MES
      .filter((d) => n(m[d.coluna]) > 0)
      .map((d) => ({
        descricao: d.campo === "descontoOutros" && m.desconto_outros_obs
          ? `Outros descontos — ${String(m.desconto_outros_obs)}` : d.rotulo,
        valor: n(m[d.coluna]), naturezaBase: "NEUTRA" as const,
        incideInss: false, incideIrrf: false, incideFgts: false,
      })),
  };
}

/** Outro vínculo lançado no mês; null quando não houver (o cálculo usa o do contrato). */
export async function outrosVinculosDoMovimento(
  periodoId: string,
  employeeId: string,
): Promise<{ remuneracaoOutrosVinculos: number; inssDescontadoOutrosVinculos: number } | null> {
  const [l] = await consultar<{ r: string; i: string }>(
    `SELECT remuneracao_outros_vinculos_centavos AS r, inss_outros_vinculos_centavos AS i
       FROM folha_movimentos WHERE periodo_id = $1 AND employee_id = $2`,
    [periodoId, employeeId],
  );
  if (!l || (Number(l.r) === 0 && Number(l.i) === 0)) return null;
  return { remuneracaoOutrosVinculos: Number(l.r), inssDescontadoOutrosVinculos: Number(l.i) };
}

/** Mesmo critério de `outrosVinculosDoMovimento`, a partir da linha já lida. */
export function outrosVinculosDeLinha(
  l: Record<string, never> | undefined,
): { remuneracaoOutrosVinculos: number; inssDescontadoOutrosVinculos: number } | null {
  if (!l) return null;
  const r = Number(l.remuneracao_outros_vinculos_centavos);
  const i = Number(l.inss_outros_vinculos_centavos);
  if (r === 0 && i === 0) return null;
  return { remuneracaoOutrosVinculos: r, inssDescontadoOutrosVinculos: i };
}

/**
 * Garante a linha de movimento de todos de uma vez e devolve as linhas do
 * período por funcionário (1 escrita + 1 leitura, em vez de 3 consultas por pessoa).
 */
export async function garantirELerMovimentos(
  c: pg.PoolClient,
  periodoId: string,
  employeeIds: string[],
): Promise<Map<string, Record<string, never>>> {
  const linhas = new Map<string, Record<string, never>>();
  if (employeeIds.length === 0) return linhas;
  await c.query(
    `INSERT INTO folha_movimentos (periodo_id, employee_id)
     SELECT $1, x FROM unnest($2::uuid[]) AS x
     ON CONFLICT (periodo_id, employee_id) DO NOTHING`,
    [periodoId, employeeIds],
  );
  const lidas = await c.query(
    `SELECT * FROM folha_movimentos WHERE periodo_id = $1 AND employee_id = ANY($2::uuid[])`,
    [periodoId, employeeIds],
  );
  for (const l of lidas.rows) linhas.set(l.employee_id, l);
  return linhas;
}

/** Garante a linha de movimento: o cálculo tem FK obrigatória para ela. */
export async function garantirMovimento(
  c: pg.PoolClient,
  periodoId: string,
  employeeId: string,
): Promise<void> {
  await c.query(
    `INSERT INTO folha_movimentos (periodo_id, employee_id)
     VALUES ($1, $2) ON CONFLICT (periodo_id, employee_id) DO NOTHING`,
    [periodoId, employeeId],
  );
}

/**
 * Movimentos de uma competência, na mesma forma achatada que
 * `L.estado.movimentos` sempre teve no protótipo — é o que alimenta a
 * prévia ao vivo (`L.calcular`) no navegador, sem duplicar a lógica de
 * cálculo em dois lugares.
 */
export async function listarMovimentosCompetencia(competencia: string): Promise<Record<string, unknown>[]> {
  return consultar(
    `SELECT m.employee_id AS "funcionarioId", p.competencia,
            m.aulas_extras::float8 AS "aulasExtras", m.aulas_substituicao::float8 AS "aulasSubstituicao",
            m.aulas_noturnas::float8 AS "aulasNoturnas", m.aulas_nao_dadas::float8 AS "aulasNaoDadas",
            m.semanas_falta_injustificada AS "semanasFalta", m.dias_falta::float8 AS "diasFalta",
            m.horas_extras_50::float8 AS "horasExtras50", m.horas_extras_100::float8 AS "horasExtras100",
            m.horas_noturnas::float8 AS "horasNoturnas", m.vale_transporte_centavos::int AS "valeTransporte",
            m.aulas_extras_semanais::float8 AS "aulasExtrasSemanais",
            m.valor_hora_extra_centavos::int AS "valorHoraExtra",
            m.pensao_modo AS "pensaoModo", m.pensao_quantidade::float8 AS "pensaoQuantidade",
            coalesce(nullif(m.remuneracao_outros_vinculos_centavos, 0), cr.remuneracao_outros_vinculos_centavos, 0)::int AS "remuneracaoOutrosVinculos",
            coalesce(nullif(m.inss_outros_vinculos_centavos, 0), cr.inss_outros_vinculos_centavos, 0)::int AS "inssOutrosVinculos",
            m.desconto_cantina_centavos::int AS "descontoCantina", m.desconto_material_centavos::int AS "descontoMaterial",
            m.desconto_mensalidade_centavos::int AS "descontoMensalidade", m.desconto_plano_saude_centavos::int AS "descontoPlanoSaude",
            m.desconto_adiantamento_centavos::int AS "descontoAdiantamento",
            m.desconto_robotica_centavos::int AS "descontoRobotica", m.desconto_emprestimos_centavos::int AS "descontoEmprestimos",
            m.desconto_outros_centavos::int AS "descontoOutros", m.desconto_outros_obs AS "descontoOutrosObs"
       FROM folha_movimentos m
       JOIN folha_periodos p ON p.id = m.periodo_id
       LEFT JOIN LATERAL (
         SELECT * FROM contratos_remuneracao c
          WHERE c.employee_id = m.employee_id
            AND daterange(c.vigencia_inicio, c.vigencia_fim, '[]') @> (p.competencia || '-01')::date
          ORDER BY c.vigencia_inicio DESC LIMIT 1
       ) cr ON true
      WHERE p.competencia = $1 AND p.tipo_folha = 'MENSAL'`,
    [normalizar(competencia)],
  );
}

export interface MovimentoEntrada {
  aulasExtrasSemanais?: number;
  valorHoraExtra?: number;
  aulasExtras?: number;
  aulasSubstituicao?: number;
  aulasNoturnas?: number;
  aulasNaoDadas?: number;
  semanasFalta?: number;
  horasExtras50?: number;
  horasExtras100?: number;
  diasFalta?: number;
  horasNoturnas?: number;
  valeTransporte?: number;
  /** Outro emprego CLT no mês (centavos), lançado no movimento da competência. */
  remuneracaoOutrosVinculos?: number;
  inssOutrosVinculos?: number;
  /** VALOR (centavos), PERCENTUAL_LIQUIDO ou PERCENTUAL_SALARIO_MINIMO (percentual); vazio remove. */
  pensaoModo?: string | null;
  pensaoQuantidade?: number;
  descontoCantina?: number;
  descontoMaterial?: number;
  descontoMensalidade?: number;
  descontoPlanoSaude?: number;
  descontoAdiantamento?: number;
  descontoRobotica?: number;
  descontoEmprestimos?: number;
  descontoOutros?: number;
  descontoOutrosObs?: string;
}

/** Descontos do mês: campo da API → coluna e texto do holerite. */
const DESCONTOS_MES = [
  { campo: "descontoCantina", coluna: "desconto_cantina_centavos", rotulo: "Cantina" },
  { campo: "descontoMaterial", coluna: "desconto_material_centavos", rotulo: "Material escolar" },
  { campo: "descontoMensalidade", coluna: "desconto_mensalidade_centavos", rotulo: "Mensalidade" },
  { campo: "descontoPlanoSaude", coluna: "desconto_plano_saude_centavos", rotulo: "Plano de saúde" },
  { campo: "descontoAdiantamento", coluna: "desconto_adiantamento_centavos", rotulo: "Adiantamento (vale)" },
  { campo: "descontoRobotica", coluna: "desconto_robotica_centavos", rotulo: "Robótica" },
  { campo: "descontoEmprestimos", coluna: "desconto_emprestimos_centavos", rotulo: "Empréstimos" },
  { campo: "descontoOutros", coluna: "desconto_outros_centavos", rotulo: "Outros descontos" },
] as const;

const MODOS_PENSAO = ["VALOR", "PERCENTUAL_LIQUIDO", "PERCENTUAL_SALARIO_MINIMO"];

// Limites de sanidade por campo: acima disso é erro de digitação, não folha.
const LIMITES_MOVIMENTO: Record<Exclude<keyof MovimentoEntrada, "pensaoModo" | "pensaoQuantidade" | "descontoOutrosObs">, { max: number; inteiro?: boolean; moeda?: boolean; rotulo: string }> = {
  aulasExtrasSemanais: { max: 60, rotulo: "Aula extra / projeto semanal" },
  valorHoraExtra: { max: 100_000, moeda: true, rotulo: "Hora-aula da carga extra" },
  aulasExtras: { max: 500, rotulo: "Aulas extras" },
  aulasSubstituicao: { max: 500, rotulo: "Aulas avulsas" },
  aulasNoturnas: { max: 500, rotulo: "Aulas noturnas" },
  aulasNaoDadas: { max: 500, rotulo: "Aulas não ministradas" },
  semanasFalta: { max: 6, inteiro: true, rotulo: "Semanas com falta" },
  horasExtras50: { max: 300, rotulo: "Horas extras 50%" },
  horasExtras100: { max: 300, rotulo: "Horas extras 100%" },
  diasFalta: { max: 31, rotulo: "Dias de falta" },
  horasNoturnas: { max: 400, rotulo: "Horas noturnas" },
  valeTransporte: { max: 500_000, moeda: true, rotulo: "Vale-transporte" },
  remuneracaoOutrosVinculos: { max: 10_000_000, moeda: true, rotulo: "Remuneração em outra escola" },
  inssOutrosVinculos: { max: 1_000_000, moeda: true, rotulo: "INSS já retido na outra escola" },
  descontoCantina: { max: 5_000_000, moeda: true, rotulo: "Cantina" },
  descontoMaterial: { max: 5_000_000, moeda: true, rotulo: "Material escolar" },
  descontoMensalidade: { max: 5_000_000, moeda: true, rotulo: "Mensalidade" },
  descontoPlanoSaude: { max: 5_000_000, moeda: true, rotulo: "Plano de saúde" },
  descontoAdiantamento: { max: 5_000_000, moeda: true, rotulo: "Adiantamento" },
  descontoRobotica: { max: 5_000_000, moeda: true, rotulo: "Robótica" },
  descontoEmprestimos: { max: 5_000_000, moeda: true, rotulo: "Empréstimos" },
  descontoOutros: { max: 5_000_000, moeda: true, rotulo: "Outros descontos" },
};

function validarMovimento(dados: MovimentoEntrada): void {
  if (dados.pensaoModo !== undefined && dados.pensaoModo !== null && dados.pensaoModo !== "" &&
      !MODOS_PENSAO.includes(dados.pensaoModo)) {
    throw Object.assign(new Error("Pensão: tipo inválido."), { statusCode: 400 });
  }
  if (dados.pensaoQuantidade !== undefined) {
    const q = dados.pensaoQuantidade;
    const percentual = dados.pensaoModo === "PERCENTUAL_LIQUIDO" || dados.pensaoModo === "PERCENTUAL_SALARIO_MINIMO";
    const max = percentual ? 100 : 5_000_000;
    if (typeof q !== "number" || !Number.isFinite(q) || q < 0 || q > max) {
      throw Object.assign(
        new Error(percentual ? "Pensão: percentual entre 0 e 100." : "Pensão: valor entre R$ 0,00 e R$ 50.000,00."),
        { statusCode: 400 },
      );
    }
  }
  if ((dados.descontoOutros ?? 0) > 0 && dados.descontoOutrosObs !== undefined && !String(dados.descontoOutrosObs ?? "").trim()) {
    throw Object.assign(new Error("Explique os outros descontos no campo de observação."), { statusCode: 400 });
  }
  for (const [campo, regra] of Object.entries(LIMITES_MOVIMENTO)) {
    let v = (dados as Record<string, unknown>)[campo];
    if (v === undefined) continue;
    // Dinheiro é em centavos inteiros: R$ 1,005 não existe, arredonda.
    if (regra.moeda && typeof v === "number" && Number.isFinite(v)) {
      v = Math.round(v);
      (dados as Record<string, unknown>)[campo] = v;
    }
    const ok = typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= regra.max &&
      (!regra.inteiro || Number.isInteger(v));
    if (!ok) {
      throw Object.assign(
        new Error(`${regra.rotulo}: valor inválido. Use um valor entre 0 e ${regra.moeda
          ? (regra.max / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
          : regra.max}${regra.inteiro ? ", sem casas decimais" : ""}.`),
        { statusCode: 400 },
      );
    }
  }
}

/** Lança/edita o movimento de uma pessoa na competência aberta — o "o que não
 * veio do cadastro entra aqui" da tela local, agora gravado de verdade. */
export async function atualizarMovimento(
  ator: Ator,
  competencia: string,
  employeeId: string,
  dados: MovimentoEntrada,
): Promise<void> {
  validarMovimento(dados);
  const comp = normalizar(competencia);
  await transacao(ator, (c) => atualizarMovimentoTx(c, comp, employeeId, dados));
}

async function atualizarMovimentoTx(
  c: pg.PoolClient,
  comp: string,
  employeeId: string,
  dados: MovimentoEntrada,
): Promise<{ periodoId: string }> {
  const periodo = (await c.query(
    `SELECT id, status FROM folha_periodos WHERE competencia = $1 AND tipo_folha = 'MENSAL'`,
    [comp],
  )).rows[0] as { id: string; status: string } | undefined;
  if (!periodo) throw Object.assign(new Error(`A competência ${comp.slice(5)}/${comp.slice(0, 4)} ainda não foi aberta. Abra em Folha > Abrir competência, ou volte para o mês em aberto.`), { statusCode: 404 });
  if (periodo.status === "FECHADO") {
    throw Object.assign(
      new Error("Competência fechada — reabra antes de lançar movimento."),
      { statusCode: 409 },
    );
  }
  const existe = await c.query("SELECT 1 FROM employees WHERE id = $1", [employeeId]);
  if (!existe.rowCount) throw Object.assign(new Error("Funcionário não encontrado. Atualize a tela e tente de novo."), { statusCode: 404 });
  await garantirMovimento(c, periodo.id, employeeId);

  const campos: string[] = [];
  const valores: unknown[] = [];
  const add = (coluna: string, valor: unknown) => { valores.push(valor); campos.push(`${coluna} = $${valores.length}`); };
  if (dados.aulasExtrasSemanais !== undefined) add("aulas_extras_semanais", dados.aulasExtrasSemanais);
  if (dados.valorHoraExtra !== undefined) add("valor_hora_extra_centavos", dados.valorHoraExtra);
  if (dados.aulasExtras !== undefined) add("aulas_extras", dados.aulasExtras);
  if (dados.aulasSubstituicao !== undefined) add("aulas_substituicao", dados.aulasSubstituicao);
  if (dados.aulasNoturnas !== undefined) add("aulas_noturnas", dados.aulasNoturnas);
  if (dados.aulasNaoDadas !== undefined) add("aulas_nao_dadas", dados.aulasNaoDadas);
  if (dados.semanasFalta !== undefined) add("semanas_falta_injustificada", dados.semanasFalta);
  if (dados.horasExtras50 !== undefined) add("horas_extras_50", dados.horasExtras50);
  if (dados.horasExtras100 !== undefined) add("horas_extras_100", dados.horasExtras100);
  if (dados.diasFalta !== undefined) add("dias_falta", dados.diasFalta);
  if (dados.horasNoturnas !== undefined) add("horas_noturnas", dados.horasNoturnas);
  if (dados.valeTransporte !== undefined) add("vale_transporte_centavos", dados.valeTransporte);
  if (dados.pensaoModo !== undefined) {
    const semPensao = !dados.pensaoModo || !dados.pensaoQuantidade;
    add("pensao_modo", semPensao ? null : dados.pensaoModo);
    add("pensao_quantidade", semPensao ? null : dados.pensaoQuantidade);
  }
  if (dados.remuneracaoOutrosVinculos !== undefined) add("remuneracao_outros_vinculos_centavos", dados.remuneracaoOutrosVinculos);
  if (dados.inssOutrosVinculos !== undefined) add("inss_outros_vinculos_centavos", dados.inssOutrosVinculos);
  for (const d of DESCONTOS_MES) {
    const v = dados[d.campo];
    if (v !== undefined) add(d.coluna, Math.round(v));
  }
  if (dados.descontoOutrosObs !== undefined) add("desconto_outros_obs", String(dados.descontoOutrosObs).slice(0, 200));
  if (!campos.length) return { periodoId: periodo.id };
  valores.push(periodo.id, employeeId);
  await c.query(
    `UPDATE folha_movimentos SET ${campos.join(", ")}
      WHERE periodo_id = $${valores.length - 1} AND employee_id = $${valores.length}`,
    valores,
  );
  return { periodoId: periodo.id };
}

// ---------------------------------------------------------------- competências

/**
 * Reabrir uma folha fechada é o ato mais sensível do módulo — pode já ter
 * sido paga e enviada à contabilidade. Exige justificativa (mesma regra do
 * protótipo: pelo menos 10 caracteres), gravada em
 * `folha_periodo_reaberturas` (append-only, migration 013) — a mudança de
 * status em si já cai sozinha em `audit_logs` pelo trigger da migration 007,
 * mas só essa tabela nova guarda o PORQUÊ.
 */
export async function reabrirCompetencia(
  ator: Ator,
  competencia: string,
  motivo: string,
): Promise<{ id: string; status: string }> {
  const texto = (motivo || "").trim();
  if (texto.length < 10) {
    throw Object.assign(
      new Error("Descreva em pelo menos 10 caracteres por que a folha precisa ser reaberta."),
      { statusCode: 400 },
    );
  }
  if (!ator.userId) throw Object.assign(new Error("Sessão inválida."), { statusCode: 401 });

  return transacao(ator, async (c) => {
    const [periodo] = await consultar<{ id: string; status: string }>(
      `SELECT id, status FROM folha_periodos WHERE competencia = $1 AND tipo_folha = 'MENSAL'`,
      [normalizar(competencia)],
    );
    if (!periodo) throw Object.assign(new Error("Competência não encontrada."), { statusCode: 404 });
    if (periodo.status !== "FECHADO") {
      throw Object.assign(new Error("Esta competência não está fechada."), { statusCode: 409 });
    }

    const r = await c.query(
      `UPDATE folha_periodos SET status = 'EM_CALCULO', fechado_por = NULL, fechado_em = NULL
        WHERE id = $1 RETURNING id, status`,
      [periodo.id],
    );
    await c.query(
      `INSERT INTO folha_periodo_reaberturas (periodo_id, motivo, reaberto_por) VALUES ($1,$2,$3)`,
      [periodo.id, texto, ator.userId],
    );
    return r.rows[0];
  });
}

// ---------------------------------------------------------------- cálculo

/**
 * Grava o resultado. O `parametros_snapshot` é o que torna o recálculo
 * reproduzível anos depois: guardar só o id do parâmetro não adianta se a
 * linha apontada puder mudar.
 */
export async function gravarCalculo(
  c: pg.PoolClient,
  periodoId: string,
  employeeId: string,
  contratoId: string,
  parametros: ParametrosFolha,
  contrato: Contrato,
  movimento: MovimentoMensal,
  resultado: ResultadoFolha,
): Promise<string> {
  const anterior = await c.query(
    "SELECT id FROM folha_calculos WHERE periodo_id = $1 AND employee_id = $2",
    [periodoId, employeeId],
  );
  if (anterior.rowCount) {
    await c.query("DELETE FROM folha_rubricas WHERE calculo_id = $1", [anterior.rows[0].id]);
    await c.query("DELETE FROM folha_calculos WHERE id = $1", [anterior.rows[0].id]);
  }

  const calc = await c.query(
    `INSERT INTO folha_calculos
       (periodo_id, employee_id, competencia, contrato_remuneracao_id, cct_id,
        tabela_inss_id, tabela_irrf_id, parametros_snapshot,
        base_inss_centavos, base_irrf_centavos, base_fgts_centavos,
        total_proventos_centavos, total_descontos_centavos, liquido_centavos,
        remuneracao_bruta_centavos, custo_empregador_centavos, memoria, avisos)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING id`,
    [
      periodoId, employeeId, resultado.competencia, contratoId, parametros.cct.id,
      parametros.inss.id, parametros.irrf.id,
      JSON.stringify({ parametros, contrato, movimento }),
      resultado.baseInss, resultado.baseIrrf, resultado.baseFgts,
      resultado.totalProventos, resultado.totalDescontos, resultado.liquido,
      resultado.remuneracaoBruta, resultado.custoTotalEmpregador,
      JSON.stringify(resultado.memoria), JSON.stringify(resultado.avisos),
    ],
  );
  const calculoId = calc.rows[0].id;

  for (const [i, r] of resultado.rubricas.entries()) {
    await c.query(
      `INSERT INTO folha_rubricas
         (calculo_id, ordem, codigo, descricao, referencia, tipo, natureza_base,
          valor_centavos, incide_inss, incide_irrf, incide_fgts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [calculoId, i + 1, r.codigo, r.descricao, r.referencia, r.tipo,
       r.naturezaBase, r.valor, r.incideInss, r.incideIrrf, r.incideFgts],
    );
  }
  return calculoId;
}

/**
 * Grava o cálculo de muita gente de uma vez. Faz exatamente o que
 * `gravarCalculo` faz para cada pessoa (apaga o cálculo anterior e suas
 * rubricas, grava o novo e as rubricas na mesma ordem), mas com consultas em
 * lote: poucas idas ao banco em vez de uma dúzia por pessoa.
 */
export async function gravarCalculosEmLote(
  c: pg.PoolClient,
  periodoId: string,
  itens: Array<{
    employeeId: string;
    contratoId: string;
    parametros: ParametrosFolha;
    contrato: Contrato;
    movimento: MovimentoMensal;
    resultado: ResultadoFolha;
  }>,
): Promise<void> {
  if (itens.length === 0) return;
  const ids = itens.map((i) => i.employeeId);
  await c.query(
    `DELETE FROM folha_rubricas WHERE calculo_id IN (
       SELECT id FROM folha_calculos WHERE periodo_id = $1 AND employee_id = ANY($2::uuid[]))`,
    [periodoId, ids],
  );
  await c.query("DELETE FROM folha_calculos WHERE periodo_id = $1 AND employee_id = ANY($2::uuid[])", [periodoId, ids]);

  const idPorFuncionario = new Map<string, string>();
  const COLUNAS_CALCULO = 18;
  const LOTE_CALCULOS = 200;
  for (let ini = 0; ini < itens.length; ini += LOTE_CALCULOS) {
    const fatia = itens.slice(ini, ini + LOTE_CALCULOS);
    const valores: unknown[] = [];
    const grupos = fatia.map((it, k) => {
      const r = it.resultado;
      valores.push(
        periodoId, it.employeeId, r.competencia, it.contratoId, it.parametros.cct.id,
        it.parametros.inss.id, it.parametros.irrf.id,
        JSON.stringify({ parametros: it.parametros, contrato: it.contrato, movimento: it.movimento }),
        r.baseInss, r.baseIrrf, r.baseFgts,
        r.totalProventos, r.totalDescontos, r.liquido,
        r.remuneracaoBruta, r.custoTotalEmpregador,
        JSON.stringify(r.memoria), JSON.stringify(r.avisos),
      );
      const o = k * COLUNAS_CALCULO;
      return "(" + Array.from({ length: COLUNAS_CALCULO }, (_, j) => `$${o + j + 1}`).join(",") + ")";
    });
    const inseridos = await c.query(
      `INSERT INTO folha_calculos
         (periodo_id, employee_id, competencia, contrato_remuneracao_id, cct_id,
          tabela_inss_id, tabela_irrf_id, parametros_snapshot,
          base_inss_centavos, base_irrf_centavos, base_fgts_centavos,
          total_proventos_centavos, total_descontos_centavos, liquido_centavos,
          remuneracao_bruta_centavos, custo_empregador_centavos, memoria, avisos)
       VALUES ${grupos.join(",")}
       RETURNING id, employee_id`,
      valores,
    );
    for (const l of inseridos.rows) idPorFuncionario.set(l.employee_id, l.id);
  }

  const COLUNAS_RUBRICA = 11;
  const LOTE_RUBRICAS = 500;
  const rubricas: unknown[][] = [];
  for (const it of itens) {
    const calculoId = idPorFuncionario.get(it.employeeId)!;
    for (const [i, r] of it.resultado.rubricas.entries()) {
      rubricas.push([calculoId, i + 1, r.codigo, r.descricao, r.referencia, r.tipo,
        r.naturezaBase, r.valor, r.incideInss, r.incideIrrf, r.incideFgts]);
    }
  }
  for (let ini = 0; ini < rubricas.length; ini += LOTE_RUBRICAS) {
    const fatia = rubricas.slice(ini, ini + LOTE_RUBRICAS);
    const grupos = fatia.map((_, k) => {
      const o = k * COLUNAS_RUBRICA;
      return "(" + Array.from({ length: COLUNAS_RUBRICA }, (_, j) => `$${o + j + 1}`).join(",") + ")";
    });
    await c.query(
      `INSERT INTO folha_rubricas
         (calculo_id, ordem, codigo, descricao, referencia, tipo, natureza_base,
          valor_centavos, incide_inss, incide_irrf, incide_fgts)
       VALUES ${grupos.join(",")}`,
      fatia.flat(),
    );
  }
}

// ---------------------------------------------------------------- 13º, férias e rescisão
//
// Mensalista usa o próprio salário-base. Horista (hora-aula/hora-relógio) por
// lei usa a MÉDIA das remunerações variáveis do período (Súmula 253/172 TST)
// — este sistema ainda não acumula histórico de muitos meses por pessoa
// (a primeira competência calculada foi setembro/2026), então a média é
// tirada do que já existe em `folha_calculos` e melhora sozinha conforme mais
// competências forem fechadas.
//
// Quando NÃO HÁ histórico nenhum ainda (funcionário novo, ou sistema
// recém-implantado), `AVG` devolve NULL — devolver 0 nesse caso faria o
// 13º/férias sair zerado sem aviso nenhum, silenciosamente errado. Em vez
// disso, reaproveita o PRÓPRIO `calcularFolha` (o motor mensal, já testado)
// com um movimento vazio (mês cheio, sem falta/extra) para estimar o que a
// pessoa ganharia num mês normal — mais correto e mais seguro do que
// reimplementar a fórmula de hora-aula/hora-relógio de novo aqui, com risco
// de divergir do motor real.
export async function baseRemuneracaoMensal(
  employeeId: string,
  contratoId: string,
  contrato: Contrato,
  parametros: ParametrosFolha,
): Promise<number> {
  if (contrato.regime === "MENSALISTA") return contrato.salarioBaseMensal;
  // Filtra pelo contrato ATUAL: se o regime ou os valores mudaram ao longo
  // do tempo (reajuste, troca de carga horária), misturar a média com
  // competências de um contrato_remuneracao_id diferente distorceria a
  // base — cada contrato tem sua própria história de remuneração.
  const [linha] = await consultar<{ media: string | null }>(
    `SELECT AVG(total_proventos_centavos)::bigint AS media
       FROM folha_calculos WHERE employee_id = $1 AND contrato_remuneracao_id = $2`,
    [employeeId, contratoId],
  );
  if (linha?.media != null) return Number(linha.media);

  // Mês corrente (não janeiro fixo): tem que cair dentro da janela de
  // vigência de QUALQUER contrato ativo, inclusive de quem foi admitido
  // depois de janeiro — janeiro fixo zeraria a estimativa desses casos.
  const hoje = new Date();
  const competenciaEstimativa = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const estimativa = calcularFolha(
    contrato,
    movimentoVazio(competenciaEstimativa as never),
    parametros,
  );
  return estimativa.totalProventos;
}

export async function gravarDecimoTerceiro(
  c: pg.PoolClient,
  employeeId: string,
  contratoId: string,
  contrato: Contrato,
  ano: string,
  parcela: 1 | 2,
  base: number,
  parametros: ParametrosFolha,
): Promise<{ id: string; resultado: ReturnType<typeof calcular13Salario> }> {
  const meses = mesesTrabalhadosNoAno(contrato.dataAdmissao, contrato.dataDesligamento, ano);

  // Na 2ª parcela, "quanto já foi pago" precisa vir do registro REAL da 1ª
  // parcela (persistido), nunca recalculado com a base atual — para
  // horista, a base (média de `folha_calculos`) muda mês a mês, então
  // recalcular a metade agora deduziria um valor diferente do que de fato
  // saiu na 1ª parcela, distorcendo a 2ª. `undefined` (1ª parcela nunca
  // calculada) cai no fallback do próprio motor (assume metade da base
  // atual) — a divergência resultante fica registrada no aviso, não escondida.
  let valorJaAntecipado: number | undefined;
  if (parcela === 2) {
    const [parcela1] = await c.query(
      "SELECT total_proventos_centavos AS valor FROM folha_decimo_terceiro WHERE employee_id = $1 AND ano = $2 AND parcela = 1",
      [employeeId, ano],
    ).then((r) => r.rows as { valor: string }[]);
    if (parcela1) valorJaAntecipado = Number(parcela1.valor);
  }

  const resultado13 = calcular13Salario(
    {
      funcionarioId: employeeId, ano, baseRemuneracaoMensal: base,
      mesesTrabalhados: meses, dependentesIrrf: contrato.dependentesIrrf, parcela,
      valorJaAntecipado,
    },
    { inss: parametros.inss, irrf: parametros.irrf, fgtsPercentual: parametros.cct.encargos.fgtsPercentual },
  );
  const resultado = parametros.impostosPelaContabilidade ? semImpostosDaContabilidade(resultado13) : resultado13;
  if (parcela === 2 && valorJaAntecipado === undefined) {
    resultado.avisos.push({
      severidade: "DIVERGENCIA",
      mensagem:
        "1ª parcela deste ano não está registrada no sistema: a dedução da 2ª parcela foi estimada, não confirmada com o valor realmente pago. Confira antes de marcar como pago.",
    });
  }

  const anterior = await c.query(
    "SELECT id FROM folha_decimo_terceiro WHERE employee_id = $1 AND ano = $2 AND parcela = $3",
    [employeeId, ano, parcela],
  );
  if (anterior.rowCount) {
    await c.query("DELETE FROM folha_decimo_terceiro_rubricas WHERE decimo_id = $1", [anterior.rows[0].id]);
    await c.query("DELETE FROM folha_decimo_terceiro WHERE id = $1", [anterior.rows[0].id]);
  }

  const ins = await c.query(
    `INSERT INTO folha_decimo_terceiro
       (employee_id, ano, parcela, contrato_remuneracao_id, base_remuneracao_centavos, meses_trabalhados,
        base_proporcional_centavos, total_proventos_centavos, total_descontos_centavos, liquido_centavos,
        fgts_centavos, memoria, avisos)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [
      employeeId, ano, parcela, contratoId, base, meses, resultado.baseProporcional,
      resultado.totalProventos, resultado.totalDescontos, resultado.liquido, resultado.fgts,
      JSON.stringify(resultado.memoria), JSON.stringify(resultado.avisos),
    ],
  );
  const id = ins.rows[0].id;
  for (const [i, r] of resultado.rubricas.entries()) {
    await c.query(
      `INSERT INTO folha_decimo_terceiro_rubricas
         (decimo_id, ordem, codigo, descricao, referencia, tipo, valor_centavos, incide_inss, incide_irrf, incide_fgts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, i + 1, r.codigo, r.descricao, r.referencia, r.tipo, r.valor, r.incideInss, r.incideIrrf, r.incideFgts],
    );
  }
  return { id, resultado };
}

export async function gravarFerias(
  c: pg.PoolClient,
  employeeId: string,
  contratoId: string,
  base: number,
  periodoAquisitivoInicio: string,
  periodoAquisitivoFim: string,
  dataInicioGozo: string,
  diasFerias: number,
  diasVendidos: number,
  dependentesIrrf: number,
  parametros: ParametrosFolha,
): Promise<{ id: string; resultado: ReturnType<typeof calcularFerias> }> {
  const resultadoFerias = calcularFerias(
    { funcionarioId: employeeId, baseRemuneracaoMensal: base, diasFerias, diasVendidos, dependentesIrrf },
    {
      inss: parametros.inss, irrf: parametros.irrf,
      fgtsPercentual: parametros.cct.encargos.fgtsPercentual,
      tercoConstitucional: parametros.cct.encargos.tercoConstitucional,
    },
  );
  const resultado = parametros.impostosPelaContabilidade ? semImpostosDaContabilidade(resultadoFerias) : resultadoFerias;

  const anterior = await c.query(
    "SELECT id FROM folha_ferias WHERE employee_id = $1 AND periodo_aquisitivo_inicio = $2",
    [employeeId, periodoAquisitivoInicio],
  );
  if (anterior.rowCount) {
    await c.query("DELETE FROM folha_ferias_rubricas WHERE ferias_id = $1", [anterior.rows[0].id]);
    await c.query("DELETE FROM folha_ferias WHERE id = $1", [anterior.rows[0].id]);
  }

  const ins = await c.query(
    `INSERT INTO folha_ferias
       (employee_id, contrato_remuneracao_id, periodo_aquisitivo_inicio, periodo_aquisitivo_fim,
        data_inicio_gozo, base_remuneracao_centavos, dias_ferias, dias_vendidos, dias_gozados,
        total_proventos_centavos, total_descontos_centavos, liquido_centavos, fgts_centavos, memoria, avisos)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [
      employeeId, contratoId, periodoAquisitivoInicio, periodoAquisitivoFim, dataInicioGozo,
      base, diasFerias, diasVendidos, resultado.diasGozados,
      resultado.totalProventos, resultado.totalDescontos, resultado.liquido, resultado.fgts,
      JSON.stringify(resultado.memoria), JSON.stringify(resultado.avisos),
    ],
  );
  const id = ins.rows[0].id;
  for (const [i, r] of resultado.rubricas.entries()) {
    await c.query(
      `INSERT INTO folha_ferias_rubricas
         (ferias_id, ordem, codigo, descricao, referencia, tipo, valor_centavos, incide_inss, incide_irrf, incide_fgts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, i + 1, r.codigo, r.descricao, r.referencia, r.tipo, r.valor, r.incideInss, r.incideIrrf, r.incideFgts],
    );
  }
  return { id, resultado };
}

export async function gravarRescisao(
  c: pg.PoolClient,
  employeeId: string,
  contratoId: string,
  base: number,
  tipo: TipoRescisao,
  dataDesligamento: string,
  avisoPrevioIndenizado: boolean,
  diasFeriasVencidas: number,
  mesesFeriasProporcionais: number,
  mesesDecimoTerceiro: number,
  saldoFgtsDepositado: number,
  dataAdmissao: string,
  dependentesIrrf: number,
  parametros: ParametrosFolha,
): Promise<{ id: string; resultado: ReturnType<typeof calcularRescisao> }> {
  const resultadoRescisao = calcularRescisao(
    {
      funcionarioId: employeeId, tipo, dataAdmissao, dataDesligamento,
      baseRemuneracaoMensal: base, dependentesIrrf, avisoPrevioIndenizado,
      diasFeriasVencidas, mesesFeriasProporcionais, mesesDecimoTerceiro, saldoFgtsDepositado,
    },
    {
      inss: parametros.inss, irrf: parametros.irrf,
      fgtsPercentual: parametros.cct.encargos.fgtsPercentual,
      tercoConstitucional: parametros.cct.encargos.tercoConstitucional,
    },
  );
  const resultado = parametros.impostosPelaContabilidade ? semImpostosDaContabilidade(resultadoRescisao) : resultadoRescisao;

  const anterior = await c.query("SELECT id FROM folha_rescisoes WHERE employee_id = $1", [employeeId]);
  if (anterior.rowCount) {
    await c.query("DELETE FROM folha_rescisoes_rubricas WHERE rescisao_id = $1", [anterior.rows[0].id]);
    await c.query("DELETE FROM folha_rescisoes WHERE id = $1", [anterior.rows[0].id]);
  }

  const ins = await c.query(
    `INSERT INTO folha_rescisoes
       (employee_id, contrato_remuneracao_id, tipo, data_desligamento, base_remuneracao_centavos,
        aviso_previo_indenizado, dias_ferias_vencidas, meses_ferias_proporcionais, meses_decimo_terceiro,
        saldo_fgts_depositado_centavos, total_proventos_centavos, total_descontos_centavos,
        liquido_centavos, fgts_centavos, multa_fgts_centavos, memoria, avisos)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
    [
      employeeId, contratoId, tipo, dataDesligamento, base,
      avisoPrevioIndenizado, diasFeriasVencidas, mesesFeriasProporcionais, mesesDecimoTerceiro,
      saldoFgtsDepositado, resultado.totalProventos, resultado.totalDescontos,
      resultado.liquido, resultado.fgts, resultado.multaFgts,
      JSON.stringify(resultado.memoria), JSON.stringify(resultado.avisos),
    ],
  );
  const id = ins.rows[0].id;
  for (const [i, r] of resultado.rubricas.entries()) {
    await c.query(
      `INSERT INTO folha_rescisoes_rubricas
         (rescisao_id, ordem, codigo, descricao, referencia, tipo, valor_centavos, incide_inss, incide_irrf, incide_fgts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, i + 1, r.codigo, r.descricao, r.referencia, r.tipo, r.valor, r.incideInss, r.incideIrrf, r.incideFgts],
    );
  }
  return { id, resultado };
}

/**
 * Divergência da rescisão sai do próprio `avisos`: diferente de 13º e férias,
 * a tabela `folha_rescisoes` não tem a coluna gerada `tem_divergencia`. Ler
 * uma coluna que não existe derrubava a consulta e a homologação com erro 500.
 */
const RESCISAO_TEM_DIVERGENCIA = `(avisos @> '[{"severidade":"DIVERGENCIA"}]'::jsonb)`;

export async function buscarRescisao(employeeId: string) {
  const [r] = await consultar(
    `SELECT id, tipo, data_desligamento AS "dataDesligamento", aviso_previo_indenizado AS "avisoPrevioIndenizado",
            total_proventos_centavos AS proventos, total_descontos_centavos AS descontos,
            liquido_centavos AS liquido, fgts_centavos AS fgts, multa_fgts_centavos AS "multaFgts",
            ${RESCISAO_TEM_DIVERGENCIA} AS "temDivergencia", homologada, homologada_em AS "homologadaEm"
       FROM folha_rescisoes WHERE employee_id = $1`,
    [employeeId],
  );
  return r ?? null;
}

/** null quando a rescisão não existe. */
export async function rescisaoTemDivergencia(id: string): Promise<boolean | null> {
  const [r] = await consultar<{ tem: boolean }>(
    `SELECT ${RESCISAO_TEM_DIVERGENCIA} AS tem FROM folha_rescisoes WHERE id = $1`,
    [id],
  );
  return r ? r.tem : null;
}

// ---------------------------------------------------------------- acesso (administração de contas)
//
// Só a Direção chega aqui (a rota trava com `exigirPerfil`) — este módulo não
// reimplementa a checagem, só assume que quem chamou já validou. `users` já
// tem trigger de auditoria automática (migration 007); `user_roles` não tem
// — trocar o(s) perfil(is) de alguém não deixa trilha própria hoje. É uma
// lacuna real (conceder DIRECAO a alguém é ato sensível) que pede uma
// migration nova no estilo da 007, não algo para resolver com INSERT manual
// aqui e discordar do padrão do resto do sistema.

/** Os únicos valores que o CHECK de `roles.chave` aceita (migrations 001 e 032). */
export const PERFIS_VALIDOS = [
  "DIRECAO", "FINANCEIRO", "RH", "ADMINISTRATIVO",
  "COORDENACAO", "SECRETARIA", "GESTOR", "CONSULTA",
  "RECEPCAO", "GOVERNANCA", "AUDITOR",
] as const;
export type PerfilAcesso = (typeof PERFIS_VALIDOS)[number];

export interface UsuarioAcesso {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  perfis: string[];
  ultimoAcesso: string | null;
  criadoEm: string;
}

const SELECAO_USUARIO_ACESSO = `
  SELECT u.id, u.nome, u.email, u.ativo,
         to_char(u.ultimo_acesso, 'YYYY-MM-DD"T"HH24:MI:SS') AS "ultimoAcesso",
         to_char(u.criado_em, 'YYYY-MM-DD"T"HH24:MI:SS') AS "criadoEm",
         array_remove(array_agg(r.chave ORDER BY r.chave), NULL) AS perfis
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
`;

export async function listarUsuariosAcesso(): Promise<UsuarioAcesso[]> {
  return consultar<UsuarioAcesso>(`${SELECAO_USUARIO_ACESSO} GROUP BY u.id ORDER BY u.nome`);
}

export interface NovoUsuarioAcesso {
  nome: string;
  email: string;
  senha: string;
  perfis: PerfilAcesso[];
}

/**
 * Cria a conta e concede o(s) perfil(is) na mesma transação — nunca existe
 * um instante em que a conta esteja criada sem nenhum acesso definido (ou
 * com o perfil errado por uma falha a meio caminho).
 */
export async function criarUsuarioAcesso(
  ator: Ator,
  dados: NovoUsuarioAcesso,
): Promise<UsuarioAcesso> {
  const senhaHash = await criarHashSenha(dados.senha);
  const id = await transacao(ator, async (c) => {
    const criado = await c.query(
      `INSERT INTO users (nome, email, senha_hash) VALUES ($1, $2, $3) RETURNING id`,
      [dados.nome, dados.email, senhaHash],
    );
    const userId = criado.rows[0].id as string;
    for (const perfil of dados.perfis) {
      await c.query(
        `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE chave = $2`,
        [userId, perfil],
      );
    }
    return userId;
  });
  const [linha] = await consultar<UsuarioAcesso>(
    `${SELECAO_USUARIO_ACESSO} WHERE u.id = $1 GROUP BY u.id`,
    [id],
  );
  return linha;
}

/**
 * Ativa/desativa e/ou substitui o conjunto de perfis. Os dois campos são
 * independentes — a tela pode mandar só um dos dois. Quando `perfis` vem,
 * substitui a lista inteira (não soma): é o que a tela de Controle de Acesso
 * mostra como "o perfil de fulano é X", não uma lista de concessões acumuladas.
 */
export async function atualizarAcessoUsuario(
  ator: Ator,
  id: string,
  dados: { ativo?: boolean; perfis?: PerfilAcesso[]; nome?: string; email?: string },
): Promise<UsuarioAcesso | null> {
  return transacao(ator, async (c) => {
    const existe = await c.query("SELECT id FROM users WHERE id = $1", [id]);
    if (!existe.rowCount) return null;

    if (dados.ativo !== undefined) {
      await c.query("UPDATE users SET ativo = $2 WHERE id = $1", [id, dados.ativo]);
      // Desativar derruba as sessões abertas; reativar não as ressuscita.
      if (!dados.ativo) {
        await c.query("UPDATE sessions SET revogada_em = now() WHERE user_id = $1 AND revogada_em IS NULL", [id]);
      }
    }
    if (dados.nome) {
      await c.query("UPDATE users SET nome = $2 WHERE id = $1", [id, dados.nome]);
    }
    if (dados.email) {
      await c.query("UPDATE users SET email = $2 WHERE id = $1", [id, dados.email]);
    }
    if (dados.perfis) {
      await c.query("DELETE FROM user_roles WHERE user_id = $1", [id]);
      for (const perfil of dados.perfis) {
        await c.query(
          `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE chave = $2`,
          [id, perfil],
        );
      }
    }
    const atualizado = await c.query(
      `${SELECAO_USUARIO_ACESSO} WHERE u.id = $1 GROUP BY u.id`,
      [id],
    );
    return (atualizado.rows[0] as UsuarioAcesso) ?? null;
  });
}

/**
 * Redefine a senha de um acesso já existente. Mesma lógica de
 * `criarUsuarioAcesso`: a senha nunca fica só no banco sem alguém saber
 * qual é — quem chama já gerou ou recebeu do usuário, este módulo só grava
 * o hash. Sem rota de "esqueci minha senha" própria (sem e-mail transacional
 * neste sistema) — é a Direção que redefine e repassa por fora.
 */
export async function redefinirSenhaAcesso(
  ator: Ator,
  id: string,
  senha: string,
): Promise<UsuarioAcesso | null> {
  return transacao(ator, async (c) => {
    const existe = await c.query("SELECT id FROM users WHERE id = $1", [id]);
    if (!existe.rowCount) return null;
    await c.query("UPDATE users SET senha_hash = $2 WHERE id = $1", [id, await criarHashSenha(senha)]);
    // Senha nova invalida as sessões antigas (de quem tinha a senha velha),
    // exceto a de quem está redefinindo a própria.
    if (ator.userId !== id) {
      await c.query("UPDATE sessions SET revogada_em = now() WHERE user_id = $1 AND revogada_em IS NULL", [id]);
    }
    const atualizado = await c.query(
      `${SELECAO_USUARIO_ACESSO} WHERE u.id = $1 GROUP BY u.id`,
      [id],
    );
    return (atualizado.rows[0] as UsuarioAcesso) ?? null;
  });
}

// ---------------------------------------------------------------- documentos

export type EntidadeDocumento =
  | "employees" | "fornecedores" | "contratos" | "contas_pagar" | "solicitacoes" | "pessoas" | "escola";

export interface DocumentoEntrada {
  titulo: string;
  tipo: string;
  entidade: EntidadeDocumento;
  entidadeId: string | null;
  dataVencimento: string | null;
  tags: string[];
  nomeArquivo: string;
  mimeType: string;
  tamanhoBytes: number;
  checksumSha256: string;
  arquivoBytes: Buffer;
}

export interface Documento {
  id: string;
  titulo: string;
  tipo: string;
  entidade: EntidadeDocumento;
  entidadeId: string | null;
  dataVencimento: string | null;
  tags: string[];
  nomeArquivo: string;
  mimeType: string;
  tamanhoBytes: number;
  enviadoEm: string;
}

const SELECAO_DOCUMENTO = `
  SELECT id, titulo, tipo, entidade, entidade_id AS "entidadeId",
         data_vencimento AS "dataVencimento", tags,
         nome_arquivo AS "nomeArquivo", mime_type AS "mimeType",
         tamanho_bytes AS "tamanhoBytes", enviado_em AS "enviadoEm"
  FROM documentos
  WHERE removido_em IS NULL
`;

/**
 * Lista sem o conteúdo do arquivo (`arquivo_bytes` pode ter alguns MB por
 * linha) — a tela de listagem só precisa dos metadados; o download é rota
 * própria, que busca o arquivo de uma linha só.
 */
export async function listarDocumentos(): Promise<Documento[]> {
  return consultar<Documento>(`${SELECAO_DOCUMENTO} ORDER BY enviado_em DESC`);
}

export async function criarDocumento(ator: Ator, dados: DocumentoEntrada): Promise<Documento> {
  return transacao(ator, async (c) => {
    const r = await c.query(
      `INSERT INTO documentos (
         titulo, tipo, entidade, entidade_id, storage_chave,
         nome_arquivo, mime_type, tamanho_bytes, checksum_sha256, arquivo_bytes,
         data_vencimento, tags, enviado_por
       ) VALUES ($1,$2,$3,$4,'pg:'||gen_random_uuid(),$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, titulo, tipo, entidade, entidade_id AS "entidadeId",
         data_vencimento AS "dataVencimento", tags,
         nome_arquivo AS "nomeArquivo", mime_type AS "mimeType",
         tamanho_bytes AS "tamanhoBytes", enviado_em AS "enviadoEm"`,
      [
        dados.titulo, dados.tipo, dados.entidade, dados.entidadeId,
        dados.nomeArquivo, dados.mimeType, dados.tamanhoBytes, dados.checksumSha256, dados.arquivoBytes,
        dados.dataVencimento, dados.tags, ator.userId,
      ],
    );
    return r.rows[0] as Documento;
  });
}

export async function buscarArquivoDocumento(
  id: string,
): Promise<{ nomeArquivo: string; mimeType: string; bytes: Buffer } | null> {
  const r = await consultar<{ nomeArquivo: string; mimeType: string; bytes: Buffer }>(
    `SELECT nome_arquivo AS "nomeArquivo", mime_type AS "mimeType", arquivo_bytes AS bytes
     FROM documentos WHERE id = $1 AND removido_em IS NULL`,
    [id],
  );
  return r[0] ?? null;
}

// ---------------------------------------------------------------- lotação: vínculo sugerido, com aprovação

/**
 * Liga linhas da lotação a funcionários do cadastro (vale na hora) e abre UM
 * pedido em Aprovações. Recusar desfaz as ligações que ninguém mexeu depois.
 * Usado quando o vínculo é um palpite (nome da planilha diferente do cadastro).
 */
export async function vincularLotacaoComAprovacao(
  ator: Ator,
  ano: number,
  pedidos: Array<{ linhaId: string; employeeId: string }>,
): Promise<{ ligadas: number; aprovacao: { numero: number } | null }> {
  if (!Array.isArray(pedidos) || !pedidos.length) {
    throw Object.assign(new Error("Nenhuma ligação enviada."), { statusCode: 422 });
  }
  if (pedidos.length > 300) throw Object.assign(new Error("Ligações demais de uma vez (máximo 300)."), { statusCode: 422 });
  return transacao(ator, async (c) => {
    const itens: NonNullable<Revisao["itens"]> = [];
    for (const p of pedidos) {
      const l = (await c.query(
        "SELECT id, ano, disciplina, professor, employee_id FROM lotacao_linhas WHERE id = $1 FOR UPDATE", [p.linhaId])).rows[0];
      if (!l || l.ano !== ano) throw Object.assign(new Error("Linha da lotação não encontrada neste ano. Atualize a tela (F5)."), { statusCode: 404 });
      const f = (await c.query(
        "SELECT p.nome FROM employees e JOIN pessoas p ON p.id = e.pessoa_id WHERE e.id = $1", [p.employeeId])).rows[0];
      if (!f) throw Object.assign(new Error("Funcionário não encontrado no cadastro."), { statusCode: 404 });
      if (l.employee_id === p.employeeId) continue;
      await c.query("UPDATE lotacao_linhas SET employee_id = $2, atualizado_em = now() WHERE id = $1", [l.id, p.employeeId]);
      itens.push({ linhaId: l.id, antes: l.employee_id, depois: p.employeeId, professor: l.professor, disciplina: l.disciplina, nomeCadastro: f.nome });
    }
    if (!itens.length) return { ligadas: 0, aprovacao: null };
    const nomes = [...new Set(itens.map((i) => `${i.professor} → ${i.nomeCadastro}`))];
    const r = await registrarRevisao(c, ator, {
      titulo: `Lotação ${ano}: ${nomes.length} professor(es) ligados ao cadastro`,
      textoAcao: `{quem} ligou nomes da lotação de ${ano} ao cadastro (já está valendo): ${nomes.join("; ")}. Aceitar mantém; recusar desfaz as ligações.`,
      revisao: { acao: "LOTACAO_VINCULO", employeeId: itens[0]!.depois!, itens, nome: `Lotação ${ano}` },
    });
    return { ligadas: itens.length, aprovacao: r };
  });
}
