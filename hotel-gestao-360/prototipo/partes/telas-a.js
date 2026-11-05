/* ============================================================================
   Telas A: acesso, navegação, roteamento, dashboard, banco de horas e folha.
   ========================================================================== */

// `telas` e `acoes` nascem aqui: qualquer registro feito antes desta linha
// seria apagado por uma reatribuição posterior.
var T = {
  atual: "dashboard", filtros: {}, telas: {}, acoes: {},
  // Categoria aberta no acordeão da lateral (null = nenhuma) e se o usuário
  // fixou manualmente o modo largo (nome sempre visível) via #btn-expandir.
  _categoriaAberta: null, _expandidaManual: false
};

// ---------------------------------------------------------------- perfis

T.MODULOS = [
  { grupo: "Visão geral", chave: "dashboard", nome: "Dashboard" },
  { grupo: "Visão geral", chave: "aprovacoes", nome: "Minhas Aprovações" },
  { grupo: "Pessoas", chave: "funcionarios", nome: "Funcionários" },
  { grupo: "Pessoas", chave: "banco", nome: "Banco de Horas" },
  { grupo: "Pessoas", chave: "folha", nome: "Folha de Pagamento" },
  { grupo: "Pessoas", chave: "ferias", nome: "Férias e Ausências" },
  { grupo: "Pessoas", chave: "eventos", nome: "13º, Férias e Rescisão" },
  { grupo: "Pessoas", chave: "lotacao", nome: "Lotação de Aulas" },
  { grupo: "Financeiro", chave: "contas", nome: "Contas a Pagar" },
  { grupo: "Financeiro", chave: "fechamento", nome: "Fechamento Mensal" },
  { grupo: "Financeiro", chave: "fornecedores", nome: "Fornecedores" },
  { grupo: "Financeiro", chave: "contratos", nome: "Contratos" },
  { grupo: "Operação", chave: "solicitacoes", nome: "Solicitações" },
  { grupo: "Operação", chave: "documentos", nome: "Documentos" },
  { grupo: "Operação", chave: "relatorios", nome: "Relatórios" },
  { grupo: "Operação", chave: "auditoria", nome: "Trilha de Auditoria" },
  // `noMenuLateral`: continua um módulo de verdade (rota, permissão, busca
  // global), só não ocupa lugar fixo na navegação — é configuração de fundo,
  // não algo que se abre todo dia. Fica atrás do ícone de engrenagem.
  { grupo: "Configuração", chave: "tabelas", nome: "Tabelas Legais", noMenuLateral: true },
  { grupo: "Configuração", chave: "acessos", nome: "Controle de Acesso", noMenuLateral: true }
];

/**
 * Ícone próprio para cada módulo. Visão geral fica solta na cápsula; Pessoas,
 * Financeiro e Operação vivem atrás de um acordeão — clicar na categoria
 * abre a lista dos módulos dela embutida na própria lateral (empurra o resto
 * para baixo), em vez de um popover separado ou 14 ícones soltos de uma vez.
 */
T.ICONES_MODULO = {
  dashboard: "dashboard", aprovacoes: "aprovacoes",
  funcionarios: "pessoa", banco: "banco", folha: "folha", ferias: "ferias", lotacao: "lotacao",
  contas: "contas", fechamento: "fechamento", fornecedores: "fornecedores", contratos: "contratos",
  solicitacoes: "solicitacao", documentos: "documentos", relatorios: "relatorios", auditoria: "auditoria"
};

/** Ícone e ordem das categorias que viram acordeão na cápsula. */
T.GRUPOS_ACORDEAO = ["Pessoas", "Financeiro", "Operação"];
T.ICONES_CATEGORIA = { "Pessoas": "pessoas", "Financeiro": "financeiro", "Operação": "operacao" };

/** Módulos que podem ser concedidos a uma pessoa além do perfil dela. */
T.MODULOS_DELEGAVEIS = T.MODULOS.filter(function (m) {
  return m.chave !== "dashboard" && m.chave !== "acessos";
});

T.PERFIS = {
  DIRECAO: { nome: "Direção", modulos: "*", resumo: "Enxerga todos os módulos e aprova em última instância." },
  // Banco de horas entra na lista do Financeiro: hora negativa vira desconto
  // na folha do mês, hora positiva vira passivo a pagar ou compensar — é
  // custo, não é só operação de RH.
  FINANCEIRO: { nome: "Financeiro", resumo: "Contas, fechamento, fornecedores, contratos, folha e banco de horas.",
    modulos: ["dashboard","aprovacoes","folha","banco","eventos","contas","fechamento","fornecedores","contratos","solicitacoes","relatorios","auditoria"] },
  // "tabelas" é do RH por competência técnica: conferir INSS/IRRF contra a
  // portaria é trabalho de quem entende de folha, não da Direção. A decisão
  // final continua com a Direção, que é quem fecha a competência — são duas
  // travas em série, não uma.
  RH: { nome: "Recursos Humanos", resumo: "Pessoas, banco de horas, folha, férias, lotação de aulas, documentos e tabelas legais.",
    modulos: ["dashboard","aprovacoes","funcionarios","banco","folha","ferias","eventos","lotacao","documentos","relatorios","auditoria","tabelas"] },
  ADMINISTRATIVO: { nome: "Administrativo", resumo: "Compras, fornecedores, contratos e documentos.",
    modulos: ["dashboard","aprovacoes","contas","fornecedores","contratos","solicitacoes","documentos"] },
  // Sem "funcionarios": esse módulo mostra CPF e salário de todo mundo, e a
  // rotina da coordenação pedagógica é aprovar ausência e solicitação da
  // equipe, não abrir a ficha completa de RH. Quem precisar de exceção, o
  // administrador concede pontualmente em Controle de Acesso.
  COORDENACAO: { nome: "Coordenação", resumo: "Ausências, solicitações da equipe e lotação de aulas.",
    modulos: ["dashboard","aprovacoes","ferias","solicitacoes","lotacao"] },
  SECRETARIA: { nome: "Secretaria", resumo: "Solicitações e central de documentos.",
    modulos: ["dashboard","solicitacoes","documentos"] },
  GESTOR: { nome: "Gestor de equipe", resumo: "Aprova o que é da sua equipe; não vê dado financeiro.",
    modulos: ["dashboard","aprovacoes","banco","ferias","solicitacoes"] },
  CONSULTA: { nome: "Consulta", resumo: "Somente leitura, sem aprovar nem editar.",
    modulos: ["dashboard","relatorios"] }
};

// Trilha de auditoria mostra alteração técnica bruta (linha por linha do
// banco, inclusive mudança feita por script) — informação de quem mantém o
// sistema, não do dia a dia da Direção. Travado no e-mail de quem administra
// de verdade, não no perfil: Dércio e Fernanda são DIRECAO como o Vinicius,
// mas não deveriam ver isto.
T.EMAIL_ADMINISTRADOR_SISTEMA = "viniciussbrd@gmail.com";

T.podeVer = function (chave) {
  if (!L.estado.usuario) return false;
  // Controle de Acesso não é módulo de perfil: é a exceção de quem delega.
  if (chave === "acessos") return L.podeDelegar(L.estado.usuario);
  if (chave === "auditoria") return L.estado.usuario.email === T.EMAIL_ADMINISTRADOR_SISTEMA;
  // Quem tem mais de um perfil (ex.: Financeiro + RH) vê a soma dos módulos.
  var perfis = L.estado.usuario.perfis && L.estado.usuario.perfis.length
    ? L.estado.usuario.perfis : [L.estado.usuario.perfil];
  var alcanca = perfis.some(function (nome) {
    var p = T.PERFIS[nome];
    return p && (p.modulos === "*" || p.modulos.indexOf(chave) !== -1);
  });
  if (alcanca) return true;
  // Fora do perfil-padrão, só entra se alguém com poder de delegar concedeu
  // este módulo especificamente a esta conta.
  return (L.estado.usuario.extras || []).indexOf(chave) !== -1;
};

/** Algum dos perfis da pessoa está na lista? (Mesma regra do servidor.) */
T.temPerfil = function () {
  var u = L.estado.usuario;
  if (!u) return false;
  var meus = u.perfis && u.perfis.length ? u.perfis : [u.perfil];
  var aceitos = Array.prototype.slice.call(arguments);
  return meus.some(function (p) { return aceitos.indexOf(p) !== -1; });
};

T.podeEditar = function () {
  return L.estado.usuario && L.estado.usuario.perfil !== "CONSULTA";
};

// ---------------------------------------------------------------- navegação

T.contadores = function () {
  // Conta só o que espera POR MIM. Um contador que soma o pedido dos outros
  // vira ruído: a pessoa abre a tela e não encontra nada para fazer.
  var perfil = L.estado.usuario ? L.estado.usuario.perfil : null;
  var pendentes = perfil === "DIRECAO"
    ? L.estado.solicitacoes.filter(L.estaAberta).length
    : L.aguardandoMim(perfil).length;
  var vencidas = L.estado.contas.filter(function (c) { return L.statusConta(c) === "VENCIDO"; }).length;
  var negativos = L.ativos().filter(function (f) { return L.saldoBanco(f.id) < 0; }).length;
  return { aprovacoes: pendentes, contas: vencidas, banco: negativos };
};

/**
 * Nunca nome escrito na cápsula por padrão — o nome real só aparece na dica
 * (hover) ou, quando a categoria está aberta, ao lado do ícone. Visão geral
 * fica solta; Pessoas/Financeiro/Operação são um acordeão — só uma categoria
 * aberta por vez, abrir uma widen a cápsula só o suficiente para mostrar
 * ícone + nome dos módulos dela. Remontado a cada T.ir porque o contador, o
 * item ativo e a categoria aberta mudam de tela para tela.
 */
T.montarNav = function () {
  var nav = U.el("nav");
  if (!nav) return;
  var cont = T.contadores();

  // Ordem do miolo do botão importa no modo largo: ícone, depois o nome (que
  // cresce e ocupa o espaço livre), e só então o indicador — assim o nome
  // fica colado no ícone e o indicador fica encostado na borda direita, em
  // vez de os dois grudados logo depois do ícone com um vão vazio à direita.
  function item(m) {
    var icone = T.ICONES_MODULO[m.chave] || "dashboard";
    var n = cont[m.chave] || 0;
    return '<div class="lateral-item-caixa">' +
      '<button type="button" class="nav-item" data-ir="' + m.chave + '"' +
      (T.atual === m.chave ? ' aria-current="true"' : "") + ">" +
      U.iconeSvg(icone) +
      '<span class="dica">' + U.esc(m.nome) + "</span>" +
      (n > 0 ? '<span class="contador' + (m.chave === "contas" ? " urgente" : "") + '" aria-hidden="true"></span>' : "") +
      "</button></div>";
  }

  var visiveis = T.MODULOS.filter(function (m) { return !m.noMenuLateral && T.podeVer(m.chave); });
  var porGrupo = {};
  visiveis.forEach(function (m) { (porGrupo[m.grupo] = porGrupo[m.grupo] || []).push(m); });

  var html = "";
  (porGrupo["Visão geral"] || []).forEach(function (m) { html += item(m); });

  T.GRUPOS_ACORDEAO.forEach(function (grupo) {
    var filhos = porGrupo[grupo];
    if (!filhos || !filhos.length) return;
    var aberta = T._categoriaAberta === grupo;
    var ativo = filhos.some(function (m) { return T.atual === m.chave; });
    var pendente = filhos.some(function (m) { return (cont[m.chave] || 0) > 0; });
    html += '<div class="lateral-item-caixa">' +
      '<button type="button" class="nav-item nav-categoria" data-categoria="' + U.esc(grupo) + '" aria-expanded="' + aberta + '"' +
      (ativo ? ' aria-current="true"' : "") + ">" +
      U.iconeSvg(T.ICONES_CATEGORIA[grupo]) +
      '<span class="dica">' + U.esc(grupo) + "</span>" +
      (pendente ? '<span class="contador" aria-hidden="true"></span>' : "") +
      U.iconeSvg("chevron", 14, "categoria-seta") +
      "</button>" +
      '<div class="categoria-filhos"' + (aberta ? "" : " hidden") + ">" +
      filhos.map(item).join("") +
      "</div></div>";
  });

  nav.innerHTML = html;
  T.atualizarLarguraLateral();

  // A lateral fica fora de #conteudo, então a delegação de T.ligarEventos não
  // a alcança: cada remontagem precisa religar os próprios cliques.
  U.todos("[data-ir]", nav).forEach(function (b) {
    b.addEventListener("click", function () {
      T.fecharLateralMovel();
      T.ir(b.dataset.ir);
    });
  });
  // O logo fica fora do menu (não é remontado): liga uma vez só.
  var logo = document.querySelector(".lateral-logo");
  if (logo && !logo._ligado) {
    logo._ligado = true;
    logo.addEventListener("click", function () {
      T.fecharLateralMovel();
      T.ir("dashboard");
    });
  }
  U.todos("[data-categoria]", nav).forEach(function (b) {
    b.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var grupo = b.dataset.categoria;
      T._categoriaAberta = (T._categoriaAberta === grupo) ? null : grupo;
      T.montarNav();
    });
  });
};

/** Mostra a cápsula larga (nome ao lado do ícone) sempre que o usuário
 * fixou esse modo manualmente OU uma categoria está aberta no acordeão —
 * SÓ no desktop, onde a cápsula larga empurra o conteúdo e sobra espaço
 * de sobra pra ela ficar visível o tempo todo sem incomodar. No celular
 * ela é gaveta por cima da tela (ver CSS): `T.ir` abre a categoria de
 * quem acabou de navegar (linha abaixo, propositalmente — é o que mostra
 * onde a pessoa está ao entrar direto num módulo), e sem esta distinção
 * isso reabriria a gaveta sozinha a cada navegação, sem nenhum toque
 * pedindo isso. No celular a gaveta só abre por ação explícita. */
T.atualizarLarguraLateral = function () {
  var mostrar = window.innerWidth > 980
    ? (!!T._expandidaManual || !!T._categoriaAberta)
    : !!T._expandidaManual;
  document.body.classList.toggle("lateral-expandida", mostrar);
};

/** No celular a cápsula expandida é gaveta (ver CSS), não coluna fixa — faz
 * sentido fechar sozinha ao escolher um destino, do jeito que qualquer
 * gaveta de navegação se comporta. No desktop ela empurra o conteúdo e é
 * preferência de quem usa: continua aberta depois de navegar. */
T.fecharLateralMovel = function () {
  if (window.innerWidth > 980) return;
  T._expandidaManual = false;
  T._categoriaAberta = null;
  T.atualizarLarguraLateral();
};

/**
 * As âncoras fixas do rodapé da cápsula (engrenagem, ajuda, avatar) e o "+"
 * do topo. Diferente de T.montarNav, montadas uma vez só no login — o que
 * aparece ali não muda de uma navegação para outra.
 */
T.montarCapsulaFixa = function () {
  T.montarAcaoRapida();
  T.montarConfiguracoes();
  T.montarAjuda();
  T.montarMenuUsuario();
  T.montarExpandirLateral();
  T.ligarRolagemTopo();
};

/** Barra de topo nasce transparente; rolar a página é que revela o vidro
 * (`.topo-rolado`, em estilo.css). Liga uma vez só no login — `.topo` é
 * estrutural (fica fora de `#conteudo`), então o listener não precisa ser
 * religado a cada `T.renderizar()`. */
T.ligarRolagemTopo = function () {
  if (T._rolagemTopoLigada) return;
  T._rolagemTopoLigada = true;
  var topo = document.querySelector(".topo");
  if (!topo) return;
  function aoRolar() {
    topo.classList.toggle("topo-rolado", window.scrollY > 20);
  }
  window.addEventListener("scroll", aoRolar, { passive: true });
  aoRolar();
};

/**
 * Ícone-só é o padrão, mas some com o nome de cada módulo — quem não decorou
 * ainda os ícones fica sem saber que a função está lá. Este botão troca para
 * uma versão larga, com o nome ao lado do ícone (o mesmo texto que já existe
 * na dica, só que fixo em vez de só aparecer no hover). A escolha fica salva.
 */
T.montarExpandirLateral = function () {
  var botao = U.el("btn-expandir");
  var lateral = U.el("lateral");
  var fundo = U.el("lateral-fundo");
  if (!botao || !lateral) return;

  function aplicar(expandida) {
    T._expandidaManual = expandida;
    T.atualizarLarguraLateral();
    botao.setAttribute("aria-pressed", String(expandida));
    botao.setAttribute("aria-label", expandida ? "Recolher menu" : "Expandir menu");
  }

  // No celular a cápsula expandida é gaveta por cima da tela — abrir
  // sozinha ao carregar a página (por causa de uma preferência salva de
  // quando a tela era grande) tampava o conteúdo de cara, sem ação nenhuma
  // de quem estava só voltando pro app. Só restaura a preferência salva
  // em telas largas, onde ela empurra o conteúdo e não atrapalha nada.
  var salvo = null;
  try { salvo = localStorage.getItem("hotel-lateral-expandida"); } catch (e) { /* modo anônimo */ }
  aplicar(salvo === "1" && window.innerWidth > 980);

  botao.addEventListener("click", function () {
    aplicar(!T._expandidaManual);
    try { localStorage.setItem("hotel-lateral-expandida", T._expandidaManual ? "1" : "0"); } catch (e) { /* modo anônimo */ }
  });

  // Fundo escurecido: só existe visualmente no celular (CSS), mas o clique
  // funciona sempre — tocar fora da gaveta é o jeito universal de fechá-la.
  if (fundo) {
    fundo.addEventListener("click", function () { T.fecharLateralMovel(); });
  }
};

/** "+": atalho para os cadastros mais comuns, sem precisar navegar até lá. */
T.montarAcaoRapida = function () {
  var botao = U.el("btn-rapido");
  var painel = U.el("popover-rapido");
  if (!botao || !painel) return;
  var caixa = botao.closest(".lateral-item-caixa");
  var opcoes = [
    { modulo: "funcionarios", acao: "novo-funcionario", nome: "Cadastrar funcionário" },
    { modulo: "contas", acao: "nova-conta", nome: "Lançar conta a pagar" },
    { modulo: "fornecedores", acao: "novo-fornecedor", nome: "Cadastrar fornecedor" },
    { modulo: "contratos", acao: "novo-contrato", nome: "Registrar contrato" },
    { modulo: "solicitacoes", acao: "nova-solicitacao", nome: "Nova solicitação" },
    { modulo: "ferias", acao: "nova-ausencia", nome: "Registrar ausência" }
  ].filter(function (o) { return T.podeEditar() && T.podeVer(o.modulo); });

  if (!opcoes.length) { if (caixa) caixa.style.display = "none"; return; }

  painel.innerHTML = '<div class="capsula-popover-titulo">Ações rápidas</div>' +
    opcoes.map(function (o) {
      return '<button type="button" class="capsula-popover-item" data-acao-rapida="' + o.acao + '">' + U.esc(o.nome) + "</button>";
    }).join("");

  var pop = U.ligarPopoverCapsula(botao, painel);
  U.todos("[data-acao-rapida]", painel).forEach(function (b) {
    b.addEventListener("click", function () {
      pop.fechar();
      var fn = T.acoes[b.dataset.acaoRapida];
      if (fn) fn();
    });
  });
};

/** Engrenagem: Tabelas Legais e Controle de Acesso — configuração de fundo,
 *  não coisa do dia a dia, por isso fora da navegação principal. */
T.montarConfiguracoes = function () {
  var botao = U.el("btn-config");
  var painel = U.el("popover-config");
  if (!botao || !painel) return;
  var caixa = botao.closest(".lateral-item-caixa");
  var itens = T.MODULOS.filter(function (m) { return m.noMenuLateral && T.podeVer(m.chave); });

  if (!itens.length) { if (caixa) caixa.style.display = "none"; return; }

  painel.innerHTML = '<div class="capsula-popover-titulo">Configurações</div>' +
    itens.map(function (m) {
      return '<button type="button" class="capsula-popover-item" data-ir="' + m.chave + '">' + U.esc(m.nome) + "</button>";
    }).join("");

  var pop = U.ligarPopoverCapsula(botao, painel);
  U.todos("[data-ir]", painel).forEach(function (b) {
    b.addEventListener("click", function () { pop.fechar(); T.ir(b.dataset.ir); });
  });
};

/** "?": não existe central de ajuda de verdade no protótipo — em vez de
 *  fingir uma, o popover diz a única coisa que é real: quem decide aqui. */
T.montarAjuda = function () {
  var botao = U.el("btn-ajuda");
  var painel = U.el("popover-ajuda");
  if (!botao || !painel) return;
  painel.innerHTML = '<div class="capsula-popover-titulo">Ajuda</div>' +
    '<p class="capsula-popover-texto">Encontrou um número que não bate ou uma dúvida sobre o sistema? ' +
    "Fale direto com a Direção — aqui toda decisão final passa por quem é dono da escola.</p>";
  U.ligarPopoverCapsula(botao, painel);
};

/**
 * Avatar: quem está logado, e o popover de conta (Minha conta, Preferências,
 * Tema, Sair) — o "Sair" que antes vivia solto na topbar agora mora aqui.
 * Montado uma vez no login: nome e perfil não mudam de uma tela para outra.
 */
T.montarMenuUsuario = function () {
  var botao = U.el("btn-usuario");
  var painel = U.el("usuario-menu");
  if (!botao || !painel) return;

  var nome = U.el("app-nome").textContent;
  var perfil = U.el("app-perfil").textContent;
  var alcada = U.el("app-alcada").textContent;
  var dica = U.el("dica-usuario");
  if (dica) dica.textContent = nome;

  var pop = U.ligarPopoverCapsula(botao, painel);

  painel.innerHTML =
    '<div class="capsula-popover-titulo">' + U.esc(nome) + "</div>" +
    '<p class="capsula-popover-texto" style="padding-top:0">' + U.esc(perfil) + " · aprova " + U.esc(alcada) + "</p>" +
    "<hr>" +
    '<button type="button" class="capsula-popover-item" data-acao-conta="conta">' + U.iconeSvg("usuario", 17) + " Minha conta</button>" +
    '<button type="button" class="capsula-popover-item" data-acao-conta="preferencias">' + U.iconeSvg("fatia", 17) + " Preferências</button>" +
    '<div class="capsula-popover-tema">' +
    '<button type="button" data-tema="claro" aria-pressed="' + (U.temaAtual() === "claro") + '">' + U.iconeSvg("tema", 14) + " Claro</button>" +
    '<button type="button" data-tema="escuro" aria-pressed="' + (U.temaAtual() === "escuro") + '">' + U.iconeSvg("tema", 14) + " Escuro</button>" +
    "</div><hr>" +
    '<button type="button" class="capsula-popover-item" data-acao-conta="sair">' + U.iconeSvg("sair", 17) + " Sair</button>" +
    // Sair comum guarda tudo no navegador para a próxima sessão. Em máquina
    // compartilhada isso deixa a folha inteira acessível a quem sentar
    // depois — daí a segunda saída, que limpa este computador.
    '<button type="button" class="capsula-popover-item" data-acao-conta="sair-limpando">' + U.iconeSvg("sair", 17) + " Sair e apagar deste computador</button>";

  painel.querySelector('[data-acao-conta="conta"]').addEventListener("click", function () {
    pop.fechar();
    U.abrirModal({
      titulo: "Minha conta",
      corpo: '<p class="dica"><strong>' + U.esc(nome) + "</strong><br>" + U.esc(perfil) + " · aprova " + U.esc(alcada) + "</p>",
      acoes: [{ rotulo: "Fechar", classe: "primario", aoClicar: U.fecharModal }]
    });
  });
  painel.querySelector('[data-acao-conta="preferencias"]').addEventListener("click", function () {
    pop.fechar();
    if (T.acoes["personalizar-painel"]) T.acoes["personalizar-painel"]();
  });
  painel.querySelector('[data-acao-conta="sair"]').addEventListener("click", function () {
    pop.fechar();
    if (T.acoes["sair"]) T.acoes["sair"]();
  });
  painel.querySelector('[data-acao-conta="sair-limpando"]').addEventListener("click", function () {
    pop.fechar();
    U.abrirModal({
      titulo: "Sair e apagar deste computador",
      corpo: '<p class="dica">Apaga deste navegador o cadastro, a folha e tudo que foi lançado — inclusive ' +
        "o que você digitou à mão e ainda não está em nenhuma planilha. O que veio das planilhas volta " +
        "no próximo acesso; o resto, não.</p><p class=\"dica\">Use ao sair de um computador compartilhado.</p>",
      acoes: [
        { rotulo: "Cancelar", aoClicar: U.fecharModal },
        { rotulo: "Apagar e sair", classe: "perigo", aoClicar: function () {
          U.fecharModal();
          L.apagarTudo();
          if (T.acoes["sair"]) T.acoes["sair"]();
        } }
      ]
    });
  });
  U.todos("[data-tema]", painel).forEach(function (b) {
    b.addEventListener("click", function () {
      U.aplicarTema(b.dataset.tema, true);
      U.todos("[data-tema]", painel).forEach(function (x) {
        x.setAttribute("aria-pressed", String(x.dataset.tema === b.dataset.tema));
      });
    });
  });
};

T._periodosCarregados = false;
T._carregandoPeriodos = false;

function carregarPeriodosDaApi() {
  if (T._carregandoPeriodos) return;
  T._carregandoPeriodos = true;
  L.api.get("/api/competencias").then(function (lista) {
    L.estado.periodos = (lista || []).map(function (p) {
      return { id: p.id, competencia: p.competencia, status: p.status,
        abertoEm: p.aberto_em, fechadoEm: p.fechado_em,
        fechadoPor: p.fechado_por_nome || null };
    });
    // Virou o mês e ninguém abriu o novo: as telas ficam no mês que ainda
    // está aberto, em vez de num mês sem folha onde nada pode ser lançado.
    if (!L.periodoDe(L.competenciaAberta()) && L.estado.periodos.length) {
      var emAberto = L.estado.periodos.filter(function (p) { return p.status !== "FECHADO"; })
        .sort(function (a, b) { return a.competencia < b.competencia ? 1 : -1; })[0];
      var recente = L.estado.periodos.slice().sort(function (a, b) { return a.competencia < b.competencia ? 1 : -1; })[0];
      L.estado.competencia = (emAberto || recente).competencia;
    }
    T._periodosCarregados = true;
    T._carregandoPeriodos = false;
    T.renderizar();
    T.exigirCompetenciaDoMes();
  }).catch(function (erro) {
    T._carregandoPeriodos = false;
    console.error("Não foi possível carregar competências:", erro);
  });
}

// Só a competência aberta na tela precisa de movimento carregado — trocar de
// mês reflete de novo (mesmo padrão de `T._movimentosCarregadosPara` guardar
// PARA QUAL competência o cache vale, não só se já carregou alguma vez).
T._movimentosCarregadosPara = null;
T._carregandoMovimentos = false;

function carregarMovimentosDaApi(comp) {
  if (T._carregandoMovimentos) return;
  T._carregandoMovimentos = true;
  L.api.get("/api/movimentos?competencia=" + encodeURIComponent(comp)).then(function (lista) {
    L.estado.movimentos = lista || [];
    T._movimentosCarregadosPara = comp;
    T._carregandoMovimentos = false;
    T.renderizar();
  }).catch(function (erro) {
    T._carregandoMovimentos = false;
    console.error("Não foi possível carregar o movimento da competência:", erro);
  });
}

/**
 * Seletor de competência no topo. É o contexto do sistema inteiro: trocar o
 * mês troca a folha, o fechamento e os lançamentos que aparecem.
 */
T.montarCompetencia = function () {
  if (L.USA_BACKEND && !T._periodosCarregados) carregarPeriodosDaApi();
  if (L.USA_BACKEND && T._movimentosCarregadosPara !== L.competenciaAberta()) {
    carregarMovimentosDaApi(L.competenciaAberta());
  }

  var host = U.el("sel-competencia");
  if (!host) return;
  var atual = L.competenciaAberta();
  var lista = L.competenciasConhecidas();
  var proxima = L.proximaCompetencia();

  var importadas = {};
  if (L.DADOS_REAIS && L.DADOS_REAIS.historico) {
    L.DADOS_REAIS.historico.forEach(function (h) { importadas[h.competencia] = true; });
  }

  // O status já aparece no selo ao lado (pastilha logo abaixo) — repeti-lo
  // dentro do botão fechado também era a mesma informação duas vezes. Aqui
  // vira detalhe da lista: some quando fechado, ajuda a escolher quando abre.
  var itens = lista.map(function (c) {
    var marca = L.periodoDe(c) ? "" : (importadas[c] ? "planilha" : "não aberta");
    return { valor: c, rotulo: L.competenciaBR(c), detalhe: marca };
  });
  itens.push({ valor: "__abrir__", rotulo: "+ Abrir " + L.competenciaBR(proxima) });

  // Lista de meses do sistema inteiro: raso o bastante para não precisar de
  // busca, mas continua com desenho próprio — o nativo destoava do resto e
  // desenhava a lista com o cinza cru do sistema operacional.
  host.innerHTML = U.seletorRico({
    rotulo: "Competência em que o sistema está operando", valor: atual, itens: itens,
  });

  T.lembreteCompetencia();
  var p = L.periodoDe(atual);
  var statusEl = U.el("status-competencia");
  if (statusEl) {
    var s = p ? L.STATUS_PERIODO[p.status] : null;
    statusEl.textContent = s ? s.rotulo : "Não aberta";
    statusEl.className = "status-competencia" + (s ? " " + s.tom : "");
  }

  // Fora de #conteudo, então a delegação de T.ligarEventos não alcança —
  // mesmo motivo de T.montarNav religar os próprios cliques a cada remontagem.
  U.ligarSeletores(host, function (valor) {
    if (valor === "__abrir__") {
      T.montarCompetencia(); // devolve o seletor ao valor atual, sem a escolha de abrir
      T.acoes["abrir-competencia"]();
      return;
    }
    L.trocarCompetencia(valor);
    T.montarCompetencia();
    T.renderizar();
  });
};

T.ir = function (destino, alvo) {
  if (!T.podeVer(destino)) destino = "dashboard";
  T.atual = destino;
  T.alvo = alvo || null;
  // Navegar para um módulo de Pessoas/Financeiro/Operação abre a categoria
  // dele no acordeão, para o usuário ver logo onde está — Visão geral não
  // tem categoria, então fecha qualquer acordeão que estivesse aberto.
  var modulo = T.MODULOS.filter(function (m) { return m.chave === destino; })[0];
  T._categoriaAberta = (modulo && T.GRUPOS_ACORDEAO.indexOf(modulo.grupo) !== -1) ? modulo.grupo : null;
  T.montarNav();
  T.renderizar();
  window.scrollTo({ top: 0, behavior: "instant" });
};

T.renderizar = function () {
  var fn = T.telas[T.atual] || T.telas.dashboard;
  U.el("conteudo").innerHTML = fn();
  // `T.alvo` é o "abra JÁ nesta pessoa" de quem navegou até aqui, e vale para
  // ESTE render só. Mantê-lo travava a tela de Folha na pessoa de origem:
  // clicar em outra na tabela mudava o filtro e a tela continuava mostrando a
  // primeira, porque o alvo antigo vencia o clique novo.
  T.alvo = null;
  T.ligarEventos();
  T.montarCompetencia();
  T.mostrarFalhaDeGravacao();
};

/**
 * `L.persistir` engole a exceção do localStorage de propósito — o sistema
 * continua em memória. Mas quem está digitando a folha precisa saber, na hora,
 * que nada está sendo gravado. Sem isto o aviso ficava só numa variável.
 */
T.mostrarFalhaDeGravacao = function () {
  var faixa = U.el("falha-gravacao");
  if (!faixa) return;
  if (!L.avisoPersistencia) { faixa.classList.add("oculto"); return; }
  faixa.innerHTML = '<strong>O trabalho não está sendo salvo neste navegador.</strong> ' +
    U.esc(L.avisoPersistencia) +
    " Enquanto isso, tudo funciona só na memória desta aba: fechar a aba perde o que foi lançado.";
  faixa.classList.remove("oculto");
};

// ---------------------------------------------------------------- competência

/** Lembrete discreto ao lado do seletor: a tela está num mês anterior a hoje. */
T.lembreteCompetencia = function () {
  var el = U.el("lembrete-competencia");
  if (!el) return;
  var vendo = L.competenciaAberta();
  var hoje = L.competenciaAtual();
  if ((L.USA_BACKEND && !T._periodosCarregados) || !vendo || vendo >= hoje) { el.className = "lembrete-competencia oculto"; el.innerHTML = ""; return; }
  var mes = L.competenciaBR(hoje).split(" de ")[0];
  var existe = !!L.periodoDe(hoje);
  var pode = T.podeEditar() && T.temPerfil("DIRECAO", "RH") && L.proximaCompetencia() === hoje;
  var acao = existe ? "ir-competencia-atual" : (pode ? "abrir-competencia" : "");
  var texto = existe ? "Ir para " + mes : (pode ? "Abrir " + mes : "Já é " + mes);
  el.className = "lembrete-competencia";
  el.innerHTML = '<button type="button" ' + (acao ? 'data-lembrete="' + acao + '"' : "disabled") +
    ' title="Você está em ' + U.esc(L.competenciaBR(vendo)) + ", mas hoje já é " + U.esc(L.competenciaBR(hoje)) +
    '. Confira se o lançamento é do mês certo."><span class="ponto"></span>' + U.esc(texto) + "</button>";
  var b = el.querySelector("button[data-lembrete]");
  if (b) b.onclick = function () { T.acoes[b.getAttribute("data-lembrete")](); };
};

T.acoes["dispensar-aviso-competencia"] = function () {};

/**
 * Virou o mês: o sistema não deixa seguir no mês anterior sem querer.
 *  • Se o mês atual já está aberto, troca para ele sozinho (avisando).
 *  • Se ainda não foi aberto, Direção/RH recebem um aviso que só fecha
 *    escolhendo: abrir o mês agora, ou dizer que ainda estão fechando o
 *    anterior (fica valendo só nesta aba; ao entrar de novo, pergunta de novo).
 * Não trava a folha do mês anterior: quem está fechando setembro continua.
 */
T.exigirCompetenciaDoMes = function () {
  if (!L.USA_BACKEND || !L.estado.usuario || !T._periodosCarregados) return;
  var hoje = L.competenciaAtual();
  var vendo = L.competenciaAberta();
  if (!vendo || vendo >= hoje) return;
  var chave = "hotel.seguirNoMes." + hoje;
  var seguir = null;
  try { seguir = sessionStorage.getItem(chave); } catch (e) { /* sem armazenamento: pergunta de novo */ }
  if (seguir === vendo) return;
  if (L.periodoDe(hoje)) {
    L.trocarCompetencia(hoje);
    T._movimentosCarregadosPara = null;
    T.renderizar();
    U.avisar("Mudamos para " + L.competenciaBR(hoje) + ", o mês atual. Para mexer em " + L.competenciaBR(vendo) + ", troque no seletor do topo.");
    return;
  }
  var pode = T.podeEditar() && T.temPerfil("DIRECAO", "RH") && L.proximaCompetencia() === hoje;
  if (!pode || U.el("camada-modal").querySelector(".cortina")) return;
  var mes = L.competenciaBR(hoje), ant = L.competenciaBR(vendo);
  U.abrirModal({
    titulo: "Já é " + mes,
    sub: "Escolha antes de continuar",
    obrigatorio: true,
    corpo: '<p style="margin:0 0 10px;line-height:1.6">O mês virou e a competência de <strong>' + U.esc(mes) +
      "</strong> ainda não foi aberta. O sistema está em <strong>" + U.esc(ant) + "</strong>.</p>" +
      '<p style="margin:0;color:var(--tinta-media);line-height:1.6">Lançamento de ' + U.esc(mes) +
      " feito em " + U.esc(ant) + " vai para a folha errada. Abra o mês novo — ou, se ainda está fechando " +
      U.esc(ant) + ", diga isso para continuar nele.</p>",
    acoes: [
      { rotulo: "Ainda estou fechando " + ant.split(" de ")[0], esquerda: true, aoClicar: function () {
        try { sessionStorage.setItem(chave, vendo); } catch (e) { /* segue só nesta tela */ }
        U.fecharModal();
        U.avisar("Continuando em " + ant + ". Quando terminar, abra " + mes + " pelo topo.");
      } },
      { rotulo: "Abrir " + mes.split(" de ")[0], classe: "primario", aoClicar: function () {
        U.fecharModal();
        T._exigindoComp = true;
        T.acoes["abrir-competencia"]();
      } }
    ]
  });
};

T.acoes["ir-competencia-atual"] = function () {
  L.trocarCompetencia(L.competenciaAtual());
  T._movimentosCarregadosPara = null;
  T.renderizar();
};

T.acoes["abrir-competencia"] = function () {
  var proxima = L.proximaCompetencia();
  var anterior = L.somarMeses(proxima, -1);
  // Em modo servidor não dá pra prever quantos lançamentos existem em
  // `anterior` sem uma ida ao banco — `L.estado.movimentos` só tem o que já
  // foi carregado pra tela atual, não necessariamente o mês anterior. Em vez
  // de arriscar um número que pode estar errado (e o modal já prometeu "vou
  // copiar X" antes de o servidor sequer ter sido consultado), o aviso fica
  // genérico aqui; a contagem real vem do próprio servidor depois de abrir.
  var quantos = L.USA_BACKEND ? null : L.estado.movimentos.filter(function (m) {
    return m.competencia === anterior;
  }).length;

  U.abrirModal({
    titulo: "Abrir " + L.competenciaBR(proxima),
    sub: "Novo ciclo mensal",
    corpo:
      '<ul class="abrir-comp">' +
      "<li><strong>Vem de " + U.esc(L.competenciaBR(anterior)) + ":</strong> carga extra semanal, aulas e horas noturnas, vale-transporte e pensão.</li>" +
      "<li><strong>Começa zerado:</strong> faltas, aulas avulsas, substituições e horas extras.</li>" +
      "<li><strong>Não muda:</strong> salário, hora-aula e carga do cadastro.</li>" +
      "</ul>" +
      (quantos === 0 ? '<p style="margin:12px 0 0;color:var(--tinta-media)">Nada lançado em ' +
        U.esc(L.competenciaBR(anterior)) + ": o mês abre só com o cadastro.</p>" : ""),
    acoes: [
      { rotulo: "Cancelar", aoClicar: function () {
        U.fecharModal(); T.montarCompetencia();
        // Veio do aviso obrigatório: cancelar volta para a escolha.
        if (T._exigindoComp) { T._exigindoComp = false; T.exigirCompetenciaDoMes(); }
      } },
      { rotulo: "Abrir competência", classe: "primario", aoClicar: function () {
        T._exigindoComp = false;
        if (L.USA_BACKEND) {
          L.api.post("/api/competencias", { competencia: proxima, tipoFolha: "MENSAL" }).then(function (periodo) {
            L.trocarCompetencia(proxima);
            T._periodosCarregados = false;
            T._movimentosCarregadosPara = null;
            U.fecharModal();
            T.ir("fechamento");
            var copiados = periodo && periodo.movimentosCopiados;
            U.avisar(L.competenciaBR(proxima) + " aberta" +
              (copiados ? " com " + copiados + " lançamento(s) copiado(s) de " + L.competenciaBR(anterior) + "." : "."));
          }).catch(function (erro) {
            U.avisar(erro.message || "Não foi possível abrir a competência.");
          });
          return;
        }
        L.abrirCompetencia(proxima);
        U.fecharModal();
        T.ir("fechamento");
        U.avisar(L.competenciaBR(proxima) + " aberta" +
          (quantos > 0 ? " com " + quantos + " lançamento(s) copiado(s)." : "."));
      } }
    ]
  });
};

function abrirModalFecharCompetencia(comp, comDivergencia) {
  U.abrirModal({
    titulo: "Fechar " + L.competenciaBR(comp),
    sub: "A competência para de aceitar alteração",
    corpo:
      "<p style=\"margin:0 0 14px;color:var(--tinta-media)\">" +
      "Fechada, a competência congela: lançamento, folha e valores param de " +
      "mudar. No sistema em produção o próprio banco recusa a alteração.</p>" +
      (comDivergencia > 0
        ? '<div class="aviso-tela" style="margin:0;background:var(--vermelho-fundo);border-color:var(--vermelho)">' +
          '<span aria-hidden="true">!</span><div><strong>' + comDivergencia +
          " funcionário(s) com divergência.</strong> Vale resolver antes de fechar.</div></div>"
        : '<div class="aviso-tela" style="margin:0"><span aria-hidden="true">✓</span><div>' +
          "Nenhuma divergência aberta nesta competência.</div></div>"),
    acoes: [
      { rotulo: "Cancelar", aoClicar: U.fecharModal },
      { rotulo: "Fechar competência", classe: "primario", aoClicar: function () {
        if (L.USA_BACKEND) {
          L.api.post("/api/folha/" + comp + "/fechar").then(function () {
            T._periodosCarregados = false;
            carregarPeriodosDaApi();
            U.fecharModal();
            T.renderizar();
            U.avisar(L.competenciaBR(comp) + " fechada.");
          }).catch(function (erro) {
            U.avisar(erro.message || "Não foi possível fechar a competência.");
          });
          return;
        }
        L.fecharCompetencia(comp);
        U.fecharModal();
        T.renderizar();
        U.avisar(L.competenciaBR(comp) + " fechada.");
      } }
    ]
  });
}

// Grava o cálculo oficial de todos, sem fechar nada. Fechar a competência já
// recalcula sozinho; este botão serve para conferir antes (ou depois de mudar
// cadastro/movimento), sem precisar abrir o fechamento.
T.acoes["calcular-folha"] = function () {
  var comp = L.competenciaAberta();
  if (!L.USA_BACKEND) { U.avisar("O cálculo oficial só existe no sistema online."); return; }
  if (L.periodoFechado(comp)) { U.avisar("Competência fechada: reabra antes de calcular."); return; }
  if (T._calculandoFolha) return;
  T._calculandoFolha = true;
  U.avisar("Calculando a folha de " + L.competenciaBR(comp) + "…");
  L.api.post("/api/folha/" + comp + "/calcular").then(function (r) {
    T._calculandoFolha = false;
    var p = L.periodoDe(comp);
    if (p) { p.status = r.status; p.folhaApurada = null; }
    L.versao++;
    T.renderizar();
    U.avisar("Folha calculada: " + r.calculados + " pessoa(s)" +
      (r.comDivergencia ? ", " + r.comDivergencia + " com divergência." : ", sem divergência.") +
      (r.semContrato && r.semContrato.length ? " " + r.semContrato.length + " sem contrato CLT (MEI/PJ são pagos à parte)." : ""));
  }).catch(function (e) {
    T._calculandoFolha = false;
    U.avisar((e && e.message) || "Não foi possível calcular a folha.");
  });
};

T.acoes["fechar-competencia"] = function () {
  if (!L.podeExecutarReservada("fechar-competencia", L.estado.usuario)) {
    U.avisar(L.ACOES_RESERVADAS["fechar-competencia"]);
    return;
  }
  var comp = L.competenciaAberta();

  if (L.USA_BACKEND) {
    // Calcula (grava o resultado oficial de cada um) antes de mostrar o
    // modal — a contagem de divergência que aparece ali precisa ser a do
    // servidor, não da prévia local, porque é o que de fato decide se
    // "Fechar competência" abaixo vai ser aceito ou recusado.
    L.api.post("/api/folha/" + comp + "/calcular").then(function (resultado) {
      abrirModalFecharCompetencia(comp, resultado.comDivergencia || 0);
    }).catch(function (erro) {
      U.avisar(erro.message || "Não foi possível calcular a folha desta competência.");
    });
    return;
  }

  var p = L.periodoDe(comp);
  if (!p) { U.avisar("Esta competência ainda não foi aberta."); return; }

  var comDivergencia = L.ativos().filter(function (f) {
    return L.calcular(f, comp).avisos.some(function (a) { return a.nivel === "divergencia"; });
  }).length;
  abrirModalFecharCompetencia(comp, comDivergencia);
};

T.acoes["reabrir-competencia"] = function () {
  if (!L.podeExecutarReservada("reabrir-competencia", L.estado.usuario)) {
    U.avisar(L.ACOES_RESERVADAS["reabrir-competencia"]);
    return;
  }
  var comp = L.competenciaAberta();
  var p = L.periodoDe(comp);
  var quantas = (p && p.historico ? p.historico.length : 0);

  U.abrirModal({
    titulo: "Reabrir " + L.competenciaBR(comp) + "?",
    sub: "a folha desta competência já foi apurada e fechada",
    corpo:
      '<div class="aviso-tela"><span aria-hidden="true">▲</span><div>' +
      "<strong>Esta folha pode já ter sido paga e enviada à contabilidade.</strong> " +
      "Reabrir faz os valores voltarem a ser calculados pelo cadastro atual, e o que estava apurado " +
      "fica guardado no histórico da competência." +
      (quantas ? " Esta competência já foi reaberta " + quantas + "× antes." : "") +
      "</div></div>" +
      '<label class="campo"><span>Por que precisa reabrir</span>' +
      '<textarea id="motivo-reabrir" placeholder="Ex.: lançamento de 12 aulas extras da professora X não entrou antes do fechamento."></textarea>' +
      '<span class="dica">Fica na trilha de auditoria, com o seu nome.</span>' +
      '<span class="erro oculto" id="erro-motivo-reabrir"></span></label>',
    acoes: [
      { rotulo: "Cancelar", aoClicar: U.fecharModal },
      { rotulo: "Reabrir competência", classe: "perigo", aoClicar: function () {
        var motivo = U.el("motivo-reabrir").value;
        if (L.USA_BACKEND) {
          L.api.post("/api/competencias/" + comp + "/reabrir", { motivo: motivo }).then(function () {
            T._periodosCarregados = false;
            carregarPeriodosDaApi();
            U.fecharModal();
            T.renderizar();
            U.avisar(L.competenciaBR(comp) + " reaberta. O motivo e o seu nome ficaram na trilha.");
          }).catch(function (erro) {
            var elErro = U.el("erro-motivo-reabrir");
            if (elErro) { elErro.textContent = erro.message || "Não foi possível reabrir."; elErro.classList.remove("oculto"); }
          });
          return;
        }
        var r = L.reabrirCompetencia(comp, motivo);
        if (!r.ok) {
          var erro = U.el("erro-motivo-reabrir");
          erro.textContent = r.erro;
          erro.classList.remove("oculto");
          return;
        }
        U.fecharModal();
        T.renderizar();
        U.avisar(L.competenciaBR(comp) + " reaberta. O motivo e o seu nome ficaram na trilha.");
      } }
    ]
  });
};

/** Delegação: cada render reconstrói o HTML, então os handlers vêm daqui. */
T.ligarEventos = function () {
  var raiz = U.el("conteudo");
  U.todos("[data-busca-lista]", raiz).forEach(function (campo) {
    var lista = campo.closest(".lista-pesquisavel");
    var linhas = U.todos("tbody tr", lista);
    var contagem = lista.querySelector(".lista-busca-contagem");
    var vazio = lista.querySelector(".lista-sem-resultados");
    function normalizar(texto) {
      return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }
    campo.addEventListener("input", function () {
      var termo = normalizar(campo.value.trim());
      var visiveis = 0;
      linhas.forEach(function (linha) {
        var valores = U.todos('td[data-rotulo]:not([data-rotulo=""])', linha)
          .map(function (celula) { return celula.textContent; }).join(" ");
        linha.hidden = !normalizar(valores).includes(termo);
        if (!linha.hidden) visiveis++;
      });
      contagem.textContent = visiveis + " de " + linhas.length + " registros";
      vazio.hidden = visiveis !== 0;
    });
  });
  U.todos("[data-ir]", raiz).forEach(function (b) {
    b.addEventListener("click", function () { T.ir(b.dataset.ir, b.dataset.alvo); });
  });
  // `aoClicarLinha` marcava a linha como clicável e estilizava o hover, mas
  // ninguém escutava o clique: a linha parecia interativa e não fazia nada.
  U.todos("tr.clicavel", raiz).forEach(function (tr) {
    tr.addEventListener("click", function (ev) {
      // Botão dentro da linha tem ação própria; a linha não rouba o clique.
      if (ev.target.closest("button, a, input, select")) return;
      if (T.atual === "funcionarios") { T.acoes["ficha-funcionario"](tr.dataset.linha); return; }
      T.filtros.folhaFuncionario = tr.dataset.linha;
      T.renderizar();
      // O detalhe fica abaixo de 43 linhas: sem levar a vista até ele, o
      // clique troca o conteúdo fora do campo de visão e parece não funcionar.
      var detalhe = U.el("detalhe-folha");
      if (detalhe) detalhe.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  });
  U.todos("[data-categoria]", raiz).forEach(function (b) {
    b.addEventListener("click", function () {
      T.filtros.categoria = b.dataset.categoria;
      // Filtro de módulo não faz sentido em colaborador: some junto.
      if (b.dataset.categoria === "COLABORADOR") T.filtros.modulo = "";
      T.renderizar();
    });
  });
  // Abas genéricas de filtro: o atributo diz QUAL filtro muda (hoje só o
  // relatório geral usa, para trocar entre Executivo/Operacional/Analítico
  // sem precisar de um handler novo por tela).
  U.todos("[data-filtro-aba]", raiz).forEach(function (b) {
    b.addEventListener("click", function () {
      T.filtros[b.dataset.filtroAba] = b.dataset.valor;
      T.renderizar();
    });
  });
  // Um seletor rico só, três usos diferentes — o que ele faz depende do
  // atributo que a tela colocou no invólucro ao montar (ver U.seletorRico):
  // filtro de tela, edição de perfil por linha, ou (sem nenhum atributo) a
  // troca de funcionário em exibição na folha.
  U.ligarSeletores(raiz, function (valor, caixa) {
    if (caixa.dataset.acaoInline === "perfil") {
      L.definirPerfilUsuario(caixa.dataset.usuario, valor);
      T.renderizar();
      U.avisar("Perfil atualizado.");
      return;
    }
    if (caixa.dataset.filtro) {
      T.filtros[caixa.dataset.filtro] = valor;
      T.renderizar();
      return;
    }
    T.filtros.folhaFuncionario = valor;
    T.renderizar();
    var detalhe = U.el("detalhe-folha");
    if (detalhe) detalhe.scrollIntoView({ block: "start", behavior: "smooth" });
  });
  U.todos("[data-ir-competencia]", raiz).forEach(function (b) {
    b.addEventListener("click", function () {
      L.trocarCompetencia(b.dataset.irCompetencia);
      T.montarCompetencia();
      T.renderizar();
    });
  });
  U.todos("[data-acao]", raiz).forEach(function (b) {
    b.addEventListener("click", function () {
      var fn = T.acoes[b.dataset.acao];
      if (!fn) return;
      // Rede final: uma invariante violada ou um erro inesperado vira aviso
      // legível, não um botão que simplesmente não faz nada.
      try {
        fn(b.dataset.id, b);
      } catch (e) {
        U.avisar(e && e.message ? e.message : "Não foi possível concluir a ação.");
      }
    });
  });
  // Só campo de texto de verdade: os filtros que eram `<select>` viraram
  // seletor rico (atributo `data-filtro` no invólucro, ligado acima) — sem
  // este filtro, o `input` genérico religava de novo em cima do invólucro,
  // que não dispara esse evento, mas também não deveria nem ser tentado.
  U.todos("input[data-filtro]", raiz).forEach(function (campo) {
    campo.addEventListener("input", function () {
      T.filtros[campo.dataset.filtro] = campo.value;
      T.renderizar();
      var refoco = document.querySelector('[data-filtro="' + campo.dataset.filtro + '"]');
      if (refoco) { refoco.focus(); refoco.selectionStart = refoco.selectionEnd = refoco.value.length; }
    });
  });
};

/**
 * Faixa fixa na versão de demonstração. Sem ela, quem abre o link e não vê os
 * professores da escola conclui que o sistema perdeu os dados — aconteceu três
 * vezes. O arquivo diz o que é, em vez de alguém ter de lembrar.
 */
T.faixaDemonstracao = function () {
  if (!L.DADOS_REAIS || !L.DADOS_REAIS.demonstracao) return "";
  return '<div class="faixa-demo" role="note">' +
    "<strong>Demonstração</strong><span> · " +
    L.DADOS_REAIS.professores.length + " professores fictícios. Sem dados reais.</span>" +
    "</div>";
};

T.cabecalho = function (titulo, texto, acoes) {
  var modulo = T.MODULOS.filter(function (m) { return m.chave === T.atual; })[0];
  var grupo = modulo ? modulo.grupo : "Gestão";
  return T.faixaDemonstracao() +
    '<div class="cabecalho"><div class="cabecalho-titulos"><span class="pagina-grupo">' + U.esc(grupo) + '</span><h1>' + U.esc(titulo) + "</h1>" +
    (texto ? "<p>" + U.esc(texto) + "</p>" : "") + "</div>" +
    (acoes && T.podeEditar() ? '<div class="cabecalho-acoes">' + acoes + "</div>" : "") + "</div>";
};

T.botaoNovo = function (acao, rotulo) {
  return '<button class="botao primario" data-acao="' + acao + '">' + U.esc(rotulo) + "</button>";
};

/**
 * Aviso para as telas cujo cadastro ainda só grava em `L.criar`/`L.atualizar`
 * puro — sem rota de API por trás (ao contrário de Funcionários, que passou
 * a gravar de verdade). Sem isto, alguém lança uma conta/contrato/solicitação
 * aqui, o sistema confirma "salvo", e o dado nunca sai do navegador: some
 * ao trocar de aparelho, sumiu se outra pessoa reabrir o sistema depois, e não
 * é o que qualquer perfil autorizado veria — a mesma armadilha que existia
 * em Funcionários antes de ligar a API real.
 */
T.avisoSemPersistenciaReal = function () {
  if (!L.USA_BACKEND) return "";
  return '<div class="aviso-tela" style="background:var(--vermelho-fundo);border-color:rgba(158,36,56,.28)">' +
    '<span aria-hidden="true">▲</span><div><strong>Ainda não grava no servidor.</strong> ' +
    "O que você lançar aqui fica só neste navegador — não está na base real, some ao trocar de aparelho " +
    "ou limpar dados do site, e ninguém mais vê. Use para conferir a tela, não para lançar dado real ainda." +
    "</div></div>";
};

/**
 * Abas de categoria. Professor e colaborador são duas folhas com regras
 * diferentes — um é pago por hora-aula e tem carga por módulo, o outro tem
 * salário e jornada. Numa lista só, metade das colunas nunca se aplica à
 * linha que se está olhando.
 */
T.abasCategoria = function () {
  var atual = T.filtros.categoria || "";
  var opcoes = [{ chave: "", nome: "Todos", quantos: L.ativos().length }];
  Object.keys(L.CATEGORIAS).forEach(function (c) {
    opcoes.push({ chave: c, nome: L.CATEGORIAS[c].plural, quantos: L.daCategoria(c).length });
  });
  // Uma categoria vazia não vira aba: escola sem colaborador cadastrado não
  // precisa de uma aba para dizer isso.
  var visiveis = opcoes.filter(function (o) { return o.chave === "" || o.quantos > 0; });
  if (visiveis.length <= 2) return "";

  return '<div class="abas-categoria" role="tablist">' + visiveis.map(function (o) {
    return '<button role="tab" class="aba-categoria" data-categoria="' + o.chave + '"' +
      ' aria-selected="' + (o.chave === atual) + '">' +
      U.esc(o.nome) + '<span class="conta">' + o.quantos + "</span></button>";
  }).join("") + "</div>";
};

/**
 * Diagnóstico do mês em UMA linha: só o que está fora do lugar aparece de
 * cara, e o detalhe fica atrás de um clique. Antes eram quatro painéis
 * empilhados antes da lista — a conferência virava a tela, e a lista, rodapé.
 */
T.resumoConferenciaHtml = function () {
  var c = L.conferenciaAulas();
  var p = L.pendenciasCadastro();
  if (c.totalPrevisto === null && p.total === 0) return "";

  var alertas = [];
  if (c.totalPrevisto !== null && !c.bate) {
    var faltando = c.linhas.filter(function (l) { return l.diferenca < 0; });
    var sobrando = c.linhas.filter(function (l) { return l.diferenca > 0; });
    faltando.forEach(function (l) {
      alertas.push(Math.abs(l.diferenca) + " de " + l.segmento + " sem professor");
    });
    sobrando.forEach(function (l) {
      alertas.push("+" + l.diferenca + " em " + l.segmento + " além do previsto");
    });
  }
  if (p.semVinculo.length) alertas.push(p.semVinculo.length + " sem código de vínculo");
  if (p.semEmpresa.length) alertas.push(p.semEmpresa.length + " sem empresa");

  var resumo = c.totalPrevisto !== null
    ? "<strong>" + c.totalReal + "</strong> de " + c.totalPrevisto + " aulas previstas"
    : "";

  if (!alertas.length) {
    return '<p class="conferencia-linha ok">' + resumo + " — tudo confere.</p>";
  }

  var detalhe = "";
  if (c.totalPrevisto !== null) {
    detalhe += '<div class="det-bloco"><span class="det-titulo">Aulas por módulo</span>' +
      c.linhas.map(function (l) {
        return '<div class="det-linha' + (l.diferenca === 0 ? "" : " fora") + '">' +
          U.esc(l.segmento) + '<span class="num">' + l.real + " / " + l.previsto + "</span></div>";
      }).join("") + "</div>";
  }
  function nomes(titulo, lista, dica) {
    if (!lista.length) return "";
    return '<div class="det-bloco"><span class="det-titulo">' + U.esc(titulo) + "</span>" +
      '<div class="det-nomes">' + lista.map(function (f) { return U.esc(f.nome); }).join(" · ") + "</div>" +
      '<div class="det-dica">' + U.esc(dica) + "</div></div>";
  }
  detalhe += nomes("Sem empresa", p.semEmpresa, "Não se sabe qual CNPJ paga.");
  detalhe += nomes("Sem código de vínculo", p.semVinculo, "Não se sabe se tem Ticket ou MEI.");

  return '<details class="conferencia"><summary>' +
    '<span class="marcador" aria-hidden="true"></span>' +
    (resumo ? resumo + " · " : "") + U.esc(alertas.join(" · ")) +
    "</summary>" + '<div class="conferencia-detalhe">' + detalhe + "</div></details>";
};

/**
 * As observações do mês, editáveis. A escola já mantinha isso na planilha
 * ("Gerciandra assumiu as aulas da Verônica em 10/08") e é o único registro
 * de POR QUE a carga de alguém mudou no meio da competência. Trazido para
 * dentro do sistema — e editável, porque a legenda muda todo mês.
 */
T.observacoesHtml = function () {
  // Ainda não há rota no servidor para gravar observações: no modo com banco
  // o que fosse anotado aqui sumiria ao recarregar. Fica oculto até existir.
  if (L.USA_BACKEND) return "";
  var comp = L.competenciaAberta();
  var obs = L.observacoesDe(comp);
  var podeEditar = T.podeEditar();

  var corpo = obs.length
    ? '<ol class="observacoes">' + obs.map(function (o, i) {
        return "<li>" +
          '<span class="obs-rotulo">' + (i + 1) + "</span>" +
          '<span class="obs-texto">' + U.esc(o.texto) + "</span>" +
          (podeEditar
            ? '<span class="obs-acoes">' +
              '<button class="botao miudo" data-acao="editar-observacao" data-id="' + o.id + '">Editar</button>' +
              '<button class="botao miudo perigo" data-acao="excluir-observacao" data-id="' + o.id + '">Excluir</button>' +
              "</span>"
            : "") +
          "</li>";
      }).join("") + "</ol>"
    : (function () {
        var outra = L.competenciaComObservacao(comp);
        return '<p class="obs-vazio">Nada registrado em ' + U.esc(L.competenciaBR(comp)) + ". " +
          (outra
            ? 'Há anotações em <button class="ligacao" data-ir-competencia="' + outra + '">' +
              U.esc(L.competenciaBR(outra)) + "</button>."
            : "Anote aqui o que mudou no mês: quem assumiu aula de quem, quem entrou, quem saiu.") +
          "</p>";
      })();

  return '<div class="painel"><div class="painel-topo"><h2>Observações do mês</h2>' +
    '<span class="contexto">' + U.esc(L.competenciaBR(comp)) +
    (L.USA_BACKEND ? " · ainda não grava no servidor" : "") + "</span>" +
    (podeEditar
      ? '<button class="botao miudo" data-acao="nova-observacao" style="margin-left:auto">Adicionar</button>'
      : "") +
    '</div><div class="painel-corpo">' + corpo + "</div></div>";
};

T.acoes["nova-observacao"] = function () {
  U.abrirFormulario({
    titulo: "Nova observação",
    sub: L.competenciaBR(L.competenciaAberta()),
    campos: [{ id: "texto", rotulo: "O que aconteceu", tipo: "textarea", obrigatorio: true,
      dicaCampo: "Ex.: quem assumiu aula de quem, quem entrou, quem saiu" }],
    rotuloSalvar: "Registrar",
    aoSalvar: function (v) {
      L.adicionarObservacao(v.texto);
      U.fecharModal();
      T.renderizar();
    }
  });
};

T.acoes["editar-observacao"] = function (id) {
  var o = L.buscarPorId("observacoes", id);
  if (!o) return;
  U.abrirFormulario({
    titulo: "Editar observação",
    sub: L.competenciaBR(o.competencia),
    campos: [{ id: "texto", rotulo: "O que aconteceu", tipo: "textarea", obrigatorio: true }],
    valores: { texto: o.texto },
    aoSalvar: function (v) {
      L.editarObservacao(id, v.texto);
      U.fecharModal();
      T.renderizar();
    }
  });
};

T.acoes["excluir-observacao"] = function (id) {
  var o = L.buscarPorId("observacoes", id);
  if (!o) return;
  U.abrirModal({
    titulo: "Excluir esta observação?",
    corpo: '<p class="dica">' + U.esc(o.texto) + "</p>",
    acoes: [
      { rotulo: "Cancelar", aoClicar: U.fecharModal },
      { rotulo: "Excluir", classe: "perigo", aoClicar: function () {
        L.excluirObservacao(id);
        U.fecharModal();
        T.renderizar();
      } }
    ]
  });
};

// ---------------------------------------------------------------- dashboard

T.CONFIG_INICIAL = function () {
  var e = L.estado;
  return [
    { titulo: "Criar a sua conta de acesso", detalhe: "Feito. Os demais gestores criam a sua própria.", pronto: true },
    { titulo: "Cadastrar e conferir as tabelas de INSS e IRRF do exercício",
      detalhe: "Sem tabela vigente e conferida o cálculo roda, mas a folha não fecha.",
      pronto: L.pendenciaTabelas(L.estado.competencia).length === 0, acao: "conferir-tabelas" },
    { titulo: "Cadastrar funcionários e professores", detalhe: "Regime, carga e valor da hora-aula de cada um.", pronto: e.funcionarios.length > 0, acao: "novo-funcionario" },
    { titulo: "Cadastrar fornecedores", detalhe: "Quem a escola paga todo mês.", pronto: e.fornecedores.length > 0, acao: "novo-fornecedor" },
    { titulo: "Lançar as contas a pagar", detalhe: "A partir daqui o dashboard passa a ter conteúdo.", pronto: e.contas.length > 0, acao: "nova-conta" },
    { titulo: "Registrar os contratos recorrentes", detalhe: "Para receber alerta antes de cada vencimento.", pronto: e.contratos.length > 0, acao: "novo-contrato" }
  ];
};

/** Segue o relógio de quem está usando, não um horário fixo do servidor. */
T.saudacao = function () {
  var h = new Date().getHours();
  if (h < 5) return "Boa noite";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
};

// Recados deixados para quem entrou (tabela `notifications`): ficam no topo
// do painel até a pessoa clicar em "Entendi".
T.recadosHtml = function () {
  return (T._recados || []).map(function (r) {
    return '<div class="faixa-aviso recado-painel ' + (r.severidade === "ATENCAO" ? "atencao" : "info") + '" role="status">' +
      '<div class="recado-texto"><strong>' + U.esc(r.titulo) + "</strong>" +
      (r.detalhe ? "<p>" + U.esc(r.detalhe).replace(/\n/g, "<br>") + "</p>" : "") + "</div>" +
      '<button class="botao primario miudo" data-acao="recado-lido" data-id="' + U.esc(r.id) + '">Entendi</button></div>';
  }).join("");
};

T.acoes["recado-lido"] = function (id) {
  T._recados = (T._recados || []).filter(function (r) { return r.id !== id; });
  T.renderizar();
  L.api.post("/api/recados/" + id + "/lido", {}).catch(function () { /* volta na próxima entrada */ });
};

T.telas.dashboard = function () {
  // `L.alertas()` inclui divergência de folha, que agora também depende de
  // CCT/salário mínimo carregados — mesmo motivo do gate em `T.telas.folha`.
  if (L.USA_BACKEND && !T._tabelasCarregadas) carregarTabelasDaApi();

  var e = L.estado;
  var vazio = e.funcionarios.length === 0 && e.contas.length === 0;
  var alertas = L.alertas().filter(function (a) { return T.podeVer(a.destino); });
  // Não é "hoje": é a competência que está de fato aberta no seletor do
  // topo. Usar L.competenciaAtual() aqui fazia o dashboard mostrar sempre o
  // mês do calendário, ainda que a pessoa tivesse aberto e estivesse
  // trabalhando numa competência diferente (futura ou passada) — cabeçalho
  // dizendo "setembro" com KPI calculado em cima de dezembro.
  var comp = L.competenciaAberta();

  var contasMes = L.contasDoMes(comp);
  var totalMes = contasMes.reduce(function (a, c) { return a + c.valor; }, 0);
  var pago = contasMes.filter(function (c) { return c.status === "PAGO"; })
    .reduce(function (a, c) { return a + c.valor; }, 0);
  var proximas = e.contas.filter(function (c) {
    var d = L.diasAte(c.vencimento);
    return c.status !== "PAGO" && c.status !== "CANCELADO" && d !== null && d >= 0 && d <= 7;
  });
  var aguardando = e.contas.filter(function (c) { return c.status === "AGUARDANDO_APROVACAO"; });
  var negativos = L.ativos().filter(function (f) { return L.saldoBanco(f.id) < 0; });
  var vencendo = e.contratos.filter(function (c) {
    var d = L.diasAte(c.fim);
    return c.status === "ATIVO" && d !== null && d >= 0 && d <= 90;
  });

  var kpis = [
    { id: "kpi-pagar7", rotulo: "A pagar em 7 dias", destino: "contas",
      valor: proximas.length ? L.brl(proximas.reduce(function (a, c) { return a + c.valor; }, 0)) : "—",
      vazio: !proximas.length, tom: proximas.length ? "atencao" : "",
      nota: proximas.length ? proximas.length + " conta(s)" : "Nada vencendo esta semana" },
    { id: "kpi-contasMes", rotulo: "Contas do mês", destino: "fechamento",
      valor: contasMes.length ? L.brl(totalMes) : "—", vazio: !contasMes.length,
      nota: contasMes.length ? L.brl(pago) + " já pago" : "Sem contas na competência" },
    { id: "kpi-folha", rotulo: "Folha estimada", destino: "folha", hero: false,
      valor: e.funcionarios.length ? L.brl(L.folhaEstimada()) : "—", vazio: !e.funcionarios.length,
      nota: e.funcionarios.length ? (L.impostosPelaContabilidade() ? "Custo total da folha" : "Custo total com encargos") : "Sem funcionários cadastrados" },
    { id: "kpi-aprovacao", rotulo: "Aguardando aprovação", destino: "aprovacoes",
      valor: aguardando.length + T.contadores().aprovacoes,
      vazio: !(aguardando.length + T.contadores().aprovacoes),
      tom: aguardando.length ? "atencao" : "",
      nota: aguardando.length ? L.brl(aguardando.reduce(function (a, c) { return a + c.valor; }, 0)) + " em pagamentos" : (T.contadores().aprovacoes ? "Solicitações para revisar" : "Nenhuma pendência") },
    { id: "kpi-banco", rotulo: "Banco de horas negativo", destino: "banco",
      valor: negativos.length || "—", vazio: !negativos.length,
      tom: negativos.some(function (f) { return L.saldoBanco(f.id) <= -600; }) ? "critico" : "",
      nota: negativos.length ? "funcionário(s) devendo horas" : "Ninguém com saldo devedor" },
    { id: "kpi-contratos", rotulo: "Contratos vencendo", destino: "contratos",
      valor: vencendo.length || "—", vazio: !vencendo.length,
      tom: vencendo.length ? "atencao" : "",
      nota: vencendo.length ? "nos próximos 90 dias" : "Nenhum vencimento próximo" }
  ];

  var html = '<div class="tela-dashboard">' + T.cabecalho(
    "Visão geral",
    vazio
      ? "Cadastre o primeiro funcionário e a primeira conta para esta tela ganhar conteúdo."
      : T.saudacao() + ", " + L.estado.usuario.nome.split(" ")[0] + ". Acompanhe as prioridades de " + L.competenciaBR(comp) + ".",
    '<button class="botao" data-acao="personalizar-painel">Personalizar</button>'
  );
  html += T.recadosHtml();

  var atalhos = [
    { modulo: "contas", nome: "Contas a pagar", detalhe: "Pagamentos e vencimentos", icone: "contas" },
    { modulo: "folha", nome: "Folha de pagamento", detalhe: "Conferir a competência", icone: "folha" },
    { modulo: "funcionarios", nome: "Pessoas", detalhe: "Consultar a equipe", icone: "pessoa" },
    { modulo: "aprovacoes", nome: "Aprovações", detalhe: "Revisar solicitações", icone: "aprovacoes" },
    { modulo: "relatorios", nome: "Relatórios", detalhe: "Consultar resultados", icone: "relatorios" }
  ].filter(function (a) { return T.podeVer(a.modulo); });
  var atalhosHtml = '<nav class="dash-atalhos" aria-label="Acessos rápidos">' + atalhos.map(function (a) {
    return '<button class="dash-atalho" data-ir="' + a.modulo + '">' + U.iconeSvg(a.icone, 20) +
      '<span><strong>' + a.nome + '</strong><small>' + a.detalhe + '</small></span><span aria-hidden="true">↗</span></button>';
  }).join("") + '</nav>';
  // Só os passos que a pessoa pode executar: RH não vê "lançar conta", por exemplo.
  var modulosDosPassos = { "conferir-tabelas": "tabelas", "novo-funcionario": "funcionarios", "novo-fornecedor": "fornecedores", "nova-conta": "contas", "novo-contrato": "contratos" };
  var config = T.CONFIG_INICIAL().filter(function (p) { return !p.acao || !modulosDosPassos[p.acao] || T.podeVer(modulosDosPassos[p.acao]); });
  var prontos = config.filter(function (c) { return c.pronto; }).length;
  var checklistHtml = (T.podeEditar() && L.blocoVisivel("configuracao") && prontos < config.length)
    ? U.painelHtml("Configuração inicial", prontos + " de " + config.length,
        '<ol class="passos">' + config.map(function (c) {
          return '<li class="' + (c.pronto ? "pronto" : "") + '">' +
            '<span class="titulo">' + U.esc(c.titulo) + "</span>" +
            '<span class="detalhe">' + U.esc(c.detalhe) + "</span>" +
            '<span class="estado">' + (c.pronto
              ? '<span class="pastilha ok">Concluído</span>'
              : (c.acao && T.podeEditar()
                  ? '<button class="botao miudo" data-acao="' + c.acao + '">Fazer agora</button>'
                  : '<span class="pastilha pendente">Pendente</span>')) +
            "</span></li>";
        }).join("") + "</ol>")
    : "";

  // Base zerada não tem KPI, alerta nem evolução pra mostrar — só a
  // checklist é conteúdo de verdade nesse momento, então ela vem primeiro,
  // logo depois do cabeçalho, em vez de ficar por último atrás de uma
  // fileira de KPIs em "—".
  if (vazio) {
    html += atalhosHtml + checklistHtml;
    return html + "</div>";
  }

  // Indicador sem dado (—) não informa nada: só aparece o que tem valor.
  // "Aguardando aprovação" fica mesmo em zero — zero ali é notícia boa.
  var kpisVisiveis = kpis.filter(function (k) {
    return L.blocoVisivel(k.id) && T.podeVer(k.destino) && (!k.vazio || k.id === "kpi-aprovacao");
  });
  if (kpisVisiveis.length) {
    var principais = kpisVisiveis.filter(function (k) { return k.id !== "kpi-contratos" && k.id !== "kpi-banco"; });
    var secundarios = kpisVisiveis.filter(function (k) { return k.id === "kpi-contratos" || k.id === "kpi-banco"; });
    if (principais.length) html += '<div class="grade-kpi">' + principais.map(U.kpiHtml).join("") + '</div>';
    secundarios = secundarios.filter(function (k) { return !k.vazio; });
    if (secundarios.length) html += '<div class="dash-indicadores">' + secundarios.map(function (k) {
      return '<button data-ir="' + k.destino + '"><span>' + U.esc(k.rotulo) + '</span><strong>' + U.esc(k.vazio ? "0" : k.valor) + '</strong><small>' + U.esc(k.nota) + '</small><span aria-hidden="true">→</span></button>';
    }).join("") + '</div>';
  }

  html += atalhosHtml;
  var corpoAlertas = alertas.length === 0
    ? U.vazioHtml("Nada exige a sua decisão agora", "")
    : '<ul class="alertas">' + alertas.map(function (a) {
        return "<li><button class=\"alerta " + a.nivel + '" data-ir="' + a.destino + '"' +
          (a.alvo ? ' data-alvo="' + U.esc(a.alvo) + '"' : "") + '>' +
          '<span class="barra"></span><span class="miolo">' +
          '<span class="titulo">' + U.esc(a.titulo) + "</span>" +
          '<span class="detalhe">' + U.esc(a.detalhe) + "</span></span>" +
          '<span class="seta" aria-hidden="true">→</span></button></li>';
      }).join("") + "</ul>";

  var blocoAlertas = "";
  if (L.blocoVisivel("atencao")) {
    var silenciados = L.alertasSilenciados();
    blocoAlertas = U.painelHtml("Prioridades",
      (alertas.length ? alertas.length + (alertas.length === 1 ? " pendência" : " pendências") : "Nada pendente") +
        (silenciados ? " · " + silenciados + " categoria(s) silenciada(s)" : ""),
      corpoAlertas);
  }

  var blocoSecundario = "";
  if (T.podeVer("contas") && e.contas.length) {
    var agenda = proximas.slice().sort(function (a, b) { return a.vencimento.localeCompare(b.vencimento); });
    var agendaHtml = agenda.length ? '<div class="dash-agenda">' + agenda.slice(0, 5).map(function (c) {
      var dias = L.diasAte(c.vencimento);
      return '<button class="dash-vencimento" data-ir="contas" data-alvo="' + U.esc(c.id) + '">' +
        '<span><strong>' + U.esc(c.descricao) + '</strong><small>' + (dias === 0 ? "Vence hoje" : dias === 1 ? "Vence amanhã" : "Em " + dias + " dias") +
        '</small></span><b>' + U.esc(L.brl(c.valor)) + '</b></button>';
    }).join("") + '</div>' : '<div class="dash-sem-vencimentos">' + U.iconeSvg("contas", 28) + '<strong>Semana sem vencimentos</strong><p>Nenhuma conta a pagar nos próximos 7 dias.</p></div>';
    blocoSecundario += U.painelHtml("Próximos vencimentos", "7 dias a partir de hoje", agendaHtml +
      '<div class="dash-painel-rodape"><button class="botao miudo" data-ir="contas">Ver todas as contas →</button>' +
      (T.podeEditar() ? '<button class="botao miudo primario" data-acao="nova-conta">+ Lançar conta</button>' : '') + '</div>');
  }
  if (T.podeVer("folha")) {
    blocoSecundario += U.painelHtml("Prazos da folha", L.competenciaBR(comp),
      '<div class="dash-agenda">' + L.prazosFolha(comp).map(function (pz) {
        var dias = L.diasAte(pz.data);
        var quando = dias < 0 ? "Passou em " + L.dataBR(pz.data) : dias === 0 ? "Hoje" : dias === 1 ? "Amanhã" : L.dataBR(pz.data) + " · em " + dias + " dias";
        return '<div class="dash-vencimento' + (dias < 0 ? " passado" : dias <= 3 ? " perto" : "") + '">' +
          "<span><strong>" + U.esc(pz.nome) + "</strong><small>" + U.esc(pz.detalhe) + "</small></span><b>" + U.esc(quando) + "</b></div>";
      }).join("") + "</div>");
  }
  if (L.blocoVisivel("evolucao") && T.evolucaoFolha) {
    blocoSecundario += T.evolucaoFolha(comp);
  }
  

  // Os três painéis empilhados com o mesmo peso não diziam qual olhar
  // primeiro. Alertas (o que de fato pede decisão) ocupa a coluna larga;
  // evolução e checklist — apoio, não urgência — dividem uma coluna
  // secundária mais estreita ao lado.
  if (blocoAlertas || blocoSecundario) {
    html += '<div class="dashboard-grade">' + blocoAlertas +
      (blocoSecundario ? '<div class="dashboard-coluna">' + blocoSecundario + "</div>" : "") +
      "</div>";
  }

  if (checklistHtml) {
    html += '<details class="dash-config"><summary><span>Configuração do sistema</span><span>' + prontos + ' de ' + config.length + ' etapas concluídas</span></summary>' + checklistHtml + '</details>';
  }
  return html + "</div>";
};

/**
 * Painel configurável. Cada gestor decide o que aparece na sua tela inicial —
 * Direção e Financeiro olham a mesma escola por ângulos diferentes, e um
 * painel único acaba não servindo a nenhum dos dois.
 *
 * Silenciar não desliga o cálculo: o alerta continua sendo apurado, só não
 * ocupa espaço. Voltar a ligar não perde nada.
 */
T.acoes["personalizar-painel"] = function () {
  function linha(id, nome, descricao, ligado, grupo) {
    return '<label class="opcao-painel">' +
      '<input type="checkbox" data-bloco="' + U.esc(grupo + ":" + id) + '"' + (ligado ? " checked" : "") + ">" +
      "<span><span class=\"nome\">" + U.esc(nome) + "</span>" +
      (descricao ? '<span class="descricao">' + U.esc(descricao) + "</span>" : "") +
      "</span></label>";
  }

  var porGrupo = {};
  L.BLOCOS_PAINEL.forEach(function (b) {
    (porGrupo[b.grupo] = porGrupo[b.grupo] || []).push(b);
  });

  var corpo = "";
  Object.keys(porGrupo).forEach(function (g) {
    corpo += '<div class="grupo-opcoes"><div class="grupo-legenda">' + U.esc(g) + "</div>" +
      porGrupo[g].map(function (b) {
        return linha(b.id, b.nome, b.descricao, L.blocoVisivel(b.id), "painel");
      }).join("") + "</div>";
  });

  corpo += '<div class="grupo-opcoes"><div class="grupo-legenda">Alertas que quero receber</div>' +
    L.TIPOS_ALERTA.map(function (t) {
      return linha(t.id, t.nome, "", L.alertaVisivel(t.id), "alerta");
    }).join("") + "</div>";

  U.abrirModal({
    titulo: "Personalizar painel",
    sub: "Vale só para você. O que vem marcado é a sugestão para o seu perfil.",
    corpo: corpo,
    acoes: [
      { rotulo: "Restaurar sugestão do perfil", esquerda: true, aoClicar: function () {
        L.restaurarPainel();
        L.preferencias.alertas = {};
        L.persistir();
        U.fecharModal();
        T.ir("dashboard");
      } },
      { rotulo: "Fechar", classe: "primario", aoClicar: function () {
        U.fecharModal();
        T.ir("dashboard");
      } }
    ]
  });

  // Aplica na hora: quem desmarca vê o efeito ao fechar, sem botão de salvar.
  U.todos("[data-bloco]").forEach(function (caixa) {
    caixa.addEventListener("change", function () {
      var partes = caixa.dataset.bloco.split(":");
      if (partes[0] === "painel") L.definirBloco(partes[1], caixa.checked);
      else L.definirAlerta(partes[1], caixa.checked);
    });
  });
};

// ---------------------------------------------------------------- banco de horas

T.telas.banco = function () {
  if (L.USA_BACKEND && !T._lancamentosBancoCarregados) carregarLancamentosBancoDaApi();

  var ativos = L.ativos();
  if (ativos.length === 0) {
    return T.cabecalho("Banco de Horas",
      "Jornada prevista contra realizada.") +
      U.painelHtml("Saldo por funcionário", "Sem apuração",
        U.vazioHtml("Nenhum funcionário cadastrado",
          "Cadastre a equipe primeiro. A partir do primeiro lançamento, o saldo aparece aqui e alimenta a folha automaticamente.",
          { acao: "novo-funcionario", rotulo: "Cadastrar funcionário" }));
  }

  var linhas = ativos.map(function (f) {
    var m = L.saldoBanco(f.id);
    var temLancamento = L.estado.lancamentosBanco.some(function (l) { return l.funcionarioId === f.id; });
    return { id: f.id, nome: f.nome, setor: f.departamento || "—", minutos: m, situacao: L.situacaoBanco(m), temLancamento: temLancamento };
  }).sort(function (a, b) { return a.minutos - b.minutos; });

  var positivas = linhas.filter(function (l) { return l.minutos > 0; }).reduce(function (a, l) { return a + l.minutos; }, 0);
  var negativas = linhas.filter(function (l) { return l.minutos < 0; }).reduce(function (a, l) { return a + l.minutos; }, 0);

  var html = T.cabecalho("Banco de Horas",
    "Jornada prevista contra realizada. Cada lançamento fica registrado.",
    T.temPerfil("DIRECAO", "RH") ? T.botaoNovo("novo-lancamento-banco", "Lançar horas") : "");

  // Sem nenhum lançamento, indicadores zerados e 24 linhas de "Zerado" só
  // ocupam a tela.
  if (!linhas.some(function (l) { return l.temLancamento || l.minutos; })) {
    return html + U.painelHtml("Saldo por funcionário", linhas.length + " ativos",
      U.vazioHtml("Nenhum lançamento ainda", "Todos estão com saldo zerado."));
  }

  html += '<div class="grade-kpi">' + [
    { rotulo: "Total de horas positivas", valor: L.horas(positivas), nota: linhas.filter(function (l) { return l.minutos > 0; }).length + " funcionário(s) com crédito" },
    { rotulo: "Total de horas negativas", valor: L.horas(negativas), tom: negativas < 0 ? "atencao" : "", nota: linhas.filter(function (l) { return l.minutos < 0; }).length + " funcionário(s) devendo" }
  ].map(U.kpiHtml).join("") + "</div>";
  var criticos = linhas.filter(function (l) { return l.minutos <= -600; }).length;
  var compensar = linhas.filter(function (l) { return l.minutos >= 1200; }).length;
  if (criticos || compensar) {
    html += '<div class="resumo-pendencias">' +
      (criticos ? '<span class="pastilha critico">' + criticos + ' abaixo de −10h</span>' : "") +
      (compensar ? '<span class="pastilha pendente">' + compensar + ' acima de 20h</span>' : "") + '</div>';
  }


  // Só quem tem movimento: 100 linhas de "—" escondem as poucas que importam.
  var comMovimento = linhas.filter(function (l) { return l.temLancamento || l.minutos; });
  var zerados = linhas.length - comMovimento.length;
  html += U.painelHtml("Saldo por funcionário",
    comMovimento.length + " com movimento" + (zerados ? " · " + zerados + " zerados" : ""),
    U.tabelaHtml([
      { rotulo: "Funcionário", conteudo: function (l) {
        return '<div class="principal">' + U.esc(T.nomeExibicao(l.nome)) + '</div><div class="secundario">' + U.esc(l.setor) + "</div>"; } },
      { rotulo: "Saldo", direita: true, conteudo: function (l) {
        if (!l.minutos) return '<span class="secundario">—</span>';
        return '<span class="num" style="font-weight:500;color:var(--titulo)">' + L.horas(l.minutos) + "</span>"; } },
      { rotulo: "Situação", direita: true, conteudo: function (l) {
        return l.minutos ? '<span class="pastilha ' + l.situacao.chave + '">' + l.situacao.rotulo + "</span>" : ""; } },
      { rotulo: "", direita: true, conteudo: function (l) {
        return l.temLancamento ? '<button class="botao miudo" data-acao="extrato-banco" data-id="' + l.id + '">Extrato</button>' : ""; } }
    ], comMovimento, { buscaLocal: "Nome ou setor" }));

  return html;
};

T.acoes["extrato-banco"] = function (id) {
  var f = L.buscarPorId("funcionarios", id);
  if (!f) return;
  var lancamentos = L.estado.lancamentosBanco.filter(function (l) { return l.funcionarioId === id; })
    .sort(function (a, b) { return b.dia.localeCompare(a.dia); });

  var acumulado = 0;
  var comSaldo = lancamentos.slice().reverse().map(function (l) {
    acumulado += l.minutos;
    return Object.assign({}, l, { acumulado: acumulado });
  }).reverse();

  var corpo = lancamentos.length === 0
    ? U.vazioHtml("Sem lançamentos", "Nenhuma hora foi creditada ou debitada para " + f.nome + " ainda.")
    : U.tabelaHtml([
        { rotulo: "Data", conteudo: function (l) { return L.dataBR(l.dia); } },
        { rotulo: "Origem", secundaria: true, conteudo: function (l) { return U.esc(T.ROTULOS_ORIGEM_BANCO[l.origem] || l.origem); } },
        { rotulo: "Justificativa", conteudo: function (l) { return U.esc(l.justificativa || "—"); } },
        { rotulo: "Movimento", direita: true, conteudo: function (l) {
          return '<span class="num ' + (l.minutos < 0 ? "v-desconto" : "v-provento") + '">' + L.horas(l.minutos) + "</span>"; } },
        { rotulo: "Acumulado", direita: true, conteudo: function (l) {
          return '<span class="num">' + L.horas(l.acumulado) + "</span>"; } }
      ], comSaldo);

  U.abrirModal({
    titulo: f.nome,
    sub: "Saldo atual " + L.horas(L.saldoBanco(id)),
    largo: true,
    corpo: '<p style="margin:0 0 14px;color:var(--tinta-media);font-size:var(--t-1)">' +
      "Cada linha é um lançamento, nunca um saldo sobrescrito. É o que permite responder “por que o meu saldo é esse?”." +
      "</p>" + corpo,
    acoes: [{ rotulo: "Fechar", aoClicar: U.fecharModal }]
  });
};

/** Mesmo padrão de T.ROTULOS_AUSENCIA: nome de exibição, nunca a constante. */
T.ROTULOS_ORIGEM_BANCO = { PONTO: "Ponto", AJUSTE_MANUAL: "Ajuste manual", COMPENSACAO: "Compensação" };

T._lancamentosBancoCarregados = false;
T._carregandoLancamentosBanco = false;

function carregarLancamentosBancoDaApi() {
  if (T._carregandoLancamentosBanco) return;
  T._carregandoLancamentosBanco = true;
  L.api.get("/api/banco-horas").then(function (lista) {
    L.estado.lancamentosBanco = lista || [];
    T._lancamentosBancoCarregados = true;
    T._carregandoLancamentosBanco = false;
    T.renderizar();
  }).catch(function (erro) {
    T._carregandoLancamentosBanco = false;
    console.error("Não foi possível carregar o banco de horas:", erro);
    U.avisar("Não foi possível carregar o banco de horas agora.");
  });
}

T.acoes["novo-lancamento-banco"] = function () {
  if (L.ativos().length === 0) { T.ir("funcionarios"); return; }
  var campos = [
    { id: "funcionarioId", rotulo: "Funcionário", tipo: "select", obrigatorio: true,
      opcoes: L.ativos().map(function (f) { return { valor: f.id, rotulo: f.nome }; }) },
    { id: "dia", rotulo: "Data", tipo: "data", obrigatorio: true, padrao: L.hoje(), par: true },
    { id: "horas", rotulo: "Horas", tipo: "numero", obrigatorio: true, passo: "0.25",
      dicaCampo: "Ex.: 2 ou -1,5" },
    { id: "origem", rotulo: "Origem", tipo: "select",
      opcoes: Object.keys(T.ROTULOS_ORIGEM_BANCO).map(function (k) { return { valor: k, rotulo: T.ROTULOS_ORIGEM_BANCO[k] }; }) },
    { id: "justificativa", rotulo: "Justificativa", tipo: "textarea", obrigatorio: true,
      dica: "Ajuste manual sem justificativa não é auditável." }
  ];
  U.abrirFormulario({
    titulo: "Lançar horas no banco",
    sub: "O lançamento não se apaga — correção se faz com lançamento inverso",
    campos: campos,
    aoSalvar: function (v) {
      if (!v.horas) { U.avisar("Informe quantas horas: use positivo para crédito e negativo para débito (ex.: 2 ou -1,5)."); return; }
      var minutos = Math.round(v.horas * 60);
      if (L.USA_BACKEND) {
        L.api.post("/api/banco-horas", {
          funcionarioId: v.funcionarioId, dia: v.dia,
          minutos: minutos, origem: v.origem || undefined, justificativa: v.justificativa,
        }).then(function () {
          T._lancamentosBancoCarregados = false;
          carregarLancamentosBancoDaApi();
          U.fecharModal();
          T.ir("banco");
          U.avisar("Horas lançadas.");
        }).catch(function (erro) {
          U.avisar(erro.message || "Não foi possível lançar as horas.");
        });
        return;
      }
      L.criar("lancamentosBanco", {
        funcionarioId: v.funcionarioId, dia: v.dia,
        minutos: minutos, origem: v.origem, justificativa: v.justificativa
      });
      U.fecharModal();
      T.ir("banco");
    }
  });
};

// ---------------------------------------------------------------- visão Ticket (dentro da Folha)

/** Quem tem Ticket, com o valor. Professor tem o Ticket descontado da folha; colaborador soma. */
/** Abas "Folha completa | Ticket" no topo do painel da Folha. */
T.abasFolha = function (ativos) {
  var visao = T.filtros.folhaVisao === "ticket" ? "ticket" : T.filtros.folhaVisao === "mei" ? "mei" : "";
  var qtd = ativos.filter(function (x) { return (x.valorTicket > 0 || x.temTicket); }).length;
  var qtdMei = ativos.filter(T.recebeMei).length;
  function aba(valor, rotulo) {
    return '<button role="tab" class="aba-categoria" data-filtro-aba="folhaVisao" data-valor="' + valor + '" aria-selected="' + (visao === valor) + '">' + rotulo + "</button>";
  }
  return '<div class="abas-categoria" role="tablist" style="margin:0 0 12px">' + aba("", "Folha completa") +
    aba("ticket", "Ticket <span class=\"contagem\">" + qtd + "</span>") +
    aba("mei", "MEI <span class=\"contagem\">" + qtdMei + "</span>") + "</div>";
};

T.painelTicket = function (ativos) {
  var busca = U.paraBusca(T.filtros.folhaBusca);
  var empresa = T.filtros.folhaEmpresa || "";
  var regimeSel = T.filtros.ticketPapel || "";
  var comTicket = ativos.filter(function (x) {
    return (x.valorTicket > 0 || x.temTicket) &&
      (!empresa || L.empresaDe(x) === empresa) &&
      (!regimeSel || (regimeSel === "PROFESSOR") === (x.regime === "HORISTA_AULA")) &&
      (!busca || U.paraBusca(x.nome + " " + (x.cargo || "") + " " + (x.matricula || "")).indexOf(busca) !== -1);
  }).sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
  var descontado = 0, positivo = 0;
  comTicket.forEach(function (x) { if (L.ticketDesconta(x)) descontado += x.valorTicket; else positivo += x.valorTicket; });
  var podeAlterar = T.podeEditar() && T.temPerfil("DIRECAO", "RH");

  var barra = '<div class="barra-ferramentas" style="padding:0 0 14px">' +
    '<input type="search" data-filtro="folhaBusca" aria-label="Buscar por nome" placeholder="Buscar nome ou cargo" value="' + U.esc(T.filtros.folhaBusca || "") + '">' +
    U.seletorRico({ rotulo: "Filtrar por empresa", valor: empresa,
      itens: [{ valor: "", rotulo: "Todas as empresas" }].concat(L.empresasPresentes(ativos).map(function (e) { return { valor: e, rotulo: e }; })),
      atributos: { filtro: "folhaEmpresa" } }) +
    U.seletorRico({ rotulo: "Professor ou colaborador", valor: regimeSel,
      itens: [{ valor: "", rotulo: "Professores e colaboradores" }, { valor: "PROFESSOR", rotulo: "Só professores" }, { valor: "COLABORADOR", rotulo: "Só colaboradores" }],
      atributos: { filtro: "ticketPapel" } }) +
    '<span class="direita">' +
    (podeAlterar ? '<button class="botao miudo primario" data-acao="conceder-ticket">Conceder Ticket</button> ' : "") +
    '<button class="botao miudo" data-acao="exportar-ticket">Excel</button></span></div>';

  function tabelaDe(lista, vazio) { return U.tabelaHtml([
    { rotulo: "Funcionário", conteudo: function (x) {
      return '<div class="principal">' + U.esc(T.nomeExibicao(x.nome)) + '</div><div class="secundario">' + U.esc(x.cargo || "") + "</div>"; } },
    { rotulo: "Empresa", secundaria: true, conteudo: function (x) { return U.esc(L.empresaDe(x)); } },
    { rotulo: "Valor do Ticket", direita: true, conteudo: function (x) { return x.valorTicket > 0 ? '<span class="num">' + L.brl(x.valorTicket) + "</span>" : '<span class="pastilha destaque">sem valor</span>'; } },
    { rotulo: "Na folha", conteudo: function (x) {
      if (!(x.valorTicket > 0)) return '<span class="secundario">definir o valor</span>';
      return L.ticketDesconta(x) ? '<span class="pastilha neutro">desconta</span>' : '<span class="pastilha ok">soma</span>'; } },
    { rotulo: "", direita: true, conteudo: function (x) {
      return podeAlterar ? '<button class="botao miudo" data-acao="ajustar-ticket" data-id="' + x.id + '">' + (x.valorTicket > 0 ? "Ajustar" : "Definir valor") + "</button>" : ""; } }
  ], lista, { tituloVazio: vazio,
    textoVazio: podeAlterar ? "Use “Conceder Ticket” para incluir quem vai começar a receber." : "Troque o filtro ou a busca." }); }
  function grupo(titulo, lista, nota) {
    if (!lista.length) return "";
    var tot = lista.reduce(function (n, x) { return n + (x.valorTicket || 0); }, 0);
    var somam = lista.filter(function (x) { return !L.ticketDesconta(x) && x.regime === "HORISTA_AULA"; });
    if (somam.length && lista.length > somam.length) {
      var totSoma = somam.reduce(function (n, x) { return n + (x.valorTicket || 0); }, 0);
      nota = "descontado " + L.brl(tot - totSoma) + " · soma " + L.brl(totSoma) + " (" + somam.length + ")";
    } else if (somam.length) nota = "soma, não desconta";
    var semV = lista.filter(function (x) { return !(x.valorTicket > 0); }).length;
    return '<div style="margin:0 0 18px"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline;margin:0 0 6px"><h3 style="margin:0">' + titulo +
      ' <span class="contagem">' + lista.length + '</span></h3><span class="secundario">' + nota + " · " + L.brl(tot) + (semV ? " · " + semV + " sem valor" : "") + "</span></div>" +
      tabelaDe(lista, "") + "</div>";
  }
  var profs = comTicket.filter(function (x) { return x.regime === "HORISTA_AULA"; });
  var colabs = comTicket.filter(function (x) { return x.regime !== "HORISTA_AULA" && x.regime !== "PRESTADOR_PJ"; });
  var prests = comTicket.filter(function (x) { return x.regime === "PRESTADOR_PJ"; });
  var tabela = comTicket.length
    ? grupo("Professores", profs, "descontado da folha") + grupo("Colaboradores", colabs, "positivo, não desconta") +
      grupo("Prestadores MEI/PJ", prests, "pago à parte, fora da nota")
    : tabelaDe([], "Ninguém com Ticket neste filtro");

  return '<div class="painel"><div class="painel-topo"><h2>Ticket</h2><span class="contexto">' + comTicket.length +
    " pessoa(s)" + (comTicket.filter(function (x) { return !(x.valorTicket > 0); }).length ? " · " + comTicket.filter(function (x) { return !(x.valorTicket > 0); }).length + " sem valor" : "") + " · total " + L.brl(descontado + positivo) + "</span></div>" +
    '<div class="painel-corpo" style="padding-top:0;padding-bottom:0">' + T.abasFolha(ativos) +
    '<p class="secundario" style="margin:0 0 12px">Professor: o Ticket é descontado da folha. Colaborador: o Ticket é positivo, não desconta. Prestador MEI/PJ: pago à parte, fora da nota fiscal.</p>' + barra + tabela + "</div>" +
    '<div class="painel-corpo"><div class="ficha"><div><dt>Descontado dos professores</dt><dd>' + L.brl(descontado) +
    "</dd></div><div><dt>Positivo para colaboradores</dt><dd>" + L.brl(positivo) + "</dd></div><div><dt>Total de Ticket</dt><dd>" +
    L.brl(descontado + positivo) + "</dd></div></div></div></div>";
};

T.salvarTicket = function (id, centavos, soma) {
  var depois = function () {
    U.fecharModal(); T.renderizar();
    // O Ticket novo só entra na folha no próximo cálculo.
    U.avisar((centavos > 0 ? "Ticket salvo." : "Ticket removido.") +
      " Se a folha de " + L.competenciaBR(L.competenciaAberta()) + " já foi calculada, clique em “Calcular folha” para aplicar.");
  };
  var alvo = L.buscarPorId("funcionarios", id);
  if (L.USA_BACKEND && alvo && alvo.regime === "PRESTADOR_PJ") {
    // Prestador tem contrato próprio: o Ticket fica nele (pago à parte, fora da nota).
    return L.api.patch("/api/prestadores/" + id, { temTicket: centavos > 0, valorTicketCentavos: centavos })
      .then(function () { return L.recarregarFuncionarios(); }).then(depois)
      .catch(function (erro) { U.avisar(erro.message || "Não foi possível salvar o Ticket."); });
  }
  if (L.USA_BACKEND) {
    return L.api.patch("/api/funcionarios/" + id, Object.assign({ temTicket: centavos > 0, valorTicketCentavos: centavos }, soma === undefined ? {} : { ticketSoma: soma }))
      .then(function () { return L.recarregarFuncionarios(); }).then(depois)
      .catch(function (erro) { U.avisar(erro.message || "Não foi possível salvar o Ticket."); });
  }
  L.atualizar("funcionarios", id, Object.assign({ temTicket: centavos > 0, valorTicket: centavos }, soma === undefined ? {} : { ticketSoma: soma }));
  depois();
};

/** Quem recebe MEI (nota fiscal): prestadores MEI e CLT com parte em MEI — todos juntos, uma coluna só. */
T.recebeMei = function (x) {
  if (x.regime === "PRESTADOR_PJ") return x.enquadramento === "MEI";
  return x.valorMei > 0 || !!x.temMei;
};
T.valorMeiDe = function (x) { return x.regime === "PRESTADOR_PJ" ? (x.valorMensal || 0) : (x.valorMei || 0); };
T.tipoMeiDe = function (x) {
  if (x.regime === "PRESTADOR_PJ") return "MEI";
  return "CLT + " + (x.valorTicket > 0 || x.temTicket ? "Ticket + " : "") + "MEI";
};

T.listaMei = function (ativos) {
  var busca = U.paraBusca(T.filtros.folhaBusca);
  var empresa = T.filtros.folhaEmpresa || "";
  return ativos.filter(function (x) {
    return T.recebeMei(x) && (!empresa || L.empresaDe(x) === empresa) &&
      (!busca || U.paraBusca(x.nome + " " + (x.cargo || "") + " " + (x.matricula || "")).indexOf(busca) !== -1);
  }).sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
};

T.painelMei = function (ativos) {
  var busca = T.filtros.folhaBusca || "", empresa = T.filtros.folhaEmpresa || "";
  var lista = T.listaMei(ativos);
  var total = lista.reduce(function (n, x) { return n + T.valorMeiDe(x); }, 0);
  var semValor = lista.filter(function (x) { return !(T.valorMeiDe(x) > 0); }).length;
  var podeAlterar = T.podeEditar() && T.temPerfil("DIRECAO", "RH");
  var barra = '<div class="barra-ferramentas" style="padding:0 0 14px">' +
    '<input type="search" data-filtro="folhaBusca" aria-label="Buscar por nome" placeholder="Buscar nome ou cargo" value="' + U.esc(busca) + '">' +
    U.seletorRico({ rotulo: "Filtrar por empresa", valor: empresa,
      itens: [{ valor: "", rotulo: "Todas as empresas" }].concat(L.empresasPresentes(ativos).map(function (e) { return { valor: e, rotulo: e }; })),
      atributos: { filtro: "folhaEmpresa" } }) +
    '<span class="direita"><button class="botao miudo" data-acao="exportar-mei">Excel</button></span></div>';
  var tabela = U.tabelaHtml([
    { rotulo: "Funcionário", conteudo: function (x) {
      return '<div class="principal">' + U.esc(T.nomeExibicao(x.nome)) + '</div><div class="secundario">' + U.esc(x.cargo || "") + "</div>"; } },
    { rotulo: "Empresa", secundaria: true, conteudo: function (x) { return U.esc(L.empresaDe(x)); } },
    { rotulo: "Tipo", secundaria: true, conteudo: function (x) { return U.esc(T.tipoMeiDe(x)); } },
    { rotulo: "Valor do MEI", direita: true, conteudo: function (x) {
      var v = T.valorMeiDe(x);
      return v > 0 ? '<span class="num">' + L.brl(v) + "</span>" : '<span class="pastilha destaque">sem valor</span>'; } },
    { rotulo: "", direita: true, conteudo: function (x) {
      return podeAlterar && x.regime !== "PRESTADOR_PJ"
        ? '<button class="botao miudo" data-acao="ajustar-mei" data-id="' + x.id + '">' + (x.valorMei > 0 ? "Ajustar" : "Definir valor") + "</button>" : ""; } }
  ], lista, { tituloVazio: "Ninguém com MEI neste filtro", textoVazio: "Troque a busca ou a empresa." });
  return '<div class="painel"><div class="painel-topo"><h2>MEI</h2><span class="contexto">' + lista.length + " pessoa(s)" +
    (semValor ? " · " + semValor + " sem valor" : "") + " · total " + L.brl(total) + "</span></div>" +
    '<div class="painel-corpo" style="padding-top:0;padding-bottom:0">' + T.abasFolha(ativos) +
    '<p class="secundario" style="margin:0 0 12px">Todos que recebem MEI (nota fiscal), em uma lista só: MEI, CLT + MEI e CLT + Ticket + MEI.</p>' +
    barra + tabela + "</div>" +
    '<div class="painel-corpo"><div class="ficha"><div><dt>Total de MEI a pagar</dt><dd>' + L.brl(total) + "</dd></div><div><dt>Pessoas</dt><dd>" + lista.length + "</dd></div></div></div></div>";
};

T.acoes["ajustar-mei"] = function (id) {
  var f = L.buscarPorId("funcionarios", id);
  if (!f) return;
  U.abrirFormulario({
    titulo: "Valor do MEI", sub: f.nome + " · parte paga por nota fiscal (MEI)",
    campos: [{ id: "valorMei", rotulo: "Valor do MEI", tipo: "moeda", dica: "Deixe 0 para tirar o MEI." }],
    valores: { valorMei: f.valorMei ? (f.valorMei / 100).toFixed(2) : "" },
    rotuloSalvar: "Salvar",
    aoSalvar: function (v) {
      var valorCent = Math.round((Number(v.valorMei) || 0) * 100);
      if (L.USA_BACKEND) {
        L.api.patch("/api/funcionarios/" + id, { temMei: valorCent > 0, valorMeiCentavos: valorCent })
          .then(function () { return L.recarregarFuncionarios(); })
          .then(function () { U.fecharModal(); T.renderizar(); U.avisar("MEI salvo. Se a folha de " + L.competenciaBR(L.competenciaAberta()) + " já foi calculada, clique em “Calcular folha” para aplicar."); })
          .catch(function (erro) { U.avisar(erro.message || "Não foi possível salvar o MEI."); });
        return;
      }
      L.atualizar("funcionarios", id, { temMei: valorCent > 0, valorMei: valorCent });
      U.fecharModal(); T.renderizar();
    }
  });
};

T.acoes["ajustar-ticket"] = function (id) {
  var f = L.buscarPorId("funcionarios", id);
  if (!f) return;
  U.abrirFormulario({
    titulo: "Ajustar Ticket", sub: f.nome + (f.regime === "HORISTA_AULA" ? " · professor: o valor é descontado da folha"
      : f.regime === "PRESTADOR_PJ" ? " · prestador: pago à parte, fora da nota fiscal" : " · colaborador: o valor é positivo"),
    campos: [{ id: "valorTicket", rotulo: "Valor do Ticket", tipo: "moeda", dica: "Deixe 0 para tirar o Ticket." }].concat(
      f.regime === "HORISTA_AULA" ? [{ id: "ticketModo", rotulo: "Na folha", tipo: "select",
        opcoes: [{ valor: "DESCONTA", rotulo: "Descontar da folha (padrão do professor)" }, { valor: "SOMA", rotulo: "Somar, como colaborador" }] }] : []),
    valores: { valorTicket: f.valorTicket ? (f.valorTicket / 100).toFixed(2) : "", ticketModo: f.ticketSoma ? "SOMA" : "DESCONTA" },
    rotuloSalvar: "Salvar",
    aoSalvar: function (v) { T.salvarTicket(id, Number(v.valorTicket) || 0, f.regime === "HORISTA_AULA" ? v.ticketModo === "SOMA" : undefined); }
  });
};

T.acoes["conceder-ticket"] = function () {
  var sem = L.porNome(L.ativos().filter(function (x) { return !(x.valorTicket > 0); }));
  U.abrirFormulario({
    titulo: "Conceder Ticket", sub: "Escolha quem vai começar a receber e o valor.",
    campos: [
      { id: "funcionarioId", rotulo: "Funcionário", tipo: "select", opcoes: sem.map(function (x) { return { valor: x.id, rotulo: x.nome, detalhe: (x.regime === "HORISTA_AULA" ? "Professor" : x.regime === "PRESTADOR_PJ" ? "Prestador MEI/PJ" : "Colaborador") + (x.cargo ? " · " + x.cargo : "") }; }) },
      { id: "valorTicket", rotulo: "Valor do Ticket", tipo: "moeda", obrigatorio: true },
      { id: "ticketModo", rotulo: "Na folha (só vale para professor)", tipo: "select",
        opcoes: [{ valor: "DESCONTA", rotulo: "Descontar da folha (padrão do professor)" }, { valor: "SOMA", rotulo: "Somar, como colaborador" }] }
    ],
    valores: { ticketModo: "DESCONTA" },
    rotuloSalvar: "Conceder",
    aoSalvar: function (v) {
      var c = Number(v.valorTicket) || 0;
      if (!v.funcionarioId || c <= 0) { U.avisar("Escolha a pessoa e informe o valor do Ticket."); return; }
      var alvo = L.buscarPorId("funcionarios", v.funcionarioId);
      T.salvarTicket(v.funcionarioId, c, alvo && alvo.regime === "HORISTA_AULA" ? v.ticketModo === "SOMA" : undefined);
    }
  });
};

// ---------------------------------------------------------------- folha

/**
 * O que varia mês a mês, por regime. Sem esta tela existia o ciclo mensal
 * inteiro (abrir, copiar, fechar) mas nenhum jeito de lançar a falta ou a
 * hora extra de um professor específico — o motivo de o ciclo existir.
 */
T.CAMPOS_MOVIMENTO = function (f) {
  var campos = [];
  // Prestador não tem falta nem hora extra: só os descontos que mudam a cada mês.
  if (f.regime === "PRESTADOR_PJ") {
    var todos = T.CAMPOS_MOVIMENTO({ regime: "_DESCONTOS" });
    var ini = todos.findIndex(function (x) { return x.secao === "Descontos do mês"; });
    var fim = todos.findIndex(function (x, j) { return j > ini && x.fimSecao; });
    return todos.slice(ini, fim + 1);
  }
  if (f.regime === "HORISTA_AULA") {
    campos.push(
      { secao: "Aula extra / projeto e substituições" },
      { id: "aulasExtrasSemanais", rotulo: "Aula extra / projeto (por semana)", tipo: "numero", min: 0, par: true,
        dica: "Grade vai até 40 aulas; o que passar disso lança aqui. Projeto, monitoria, plantão — repete toda semana, entra ×4,5 e é pago pela hora-aula." },
      { id: "valorHoraExtra", rotulo: "Hora-aula do projeto", tipo: "moeda", min: 0,
        dicaCampo: "Padrão: a hora-aula do contrato" },
      { id: "aulasSubstituicao", rotulo: "Aulas avulsas no mês", tipo: "numero", min: 0, par: true,
        dica: "Substituição pontual — não multiplica pelas semanas." },
      { id: "aulasNoturnas", rotulo: "Aulas noturnas", tipo: "numero", min: 0 },
      { fimSecao: true },
      { secao: "Faltas do professor" },
      { id: "aulasNaoDadas", rotulo: "Aulas não ministradas", tipo: "numero", min: 0, par: true,
        dica: "Falta do professor na apuração por semanas fixas." },
      { id: "semanasFalta", rotulo: "Semanas com falta injustificada", tipo: "numero", min: 0,
        dica: "Cada semana derruba o DSR daquela semana." },
      { fimSecao: true },
    );
  } else if (f.regime === "MENSALISTA") {
    campos.push(
      { secao: "Horas e faltas do mês" },
      { id: "horasExtras50", rotulo: "Horas extras 50%", tipo: "numero", min: 0, par: true },
      { id: "horasExtras100", rotulo: "Horas extras 100%", tipo: "numero", min: 0 },
      { id: "diasFalta", rotulo: "Dias de falta", tipo: "numero", min: 0 },
      { fimSecao: true },
    );
  } else if (f.regime === "HORISTA_RELOGIO") {
    campos.push(
      { secao: "Horas e faltas do mês" },
      { id: "horasExtras50", rotulo: "Horas extras 50%", tipo: "numero", min: 0, par: true },
      { id: "horasExtras100", rotulo: "Horas extras 100%", tipo: "numero", min: 0 },
      { id: "diasFalta", rotulo: "Dias de falta", tipo: "numero", min: 0, par: true },
      { id: "horasNoturnas", rotulo: "Horas noturnas", tipo: "numero", min: 0 },
      { fimSecao: true },
    );
  }
  campos.push(
    { secao: "Benefício" },
    { id: "valeTransporte", rotulo: "Vale-transporte (custo do mês)", tipo: "moeda", min: 0,
      dica: "O desconto respeita o teto de 6% do salário base." },
    { fimSecao: true },
    // Consignado, coparticipação e adiantamento não reduzem base de
    // INSS/IRRF/FGTS (`natureza_base` em `folha_lancamentos_avulsos`) — por
    // isso é desconto de valor cheio, não um percentual sobre o bruto.
    { secao: "Descontos do mês" },
    { id: "descontoCantina", rotulo: "Cantina", tipo: "moeda", min: 0, par: true },
    { id: "descontoMaterial", rotulo: "Material escolar", tipo: "moeda", min: 0 },
    { id: "descontoMensalidade", rotulo: "Mensalidade", tipo: "moeda", min: 0, par: true },
    { id: "descontoPlanoSaude", rotulo: "Plano de saúde", tipo: "moeda", min: 0 },
    { id: "descontoAdiantamento", rotulo: "Adiantamento (vale)", tipo: "moeda", min: 0 },
    { id: "descontoRobotica", rotulo: "Robótica", tipo: "moeda", min: 0, par: true },
    { id: "descontoEmprestimos", rotulo: "Empréstimos", tipo: "moeda", min: 0 },
    { id: "descontoOutros", rotulo: "Outros descontos", tipo: "moeda", min: 0, par: true },
    { id: "descontoOutrosObs", rotulo: "Observação dos outros descontos", tipo: "texto" },
    { fimSecao: true },
    // Repete todo mês (a abertura da competência copia) até alguém mudar.
    { secao: "Pensão alimentícia" },
    { id: "pensaoModo", rotulo: "Tipo", tipo: "select", par: true,
      opcoes: [{ valor: "", rotulo: "Sem pensão" },
               { valor: "VALOR", rotulo: "Valor fixo (R$)" },
               { valor: "PERCENTUAL_SALARIO_MINIMO", rotulo: "% do salário mínimo" },
               { valor: "PERCENTUAL_LIQUIDO", rotulo: "% do líquido" }] },
    { id: "pensaoQuantidade", rotulo: "Valor ou percentual", tipo: "numero", passo: "0.01", min: 0,
      dicaCampo: "Ex.: 500,00 ou 30" },
    { fimSecao: true },
    // Professor que dá aula em mais de uma escola é comum aqui. Sem estes dois
    // campos o INSS é calculado como se este fosse o único emprego — e sai a
    // menos, com o recolhimento correto sendo responsabilidade da escola.
    { secao: "Outro vínculo empregatício" },
    { id: "remuneracaoOutrosVinculos", rotulo: "Remuneração em outra escola", tipo: "moeda", min: 0, par: true,
      dica: "Só se o professor tiver outro emprego CLT no mês." },
    { id: "inssOutrosVinculos", rotulo: "INSS já retido lá", tipo: "moeda", min: 0,
      dica: "Do holerite da outra escola. O teto do INSS é único entre vínculos." },
    { fimSecao: true },
  );
  return campos;
};

T.acoes["lancar-movimento"] = function (funcionarioId) {
  var f = L.buscarPorId("funcionarios", funcionarioId);
  if (!f) return;
  var comp = L.competenciaAberta();

  if (L.periodoFechado(comp)) {
    U.avisar(L.competenciaBR(comp) + " está fechada. Reabra a competência para lançar movimento.");
    return;
  }

  var atual = L.movimentoDe(funcionarioId, comp);
  var valores = {
    aulasExtrasSemanais: atual.aulasExtrasSemanais || "",
    valorHoraExtra: atual.valorHoraExtra ? (atual.valorHoraExtra / 100).toFixed(2) : "",
    aulasSubstituicao: atual.aulasSubstituicao || "",
    aulasNoturnas: atual.aulasNoturnas || "",
    aulasNaoDadas: atual.aulasNaoDadas || "",
    semanasFalta: atual.semanasFalta || "",
    horasExtras50: atual.horasExtras50 || "",
    horasExtras100: atual.horasExtras100 || "",
    diasFalta: atual.diasFalta || "",
    horasNoturnas: atual.horasNoturnas || "",
    valeTransporte: atual.valeTransporte ? (atual.valeTransporte / 100).toFixed(2) : "",
    descontoCantina: atual.descontoCantina ? (atual.descontoCantina / 100).toFixed(2) : "",
    descontoMaterial: atual.descontoMaterial ? (atual.descontoMaterial / 100).toFixed(2) : "",
    descontoMensalidade: atual.descontoMensalidade ? (atual.descontoMensalidade / 100).toFixed(2) : "",
    descontoPlanoSaude: atual.descontoPlanoSaude ? (atual.descontoPlanoSaude / 100).toFixed(2) : "",
    descontoAdiantamento: atual.descontoAdiantamento ? (atual.descontoAdiantamento / 100).toFixed(2) : "",
    descontoRobotica: atual.descontoRobotica ? (atual.descontoRobotica / 100).toFixed(2) : "",
    descontoEmprestimos: atual.descontoEmprestimos ? (atual.descontoEmprestimos / 100).toFixed(2) : "",
    descontoOutros: atual.descontoOutros ? (atual.descontoOutros / 100).toFixed(2) : "",
    descontoOutrosObs: atual.descontoOutrosObs || "",
    pensaoModo: atual.pensaoModo || "",
    pensaoQuantidade: atual.pensaoQuantidade
      ? (atual.pensaoModo === "VALOR" ? (atual.pensaoQuantidade / 100).toFixed(2) : String(atual.pensaoQuantidade)) : ""
  };

  U.abrirFormulario({
    titulo: "Lançar movimento — " + f.nome,
    sub: L.competenciaBR(comp),
    largo: true,
    campos: T.CAMPOS_MOVIMENTO(f),
    valores: valores,
    rotuloSalvar: "Salvar movimento",
    aoSalvar: function (v) {
      if (L.USA_BACKEND) {
        // Manda todo campo que o formulário mostrou, com 0 quando vazio: é
        // assim que se apaga um lançamento feito por engano. Campo que não
        // aparece para este regime vai como undefined e fica como estava.
        var CAMPOS_API = ["aulasExtrasSemanais", "valorHoraExtra", "aulasSubstituicao", "aulasNoturnas",
          "aulasNaoDadas", "semanasFalta", "horasExtras50", "horasExtras100", "diasFalta", "horasNoturnas",
          "valeTransporte", "descontoCantina", "descontoMaterial", "descontoMensalidade",
          "descontoPlanoSaude", "descontoAdiantamento", "descontoRobotica", "descontoEmprestimos", "descontoOutros",
          "remuneracaoOutrosVinculos", "inssOutrosVinculos"];
        var corpo = {};
        CAMPOS_API.forEach(function (k) { if (k in v) corpo[k] = v[k] || 0; });
        if ((corpo.descontoOutros || 0) > 0 && !String(v.descontoOutrosObs || "").trim()) {
          U.avisar("Explique os outros descontos no campo de observação."); return;
        }
        if ("descontoOutrosObs" in v) corpo.descontoOutrosObs = String(v.descontoOutrosObs || "").trim();
        if ("pensaoModo" in v) {
          var qtd = v.pensaoQuantidade || 0;
          corpo.pensaoModo = v.pensaoModo || null;
          // Valor fixo vai em centavos, como todo dinheiro; percentual vai como está.
          corpo.pensaoQuantidade = v.pensaoModo === "VALOR" ? Math.round(qtd * 100) : qtd;
          if (v.pensaoModo && !qtd) { U.avisar("Informe o valor ou o percentual da pensão."); return; }
          if (v.pensaoModo && v.pensaoModo !== "VALOR" && qtd > 100) { U.avisar("O percentual da pensão vai até 100."); return; }
        }
        L.api.patch("/api/movimentos/" + comp + "/" + funcionarioId, corpo).then(function () {
          T._movimentosCarregadosPara = null;
          carregarMovimentosDaApi(comp);
          U.fecharModal();
          T.filtros.folhaFuncionario = funcionarioId;
          T.alvo = funcionarioId;
          U.avisar("Movimento de " + f.nome + " atualizado. A folha já reflete o novo valor.");
        }).catch(function (erro) {
          U.avisar(erro.message || "Não foi possível salvar o movimento.");
        });
        return;
      }
      if (v.pensaoModo === "VALOR") v.pensaoQuantidade = Math.round((v.pensaoQuantidade || 0) * 100);
      if (!v.pensaoModo) v.pensaoQuantidade = 0;
      L.lancarMovimento(funcionarioId, comp, v);
      U.fecharModal();
      T.filtros.folhaFuncionario = funcionarioId;
      T.alvo = funcionarioId;
      T.renderizar();
      U.avisar("Movimento de " + f.nome + " atualizado. A folha já reflete o novo valor.");
    }
  });
};

/**
 * Mês fechado mostra o que foi gravado no fechamento, não a conta refeita
 * com o cadastro de hoje: um reajuste depois não pode mudar a folha paga.
 * Preenche `folhaApurada`, que `L.calcular` já consulta primeiro.
 */
/**
 * Líquido de cada pessoa no mês anterior, para a conferência: no servidor, o
 * que foi gravado naquele mês; sem servidor, a conta do navegador.
 */
T._liquidoAnterior = {};
T.liquidoMesAnterior = function (comp) {
  var p = comp.split("-").map(Number);
  var ant = p[1] === 1 ? (p[0] - 1) + "-12" : p[0] + "-" + String(p[1] - 1).padStart(2, "0");
  if (T._liquidoAnterior[ant] !== undefined) return { comp: ant, porId: T._liquidoAnterior[ant] };
  if (!L.USA_BACKEND) {
    if (!L.periodoDe(ant)) return { comp: ant, porId: null };
    var mapa = {};
    L.ativos().forEach(function (f) { mapa[f.id] = { nome: f.nome, liquido: L.calcular(f, ant).liquido }; });
    return { comp: ant, porId: mapa };
  }
  T._liquidoAnterior[ant] = null;
  L.api.get("/api/folha/" + ant + "/detalhado").then(function (linhas) {
    if (!linhas || !linhas.length) return;
    var mapa = {};
    linhas.forEach(function (l) {
      var f = L.buscarPorId("funcionarios", l.employeeId);
      mapa[l.employeeId] = { nome: f ? f.nome : (l.nome || ""), liquido: l.liquido };
    });
    T._liquidoAnterior[ant] = mapa;
    if (T.atual === "folha") T.renderizar();
  }).catch(function () {});
  return { comp: ant, porId: null };
};

/** Quem mudou em relação ao mês anterior: é por aí que o erro aparece. */
T.conferenciaMesHtml = function (comp, ativos) {
  var anterior = T.liquidoMesAnterior(comp);
  if (!anterior.porId) return "";
  var itens = [];
  ativos.forEach(function (f) {
    var agora = L.calcular(f, comp).liquido;
    var antes = anterior.porId[f.id];
    if (!antes) { itens.push({ f: f, antes: null, agora: agora, motivo: "entrou na folha" }); return; }
    var dif = agora - antes.liquido;
    var pct = antes.liquido ? Math.abs(dif) / antes.liquido : 1;
    if (Math.abs(dif) >= 5000 && pct >= 0.1) itens.push({ f: f, antes: antes.liquido, agora: agora, dif: dif, pct: pct });
  });
  var saiu = Object.keys(anterior.porId).filter(function (id) {
    return !ativos.some(function (f) { return f.id === id; });
  });
  if (!itens.length && !saiu.length) {
    return U.painelHtml("Conferência com " + L.competenciaBR(anterior.comp), "sem variação relevante",
      '<div class="painel-corpo" style="color:var(--tinta-media)">Ninguém mudou 10% ou mais no líquido.</div>');
  }
  itens.sort(function (a, b) { return Math.abs(b.dif || b.agora) - Math.abs(a.dif || a.agora); });
  var linhas = itens.map(function (x) {
    return { id: x.f.id, nome: x.f.nome, antes: x.antes, agora: x.agora, dif: x.dif, pct: x.pct, motivo: x.motivo };
  }).concat(saiu.map(function (id) {
    var a = anterior.porId[id];
    return { id: id, nome: a.nome || "—", antes: a.liquido, agora: null, motivo: "saiu da folha" };
  }));
  var tabela = U.tabelaHtml([
    { rotulo: "Funcionário", conteudo: function (x) { return '<div class="principal">' + U.esc(T.nomeExibicao(x.nome)) + "</div>"; } },
    { rotulo: L.competenciaBR(anterior.comp), direita: true, conteudo: function (x) {
      return '<span class="num">' + (x.antes === null ? "—" : L.brl(x.antes)) + "</span>"; } },
    { rotulo: L.competenciaBR(comp), direita: true, conteudo: function (x) {
      return '<span class="num">' + (x.agora === null ? "—" : L.brl(x.agora)) + "</span>"; } },
    { rotulo: "Diferença", direita: true, conteudo: function (x) {
      if (x.motivo) return '<span class="pastilha neutro">' + x.motivo + "</span>";
      return '<span class="num ' + (x.dif < 0 ? "v-desconto" : "v-provento") + '">' + (x.dif > 0 ? "+ " : "− ") +
        L.brl(Math.abs(x.dif)) + " (" + Math.round(x.pct * 100) + "%)</span>"; } }
  ], linhas);
  return '<details class="relatorio-detalhe"' + (linhas.length <= 12 ? " open" : "") + "><summary>Conferência com " +
    U.esc(L.competenciaBR(anterior.comp)) + " <span>" + linhas.length +
    " pessoa(s) para conferir: variação de 10% ou mais no líquido, entradas e saídas</span></summary>" +
    '<div class="painel">' + tabela + "</div></details>";
};

T.carregarFolhaApurada = function (comp) {
  var p = L.periodoDe(comp);
  if (!L.USA_BACKEND || !p || p.status !== "FECHADO" || p.folhaApurada || T._carregandoApurada === comp) return;
  T._carregandoApurada = comp;
  L.api.get("/api/folha/" + comp + "/detalhado").then(function (linhas) {
    var porId = {};
    (linhas || []).forEach(function (l) {
      porId[l.employeeId] = {
        rubricas: l.rubricas || [], avisos: l.avisos || [], memoria: [],
        proventos: l.proventos, descontos: l.descontos, liquido: l.liquido,
        remuneracaoBruta: l.proventos, custoEmpregador: l.custoEmpregador
      };
    });
    var atual = L.periodoDe(comp);
    if (atual) atual.folhaApurada = porId;
    T._carregandoApurada = null;
    L.versao++;
    T.renderizar();
  }).catch(function () { T._carregandoApurada = null; });
};

T.telas.folha = function () {
  if (L.USA_BACKEND && T._movimentosCarregadosPara !== L.competenciaAberta()) {
    carregarMovimentosDaApi(L.competenciaAberta());
  }
  // CCT e salário mínimo entram na mesma checagem de divergência que INSS e
  // IRRF (`L.calcularFolha`) — sem isto, quem abre Folha sem nunca ter
  // passado por Tabelas Legais nesta sessão via "não cadastrado" em vez de
  // "não conferido", porque `L.estado.ccts`/`salarioMinimo` ainda vêm vazios.
  if (L.USA_BACKEND && !T._tabelasCarregadas) carregarTabelasDaApi();
  T.carregarFolhaApurada(L.competenciaAberta());

  var ativos = L.ativos();
  if (ativos.length === 0) {
    return T.cabecalho("Folha de Pagamento",
      "Hora-aula e descontos da escola, com os impostos pela contabilidade.") +
      U.painelHtml("Prévia por funcionário", "Sem cadastro",
        U.vazioHtml("Nenhum funcionário cadastrado",
          "Cadastre a equipe para ver a prévia de folha de cada um, com memória de cálculo e fundamento legal em cada passo.",
          { acao: "novo-funcionario", rotulo: "Cadastrar funcionário" }));
  }

  var selecionadoId = T.alvo || T.filtros.folhaFuncionario || null;
  var mostrarDetalhe = !!selecionadoId;
  var f = L.buscarPorId("funcionarios", selecionadoId) || ativos[0];
  var comp = L.competenciaAberta();
  // "Hoje quero pagar só os MEI": a lista completa filtra por como cada um é
  // pago, com o total do grupo filtrado à mostra — sem precisar somar linha
  // por linha para saber quanto vai sair no lote de hoje.
  var vinculoFiltro = T.filtros.folhaVinculo || "";
  var empresaFiltroFolha = T.filtros.folhaEmpresa || "";
  var buscaFolha = U.paraBusca(T.filtros.folhaBusca);
  var ordemFolha = T.filtros.folhaOrdem || "";
  var ativosNaFolha = ativos.filter(function (x) {
    return (!vinculoFiltro || L.grupoFiltroDe(x) === vinculoFiltro) &&
      (!empresaFiltroFolha || L.empresaDe(x) === empresaFiltroFolha) &&
      (!buscaFolha || U.paraBusca(x.nome + " " + (x.cargo || "") + " " + (x.matricula || "")).indexOf(buscaFolha) !== -1);
  });
  // Sempre em ordem alfabética.
  ativosNaFolha.sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
  var r = L.calcular(f, comp);
  var causas = L.divergenciasPorCausa(comp);
  // Causa que atinge a folha inteira já está no painel de bloqueios; repetir
  // "divergência" em todas as linhas só esconde quem tem problema próprio.
  var causasGerais = {};
  causas.forEach(function (c) { if (c.pessoas.length === ativos.length) causasGerais[c.texto] = true; });
  var pj = f.regime === "PRESTADOR_PJ";
  var periodo = L.periodoDe(comp);
  var fechada = L.periodoFechado(comp);

  var totais = ativos.reduce(function (acc, x) {
    var c = L.calcular(x, comp);
    acc.liquido += c.liquido; acc.custo += c.custoEmpregador;
    if (x.regime === "PRESTADOR_PJ") acc.prestadores++;
    else if (x.regime === "ESTAGIARIO") acc.estagiarios++;
    else acc.clt++;
    if (c.avisos.some(function (a) { return a.nivel === "divergencia"; })) acc.divergentes++;
    return acc;
  }, { liquido: 0, custo: 0, divergentes: 0, clt: 0, prestadores: 0, estagiarios: 0 });

  var html = T.cabecalho("Folha de " + L.competenciaBR(comp),
    "Valores, pessoas e divergências do mês.");

  if (fechada) {
    html += '<div class="aviso-tela"><span aria-hidden="true">✓</span><div>' +
      "Competência <strong>fechada</strong>. O movimento não pode mais ser alterado — " +
      "reabra em Fechamento Mensal se precisar corrigir algo.</div></div>";
  } else if (!periodo) {
    html += '<div class="aviso-tela"><span aria-hidden="true">·</span><div>' +
      L.competenciaBR(comp) + " ainda não foi aberta. Prévia pelo cadastro — abra em Fechamento Mensal para lançar o movimento.</div></div>";
  }

  html += '<div class="grade-kpi">' + [
    { rotulo: "Líquido a pagar", valor: L.brl(totais.liquido) },
    { rotulo: "Custo total", valor: L.brl(totais.custo) },
    // Conta CAUSAS, não pessoas: "43 com divergência" mandava abrir 43 fichas
    // quando o que havia era um aviso só, repetido 43 vezes.
    { rotulo: "Divergências", valor: String(causas.length), tom: causas.length ? "critico" : "" },
    { rotulo: "Pessoas na folha", valor: String(ativos.length),
      nota: totais.clt + " CLT" + (totais.prestadores ? " · " + totais.prestadores + " PJ" : "") + (totais.estagiarios ? " · " + totais.estagiarios + " estágio" : "") }
  ].map(U.kpiHtml).join("") + "</div>";

  // Lista própria em vez de `<select>`: com 43 nomes, a lista nativa é
  // desenhada pelo sistema operacional (CSS não alcança) e não tem busca.
  var seletor = U.seletorRico({
    rotulo: "Funcionário da folha em exibição",
    valor: f.id,
    itens: ativos.map(function (x) {
      return { valor: x.id, rotulo: x.nome, detalhe: x.cargo || "" };
    })
  });

  // Prestador é pago por nota fiscal; estagiário não tem hora extra, falta
  // nem banco de horas no sentido da CLT — nenhum dos dois lança movimento.
  var semMovimento = f.regime === "ESTAGIARIO";
  var acaoMovimento = (!semMovimento
    ? (T.podeEditar() && !fechada
        ? '<button class="botao miudo" data-acao="lancar-movimento" data-id="' + f.id + '">Lançar movimento</button>'
        : (fechada ? '<span class="pastilha neutro">competência fechada</span>' : ""))
    : "") +
    (pj ? "" : '<button class="botao miudo" data-acao="imprimir-holerite" data-id="' + f.id + '">Holerite</button>');

  var avisos = r.avisos.map(function (a) {
    return '<div class="faixa-aviso ' + a.nivel + '"><span aria-hidden="true">' +
      (a.nivel === "divergencia" ? "!" : a.nivel === "info" ? "·" : "▲") +
      "</span><span>" + U.esc(a.texto) + "</span></div>";
  }).join("");

  var resumo = '<dl class="resumo">' + [
    { r: pj ? "Valor da nota" : "Proventos", v: r.proventos },
    { r: pj ? "Retenções" : "Descontos", v: r.descontos },
    { r: pj ? "Líquido da nota" : "Líquido a receber", v: r.liquido, forte: true },
    { r: "Custo p/ a escola", v: r.custoEmpregador }
  ].concat((function () {
    // CLT, Ticket e MEI separados: o que é CLT é CLT, o que é MEI é MEI.
    var d = pj ? null : L.divisaoPagamento(f);
    if (!d || !(d.ticket > 0 || d.mei > 0)) return [];
    var extra = [{ r: "CLT (folha)", v: d.clt }];
    if (d.ticket > 0) extra.push({ r: L.ticketDesconta(f) ? "Ticket (descontado)" : "Ticket (soma)", v: d.ticket });
    if (d.mei > 0) extra.push({ r: "MEI (nota fiscal)", v: d.mei });
    if (d.meiDentro) extra.push({ r: "Líquido CLT", v: Math.max(0, r.liquido - d.mei), forte: true });
    return extra;
  })()).map(function (i) {
    return '<div class="resumo-item' + (i.forte ? " forte" : "") + '"><dt>' + i.r +
      '</dt><dd class="num">' + L.brl(i.v) + "</dd></div>";
  }).join("") + "</dl>";

  var rubricas = U.tabelaHtml([
    { rotulo: "Cód.", classe: "cod", conteudo: function (x) { return x.cod; } },
    { rotulo: "Rubrica", conteudo: function (x) {
      return U.esc(x.desc) + (x.tipo === "E" ? ' <span class="rotulo-encargo">encargo</span>' : ""); } },
    { rotulo: "Referência", conteudo: function (x) { return U.esc(x.ref); } },
    { rotulo: "Valor", direita: true, conteudo: function (x) {
      var c = x.tipo === "P" ? "v-provento" : x.tipo === "D" ? "v-desconto" : "v-encargo";
      return '<span class="num ' + c + '">' + (x.tipo === "D" ? "− " : "") + L.brl(x.valor) + "</span>"; } }
  ], r.rubricas.map(function (x, i) { return Object.assign({ id: "r" + i }, x); }));

  var etiquetaRegime = f.regime === "HORISTA_AULA" ? "Horista — hora-aula"
    : f.regime === "MENSALISTA" ? (f.tipoContrato === "APRENDIZ" ? "Mensalista — aprendiz"
        : f.tipoContrato === "TEMPORARIO" ? "Mensalista — temporário" : "Mensalista")
    : f.regime === "HORISTA_RELOGIO" ? "Horista — hora batida"
    : f.regime === "ESTAGIARIO" ? "Estagiário — sem vínculo (Lei 11.788)"
    : "Prestador " + (f.enquadramento || "MEI") + " — não é folha";

  html += T.observacoesHtml();

  /**
   * A folha inteira, em uma tabela. Ver um professor por vez obriga a clicar
   * 43 vezes para conferir o mês — e conferência é justamente comparar, achar
   * quem está fora da linha. O detalhe de cada um continua abaixo; esta é a
   * visão que faltava.
   */
  if (causas.length) {
    html += '<div class="painel"><div class="painel-topo"><h2>O que bloqueia o fechamento</h2>' +
      '<span class="contexto">' + causas.length + " causa(s)</span></div>" +
      '<div class="painel-corpo"><ol class="causas">' +
      causas.map(function (c) {
        var todos = c.pessoas.length === L.ativos().length;
        return "<li><div class=\"causa-texto\">" + U.esc(c.texto) + "</div>" +
          '<div class="causa-quem">' +
          (todos
            ? "Atinge todos os " + c.pessoas.length + " da folha."
            : c.pessoas.length + " pessoa(s): " +
              U.esc(c.pessoas.slice(0, 4).map(function (p) { return p.nome; }).join(" · ")) +
              (c.pessoas.length > 4 ? " e mais " + (c.pessoas.length - 4) : "")) +
          "</div>" +
          (c.acao ? '<button class="botao miudo" data-ir="' + c.acao + '">Resolver agora</button>' : "") +
          "</li>";
      }).join("") + "</ol></div></div>";
  }

  html += T.conferenciaMesHtml(comp, ativos);

  /**
   * Totais por categoria. O custo de professor escala com a grade de aulas; o
   * de colaborador, com o quadro fixo. Somados, esconde-se qual dos dois
   * cresceu de um mês para o outro.
   */
  var porCategoria = L.totaisPorCategoria(comp);
  if (porCategoria.length > 1) {
    html += '<div class="painel"><div class="painel-topo"><h2>Por categoria</h2>' +
      '<span class="contexto">professores e colaboradores somam separado</span></div>' +
      '<div class="painel-corpo"><div class="cat-grade">' +
      porCategoria.map(function (t) {
        return '<div class="cat-bloco"><div class="cat-nome">' + U.esc(t.nome) +
          '<span class="cat-conta">' + t.pessoas + "</span></div>" +
          '<dl class="cat-valores">' +
          "<div><dt>Líquido</dt><dd class=\"num\">" + L.brl(t.liquido) + "</dd></div>" +
          "<div><dt>Custo</dt><dd class=\"num\">" + L.brl(t.custo) + "</dd></div>" +
          "</dl></div>";
      }).join("") + "</div></div></div>";
  }

  if (T.filtros.folhaVisao === "ticket") return html + T.painelTicket(ativos);
  if (T.filtros.folhaVisao === "mei") return html + T.painelMei(ativos);

  var totalFiltrado = ativosNaFolha.reduce(function (a, x) { return a + L.calcular(x).liquido; }, 0);
  html += '<div class="painel"><div class="painel-topo"><h2>Folha completa</h2>' +
    '<span class="contexto">' + ativosNaFolha.length + " pessoa(s) · clique para abrir o detalhe</span></div>" +
    '<div class="painel-corpo" style="padding-top:0;padding-bottom:0">' + T.abasFolha(ativos) +
    '<div class="barra-ferramentas" style="padding:0 0 14px">' +
    '<input type="search" data-filtro="folhaBusca" aria-label="Buscar na folha por nome, cargo ou matrícula" placeholder="Buscar nome ou cargo" value="' + U.esc(T.filtros.folhaBusca || "") + '">' +
    U.seletorRico({
      rotulo: "Filtrar por regime de pagamento", valor: vinculoFiltro,
      itens: [{ valor: "", rotulo: "Todos os regimes" }].concat(
        L.gruposFiltroPresentes(ativos).map(function (g) { return { valor: g, rotulo: g }; })),
      atributos: { filtro: "folhaVinculo" }
    }) +
    // Cada empresa é um CNPJ diferente de verdade (Hotel, ServJU, ServMA)
    // — separar por ela é o mesmo tipo de corte que separar por regime.
    U.seletorRico({
      rotulo: "Filtrar por empresa", valor: empresaFiltroFolha,
      itens: [{ valor: "", rotulo: "Todas as empresas" }].concat(
        L.empresasPresentes(ativos).map(function (e) { return { valor: e, rotulo: e }; })),
      atributos: { filtro: "folhaEmpresa" }
    }) +
    '<span class="direita">' +
    (vinculoFiltro || empresaFiltroFolha || buscaFolha
      ? '<span class="pastilha destaque">líquido do grupo: ' + L.brl(totalFiltrado) + "</span> "
      : "") +
    (L.USA_BACKEND && T.podeEditar() && !L.periodoFechado(L.competenciaAberta())
      ? '<button class="botao miudo primario" data-acao="calcular-folha">Calcular folha</button> ' : "") +
    '<button class="botao miudo" data-acao="exportar-folha">Excel</button> ' +
    '<button class="botao miudo" data-acao="imprimir-holerites">Holerites' +
    (vinculoFiltro || empresaFiltroFolha || buscaFolha ? " do grupo" : "") + "</button></span>" +
    "</div></div>" +
    U.tabelaHtml([
      { rotulo: "Funcionário", conteudo: function (x) {
        var mods = L.modulosDe(x);
        return '<div class="principal">' + U.esc(T.nomeExibicao(x.nome)) + "</div>" +
          '<div class="secundario">' + U.esc(x.cargo || "") +
          (mods.length ? " · " + U.esc(mods.map(function (m) { return m.modulo + " " + m.aulas; }).join(" · ")) : "") +
          (function () { var pr = L.projetoDe(x, L.competenciaAberta(), L.calcular(x).rubricas);
            return pr.aulas > 0 ? ' · <strong>+' + pr.aulas + ' aula(s) de projeto</strong>' : ""; })() +
          "</div>"; } },
      { rotulo: "Empresa", secundaria: true, conteudo: function (x) { return U.esc(L.empresaDe(x)); } },
      { rotulo: "Regime", secundaria: true, conteudo: function (x) {
        return U.esc(L.grupoPagamentoDe(x)); } },
      { rotulo: "CLT / Ticket / MEI", secundaria: true, conteudo: function (x) {
        // Cada canal na sua linha: o que é CLT é CLT, o que é MEI é MEI.
        var d = L.divisaoPagamento(x);
        if (!d || !(d.ticket > 0 || d.mei > 0 || d.meiADefinir)) return "";
        var it = [["CLT", d.clt]];
        if (d.ticket > 0) it.push([L.ticketDesconta(x) ? "Ticket (desc.)" : "Ticket (soma)", d.ticket]);
        if (d.mei > 0) it.push(["MEI", d.mei]);
        else if (d.meiADefinir) it.push(["MEI", "a definir"]);
        return '<dl class="vinculo-valores">' + it.map(function (i) {
          return "<dt>" + U.esc(i[0]) + "</dt><dd>" + U.esc(typeof i[1] === "number" ? L.brl(i[1]) : i[1]) + "</dd>"; }).join("") + "</dl>"; } },
      { rotulo: "Projeto", direita: true, secundaria: true, conteudo: function (x) {
        var pr = L.projetoDe(x, L.competenciaAberta(), L.calcular(x).rubricas);
        return pr.aulas > 0 ? '<span class="num">' + L.brl(pr.valor) + '</span><div class="secundario">' + pr.aulas + " aula(s)/sem</div>" : ""; } },
      { rotulo: "Proventos", direita: true, conteudo: function (x) {
        return '<span class="num">' + L.brl(L.calcular(x).proventos) + "</span>"; } },
      { rotulo: "Descontos", direita: true, secundaria: true, conteudo: function (x) {
        var r = L.calcular(x);
        var d = r.proventos - r.liquido;
        // Espaço comum entre o "−" e o valor quebra linha quando a coluna
        // aperta — "−" sozinho numa linha e "R$ 1.307,95" na de baixo,
        // enquanto valores mais curtos cabem inteiros e não quebram. Espaço
        // fixo ( ) mantém os dois sempre juntos.
        return '<span class="num' + (d > 0 ? " v-desconto" : "") + '">' + (d > 0 ? "− " : "") + L.brl(d) + "</span>"; } },
      { rotulo: "Líquido", direita: true, conteudo: function (x) {
        return '<span class="num" style="font-weight:500;color:var(--titulo)">' + L.brl(L.calcular(x).liquido) + "</span>"; } },
      { rotulo: "Custo p/ escola", direita: true, secundaria: true, conteudo: function (x) {
        return '<span class="num">' + L.brl(L.calcular(x).custoEmpregador) + "</span>"; } },
      { rotulo: "", direita: true, conteudo: function (x) {
        var temDiv = L.calcular(x).avisos.some(function (a) { return a.nivel === "divergencia" && !causasGerais[a.texto]; });
        return temDiv ? '<span class="pastilha critico">divergência</span>' : ""; } }
    ], ativosNaFolha, {
      aoClicarLinha: true, selecionada: mostrarDetalhe ? f.id : null,
      tituloVazio: "Ninguém com esse filtro", textoVazio: "Troque o filtro ou a busca para ver as demais pessoas da folha."
    }) + "</div>";

  if (!mostrarDetalhe) return html;

  html += '<div class="painel" id="detalhe-folha"><div class="painel-topo"><h2>' + U.esc(f.nome) + "</h2>" +
    '<span class="pastilha ' + (semMovimento ? "destaque" : "neutro") + '">' + U.esc(etiquetaRegime) + "</span>" +
    '<div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
    acaoMovimento + seletor + "</div></div>" + avisos + resumo + rubricas + "</div>";

  // O fundamento legal de cada passo continua em `p.fundamento` (auditoria),
  // mas não vai para a tela: aqui só o que o RH precisa para conferir a conta.
  html += '<details class="relatorio-detalhe memoria-detalhe"><summary>Memória de cálculo <span>como cada valor foi calculado</span></summary>' +
    U.painelHtml("Memória de cálculo", "",
    r.memoria.map(function (p) {
      return '<div class="passo-calc"><div class="t">' + U.esc(p.titulo) + "</div>" +
        '<div class="r num">' + L.brl(p.resultado) + "</div>" +
        '<div class="f">' + U.esc(p.formula) + " → " + U.esc(p.substituicao) + "</div></div>";
    }).join("")) + '</details>';

  return html;
};

// `conferir-tabelas` agora vive em telas-c.js e leva para a tela de cadastro:
// conferir deixou de ser um botão só de "sim, confiro" e virou cadastro por
// vigência, com a tabela do exercício digitada pelo RH.


/** O RH editou algo sensível: já vale, mas a Direção vai aceitar ou recusar. */
L.aoEnviarParaAprovacao = function (ap) {
  // Depois do aviso da própria tela de origem ("Ticket salvo..."), para este não ser coberto.
  setTimeout(function () {
    U.avisar(ap.executaDepois
      ? "Pedido de exclusão enviado para a Direção (#" + ap.numero + "). O cadastro só sai quando ela aceitar."
      : "Alteração salva e já valendo. Enviada para aprovação da Direção (#" + ap.numero + "): se for recusada, volta como estava.");
  }, 500);
  T._solicitacoesCarregadas = false;
};
