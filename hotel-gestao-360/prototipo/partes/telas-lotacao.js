// ---------------------------------------------------------------- lotação de aulas
//
// Lotacionograma da coordenação: quantas aulas semanais cada professor dá em
// cada turma, por disciplina, por ano letivo. Planejamento pedagógico — não
// mexe em contrato nem folha. As contas (totais, saldos) moram em dominio.js
// (L.totaisLotacaoLinha, L.resumoLotacaoProfessores, L.resumoLotacaoTurmas).

T._lot = { ano: null, anos: null, dados: null, carregando: false, erro: null };

function anoPadraoLotacao(anos) {
  var hoje = new Date();
  // De setembro em diante a coordenação já está montando o ano seguinte.
  var sugerido = hoje.getFullYear() + (hoje.getMonth() >= 8 ? 1 : 0);
  if (!anos || !anos.length) return sugerido;
  return anos.indexOf(sugerido) !== -1 ? sugerido : anos[anos.length - 1];
}

function carregarLotacao(ano) {
  var st = T._lot;
  if (st.carregando) return;
  st.carregando = true; st.erro = null;
  var anosP = st.anos ? Promise.resolve({ anos: st.anos }) : L.api.get("/api/lotacao");
  anosP.then(function (r) {
    st.anos = (r && r.anos) || [];
    st.ano = ano || st.ano || anoPadraoLotacao(st.anos);
    return L.api.get("/api/lotacao/" + st.ano);
  }).then(function (dados) {
    st.dados = dados; st.carregando = false;
    if (dados && dados.ano === new Date().getFullYear()) L._lotacaoAtual = dados;
    if (T.atual === "lotacao") T.renderizar();
  }).catch(function (e) {
    st.carregando = false; st.erro = (e && e.message) || "Não foi possível carregar a lotação.";
    if (T.atual === "lotacao") T.renderizar();
  });
}

function recarregarLotacao(ano) {
  T._lot.anos = null;
  T._lot.dados = null;
  carregarLotacao(ano || T._lot.ano);
}

function fmtAulas(n) {
  if (!n) return "";
  return String(Math.round(n * 10) / 10).replace(".", ",");
}

function lerAulas(texto) {
  var t = String(texto == null ? "" : texto).trim().replace(",", ".");
  if (t === "") return 0;
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  return Number(t);
}

function turmasVisiveis(dados) {
  var etapa = T.filtros.lotEtapa || "";
  return dados.turmas.filter(function (t) { return !etapa || t.etapa === etapa; });
}

function linhasVisiveis(dados) {
  var busca = U.paraBusca(T.filtros.lotBusca || "");
  var etapa = T.filtros.lotEtapa || "";
  return dados.linhas.filter(function (l) {
    if (busca && U.paraBusca(l.disciplina + " " + (l.professor || "") + " " + (l.nomeCadastro || "")).indexOf(busca) === -1) return false;
    if (etapa) {
      // Com uma etapa escolhida, some quem não tem aula nela — senão a grade
      // do Infantil fica cheia de linha vazia do Médio.
      var t = L.totaisLotacaoLinha(l, dados.turmas);
      if (!t.porEtapa[etapa] && t.total > 0) return false;
    }
    return true;
  });
}

function funcionariosParaVinculo() {
  return (L.estado.funcionarios || []).filter(function (f) { return f.status !== "DESLIGADO" && f.regime !== "PRESTADOR_PJ"; })
    .sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), "pt-BR"); });
}

function nomeProfessorLinha(l) {
  if (l.professor) return l.professor;
  if (l.nomeCadastro) return T.nomeExibicao ? T.nomeExibicao(l.nomeCadastro) : l.nomeCadastro;
  return "";
}

// ---------------------------------------------------------------- tela

T.telas.lotacao = function () {
  var st = T._lot;
  var titulo = "Lotação de Aulas";
  if (!L.USA_BACKEND) {
    return T.cabecalho(titulo, "Distribuição de aulas por professor e turma.") +
      '<div class="painel">' + U.vazioHtml("Disponível na versão com servidor",
        "A lotação de aulas fica gravada no banco da escola; esta demonstração não tem banco.") + "</div>";
  }
  if (!st.dados && !st.erro) {
    carregarLotacao();
    return T.cabecalho(titulo, "Carregando a lotação…") + '<div class="painel"><p class="secundario">Carregando…</p></div>';
  }
  if (st.erro) {
    return T.cabecalho(titulo, "") + '<div class="painel">' +
      U.vazioHtml("Não foi possível abrir a lotação", st.erro, { acao: "lot-recarregar", rotulo: "Tentar de novo" }) + "</div>";
  }

  var d = st.dados;
  var acoes = 
    '<button class="botao" data-acao="lot-exportar"' + (d.linhas.length ? "" : " disabled") + ">Baixar Excel</button>" +
    '<button class="botao" data-acao="lot-importar">Importar planilha</button>' +
    (d.turmas.length ? T.botaoNovo("lot-nova-linha", "Nova linha") : "");
  var html = T.cabecalho(titulo, "Quem dá quantas aulas por semana em cada turma — ano letivo " + st.ano + ".", acoes);

  // Anos letivos
  var anos = (st.anos || []).slice();
  if (anos.indexOf(st.ano) === -1) anos.push(st.ano);
  anos.sort();
  html += '<div class="abas-categoria lot-anos" role="tablist">' + anos.map(function (a) {
    return '<button role="tab" class="aba-categoria" data-acao="lot-ano" data-id="' + a + '" aria-selected="' + (a === st.ano) + '">' + a + "</button>";
  }).join("") + '<button class="aba-categoria" data-acao="lot-novo-ano" title="Começar outro ano letivo">+ Ano</button>' +
    (T.temPerfil("DIRECAO") && d.linhas.length
      ? '<button class="aba-categoria" data-acao="lot-mover-ano" title="A lotação foi importada no ano errado? Troque o ano sem perder nada">Trocar o ano</button>' : "") +
    "</div>";

  if (!d.turmas.length) {
    html += '<div class="painel">' + U.vazioHtml("Nenhuma lotação em " + st.ano,
      "Importe o lotacionograma (.xlsx) que a coordenação já usa, ou copie a lotação de outro ano e ajuste.",
      { acao: "lot-importar", rotulo: "Importar planilha" }) + "</div>";
    return html;
  }

  // Resumo e pendências
  var profs = L.resumoLotacaoProfessores(d, L.estado.funcionarios);
  var porTurma = L.resumoLotacaoTurmas(d);
  var totalAulas = profs.reduce(function (s, p) { return s + p.total; }, 0) +
    L.lotacaoSemProfessor(d).reduce(function (s, l) { return s + L.totaisLotacaoLinha(l, d.turmas).total; }, 0);
  var semProf = L.lotacaoSemProfessor(d).length;
  var faltando = porTurma.filter(function (t) { return t.saldo !== null && t.saldo < 0; }).length;
  var semVinculo = profs.filter(function (p) { return !p.employeeId; }).length;
  var ajustes = L.ajustesContratoLotacao(d, L.estado.funcionarios);
  var divergentes = ajustes.length;
  var porDisc = L.resumoLotacaoDisciplinas(d);
  var discFalta = porDisc.filter(function (x) { return x.falta > 0; }).length;
  html += '<div class="lot-resumo">' +
    '<span><strong class="num">' + profs.length + "</strong> professores</span>" +
    '<span><strong class="num">' + fmtAulas(totalAulas) + "</strong> aulas/semana</span>" +
    '<span><strong class="num">' + d.turmas.length + "</strong> turmas</span>" +
    (semProf ? '<span class="pastilha critico">' + semProf + " sem professor</span>" : "") +
    (faltando ? '<span class="pastilha pendente">' + faltando + " turma(s) abaixo da grade</span>" : "") +
    (semVinculo ? '<span class="pastilha neutro" title="Nome da planilha que não foi ligado a ninguém do cadastro">' + semVinculo + " sem vínculo com o cadastro</span>" : "") +
    (divergentes ? '<button class="pastilha pendente lot-chip" data-filtro-aba="lotVisao" data-valor="professores" title="Aulas da lotação diferentes das do contrato">' + divergentes + " contrato(s) a ajustar</button>" : "") +
    (discFalta ? '<button class="pastilha pendente lot-chip" data-filtro-aba="lotVisao" data-valor="disciplinas" title="Disciplinas com aula prevista que ninguém pegou">' + discFalta + " disciplina(s) com aula faltando</button>" : "") +
    "</div>";

  var visao = T.filtros.lotVisao || "grade";
  function aba(valor, rotulo) {
    return '<button role="tab" class="aba-categoria" data-filtro-aba="lotVisao" data-valor="' + valor + '" aria-selected="' + (visao === valor) + '">' + rotulo + "</button>";
  }
  html += '<div class="abas-categoria" role="tablist" style="margin:4px 0 12px">' +
    aba("grade", "Grade") + aba("professores", "Por professor <span class=\"contagem\">" + profs.length + "</span>") +
    aba("disciplinas", "Por disciplina <span class=\"contagem\">" + porDisc.length + "</span>") +
    aba("turmas", "Por turma <span class=\"contagem\">" + d.turmas.length + "</span>") + "</div>";

  if (visao === "professores") return html + painelAjustesContrato(ajustes, st.ano) + painelLotProfessores(profs);
  if (visao === "disciplinas") return html + painelLotDisciplinas(d, porDisc);
  if (visao === "turmas") return html + painelLotTurmas(porTurma);
  return html + painelLotGrade(d);
};

function painelLotGrade(d) {
  var etapaSel = T.filtros.lotEtapa || "";
  var presentes = L.ETAPAS_LOTACAO.filter(function (e) { return d.turmas.some(function (t) { return t.etapa === e.chave; }); });
  var filtros = '<div class="lot-filtros">' +
    '<input type="search" class="lot-busca" data-filtro="lotBusca" placeholder="Professor ou disciplina" value="' + U.esc(T.filtros.lotBusca || "") + '">' +
    '<div class="abas-categoria" role="tablist">' +
      '<button role="tab" class="aba-categoria" data-filtro-aba="lotEtapa" data-valor="" aria-selected="' + (!etapaSel) + '">Todas</button>' +
      presentes.map(function (e) {
        return '<button role="tab" class="aba-categoria" data-filtro-aba="lotEtapa" data-valor="' + e.chave + '" aria-selected="' + (etapaSel === e.chave) + '">' + e.curto + "</button>";
      }).join("") +
    "</div></div>";

  var turmas = turmasVisiveis(d);
  var linhas = linhasVisiveis(d);
  var etapasCols = L.ETAPAS_LOTACAO.filter(function (e) { return turmas.some(function (t) { return t.etapa === e.chave; }); });

  var h = '<table class="grade-lot"><thead><tr><th class="fixa f1" rowspan="2">Disciplina</th><th class="fixa f2" rowspan="2">Professor</th>';
  etapasCols.forEach(function (e) {
    var n = turmas.filter(function (t) { return t.etapa === e.chave; }).length;
    h += '<th class="etapa e-' + e.chave + '" colspan="' + n + '">' + e.rotulo + "</th>";
  });
  h += '<th class="tot-cab" colspan="' + (etapasCols.length + 3) + '">Totais da linha</th></tr><tr>';
  turmas.forEach(function (t) { h += '<th class="turma e-' + t.etapa + '" title="' + U.esc(t.codigo) + '">' + U.esc(t.codigo) + "</th>"; });
  etapasCols.forEach(function (e) { h += '<th class="tot">' + e.curto + "</th>"; });
  h += '<th class="tot" title="Câmara (fora do total, como na planilha)">Câmara</th><th class="tot">Outros</th><th class="tot total">Total</th></tr></thead><tbody>';

  var anterior = null;
  linhas.forEach(function (l) {
    var t = L.totaisLotacaoLinha(l, d.turmas);
    var novaDisc = l.disciplina !== anterior;
    anterior = l.disciplina;
    var nome = nomeProfessorLinha(l);
    h += '<tr data-linha="' + l.id + '"' + (novaDisc ? ' class="nova-disc"' : "") + ">" +
      '<td class="fixa f1 disc">' + (novaDisc ? U.esc(l.disciplina) : '<span class="repete">' + U.esc(l.disciplina) + "</span>") + "</td>" +
      '<td class="fixa f2 prof"><button class="lot-prof" data-acao="lot-editar-linha" data-id="' + l.id + '" title="Editar linha">' +
        (nome ? U.esc(nome) : '<span class="pastilha critico">A definir</span>') +
        (l.employeeId ? "" : (nome ? '<span class="sem-vinculo" title="Sem vínculo com o cadastro">•</span>' : "")) +
      "</button></td>";
    turmas.forEach(function (tu) {
      var v = (l.aulas || {})[tu.id];
      h += '<td class="cel e-' + tu.etapa + '"><input class="cel-lot" inputmode="decimal" autocomplete="off" aria-label="' +
        U.esc((nome || "A definir") + " — " + l.disciplina + " — " + tu.codigo) + '" data-linha="' + l.id + '" data-turma="' + tu.id + '" value="' + fmtAulas(v) + '"></td>';
    });
    etapasCols.forEach(function (e) { h += '<td class="tot num" data-tot="' + e.chave + '">' + fmtAulas(t.porEtapa[e.chave]) + "</td>"; });
    h += '<td class="tot num">' + fmtAulas(t.camara) + '</td><td class="tot num">' + fmtAulas(t.outros) + '</td><td class="tot total num" data-tot="total">' + fmtAulas(t.total) + "</td></tr>";
  });
  h += "</tbody><tfoot>";
  // Totais por turma, grade prevista e saldo.
  var resumo = {};
  L.resumoLotacaoTurmas(d).forEach(function (r) { resumo[r.id] = r; });
  var vazio = '<td class="tot" colspan="' + (etapasCols.length + 3) + '"></td>';
  h += '<tr class="rod-total"><th class="fixa f1" colspan="2">Total por turma</th>' +
    turmas.map(function (t) { return '<td class="num" data-total-turma="' + t.id + '">' + fmtAulas(resumo[t.id].alocado) + "</td>"; }).join("") + vazio + "</tr>";
  h += '<tr class="rod-meta"><th class="fixa f1" colspan="2" title="Aulas por semana que a turma precisa ter">Grade da turma</th>' +
    turmas.map(function (t) {
      return '<td><input class="cel-lot meta" inputmode="decimal" aria-label="Grade semanal da turma ' + U.esc(t.codigo) +
        '" data-meta-turma="' + t.id + '" value="' + (t.aulasSemana == null ? "" : fmtAulas(t.aulasSemana)) + '" placeholder="—"></td>';
    }).join("") + vazio + "</tr>";
  h += '<tr class="rod-saldo"><th class="fixa f1" colspan="2">Saldo</th>' +
    turmas.map(function (t) { return '<td class="num" data-saldo-turma="' + t.id + '">' + saldoHtml(resumo[t.id].saldo) + "</td>"; }).join("") + vazio + "</tr>";
  h += "</tfoot></table>";

  return '<div class="painel lot-painel">' + filtros +
    (linhas.length ? '<div class="lot-rolagem">' + h + "</div>" : U.vazioHtml("Nada encontrado", "Nenhuma linha com esse filtro.")) +
    '<p class="lot-dica">Digite o número de aulas na célula e saia dela (Tab ou Enter) para gravar. Vazio ou 0 apaga. ' +
    "Clique no nome para trocar o professor, ligar ao cadastro ou excluir a linha.</p></div>";
}

function saldoHtml(saldo) {
  if (saldo === null || saldo === undefined) return "";
  if (saldo === 0) return '<span class="saldo ok" title="Grade completa">✓</span>';
  return saldo < 0
    ? '<span class="saldo falta" title="Faltam ' + fmtAulas(-saldo) + ' aula(s)">−' + fmtAulas(-saldo) + "</span>"
    : '<span class="saldo sobra" title="Sobram ' + fmtAulas(saldo) + ' aula(s)">+' + fmtAulas(saldo) + "</span>";
}

function painelLotProfessores(profs) {
  var busca = U.paraBusca(T.filtros.lotBusca || "");
  var lista = profs.filter(function (p) {
    return !busca || U.paraBusca(p.nome + " " + p.apelido + " " + p.disciplinas.join(" ")).indexOf(busca) !== -1;
  });
  var etapas = L.ETAPAS_LOTACAO;
  return '<div class="painel">' + U.tabelaHtml([
    { rotulo: "Professor", conteudo: function (p) {
      var apel = p.apelido && p.nome && U.paraBusca(p.apelido) !== U.paraBusca(p.nome) ? '<div class="secundario">Na planilha: ' + U.esc(p.apelido) + "</div>" : "";
      return '<div class="principal">' + U.esc(T.nomeExibicao ? T.nomeExibicao(p.nome) : p.nome) + "</div>" + apel +
        (p.employeeId ? "" : '<div><button class="botao miudo" data-acao="lot-vincular" data-id="' + U.esc(p.chave) + '">Ligar ao cadastro</button></div>');
    } },
    { rotulo: "Disciplinas", secundaria: true, conteudo: function (p) { return U.esc(p.disciplinas.join(", ")); } }
  ].concat(etapas.map(function (e) {
    return { rotulo: e.curto, direita: true, conteudo: function (p) { return '<span class="num">' + (fmtAulas(p.porEtapa[e.chave]) || "—") + "</span>"; } };
  })).concat([
    { rotulo: "Outros", direita: true, conteudo: function (p) { return '<span class="num">' + (fmtAulas(p.outros) || "—") + "</span>"; } },
    { rotulo: "Total", direita: true, conteudo: function (p) {
      return '<strong class="num">' + fmtAulas(p.total) + "</strong>" + (p.total > 40 ? ' <span class="pastilha pendente" title="Mais de 40 aulas por semana">+40</span>' : "");
    } },
    { rotulo: "No contrato", direita: true, conteudo: function (p) {
      if (!p.employeeId) return '<span class="secundario">sem vínculo</span>';
      if (p.contrato === null) return '<span class="secundario">—</span>';
      var dif = p.diferenca;
      return '<span class="num">' + fmtAulas(p.contrato) + "</span>" +
        (Math.abs(dif) >= 0.5 ? '<div><span class="pastilha pendente" title="Distribuído menos contrato">' + (dif > 0 ? "+" : "−") + fmtAulas(Math.abs(dif)) + "</span></div>" : "");
    } },
    { rotulo: "Disponibilidade", secundaria: true, conteudo: function (p) { return U.esc(p.disponibilidade.join("; ") || "—"); } }
  ]), lista, {
    buscaLocal: "Professor ou disciplina",
    tituloVazio: "Nenhum professor", textoVazio: ""
  }) + '<p class="lot-dica">"No contrato" são as aulas semanais do cadastro (o que a folha paga). A diferença aparece quando a distribuição não bate com o contrato.</p></div>';
}

function painelLotTurmas(porTurma) {
  var rot = {};
  L.ETAPAS_LOTACAO.forEach(function (e) { rot[e.chave] = e.rotulo; });
  return '<div class="painel">' + U.tabelaHtml([
    { rotulo: "Turma", conteudo: function (t) { return '<div class="principal">' + U.esc(t.codigo) + '</div><div class="secundario">' + rot[t.etapa] + "</div>"; } },
    { rotulo: "Disciplinas", direita: true, conteudo: function (t) { return '<span class="num">' + t.disciplinas + "</span>"; } },
    { rotulo: "Distribuído", direita: true, conteudo: function (t) { return '<strong class="num">' + (fmtAulas(t.alocado) || "0") + "</strong>"; } },
    { rotulo: "Grade da turma", direita: true, conteudo: function (t) {
      return '<button class="botao miudo" data-acao="lot-meta-turma" data-id="' + t.id + '">' + (t.meta === null ? "Definir" : fmtAulas(t.meta) + " aulas") + "</button>";
    } },
    { rotulo: "Saldo", direita: true, conteudo: function (t) {
      if (t.saldo === null) return '<span class="secundario">—</span>';
      if (t.saldo === 0) return '<span class="pastilha ok">completa</span>';
      return t.saldo < 0 ? '<span class="pastilha pendente">faltam ' + fmtAulas(-t.saldo) + "</span>"
        : '<span class="pastilha neutro">sobram ' + fmtAulas(t.saldo) + "</span>";
    } },
    { rotulo: "Sem professor", direita: true, conteudo: function (t) {
      return t.semProfessor ? '<span class="pastilha critico">' + fmtAulas(t.semProfessor) + " aula(s)</span>" : '<span class="secundario">—</span>';
    } },
    { rotulo: "", direita: true, conteudo: function (t) {
      return '<button class="botao miudo" data-acao="lot-editar-turma" data-id="' + t.id + '">Editar</button>';
    } }
  ], porTurma, { buscaLocal: "Turma", tituloVazio: "Nenhuma turma", textoVazio: "" }) +
  '<div style="margin-top:10px"><button class="botao" data-acao="lot-nova-turma">Nova turma</button></div></div>';
}

// ---------------------------------------------------------------- edição direto na grade

function atualizarTotaisDom(linhaId) {
  var d = T._lot.dados;
  var raiz = U.el("conteudo");
  var l = d.linhas.filter(function (x) { return x.id === linhaId; })[0];
  if (l) {
    var t = L.totaisLotacaoLinha(l, d.turmas);
    var tr = raiz.querySelector('tr[data-linha="' + linhaId + '"]');
    if (tr) {
      U.todos("[data-tot]", tr).forEach(function (td) {
        var k = td.dataset.tot;
        td.textContent = fmtAulas(k === "total" ? t.total : t.porEtapa[k]);
      });
    }
  }
  L.resumoLotacaoTurmas(d).forEach(function (r) {
    var a = raiz.querySelector('[data-total-turma="' + r.id + '"]');
    if (a) a.textContent = fmtAulas(r.alocado);
    var s = raiz.querySelector('[data-saldo-turma="' + r.id + '"]');
    if (s) s.innerHTML = saldoHtml(r.saldo);
  });
}

function ligarGradeLotacao() {
  var raiz = U.el("conteudo");
  U.todos("input.cel-lot:not(.cel-prev)", raiz).forEach(function (campo) {
    campo.dataset.original = campo.value;
    campo.addEventListener("focus", function () { campo.select(); });
    campo.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { campo.value = campo.dataset.original; campo.blur(); return; }
      if (ev.key !== "Enter" && ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
      ev.preventDefault();
      // Enter / setas descem ou sobem na mesma turma, como no Excel.
      var td = campo.closest("td"), tr = campo.closest("tr");
      var idx = Array.prototype.indexOf.call(tr.children, td);
      var alvoTr = ev.key === "ArrowUp" ? tr.previousElementSibling : tr.nextElementSibling;
      var alvo = alvoTr && alvoTr.children[idx] && alvoTr.children[idx].querySelector("input.cel-lot");
      if (alvo) alvo.focus(); else campo.blur();
    });
    campo.addEventListener("change", function () { gravarCelula(campo); });
  });
}

function gravarCelula(campo) {
  var n = lerAulas(campo.value);
  if (isNaN(n) || n < 0 || n > (campo.dataset.metaTurma ? 80 : 40)) {
    U.avisar(campo.dataset.metaTurma ? "A grade da turma precisa ser um número de 0 a 80." : "Digite o número de aulas por semana (0 a 40).");
    campo.value = campo.dataset.original;
    return;
  }
  var d = T._lot.dados;
  campo.classList.add("salvando");
  if (campo.dataset.metaTurma) {
    var turma = d.turmas.filter(function (t) { return t.id === campo.dataset.metaTurma; })[0];
    var valor = String(campo.value).trim() === "" ? null : n;
    L.api.patch("/api/lotacao/turmas/" + turma.id, { aulasSemana: valor }).then(function () {
      turma.aulasSemana = valor;
      campo.dataset.original = campo.value = valor === null ? "" : fmtAulas(valor);
      campo.classList.remove("salvando"); campo.classList.add("salvo");
      setTimeout(function () { campo.classList.remove("salvo"); }, 900);
      atualizarTotaisDom(null);
    }).catch(function (e) {
      campo.classList.remove("salvando"); campo.value = campo.dataset.original;
      U.avisar((e && e.message) || "Não foi possível gravar.");
    });
    return;
  }
  var linha = d.linhas.filter(function (x) { return x.id === campo.dataset.linha; })[0];
  L.api.chamar("PUT", "/api/lotacao/linhas/" + campo.dataset.linha + "/aulas/" + campo.dataset.turma, { aulas: n }).then(function () {
    linha.aulas = linha.aulas || {};
    if (n) linha.aulas[campo.dataset.turma] = n; else delete linha.aulas[campo.dataset.turma];
    campo.dataset.original = campo.value = fmtAulas(n);
    campo.setAttribute("value", campo.value);
    campo.classList.remove("salvando"); campo.classList.add("salvo");
    setTimeout(function () { campo.classList.remove("salvo"); }, 900);
    atualizarTotaisDom(linha.id);
  }).catch(function (e) {
    campo.classList.remove("salvando"); campo.value = campo.dataset.original;
    U.avisar((e && e.message) || "Não foi possível gravar.");
  });
}

(function () {
  var original = T.ligarEventos;
  T.ligarEventos = function () {
    original.apply(this, arguments);
    if (T.atual === "lotacao" && T._lot.dados) ligarGradeLotacao();
  };
})();

// ---------------------------------------------------------------- ações

T.acoes["lot-recarregar"] = function () { recarregarLotacao(); T.renderizar(); };

T.acoes["lot-ano"] = function (ano) {
  T._lot.ano = Number(ano);
  T._lot.dados = null;
  carregarLotacao(Number(ano));
  T.renderizar();
};

T.acoes["lot-novo-ano"] = function () {
  var st = T._lot;
  var anos = st.anos || [];
  var proximo = Math.max.apply(null, anos.concat([new Date().getFullYear()])) + 1;
  U.abrirFormulario({
    titulo: "Começar outro ano letivo",
    campos: [
      { id: "ano", rotulo: "Ano letivo", tipo: "numero", obrigatorio: true, padrao: proximo, meia: true },
      { id: "origem", rotulo: "Começar a partir de", tipo: "select",
        opcoes: [{ valor: "", rotulo: "Em branco (importar a planilha depois)" }].concat(anos.map(function (a) {
          return { valor: String(a), rotulo: "Cópia de " + a + " (turmas, professores e aulas)" };
        })) }
    ],
    rotuloSalvar: "Começar",
    aoSalvar: function (v) {
      var ano = Math.round(v.ano);
      if (ano < 2020 || ano > 2100) { U.avisar("Ano letivo inválido."); return; }
      if (!v.origem) {
        U.fecharModal(); st.ano = ano; st.dados = null; carregarLotacao(ano); T.renderizar();
        return;
      }
      L.api.post("/api/lotacao/" + ano + "/copiar", { origem: Number(v.origem) }).then(function (r) {
        U.fecharModal(); U.avisar("Lotação de " + ano + " criada a partir de " + v.origem + " (" + r.linhas + " linhas).");
        recarregarLotacao(ano); T.renderizar();
      }).catch(function (e) { U.avisar((e && e.message) || "Não foi possível copiar."); });
    }
  });
};

T.acoes["lot-importar"] = function () {
  var st = T._lot;
  var temDados = st.dados && st.dados.linhas.length;
  var arquivo = null;
  U.abrirModal({
    titulo: "Importar lotacionograma",
    sub: "Ano letivo " + st.ano,
    corpo: '<label class="campo"><span>Planilha (.xlsx)</span><input type="file" id="lot-arquivo" accept=".xlsx"></label>' +
      '<div id="lot-previa" class="lot-previa"><p class="secundario">Escolha o arquivo: o sistema mostra o que encontrou antes de gravar.</p></div>' +
      (temDados ? '<label class="lot-substituir"><input type="checkbox" id="lot-substituir"> Substituir a lotação de ' + st.ano +
        " que já está no sistema (" + st.dados.linhas.length + " linhas). As edições feitas aqui serão perdidas.</label>" : ""),
    acoes: [
      { rotulo: "Cancelar", aoClicar: U.fecharModal },
      { rotulo: "Importar", classe: "primario", aoClicar: function () {
        if (!arquivo) { U.avisar("Escolha a planilha primeiro."); return; }
        var subst = U.el("lot-substituir");
        if (temDados && !(subst && subst.checked)) { U.avisar("Marque \"substituir\" para trocar a lotação que já existe."); return; }
        L.api.enviarArquivo("/api/lotacao/" + st.ano + "/importar", { arquivo: arquivo, substituir: temDados ? "1" : "0" }).then(function (r) {
          U.fecharModal();
          U.avisar("Importado: " + r.linhas + " linhas, " + r.turmas + " turmas, " + r.vinculados + " ligadas ao cadastro." +
            (r.semVinculo && r.semVinculo.length ? " Sem vínculo: " + r.semVinculo.length + " nome(s) — ligue em \"Por professor\"." : ""));
          recarregarLotacao(st.ano); T.renderizar();
        }).catch(function (e) { U.avisar((e && e.message) || "Não foi possível importar."); });
      } }
    ]
  });
  var campo = U.el("lot-arquivo");
  campo.addEventListener("change", function () {
    arquivo = campo.files && campo.files[0];
    var previa = U.el("lot-previa");
    if (!arquivo) return;
    previa.innerHTML = '<p class="secundario">Lendo a planilha…</p>';
    L.api.enviarArquivo("/api/lotacao/" + st.ano + "/importar", { arquivo: arquivo, previa: "1" }).then(function (r) {
      previa.innerHTML = "<p><strong>" + U.esc(r.titulo || r.aba) + "</strong></p>" +
        "<p>" + r.turmas + " turmas · " + r.linhas + " linhas de professor × disciplina · " + r.professores + " professores</p>" +
        (r.avisos && r.avisos.length ? '<p class="secundario">Conferir na planilha (o sistema usa a soma das turmas):</p><ul class="lot-avisos">' +
          r.avisos.map(function (a) { return "<li>" + U.esc(a) + "</li>"; }).join("") + "</ul>" : "");
    }).catch(function (e) {
      arquivo = null;
      previa.innerHTML = '<p class="erro">' + U.esc((e && e.message) || "Não foi possível ler a planilha.") + "</p>";
    });
  });
};

function camposLinha(d) {
  var disciplinas = [];
  d.linhas.forEach(function (l) { if (disciplinas.indexOf(l.disciplina) === -1) disciplinas.push(l.disciplina); });
  var funcs = funcionariosParaVinculo();
  return [
    { id: "disciplina", rotulo: "Disciplina", obrigatorio: true, dicaCampo: disciplinas.slice(0, 3).join(", ") + "…" },
    { id: "professor", rotulo: "Professor (como aparece na lotação)", dicaCampo: "Vazio = A definir" },
    { id: "employeeId", rotulo: "Ligado ao cadastro", tipo: "select",
      opcoes: [{ valor: "", rotulo: "Sem vínculo" }].concat(funcs.map(function (f) {
        return { valor: f.id, rotulo: (T.nomeExibicao ? T.nomeExibicao(f.nome) : f.nome) + (f.cargo ? " — " + f.cargo : "") };
      })) },
    { id: "outros", rotulo: "Outros (aulas/semana)", tipo: "numero", passo: "0.5", par: true },
    { id: "camara", rotulo: "Câmara (aulas/semana)", tipo: "numero", passo: "0.5" },
    { id: "disponibilidade", rotulo: "Disponibilidade", tipo: "textarea", dicaCampo: "Ex.: segunda, quarta e sexta pela manhã" }
  ];
}

function corpoLinha(v) {
  return {
    disciplina: v.disciplina, professor: v.professor || null, employeeId: v.employeeId || null,
    outros: v.outros || 0, camara: v.camara || 0, disponibilidade: v.disponibilidade || null
  };
}

T.acoes["lot-nova-linha"] = function () {
  var st = T._lot;
  U.abrirFormulario({
    titulo: "Nova linha na lotação", sub: "Ano letivo " + st.ano,
    campos: camposLinha(st.dados), valores: { outros: "", camara: "" },
    rotuloSalvar: "Adicionar",
    aoSalvar: function (v) {
      L.api.post("/api/lotacao/" + st.ano + "/linhas", corpoLinha(v)).then(function () {
        U.fecharModal(); U.avisar("Linha adicionada. Preencha as aulas na grade.");
        recarregarLotacao(); T.renderizar();
      }).catch(function (e) { U.avisar((e && e.message) || "Não foi possível adicionar."); });
    }
  });
};

T.acoes["lot-editar-linha"] = function (id) {
  var st = T._lot;
  var l = st.dados.linhas.filter(function (x) { return x.id === id; })[0];
  if (!l) return;
  U.abrirFormulario({
    titulo: "Editar linha", sub: l.disciplina + " · " + (l.professor || "A definir"),
    campos: camposLinha(st.dados),
    valores: { disciplina: l.disciplina, professor: l.professor || "", employeeId: l.employeeId || "",
      outros: l.outros || "", camara: l.camara || "", disponibilidade: l.disponibilidade || "" },
    acoesExtras: [{ rotulo: "Excluir linha", classe: "perigo", esquerda: true, aoClicar: function () {
      U.confirmar({
        titulo: "Excluir esta linha?",
        texto: "Sai da lotação de " + st.ano + " a linha de " + (l.professor || "A definir") + " em " + l.disciplina +
          ", com as " + fmtAulas(L.totaisLotacaoLinha(l, st.dados.turmas).total || 0) + " aula(s) dela. O cadastro do professor não muda.",
        rotulo: "Excluir linha",
        aoConfirmar: function () {
          L.api.del("/api/lotacao/linhas/" + id).then(function () {
            U.avisar("Linha excluída."); recarregarLotacao(); T.renderizar();
          }).catch(function (e) { U.avisar((e && e.message) || "Não foi possível excluir."); });
        }
      });
    } }],
    aoSalvar: function (v) {
      L.api.patch("/api/lotacao/linhas/" + id, corpoLinha(v)).then(function () {
        U.fecharModal(); U.avisar("Linha atualizada."); recarregarLotacao(); T.renderizar();
      }).catch(function (e) { U.avisar((e && e.message) || "Não foi possível salvar."); });
    }
  });
};

/** Liga ao cadastro todas as linhas de um mesmo nome da planilha de uma vez. */
T.acoes["lot-vincular"] = function (chave) {
  var st = T._lot;
  var linhas = st.dados.linhas.filter(function (l) { return L.chaveProfessorLotacao(l) === chave; });
  if (!linhas.length) return;
  var funcs = funcionariosParaVinculo();
  if (!funcs.length) { U.avisar("A lista de funcionários não está disponível para o seu perfil."); return; }
  U.abrirFormulario({
    titulo: "Ligar ao cadastro", sub: (linhas[0].professor || "") + " · " + linhas.length + " linha(s)",
    campos: [{ id: "employeeId", rotulo: "Funcionário", tipo: "select", obrigatorio: true,
      opcoes: funcs.map(function (f) { return { valor: f.id, rotulo: (T.nomeExibicao ? T.nomeExibicao(f.nome) : f.nome) + (f.cargo ? " — " + f.cargo : "") }; }) }],
    rotuloSalvar: "Ligar",
    aoSalvar: function (v) {
      Promise.all(linhas.map(function (l) { return L.api.patch("/api/lotacao/linhas/" + l.id, { employeeId: v.employeeId }); }))
        .then(function () { U.fecharModal(); U.avisar("Ligado ao cadastro."); recarregarLotacao(); T.renderizar(); })
        .catch(function (e) { U.avisar((e && e.message) || "Não foi possível ligar."); });
    }
  });
};

T.acoes["lot-meta-turma"] = function (id) { T.acoes["lot-editar-turma"](id); };

T.acoes["lot-editar-turma"] = function (id) {
  var st = T._lot;
  var t = st.dados.turmas.filter(function (x) { return x.id === id; })[0];
  if (!t) return;
  U.abrirFormulario({
    titulo: "Turma " + t.codigo, sub: "Ano letivo " + st.ano,
    campos: [
      { id: "codigo", rotulo: "Nome da turma", obrigatorio: true, par: true },
      { id: "aulasSemana", rotulo: "Grade (aulas/semana)", tipo: "numero", passo: "0.5" }
    ],
    valores: { codigo: t.codigo, aulasSemana: t.aulasSemana == null ? "" : t.aulasSemana },
    acoesExtras: [{ rotulo: "Excluir turma", classe: "perigo", esquerda: true, aoClicar: function () {
      U.confirmar({
        titulo: "Excluir a turma " + t.codigo + "?",
        texto: "As aulas distribuídas nela saem da lotação de " + st.ano + ". As linhas dos professores continuam.",
        rotulo: "Excluir turma",
        aoConfirmar: function () {
          L.api.del("/api/lotacao/turmas/" + id).then(function () {
            U.avisar("Turma excluída."); recarregarLotacao(); T.renderizar();
          }).catch(function (e) { U.avisar((e && e.message) || "Não foi possível excluir."); });
        }
      });
    } }],
    aoSalvar: function (v) {
      var bruto = U.el("f-aulasSemana").value.trim();
      L.api.patch("/api/lotacao/turmas/" + id, { codigo: v.codigo, aulasSemana: bruto === "" ? null : v.aulasSemana }).then(function () {
        U.fecharModal(); U.avisar("Turma atualizada."); recarregarLotacao(); T.renderizar();
      }).catch(function (e) { U.avisar((e && e.message) || "Não foi possível salvar."); });
    }
  });
};

T.acoes["lot-nova-turma"] = function () {
  var st = T._lot;
  U.abrirFormulario({
    titulo: "Nova turma", sub: "Ano letivo " + st.ano,
    campos: [
      { id: "codigo", rotulo: "Nome da turma", obrigatorio: true, dicaCampo: "Ex.: 6ºD", par: true },
      { id: "etapa", rotulo: "Etapa", tipo: "select", opcoes: L.ETAPAS_LOTACAO.map(function (e) { return { valor: e.chave, rotulo: e.rotulo }; }) },
      { id: "aulasSemana", rotulo: "Grade (aulas/semana)", tipo: "numero", passo: "0.5", meia: true }
    ],
    rotuloSalvar: "Criar turma",
    aoSalvar: function (v) {
      var bruto = U.el("f-aulasSemana").value.trim();
      L.api.post("/api/lotacao/" + st.ano + "/turmas", { codigo: v.codigo, etapa: v.etapa, aulasSemana: bruto === "" ? null : v.aulasSemana }).then(function () {
        U.fecharModal(); U.avisar("Turma criada."); recarregarLotacao(); T.renderizar();
      }).catch(function (e) { U.avisar((e && e.message) || "Não foi possível criar."); });
    }
  });
};

T.acoes["lot-exportar"] = function () {
  var st = T._lot, d = st.dados;
  var etapas = L.ETAPAS_LOTACAO.filter(function (e) { return d.turmas.some(function (t) { return t.etapa === e.chave; }); });
  var cab = ["Disciplina", "Professor"].concat(d.turmas.map(function (t) { return t.codigo; }))
    .concat(etapas.map(function (e) { return "Total " + e.curto; })).concat(["Câmara", "Outros", "Total", "Disponibilidade"]);
  var linhas = [
    { altura: 26, celulas: [{ v: "Lotação de aulas — " + st.ano, s: 1 }] },
    { celulas: [] },
    { celulas: cab.map(function (t) { return { v: t, s: 4 }; }) }
  ];
  d.linhas.forEach(function (l) {
    var t = L.totaisLotacaoLinha(l, d.turmas);
    linhas.push({ celulas: [{ v: l.disciplina, s: 5 }, { v: nomeProfessorLinha(l) || "A definir", s: 5 }]
      .concat(d.turmas.map(function (tu) { var n = (l.aulas || {})[tu.id]; return n ? { v: n, s: 5 } : { v: "", s: 5 }; }))
      .concat(etapas.map(function (e) { return { v: t.porEtapa[e.chave] || "", s: 5 }; }))
      .concat([{ v: t.camara || "", s: 5 }, { v: t.outros || "", s: 5 }, { v: t.total, s: 7 }, { v: l.disponibilidade || "", s: 5 }]) });
  });
  var porTurma = L.resumoLotacaoTurmas(d);
  linhas.push({ celulas: [{ v: "Total por turma", s: 9 }, { v: "", s: 9 }].concat(porTurma.map(function (r) { return { v: r.alocado, s: 9 }; })) });
  linhas.push({ celulas: [{ v: "Grade da turma", s: 7 }, { v: "", s: 7 }].concat(porTurma.map(function (r) { return { v: r.meta === null ? "" : r.meta, s: 7 }; })) });
  var larguras = [30, 22].concat(d.turmas.map(function () { return 7; })).concat(etapas.map(function () { return 9; })).concat([8, 8, 8, 34]);
  var abaGrade = abaXlsx(larguras, linhas, ["A1:H1"]);

  var profs = L.resumoLotacaoProfessores(d, L.estado.funcionarios);
  var lp = [
    { altura: 26, celulas: [{ v: "Aulas por professor — " + st.ano, s: 1 }] }, { celulas: [] },
    { celulas: ["Professor", "Disciplinas"].concat(L.ETAPAS_LOTACAO.map(function (e) { return e.curto; })).concat(["Outros", "Total", "No contrato", "Diferença"]).map(function (t) { return { v: t, s: 4 }; }) }
  ];
  profs.forEach(function (p) {
    lp.push({ celulas: [{ v: p.nome, s: 5 }, { v: p.disciplinas.join(", "), s: 5 }]
      .concat(L.ETAPAS_LOTACAO.map(function (e) { return { v: p.porEtapa[e.chave] || "", s: 5 }; }))
      .concat([{ v: p.outros || "", s: 5 }, { v: p.total, s: 7 }, { v: p.contrato === null ? "" : p.contrato, s: 5 }, { v: p.diferenca === null ? "" : p.diferenca, s: 5 }]) });
  });
  var abaProf = abaXlsx([30, 40, 9, 9, 9, 9, 9, 8, 8, 11, 10], lp, ["A1:H1"]);
  var xlsx = arquivoXlsx([{ nome: "Grade", xml: abaGrade }, { nome: "Por professor", xml: abaProf }]);
  var link = document.createElement("a");
  link.href = URL.createObjectURL(xlsx); link.download = "lotacao-" + st.ano + ".xlsx";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
};

// ---------------------------------------------------------------- contratos a ajustar

function painelAjustesContrato(ajustes, ano) {
  if (!ajustes.length) return "";
  var atual = ano === new Date().getFullYear();
  var nota = atual
    ? "A folha paga pelo contrato: ajuste o cadastro destes professores (vai para a aprovação da Direção)."
    : "Planejamento de " + ano + ": na virada do ano, ajuste o contrato destes professores para a folha pagar o que foi distribuído.";
  var rot = {};
  L.ETAPAS_LOTACAO.forEach(function (e) { rot[e.chave] = e.curto; });
  return '<div class="painel lot-ajustes"><div class="painel-topo"><h2>Contratos a ajustar</h2><span class="contexto">' +
    ajustes.length + " professor(es)</span></div>" +
    '<p class="lot-dica" style="margin-top:0">' + U.esc(nota) + "</p>" +
    '<table class="tabela"><thead><tr><th>Professor</th><th class="direita">No contrato</th><th class="direita">Na lotação</th><th>Diferença por segmento</th><th></th></tr></thead><tbody>' +
    ajustes.map(function (a) {
      var dif = a.diferenca;
      return "<tr><td><div class=\"principal\">" + U.esc(T.nomeExibicao ? T.nomeExibicao(a.nome) : a.nome) + "</div></td>" +
        '<td class="direita num">' + fmtAulas(a.contrato) + "</td>" +
        '<td class="direita num"><strong>' + fmtAulas(a.lotacao) + "</strong>" +
          (Math.abs(dif) >= 0.5 ? ' <span class="pastilha pendente">' + (dif > 0 ? "+" : "−") + fmtAulas(Math.abs(dif)) + "</span>" : "") + "</td>" +
        "<td>" + (a.segmentos.length ? a.segmentos.map(function (sg) {
          return '<span class="lot-seg">' + rot[sg.etapa] + ": " + (fmtAulas(sg.contrato) || "0") + " → " + (fmtAulas(sg.lotacao) || "0") + "</span>";
        }).join(" ") : '<span class="secundario">total só</span>') + "</td>" +
        '<td class="direita"><button class="botao miudo" data-acao="ficha-funcionario" data-id="' + a.employeeId + '">Abrir cadastro</button></td></tr>';
    }).join("") + "</tbody></table></div>";
}

// ---------------------------------------------------------------- grade prevista por disciplina

function painelLotDisciplinas(d, porDisc) {
  var etapaSel = T.filtros.lotEtapa || "";
  var presentes = L.ETAPAS_LOTACAO.filter(function (e) { return d.turmas.some(function (t) { return t.etapa === e.chave; }); });
  var turmas = turmasVisiveis(d);
  var busca = U.paraBusca(T.filtros.lotBusca || "");
  var lista = porDisc.filter(function (x) {
    if (busca && U.paraBusca(x.disciplina).indexOf(busca) === -1) return false;
    if (etapaSel) return turmas.some(function (t) { return x.celulas[t.id]; });
    return true;
  });
  var semNada = !(d.previsto || []).length;
  var topo = '<div class="lot-filtros">' +
    '<input type="search" class="lot-busca" data-filtro="lotBusca" placeholder="Disciplina" value="' + U.esc(T.filtros.lotBusca || "") + '">' +
    '<div class="abas-categoria" role="tablist">' +
      '<button role="tab" class="aba-categoria" data-filtro-aba="lotEtapa" data-valor="" aria-selected="' + (!etapaSel) + '">Todas</button>' +
      presentes.map(function (e) {
        return '<button role="tab" class="aba-categoria" data-filtro-aba="lotEtapa" data-valor="' + e.chave + '" aria-selected="' + (etapaSel === e.chave) + '">' + e.curto + "</button>";
      }).join("") + "</div>" +
    '<button class="botao" data-acao="lot-prever-distribuido" title="Copia o que já está distribuído só onde ainda não há previsão">' +
      (semNada ? "Começar pela distribuição atual" : "Completar com a distribuição atual") + "</button></div>";

  var h = '<table class="grade-lot grade-prev"><thead><tr><th class="fixa f1" rowspan="2">Disciplina</th>';
  var etapasCols = L.ETAPAS_LOTACAO.filter(function (e) { return turmas.some(function (t) { return t.etapa === e.chave; }); });
  etapasCols.forEach(function (e) {
    h += '<th class="etapa" colspan="' + turmas.filter(function (t) { return t.etapa === e.chave; }).length + '">' + e.rotulo + "</th>";
  });
  h += '<th class="tot-cab" colspan="4">Totais</th></tr><tr>';
  turmas.forEach(function (t) { h += '<th class="turma">' + U.esc(t.codigo) + "</th>"; });
  h += '<th class="tot">Previsto</th><th class="tot">Distrib.</th><th class="tot">Falta</th><th class="tot">Sobra</th></tr></thead><tbody>';
  lista.forEach(function (x) {
    h += '<tr data-disc="' + U.esc(x.disciplina) + '"><td class="fixa f1 disc">' + U.esc(x.disciplina) + "</td>";
    turmas.forEach(function (t) {
      var c = x.celulas[t.id] || { distribuido: 0, previsto: null };
      h += '<td class="cel prev ' + estadoCelPrev(c) + '" data-cel="' + t.id + '">' +
        '<input class="cel-lot cel-prev" inputmode="decimal" autocomplete="off" aria-label="' + U.esc(x.disciplina + " — " + t.codigo + " — aulas previstas") +
        '" data-prev-disc="' + U.esc(x.disciplina) + '" data-prev-turma="' + t.id + '" value="' + (c.previsto === null ? "" : fmtAulas(c.previsto)) + '" placeholder="' + (c.distribuido ? "?" : "") + '">' +
        '<span class="dist" title="Distribuído aos professores">' + (c.distribuido ? fmtAulas(c.distribuido) : "") + "</span></td>";
    });
    h += '<td class="tot num" data-t="previsto">' + fmtAulas(x.previsto) + '</td><td class="tot num" data-t="distribuido">' + fmtAulas(x.distribuido) +
      '</td><td class="tot num falta" data-t="falta">' + fmtAulas(x.falta) + '</td><td class="tot num sobra" data-t="sobra">' + fmtAulas(x.sobra) + "</td></tr>";
  });
  h += "</tbody></table>";
  return '<div class="painel lot-painel">' + topo +
    (lista.length ? '<div class="lot-rolagem">' + h + "</div>" : U.vazioHtml("Nada encontrado", "Nenhuma disciplina com esse filtro.")) +
    '<p class="lot-dica">Em cada célula: em cima, quantas aulas a turma <strong>precisa</strong> da disciplina (digite); embaixo, quantas já foram ' +
    "<strong>distribuídas</strong> aos professores. Vermelho = falta professor; amarelo = passou do previsto; “?” = tem aula mas ninguém disse quanto a turma precisa.</p></div>";
}

function estadoCelPrev(c) {
  if (c.previsto === null) return c.distribuido ? "sem-prev" : "";
  if (c.distribuido < c.previsto) return "falta";
  if (c.distribuido > c.previsto) return "sobra";
  return "ok";
}

function ligarGradePrevista() {
  var raiz = U.el("conteudo");
  U.todos("input.cel-prev", raiz).forEach(function (campo) {
    campo.dataset.original = campo.value;
    campo.addEventListener("focus", function () { campo.select(); });
    campo.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { campo.value = campo.dataset.original; campo.blur(); return; }
      if (ev.key !== "Enter" && ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
      ev.preventDefault();
      var td = campo.closest("td"), tr = campo.closest("tr");
      var idx = Array.prototype.indexOf.call(tr.children, td);
      var alvoTr = ev.key === "ArrowUp" ? tr.previousElementSibling : tr.nextElementSibling;
      var alvo = alvoTr && alvoTr.children[idx] && alvoTr.children[idx].querySelector("input");
      if (alvo) alvo.focus(); else campo.blur();
    });
    campo.addEventListener("change", function () { gravarPrevisto(campo); });
  });
}

function gravarPrevisto(campo) {
  var n = lerAulas(campo.value);
  if (isNaN(n) || n < 0 || n > 40) {
    U.avisar("Digite quantas aulas por semana a turma precisa (0 a 40).");
    campo.value = campo.dataset.original;
    return;
  }
  var st = T._lot, d = st.dados;
  var disc = campo.dataset.prevDisc, tid = campo.dataset.prevTurma;
  campo.classList.add("salvando");
  L.api.chamar("PUT", "/api/lotacao/" + st.ano + "/previsto", { turmaId: tid, disciplina: disc, aulas: n }).then(function () {
    d.previsto = (d.previsto || []).filter(function (p) { return !(p.turmaId === tid && p.disciplina === disc); });
    if (n) d.previsto.push({ turmaId: tid, disciplina: disc, aulas: n });
    campo.dataset.original = campo.value = n ? fmtAulas(n) : "";
    campo.classList.remove("salvando");
    var x = L.resumoLotacaoDisciplinas(d).filter(function (r) { return r.disciplina === disc; })[0];
    var tr = campo.closest("tr");
    if (x && tr) {
      var c = x.celulas[tid] || { distribuido: 0, previsto: null };
      var td = campo.closest("td");
      td.className = "cel prev " + estadoCelPrev(c);
      campo.placeholder = c.previsto === null && c.distribuido ? "?" : "";
      ["previsto", "distribuido", "falta", "sobra"].forEach(function (k) {
        var el = tr.querySelector('[data-t="' + k + '"]');
        if (el) el.textContent = fmtAulas(x[k]);
      });
    }
  }).catch(function (e) {
    campo.classList.remove("salvando"); campo.value = campo.dataset.original;
    U.avisar((e && e.message) || "Não foi possível gravar.");
  });
}

T.acoes["lot-prever-distribuido"] = function () {
  var st = T._lot;
  U.confirmar({
    titulo: "Preencher a grade prevista?",
    texto: "Onde ainda não há previsão, o sistema copia o que já está distribuído aos professores. O que já foi digitado não muda. Depois é só corrigir o que a turma realmente precisa.",
    rotulo: "Preencher", classe: "primario",
    aoConfirmar: function () {
      L.api.post("/api/lotacao/" + st.ano + "/previsto/do-distribuido", {}).then(function (r) {
        U.avisar(r.criadas ? r.criadas + " célula(s) preenchidas. Confira e ajuste." : "Nada a preencher: tudo já tinha previsão.");
        recarregarLotacao(); T.renderizar();
      }).catch(function (e) { U.avisar((e && e.message) || "Não foi possível preencher."); });
    }
  });
};

// Grade prevista liga os próprios campos; e o Dashboard pede, uma vez, a
// lotação do ano corrente para o alerta "lotação diferente do contrato".
(function () {
  var ligar = T.ligarEventos;
  T.ligarEventos = function () {
    ligar.apply(this, arguments);
    if (T.atual === "lotacao" && T._lot.dados && T.filtros.lotVisao === "disciplinas") ligarGradePrevista();
  };
  var renderizar = T.renderizar;
  T.renderizar = function () {
    renderizar.apply(this, arguments);
    if (T.atual === "dashboard" && L.USA_BACKEND && !T._recadosPedidos) {
      T._recadosPedidos = true;
      L.api.get("/api/recados").then(function (lista) {
        T._recados = lista || [];
        if (T._recados.length && T.atual === "dashboard") T.renderizar();
      }).catch(function () { /* sem recados */ });
    }
    if (T.atual !== "dashboard" || T._lotAlertaPedido || !L.USA_BACKEND || !T.podeVer("lotacao")) return;
    T._lotAlertaPedido = true;
    L.api.get("/api/lotacao/" + new Date().getFullYear()).then(function (dados) {
      if (!dados || !dados.linhas || !dados.linhas.length) return;
      L._lotacaoAtual = dados;
      if (T.atual === "dashboard") T.renderizar();
    }).catch(function () { /* sem lotação do ano: nada a alertar */ });
  };
})();

/** Importou no ano errado: troca o ano da lotação inteira (mesmos registros, vínculos e pedidos). */
T.acoes["lot-mover-ano"] = function () {
  var st = T._lot;
  U.abrirFormulario({
    titulo: "Trocar o ano desta lotação",
    sub: "Hoje está em " + st.ano,
    campos: [{ id: "destino", rotulo: "Passar para o ano letivo", tipo: "numero", obrigatorio: true, padrao: st.ano - 1, meia: true }],
    rotuloSalvar: "Trocar o ano",
    aoSalvar: function (v) {
      var destino = Math.round(v.destino);
      L.api.post("/api/lotacao/" + st.ano + "/mover", { destino: destino }).then(function (r) {
        U.fecharModal();
        U.avisar("Lotação passou de " + st.ano + " para " + destino + " (" + r.linhas + " linhas). Vínculos e pedidos continuam valendo.");
        recarregarLotacao(destino); T.renderizar();
      }).catch(function (e) { U.avisar((e && e.message) || "Não foi possível trocar o ano."); });
    }
  });
};
