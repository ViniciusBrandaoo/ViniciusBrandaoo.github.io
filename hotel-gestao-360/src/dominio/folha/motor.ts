import {
  arredondar,
  formatarBRL,
  fracaoDe,
  multiplicar,
  percentualDe,
  type Centavos,
} from "../comum/dinheiro.js";
import {
  dentroDaVigencia,
  ehCompetenciaValida,
  janelaTrabalhada,
  normalizar,
} from "../comum/competencia.js";
import { calcularInss, calcularIrrf } from "./impostos.js";
import {
  validarTabelaInss,
  validarTabelaIrrf,
  type ParametrosFolha,
} from "./parametros.js";
import { apurarProventos } from "./proventos.js";
import type {
  Aviso,
  Contrato,
  LancamentoAvulso,
  MovimentoMensal,
  PassoMemoria,
  PensaoAlimenticia,
  ResultadoFolha,
  Rubrica,
} from "./tipos.js";

export type StatusFolha =
  | "EM_CALCULO"
  | "COM_DIVERGENCIA"
  | "CONFERIDO"
  | "APROVADO"
  | "ENVIADO_CONTABILIDADE"
  | "FECHADO";

const soma = (rubricas: Rubrica[]) =>
  rubricas.reduce((acc, r) => acc + r.valor, 0);

/**
 * Base de incidência. A natureza da rubrica decide o sinal: proventos somam,
 * reduções de remuneração (falta, DSR perdido, banco negativo) subtraem, e
 * tudo que é neutro — imposto, VT, pensão, consignado — não entra.
 */
function base(
  rubricas: Rubrica[],
  incidencia: "incideInss" | "incideIrrf" | "incideFgts",
): Centavos {
  return rubricas.reduce((acc, r) => {
    if (!r[incidencia]) return acc;
    if (r.naturezaBase === "INTEGRA") return acc + r.valor;
    if (r.naturezaBase === "REDUZ") return acc - r.valor;
    return acc;
  }, 0);
}

function deLancamento(
  l: LancamentoAvulso,
  codigo: string,
  tipo: "PROVENTO" | "DESCONTO",
): Rubrica {
  return {
    codigo,
    descricao: l.descricao,
    referencia: "lançamento avulso",
    tipo,
    naturezaBase: l.naturezaBase,
    valor: l.valor,
    incideInss: l.incideInss,
    incideIrrf: l.incideIrrf,
    incideFgts: l.incideFgts,
  };
}

function neutra(
  codigo: string,
  descricao: string,
  referencia: string,
  tipo: "DESCONTO" | "ENCARGO_EMPREGADOR",
  valor: Centavos,
): Rubrica {
  return {
    codigo,
    descricao,
    referencia,
    tipo,
    naturezaBase: "NEUTRA",
    valor,
    incideInss: false,
    incideIrrf: false,
    incideFgts: false,
  };
}

/**
 * Motor de cálculo da folha. Recebe contrato + movimento do mês + parâmetros
 * vigentes e devolve todas as rubricas, bases, memória de cálculo e avisos.
 * Puro e determinístico: nenhuma leitura de banco, nenhuma data de "hoje" —
 * o mesmo insumo sempre produz o mesmo resultado, o que torna o recálculo de
 * competências fechadas auditável.
 */
export function calcularFolha(
  contrato: Contrato,
  movimento: MovimentoMensal,
  parametros: ParametrosFolha,
): ResultadoFolha {
  const { inss, irrf, salarioMinimo } = parametros;
  const ocultarDsr = parametros.ocultarDsr === true;
  const cct = parametros.cct;
  // Impostos e encargos apurados pela contabilidade: esta folha não desconta
  // INSS/IRRF do empregado nem lança os encargos da escola.
  const semImpostos = parametros.impostosPelaContabilidade === true;
  const rubricas: Rubrica[] = [];
  const memoria: PassoMemoria[] = [];
  const avisos: Aviso[] = [];
  const competencia = normalizar(movimento.competencia);

  if (!ehCompetenciaValida(competencia)) {
    avisos.push({
      severidade: "DIVERGENCIA",
      mensagem: `Competência "${movimento.competencia}" inválida. Use o formato AAAA-MM.`,
    });
  }

  // ---------------------------------------------------------- guardas de parâmetro

  for (const [rotulo, vigencia, conferida, fonte] of [
    ...(semImpostos ? [] : [
      ["INSS", inss.vigencia, inss.conferidaPorRh, inss.fonte],
      ["IRRF", irrf.vigencia, irrf.conferidaPorRh, irrf.fonte],
    ] as const),
    ["CCT", cct.vigencia, cct.conferidaPorRh, cct.nome],
    [
      "salário mínimo",
      salarioMinimo.vigencia,
      salarioMinimo.conferidoPorRh,
      salarioMinimo.fonte,
    ],
  ] as const) {
    if (!dentroDaVigencia(competencia, vigencia)) {
      avisos.push({
        severidade: "DIVERGENCIA",
        mensagem: `Tabela de ${rotulo} em uso (${fonte}) não cobre a competência ${competencia}. Cadastre a tabela vigente antes de fechar a folha.`,
      });
    }
    if (!conferida) {
      avisos.push({
        severidade: "DIVERGENCIA",
        mensagem: `Tabela de ${rotulo} ainda não foi conferida pelo RH. A folha calcula para simulação, mas não pode ser fechada.`,
      });
    }
  }

  for (const problema of validarTabelaInss(inss)) {
    avisos.push({ severidade: "DIVERGENCIA", mensagem: problema });
  }
  for (const problema of validarTabelaIrrf(irrf)) {
    avisos.push({ severidade: "DIVERGENCIA", mensagem: problema });
  }

  // ---------------------------------------------------------- vínculo na competência

  const janela = janelaTrabalhada(
    competencia,
    contrato.dataAdmissao,
    contrato.dataDesligamento,
  );

  if (janela.dias === 0) {
    avisos.push({
      severidade: "DIVERGENCIA",
      mensagem: `Vínculo não esteve ativo em ${competencia} (admissão em ${contrato.dataAdmissao}${contrato.dataDesligamento ? `, desligamento em ${contrato.dataDesligamento}` : ""}). Este funcionário não deveria entrar nesta folha.`,
    });
  }
  if (janela.desligouNoMes) {
    avisos.push({
      severidade: "ATENCAO",
      mensagem:
        "Mês de desligamento: esta folha traz apenas o saldo de salário. Aviso prévio, 13º e férias proporcionais + 1/3 e multa do FGTS são apurados na rescisão, que ainda não é calculada pelo sistema.",
    });
  }

  // ---------------------------------------------------------- proventos

  const apuracao = apurarProventos(contrato, movimento, cct, janela);
  rubricas.push(...apuracao.rubricas);
  memoria.push(...apuracao.memoria);
  avisos.push(...apuracao.avisos);

  const ats = cct.adicionalTempoServico;
  if (ats.tipo !== "NENHUM" && contrato.periodosTempoServico > 0) {
    const periodos =
      ats.limitePeriodos === null
        ? contrato.periodosTempoServico
        : Math.min(contrato.periodosTempoServico, ats.limitePeriodos);
    const percentual = periodos * ats.percentualPorPeriodo;
    const valor = percentualDe(apuracao.salarioBase, percentual);
    rubricas.push({
      codigo: "131",
      descricao: `Adicional por tempo de serviço (${ats.tipo.toLowerCase()})`,
      referencia: `${periodos} × ${ats.percentualPorPeriodo}%`,
      tipo: "PROVENTO",
      naturezaBase: "INTEGRA",
      valor,
      incideInss: true,
      incideIrrf: true,
      incideFgts: true,
    });
    memoria.push({
      titulo: "Adicional por tempo de serviço",
      formula: "salário base × (períodos × percentual por período)",
      substituicao: `${formatarBRL(apuracao.salarioBase)} × ${percentual}%`,
      resultado: valor,
      fundamento: `Cláusula de tempo de serviço — ${cct.nome}`,
    });
  }

  // Lançamentos avulsos entram ANTES das bases: um desconto marcado como
  // redutor precisa reduzir INSS, IRRF e FGTS igualmente, senão o mesmo
  // holerite sai com bases divergentes no eSocial.
  movimento.outrosProventos.forEach((l, i) =>
    rubricas.push(deLancamento(l, `19${i + 1}`, "PROVENTO")),
  );
  movimento.outrosDescontos.forEach((l, i) =>
    rubricas.push(deLancamento(l, `69${i + 1}`, "DESCONTO")),
  );
  // Ticket é pago à parte: sai da folha para não pagar duas vezes (valor cheio, fora das bases).
  if ((contrato.valorTicket ?? 0) > 0) {
    rubricas.push(
      deLancamento(
        {
          descricao: "Ticket (pago à parte)", valor: contrato.valorTicket as number,
          naturezaBase: "NEUTRA", incideInss: false, incideIrrf: false, incideFgts: false,
        },
        "680",
        "DESCONTO",
      ),
    );
  }

  // ---------------------------------------------------------- bases

  const baseInss = base(rubricas, "incideInss");
  const baseIrrf = base(rubricas, "incideIrrf");
  const baseFgts = base(rubricas, "incideFgts");

  if (baseInss < 0 || baseIrrf < 0 || baseFgts < 0) {
    avisos.push({
      severidade: "DIVERGENCIA",
      mensagem:
        "Base de cálculo negativa: os descontos que reduzem a remuneração superam os proventos do mês. Revise o lançamento do ponto antes de prosseguir.",
    });
  }

  // ---------------------------------------------------------- INSS

  const resultadoInss = calcularInss(
    {
      base: Math.max(0, baseInss),
      remuneracaoOutrosVinculos: contrato.remuneracaoOutrosVinculos,
      inssDescontadoOutrosVinculos: contrato.inssDescontadoOutrosVinculos,
    },
    inss,
  );
  // Sem impostos aqui, INSS e IRRF também não deduzem a pensão.
  const inssDescontado = semImpostos ? 0 : resultadoInss.valor;
  if (!semImpostos) {
    memoria.push(...resultadoInss.memoria);
    rubricas.push(
      neutra(
        "601",
        "INSS",
        `base ${formatarBRL(baseInss)}`,
        "DESCONTO",
        resultadoInss.valor,
      ),
    );
  }

  // ---------------------------------------------------------- pensão e IRRF

  const tributavel = Math.max(0, baseIrrf);

  function irrfCom(pensao: Centavos) {
    return calcularIrrf(
      {
        baseTributavel: tributavel,
        inssDescontado: inssDescontado,
        dependentes: contrato.dependentesIrrf,
        pensaoAlimenticia: pensao,
      },
      irrf,
    );
  }

  let pensaoValor = 0;
  let resultadoIrrf = irrfCom(0);

  const pensao: PensaoAlimenticia | null = movimento.pensao;
  if (pensao && pensao.quantidade > 0) {
    if (pensao.modo === "VALOR") {
      pensaoValor = pensao.quantidade;
    } else if (pensao.modo === "PERCENTUAL_SALARIO_MINIMO") {
      pensaoValor = percentualDe(salarioMinimo.valor, pensao.quantidade);
      memoria.push({
        titulo: "Pensão alimentícia",
        formula: "salário mínimo × percentual fixado judicialmente",
        substituicao: `${formatarBRL(salarioMinimo.valor)} × ${pensao.quantidade}%`,
        resultado: pensaoValor,
        fundamento: "Determinação judicial",
      });
    } else {
      // O percentual incide sobre o líquido antes da própria pensão. Sem essa
      // convenção o cálculo seria circular (pensão → IRRF → líquido → pensão).
      const liquidoAntesDaPensao =
        base(rubricas, "incideIrrf") - inssDescontado - (semImpostos ? 0 : resultadoIrrf.valor);
      pensaoValor = percentualDe(
        Math.max(0, liquidoAntesDaPensao),
        pensao.quantidade,
      );
      memoria.push({
        titulo: "Pensão alimentícia",
        formula: "(remuneração − INSS − IRRF) × percentual, antes da própria pensão",
        substituicao: `${formatarBRL(Math.max(0, liquidoAntesDaPensao))} × ${pensao.quantidade}%`,
        resultado: pensaoValor,
        fundamento: "Determinação judicial — base declarada na sentença",
      });
    }
    // Com a pensão conhecida, o IRRF é refeito usando-a como dedução legal.
    resultadoIrrf = irrfCom(pensaoValor);
  }

  if (!semImpostos) {
    memoria.push(...resultadoIrrf.memoria);
    rubricas.push(
      neutra(
        "602",
        "IRRF",
        `base ${formatarBRL(baseIrrf)}`,
        "DESCONTO",
        resultadoIrrf.valor,
      ),
    );
  }

  if (pensaoValor > 0) {
    rubricas.push(
      neutra(
        "604",
        "Pensão alimentícia",
        pensao?.modo === "VALOR"
          ? "valor fixo judicial"
          : `${pensao?.quantidade}% — ${pensao?.modo === "PERCENTUAL_LIQUIDO" ? "do líquido" : "do salário mínimo"}`,
        "DESCONTO",
        pensaoValor,
      ),
    );
  }

  // ---------------------------------------------------------- vale-transporte

  if (movimento.valeTransporteCusto > 0) {
    const teto = percentualDe(
      apuracao.salarioBase,
      cct.beneficios.valeTransportePercentualMaximo,
    );
    const valor = Math.min(movimento.valeTransporteCusto, teto);
    rubricas.push(
      neutra(
        "603",
        "Vale-transporte",
        `limitado a ${cct.beneficios.valeTransportePercentualMaximo}% do salário base`,
        "DESCONTO",
        valor,
      ),
    );
    memoria.push({
      titulo: "Vale-transporte",
      formula: "menor entre custo do benefício e percentual máximo do salário",
      substituicao: `min(${formatarBRL(movimento.valeTransporteCusto)}, ${formatarBRL(teto)})`,
      resultado: valor,
      fundamento: "Lei 7.418/85 art. 4º parágrafo único",
    });
    if (movimento.valeTransporteCusto > teto) {
      memoria.push({
        titulo: "Vale-transporte — parcela custeada pela escola",
        formula: "custo do benefício − teto de desconto",
        substituicao: `${formatarBRL(movimento.valeTransporteCusto)} − ${formatarBRL(teto)}`,
        resultado: movimento.valeTransporteCusto - teto,
        fundamento: "Lei 7.418/85 — excedente é custo do empregador",
      });
    }
  }

  // ---------------------------------------------------------- encargos patronais

  const baseEncargos = Math.max(0, baseFgts);
  const e = cct.encargos;

  const fgts = percentualDe(baseEncargos, e.fgtsPercentual);
  rubricas.push(
    neutra(
      "801",
      "FGTS",
      `${e.fgtsPercentual}% sobre ${formatarBRL(baseEncargos)}`,
      "ENCARGO_EMPREGADOR",
      fgts,
    ),
  );
  memoria.push({
    titulo: "FGTS (encargo do empregador)",
    formula: "base FGTS × alíquota",
    substituicao: `${formatarBRL(baseEncargos)} × ${e.fgtsPercentual}%`,
    resultado: fgts,
    fundamento: "Lei 8.036/90 art. 15",
  });

  const patronalPercentual =
    e.cppPercentual + e.ratPercentual + e.terceirosPercentual;
  if (patronalPercentual > 0) {
    const patronal = percentualDe(baseEncargos, patronalPercentual);
    rubricas.push(
      neutra(
        "802",
        "INSS patronal, RAT e terceiros",
        `${patronalPercentual.toFixed(2)}% sobre ${formatarBRL(baseEncargos)}`,
        "ENCARGO_EMPREGADOR",
        patronal,
      ),
    );
    memoria.push({
      titulo: "Contribuição patronal (CPP + RAT + terceiros)",
      formula: "base × (CPP + RAT/FAP + terceiros)",
      substituicao: `${formatarBRL(baseEncargos)} × (${e.cppPercentual}% + ${e.ratPercentual}% + ${e.terceirosPercentual}%)`,
      resultado: patronal,
      fundamento:
        "Lei 8.212/91 arts. 22 e 22-A — alíquotas variam por CNAE e FAP",
    });
  }

  if (e.provisionarDecimoTerceiro) {
    const provisao = fracaoDe(baseEncargos, 1, 12);
    rubricas.push(
      neutra(
        "811",
        "Provisão de 13º salário",
        "1/12 + encargos",
        "ENCARGO_EMPREGADOR",
        provisao + percentualDe(provisao, e.fgtsPercentual + patronalPercentual),
      ),
    );
  }

  if (e.provisionarFerias) {
    const provisao = multiplicar(
      fracaoDe(baseEncargos, 1, 12),
      1 + e.tercoConstitucional / 100,
    );
    rubricas.push(
      neutra(
        "812",
        "Provisão de férias + 1/3",
        `1/12 × ${(1 + e.tercoConstitucional / 100).toFixed(4)} + encargos`,
        "ENCARGO_EMPREGADOR",
        provisao + percentualDe(provisao, e.fgtsPercentual + patronalPercentual),
      ),
    );
  }

  if (semImpostos) {
    for (let i = rubricas.length - 1; i >= 0; i--) {
      if (rubricas[i]!.tipo === "ENCARGO_EMPREGADOR") rubricas.splice(i, 1);
    }
    for (let i = memoria.length - 1; i >= 0; i--) {
      if (/^FGTS \(encargo|^Contribuição patronal/.test(memoria[i]!.titulo)) memoria.splice(i, 1);
    }
  }

  // ---------------------------------------------------------- totais

  const proventos = rubricas.filter((r) => r.tipo === "PROVENTO");
  const descontos = rubricas.filter((r) => r.tipo === "DESCONTO");
  const encargos = rubricas.filter((r) => r.tipo === "ENCARGO_EMPREGADOR");

  const totalProventos = soma(proventos);
  const totalDescontos = soma(descontos);
  const liquido = totalProventos - totalDescontos;

  // Bruto pago = proventos menos o que reduz a remuneração. Não usa a base do
  // FGTS como proxy: um provento sem incidência de FGTS some do custo.
  const reducoes = soma(rubricas.filter((r) => r.naturezaBase === "REDUZ"));
  const remuneracaoBruta = totalProventos - reducoes;
  const custoTotalEmpregador = remuneracaoBruta + soma(encargos);

  if (liquido < 0) {
    avisos.push({
      severidade: "DIVERGENCIA",
      mensagem:
        "Líquido negativo: os descontos superam os proventos. Revise faltas, banco de horas e lançamentos avulsos.",
    });
  } else if (liquido === 0 && totalProventos > 0) {
    avisos.push({
      severidade: "ATENCAO",
      mensagem:
        "Líquido zerado: o funcionário não recebe nada nesta competência. Confirme se é o esperado antes de fechar.",
    });
  }

  const jornadaIntegral =
    contrato.regime === "MENSALISTA" && contrato.cargaHorariaSemanal >= 40;
  if (
    !janela.parcial &&
    jornadaIntegral &&
    apuracao.salarioBase < salarioMinimo.valor
  ) {
    avisos.push({
      severidade: "DIVERGENCIA",
      mensagem: `Salário base (${formatarBRL(apuracao.salarioBase)}) abaixo do mínimo vigente (${formatarBRL(salarioMinimo.valor)}) para jornada integral.`,
    });
  }

  if (ocultarDsr) {
    // O DSR é devido e continua pago: só deixa de aparecer como linha própria.
    for (let i = rubricas.length - 1; i > 0; i--) {
      const r = rubricas[i]!;
      const origem = rubricas[i - 1]!;
      if (r.tipo === "PROVENTO" && /^DSR sobre/i.test(r.descricao) && origem.tipo === "PROVENTO") {
        rubricas[i - 1] = { ...origem, valor: origem.valor + r.valor };
        rubricas.splice(i, 1);
      }
    }
    // Memória de cálculo: o passo do DSR some, o valor entra no passo de
    // origem e nenhuma frase fala de repouso/DSR.
    for (let i = memoria.length - 1; i > 0; i--) {
      const m = memoria[i]!;
      if (/^(Repouso semanal|DSR)/i.test(m.titulo)) {
        const origem = memoria[i - 1]!;
        memoria[i - 1] = { ...origem, resultado: origem.resultado + m.resultado };
        memoria.splice(i, 1);
      }
    }
    const limpar = (t: string) => t
      .replace(/,? ?mais (o )?(1\/6 de )?(repouso|DSR)/gi, "")
      .replace(/ \+ (reflexo de )?(repouso|DSR)/gi, "");
    for (let i = 0; i < memoria.length; i++) {
      const m = memoria[i]!;
      memoria[i] = { ...m, formula: limpar(m.formula), fundamento: m.fundamento ? limpar(m.fundamento) : m.fundamento };
    }
    // A perda do repouso por falta injustificada é desconto, não linha de DSR
    // somada nas aulas: continua descontada, só muda o nome na tela/holerite.
    const renomear = (t: string) => t
      .replace(/DSR perdido/gi, "Perda semanal")
      .replace(/Perda do DSR/gi, "Perda semanal")
      .replace(/DSR de uma semana/gi, "valor de uma semana")
      .replace(/perder o repouso da semana/gi, "perder a remuneração semanal")
      .replace(/(\d+) repouso\(s\)/gi, "$1 semana(s)");
    for (let i = 0; i < rubricas.length; i++) {
      const r = rubricas[i]!;
      if (r.tipo === "DESCONTO") rubricas[i] = { ...r, descricao: renomear(r.descricao), referencia: r.referencia ? renomear(r.referencia) : r.referencia };
    }
    for (let i = 0; i < memoria.length; i++) {
      const m = memoria[i]!;
      memoria[i] = { ...m, titulo: renomear(m.titulo), formula: renomear(m.formula), fundamento: m.fundamento ? renomear(m.fundamento) : m.fundamento };
    }
  }

  return {
    funcionarioId: contrato.funcionarioId,
    competencia: competencia as ResultadoFolha["competencia"],
    rubricas,
    baseInss,
    baseIrrf,
    baseFgts,
    totalProventos,
    totalDescontos,
    liquido,
    remuneracaoBruta,
    custoTotalEmpregador,
    memoria,
    avisos,
  };
}

/** A folha não avança enquanto houver divergência aberta. */
export function statusSugerido(resultado: ResultadoFolha): StatusFolha {
  return resultado.avisos.some((a) => a.severidade === "DIVERGENCIA")
    ? "COM_DIVERGENCIA"
    : "EM_CALCULO";
}

/** Bloqueios que impedem o avanço para CONFERIDO. */
export function bloqueiosParaConferir(resultado: ResultadoFolha): Aviso[] {
  return resultado.avisos.filter((a) => a.severidade === "DIVERGENCIA");
}

export function arredondarParaCentavos(valor: number): Centavos {
  return arredondar(valor);
}
