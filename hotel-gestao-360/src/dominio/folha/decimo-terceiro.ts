import {
  fracaoDe,
  formatarBRL,
  percentualDe,
  type Centavos,
} from "../comum/dinheiro.js";
import { janelaTrabalhada } from "../comum/competencia.js";
import { calcularInss, calcularIrrf } from "./impostos.js";
import type { TabelaINSS, TabelaIRRF } from "./parametros.js";
import type { Aviso, PassoMemoria, Rubrica } from "./tipos.js";

/**
 * Meses trabalhados no ano, para 13º e férias proporcionais — regra do
 * art. 1º, parágrafo único, da Lei 4.090/1962: 15 dias ou mais de vínculo
 * dentro do mês contam como mês integral; menos que isso não conta nada
 * (não existe "meio mês" de 13º).
 *
 * Simplificação assumida: não desconta falta injustificada acumulada (que
 * pode derrubar um mês do cálculo por si só, art. 130 CLT combinado com a
 * prática de 13º) — cobre o caso comum (admissão/desligamento no meio do
 * ano), não o caso raro de falta excessiva.
 */
export function mesesTrabalhadosNoAno(
  dataAdmissao: string,
  dataDesligamento: string | null,
  ano: string,
): number {
  let meses = 0;
  for (let m = 1; m <= 12; m++) {
    const competencia = `${ano}-${String(m).padStart(2, "0")}`;
    const janela = janelaTrabalhada(competencia, dataAdmissao, dataDesligamento);
    if (janela.dias >= 15) meses++;
  }
  return meses;
}

export interface ParametrosDecimoTerceiro {
  inss: TabelaINSS;
  irrf: TabelaIRRF;
  fgtsPercentual: number;
}

export interface EntradaDecimoTerceiro {
  funcionarioId: string;
  ano: string;
  /**
   * Base mensal para o cálculo: para mensalista, o salário-base do mês de
   * dezembro (ou do mês de desligamento, se saiu antes); para horista
   * (hora-aula/hora-relógio), a MÉDIA das remunerações variáveis pagas no
   * ano (Súmula 253 do TST — parcelas variáveis entram pela média, não pelo
   * valor do último mês). Puro: quem chama decide e informa o valor, este
   * módulo não lê histórico de folha sozinho.
   */
  baseRemuneracaoMensal: Centavos;
  mesesTrabalhados: number;
  dependentesIrrf: number;
  parcela: 1 | 2;
  /**
   * Só usado na 2ª parcela: o valor REALMENTE pago na 1ª parcela (lido do
   * registro persistido, não recalculado). Sem isto, recalcular a 2ª parcela
   * assumindo "metade da base ATUAL" quebra para horista, cuja base muda mês
   * a mês — a 2ª parcela deduziria um valor diferente do que de fato saiu na
   * 1ª, podendo estourar o líquido para negativo mesmo em uso normal.
   * `undefined` cai no comportamento antigo (assume metade desta mesma
   * base) — só correto quando as duas parcelas são calculadas na mesma
   * chamada/teste, nunca no fluxo real de produção.
   */
  valorJaAntecipado?: Centavos;
}

export interface ResultadoDecimoTerceiro {
  funcionarioId: string;
  parcela: 1 | 2;
  baseProporcional: Centavos;
  rubricas: Rubrica[];
  totalProventos: Centavos;
  totalDescontos: Centavos;
  liquido: Centavos;
  /** FGTS desta parcela — encargo do empregador, não desconto do empregado. */
  fgts: Centavos;
  memoria: PassoMemoria[];
  avisos: Aviso[];
}

function rubrica(
  codigo: string,
  descricao: string,
  referencia: string,
  tipo: Rubrica["tipo"],
  valor: Centavos,
  incide: { inss?: boolean; irrf?: boolean; fgts?: boolean } = {},
): Rubrica {
  return {
    codigo,
    descricao,
    referencia,
    tipo,
    naturezaBase: "NEUTRA",
    valor,
    incideInss: incide.inss ?? false,
    incideIrrf: incide.irrf ?? false,
    incideFgts: incide.fgts ?? false,
  };
}

/**
 * 13º salário. Uma chamada por parcela — cada `ResultadoDecimoTerceiro` é o
 * que sai NAQUELE pagamento, não o ano inteiro de uma vez. O chamador decide
 * quando cada parcela é devida (1ª até 30/11, 2ª até 20/12) e persiste os
 * dois resultados separadamente, do mesmo jeito que `folha_calculos` guarda
 * um registro por competência.
 *
 *  - 1ª parcela: metade do proporcional, SEM desconto de INSS/IRRF (Lei
 *    4.090/1962 art. 2º c/ IN RFB 1.500/2014 art. 12 §1º V) — só compõe
 *    base de FGTS.
 *  - 2ª parcela: o proporcional inteiro menos o que já saiu na 1ª, com INSS
 *    e IRRF incidindo sobre o VALOR CHEIO do 13º (não só a 2ª parcela) —
 *    tributação exclusiva na fonte, pela mesma tabela progressiva do
 *    salário mensal (a Receita não tem tabela própria para 13º).
 */
export function calcular13Salario(
  entrada: EntradaDecimoTerceiro,
  parametros: ParametrosDecimoTerceiro,
): ResultadoDecimoTerceiro {
  const rubricas: Rubrica[] = [];
  const memoria: PassoMemoria[] = [];
  const avisos: Aviso[] = [];

  const baseProporcional = fracaoDe(
    entrada.baseRemuneracaoMensal,
    entrada.mesesTrabalhados,
    12,
  );
  memoria.push({
    titulo: "13º salário — base proporcional",
    formula: "base mensal × meses trabalhados ÷ 12",
    substituicao: `${formatarBRL(entrada.baseRemuneracaoMensal)} × ${entrada.mesesTrabalhados}/12`,
    resultado: baseProporcional,
    fundamento: "Lei 4.090/1962 art. 1º",
  });

  if (entrada.mesesTrabalhados === 0) {
    avisos.push({
      severidade: "DIVERGENCIA",
      mensagem:
        "Nenhum mês com 15 dias ou mais de vínculo neste ano: sem direito a 13º proporcional.",
    });
  }
  if (entrada.mesesTrabalhados < 0 || entrada.mesesTrabalhados > 12) {
    avisos.push({
      severidade: "DIVERGENCIA",
      mensagem: `Meses trabalhados (${entrada.mesesTrabalhados}) fora do intervalo 0-12 — confira o cálculo de meses antes de usar este resultado.`,
    });
  }

  const metade = fracaoDe(baseProporcional, 1, 2);

  if (entrada.parcela === 1) {
    rubricas.push(
      rubrica(
        "921",
        "13º salário — 1ª parcela",
        `${entrada.mesesTrabalhados}/12, metade, sem desconto`,
        "PROVENTO",
        metade,
        { fgts: true },
      ),
    );
    const fgts = percentualDe(metade, parametros.fgtsPercentual);
    rubricas.push(
      rubrica(
        "926",
        "FGTS sobre 13º (1ª parcela)",
        `${parametros.fgtsPercentual}% sobre ${formatarBRL(metade)}`,
        "ENCARGO_EMPREGADOR",
        fgts,
      ),
    );
    return {
      funcionarioId: entrada.funcionarioId,
      parcela: 1,
      baseProporcional,
      rubricas,
      totalProventos: metade,
      totalDescontos: 0,
      liquido: metade,
      fgts,
      memoria,
      avisos,
    };
  }

  // ---------------------------------------------------------- 2ª parcela

  const resultadoInss = calcularInss(
    {
      base: baseProporcional,
      remuneracaoOutrosVinculos: 0,
      inssDescontadoOutrosVinculos: 0,
    },
    parametros.inss,
  );
  memoria.push(
    ...resultadoInss.memoria.map((p) => ({
      ...p,
      titulo: p.titulo.replace("INSS", "INSS sobre 13º"),
    })),
  );

  const resultadoIrrf = calcularIrrf(
    {
      baseTributavel: baseProporcional,
      inssDescontado: resultadoInss.valor,
      dependentes: entrada.dependentesIrrf,
      pensaoAlimenticia: 0,
    },
    parametros.irrf,
  );
  memoria.push(
    ...resultadoIrrf.memoria.map((p) => ({
      ...p,
      titulo: p.titulo.replace("IRRF", "IRRF sobre 13º"),
    })),
  );

  rubricas.push(
    rubrica(
      "922",
      "13º salário — valor integral",
      `${entrada.mesesTrabalhados}/12`,
      "PROVENTO",
      baseProporcional,
      { inss: true, irrf: true, fgts: true },
    ),
  );
  const jaAntecipado = entrada.valorJaAntecipado ?? metade;
  rubricas.push(
    rubrica(
      "923",
      "13º salário — 1ª parcela já paga",
      "dedução da 2ª parcela",
      "DESCONTO",
      jaAntecipado,
    ),
  );
  rubricas.push(
    rubrica(
      "924",
      "INSS sobre 13º",
      `base ${formatarBRL(baseProporcional)}`,
      "DESCONTO",
      resultadoInss.valor,
    ),
  );
  rubricas.push(
    rubrica(
      "925",
      "IRRF sobre 13º",
      `base ${formatarBRL(baseProporcional)}`,
      "DESCONTO",
      resultadoIrrf.valor,
    ),
  );

  const totalProventos = baseProporcional;
  const totalDescontos = jaAntecipado + resultadoInss.valor + resultadoIrrf.valor;
  const liquido = totalProventos - totalDescontos;

  if (liquido < 0) {
    avisos.push({
      severidade: "DIVERGENCIA",
      mensagem:
        "2ª parcela do 13º sairia negativa: a 1ª parcela paga, somada aos descontos, supera o valor devido — confira o valor pago na 1ª parcela e o cálculo de meses trabalhados antes de prosseguir.",
    });
  }

  const fgtsParcela2 = percentualDe(
    baseProporcional - jaAntecipado,
    parametros.fgtsPercentual,
  );
  rubricas.push(
    rubrica(
      "927",
      "FGTS sobre 13º (2ª parcela)",
      `${parametros.fgtsPercentual}% sobre ${formatarBRL(baseProporcional - jaAntecipado)}`,
      "ENCARGO_EMPREGADOR",
      fgtsParcela2,
    ),
  );

  return {
    funcionarioId: entrada.funcionarioId,
    parcela: 2,
    baseProporcional,
    rubricas,
    totalProventos,
    totalDescontos,
    liquido,
    fgts: fgtsParcela2,
    memoria,
    avisos,
  };
}
