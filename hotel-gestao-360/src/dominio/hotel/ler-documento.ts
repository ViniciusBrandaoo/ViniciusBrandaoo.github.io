/**
 * Lê o texto de um PDF (boleto, conta de consumo, nota fiscal, comprovante de Pix)
 * e devolve os campos que dá para preencher sozinho. Funções puras: o servidor
 * extrai o texto do PDF e chama `lerDocumento`; os testes chamam direto.
 *
 * Regra de ouro: só devolve o que está escrito no documento. O que for
 * calculado (vencimento e valor da linha digitável) é conferido com o que o
 * próprio documento mostra; havendo diferença, o campo vai com um aviso.
 */

export type TipoDocumento = "BOLETO" | "CONTA_CONSUMO" | "NFE" | "NFSE" | "COMPROVANTE_PIX" | "EXTRATO" | "DESCONHECIDO";

export interface CampoLido<T = string | number> { valor: T; de: string }

export interface DocumentoLido {
  tipo: TipoDocumento;
  /** Centavos. */
  valor?: CampoLido<number>;
  /** AAAA-MM-DD. */
  vencimento?: CampoLido<string>;
  emissao?: CampoLido<string>;
  documento?: CampoLido<string>;
  linhaDigitavel?: CampoLido<string>;
  chaveAcesso?: CampoLido<string>;
  /** Só dígitos. */
  cnpj?: CampoLido<string>;
  nome?: CampoLido<string>;
  pagador?: CampoLido<string>;
  avisos: string[];
}

const so = (s: string) => s.replace(/\D/g, "");
const iso = (d: string, m: string, a: string) => `${a.length === 2 ? "20" + a : a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
const valida = (s: string) => { const t = new Date(s + "T12:00:00Z"); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s; };

/** "1.234,56" → 123456 centavos. */
export function centavos(s: string): number | null {
  const m = /(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})(?!\d)/.exec(s);
  return m ? Number(m[1]!.replace(/\./g, "")) * 100 + Number(m[2]) : null;
}

function cnpjValido(c: string): boolean {
  if (!/^\d{14}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  const dv = (base: string, pesos: number[]) => { const s = pesos.reduce((a, p, i) => a + Number(base[i]) * p, 0) % 11; return s < 2 ? 0 : 11 - s; };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], p2 = [6, ...p1];
  return dv(c, p1) === Number(c[12]) && dv(c, p2) === Number(c[13]);
}

/** Data logo depois de um rótulo ("Vencimento 10/12/2026"). */
function dataApos(texto: string, rotulo: RegExp): string | null {
  const m = new RegExp("(?:" + rotulo.source + ")" + String.raw`[^\d]{0,40}?(\d{2})[/.-](\d{2})[/.-](\d{2,4})`, "i").exec(texto);
  if (!m) return null;
  // O rótulo pode ter grupos próprios: dia, mês e ano são sempre os três últimos.
  const [dd, mm, aa] = m.slice(-3) as [string, string, string];
  const d = iso(dd, mm, aa);
  return valida(d) ? d : null;
}
/** Valor em reais logo depois de um rótulo. */
function valorApos(texto: string, rotulo: RegExp): number | null {
  const m = new RegExp("(?:" + rotulo.source + ")" + String.raw`[^\d]{0,40}?((?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})(?!\d)`, "i").exec(texto);
  return m ? centavos(m[m.length - 1]!) : null;
}

// ------------------------------------------------------------ boleto bancário (47 dígitos)

/**
 * Vencimento pelo fator da linha digitável. O fator conta dias desde 07/10/1997
 * e recomeçou em 1000 em 22/02/2025: escolhe a data mais próxima de `hoje`.
 */
export function vencimentoPeloFator(fator: number, hoje: string): string | null {
  if (!fator) return null;
  const base = Date.UTC(1997, 9, 7), ref = Date.parse(hoje + "T00:00:00Z");
  let melhor: number | null = null;
  for (let ciclo = 0; ciclo < 4; ciclo++) {
    const t = base + (fator + ciclo * 9000) * 86400000;
    if (melhor === null || Math.abs(t - ref) < Math.abs(melhor - ref)) melhor = t;
  }
  return new Date(melhor!).toISOString().slice(0, 10);
}

function lerLinhaBancaria(texto: string, hoje: string): { linha: string; valor: number | null; vencimento: string | null } | null {
  const m = /(\d{5})[.\s]?(\d{5})\s+(\d{5})[.\s]?(\d{6})\s+(\d{5})[.\s]?(\d{6})\s+(\d)\s+(\d{14})/.exec(texto);
  if (!m) return null;
  const linha = m.slice(1, 9).join("");
  const fator = Number(m[8]!.slice(0, 4)), valor = Number(m[8]!.slice(4));
  return { linha, valor: valor || null, vencimento: vencimentoPeloFator(fator, hoje) };
}

// ------------------------------------------------------------ arrecadação (água, luz, telefone: 48 dígitos)

function lerLinhaArrecadacao(texto: string): { linha: string; valor: number | null } | null {
  const m = /(8\d{10})[-\s]?(\d)\s+(\d{11})[-\s]?(\d)\s+(\d{11})[-\s]?(\d)\s+(\d{11})[-\s]?(\d)/.exec(texto);
  if (!m) return null;
  const blocos = [m[1], m[3], m[5], m[7]].join("");
  // 3º dígito 6 ou 8 = valor efetivo em reais nas posições 5 a 15 do código.
  const efetivo = /^8\d[68]/.test(blocos) ? Number(blocos.slice(4, 15)) : null;
  return { linha: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => m[i]).join(""), valor: efetivo || null };
}

// ------------------------------------------------------------ NF-e (chave de 44 dígitos)

function lerChave(texto: string): { chave: string; cnpj: string; numero: string; emissao: string } | null {
  const m = /((?:\d{4}\s?){11})/.exec(texto.replace(/(\d{4})\s(?=\d{4})/g, "$1"));
  const bruto = m ? so(m[1]!) : "";
  const c = /\d{44}/.exec(bruto)?.[0] ?? /\b\d{44}\b/.exec(so(texto.replace(/\s/g, " ")))?.[0];
  if (!c) return null;
  const cnpj = c.slice(6, 20);
  if (!cnpjValido(cnpj)) return null;
  return { chave: c, cnpj, numero: String(Number(c.slice(25, 34))), emissao: `20${c.slice(2, 4)}-${c.slice(4, 6)}` };
}

// ------------------------------------------------------------ principal

export function lerDocumento(texto: string, hoje: string): DocumentoLido {
  const t = texto.replace(/ /g, " ");
  const plano = t.replace(/[ \t]+/g, " ");
  const avisos: string[] = [];
  const r: DocumentoLido = { tipo: "DESCONHECIDO", avisos };

  const cnpjs = [...plano.matchAll(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g)].map((x) => so(x[0])).filter(cnpjValido);
  const venceEscrito = dataApos(plano, /vencimento|data de vencimento|vence em/);
  const valorEscrito = valorApos(plano, /valor do documento|valor a pagar|total a pagar|valor cobrado|\(=\) valor|valor total/);

  if (/extrato (de )?conta corrente|saldo anterior/i.test(plano) && /lan[çc]amentos?/i.test(plano)) {
    r.tipo = "EXTRATO";
    return r;
  }

  const bancaria = lerLinhaBancaria(plano, hoje);
  const arrec = bancaria ? null : lerLinhaArrecadacao(plano);
  const chave = lerChave(plano);

  if (bancaria) {
    r.tipo = "BOLETO";
    r.linhaDigitavel = { valor: bancaria.linha, de: "linha digitável" };
    const valor = bancaria.valor ?? valorEscrito;
    if (valor) r.valor = { valor, de: bancaria.valor ? "linha digitável" : "valor do documento" };
    if (bancaria.valor && valorEscrito && valorEscrito !== bancaria.valor) avisos.push("O valor escrito no boleto é diferente do código de barras. Confira.");
    const venc = venceEscrito ?? bancaria.vencimento;
    if (venc) r.vencimento = { valor: venc, de: venceEscrito ? "vencimento do boleto" : "linha digitável" };
    if (venceEscrito && bancaria.vencimento && venceEscrito !== bancaria.vencimento) avisos.push("O vencimento escrito é diferente do código de barras. Confira.");
  } else if (arrec) {
    r.tipo = "CONTA_CONSUMO";
    r.linhaDigitavel = { valor: arrec.linha, de: "código de barras" };
    const valor = arrec.valor ?? valorEscrito;
    if (valor) r.valor = { valor, de: arrec.valor ? "código de barras" : "total a pagar" };
    if (venceEscrito) r.vencimento = { valor: venceEscrito, de: "vencimento da conta" };
  } else if (chave) {
    r.tipo = "NFE";
    r.chaveAcesso = { valor: chave.chave, de: "chave de acesso" };
    r.documento = { valor: "NF " + chave.numero, de: "chave de acesso" };
    r.cnpj = { valor: chave.cnpj, de: "emitente na chave de acesso" };
    const total = valorApos(plano, /valor total da nota|v\. total da nota|total da nota/) ?? valorEscrito;
    if (total) r.valor = { valor: total, de: "valor total da nota" };
    const em = dataApos(plano, /data (da )?emiss[aã]o|emiss[aã]o/);
    if (em) r.emissao = { valor: em, de: "data de emissão" };
    const venc = dataApos(plano, /vencimento|venc\./);
    if (venc) r.vencimento = { valor: venc, de: "fatura/duplicata" };
  } else if (/nota fiscal (eletr[oô]nica )?de servi[çc]os|nfs-?e/i.test(plano)) {
    r.tipo = "NFSE";
    const num = /n[úu]mero da nota[^\d]{0,20}(\d+)|nfs-?e\s*n[ºo°.]?\s*(\d+)/i.exec(plano);
    if (num) r.documento = { valor: "NFS-e " + (num[1] ?? num[2]), de: "número da nota" };
    const total = valorApos(plano, /valor (total )?(dos servi[çc]os|da nota|l[íi]quido)/) ?? valorEscrito;
    if (total) r.valor = { valor: total, de: "valor da nota" };
    const em = dataApos(plano, /data (e hora )?(da )?emiss[aã]o|emitida em/);
    if (em) r.emissao = { valor: em, de: "data de emissão" };
  } else if (/\bpix\b/i.test(plano) && /comprovante|transfer[êe]ncia|pagamento/i.test(plano)) {
    r.tipo = "COMPROVANTE_PIX";
    const v = valorApos(plano, /valor( pago| da transfer[êe]ncia| do pix)?/);
    if (v) r.valor = { valor: v, de: "valor do Pix" };
    const d = dataApos(plano, /data( e hora)?( da transa[çc][ãa]o| do pagamento| da transfer[êe]ncia)?/);
    if (d) r.emissao = { valor: d, de: "data do Pix" };
    const quem = /(?:pagador|origem|de)\s*[:\n]\s*(?:nome\s*[:\n]?\s*)?([A-ZÀ-Ú][A-Za-zÀ-ú .'-]{3,60})/i.exec(t);
    if (quem) r.pagador = { valor: quem[1]!.trim().replace(/\s+/g, " "), de: "pagador" };
    return r;
  } else {
    if (valorEscrito) r.valor = { valor: valorEscrito, de: "valor do documento" };
    if (venceEscrito) r.vencimento = { valor: venceEscrito, de: "vencimento" };
  }

  // Beneficiário / emitente: o CNPJ que não é o do próprio hotel (o hotel é o pagador).
  if (!r.cnpj && cnpjs.length) r.cnpj = { valor: cnpjs[0]!, de: "CNPJ do documento" };
  const benef = /(?:benefici[áa]rio|cedente|raz[ãa]o social|emitente|prestador(?: de servi[çc]os)?)\s*[:\n]?\s*([A-ZÀ-Ú0-9][A-ZÀ-Ú0-9 .&'/-]{3,70}?)(?=\s{2,}|\s*\n|\s+CNPJ|\s+\d{2}\.\d{3}|$)/i.exec(t);
  if (benef) r.nome = { valor: benef[1]!.trim().replace(/\s+/g, " "), de: "beneficiário/emitente" };
  const doc = !r.documento && /(?:n[ºo°]\.? do documento|nosso n[úu]mero|n[úu]mero do documento|fatura n[ºo°]?)\s*[:\n]?\s*([\w./-]{3,25})/i.exec(plano);
  if (doc) r.documento = { valor: doc[1]!, de: "número do documento" };
  if (r.vencimento && r.vencimento.valor < hoje) avisos.push("O vencimento já passou.");
  return r;
}
