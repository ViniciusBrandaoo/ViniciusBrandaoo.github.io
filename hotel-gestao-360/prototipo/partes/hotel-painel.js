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
    { grupo: "Hotel", chave: "relatorioshotel", nome: "Relatórios em PDF", icone: "documentos" },
    { grupo: "Hotel", chave: "pendencias", nome: "Pendências", icone: "aprovacoes" },
    { grupo: "Hotel", chave: "comprovantes", nome: "Comprovantes do Dia", icone: "contas" }
  ];
  var iHotel = T.MODULOS.findIndex(function (m) { return m.grupo === "Hotel"; });
  T.MODULOS.splice(iHotel, 0, NOVOS[0]);
  var iConf = T.MODULOS.findIndex(function (m) { return m.chave === "conferencia"; });
  T.MODULOS.splice(iConf + 1, 0, NOVOS[1]);
  T.MODULOS.splice(T.MODULOS.findIndex(function (m) { return m.chave === "painelhotel"; }) + 1, 0, NOVOS[2]);
  T.MODULOS.push(NOVOS[3]);
  NOVOS.forEach(function (m) { T.ICONES_MODULO[m.chave] = m.icone; T.MODULOS_DELEGAVEIS.push(m); });
  ["FINANCEIRO", "RECEPCAO"].forEach(function (p) {
    var x = T.PERFIS[p];
    if (x && x.modulos !== "*") NOVOS.forEach(function (m) { if (x.modulos.indexOf(m.chave) === -1) x.modulos.push(m.chave); });
  });

  // Sistema enxuto para o hotel: o início é o Painel do Hotel, e as telas herdadas
  // da plataforma escolar que o hotel não usa saem do menu (continuam acessíveis
  // pela busca e por Configuração, nada é apagado).
  var FORA_DO_MENU = ["eventos", "contratos", "documentos", "relatorios", "fechamento", "solicitacoes", "ferias", "painelhotel"];
  T.MODULOS.forEach(function (m) { if (FORA_DO_MENU.indexOf(m.chave) !== -1) m.oculto = true; });
  var dash = T.MODULOS.find(function (m) { return m.chave === "dashboard"; });
  if (dash) { dash.nome = "Painel do Hotel"; dash.grupo = "Hotel"; }
  // Hotel primeiro no menu, na ordem do dia a dia da Fernanda.
  var ORDEM = ["dashboard", "pendencias", "conferencia", "relatorioshotel", "hospedagem", "caixa", "comprovantes", "contas", "recorrentes", "aprovacoes", "fornecedores", "empresas", "ponto", "cafe", "frigobar", "governanca", "fechamentomes"];
  var hotel = ORDEM.map(function (k) { return T.MODULOS.find(function (m) { return m.chave === k; }); }).filter(Boolean);
  hotel.forEach(function (m) { m.grupo = "Hotel"; T.MODULOS.splice(T.MODULOS.indexOf(m), 1); });
  T.MODULOS.unshift.apply(T.MODULOS, hotel);
  // Na barra lateral, só o que a Fernanda pediu: as telas do hotel.
  T.MODULOS.forEach(function (m) { if (ORDEM.indexOf(m.chave) === -1 && ["acessos", "hotelconfig", "importacoes"].indexOf(m.chave) === -1) m.oculto = true; });
  // Importações é rotina de quem administra: fica em Configurações, fora do menu do dia a dia.
  var imp = T.MODULOS.find(function (m) { return m.chave === "importacoes"; });
  if (imp) { imp.noMenuLateral = true; imp.grupo = "Configuração"; }

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
    return '<div class="barras">' + itens.map(function (x) {
      var w = Math.max(1, Math.round(val(x) / max * 100));
      return '<div class="barra-linha"><span class="barra-rotulo">' + esc(rot(x)) + '</span>' +
        '<span class="barra-trilho"><i style="width:' + w + '%"></i></span>' +
        '<span class="barra-valor">' + brl(val(x)) + "</span></div>";
    }).join("") + "</div>";
  }

  // Recebido por dia em colunas: um dia por coluna, valor ao passar o mouse; ocupa uma altura fixa.
  function colunas(itens) {
    var max = itens.reduce(function (m, x) { return Math.max(m, x.valor); }, 0) || 1;
    var rot = function (x) { return diaBR(x.dia).slice(0, 5); };
    return '<div class="colunas" role="img" aria-label="Recebido por dia">' + itens.map(function (x) {
      return '<span class="coluna" title="' + esc(diaBR(x.dia) + ": " + brl(x.valor)) + '"><i style="height:' + Math.max(3, Math.round(x.valor / max * 100)) + '%"></i></span>';
    }).join("") + '</div><div class="colunas-eixo"><span>' + esc(rot(itens[0])) + "</span><span>" + esc(rot(itens[itens.length - 1])) + "</span></div>";
  }
  function filtroPeriodo(prefixo) {
    var p = periodo();
    return '<div class="filtro-periodo">' +
      '<label>De <input type="date" id="' + prefixo + '-ini" value="' + esc(p.ini) + '"></label>' +
      '<label>até <input type="date" id="' + prefixo + '-fim" value="' + esc(p.fim) + '"></label>' +
      '<button class="botao primario" data-acao="ph-periodo" data-id="' + prefixo + '">Aplicar</button></div>';
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
    var html = T.cabecalho("Painel do Hotel", "Resumo do período com os dados importados do DataHotel e a última conferência do fechamento.",
      '<button class="botao" data-ir="relatorioshotel">Relatório em PDF</button>');
    html += filtroPeriodo("ph");
    html += '<div class="grade-kpi">' + [
      { rotulo: "Recebido no período", valor: brl(c.total), nota: c.qtd + " recebimento(s)", destino: "caixa" },
      { rotulo: "Ocupação hoje", valor: Math.round(c.hoje.taxa * 100) + "%", nota: c.hoje.ocupados + " de " + c.hoje.total + " aptos", destino: "hospedagem" },
      { rotulo: "A receber de hóspedes", valor: brl(c.pendente), nota: c.saldos.length + " hospedagem(ns)", tom: c.pendente ? "atencao" : "" },
      { rotulo: "Faturado para empresas", valor: brl(c.faturar), nota: "a cobrar das empresas", tom: c.faturar ? "atencao" : "", destino: "empresas" },
      { rotulo: "Última conferência", valor: u ? (u.divergentes ? String(u.divergentes) : "Tudo bate") : "—", nota: u ? (u.divergentes ? (u.divergentes === 1 ? "divergência" : "divergências") + " · " : "") + "em " + String(quando(u.criadoEm)).slice(0, 5) : (ST.carregando ? "carregando…" : "nenhuma ainda"), tom: u && u.divergentes ? "critico" : "", destino: "conferencia" }
    ].map(U.kpiHtml).join("") + "</div>";

    html += '<div class="grade-2">' +
      U.painelHtml("Recebido por forma de pagamento", diaBR(p.ini) + " a " + diaBR(p.fim), c.formas.length ? barras(c.formas, function (x) { return nomeForma(x.forma); }, function (x) { return x.valor; }) : '<p class="secundario" style="padding:16px 20px">Sem recebimentos no período.</p>') +
      U.painelHtml("Recebido por dia", c.dias.length ? "média " + brl(Math.round(c.total / c.dias.length)) + " · maior " + brl(c.dias.reduce(function (m, x) { return Math.max(m, x.valor); }, 0)) : "", c.dias.length ? colunas(c.dias) : U.vazioHtml("Sem recebimentos no período", "")) +
      "</div>";

    if (u) {
      var probl = (u.resultado || []).filter(function (r) { return r.situacao !== "OK"; });
      html += U.painelHtml("O que a última conferência apontou", diaBR(u.inicio) + " a " + diaBR(u.fim), probl.length ?
        '<div class="aponta">' + probl.map(function (r) {
          var tom = r.situacao === "DIVERGENTE" ? "critico" : "atencao", d = (r.detalhes || [])[0] || "";
          return '<button type="button" class="aponta-item" data-ir="conferencia"><i class="aponta-sinal ' + tom + '" aria-hidden="true"></i>' +
            '<span class="aponta-texto"><b>' + esc(r.titulo) + "</b>" + (d ? "<small>" + esc(d) + "</small>" : "") + "</span>" +
            '<span class="pastilha ' + tom + '">' + SIT[r.situacao] + "</span></button>";
        }).join("") + "</div>"
        : U.vazioHtml("Tudo bateu", ""));
    }

    var pend = (L.estado.pendencias || []).filter(function (x) { return x.status !== "Resolvida"; });
    if (pend.length) html += U.painelHtml("Pendências", pend.length + " em aberto",
      '<div class="nota-linha"><span>' +
      pend.slice(0, 3).map(function (x) { return esc(x.tipo) + (x.apto ? " (" + esc(x.apto) + ")" : ""); }).join(" · ") + (pend.length > 3 ? " e mais " + (pend.length - 3) : "") +
      '</span><button class="botao miudo" data-acao="pend-ir">Responder pendências</button></div>');
    if (c.saldos.length) html += U.painelHtml("Hospedagens com saldo a receber", c.saldos.length + " no período", U.tabelaHtml([
      { rotulo: "Apto", conteudo: function (x) { return esc(x.h.apartamento); } },
      { rotulo: "Hóspede / reserva", conteudo: function (x) { return esc(x.h.hospede || "—") + '<div class="secundario">' + esc(x.h.codigoOrigem || x.h.codigo || "") + " · " + diaBR(x.h.checkin) + " a " + diaBR(x.h.checkoutRealizado || x.h.checkout) + "</div>"; } },
      { rotulo: "Total", direita: true, conteudo: function (x) { return brl(x.total); } },
      { rotulo: "Pago", direita: true, conteudo: function (x) { return brl(x.pago); } },
      { rotulo: "Falta", direita: true, conteudo: function (x) { return "<strong>" + brl(x.pendente) + "</strong>" + (x.situacao === "FATURAR" ? '<div class="secundario">faturar</div>' : ""); } }
    ], c.saldos.slice(0, 5), { tituloVazio: "Nenhuma hospedagem com saldo" }) +
      (c.saldos.length > 5 ? '<div class="nota-linha"><span>e mais ' + (c.saldos.length - 5) + '</span><button class="botao miudo" data-ir="hospedagem">Ver todas</button></div>' : ""));
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
    var html = T.cabecalho("Relatórios em PDF", "Os relatórios completos da Direção saem de cada Conferência do Fechamento (relatórios do DataHotel). Abaixo, também um relatório rápido com os dados do sistema.");
    var u = ST.ultima;
    if (u && u.relatorios && u.relatorios.length) {
      T._confRelatorios = u.relatorios;
      html += U.painelHtml("Relatórios completos para a Direção", "da conferência de " + diaBR(u.inicio) + " a " + diaBR(u.fim) + " · feita em " + quando(u.criadoEm),
        '<div style="padding:14px 20px;display:flex;flex-wrap:wrap;gap:10px">' + u.relatorios.map(function (x, i) { return '<button class="botao" data-acao="hotel-rel-abrir" data-id="' + i + '">' + esc(x.titulo) + "</button>"; }).join("") +
        '</div><p class="secundario" style="padding:0 20px 14px">Para um período novo, faça a Conferência do Fechamento com os relatórios exportados do DataHotel: os 5 relatórios são gerados junto.</p>');
    } else {
      html += '<div class="painel nota-linha"><span>Os relatórios completos aparecem aqui depois de uma Conferência do Fechamento.</span><button class="botao miudo" data-ir="conferencia">Ir para a Conferência</button></div>';
    }
    html += filtroPeriodo("rh");
    var sel = T.filtros.relSecoes;
    var confs = ST.lista || [];
    html += U.painelHtml("O que entra no relatório", "", '<div class="opcoes">' +
      SECOES.map(function (s) { return '<label class="opcao"><input type="checkbox" class="rel-secao" value="' + s[0] + '"' + (sel[s[0]] ? " checked" : "") + "><span>" + esc(s[1]) + "</span></label>"; }).join("") +
      '<label class="opcao-campo"><span>Conferência usada</span><select id="rel-conf">' +
      (confs.length ? confs.map(function (c, i) { return '<option value="' + esc(c.id) + '"' + (i === 0 ? " selected" : "") + ">" + esc(quando(c.criadoEm) + " · " + diaBR(c.inicio) + " a " + diaBR(c.fim) + " · " + c.divergentes + " divergente(s)") + "</option>"; }).join("") : '<option value="">' + (ST.carregando ? "carregando…" : "nenhuma conferência feita") + "</option>") +
      "</select></label>" +
      '<div class="opcoes-acoes"><button class="botao primario" data-acao="rel-pdf">Gerar PDF</button>' +
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
        h += tabela(["O que foi conferido", "Esperado", "Encontrado", "Situação"],
          (conf.resultado || []).slice().sort(function (a, b) { return ord[a.situacao] - ord[b.situacao]; }).map(function (r) {
            var d = r.detalhes || [];
            return ["<strong>" + esc(r.titulo) + '</strong><div class="sub">' + esc(r.entre) + "</div>" +
              (d.length ? "<ul>" + d.slice(0, 15).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + (d.length > 15 ? "<li>… e mais " + (d.length - 15) + "</li>" : "") + "</ul>" : ""),
              vl(r.esperado, r.unidade), vl(r.encontrado, r.unidade), '<span class="' + cls[r.situacao] + '">' + SIT[r.situacao] + "</span>"];
          }), [1, 2, 3]);
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
  T.acoes["hotel-pendencia-ok"] = function (id) {
    U.abrirFormulario({ titulo: "Marcar como resolvida", campos: [{ id: "decisao", rotulo: "O que foi feito", tipo: "textarea", obrigatorio: true }],
      aoSalvar: function (v) { L.atualizar("pendencias", id, { status: "Resolvida", decisao: v.decisao, resolvidaEm: L.hoje() }); U.fecharModal(); T.renderizar(); } });
  };

  // ------------------------------------------------------------ pendências (por dia, resposta Sim/Não)
  var RESP_ROT = { SIM: "Sim, resolvido", NAO: "Não resolvido" };
  T.acoes["pend-ir"] = function () { T.ir("pendencias"); };
  T.telas.pendencias = function () {
    var todas = (L.estado.pendencias || []).slice();
    var sit = T.filtros.pendSit || "ABERTAS";
    var lista = todas.filter(function (p) { return sit === "TODAS" ? true : sit === "RESOLVIDAS" ? p.status === "Resolvida" : p.status !== "Resolvida"; });
    var abertas = todas.filter(function (p) { return p.status !== "Resolvida"; }).length;
    var html = T.cabecalho("Pendências", "O que precisa ser conferido ou corrigido, separado por dia. Responda Sim ou Não e escreva o que foi feito: fica registrado quem respondeu e quando.",
      '<button class="botao primario" data-acao="pend-nova">Nova pendência</button>');
    html += '<div class="filtro-periodo">' + ["ABERTAS", "RESOLVIDAS", "TODAS"].map(function (k) {
      var n = k === "ABERTAS" ? abertas : k === "RESOLVIDAS" ? todas.length - abertas : todas.length;
      return '<button class="botao' + (sit === k ? " primario" : "") + '" data-acao="pend-filtro" data-id="' + k + '">' + { ABERTAS: "Em aberto", RESOLVIDAS: "Resolvidas", TODAS: "Todas" }[k] + " (" + n + ")</button>";
    }).join("") + "</div>";
    if (!lista.length) return html + '<div class="painel"><p style="padding:20px">Nenhuma pendência aqui.</p></div>';
    var porDia = {};
    lista.forEach(function (p) { var d = p.data || "sem data"; (porDia[d] = porDia[d] || []).push(p); });
    Object.keys(porDia).sort().reverse().forEach(function (d) {
      var itens = porDia[d];
      html += U.painelHtml(d === "sem data" ? "Sem data" : diaBR(d), itens.length + " pendência(s)", '<div class="conf-lista">' + itens.map(function (p) {
        var resps = p.respostas || [];
        var ult = resps[resps.length - 1];
        var tom = p.status === "Resolvida" ? "ok" : (ult && ult.resposta === "NAO" ? "critico" : "atencao");
        var rot = p.status === "Resolvida" ? "Resolvida" : (ult && ult.resposta === "NAO" ? "Não resolvida" : "Aguardando resposta");
        return '<article class="conf-item conf-' + tom + '"><header><h3>' + esc(p.tipo || "Pendência") + (p.apto ? ' <span class="secundario">· ' + (/^\d/.test(p.apto) ? "Apto " : "") + esc(p.apto) + "</span>" : "") + "</h3>" +
          '<span class="pastilha ' + tom + '">' + rot + "</span></header>" +
          (p.hospede ? '<p class="secundario">' + esc(p.hospede) + "</p>" : "") +
          "<ul><li>" + esc(p.descricao || "") + "</li>" + (p.solucao ? "<li><strong>O que fazer:</strong> " + esc(p.solucao) + "</li>" : "") +
          (p.responsavel || p.prazo ? '<li class="secundario">Responsável: ' + esc(p.responsavel || "—") + (p.prazo ? " · até " + diaBR(p.prazo) : "") + "</li>" : "") +
          (p.observacoes ? '<li class="secundario">' + esc(p.observacoes) + "</li>" : "") + "</ul>" +
          (resps.length || (p.decisao && p.status === "Resolvida") ? '<div class="pend-resps">' + resps.map(function (r) {
            return "<div><strong>" + RESP_ROT[r.resposta] + "</strong> · " + esc(r.quem || "—") + " · " + esc(r.quando || "") + (r.observacao ? "<div>" + esc(r.observacao) + "</div>" : "") + "</div>";
          }).join("") + (!resps.length && p.decisao && p.status === "Resolvida" ? "<div><strong>Resolvida</strong>" + (p.resolvidaEm ? " · " + diaBR(p.resolvidaEm) : "") + "<div>" + esc(p.decisao) + "</div></div>" : "") + "</div>" : "") +
          '<div class="pend-acoes"><button class="botao" data-acao="pend-responder" data-id="SIM|' + p.id + '">Sim, resolvido</button>' +
          '<button class="botao" data-acao="pend-responder" data-id="NAO|' + p.id + '">Não</button></div>' +
          "</article>";
      }).join("") + "</div>");
    });
    return html;
  };
  T.acoes["pend-filtro"] = function (k) { T.filtros.pendSit = k; T.renderizar(); };
  T.acoes["pend-responder"] = function (arg) {
    var resp = arg.split("|")[0], id = arg.slice(resp.length + 1);
    var p = L.buscarPorId("pendencias", id); if (!p) return;
    var u = L.estado.usuario || {};
    U.abrirFormulario({ titulo: resp === "SIM" ? "Pendência resolvida" : "Pendência não resolvida", sub: (p.tipo || "") + (p.apto ? " · " + p.apto : ""),
      campos: [{ id: "quem", rotulo: "Quem está respondendo (recepcionista)", obrigatorio: true, padrao: u.nome || "" },
        { id: "observacao", rotulo: resp === "SIM" ? "O que foi feito" : "Por que não foi resolvida / o que falta", tipo: "textarea", obrigatorio: true }],
      aoSalvar: function (v) {
        var agora = new Date();
        var quando = agora.toLocaleDateString("pt-BR") + " " + agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        var resps = (p.respostas || []).concat([{ resposta: resp, quem: v.quem, observacao: v.observacao, quando: quando, usuario: u.nome || "" }]);
        var mud = { respostas: resps };
        if (resp === "SIM") { mud.status = "Resolvida"; mud.resolvidaEm = L.hoje(); mud.decisao = v.observacao; } else { mud.status = "Aberta"; }
        L.atualizar("pendencias", id, mud); U.fecharModal(); T.renderizar();
      } });
  };
  T.acoes["pend-nova"] = function () {
    U.abrirFormulario({ titulo: "Nova pendência", campos: [
      { id: "data", rotulo: "Dia", tipo: "data", obrigatorio: true, padrao: L.hoje(), par: true }, { id: "apto", rotulo: "Apartamento" },
      { id: "tipo", rotulo: "Assunto", obrigatorio: true }, { id: "hospede", rotulo: "Hóspede / pessoa" },
      { id: "descricao", rotulo: "O que está errado", tipo: "textarea", obrigatorio: true }, { id: "solucao", rotulo: "O que fazer", tipo: "textarea" },
      { id: "responsavel", rotulo: "Responsável", tipo: "select", opcoes: ["Recepção", "Governança", "Financeiro", "Direção"], par: true }, { id: "prazo", rotulo: "Prazo", tipo: "data" }],
      aoSalvar: function (v) { v.status = "Aberta"; v.origem = "Lançada no sistema por " + ((L.estado.usuario || {}).nome || "—"); L.criar("pendencias", v); U.fecharModal(); T.renderizar(); } });
  };

  // ------------------------------------------------------------ comprovantes do dia e confirmação no banco
  var FORMAS_COMP = [
    { valor: "CREDITO", rotulo: "Cartão de crédito (filipeta)" }, { valor: "DEBITO", rotulo: "Cartão de débito (filipeta)" },
    { valor: "PIX", rotulo: "Pix" }, { valor: "DINHEIRO", rotulo: "Dinheiro" }, { valor: "BOLETO", rotulo: "Boleto" },
    { valor: "DEPOSITO", rotulo: "Depósito em conta" }, { valor: "FATURADO", rotulo: "Checkout assinado (empresa conveniada)" }];
  var nomeComp = function (f) { if (f === "FATURADO") return "Faturado (empresa)"; var x = FORMAS_COMP.find(function (o) { return o.valor === f; }); return x ? x.rotulo.replace(/ \(filipeta\)/, "") : nomeForma(f); };
  var diaComp = function () { return T.filtros.compDia || L.hoje(); };
  var reaisCent = function (v) { return Math.round(Number(String(v).replace(",", ".")) * 100) || 0; };

  T.telas.comprovantes = function () {
    var d = diaComp();
    var comps = (L.estado.comprovantes || []).filter(function (c) { return c.data === d; });
    var recs = (L.estado.recebimentos || []).filter(function (r) { return r.data === d && r.tipo !== "SAIDA_CAIXA" && r.status !== "CANCELADO"; });
    var formas = {};
    var soma = function (f, k, v) { formas[f] = formas[f] || { dh: 0, comp: 0, conf: 0, nao: 0 }; formas[f][k] += v; };
    recs.forEach(function (r) { var f = r.forma || "OUTRO", v = r.valorBruto || 0; soma(f, "dh", v); if (r.confirmadoBanco === "SIM") soma(f, "conf", v); if (r.confirmadoBanco === "NAO") soma(f, "nao", v); });
    comps.forEach(function (c) { soma(c.forma || "OUTRO", "comp", c.valor || 0); });
    var html = T.cabecalho("Comprovantes do Dia", "O recepcionista que recebeu lança a filipeta do cartão, o Pix, o dinheiro ou o depósito, com a foto. No check-out de hóspede de empresa conveniada, lança o checkout assinado. O sistema compara com o DataHotel.",
      '<button class="botao" data-acao="comp-novo" data-id="FATURADO">Checkout de empresa</button> <button class="botao primario" data-acao="comp-novo">Lançar comprovante</button>');
    html += '<div class="filtro-periodo"><label>Dia <input type="date" id="comp-dia" value="' + esc(d) + '"></label><button class="botao" data-acao="comp-dia">Ver dia</button></div>';
    var chaves = Object.keys(formas);
    html += U.painelHtml("Resumo do dia por forma de pagamento", diaBR(d), chaves.length ? U.tabelaHtml([
      { rotulo: "Forma", conteudo: function (k) { return esc(nomeComp(k)); } },
      { rotulo: "No DataHotel", direita: true, conteudo: function (k) { return brl(formas[k].dh); } },
      { rotulo: "Comprovantes", direita: true, conteudo: function (k) { return brl(formas[k].comp); } },
      { rotulo: "Diferença", direita: true, conteudo: function (k) { var x = formas[k].comp - formas[k].dh; return x === 0 ? '<span class="pastilha ok">Bate</span>' : '<strong style="color:var(--vermelho)">' + brl(x) + "</strong>"; } },
      { rotulo: "Confirmado no banco", direita: true, conteudo: function (k) { var f = formas[k]; return brl(f.conf) + (f.nao ? '<div class="secundario" style="color:var(--vermelho)">não confirmado ' + brl(f.nao) + "</div>" : ""); } }
    ], chaves, {}) : U.vazioHtml("Nada lançado neste dia", ""));

    var linhaComp = function (c) {
      var emp = c.empresaId ? (L.buscarPorId("empresas", c.empresaId) || {}) : null;
      var titulo = c.forma === "FATURADO" ? (emp ? (emp.nomeFantasia || emp.razaoSocial) : "Empresa não informada") : nomeComp(c.forma);
      var sub = [c.apto ? "Apto " + c.apto : "", c.hospede || "", c.recepcionista ? "recebido por " + c.recepcionista : (c.lancadoPor ? "lançado por " + c.lancadoPor : "")].filter(Boolean).join(" · ");
      return '<div class="linha-item linha-comp">' + (c.foto ? '<a href="#" class="linha-foto" data-acao="comp-ver" data-id="' + c.id + '"><img alt="Comprovante" src="' + c.foto + '"></a>' : '<button type="button" class="linha-foto vazia" data-acao="comp-foto" data-id="' + c.id + '" title="Anexar foto">+ foto</button>') +
        '<span class="linha-texto"><b>' + esc(titulo) + "</b><small>" + esc(sub) + (c.observacao ? " · " + esc(c.observacao) : "") + "</small></span>" +
        '<span class="linha-valor">' + (c.valor ? brl(c.valor) : "—") + "</span>" + (c.foto ? '<button type="button" class="botao miudo" data-acao="comp-foto" data-id="' + c.id + '">Trocar foto</button>' : "") + "</div>";
    };
    var compPag = comps.filter(function (c) { return c.forma !== "FATURADO"; }), compEmp = comps.filter(function (c) { return c.forma === "FATURADO"; });
    html += U.painelHtml("Comprovantes de pagamento", compPag.length ? compPag.length + " · " + brl(compPag.reduce(function (a, c) { return a + (c.valor || 0); }, 0)) : "",
      compPag.length ? '<div class="linhas">' + compPag.map(linhaComp).join("") + "</div>" : U.vazioHtml("Nenhum comprovante lançado neste dia", "Filipeta de cartão, Pix, dinheiro ou depósito: quem recebeu lança, com a foto."));
    html += U.painelHtml("Checkouts assinados de empresas", compEmp.length ? compEmp.length + " · " + brl(compEmp.reduce(function (a, c) { return a + (c.valor || 0); }, 0)) : "",
      compEmp.length ? '<div class="linhas">' + compEmp.map(linhaComp).join("") + "</div>" : U.vazioHtml("Nenhum checkout de empresa neste dia", "Hóspede de empresa conveniada: foto do checkout assinado, enviada pelo recepcionista."));

    html += U.painelHtml("Recebimentos do DataHotel · confirmado no banco?", recs.length + " recebimento(s)", recs.length ? '<div class="conf-lista">' + recs.map(function (r) {
      var c = r.confirmadoBanco, tom = c === "SIM" ? "ok" : c === "NAO" ? "critico" : "atencao";
      return '<article class="conf-item conf-' + tom + '"><header><h3>' + esc(nomeComp(r.forma)) + (r.apartamento ? " · Apto " + esc(r.apartamento) : "") + "</h3><strong>" + brl(r.valorBruto || 0) + "</strong></header>" +
        '<p class="secundario">' + esc(r.descricao || r.pagador || "") + "</p>" +
        (c ? '<div class="pend-resps"><div><strong>' + (c === "SIM" ? "Confirmado no banco" : "Não confirmado no banco") + "</strong> · " + esc(r.confirmadoPor || "") + " · " + esc(r.confirmadoEm || "") + (r.obsBanco ? "<div>" + esc(r.obsBanco) + "</div>" : "") + "</div></div>" : "") +
        '<div class="pend-acoes"><button class="botao" data-acao="rec-banco" data-id="SIM|' + r.id + '">Sim, confirmado</button><button class="botao" data-acao="rec-banco" data-id="NAO|' + r.id + '">Não</button></div></article>';
    }).join("") + "</div>" : U.vazioHtml("Nenhum recebimento no DataHotel neste dia", ""));
    return html;
  };
  T.acoes["comp-dia"] = function () { var i = U.el("comp-dia"); if (i && i.value) T.filtros.compDia = i.value; T.renderizar(); };
  T.acoes["comp-novo"] = function (formaInicial) {
    var empresa = formaInicial === "FATURADO";
    var emps = L.estado.empresas.slice().sort(function (a, b) { return String(a.nomeFantasia || a.razaoSocial).localeCompare(String(b.nomeFantasia || b.razaoSocial)); })
      .map(function (e) { return { valor: e.id, rotulo: e.nomeFantasia || e.razaoSocial }; });
    var campos = [
      { id: "data", rotulo: "Dia", tipo: "data", obrigatorio: true, padrao: diaComp(), par: true }, { id: "apto", rotulo: "Apartamento" },
      { id: "recepcionista", rotulo: "Recepcionista que recebeu", obrigatorio: true, padrao: (L.estado.usuario || {}).nome || "" }];
    if (empresa) campos.push({ id: "empresaId", rotulo: "Empresa conveniada", tipo: "select", opcoes: [{ valor: "", rotulo: "Escolha a empresa" }].concat(emps), obrigatorio: true },
      { id: "hospede", rotulo: "Hóspede" }, { id: "valor", rotulo: "Valor do checkout (R$)", tipo: "moeda" });
    else campos.push({ id: "forma", rotulo: "Forma", tipo: "select", opcoes: FORMAS_COMP.filter(function (f) { return f.valor !== "FATURADO"; }), par: true }, { id: "valor", rotulo: "Valor (R$)", tipo: "moeda", obrigatorio: true });
    campos.push({ id: "observacao", rotulo: "Observação", tipo: "textarea" });
    U.abrirFormulario({ titulo: empresa ? "Checkout de empresa conveniada" : "Lançar comprovante", sub: empresa ? "foto do checkout assinado pelo hóspede" : "filipeta, Pix, dinheiro ou depósito", campos: campos,
      rotuloSalvar: "Salvar e anexar foto",
      aoSalvar: function (v) {
        if (empresa && !v.empresaId) throw new Error("Escolha a empresa conveniada.");
        var reg = L.criar("comprovantes", { data: v.data, apto: v.apto, forma: empresa ? "FATURADO" : v.forma, valor: reaisCent(v.valor || 0), empresaId: v.empresaId || "",
          hospede: v.hospede || "", recepcionista: v.recepcionista, observacao: v.observacao, lancadoPor: (L.estado.usuario || {}).nome || "" });
        T.filtros.compDia = v.data; U.fecharModal(); T.renderizar();
        if (reg && reg.id) T.acoes["comp-foto"](reg.id);
      } });
  };
  // Foto: reduzida no próprio navegador (no máximo ~1280px, JPEG) para caber no registro.
  T.acoes["comp-foto"] = function (id) {
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.setAttribute("capture", "environment");
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var img = new Image(), url = URL.createObjectURL(f);
      img.onload = function () {
        var lado = 1280, q = 0.7, dataUrl = "";
        for (var t = 0; t < 6; t++) {
          var k = Math.min(1, lado / Math.max(img.width, img.height)), cv = document.createElement("canvas");
          cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          dataUrl = cv.toDataURL("image/jpeg", q);
          if (dataUrl.length < 150000) break;
          lado = Math.round(lado * 0.8); q = Math.max(0.45, q - 0.05);
        }
        URL.revokeObjectURL(url);
        if (dataUrl.length >= 150000) { U.avisar("A foto ficou grande demais. Tente uma foto mais próxima do comprovante."); return; }
        L.atualizar("comprovantes", id, { foto: dataUrl }); T.renderizar(); U.avisar("Foto anexada.");
      };
      img.onerror = function () { U.avisar("Não foi possível ler essa imagem."); };
      img.src = url;
    };
    inp.click();
  };
  T.acoes["comp-ver"] = function (id) {
    var c = L.buscarPorId("comprovantes", id); if (!c || !c.foto) return;
    var w = window.open(""); if (w) w.document.write('<title>Comprovante</title><body style="margin:0;background:#111;display:grid;place-items:center;min-height:100vh"><img src="' + c.foto + '" style="max-width:100%;max-height:100vh"></body>');
  };
  T.acoes["rec-banco"] = function (arg) {
    var resp = arg.split("|")[0], id = arg.slice(resp.length + 1);
    var r = L.buscarPorId("recebimentos", id); if (!r) return;
    U.abrirFormulario({ titulo: resp === "SIM" ? "Confirmado no banco" : "Não confirmado no banco", sub: nomeComp(r.forma) + " · " + brl(r.valorBruto || 0),
      campos: [{ id: "quem", rotulo: "Quem conferiu", obrigatorio: true, padrao: (L.estado.usuario || {}).nome || "" },
        { id: "obs", rotulo: resp === "SIM" ? "Observação (ex.: entrou no BB em 07/11)" : "O que aconteceu", tipo: "textarea", obrigatorio: resp !== "SIM" }],
      aoSalvar: function (v) {
        var agora = new Date();
        L.atualizar("recebimentos", id, { confirmadoBanco: resp, confirmadoPor: v.quem, obsBanco: v.obs || "", confirmadoEm: agora.toLocaleDateString("pt-BR") + " " + agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) });
        U.fecharModal(); T.renderizar();
      } });
  };

  // ------------------------------------------------------------ guia narrado ("Como usar")
  // Passeio pelas telas de verdade, com legenda e narração (voz do próprio aparelho).
  var GUIA = [
    { tela: "dashboard", titulo: "Painel do Hotel", fala: "Este é o Painel do Hotel, a tela inicial. Aqui você vê quanto foi recebido no período, a ocupação de hoje, o que falta receber e o que a última conferência apontou." },
    { tela: "pendencias", titulo: "Pendências", fala: "Em Pendências fica tudo o que precisa ser conferido ou corrigido, separado por dia. Em cada uma, responda Sim ou Não e escreva o que foi feito. O sistema guarda quem respondeu e quando." },
    { tela: "conferencia", titulo: "Conferência do Fechamento", fala: "A Conferência cruza os relatórios do DataHotel entre si e mostra o que bate e o que não bate, em linguagem simples. Nada é alterado no DataHotel." },
    { tela: "relatorioshotel", titulo: "Relatórios em PDF", fala: "Em Relatórios em PDF ficam os cinco relatórios da Direção: resumo, conferência, financeiro, hospedagem e a lista de itens pedidos. É só abrir e imprimir, ou salvar em PDF." },
    { tela: "hospedagem", titulo: "Hospedagem do Dia", fala: "Hospedagem do Dia mostra quem está na casa, as entradas e as saídas, com o extrato de cada apartamento." },
    { tela: "caixa", titulo: "Fechamento de Caixa", fala: "No Fechamento de Caixa você vê o que entrou no dia, separado por dinheiro, Pix, cartões e faturado para empresas." },
    { tela: "comprovantes", titulo: "Comprovantes do Dia", fala: "Em Comprovantes do Dia a recepção lança as filipetas da maquininha, Pix, dinheiro, boletos e depósitos, por apartamento, com a foto do comprovante. O sistema compara com o DataHotel. Em cada recebimento, marque se ele foi confirmado no banco." },
    { tela: "contas", titulo: "Contas a Pagar", fala: "Em Contas a Pagar ficam as notas e os boletos do hotel. Quem recebe a nota lança a conta, e ela fica aguardando a aprovação da Direção." },
    { tela: "aprovacoes", titulo: "Minhas Aprovações", fala: "Em Minhas Aprovações a Direção aprova ou rejeita os pagamentos. Depois de pagar, a conta é marcada como paga, com a data e a forma de pagamento." },
    { tela: "recorrentes", titulo: "Contas Fixas e Calendário", fala: "Contas Fixas e Calendário mostra as contas que se repetem todo mês, como internet, energia e água, com o dia do vencimento, para pagar em dia e evitar juros." },
    { tela: "empresas", titulo: "Faturamento de Empresas", fala: "Em Faturamento de Empresas estão as empresas conveniadas, as regras de cada convênio e as notas que ainda faltam receber." },
    { tela: "ponto", titulo: "Ponto e Diárias", fala: "Ponto e Diárias traz a folha do mês com as horas do relógio de ponto: horas extras, noturnas, atrasos e faltas de cada funcionário." },
    { tela: "governanca", titulo: "Governança e Estoque", fala: "Em Governança e Estoque ficam a lista de arrumação do dia e o estoque de enxoval, cantina, limpeza e escritório." },
    { tela: "dashboard", titulo: "Pronto!", fala: "Pronto! Esse é o Acácia Hotel. Para rever este guia, clique em Ajuda, no menu, e depois em Como usar." }
  ];
  var GS = { i: 0, tocando: false, timer: null, caixa: null };
  function guiaVoz() {
    if (!window.speechSynthesis) return null;
    var vs = window.speechSynthesis.getVoices() || [];
    return vs.find(function (v) { return /pt[-_]BR/i.test(v.lang) && /Francisca|Google|Natural|Maria/i.test(v.name); }) || vs.find(function (v) { return /pt[-_]BR/i.test(v.lang); }) || vs.find(function (v) { return /^pt/i.test(v.lang); }) || null;
  }
  function guiaParar() { clearTimeout(GS.timer); if (window.speechSynthesis) window.speechSynthesis.cancel(); }
  function guiaDesenhar() {
    var p = GUIA[GS.i]; if (!GS.caixa) return;
    GS.caixa.querySelector(".guia-titulo").textContent = (GS.i + 1) + " de " + GUIA.length + " · " + p.titulo;
    GS.caixa.querySelector(".guia-fala").textContent = p.fala;
    GS.caixa.querySelector(".guia-barra i").style.width = Math.round((GS.i + 1) / GUIA.length * 100) + "%";
    GS.caixa.querySelector('[data-guia="play"]').textContent = GS.tocando ? "Pausar" : "Continuar";
  }
  function guiaPasso() {
    guiaParar();
    var p = GUIA[GS.i];
    try { if (T.podeVer ? T.podeVer(p.tela) : true) T.ir(p.tela); } catch (e) { /* tela sem acesso: segue só com a legenda */ }
    window.scrollTo(0, 0);
    guiaDesenhar();
    if (!GS.tocando) return;
    var seguir = function () { if (!GS.tocando) return; if (GS.i < GUIA.length - 1) { GS.i++; guiaPasso(); } else { GS.tocando = false; guiaDesenhar(); } };
    var voz = guiaVoz();
    if (window.speechSynthesis && window.SpeechSynthesisUtterance && voz) {
      var u = new SpeechSynthesisUtterance(p.fala); u.voice = voz; u.lang = voz.lang; u.rate = 1;
      var feito = false, fim = function () { if (feito) return; feito = true; clearTimeout(GS.timer); GS.timer = setTimeout(seguir, 700); };
      var t0 = Date.now();
      u.onend = fim;
      // Voz recusada pelo navegador (sem clique, aba em segundo plano): não pula; dá o tempo de leitura da legenda.
      u.onerror = function () { if (feito) return; feito = true; clearTimeout(GS.timer); GS.timer = setTimeout(seguir, Math.max(800, 3000 + p.fala.length * 60 - (Date.now() - t0))); };
      GS.timer = setTimeout(fim, 4000 + p.fala.length * 110); // se a voz travar, a legenda segue sozinha
      window.speechSynthesis.speak(u);
    } else {
      GS.timer = setTimeout(seguir, 3000 + p.fala.length * 60); // sem voz no aparelho: só legenda, no tempo de leitura
    }
  }
  function guiaFechar() { guiaParar(); GS.tocando = false; if (GS.caixa) { GS.caixa.remove(); GS.caixa = null; } }
  T.acoes["guia-abrir"] = function () {
    guiaFechar();
    var c = document.createElement("div"); c.className = "guia"; c.setAttribute("role", "dialog"); c.setAttribute("aria-label", "Como usar o sistema");
    c.innerHTML = '<div class="guia-barra"><i></i></div><div class="guia-corpo"><div class="guia-texto"><strong class="guia-titulo"></strong><p class="guia-fala" aria-live="polite"></p>' +
      (guiaVoz() || !window.speechSynthesis ? "" : '<p class="guia-aviso">Este aparelho não tem voz em português instalada: o guia segue só com a legenda.</p>') + "</div>" +
      '<div class="guia-botoes"><button class="botao" data-guia="ant">Anterior</button><button class="botao primario" data-guia="play">Pausar</button><button class="botao" data-guia="prox">Próximo</button><button class="botao" data-guia="sair">Fechar</button></div></div>';
    c.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-guia]"); if (!b) return;
      var a = b.dataset.guia;
      if (a === "sair") return guiaFechar();
      if (a === "play") { GS.tocando = !GS.tocando; if (GS.tocando) guiaPasso(); else { guiaParar(); guiaDesenhar(); } return; }
      if (a === "ant" && GS.i > 0) GS.i--;
      if (a === "prox" && GS.i < GUIA.length - 1) GS.i++;
      guiaPasso();
    });
    document.body.appendChild(c); GS.caixa = c; GS.i = 0; GS.tocando = true;
    if (window.speechSynthesis && !window.speechSynthesis.getVoices().length) { window.speechSynthesis.onvoiceschanged = function () { window.speechSynthesis.onvoiceschanged = null; var av = GS.caixa && GS.caixa.querySelector(".guia-aviso"); if (av && guiaVoz()) av.remove(); if (GS.caixa && GS.i === 0) guiaPasso(); }; }
    guiaPasso();
  };
  // Ajuda: o botão do menu passa a abrir o guia. Vale também se o menu já tiver sido montado.
  function preencherAjuda() {
    var painel = U.el("popover-ajuda"); if (!painel) return;
    painel.innerHTML = '<div class="capsula-popover-titulo">Ajuda</div>' +
      '<button type="button" class="capsula-popover-item" id="guia-botao">▶ Como usar (guia narrado)</button>' +
      '<p class="capsula-popover-texto">Um passeio de uns 3 minutos pelas telas, com narração. Em cada tela, o “?” ao lado do título explica para que ela serve.</p>';
    var g = U.el("guia-botao");
    if (g) g.addEventListener("click", function () { var b = U.el("btn-ajuda"); if (b && b.getAttribute("aria-expanded") === "true") b.click(); T.acoes["guia-abrir"](); });
  }
  var montarAjudaOriginal = T.montarAjuda;
  T.montarAjuda = function () { montarAjudaOriginal(); preencherAjuda(); };
  preencherAjuda();
  T.telas.dashboard = T.telas.painelhotel;
})();
