/**
 * Gera os 5 PDFs da Direção a partir de uma pasta de CSVs do DataHotel.
 *   npx tsx scripts/relatorios-fernanda.mts <pasta> <conferencia.json> <inicio> <fim> <saida>
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { reconhecer } from "../src/dominio/hotel/conferencia-arquivos.js";
import { gerarRelatorios } from "../src/dominio/hotel/relatorios.js";
import type { Fonte } from "../src/dominio/hotel/conferencia.js";

const [pasta, confJson, inicio, fim, saida] = process.argv.slice(2) as [string, string, string, string, string];
mkdirSync(saida, { recursive: true });
const porFonte = new Map<Fonte, string>();
for (const n of readdirSync(pasta).filter((n) => n.endsWith(".csv")).sort()) {
  const b = readFileSync(join(pasta, n)); let t = b.toString("utf8"); if (t.includes("�")) t = b.toString("latin1");
  const f = reconhecer(t); if (f) porFonte.set(f, t); // o mais recente (ordem do nome) vale
}
const hoje = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const rels = gerarRelatorios({ texto: (f) => porFonte.get(f) ?? null, conf: JSON.parse(readFileSync(confJson, "utf8")), inicio, fim, hoje });
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
for (const r of rels) {
  const h = join(saida, r.nome + ".html");
  writeFileSync(h, r.html, "utf8");
  execFileSync(EDGE, ["--headless", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${join(saida, r.nome + ".pdf")}`, h], { stdio: "ignore" });
  rmSync(h);
  console.log("PDF:", join(saida, r.nome + ".pdf"));
}
