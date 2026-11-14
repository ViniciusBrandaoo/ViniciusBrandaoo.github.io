/* ============================================================================
   Telas do hotel. Só desenham o que `hotel-dominio.js` calcula.
   Carregado depois de telas-c.js: estende menu, perfis, dashboard e eventos.
   ========================================================================== */

(function () {
  var H = L.hotel;

  // ------------------------------------------------------------ menu e perfis

  var NOVOS = [
    { grupo: "Hotel", chave: "hospedagem", nome: "Hospedagem do Dia", icone: "documentos" },
    { grupo: "Hotel", chave: "cafe", nome: "Café da Manhã", icone: "ferias" },
    { grupo: "Hotel", chave: "governanca", nome: "Governança e Enxoval", icone: "operacao" },
    { grupo: "Hotel", chave: "frigobar", nome: "Frigobar", icone: "fatia" },
    { grupo: "Hotel", chave: "importacoes", nome: "Importações DataHotel", icone: "relatorios" },
    { grupo: "Hotel", chave: "conferencia", nome: "Conferência do Fechamento", icone: "fechamento" },
    { grupo: "Financeiro", chave: "caixa", nome: "Fechamento de Caixa", icone: "fechamento" },
    { grupo: "Financeiro", chave: "cartoes", nome: "Cartões e Depósitos", icone: "contas" },
    { grupo: "Financeiro", chave: "boletos", nome: "Boletos e Notas Fiscais", icone: "contratos" },
    { grupo: "Financeiro", chave: "empresas", nome: "Faturamento de Empresas", icone: "fornecedores" },
    { grupo: "Financeiro", chave: "recorrentes", nome: "Contas Fixas e Calendário", icone: "ferias" },
    { grupo: "Financeiro", chave: "fluxo", nome: "Fluxo de Caixa", icone: "relatorios" },
    { grupo: "Pessoas", chave: "ponto", nome: "Ponto e Diárias", icone: "banco" },
    { grupo: "Operação", chave: "fechamentomes", nome: "Fechamento do Mês", icone: "fechamento" },
    { grupo: "Configuração", chave: "hotelconfig", nome: "Cadastros do Hotel", noMenuLateral: true, icone: "configuracoes" }
  ];
  // "Hotel" abre o menu: é o que a operação usa todo dia.
  var pos = T.MODULOS.findIndex(function (m) { return m.grupo === "Pessoas"; });
  NOVOS.filter(function (m) { return m.grupo === "Hotel"; }).reverse().forEach(function (m) { T.MODULOS.splice(pos, 0, m); });
  NOVOS.filter(function (m) { return m.grupo !== "Hotel"; }).forEach(function (m) {
    var ultimo = -1;
    T.MODULOS.forEach(function (x, i) { if (x.grupo === m.grupo) ultimo = i; });
    T.MODULOS.splice(ultimo + 1, 0, m);
  });
  NOVOS.forEach(function (m) {
    T.ICONES_MODULO[m.chave] = m.icone;
    if (m.chave !== "hotelconfig") T.MODULOS_DELEGAVEIS.push(m);
  });
  T.GRUPOS_ACORDEAO.unshift("Hotel");
  T.ICONES_CATEGORIA.Hotel = "hotel";
  U.ICONES.hotel = '<path d="M3 19.5v-12M3 15h18v4.5M21 15v-3.5a2.5 2.5 0 0 0-2.5-2.5H11v6"/><circle cx="7" cy="11.5" r="1.8"/>';

  function addMod(perfil, chaves) { var p = T.PERFIS[perfil]; if (p && p.modulos !== "*") chaves.forEach(function (c) { if (p.modulos.indexOf(c) === -1) p.modulos.push(c); }); }
  addMod("FINANCEIRO", ["hospedagem", "caixa", "cartoes", "boletos", "empresas", "recorrentes", "fluxo", "frigobar", "importacoes", "conferencia", "fechamentomes"]);
  addMod("RH", ["ponto"]);
  addMod("ADMINISTRATIVO", ["recorrentes"]);
  addMod("GESTOR", ["ponto"]);
  T.PERFIS.RECEPCAO = { nome: "Recepção", resumo: "Hospedagens, café, frigobar e fechamento operacional do caixa.",
    modulos: ["dashboard", "hospedagem", "cafe", "frigobar", "caixa", "importacoes", "conferencia", "solicitacoes"] };
  T.PERFIS.GOVERNANCA = { nome: "Governança", resumo: "Lista de apartamentos, enxoval, lavanderia e reposição.",
    modulos: ["dashboard", "governanca", "cafe", "solicitacoes"] };
  T.PERFIS.SECRETARIA.nome = "Recepção (documentos)";
  // Recursos Humanos não vê caixa nem empresa; Recepção não vê salário nem
  // banco de horas: a separação vem do perfil, não da boa vontade da tela.

  // ------------------------------------------------------------ utilidades

  T.filtros.dataHotel = T.filtros.dataHotel || L.hoje();
  function dataSel() { return T.filtros.dataHotel || L.hoje(); }
  function compSel() { return (T.filtros.mesHotel || dataSel().slice(0, 7)); }
  function brl(c) { return c == null ? "—" : L.brl(c); }
  function pct(x) { return (x * 100).toFixed(1).replace(".", ",") + "%"; }
  function horas(min) { var s = min < 0 ? "−" : ""; min = Math.abs(min); return s + Math.floor(min / 60) + "h" + String(min % 60).padStart(2, "0"); }
  function pastilha(tom, txt) { return '<span class="pastilha ' + tom + '">' + U.esc(txt) + "</span>"; }
  // Verde regular · amarelo atenção · vermelho problema · azul informação.
  var TOM = { CONCILIADO: "ok", RECEBIDO: "ok", PAGO: "ok", QUITADA: "ok", FECHADO: "ok", CONCLUIDA: "ok", APROVADO: "ok",
    A_RECEBER: "info", EMITIDO: "info", A_VENCER: "atencao", FATURAR: "info", PENDENTE: "atencao", PARCIAL: "atencao",
    ABERTO: "info", EM_CONFERENCIA: "atencao", AGUARDANDO_APROVACAO: "atencao", COM_PENDENCIAS: "atencao", CONCLUIDA_COM_PENDENCIAS: "atencao",
    DIVERGENTE: "critico", ATRASADO: "critico", VENCIDO: "critico", CANCELADO: "neutro", ESTORNADO: "neutro", SEM_VALOR: "neutro" };
  var ROT = { A_RECEBER: "A receber", A_VENCER: "A vencer", PARCIAL: "Parcial", CONCLUIDA_COM_PENDENCIAS: "Com pendências",
    EM_CONFERENCIA: "Em conferência", COM_PENDENCIAS: "Com pendências", AGUARDANDO_APROVACAO: "Aguardando aprovação", FATURAR: "A faturar" };
  function status(s) { return pastilha(TOM[s] || "neutro", ROT[s] || (s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " "))); }

  function barraData(comMes) {
    return '<div class="barra-ferramentas"><span class="filtro-rotulo">' + (comMes ? "Mês" : "Data") + "</span>" +
      (comMes
        ? '<input type="month" class="hotel-filtro" data-chave="mesHotel" value="' + compSel() + '">'
        : '<input type="date" class="hotel-filtro" data-chave="dataHotel" value="' + dataSel() + '">') +
      '<span class="direita"><button class="botao miudo" data-acao="hotel-exportar">Exportar Excel</button> ' +
      '<button class="botao miudo" data-acao="hotel-imprimir">PDF / imprimir</button></span></div>';
  }
  // O que "Exportar Excel" baixa é o que a tela registrou neste render.
  T._export = null;
  function exportavel(nome, cab, linhas) { T._export = { nome: nome, cab: cab, linhas: linhas }; }
  function kpis(lista) { return '<div class="grade-kpi">' + lista.map(U.kpiHtml).join("") + "</div>"; }
  function vazio(t, x, a) { return U.vazioHtml(t, x, a); }
  function origemTag(r) { return r && r.origem ? '<div class="secundario">origem: ' + U.esc(r.origem) + (r.codigoOrigem ? " · " + U.esc(r.codigoOrigem) : "") + "</div>" : ""; }
  function opcoesFormas() { return Object.keys(H.FORMAS).map(function (k) { return { valor: k, rotulo: H.FORMAS[k].nome }; }); }
  function podeFinanceiro() { return T.temPerfil("DIRECAO", "FINANCEIRO"); }

  // ------------------------------------------------------------ formulários genéricos

  var FORMS = {
    apartamentos: { titulo: "Apartamento", campos: [
      { id: "numero", rotulo: "Número", obrigatorio: true, par: true }, { id: "tipologia", rotulo: "Tipologia", dicaCampo: "Standard, Luxo…" },
      { id: "capacidade", rotulo: "Capacidade (pessoas)", tipo: "numero", par: true },
      { id: "bloqueado", rotulo: "Situação", tipo: "select", opcoes: [{ valor: "", rotulo: "À venda" }, { valor: "1", rotulo: "Bloqueado (manutenção / uso interno)" }] }],
      ler: function (v) { v.bloqueado = !!v.bloqueado; return v; } },
    hospedagens: { titulo: "Hospedagem (lançamento interno)", campos: [
      { id: "hospede", rotulo: "Hóspede", obrigatorio: true }, { id: "apartamento", rotulo: "Apartamento", obrigatorio: true, par: true },
      { id: "empresa", rotulo: "Empresa pagadora (se faturado)" },
      { id: "checkin", rotulo: "Check-in", tipo: "data", obrigatorio: true, par: true }, { id: "checkout", rotulo: "Check-out previsto", tipo: "data", obrigatorio: true },
      { id: "checkoutRealizado", rotulo: "Check-out realizado", tipo: "data", par: true }, { id: "status", rotulo: "Situação", tipo: "select", opcoes: ["CONFIRMADA", "HOSPEDADO", "ENCERRADA", "CANCELADA", "NO_SHOW"] },
      { id: "adultos", rotulo: "Adultos", tipo: "numero", par: true }, { id: "criancas", rotulo: "Crianças", tipo: "numero" },
      { id: "valorDiaria", rotulo: "Valor da diária", tipo: "moeda", par: true }, { id: "consumos", rotulo: "Consumos adicionais", tipo: "moeda" },
      { id: "descontos", rotulo: "Descontos", tipo: "moeda", par: true }, { id: "valorPago", rotulo: "Valor pago", tipo: "moeda" },
      { id: "formaPagamento", rotulo: "Forma de pagamento", tipo: "select", opcoes: [{ valor: "", rotulo: "—" }].concat(opcoesFormas()), par: true },
      { id: "cafeIncluido", rotulo: "Café da manhã", tipo: "select", opcoes: [{ valor: "1", rotulo: "Incluído" }, { valor: "", rotulo: "Não incluído" }] },
      { id: "observacaoInterna", rotulo: "Observação interna", tipo: "textarea" }],
      ler: function (v) { v.cafeIncluido = !!v.cafeIncluido; if (!v.checkoutRealizado) delete v.checkoutRealizado; return v; } },
    cafeAjustes: { titulo: "Ajuste do café (extra autorizado)", campos: [
      { id: "data", rotulo: "Data", tipo: "data", obrigatorio: true, par: true }, { id: "quantidade", rotulo: "Pessoas a mais (ou a menos)", tipo: "numero", obrigatorio: true },
      { id: "apartamento", rotulo: "Apartamento / referência" }, { id: "justificativa", rotulo: "Justificativa", tipo: "textarea", obrigatorio: true }] },
    enxovalItens: { titulo: "Item de enxoval", campos: [
      { id: "nome", rotulo: "Item", obrigatorio: true }, { id: "minimo", rotulo: "Quantidade mínima desejada", tipo: "numero", par: true },
      { id: "perdaMaximaMes", rotulo: "Perda máxima aceitável no mês", tipo: "numero" }] },
    frigobarProdutos: { titulo: "Produto do frigobar", campos: [
      { id: "codigo", rotulo: "Código", par: true }, { id: "nome", rotulo: "Nome", obrigatorio: true }, { id: "categoria", rotulo: "Categoria", par: true },
      { id: "situacao", rotulo: "Situação", tipo: "select", opcoes: ["ATIVO", "INATIVO"] },
      { id: "custo", rotulo: "Custo de aquisição", tipo: "moeda", par: true }, { id: "precoVenda", rotulo: "Preço de venda", tipo: "moeda", obrigatorio: true },
      { id: "estoque", rotulo: "Estoque", tipo: "numero", par: true }, { id: "estoqueMinimo", rotulo: "Estoque mínimo", tipo: "numero" }] },
    frigobarConsumos: { titulo: "Consumo de frigobar", campos: function () { return [
      { id: "data", rotulo: "Data", tipo: "data", obrigatorio: true, par: true }, { id: "apartamento", rotulo: "Apartamento", obrigatorio: true },
      { id: "produtoId", rotulo: "Produto", tipo: "select", obrigatorio: true, opcoes: L.estado.frigobarProdutos.filter(function (p) { return p.situacao !== "INATIVO"; }).map(function (p) { return { valor: p.id, rotulo: p.nome + " · " + L.brl(p.precoVenda) }; }) },
      { id: "quantidade", rotulo: "Quantidade", tipo: "numero", obrigatorio: true, par: true },
      { id: "cobrado", rotulo: "Cobrança", tipo: "select", opcoes: [{ valor: "", rotulo: "Ainda não lançado na conta" }, { valor: "1", rotulo: "Já lançado na conta do hóspede" }] }]; },
      ler: function (v) { v.cobrado = !!v.cobrado; v.registradoPor = (L.estado.usuario || {}).nome; return v; } },
    recebimentos: { titulo: "Movimentação de caixa / recebimento", campos: [
      { id: "data", rotulo: "Data da operação", tipo: "data", obrigatorio: true, par: true },
      { id: "tipo", rotulo: "Tipo", tipo: "select", opcoes: [{ valor: "", rotulo: "Entrada / recebimento" }, { valor: "SAIDA_CAIXA", rotulo: "Saída do caixa (dinheiro)" }] },
      { id: "forma", rotulo: "Forma de pagamento", tipo: "select", opcoes: opcoesFormas(), par: true }, { id: "pagador", rotulo: "Hóspede ou empresa" },
      { id: "apartamento", rotulo: "Apartamento / referência", par: true }, { id: "descricao", rotulo: "Descrição" },
      { id: "valorBruto", rotulo: "Valor bruto", tipo: "moeda", obrigatorio: true, par: true }, { id: "desconto", rotulo: "Desconto", tipo: "moeda" },
      { id: "taxa", rotulo: "Taxa financeira", tipo: "moeda", par: true }, { id: "previstoPara", rotulo: "Recebimento previsto para", tipo: "data" },
      { id: "codigoTransacao", rotulo: "Código da transação / NSU", par: true }, { id: "contaFinanceira", rotulo: "Conta financeira" }],
      ler: function (v) { if (!v.tipo) delete v.tipo; if (!v.previstoPara) delete v.previstoPara; return v; } },
    transacoesCartao: { titulo: "Venda no cartão", campos: [
      { id: "dataVenda", rotulo: "Data da venda", tipo: "data", obrigatorio: true, par: true }, { id: "modalidade", rotulo: "Modalidade", tipo: "select", opcoes: ["CREDITO", "DEBITO"] },
      { id: "operadora", rotulo: "Operadora", par: true }, { id: "bandeira", rotulo: "Bandeira" },
      { id: "parcelas", rotulo: "Parcelas", tipo: "numero", par: true }, { id: "codigoTransacao", rotulo: "Código da transação" },
      { id: "valorVenda", rotulo: "Valor da venda", tipo: "moeda", obrigatorio: true, par: true }, { id: "taxa", rotulo: "Taxa cobrada", tipo: "moeda" },
      { id: "antecipacao", rotulo: "Custo de antecipação", tipo: "moeda", par: true }, { id: "dataPrevista", rotulo: "Recebimento previsto", tipo: "data" }] },
    boletos: { titulo: "Boleto a receber", campos: function () { return [
      { id: "empresaId", rotulo: "Empresa", tipo: "select", opcoes: [{ valor: "", rotulo: "—" }].concat(L.estado.empresas.map(function (e) { return { valor: e.id, rotulo: e.nomeFantasia || e.razaoSocial }; })) },
      { id: "documento", rotulo: "Documento / nosso número", par: true }, { id: "emissao", rotulo: "Emissão", tipo: "data" },
      { id: "vencimento", rotulo: "Vencimento", tipo: "data", obrigatorio: true, par: true }, { id: "valor", rotulo: "Valor", tipo: "moeda", obrigatorio: true },
      { id: "notaFiscal", rotulo: "Nota fiscal vinculada" }]; },
      ler: function (v) { var e = L.buscarPorId("empresas", v.empresaId); v.empresaNome = e ? (e.nomeFantasia || e.razaoSocial) : ""; return v; } },
    empresas: { titulo: "Empresa cliente", campos: [
      { id: "razaoSocial", rotulo: "Razão social", obrigatorio: true }, { id: "nomeFantasia", rotulo: "Nome fantasia (como aparece no DataHotel)", par: true }, { id: "cnpj", rotulo: "CNPJ" },
      { id: "endereco", rotulo: "Endereço" }, { id: "emailFinanceiro", rotulo: "E-mail financeiro", par: true }, { id: "telefone", rotulo: "Telefone / WhatsApp" },
      { id: "responsavel", rotulo: "Responsável financeiro", par: true }, { id: "prazoDias", rotulo: "Prazo de pagamento (dias)", tipo: "numero" },
      { id: "formaCobranca", rotulo: "Forma de cobrança", tipo: "select", opcoes: ["BOLETO", "PIX", "TRANSFERENCIA"], par: true }, { id: "condicoes", rotulo: "Condições comerciais" },
      { id: "observacoes", rotulo: "Observações", tipo: "textarea" }] },
    notasFiscais: { titulo: "Nota fiscal (emitida fora do sistema)", campos: function () { return [
      { id: "empresaId", rotulo: "Empresa", tipo: "select", obrigatorio: true, opcoes: L.estado.empresas.map(function (e) { return { valor: e.id, rotulo: e.nomeFantasia || e.razaoSocial }; }) },
      { id: "numero", rotulo: "Número", obrigatorio: true, par: true }, { id: "serie", rotulo: "Série" },
      { id: "emissao", rotulo: "Emissão", tipo: "data", obrigatorio: true, par: true }, { id: "competencia", rotulo: "Competência", dicaCampo: "AAAA-MM", obrigatorio: true },
      { id: "valor", rotulo: "Valor", tipo: "moeda", obrigatorio: true, par: true }, { id: "servico", rotulo: "Serviço" },
      { id: "status", rotulo: "Situação", tipo: "select", opcoes: ["EMITIDA", "CANCELADA", "SUBSTITUIDA"] }]; } },
    contasRecorrentes: { titulo: "Conta recorrente", campos: function () { return [
      { id: "descricao", rotulo: "Descrição", obrigatorio: true }, { id: "tipoConta", rotulo: "Tipo", tipo: "select", opcoes: ["FIXA", "VARIAVEL"], par: true },
      { id: "categoria", rotulo: "Categoria", tipo: "select", opcoes: T.CATEGORIAS },
      { id: "fornecedorId", rotulo: "Fornecedor", tipo: "select", opcoes: [{ valor: "", rotulo: "—" }].concat(L.estado.fornecedores.map(function (f) { return { valor: f.id, rotulo: f.razaoSocial }; })) },
      { id: "valorPrevisto", rotulo: "Valor previsto", tipo: "moeda", obrigatorio: true, par: true },
      { id: "periodicidade", rotulo: "Periodicidade", tipo: "select", opcoes: ["MENSAL", "SEMANAL", "ANUAL", "PERSONALIZADA"] },
      { id: "dia", rotulo: "Dia do vencimento", tipo: "numero", par: true }, { id: "diaSemana", rotulo: "Dia da semana (semanal: 0=dom … 6=sáb)", tipo: "numero" },
      { id: "mes", rotulo: "Mês (anual)", tipo: "numero", par: true }, { id: "aCadaMeses", rotulo: "A cada N meses (personalizada)", tipo: "numero" },
      { id: "inicio", rotulo: "Início", tipo: "data", par: true }, { id: "fim", rotulo: "Fim (opcional)", tipo: "data" }]; } },
    marcacoesPonto: { titulo: "Marcação de ponto", campos: function () { return [
      { id: "funcionarioId", rotulo: "Funcionário", tipo: "select", obrigatorio: true, opcoes: L.ativos().map(function (f) { return { valor: f.id, rotulo: f.nome }; }) },
      { id: "data", rotulo: "Data", tipo: "data", obrigatorio: true, par: true }, { id: "falta", rotulo: "Falta", tipo: "select", opcoes: [{ valor: "", rotulo: "Não" }, { valor: "1", rotulo: "Falta no dia" }] },
      { id: "entrada", rotulo: "Entrada", dicaCampo: "08:00", par: true }, { id: "inicioIntervalo", rotulo: "Início do intervalo", dicaCampo: "12:00" },
      { id: "fimIntervalo", rotulo: "Fim do intervalo", dicaCampo: "13:00", par: true }, { id: "saida", rotulo: "Saída", dicaCampo: "17:00" },
      { id: "observacoes", rotulo: "Observações", tipo: "textarea" }]; },
      ler: function (v) { v.falta = !!v.falta; return v; } },
    diarias: { titulo: "Diária trabalhada", campos: function () { return [
      { id: "funcionarioId", rotulo: "Trabalhador", tipo: "select", obrigatorio: true, opcoes: L.ativos().map(function (f) { return { valor: f.id, rotulo: f.nome }; }) },
      { id: "data", rotulo: "Data trabalhada", tipo: "data", obrigatorio: true, par: true }, { id: "quantidade", rotulo: "Quantidade de diárias", tipo: "numero", passo: "0.5" },
      { id: "valorUnitario", rotulo: "Valor contratado por diária", tipo: "moeda", obrigatorio: true, par: true }, { id: "adiantamento", rotulo: "Adiantamento", tipo: "moeda" },
      { id: "ajuste", rotulo: "Ajuste (+/−)", tipo: "moeda", par: true }, { id: "pago", rotulo: "Valor já pago", tipo: "moeda" },
      { id: "dataPagamento", rotulo: "Data de pagamento", tipo: "data" }]; },
      ler: function (v) { if (!v.quantidade) v.quantidade = 1; return v; } }
  };
  var PADRAO = {
    hospedagens: function () { return { checkin: dataSel(), checkout: H.addDias(dataSel(), 1), adultos: 1, cafeIncluido: "1", status: "CONFIRMADA" }; },
    cafeAjustes: function () { return { data: dataSel() }; },
    frigobarConsumos: function () { return { data: dataSel(), quantidade: 1 }; },
    recebimentos: function () { return { data: dataSel(), forma: "DINHEIRO" }; },
    transacoesCartao: function () { return { dataVenda: dataSel(), modalidade: "CREDITO", parcelas: 1 }; },
    boletos: function () { return { emissao: L.hoje() }; },
    notasFiscais: function () { return { emissao: L.hoje(), competencia: compSel(), status: "EMITIDA" }; },
    contasRecorrentes: function () { return { periodicidade: "MENSAL", dia: 10, tipoConta: "FIXA", inicio: L.hoje() }; },
    marcacoesPonto: function () { return { data: dataSel() }; },
    diarias: function () { return { data: dataSel(), quantidade: 1 }; }
  };

  T.acoes["hotel-novo"] = function (alvo) {
    var partes = String(alvo).split(":"), col = partes[0], id = partes[1];
    var f = FORMS[col]; if (!f) return;
    var atual = id ? L.buscarPorId(col, id) : null;
    var campos = typeof f.campos === "function" ? f.campos() : f.campos;
    var valores = atual ? Object.assign({}, atual) : (PADRAO[col] ? PADRAO[col]() : {});
    campos.forEach(function (c) {
      if (c.tipo === "moeda" && typeof valores[c.id] === "number") valores[c.id] = (valores[c.id] / 100).toFixed(2);
      if (c.tipo === "select" && typeof valores[c.id] === "boolean") valores[c.id] = valores[c.id] ? "1" : "";
    });
    if (atual && atual.origem) campos = campos.concat([{ id: "justificativa", rotulo: "Justificativa da correção (dado importado)", tipo: "textarea", obrigatorio: true }]);
    U.abrirFormulario({
      titulo: (atual ? "Editar " : "Novo · ") + f.titulo.toLowerCase(), largo: campos.length > 6,
      campos: campos, valores: valores,
      aoSalvar: function (v) {
        if (f.ler) v = f.ler(v);
        if (atual) L.atualizar(col, atual.id, v); else L.criar(col, v);
        U.fecharModal(); T.renderizar(); U.avisar("Salvo.");
      }
    });
  };
  function botaoNovo(col, rotulo) { return '<button class="botao primario" data-acao="hotel-novo" data-id="' + col + '">' + U.esc(rotulo) + "</button>"; }
  function botaoEditar(col, r) { return T.podeEditar() ? '<button class="botao miudo" data-acao="hotel-novo" data-id="' + col + ":" + r.id + '">Editar</button>' : ""; }

  T.acoes["hotel-exportar"] = function () {
    if (!T._export) return U.avisar("Nada para exportar nesta tela.");
    var csv = H.paraCsv(T._export.cab, T._export.linhas);
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = T._export.nome + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
  };
  T.acoes["hotel-imprimir"] = function () { window.print(); };

  // ------------------------------------------------------------ hospedagem do dia

  T.telas.hospedagem = function () {
    var d = dataSel(), o = H.ocupacao(d), ext = H.extratoDiario(d);
    var tot = ext.reduce(function (a, x) { a.total += x.total; a.pago += x.pago; a.pend += x.pendente; return a; }, { total: 0, pago: 0, pend: 0 });
    var rel = L.estado.relatoriosDiarios.find(function (r) { return r.data === d; });
    exportavel("extrato-hospedagem-" + d,
      ["Apartamento", "Hóspede", "Check-in", "Check-out previsto", "Check-out realizado", "Diárias", "Diária", "Hospedagem", "Consumos", "Descontos", "Total", "Pago", "Pendente", "Forma", "Empresa", "Situação", "Origem"],
      ext.map(function (x) { var h = x.hospedagem; return [h.apartamento, h.hospede, h.checkin, h.checkout, h.checkoutRealizado || "", x.diarias, H.reaisCsv(h.valorDiaria), H.reaisCsv(x.valorHospedagem), H.reaisCsv(h.consumos), H.reaisCsv(h.descontos), H.reaisCsv(x.total), H.reaisCsv(x.pago), H.reaisCsv(x.pendente), (H.FORMAS[h.formaPagamento] || {}).nome || "", h.empresa || "", x.situacao, h.origem || "interno"]; }));
    var html = T.cabecalho("Hospedagem do Dia", "Ocupação, extrato e relatório diário. Dados do DataHotel + complementos internos.", botaoNovo("hospedagens", "Lançar hospedagem"));
    html += barraData();
    if (!L.estado.apartamentos.length) html += '<div class="painel">' + vazio("Cadastre os apartamentos", "A taxa de ocupação precisa saber quantos apartamentos existem e quais estão bloqueados.", { acao: "hotel-novo", rotulo: "Cadastrar apartamento" }).replace('data-acao="hotel-novo"', 'data-acao="hotel-novo" data-id="apartamentos"') + "</div>";
    html += kpis([
      { rotulo: "Taxa de ocupação", valor: pct(o.taxa), nota: o.ocupados + " de " + (o.total - o.bloqueados) + " à venda", hero: true },
      { rotulo: "Hóspedes presentes", valor: String(o.hospedes), nota: o.permanencias + " permanências" },
      { rotulo: "Entradas / saídas", valor: o.entradas + " / " + o.saidas, nota: "check-ins e check-outs do dia" },
      { rotulo: "Disponíveis", valor: String(o.disponiveis), nota: o.bloqueados + " bloqueado(s)" }
    ]);
    html += U.painelHtml("Extrato diário de hospedagem", ext.length + " hospedagem(ns) · total " + brl(tot.total) + " · pago " + brl(tot.pago) + " · pendente " + brl(tot.pend), U.tabelaHtml([
      { rotulo: "Apto", conteudo: function (x) { return "<strong>" + U.esc(x.hospedagem.apartamento) + "</strong>"; } },
      { rotulo: "Hóspede", conteudo: function (x) { var h = x.hospedagem; return '<div class="principal">' + U.esc(h.hospede || "") + '</div><div class="secundario">' + L.dataBR(h.checkin) + " → " + L.dataBR(h.checkoutRealizado || h.checkout) + (h.empresa ? " · " + U.esc(h.empresa) : "") + "</div>" + origemTag(h); } },
      { rotulo: "Diárias", direita: true, conteudo: function (x) { return x.diarias + " × " + brl(x.hospedagem.valorDiaria || 0); } },
      { rotulo: "Total", direita: true, conteudo: function (x) { return '<span class="num">' + brl(x.total) + "</span>"; } },
      { rotulo: "Pago", direita: true, conteudo: function (x) { return '<span class="num">' + brl(x.pago) + "</span>"; } },
      { rotulo: "Pendente", direita: true, conteudo: function (x) { return '<span class="num">' + brl(x.pendente) + "</span>"; } },
      { rotulo: "Situação", direita: true, conteudo: function (x) { return status(x.situacao); } },
      { rotulo: "", direita: true, conteudo: function (x) { return botaoEditar("hospedagens", x.hospedagem); } }
    ], ext, { buscaLocal: "Hóspede, apartamento ou empresa", tituloVazio: "Nenhuma hospedagem nesta data", textoVazio: "Importe o relatório do DataHotel em Importações ou lance manualmente." }));
    // Relatório diário: elaboração → conferência → aprovação → fechamento.
    var etapas = ["ELABORACAO", "CONFERIDO", "APROVADO", "FECHADO"];
    var atual = rel ? rel.status : "ELABORACAO";
    var prox = etapas[etapas.indexOf(atual) + 1];
    html += U.painelHtml("Relatório diário", rel ? ("Gerado por " + U.esc(rel.responsavel || "") + " em " + new Date(rel.geradoEm).toLocaleString("pt-BR")) : "Ainda não gerado",
      '<div style="padding:0 20px 18px">' + etapas.map(function (e, i) { return pastilha(etapas.indexOf(atual) >= i && rel ? "ok" : "neutro", ["Elaboração", "Conferência", "Aprovação", "Fechamento"][i]); }).join(" → ") +
      (rel && rel.pendencias ? '<p class="secundario">Pendências: ' + U.esc(rel.pendencias) + "</p>" : "") +
      (T.podeEditar() && atual !== "FECHADO" ? ' <button class="botao miudo primario" data-acao="hotel-relatorio-dia">' + (rel ? "Avançar para " + ["", "conferência", "aprovação", "fechamento"][etapas.indexOf(prox)] : "Gerar relatório do dia") + "</button>" : "") +
      (atual === "FECHADO" ? '<p class="secundario">Fechado. Qualquer alteração em hospedagem fica registrada na trilha de auditoria com valor anterior e justificativa.</p>' : "") + "</div>");
    return html;
  };
  T.acoes["hotel-relatorio-dia"] = function () {
    var d = dataSel(), rel = L.estado.relatoriosDiarios.find(function (r) { return r.data === d; });
    var u = (L.estado.usuario || {}).nome;
    if (!rel) {
      var pend = H.extratoDiario(d).filter(function (x) { return x.situacao === "PENDENTE"; }).length;
      L.criar("relatoriosDiarios", { data: d, status: "ELABORACAO", responsavel: u, geradoEm: new Date().toISOString(), ocupacao: H.ocupacao(d), pendencias: pend ? pend + " hospedagem(ns) com saldo pendente" : "" });
    } else {
      var ordem = ["ELABORACAO", "CONFERIDO", "APROVADO", "FECHADO"];
      var prox = ordem[ordem.indexOf(rel.status) + 1];
      if ((prox === "APROVADO" || prox === "FECHADO") && !T.temPerfil("DIRECAO", "FINANCEIRO")) return U.avisar("Aprovar e fechar é da Direção ou do Financeiro.");
      var m = { status: prox }; m[prox.toLowerCase() + "Por"] = u; m[prox.toLowerCase() + "Em"] = new Date().toISOString();
      L.atualizar("relatoriosDiarios", rel.id, m);
    }
    T.renderizar();
  };

  // ------------------------------------------------------------ café

  T.telas.cafe = function () {
    var c = H.listaCafe(dataSel());
    exportavel("cafe-" + c.data, ["Apartamento", "Hóspede", "Adultos", "Crianças", "Café incluído", "Previstos"],
      c.linhas.map(function (l) { return [l.apartamento, l.hospede, l.adultos, l.criancas, l.incluido ? "Sim" : "Não", l.previstos]; }).concat([["Extras autorizados", "", "", "", "", c.extras], ["TOTAL PREVISTO", "", c.adultos, c.criancas, "", c.totalPrevisto]]));
    var html = T.cabecalho("Café da Manhã", "Quem pernoitou na noite anterior. Horário: " + L.estado.configHotel.cafeHorario + ".", botaoNovo("cafeAjustes", "Extra / ajuste"));
    html += barraData();
    html += kpis([
      { rotulo: "Total previsto", valor: String(c.totalPrevisto), nota: "com café + extras", hero: true },
      { rotulo: "Adultos / crianças", valor: c.adultos + " / " + c.criancas, nota: "hóspedes que pernoitaram" },
      { rotulo: "Sem café incluído", valor: String(c.semCafe), nota: "não contam no previsto" },
      { rotulo: "Atendidos", valor: c.atendidos == null ? "—" : String(c.atendidos), nota: "registrado ao fim do serviço", vazio: c.atendidos == null }
    ]);
    html += U.painelHtml("Lista por apartamento", "", U.tabelaHtml([
      { rotulo: "Apto", conteudo: function (l) { return "<strong>" + U.esc(l.apartamento) + "</strong>"; } },
      { rotulo: "Hóspede", conteudo: function (l) { return U.esc(l.hospede || ""); } },
      { rotulo: "Adultos", direita: true, conteudo: function (l) { return l.adultos; } },
      { rotulo: "Crianças", direita: true, conteudo: function (l) { return l.criancas; } },
      { rotulo: "Café", direita: true, conteudo: function (l) { return l.incluido ? pastilha("ok", "Incluído") : pastilha("neutro", "Não incluído"); } }
    ], c.linhas, { tituloVazio: "Ninguém pernoitou na noite anterior", textoVazio: "A lista vem das hospedagens importadas do DataHotel." }));
    if (c.ajustes.length) html += U.painelHtml("Ajustes justificados", "não alteram o dado de origem", U.tabelaHtml([
      { rotulo: "Quantidade", conteudo: function (a) { return a.tipo === "ATENDIDOS" ? "Atendidos: " + a.atendidos : (a.quantidade > 0 ? "+" : "") + a.quantidade; } },
      { rotulo: "Referência", conteudo: function (a) { return U.esc(a.apartamento || ""); } },
      { rotulo: "Justificativa", conteudo: function (a) { return U.esc(a.justificativa || ""); } }
    ], c.ajustes));
    if (T.podeEditar()) html += '<div class="painel" style="padding:16px 20px"><button class="botao" data-acao="hotel-cafe-atendidos">Registrar total atendido</button></div>';
    return html;
  };
  T.acoes["hotel-cafe-atendidos"] = function () {
    U.abrirFormulario({ titulo: "Total efetivamente atendido", campos: [{ id: "atendidos", rotulo: "Pessoas atendidas", tipo: "numero", obrigatorio: true }, { id: "justificativa", rotulo: "Observação operacional", tipo: "textarea" }],
      aoSalvar: function (v) {
        var ja = L.estado.cafeAjustes.find(function (a) { return a.data === dataSel() && a.tipo === "ATENDIDOS"; });
        if (ja) L.atualizar("cafeAjustes", ja.id, { atendidos: v.atendidos, justificativa: v.justificativa });
        else L.criar("cafeAjustes", { data: dataSel(), tipo: "ATENDIDOS", atendidos: v.atendidos, quantidade: 0, justificativa: v.justificativa });
        U.fecharModal(); T.renderizar();
      } });
  };

  // ------------------------------------------------------------ governança

  T.telas.governanca = function () {
    var d = dataSel(), g = H.listaGovernanca(d), alertas = H.alertasEnxoval(d);
    var itens = L.estado.enxovalItens.filter(function (i) { return i.ativo !== false; });
    var ini = d.slice(0, 8) + "01";
    var resumos = itens.map(function (i) { return { item: i, r: H.resumoEnxoval(i.id, ini, d) }; });
    exportavel("enxoval-" + d, ["Item", "Inicial do mês", "Entradas", "Entregue aptos", "Recolhido", "Enviado lavanderia", "Recebido lavanderia", "Danificado", "Extraviado", "Descartado", "Disponível", "Na lavanderia", "Final", "Mínimo"],
      resumos.map(function (x) { var r = x.r; return [x.item.nome, r.inicial, r.entradas, r.entreguesApartamentos, r.recolhidos, r.enviadosLavanderia, r.recebidosLavanderia, r.danificados, r.extraviados, r.descartados, r.disponivel, r.pendenteLavanderia, r.final, r.minimo]; }));
    var html = T.cabecalho("Governança e Enxoval", "Estoque final = inicial + entradas − saídas definitivas. Transferência só muda o local.",
      (itens.length ? '<button class="botao primario" data-acao="hotel-mov-enxoval">Movimentar enxoval</button> ' : "") + botaoNovo("enxovalItens", "Novo item"));
    html += barraData();
    if (!itens.length) html += '<div class="painel">' + vazio("Nenhum item de enxoval", "Comece pelos cinco itens obrigatórios: toalha de rosto, de banho, lençol, fronha e cobertor.", { acao: "hotel-enxoval-padrao", rotulo: "Criar os 5 itens obrigatórios" }) + "</div>";
    if (alertas.length) html += U.painelHtml("Alertas", "", '<ul class="lista-alertas" style="margin:0;padding:0 20px 16px 36px">' + alertas.map(function (a) { return "<li>" + pastilha(a.nivel === "critico" ? "critico" : "atencao", a.nivel === "critico" ? "Crítico" : "Atenção") + " " + U.esc(a.texto) + "</li>"; }).join("") + "</ul>");
    html += U.painelHtml("Lista do dia", g.ocupados + " ocupados · " + g.saidas + " saídas · " + g.entradas + " entradas", U.tabelaHtml([
      { rotulo: "Apto", conteudo: function (a) { return "<strong>" + U.esc(a.apartamento) + "</strong>"; } },
      { rotulo: "O que fazer", conteudo: function (a) { return a.tarefas.map(U.esc).join(" · "); } }
    ], g.apartamentos, { tituloVazio: "Nenhum apartamento para arrumar" }) +
      (Object.keys(g.reposicao).length ? '<p class="secundario" style="padding:0 20px 14px">Reposição pelo padrão de cada apartamento: ' + Object.keys(g.reposicao).map(function (k) { var i = L.buscarPorId("enxovalItens", k); return (i ? i.nome : k) + " " + g.reposicao[k]; }).join(" · ") + "</p>" : ""));
    if (itens.length) html += U.painelHtml("Estoque por item", "mês até " + L.dataBR(d), U.tabelaHtml([
      { rotulo: "Item", conteudo: function (x) { return '<div class="principal">' + U.esc(x.item.nome) + '</div><div class="secundario">mínimo ' + (x.item.minimo || 0) + "</div>"; } },
      { rotulo: "Rouparia", direita: true, conteudo: function (x) { return x.r.porLocal.ROUPARIA; } },
      { rotulo: "Aptos", direita: true, conteudo: function (x) { return x.r.porLocal.APARTAMENTOS; } },
      { rotulo: "Lavanderia", direita: true, conteudo: function (x) { return x.r.porLocal.LAVANDERIA; } },
      { rotulo: "Reserva", direita: true, conteudo: function (x) { return x.r.porLocal.RESERVA; } },
      { rotulo: "Perdas no mês", direita: true, conteudo: function (x) { return x.r.perdas; } },
      { rotulo: "Total", direita: true, conteudo: function (x) { return "<strong>" + x.r.final + "</strong>"; } },
      { rotulo: "", direita: true, conteudo: function (x) { return x.r.disponivel < (x.item.minimo || 0) ? pastilha("critico", "Abaixo do mínimo") : pastilha("ok", "Regular"); } }
    ], resumos));
    var movs = L.estado.enxovalMovimentos.filter(function (m) { return m.data === d; });
    if (movs.length) html += U.painelHtml("Movimentações do dia", "", U.tabelaHtml([
      { rotulo: "Item", conteudo: function (m) { var i = L.buscarPorId("enxovalItens", m.itemId); return U.esc(i ? i.nome : ""); } },
      { rotulo: "Movimento", conteudo: function (m) { return U.esc(H.TIPOS_MOV_ENXOVAL[m.tipo].nome) + '<div class="secundario">' + (m.de ? H.LOCAIS_ENXOVAL[m.de] : "") + (m.de && m.para ? " → " : "") + (m.para ? H.LOCAIS_ENXOVAL[m.para] : "") + "</div>"; } },
      { rotulo: "Qtd", direita: true, conteudo: function (m) { return m.tipo === "INVENTARIO" ? "contado " + m.contado : m.quantidade; } },
      { rotulo: "Por", conteudo: function (m) { return U.esc(m.registradoPor || ""); } }
    ], movs));
    return html;
  };
  T.acoes["hotel-enxoval-padrao"] = function () {
    H.ITENS_ENXOVAL_PADRAO.forEach(function (n) { if (!L.estado.enxovalItens.some(function (i) { return i.nome === n; })) L.criar("enxovalItens", { nome: n, minimo: 0 }); });
    T.renderizar();
  };
  T.acoes["hotel-mov-enxoval"] = function () {
    var locais = [{ valor: "", rotulo: "—" }].concat(Object.keys(H.LOCAIS_ENXOVAL).map(function (k) { return { valor: k, rotulo: H.LOCAIS_ENXOVAL[k] }; }));
    U.abrirFormulario({ titulo: "Movimentar enxoval", largo: true, campos: [
      { id: "itemId", rotulo: "Item", tipo: "select", obrigatorio: true, opcoes: L.estado.enxovalItens.map(function (i) { return { valor: i.id, rotulo: i.nome }; }) },
      { id: "tipo", rotulo: "Movimento", tipo: "select", obrigatorio: true, opcoes: Object.keys(H.TIPOS_MOV_ENXOVAL).map(function (k) { return { valor: k, rotulo: H.TIPOS_MOV_ENXOVAL[k].nome }; }) },
      { id: "data", rotulo: "Data", tipo: "data", obrigatorio: true, par: true }, { id: "quantidade", rotulo: "Quantidade", tipo: "numero" },
      { id: "de", rotulo: "De (saída / transferência)", tipo: "select", opcoes: locais, par: true }, { id: "para", rotulo: "Para (entrada / transferência)", tipo: "select", opcoes: locais },
      { id: "local", rotulo: "Local contado (inventário)", tipo: "select", opcoes: locais, par: true }, { id: "contado", rotulo: "Quantidade contada (inventário)", tipo: "numero" },
      { id: "observacao", rotulo: "Observação", tipo: "textarea" }],
      valores: { data: dataSel(), tipo: "TRANSFERENCIA" },
      aoSalvar: function (v) {
        ["de", "para", "local"].forEach(function (k) { if (!v[k]) delete v[k]; });
        v.registradoPor = (L.estado.usuario || {}).nome;
        L.criar("enxovalMovimentos", v); U.fecharModal(); T.renderizar(); U.avisar("Movimentação registrada.");
      } });
  };

  // ------------------------------------------------------------ frigobar

  T.telas.frigobar = function () {
    var d = dataSel(), comp = compSel(), dia = H.frigobarDia(d), mes = H.frigobarMes(comp), nc = H.frigobarNaoCobrado(comp);
    exportavel("frigobar-" + comp, ["Produto", "Quantidade", "Preço médio", "Receita", "Custo", "Margem bruta"],
      mes.produtos.map(function (p) { return [p.produto, p.quantidade, H.reaisCsv(p.precoMedio), H.reaisCsv(p.receita), H.reaisCsv(p.custo), H.reaisCsv(p.margem)]; }));
    var html = T.cabecalho("Frigobar", "Valor = quantidade × preço de venda. O mês soma os dias reais (" + mes.dias + " em " + comp + ").",
      (L.estado.frigobarProdutos.length ? botaoNovo("frigobarConsumos", "Registrar consumo") + " " : "") + botaoNovo("frigobarProdutos", "Novo produto"));
    html += barraData() + '<div class="barra-ferramentas" style="margin-top:-8px"><span class="filtro-rotulo">Mês</span><input type="month" class="hotel-filtro" data-chave="mesHotel" value="' + comp + '"></div>';
    html += kpis([
      { rotulo: "Consumo do dia", valor: brl(dia.total), nota: L.dataBR(d) },
      { rotulo: "Receita do mês", valor: brl(mes.receita), nota: "soma de " + mes.dias + " dias", hero: true },
      { rotulo: "Margem bruta do mês", valor: brl(mes.receita - mes.custo), nota: "receita − custo" },
      { rotulo: "Sem cobrança", valor: String(nc.length), nota: "consumos não lançados na conta", tom: nc.length ? "critico" : "" }
    ]);
    if (mes.receitaJaNoDataHotel) html += '<p class="secundario">' + brl(mes.receitaJaNoDataHotel) + " desta receita já está na conta do hóspede no DataHotel e não deve ser lançada de novo.</p>";
    html += U.painelHtml("Dia " + L.dataBR(d), "por produto e por apartamento", '<div class="grade-2">' + U.tabelaHtml([
      { rotulo: "Produto", conteudo: function (p) { return U.esc(p.chave); } }, { rotulo: "Qtd", direita: true, conteudo: function (p) { return p.quantidade; } },
      { rotulo: "Valor", direita: true, conteudo: function (p) { return brl(p.valor); } }], dia.produtos, { tituloVazio: "Sem consumo neste dia" }) +
      U.tabelaHtml([{ rotulo: "Apto", conteudo: function (p) { return U.esc(p.chave); } }, { rotulo: "Itens", direita: true, conteudo: function (p) { return p.quantidade; } },
      { rotulo: "Valor", direita: true, conteudo: function (p) { return brl(p.valor); } }], dia.apartamentos, { tituloVazio: "—" }) + "</div>");
    html += U.painelHtml("Fechamento mensal por produto", comp, U.tabelaHtml([
      { rotulo: "Produto", conteudo: function (p) { return U.esc(p.produto); } }, { rotulo: "Vendidos", direita: true, conteudo: function (p) { return p.quantidade; } },
      { rotulo: "Preço médio", direita: true, conteudo: function (p) { return brl(p.precoMedio); } }, { rotulo: "Receita", direita: true, conteudo: function (p) { return brl(p.receita); } },
      { rotulo: "Custo", direita: true, conteudo: function (p) { return brl(p.custo); } }, { rotulo: "Margem", direita: true, conteudo: function (p) { return brl(p.margem); } }
    ], mes.produtos, { tituloVazio: "Sem consumo no mês" }));
    if (nc.length) html += U.painelHtml("Consumos sem cobrança", "conferir com a conta do hóspede", U.tabelaHtml([
      { rotulo: "Data", conteudo: function (c) { return L.dataBR(c.data); } }, { rotulo: "Apto", conteudo: function (c) { return U.esc(c.apartamento); } },
      { rotulo: "Produto", conteudo: function (c) { var v = H.valorConsumo(c); return U.esc(v.produto ? v.produto.nome : c.produto); } },
      { rotulo: "Valor", direita: true, conteudo: function (c) { return brl(H.valorConsumo(c).total); } },
      { rotulo: "", direita: true, conteudo: function (c) { return T.podeEditar() ? '<button class="botao miudo" data-acao="hotel-frigobar-cobrado" data-id="' + c.id + '">Marcar como cobrado</button>' : ""; } }
    ], nc));
    var prods = L.estado.frigobarProdutos;
    if (prods.length) html += U.painelHtml("Produtos", "", U.tabelaHtml([
      { rotulo: "Produto", conteudo: function (p) { return '<div class="principal">' + U.esc(p.nome) + '</div><div class="secundario">' + U.esc([p.codigo, p.categoria].filter(Boolean).join(" · ")) + "</div>"; } },
      { rotulo: "Custo", direita: true, conteudo: function (p) { return brl(p.custo || 0); } }, { rotulo: "Venda", direita: true, conteudo: function (p) { return brl(p.precoVenda); } },
      { rotulo: "Estoque", direita: true, conteudo: function (p) { return (p.estoque || 0) + ((p.estoqueMinimo && p.estoque < p.estoqueMinimo) ? " " + pastilha("critico", "baixo") : ""); } },
      { rotulo: "", direita: true, conteudo: function (p) { return botaoEditar("frigobarProdutos", p); } }], prods));
    return html;
  };
  T.acoes["hotel-frigobar-cobrado"] = function (id) { L.atualizar("frigobarConsumos", id, { cobrado: true, cobradoEm: L.hoje() }); T.renderizar(); };

  // ------------------------------------------------------------ importações

  T._previa = null;
  var ROTULO_CAMPO = { codigo: "Código / reserva", hospede: "Hóspede", apartamento: "Apartamento", checkin: "Check-in", checkout: "Check-out",
    checkoutRealizado: "Check-out realizado", adultos: "Adultos", criancas: "Crianças", valorDiaria: "Valor da diária", consumos: "Consumos",
    descontos: "Descontos", valorPago: "Valor pago", formaPagamento: "Forma de pagamento", empresa: "Empresa", cafeIncluido: "Café incluído",
    status: "Situação", data: "Data", descricao: "Descrição", pagador: "Pagador", reserva: "Reserva", forma: "Forma de pagamento",
    valorBruto: "Valor", desconto: "Desconto", taxa: "Taxa", codigoTransacao: "NSU / transação", bandeira: "Bandeira", operadora: "Operadora",
    parcelas: "Parcelas", produto: "Produto", quantidade: "Quantidade", valorUnitario: "Valor unitário" };
  T.telas.importacoes = function () {
    var tipoAtual = T.filtros.impTipo || "hospedagens";
    var origemAtual = T.filtros.impOrigem || "DATAHOTEL";
    // Trocou o tipo ou a origem: a prévia anterior não vale mais.
    if (T._previa && (T._previa.tipo !== tipoAtual || T._previa.origem !== origemAtual)) T._previa = null;
    var DESCR = { hospedagens: "Reservas, hóspedes, check-in/out, diárias e valores", recebimentos: "Pagamentos por forma, para o fechamento de caixa", frigobar: "Consumos lançados por apartamento" };
    var html = T.cabecalho("Importações DataHotel", "Envie o relatório exportado do DataHotel. Você confere a prévia antes de qualquer gravação.");
    html += '<div class="painel imp-painel">' +
      '<div class="imp-passo"><span class="imp-num">1</span><div class="imp-passo-corpo"><h3>O que você vai importar</h3><div class="imp-tipos">' +
      Object.keys(H.LAYOUTS).map(function (k) {
        return '<button type="button" class="imp-tipo' + (k === tipoAtual ? " ativo" : "") + '" data-filtro-aba="impTipo" data-valor="' + k + '"><strong>' + U.esc(H.LAYOUTS[k].nome) + "</strong><span>" + U.esc(DESCR[k] || "") + "</span></button>";
      }).join("") + "</div></div></div>" +
      '<div class="imp-passo"><span class="imp-num">2</span><div class="imp-passo-corpo"><h3>De onde vem o arquivo</h3>' +
      U.seletorRico({ rotulo: "Origem do arquivo", valor: origemAtual, atributos: { filtro: "impOrigem" }, itens: [
        { valor: "DATAHOTEL", rotulo: "DataHotel (relatório exportado)" }, { valor: "ADQUIRENTE", rotulo: "Adquirente de cartão" },
        { valor: "BANCO", rotulo: "Extrato bancário" }, { valor: "PLANILHA", rotulo: "Planilha interna" }] }) + "</div></div>" +
      '<div class="imp-passo"><span class="imp-num">3</span><div class="imp-passo-corpo"><h3>Arquivo</h3>' +
      '<label class="imp-drop" id="imp-drop"><input type="file" id="imp-arquivo" accept=".csv,text/csv">' + U.iconeSvg("documentos", 26) +
      '<span class="imp-drop-titulo">Arraste o arquivo CSV aqui ou <u>clique para escolher</u></span>' +
      '<span class="imp-drop-dica">No Excel: Arquivo → Salvar como → CSV (separado por ponto e vírgula)</span></label>' +
      '<div class="imp-colunas"><span class="imp-colunas-rotulo">Colunas reconhecidas</span>' +
      ["codigo"].concat(Object.keys(H.LAYOUTS[tipoAtual].campos)).map(function (c) {
        var obr = c === "codigo" || H.LAYOUTS[tipoAtual].campos[c].obrigatorio;
        return '<span class="imp-chip' + (obr ? " obrig" : "") + '">' + U.esc(ROTULO_CAMPO[c] || c) + "</span>";
      }).join("") + '</div><p class="imp-nota">Em destaque, as obrigatórias. O código original + a origem identificam cada registro: reimportar não duplica, e campo vazio no arquivo não apaga o que foi complementado aqui.</p></div></div></div>';
    var p = T._previa;
    if (p) {
      html += kpis([
        { rotulo: "Novos", valor: String(p.resumo.novo), nota: "serão criados" },
        { rotulo: "Atualizados", valor: String(p.resumo.atualizado), nota: "só os campos que mudaram" },
        { rotulo: "Duplicados", valor: String(p.resumo.duplicado), nota: "ignorados" },
        { rotulo: "Inconsistentes", valor: String(p.resumo.inconsistente), nota: "não entram", tom: p.resumo.inconsistente ? "critico" : "" }
      ]);
      html += U.painelHtml("Pré-visualização · " + U.esc(p.arquivo || ""), p.resumo.total + " linha(s)", U.tabelaHtml([
        { rotulo: "Linha", conteudo: function (i) { return i.linha; } },
        { rotulo: "Código", conteudo: function (i) { return U.esc(i.registro.codigoOrigem || "—"); } },
        { rotulo: "Resumo", conteudo: function (i) { var r = i.registro; return U.esc([r.hospede, r.apartamento, r.pagador, r.produto, r.checkin, r.data].filter(Boolean).join(" · ")); } },
        { rotulo: "Situação", conteudo: function (i) { return pastilha({ novo: "info", atualizado: "atencao", duplicado: "neutro", inconsistente: "critico" }[i.situacao], i.situacao) +
          (i.problemas.length ? '<div class="secundario">' + U.esc(i.problemas.join(" ")) + "</div>" : "") + (i.camposAlterados && i.camposAlterados.length ? '<div class="secundario">muda: ' + U.esc(i.camposAlterados.join(", ")) + "</div>" : ""); } }
      ], p.itens) + '<div style="padding:14px 20px;display:flex;gap:8px"><button class="botao primario" data-acao="hotel-imp-confirmar"' + (p.resumo.novo + p.resumo.atualizado ? "" : " disabled") + '>Confirmar importação</button><button class="botao" data-acao="hotel-imp-cancelar">Descartar</button></div>');
    }
    var hist = L.estado.importacoes.slice().sort(function (a, b) { return String(b.em).localeCompare(String(a.em)); });
    exportavel("historico-importacoes", ["Data", "Tipo", "Origem", "Arquivo", "Total", "Novos", "Atualizados", "Duplicados", "Inconsistentes", "Status", "Usuário"],
      hist.map(function (i) { return [i.em, i.tipo, i.origem, i.arquivo, i.resumo.total, i.resumo.novo, i.resumo.atualizado, i.resumo.duplicado, i.resumo.inconsistente, i.status, i.usuario]; }));
    html += U.painelHtml("Histórico de sincronizações", "", U.tabelaHtml([
      { rotulo: "Quando", conteudo: function (i) { return new Date(i.em).toLocaleString("pt-BR") + '<div class="secundario">' + U.esc(i.usuario) + "</div>"; } },
      { rotulo: "Dado", conteudo: function (i) { return U.esc((H.LAYOUTS[i.tipo] || {}).nome || i.tipo) + '<div class="secundario">' + U.esc(i.origem) + " · " + U.esc(i.arquivo || "") + "</div>"; } },
      { rotulo: "Registros", conteudo: function (i) { var r = i.resumo; return r.total + " lidos · " + r.novo + " novos · " + r.atualizado + " atualizados · " + r.duplicado + " duplicados · " + r.inconsistente + " inconsistentes"; } },
      { rotulo: "Status", direita: true, conteudo: function (i) { return status(i.status); } }
    ], hist, { tituloVazio: "Nenhuma importação ainda" }), '<button class="botao miudo" data-acao="hotel-exportar">Exportar</button>');
    return html;
  };
  T.acoes["hotel-imp-confirmar"] = function () {
    if (!T._previa) return;
    var imp = H.aplicarImportacao(T._previa, { arquivo: T._previa.arquivo, formato: "CSV" });
    T._previa = null; T.renderizar();
    U.avisar("Importação concluída: " + imp.resumo.novo + " novos, " + imp.resumo.atualizado + " atualizados.");
  };
  T.acoes["hotel-imp-cancelar"] = function () { T._previa = null; T.renderizar(); };

  // ------------------------------------------------------------ importações com servidor
  //
  // Com o servidor ligado (L.USA_BACKEND), a prévia, a confirmação e o
  // histórico vêm de /api/hotel/importacoes e ficam no banco. O arquivo vai
  // inteiro para o servidor (.xlsx ou .csv); nada é calculado só aqui.

  if (L.USA_BACKEND) {
    var TIPOS_SRV = {
      hospedagens: { nome: "Hospedagens / reservas", descr: "DataHotel: Hospedagem → Relatório de Reservas, com 'Exibir extrato resumido' → Salvar → Ficheiro CSV",
        colunas: [["Cód. Res.", 1], ["Hóspede", 1], ["Apto.", 1], ["Check-in", 1], ["Check-out", 1], ["Nº Diárias"], ["Nº Hósp."],
          ["Canal de Venda"], ["Funcionário"], ["Situação"], ["Vr. Total"]] },
      recebimentos: { nome: "Pagamentos / recebimentos", descr: "DataHotel: Financeiro → Relatório de Contas Recebidas → Salvar → Ficheiro CSV (recomendado: cada pagamento tem número de lançamento). O Resumo de Movimentação por Caixa também é aceito, mas use só um dos dois.",
        colunas: [["Código", 1], ["Data", 1], ["Forma de pagamento", 1], ["Valor", 1], ["Desconto"], ["Taxa"], ["Pagador"], ["Apartamento"],
          ["Reserva"], ["NSU / transação"], ["Bandeira"], ["Operadora"], ["Parcelas"]] },
      cafe: { nome: "Lista de café da manhã", descr: "DataHotel: Hospedagem → Lista de Café da Manhã → Salvar → Ficheiro CSV. Traz adultos e crianças de cada apartamento, por dia.",
        colunas: [["Apto.", 1], ["Hóspede", 1], ["Adultos", 1], ["Crianças"], ["Check-in Antecipado (seção)"]] },
      apartamentos: { nome: "Apartamentos", descr: "DataHotel: Governança → Lista de Camareira → Salvar → Ficheiro CSV. Cadastra os apartamentos e marca os bloqueados.",
        colunas: [["Apto.", 1], ["Situação", 1], ["Hóspede"]] }
    };
    var tipoSrv = function () { return TIPOS_SRV[T.filtros.impTipo] ? T.filtros.impTipo : "hospedagens"; };
    var ROT_SIT = { NOVO: ["info", "Novo"], ATUALIZADO: ["atencao", "Atualizado"], IDENTICO: ["neutro", "Já existia"], REJEITADO: ["critico", "Recusado"] };
    var ROT_LOTE = { PREVIA: ["atencao", "Aguardando confirmação"], CONFIRMADO: ["ok", "Confirmado"], DESCARTADO: ["neutro", "Descartado"] };
    T._impSrv = { previa: null, hist: null, ultima: null, carregando: false, enviando: false, erroHist: null };

    var carregarHistorico = function () {
      if (T._impSrv.carregando) return;
      T._impSrv.carregando = true;
      L.api.get("/api/hotel/importacoes").then(function (r) {
        T._impSrv.hist = r.lotes || []; T._impSrv.ultima = r.ultima || {}; T._impSrv.erroHist = null;
      }).catch(function (e) {
        T._impSrv.hist = []; T._impSrv.erroHist = e.message || "Não foi possível carregar o histórico.";
      }).then(function () {
        T._impSrv.carregando = false;
        if (T.atual === "importacoes") T.renderizar();
      });
    };

    var dataHora = function (iso) { return iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"; };

    T._impSrvEnviar = function (file) {
      if (!file) return;
      if (!/\.(csv|xlsx)$/i.test(file.name)) { U.avisar("Envie o relatório em .xlsx (Excel) ou .csv."); return; }
      if (file.size > 15 * 1024 * 1024) { U.avisar("Arquivo maior que 15 MB. Exporte um período menor."); return; }
      var tipo = tipoSrv();
      T._impSrv.enviando = true; T._impSrv.previa = null; T.renderizar();
      var campoDesde = U.el("imp-desde");
      var desde = campoDesde ? campoDesde.value : (T._impDesde || "");
      T._impDesde = desde;
      L.api.enviarArquivo("/api/hotel/importacoes/previa", { tipo: tipo, arquivo: file, periodoInicio: desde || null }).then(function (p) {
        p.arquivo = file.name; T._impSrv.previa = p;
      }).catch(function (e) {
        U.avisar(e.message || "Não foi possível ler o arquivo.");
      }).then(function () {
        T._impSrv.enviando = false; T._impSrv.hist = null; T.renderizar();
      });
    };

    T.telas.importacoes = function () {
      var st = T._impSrv;
      if (st.hist === null) carregarHistorico();
      var tipoAtual = tipoSrv();
      if (st.previa && st.previa.tipo !== tipoAtual) st.previa = null;
      var html = T.cabecalho("Importações DataHotel", "Envie o relatório exportado do DataHotel. Você confere a prévia antes de qualquer gravação no banco.");
      html += '<div class="painel imp-painel">' +
        '<div class="imp-passo"><span class="imp-num">1</span><div class="imp-passo-corpo"><h3>O que você vai importar</h3><div class="imp-tipos">' +
        Object.keys(TIPOS_SRV).map(function (k) {
          var ult = st.ultima && st.ultima[k];
          return '<button type="button" class="imp-tipo' + (k === tipoAtual ? " ativo" : "") + '" data-filtro-aba="impTipo" data-valor="' + k + '"><strong>' +
            U.esc(TIPOS_SRV[k].nome) + "</strong><span>" + U.esc(TIPOS_SRV[k].descr) + "</span><span>" +
            (ult ? "Última importação: " + U.esc(dataHora(ult)) : "Ainda não importado") + "</span></button>";
        }).join("") + "</div></div></div>" +
        '<div class="imp-passo"><span class="imp-num">2</span><div class="imp-passo-corpo"><h3>Arquivo</h3>' +
        '<p class="secundario" style="margin:0 0 10px"><label>Ignorar o que for anterior a <input type="date" id="imp-desde" value="' + U.esc(T._impDesde || "") + '"' + (st.enviando ? " disabled" : "") + '></label> ' +
        '<span class="secundario">(vale para recebimentos e café; deixe em branco para importar tudo)</span></p>' +
        '<label class="imp-drop" id="imp-drop"><input type="file" id="imp-arquivo" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"' + (st.enviando ? " disabled" : "") + ">" +
        U.iconeSvg("documentos", 26) +
        '<span class="imp-drop-titulo">' + (st.enviando ? "Lendo o arquivo…" : "Arraste o arquivo aqui ou <u>clique para escolher</u>") + "</span>" +
        '<span class="imp-drop-dica">Excel (.xlsx) ou CSV, como sai do DataHotel. Até 15 MB.</span></label>' +
        '<div class="imp-colunas"><span class="imp-colunas-rotulo">Colunas reconhecidas</span>' +
        TIPOS_SRV[tipoAtual].colunas.map(function (c) { return '<span class="imp-chip' + (c[1] ? " obrig" : "") + '">' + U.esc(c[0]) + "</span>"; }).join("") +
        '</div><p class="imp-nota">Em destaque, as obrigatórias. Se faltar uma delas, o arquivo inteiro é recusado. O código do DataHotel identifica cada registro: importar de novo não duplica, e o mesmo arquivo não entra duas vezes.</p></div></div></div>';

      var p = st.previa;
      if (p) {
        var r = p.resumo;
        if (p.erroGeral) {
          html += '<div class="painel" style="padding:16px 20px;border-left:4px solid #c0392b"><strong>Arquivo recusado.</strong> ' + U.esc(p.erroGeral) +
            '<div style="margin-top:10px"><button class="botao" data-acao="hotel-imp-srv-descartar">Fechar</button></div></div>';
        } else {
          html += kpis([
            { rotulo: "Novos", valor: String(r.novo), nota: "serão criados" },
            { rotulo: "Atualizados", valor: String(r.atualizado), nota: "só os campos que mudaram" },
            { rotulo: "Já existiam", valor: String(r.identico), nota: "nada muda" },
            { rotulo: "Recusados", valor: String(r.rejeitado), nota: "não entram", tom: r.rejeitado ? "critico" : "" }
          ]);
          var linhas = [];
          (p.rejeitadas || []).forEach(function (x) { linhas.push({ linha: x.linha, codigo: x.codigo, sit: "REJEITADO", det: x.problemas.join(" ") }); });
          (p.atualizadas || []).forEach(function (x) { linhas.push({ linha: x.linha, codigo: x.codigo, sit: "ATUALIZADO", det: "muda: " + x.campos.join(", ") }); });
          (p.amostraNovas || []).forEach(function (x) {
            var g = x.registro || {};
            var br = function (iso) { return iso ? String(iso).split("-").reverse().join("/") : ""; };
            linhas.push({ linha: x.linha, codigo: x.codigo, sit: "NOVO", det: [g.hospede, g.apartamento || g.numero, g.situacaoOrigem, g.pagador, br(g.checkin), br(g.data), g.adultos !== undefined && g.checkin === undefined ? g.adultos + " adulto(s), " + (g.criancas || 0) + " criança(s)" : ""].filter(Boolean).join(" · ") });
          });
          linhas.sort(function (a, b) { return a.linha - b.linha; });
          var podeConfirmar = r.novo + r.atualizado > 0;
          html += U.painelHtml("Prévia · " + U.esc(p.arquivo || ""), r.total + " linha(s) · " + U.esc(p.formato || "") +
            (r.novo > 20 ? " · mostrando 20 das novas" : ""), U.tabelaHtml([
            { rotulo: "Linha", conteudo: function (i) { return i.linha; } },
            { rotulo: "Código", conteudo: function (i) { return U.esc(i.codigo || "—"); } },
            { rotulo: "Situação", conteudo: function (i) { var t = ROT_SIT[i.sit]; return pastilha(t[0], t[1]); } },
            { rotulo: "Detalhe", conteudo: function (i) { return U.esc(i.det || ""); } }
          ], linhas, { tituloVazio: "Nada novo neste arquivo", textoVazio: "Todas as linhas já estavam no sistema, iguais." }) +
            '<div style="padding:14px 20px;display:flex;gap:8px;flex-wrap:wrap"><button class="botao primario" data-acao="hotel-imp-srv-confirmar"' + (podeConfirmar ? "" : " disabled") + ">Confirmar importação</button>" +
            '<button class="botao" data-acao="hotel-imp-srv-descartar">Descartar</button>' +
            (r.rejeitado ? '<span class="secundario" style="align-self:center">As linhas recusadas ficam guardadas no histórico e não entram.</span>' : "") + "</div>");
        }
      }

      var hist = st.hist || [];
      var corpo;
      if (st.hist === null) corpo = '<p style="padding:16px 20px" class="secundario">Carregando…</p>';
      else if (st.erroHist) corpo = '<p style="padding:16px 20px">' + U.esc(st.erroHist) + "</p>";
      else corpo = U.tabelaHtml([
        { rotulo: "Quando", conteudo: function (i) { return U.esc(dataHora(i.criadoEm)) + '<div class="secundario">' + U.esc(i.criadoPor || "—") + "</div>"; } },
        { rotulo: "Dado", conteudo: function (i) { return U.esc((TIPOS_SRV[i.tipo] || {}).nome || i.tipo) + '<div class="secundario">' + U.esc(i.arquivo) + " · " + U.esc(i.formato) + "</div>"; } },
        { rotulo: "Registros", conteudo: function (i) {
          return i.total + " lidos · " + i.novo + " novos · " + i.atualizado + " atualizados · " + i.identico + " já existiam · " + i.rejeitado + " recusados" +
            (i.erroGeral ? '<div class="secundario">' + U.esc(i.erroGeral) + "</div>" : "");
        } },
        { rotulo: "Situação", direita: true, conteudo: function (i) {
          var t = ROT_LOTE[i.situacao] || ["neutro", i.situacao];
          return pastilha(t[0], t[1]) + (i.confirmadoPor ? '<div class="secundario">' + U.esc(i.confirmadoPor) + "</div>" : "");
        } }
      ], hist, { tituloVazio: "Nenhuma importação ainda" });
      html += U.painelHtml("Histórico de importações", "", corpo);
      return html;
    };

    T.acoes["hotel-imp-srv-confirmar"] = function () {
      var p = T._impSrv.previa;
      if (!p || T._impSrv.enviando) return;
      T._impSrv.enviando = true;
      L.api.post("/api/hotel/importacoes/" + p.loteId + "/confirmar").then(function (r) {
        T._impSrv.previa = null;
        U.avisar("Importação confirmada: " + r.novo + " novos, " + r.atualizado + " atualizados" + (r.rejeitado ? ", " + r.rejeitado + " recusados." : "."));
      }).catch(function (e) { U.avisar(e.message || "Não foi possível confirmar."); })
        .then(function () { T._impSrv.enviando = false; T._impSrv.hist = null; T.renderizar(); });
    };
    T.acoes["hotel-imp-srv-descartar"] = function () {
      var p = T._impSrv.previa;
      if (!p) return;
      L.api.post("/api/hotel/importacoes/" + p.loteId + "/descartar").catch(function () { /* prévia com erro já não pode ser confirmada */ })
        .then(function () { T._impSrv.previa = null; T._impSrv.hist = null; T.renderizar(); });
    };
  }

  // ------------------------------------------------------------ caixa

  T.telas.caixa = function () {
    var d = dataSel(), f = H.fechamentoDia(d);
    var movs = L.estado.recebimentos.filter(function (r) { return r.data === d; });
    exportavel("fechamento-caixa-" + d, ["Forma", "Lançado", "Recebido", "A receber", "Qtd"],
      Object.keys(f.porForma).map(function (k) { var x = f.porForma[k]; return [H.FORMAS[k].nome, H.reaisCsv(x.faturado), H.reaisCsv(x.recebido), H.reaisCsv(x.aReceber), x.qtd]; })
        .concat([["TOTAL", H.reaisCsv(f.totais.faturado), H.reaisCsv(f.totais.recebido), H.reaisCsv(f.totais.aReceber), ""], ["Saldo inicial do caixa", H.reaisCsv(f.saldoInicial)], ["Saídas em dinheiro", H.reaisCsv(f.saidasDinheiro)], ["Saldo calculado", H.reaisCsv(f.saldoCalculado)]]));
    var fx = f.fechamento;
    var html = T.cabecalho("Fechamento de Caixa", "Faturado, recebido e a receber nunca se misturam. Caixa físico = saldo inicial + dinheiro recebido − saídas em dinheiro.", botaoNovo("recebimentos", "Lançar movimentação"));
    html += barraData();
    html += kpis([
      { rotulo: "Receita lançada no dia", valor: brl(f.totais.faturado), nota: "todas as formas" },
      { rotulo: "Efetivamente recebido", valor: brl(f.totais.recebido), nota: "dinheiro, Pix, cartão conciliado, boleto pago", hero: true },
      { rotulo: "A receber", valor: brl(f.totais.aReceber), nota: "cartão a depositar, faturado, boleto" },
      { rotulo: "Saldo calculado do caixa", valor: brl(f.saldoCalculado), nota: "inicial " + brl(f.saldoInicial) + " · saídas " + brl(f.saidasDinheiro) }
    ]);
    html += U.painelHtml("Por modalidade", "", U.tabelaHtml([
      { rotulo: "Forma", conteudo: function (k) { return U.esc(H.FORMAS[k].nome); } },
      { rotulo: "Lançado", direita: true, conteudo: function (k) { return brl(f.porForma[k].faturado); } },
      { rotulo: "Recebido", direita: true, conteudo: function (k) { return brl(f.porForma[k].recebido); } },
      { rotulo: "A receber", direita: true, conteudo: function (k) { return brl(f.porForma[k].aReceber); } }
    ], Object.keys(f.porForma).filter(function (k) { return f.porForma[k].qtd; }), { tituloVazio: "Nenhuma movimentação no dia" }));
    html += U.painelHtml("Movimentações", movs.length + " lançamento(s)", U.tabelaHtml([
      { rotulo: "Descrição", conteudo: function (r) { return '<div class="principal">' + U.esc(r.descricao || r.pagador || (r.tipo === "SAIDA_CAIXA" ? "Saída do caixa" : "Recebimento")) + '</div><div class="secundario">' + U.esc([r.pagador, r.apartamento && "apto " + r.apartamento, r.codigoTransacao].filter(Boolean).join(" · ")) + "</div>" + origemTag(r); } },
      { rotulo: "Forma", conteudo: function (r) { return r.tipo === "SAIDA_CAIXA" ? "Saída (dinheiro)" : U.esc((H.FORMAS[r.forma] || {}).nome || ""); } },
      { rotulo: "Bruto", direita: true, conteudo: function (r) { return brl(r.valorBruto); } },
      { rotulo: "Líquido", direita: true, conteudo: function (r) { return r.tipo === "SAIDA_CAIXA" ? "−" + brl(r.valorBruto) : brl(H.liquido(r)); } },
      { rotulo: "Situação", direita: true, conteudo: function (r) { return r.tipo === "SAIDA_CAIXA" ? "" : status(H.situacaoRecebimento(r)); } },
      { rotulo: "", direita: true, conteudo: function (r) {
        var s = botaoEditar("recebimentos", r);
        if (r.tipo !== "SAIDA_CAIXA" && H.situacaoRecebimento(r) === "A_RECEBER" && podeFinanceiro()) s += ' <button class="botao miudo" data-acao="hotel-confirmar-receb" data-id="' + r.id + '">Confirmar recebimento</button>';
        return s; } }
    ], movs, { buscaLocal: "Pagador, apto ou código", tituloVazio: "Nada lançado nesta data", textoVazio: "Importe os pagamentos do DataHotel ou lance manualmente." }));
    html += U.painelHtml("Fechamento do dia", fx ? "Status: " + fx.status : "Aberto",
      '<div style="padding:0 20px 18px">' + (fx && fx.status === "FECHADO"
        ? "<p>Fechado por <strong>" + U.esc(fx.responsavel) + "</strong> em " + new Date(fx.fechadoEm).toLocaleString("pt-BR") + ". Saldo conferido " + brl(fx.saldoConferido) + " · diferença " + brl(fx.diferenca) + (fx.justificativa ? " · " + U.esc(fx.justificativa) + " (autorizado por " + U.esc(fx.aprovador) + ")" : "") + "</p>" +
          (T.temPerfil("DIRECAO") ? '<button class="botao miudo" data-acao="hotel-reabrir-caixa">Reabrir (com justificativa)</button>' : "")
        : (T.podeEditar() ? '<button class="botao primario" data-acao="hotel-fechar-caixa">Conferir e fechar o caixa</button>' : "")) + "</div>");
    return html;
  };
  T.acoes["hotel-confirmar-receb"] = function (id) {
    U.abrirFormulario({ titulo: "Confirmar recebimento", campos: [{ id: "recebidoEm", rotulo: "Data do crédito", tipo: "data", obrigatorio: true }, { id: "contaFinanceira", rotulo: "Conta financeira" }],
      valores: { recebidoEm: L.hoje() }, aoSalvar: function (v) { L.atualizar("recebimentos", id, v); U.fecharModal(); T.renderizar(); } });
  };
  T.acoes["hotel-fechar-caixa"] = function () {
    var f = H.fechamentoDia(dataSel());
    U.abrirFormulario({ titulo: "Fechar o caixa de " + L.dataBR(f.data), sub: "Saldo calculado: " + L.brl(f.saldoCalculado),
      campos: [{ id: "saldoConferido", rotulo: "Saldo contado no caixa", tipo: "moeda" }, { id: "justificativa", rotulo: "Justificativa (obrigatória se houver diferença)", tipo: "textarea" }],
      valores: { saldoConferido: (f.saldoCalculado / 100).toFixed(2) },
      aoSalvar: function (v) {
        var aprov = T.temPerfil("DIRECAO", "FINANCEIRO") ? (L.estado.usuario || {}).nome : null;
        var val = H.validarFechamentoCaixa(f, v.saldoConferido, v.justificativa, aprov);
        if (val.problemas.length) throw new Error(val.problemas.join(" "));
        var dados = { data: f.data, status: "FECHADO", saldoInicial: f.saldoInicial, saldoCalculado: f.saldoCalculado, saldoConferido: v.saldoConferido,
          diferenca: val.diferenca, justificativa: v.justificativa, aprovador: val.diferenca ? aprov : null, responsavel: (L.estado.usuario || {}).nome,
          fechadoEm: new Date().toISOString(), totais: f.totais };
        if (f.fechamento) L.atualizar("fechamentosCaixa", f.fechamento.id, dados); else L.criar("fechamentosCaixa", dados);
        U.fecharModal(); T.renderizar(); U.avisar("Caixa fechado.");
      } });
  };
  T.acoes["hotel-reabrir-caixa"] = function () {
    var f = H.fechamentoDia(dataSel()).fechamento;
    U.abrirFormulario({ titulo: "Reabrir caixa", campos: [{ id: "justificativa", rotulo: "Por que reabrir?", tipo: "textarea", obrigatorio: true }],
      aoSalvar: function (v) { L.atualizar("fechamentosCaixa", f.id, { status: "REABERTO", justificativa: v.justificativa, reabertoPor: (L.estado.usuario || {}).nome }); U.fecharModal(); T.renderizar(); } });
  };

  // ------------------------------------------------------------ cartões

  T.telas.cartoes = function () {
    var hoje = L.hoje(), comp = compSel();
    var ts = L.estado.transacoesCartao.filter(function (t) { return H.noMes(t.dataVenda, comp); }).map(function (t) { return { t: t, c: H.conciliarCartao(t, hoje) }; });
    var soma = function (f) { return ts.reduce(function (a, x) { return a + f(x); }, 0); };
    exportavel("cartoes-" + comp, ["Data venda", "Modalidade", "Operadora", "Bandeira", "Parcelas", "Código", "Venda", "Taxa", "Antecipação", "Esperado", "Previsto", "Depósito", "Depositado", "Diferença", "Status"],
      ts.map(function (x) { var t = x.t; return [t.dataVenda, t.modalidade, t.operadora, t.bandeira, t.parcelas, t.codigoTransacao, H.reaisCsv(t.valorVenda), H.reaisCsv(t.taxa), H.reaisCsv(t.antecipacao), H.reaisCsv(x.c.esperado), t.dataPrevista, t.dataDeposito, H.reaisCsv(t.valorDepositado), H.reaisCsv(x.c.diferenca), x.c.status]; }));
    var html = T.cabecalho("Cartões e Depósitos", "Venda no cartão não é dinheiro na conta: só vira recebido quando o depósito é conciliado. Taxa e antecipação aparecem separadas.", botaoNovo("transacoesCartao", "Lançar venda"));
    html += barraData(true);
    html += kpis([
      { rotulo: "Vendido no cartão", valor: brl(soma(function (x) { return x.t.valorVenda; })), nota: comp },
      { rotulo: "Taxas + antecipação", valor: brl(soma(function (x) { return (x.t.taxa || 0) + (x.t.antecipacao || 0); })), nota: "custo financeiro" },
      { rotulo: "Depositado", valor: brl(soma(function (x) { return x.t.valorDepositado || 0; })), nota: "conforme extrato", hero: true },
      { rotulo: "Divergentes / atrasados", valor: String(ts.filter(function (x) { return x.c.status === "DIVERGENTE" || x.c.status === "ATRASADO"; }).length), nota: "exigem conferência", tom: "critico" }
    ]);
    html += U.painelHtml("Transações", "", U.tabelaHtml([
      { rotulo: "Venda", conteudo: function (x) { var t = x.t; return '<div class="principal">' + L.dataBR(t.dataVenda) + " · " + U.esc(t.modalidade || "") + '</div><div class="secundario">' + U.esc([t.operadora, t.bandeira, t.codigoTransacao, t.parcelas > 1 ? t.parcelas + "x" : ""].filter(Boolean).join(" · ")) + "</div>"; } },
      { rotulo: "Valor", direita: true, conteudo: function (x) { return brl(x.t.valorVenda) + '<div class="secundario">taxa ' + brl(x.t.taxa || 0) + "</div>"; } },
      { rotulo: "Esperado", direita: true, conteudo: function (x) { return brl(x.c.esperado) + '<div class="secundario">' + (x.t.dataPrevista ? "em " + L.dataBR(x.t.dataPrevista) : "") + "</div>"; } },
      { rotulo: "Depositado", direita: true, conteudo: function (x) { return x.t.valorDepositado == null ? "—" : brl(x.t.valorDepositado) + '<div class="secundario">' + L.dataBR(x.t.dataDeposito) + "</div>"; } },
      { rotulo: "Diferença", direita: true, conteudo: function (x) { return x.c.diferenca == null ? "" : brl(x.c.diferenca); } },
      { rotulo: "Status", direita: true, conteudo: function (x) { return status(x.c.status); } },
      { rotulo: "", direita: true, conteudo: function (x) { return podeFinanceiro() ? '<button class="botao miudo" data-acao="hotel-deposito" data-id="' + x.t.id + '">Registrar depósito</button>' : ""; } }
    ], ts, { tituloVazio: "Nenhuma venda no cartão no mês", textoVazio: "Lance as vendas ou importe o relatório da adquirente (CSV) em Importações." }));
    return html;
  };
  T.acoes["hotel-deposito"] = function (id) {
    var t = L.buscarPorId("transacoesCartao", id);
    U.abrirFormulario({ titulo: "Depósito da adquirente", campos: [{ id: "dataDeposito", rotulo: "Data efetiva do depósito", tipo: "data", obrigatorio: true }, { id: "valorDepositado", rotulo: "Valor depositado", tipo: "moeda", obrigatorio: true }, { id: "status", rotulo: "Situação especial", tipo: "select", opcoes: [{ valor: "", rotulo: "Normal" }, { valor: "CANCELADO", rotulo: "Cancelado / estornado" }] }],
      valores: { dataDeposito: L.hoje(), valorDepositado: t.valorDepositado != null ? (t.valorDepositado / 100).toFixed(2) : ((t.valorVenda - (t.taxa || 0) - (t.antecipacao || 0)) / 100).toFixed(2) },
      aoSalvar: function (v) { if (!v.status) delete v.status; L.atualizar("transacoesCartao", id, v); U.fecharModal(); T.renderizar(); } });
  };

  // ------------------------------------------------------------ boletos e notas

  T.telas.boletos = function () {
    var hoje = L.hoje();
    var bs = L.estado.boletos.map(function (b) { return { b: b, s: H.statusBoleto(b, hoje) }; }).sort(function (a, b) { return a.b.vencimento.localeCompare(b.b.vencimento); });
    var aberto = bs.filter(function (x) { return x.s !== "PAGO" && x.s !== "CANCELADO"; });
    exportavel("boletos", ["Empresa", "Documento", "Emissão", "Vencimento", "Valor", "Pago", "Data pagamento", "Juros", "Multa", "Desconto", "Saldo", "Status"],
      bs.map(function (x) { var b = x.b; return [b.empresaNome, b.documento, b.emissao, b.vencimento, H.reaisCsv(b.valor), H.reaisCsv(b.valorPago), b.dataPagamento, H.reaisCsv(b.juros), H.reaisCsv(b.multa), H.reaisCsv(b.desconto), H.reaisCsv(H.saldoBoleto(b)), x.s]; }));
    var html = T.cabecalho("Boletos e Notas Fiscais", "Boleto emitido não é pago e nota emitida não é recebida. A baixa gera o recebimento uma vez só.",
      botaoNovo("boletos", "Lançar boleto") + " " + botaoNovo("notasFiscais", "Registrar nota fiscal"));
    html += barraData(true);
    html += kpis([
      { rotulo: "Em aberto", valor: brl(aberto.reduce(function (a, x) { return a + H.saldoBoleto(x.b); }, 0)), nota: aberto.length + " boleto(s)", hero: true },
      { rotulo: "Vencidos", valor: String(bs.filter(function (x) { return x.s === "VENCIDO"; }).length), nota: "cobrar", tom: "critico" },
      { rotulo: "A vencer em 7 dias", valor: String(bs.filter(function (x) { return x.s === "A_VENCER"; }).length), nota: "" },
      { rotulo: "Pagos", valor: String(bs.filter(function (x) { return x.s === "PAGO"; }).length), nota: "" }
    ]);
    html += U.painelHtml("Central de boletos", "", U.tabelaHtml([
      { rotulo: "Empresa", conteudo: function (x) { return '<div class="principal">' + U.esc(x.b.empresaNome || "—") + '</div><div class="secundario">' + U.esc(x.b.documento || "") + (x.b.notaFiscal ? " · NF " + U.esc(x.b.notaFiscal) : "") + "</div>"; } },
      { rotulo: "Vencimento", conteudo: function (x) { return L.dataBR(x.b.vencimento); } },
      { rotulo: "Valor", direita: true, conteudo: function (x) { return brl(x.b.valor); } },
      { rotulo: "Saldo", direita: true, conteudo: function (x) { return brl(H.saldoBoleto(x.b)); } },
      { rotulo: "Status", direita: true, conteudo: function (x) { return status(x.s); } },
      { rotulo: "", direita: true, conteudo: function (x) { return x.s !== "PAGO" && x.s !== "CANCELADO" && podeFinanceiro() ? '<button class="botao miudo" data-acao="hotel-baixar-boleto" data-id="' + x.b.id + '">Dar baixa</button> <button class="botao miudo" data-acao="hotel-cobrar" data-id="boleto:' + x.b.id + '">Cobrar</button>' : ""; } }
    ], bs, { tituloVazio: "Nenhum boleto lançado" }));
    var nfs = L.estado.notasFiscais.filter(function (n) { return n.competencia === compSel(); });
    html += U.painelHtml("Notas fiscais · " + compSel(), "emitidas fora do sistema; aqui ficam número, valor e situação", U.tabelaHtml([
      { rotulo: "Número", conteudo: function (n) { return U.esc(n.numero) + (n.serie ? "/" + U.esc(n.serie) : ""); } },
      { rotulo: "Empresa", conteudo: function (n) { var e = L.buscarPorId("empresas", n.empresaId); return U.esc(e ? (e.nomeFantasia || e.razaoSocial) : ""); } },
      { rotulo: "Emissão", conteudo: function (n) { return L.dataBR(n.emissao); } },
      { rotulo: "Valor", direita: true, conteudo: function (n) { return brl(n.valor); } },
      { rotulo: "Situação", direita: true, conteudo: function (n) { return status(n.status === "EMITIDA" ? "EMITIDO" : n.status); } },
      { rotulo: "", direita: true, conteudo: function (n) { return botaoEditar("notasFiscais", n); } }
    ], nfs, { tituloVazio: "Nenhuma nota registrada no mês" }));
    return html;
  };
  T.acoes["hotel-baixar-boleto"] = function (id) {
    var b = L.buscarPorId("boletos", id);
    U.abrirFormulario({ titulo: "Baixa do boleto " + (b.documento || ""), sub: "Saldo: " + L.brl(H.saldoBoleto(b)), campos: [
      { id: "data", rotulo: "Data do pagamento", tipo: "data", obrigatorio: true, par: true }, { id: "valor", rotulo: "Valor pago", tipo: "moeda", obrigatorio: true },
      { id: "juros", rotulo: "Juros", tipo: "moeda", par: true }, { id: "multa", rotulo: "Multa", tipo: "moeda" }, { id: "comprovante", rotulo: "Comprovante (referência)" }],
      valores: { data: L.hoje(), valor: (H.saldoBoleto(b) / 100).toFixed(2) },
      aoSalvar: function (v) { H.baixarBoleto(id, v); U.fecharModal(); T.renderizar(); U.avisar("Baixa registrada; o recebimento entrou no caixa do dia " + L.dataBR(v.data) + "."); } });
  };

  // ------------------------------------------------------------ cobranças (mensagens)

  T.acoes["hotel-cobrar"] = function (alvo) {
    var b = L.buscarPorId("boletos", String(alvo).split(":")[1]);
    var e = b.empresaId ? L.buscarPorId("empresas", b.empresaId) : null;
    var s = H.statusBoleto(b, L.hoje());
    var modelo = s === "VENCIDO" ? "Cobrança vencida" : s === "A_VENCER" ? "Vencimento próximo" : "Boleto disponível";
    var texto = "Prezados" + (e && e.responsavel ? " (" + e.responsavel + ")" : "") + ",\n\n" +
      (s === "VENCIDO" ? "Consta em aberto o boleto " : "Segue o boleto ") + (b.documento || "") + " no valor de " + L.brl(H.saldoBoleto(b)) +
      ", com vencimento em " + L.dataBR(b.vencimento) + (b.notaFiscal ? ", referente à NF " + b.notaFiscal : "") + ".\n\nAtenciosamente,\n" + L.estado.configHotel.nome;
    var hist = L.estado.cobrancas.filter(function (c) { return c.boletoId === b.id; });
    U.abrirModal({ titulo: modelo, sub: e ? (e.emailFinanceiro || "") + " · " + (e.telefone || "") : "",
      corpo: '<textarea id="cob-texto" style="width:100%;min-height:180px">' + U.esc(texto) + "</textarea>" +
        '<p class="secundario">O envio sai pelo seu e-mail ou WhatsApp (não há canal automático autorizado ainda). Registre aqui o envio para o histórico.</p>' +
        (hist.length ? "<p><strong>Histórico:</strong><br>" + hist.map(function (c) { return L.dataBR(c.data) + " · " + U.esc(c.canal) + " · " + U.esc(c.modelo) + (c.resposta ? " — " + U.esc(c.resposta) : ""); }).join("<br>") + "</p>" : ""),
      acoes: [
        { rotulo: "Fechar", aoClicar: U.fecharModal },
        { rotulo: "Abrir no e-mail", aoClicar: function () { window.open("mailto:" + encodeURIComponent((e && e.emailFinanceiro) || "") + "?subject=" + encodeURIComponent(modelo) + "&body=" + encodeURIComponent(U.el("cob-texto").value)); } },
        { rotulo: "Abrir no WhatsApp", aoClicar: function () { window.open("https://wa.me/" + String((e && e.telefone) || "").replace(/\D/g, "") + "?text=" + encodeURIComponent(U.el("cob-texto").value)); } },
        { rotulo: "Registrar envio", classe: "primario", aoClicar: function () {
          L.criar("cobrancas", { boletoId: b.id, empresaId: b.empresaId, data: L.hoje(), modelo: modelo, canal: "E-mail/WhatsApp", texto: U.el("cob-texto").value, usuario: (L.estado.usuario || {}).nome });
          U.fecharModal(); U.avisar("Cobrança registrada no histórico."); } }
      ] });
  };

  // ------------------------------------------------------------ empresas

  T.telas.empresas = function () {
    var comp = compSel();
    var cons = L.estado.empresas.map(function (e) { return H.consolidarEmpresa(e.id, comp); });
    var sel = T.filtros.empresaSel ? H.consolidarEmpresa(T.filtros.empresaSel, comp) : null;
    exportavel("faturamento-empresas-" + comp, ["Empresa", "CNPJ", "Hospedagens", "Total", "Pago na hospedagem", "Já faturado (NF)", "Saldo a faturar"],
      cons.map(function (c) { return [c.empresa.razaoSocial, c.empresa.cnpj, c.hospedagens.length, H.reaisCsv(c.total), H.reaisCsv(c.jaPagoNaHospedagem), H.reaisCsv(c.jaFaturado), H.reaisCsv(c.saldoAFaturar)]; }));
    var html = T.cabecalho("Faturamento de Empresas", "Consolida as hospedagens do mês pela empresa informada no DataHotel (nome, fantasia ou CNPJ).", botaoNovo("empresas", "Nova empresa"));
    html += barraData(true);
    html += U.painelHtml("Fechamento mensal · " + comp, "", U.tabelaHtml([
      { rotulo: "Empresa", conteudo: function (c) { return '<div class="principal">' + U.esc(c.empresa.nomeFantasia || c.empresa.razaoSocial) + '</div><div class="secundario">' + U.esc(c.empresa.cnpj || "") + "</div>"; } },
      { rotulo: "Hospedagens", direita: true, conteudo: function (c) { return c.hospedagens.length; } },
      { rotulo: "Total", direita: true, conteudo: function (c) { return brl(c.total); } },
      { rotulo: "Já faturado", direita: true, conteudo: function (c) { return brl(c.jaFaturado); } },
      { rotulo: "Saldo a faturar", direita: true, conteudo: function (c) { return "<strong>" + brl(c.saldoAFaturar) + "</strong>"; } },
      { rotulo: "", direita: true, conteudo: function (c) { return '<button class="botao miudo" data-acao="hotel-empresa-ver" data-id="' + c.empresa.id + '">Demonstrativo</button> ' + botaoEditar("empresas", c.empresa); } }
    ], cons, { tituloVazio: "Nenhuma empresa cadastrada" }));
    var aReceber = L.estado.boletos.filter(function (b) { var st = H.statusBoleto(b, L.hoje()); return st !== "PAGO" && st !== "CANCELADO"; });
    html += U.painelHtml("A receber das empresas", aReceber.length + " título(s) · " + brl(aReceber.reduce(function (a, b) { return a + H.saldoBoleto(b); }, 0)), U.tabelaHtml([
      { rotulo: "Empresa", conteudo: function (b) { var e = L.buscarPorId("empresas", b.empresaId); return '<div class="principal">' + U.esc(e ? (e.nomeFantasia || e.razaoSocial) : "—") + '</div><div class="secundario">' + (b.notaFiscal ? "NF " + U.esc(b.notaFiscal) + " · " : "") + U.esc(b.formaCobranca || "") + "</div>"; } },
      { rotulo: "Vencimento", conteudo: function (b) { return b.vencimento ? L.dataBR(b.vencimento) : "sem data"; } },
      { rotulo: "Previsão", conteudo: function (b) { return b.previsao ? L.dataBR(b.previsao) : "—"; } },
      { rotulo: "Valor", direita: true, conteudo: function (b) { return brl(H.saldoBoleto(b)); } },
      { rotulo: "Última cobrança", conteudo: function (b) { return '<span class="secundario">' + U.esc(b.observacoes || "") + "</span>"; } }
    ], aReceber, { tituloVazio: "Nada a receber de empresas" }));
    if (sel) {
      var ee = sel.empresa, regra = function (r, v) { return v ? "<p><strong>" + r + ":</strong> " + U.esc(v).replace(/
/g, "<br>") + "</p>" : ""; };
      html += U.painelHtml("Regras do convênio · " + (ee.nomeFantasia || ee.razaoSocial), ee.pendenciaCadastro && ee.pendenciaCadastro !== "Completo" ? ee.pendenciaCadastro : "cadastro completo",
        '<div style="padding:4px 20px 14px">' + regra("Tabela", ee.tabelaDiarias) + regra("Reserva", ee.regraReserva) + regra("Voucher", ee.regraVoucher) + regra("Consumo e lavanderia", ee.regraConsumo) +
        regra("Faturamento", ee.regraFaturamento) + regra("Contato", ee.responsavel) + regra("Telefones", ee.telefones) + regra("E-mails", ee.emails) + "</div>");
      html += U.painelHtml("Demonstrativo · " + (sel.empresa.nomeFantasia || sel.empresa.razaoSocial), comp, U.tabelaHtml([
        { rotulo: "Hóspede", conteudo: function (x) { return U.esc(x.hospedagem.hospede || ""); } },
        { rotulo: "Apto", conteudo: function (x) { return U.esc(x.hospedagem.apartamento); } },
        { rotulo: "Período", conteudo: function (x) { return L.dataBR(x.hospedagem.checkin) + " → " + L.dataBR(x.hospedagem.checkoutRealizado || x.hospedagem.checkout); } },
        { rotulo: "Diárias", direita: true, conteudo: function (x) { return x.diarias; } },
        { rotulo: "Hospedagem", direita: true, conteudo: function (x) { return brl(x.valorHospedagem); } },
        { rotulo: "Consumos", direita: true, conteudo: function (x) { return brl(x.hospedagem.consumos || 0); } },
        { rotulo: "Descontos", direita: true, conteudo: function (x) { return brl(x.hospedagem.descontos || 0); } },
        { rotulo: "Total", direita: true, conteudo: function (x) { return brl(x.total); } }
      ], sel.hospedagens, { tituloVazio: "Sem hospedagem desta empresa no mês" }) +
        '<p style="padding:0 20px 16px">Total ' + brl(sel.total) + " · já pago " + brl(sel.jaPagoNaHospedagem) + " · notas " + brl(sel.jaFaturado) + " · <strong>saldo a faturar " + brl(sel.saldoAFaturar) + "</strong>. Próximos passos: emitir a NF no emissor fiscal, registrar em Boletos e Notas, lançar o boleto e cobrar.</p>");
      T._export = { nome: "demonstrativo-" + comp, cab: ["Hóspede", "Apto", "Check-in", "Check-out", "Diárias", "Hospedagem", "Consumos", "Descontos", "Total"],
        linhas: sel.hospedagens.map(function (x) { var h = x.hospedagem; return [h.hospede, h.apartamento, h.checkin, h.checkoutRealizado || h.checkout, x.diarias, H.reaisCsv(x.valorHospedagem), H.reaisCsv(h.consumos), H.reaisCsv(h.descontos), H.reaisCsv(x.total)]; }) };
    }
    return html;
  };
  T.acoes["hotel-empresa-ver"] = function (id) { T.filtros.empresaSel = id; T.renderizar(); };

  // ------------------------------------------------------------ contas fixas e calendário

  T.telas.recorrentes = function () {
    var comp = compSel(), hoje = L.hoje();
    var contas = L.estado.contas.filter(function (c) { return H.noMes(c.vencimento, comp); });
    var html = T.cabecalho("Contas Fixas e Calendário", "Recorrência gera PREVISÃO (rascunho), nunca pagamento. O pagamento continua em Contas a Pagar, com aprovação.",
      botaoNovo("contasRecorrentes", "Nova conta recorrente") + ' <button class="botao" data-acao="hotel-gerar-recorrentes">Gerar previsões de ' + comp + "</button>");
    html += barraData(true);
    if (!L.estado.contasRecorrentes.length) html += '<div class="painel">' + vazio("Nenhuma conta recorrente", "Cadastre internet, energia, água, telefone, placa solar e outras contas fixas.", { acao: "hotel-recorrentes-padrao", rotulo: "Criar as contas fixas iniciais" }) + "</div>";
    else html += U.painelHtml("Recorrências", "", U.tabelaHtml([
      { rotulo: "Conta", conteudo: function (r) { return '<div class="principal">' + U.esc(r.descricao) + '</div><div class="secundario">' + U.esc((r.tipoConta || "FIXA").toLowerCase() + " · " + (r.periodicidade || "MENSAL").toLowerCase() + (r.dia ? " · dia " + r.dia : "")) + "</div>"; } },
      { rotulo: "Previsto", direita: true, conteudo: function (r) { return brl(r.valorPrevisto); } },
      { rotulo: "", direita: true, conteudo: function (r) { return botaoEditar("contasRecorrentes", r); } }], L.estado.contasRecorrentes));
    // Calendário mensal: soma por dia + saldo projetado.
    var dias = H.diasDoMes(comp), primeiro = new Date(comp + "-01T12:00:00Z").getUTCDay();
    var fluxo = H.fluxoCaixa(comp + "-01", comp + "-" + String(dias).padStart(2, "0"), T.saldoInicialFluxo || 0);
    var cel = [];
    for (var i = 0; i < primeiro; i++) cel.push('<div class="cal-dia vazio"></div>');
    for (var d = 1; d <= dias; d++) {
      var iso = comp + "-" + String(d).padStart(2, "0");
      var cs = contas.filter(function (c) { return c.vencimento === iso; });
      var pagas = cs.filter(function (c) { return c.status === "PAGO"; }), venc = cs.filter(function (c) { return c.status !== "PAGO" && c.status !== "CANCELADO" && iso < hoje; });
      var tot = cs.reduce(function (a, c) { return a + c.valor; }, 0);
      var tom = venc.length ? "critico" : (cs.length && pagas.length === cs.length ? "ok" : (cs.length ? "atencao" : ""));
      var fl = fluxo.linhas[d - 1];
      cel.push('<div class="cal-dia ' + tom + '" title="' + U.esc(cs.map(function (c) { return c.descricao + " " + L.brl(c.valor); }).join("\n")) + '"><span class="cal-n">' + d + "</span>" +
        (cs.length ? '<span class="cal-v">' + L.brl(tot) + "</span><span class=\"cal-q\">" + cs.length + " conta(s)</span>" : "") +
        '<span class="cal-s' + (fl.insuficiente ? " neg" : "") + '">saldo ' + L.brl(fl.saldoProjetado) + "</span></div>");
    }
    html += U.painelHtml("Calendário financeiro · " + comp, "verde pago · amarelo a pagar · vermelho vencido · saldo projetado no rodapé",
      '<div class="cal-grade">' + ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(function (x) { return '<div class="cal-cab">' + x + "</div>"; }).join("") + cel.join("") + "</div>");
    var alertas = L.estado.contas.filter(function (c) { return c.status !== "PAGO" && c.status !== "CANCELADO" && H.marcoAlerta(c.vencimento, hoje); });
    if (alertas.length) html += U.painelHtml("Alertas de vencimento de hoje", "um aviso por marco: 7, 3, 1 dia, no dia e depois", U.tabelaHtml([
      { rotulo: "Conta", conteudo: function (c) { return U.esc(c.descricao); } }, { rotulo: "Vencimento", conteudo: function (c) { return L.dataBR(c.vencimento); } },
      { rotulo: "Valor", direita: true, conteudo: function (c) { return brl(c.valor); } },
      { rotulo: "Marco", direita: true, conteudo: function (c) { var m = H.marcoAlerta(c.vencimento, hoje); return m === "VENCIDA" ? pastilha("critico", "Vencida") : pastilha("atencao", m === "D-0" ? "Vence hoje" : "Faltam " + m.slice(2) + " dia(s)"); } }], alertas));
    exportavel("contas-" + comp, ["Vencimento", "Descrição", "Categoria", "Tipo", "Previsto", "Valor", "Status"],
      contas.map(function (c) { return [c.vencimento, c.descricao, c.categoria, c.tipoConta || "", H.reaisCsv(c.valorPrevisto), H.reaisCsv(c.valor), c.status]; }));
    return html;
  };
  T.acoes["hotel-gerar-recorrentes"] = function () { var n = H.gerarRecorrentes(compSel()); T.renderizar(); U.avisar(n.length ? n.length + " previsão(ões) criada(s) em Contas a Pagar." : "Nada novo: as previsões deste mês já existem."); };
  T.acoes["hotel-recorrentes-padrao"] = function () {
    ["Internet", "Placa solar / financiamento", "Energia elétrica", "Água", "Telefone"].forEach(function (n) {
      L.criar("contasRecorrentes", { descricao: n, tipoConta: "FIXA", categoria: "Despesas fixas", periodicidade: "MENSAL", dia: 10, valorPrevisto: 1, inicio: L.hoje() });
    });
    T.renderizar(); U.avisar("Criadas com valor simbólico: ajuste o valor previsto e o dia de cada uma.");
  };

  // ------------------------------------------------------------ fluxo de caixa

  T.telas.fluxo = function () {
    var comp = compSel(), dias = H.diasDoMes(comp);
    var saldoIni = Number(T.filtros.fluxoSaldo || 0);
    var f = H.fluxoCaixa(comp + "-01", comp + "-" + String(dias).padStart(2, "0"), saldoIni);
    T.saldoInicialFluxo = saldoIni;
    exportavel("fluxo-" + comp, ["Data", "Entradas", "Saídas", "Saldo realizado", "Recebimentos previstos", "Pagamentos previstos", "Saldo projetado"],
      f.linhas.map(function (l) { return [l.data, H.reaisCsv(l.entradas), H.reaisCsv(l.saidas), H.reaisCsv(l.saldoRealizado), H.reaisCsv(l.recebimentosPrevistos), H.reaisCsv(l.pagamentosPrevistos), H.reaisCsv(l.saldoProjetado)]; }));
    var html = T.cabecalho("Fluxo de Caixa", "Realizado só com o que entrou e saiu de fato. Conta a receber fica no previsto até ser liquidada.");
    html += barraData(true) + '<div class="barra-ferramentas" style="margin-top:-8px"><span class="filtro-rotulo">Saldo inicial (R$)</span><input type="number" step="0.01" class="hotel-filtro" data-chave="fluxoSaldoReais" value="' + (saldoIni / 100).toFixed(2) + '"></div>';
    var soma = function (k) { return f.linhas.reduce(function (a, l) { return a + l[k]; }, 0); };
    html += kpis([
      { rotulo: "Entradas realizadas", valor: brl(soma("entradas")), nota: comp },
      { rotulo: "Saídas realizadas", valor: brl(soma("saidas")), nota: "contas pagas + saídas de caixa" },
      { rotulo: "Saldo realizado", valor: brl(f.saldoFinalRealizado), nota: "fim do mês", hero: true },
      { rotulo: "Saldo projetado", valor: brl(f.saldoFinalProjetado), nota: f.diasInsuficientes.length ? f.diasInsuficientes.length + " dia(s) com caixa insuficiente" : "sem falta prevista", tom: f.diasInsuficientes.length ? "critico" : "" }
    ]);
    html += U.painelHtml("Dia a dia", "", U.tabelaHtml([
      { rotulo: "Data", conteudo: function (l) { return L.dataBR(l.data); } },
      { rotulo: "Entradas", direita: true, conteudo: function (l) { return brl(l.entradas); } }, { rotulo: "Saídas", direita: true, conteudo: function (l) { return brl(l.saidas); } },
      { rotulo: "Realizado", direita: true, conteudo: function (l) { return brl(l.saldoRealizado); } },
      { rotulo: "A receber", direita: true, conteudo: function (l) { return brl(l.recebimentosPrevistos); } }, { rotulo: "A pagar", direita: true, conteudo: function (l) { return brl(l.pagamentosPrevistos); } },
      { rotulo: "Projetado", direita: true, conteudo: function (l) { return (l.insuficiente ? pastilha("critico", brl(l.saldoProjetado)) : brl(l.saldoProjetado)); } }
    ], f.linhas.filter(function (l) { return l.entradas || l.saidas || l.recebimentosPrevistos || l.pagamentosPrevistos; }), { tituloVazio: "Sem movimento no mês" }));
    return html;
  };

  // ------------------------------------------------------------ ponto e diárias

  T.telas.ponto = function () {
    var comp = compSel(), dias = H.diasDoMes(comp);
    var fs = L.ativos();
    var linhas = fs.map(function (f) {
      var jornadaMin = Math.round((f.cargaHoraria || 44) / (f.diasSemana || 5.5) * 60);
      var ms = L.estado.marcacoesPonto.filter(function (m) { return m.funcionarioId === f.id && H.noMes(m.data, comp); });
      var dd = ms.map(function (m) { return H.diaDePonto(m, jornadaMin); });
      var s = function (k) { return dd.reduce(function (a, x) { return a + x[k]; }, 0); };
      return { f: f, marcacoes: ms.length, trabalhados: s("trabalhados"), extras: s("extras"), atrasos: s("atraso"), faltas: dd.filter(function (x) { return x.falta; }).length, saldo: s("diferenca"), diarias: H.fechamentoDiarias(f.id, comp) };
    });
    exportavel("ponto-" + comp, ["Funcionário", "Marcações", "Horas trabalhadas", "Extras", "Atrasos", "Faltas", "Saldo do mês", "Diárias", "Valor diárias", "Pendente"],
      linhas.map(function (l) { return [l.f.nome, l.marcacoes, horas(l.trabalhados), horas(l.extras), horas(l.atrasos), l.faltas, horas(l.saldo), l.diarias.quantidade, H.reaisCsv(l.diarias.base), H.reaisCsv(l.diarias.pendente)]; }));
    var html = T.cabecalho("Ponto e Diárias", "Marcação original nunca é alterada: correção vira ajuste justificado e aprovado. Este controle é gerencial — se virar ponto oficial, precisa atender à Portaria 671/2021.",
      botaoNovo("marcacoesPonto", "Lançar marcação") + " " + botaoNovo("diarias", "Lançar diária"));
    html += barraData(true);
    html += U.painelHtml("Resumo do mês · " + comp, dias + " dias", U.tabelaHtml([
      { rotulo: "Funcionário", conteudo: function (l) { return '<div class="principal">' + U.esc(l.f.nome) + '</div><div class="secundario">' + U.esc(l.f.cargo || "") + "</div>"; } },
      { rotulo: "Trabalhadas", direita: true, conteudo: function (l) { return horas(l.trabalhados); } },
      { rotulo: "Extras", direita: true, conteudo: function (l) { return horas(l.extras); } },
      { rotulo: "Atrasos", direita: true, conteudo: function (l) { return horas(l.atrasos); } },
      { rotulo: "Faltas", direita: true, conteudo: function (l) { return l.faltas; } },
      { rotulo: "Saldo", direita: true, conteudo: function (l) { return horas(l.saldo); } },
      { rotulo: "Diárias", direita: true, conteudo: function (l) { return l.diarias.quantidade ? l.diarias.quantidade + " · " + brl(l.diarias.base) + '<div class="secundario">pendente ' + brl(l.diarias.pendente) + "</div>" : "—"; } }
    ], linhas, { tituloVazio: "Nenhum funcionário ativo", textoVazio: "Cadastre a equipe em Pessoas → Funcionários." }));
    var folha = L.estado.folhaMes.filter(function (x) { return x.competencia === comp; });
    if (folha.length) html += U.painelHtml("Folha do mês · " + comp, "planilha da Direção (ponto do EZPoint)", U.tabelaHtml([
      { rotulo: "Funcionário", conteudo: function (x) { return '<div class="principal">' + U.esc(x.nome) + '</div><div class="secundario">' + U.esc(x.funcao || "") + " · " + U.esc(x.vinculo || "") + "</div>"; } },
      { rotulo: "Salário", direita: true, conteudo: function (x) { return brl(x.valorSalario); } },
      { rotulo: "Produtividade", direita: true, conteudo: function (x) { return x.valorProdutividade ? brl(x.valorProdutividade) + '<div class="secundario">' + U.esc(x.formaProdutividade || "") + "</div>" : "—"; } },
      { rotulo: "Ticket", direita: true, conteudo: function (x) { return x.valorTicket ? brl(x.valorTicket) : "—"; } },
      { rotulo: "HE 50% / 100%", direita: true, conteudo: function (x) { return U.esc(x.he50 + " / " + x.he100); } },
      { rotulo: "Noturnas", direita: true, conteudo: function (x) { return U.esc(x.noturnas); } },
      { rotulo: "Atrasos", direita: true, conteudo: function (x) { return U.esc(x.atrasos); } },
      { rotulo: "Faltas", direita: true, conteudo: function (x) { return x.faltas; } },
      { rotulo: "Pago em", conteudo: function (x) { return L.dataBR(x.dataPagamento) + '<div class="secundario">' + U.esc(x.observacoes || "") + "</div>"; } }
    ], folha));
    var ms = L.estado.marcacoesPonto.filter(function (m) { return H.noMes(m.data, comp); }).sort(function (a, b) { return b.data.localeCompare(a.data); });
    html += U.painelHtml("Marcações", "", U.tabelaHtml([
      { rotulo: "Data", conteudo: function (m) { var f = L.buscarPorId("funcionarios", m.funcionarioId); return L.dataBR(m.data) + '<div class="secundario">' + U.esc(f ? f.nome : "") + "</div>"; } },
      { rotulo: "Marcação original", conteudo: function (m) { return m.falta ? "Falta" : U.esc([m.entrada, m.inicioIntervalo, m.fimIntervalo, m.saida].filter(Boolean).join(" · ")); } },
      { rotulo: "Trabalhadas", direita: true, conteudo: function (m) { var ef = H.marcacaoEfetiva(m); return horas(H.minutosTrabalhados(ef)) + (ef !== m ? " " + pastilha("info", "ajustada") : ""); } },
      { rotulo: "", direita: true, conteudo: function (m) {
        var pend = L.estado.ajustesPonto.filter(function (a) { return a.marcacaoId === m.id && a.status === "PENDENTE"; });
        var s = T.podeEditar() ? '<button class="botao miudo" data-acao="hotel-ajuste-ponto" data-id="' + m.id + '">Pedir ajuste</button>' : "";
        if (pend.length && T.temPerfil("DIRECAO", "RH", "GESTOR")) s += ' <button class="botao miudo primario" data-acao="hotel-aprovar-ajuste" data-id="' + pend[0].id + '">Aprovar ajuste</button>';
        return s; } }
    ], ms, { tituloVazio: "Nenhuma marcação no mês" }));
    return html;
  };
  T.acoes["hotel-ajuste-ponto"] = function (id) {
    var m = L.buscarPorId("marcacoesPonto", id);
    U.abrirFormulario({ titulo: "Pedido de ajuste", sub: "A marcação original fica preservada.", campos: [
      { id: "entrada", rotulo: "Entrada", par: true }, { id: "inicioIntervalo", rotulo: "Início do intervalo" },
      { id: "fimIntervalo", rotulo: "Fim do intervalo", par: true }, { id: "saida", rotulo: "Saída" },
      { id: "justificativa", rotulo: "Justificativa", tipo: "textarea", obrigatorio: true }], valores: m,
      aoSalvar: function (v) {
        var novos = {}; ["entrada", "inicioIntervalo", "fimIntervalo", "saida"].forEach(function (k) { if (v[k] !== (m[k] || "")) novos[k] = v[k]; });
        L.criar("ajustesPonto", { marcacaoId: id, novos: novos, justificativa: v.justificativa, status: "PENDENTE", pedidoPor: (L.estado.usuario || {}).nome, pedidoEm: new Date().toISOString() });
        U.fecharModal(); T.renderizar(); } });
  };
  T.acoes["hotel-aprovar-ajuste"] = function (id) { L.atualizar("ajustesPonto", id, { status: "APROVADO", aprovadoPor: (L.estado.usuario || {}).nome, aprovadoEm: new Date().toISOString() }); T.renderizar(); };

  // ------------------------------------------------------------ fechamento do mês

  T.telas.fechamentomes = function () {
    var comp = compSel(), hoje = L.hoje();
    var pend = H.pendenciasDoMes(comp, hoje);
    var reg = (L.estado.fechamentosMes || []).find(function (p) { return p.id === comp; }) || {};
    var st = reg.statusHotel || (pend.length ? "COM_PENDENCIAS" : "ABERTO");
    var passos = ["Receitas de hospedagem", "Recebimentos", "Cartões e depósitos", "Faturamento por empresa", "Notas fiscais", "Boletos", "Cobranças", "Frigobar", "Fornecedores", "Contas fixas", "Contas variáveis", "Fluxo de caixa", "Controle de ponto", "Banco de horas", "Folha de pagamento", "Relatório gerencial", "Pendências", "Submeter à Direção"];
    var feitos = reg.passosHotel || {};
    var html = T.cabecalho("Fechamento do Mês", "Roteiro do §27: cada etapa é conferida e marcada; a Direção aprova e fecha.");
    html += barraData(true);
    html += kpis([{ rotulo: "Status", valor: (ROT[st] || st), nota: comp, hero: true }, { rotulo: "Pendências automáticas", valor: String(pend.length), nota: "caixa, cartão, frigobar, boletos", tom: pend.length ? "critico" : "" },
      { rotulo: "Etapas conferidas", valor: Object.keys(feitos).length + " / " + passos.length, nota: "" }]);
    if (pend.length) html += U.painelHtml("Pendências", "", '<ul style="margin:0;padding:0 20px 16px 36px">' + pend.map(function (p) { return "<li>" + U.esc(p.texto) + "</li>"; }).join("") + "</ul>");
    html += U.painelHtml("Roteiro", "", '<ol style="margin:0;padding:0 20px 16px 40px;line-height:2">' + passos.map(function (p, i) {
      return "<li>" + U.esc(p) + " " + (feitos[i] ? pastilha("ok", "conferido por " + feitos[i]) : (T.podeEditar() ? '<button class="botao miudo" data-acao="hotel-passo-mes" data-id="' + i + '">Marcar conferido</button>' : "")) + "</li>"; }).join("") + "</ol>" +
      '<div style="padding:0 20px 18px;display:flex;gap:8px">' +
      (st !== "FECHADO" && T.podeEditar() ? '<button class="botao" data-acao="hotel-status-mes" data-id="AGUARDANDO_APROVACAO">Submeter à Direção</button>' : "") +
      (T.temPerfil("DIRECAO") && st === "AGUARDANDO_APROVACAO" ? ' <button class="botao primario" data-acao="hotel-status-mes" data-id="APROVADO">Aprovar</button>' : "") +
      (T.temPerfil("DIRECAO") && st === "APROVADO" ? ' <button class="botao primario" data-acao="hotel-status-mes" data-id="FECHADO">Fechar o mês</button>' : "") + "</div>");
    return html;
  };
  // Um registro por competência (id = "AAAA-MM") na área própria do hotel,
  // que vai para o banco junto com as demais.
  function gravarMes(comp, mudancas) {
    if (!Array.isArray(L.estado.fechamentosMes)) L.estado.fechamentosMes = [];
    var p = L.estado.fechamentosMes.find(function (x) { return x.id === comp; });
    if (p) return L.atualizar("fechamentosMes", comp, mudancas);
    return L.criar("fechamentosMes", Object.assign({ id: comp, competencia: comp }, mudancas));
  }
  T.acoes["hotel-passo-mes"] = function (i) {
    var comp = compSel();
    var atual = (L.estado.fechamentosMes || []).find(function (x) { return x.id === comp; }) || {};
    var passos = Object.assign({}, atual.passosHotel || {});
    passos[i] = (L.estado.usuario || {}).nome;
    gravarMes(comp, { passosHotel: passos });
    T.renderizar();
  };
  T.acoes["hotel-status-mes"] = function (s) {
    var comp = compSel();
    if (s === "AGUARDANDO_APROVACAO" && H.pendenciasDoMes(comp, L.hoje()).length) return U.avisar("Resolva as pendências antes de submeter.");
    var m = { statusHotel: s }; m["hotel" + s + "Por"] = (L.estado.usuario || {}).nome;
    if (s === "FECHADO") m.fechado = true;
    gravarMes(comp, m);
    T.renderizar();
  };

  // ------------------------------------------------------------ cadastros do hotel

  T.telas.hotelconfig = function () {
    var c = L.estado.configHotel;
    var html = T.cabecalho("Cadastros do Hotel", "Apartamentos e regras operacionais. Produtos e enxoval ficam nas próprias telas.", botaoNovo("apartamentos", "Novo apartamento"));
    html += U.painelHtml("Regras", "", '<div style="padding:0 20px 18px">' +
      "<p>Nome: <strong>" + U.esc(c.nome) + "</strong> · Café: " + U.esc(c.cafeHorario) + " · Ocupação " + (c.ocupacaoExcluiBloqueados ? "exclui" : "inclui") + " apartamentos bloqueados · Alertas de vencimento: " + c.alertasVencimentoDias.join(", ") + " dias · Saldo inicial do caixa: " + L.brl(c.saldoInicialCaixa || 0) + "</p>" +
      (T.temPerfil("DIRECAO") ? '<button class="botao miudo" data-acao="hotel-config">Editar regras</button>' : "") + "</div>");
    html += U.painelHtml("Apartamentos", L.estado.apartamentos.length + " cadastrado(s)", U.tabelaHtml([
      { rotulo: "Número", conteudo: function (a) { return "<strong>" + U.esc(a.numero) + "</strong>"; } },
      { rotulo: "Tipologia", conteudo: function (a) { return U.esc(a.tipologia || ""); } },
      { rotulo: "Capacidade", direita: true, conteudo: function (a) { return a.capacidade || ""; } },
      { rotulo: "Situação", direita: true, conteudo: function (a) { return a.bloqueado ? pastilha("atencao", "Bloqueado") : pastilha("ok", "À venda"); } },
      { rotulo: "", direita: true, conteudo: function (a) { return botaoEditar("apartamentos", a); } }
    ], L.estado.apartamentos.slice().sort(function (a, b) { return String(a.numero).localeCompare(String(b.numero), "pt-BR", { numeric: true }); }), { tituloVazio: "Nenhum apartamento" }));
    return html;
  };
  T.acoes["hotel-config"] = function () {
    var c = L.estado.configHotel;
    U.abrirFormulario({ titulo: "Regras do hotel", campos: [
      { id: "nome", rotulo: "Nome do hotel", obrigatorio: true }, { id: "cafeHorario", rotulo: "Horário do café", par: true },
      { id: "ocupacaoExcluiBloqueados", rotulo: "Taxa de ocupação", tipo: "select", opcoes: [{ valor: "1", rotulo: "Exclui bloqueados do denominador" }, { valor: "", rotulo: "Considera todos os apartamentos" }] },
      { id: "alertas", rotulo: "Alertas de vencimento (dias antes, separados por vírgula)", par: true }, { id: "saldoInicialCaixa", rotulo: "Saldo inicial do caixa", tipo: "moeda" }],
      valores: { nome: c.nome, cafeHorario: c.cafeHorario, ocupacaoExcluiBloqueados: c.ocupacaoExcluiBloqueados ? "1" : "", alertas: c.alertasVencimentoDias.join(","), saldoInicialCaixa: ((c.saldoInicialCaixa || 0) / 100).toFixed(2) },
      aoSalvar: function (v) {
        Object.assign(c, { nome: v.nome, cafeHorario: v.cafeHorario, ocupacaoExcluiBloqueados: !!v.ocupacaoExcluiBloqueados, saldoInicialCaixa: v.saldoInicialCaixa,
          alertasVencimentoDias: v.alertas.split(",").map(function (x) { return parseInt(x, 10); }).filter(function (x) { return !isNaN(x); }) });
        L.registrar("configHotel", { descricao: "Regras do hotel" }, "ALTERAR"); L.persistir(); U.fecharModal(); T.renderizar(); } });
  };

  // ------------------------------------------------------------ dashboard gerencial

  var dashOriginal = T.telas.dashboard;
  T.telas.dashboard = function () {
    var base = dashOriginal();
    var hoje = L.hoje(), comp = hoje.slice(0, 7);
    var temDados = L.estado.hospedagens.length || L.estado.recebimentos.length || L.estado.apartamentos.length;
    if (!temDados) return base;
    var o = H.ocupacao(hoje), cafe = H.listaCafe(hoje), f = H.fechamentoDia(hoje);
    var mes = L.estado.recebimentos.filter(function (r) { return H.noMes(r.data, comp) && r.tipo !== "SAIDA_CAIXA" && r.status !== "CANCELADO"; });
    var recMes = mes.reduce(function (a, r) { var s = H.situacaoRecebimento(r); return a + (s === "RECEBIDO" || s === "CONCILIADO" ? H.liquido(r) : 0); }, 0);
    var fatMes = mes.filter(function (r) { return !r.liquidaFaturado; }).reduce(function (a, r) { return a + H.liquido(r); }, 0);
    var aRec = L.estado.recebimentos.filter(function (r) { return r.tipo !== "SAIDA_CAIXA" && H.situacaoRecebimento(r) === "A_RECEBER"; }).reduce(function (a, r) { return a + H.liquido(r); }, 0);
    var bolPend = L.estado.boletos.filter(function (b) { var s = H.statusBoleto(b, hoje); return s !== "PAGO" && s !== "CANCELADO"; });
    var frig = H.frigobarMes(comp);
    var podeFin = T.podeVer("caixa");
    var bloco = '<div class="painel" style="padding:18px 20px"><h2 style="margin:0 0 12px">Hotel hoje · ' + L.dataBR(hoje) + "</h2>" +
      '<div class="grade-kpi">' + [
        { rotulo: "Ocupação", valor: pct(o.taxa), nota: o.ocupados + " ocupados · " + o.disponiveis + " livres", destino: "hospedagem", hero: true },
        { rotulo: "Hóspedes presentes", valor: String(o.hospedes), nota: o.entradas + " check-ins · " + o.saidas + " check-outs", destino: "hospedagem" },
        { rotulo: "Café de hoje", valor: String(cafe.totalPrevisto), nota: "pessoas previstas", destino: "cafe" }
      ].concat(podeFin ? [
        { rotulo: "Receita lançada no mês", valor: L.brl(fatMes), nota: "reconhecida (não é dinheiro)", destino: "caixa" },
        { rotulo: "Recebido no mês", valor: L.brl(recMes), nota: "efetivamente entrou", destino: "caixa" },
        { rotulo: "A receber", valor: L.brl(aRec), nota: "cartão, faturado, boleto", destino: "cartoes" },
        { rotulo: "Boletos em aberto", valor: String(bolPend.length), nota: L.brl(bolPend.reduce(function (a, b) { return a + H.saldoBoleto(b); }, 0)), destino: "boletos" },
        { rotulo: "Caixa do dia", valor: L.brl(f.saldoCalculado), nota: f.fechamento && f.fechamento.status === "FECHADO" ? "fechado" : "aberto", destino: "caixa" },
        { rotulo: "Frigobar no mês", valor: L.brl(frig.receita), nota: frig.produtos.length + " produto(s)", destino: "frigobar" }
      ] : []).map(U.kpiHtml).join("") + "</div></div>";
    // Encaixa logo depois do cabeçalho do dashboard.
    var i = base.indexOf('<div class="cabecalho');
    var fim = i === -1 ? -1 : base.indexOf("</div></div>", i);
    return fim === -1 ? bloco + base : base.slice(0, fim + 12) + bloco + base.slice(fim + 12);
  };

  // ------------------------------------------------------------ eventos próprios

  var ligar = T.ligarEventos;
  T.ligarEventos = function () {
    ligar.apply(this, arguments);
    U.todos(".hotel-filtro", U.el("conteudo")).forEach(function (el) {
      el.addEventListener("change", function () {
        if (el.dataset.chave === "fluxoSaldoReais") T.filtros.fluxoSaldo = Math.round(parseFloat(el.value || "0") * 100);
        else if (el.value) T.filtros[el.dataset.chave] = el.value;
        if (el.dataset.chave === "dataHotel") T.filtros.mesHotel = el.value.slice(0, 7);
        T.renderizar();
      });
    });
    var arq = U.el("imp-arquivo"), drop = U.el("imp-drop");
    function lerArquivo(file) {
      if (!file) return;
      if (L.USA_BACKEND) return T._impSrvEnviar(file);
      if (!/\.csv$/i.test(file.name)) { U.avisar("Envie CSV. No Excel: Arquivo → Salvar como → CSV (separado por ponto e vírgula)."); return; }
      var leitor = new FileReader();
      leitor.onload = function () {
        try {
          var linhas = H.lerCsv(leitor.result);
          if (!linhas.length) return U.avisar("O arquivo está vazio.");
          T._previa = H.preverImportacao(T.filtros.impTipo || "hospedagens", T.filtros.impOrigem || "DATAHOTEL", linhas);
          T._previa.arquivo = file.name;
          T.renderizar();
        } catch (e) { U.avisar(e.message || "Não foi possível ler o arquivo."); }
      };
      leitor.readAsText(file, "utf-8");
    }
    if (arq) arq.addEventListener("change", function () { lerArquivo(arq.files && arq.files[0]); });
    if (drop) {
      ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("sobre"); }); });
      ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("sobre"); }); });
      drop.addEventListener("drop", function (e) { lerArquivo(e.dataTransfer.files && e.dataTransfer.files[0]); });
    }
  };
})();
