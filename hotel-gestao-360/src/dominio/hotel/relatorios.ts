/**
 * Relatórios da Direção (Fernanda): 5 documentos HTML prontos para imprimir em PDF,
 * gerados a partir dos relatórios exportados do DataHotel e da conferência.
 * Usado pela tela "Relatórios em PDF" (servidor) e por scripts/relatorios-fernanda.mts.
 * Só lê: nenhum número é estimado; o que não vem do DataHotel aparece como "sem dado".
 */
import { lerContasRecebidasDataHotel, lerListaCafeDataHotel, lerMovimentoCaixaDataHotel, lerRelatorioReservasDataHotel, lerValor, normalizarForma } from "./importacao.js";
import { lerContasAReceber, lerEstoque, lerExtratoBanco, lerReservasPorEmpresa, lerFaturamentoDiario, recebimentosDeLinhas, reservasDeLinhas, type Fonte, type Resultado } from "./conferencia.js";

export interface ConferenciaResumo { inicio: string; fim: string; resumo: { ok: number; divergentes: number; atencao: number }; resultados: Resultado[] }
export interface Relatorio { nome: string; titulo: string; html: string }

/** Conta a pagar como o sistema guarda (lançada no Hotel 360, não vem do DataHotel). */
export interface ContaRelatorio { descricao: string; fornecedor: string | null; categoria: string; vencimento: string; valor: number; status: string; pago: number | null; dataPagamento: string | null; competencia: string }

/** Registros lançados no Hotel 360 (vindos da Direção), para os relatórios. */
export interface ExtrasRelatorio {
  receber: { empresa: string; nf: string; vencimento: string; previsao: string; valor: number; forma: string; observacoes: string }[];
  pendencias: { data: string; apto: string; tipo: string; descricao: string; solucao: string; responsavel: string; prazo: string; status: string }[];
  folha: { competencia: string; nome: string; funcao: string; vinculo: string; valorSalario: number; valorProdutividade: number; valorTicket: number; he50: string; he100: string; noturnas: string; atrasos: string; faltas: number; dataPagamento: string; observacoes: string }[];
  empresas: { total: number; incompletas: number };
  recorrentes?: { descricao: string; tipoConta: string; categoria: string; valorPrevisto: number; dia: number; fim?: string; observacoes?: string; ativa?: boolean }[];
}

export function gerarRelatorios(o: { texto: (f: Fonte) => string | null; conf: ConferenciaResumo; inicio: string; fim: string; hoje: string; contas?: ContaRelatorio[]; extras?: ExtrasRelatorio }): Relatorio[] {
  const { texto, conf, inicio, fim } = o;
  const HOJE = o.hoje;
  // ------------------------------------------------------------------ leitura
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

  const rec = recebimentosDeLinhas(lerContasRecebidasDataHotel(texto("recebidas") ?? "", inicio)?.linhas ?? []).filter((r) => r.dia >= inicio && r.dia <= fim);
  const textoReservas = texto("reservas"); // o agrupado por empresa não traz a Situação
  const resLinhas = textoReservas ? (lerRelatorioReservasDataHotel(textoReservas)?.linhas ?? []) : [];
  const nomeDe = new Map(resLinhas.map((l) => [l.codigo ?? "", titulo((l.hospede ?? "").trim().split(/\s+/).slice(0, 2).join(" "))]));
  const res = reservasDeLinhas(resLinhas).filter((r) => !/cancel/i.test(r.situacao));
  const fatDiario = lerFaturamentoDiario(texto("fatDiario") ?? "");
  const aReceber = lerContasAReceber(texto("aReceber") ?? "");
  const estoque = lerEstoque(texto("estoque") ?? "");
  const cafeR = lerListaCafeDataHotel(texto("cafe") ?? "", inicio);
  const cafe = (cafeR?.linhas ?? []).filter((l) => l.tipo !== "ANTECIPADO").map((l) => ({ dia: l.data!.split("/").reverse().join("-"), adultos: Number(l.adultos), criancas: Number(l.criancas), pessoas: Number(l.adultos) + Number(l.criancas) }));
  // Livro-caixa: entradas por dia e forma (o que a recepção registrou no caixa).
  const livro = (() => { const t = texto("caixa"); const r = t ? lerMovimentoCaixaDataHotel(t, inicio) : null; return r ? recebimentosDeLinhas(r.linhas).filter((x) => x.dia >= inicio && x.dia <= fim) : []; })();
  const APTOS = 31, BLOQ = 5, VENDAVEIS = APTOS - BLOQ;

  // Fechamentos de caixa (Resumo por Movimentação de Caixa): sessão e o que foi fechado por forma.
  const caixas: { numero: string; abertura: string; fechamento: string; formas: Map<string, number> }[] = [];
  {
    let atual: (typeof caixas)[number] | null = null;
    for (const linha of (texto("caixa") ?? "").split(/\r?\n/)) {
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
  for (const linha of (texto("vendas") ?? "").split(/\r?\n/)) {
    const c = linha.split(";").map((x) => x.trim()).filter(Boolean);
    // Linha de produto: nome + quantidade + custo (R$) + venda (R$). A unidade (UN) às vezes não vem.
    const ehValor = (x: string) => x.startsWith("R$");
    const iRs = c.findIndex(ehValor);
    if (iRs < 2 || /^(TOTAL|Data:|Produto|Per|Filtros|Emitido)/i.test(c[0]!) || c.filter(ehValor).length < 2) continue;
    const nome = c[0]!.trim(), qtd = Number(c[iRs - 1]), rs = c.filter(ehValor).map((x) => lerValor(x) ?? 0);
    if (!Number.isFinite(qtd)) continue;
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
  .topo{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #171A16;padding-bottom:10px;margin-bottom:18px}
  .marca{font-size:8pt;letter-spacing:.18em;text-transform:uppercase;color:#2F6B2B;font-weight:600}
  h1{font-size:20pt;margin:2px 0 0;color:#171A16;font-weight:600}.periodo{text-align:right;font-size:8.5pt;color:#6b7684;line-height:1.4}.periodo b{color:#171A16;font-size:10pt}
  h2{font-size:12pt;color:#171A16;margin:22px 0 8px;font-weight:600;page-break-after:avoid;display:flex;align-items:center;gap:8px}
  h2:before{content:"";width:4px;height:14px;background:#9CCB8F;border-radius:2px}
  .nota{color:#6b7684;font-size:8.5pt;margin:-4px 0 8px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.kpis.tres{grid-template-columns:repeat(3,1fr)}
  .k{background:#F4F5F1;border-radius:8px;padding:10px 12px}.k span{display:block;font-size:7.8pt;color:#6b7684;text-transform:uppercase;letter-spacing:.04em}
  .k b{display:block;font-size:15pt;color:#171A16;font-weight:600;margin:2px 0}.k i{font-style:normal;font-size:8pt;color:#6b7684}
  .k.alerta{background:#fdf0ef}.k.alerta b{color:#b42318}.k.ok b{color:#1e7d3a}
  table{width:100%;border-collapse:collapse;font-size:9pt}th{font-weight:600;color:#6b7684;font-size:7.6pt;text-transform:uppercase;letter-spacing:.04em;text-align:left;padding:5px 6px;border-bottom:1.5px solid #171A16}
  td{padding:5px 6px;border-bottom:1px solid #e6e9ee;vertical-align:top}tr{page-break-inside:avoid}.d{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  tfoot{display:table-row-group}tfoot td{font-weight:600;border-top:1.5px solid #171A16;border-bottom:0}.fraco{color:#6b7684;font-size:8.3pt}
  .pill{display:inline-block;padding:1px 8px;border-radius:10px;font-size:7.8pt;font-weight:600;white-space:nowrap}.p-ok{background:#e7f5ec;color:#1e7d3a}.p-div{background:#fdecea;color:#b42318}.p-at{background:#fff4dc;color:#94600a}
  .card{border:1px solid #e6e9ee;border-left:4px solid #b42318;border-radius:6px;padding:10px 12px;margin:8px 0;page-break-inside:avoid}.card.at{border-left-color:#9CCB8F}
  .card b{color:#171A16}.card ul{margin:4px 0 0;padding-left:16px;color:#3c4754;font-size:9pt}
  .grade{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .bar{height:8px;background:#9CCB8F;border-radius:4px;display:inline-block;vertical-align:middle}
  .rodape{margin-top:22px;padding-top:6px;border-top:1px solid #e6e9ee;font-size:7.5pt;color:#8a94a1;display:flex;justify-content:space-between}
  .quebra{page-break-before:always}`;
  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  const pagina = (t: string, sub: string, corpo: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(t)}</title><style>${CSS}</style></head><body>
  <div class="topo"><div><div class="marca">Acácia Hotel · Gestão</div><h1>${esc(t)}</h1></div><div class="periodo"><b>${br(inicio)} a ${br(fim)}</b><br>${esc(sub)}<br>gerado em ${geradoEm}</div></div>
  ${corpo}<div class="rodape"><span>Fonte: relatórios exportados do DataHotel (somente leitura; nada foi alterado lá).</span><span>Acácia Hotel · Gestão</span></div></body></html>`;
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


  // ------------------------------------------------------------------ banco (extrato BB × DataHotel)
  const extrato = texto("banco") ? lerExtratoBanco(texto("banco")!) : null;
  const somaPorDiaUtil = (a: string) => new Date(Date.parse(a + "T12:00:00Z") + 86_400_000).toISOString().slice(0, 10);
  function secaoBanco(): string {
    if (!extrato || !extrato.lancamentos.length) return `<h2>Conciliação bancária</h2><div class="card at"><b>Sem extrato bancário</b><ul><li>Envie o extrato do mês (PDF do BB) para conferir cartões, Pix e depósitos.</li></ul></div>`;
    const ult = extrato.lancamentos.map((l) => l.dia).sort().pop()!;
    const ini = somaPorDiaUtil(inicio), fimB = ult < somaPorDiaUtil(fim) ? ult : somaPorDiaUtil(fim);
    const L = extrato.lancamentos.filter((l) => l.dia >= ini && l.dia <= fimB);
    const bb = (re: RegExp) => soma(L.filter((l) => l.valor > 0 && re.test(l.historico)).map((l) => l.valor));
    const dh = (fs: string[]) => soma(rec.filter((r) => fs.includes(r.forma)).map((r) => r.valor));
    const linhas: [string, number, number, string][] = [
      ["Cartão de débito", dh(["DEBITO", "CARTAO_DEBITO"]), bb(/^Cielo Vendas D.bito/), "Cielo deposita no dia útil seguinte, já sem a taxa."],
      ["Cartão de crédito", dh(["CREDITO", "CARTAO_CREDITO"]), bb(/^Cielo (Antecipa|Vendas Cr)/), "Antecipação: cai no dia útil seguinte, com taxa maior."],
      ["Pix / transferência", dh(["PIX"]), bb(/^Pix - Recebido|^TED/), "No extrato todo Pix vem como ACACIA EMPR, sem o nome de quem pagou."],
      ["Dinheiro", dh(["DINHEIRO"]), bb(/^Dep dinheiro/), "Depósito no caixa eletrônico; pode juntar dias anteriores."],
    ];
    const conc = tabela(["Forma", "Vendido (DataHotel)", "Entrou no BB", "Diferença", "%", "Observação"], linhas.map(([f, a, b, o]) => [esc(f), brl(a), brl(b), `<b>${brl(b - a)}</b>`, a ? pct(b - a, a) : "—", `<span class="fraco">${esc(o)}</span>`]), [1, 2, 3, 4],
      ["Total", brl(soma(linhas.map((x) => x[1]))), brl(soma(linhas.map((x) => x[2]))), brl(soma(linhas.map((x) => x[2] - x[1]))), "", ""]);
    const grandes = L.filter((l) => l.valor >= 100_000 && /^Pix - Recebido|^TED/.test(l.historico));
    const saidas = new Map<string, number>();
    for (const l of L.filter((x) => x.valor < 0)) { const k = l.historico.replace(/\s+/g, " "); saidas.set(k, (saidas.get(k) ?? 0) + l.valor); }
    const saldos = extrato.meses.map((m) => [br(m.inicio), brl(m.saldoAnterior), brl(m.soma), brl(m.saldoFinal), m.saldoAnterior + m.soma === m.saldoFinal ? pill("OK") : pill("DIVERGENTE")]);
    return `<h2 class="quebra">Conciliação bancária — BB Acácia</h2><p class="nota">Vendido no DataHotel de ${br(inicio)} a ${br(fim)} × o que entrou na conta de ${br(ini)} a ${br(fimB)} (o banco recebe no dia útil seguinte, já sem as taxas da maquininha). Faturado para empresas fica fora: entra quando a empresa pagar.</p>` +
      conc +
      (grandes.length ? `<div class="card at"><b>Entradas grandes sem identificação</b><ul>${grandes.map((g) => `<li>${br(g.dia)} · ${brl(g.valor)} · ${esc(g.historico)} ${esc(g.detalhe)}</li>`).join("")}<li><b>O que fazer:</b> confirmar quem pagou (empresa? hóspede adiantado?) e dar baixa no recebimento certo.</li></ul></div>` : "") +
      `<p class="fraco">Para fechar centavo a centavo é preciso o relatório de vendas e recebíveis da Cielo (venda por venda, com taxa e data de crédito).</p>` +
      `<h2>Saídas da conta no período</h2>` + tabela(["Histórico", "Valor"], [...saidas].sort((a, b) => a[1] - b[1]).map(([h, v]) => [esc(h), brl(v)]), [1], ["Total", brl(soma([...saidas.values()]))]) +
      `<h2>Cada saída, com o favorecido</h2><p class="nota">Para conferir com as contas a pagar e a folha: quem recebeu cada Pix e cada débito.</p>` +
      tabela(["Dia", "Histórico", "Favorecido / referência", "Valor"], L.filter((l) => l.valor < 0).sort((a, b) => a.dia.localeCompare(b.dia)).map((l) => [br(l.dia), esc(l.historico), esc(l.detalhe.replace(/^\d\d\/\d\d \d\d:\d\d\s*/, "")), brl(l.valor)]), [3], ["Total", "", "", brl(soma(L.filter((l) => l.valor < 0).map((l) => l.valor)))]) +
      `<h2>Saldos do extrato</h2>` + tabela(["Mês desde", "Saldo anterior", "Lançamentos", "Saldo final", "Fecha?"], saldos, [1, 2, 3]);
  }

  // ------------------------------------------------------------------ contas a pagar (Hotel 360)
  const contas = o.contas ?? [];
  const STATUS: Record<string, string> = { RASCUNHO: "Rascunho", AGUARDANDO_APROVACAO: "Aguarda a Direção", APROVADO: "Aprovada, a pagar", AGENDADO: "Agendada", PAGO: "Paga", VENCIDO: "Vencida", CANCELADO: "Cancelada" };
  function secaoContas(): string {
    if (!contas.length) return `<h2 class="quebra">Contas a pagar</h2><div class="card at"><b>Nenhuma conta lançada</b><ul><li>Lance as notas e boletos em Contas a Pagar; a Direção autoriza e paga.</li></ul></div>`;
    const abertas = contas.filter((c) => !["PAGO", "CANCELADO"].includes(c.status)).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const vencidas = abertas.filter((c) => c.vencimento < HOJE);
    const pagas = contas.filter((c) => c.status === "PAGO").sort((a, b) => (a.dataPagamento ?? "").localeCompare(b.dataPagamento ?? ""));
    const porMes = new Map<string, { doc: number; pago: number; juros: number; n: number }>();
    for (const c of pagas) { const m = porMes.get(c.competencia) ?? { doc: 0, pago: 0, juros: 0, n: 0 }; m.doc += c.valor; m.pago += c.pago ?? c.valor; m.juros += (c.pago ?? c.valor) - c.valor; m.n++; porMes.set(c.competencia, m); }
    const porCat = new Map<string, number>();
    for (const c of contas.filter((x) => x.status !== "CANCELADO")) porCat.set(c.categoria, (porCat.get(c.categoria) ?? 0) + c.valor);
    return `<h2 class="quebra">Contas a pagar</h2><p class="nota">Lançadas no Hotel 360 (nota chega → lança → a Direção autoriza → paga).</p>` +
      kpis([["A pagar", brl(soma(abertas.map((c) => c.valor))), `${abertas.length} conta(s)`, abertas.length ? "alerta" : "ok"], ["Vencidas", brl(soma(vencidas.map((c) => c.valor))), `${vencidas.length} conta(s)`, vencidas.length ? "alerta" : ""],
        ["Pago", brl(soma(pagas.map((c) => c.pago ?? c.valor))), `${pagas.length} conta(s)`], ["Juros pagos", brl(soma(pagas.map((c) => (c.pago ?? c.valor) - c.valor))), "por atraso"]]) +
      (abertas.length ? `<h2>Em aberto (por vencimento)</h2>` + tabela(["Vencimento", "Conta", "Fornecedor", "Situação", "Valor"], abertas.map((c) => [c.vencimento < HOJE ? `<b style="color:#b42318">${br(c.vencimento)}</b>` : br(c.vencimento), esc(c.descricao), esc(c.fornecedor ?? "—"), esc(STATUS[c.status] ?? c.status), brl(c.valor)]), [4], ["Total", "", "", "", brl(soma(abertas.map((c) => c.valor)))]) : "") +
      `<h2>Pagas</h2>` + tabela(["Pago em", "Conta", "Fornecedor", "Vencimento", "Documento", "Pago", "Juros"], pagas.map((c) => [br(c.dataPagamento ?? ""), esc(c.descricao), esc(c.fornecedor ?? "—"), br(c.vencimento), brl(c.valor), brl(c.pago ?? c.valor), (c.pago ?? c.valor) - c.valor ? brl((c.pago ?? c.valor) - c.valor) : "—"]), [4, 5, 6],
        ["Total", "", "", "", brl(soma(pagas.map((c) => c.valor))), brl(soma(pagas.map((c) => c.pago ?? c.valor))), brl(soma(pagas.map((c) => (c.pago ?? c.valor) - c.valor)))]) +
      `<h2>Despesas por categoria</h2>` + tabela(["Categoria", "", "Valor"], [...porCat].sort((a, b) => b[1] - a[1]).map(([k, v]) => [esc(k), barra(v, Math.max(...porCat.values()), 200), brl(v)]), [2], ["Total", "", brl(soma([...porCat.values()]))]) +
      `<h2>Por mês de competência</h2>` + tabela(["Mês", "Contas pagas", "Documento", "Pago", "Juros"], [...porMes].sort().map(([m, x]) => [m.split("-").reverse().join("/"), String(x.n), brl(x.doc), brl(x.pago), brl(x.juros)]), [1, 2, 3, 4]);
  }

  // ------------------------------------------------------------------ extras da Direção (Hotel 360)
  const ex = o.extras;
  function secaoReceber(): string {
    if (!ex) return "";
    const t = soma(ex.receber.map((r) => r.valor));
    return `<h2 class="quebra">Empresas a receber</h2><p class="nota">Notas emitidas para empresas e ainda não pagas (lançadas no Hotel 360). ${ex.empresas.total} empresas conveniadas cadastradas, ${ex.empresas.incompletas} com cadastro incompleto.</p>` +
      tabela(["Empresa", "NF", "Vencimento", "Previsão", "Valor", "Situação da cobrança"], ex.receber.map((r) => [esc(r.empresa), esc(r.nf), r.vencimento ? (r.vencimento < HOJE ? `<b style="color:#b42318">${br(r.vencimento)}</b>` : br(r.vencimento)) : "sem data", r.previsao ? br(r.previsao) : "—", brl(r.valor), `<span class="fraco">${esc(r.observacoes)}</span>`]), [4], ["Total", "", "", "", brl(t), ""]);
  }
  function secaoRecorrentes(): string {
    const rs = (ex?.recorrentes ?? []).filter((r) => r.ativa !== false && (!r.fim || r.fim >= HOJE)).sort((a, b) => a.dia - b.dia);
    if (!rs.length) return "";
    const mes = HOJE.slice(0, 7), prox = new Date(Date.parse(mes + "-01T12:00:00Z") + 32 * 86_400_000).toISOString().slice(0, 7);
    const cal = (m: string) => rs.map((r) => [`${String(r.dia).padStart(2, "0")}/${m.slice(5)}/${m.slice(0, 4)}`, esc(r.descricao), r.tipoConta === "FIXA" ? "Fixa" : "Variável", esc(r.categoria), brl(r.valorPrevisto)]);
    const total = soma(rs.map((r) => r.valorPrevisto));
    return `<h2 class="quebra">Contas fixas e variáveis — calendário</h2><p class="nota">Previsão mensal com o valor e o dia de vencimento de setembro (planilha da Direção). Variável = o valor muda com o consumo. Pagar até o dia evita juros: em setembro foram R$ 162,68 de juros por atraso.</p>` +
      `<h2>${mes.split("-").reverse().join("/")}</h2>` + tabela(["Vencimento", "Conta", "Tipo", "Categoria", "Previsto"], cal(mes), [4], ["Total", "", "", "", brl(total)]) +
      `<h2>${prox.split("-").reverse().join("/")}</h2>` + tabela(["Vencimento", "Conta", "Tipo", "Categoria", "Previsto"], cal(prox), [4], ["Total", "", "", "", brl(total)]);
  }

  function secaoPendencias(): string {
    if (!ex) return "";
    const ab = ex.pendencias.filter((p) => p.status !== "Resolvida");
    return `<h2 class="quebra">Pendências de hospedagem</h2><p class="nota">Apontadas pela Direção e pela conferência; cada uma com o que fazer, quem e até quando.</p>` +
      (ab.length ? tabela(["Apto / data", "O que está errado", "O que fazer", "Quem / prazo"], ab.map((p) => [`<b>${esc(p.apto || "—")}</b><div class="fraco">${p.data ? br(p.data) : ""}</div>`, `<b>${esc(p.tipo)}</b><div>${esc(p.descricao)}</div>`, esc(p.solucao), `${esc(p.responsavel)}<div class="fraco">${p.prazo ? "até " + br(p.prazo) : ""}</div>`]), []) : "<p>Nenhuma pendência em aberto.</p>");
  }
  function secaoFolha(): string {
    if (!ex || !ex.folha.length) return "";
    const comps = [...new Set(ex.folha.map((f) => f.competencia))].sort();
    return comps.map((c) => { const fs = ex.folha.filter((f) => f.competencia === c);
      return `<h2 class="quebra">Funcionários e folha · ${c.split("-").reverse().join("/")}</h2><p class="nota">Planilha da Direção; a coluna "Trabalhado" vem direto do EZPoint (Resumo do Espelho de Pontos). Horas em h:mm.</p>` +
        tabela(["Funcionário", "Salário", "Produtiv.", "Ticket", "HE 50%", "HE 100%", "Noturnas", "Atrasos", "Faltas", "Trabalhado (EZPoint)", "Pago em"], fs.map((f) => { const p = (f as any).pontoEzpoint; return [`<b>${esc(f.nome)}</b><div class="fraco">${esc(f.funcao)} · ${esc(f.vinculo)}</div>`, brl(f.valorSalario), f.valorProdutividade ? brl(f.valorProdutividade) : "—", f.valorTicket ? brl(f.valorTicket) : "—", esc(f.he50), esc(f.he100), esc(f.noturnas), esc(f.atrasos), String(f.faltas), p ? `${esc(p.trabalhado)} de ${esc(p.aTrabalhar)}<div class="fraco">falta ${esc(p.faltas)} · DSR ${esc(p.dsrDescontar)}</div>` : "—", f.dataPagamento ? br(f.dataPagamento) : "—"]; }), [1, 2, 3, 4, 5, 6, 7, 8, 9],
          ["Total", brl(soma(fs.map((f) => f.valorSalario))), brl(soma(fs.map((f) => f.valorProdutividade))), brl(soma(fs.map((f) => f.valorTicket))), "", "", "", "", String(soma(fs.map((f) => f.faltas))), "", ""]) +
        `<h2>Observações da folha</h2><ul>${fs.filter((f) => f.observacoes).map((f) => `<li><b>${esc(f.nome)}:</b> ${esc(f.observacoes)}</li>`).join("")}</ul>`; }).join("");
  }

  // ------------------------------------------------------------------ empresa de cada reserva e previsão de recebimento
  const empresaDe = texto("reservasEmpresa") ? lerReservasPorEmpresa(texto("reservasEmpresa")!) : null;
  function secaoPrevisao(): string {
    // Previsão usa a exportação de reservas mais recente (a agrupada por empresa, quando houver).
    const tRes = texto("reservasEmpresa");
    const resAtual = tRes ? reservasDeLinhas(lerRelatorioReservasDataHotel(tRes)?.linhas ?? []).filter((r) => !/cancel/i.test(r.situacao)) : res;
    if (tRes) for (const l of lerRelatorioReservasDataHotel(tRes)?.linhas ?? []) if (!nomeDe.has(l.codigo ?? "")) nomeDe.set(l.codigo ?? "", titulo((l.hospede ?? "").trim().split(/\s+/).slice(0, 2).join(" ")));
    const abertas = resAtual.filter((r) => r.checkout >= HOJE && !/checked-out/i.test(r.situacao))
      .map((r) => ({ r, previsto: Math.max(r.vrTotal, r.diariaLancada + r.consumo) - r.recebido })).filter((x) => x.previsto > 0)
      .sort((a, b) => a.r.checkout.localeCompare(b.r.checkout));
    if (!abertas.length) return "";
    const formaDe = (cod: string) => { const e = empresaDe?.get(cod); return e ? `Faturar para ${e}` : empresaDe ? "Hóspede paga no check-out (forma escolhida na hora)" : "Sem dado de empresa"; };
    const porDia = new Map<string, number>(); for (const a of abertas) porDia.set(a.r.checkout, (porDia.get(a.r.checkout) ?? 0) + a.previsto);
    return `<h2 class="quebra">Previsão de recebimento</h2><p class="nota">Reservas e hospedagens em andamento: quanto falta receber, em que dia (data de saída) e de que forma. Valor = total da reserva no DataHotel menos o que já foi pago.</p>` +
      tabela(["Saída", "Apto", "Hóspede", "Situação", "Como recebe", "A receber"], abertas.map((a) => [br(a.r.checkout), esc(a.r.apto), esc(nomeDe.get(a.r.codigo) ?? "") + `<div class="fraco">${esc(a.r.codigo)}</div>`, esc(a.r.situacao), esc(formaDe(a.r.codigo)), brl(a.previsto)]), [5], ["Total", "", "", "", "", brl(soma(abertas.map((a) => a.previsto)))]) +
      `<h2>Previsto por dia</h2>` + tabela(["Dia", "Valor"], [...porDia].sort().map(([d, v]) => [br(d), brl(v)]), [1], ["Total", brl(soma([...porDia.values()]))]);
  }

  // ------------------------------------------------------------------ 3) financeiro
  const maxDia = Math.max(...porDia.values(), 1);
  const p3 = pagina("Financeiro", "recebimentos, caixa, faturamento e empresas",
    kpis([["Recebido", brl(total), `${rec.length} recebimentos`], ["Média por dia", brl(Math.round(total / dias(inicio, fim).length)), `${dias(inicio, fim).length} dias`],
      ["Faturado (empresas)", brl(faturado), pct(faturado, total) + " do recebido", faturado ? "alerta" : ""], ["Contas a receber lançadas", brl(aReceberTotal), `${aReceber.length} título(s)`]]) +
    `<h2>Recebido por dia</h2>` + tabela(["Dia", "", "Valor"], dias(inicio, fim).map((d) => { const v = porDia.get(d) ?? 0; return [br(d), barra(v, maxDia, 260), brl(v)]; }), [2], ["Total", "", brl(total)]) +
    `<div style="page-break-inside:avoid"><h2>Recebido por forma de pagamento</h2>` + tabela(["Forma", "", "Valor", "%"], [...porForma].sort((a, b) => b[1] - a[1]).map(([f, v]) => [esc(nomeForma(f)), barra(v, Math.max(...porForma.values()), 200), brl(v), pct(v, total)]), [2, 3], ["Total", "", brl(total), "100%"]) + "</div>" +
    secaoBanco() +
    secaoContas() +
    secaoReceber() +
    secaoRecorrentes() +
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
    `<p class="nota">Hospedagens lançadas como "Faturar empresa", com a empresa cadastrada na reserva do DataHotel.</p>` +
    tabela(["Data", "Reserva", "Hóspede", "Empresa", "Valor"], rec.filter((r) => r.forma === "FATURADO").sort((a, b) => a.dia.localeCompare(b.dia)).map((r) => [br(r.dia), esc(r.reserva || "—"), esc(titulo((r.reserva && nomeDe.get(r.reserva)) || r.pagador || "")), empresaDe ? (empresaDe.get(r.reserva) ? `<b>${esc(empresaDe.get(r.reserva)!)}</b>` : '<span style="color:#b42318">sem empresa na reserva</span>') : "—", brl(r.valor)]), [4], ["Total", "", "", "", brl(faturado)]) +
    (empresaDe ? (() => { const g = new Map<string, number>(); for (const r of rec.filter((x) => x.forma === "FATURADO")) { const e = empresaDe.get(r.reserva) || "Sem empresa na reserva (corrigir no DataHotel)"; g.set(e, (g.get(e) ?? 0) + r.valor); }
      return `<h2>Faturado por empresa</h2><p class="nota">O que é de empresa vai para a empresa: soma do "Faturar empresa" pela empresa cadastrada na reserva do DataHotel.</p>` + tabela(["Empresa", "Valor"], [...g].sort((a, b) => b[1] - a[1]).map(([e, v]) => [esc(e), brl(v)]), [1], ["Total", brl(faturado)]); })() : "") +
    secaoPrevisao() +
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
    }), [4, 5, 6, 7], ["", "Total", "", "", brl(soma(hospedagens.map((r) => r.diariaLancada))), brl(soma(hospedagens.map((r) => r.consumo))), brl(soma(hospedagens.map((r) => r.recebido))), brl(soma(hospedagens.map((r) => r.diariaLancada + r.consumo - r.recebido)))]) +
  `<p class="fraco">Saldo total = a receber ${brl(pendente)} menos pago a mais ${brl(soma(hospedagens.map((r) => r.diariaLancada + r.consumo - r.recebido).filter((s) => s < 0)).toString().startsWith("-") ? -soma(hospedagens.map((r) => r.diariaLancada + r.consumo - r.recebido).filter((s) => s < 0)) : 0)} (hóspede que pagou adiantado e segue hospedado).</p>` +
    `<p class="fraco">Valores do extrato de cada reserva no DataHotel (a estadia inteira, mesmo quando começa antes ou termina depois do período).</p>` +
    `<h2>Frigobar e balcão — mais vendidos</h2>` + (prods.length ? tabela(["Produto", "Qtde.", "Custo", "Venda", "Margem"], prods.slice(0, 12).map(([n, p]) => [esc(titulo(n)), String(p.qtd), brl(p.custo), brl(p.venda), pct(p.venda - p.custo, p.venda)]), [1, 2, 3, 4],
      ["Total", String(soma(prods.map(([, p]) => p.qtd))), brl(soma(prods.map(([, p]) => p.custo))), brl(soma(prods.map(([, p]) => p.venda))), pct(soma(prods.map(([, p]) => p.venda - p.custo)), soma(prods.map(([, p]) => p.venda)))]) : "<p>Sem vendas no período.</p>") +
    `<p class="fraco">Consumo dos quartos + venda de balcão, até ${br(fatFim)}.</p>` +
    (negativos.length ? `<h2>Estoque com saldo negativo</h2><div class="card at"><b>${negativos.length} itens com estoque abaixo de zero</b><ul><li><b>O que fazer:</b> ${ACAO.C14}</li></ul></div>` +
      tabela(["Código", "Item", "Saldo"], negativos.sort((a, b) => a.saldo - b.saldo).map((e) => [esc(e.codigo), esc(titulo(e.descricao)), String(e.saldo)]), [2]) : "") +
    secaoPendencias() + secaoFolha());

  // ------------------------------------------------------------------ 5) todos os itens pedidos
  // Cada item do pedido da Fernanda: onde está nos relatórios ou por que ainda não tem dado.
  const S = { ok: '<span class="pill p-ok">No relatório</span>', parcial: '<span class="pill p-at">Parcial</span>', sem: '<span class="pill p-div">Sem dado</span>' };
  const ITENS: [string, string, string][] = [
    ["Extrato diário de hospedagem", S.ok, "Relatório 4 · Extrato das hospedagens (diárias, consumo, pago e saldo de cada reserva)."],
    ["Taxa de ocupação (bloqueados fora da conta)", S.ok, `Relatório 4 · Ocupação por noite, sobre ${VENDAVEIS} aptos vendáveis.`],
    ["Relatório diário (situação do dia)", S.ok, "Relatórios 1 e 4 · ocupação, hóspedes, recebido do dia e saldos."],
    ["Café da manhã (adultos, crianças, previstos)", S.ok, "Relatório 4 · Café da manhã por dia, com adultos e crianças, e café × ocupação."],
    ["Enxoval e governança", S.sem, "O DataHotel não controla enxoval. Precisa ser lançado pela governança no Hotel 360."],
    ["Fechamento diário de caixa por forma de pagamento", S.ok, "Relatório 3 · Caixa dia a dia e Fechamentos de caixa (livro-caixa até o último caixa fechado)."],
    ["Faturado × recebido", S.ok, "Relatórios 1 e 3 · recebido em caixa e bancos separado do faturado para empresas."],
    ["Conciliação de cartões e depósitos (taxas, antecipação)", extrato ? S.parcial : S.sem, extrato ? "Relatório 3 · Conciliação bancária BB × DataHotel por forma. Falta o relatório da Cielo para fechar venda por venda." : "Precisa do extrato bancário e do relatório da maquininha (Cielo)."],
    ["Faturamento mensal das empresas", empresaDe && ex ? S.ok : S.parcial, empresaDe ? `Relatório 3 · faturado por hospedagem com a empresa da reserva, soma por empresa e títulos a receber${ex ? `; ${ex.empresas.total} empresas com regras de faturamento cadastradas` : ""}.` : "Relatório 3 · faturado por hospedagem. Falta o Relatório de Reservas agrupado por Empresas para saber a empresa de cada uma."],
    ["Previsão de recebimento por reserva (dia, forma, valor)", res.length ? S.ok : S.sem, "Relatório 3 · Previsão de recebimento: cada reserva com a data de saída, se é faturada para empresa ou paga no check-out, e quanto falta receber."],
    ["Notas fiscais e boletos", ex?.receber.length ? S.parcial : S.sem, ex?.receber.length ? `Relatório 3 · Empresas a receber: ${ex.receber.length} notas em aberto com número, valor, vencimento e cobrança. As notas e boletos são emitidos fora do DataHotel; a data de emissão de cada nota não veio.` : "Nenhuma fatura, NFS-e ou boleto emitido no DataHotel no período."],
    ["Cobrança das empresas", ex ? S.ok : S.parcial, ex ? "Relatório 3 · Empresas a receber: NF, vencimento, previsão e situação da cobrança de cada título." : "Relatórios 1 e 3 · valor sem cobrança apontado; contas a receber lançadas listadas."],
    ["Frigobar (vendas, margem, não cobrados)", S.ok, "Relatório 4 · produtos vendidos, custo, venda e margem; consumo por hospedagem no extrato."],
    ["Estoque", S.parcial, `Relatório 4 · itens com saldo negativo (posição de ${br("2026-11-06")}).`],
    ["Fornecedores e contas a pagar", contas.length ? S.ok : S.sem, contas.length ? `Relatório 3 · Contas a pagar: em aberto, vencidas, pagas com juros e por categoria (${contas.length} contas lançadas no Hotel 360).` : "O Contas a Pagar do DataHotel está vazio. Precisa ser lançado no Hotel 360."],
    ["Despesas fixas e variáveis / calendário", ex?.recorrentes?.length ? S.ok : contas.length ? S.parcial : S.sem, ex?.recorrentes?.length ? `Relatório 3 · calendário do mês e do próximo com ${ex.recorrentes.length} contas fixas/variáveis (valores de setembro), despesas por categoria e por mês. Telefone: sem conta na planilha.` : contas.length ? "Relatório 3 · despesas por categoria e por mês. Falta marcar quais são fixas com o dia de vencimento." : "Sem despesas lançadas."],
    ["Fluxo de caixa realizado × previsto", S.parcial, "Realizado: Relatório 3 (recebido por dia). Previsto depende das contas a pagar e a receber lançadas."],
    ["Conferência e divergências do fechamento", S.ok, "Relatório 2 · tudo o que bate, divergências e pontos de atenção com o que fazer."],
    ["Funcionários, ponto, banco de horas e diárias", ex && ex.folha.length ? S.parcial : S.sem, ex && ex.folha.length ? "Relatório 4 · folha do mês com salário, produtividade, ticket, horas extras, noturnas, atrasos e faltas. Falta: admissão, agência/conta e o saldo do banco de horas (EZPoint)." : "Não vêm do DataHotel; dependem do cadastro e do ponto lançados no Hotel 360."],
    ["Fechamento do mês", S.parcial, "Novembro ainda está em andamento; os relatórios cobrem de 26/10 até hoje."],
  ];
  const p5 = pagina("Itens pedidos pela Direção", "onde está cada item e o que ainda falta",
    kpis([["No relatório", String(ITENS.filter((i) => i[1] === S.ok).length), "itens completos", "ok"], ["Parcial", String(ITENS.filter((i) => i[1] === S.parcial).length), "dado incompleto na origem"], ["Sem dado", String(ITENS.filter((i) => i[1] === S.sem).length), "precisa ser lançado", "alerta"]], "tres") +
    `<h2>Checklist</h2>` + tabela(["Item pedido", "Situação", "Onde está / o que falta"], ITENS.map(([a, b, c]) => [`<b>${esc(a)}</b>`, b, esc(c)]), []));


  return [
    { nome: "1_resumo_executivo", titulo: "Resumo executivo", html: p1 },
    { nome: "2_conferencia_do_fechamento", titulo: "Conferência do fechamento", html: p2 },
    { nome: "3_financeiro", titulo: "Financeiro", html: p3 },
    { nome: "4_hospedagem_e_operacao", titulo: "Hospedagem e operação", html: p4 },
    { nome: "5_itens_pedidos", titulo: "Itens pedidos pela Direção", html: p5 },
  ];
}
