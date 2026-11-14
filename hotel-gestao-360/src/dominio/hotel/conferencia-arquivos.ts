/**
 * Reconhece os relatórios do DataHotel enviados para a conferência (pelo título
 * dentro do arquivo, não pelo nome) e monta os dados que o motor de conferência usa.
 */
import {
  lerApartamentosCamareiraDataHotel, lerContasRecebidasDataHotel, lerMovimentoCaixaDataHotel, lerListaCafeDataHotel, lerRelatorioReservasDataHotel,
} from "./importacao.js";
import {
  lerContasAReceber, lerCreditosDebitos, lerEstoque, lerFaturamentoAnalitico, lerFaturamentoDiario, lerMapaOcupacao,
  lerRds, lerReceitasDespesas, lerTotalGeral, recebimentosDeLinhas, reservasDeLinhas,
  type DadosConferencia, type Fonte,
} from "./conferencia.js";

export interface ArquivoTexto { nome: string; texto: string }

/** Qual relatório é este arquivo? Null = não reconhecido. */
export function reconhecer(texto: string): Fonte | null {
  const t = texto.slice(0, 4000);
  if (/Reservas por Empresas/i.test(t)) return "reservasEmpresa";
  if (/Relat.rio de Reservas/i.test(t) && /C.d\. Res\./.test(texto)) return "reservas";
  if (/Contas Recebidas por/i.test(t)) return "recebidas";
  if (/Receitas x Despesas/i.test(t)) return "receitas";
  if (/Resumo de Faturamento Di.rio/i.test(t)) return "fatDiario";
  if (/Faturamento Anal.tico/i.test(t)) return "analitico";
  if (/Cr.ditos e D.bitos por Forma/i.test(t)) return "creditos";
  if (/Contas a Receber por/i.test(t)) return "aReceber";
  if (/Consumo por Data/i.test(t)) return "consumo";
  if (/Vendas Itens por Data/i.test(t)) return "vendas";
  if (/Relat.rio Di.rio de Situa..o/i.test(t)) return "rds";
  if (/Mapa de Ocupa..o Di.rio/i.test(t)) return "mapa";
  if (/Lista de Caf. da Manh./i.test(t)) return "cafe";
  if (/Lista de Camareira/i.test(t)) return "camareira";
  if (/Relat.rio de Estoque Atual/i.test(t)) return "estoque";
  if (/Resumo por Movimenta..o de Caixa/i.test(t)) return "caixa";
  if (/^\s*Extrato de Conta Corrente/i.test(t) && /S A L D O/.test(texto)) return "banco";
  return null;
}

export interface Montagem {
  dados: DadosConferencia;
  reconhecidos: { nome: string; fonte: Fonte }[];
  naoReconhecidos: string[];
  erros: string[];
}

/** Lê os arquivos e monta os dados. Arquivo que falhar na leitura vira erro, não derruba a conferência. */
export function montarDados(arquivos: ArquivoTexto[], inicio: string, fim: string, hoje: string = fim): Montagem {
  const reconhecidos: { nome: string; fonte: Fonte }[] = [];
  const naoReconhecidos: string[] = [];
  const erros: string[] = [];
  const porFonte = new Map<Fonte, string[]>();
  for (const a of arquivos) {
    const f = reconhecer(a.texto);
    if (!f) { naoReconhecidos.push(a.nome); continue; }
    reconhecidos.push({ nome: a.nome, fonte: f });
    porFonte.set(f, [...(porFonte.get(f) ?? []), a.texto]);
  }
  const um = (f: Fonte): string | undefined => porFonte.get(f)?.[0];
  const tem: Partial<Record<Fonte, boolean>> = {};
  for (const f of ["reservas", "recebidas", "receitas", "fatDiario", "analitico", "creditos", "aReceber", "consumo", "vendas", "rds", "mapa", "cafe", "camareira", "estoque", "caixa"] as Fonte[]) {
    tem[f] = porFonte.has(f);
  }

  const dados: DadosConferencia = {
    inicio, fim, hoje, tem,
    reservas: [], recebimentos: [], receitasDespesas: [], faturamentoDiario: [],
    faturamentoAnalitico: { diarias: [], subDiaria: null, subConsumo: null, subVendas: null, total: null },
    creditosDebitos: [], contasAReceber: [], consumoPorDataTotal: null, vendasItensVenda: null,
    rds: null, mapa: [], cafe: [], apartamentos: [], estoque: [],
  };
  const seguro = (nome: string, fn: () => void) => { if (!porFonte.has(nome as Fonte)) return; try { fn(); } catch (e) { erros.push(`${nome}: ${e instanceof Error ? e.message : "não consegui ler"}`); tem[nome as Fonte] = false; } };

  seguro("reservas", () => {
    // vários arquivos de reservas (período e futuras) somam; a mesma reserva não entra duas vezes
    const vistos = new Set<string>();
    for (const t of porFonte.get("reservas") ?? []) {
      const r = lerRelatorioReservasDataHotel(t);
      if (!r) continue;
      for (const res of reservasDeLinhas(r.linhas)) if (!vistos.has(res.codigo)) { vistos.add(res.codigo); dados.reservas.push(res); }
    }
  });
  seguro("recebidas", () => {
    const r = lerContasRecebidasDataHotel(um("recebidas")!, inicio);
    if (!r) throw new Error("formato inesperado");
    dados.recebimentos = recebimentosDeLinhas(r.linhas);
  });
  seguro("receitas", () => { dados.receitasDespesas = lerReceitasDespesas(um("receitas")!); });
  seguro("fatDiario", () => { dados.faturamentoDiario = lerFaturamentoDiario(um("fatDiario")!); });
  seguro("analitico", () => { dados.faturamentoAnalitico = lerFaturamentoAnalitico(um("analitico")!); });
  seguro("creditos", () => { dados.creditosDebitos = lerCreditosDebitos(um("creditos")!); });
  seguro("aReceber", () => { dados.contasAReceber = lerContasAReceber(um("aReceber")!); });
  seguro("consumo", () => { dados.consumoPorDataTotal = lerTotalGeral(um("consumo")!); });
  seguro("vendas", () => { dados.vendasItensVenda = lerTotalGeral(um("vendas")!); });
  seguro("rds", () => { dados.rds = lerRds(um("rds")!); });
  seguro("mapa", () => { dados.mapa = lerMapaOcupacao(um("mapa")!); });
  seguro("cafe", () => {
    const r = lerListaCafeDataHotel(um("cafe")!, inicio);
    if (!r) throw new Error("formato inesperado");
    dados.cafe = r.linhas.map((l) => ({ dia: l.data!.split("/").reverse().join("-"), apto: l.apartamento!, adultos: Number(l.adultos), criancas: Number(l.criancas), tipo: l.tipo! }));
  });
  seguro("camareira", () => {
    const r = lerApartamentosCamareiraDataHotel(um("camareira")!);
    if (!r) throw new Error("formato inesperado");
    dados.apartamentos = r.linhas.map((l) => ({ numero: l.apartamento!, situacao: l.situacao! }));
  });
  seguro("estoque", () => { dados.estoque = lerEstoque(um("estoque")!); });
  seguro("caixa", () => {
    const r = lerMovimentoCaixaDataHotel(um("caixa")!, inicio);
    if (!r) throw new Error("formato inesperado");
    dados.livroCaixa = recebimentosDeLinhas(r.linhas).map((x) => ({ dia: x.dia, forma: x.forma, valor: x.valor }));
  });

  return { dados, reconhecidos, naoReconhecidos, erros };
}
