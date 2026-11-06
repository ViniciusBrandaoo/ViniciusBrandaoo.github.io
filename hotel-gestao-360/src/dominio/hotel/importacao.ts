/**
 * Importação de relatórios do DataHotel — regras puras (sem banco).
 *
 * O servidor usa este módulo para ler o arquivo, validar e classificar cada
 * linha antes de gravar. Nada aqui grava: a decisão de confirmar é do usuário.
 *
 * Os nomes de coluna ainda são apelidos prováveis: o layout real do DataHotel
 * depende das amostras exportadas (docs/ETAPA-1-DESCOBERTA.md, seção 2).
 * Quando elas chegarem, só `LAYOUTS` muda.
 */
import { createHash } from "node:crypto";

export type TipoImportacao = "hospedagens" | "recebimentos" | "cafe" | "apartamentos";
export type TipoCampo = "texto" | "data" | "valor" | "inteiro" | "booleano" | "forma";
export type Forma = "DINHEIRO" | "DEBITO" | "CREDITO" | "PIX" | "BOLETO" | "FATURADO" | "OUTRO";

export interface CampoLayout {
  de: string[];
  tipo?: TipoCampo;
  obrigatorio?: boolean;
}

export interface Layout {
  tipo: TipoImportacao;
  nome: string;
  /** Versão do mapeamento. Mude quando o mapeamento mudar. */
  versao: string;
  codigo: string[];
  campos: Record<string, CampoLayout>;
}

export const LAYOUTS: Record<TipoImportacao, Layout> = {
  hospedagens: {
    tipo: "hospedagens",
    nome: "Hospedagens / reservas",
    versao: "datahotel-2023.07-reservas-1",
    codigo: ["codigo", "reserva", "id_reserva", "localizador"],
    campos: {
      hospede: { de: ["hospede", "nome", "nome_hospede"], obrigatorio: true },
      apartamento: { de: ["apartamento", "apto", "uh", "quarto"], obrigatorio: true },
      checkin: { de: ["checkin", "check_in", "entrada", "data_entrada"], tipo: "data", obrigatorio: true },
      checkoutPrevisto: { de: ["checkout", "check_out", "saida", "data_saida", "checkout_previsto"], tipo: "data", obrigatorio: true },
      checkoutReal: { de: ["checkout_realizado", "saida_realizada"], tipo: "data" },
      adultos: { de: ["adultos", "qtd_adultos"], tipo: "inteiro" },
      criancas: { de: ["criancas", "qtd_criancas", "chd"], tipo: "inteiro" },
      hospedes: { de: ["n_hosp", "hospedes_qtd", "qtd_hospedes", "pax"], tipo: "inteiro" },
      diarias: { de: ["n_diarias", "diarias_qtd", "qtd_diarias"], tipo: "inteiro" },
      valorTotal: { de: ["vr_total", "valor_total"], tipo: "valor" },
      diariasLancadas: { de: ["diarias_lancadas"], tipo: "valor" },
      canalVenda: { de: ["canal_de_venda", "canal"] },
      funcionario: { de: ["funcionario"] },
      valorDiaria: { de: ["valor_diaria", "diaria", "tarifa"], tipo: "valor" },
      consumos: { de: ["consumos", "extras", "valor_consumos"], tipo: "valor" },
      descontos: { de: ["descontos", "desconto"], tipo: "valor" },
      valorPago: { de: ["valor_pago", "pago"], tipo: "valor" },
      formaPagamento: { de: ["forma_pagamento", "pagamento", "forma"], tipo: "forma" },
      empresa: { de: ["empresa", "empresa_pagadora"] },
      cafeIncluido: { de: ["cafe", "cafe_incluido", "cafe_da_manha"], tipo: "booleano" },
      situacaoOrigem: { de: ["status", "situacao"] },
    },
  },
  recebimentos: {
    tipo: "recebimentos",
    nome: "Pagamentos / recebimentos",
    versao: "provisorio-1",
    codigo: ["codigo", "id", "id_pagamento", "documento"],
    campos: {
      data: { de: ["data", "data_operacao", "data_pagamento"], tipo: "data", obrigatorio: true },
      descricao: { de: ["descricao", "historico"] },
      pagador: { de: ["pagador", "hospede", "empresa", "cliente"] },
      apartamento: { de: ["apartamento", "apto", "uh", "referencia"] },
      reserva: { de: ["reserva", "localizador", "codigo_reserva"] },
      forma: { de: ["forma", "forma_pagamento", "modalidade"], tipo: "forma", obrigatorio: true },
      bruto: { de: ["valor", "valor_bruto"], tipo: "valor", obrigatorio: true },
      desconto: { de: ["desconto"], tipo: "valor" },
      taxa: { de: ["taxa", "taxa_financeira"], tipo: "valor" },
      codigoTransacao: { de: ["nsu", "codigo_transacao", "autorizacao"] },
      bandeira: { de: ["bandeira"] },
      operadora: { de: ["operadora", "adquirente"] },
      parcelas: { de: ["parcelas", "parcelamento"], tipo: "inteiro" },
    },
  },
  cafe: {
    tipo: "cafe",
    nome: "Lista de café da manhã",
    versao: "datahotel-2023.07-cafe-1",
    codigo: ["codigo"],
    campos: {
      data: { de: ["data"], tipo: "data", obrigatorio: true },
      apartamento: { de: ["apartamento", "apto"], obrigatorio: true },
      hospede: { de: ["hospede"], obrigatorio: true },
      adultos: { de: ["adultos"], tipo: "inteiro", obrigatorio: true },
      criancas: { de: ["criancas"], tipo: "inteiro" },
      tipo: { de: ["tipo"] },
    },
  },
  apartamentos: {
    tipo: "apartamentos",
    nome: "Apartamentos (Lista de Camareira)",
    versao: "datahotel-2023.07-camareira-1",
    codigo: ["codigo"],
    campos: {
      numero: { de: ["apartamento", "apto"], obrigatorio: true },
      situacaoOrigem: { de: ["situacao"], obrigatorio: true },
    },
  },
};

export type LinhaBruta = Record<string, string>;
export type Registro = Record<string, string | number | boolean | null>;

// ------------------------------------------------------------------ leitura

export function sha256(buffer: Buffer | Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** "Data Entrada" → "data_entrada"; "Crianças" → "criancas". */
export function normalizarCabecalho(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** CSV com `;` ou `,`, aspas e cabeçalho na primeira linha. */
export function lerCsv(texto: string): { colunas: string[]; linhas: LinhaBruta[] } {
  const brutas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const primeira = brutas[0];
  if (primeira === undefined) return { colunas: [], linhas: [] };
  const sep = primeira.split(";").length >= primeira.split(",").length ? ";" : ",";
  const quebrar = (l: string): string[] => {
    const out: string[] = [];
    let atual = "";
    let aspas = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') {
        if (aspas && l[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas;
      } else if (ch === sep && !aspas) { out.push(atual); atual = ""; } else atual += ch;
    }
    out.push(atual);
    return out.map((s) => s.trim());
  };
  const colunas = quebrar(primeira).map(normalizarCabecalho);
  const linhas = brutas.slice(1).map((l) => {
    const v = quebrar(l);
    const o: LinhaBruta = {};
    colunas.forEach((c, i) => { if (c) o[c] = v[i] ?? ""; });
    return o;
  });
  return { colunas, linhas };
}

/** Totais do rodapé do relatório, para conferir a leitura. */
export interface Conferencia {
  registros: number;
  totalCentavos: number | null;
  /** Linhas vistas no arquivo (inclusive as descartadas pelo corte de data). Padrão: as linhas lidas. */
  vistas?: number;
}

const COD_RESERVA = /^[A-Z]{2,4}\d{5,8}$/;
const DATA_BR = /^\d{2}\/\d{2}\/\d{4}$/;

/**
 * "Relatório de Reservas" do DataHotel (Hospedagem → Relatório de Reservas →
 * Pré-Visualizar → Salvar → Ficheiro CSV). O CSV sai com o desenho da página:
 * título, filtros, cabeçalho repetido e rodapé por página, e as colunas mudam
 * de posição de uma página para outra. Por isso a leitura é pelo conteúdo:
 * cada reserva é a linha que começa com o código (ex.: ABC123456) seguido de
 * duas datas; os demais campos vêm na ordem do relatório.
 *
 * Devolve null se o texto não for esse relatório.
 */
export function lerRelatorioReservasDataHotel(texto: string): { colunas: string[]; linhas: LinhaBruta[]; conferencia: Conferencia | null } | null {
  if (!/Relat.rio de Reservas/i.test(texto) || !/C.d\. Res\./.test(texto)) return null;
  const colunas = ["codigo", "checkin", "checkout", "hospede", "apartamento", "n_diarias", "n_hosp", "canal_de_venda", "funcionario", "situacao", "vr_total"];
  const linhas: LinhaBruta[] = [];
  let conferencia: Conferencia | null = null;
  // Extrato ("Exibir extrato resumido"): abaixo de cada reserva vêm linhas DIÁRIA, CONSUMO e RECEBIMENTO.
  const extrato = new Map<LinhaBruta, { diaria: number; consumo: number; recebido: number }>();
  let atual: LinhaBruta | null = null;
  for (const bruta of texto.replace(/^﻿/, "").split(/\r?\n/)) {
    const campos = bruta.split(";").map((s) => s.trim());
    const lancamento = /^(DI.RIA|CONSUMO|RECEBIMENTO)$/i.exec(campos.find((c) => c !== "") ?? "");
    if (lancamento && atual) {
      const v = lerValor(campos.filter((c) => /^R\$/.test(c)).pop() ?? "");
      const acc = extrato.get(atual) ?? { diaria: 0, consumo: 0, recebido: 0 };
      if (typeof v === "number" && !Number.isNaN(v)) {
        const tipo = lancamento[1]!.toUpperCase();
        if (tipo === "CONSUMO") acc.consumo += v; else if (tipo === "RECEBIMENTO") acc.recebido += v; else acc.diaria += v;
      }
      extrato.set(atual, acc);
      continue;
    }
    const rodape = /(\d+)\s+registro\(s\)/.exec(bruta);
    if (rodape) {
      const valor = campos.filter((c) => /^R\$/.test(c)).pop();
      const total = valor ? lerValor(valor) : null;
      conferencia = { registros: Number(rodape[1]), totalCentavos: typeof total === "number" && !Number.isNaN(total) ? total : null };
      // Depois do rodapé vem um resumo de totais por tipo: não pertence a nenhuma reserva.
      atual = null;
      continue;
    }
    const t = campos.filter((c) => c !== "");
    if (t.length < 7 || !COD_RESERVA.test(t[0]!) || !DATA_BR.test(t[1]!) || !DATA_BR.test(t[2]!)) continue;
    // código, check-in, check-out, hóspede, apto, diárias, hóspedes, canal, [funcionário], situação, valor
    const valor = /^R\$/.test(t[t.length - 1]!) ? t[t.length - 1]! : "";
    const fim = valor ? t.length - 1 : t.length;
    const situacao = fim - 1 > 7 ? t[fim - 1]! : "";
    const funcionario = fim - 2 > 7 ? t.slice(8, fim - 1).join(" ") : "";
    atual = {
      codigo: t[0]!, checkin: t[1]!, checkout: t[2]!, hospede: t[3] ?? "", apartamento: t[4] ?? "",
      n_diarias: t[5] ?? "", n_hosp: t[6] ?? "", canal_de_venda: t[7] ?? "", funcionario,
      situacao, vr_total: valor,
    };
    linhas.push(atual);
  }
  if (extrato.size) {
    // Com extrato, o que não aparece vale zero (não é "não informado").
    const brl = (c: number) => (c / 100).toFixed(2).replace(".", ",");
    for (const l of linhas) {
      const e = extrato.get(l) ?? { diaria: 0, consumo: 0, recebido: 0 };
      l.diarias_lancadas = brl(e.diaria); l.consumos = brl(e.consumo); l.valor_pago = brl(e.recebido);
    }
    colunas.push("diarias_lancadas", "consumos", "valor_pago");
  }
  return { colunas, linhas, conferencia };
}

const FORMA_CAIXA = /^(DINHEIRO|CART.O DE CR.DITO|CART.O DE D.BITO|PIX.*|FATURAR.*|FURO.*)$/i;

/**
 * "Resumo por Movimentação de Caixa" do DataHotel (Financeiro → Resumo de
 * Movimentação por Caixa). Para cada sessão de caixa traz o livro-caixa:
 * data, descrição, forma, valor e C (entrada) ou D (saída/fechamento).
 * Viram recebimentos só as entradas C de pagamento (venda balcão, pagamento
 * de estadia, check-out). Ficam de fora: o fundo de caixa (saldo inicial) e as
 * saídas D (sangria e fechamento do caixa).
 *
 * `desde` (AAAA-MM-DD) descarta o que for mais antigo: uma sessão de caixa
 * pode começar antes do período pedido. O rodapé de cada sessão ("N
 * registro(s)") confere com as linhas vistas, descartadas ou não.
 */
export function lerMovimentoCaixaDataHotel(texto: string, desde?: string | null): {
  colunas: string[]; linhas: LinhaBruta[]; conferencia: Conferencia | null;
  ignoradas: { fundo: number; saidas: number; antigas: number };
} | null {
  if (!/Resumo por Movimenta..o de Caixa/i.test(texto)) return null;
  const colunas = ["codigo", "data", "descricao", "pagador", "apartamento", "reserva", "forma", "valor"];
  const linhas: LinhaBruta[] = [];
  const ignoradas = { fundo: 0, saidas: 0, antigas: 0 };
  const ordinais = new Map<string, number>();
  let caixa = "";
  let vistasSessao = 0;
  let registros = 0;
  let vistas = 0;
  let achouRodape = false;
  let esperaRodape = false;
  const fecharSessao = () => { vistas += vistasSessao; vistasSessao = 0; esperaRodape = false; };
  for (const bruta of texto.replace(/^﻿/, "").split(/\r?\n/)) {
    const cx = /^Caixa:\s*(\d+)/.exec(bruta.trim());
    if (cx) { fecharSessao(); caixa = cx[1]!; esperaRodape = true; continue; }
    const t = bruta.split(";").map((s) => s.trim()).filter((c) => c !== "");
    const rodape = /^(\d+)\s+registro\(s\)$/.exec(t[0] ?? "");
    // O rodapé do livro-caixa é o primeiro "N registro(s)" sozinho na linha depois das datas.
    if (rodape && t.length === 1 && vistasSessao > 0 && esperaRodape) {
      registros += Number(rodape[1]); esperaRodape = false; achouRodape = true; continue;
    }
    if (!t.length || !DATA_BR.test(t[0]!)) continue;
    const sentido = t[t.length - 1];
    const valorTxt = t.find((c) => /^R\$/.test(c));
    const forma = t.find((c) => FORMA_CAIXA.test(c));
    if ((sentido !== "C" && sentido !== "D") || !valorTxt || !forma) continue;
    vistasSessao++;
    const descricao = t.slice(1).filter((c) => c !== forma && c !== valorTxt && c !== sentido).join(" ").replace(/\s+/g, " ").trim();
    if (sentido === "D") { ignoradas.saidas++; continue; }
    if (/SALDO DE CAIXA|FUNDO DE CAIXA/i.test(descricao)) { ignoradas.fundo++; continue; }
    const data = lerData(t[0]!);
    if (typeof data !== "string") continue;
    if (desde && data < desde) { ignoradas.antigas++; continue; }
    const valor = lerValor(valorTxt);
    if (typeof valor !== "number" || Number.isNaN(valor)) continue;
    const uh = /\bUH\s*(\d+)\s*(.*)$/i.exec(descricao);
    const reserva = /COD\.?\s*RESERVA:?\s*([A-Z0-9]+)/i.exec(descricao);
    // Sem número único no relatório: caixa + data + forma + valor + descrição + ordem entre iguais.
    const base = `${caixa}-${data.replace(/-/g, "")}-${normalizarForma(forma)}-${valor}-${sha256(Buffer.from(descricao)).slice(0, 8)}`;
    const n = (ordinais.get(base) ?? 0) + 1;
    ordinais.set(base, n);
    linhas.push({
      codigo: `CX${base}-${n}`, data: t[0]!, descricao, pagador: uh?.[2]?.trim() ?? "", apartamento: uh?.[1] ?? "",
      reserva: reserva?.[1] ?? "", forma, valor: valorTxt,
    });
  }
  fecharSessao();
  return { colunas, linhas, conferencia: achouRodape ? { registros, totalCentavos: null, vistas } : null, ignoradas };
}

/**
 * "Lista de Café da Manhã" do DataHotel (Hospedagem → Lista de Café da Manhã).
 * Para cada dia: os apartamentos com hóspede, adultos e crianças. Depois da
 * lista principal vem a seção "Check-in Antecipado" (os mesmos dias, outros
 * hóspedes). O rodapé "Total de Hóspedes" soma as duas seções, e é com ele que
 * a leitura é conferida.
 *
 * Linhas: `tipo` = LISTA ou ANTECIPADO. A previsão de café do sistema usa só
 * a LISTA; o antecipado fica guardado à parte para não contar duas vezes quem
 * aparece nas duas.
 */
export function lerListaCafeDataHotel(texto: string, desde?: string | null): {
  colunas: string[]; linhas: LinhaBruta[]; erro: string | null; ignoradas: { antigas: number };
} | null {
  if (!/Lista de Caf. da Manh./i.test(texto) || !/Total de H.spedes/i.test(texto)) return null;
  const colunas = ["codigo", "data", "apartamento", "hospede", "adultos", "criancas", "tipo"];
  const linhas: LinhaBruta[] = [];
  const ignoradas = { antigas: 0 };
  let data = "";
  let secao: "LISTA" | "ANTECIPADO" = "LISTA";
  let adultos = 0, criancas = 0;
  let totalAdultos: number | null = null, totalCriancas: number | null = null;
  const vistos = new Set<string>();
  for (const bruta of texto.replace(/^﻿/, "").split(/\r?\n/)) {
    const t = bruta.split(";").map((s) => s.trim()).filter((c) => c !== "");
    if (!t.length) continue;
    if (/^Total de H.spedes/i.test(t[0]!)) {
      const n = t.slice(1).map(Number);
      if (n.length >= 2 && n.every((x) => Number.isInteger(x))) { totalAdultos = n[0]!; totalCriancas = n[1]!; }
      continue;
    }
    if (t.length === 1 && DATA_BR.test(t[0]!)) { data = t[0]!; continue; }
    if (t.length === 1 && /^Check-in Antecipado$/i.test(t[0]!)) { secao = "ANTECIPADO"; continue; }
    const n = t.length;
    if (!data || n < 4 || !/^\d{2,4}$/.test(t[0]!) || !/^\d+$/.test(t[n - 1]!) || !/^\d+$/.test(t[n - 2]!)) continue;
    const hospede = t.slice(1, n - 2).join(" ").replace(/\s+/g, " ").trim();
    const a = Number(t[n - 2]), c = Number(t[n - 1]);
    adultos += a; criancas += c;
    const iso = lerData(data);
    if (typeof iso !== "string") continue;
    if (desde && iso < desde) { ignoradas.antigas++; continue; }
    const base = `CAFE-${iso.replace(/-/g, "")}-${t[0]}-${secao}-${sha256(Buffer.from(hospede)).slice(0, 8)}`;
    if (vistos.has(base)) continue; // o mesmo hóspede repetido na quebra de página
    vistos.add(base);
    linhas.push({ codigo: base, data, apartamento: t[0]!, hospede, adultos: String(a), criancas: String(c), tipo: secao });
  }
  let erro: string | null = null;
  if (totalAdultos !== null && (adultos !== totalAdultos || criancas !== totalCriancas)) {
    erro = `O relatório diz ${totalAdultos} adulto(s) e ${totalCriancas} criança(s), mas foram lidos ${adultos} e ${criancas}. Nada foi importado; exporte de novo ou avise o suporte.`;
  }
  return { colunas, linhas, erro, ignoradas };
}

/**
 * "Lista de Camareira" do DataHotel (Governança → Lista de Camareira): todos
 * os apartamentos do hotel com a situação do dia (Livre, Ocupado, Reservado,
 * Bloqueado, Governança). Serve de cadastro de apartamentos: o bloqueado sai
 * do denominador da taxa de ocupação.
 */
export function lerApartamentosCamareiraDataHotel(texto: string): {
  colunas: string[]; linhas: LinhaBruta[]; erro: string | null;
} | null {
  if (!/Lista de Camareira/i.test(texto)) return null;
  const colunas = ["codigo", "apartamento", "situacao"];
  const linhas: LinhaBruta[] = [];
  const vistos = new Set<string>();
  for (const bruta of texto.replace(/^﻿/, "").split(/\r?\n/)) {
    const t = bruta.split(";").map((s) => s.trim()).filter((c) => c !== "");
    if (t.length < 2 || !/^\d{2,4}$/.test(t[0]!)) continue;
    const situacao = t.find((c, i) => i > 0 && /^(Livre|Ocupado|Reservado|Reserva|Bloqueado|Governan.a|Manuten..o)$/i.test(c));
    if (!situacao) continue;
    if (vistos.has(t[0]!)) continue;
    vistos.add(t[0]!);
    linhas.push({ codigo: `APTO-${t[0]}`, apartamento: t[0]!, situacao });
  }
  return { colunas, linhas, erro: linhas.length ? null : "Nenhum apartamento encontrado na Lista de Camareira." };
}

/** Confere o que foi lido contra o rodapé do relatório. Null = confere. */
export function conferirTotais(linhas: LinhaBruta[], c: Conferencia | null): string | null {
  if (!c) return null;
  const vistas = c.vistas ?? linhas.length;
  if (vistas !== c.registros) {
    return `O relatório diz ${c.registros} registro(s), mas foram lidas ${vistas} linha(s). Nada foi importado; exporte de novo ou avise o suporte.`;
  }
  // Com corte de data o total do rodapé inclui linhas descartadas: só a contagem confere.
  if (c.totalCentavos !== null && vistas === linhas.length) {
    const soma = linhas.reduce((s, l) => s + (Number(lerValor(l.vr_total ?? l.valor ?? "")) || 0), 0);
    if (soma !== c.totalCentavos) {
      const brl = (v: number) => (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      return `A soma lida (${brl(soma)}) não bate com o total do relatório (${brl(c.totalCentavos)}). Nada foi importado.`;
    }
  }
  return null;
}

/**
 * "Relatório de Contas Recebidas" do DataHotel (Financeiro → Relatório de
 * Contas Recebidas). Cada recebimento tem o número do lançamento (Lançto),
 * que é a chave única contra duplicidade, e o rodapé traz "N registro(s)" e
 * o "Total Geral" para conferir a leitura. Por ter número próprio, é a fonte
 * preferida de recebimentos (o livro-caixa não tem).
 */
export function lerContasRecebidasDataHotel(texto: string, desde?: string | null): { colunas: string[]; linhas: LinhaBruta[]; conferencia: Conferencia | null; ignoradas: { antigas: number } } | null {
  if (!/Contas Recebidas por/i.test(texto) || !/Lan.to/.test(texto)) return null;
  const colunas = ["codigo", "data", "descricao", "pagador", "apartamento", "reserva", "forma", "valor"];
  const linhas: LinhaBruta[] = [];
  const ignoradas = { antigas: 0 };
  let conferencia: Conferencia | null = null;
  let vistas = 0;
  for (const bruta of texto.replace(/^﻿/, "").split(/\r?\n/)) {
    const t = bruta.split(";").map((s) => s.trim()).filter((c) => c !== "");
    if (/Total Geral/i.test(bruta)) {
      const reg = /(\d+)\s+registro\(s\)/.exec(bruta);
      const total = lerValor(t.filter((c) => /^R\$/.test(c)).pop() ?? "");
      if (reg) conferencia = { registros: Number(reg[1]), totalCentavos: typeof total === "number" && !Number.isNaN(total) ? total : null, vistas: 0 };
      continue;
    }
    if (t.length < 7 || !/^\d{4,7}$/.test(t[0]!) || !DATA_BR.test(t[1]!)) continue;
    const valorTxt = [...t].reverse().find((c) => /^R\$/.test(c));
    const forma = t.find((c) => FORMA_CAIXA.test(c));
    const datas = t.filter((c) => DATA_BR.test(c));
    if (!valorTxt || !forma || datas.length < 2) continue;
    vistas++;
    // datas: emissão, data de pagamento, vencimento (nesta ordem na linha)
    const dataPgto = datas[1]!;
    const iForma = t.indexOf(forma);
    const descricao = t.slice(2, iForma).join(" ").replace(/\s+/g, " ").trim();
    const data = lerData(dataPgto);
    if (typeof data !== "string") continue;
    if (desde && data < desde) { ignoradas.antigas++; continue; }
    const uh = /\bUH\s*(\d+)\s*(.*)$/i.exec(descricao);
    const reserva = /(?:COD\.?\s*RESERVA:?|HOSPEDAGEM:?)\s*([A-Z]{2,4}\d{5,8})/i.exec(descricao);
    linhas.push({
      codigo: `LR${t[0]}`, data: dataPgto, descricao, pagador: uh?.[2]?.trim() ?? "", apartamento: uh?.[1] ?? "",
      reserva: reserva?.[1] ?? "", forma, valor: valorTxt,
    });
  }
  if (conferencia) conferencia.vistas = vistas;
  return { colunas, linhas, conferencia, ignoradas };
}

/** Primeira aba do .xlsx; cabeçalho na primeira linha não vazia. */
export async function lerXlsx(buffer: Buffer): Promise<{ colunas: string[]; linhas: LinhaBruta[] }> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  // exceljs tipa `load` com o Buffer antigo do Node; o conteúdo é o mesmo.
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const aba = wb.worksheets[0];
  if (!aba) return { colunas: [], linhas: [] };
  const texto = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "object") {
      const o = v as { text?: unknown; result?: unknown; richText?: Array<{ text: string }> };
      if (o.richText) return o.richText.map((r) => r.text).join("");
      if (o.result !== undefined) return texto(o.result);
      if (o.text !== undefined) return String(o.text);
    }
    return String(v).trim();
  };
  const matriz: string[][] = [];
  aba.eachRow({ includeEmpty: false }, (row) => {
    const valores = Array.isArray(row.values) ? row.values.slice(1) : [];
    matriz.push(valores.map(texto));
  });
  const [cab, ...resto] = matriz;
  if (!cab) return { colunas: [], linhas: [] };
  const colunas = cab.map(normalizarCabecalho);
  const linhas = resto
    .filter((r) => r.some((c) => c !== ""))
    .map((r) => {
      const o: LinhaBruta = {};
      colunas.forEach((c, i) => { if (c) o[c] = r[i] ?? ""; });
      return o;
    });
  return { colunas, linhas };
}

// ------------------------------------------------------------------ conversão

/** "1.234,56" / "1234.56" / "R$ 10" → centavos. Vazio → null. Inválido → NaN. */
export function lerValor(s: string): number | null {
  const t0 = s.replace(/[R$\s]/g, "");
  if (t0 === "") return null;
  const t = t0.includes(",") ? t0.replace(/\./g, "").replace(",", ".") : t0;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return Number.NaN;
  return Math.round(Number(t) * 100);
}

export function dataValida(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** "31/12/2026" ou "2026-12-31" → "2026-12-31". Vazio → null. Inválido → NaN. */
export function lerData(s: string): string | null | number {
  const t = s.trim();
  if (!t) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : t.slice(0, 10);
  return dataValida(iso) ? iso : Number.NaN;
}

export function normalizarForma(s: string): Forma | null {
  const t = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (!t) return null;
  if (/dinheiro|especie/.test(t)) return "DINHEIRO";
  if (/debito/.test(t)) return "DEBITO";
  if (/credito|cartao/.test(t)) return "CREDITO";
  if (/pix|transf|ted\b|doc\b/.test(t)) return "PIX";
  if (/boleto/.test(t)) return "BOLETO";
  if (/fatur|empresa/.test(t)) return "FATURADO";
  return "OUTRO";
}

function pegar(linha: LinhaBruta, nomes: string[]): string | undefined {
  for (const n of nomes) if (linha[n] !== undefined) return linha[n];
  return undefined;
}

/**
 * Colunas obrigatórias ausentes do arquivo. Se faltar alguma, o arquivo
 * inteiro é recusado: não se importa metade em silêncio.
 */
export function colunasFaltantes(layout: Layout, colunas: string[]): string[] {
  const tem = new Set(colunas);
  const faltam: string[] = [];
  if (!layout.codigo.some((c) => tem.has(c))) faltam.push(`código (${layout.codigo.join(" / ")})`);
  for (const [nome, c] of Object.entries(layout.campos)) {
    if (c.obrigatorio && !c.de.some((d) => tem.has(d))) faltam.push(`${nome} (${c.de.join(" / ")})`);
  }
  return faltam;
}

export function converterLinha(layout: Layout, linha: LinhaBruta): { codigo: string | null; registro: Registro; problemas: string[] } {
  const problemas: string[] = [];
  const registro: Registro = {};
  const codigo = (pegar(linha, layout.codigo) ?? "").trim() || null;
  if (!codigo) problemas.push("Sem código de origem: a linha não teria como ser reconhecida numa próxima importação.");
  for (const [k, c] of Object.entries(layout.campos)) {
    const bruto = (pegar(linha, c.de) ?? "").trim();
    if (bruto === "") {
      if (c.obrigatorio) problemas.push(`Campo obrigatório vazio: ${k}.`);
      continue; // vazio não vira campo: não apaga o que já existe
    }
    switch (c.tipo ?? "texto") {
      case "data": {
        const v = lerData(bruto);
        if (typeof v === "number") problemas.push(`Data inválida em ${k}: ${bruto}`); else registro[k] = v;
        break;
      }
      case "valor": {
        const v = lerValor(bruto);
        if (v === null) break;
        if (Number.isNaN(v)) problemas.push(`Valor inválido em ${k}: ${bruto}`);
        else if (v < 0) problemas.push(`Valor negativo em ${k}.`);
        else registro[k] = v;
        break;
      }
      case "inteiro": {
        if (!/^\d+$/.test(bruto)) problemas.push(`Número inválido em ${k}: ${bruto}`); else registro[k] = Number(bruto);
        break;
      }
      case "booleano":
        registro[k] = /^(s|sim|1|true|x|incluido|incluso)$/i.test(bruto);
        break;
      case "forma":
        registro[k] = normalizarForma(bruto);
        break;
      default:
        registro[k] = bruto;
    }
  }
  if (layout.tipo === "hospedagens") {
    const ci = registro.checkin, co = registro.checkoutPrevisto, cr = registro.checkoutReal;
    if (typeof ci === "string" && typeof co === "string" && co < ci) problemas.push("Check-out antes do check-in.");
    if (typeof ci === "string" && typeof cr === "string" && cr < ci) problemas.push("Check-out realizado antes do check-in.");
  }
  if (layout.tipo === "recebimentos") {
    const bruto = Number(registro.bruto ?? 0), desc = Number(registro.desconto ?? 0), taxa = Number(registro.taxa ?? 0);
    if (bruto - desc - taxa < 0) problemas.push("Desconto e taxa maiores que o valor bruto.");
    const p = registro.parcelas;
    if (typeof p === "number" && (p < 1 || p > 48)) problemas.push("Parcelas fora de 1 a 48.");
  }
  return { codigo, registro, problemas };
}

// ------------------------------------------------------------------ classificação

export type Situacao = "NOVO" | "ATUALIZADO" | "IDENTICO" | "REJEITADO";

export interface ItemPrevia {
  numeroLinha: number;
  codigo: string | null;
  dadosBrutos: LinhaBruta;
  registro: Registro | null;
  situacao: Situacao;
  problemas: string[];
  camposAlterados: string[];
}

export interface Previa {
  tipo: TipoImportacao;
  layoutVersao: string;
  erroGeral: string | null;
  itens: ItemPrevia[];
  resumo: { total: number; novo: number; atualizado: number; identico: number; rejeitado: number };
}

/**
 * Classifica cada linha sem gravar.
 * `existentes`: registros já gravados para esta origem, por código (só os
 * campos do layout, no mesmo formato do `registro`).
 */
export function preverImportacao(
  tipo: TipoImportacao,
  colunas: string[],
  linhas: LinhaBruta[],
  existentes: Map<string, Registro>,
  /** Erro de estrutura achado na leitura (ex.: total do rodapé não confere). */
  erroArquivo: string | null = null,
): Previa {
  const layout = LAYOUTS[tipo];
  const faltam = colunasFaltantes(layout, colunas);
  const vazio = { total: linhas.length, novo: 0, atualizado: 0, identico: 0, rejeitado: 0 };
  if (faltam.length || erroArquivo) {
    const msg = erroArquivo ?? `O arquivo não tem as colunas obrigatórias: ${faltam.join("; ")}. Nada foi importado.`;
    return {
      tipo, layoutVersao: layout.versao, erroGeral: msg,
      itens: linhas.map((l, i) => ({
        numeroLinha: i + 2, codigo: null, dadosBrutos: l, registro: null,
        situacao: "REJEITADO", problemas: [msg], camposAlterados: [],
      })),
      resumo: { ...vazio, rejeitado: linhas.length },
    };
  }
  if (!linhas.length) {
    return { tipo, layoutVersao: layout.versao, erroGeral: "O arquivo não tem nenhuma linha de dados.", itens: [], resumo: vazio };
  }
  const vistos = new Map<string, number>();
  const itens = linhas.map((l, i): ItemPrevia => {
    const numeroLinha = i + 2;
    const c = converterLinha(layout, l);
    const base = { numeroLinha, codigo: c.codigo, dadosBrutos: l, registro: c.registro, camposAlterados: [] as string[] };
    if (c.problemas.length || !c.codigo) return { ...base, registro: null, situacao: "REJEITADO", problemas: c.problemas };
    const repetida = vistos.get(c.codigo);
    if (repetida !== undefined) {
      return { ...base, registro: null, situacao: "REJEITADO", problemas: [`Código ${c.codigo} repetido no próprio arquivo (linha ${repetida}).`] };
    }
    vistos.set(c.codigo, numeroLinha);
    const atual = existentes.get(c.codigo);
    if (!atual) return { ...base, situacao: "NOVO", problemas: [] };
    const mudou = Object.keys(c.registro).filter((k) => atual[k] !== c.registro[k]);
    return { ...base, situacao: mudou.length ? "ATUALIZADO" : "IDENTICO", problemas: [], camposAlterados: mudou };
  });
  const resumo = { ...vazio };
  for (const it of itens) {
    if (it.situacao === "NOVO") resumo.novo++;
    else if (it.situacao === "ATUALIZADO") resumo.atualizado++;
    else if (it.situacao === "IDENTICO") resumo.identico++;
    else resumo.rejeitado++;
  }
  return { tipo, layoutVersao: layout.versao, erroGeral: null, itens, resumo };
}
