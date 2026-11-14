/* ============================================================================
   Interface: átomo 3D, componentes genéricos (tabela, formulário, modal).
   ========================================================================== */

var U = {};

U.esc = function (s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
};
/** Texto para comparar em buscas: sem acento, sem maiúscula, sem espaço nas pontas. */
U.paraBusca = function (texto) {
  return String(texto === null || texto === undefined ? "" : texto)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};
U.el = function (id) { return document.getElementById(id); };
U.todos = function (sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); };

// ---------------------------------------------------------------- ícones
// Traço próprio em vez de uma biblioteca externa (Lucide etc.): o artefato
// publicado não pode buscar fonte de ícone nem script fora da lista
// permitida. Mesma família visual — 24×24, traço 1.8, cantos redondos.
U.ICONES = {
  dashboard: '<rect x="3" y="3" width="7.5" height="9" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="5" rx="1.6"/>' +
    '<rect x="13.5" y="10.5" width="7.5" height="10.5" rx="1.6"/><rect x="3" y="14.5" width="7.5" height="6.5" rx="1.6"/>',
  aprovacoes: '<rect x="5" y="3.5" width="14" height="17" rx="2.2"/><path d="M9 3.5h6v1.6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V3.5Z"/>' +
    '<path d="M8.3 13.2l2.1 2.1 4.3-4.6"/>',
  pessoas: '<circle cx="9" cy="8.2" r="3.3"/><path d="M3.3 20.2c0-3.6 2.5-6 5.7-6s5.7 2.4 5.7 6"/>' +
    '<circle cx="17.1" cy="8.6" r="2.5"/><path d="M15.7 14.4c2.5.4 4.2 2.6 4.2 5.6"/>',
  financeiro: '<rect x="3" y="6.5" width="18" height="12.5" rx="2.2"/><path d="M3 10h18"/>' +
    '<circle cx="16.6" cy="14.6" r="1.4"/>',
  operacao: '<rect x="4.5" y="3.5" width="15" height="17" rx="2.2"/><path d="M9 3.5h6v1.6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V3.5Z"/>' +
    '<path d="M8 12h8M8 15.3h8M8 18.6h4.5"/>',
  // Ícone individual de Funcionários — distinto do ícone de grupo "pessoas"
  // (duas cabeças), que agora representa só a categoria na cápsula.
  pessoa: '<rect x="4.5" y="3.5" width="15" height="17" rx="2.4"/><circle cx="12" cy="10.3" r="2.6"/>' +
    '<path d="M8 16.6c.7-1.8 2.1-2.7 4-2.7s3.3.9 4 2.7"/>',
  // Ícone individual de Solicitações — distinto do ícone de grupo "operacao".
  solicitacao: '<path d="M5 6.5h14l1.5 6.5v6a1.4 1.4 0 0 1-1.4 1.4H4.9A1.4 1.4 0 0 1 3.5 19v-6Z"/>' +
    '<path d="M3.5 13h4.6l1.6 2.6h4.6l1.6-2.6h4.6"/>',
  lotacao: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M9 4.5v15M14.5 4.5v15"/>',
  banco: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.3l3.6 2.1"/>',
  folha: '<path d="M6 3.5h9l3.5 3.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M15 3.5V7h3.5"/>' +
    '<path d="M8 12.5h8M8 15.8h8M8 19.1h5"/>',
  ferias: '<rect x="3.5" y="4.5" width="17" height="16" rx="2.2"/><path d="M3.5 9.5h17"/><path d="M8 3v3M16 3v3"/>' +
    '<circle cx="8" cy="14" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="14" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="16" cy="14" r="1.1" fill="currentColor" stroke="none"/>',
  contas: '<rect x="2.5" y="5.5" width="19" height="13" rx="2.2"/><path d="M2.5 9.5h19"/><path d="M6 14.3h4"/>',
  fechamento: '<circle cx="12" cy="12" r="9"/><path d="M8.3 12.2l2.3 2.3 5.1-5.3"/>',
  fornecedores: '<path d="M4.5 20.5V6.2a1 1 0 0 1 1-1h6.4a1 1 0 0 1 1 1V20.5"/><path d="M12.9 20.5V10.4a1 1 0 0 1 1-1h4.6a1 1 0 0 1 1 1v10.1"/>' +
    '<path d="M3 20.5h18"/><path d="M7.3 8.6h1M10.4 8.6h1M7.3 12h1M10.4 12h1M7.3 15.4h1M10.4 15.4h1"/>',
  contratos: '<path d="M6 3.5h9l3.5 3.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M15 3.5V7h3.5"/>' +
    '<path d="M7.8 15.5c1-1.4 1.7-1.4 2.4-.3.8 1.2 1.5 1.2 2.3 0 .8-1.2 1.5-1.2 2.3 0"/>',
  documentos: '<path d="M7 2.8h8l3.5 3.5V17a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3.8a1 1 0 0 1 1-1Z"/><path d="M15 2.8V6h3.2"/>' +
    '<path d="M4.5 6.5v14a1 1 0 0 0 1 1H16"/>',
  relatorios: '<path d="M4.5 20.5V13M11 20.5V7.5M17.5 20.5V10.8"/><path d="M2.5 20.5h19"/>',
  auditoria: '<rect x="5" y="3" width="14" height="18" rx="2.2"/><path d="M9 3h6v1.6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V3Z"/>' +
    '<circle cx="10.3" cy="13.6" r="2.3"/><path d="M12 15.3l2.2 2.2"/>',
  configuracoes: '<circle cx="7" cy="7" r="2.1"/><path d="M3 7h1.7M9.1 7H21"/>' +
    '<circle cx="16.4" cy="14.5" r="2.1"/><path d="M3 14.5h10.1M18.5 14.5H21"/>',
  ajuda: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.4a2.7 2.7 0 1 1 4.1 2.3c-1 .6-1.5 1.1-1.5 2.2"/><circle cx="12" cy="17.1" r=".15" fill="currentColor" stroke-width="2.6"/>',
  mais: '<path d="M12 4.5v15M4.5 12h15"/>',
  chevron: '<path d="M9 5.5l7 6.5-7 6.5"/>',
  tema: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M4.4 4.4l1.7 1.7M17.9 17.9l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.4 19.6l1.7-1.7M17.9 6.1l1.7-1.7"/>',
  sair: '<path d="M9 20.5H5.5a1.5 1.5 0 0 1-1.5-1.5V5a1.5 1.5 0 0 1 1.5-1.5H9"/><path d="M15.5 16.5L20.5 12l-5-4.5"/><path d="M20.2 12H9.5"/>',
  usuario: '<circle cx="12" cy="8.3" r="3.6"/><path d="M4.8 20.5c0-3.9 3.2-6.6 7.2-6.6s7.2 2.7 7.2 6.6"/>',
  fatia: '<path d="M12 4.5v6l4.5 2.7"/><circle cx="12" cy="12" r="9"/>'
};

/** Ícone em SVG embutido, 24×24, herda a cor do texto (currentColor). */
U.iconeSvg = function (chave, tamanho, classe) {
  var t = tamanho || 20;
  var miolo = U.ICONES[chave] || "";
  return '<svg width="' + t + '" height="' + t + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
    (classe ? ' class="' + classe + '"' : "") + ">" + miolo + "</svg>";
};

/**
 * Botão de cápsula com popover que abre ao lado (direita), fecha ao clicar
 * fora ou Esc. Um helper só para os cinco usos da lateral flutuante — grupo
 * de módulos, engrenagem, ajuda, "+" e avatar — em vez de repetir a mesma
 * abertura/fechamento cinco vezes.
 */
U.ligarPopoverCapsula = function (gatilho, painel) {
  function fechar() { painel.classList.add("oculto"); gatilho.setAttribute("aria-expanded", "false"); }
  function abrir() {
    // Só um popover de cápsula aberto por vez.
    U.todos(".capsula-popover").forEach(function (p) { if (p !== painel) p.classList.add("oculto"); });
    painel.classList.remove("oculto");
    gatilho.setAttribute("aria-expanded", "true");
  }
  gatilho.addEventListener("click", function (ev) {
    ev.stopPropagation();
    if (painel.classList.contains("oculto")) abrir(); else fechar();
  });
  document.addEventListener("click", function (ev) {
    if (!painel.contains(ev.target) && !gatilho.contains(ev.target)) fechar();
  });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") fechar(); });
  return { abrir: abrir, fechar: fechar };
};

U.ORBITA_SVG =
  '<svg class="orbita" viewBox="0 0 40 40" aria-hidden="true">' +
  '<g fill="none" stroke="currentColor" stroke-width="1.2" opacity=".5">' +
  '<ellipse cx="20" cy="20" rx="17" ry="7"/>' +
  '<ellipse cx="20" cy="20" rx="17" ry="7" transform="rotate(60 20 20)"/>' +
  '<ellipse cx="20" cy="20" rx="17" ry="7" transform="rotate(120 20 20)"/></g>' +
  '<circle cx="20" cy="20" r="3" fill="currentColor" opacity=".7"/></svg>';

// ---------------------------------------------------------------- tema

/**
 * Três estados: claro, escuro e "seguir o sistema" (sem data-theme). Os dois
 * botões alternam entre claro e escuro; a preferência fica no navegador de
 * quem usa, então cada gestor escolhe o seu.
 */
U.temaAtual = function () {
  var escolhido = document.documentElement.getAttribute("data-theme");
  if (escolhido) return escolhido === "dark" ? "escuro" : "claro";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
};

U.aplicarTema = function (tema, guardar) {
  document.documentElement.setAttribute("data-theme", tema === "escuro" ? "dark" : "light");
  if (guardar) {
    try { localStorage.setItem("hotel-tema", tema); } catch (e) { /* modo anônimo */ }
  }
  U.todos("[data-tema]").forEach(function (b) {
    b.setAttribute("aria-pressed", String(b.dataset.tema === tema));
  });
  if (U.redesenharAtomo) U.redesenharAtomo();
};

U.iniciarTema = function () {
  var guardado = null;
  try { guardado = localStorage.getItem("hotel-tema"); } catch (e) { /* modo anônimo */ }
  if (guardado === "claro" || guardado === "escuro") {
    U.aplicarTema(guardado, false);
  } else if (true) {
    // Acácia Hotel: sem escolha registrada, o padrão é o tema claro (pistache).
    U.aplicarTema("claro", false);
  } else {
    // Sem escolha registrada, segue o sistema — e continua seguindo se mudar.
    U.todos("[data-tema]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.tema === U.temaAtual()));
    });
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      if (!document.documentElement.getAttribute("data-theme")) {
        U.todos("[data-tema]").forEach(function (b) {
          b.setAttribute("aria-pressed", String(b.dataset.tema === U.temaAtual()));
        });
        if (U.redesenharAtomo) U.redesenharAtomo();
      }
    });
  }
  U.todos("[data-tema]").forEach(function (b) {
    b.addEventListener("click", function () { U.aplicarTema(b.dataset.tema, true); });
  });
};

// ---------------------------------------------------------------- átomo 3D
// Três órbitas em perspectiva, desenhadas em duas passadas (atrás do núcleo,
// núcleo, à frente) para a profundidade ser real e não sugerida.

U.iniciarAtomo = function () {
  var canvas = U.el("atomo");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var larg = 0, alt = 0, dpr = 1, rodando = true;

  function dimensionar() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    larg = canvas.clientWidth; alt = canvas.clientHeight;
    canvas.width = Math.round(larg * dpr); canvas.height = Math.round(alt * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function rotX(p, a) { var c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; }
  function rotY(p, a) { var c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; }
  function rotZ(p, a) { var c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; }

  var DIST = 900, SEG = 130, orbitas = [0, Math.PI / 3, (2 * Math.PI) / 3];
  function projetar(p, cx, cy) {
    var k = DIST / (DIST - p[2]);
    return { x: cx + p[0] * k, y: cy + p[1] * k, k: k, z: p[2] };
  }

  function desenhar(t) {
    ctx.clearRect(0, 0, larg, alt);
    var cx = larg * 0.5, cy = alt * 0.5;
    /**
     * O átomo já foi maior, quando o canvas tinha `height: 150%` e transbordava
     * a caixa. Aquele transbordo virava área rolável e fazia a tela de entrada
     * pedir rolagem — o elemento voltou a caber na caixa, mas o DESENHO não
     * precisa encolher junto: 0,46 × 1,5 devolve o mesmo tamanho de antes,
     * agora com as órbitas recortadas pela borda do canvas em vez de
     * empurrarem a página.
     */
    var raio = Math.min(larg, alt) * 0.69;
    if (raio <= 0) return;

    var giroY = t * 0.00016, giroX = -0.42 + Math.sin(t * 0.00011) * 0.13;
    var atras = [], frente = [], eletrons = [];

    for (var o = 0; o < orbitas.length; o++) {
      var pontos = [];
      for (var i = 0; i <= SEG; i++) {
        var ang = (i / SEG) * Math.PI * 2;
        var p = [Math.cos(ang) * raio, Math.sin(ang) * raio * 0.42, 0];
        p = rotZ(p, orbitas[o]); p = rotX(p, giroX); p = rotY(p, giroY);
        pontos.push(projetar(p, cx, cy));
      }
      for (var s = 0; s < SEG; s++) {
        (pontos[s].z < 0 ? atras : frente).push({ a: pontos[s], b: pontos[s + 1] });
      }
      var fase = t * 0.00042 + (o * Math.PI * 2) / 3;
      var pe = [Math.cos(fase) * raio, Math.sin(fase) * raio * 0.42, 0];
      pe = rotZ(pe, orbitas[o]); pe = rotX(pe, giroX); pe = rotY(pe, giroY);
      eletrons.push(projetar(pe, cx, cy));
    }

    // Traço de nanquim sobre papel: a órbita da frente é firme, a de trás
    // esmaece — profundidade por peso de linha, como numa gravura técnica.
    function traco(lista) {
      for (var i = 0; i < lista.length; i++) {
        var seg = lista[i];
        var prof = Math.max(0, Math.min(1, (seg.a.k - 0.86) / 0.3));
        ctx.globalAlpha = 0.07 + prof * 0.24;
        ctx.lineWidth = 0.5 + prof * 0.9;
        ctx.beginPath(); ctx.moveTo(seg.a.x, seg.a.y); ctx.lineTo(seg.b.x, seg.b.y); ctx.stroke();
      }
    }

    // No claro é nanquim azul sobre papel; no escuro, traço luminoso sobre
    // marinho. O motivo é o mesmo, a tinta é que inverte.
    var escuro = U.temaAtual() === "escuro";
    var linha = escuro ? "#7FA6DC" : "#0A2144";
    var nucleo = escuro ? "#CFE0F7" : "#0A2144";
    var halo = escuro ? "138, 180, 236" : "29, 82, 150";
    var eletron = escuro ? "#EFD9A0" : "#9A7B18";
    var brilho = escuro ? "240, 217, 160" : "200, 164, 77";

    ctx.strokeStyle = linha; ctx.lineCap = "round";
    traco(atras);

    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, raio * 0.26);
    g.addColorStop(0, "rgba(" + halo + ", " + (escuro ? 0.22 : 0.16) + ")");
    g.addColorStop(1, "rgba(" + halo + ", 0)");
    ctx.globalAlpha = 1; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, raio * 0.26, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = nucleo;
    ctx.beginPath(); ctx.arc(cx, cy, raio * 0.052, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(" + brilho + ", .55)";
    ctx.lineWidth = 1.1; ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(cx, cy, raio * 0.09, 0, Math.PI * 2); ctx.stroke();

    ctx.strokeStyle = linha;
    traco(frente);

    for (var e = 0; e < eletrons.length; e++) {
      var el = eletrons[e], r = 3 * el.k;
      ctx.globalAlpha = Math.max(0.45, Math.min(1, (el.k - 0.86) / 0.3));
      var ge = ctx.createRadialGradient(el.x, el.y, 0, el.x, el.y, r * 3.4);
      ge.addColorStop(0, "rgba(" + brilho + ", " + (escuro ? 0.45 : 0.34) + ")");
      ge.addColorStop(1, "rgba(" + brilho + ", 0)");
      ctx.fillStyle = ge;
      ctx.beginPath(); ctx.arc(el.x, el.y, r * 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = eletron;
      ctx.beginPath(); ctx.arc(el.x, el.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function quadro(ts) { if (rodando) { desenhar(ts); requestAnimationFrame(quadro); } }

  dimensionar();
  window.addEventListener("resize", function () { dimensionar(); if (reduzir) desenhar(6000); });
  if (reduzir) desenhar(6000); else requestAnimationFrame(quadro);

  U.pararAtomo = function () { rodando = false; };
  U.retomarAtomo = function () {
    if (rodando) return;
    rodando = true;
    if (reduzir) desenhar(6000); else requestAnimationFrame(quadro);
  };

  // Aba escondida não precisa animar. Sem isto o átomo continua consumindo
  // bateria com a tela de acesso aberta em segundo plano no celular.
  var pausadoPelaAba = false;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (rodando) { pausadoPelaAba = true; U.pararAtomo(); }
    } else if (pausadoPelaAba) {
      pausadoPelaAba = false;
      U.retomarAtomo();
    }
  });
  /** Trocar o tema com a animação parada exige um redesenho manual. */
  U.redesenharAtomo = function () { if (!rodando || reduzir) desenhar(6000); };
};

// ---------------------------------------------------------------- modal

var focoAnterior = null;

U.fecharModal = function () {
  U.el("camada-modal").innerHTML = "";
  document.body.style.overflow = "";
  // Devolve o foco a quem abriu o modal: sem isso o teclado volta para o
  // topo da página e quem navega sem mouse se perde a cada ação.
  if (focoAnterior && document.contains(focoAnterior)) {
    try { focoAnterior.focus(); } catch (e) { /* elemento já removido */ }
  }
  focoAnterior = null;
};

U.abrirModal = function (opcoes) {
  var camada = U.el("camada-modal");
  focoAnterior = document.activeElement;
  camada.innerHTML =
    '<div class="cortina" role="dialog" aria-modal="true" aria-label="' + U.esc(opcoes.titulo) + '">' +
      '<div class="modal' + (opcoes.largo ? " largo" : "") + '">' +
        '<div class="modal-topo"><h2>' + U.esc(opcoes.titulo) + '</h2>' +
          (opcoes.sub ? '<span class="sub">' + U.esc(opcoes.sub) + "</span>" : "") + "</div>" +
        '<div class="modal-corpo" id="modal-corpo">' + opcoes.corpo + "</div>" +
        '<div class="modal-rodape" id="modal-rodape"></div>' +
      "</div></div>";
  document.body.style.overflow = "hidden";

  // Campo do tipo "select" em U.campoHtml nasce como seletor rico com um
  // input escondido por trás — é o input que U.lerFormulario lê. O evento
  // "change" disparado nele mantém funcionando quem escuta o campo direto
  // (o formulário de funcionário remonta ao trocar o regime, por exemplo) —
  // sem isso, aquele listener nunca mais dispararia.
  U.ligarSeletores(camada, function (valor, caixa) {
    if (caixa.dataset.campoOculto) {
      var oculto = U.el(caixa.dataset.campoOculto);
      if (oculto) {
        oculto.value = valor;
        oculto.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  });

  var rodape = U.el("modal-rodape");
  (opcoes.acoes || []).forEach(function (a) {
    var b = document.createElement("button");
    b.className = "botao " + (a.classe || "") + (a.esquerda ? " esquerda" : "");
    b.textContent = a.rotulo;
    b.addEventListener("click", a.aoClicar);
    rodape.appendChild(b);
  });
  // Só o último botão da esquerda empurra o resto para a direita; os outros ficam juntos.
  var esquerdos = rodape.querySelectorAll(".esquerda");
  if (esquerdos.length) esquerdos[esquerdos.length - 1].classList.add("ultima-esquerda");

  camada.querySelector(".cortina").addEventListener("mousedown", function (ev) {
    if (ev.target === ev.currentTarget && !opcoes.obrigatorio) U.fecharModal();
  });

  var FOCAVEIS = 'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';

  // Escape fecha; Tab circula dentro do modal em vez de vazar para a página
  // atrás dele, que continua visível mas inacessível.
  document.addEventListener("keydown", function navegar(ev) {
    if (!U.el("camada-modal").querySelector(".cortina")) {
      document.removeEventListener("keydown", navegar);
      return;
    }
    if (ev.key === "Escape") {
      // Modal obrigatório só fecha pelos botões dele.
      if (opcoes.obrigatorio) { ev.preventDefault(); return; }
      U.fecharModal();
      document.removeEventListener("keydown", navegar);
      return;
    }
    if (ev.key !== "Tab") return;

    var itens = Array.prototype.filter.call(
      camada.querySelectorAll(FOCAVEIS),
      function (e) { return e.offsetParent !== null && !e.disabled; }
    );
    if (itens.length === 0) return;
    var primeiro = itens[0];
    var ultimo = itens[itens.length - 1];
    if (ev.shiftKey && document.activeElement === primeiro) {
      ev.preventDefault(); ultimo.focus();
    } else if (!ev.shiftKey && document.activeElement === ultimo) {
      ev.preventDefault(); primeiro.focus();
    }
  });

  // Campo oculto do seletor rico não é focável (é `type="hidden"`) — sem o
  // filtro abaixo, o foco inicial ia parar nele e ninguém via cursor nenhum.
  var alvo = camada.querySelector('input:not([type="hidden"]), select, textarea, .seletor-campo') ||
    camada.querySelector(".modal-rodape .botao");
  if (alvo) alvo.focus();
};

// ---------------------------------------------------------------- formulário
// Campos declarados por especificação; a validação e a leitura são genéricas.

U.campoHtml = function (c, valor) {
  var v = valor === undefined || valor === null ? (c.padrao !== undefined ? c.padrao : "") : valor;
  var id = "f-" + c.id;
  var corpo;
  if (c.tipo === "select") {
    // `<select>` nativo abre com a lista desenhada pelo sistema operacional
    // (mesmo problema resolvido no seletor de competência e no de
    // funcionário da folha) — aqui vira seletor rico com um campo escondido
    // atrás, que é o que U.lerFormulario continua lendo sem saber da troca.
    var itensSelect = (c.opcoes || []).map(function (o) {
      var val = o.valor !== undefined ? o.valor : o;
      var rot = o.rotulo !== undefined ? o.rotulo : o;
      return { valor: val, rotulo: rot };
    });
    // Mesma regra do nativo: sem opção correspondente, vale a primeira da
    // lista — o campo escondido nasce já alinhado com o que a tela mostra.
    var itemInicial = itensSelect.find(function (i) { return String(i.valor) === String(v); }) || itensSelect[0];
    var valorInicial = itemInicial ? itemInicial.valor : v;
    corpo = '<input type="hidden" id="' + id + '" value="' + U.esc(valorInicial) + '">' +
      U.seletorRico({ rotulo: c.rotulo, valor: valorInicial, itens: itensSelect, atributos: { campoOculto: id } });
  } else if (c.tipo === "textarea") {
    corpo = '<textarea id="' + id + '" placeholder="' + U.esc(c.dicaCampo || "") + '">' + U.esc(v) + "</textarea>";
  } else if (c.tipo === "arquivo") {
    corpo = '<input type="file" id="' + id + '"' + (c.aceita ? ' accept="' + U.esc(c.aceita) + '"' : "") + ">";
  } else {
    var tipoHtml = c.tipo === "moeda" || c.tipo === "numero" ? "number" : (c.tipo === "data" ? "date" : "text");
    var passo = c.tipo === "moeda" ? ' step="0.01"' : (c.tipo === "numero" ? ' step="' + (c.passo || "1") + '"' : "");
    corpo = '<input type="' + tipoHtml + '" id="' + id + '" value="' + U.esc(v) + '"' + passo +
      (c.min !== undefined ? ' min="' + c.min + '"' : "") +
      ' placeholder="' + U.esc(c.dicaCampo || "") + '">';
  }
  // `c.dica` não é mais exibida: o formulário fica só com rótulo e campo.
  // O que for indispensável vai como `dicaCampo` (texto de exemplo no campo).
  return '<label class="campo"><span>' + U.esc(c.rotulo) + "</span>" +
    corpo +
    '<span class="erro oculto" id="erro-' + c.id + '"></span></label>';
};

U.formularioHtml = function (campos, valores) {
  var v = valores || {};
  var html = "", i = 0;
  while (i < campos.length) {
    var c = campos[i];
    if (c.secao) { html += '<fieldset class="grupo"><legend class="grupo-legenda">' + U.esc(c.secao) + "</legend>"; i++; continue; }
    if (c.fimSecao) { html += "</fieldset>"; i++; continue; }
    if (c.meia) {
      // Campo sozinho, com a mesma largura de um campo de par (ex.: valor da hora-aula).
      html += '<div class="par">' + U.campoHtml(c, v[c.id]) + "<div></div></div>";
      i++; continue;
    }
    if (c.par && campos[i + 1] && !campos[i + 1].secao && !campos[i + 1].fimSecao) {
      html += '<div class="par">' + U.campoHtml(c, v[c.id]) + U.campoHtml(campos[i + 1], v[campos[i + 1].id]) + "</div>";
      i += 2; continue;
    }
    html += U.campoHtml(c, v[c.id]);
    i++;
  }
  return html;
};

U.lerFormulario = function (campos) {
  var valores = {}, ok = true;
  campos.forEach(function (c) {
    if (c.secao || c.fimSecao) return;
    var campo = U.el("f-" + c.id);
    if (!campo) return;
    var erro = U.el("erro-" + c.id);
    if (erro) { erro.classList.add("oculto"); campo.removeAttribute("aria-invalid"); }

    if (c.tipo === "arquivo") {
      var arquivo = campo.files && campo.files[0];
      if (c.obrigatorio && !arquivo) {
        if (erro) { erro.textContent = "Selecione um arquivo."; erro.classList.remove("oculto"); }
        campo.setAttribute("aria-invalid", "true");
        ok = false;
        return;
      }
      valores[c.id] = arquivo || null;
      return;
    }

    var bruto = campo.value.trim();
    if (c.obrigatorio && bruto === "") {
      if (erro) { erro.textContent = "Campo obrigatório."; erro.classList.remove("oculto"); }
      campo.setAttribute("aria-invalid", "true");
      ok = false;
      return;
    }
    if (c.tipo === "moeda") {
      valores[c.id] = bruto === "" ? 0 : L.reais(parseFloat(bruto.replace(",", ".")) || 0);
      if (c.obrigatorio && valores[c.id] <= 0) {
        if (erro) { erro.textContent = "Informe um valor maior que zero."; erro.classList.remove("oculto"); }
        campo.setAttribute("aria-invalid", "true");
        ok = false;
      }
    } else if (c.tipo === "numero") {
      valores[c.id] = bruto === "" ? 0 : parseFloat(bruto.replace(",", ".")) || 0;
    } else {
      valores[c.id] = bruto;
    }
  });
  return ok ? valores : null;
};

/** Modal de cadastro/edição pronto: monta, valida e devolve os valores. */
U.abrirFormulario = function (opcoes) {
  U.abrirModal({
    titulo: opcoes.titulo,
    sub: opcoes.sub,
    largo: opcoes.largo,
    corpo: U.formularioHtml(opcoes.campos, opcoes.valores),
    acoes: (opcoes.acoesExtras || []).concat([
      { rotulo: "Cancelar", aoClicar: U.fecharModal },
      { rotulo: opcoes.rotuloSalvar || "Salvar", classe: "primario", aoClicar: function () {
        var v = U.lerFormulario(opcoes.campos);
        if (!v) return;
        // As invariantes do domínio (as mesmas CHECK do banco) lançam. Melhor
        // mostrar a regra violada dentro do formulário do que deixar o clique
        // morrer no console sem o usuário entender por que nada aconteceu.
        try {
          opcoes.aoSalvar(v);
        } catch (e) {
          U.avisar(e && e.message ? e.message : "Não foi possível salvar.");
        }
      } }
    ])
  });
};

/**
 * Confirmação para ato irreversível. Existe para que "excluir" nunca seja um
 * clique só, e para que o texto diga a CONSEQUÊNCIA, não "tem certeza?" — quem
 * lê precisa saber o que perde, não ser perguntado se está acordado.
 */
U.confirmar = function (opcoes) {
  U.abrirModal({
    titulo: opcoes.titulo,
    sub: opcoes.sub,
    corpo: '<p style="margin:0;color:var(--tinta-media);line-height:1.6">' +
      U.esc(opcoes.texto) + "</p>",
    acoes: [
      { rotulo: opcoes.rotuloCancelar || "Cancelar", aoClicar: U.fecharModal },
      { rotulo: opcoes.rotulo || "Confirmar", classe: opcoes.classe || "perigo", aoClicar: function () {
        U.fecharModal();
        opcoes.aoConfirmar();
      } }
    ]
  });
};

// ---------------------------------------------------------------- tabela

U.tabelaHtml = function (colunas, linhas, opcoes) {
  var o = opcoes || {};
  if (linhas.length === 0) {
    return U.vazioHtml(o.tituloVazio || "Nada cadastrado ainda", o.textoVazio || "");
  }
  var cab = colunas.map(function (c) {
    return '<th' + (c.direita ? ' class="direita"' : "") + ">" + U.esc(c.rotulo) + "</th>";
  }).join("");
  var corpo = linhas.map(function (linha, indice) {
    var celulas = colunas.map(function (c) {
      var classes = [];
      if (c.direita) classes.push("direita");
      if (c.classe) classes.push(c.classe);
      // Coluna de apoio: some no celular, onde cada linha vira cartão e a
      // lista inteira ficaria quilométrica.
      if (c.secundaria) classes.push("col-secundaria");
      // `data-rotulo` carrega o cabeçalho para dentro da célula: no celular a
      // tabela vira lista de cartões e cada valor precisa dizer o que é.
      return "<td" + (classes.length ? ' class="' + classes.join(" ") + '"' : "") +
        ' data-rotulo="' + U.esc(c.rotulo || "") + '">' +
        c.conteudo(linha, indice) + "</td>";
    }).join("");
    // `selecionada` marca a linha que está aberta no detalhe: sem isso, quem
    // rola de volta não sabe de quem era o número que acabou de ver.
    var classes = [];
    if (o.aoClicarLinha) classes.push("clicavel");
    if (o.selecionada && o.selecionada === linha.id) classes.push("selecionada");
    return "<tr" + (classes.length ? ' class="' + classes.join(" ") + '"' : "") +
      (o.aoClicarLinha ? ' data-linha="' + U.esc(linha.id) + '"' : "") + ">" + celulas + "</tr>";
  }).join("");
  var busca = o.buscaLocal
    ? '<div class="lista-pesquisavel"><div class="lista-busca"><label><span>Buscar nesta lista</span>' +
      '<input type="search" data-busca-lista aria-label="Buscar nesta lista" placeholder="' +
      U.esc(o.buscaLocal) + '" autocomplete="off"></label>' +
      '<span class="lista-busca-contagem" aria-live="polite">' + linhas.length + ' registros</span></div>'
    : "";
  return busca + '<div class="rolagem"><table><thead><tr>' + cab + "</tr></thead><tbody>" + corpo +
    '</tbody></table></div>' + (o.buscaLocal
      ? '<p class="lista-sem-resultados" hidden>Nenhum resultado para esta busca.</p></div>' : "");
};

U.kpiHtml = function (k) {
  return '<button class="kpi ' + (k.tom || "") + (k.hero ? " hero" : "") + '"' + (k.destino ? ' data-ir="' + k.destino + '"' : " data-inerte") + '>' +
    '<div class="kpi-rotulo">' + U.esc(k.rotulo) + "</div>" +
    '<div class="kpi-valor num' + (k.vazio ? " vazio" : "") + '">' + U.esc(k.valor) + "</div>" +
    '<div class="kpi-nota">' + U.esc(k.nota) + "</div></button>";
};

U.painelHtml = function (titulo, contexto, corpo, acoes) {
  return '<div class="painel"><div class="painel-topo"><h2>' + U.esc(titulo) + "</h2>" +
    (acoes || "") +
    (contexto ? '<span class="contexto">' + U.esc(contexto) + "</span>" : "") +
    "</div>" + corpo + "</div>";
};

/** Confirmação breve de que a ação surtiu efeito, sem interromper o fluxo. */
U.avisar = function (texto) {
  var antigo = U.el("aviso-flutuante");
  if (antigo) antigo.remove();
  var el = document.createElement("div");
  el.id = "aviso-flutuante";
  el.className = "aviso-flutuante";
  el.setAttribute("role", "status");
  el.textContent = texto;
  document.body.appendChild(el);
  // Frase longa precisa de tempo para ser lida; clicar fecha.
  el.addEventListener("click", function () { el.remove(); });
  setTimeout(function () { if (el.parentNode) el.remove(); }, Math.min(16000, Math.max(4200, String(texto).length * 75)));
};

U.vazioHtml = function (titulo, texto, acao) {
  return '<div class="vazio-bloco"><span class="vazio-sinal" aria-hidden="true">—</span>' +
    '<div class="vazio-texto"><h3>' + U.esc(titulo) + "</h3>" +
    (texto ? "<p>" + U.esc(texto) + "</p>" : "") + "</div>" +
    (acao ? '<button class="botao primario" data-acao="' + U.esc(acao.acao) + '">' + U.esc(acao.rotulo) + "</button>" : "") + "</div>";
};

// ---------------------------------------------------------------- seletor rico
//
// A lista aberta de um `<select>` nativo é desenhada pelo sistema operacional:
// CSS não alcança. Com 43 professores, além de destoar do resto, ela obriga a
// rolar uma lista longa sem busca. Este componente resolve os dois: desenho
// próprio e filtro ao digitar.
//
// Acessibilidade não é opcional aqui — o nativo já vinha com teclado e leitor
// de tela de graça, e trocá-lo por algo pior seria regressão:
//   • role="combobox" + listbox, com aria-expanded e aria-activedescendant
//   • setas, Home/End, Enter, Esc e digitação para filtrar
//   • foco volta ao botão ao fechar

U.seletorRico = function (opcoes) {
  var id = "sel-" + Math.random().toString(36).slice(2, 8);
  var itens = opcoes.itens || [];
  var atual = itens.find(function (i) { return i.valor === opcoes.valor; }) || itens[0];
  if (!atual) return "";

  // Atributos extras (filtro, campo oculto, id de quem a linha é) ficam no
  // invólucro: é o que deixa QUEM ESCUTA a escolha genérico — não é o
  // componente que precisa saber se é um filtro de tela ou um campo de
  // formulário, é quem religa depois.
  var extras = "";
  if (opcoes.atributos) {
    Object.keys(opcoes.atributos).forEach(function (k) {
      // `dataset.acaoInline` só lê de volta um atributo `data-acao-inline`
      // (kebab-case) — em camelCase direto no HTML o navegador não faz a
      // ponte, e quem religasse com `.dataset` nunca acharia o valor.
      var chave = k.replace(/([A-Z])/g, "-$1").toLowerCase();
      extras += " data-" + chave + '="' + U.esc(opcoes.atributos[k]) + '"';
    });
  }

  return '<div class="seletor-rico" id="' + id + '" data-seletor="1"' + extras + '>' +
    '<button type="button" class="seletor-campo" role="combobox" aria-expanded="false" ' +
    'aria-haspopup="listbox" aria-label="' + U.esc(opcoes.rotulo || "Selecionar") + '">' +
    '<span class="seletor-valor">' + U.esc(atual.rotulo) + "</span>" +
    '<span class="seletor-seta" aria-hidden="true"></span></button>' +
    '<div class="seletor-painel oculto">' +
    (itens.length > 8
      ? '<input type="search" class="seletor-busca" placeholder="Buscar…" aria-label="Buscar na lista">'
      : "") +
    '<ul class="seletor-lista" role="listbox">' +
    itens.map(function (i, n) {
      return '<li role="option" id="' + id + "-o" + n + '" data-valor="' + U.esc(i.valor) + '"' +
        (i.valor === atual.valor ? ' aria-selected="true"' : ' aria-selected="false"') + ">" +
        U.esc(i.rotulo) +
        (i.detalhe ? '<span class="seletor-detalhe">' + U.esc(i.detalhe) + "</span>" : "") +
        "</li>";
    }).join("") +
    "</ul></div></div>";
};

/** Liga o comportamento dos seletores ricos presentes em `raiz`. */
U.ligarSeletores = function (raiz, aoEscolher) {
  U.todos("[data-seletor]", raiz).forEach(function (caixa) {
    var campo = caixa.querySelector(".seletor-campo");
    var painel = caixa.querySelector(".seletor-painel");
    var busca = caixa.querySelector(".seletor-busca");
    var lista = caixa.querySelector(".seletor-lista");
    var opcoesTodas = Array.prototype.slice.call(lista.querySelectorAll("li"));
    var ativo = opcoesTodas.findIndex(function (o) { return o.getAttribute("aria-selected") === "true"; });
    if (ativo < 0) ativo = 0;

    function visiveis() {
      return opcoesTodas.filter(function (o) { return !o.classList.contains("oculto"); });
    }
    function marcar(indice) {
      var lst = visiveis();
      if (!lst.length) return;
      indice = Math.max(0, Math.min(indice, lst.length - 1));
      lst.forEach(function (o) { o.classList.remove("ativo"); });
      var alvo = lst[indice];
      alvo.classList.add("ativo");
      campo.setAttribute("aria-activedescendant", alvo.id);
      // `block: nearest` rola só o necessário: `center` faria a lista pular a
      // cada seta, e quem navega por teclado perde a referência.
      alvo.scrollIntoView({ block: "nearest" });
      ativo = opcoesTodas.indexOf(alvo);
    }
    function indiceVisivelDoAtivo() {
      var lst = visiveis();
      var el = opcoesTodas[ativo];
      var i = lst.indexOf(el);
      return i < 0 ? 0 : i;
    }
    function abrir() {
      painel.classList.remove("oculto");
      campo.setAttribute("aria-expanded", "true");
      marcar(indiceVisivelDoAtivo());
      if (busca) { busca.value = ""; filtrar(""); busca.focus(); }
    }
    function fechar(devolverFoco) {
      painel.classList.add("oculto");
      campo.setAttribute("aria-expanded", "false");
      campo.removeAttribute("aria-activedescendant");
      if (devolverFoco) campo.focus();
    }
    function escolher(el) {
      opcoesTodas.forEach(function (o) { o.setAttribute("aria-selected", "false"); });
      el.setAttribute("aria-selected", "true");
      caixa.querySelector(".seletor-valor").textContent = el.childNodes[0].textContent.trim();
      fechar(true);
      if (aoEscolher) aoEscolher(el.dataset.valor, caixa);
    }
    function filtrar(termo) {
      var t = L.semAcento(termo.trim());
      opcoesTodas.forEach(function (o) {
        var casa = !t || L.semAcento(o.textContent).indexOf(t) !== -1;
        o.classList.toggle("oculto", !casa);
      });
      marcar(0);
    }

    campo.addEventListener("click", function () {
      if (painel.classList.contains("oculto")) abrir(); else fechar(true);
    });
    campo.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown" || ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault(); abrir();
      }
    });
    if (busca) {
      busca.addEventListener("input", function () { filtrar(busca.value); });
    }
    (busca || painel).addEventListener("keydown", function (ev) {
      var lst = visiveis();
      if (ev.key === "ArrowDown") { ev.preventDefault(); marcar(indiceVisivelDoAtivo() + 1); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); marcar(indiceVisivelDoAtivo() - 1); }
      else if (ev.key === "Home") { ev.preventDefault(); marcar(0); }
      else if (ev.key === "End") { ev.preventDefault(); marcar(lst.length - 1); }
      else if (ev.key === "Enter") { ev.preventDefault(); if (lst.length) escolher(lst[indiceVisivelDoAtivo()]); }
      else if (ev.key === "Escape") { ev.preventDefault(); fechar(true); }
      else if (ev.key === "Tab") { fechar(false); }
    });
    lista.addEventListener("click", function (ev) {
      var li = ev.target.closest("li");
      if (li) escolher(li);
    });
  });
};

/**
 * Fechar o seletor ao clicar fora é UM handler no documento, ligado uma vez.
 * Antes cada seletor ligava o seu, a cada render — e a tela de Funcionários
 * re-renderiza a cada tecla digitada na busca. Digitar um nome deixava
 * dezenas de handlers vivos, cada um segurando na memória a árvore de DOM
 * daquele render.
 */
document.addEventListener("click", function (ev) {
  U.todos("[data-seletor]").forEach(function (caixa) {
    if (caixa.contains(ev.target)) return;
    var painel = caixa.querySelector(".seletor-painel");
    var campo = caixa.querySelector(".seletor-campo");
    if (!painel || painel.classList.contains("oculto")) return;
    painel.classList.add("oculto");
    if (campo) campo.setAttribute("aria-expanded", "false");
  });
});
