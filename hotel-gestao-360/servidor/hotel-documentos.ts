/**
 * PDFs enviados ao hotel: guarda o arquivo, tira o texto e lê os campos
 * (boleto, conta de consumo, nota, comprovante de Pix). Nada é lançado aqui:
 * a tela abre o formulário já preenchido para a pessoa conferir e salvar.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { hashDocumento } from "./autenticacao.js";
import { consultar } from "./banco.js";
import { lerDocumento, type DocumentoLido } from "../src/dominio/hotel/ler-documento.js";

const LIMITE = 10 * 1024 * 1024;
// Fontes padrão do PDF (Helvetica, Times…): sem elas o leitor avisa no log a cada arquivo.
const FONTES = join(dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json")), "standard_fonts") + "/";

/** Texto do PDF linha a linha, na ordem da página (itens com a mesma altura viram uma linha). */
export async function textoDoPdf(buffer: Buffer): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, standardFontDataUrl: FONTES }).promise;
  const paginas: string[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, 30); n++) {
    const pag = await doc.getPage(n);
    const tc = await pag.getTextContent();
    const linhas = new Map<number, { x: number; s: string; w: number }[]>();
    for (const it of tc.items as Array<{ str: string; transform: number[]; width: number }>) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]! / 2) * 2;
      const l = linhas.get(y) ?? [];
      l.push({ x: it.transform[4]!, s: it.str, w: it.width });
      linhas.set(y, l);
    }
    const ys = [...linhas.keys()].sort((a, b) => b - a);
    paginas.push(ys.map((y) => {
      const l = linhas.get(y)!.sort((a, b) => a.x - b.x);
      let out = "", fim = -Infinity;
      for (const p of l) { out += (out && p.x - fim > 4 ? (p.x - fim > 18 ? "   " : " ") : "") + p.s; fim = p.x + p.w; }
      return out;
    }).join("\n"));
  }
  await doc.destroy();
  return paginas.join("\n\f\n");
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(ltda|me|epp|eireli|s\.?a\.?|cia)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Fornecedor já cadastrado com o mesmo CNPJ ou o mesmo nome. */
async function fornecedorDe(lido: DocumentoLido): Promise<{ id: string; nome: string } | null> {
  if (lido.cnpj) {
    try {
      const r = await consultar<{ id: string; nome: string }>(`SELECT id, coalesce(nome_fantasia, razao_social) AS nome FROM fornecedores WHERE documento_hash = $1`, [hashDocumento(lido.cnpj.valor)]);
      if (r[0]) return r[0];
    } catch { /* sem pepper no ambiente: segue pelo nome */ }
  }
  if (lido.nome) {
    const alvo = norm(lido.nome.valor);
    if (alvo.length >= 3) {
      const todos = await consultar<{ id: string; razao: string; fantasia: string | null }>(`SELECT id, razao_social AS razao, nome_fantasia AS fantasia FROM fornecedores`);
      const achado = todos.find((f) => [f.razao, f.fantasia].some((n) => { const x = n ? norm(n) : ""; return x.length >= 3 && (alvo.includes(x) || x.includes(alvo)); }));
      if (achado) return { id: achado.id, nome: achado.fantasia || achado.razao };
    }
  }
  return null;
}

export interface Enviado { documentoId: string; nome: string; lido: DocumentoLido; fornecedor: { id: string; nome: string } | null; repetido: boolean; temTexto: boolean }

export async function receber(userId: string, nome: string, tipoMime: string, buffer: Buffer, hoje: string): Promise<Enviado> {
  if (!buffer.length) throw Object.assign(new Error("O arquivo está vazio."), { statusCode: 400 });
  if (buffer.length > LIMITE) throw Object.assign(new Error("O PDF passa de 10 MB. Envie um arquivo menor."), { statusCode: 413 });
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw Object.assign(new Error("Envie um arquivo PDF."), { statusCode: 415 });
  const sha = createHash("sha256").update(buffer).digest("hex");
  const ja = await consultar<{ id: string }>(`SELECT id FROM hotel_documentos WHERE sha256 = $1 LIMIT 1`, [sha]);
  let texto = "";
  try { texto = await textoDoPdf(buffer); } catch { texto = ""; }
  const lido = lerDocumento(texto, hoje);
  if (!texto.trim()) lido.avisos.push("Este PDF é uma imagem (foto ou digitalização): não tem texto para ler. Preencha os campos à mão; o arquivo fica guardado.");
  let id = ja[0]?.id;
  if (!id) {
    const r = await consultar<{ id: string }>(
      `INSERT INTO hotel_documentos (nome, tipo_mime, tamanho, conteudo, sha256, texto, lido, criado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [nome.slice(0, 200), tipoMime || "application/pdf", buffer.length, buffer, sha, texto.slice(0, 200_000), JSON.stringify(lido), userId]);
    id = r[0]!.id;
  }
  return { documentoId: id, nome, lido, fornecedor: await fornecedorDe(lido), repetido: !!ja[0], temTexto: !!texto.trim() };
}

export async function obter(id: string): Promise<{ nome: string; tipo: string; conteudo: Buffer } | null> {
  const r = await consultar<{ nome: string; tipo: string; conteudo: Buffer }>(`SELECT nome, tipo_mime AS tipo, conteudo FROM hotel_documentos WHERE id = $1`, [id]);
  return r[0] ?? null;
}
