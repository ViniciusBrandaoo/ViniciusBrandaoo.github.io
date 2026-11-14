import {
  formatarBRL,
  percentualDe,
  type Centavos,
} from "../comum/dinheiro.js";
import type { TabelaINSS, TabelaIRRF } from "./parametros.js";
import type { PassoMemoria } from "./tipos.js";

export interface ResultadoImposto {
  valor: Centavos;
  memoria: PassoMemoria[];
}

export interface EntradaInss {
  base: Centavos;
  /** Remuneração declarada de outros empregadores na mesma competência. */
  remuneracaoOutrosVinculos: Centavos;
  /** INSS que os outros empregadores já descontaram. */
  inssDescontadoOutrosVinculos: Centavos;
}

/** Soma progressiva pura, sem a lógica de múltiplos vínculos. */
function progressivo(
  base: Centavos,
  tabela: TabelaINSS,
): { valor: Centavos; passos: PassoMemoria[] } {
  const limitada = Math.min(base, tabela.teto);
  const passos: PassoMemoria[] = [];
  let limiteAnterior = 0;
  let total = 0;

  for (const faixa of tabela.faixas) {
    if (limitada <= limiteAnterior) break;
    const topoFaixa = Math.min(faixa.ate, tabela.teto);
    const parcela = Math.min(limitada, topoFaixa) - limiteAnterior;
    if (parcela > 0) {
      const valorFaixa = percentualDe(parcela, faixa.aliquota);
      total += valorFaixa;
      passos.push({
        titulo: `INSS — faixa até ${formatarBRL(topoFaixa)}`,
        formula: "parcela na faixa × alíquota",
        substituicao: `${formatarBRL(parcela)} × ${faixa.aliquota}%`,
        resultado: valorFaixa,
        fundamento: `Lei 8.212/91 art. 20 c/ EC 103/2019 — ${tabela.fonte}`,
      });
    }
    limiteAnterior = topoFaixa;
  }

  return { valor: total, passos };
}

/**
 * INSS progressivo: cada faixa incide apenas sobre a parcela do salário contida
 * nela. Aplicar a alíquota da última faixa sobre o total inteiro é o erro
 * clássico de planilha e superestima o desconto.
 *
 * Com mais de um vínculo, a tabela é aplicada sobre a soma das remunerações
 * (limitada ao teto) e se abate o que os outros empregadores já descontaram —
 * do contrário o professor de duas escolas paga INSS a maior e fica com direito
 * a restituição (IN RFB 2.110, art. 66).
 */
export function calcularInss(
  entrada: EntradaInss,
  tabela: TabelaINSS,
): ResultadoImposto {
  const { base, remuneracaoOutrosVinculos, inssDescontadoOutrosVinculos } =
    entrada;
  const temOutroVinculo = remuneracaoOutrosVinculos > 0;
  const baseConsolidada = base + remuneracaoOutrosVinculos;

  const bruto = progressivo(baseConsolidada, tabela);
  const memoria = [...bruto.passos];

  if (temOutroVinculo) {
    memoria.push({
      titulo: "INSS — consolidação de vínculos",
      formula: "remuneração desta escola + remuneração dos demais vínculos",
      substituicao: `${formatarBRL(base)} + ${formatarBRL(remuneracaoOutrosVinculos)}`,
      resultado: Math.min(baseConsolidada, tabela.teto),
      fundamento: "IN RFB 2.110/2022 art. 66 — teto único entre vínculos",
    });
  }

  const devido = Math.max(0, bruto.valor - inssDescontadoOutrosVinculos);

  if (baseConsolidada > tabela.teto) {
    memoria.push({
      titulo: "INSS — teto de contribuição aplicado",
      formula: "base limitada ao teto",
      substituicao: `${formatarBRL(baseConsolidada)} → ${formatarBRL(tabela.teto)}`,
      resultado: bruto.valor,
      fundamento: tabela.fonte,
    });
  }

  memoria.push({
    titulo: "INSS — total descontado",
    formula: temOutroVinculo
      ? "soma das faixas − INSS já descontado em outros vínculos"
      : "soma das faixas",
    substituicao: temOutroVinculo
      ? `${formatarBRL(bruto.valor)} − ${formatarBRL(inssDescontadoOutrosVinculos)}`
      : `base ${formatarBRL(base)}`,
    resultado: devido,
    fundamento: tabela.fonte,
  });

  return { valor: devido, memoria };
}

export interface EntradaIrrf {
  baseTributavel: Centavos;
  inssDescontado: Centavos;
  dependentes: number;
  pensaoAlimenticia: Centavos;
}

/**
 * IRRF: compara a base por deduções legais com a base pelo desconto simplificado
 * e usa a menor — o simplificado substitui todas as deduções, então precisa ser
 * calculado inteiro e não somado às demais.
 */
export function calcularIrrf(
  entrada: EntradaIrrf,
  tabela: TabelaIRRF,
): ResultadoImposto {
  const { baseTributavel, inssDescontado, dependentes, pensaoAlimenticia } =
    entrada;
  const memoria: PassoMemoria[] = [];

  const deducoesLegais =
    inssDescontado +
    dependentes * tabela.deducaoPorDependente +
    pensaoAlimenticia;
  const baseCompleta = Math.max(0, baseTributavel - deducoesLegais);
  const baseSimplificada = Math.max(
    0,
    baseTributavel - tabela.descontoSimplificado,
  );

  const usaSimplificado = baseSimplificada < baseCompleta;
  const base = usaSimplificado ? baseSimplificada : baseCompleta;

  memoria.push({
    titulo: "IRRF — base por deduções legais",
    formula: "tributável − INSS − (dependentes × dedução) − pensão",
    substituicao: `${formatarBRL(baseTributavel)} − ${formatarBRL(inssDescontado)} − ${dependentes} × ${formatarBRL(tabela.deducaoPorDependente)} − ${formatarBRL(pensaoAlimenticia)}`,
    resultado: baseCompleta,
    fundamento: `Lei 9.250/95 art. 4º — ${tabela.fonte}`,
  });
  memoria.push({
    titulo: "IRRF — base pelo desconto simplificado",
    formula: "tributável − desconto simplificado",
    substituicao: `${formatarBRL(baseTributavel)} − ${formatarBRL(tabela.descontoSimplificado)}`,
    resultado: baseSimplificada,
    fundamento: tabela.fonte,
  });
  memoria.push({
    titulo: `IRRF — base adotada (${usaSimplificado ? "simplificado" : "deduções legais"})`,
    formula: "menor das duas bases",
    substituicao: `min(${formatarBRL(baseCompleta)}, ${formatarBRL(baseSimplificada)})`,
    resultado: base,
    fundamento: "Opção mais favorável ao contribuinte",
  });

  const faixa =
    tabela.faixas.find((f) => f.ate === null || base <= f.ate) ??
    tabela.faixas[tabela.faixas.length - 1];

  if (!faixa || faixa.aliquota === 0) {
    memoria.push({
      titulo: "IRRF — isento",
      formula: "base dentro da faixa de isenção",
      substituicao: formatarBRL(base),
      resultado: 0,
      fundamento: tabela.fonte,
    });
    return { valor: 0, memoria };
  }

  const imposto = Math.max(
    0,
    percentualDe(base, faixa.aliquota) - faixa.parcelaDeduzir,
  );
  memoria.push({
    titulo: "IRRF — imposto pela tabela",
    formula: "base × alíquota − parcela a deduzir",
    substituicao: `${formatarBRL(base)} × ${faixa.aliquota}% − ${formatarBRL(faixa.parcelaDeduzir)}`,
    resultado: imposto,
    fundamento: tabela.fonte,
  });

  // Redutor da Lei 15.270/2025: incide sobre o RENDIMENTO TRIBUTÁVEL (bruto),
  // não sobre `base` (já reduzida por INSS/dependentes/simplificado) — são
  // variáveis diferentes. Tabela sem os quatro campos (ex.: a de 2025,
  // anterior à lei) não tem redutor, e o imposto da tabela vale como está.
  if (
    tabela.isencaoTotalAte !== undefined &&
    baseTributavel <= tabela.isencaoTotalAte
  ) {
    memoria.push({
      titulo: "IRRF — isenção da faixa de rendimento",
      formula: "rendimento tributável dentro do teto de isenção total",
      substituicao: `${formatarBRL(baseTributavel)} ≤ ${formatarBRL(tabela.isencaoTotalAte)}`,
      resultado: 0,
      fundamento: "Lei 15.270/2025 — " + tabela.fonte,
    });
    return { valor: 0, memoria };
  }
  if (
    tabela.reducaoAte !== undefined &&
    baseTributavel <= tabela.reducaoAte &&
    tabela.reducaoBase !== undefined &&
    tabela.reducaoFator !== undefined
  ) {
    const redutor = Math.max(
      0,
      tabela.reducaoBase - Math.round(baseTributavel * tabela.reducaoFator),
    );
    const comRedutor = Math.max(0, imposto - redutor);
    memoria.push({
      titulo: "IRRF — redutor da faixa de transição",
      formula: "redutor = base do redutor − (fator × rendimento tributável)",
      substituicao: `${formatarBRL(tabela.reducaoBase)} − (${tabela.reducaoFator} × ${formatarBRL(baseTributavel)}) = ${formatarBRL(redutor)}`,
      resultado: comRedutor,
      fundamento: "Lei 15.270/2025 — " + tabela.fonte,
    });
    return { valor: comRedutor, memoria };
  }

  return { valor: imposto, memoria };
}
