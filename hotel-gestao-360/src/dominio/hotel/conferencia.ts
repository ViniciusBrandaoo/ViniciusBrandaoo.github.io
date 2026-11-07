/**
 * Conferência automática do fechamento do hotel.
 *
 * Cruza os relatórios exportados do DataHotel entre si (e com o que o Hotel 360
 * já guarda) e aponta o que não bate: faturado × recebido × caixa × cartões ×
 * a receber das empresas × consumo × café × ocupação × estoque.
 *
 * Tudo em centavos. Funções puras: recebem os dados lidos e devolvem a lista de
 * resultados. Não alteram nada, em nenhum lugar.
 *
 * Cada regra devolve:
 *   OK         — os números batem (dentro da tolerância)
 *   DIVERGENTE — não bate; `esperado`, `encontrado` e `diferenca` dizem quanto
 *   ATENCAO    — não é erro de conta, mas pede olho humano (pendência, saldo negativo)
 */
import { lerValor, normalizarForma, type LinhaBruta } from "./importacao.js";

export type Situacao = "OK" | "DIVERGENTE" | "ATENCAO";

export interface Resultado {
  regra: string;
  titulo: string;
  situacao: Situacao;
  esperado?: number;
  encontrado?: number;
  diferenca?: number;
  /** Como mostrar os números: dinheiro (centavos) ou contagem. Padrão: dinheiro. */
  unidade?: "centavos" | "un";
  /** O que a regra comparou (fonte A × fonte B). */
  entre: string;
  detalhes: string[];
}

// ------------------------------------------------------------------ leitura simples

const num = (s: string | undefined): number | null => {
  if (s === undefined) return null;
  const v = lerValor(s.trim());
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
};
const celulas = (linha: string): string[] => linha.split(";").map((c) => c.trim());
const naoVazias = (linha: string): string[] => celulas(linha).filter((c) => c !== "");
const DATA = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const iso = (br: string): string => { const m = DATA.exec(br.trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };
const linhasDe = (t: string): string[] => t.replace(/^﻿/, "").split(/\r?\n/);
const VALOR = /^-?(R\$\s*)?-?\d{1,3}(\.\d{3})*,\d{2}$|^-?(R\$\s*)?-?\d+,\d{2}$/;

export interface PorDia { data: string; valor: number }

/** "Receitas x Despesas": por dia, receitas e despesas. */
export function lerReceitasDespesas(texto: string): { dia: string; receitas: number; despesas: number }[] {
  const out: { dia: string; receitas: number; despesas: number }[] = [];
  for (const l of linhasDe(texto)) {
    const t = naoVazias(l);
    if (t.length >= 3 && DATA.test(t[0]!) && VALOR.test(t[1]!) && VALOR.test(t[2]!)) {
      out.push({ dia: iso(t[0]!), receitas: num(t[1])!, despesas: num(t[2])! });
    }
  }
  return out;
}

/** "Resumo de Faturamento Diário": por dia, consumo, diária, venda de balcão. */
export function lerFaturamentoDiario(texto: string): { dia: string; consumo: number; diaria: number; venda: number; total: number }[] {
  const ls = linhasDe(texto);
  const cab = ls.map(celulas).find((c) => c[0] === "DATA");
  if (!cab) return [];
  const idx = (nome: string) => cab.findIndex((c) => c.toUpperCase().startsWith(nome));
  const [iC, iD, iV, iT] = [idx("CONSUMO"), idx("DI"), idx("VENDA"), idx("TOTAL")];
  const out: { dia: string; consumo: number; diaria: number; venda: number; total: number }[] = [];
  for (const l of ls) {
    const c = celulas(l);
    if (!DATA.test(c[0] ?? "")) continue;
    out.push({ dia: iso(c[0]!), consumo: num(c[iC]) ?? 0, diaria: num(c[iD]) ?? 0, venda: num(c[iV]) ?? 0, total: num(c[iT]) ?? 0 });
  }
  return out;
}

/** "Relatório de Faturamento Analítico": diária por reserva e noite, e os subtotais. */
export function lerFaturamentoAnalitico(texto: string): {
  diarias: { reserva: string; dia: string; valor: number }[];
  subDiaria: number | null; subConsumo: number | null; subVendas: number | null; total: number | null;
} {
  const diarias: { reserva: string; dia: string; valor: number }[] = [];
  const subs: number[] = [];
  let total: number | null = null;
  for (const l of linhasDe(texto)) {
    const t = naoVazias(l);
    if (!t.length) continue;
    if (/^[A-Z]{2,4}\d{5,8}$/.test(t[0]!) && DATA.test(t[1] ?? "") && /^HOSPEDAGEM/i.test(t[2] ?? "")) {
      const v = num(t[t.length - 1]);
      if (v !== null) diarias.push({ reserva: t[0]!, dia: iso(t[1]!), valor: v });
    } else if (/^Sub-Total$/i.test(t[0]!) || (/^Sub-Total$/i.test(t[1] ?? "") && t.length === 3)) {
      const v = num(t[t.length - 1]);
      if (v !== null) subs.push(v);
    } else if (/^Total Geral$/i.test(t[0]!)) {
      total = num(t[t.length - 1]);
    }
  }
  return { diarias, subDiaria: subs[0] ?? null, subConsumo: subs[1] ?? null, subVendas: subs[2] ?? null, total };
}

/** "Créditos e Débitos por Forma de Pagamento": por forma, créditos, débitos e saldo. */
export function lerCreditosDebitos(texto: string): { forma: string; creditos: number; debitos: number; saldo: number }[] {
  const out: { forma: string; creditos: number; debitos: number; saldo: number }[] = [];
  for (const l of linhasDe(texto)) {
    const t = naoVazias(l);
    const n = t.length;
    if (n < 4 || !VALOR.test(t[n - 1]!) || !VALOR.test(t[n - 2]!) || !VALOR.test(t[n - 3]!)) continue;
    if (/^Total/i.test(t[0]!) || /registro/i.test(t[0]!)) continue;
    const forma = t.slice(0, n - 3).join(" ");
    out.push({ forma: normalizarForma(forma) ?? "OUTRO", creditos: num(t[n - 3])!, debitos: num(t[n - 2])!, saldo: num(t[n - 1])! });
  }
  return out;
}

/** Totais de "Total Geral" (consumo por data, contas a receber...): último valor da linha. */
export function lerTotalGeral(texto: string): number | null {
  let v: number | null = null;
  for (const l of linhasDe(texto)) {
    if (!/Total Geral/i.test(l)) continue;
    const vs = naoVazias(l).filter((c) => /^R\$/.test(c));
    if (vs.length) v = num(vs[vs.length - 1]);
  }
  return v;
}

/** "Contas a Receber": os lançamentos em aberto. */
export function lerContasAReceber(texto: string): { lancto: string; vencimento: string; valor: number; descricao: string }[] {
  const out: { lancto: string; vencimento: string; valor: number; descricao: string }[] = [];
  let venc = "";
  for (const l of linhasDe(texto)) {
    const t = naoVazias(l);
    if (t.length === 1 && DATA.test(t[0]!)) { venc = iso(t[0]!); continue; }
    if (t.length >= 4 && /^\d{4,7}$/.test(t[0]!) && DATA.test(t[1]!)) {
      const v = num([...t].reverse().find((c) => /^R\$/.test(c)));
      if (v !== null) out.push({ lancto: t[0]!, vencimento: venc, valor: v, descricao: t.slice(2, -1).join(" ") });
    }
  }
  return out;
}

/** "Relatório Diário (RDS)". */
export function lerRds(texto: string): { ocupados: number; livres: number; bloqueados: number; receitaDiaria: number; receitaConsumo: number } {
  const r = { ocupados: 0, livres: 0, bloqueados: 0, receitaDiaria: 0, receitaConsumo: 0 };
  for (const l of linhasDe(texto)) {
    const t = naoVazias(l);
    if (t[0] === "Ocupadas") r.ocupados = Number(t[1]);
    else if (t[0] === "Livres") r.livres = Number(t[1]);
    else if (t[0] === "Bloqueadas") r.bloqueados = Number(t[1]);
    else if (/^DI.RIA$/i.test(t[0] ?? "")) r.receitaDiaria = num(t[1]) ?? 0;
    else if (/^CONSUMO$/i.test(t[0] ?? "")) r.receitaConsumo = num(t[1]) ?? 0;
  }
  return r;
}

/** "Mapa de Ocupação Diário": reservas ocupando hoje, com situação de pagamento. */
export function lerMapaOcupacao(texto: string): { apto: string; reserva: string; pago: string }[] {
  const out: { apto: string; reserva: string; pago: string }[] = [];
  for (const l of linhasDe(texto)) {
    const t = naoVazias(l);
    const iCod = t.findIndex((c) => /^[A-Z]{2,4}\d{5,8}$/.test(c));
    if (iCod < 0 || !/^\d{2,4}$/.test(t[0]!)) continue;
    const pago = t.find((c, i) => i > iCod && /^(Sim|N.o|Parcial)$/i.test(c));
    out.push({ apto: t[0]!, reserva: t[iCod]!, pago: pago ?? "" });
  }
  return out;
}

/** "Relatório de Estoque Atual": produtos e saldos. */
export function lerEstoque(texto: string): { codigo: string; descricao: string; saldo: number }[] {
  const out: { codigo: string; descricao: string; saldo: number }[] = [];
  for (const l of linhasDe(texto)) {
    const t = naoVazias(l);
    const iUn = t.findIndex((c) => c === "UN");
    const base = iUn >= 0 ? iUn : t.length;
    const saldoTxt = t[base - 1];
    if (!saldoTxt || !/^-?\d{1,3}(\.\d{3})*$|^-?\d+$/.test(saldoTxt)) continue;
    if (/^Relat|^Data|^C.digo/i.test(t[0]!)) continue;
    const saldo = Number(saldoTxt.replace(/\./g, ""));
    const ehCodigo = /^\d{2}$/.test(t[0]!);
    out.push({ codigo: ehCodigo ? t[0]! : "", descricao: ehCodigo ? t.slice(1, base - 1).join(" ") : "(sem nome)", saldo });
  }
  return out;
}

// ------------------------------------------------------------------ dados de entrada

export interface Reserva {
  codigo: string; checkin: string; checkout: string; apto: string; situacao: string;
  hospedes: number; vrTotal: number; diariaLancada: number; consumo: number; recebido: number;
}
export interface Recebimento { codigo: string; dia: string; forma: string; valor: number; reserva: string; apto: string; pagador: string }
export interface CafeLinha { dia: string; apto: string; adultos: number; criancas: number; tipo: string }

export interface DadosConferencia {
  inicio: string; // AAAA-MM-DD
  fim: string;
  hoje: string;
  reservas: Reserva[];
  recebimentos: Recebimento[];
  receitasDespesas: ReturnType<typeof lerReceitasDespesas>;
  faturamentoDiario: ReturnType<typeof lerFaturamentoDiario>;
  faturamentoAnalitico: ReturnType<typeof lerFaturamentoAnalitico>;
  creditosDebitos: ReturnType<typeof lerCreditosDebitos>;
  contasAReceber: ReturnType<typeof lerContasAReceber>;
  consumoPorDataTotal: number | null;
  vendasItensVenda: number | null;
  rds: ReturnType<typeof lerRds> | null;
  mapa: ReturnType<typeof lerMapaOcupacao>;
  cafe: CafeLinha[];
  apartamentos: { numero: string; situacao: string }[];
  estoque: ReturnType<typeof lerEstoque>;
  /** Quais relatórios foram enviados. Ausente = todos (modo do script). */
  tem?: Partial<Record<Fonte, boolean>>;
}

/** Transforma as linhas lidas por `lerRelatorioReservasDataHotel` em reservas com valores em centavos. */
export function reservasDeLinhas(linhas: LinhaBruta[]): Reserva[] {
  return linhas.map((l) => ({
    codigo: l.codigo ?? "", checkin: iso(l.checkin ?? ""), checkout: iso(l.checkout ?? ""), apto: l.apartamento ?? "",
    situacao: l.situacao ?? "", hospedes: Number(l.n_hosp ?? 0) || 0, vrTotal: num(l.vr_total) ?? 0,
    diariaLancada: num(l.diarias_lancadas) ?? 0, consumo: num(l.consumos) ?? 0, recebido: num(l.valor_pago) ?? 0,
  }));
}
export function recebimentosDeLinhas(linhas: LinhaBruta[]): Recebimento[] {
  return linhas.map((l) => ({
    codigo: l.codigo ?? "", dia: iso(l.data ?? ""), forma: normalizarForma(l.forma ?? "") ?? "OUTRO",
    valor: num(l.valor) ?? 0, reserva: l.reserva ?? "", apto: l.apartamento ?? "", pagador: l.pagador ?? "",
  }));
}

// ------------------------------------------------------------------ regras

const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const TOL = 0; // centavos: o hotel trabalha com valor exato

function comparar(regra: string, titulo: string, entre: string, esperado: number, encontrado: number, detalhes: string[] = [], tolerancia = TOL): Resultado {
  const dif = encontrado - esperado;
  return {
    regra, titulo, entre, esperado, encontrado, diferenca: dif,
    situacao: Math.abs(dif) <= tolerancia ? "OK" : "DIVERGENTE",
    detalhes: Math.abs(dif) <= tolerancia ? detalhes : [`Diferença de ${brl(dif)}.`, ...detalhes],
  };
}

const noPeriodo = (d: DadosConferencia, dia: string) => dia >= d.inicio && dia <= d.fim;
const diasEntre = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

function conferirTudo(d: DadosConferencia): Resultado[] {
  const out: Resultado[] = [];

  // C1/C2 — o dinheiro que entrou: Contas Recebidas × Receitas x Despesas
  {
    const porDia = new Map<string, number>();
    for (const r of d.recebimentos) if (noPeriodo(d, r.dia)) porDia.set(r.dia, (porDia.get(r.dia) ?? 0) + r.valor);
    out.push(comparar("C1", "Total recebido no período", "Contas Recebidas × Receitas x Despesas (receitas)",
      soma(d.receitasDespesas.map((x) => x.receitas)), soma([...porDia.values()])));
    const erros: string[] = [];
    for (const x of d.receitasDespesas) {
      const v = porDia.get(x.dia) ?? 0;
      if (v !== x.receitas) erros.push(`${x.dia}: Receitas x Despesas ${brl(x.receitas)}, Contas Recebidas ${brl(v)} (dif. ${brl(v - x.receitas)}).`);
    }
    out.push({ regra: "C2", titulo: "Recebimentos dia a dia", entre: "Contas Recebidas × Receitas x Despesas",
      situacao: erros.length ? "DIVERGENTE" : "OK", detalhes: erros.length ? erros : [`${d.receitasDespesas.length} dia(s) conferidos, todos batem.`] });
  }

  // C3 — recebimentos por forma de pagamento × Créditos x Débitos (créditos que ficaram no saldo)
  {
    const porForma = new Map<string, number>();
    for (const r of d.recebimentos) if (noPeriodo(d, r.dia)) porForma.set(r.forma, (porForma.get(r.forma) ?? 0) + r.valor);
    const detalhes: string[] = [];
    let ok = true;
    for (const c of d.creditosDebitos) {
      // O que o caixa registrou entrou em "créditos"; o que foi fechado/transferido sai em "débitos".
      // O recebimento do período deve ser igual aos débitos fechados (ou ao crédito, se tudo foi fechado).
      const rec = porForma.get(c.forma) ?? 0;
      if (rec !== c.debitos && rec !== c.creditos) { ok = false; detalhes.push(`${c.forma}: recebido ${brl(rec)}; Créditos ${brl(c.creditos)}, Débitos ${brl(c.debitos)}, Saldo ${brl(c.saldo)}.`); }
    }
    out.push({ regra: "C3", titulo: "Recebido por forma de pagamento", entre: "Contas Recebidas × Créditos e Débitos por Forma",
      situacao: ok ? "OK" : "ATENCAO",
      detalhes: ok ? ["Todas as formas batem com créditos ou débitos."] : ["O livro-caixa abre antes do período (turno em andamento), então a diferença por forma pede conferência do turno:", ...detalhes] });
  }

  // C4 — competência: faturamento diário × faturamento analítico (por dia)
  {
    const analiticoPorDia = new Map<string, number>();
    for (const x of d.faturamentoAnalitico.diarias) analiticoPorDia.set(x.dia, (analiticoPorDia.get(x.dia) ?? 0) + x.valor);
    const erros: string[] = [];
    for (const f of d.faturamentoDiario) {
      const a = analiticoPorDia.get(f.dia) ?? 0;
      if (a !== f.diaria) erros.push(`${f.dia}: Resumo diário ${brl(f.diaria)}, Analítico ${brl(a)} (dif. ${brl(a - f.diaria)}).`);
    }
    out.push({ regra: "C4", titulo: "Diária por dia (competência)", entre: "Faturamento Diário × Faturamento Analítico",
      situacao: erros.length ? "DIVERGENTE" : "OK", esperado: soma(d.faturamentoDiario.map((x) => x.diaria)), encontrado: soma([...analiticoPorDia.values()]),
      diferenca: soma([...analiticoPorDia.values()]) - soma(d.faturamentoDiario.map((x) => x.diaria)),
      detalhes: erros.length ? erros : [`${d.faturamentoDiario.length} dia(s) conferidos, todos batem.`] });
  }

  // C5 — consumo: extrato das reservas × analítico × consumo por data
  {
    const doExtrato = soma(d.reservas.map((r) => r.consumo));
    if (d.faturamentoAnalitico.subConsumo !== null) {
      out.push(comparar("C5a", "Consumo lançado nas reservas", "Extrato das reservas × Faturamento Analítico (consumo)", d.faturamentoAnalitico.subConsumo, doExtrato));
    }
    if (d.consumoPorDataTotal !== null && d.faturamentoAnalitico.subConsumo !== null) {
      out.push(comparar("C5b", "Consumo no período", "Relatório de Consumo × Faturamento Analítico (consumo)", d.faturamentoAnalitico.subConsumo, d.consumoPorDataTotal));
    }
  }

  // C6 — venda de balcão: resumo diário × analítico × vendas por item (que soma consumo + balcão)
  {
    const resumoVenda = soma(d.faturamentoDiario.map((x) => x.venda));
    if (d.faturamentoAnalitico.subVendas !== null) {
      out.push(comparar("C6a", "Venda de balcão", "Faturamento Diário × Faturamento Analítico (vendas)", d.faturamentoAnalitico.subVendas, resumoVenda));
    }
    if (d.vendasItensVenda !== null && d.faturamentoAnalitico.subVendas !== null && d.faturamentoAnalitico.subConsumo !== null) {
      out.push(comparar("C6b", "Vendas por item (consumo + balcão)", "Vendas Itens × (Analítico: consumo + vendas)",
        d.faturamentoAnalitico.subConsumo + d.faturamentoAnalitico.subVendas, d.vendasItensVenda));
    }
  }

  // C7 — total do faturamento: resumo diário × analítico
  if (d.faturamentoAnalitico.total !== null) {
    out.push(comparar("C7", "Total faturado no período", "Faturamento Diário × Faturamento Analítico (total geral)",
      soma(d.faturamentoDiario.map((x) => x.total)), d.faturamentoAnalitico.total,
      ["O analítico pode ficar sem o dia de hoje; compare as linhas de C4 para achar o dia."]));
  }

  // C8 — a receber das empresas: faturado × contas a receber lançadas
  {
    const faturado = soma(d.recebimentos.filter((r) => r.forma === "FATURADO" && noPeriodo(d, r.dia)).map((r) => r.valor));
    const saldoFaturar = d.creditosDebitos.find((c) => c.forma === "FATURADO")?.saldo ?? 0;
    const aReceber = soma(d.contasAReceber.map((c) => c.valor));
    const r = comparar("C8", "Faturado para empresas × contas a receber", "Faturado (Contas Recebidas e Créditos x Débitos) × Contas a Receber",
      Math.max(faturado, saldoFaturar), aReceber,
      [`Faturado no período: ${brl(faturado)}. Saldo "Faturar empresa" no caixa: ${brl(saldoFaturar)}. Contas a receber lançadas: ${brl(aReceber)} em ${d.contasAReceber.length} título(s).`,
        "Faturado sem título a receber é dinheiro que ninguém está cobrando: lance as contas a receber das empresas."]);
    out.push(r);
  }

  // C9 — saldo de cada reserva: diária + consumo − recebido
  {
    const pendentes: string[] = [];
    const sobra: string[] = [];
    for (const r of d.reservas) {
      const devido = r.diariaLancada + r.consumo;
      const saldo = devido - r.recebido;
      if (r.situacao.toLowerCase().startsWith("checked-out") && saldo > 0) pendentes.push(`${r.codigo} (apto ${r.apto}): faltam ${brl(saldo)} (devido ${brl(devido)}, recebido ${brl(r.recebido)}).`);
      if (saldo < 0 && r.situacao.toLowerCase().startsWith("checked-out")) sobra.push(`${r.codigo} (apto ${r.apto}): recebido ${brl(-saldo)} a mais.`);
    }
    out.push({ regra: "C9a", titulo: "Hospedagens encerradas com saldo a receber", entre: "Extrato das reservas (diária + consumo × recebido)",
      situacao: pendentes.length ? "DIVERGENTE" : "OK", detalhes: pendentes.length ? pendentes : ["Nenhuma estadia encerrada com saldo em aberto."] });
    out.push({ regra: "C9b", titulo: "Hospedagens encerradas com recebimento a mais", entre: "Extrato das reservas (diária + consumo × recebido)",
      situacao: sobra.length ? "ATENCAO" : "OK", detalhes: sobra.length ? sobra : ["Nenhuma estadia com recebimento acima do devido."] });
  }

  // C10 — pagamento de hospedagem sem reserva identificável / reserva inexistente
  {
    const conhecidas = new Set(d.reservas.map((r) => r.codigo));
    const semReserva: string[] = [];
    for (const r of d.recebimentos) {
      if (r.reserva && !conhecidas.has(r.reserva)) semReserva.push(`Lançto ${r.codigo.replace(/^LR/, "")} (${r.dia}): reserva ${r.reserva} não está no relatório de reservas.`);
    }
    out.push({ regra: "C10", titulo: "Recebimentos de reserva desconhecida", entre: "Contas Recebidas × Relatório de Reservas",
      situacao: semReserva.length ? "ATENCAO" : "OK",
      detalhes: semReserva.length ? semReserva : ["Todo recebimento com código de reserva aponta para uma reserva conhecida."] });
  }

  // C11 — café: hóspedes presentes por dia (reservas) × lista de café do DataHotel
  {
    const erros: string[] = [];
    const dias = [...new Set(d.cafe.filter((c) => c.tipo !== "ANTECIPADO").map((c) => c.dia))].sort();
    for (const dia of dias) {
      const lista = soma(d.cafe.filter((c) => c.dia === dia && c.tipo !== "ANTECIPADO").map((c) => c.adultos + c.criancas));
      const presentes = soma(d.reservas.filter((r) => !r.situacao.toLowerCase().startsWith("cancel") && r.checkin < dia && r.checkout >= dia).map((r) => r.hospedes));
      if (lista !== presentes) erros.push(`${dia}: lista de café ${lista} pessoa(s), reservas com hóspedes ${presentes}.`);
    }
    out.push({ regra: "C11", titulo: "Café da manhã × hóspedes das reservas", entre: "Lista de Café × Relatório de Reservas (Nº Hósp.)",
      situacao: erros.length ? "ATENCAO" : "OK",
      detalhes: erros.length ? ["Conta quem dormiu na noite anterior (inclui quem sai no dia). Diferença pode ser quem não tomou café ou hóspede extra; a recepção confere:", ...erros] : [`${dias.length} dia(s) conferidos, todos batem.`] });
  }

  // C12 — ocupação de hoje: RDS × Mapa de Ocupação × reservas
  if (d.rds) {
    const hoje = d.hoje;
    const ocupadasReservas = new Set(d.reservas.filter((r) => r.situacao.toLowerCase().startsWith("checked-in") && r.checkin <= hoje && r.checkout >= hoje).map((r) => r.apto)).size;
    const detalhes = [`RDS: ${d.rds.ocupados} ocupado(s). Mapa de Ocupação: ${d.mapa.length}. Reservas em Checked-in hoje: ${ocupadasReservas}.`];
    const iguais = d.rds.ocupados === d.mapa.length && d.rds.ocupados === ocupadasReservas;
    out.push({ regra: "C12", titulo: "Ocupação de hoje", entre: "RDS × Mapa de Ocupação × Relatório de Reservas",
      situacao: iguais ? "OK" : "DIVERGENTE", unidade: "un", esperado: d.rds.ocupados, encontrado: d.mapa.length, diferenca: d.mapa.length - d.rds.ocupados, detalhes });
    // pagamento dos ocupados hoje
    const naoPagos = d.mapa.filter((m) => /^n/i.test(m.pago) || /parcial/i.test(m.pago));
    out.push({ regra: "C12b", titulo: "Hóspedes em casa com pagamento pendente", entre: "Mapa de Ocupação",
      situacao: naoPagos.length ? "ATENCAO" : "OK",
      detalhes: naoPagos.length ? naoPagos.map((m) => `Apto ${m.apto} (${m.reserva}): pago = ${m.pago}.`) : ["Todos pagos."] });
  }

  // C13 — apartamentos: cadastro × RDS
  if (d.rds && d.apartamentos.length) {
    const total = d.apartamentos.length;
    const bloq = d.apartamentos.filter((a) => /bloq/i.test(a.situacao)).length;
    const rdsTotal = d.rds.ocupados + d.rds.livres + d.rds.bloqueados;
    out.push({ regra: "C13", titulo: "Apartamentos: cadastro × RDS", entre: "Lista de Camareira × RDS",
      situacao: total === rdsTotal && bloq === d.rds.bloqueados ? "OK" : "DIVERGENTE", esperado: rdsTotal, encontrado: total,
      unidade: "un", diferenca: total - rdsTotal, detalhes: [`Camareira: ${total} apartamentos, ${bloq} bloqueado(s). RDS: ${rdsTotal} apartamentos, ${d.rds.bloqueados} bloqueado(s).`] });
  }

  // C14 — estoque negativo
  {
    const neg = d.estoque.filter((e) => e.saldo < 0);
    out.push({ regra: "C14", titulo: "Estoque com saldo negativo", entre: "Relatório de Estoque Atual",
      situacao: neg.length ? "ATENCAO" : "OK",
      detalhes: neg.length ? neg.map((e) => `${e.codigo || "(sem código)"} ${e.descricao}: ${e.saldo}.`) : ["Nenhum saldo negativo."] });
  }

  // C15 — hospedagens sem diária lançada ou noites faltando no analítico
  {
    const erros: string[] = [];
    for (const r of d.reservas) {
      if (r.situacao.toLowerCase().startsWith("cancel")) continue;
      const noites = diasEntre(r.checkin, r.checkout);
      if (noites <= 0) continue;
      const lancadas = d.faturamentoAnalitico.diarias.filter((x) => x.reserva === r.codigo);
      const noitesNoPeriodo = Array.from({ length: noites }, (_, i) => new Date(Date.parse(r.checkin) + i * 86_400_000).toISOString().slice(0, 10)).filter((dia) => noPeriodo(d, dia) && dia < d.hoje);
      const faltam = noitesNoPeriodo.filter((dia) => !lancadas.some((x) => x.dia === dia));
      if (faltam.length) erros.push(`${r.codigo} (apto ${r.apto}): sem diária lançada em ${faltam.join(", ")}.`);
    }
    out.push({ regra: "C15", titulo: "Noites sem diária lançada", entre: "Relatório de Reservas × Faturamento Analítico",
      situacao: erros.length ? "DIVERGENTE" : "OK", detalhes: erros.length ? erros : ["Toda noite do período tem diária lançada."] });
  }

  return out;
}

/** Cada fonte (relatório do DataHotel) que uma regra precisa. */
export type Fonte =
  | "reservas" | "recebidas" | "receitas" | "fatDiario" | "analitico" | "creditos" | "aReceber"
  | "consumo" | "vendas" | "rds" | "mapa" | "cafe" | "camareira" | "estoque";

export const NOME_FONTE: Record<Fonte, string> = {
  reservas: "Relatório de Reservas (com extrato)", recebidas: "Relatório de Contas Recebidas",
  receitas: "Receitas x Despesas", fatDiario: "Resumo de Faturamento Diário", analitico: "Relatório de Faturamento Analítico",
  creditos: "Créditos e Débitos por Forma de Pgto.", aReceber: "Relatório de Contas a Receber",
  consumo: "Relatório de Consumo", vendas: "Relatório de Vendas Itens", rds: "Relatório Diário (RDS)",
  mapa: "Mapa de Ocupação Diário", cafe: "Lista de Café da Manhã", camareira: "Lista de Camareira", estoque: "Relatório de Estoque Atual",
};

const DEPENDE: Record<string, Fonte[]> = {
  C1: ["recebidas", "receitas"], C2: ["recebidas", "receitas"], C3: ["recebidas", "creditos"],
  C4: ["fatDiario", "analitico"], C5a: ["reservas", "analitico"], C5b: ["consumo", "analitico"],
  C6a: ["fatDiario", "analitico"], C6b: ["vendas", "analitico"], C7: ["fatDiario", "analitico"],
  C8: ["recebidas", "creditos", "aReceber"], C9a: ["reservas"], C9b: ["reservas"], C10: ["recebidas", "reservas"],
  C11: ["cafe", "reservas"], C12: ["rds", "mapa", "reservas"], C12b: ["mapa"], C13: ["rds", "camareira"],
  C14: ["estoque"], C15: ["reservas", "analitico"],
};

/**
 * Roda as regras. Se `d.tem` diz que um relatório não foi enviado, as regras que
 * dependem dele não rodam (em vez de acusar divergência falsa) e uma regra C0
 * lista o que faltou.
 */
export function conferir(d: DadosConferencia): Resultado[] {
  const todas = conferirTudo(d);
  if (!d.tem) return todas;
  const falta = (f: Fonte) => d.tem![f] === false;
  const rodaram = todas.filter((r) => !(DEPENDE[r.regra] ?? []).some(falta));
  const pulados = todas.length - rodaram.length;
  const faltando = (Object.keys(NOME_FONTE) as Fonte[]).filter(falta);
  if (!faltando.length) return rodaram;
  return [{
    regra: "C0", titulo: "Relatórios que não foram enviados", entre: "Arquivos desta conferência", situacao: "ATENCAO",
    detalhes: [`${pulados} regra(s) não rodaram por falta de: ${faltando.map((f) => NOME_FONTE[f]).join("; ")}.`],
  }, ...rodaram];
}

export function resumo(rs: Resultado[]): { ok: number; divergentes: number; atencao: number } {
  return {
    ok: rs.filter((r) => r.situacao === "OK").length,
    divergentes: rs.filter((r) => r.situacao === "DIVERGENTE").length,
    atencao: rs.filter((r) => r.situacao === "ATENCAO").length,
  };
}
