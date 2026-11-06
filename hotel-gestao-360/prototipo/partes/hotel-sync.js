/* ============================================================================
   Hotel no banco: com o servidor ligado (L.USA_BACKEND), todas as áreas do
   hotel são lidas de /api/hotel/dados e cada criação, alteração ou exclusão
   é gravada no PostgreSQL. O navegador deixa de guardar dados do hotel.

   As telas continuam chamando L.criar / L.atualizar / L.excluir; este
   arquivo intercepta essas chamadas para as coleções do hotel. Se o servidor
   recusar (permissão, trava de fechamento, outra pessoa editou antes), a
   tela avisa e recarrega o que está no banco, desfazendo a mudança local.
   ========================================================================== */
(function () {
  if (!L.USA_BACKEND) return;

  var COLECOES = [
    "apartamentos", "hospedagens", "empresas", "cafeAjustes",
    "enxovalItens", "enxovalMovimentos", "frigobarProdutos", "frigobarConsumos",
    "recebimentos", "fechamentosCaixa", "transacoesCartao", "boletos",
    "notasFiscais", "cobrancas", "contasRecorrentes", "contasBancarias",
    "relatoriosDiarios", "diarias", "marcacoesPonto", "ajustesPonto", "fechamentosMes"
  ];
  var sincroniza = function (c) { return COLECOES.indexOf(c) !== -1; };

  var S = L.hotel.sync = { carregado: false, carregando: false, usuarioId: null, versoes: {}, configVersao: 0, fila: Promise.resolve(), pendentes: 0 };

  // Nada do hotel fica no localStorage: o banco é a fonte.
  L.filtrarParaLocal = function (estado) {
    var copia = {};
    Object.keys(estado).forEach(function (k) {
      if (!sincroniza(k) && k !== "configHotel" && k !== "importacoes") copia[k] = estado[k];
    });
    return copia;
  };

  function aplicar(r) {
    COLECOES.forEach(function (c) { L.estado[c] = (r.colecoes && r.colecoes[c]) || []; });
    S.versoes = r.versoes || {};
    if (r.config) L.estado.configHotel = Object.assign({}, L.estado.configHotel, r.config);
    S.configVersao = r.configVersao || 0;
    L.versao++;
  }

  S.carregar = function () {
    if (S.carregando) return S._promessa;
    S.carregando = true;
    S._promessa = L.api.get("/api/hotel/dados").then(function (r) {
      aplicar(r); S.carregado = true; S.erro = null;
    }).catch(function (e) {
      S.erro = e.message || "Não foi possível carregar os dados do hotel.";
      U.avisar(S.erro + " Tentando de novo em instantes.");
      // Falha passageira (rede, servidor reiniciando): tenta de novo sozinho.
      setTimeout(function () { S.erro = null; if (typeof T !== "undefined" && T.renderizar) T.renderizar(); }, 8000);
    }).then(function () {
      S.carregando = false;
      if (typeof T !== "undefined" && T.renderizar) T.renderizar();
    });
    return S._promessa;
  };

  function enfileirar(fn) {
    S.pendentes++;
    S.fila = S.fila.then(fn).catch(function (e) {
      U.avisar("Não foi salvo no banco: " + (e.message || "erro desconhecido") + " A tela foi recarregada com o que está gravado.");
      return S.carregar();
    }).then(function () { S.pendentes--; });
    return S.fila;
  }

  function enviar(colecao, registro) {
    var dados = JSON.parse(JSON.stringify(registro));
    var id = registro.id;
    enfileirar(function () {
      var v = (S.versoes[colecao] || {})[id];
      return L.api.chamar("PUT", "/api/hotel/dados/" + colecao + "/" + encodeURIComponent(id), { dados: dados, versao: v === undefined ? 0 : v })
        .then(function (r) { (S.versoes[colecao] = S.versoes[colecao] || {})[id] = r.versao; });
    });
  }

  var criar0 = L.criar, atualizar0 = L.atualizar, excluir0 = L.excluir, registrar0 = L.registrar;

  L.criar = function (colecao, registro) {
    var r = criar0.apply(L, arguments);
    if (sincroniza(colecao)) enviar(colecao, r);
    return r;
  };
  L.atualizar = function (colecao, id) {
    var r = atualizar0.apply(L, arguments);
    if (r && sincroniza(colecao)) enviar(colecao, r);
    return r;
  };
  L.excluir = function (colecao, id) {
    var r = excluir0.apply(L, arguments);
    if (r && sincroniza(colecao)) {
      enfileirar(function () {
        return L.api.chamar("DELETE", "/api/hotel/dados/" + colecao + "/" + encodeURIComponent(id) + "?motivo=" + encodeURIComponent("Excluído na tela por " + ((L.estado.usuario || {}).nome || "usuário")));
      });
    }
    return r;
  };
  // A tela de Cadastros do Hotel grava as regras com L.registrar("configHotel").
  L.registrar = function (colecao) {
    var r = registrar0.apply(L, arguments);
    if (colecao === "configHotel") {
      var cfg = JSON.parse(JSON.stringify(L.estado.configHotel));
      enfileirar(function () {
        return L.api.chamar("PUT", "/api/hotel/dados/config/configHotel", { dados: cfg, versao: S.configVersao })
          .then(function (x) { S.configVersao = x.versao; });
      });
    }
    return r;
  };

  // Carrega na primeira tela depois do login (e de novo se trocar de usuário).
  var renderizar0 = T.renderizar;
  T.renderizar = function () {
    var u = L.estado.usuario;
    if (u && (S.usuarioId !== (u.id || u.email))) {
      S.usuarioId = u.id || u.email; S.carregado = false;
      COLECOES.forEach(function (c) { L.estado[c] = []; });
    }
    if (u && !S.carregado && !S.carregando && !S.erro) S.carregar();
    return renderizar0.apply(T, arguments);
  };

  // Fechar a aba com gravação pendente perderia a mudança.
  window.addEventListener("beforeunload", function (e) {
    if (S.pendentes > 0) { e.preventDefault(); e.returnValue = ""; }
  });
})();
