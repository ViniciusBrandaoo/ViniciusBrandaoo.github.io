/**
 * Gera os relatórios em PDF para a Direção a partir dos CSVs do DataHotel.
 *
 *   npx tsx scripts/relatorios-fernanda.mts <pasta> <conferencia.json> <inicio> <fim> <saida>
 *
 * Três PDFs: 1) resumo e conferência, 2) recebimentos, 3) hospedagens e ocupação.
 * Só lê. Usa o Edge sem janela para imprimir o HTML em PDF.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lerContasRecebidasDataHotel, lerRelatorioReservasDataHotel } from "../src/dominio/hotel/importacao.js";
import { recebimentosDeLinhas, reservasDeLinhas, type Resultado } from "../src/dominio/hotel/conferencia.js";

const [pasta, confJson, inicio, fim, saida] = process.argv.slice(2) as [string, string, string, string, string];
mkdirSync(saida, { recursive: true });

const texto = (prefixo: string) => {
  const f = readdirSync(pasta).filter((n) => n.startsWith(prefixo) && n.endsWith(".csv")).sort().pop();
  if (!f) throw new Error(`Falta ${prefixo}`);
  const b = readFileSync(join(pasta, f));
  const t = b.toString("utf8");
  return t.includes("\uFFFD") ? b.toString("latin1") : t;
};
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (iso: string) => iso.split("-").reverse().join("/");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const dias = (a: string, b: string) => { const o: string[] = []; for (let d = new Date(a + "T12:00:00Z"); d.toISOString().slice(0, 10) <= b; d.setUTCDate(d.getUTCDate() + 1)) o.push(d.toISOString().slice(0, 10)); return o; };
const FORMA: Record<string, string> = { DINHEIRO: "Dinheiro", PIX: "Pix / transferência", CREDITO: "Cartão de crédito", DEBITO: "Cartão de débito", CARTAO_CREDITO: "Cartão de crédito", CARTAO_DEBITO: "Cartão de débito", FATURADO: "Faturado (empresa)", OUTRO: "Outro" };

const rec = recebimentosDeLinhas(lerContasRecebidasDataHotel(texto("contas_recebidas"), inicio)!.linhas).filter((r) => r.dia >= inicio && r.dia <= fim);
const res = reservasDeLinhas(lerRelatorioReservasDataHotel(texto("reservas_extrato"))!.linhas).filter((r) => !/cancel/i.test(r.situacao));
const conf = JSON.parse(readFileSync(confJson, "utf8")) as { inicio: string; fim: string; resumo: { ok: number; divergentes: number; atencao: number }; resultados: Resultado[] };
const lerNome = nomes();
const APTOS_VENDAVEIS = 26; // 31 apartamentos, 5 bloqueados (Lista de Camareira / RDS)

const total = rec.reduce((a, r) => a + r.valor, 0);
const porForma = new Map<string, number>(); const porDia = new Map<string, number>();
for (const r of rec) { porForma.set(r.forma, (porForma.get(r.forma) ?? 0) + r.valor); porDia.set(r.dia, (porDia.get(r.dia) ?? 0) + r.valor); }
const faturado = porForma.get("FATURADO") ?? 0;
const ocup = dias(inicio, fim).map((d) => {
  const h = res.filter((r) => /^checked-(in|out)/i.test(r.situacao) && r.checkin <= d && r.checkout > d);
  return { d, aptos: new Set(h.map((r) => r.apto)).size, hosp: h.reduce((a, r) => a + r.hospedes, 0), receita: 0 };
});
const mediaOcup = ocup.reduce((a, o) => a + o.aptos, 0) / ocup.length / APTOS_VENDAVEIS;
const saldos = res.map((r) => ({ r, saldo: r.diariaLancada + r.consumo - r.recebido })).filter((x) => x.saldo > 0 && x.r.checkin <= fim).sort((a, b) => b.saldo - a.saldo);
const pendente = saldos.reduce((a, x) => a + x.saldo, 0);

const CSS = `@page{size:A4;margin:14mm}body{font:10.5pt/1.45 'Segoe UI',Arial,sans-serif;color:#1b2430;margin:0}
header{border-bottom:3px solid #0B2547;padding-bottom:8px;margin-bottom:14px}h1{font-size:18pt;margin:0;color:#0B2547}
.sub{color:#5a6573;font-size:9pt}h2{font-size:12.5pt;color:#0B2547;margin:18px 0 6px;page-break-after:avoid}
table{width:100%;border-collapse:collapse;font-size:9.3pt;margin-bottom:6px}th,td{border-bottom:1px solid #d9dee5;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#f1f3f6}.d{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}tr{page-break-inside:avoid}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:6px}.k{border:1px solid #d9dee5;border-radius:6px;padding:8px;font-size:9pt}.k b{display:block;font-size:13pt;color:#0B2547}
.ok{color:#1e7d3a;font-weight:600}.div{color:#b42318;font-weight:700}.at{color:#a15c00;font-weight:600}
.alerta{border-left:4px solid #b42318;background:#fdf1f0;padding:8px 10px;margin:8px 0}.aviso{border-left:4px solid #a15c00;background:#fff8e8;padding:8px 10px;margin:8px 0}
ul{margin:3px 0 0;padding-left:16px}.barra{display:inline-block;height:9px;background:#c9a227;border-radius:4px;vertical-align:middle}
footer{margin-top:20px;color:#7a8491;font-size:8pt;border-top:1px solid #d9dee5;padding-top:6px}`;
const pagina = (titulo: string, sub: string, corpo: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${CSS}</style></head><body>
<header><h1>Hotel Polyanna · ${esc(titulo)}</h1><div class="sub">${esc(sub)} · gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · fonte: relatórios exportados do DataHotel</div></header>
${corpo}<footer>Hotel Gestão 360 · os dados vêm do DataHotel e não foram alterados lá.</footer></body></html>`;
const tabela = (cab: string[], linhas: string[][], dir: number[] = []) =>
  `<table><thead><tr>${cab.map((h, i) => `<th${dir.includes(i) ? ' class="d"' : ""}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((v, i) => `<td${dir.includes(i) ? ' class="d"' : ""}>${v}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const kpis = (xs: [string, string, string][]) => `<div class="kpis">${xs.map(([a, b, c]) => `<div class="k">${esc(a)}<b>${b}</b>${esc(c)}</div>`).join("")}</div>`;
const periodo = `${br(inicio)} a ${br(fim)}`;

// 1) Resumo e conferência
const SIT = { OK: ["ok", "Bate"], DIVERGENTE: ["div", "Divergente"], ATENCAO: ["at", "Atenção"] } as const;
const ord = { DIVERGENTE: 0, ATENCAO: 1, OK: 2 };
const div = conf.resultados.filter((r) => r.situacao === "DIVERGENTE");
const p1 = pagina("Resumo e conferência", `Período ${periodo} · conferência dos relatórios de ${br(conf.inicio)} a ${br(conf.fim)}`,
  kpis([["Recebido no período", brl(total), `${rec.length} recebimentos`], ["Faturado para empresas", brl(faturado), "a cobrar das empresas"],
    ["Ocupação média", `${Math.round(mediaOcup * 100)}%`, `${APTOS_VENDAVEIS} aptos vendáveis`], ["Saldo de hospedagens", brl(pendente), `${saldos.length} reserva(s) com saldo`]]) +
  `<h2>Pontos para decisão</h2>` +
  `<div class="alerta"><b>Empresas sem cobrança:</b> ${brl(faturado)} foram lançados como "Faturar empresa" no período, mas o DataHotel não tem nenhuma fatura emitida e só R$ 215,00 lançados em contas a receber. No fechamento do caixa de 05/11, R$ 5.130,00 desse valor foram para a conta Banco do Brasil como se tivessem sido recebidos.</div>` +
  `<div class="alerta"><b>Apto 107 (reserva ASJ265945, 24/10 a 07/11):</b> no checkout, 12 diárias foram retiradas da conta. A reserva somava R$ 2.795,00 (R$ 215,00 pagos); hoje mostra uma diária de R$ 215,00, quitada. Confirmar se foi desconto autorizado.</div>` +
  `<h2>Conferência do fechamento · ${br(conf.inicio)} a ${br(conf.fim)}</h2><p class="sub"><span class="ok">${conf.resumo.ok} batem</span> · <span class="div">${conf.resumo.divergentes} divergente(s)</span> · <span class="at">${conf.resumo.atencao} com atenção</span></p>` +
  tabela(["Regra", "O que foi conferido", "Situação"], conf.resultados.filter((r) => r.regra !== "C0").sort((a, b) => ord[a.situacao] - ord[b.situacao]).map((r) => {
    const s = SIT[r.situacao];
    return [esc(r.regra), `<b>${esc(r.titulo)}</b><div class="sub">${esc(r.entre)}</div>${r.situacao !== "OK" ? `<ul>${r.detalhes.slice(0, 8).map((d) => `<li>${esc(d)}</li>`).join("")}${r.detalhes.length > 8 ? `<li>… e mais ${r.detalhes.length - 8}</li>` : ""}</ul>` : ""}`, `<span class="${s[0]}">${s[1]}</span>`];
  }), [2]) + (div.length ? "" : ""));

// 2) Recebimentos
const max = Math.max(...porDia.values(), 1);
const p2 = pagina("Recebimentos", `Período ${periodo} · Relatório de Contas Recebidas`,
  kpis([["Total recebido", brl(total), `${rec.length} recebimentos`], ["Média por dia", brl(Math.round(total / dias(inicio, fim).length)), `${dias(inicio, fim).length} dias`],
    ["Faturado para empresas", brl(faturado), `${total ? Math.round(faturado / total * 100) : 0}% do total`], ["Maior dia", brl(max), br([...porDia].find(([, v]) => v === max)?.[0] ?? inicio)]]) +
  `<div class="aviso">"Faturado (empresa)" ainda não é dinheiro em caixa: só entra quando a empresa pagar.</div>` +
  `<h2>Por forma de pagamento</h2>` + tabela(["Forma", "Valor", "%"], [...porForma].sort((a, b) => b[1] - a[1]).map(([f, v]) => [esc(FORMA[f] ?? f), brl(v), `${(v / total * 100).toFixed(1).replace(".", ",")}%`]).concat([["<b>Total</b>", `<b>${brl(total)}</b>`, "100%"]]), [1, 2]) +
  `<h2>Por dia</h2>` + tabela(["Dia", "", "Valor"], dias(inicio, fim).map((d) => { const v = porDia.get(d) ?? 0; return [br(d), `<span class="barra" style="width:${Math.round(v / max * 260)}px"></span>`, brl(v)]; }), [2]));

// 3) Hospedagens e ocupação
const p3 = pagina("Hospedagens e ocupação", `Período ${periodo} · Relatório de Reservas (com extrato)`,
  kpis([["Ocupação média", `${Math.round(mediaOcup * 100)}%`, `de ${APTOS_VENDAVEIS} aptos vendáveis`], ["Noites vendidas", String(ocup.reduce((a, o) => a + o.aptos, 0)), "apto × noite"],
    ["Hóspedes-noite", String(ocup.reduce((a, o) => a + o.hosp, 0)), "pessoas × noite"], ["Saldo a receber", brl(pendente), `${saldos.length} reserva(s)`]]) +
  `<h2>Ocupação por noite</h2>` + tabela(["Noite", "Aptos ocupados", "Taxa", "Hóspedes"], ocup.map((o) => [br(o.d), String(o.aptos), `${Math.round(o.aptos / APTOS_VENDAVEIS * 100)}%`, String(o.hosp)]), [1, 2, 3]) +
  `<h2>Reservas com saldo a receber</h2>` + (saldos.length ? tabela(["Apto", "Hóspede / reserva", "Período", "Situação", "Devido", "Pago", "Falta"], saldos.map(({ r, saldo }) => {
    const nome = esc((lerNome.get(r.codigo) ?? "").trim());
    return [esc(r.apto), `${nome}<div class="sub">${esc(r.codigo)}</div>`, `${br(r.checkin)} a ${br(r.checkout)}`, esc(r.situacao), brl(r.diariaLancada + r.consumo), brl(r.recebido), `<b>${brl(saldo)}</b>`];
  }), [4, 5, 6]) : "<p>Nenhuma reserva com saldo.</p>"));

function nomes(): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of lerRelatorioReservasDataHotel(texto("reservas_extrato"))!.linhas) if (l.codigo) m.set(l.codigo, (l.hospede ?? "").split(" ").slice(0, 2).join(" "));
  return m;
}

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
for (const [nome, html] of [["1_resumo_e_conferencia", p1], ["2_recebimentos", p2], ["3_hospedagens_e_ocupacao", p3]] as const) {
  const h = join(saida, `${nome}.html`);
  writeFileSync(h, html, "utf8");
  execFileSync(EDGE, ["--headless", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${join(saida, nome + ".pdf")}`, h], { stdio: "ignore" });
  console.log("PDF:", join(saida, nome + ".pdf"));
}
