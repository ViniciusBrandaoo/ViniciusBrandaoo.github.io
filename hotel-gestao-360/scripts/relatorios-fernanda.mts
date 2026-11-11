/**
 * Relatórios em PDF para a Direção (Fernanda), a partir dos CSVs do DataHotel.
 *
 *   npx tsx scripts/relatorios-fernanda.mts <pasta> <conferencia.json> <inicio> <fim> <saida>
 *
 * Gera 4 PDFs: 1) resumo executivo, 2) conferência do fechamento,
 * 3) financeiro (recebimentos, caixa, faturamento, empresas), 4) hospedagem e operação
 * (ocupação, extrato das hospedagens, café, frigobar/consumo, estoque).
 * Só lê. O Edge sem janela imprime o HTML em PDF.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lerContasRecebidasDataHotel, lerListaCafeDataHotel, lerMovimentoCaixaDataHotel, lerRelatorioReservasDataHotel, lerValor, normalizarForma } from "../src/dominio/hotel/importacao.js";
import {
  lerContasAReceber, lerEstoque, lerFaturamentoDiario, recebimentosDeLinhas, reservasDeLinhas, type Resultado,
} from "../src/dominio/hotel/conferencia.js";

const [pasta, confJson, inicio, fim, saida] = process.argv.slice(2) as [string, string, string, string, string];
mkdirSync(saida, { recursive: true });

// ------------------------------------------------------------------ leitura
const texto = (prefixo: string): string | null => {
  const f = readdirSync(pasta).filter((n) => n.startsWith(prefixo) && n.endsWith(".csv")).sort().pop();
  if (!f) return null;
  const b = readFileSync(join(pasta, f));
  const t = b.toString("utf8");
  return t.includes("\uFFFD") ? b.toString("latin1") : t;
};
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (iso: string) => iso.split("-").reverse().join("/");
const brCurto = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const datasBR = (s: string) => s.replace(/(\d{4})-(\d{2})-(\d{2})/g, "$3/$2/$1");
const dias = (a: string, b: string) => { const o: string[] = []; for (let d = new Date(a + "T12:00:00Z"); d.toISOString().slice(0, 10) <= b; d.setUTCDate(d.getUTCDate() + 1)) o.push(d.toISOString().slice(0, 10)); return o; };
const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const pct = (a: number, b: number) => (b ? (a / b * 100) : 0).toFixed(0) + "%";
const FORMA: Record<string, string> = { DINHEIRO: "Dinheiro", PIX: "Pix / transferência", CREDITO: "Cartão de crédito", DEBITO: "Cartão de débito", CARTAO_CREDITO: "Cartão de crédito", CARTAO_DEBITO: "Cartão de débito", FATURADO: "Faturado (empresa)", OUTRO: "Outro" };
const nomeForma = (f: string) => FORMA[f] ?? f;
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const HOJE = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());

const rec = recebimentosDeLinhas(lerContasRecebidasDataHotel(texto("contas_recebidas")!, inicio)!.linhas).filter((r) => r.dia >= inicio && r.dia <= fim);
const resLinhas = lerRelatorioReservasDataHotel(texto("reservas_extrato")!)!.linhas;
const nomeDe = new Map(resLinhas.map((l) => [l.codigo ?? "", titulo((l.hospede ?? "").trim().split(/\s+/).slice(0, 2).join(" "))]));
const res = reservasDeLinhas(resLinhas).filter((r) => !/cancel/i.test(r.situacao));
const conf = JSON.parse(readFileSync(confJson, "utf8")) as { inicio: string; fim: string; resumo: { ok: number; divergentes: number; atencao: number }; resultados: Resultado[] };
const fatDiario = lerFaturamentoDiario(texto("faturamento_diario_resumo") ?? "");
const aReceber = lerContasAReceber(texto("contas_a_receber") ?? "");
const estoque = lerEstoque(texto("estoque_atual") ?? "");
const cafeR = lerListaCafeDataHotel(texto("cafe_manha") ?? "", inicio);
const cafe = (cafeR?.linhas ?? []).filter((l) => l.tipo !== "ANTECIPADO").map((l) => ({ dia: l.data!.split("/").reverse().join("-"), adultos: Number(l.adultos), criancas: Number(l.criancas), pessoas: Number(l.adultos) + Number(l.criancas) }));
// Livro-caixa: entradas por dia e forma (o que a recepção registrou no caixa).
const livro = (() => { const t = texto("movimentacao_caixa"); const r = t ? lerMovimentoCaixaDataHotel(t, inicio) : null; return r ? recebimentosDeLinhas(r.linhas).filter((x) => x.dia >= inicio && x.dia <= fim) : []; })();
const APTOS = 31, BLOQ = 5, VENDAVEIS = APTOS - BLOQ;

// Fechamentos de caixa (Resumo por Movimentação de Caixa): sessão e o que foi fechado por forma.
const caixas: { numero: string; abertura: string; fechamento: string; formas: Map<string, number> }[] = [];
{
  let atual: (typeof caixas)[number] | null = null;
  for (const linha of (texto("movimentacao_caixa") ?? "").split(/\r?\n/)) {
    const m = /^Caixa:\s*(\d+)\s+Data Abertura:\s*([\d/]+ [\d:]+)\s+Data Fechamento:\s*([\d/]+ [\d:]+)?/.exec(linha);
    if (m) { atual = caixas.find((c) => c.numero === m[1]) ?? null; if (!atual) { atual = { numero: m[1]!, abertura: m[2]!, fechamento: m[3] ?? "", formas: new Map() }; caixas.push(atual); } continue; }
    if (atual && /FECHAMENTO DE CAIXA/.test(linha)) {
      const c = linha.split(";").map((x) => x.trim()).filter(Boolean);
      const forma = normalizarForma(c[2] ?? "") ?? c[2] ?? "OUTRO";
      const v = lerValor(c.find((x) => /^R\$/.test(x)) ?? "") ?? 0;
      atual.formas.set(forma, (atual.formas.get(forma) ?? 0) + v);
    }
  }
}
// Vendas por produto (frigobar + balcão).
const produtos = new Map<string, { qtd: number; custo: number; venda: number }>();
for (const linha of (texto("vendas_itens_por_data") ?? "").split(/\r?\n/)) {
  const c = linha.split(";").map((x) => x.trim()).filter(Boolean);
  const iUn = c.indexOf("UN");
  if (iUn < 1) continue;
  const nome = c[0]!, qtd = Number(c[iUn + 1]), rs = c.filter((x) => /^R\$/.test(x)).map((x) => lerValor(x) ?? 0);
  const p = produtos.get(nome) ?? { qtd: 0, custo: 0, venda: 0 };
  p.qtd += qtd; p.custo += rs[0] ?? 0; p.venda += rs[1] ?? 0; produtos.set(nome, p);
}

// ------------------------------------------------------------------ números
const total = soma(rec.map((r) => r.valor));
const porForma = new Map<string, number>(); const porDia = new Map<string, number>();
for (const r of rec) { porForma.set(r.forma, (porForma.get(r.forma) ?? 0) + r.valor); porDia.set(r.dia, (porDia.get(r.dia) ?? 0) + r.valor); }
const faturado = porForma.get("FATURADO") ?? 0;
const emCaixa = total - faturado;
const noites = dias(inicio, fim).map((d) => {
  const h = res.filter((r) => /^checked-(in|out)/i.test(r.situacao) && r.checkin <= d && r.checkout > d);
  return { d, aptos: new Set(h.map((r) => r.apto)).size, hosp: soma(h.map((r) => r.hospedes)) };
});
const noitesVendidas = soma(noites.map((n) => n.aptos));
const hospedagens = res.filter((r) => r.checkin <= fim && r.checkout >= inicio && /^checked-(in|out)/i.test(r.situacao)).sort((a, b) => a.checkin.localeCompare(b.checkin) || a.apto.localeCompare(b.apto));
const saldos = hospedagens.map((r) => ({ r, saldo: r.diariaLancada + r.consumo - r.recebido })).filter((x) => x.saldo > 0).sort((a, b) => b.saldo - a.saldo);
const pendente = soma(saldos.map((x) => x.saldo));
const diariasPeriodo = soma(fatDiario.map((f) => f.diaria)), consumoPeriodo = soma(fatDiario.map((f) => f.consumo)), vendaPeriodo = soma(fatDiario.map((f) => f.venda));
const fatFim = fatDiario.length ? fatDiario[fatDiario.length - 1]!.dia : fim;
const noitesAteFat = soma(noites.filter((n) => n.d <= fatFim).map((n) => n.aptos));
const adr = noitesAteFat ? Math.round(diariasPeriodo / noitesAteFat) : 0;
const aReceberTotal = soma(aReceber.map((a) => a.valor));
const div = conf.resultados.filter((r) => r.situacao === "DIVERGENTE");
const aten = conf.resultados.filter((r) => r.situacao === "ATENCAO");
const ok = conf.resultados.filter((r) => r.situacao === "OK" && r.regra !== "C0");

// ------------------------------------------------------------------ visual
const CSS = `@page{size:A4;margin:16mm 15mm}
*{box-sizing:border-box}body{font:10pt/1.5 'Segoe UI',Arial,sans-serif;color:#1d2733;margin:0}
.topo{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #0B2547;padding-bottom:10px;margin-bottom:18px}
.marca{font-size:8pt;letter-spacing:.18em;text-transform:uppercase;color:#b08a1e;font-weight:600}
h1{font-size:20pt;margin:2px 0 0;color:#0B2547;font-weight:600}.periodo{text-align:right;font-size:8.5pt;color:#6b7684;line-height:1.4}.periodo b{color:#0B2547;font-size:10pt}
h2{font-size:12pt;color:#0B2547;margin:22px 0 8px;font-weight:600;page-break-after:avoid;display:flex;align-items:center;gap:8px}
h2:before{content:"";width:4px;height:14px;background:#c9a227;border-radius:2px}
.nota{color:#6b7684;font-size:8.5pt;margin:-4px 0 8px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.kpis.tres{grid-template-columns:repeat(3,1fr)}
.k{background:#f5f7fa;border-radius:8px;padding:10px 12px}.k span{display:block;font-size:7.8pt;color:#6b7684;text-transform:uppercase;letter-spacing:.04em}
.k b{display:block;font-size:15pt;color:#0B2547;font-weight:600;margin:2px 0}.k i{font-style:normal;font-size:8pt;color:#6b7684}
.k.alerta{background:#fdf0ef}.k.alerta b{color:#b42318}.k.ok b{color:#1e7d3a}
table{width:100%;border-collapse:collapse;font-size:9pt}th{font-weight:600;color:#6b7684;font-size:7.6pt;text-transform:uppercase;letter-spacing:.04em;text-align:left;padding:5px 6px;border-bottom:1.5px solid #0B2547}
td{padding:5px 6px;border-bottom:1px solid #e6e9ee;vertical-align:top}tr{page-break-inside:avoid}.d{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
tfoot{display:table-row-group}tfoot td{font-weight:600;border-top:1.5px solid #0B2547;border-bottom:0}.fraco{color:#6b7684;font-size:8.3pt}
.pill{display:inline-block;padding:1px 8px;border-radius:10px;font-size:7.8pt;font-weight:600;white-space:nowrap}.p-ok{background:#e7f5ec;color:#1e7d3a}.p-div{background:#fdecea;color:#b42318}.p-at{background:#fff4dc;color:#94600a}
.card{border:1px solid #e6e9ee;border-left:4px solid #b42318;border-radius:6px;padding:10px 12px;margin:8px 0;page-break-inside:avoid}.card.at{border-left-color:#c9a227}
.card b{color:#0B2547}.card ul{margin:4px 0 0;padding-left:16px;color:#3c4754;font-size:9pt}
.grade{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.bar{height:8px;background:#c9a227;border-radius:4px;display:inline-block;vertical-align:middle}
.rodape{margin-top:22px;padding-top:6px;border-top:1px solid #e6e9ee;font-size:7.5pt;color:#8a94a1;display:flex;justify-content:space-between}
.quebra{page-break-before:always}`;
const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const pagina = (t: string, sub: string, corpo: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(t)}</title><style>${CSS}</style></head><body>
<div class="topo"><div><div class="marca">Hotel Polyanna · Hotel Gestão 360</div><h1>${esc(t)}</h1></div><div class="periodo"><b>${br(inicio)} a ${br(fim)}</b><br>${esc(sub)}<br>gerado em ${geradoEm}</div></div>
${corpo}<div class="rodape"><span>Fonte: relatórios exportados do DataHotel (somente leitura; nada foi alterado lá).</span><span>Hotel Gestão 360</span></div></body></html>`;
const kpis = (xs: [string, string, string, string?][], cls = "") => `<div class="kpis ${cls}">${xs.map(([a, b, c, t]) => `<div class="k ${t ?? ""}"><span>${esc(a)}</span><b>${b}</b><i>${esc(c)}</i></div>`).join("")}</div>`;
const tabela = (cab: string[], linhas: string[][], dir: number[] = [], rodape?: string[]) =>
  `<table><thead><tr>${cab.map((h, i) => `<th${dir.includes(i) ? ' class="d"' : ""}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((v, i) => `<td${dir.includes(i) ? ' class="d"' : ""}>${v}</td>`).join("")}</tr>`).join("")}</tbody>${rodape ? `<tfoot><tr>${rodape.map((v, i) => `<td${dir.includes(i) ? ' class="d"' : ""}>${v}</td>`).join("")}</tr></tfoot>` : ""}</table>`;
const barra = (v: number, max: number, w = 180) => `<span class="bar" style="width:${Math.max(2, Math.round(v / (max || 1) * w))}px"></span>`;
const pill = (s: Resultado["situacao"]) => s === "OK" ? '<span class="pill p-ok">Bate</span>' : s === "DIVERGENTE" ? '<span class="pill p-div">Divergente</span>' : '<span class="pill p-at">Atenção</span>';

// Linguagem simples para cada ponto da conferência.
const ACAO: Record<string, string> = {
  C8: "Emitir as faturas ou lançar as contas a receber das empresas no DataHotel.",
  C15: "Confirmar com a recepção se a retirada das diárias foi um desconto autorizado.",
  C3: "Conferir no próximo fechamento de caixa: os recebimentos feitos depois do último fechamento entram nele.",
  C11: "A recepção confere quem tomou café: pode ser hóspede extra, day use ou quem não desceu.",
  C12: "Tirar RDS, Mapa e Reservas no mesmo horário para comparar.",
  C12b: "Cobrar os hóspedes com pagamento pendente antes do checkout.",
  C14: "Lançar as entradas de estoque no DataHotel (lavanderia, cópias e bebidas estão negativos).",
};

// ------------------------------------------------------------------ 1) resumo executivo
const p1 = pagina("Resumo executivo", "visão geral para a Direção",
  kpis([["Recebido", brl(total), `${rec.length} recebimentos`], ["Em caixa e bancos", brl(emCaixa), "dinheiro, Pix e cartões"],
    ["Faturado para empresas", brl(faturado), "ainda a cobrar", faturado ? "alerta" : ""], ["Ocupação média", pct(noitesVendidas, noites.length * VENDAVEIS), `${noitesVendidas} noites vendidas`]]) +
  `<div style="height:10px"></div>` +
  kpis([["Diárias lançadas", brl(diariasPeriodo), `${br(inicio)} a ${br(fatFim)}`], ["Diária média", brl(adr), "por apto ocupado"],
    ["Saldo de hospedagens", brl(pendente), `${saldos.length} reserva(s)`, pendente ? "alerta" : "ok"], ["Conferência", `${conf.resumo.divergentes} divergência(s)`, `${conf.resumo.ok} pontos batem`, conf.resumo.divergentes ? "alerta" : "ok"]]) +
  `<h2>O que precisa de decisão</h2>` +
  `<div class="card"><b>Empresas sem cobrança — ${brl(faturado)}</b><ul><li>Lançado como "Faturar empresa" no período, mas o DataHotel não tem nenhuma fatura emitida e só ${brl(aReceberTotal)} em contas a receber.</li><li>No fechamento do caixa de 05/11, R$ 5.130,00 foram para a conta Banco do Brasil como se tivessem sido recebidos.</li><li><b>O que fazer:</b> ${ACAO.C8}</li></ul></div>` +
  `<div class="card"><b>Apto 107 — 12 diárias retiradas (R$ 2.580,00)</b><ul><li>Reserva ASJ265945, 24/10 a 07/11. Somava R$ 2.795,00 com R$ 215,00 pagos; no checkout ficou só uma diária de R$ 215,00, quitada.</li><li><b>O que fazer:</b> ${ACAO.C15}</li></ul></div>` +
  (saldos.length ? `<div class="card at"><b>Hóspedes com saldo em aberto — ${brl(pendente)}</b><ul>${saldos.map((x) => `<li>Apto ${esc(x.r.apto)} · ${esc(nomeDe.get(x.r.codigo) ?? "")} (${br(x.r.checkin)} a ${br(x.r.checkout)}): falta ${brl(x.saldo)}${x.r.checkout < HOJE && /checked-in/i.test(x.r.situacao) ? " · <b>saída prevista já passou e segue em check-in</b>" : ""}</li>`).join("")}</ul></div>` : "") +
  `<h2>Como estão as contas</h2>` +
  `<div class="grade"><div>${tabela(["Forma de recebimento", "Valor", "%"], [...porForma].sort((a, b) => b[1] - a[1]).map(([f, v]) => [esc(nomeForma(f)), brl(v), pct(v, total)]), [1, 2], ["Total", brl(total), "100%"])}</div>` +
  `<div>${tabela(["Receita lançada", "Valor"], [["Diárias", brl(diariasPeriodo)], ["Consumo (frigobar)", brl(consumoPeriodo)], ["Venda de balcão", brl(vendaPeriodo)]], [1], ["Total", brl(diariasPeriodo + consumoPeriodo + vendaPeriodo)])}<p class="fraco">Receita lançada de ${br(inicio)} a ${br(fatFim)}. Recebido ≠ faturado: o faturado só vira dinheiro quando a empresa paga.</p></div></div>`);

// ------------------------------------------------------------------ 2) conferência
const cardConf = (r: Resultado) => `<div class="card ${r.situacao === "ATENCAO" ? "at" : ""}"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(r.titulo)}</b>${pill(r.situacao)}</div>
<div class="fraco">${esc(r.entre)}</div><ul>${r.detalhes.slice(0, 10).map((d) => `<li>${esc(datasBR(d))}</li>`).join("")}${r.detalhes.length > 10 ? `<li>… e mais ${r.detalhes.length - 10}</li>` : ""}${ACAO[r.regra] ? `<li><b>O que fazer:</b> ${esc(ACAO[r.regra]!)}</li>` : ""}</ul></div>`;
const p2 = pagina("Conferência do fechamento", `relatórios cruzados de ${br(conf.inicio)} a ${br(conf.fim)}`,
  kpis([["Pontos que batem", String(conf.resumo.ok), "conferidos e corretos", "ok"], ["Divergências", String(conf.resumo.divergentes), "precisam de correção", conf.resumo.divergentes ? "alerta" : "ok"], ["Atenção", String(conf.resumo.atencao), "pedem olhar da equipe"]], "tres") +
  (div.length ? `<h2>Divergências</h2>${div.map(cardConf).join("")}` : "") +
  (aten.length ? `<h2>Pontos de atenção</h2>${aten.map(cardConf).join("")}` : "") +
  `<h2>O que foi conferido e bate</h2>` + tabela(["Conferência", "Relatórios cruzados", ""], ok.map((r) => [`<b>${esc(r.titulo)}</b>`, `<span class="fraco">${esc(r.entre)}</span>`, pill("OK")]), [2]));

// ------------------------------------------------------------------ 3) financeiro
const maxDia = Math.max(...porDia.values(), 1);
const p3 = pagina("Financeiro", "recebimentos, caixa, faturamento e empresas",
  kpis([["Recebido", brl(total), `${rec.length} recebimentos`], ["Média por dia", brl(Math.round(total / dias(inicio, fim).length)), `${dias(inicio, fim).length} dias`],
    ["Faturado (empresas)", brl(faturado), pct(faturado, total) + " do recebido", faturado ? "alerta" : ""], ["Contas a receber lançadas", brl(aReceberTotal), `${aReceber.length} título(s)`]]) +
  `<h2>Recebido por dia</h2>` + tabela(["Dia", "", "Valor"], dias(inicio, fim).map((d) => { const v = porDia.get(d) ?? 0; return [br(d), barra(v, maxDia, 260), brl(v)]; }), [2], ["Total", "", brl(total)]) +
  `<h2>Recebido por forma de pagamento</h2>` + tabela(["Forma", "", "Valor", "%"], [...porForma].sort((a, b) => b[1] - a[1]).map(([f, v]) => [esc(nomeForma(f)), barra(v, Math.max(...porForma.values()), 200), brl(v), pct(v, total)]), [2, 3], ["Total", "", brl(total), "100%"]) +
  `<h2 class="quebra">Fechamentos de caixa</h2><p class="nota">O que cada caixa da recepção fechou e mandou para a conta, por forma.</p>` +
  tabela(["Caixa", "Aberto em", "Fechado em", "Dinheiro", "Pix", "Crédito", "Débito", "Faturar emp.", "Total"], caixas.map((c) => {
    const g = (k: string) => c.formas.get(k) ?? 0;
    return [c.numero, c.abertura.slice(0, 16), c.fechamento ? c.fechamento.slice(0, 16) : "<i>aberto</i>", brl(g("DINHEIRO")), brl(g("PIX")), brl(g("CREDITO") + g("CARTAO_CREDITO")), brl(g("DEBITO") + g("CARTAO_DEBITO")), brl(g("FATURADO")), `<b>${brl(soma([...c.formas.values()]))}</b>`];
  }), [3, 4, 5, 6, 7, 8]) +
  (livro.length ? `<h2>Caixa da recepção dia a dia</h2><p class="nota">Entradas registradas no caixa por dia e forma (livro-caixa do DataHotel, caixas fechados).</p>` +
    tabela(["Dia", "Dinheiro", "Pix", "Crédito", "Débito", "Faturar emp.", "Total"], [...new Set(livro.map((x) => x.dia))].sort().map((d) => {
      const g = (f: string[]) => soma(livro.filter((x) => x.dia === d && f.includes(x.forma)).map((x) => x.valor));
      return [br(d), brl(g(["DINHEIRO"])), brl(g(["PIX"])), brl(g(["CREDITO", "CARTAO_CREDITO"])), brl(g(["DEBITO", "CARTAO_DEBITO"])), brl(g(["FATURADO"])), `<b>${brl(soma(livro.filter((x) => x.dia === d).map((x) => x.valor)))}</b>`];
    }), [1, 2, 3, 4, 5, 6], ["Total", ...[["DINHEIRO"], ["PIX"], ["CREDITO", "CARTAO_CREDITO"], ["DEBITO", "CARTAO_DEBITO"], ["FATURADO"]].map((f) => brl(soma(livro.filter((x) => f.includes(x.forma)).map((x) => x.valor)))), brl(soma(livro.map((x) => x.valor)))]) : "") +
  `<h2>Receita lançada por dia</h2><p class="nota">Diárias, consumo e venda de balcão lançados em cada dia (até ${br(fatFim)}).</p>` +
  tabela(["Dia", "Diárias", "Consumo", "Balcão", "Total"], fatDiario.map((f) => [br(f.dia), brl(f.diaria), brl(f.consumo), brl(f.venda), brl(f.total)]), [1, 2, 3, 4], ["Total", brl(diariasPeriodo), brl(consumoPeriodo), brl(vendaPeriodo), brl(soma(fatDiario.map((f) => f.total)))]) +
  `<h2>Empresas</h2><div class="card"><b>Faturado para empresas sem fatura emitida</b><ul><li>${brl(faturado)} lançados como "Faturar empresa" de ${br(inicio)} a ${br(fim)}.</li><li>Faturas emitidas no DataHotel: nenhuma. Contas a receber lançadas: ${brl(aReceberTotal)}.</li><li><b>O que fazer:</b> ${ACAO.C8}</li></ul></div>` +
  `<p class="nota">Hospedagens lançadas como "Faturar empresa" (o relatório do DataHotel traz o hóspede e a reserva; o nome da empresa não vem nele).</p>` +
  tabela(["Data", "Reserva", "Hóspede", "Valor"], rec.filter((r) => r.forma === "FATURADO").sort((a, b) => a.dia.localeCompare(b.dia)).map((r) => [br(r.dia), esc(r.reserva || "—"), esc(titulo((r.reserva && nomeDe.get(r.reserva)) || r.pagador || "")), brl(r.valor)]), [3], ["Total", "", "", brl(faturado)]) +
  (aReceber.length ? tabela(["Lançamento", "Vencimento", "Descrição", "Valor"], aReceber.map((a) => [esc(a.lancto), br(a.vencimento), esc(a.descricao), brl(a.valor)]), [3]) : ""));

// ------------------------------------------------------------------ 4) hospedagem e operação
const cafePorDia = new Map<string, number>();
for (const c of cafe) cafePorDia.set(c.dia, (cafePorDia.get(c.dia) ?? 0) + c.pessoas);
const prods = [...produtos].sort((a, b) => b[1].venda - a[1].venda);
const negativos = estoque.filter((e) => e.saldo < 0 && e.descricao);
const p4 = pagina("Hospedagem e operação", "ocupação, hospedagens, café, frigobar e estoque",
  kpis([["Ocupação média", pct(noitesVendidas, noites.length * VENDAVEIS), `${VENDAVEIS} aptos vendáveis (${BLOQ} bloqueados)`], ["Noites vendidas", String(noitesVendidas), "apto × noite"],
    ["Hóspedes-noite", String(soma(noites.map((n) => n.hosp))), "pessoas × noite"], ["Hospedagens", String(hospedagens.length), "no período"]]) +
  `<h2>Ocupação por noite</h2>` + tabela(["Noite", "", "Aptos", "Taxa", "Hóspedes", "Café na manhã seguinte"], noites.map((n) => {
    const seguinte = new Date(Date.parse(n.d + "T12:00:00Z") + 86_400_000).toISOString().slice(0, 10);
    const c = cafePorDia.get(seguinte);
    return [br(n.d), barra(n.aptos, VENDAVEIS, 150), String(n.aptos), pct(n.aptos, VENDAVEIS), String(n.hosp), c !== undefined ? String(c) : "—"];
  }), [2, 3, 4, 5]) +
  `<p class="fraco">Café = pessoas na lista de café do DataHotel na manhã seguinte à noite (lista disponível até ${br(cafe.length ? cafe.map((c) => c.dia).sort().pop()! : fim)}).</p>` +
  `<h2>Café da manhã</h2><p class="nota">Lista de Café da Manhã do DataHotel: quem pernoitou e toma café no dia.</p>` +
  tabela(["Dia", "Apartamentos", "Adultos", "Crianças", "Total"], [...new Set(cafe.map((c) => c.dia))].filter((d) => d >= inicio && d <= fim).sort().map((d) => {
    const x = cafe.filter((c) => c.dia === d);
    return [br(d), String(x.length), String(soma(x.map((c) => c.adultos))), String(soma(x.map((c) => c.criancas))), `<b>${soma(x.map((c) => c.pessoas))}</b>`];
  }), [1, 2, 3, 4], ["Total", String(cafe.filter((c) => c.dia >= inicio && c.dia <= fim).length), String(soma(cafe.filter((c) => c.dia >= inicio && c.dia <= fim).map((c) => c.adultos))), String(soma(cafe.filter((c) => c.dia >= inicio && c.dia <= fim).map((c) => c.criancas))), String(soma(cafe.filter((c) => c.dia >= inicio && c.dia <= fim).map((c) => c.pessoas)))]) +
  `<h2 class="quebra">Extrato das hospedagens</h2>` + tabela(["Apto", "Hóspede", "Entrada", "Saída", "Diárias", "Consumo", "Pago", "Saldo"], hospedagens.map((r) => {
    const s = r.diariaLancada + r.consumo - r.recebido;
    return [esc(r.apto), `${esc(nomeDe.get(r.codigo) ?? "")}<div class="fraco">${esc(r.codigo)} · ${esc(r.situacao)}</div>`, brCurto(r.checkin), brCurto(r.checkout), brl(r.diariaLancada), r.consumo ? brl(r.consumo) : "—", brl(r.recebido), s > 0 ? `<b style="color:#b42318">${brl(s)}</b>` : s < 0 ? `<span class="fraco">${brl(s)}</span>` : "—"];
  }), [4, 5, 6, 7], ["", "Total", "", "", brl(soma(hospedagens.map((r) => r.diariaLancada))), brl(soma(hospedagens.map((r) => r.consumo))), brl(soma(hospedagens.map((r) => r.recebido))), brl(pendente)]) +
  `<p class="fraco">Valores do extrato de cada reserva no DataHotel (a estadia inteira, mesmo quando começa antes ou termina depois do período).</p>` +
  `<h2>Frigobar e balcão — mais vendidos</h2>` + (prods.length ? tabela(["Produto", "Qtde.", "Custo", "Venda", "Margem"], prods.slice(0, 12).map(([n, p]) => [esc(titulo(n)), String(p.qtd), brl(p.custo), brl(p.venda), pct(p.venda - p.custo, p.venda)]), [1, 2, 3, 4],
    ["Total", String(soma(prods.map(([, p]) => p.qtd))), brl(soma(prods.map(([, p]) => p.custo))), brl(soma(prods.map(([, p]) => p.venda))), pct(soma(prods.map(([, p]) => p.venda - p.custo)), soma(prods.map(([, p]) => p.venda)))]) : "<p>Sem vendas no período.</p>") +
  `<p class="fraco">Consumo dos quartos + venda de balcão, até ${br(fatFim)}.</p>` +
  (negativos.length ? `<h2>Estoque com saldo negativo</h2><div class="card at"><b>${negativos.length} itens com estoque abaixo de zero</b><ul><li><b>O que fazer:</b> ${ACAO.C14}</li></ul></div>` +
    tabela(["Código", "Item", "Saldo"], negativos.sort((a, b) => a.saldo - b.saldo).map((e) => [esc(e.codigo), esc(titulo(e.descricao)), String(e.saldo)]), [2]) : ""));

// ------------------------------------------------------------------ PDFs
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
for (const [nome, html] of [["1_resumo_executivo", p1], ["2_conferencia_do_fechamento", p2], ["3_financeiro", p3], ["4_hospedagem_e_operacao", p4]] as const) {
  const h = join(saida, `${nome}.html`);
  writeFileSync(h, html, "utf8");
  execFileSync(EDGE, ["--headless", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${join(saida, nome + ".pdf")}`, h], { stdio: "ignore" });
  rmSync(h);
  console.log("PDF:", join(saida, nome + ".pdf"));
}
