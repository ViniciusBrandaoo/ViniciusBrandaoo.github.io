/* ============================================================================
   Painel do Hotel e Relatórios em PDF para a Direção (Fernanda).

   O painel resume o período: recebido por forma e por dia, ocupação, café,
   saldo de hospedagens e a última conferência do fechamento.
   Os relatórios abrem numa janela própria, prontos para "Salvar como PDF",
   e geram o texto curto para mandar por WhatsApp ou e-mail.
   Tudo aqui só lê: os números vêm de L.estado (banco) e da conferência gravada.
   ========================================================================== */
(function () {
  var H = L.hotel;
  var brl = L.brl;
  var diaBR = function (iso) { return iso ? String(iso).split("-").reverse().join("/") : ""; };
  var quando = function (iso) { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); };
  var esc = U.esc;
  var FORMAS = { DINHEIRO: "Dinheiro", PIX: "Pix", CARTAO_CREDITO: "Cartão de crédito", CARTAO_DEBITO: "Cartão de débito",
    FATURADO: "Faturado (empresa)", TRANSFERENCIA: "Transferência", BOLETO: "Boleto", DEPOSITO: "Depósito", DEBITO: "Cartão de débito", CREDITO: "Cartão de crédito", OUTRO: "Outro" };
  var nomeForma = function (f) { return FORMAS[f] || String(f || "Outro").replace(/_/g, " ").toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }); };
  var SIT = { OK: "Bate", DIVERGENTE: "Divergente", ATENCAO: "Atenção" };

  // Menu: Painel abre o grupo Hotel; Relatórios logo depois da Conferência.
  var NOVOS = [
    { grupo: "Hotel", chave: "painelhotel", nome: "Painel do Hotel", icone: "relatorios" },
    { grupo: "Hotel", chave: "relatorioshotel", nome: "Relatórios em PDF", icone: "documentos" }
  ];
  var iHotel = T.MODULOS.findIndex(function (m) { return m.grupo === "Hotel"; });
  T.MODULOS.splice(iHotel, 0, NOVOS[0]);
  var iConf = T.MODULOS.findIndex(function (m) { return m.chave === "conferencia"; });
  T.MODULOS.splice(iConf + 1, 0, NOVOS[1]);
  NOVOS.forEach(function (m) { T.ICONES_MODULO[m.chave] = m.icone; T.MODULOS_DELEGAVEIS.push(m); });
  ["FINANCEIRO", "RECEPCAO"].forEach(function (p) {
    var x = T.PERFIS[p];
    if (x && x.modulos !== "*") NOVOS.forEach(function (m) { if (x.modulos.indexOf(m.chave) === -1) x.modulos.push(m.chave); });
  });

  // Sistema enxuto para o hotel: o início é o Painel do Hotel, e as telas herdadas
  // da plataforma escolar que o hotel não usa saem do menu (continuam acessíveis
  // pela busca e por Configuração, nada é apagado).
  var FORA_DO_MENU = ["aprovacoes", "eventos", "contratos", "documentos", "relatorios", "fechamento", "solicitacoes", "ferias", "painelhotel"];
  T.MODULOS.forEach(function (m) { if (FORA_DO_MENU.indexOf(m.chave) !== -1) m.oculto = true; });
  var dash = T.MODULOS.find(function (m) { return m.chave === "dashboard"; });
  if (dash) { dash.nome = "Painel do Hotel"; dash.grupo = "Hotel"; }
  // Hotel primeiro no menu, na ordem do dia a dia da Fernanda.
  var ORDEM = ["dashboard", "conferencia", "relatorioshotel", "importacoes", "hospedagem", "caixa", "empresas", "cafe", "frigobar", "governanca", "fechamentomes"];
  var hotel = ORDEM.map(function (k) { return T.MODULOS.find(function (m) { return m.chave === k; }); }).filter(Boolean);
  hotel.forEach(function (m) { m.grupo = "Hotel"; T.MODULOS.splice(T.MODULOS.indexOf(m), 1); });
  T.MODULOS.unshift.apply(T.MODULOS, hotel);
  // Na barra lateral, só o que a Fernanda pediu: as telas do hotel.
  T.MODULOS.forEach(function (m) { if (ORDEM.indexOf(m.chave) === -1 && ["acessos", "hotelconfig"].indexOf(m.chave) === -1) m.oculto = true; });

  // ------------------------------------------------------------ dados

  var ST = T._painelHotel = { lista: null, ultima: null, carregando: false, erro: null };
  function carregarConferencia() {
    if (ST.carregando || !L.USA_BACKEND) return;
    ST.carregando = true;
    L.api.get("/api/hotel/conferencias").then(function (r) {
      ST.lista = r.conferencias || [];
      var u = ST.lista[0];
      return u ? L.api.get("/api/hotel/conferencias/" + u.id).then(function (c) { ST.ultima = c; }) : null;
    }).catch(function (e) { ST.lista = []; ST.erro = e.message; })
      .then(function () { ST.carregando = false; if (T.atual === "painelhotel" || T.atual === "dashboard" || T.atual === "relatorioshotel") T.renderizar(); });
  }

  function periodo() {
    var fim = T.filtros.phFim || L.hoje();
    var ini = T.filtros.phInicio || "2026-10-26";
    return { ini: ini, fim: fim };
  }
  function dias(ini, fim) { var out = [], d = ini; while (d <= fim && out.length < 400) { out.push(d); d = H.addDias(d, 1); } return out; }

  function calcular(ini, fim) {
    var recs = L.estado.recebimentos.filter(function (r) { return r.data >= ini && r.data <= fim && r.status !== "CANCELADO" && r.tipo !== "SAIDA_CAIXA"; });
    var porForma = {}, porDia = {};
    recs.forEach(function (r) {
      var v = r.valorBruto || 0;
      porForma[r.forma || "OUTRO"] = (porForma[r.forma || "OUTRO"] || 0) + v;
      porDia[r.data] = (porDia[r.data] || 0) + v;
    });
    var total = recs.reduce(function (a, r) { return a + (r.valorBruto || 0); }, 0);
    var hs = L.estado.hospedagens.filter(function (h) { return h.checkin <= fim && (h.checkoutRealizado || h.checkout) >= ini && h.status !== "CANCELADA"; });
    var saldos = hs.map(function (h) { return Object.assign({ h: h }, H.valoresHospedagem(h)); }).filter(function (x) { return x.pendente > 0; })
      .sort(function (a, b) { return b.pendente - a.pendente; });
    var ocup = dias(ini, fim).map(function (d) { var o = H.ocupacao(d); return { dia: d, ocupados: o.ocupados, taxa: o.taxa, hospedes: o.hospedes, entradas: o.entradas, saidas: o.saidas }; });
    var cafe = dias(ini, fim).map(function (d) {
      var c = (L.estado.cafeLista || []).filter(function (r) { return r.data === d && r.tipo !== "ANTECIPADO"; });
      return { dia: d, aptos: c.length, adultos: c.reduce(function (a, r) { return a + (r.adultos || 0); }, 0), criancas: c.reduce(function (a, r) { return a + (r.criancas || 0); }, 0) };
    }).filter(function (c) { return c.aptos; });
    return {
      ini: ini, fim: fim, total: total, qtd: recs.length,
      formas: Object.keys(porForma).map(function (f) { return { forma: f, valor: porForma[f] }; }).sort(function (a, b) { return b.valor - a.valor; }),
      dias: Object.keys(porDia).sort().map(function (d) { return { dia: d, valor: porDia[d] }; }),
      saldos: saldos, pendente: saldos.reduce(function (a, x) { return a + x.pendente; }, 0),
      faturar: recs.filter(function (r) { return r.forma === "FATURADO"; }).reduce(function (a, r) { return a + (r.valorBruto || 0); }, 0),
      hospedagens: hs.length, ocup: ocup, cafe: cafe, hoje: H.ocupacao(L.hoje())
    };
  }

  function barras(itens, rot, val) {
    var max = itens.reduce(function (m, x) { return Math.max(m, val(x)); }, 0) || 1;
    return '<div style="padding:8px 20px 16px">' + itens.map(function (x) {
      var w = Math.max(1, Math.round(val(x) / max * 100));
      return '<div style="display:grid;grid-template-columns:minmax(90px,160px) 1fr auto;gap:10px;align-items:center;margin:6px 0">' +
        '<span class="secundario">' + esc(rot(x)) + '</span><span style="height:12px;border-radius:6px;background:var(--orbital,#c9a227);width:' + w + '%"></span>' +
        '<strong style="font-variant-numeric:tabular-nums">' + brl(val(x)) + "</strong></div>";
    }).join("") + "</div>";
  }

  function filtroPeriodo(prefixo) {
    var p = periodo();
    return '<div class="painel" style="padding:12px 20px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">' +
      '<label>De <input type="date" id="' + prefixo + '-ini" value="' + esc(p.ini) + '"></label>' +
      '<label>até <input type="date" id="' + prefixo + '-fim" value="' + esc(p.fim) + '"></label>' +
      '<button class="botao miudo" data-acao="ph-periodo" data-id="' + prefixo + '">Aplicar</button></div>';
  }
  T.acoes["ph-periodo"] = function (prefixo) {
    var i = U.el(prefixo + "-ini"), f = U.el(prefixo + "-fim");
    if (i && i.value) T.filtros.phInicio = i.value;
    if (f && f.value) T.filtros.phFim = f.value;
    T.renderizar();
  };

  // ------------------------------------------------------------ painel

  T.telas.painelhotel = function () {
    if (ST.lista === null) carregarConferencia();
    var p = periodo(), c = calcular(p.ini, p.fim), u = ST.ultima;
    var html = T.cabecalho("Painel do Hotel", "Resumo do período com os dados importados do DataHotel e a última conferência do fechamento.");
    html += filtroPeriodo("ph");
    html += '<div class="grade-kpi">' + [
      { rotulo: "Recebido no período", valor: brl(c.total), nota: c.qtd + " recebimento(s)", destino: "caixa" },
      { rotulo: "Ocupação hoje", valor: Math.round(c.hoje.taxa * 100) + "%", nota: c.hoje.ocupados + " de " + c.hoje.total + " aptos · " + c.hoje.hospedes + " hóspede(s)", destino: "hospedagem" },
      { rotulo: "Saldo a receber de hospedagens", valor: brl(c.pendente), nota: c.saldos.length + " hospedagem(ns)", tom: c.pendente ? "atencao" : "" },
      { rotulo: "Faturado para empresas", valor: brl(c.faturar), nota: "a cobrar das empresas (conferir faturas)", tom: c.faturar ? "atencao" : "", destino: "empresas" },
      { rotulo: "Última conferência", valor: u ? u.divergentes + " divergente(s)" : "—", nota: u ? u.ok + " batem · " + u.atencao + " atenção · " + quando(u.criadoEm) : (ST.carregando ? "carregando…" : "nenhuma ainda"), tom: u && u.divergentes ? "critico" : "", destino: "conferencia" }
    ].map(U.kpiHtml).join("") + "</div>";

    html += '<div class="grade-2">' +
      U.painelHtml("Recebido por forma de pagamento", diaBR(p.ini) + " a " + diaBR(p.fim), c.formas.length ? barras(c.formas, function (x) { return nomeForma(x.forma); }, function (x) { return x.valor; }) : '<p class="secundario" style="padding:16px 20px">Sem recebimentos no período.</p>') +
      U.painelHtml("Recebido por dia", "", c.dias.length ? barras(c.dias, function (x) { return diaBR(x.dia); }, function (x) { return x.valor; }) : '<p class="secundario" style="padding:16px 20px">Sem recebimentos no período.</p>') +
      "</div>";

    if (u) {
      var probl = (u.resultado || []).filter(function (r) { return r.situacao !== "OK"; });
      html += U.painelHtml("O que a última conferência apontou", diaBR(u.inicio) + " a " + diaBR(u.fim), probl.length ? U.tabelaHtml([
        { rotulo: "Regra", conteudo: function (r) { return esc(r.regra); } },
        { rotulo: "O quê", conteudo: function (r) { return "<strong>" + esc(r.titulo) + '</strong><div class="secundario">' + esc((r.detalhes || []).slice(0, 2).join(" ")) + "</div>"; } },
        { rotulo: "Situação", direita: true, conteudo: function (r) { return '<span class="pastilha ' + (r.situacao === "DIVERGENTE" ? "critico" : "atencao") + '">' + SIT[r.situacao] + "</span>"; } }
      ], probl, {}) : '<p style="padding:16px 20px">Tudo bateu.</p>');
    }

    html += U.painelHtml("Hospedagens com saldo a receber", c.saldos.length + " no período", U.tabelaHtml([
      { rotulo: "Apto", conteudo: function (x) { return esc(x.h.apartamento); } },
      { rotulo: "Hóspede / reserva", conteudo: function (x) { return esc(x.h.hospede || "—") + '<div class="secundario">' + esc(x.h.codigoOrigem || x.h.codigo || "") + " · " + diaBR(x.h.checkin) + " a " + diaBR(x.h.checkoutRealizado || x.h.checkout) + "</div>"; } },
      { rotulo: "Total", direita: true, conteudo: function (x) { return brl(x.total); } },
      { rotulo: "Pago", direita: true, conteudo: function (x) { return brl(x.pago); } },
      { rotulo: "Falta", direita: true, conteudo: function (x) { return "<strong>" + brl(x.pendente) + "</strong>" + (x.situacao === "FATURAR" ? '<div class="secundario">faturar</div>' : ""); } }
    ], c.saldos, { tituloVazio: "Nenhuma hospedagem com saldo" }));

    html += '<div class="painel" style="padding:14px 20px"><button class="botao" data-ir="relatorioshotel">Gerar relatório em PDF para a Fernanda</button></div>';
    return html;
  };

  // ------------------------------------------------------------ relatórios

  var SECOES = [
    ["conferencia", "Conferência do fechamento (o que bate e o que não bate)"],
    ["recebimentos", "Recebimentos por forma de pagamento e por dia"],
    ["saldos", "Hospedagens com saldo a receber"],
    ["ocupacao", "Ocupação por dia"],
    ["cafe", "Café da manhã por dia"]
  ];
  T.filtros.relSecoes = T.filtros.relSecoes || { conferencia: true, recebimentos: true, saldos: true, ocupacao: true, cafe: true };

  T.telas.relatorioshotel = function () {
    if (ST.lista === null) carregarConferencia();
    var html = T.cabecalho("Relatórios em PDF", "Escolha o período e o que entra. O relatório abre pronto para imprimir ou salvar em PDF (no Edge: Imprimir → Salvar como PDF).");
    html += filtroPeriodo("rh");
    var sel = T.filtros.relSecoes;
    var confs = ST.lista || [];
    html += U.painelHtml("O que entra no relatório", "", '<div style="padding:12px 20px 18px">' +
      SECOES.map(function (s) { return '<label style="display:block;margin:6px 0"><input type="checkbox" class="rel-secao" value="' + s[0] + '"' + (sel[s[0]] ? " checked" : "") + "> " + esc(s[1]) + "</label>"; }).join("") +
      '<label style="display:block;margin:14px 0 0">Conferência usada: <select id="rel-conf">' +
      (confs.length ? confs.map(function (c, i) { return '<option value="' + esc(c.id) + '"' + (i === 0 ? " selected" : "") + ">" + esc(quando(c.criadoEm) + " · " + diaBR(c.inicio) + " a " + diaBR(c.fim) + " · " + c.divergentes + " divergente(s)") + "</option>"; }).join("") : '<option value="">' + (ST.carregando ? "carregando…" : "nenhuma conferência feita") + "</option>") +
      "</select></label>" +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><button class="botao" data-acao="rel-pdf">Gerar PDF</button>' +
      '<button class="botao secundario" data-acao="rel-msg">Copiar mensagem (WhatsApp / e-mail)</button></div></div>');
    return html;
  };

  function secoesMarcadas() {
    var s = {};
    Array.prototype.forEach.call(document.querySelectorAll(".rel-secao"), function (cb) { s[cb.value] = cb.checked; });
    T.filtros.relSecoes = s;
    return s;
  }
  function conferenciaEscolhida() {
    var id = (U.el("rel-conf") || {}).value;
    if (!id) return Promise.resolve(null);
    if (ST.ultima && ST.ultima.id === id) return Promise.resolve(ST.ultima);
    return L.api.get("/api/hotel/conferencias/" + id);
  }

  function mensagem(c, conf) {
    var l = ["Relatório do hotel · " + diaBR(c.ini) + " a " + diaBR(c.fim), "",
      "Recebido: " + brl(c.total) + " (" + c.qtd + " recebimentos)"];
    c.formas.forEach(function (f) { l.push("  • " + nomeForma(f.forma) + ": " + brl(f.valor)); });
    l.push("Saldo a receber de hospedagens: " + brl(c.pendente) + (c.faturar ? " ; faturado para empresas no período: " + brl(c.faturar) + "" : ""));
    l.push("Ocupação hoje: " + Math.round(c.hoje.taxa * 100) + "% (" + c.hoje.ocupados + " de " + c.hoje.total + ")");
    if (conf) {
      l.push("", "Conferência do fechamento (" + diaBR(conf.inicio) + " a " + diaBR(conf.fim) + "): " + conf.ok + " batem, " + conf.divergentes + " divergente(s), " + conf.atencao + " com atenção.");
      (conf.resultado || []).filter(function (r) { return r.situacao !== "OK"; }).forEach(function (r) {
        l.push("  • " + SIT[r.situacao] + " — " + r.titulo + ((r.detalhes || [])[0] ? ": " + r.detalhes[0] : ""));
      });
    }
    l.push("", "O relatório completo vai em PDF.");
    return l.join("\n");
  }

  T.acoes["rel-msg"] = function () {
    var p = periodo(), c = calcular(p.ini, p.fim);
    secoesMarcadas();
    conferenciaEscolhida().then(function (conf) {
      var txt = mensagem(c, conf);
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { U.avisar("Mensagem copiada. Cole no WhatsApp ou no e-mail da Fernanda."); })
        .catch(function () { window.prompt("Copie a mensagem:", txt); });
    }).catch(function (e) { U.avisar(e.message); });
  };

  T.acoes["rel-pdf"] = function () {
    var p = periodo(), c = calcular(p.ini, p.fim), s = secoesMarcadas();
    // Abre a janela já no clique (bloqueador de pop-up) e preenche depois.
    var w = window.open("", "_blank");
    if (!w) { U.avisar("O navegador bloqueou a janela do relatório. Permita pop-ups para este site."); return; }
    w.document.write("<p style='font-family:sans-serif;padding:20px'>Montando o relatório…</p>");
    conferenciaEscolhida().then(function (conf) {
      w.document.open(); w.document.write(documento(c, s, conf)); w.document.close();
      setTimeout(function () { try { w.focus(); w.print(); } catch (e) { /* o usuário imprime pelo botão */ } }, 400);
    }).catch(function (e) { w.close(); U.avisar(e.message); });
  };

  function tabela(cab, linhas, direita) {
    return "<table><thead><tr>" + cab.map(function (h, i) { return "<th" + (direita && direita.indexOf(i) !== -1 ? ' class="d"' : "") + ">" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      (linhas.length ? linhas.map(function (l) { return "<tr>" + l.map(function (v, i) { return "<td" + (direita && direita.indexOf(i) !== -1 ? ' class="d"' : "") + ">" + v + "</td>"; }).join("") + "</tr>"; }).join("")
        : '<tr><td colspan="' + cab.length + '" class="vazio">Nada no período.</td></tr>') + "</tbody></table>";
  }

  function documento(c, s, conf) {
    var u = (L.estado.usuario && L.estado.usuario.nome) || (T.usuario && T.usuario.nome) || "";
    var h = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório do Hotel ' + diaBR(c.ini) + " a " + diaBR(c.fim) + "</title><style>" +
      "@page{size:A4;margin:14mm}body{font:11pt/1.45 'Segoe UI',Roboto,Arial,sans-serif;color:#1b2430;margin:0}" +
      "header{border-bottom:3px solid #0B2547;padding-bottom:8px;margin-bottom:14px}h1{font-size:18pt;margin:0;color:#0B2547}" +
      ".sub{color:#5a6573;font-size:9.5pt}h2{font-size:13pt;color:#0B2547;margin:20px 0 8px;page-break-after:avoid}" +
      "table{width:100%;border-collapse:collapse;font-size:9.5pt;margin-bottom:6px}th,td{border-bottom:1px solid #d9dee5;padding:5px 6px;text-align:left;vertical-align:top}" +
      "th{background:#f1f3f6;font-weight:600}.d{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}tr{page-break-inside:avoid}" +
      ".kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.k{border:1px solid #d9dee5;border-radius:6px;padding:8px}.k b{display:block;font-size:13pt;color:#0B2547}" +
      ".ok{color:#1e7d3a;font-weight:600}.div{color:#b42318;font-weight:700}.at{color:#a15c00;font-weight:600}.vazio{color:#7a8491;text-align:center}" +
      "ul{margin:4px 0 0;padding-left:16px}footer{margin-top:24px;color:#7a8491;font-size:8.5pt;border-top:1px solid #d9dee5;padding-top:6px}" +
      ".barra{position:sticky;top:0;background:#fff8e6;padding:10px;text-align:center;font:10pt sans-serif}@media print{.barra{display:none}}" +
      "</style></head><body>" +
      '<div class="barra">Para salvar: <button onclick="print()">Imprimir / Salvar como PDF</button></div>' +
      "<header><h1>Hotel · Relatório do período</h1><div class=\"sub\">" + diaBR(c.ini) + " a " + diaBR(c.fim) + " · gerado em " + esc(new Date().toLocaleString("pt-BR")) + (u ? " por " + esc(u) : "") + " · fonte: DataHotel (importado) e Hotel Gestão 360</div></header>";

    h += '<div class="kpis">' +
      '<div class="k">Recebido<b>' + brl(c.total) + "</b>" + c.qtd + " recebimento(s)</div>" +
      '<div class="k">Saldo a receber<b>' + brl(c.pendente) + "</b>" + c.saldos.length + " hospedagem(ns)</div>" +
      '<div class="k">Faturado p/ empresas<b>' + brl(c.faturar) + "</b>a cobrar das empresas</div>" +
      '<div class="k">Ocupação hoje<b>' + Math.round(c.hoje.taxa * 100) + "%</b>" + c.hoje.ocupados + " de " + c.hoje.total + " aptos</div></div>";

    if (s.conferencia) {
      h += "<h2>Conferência do fechamento</h2>";
      if (!conf) h += '<p class="vazio">Nenhuma conferência feita para este relatório.</p>';
      else {
        var ord = { DIVERGENTE: 0, ATENCAO: 1, OK: 2 }, cls = { OK: "ok", DIVERGENTE: "div", ATENCAO: "at" };
        h += '<p class="sub">Período conferido ' + diaBR(conf.inicio) + " a " + diaBR(conf.fim) + " · feita em " + esc(quando(conf.criadoEm)) +
          " · <span class=\"ok\">" + conf.ok + " batem</span> · <span class=\"div\">" + conf.divergentes + " divergente(s)</span> · <span class=\"at\">" + conf.atencao + " com atenção</span></p>";
        var vl = function (v, un) { return v === undefined || v === null ? "" : un === "un" ? String(v) : brl(v); };
        h += tabela(["Regra", "O que foi conferido", "Esperado", "Encontrado", "Situação"],
          (conf.resultado || []).slice().sort(function (a, b) { return ord[a.situacao] - ord[b.situacao]; }).map(function (r) {
            var d = r.detalhes || [];
            return [esc(r.regra), "<strong>" + esc(r.titulo) + '</strong><div class="sub">' + esc(r.entre) + "</div>" +
              (d.length ? "<ul>" + d.slice(0, 15).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + (d.length > 15 ? "<li>… e mais " + (d.length - 15) + "</li>" : "") + "</ul>" : ""),
              vl(r.esperado, r.unidade), vl(r.encontrado, r.unidade), '<span class="' + cls[r.situacao] + '">' + SIT[r.situacao] + "</span>"];
          }), [2, 3, 4]);
      }
    }
    if (s.recebimentos) {
      h += "<h2>Recebimentos por forma de pagamento</h2>" + tabela(["Forma", "Valor", "%"], c.formas.map(function (f) {
        return [esc(nomeForma(f.forma)), brl(f.valor), c.total ? (f.valor / c.total * 100).toFixed(1).replace(".", ",") + "%" : ""];
      }).concat(c.formas.length ? [["<strong>Total</strong>", "<strong>" + brl(c.total) + "</strong>", "100%"]] : []), [1, 2]);
      h += "<h2>Recebimentos por dia</h2>" + tabela(["Dia", "Valor"], c.dias.map(function (d) { return [diaBR(d.dia), brl(d.valor)]; }), [1]);
    }
    if (s.saldos) {
      h += "<h2>Hospedagens com saldo a receber</h2>" + tabela(["Apto", "Hóspede", "Reserva", "Período", "Total", "Pago", "Falta"], c.saldos.map(function (x) {
        return [esc(x.h.apartamento), esc(x.h.hospede || "—"), esc(x.h.codigoOrigem || x.h.codigo || ""), diaBR(x.h.checkin) + " a " + diaBR(x.h.checkoutRealizado || x.h.checkout),
          brl(x.total), brl(x.pago), "<strong>" + brl(x.pendente) + "</strong>" + (x.situacao === "FATURAR" ? " (faturar)" : "")];
      }), [4, 5, 6]);
    }
    if (s.ocupacao) {
      h += "<h2>Ocupação por dia</h2>" + tabela(["Dia", "Aptos ocupados", "Taxa", "Hóspedes", "Entradas", "Saídas"], c.ocup.map(function (o) {
        return [diaBR(o.dia), String(o.ocupados), Math.round(o.taxa * 100) + "%", String(o.hospedes), String(o.entradas), String(o.saidas)];
      }), [1, 2, 3, 4, 5]);
    }
    if (s.cafe) {
      h += "<h2>Café da manhã por dia (lista do DataHotel)</h2>" + tabela(["Dia", "Apartamentos", "Adultos", "Crianças", "Total"], c.cafe.map(function (x) {
        return [diaBR(x.dia), String(x.aptos), String(x.adultos), String(x.criancas), "<strong>" + (x.adultos + x.criancas) + "</strong>"];
      }), [1, 2, 3, 4]);
    }
    h += "<footer>Valores conferidos a partir dos relatórios exportados do DataHotel. Nada foi alterado no DataHotel.</footer></body></html>";
    return h;
  }
  // O início do sistema é o Painel do Hotel.
  T.telas.dashboard = T.telas.painelhotel;
})();
