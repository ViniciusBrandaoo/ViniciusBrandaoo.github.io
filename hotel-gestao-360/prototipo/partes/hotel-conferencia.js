/* ============================================================================
   Conferência do Fechamento.

   O usuário envia os CSVs exportados do DataHotel (de uma vez); o servidor
   reconhece cada relatório, roda as regras de conferência e guarda o resultado.
   Esta tela só envia e mostra: nenhuma regra é calculada aqui, e nada é
   alterado no DataHotel.
   ========================================================================== */
(function () {
  var pastilha = function (tom, txt) { return '<span class="pastilha ' + tom + '">' + U.esc(txt) + "</span>"; };
  var kpis = function (lista) { return '<div class="grade-kpi">' + lista.map(U.kpiHtml).join("") + "</div>"; };
  var ROT = { OK: ["ok", "Bate"], DIVERGENTE: ["critico", "Divergente"], ATENCAO: ["atencao", "Atenção"] };
  var valor = function (c, un) { return c === undefined || c === null ? "—" : un === "un" ? String(c) : L.brl(c); };
  var diaBR = function (iso) { return iso ? String(iso).split("-").reverse().join("/") : ""; };
  var quando = function (iso) { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); };

  T._conf = { hist: null, alerta: null, carregando: false, enviando: false, resultado: null, erro: null };
  var ST = T._conf;

  function carregar() {
    if (ST.carregando) return;
    ST.carregando = true;
    L.api.get("/api/hotel/conferencias").then(function (r) {
      ST.hist = r.conferencias || []; ST.alerta = r.alerta || null; ST.erro = null;
    }).catch(function (e) {
      ST.hist = []; ST.erro = e.message || "Não foi possível carregar o histórico.";
    }).then(function () {
      ST.carregando = false;
      if (T.atual === "conferencia") T.renderizar();
    });
  }

  T._confEnviar = function (arquivos) {
    if (!arquivos || !arquivos.length || ST.enviando) return;
    var csvs = Array.prototype.filter.call(arquivos, function (f) { return /\.csv$/i.test(f.name); });
    if (!csvs.length) { U.avisar("Envie os relatórios do DataHotel em .csv (Salvar → Ficheiro CSV)."); return; }
    var ini = (U.el("conf-inicio") || {}).value, fim = (U.el("conf-fim") || {}).value;
    if (!ini || !fim) { U.avisar("Informe o período da conferência (início e fim)."); return; }
    T.filtros.confInicio = ini; T.filtros.confFim = fim;
    ST.enviando = true; ST.resultado = null; T.renderizar();
    var forma = new FormData();
    forma.append("inicio", ini); forma.append("fim", fim);
    csvs.forEach(function (f) { forma.append("arquivos", f, f.name); });
    fetch("/api/hotel/conferencias", { method: "POST", credentials: "include", body: forma }).then(function (resp) {
      return resp.json().catch(function () { return null; }).then(function (d) {
        if (!resp.ok) throw new Error((d && d.erro) || "Não foi possível conferir (HTTP " + resp.status + ").");
        return d;
      });
    }).then(function (d) { ST.resultado = d; })
      .catch(function (e) { U.avisar(e.message); })
      .then(function () { ST.enviando = false; ST.hist = null; T.renderizar(); });
  };

  T.telas.conferencia = function () {
    var html = T.cabecalho("Conferência do Fechamento", "Envie os relatórios exportados do DataHotel. O sistema cruza um com o outro e mostra o que não bate. Nada é alterado no DataHotel.");
    if (!L.USA_BACKEND) return html + '<div class="painel" style="padding:20px">A conferência automática precisa do servidor ligado (versão publicada).</div>';
    if (ST.hist === null) carregar();

    var a = ST.alerta;
    if (a) {
      var tom, selo, msg;
      if (!a.ultima) { tom = "atencao"; selo = "Pendente"; msg = "Nenhuma conferência feita ainda."; }
      else if (!a.feitaHoje) { tom = "atencao"; selo = "Pendente"; msg = "Hoje (" + diaBR(a.hoje) + ") ainda não foi conferido. Última: " + quando(a.ultima.criadoEm) + " — " + a.ultima.divergentes + " divergência(s), " + a.ultima.atencao + " com atenção."; }
      else { tom = a.divergentes ? "critico" : "ok"; selo = a.divergentes ? "Com divergência" : "Em dia"; msg = "Conferência de hoje feita às " + quando(a.ultima.criadoEm) + " — " + a.ultima.divergentes + " divergência(s), " + a.ultima.atencao + " com atenção."; }
      html += '<div class="painel" style="padding:12px 20px;display:flex;gap:10px;align-items:center">' + pastilha(tom, selo) + "<span>" + U.esc(msg) + "</span></div>";
    }

    var ini = T.filtros.confInicio || "", fim = T.filtros.confFim || L.hoje();
    html += '<div class="painel imp-painel"><div class="imp-passo"><span class="imp-num">1</span><div class="imp-passo-corpo"><h3>Período e relatórios</h3>' +
      '<p style="margin:0 0 10px"><label>De <input type="date" id="conf-inicio" value="' + U.esc(ini) + '"' + (ST.enviando ? " disabled" : "") + "></label> " +
      '<label>até <input type="date" id="conf-fim" value="' + U.esc(fim) + '"' + (ST.enviando ? " disabled" : "") + "></label></p>" +
      '<label class="imp-drop" id="conf-drop"><input type="file" id="conf-arquivos" multiple accept=".csv,text/csv"' + (ST.enviando ? " disabled" : "") + ">" + U.iconeSvg("documentos", 26) +
      '<span class="imp-drop-titulo">' + (ST.enviando ? "Conferindo…" : "Arraste todos os CSVs de uma vez ou <u>clique para escolher</u>") + "</span>" +
      '<span class="imp-drop-dica">Reservas (com extrato), Contas Recebidas, Receitas x Despesas, Faturamento Diário e Analítico, Créditos x Débitos, Contas a Receber, Consumo, Vendas Itens, RDS, Mapa de Ocupação, Lista de Café, Lista de Camareira e Estoque Atual. O que faltar só deixa de ser conferido, e a tela avisa.</span></label>' +
      "</div></div></div>";

    var r = ST.resultado;
    if (r) {
      var res = r.resumo || { ok: 0, divergentes: 0, atencao: 0 };
      html += kpis([
        { rotulo: "Batem", valor: String(res.ok), nota: "regras conferidas" },
        { rotulo: "Divergentes", valor: String(res.divergentes), nota: "não batem", tom: res.divergentes ? "critico" : "" },
        { rotulo: "Atenção", valor: String(res.atencao), nota: "pedem olho humano", tom: res.atencao ? "atencao" : "" }
      ]);
      var ordem = { DIVERGENTE: 0, ATENCAO: 1, OK: 2 };
      var lista = (r.resultados || []).slice().sort(function (x, y) { return ordem[x.situacao] - ordem[y.situacao]; });
      html += U.painelHtml("Resultado · " + diaBR(r.inicio) + " a " + diaBR(r.fim), r.doHistorico ? "do histórico" : "agora", U.tabelaHtml([
        { rotulo: "Regra", conteudo: function (x) { return U.esc(x.regra); } },
        { rotulo: "O que foi conferido", conteudo: function (x) {
          var d = x.detalhes || [];
          return "<strong>" + U.esc(x.titulo) + '</strong><div class="secundario">' + U.esc(x.entre) + "</div>" +
            (d.length ? '<ul style="margin:6px 0 0;padding-left:18px">' + d.slice(0, 12).map(function (t) { return "<li>" + U.esc(t) + "</li>"; }).join("") +
              (d.length > 12 ? "<li>… e mais " + (d.length - 12) + "</li>" : "") + "</ul>" : "");
        } },
        { rotulo: "Esperado", direita: true, conteudo: function (x) { return valor(x.esperado, x.unidade); } },
        { rotulo: "Encontrado", direita: true, conteudo: function (x) { return valor(x.encontrado, x.unidade); } },
        { rotulo: "Situação", direita: true, conteudo: function (x) { var t = ROT[x.situacao]; return pastilha(t[0], t[1]); } }
      ], lista, { tituloVazio: "Sem regras" }));
      if (r.naoReconhecidos && r.naoReconhecidos.length) html += '<p class="secundario" style="padding:0 20px">Arquivos que a conferência ainda não usa: ' + U.esc(r.naoReconhecidos.join(", ")) + ".</p>";
      if (r.erros && r.erros.length) html += '<p style="padding:0 20px">' + U.esc(r.erros.join(" ")) + "</p>";
    }

    var corpo;
    if (ST.hist === null) corpo = '<p style="padding:16px 20px" class="secundario">Carregando…</p>';
    else if (ST.erro) corpo = '<p style="padding:16px 20px">' + U.esc(ST.erro) + "</p>";
    else corpo = U.tabelaHtml([
      { rotulo: "Quando", conteudo: function (c) { return U.esc(quando(c.criadoEm)) + '<div class="secundario">' + U.esc(c.criadoPor || "—") + "</div>"; } },
      { rotulo: "Período", conteudo: function (c) { return U.esc(diaBR(c.inicio) + " a " + diaBR(c.fim)); } },
      { rotulo: "Resultado", conteudo: function (c) { return c.ok + " batem · " + c.divergentes + " divergentes · " + c.atencao + " atenção"; } },
      { rotulo: "", direita: true, conteudo: function (c) { return '<button class="botao miudo" data-acao="hotel-conf-abrir" data-id="' + U.esc(c.id) + '">Abrir</button>'; } }
    ], ST.hist, { tituloVazio: "Nenhuma conferência ainda" });
    return html + U.painelHtml("Histórico de conferências", "", corpo);
  };

  T.acoes["hotel-conf-abrir"] = function (id) {
    L.api.get("/api/hotel/conferencias/" + id).then(function (c) {
      ST.resultado = { id: c.id, criadoEm: c.criadoEm, inicio: c.inicio, fim: c.fim, resumo: { ok: c.ok, divergentes: c.divergentes, atencao: c.atencao }, resultados: c.resultado, naoReconhecidos: [], erros: [], doHistorico: true };
      T.renderizar();
    }).catch(function (e) { U.avisar(e.message); });
  };

  // Envio por clique e por arrastar. Encadeia no gancho de eventos existente.
  var ligar0 = T.ligarEventos;
  T.ligarEventos = function () {
    ligar0.apply(this, arguments);
    var arq = U.el("conf-arquivos"), drop = U.el("conf-drop");
    if (arq) arq.addEventListener("change", function () { T._confEnviar(arq.files); });
    if (drop) {
      ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("sobre"); }); });
      ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("sobre"); }); });
      drop.addEventListener("drop", function (e) { T._confEnviar(e.dataTransfer.files); });
    }
  };
})();
