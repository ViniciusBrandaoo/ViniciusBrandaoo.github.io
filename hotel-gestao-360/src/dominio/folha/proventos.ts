import {
  arredondar,
  formatarBRL,
  fracaoDe,
  multiplicar,
  percentualDe,
  type Centavos,
} from "../comum/dinheiro.js";
import type { JanelaTrabalhada } from "../comum/competencia.js";
import type { ParametrosCct } from "./parametros.js";
import type {
  Aviso,
  Contrato,
  ContratoHoristaAula,
  ContratoHoristaRelogio,
  ContratoMensalista,
  MovimentoMensal,
  NaturezaBase,
  PassoMemoria,
  Rubrica,
} from "./tipos.js";

export interface ApuracaoProventos {
  rubricas: Rubrica[];
  memoria: PassoMemoria[];
  avisos: Aviso[];
  /**
   * Base para adicionais percentuais (tempo de serviço), para o teto do
   * vale-transporte e para a checagem de piso. Inclui todas as parcelas
   * salariais habituais, inclusive hora-atividade.
   */
  salarioBase: Centavos;
}

function provento(
  codigo: string,
  descricao: string,
  referencia: string,
  valor: Centavos,
): Rubrica {
  return {
    codigo,
    descricao,
    referencia,
    tipo: "PROVENTO",
    naturezaBase: "INTEGRA",
    valor,
    incideInss: true,
    incideIrrf: true,
    incideFgts: true,
  };
}

/** Desconto que reduz a remuneração e, com ela, as bases de incidência. */
function reducao(
  codigo: string,
  descricao: string,
  referencia: string,
  valor: Centavos,
): Rubrica {
  return {
    codigo,
    descricao,
    referencia,
    tipo: "DESCONTO",
    naturezaBase: "REDUZ",
    valor,
    incideInss: true,
    incideIrrf: true,
    incideFgts: true,
  };
}

/**
 * Fator de repouso sobre parcelas variáveis. Com calendário da competência usa
 * repousos ÷ dias úteis (Súmula 172 TST); sem ele cai na razão da CCT (1/6).
 */
function fatorRepouso(
  movimento: MovimentoMensal,
  cct: ParametrosCct,
): { numerador: number; denominador: number; origem: string } {
  const { diasUteisCompetencia, repousosCompetencia } = movimento;
  if (
    diasUteisCompetencia !== null &&
    repousosCompetencia !== null &&
    diasUteisCompetencia > 0
  ) {
    return {
      numerador: repousosCompetencia,
      denominador: diasUteisCompetencia,
      origem: "calendário da competência",
    };
  }
  return {
    numerador: cct.horaAula.diasDescansoSemana,
    denominador: cct.horaAula.diasUteisSemana,
    origem: "razão semanal da convenção",
  };
}

export function apurarProventos(
  contrato: Contrato,
  movimento: MovimentoMensal,
  cct: ParametrosCct,
  janela: JanelaTrabalhada,
): ApuracaoProventos {
  switch (contrato.regime) {
    case "HORISTA_AULA":
      return apurarProfessorHorista(contrato, movimento, cct, janela);
    case "MENSALISTA":
      return apurarMensalista(contrato, movimento, cct, janela);
    case "HORISTA_RELOGIO":
      return apurarHoristaRelogio(contrato, movimento, cct, janela);
  }
}

/**
 * Professor remunerado por hora-aula.
 *
 * Salário do mês = (aulas da semana × valor da hora-aula × 4,5 semanas) + DSR de 1/6.
 * O acréscimo de 1/6 a título de repouso semanal remunerado é obrigatório e é o
 * item mais esquecido em controle por planilha (Súmula 351 do TST).
 */
function apurarProfessorHorista(
  contrato: ContratoHoristaAula,
  movimento: MovimentoMensal,
  cct: ParametrosCct,
  janela: JanelaTrabalhada,
): ApuracaoProventos {
  const p = cct.horaAula;
  const rubricas: Rubrica[] = [];
  const memoria: PassoMemoria[] = [];
  const avisos: Aviso[] = [];

  const porSemanasFixas = p.modoApuracao === "SEMANAS_FIXAS";
  const aulasContratuais = contrato.aulasSemanais * p.semanasPorMes;
  let aulasMes: number;
  let fundamentoAulas: string;

  if (porSemanasFixas) {
    aulasMes = aulasContratuais;
    fundamentoAulas =
      "CLT art. 320 §1º — mês considerado de quatro semanas e meia";
  } else {
    // Art. 322: em exames e férias escolares o professor recebe a remuneração
    // normal. A redução só é legítima quando decorre de falta do próprio
    // professor — por isso o piso é a grade menos as aulas que ele não deu.
    const piso = p.pisoArt322
      ? Math.max(0, aulasContratuais - movimento.aulasNaoDadas)
      : 0;
    aulasMes = Math.max(movimento.aulasEfetivas, piso);
    fundamentoAulas =
      p.pisoArt322 && aulasMes > movimento.aulasEfetivas
        ? "CLT art. 322 — piso da grade contratual em período de exames e recesso"
        : `Apuração por aulas efetivas — ${cct.nome}`;

    if (p.pisoArt322 && aulasMes > movimento.aulasEfetivas) {
      avisos.push({
        severidade: "INFO",
        mensagem: `Foram lançadas ${movimento.aulasEfetivas} aulas, abaixo da grade contratual. Aplicado o piso da grade: ${aulasMes} aulas.`,
      });
    }
    if (!p.pisoArt322 && movimento.aulasEfetivas === 0) {
      avisos.push({
        severidade: "DIVERGENCIA",
        mensagem:
          "Apuração por aulas efetivas sem piso do art. 322 e nenhuma aula lançada: o professor ficaria sem remuneração nesta competência.",
      });
    }
  }

  if (janela.parcial) {
    const aulasCheias = aulasMes;
    aulasMes = aulasMes * janela.fator;
    memoria.push({
      titulo: "Proporcionalidade do mês",
      formula: "aulas do mês × dias de vínculo ÷ dias da competência",
      substituicao: `${aulasCheias.toLocaleString("pt-BR")} × ${janela.dias}/${janela.totalDeDias}`,
      resultado: 0,
      fundamento: janela.admitiuNoMes
        ? "Mês de admissão — remuneração proporcional aos dias trabalhados"
        : "Mês de desligamento — saldo de salário proporcional",
    });
    avisos.push({
      severidade: "ATENCAO",
      mensagem: `Mês parcial (${janela.dias} de ${janela.totalDeDias} dias). A proporcionalidade foi calculada por dias — confira contra as aulas efetivamente ministradas no período.`,
    });
  }

  const aulasDeGrade = (contrato.cargas ?? []).length
    ? (contrato.cargas ?? []).reduce((a, c) => a + c.aulas, 0)
    : contrato.aulasSemanais;
  if (aulasDeGrade > 40) {
    avisos.push({
      severidade: "ATENCAO",
      mensagem: `A grade tem ${aulasDeGrade} aulas por semana, acima do limite de 40. O que passa de 40 deve ser lançado como Aula extra / projeto.`,
    });
  }

  const cargasComValor = (contrato.cargas ?? []).some((c) => (c.valorHora ?? 0) > 0);
  let valorAulas: number;
  if (cargasComValor && porSemanasFixas) {
    const porSemana = (contrato.cargas ?? []).reduce(
      (a, c) => a + c.aulas * (c.valorHora ?? 0),
      0,
    );
    valorAulas = arredondar(porSemana * p.semanasPorMes);
    if (janela.parcial) valorAulas = arredondar(valorAulas * janela.fator);
  } else {
    valorAulas = multiplicar(contrato.valorHoraAula, aulasMes);
  }
  rubricas.push(
    provento(
      "101",
      "Aulas ministradas",
      `${aulasMes.toLocaleString("pt-BR")} aulas × ${formatarBRL(contrato.valorHoraAula)}`,
      valorAulas,
    ),
  );
  memoria.push({
    titulo: "Aulas do mês",
    formula: porSemanasFixas
      ? "aulas semanais × semanas do mês × valor da hora-aula"
      : "aulas consideradas × valor da hora-aula",
    substituicao: porSemanasFixas
      ? `${contrato.aulasSemanais} × ${p.semanasPorMes} × ${formatarBRL(contrato.valorHoraAula)}`
      : `${aulasMes.toLocaleString("pt-BR")} × ${formatarBRL(contrato.valorHoraAula)}`,
    resultado: valorAulas,
    fundamento: fundamentoAulas,
  });

  const dsr = fracaoDe(valorAulas, p.diasDescansoSemana, p.diasUteisSemana);
  rubricas.push(
    provento(
      "102",
      "DSR sobre aulas",
      `${p.diasDescansoSemana}/${p.diasUteisSemana}`,
      dsr,
    ),
  );
  memoria.push({
    titulo: "Repouso semanal remunerado (DSR)",
    formula: "valor das aulas × dias de descanso ÷ dias úteis da semana",
    substituicao: `${formatarBRL(valorAulas)} × ${p.diasDescansoSemana}/${p.diasUteisSemana}`,
    resultado: dsr,
    fundamento:
      "Súmula 351 do TST — acréscimo de 1/6 sobre a remuneração das aulas",
  });

  // Hora-atividade é parcela salarial habitual: entra no salário base, e por
  // isso é calculada antes de fechá-lo.
  let horaAtividade = 0;
  let dsrHoraAtividade = 0;
  if (p.percentualHoraAtividade > 0) {
    horaAtividade = percentualDe(valorAulas, p.percentualHoraAtividade);
    dsrHoraAtividade = fracaoDe(
      horaAtividade,
      p.diasDescansoSemana,
      p.diasUteisSemana,
    );
    rubricas.push(
      provento(
        "103",
        "Hora-atividade / planejamento",
        `${p.percentualHoraAtividade}% das aulas`,
        horaAtividade,
      ),
    );
    rubricas.push(
      provento(
        "104",
        "DSR sobre hora-atividade",
        `${p.diasDescansoSemana}/${p.diasUteisSemana}`,
        dsrHoraAtividade,
      ),
    );
    memoria.push({
      titulo: "Hora-atividade",
      formula: "valor das aulas × percentual de hora-atividade, mais DSR",
      substituicao: `${formatarBRL(valorAulas)} × ${p.percentualHoraAtividade}% + ${formatarBRL(dsrHoraAtividade)}`,
      resultado: horaAtividade + dsrHoraAtividade,
      fundamento: `Cláusula de hora-atividade — ${cct.nome}`,
    });
  }

  const salarioBase = valorAulas + dsr + horaAtividade + dsrHoraAtividade;

  const repouso = fatorRepouso(movimento, cct);
  const horaExtra =
    movimento.valorHoraExtra > 0 ? movimento.valorHoraExtra : contrato.valorHoraAula;
  const valorUnitario = arredondar(horaExtra * (1 + p.percentualAulaExtra / 100));

  // Carga extra que se repete toda semana segue a mesma regra da carga
  // regular: multiplica pelas semanas do mês antes do reflexo de repouso.
  if (movimento.aulasExtrasSemanais > 0) {
    const valorSemanais = arredondar(
      valorUnitario * movimento.aulasExtrasSemanais * p.semanasPorMes,
    );
    const dsrSemanais = fracaoDe(
      valorSemanais,
      repouso.numerador,
      repouso.denominador,
    );
    rubricas.push(
      provento(
        "115",
        "Aula extra / projeto (semanal)",
        `${movimento.aulasExtrasSemanais} aulas/sem × ${p.semanasPorMes} × ${formatarBRL(valorUnitario)}`,
        valorSemanais,
      ),
    );
    rubricas.push(
      provento(
        "116",
        "DSR sobre carga extra semanal",
        `${repouso.numerador}/${repouso.denominador}`,
        dsrSemanais,
      ),
    );
    memoria.push({
      titulo: "Aula extra / projeto (semanal)",
      formula: "aulas extras por semana × semanas do mês × hora-aula, mais repouso",
      substituicao: `${movimento.aulasExtrasSemanais} × ${p.semanasPorMes} × ${formatarBRL(valorUnitario)} + ${formatarBRL(dsrSemanais)}`,
      resultado: valorSemanais + dsrSemanais,
      fundamento:
        "CLT art. 320 §1º e Súmula 351 do TST — carga habitual, mesma regra da regular",
    });
  }

  const aulasEventuais = movimento.aulasExtras + movimento.aulasSubstituicao;
  if (aulasEventuais > 0) {
    const valorEventuais = multiplicar(valorUnitario, aulasEventuais);
    const dsrEventuais = fracaoDe(
      valorEventuais,
      repouso.numerador,
      repouso.denominador,
    );
    rubricas.push(
      provento(
        "111",
        "Aulas extras e substituições",
        `${aulasEventuais} aulas × ${formatarBRL(valorUnitario)}`,
        valorEventuais,
      ),
    );
    rubricas.push(
      provento(
        "112",
        "DSR sobre aulas extras",
        `${repouso.numerador}/${repouso.denominador}`,
        dsrEventuais,
      ),
    );
    memoria.push({
      titulo: "Aulas extras e substituições",
      formula: "aulas eventuais × hora-aula (com adicional) + reflexo de repouso",
      substituicao: `${aulasEventuais} × ${formatarBRL(valorUnitario)} + ${repouso.numerador}/${repouso.denominador} (${repouso.origem})`,
      resultado: valorEventuais + dsrEventuais,
      fundamento: `Súmula 172 do TST — adicional de ${p.percentualAulaExtra}% conforme ${cct.nome}`,
    });
  }

  if (movimento.aulasNoturnas > 0 && p.percentualAdicionalNoturno > 0) {
    const baseNoturna = multiplicar(
      contrato.valorHoraAula,
      movimento.aulasNoturnas,
    );
    const adicional = percentualDe(baseNoturna, p.percentualAdicionalNoturno);
    rubricas.push(
      provento(
        "121",
        "Adicional noturno",
        `${movimento.aulasNoturnas} aulas × ${p.percentualAdicionalNoturno}%`,
        adicional,
      ),
    );
    memoria.push({
      titulo: "Adicional noturno",
      formula: "aulas após as 22h × hora-aula × percentual",
      substituicao: `${movimento.aulasNoturnas} × ${formatarBRL(contrato.valorHoraAula)} × ${p.percentualAdicionalNoturno}%`,
      resultado: adicional,
      fundamento: "CLT art. 73",
    });

    if (p.reflexoDsrSobreAdicionalNoturno) {
      const dsrNoturno = fracaoDe(
        adicional,
        repouso.numerador,
        repouso.denominador,
      );
      rubricas.push(
        provento(
          "122",
          "DSR sobre adicional noturno",
          `${repouso.numerador}/${repouso.denominador}`,
          dsrNoturno,
        ),
      );
      memoria.push({
        titulo: "DSR sobre adicional noturno",
        formula: "adicional noturno × fator de repouso",
        substituicao: `${formatarBRL(adicional)} × ${repouso.numerador}/${repouso.denominador}`,
        resultado: dsrNoturno,
        fundamento:
          "Súmula 60 do TST — o adicional noturno habitual integra a base do repouso",
      });
    }
  }

  // No modo por aulas efetivas a falta já saiu da contagem; descontar de novo
  // cobraria a mesma ausência duas vezes.
  if (movimento.aulasNaoDadas > 0) {
    if (porSemanasFixas) {
      const valorFaltas = multiplicar(
        contrato.valorHoraAula,
        movimento.aulasNaoDadas,
      );
      rubricas.push(
        reducao(
          "501",
          "Aulas não ministradas",
          `${movimento.aulasNaoDadas} aulas × ${formatarBRL(contrato.valorHoraAula)}`,
          valorFaltas,
        ),
      );
      memoria.push({
        titulo: "Desconto de aulas não ministradas",
        formula: "aulas não dadas × valor da hora-aula",
        substituicao: `${movimento.aulasNaoDadas} × ${formatarBRL(contrato.valorHoraAula)}`,
        resultado: valorFaltas,
        fundamento: "CLT art. 473 a contrario sensu",
      });
    } else {
      avisos.push({
        severidade: "INFO",
        mensagem:
          "Aulas não ministradas não foram descontadas: na apuração por aulas efetivas as faltas já ficam de fora da contagem.",
      });
    }
  }

  if (
    p.perdeDsrPorFaltaInjustificada &&
    movimento.semanasComFaltaInjustificada > 0
  ) {
    const limite = Math.floor(p.semanasPorMes);
    const semanas = Math.min(movimento.semanasComFaltaInjustificada, limite);
    if (semanas < movimento.semanasComFaltaInjustificada) {
      avisos.push({
        severidade: "ATENCAO",
        mensagem: `Foram lançadas ${movimento.semanasComFaltaInjustificada} semanas com falta injustificada, acima das ${limite} semanas da competência. O desconto foi limitado a ${limite}.`,
      });
    }
    // O DSR perdido é o que foi efetivamente pago naquela semana. No modo por
    // aulas efetivas o DSR já veio reduzido, então usar a grade cheia
    // descontaria a mesma ausência duas vezes.
    const aulasDaSemana = porSemanasFixas
      ? contrato.aulasSemanais
      : p.semanasPorMes > 0
        ? aulasMes / p.semanasPorMes
        : 0;
    const dsrSemanal = fracaoDe(
      multiplicar(contrato.valorHoraAula, aulasDaSemana),
      p.diasDescansoSemana,
      p.diasUteisSemana,
    );
    const dsrPerdido = multiplicar(dsrSemanal, semanas);
    rubricas.push(
      reducao(
        "502",
        "DSR perdido por falta injustificada",
        `${semanas} semana(s)`,
        dsrPerdido,
      ),
    );
    memoria.push({
      titulo: "Perda do DSR por falta injustificada",
      formula: "DSR de uma semana × semanas com falta injustificada",
      substituicao: `${formatarBRL(dsrSemanal)} × ${semanas}`,
      resultado: dsrPerdido,
      fundamento: "Lei 605/49 art. 6º",
    });
  }

  if (
    p.valorMinimoHoraAula > 0 &&
    contrato.valorHoraAula < p.valorMinimoHoraAula
  ) {
    avisos.push({
      severidade: "DIVERGENCIA",
      mensagem: `Hora-aula de ${formatarBRL(contrato.valorHoraAula)} abaixo do piso da convenção (${formatarBRL(p.valorMinimoHoraAula)}).`,
    });
  }

  return { rubricas, memoria, avisos, salarioBase };
}

function apurarMensalista(
  contrato: ContratoMensalista,
  movimento: MovimentoMensal,
  cct: ParametrosCct,
  janela: JanelaTrabalhada,
): ApuracaoProventos {
  const rubricas: Rubrica[] = [];
  const memoria: PassoMemoria[] = [];
  const avisos: Aviso[] = [];
  const p = cct.mensalista;

  const salarioBase = janela.parcial
    ? arredondar(contrato.salarioBaseMensal * janela.fator)
    : contrato.salarioBaseMensal;

  if (janela.parcial) {
    memoria.push({
      titulo: "Proporcionalidade do mês",
      formula: "salário mensal × dias de vínculo ÷ dias da competência",
      substituicao: `${formatarBRL(contrato.salarioBaseMensal)} × ${janela.dias}/${janela.totalDeDias}`,
      resultado: salarioBase,
      fundamento: janela.admitiuNoMes
        ? "Mês de admissão — remuneração proporcional"
        : "Mês de desligamento — saldo de salário",
    });
  }

  rubricas.push(
    provento(
      "001",
      "Salário base",
      `${contrato.cargaHorariaSemanal}h semanais`,
      salarioBase,
    ),
  );

  const divisor = p.divisorMensalHoras;
  if (divisor <= 0) {
    avisos.push({
      severidade: "DIVERGENCIA",
      mensagem:
        "Divisor mensal de horas não configurado na convenção — horas extras e faltas não podem ser calculadas.",
    });
    return { rubricas, memoria, avisos, salarioBase };
  }

  // O valor da hora não é arredondado antes de multiplicar: fixar o centavo
  // aqui produz divergência sistemática de alguns centavos com a contabilidade.
  const valorHoraExato = contrato.salarioBaseMensal / divisor;
  memoria.push({
    titulo: "Valor da hora normal",
    formula: "salário mensal ÷ divisor mensal de horas",
    substituicao: `${formatarBRL(contrato.salarioBaseMensal)} ÷ ${divisor}h`,
    resultado: arredondar(valorHoraExato),
    fundamento: `CLT art. 64 — divisor de ${divisor}h conforme ${cct.nome}`,
  });

  const repouso = fatorRepouso(movimento, cct);
  let totalExtras = 0;

  for (const [horas, percentual, codigo] of [
    [movimento.horasExtras50, 50, "201"],
    [movimento.horasExtras100, 100, "202"],
  ] as const) {
    if (horas <= 0) continue;
    const valor = arredondar(valorHoraExato * horas * (1 + percentual / 100));
    totalExtras += valor;
    rubricas.push(
      provento(
        codigo,
        `Horas extras ${percentual}%`,
        `${horas.toLocaleString("pt-BR")}h`,
        valor,
      ),
    );
    memoria.push({
      titulo: `Horas extras ${percentual}%`,
      formula: "valor da hora × horas × (1 + adicional)",
      substituicao: `${formatarBRL(arredondar(valorHoraExato))} × ${horas} × ${1 + percentual / 100}`,
      resultado: valor,
      fundamento: `CF art. 7º XVI — ${cct.nome}`,
    });
  }

  if (totalExtras > 0 && p.reflexoDsrSobreHorasExtras) {
    const dsrExtras = fracaoDe(
      totalExtras,
      repouso.numerador,
      repouso.denominador,
    );
    rubricas.push(
      provento(
        "203",
        "DSR sobre horas extras",
        `${repouso.numerador}/${repouso.denominador}`,
        dsrExtras,
      ),
    );
    memoria.push({
      titulo: "DSR sobre horas extras",
      formula: "horas extras × fator de repouso",
      substituicao: `${formatarBRL(totalExtras)} × ${repouso.numerador}/${repouso.denominador} (${repouso.origem})`,
      resultado: dsrExtras,
      fundamento:
        "Súmula 172 do TST — as horas extras habituais integram a base do repouso",
    });
  }

  if (movimento.horasNoturnas > 0 && cct.horaAula.percentualAdicionalNoturno > 0) {
    const adicional = arredondar(
      valorHoraExato *
        movimento.horasNoturnas *
        (cct.horaAula.percentualAdicionalNoturno / 100),
    );
    rubricas.push(
      provento(
        "221",
        "Adicional noturno",
        `${movimento.horasNoturnas}h × ${cct.horaAula.percentualAdicionalNoturno}%`,
        adicional,
      ),
    );
    memoria.push({
      titulo: "Adicional noturno",
      formula: "valor da hora × horas noturnas × percentual",
      substituicao: `${formatarBRL(arredondar(valorHoraExato))} × ${movimento.horasNoturnas} × ${cct.horaAula.percentualAdicionalNoturno}%`,
      resultado: adicional,
      fundamento: "CLT art. 73",
    });
  }

  const diasDoMes = janela.totalDeDias;
  if (movimento.diasFalta > 0) {
    const valorDia = contrato.salarioBaseMensal / diasDoMes;
    const valor = arredondar(valorDia * movimento.diasFalta);
    rubricas.push(
      reducao(
        "521",
        "Faltas",
        `${movimento.diasFalta} dia(s)`,
        valor,
      ),
    );
    memoria.push({
      titulo: "Desconto de faltas",
      formula: "salário mensal ÷ dias do mês × dias de falta",
      substituicao: `${formatarBRL(contrato.salarioBaseMensal)} ÷ ${diasDoMes} × ${movimento.diasFalta}`,
      resultado: valor,
      fundamento: "CLT art. 473 a contrario sensu",
    });
  }

  if (
    movimento.diasFaltaInjustificada > 0 &&
    cct.horaAula.perdeDsrPorFaltaInjustificada
  ) {
    const valorDia = contrato.salarioBaseMensal / diasDoMes;
    const semanasAfetadas = Math.min(
      movimento.diasFaltaInjustificada,
      Math.floor(cct.horaAula.semanasPorMes),
    );
    const valor = arredondar(valorDia * semanasAfetadas);
    rubricas.push(
      reducao(
        "522",
        "DSR perdido por falta injustificada",
        `${semanasAfetadas} repouso(s)`,
        valor,
      ),
    );
    memoria.push({
      titulo: "Perda do DSR por falta injustificada",
      formula: "valor do dia × repousos perdidos",
      substituicao: `${formatarBRL(arredondar(valorDia))} × ${semanasAfetadas}`,
      resultado: valor,
      fundamento: "Lei 605/49 art. 6º",
    });
  }

  if (movimento.horasBancoADescontar > 0) {
    const valor = arredondar(valorHoraExato * movimento.horasBancoADescontar);
    rubricas.push(
      reducao(
        "511",
        "Saldo negativo de banco de horas",
        `${movimento.horasBancoADescontar.toLocaleString("pt-BR")}h`,
        valor,
      ),
    );
    memoria.push({
      titulo: "Desconto de banco de horas negativo",
      formula: "valor da hora × horas negativas autorizadas",
      substituicao: `${formatarBRL(arredondar(valorHoraExato))} × ${movimento.horasBancoADescontar}`,
      resultado: valor,
      fundamento: "CLT art. 59 §2º — acordo de compensação",
    });
  }

  return { rubricas, memoria, avisos, salarioBase };
}

function apurarHoristaRelogio(
  contrato: ContratoHoristaRelogio,
  movimento: MovimentoMensal,
  cct: ParametrosCct,
  janela: JanelaTrabalhada,
): ApuracaoProventos {
  const p = cct.horistaRelogio;
  const rubricas: Rubrica[] = [];
  const memoria: PassoMemoria[] = [];
  const avisos: Aviso[] = [];

  const horasContratuais = contrato.horasSemanais * p.semanasPorMes;
  const horasMes = janela.parcial
    ? horasContratuais * janela.fator
    : horasContratuais;

  if (janela.parcial) {
    avisos.push({
      severidade: "ATENCAO",
      mensagem: `Mês parcial (${janela.dias} de ${janela.totalDeDias} dias). Horas proporcionalizadas por dias — confira contra o ponto do período.`,
    });
  }

  const valorHoras = multiplicar(contrato.valorHora, horasMes);
  const dsr = fracaoDe(
    valorHoras,
    cct.horaAula.diasDescansoSemana,
    cct.horaAula.diasUteisSemana,
  );

  rubricas.push(
    provento(
      "051",
      "Horas trabalhadas",
      `${horasMes.toLocaleString("pt-BR")}h × ${formatarBRL(contrato.valorHora)}`,
      valorHoras,
    ),
  );
  rubricas.push(
    provento(
      "052",
      "DSR sobre horas",
      `${cct.horaAula.diasDescansoSemana}/${cct.horaAula.diasUteisSemana}`,
      dsr,
    ),
  );
  memoria.push({
    titulo: "Horas do mês",
    formula: "horas semanais × semanas do mês × valor da hora",
    substituicao: `${contrato.horasSemanais} × ${p.semanasPorMes} × ${formatarBRL(contrato.valorHora)}`,
    resultado: valorHoras,
    fundamento: `CLT art. 64 — divisor próprio do regime, conforme ${cct.nome}`,
  });
  memoria.push({
    titulo: "Repouso semanal remunerado (DSR)",
    formula: "valor das horas × dias de descanso ÷ dias úteis",
    substituicao: `${formatarBRL(valorHoras)} × ${cct.horaAula.diasDescansoSemana}/${cct.horaAula.diasUteisSemana}`,
    resultado: dsr,
    fundamento: "Lei 605/49 art. 7º",
  });

  const salarioBase = valorHoras + dsr;
  const repouso = fatorRepouso(movimento, cct);
  let totalExtras = 0;

  for (const [horas, percentual, codigo] of [
    [movimento.horasExtras50, 50, "201"],
    [movimento.horasExtras100, 100, "202"],
  ] as const) {
    if (horas <= 0) continue;
    const valor = arredondar(contrato.valorHora * horas * (1 + percentual / 100));
    totalExtras += valor;
    rubricas.push(
      provento(
        codigo,
        `Horas extras ${percentual}%`,
        `${horas.toLocaleString("pt-BR")}h`,
        valor,
      ),
    );
    memoria.push({
      titulo: `Horas extras ${percentual}%`,
      formula: "valor da hora × horas × (1 + adicional)",
      substituicao: `${formatarBRL(contrato.valorHora)} × ${horas} × ${1 + percentual / 100}`,
      resultado: valor,
      fundamento: `CF art. 7º XVI — ${cct.nome}`,
    });
  }

  if (totalExtras > 0 && p.reflexoDsrSobreHorasExtras) {
    const dsrExtras = fracaoDe(
      totalExtras,
      repouso.numerador,
      repouso.denominador,
    );
    rubricas.push(
      provento(
        "203",
        "DSR sobre horas extras",
        `${repouso.numerador}/${repouso.denominador}`,
        dsrExtras,
      ),
    );
    memoria.push({
      titulo: "DSR sobre horas extras",
      formula: "horas extras × fator de repouso",
      substituicao: `${formatarBRL(totalExtras)} × ${repouso.numerador}/${repouso.denominador} (${repouso.origem})`,
      resultado: dsrExtras,
      fundamento: "Súmula 172 do TST",
    });
  }

  if (movimento.horasNoturnas > 0 && cct.horaAula.percentualAdicionalNoturno > 0) {
    const adicional = arredondar(
      contrato.valorHora *
        movimento.horasNoturnas *
        (cct.horaAula.percentualAdicionalNoturno / 100),
    );
    rubricas.push(
      provento(
        "221",
        "Adicional noturno",
        `${movimento.horasNoturnas}h × ${cct.horaAula.percentualAdicionalNoturno}%`,
        adicional,
      ),
    );
    memoria.push({
      titulo: "Adicional noturno",
      formula: "valor da hora × horas noturnas × percentual",
      substituicao: `${formatarBRL(contrato.valorHora)} × ${movimento.horasNoturnas} × ${cct.horaAula.percentualAdicionalNoturno}%`,
      resultado: adicional,
      fundamento: "CLT art. 73",
    });
  }

  const horasDoDia =
    cct.horaAula.diasUteisSemana > 0
      ? contrato.horasSemanais / cct.horaAula.diasUteisSemana
      : 0;

  if (movimento.diasFalta > 0 && horasDoDia > 0) {
    const valor = arredondar(
      contrato.valorHora * horasDoDia * movimento.diasFalta,
    );
    rubricas.push(
      reducao("521", "Faltas", `${movimento.diasFalta} dia(s)`, valor),
    );
    memoria.push({
      titulo: "Desconto de faltas",
      formula: "valor da hora × horas do dia × dias de falta",
      substituicao: `${formatarBRL(contrato.valorHora)} × ${horasDoDia.toFixed(2)} × ${movimento.diasFalta}`,
      resultado: valor,
      fundamento: "CLT art. 473 a contrario sensu",
    });
  }

  if (movimento.horasBancoADescontar > 0) {
    const valor = arredondar(
      contrato.valorHora * movimento.horasBancoADescontar,
    );
    rubricas.push(
      reducao(
        "511",
        "Saldo negativo de banco de horas",
        `${movimento.horasBancoADescontar.toLocaleString("pt-BR")}h`,
        valor,
      ),
    );
    memoria.push({
      titulo: "Desconto de banco de horas negativo",
      formula: "valor da hora × horas negativas autorizadas",
      substituicao: `${formatarBRL(contrato.valorHora)} × ${movimento.horasBancoADescontar}`,
      resultado: valor,
      fundamento: "CLT art. 59 §2º",
    });
  }

  return { rubricas, memoria, avisos, salarioBase };
}

export const naturezaPadraoDeDesconto: NaturezaBase = "NEUTRA";
