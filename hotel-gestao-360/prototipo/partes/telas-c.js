/* ============================================================================
   Telas C: solicitações, aprovações, férias, documentos, relatórios, auditoria,
   acesso e inicialização.
   ========================================================================== */

// ---------------------------------------------------------------- (removida)

T.telasArquivadas = T.telasArquivadas || {};
T.telasArquivadas.hierarquia = function () {
  var html = T.cabecalho("Hierarquia e Alçadas",
    "Dois eixos diferentes: o nível diz quem responde a quem; a alçada diz até quanto cada um decide sozinho. Separar os dois evita dar poder de aprovar R$ 50 mil a quem só precisava liberar material de papelaria.");

  var ordenados = Object.keys(L.NIVEIS).sort(function (a, b) {
    return L.NIVEIS[a].ordem - L.NIVEIS[b].ordem || L.alcadaDe(b) - L.alcadaDe(a);
  });

  html += U.painelHtml("Níveis de decisão", "Da direção para a base",
    '<div class="alcadas">' + ordenados.map(function (p) {
      var n = L.NIVEIS[p];
      var perfil = T.PERFIS[p];
      var eu = L.estado.usuario && L.estado.usuario.perfil === p;
      return '<div class="alcada" data-ordem="' + n.ordem + '">' +
        '<span class="ordem">N' + n.ordem + "</span>" +
        '<span class="nome">' + U.esc(n.nome) +
          (eu ? ' <span class="pastilha destaque">você</span>' : "") + "</span>" +
        '<span class="teto">' + U.esc(L.brlAlcada(p)) + "</span>" +
        '<span class="detalhe">' + U.esc(perfil ? perfil.resumo : "") + "</span>" +
        "</div>";
    }).join("") + "</div>");

  // A cadeia muda com o valor: é o que o gestor precisa entender antes de
  // abrir uma solicitação.
  var exemplos = [L.reais(80), L.reais(1500), L.reais(4000), L.reais(18400), L.reais(60000)];
  html += U.painelHtml("Quem precisa aprovar, por valor", "Exemplos",
    '<div class="rolagem"><table><thead><tr>' +
    "<th>Valor da solicitação</th><th>Cadeia de aprovação</th>" +
    "</tr></thead><tbody>" +
    exemplos.map(function (v) {
      var cadeia = L.cadeiaDeAprovacao(v);
      return '<tr><td class="num" data-rotulo="Valor">' + L.brl(v) + "</td>" +
        '<td data-rotulo="Cadeia"><span class="cadeia" style="padding:0">' +
        cadeia.map(function (p, i) {
          var ultimo = i === cadeia.length - 1;
          return (i > 0 ? '<span class="seta-elo" aria-hidden="true">→</span>' : "") +
            '<span class="elo' + (ultimo ? " final" : "") + '">' + U.esc(L.NIVEIS[p].nome) + "</span>";
        }).join("") + "</span></td></tr>";
    }).join("") + "</tbody></table></div>");

  html += U.painelHtml("O que cada perfil enxerga", "Módulos por perfil",
    '<div class="rolagem"><table><thead><tr><th>Perfil</th><th>Módulos</th></tr></thead><tbody>' +
    ordenados.map(function (p) {
      var perfil = T.PERFIS[p];
      if (!perfil) return "";
      var mods = perfil.modulos === "*"
        ? "todos os módulos"
        : perfil.modulos.map(function (c) {
            var m = T.MODULOS.find(function (x) { return x.chave === c; });
            return m ? m.nome : c;
          }).join(" · ");
      return '<tr><td data-rotulo="Perfil"><span class="principal">' + U.esc(perfil.nome) + "</span></td>" +
        '<td data-rotulo="Módulos">' + U.esc(mods) + "</td></tr>";
    }).join("") + "</tbody></table></div>");

  return html;
};

// ---------------------------------------------------------------- solicitações

T.FLUXO = ["Solicitado", "Gestor", "Administrativo", "Direção", "Financeiro", "Concluído"];

/** Mesmo padrão de T.ROTULOS_AUSENCIA: nome de exibição, nunca a constante. */
T.ROTULOS_TIPO_SOLICITACAO = {
  COMPRA: "Compra", PAGAMENTO: "Pagamento", REEMBOLSO: "Reembolso", HORA_EXTRA: "Hora extra",
  AJUSTE_PONTO: "Ajuste de ponto", MATERIAL: "Material", MANUTENCAO: "Manutenção",
  TECNOLOGIA: "Tecnologia", CONTRATACAO: "Contratação", OUTRO: "Outro",
  ALTERACAO_CADASTRO: "Alteração de cadastro"
};

/** Campos de cadastro que o RH altera e a Direção revê, com o nome de exibição. */
T.ROTULOS_CAMPO_CADASTRO = {
  regime: "Regime", salarioBaseCentavos: "Salário base", cargaHorariaSemanal: "Carga horária semanal",
  valorHoraAulaCentavos: "Valor da hora-aula", aulasSemanais: "Aulas por semana", valorHoraCentavos: "Valor da hora",
  horasSemanais: "Horas por semana", empresaCodigo: "Empresa pagadora", temTicket: "Recebe Ticket",
  valorTicketCentavos: "Valor do Ticket", ticketSoma: "Ticket soma (em vez de descontar)", temMei: "Recebe parte como MEI",
  valorMeiCentavos: "Valor do MEI", valorCltCentavos: "Valor CLT informado", dataAdmissao: "Data de admissão",
  cargasPorSegmento: "Carga por setor",
  aulasExtrasSemanais: "Aula extra / projeto semanal", valorHoraExtra: "Hora-aula da carga extra", aulasExtras: "Aulas extras",
  aulasSubstituicao: "Aulas avulsas", aulasNoturnas: "Aulas noturnas", aulasNaoDadas: "Aulas não dadas",
  semanasFalta: "Semanas de falta", horasExtras50: "Horas extras 50%", horasExtras100: "Horas extras 100%",
  diasFalta: "Dias de falta", horasNoturnas: "Horas noturnas", valeTransporte: "Vale-transporte",
  pensaoModo: "Pensão (modo)", pensaoQuantidade: "Pensão (valor)", remuneracaoOutrosVinculos: "Remuneração em outros vínculos",
  inssOutrosVinculos: "INSS em outros vínculos", descontoOutrosObs: "Observação dos outros descontos",
  descontoCantina: "Desconto: Cantina", descontoMaterial: "Desconto: Material hotelr", descontoMensalidade: "Desconto: Mensalidade",
  descontoPlanoSaude: "Desconto: Plano de saúde", descontoAdiantamento: "Desconto: Adiantamento (vale)",
  descontoRobotica: "Desconto: Robótica", descontoEmprestimos: "Desconto: Empréstimos", descontoOutros: "Desconto: Outros",
  valorMensalCentavos: "Valor da nota (mensal)", descontosFixos: "Descontos fixos", servico: "Serviço",
  enquadramento: "Enquadramento", servicoComCppNoMei: "Serviço com CPP no MEI"
};
T.CAMPOS_DINHEIRO_MOVIMENTO = ["valorHoraExtra", "valeTransporte", "remuneracaoOutrosVinculos", "inssOutrosVinculos",
  "descontoCantina", "descontoMaterial", "descontoMensalidade", "descontoPlanoSaude", "descontoAdiantamento",
  "descontoRobotica", "descontoEmprestimos", "descontoOutros"];
T.textoCampoCadastro = function (campo, v) {
  if (v === null || v === undefined || v === "") return "—";
  if (/Centavos$/.test(campo) || T.CAMPOS_DINHEIRO_MOVIMENTO.indexOf(campo) !== -1) return L.brl(Number(v));
  if (campo === "descontosFixos") return v.length ? v.map(function (x) { return x.nome + " " + L.brl(x.valor); }).join(", ") : "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (campo === "cargasPorSegmento") return v.length ? v.map(function (x) { return x.segmento + " " + x.aulas; }).join(", ") : "—";
  if (campo === "dataAdmissao") return L.dataBR(v);
  return String(v);
};
T.ROTULOS_URGENCIA = { BAIXA: "Baixa", NORMAL: "Normal", ALTA: "Alta", CRITICA: "Crítica" };

T._solicitacoesCarregadas = false;
T._carregandoSolicitacoes = false;

function carregarSolicitacoesDaApi() {
  if (T._carregandoSolicitacoes) return;
  T._carregandoSolicitacoes = true;
  L.api.get("/api/solicitacoes").then(function (lista) {
    L.estado.solicitacoes = lista || [];
    T._solicitacoesCarregadas = true;
    T._carregandoSolicitacoes = false;
    T.renderizar();
  }).catch(function (erro) {
    T._carregandoSolicitacoes = false;
    console.error("Não foi possível carregar solicitações:", erro);
    U.avisar("Não foi possível carregar a lista de solicitações agora.");
  });
}

T.acoes["nova-solicitacao"] = function () {
  U.abrirFormulario({
    titulo: "Nova solicitação",
    sub: "Substitui o pedido por WhatsApp — com trilha de quem pediu, quem aprovou e quando",
    largo: true,
    campos: [
      { id: "tipo", rotulo: "Tipo", tipo: "select", obrigatorio: true,
        opcoes: Object.keys(T.ROTULOS_TIPO_SOLICITACAO).map(function (k) { return { valor: k, rotulo: T.ROTULOS_TIPO_SOLICITACAO[k] }; }) },
      { id: "titulo", rotulo: "O que você precisa", obrigatorio: true },
      { id: "justificativa", rotulo: "Justificativa", tipo: "textarea", obrigatorio: true,
        dica: "Quem aprova decide por aqui — vale escrever o porquê." },
      { id: "valor", rotulo: "Valor estimado", tipo: "moeda", par: true },
      { id: "urgencia", rotulo: "Urgência", tipo: "select",
        opcoes: Object.keys(T.ROTULOS_URGENCIA).map(function (k) { return { valor: k, rotulo: T.ROTULOS_URGENCIA[k] }; }), padrao: "NORMAL" },
      { id: "fornecedorId", rotulo: "Fornecedor sugerido", tipo: "select",
        opcoes: [{ valor: "", rotulo: "— nenhum —" }].concat(
          L.estado.fornecedores.map(function (f) { return { valor: f.id, rotulo: f.razaoSocial }; })) }
    ],
    valores: { urgencia: "NORMAL" },
    rotuloSalvar: "Enviar solicitação",
    aoSalvar: function (v) {
      if (L.USA_BACKEND) {
        L.api.post("/api/solicitacoes", {
          tipo: v.tipo, titulo: v.titulo, justificativa: v.justificativa,
          valorCentavos: v.valor || undefined, urgencia: v.urgencia || undefined,
          fornecedorId: v.fornecedorId || undefined,
        }).then(function (criada) {
          T._solicitacoesCarregadas = false;
          carregarSolicitacoesDaApi();
          U.fecharModal();
          T.ir("solicitacoes");
          U.avisar("Solicitação #" + criada.numero + " enviada.");
        }).catch(function (erro) {
          U.avisar(erro.message || "Não foi possível enviar a solicitação.");
        });
        return;
      }
      v.solicitante = L.estado.usuario.nome;
      v.perfilSolicitante = L.estado.usuario.perfil;
      // A cadeia é fixada aqui, pelo valor. Quem recebe é uma pessoa só.
      var s = L.abrirSolicitacao(v);
      U.fecharModal();
      T.ir("solicitacoes");
      var quem = L.NIVEIS[L.responsavelPor(s)];
      U.avisar("Solicitação #" + s.numero + " enviada para " +
        (quem ? quem.nome : "aprovação") + ".");
    }
  });
};

T.PASTILHA_SOLICITACAO = {
  RASCUNHO: ["neutro", "Rascunho"], SOLICITADO: ["pendente", "Aguardando"],
  EM_APROVACAO: ["pendente", "Em aprovação"], ALTERACAO_SOLICITADA: ["pendente", "Alteração pedida"],
  APROVADO: ["ok", "Aprovado"], REJEITADO: ["critico", "Rejeitado"],
  CONCLUIDO: ["ok", "Concluído"], CANCELADO: ["neutro", "Cancelado"]
};

T.linhasSolicitacao = function (lista) {
  return U.tabelaHtml([
    { rotulo: "Nº", classe: "cod", conteudo: function (s) { return "#" + s.numero; } },
    { rotulo: "Solicitação", conteudo: function (s) {
      return '<div class="principal">' + U.esc(s.titulo) + '</div><div class="secundario">' +
        U.esc(T.ROTULOS_TIPO_SOLICITACAO[s.tipo] || s.tipo) + " · " + U.esc(s.solicitante) + "</div>"; } },
    { rotulo: "Valor", direita: true, conteudo: function (s) {
      return '<span class="num">' + (s.valor ? L.brl(s.valor) : "—") + "</span>"; } },
    { rotulo: "Urgência", direita: true, conteudo: function (s) {
      var tom = s.urgencia === "CRITICA" ? "critico" : s.urgencia === "ALTA" ? "pendente" : "neutro";
      return '<span class="pastilha ' + tom + '">' + U.esc(T.ROTULOS_URGENCIA[s.urgencia] || s.urgencia) + "</span>"; } },
    { rotulo: "Status", direita: true, conteudo: function (s) {
      var p = T.PASTILHA_SOLICITACAO[s.status] || ["neutro", s.status];
      return '<span class="pastilha ' + p[0] + '">' + p[1] + "</span>"; } },
    { rotulo: "", direita: true, conteudo: function (s) {
      return '<button class="botao miudo" data-acao="abrir-solicitacao" data-id="' + s.id + '">Abrir</button>'; } }
  ], lista, {
    buscaLocal: "Solicitação ou solicitante",
    tituloVazio: "Nenhuma solicitação",
    textoVazio: "",
    acaoVazio: { acao: "nova-solicitacao", rotulo: "Abrir solicitação" }
  });
};

T.telas.solicitacoes = function () {
  if (L.USA_BACKEND && !T._solicitacoesCarregadas) carregarSolicitacoesDaApi();
  if (L.USA_BACKEND && !T._fornecedoresCarregados) carregarFornecedoresDaApi();

  return T.cabecalho("Central de Solicitações",
    "Cada passo do fluxo de aprovação fica registrado.",
    T.botaoNovo("nova-solicitacao", "Nova solicitação")) +
    '<div class="painel">' + T.linhasSolicitacao(
      L.estado.solicitacoes.slice().sort(function (a, b) { return b.numero - a.numero; })) + "</div>";
};

T.telas.aprovacoes = function () {
  if (L.USA_BACKEND && !T._solicitacoesCarregadas) carregarSolicitacoesDaApi();
  if (L.USA_BACKEND && !T._contasCarregadas) carregarContasDaApi();

  var perfil = L.estado.usuario.perfil;
  var minhas = L.aguardandoMim(perfil);
  var acompanho = L.acompanhandoEu(perfil);
  // A Direção decide em qualquer etapa, então vê tudo que está aberto.
  if (perfil === "DIRECAO") {
    minhas = L.estado.solicitacoes.filter(L.estaAberta);
    acompanho = [];
  }
  var contasPendentes = L.estado.contas.filter(function (c) { return c.status === "AGUARDANDO_APROVACAO"; });

  var html = T.cabecalho("Minhas Aprovações",
    "Pedidos e pagamentos que precisam da sua decisão.");

  if (!minhas.length && !contasPendentes.length && !acompanho.length) {
    return html + '<div class="aprovacoes-vazio" role="status">' +
      '<span class="aprovacoes-vazio-icone" aria-hidden="true">✓</span>' +
      '<div><h2>Tudo em dia</h2><p>Nenhum pedido ou pagamento aguarda sua decisão.</p></div>' +
      '<div class="aprovacoes-vazio-acoes">' +
      (T.podeVer("solicitacoes") ? '<button class="botao miudo" data-ir="solicitacoes">Ver solicitações</button>' : "") +
      (T.podeVer("contas") ? '<button class="botao miudo" data-ir="contas">Ver contas</button>' : "") +
      '</div></div>';
  }

  if (minhas.length) {
    html += U.painelHtml("Pedidos para decidir", minhas.length + (minhas.length === 1 ? " pedido" : " pedidos"),
      T.linhasSolicitacao(minhas));
  }

  // Transparência sem poder de agir: quem está na cadeia acompanha o pedido
  // andar, mas só decide na sua vez.
  if (acompanho.length) {
    html += U.painelHtml("Na cadeia, ainda não na sua vez", acompanho.length + " em andamento",
      U.tabelaHtml([
        { rotulo: "Nº", classe: "cod", conteudo: function (s) { return "#" + s.numero; } },
        { rotulo: "Solicitação", conteudo: function (s) {
          return '<div class="principal">' + U.esc(s.titulo) + '</div><div class="secundario">' +
            U.esc(s.solicitante) + "</div>"; } },
        { rotulo: "Valor", direita: true, conteudo: function (s) {
          return '<span class="num">' + (s.valor ? L.brl(s.valor) : "—") + "</span>"; } },
        { rotulo: "Está com", direita: true, conteudo: function (s) {
          var r = L.responsavelPor(s);
          return '<span class="pastilha pendente">' + U.esc(L.NIVEIS[r] ? L.NIVEIS[r].nome : r) + "</span>"; } },
        { rotulo: "", direita: true, conteudo: function (s) {
          return '<button class="botao miudo" data-acao="abrir-solicitacao" data-id="' + s.id + '">Ver</button>'; } }
      ], acompanho));
  }

  if (contasPendentes.length) {
    html += U.painelHtml("Pagamentos para decidir", contasPendentes.length + (contasPendentes.length === 1 ? " pagamento" : " pagamentos"),
      U.tabelaHtml([
          { rotulo: "Descrição", conteudo: function (c) { return U.esc(c.descricao); } },
          { rotulo: "Vencimento", conteudo: function (c) { return L.dataBR(c.vencimento); } },
          { rotulo: "Valor", direita: true, conteudo: function (c) { return '<span class="num">' + L.brl(c.valor) + "</span>"; } },
          { rotulo: "", direita: true, conteudo: function (c) {
            return T.podeEditar() && T.temPerfil("DIRECAO")
              ? '<button class="botao miudo" data-acao="aprovar-conta" data-id="' + c.id + '">Aprovar</button>' +
                ' <button class="botao miudo perigo" data-acao="rejeitar-conta" data-id="' + c.id + '">Rejeitar</button>'
              : '<span class="pastilha neutro">aguarda a Direção</span>'; } }
        ], contasPendentes));
  }

  return html;
};

function mudarStatusConta(id, status, rotuloAcao) {
  if (!L.buscarPorId("contas", id)) return;
  if (L.USA_BACKEND) {
    L.api.patch("/api/contas/" + id, { status: status }).then(function () {
      T._contasCarregadas = false;
      carregarContasDaApi();
      T.renderizar();
    }).catch(function (erro) {
      U.avisar(erro.message || "Não foi possível " + rotuloAcao + " a conta.");
    });
    return;
  }
  L.atualizar("contas", id, { status: status });
  L.registrar("contas", L.buscarPorId("contas", id), status === "APROVADO" ? "APROVAR" : "REJEITAR");
  T.renderizar();
}
T.acoes["aprovar-conta"] = function (id) { mudarStatusConta(id, "APROVADO", "aprovar"); };
T.acoes["rejeitar-conta"] = function (id) { mudarStatusConta(id, "CANCELADO", "rejeitar"); };

T.acoes["abrir-solicitacao"] = function (id) {
  var s = L.buscarPorId("solicitacoes", id);
  if (!s) return;
  var eu = L.estado.usuario;
  var responsavel = L.responsavelPor(s);
  var minhaVez = L.responsavelPor(s) === eu.perfil;
  // Só a Direção decide; os demais perfis acompanham o andamento.
  var podeDecidir = T.podeEditar() && T.temPerfil("DIRECAO") && L.podeDecidir(s, "DIRECAO");

  var ROTULO = {
    APROVAR: "Aprovou", REJEITAR: "Rejeitou",
    SOLICITAR_ALTERACAO: "Pediu alteração", DELEGAR: "Delegou"
  };

  var trilha = s.decisoes.length === 0
    ? '<p style="color:var(--tinta-media);font-size:var(--t-1);margin:0">Nenhuma decisão registrada ainda.</p>'
    : '<ul class="alertas">' + s.decisoes.map(function (d) {
        var tom = d.decisao === "REJEITAR" ? "critico" : d.decisao === "APROVAR" ? "info" : "atencao";
        var nivel = L.NIVEIS[d.perfil];
        return '<li><div class="alerta ' + tom + '">' +
          '<span class="barra"></span><span class="miolo"><span class="titulo">' +
          U.esc((ROTULO[d.decisao] || d.decisao) + ": " + d.por) +
          (nivel ? " · " + U.esc(nivel.nome) : "") +
          (d.naVez === false ? ' <span class="pastilha destaque">fora da vez</span>' : "") +
          "</span>" +
          '<span class="detalhe">' + U.esc(d.comentario || "sem comentário") + " · " + L.dataBR(d.quando) + "</span>" +
          "</span></div></li>";
      }).join("") + "</ul>";

  // Onde o pedido está e por onde ainda vai passar.
  var percurso = '<div class="cadeia">' + (s.cadeia || []).map(function (p, i) {
    var efetivo = (s.delegacoes && s.delegacoes[p]) || p;
    var nome = L.NIVEIS[efetivo] ? L.NIVEIS[efetivo].nome : efetivo;
    var estado = i < s.etapa ? "elo concluido" : i === s.etapa ? "elo atual" : "elo";
    return (i > 0 ? '<span class="seta-elo" aria-hidden="true">→</span>' : "") +
      '<span class="' + estado + '">' + U.esc(nome) +
      (efetivo !== p ? " (delegado)" : "") + "</span>";
  }).join("") + "</div>";

  function decidir(decisao) {
    var comentario = U.el("f-comentario") ? U.el("f-comentario").value.trim() : "";
    if (decisao === "REJEITAR" && !comentario) {
      var erro = U.el("erro-comentario");
      if (erro) { erro.textContent = "Recusar exige motivo."; erro.classList.remove("oculto"); }
      return;
    }

    if (L.USA_BACKEND) {
      L.api.post("/api/solicitacoes/" + s.id + "/decidir", { decisao: decisao, comentario: comentario || undefined })
        .then(function (resultado) {
          T._solicitacoesCarregadas = false;
          T._contasCarregadas = false;
          carregarSolicitacoesDaApi();
          if (s.tipo === "ALTERACAO_CADASTRO" && T._lot) T._lot.dados = null;
          if (s.tipo === "ALTERACAO_CADASTRO") L.recarregarFuncionarios().then(function () { T.renderizar(); });
          U.fecharModal();
          T.renderizar();
          if (s.tipo === "ALTERACAO_CADASTRO" && resultado.status === "REJEITADO") {
            U.avisar("Alteração recusada: o cadastro voltou como estava.");
          } else if (s.tipo === "ALTERACAO_CADASTRO" && resultado.status === "APROVADO") {
            U.avisar("Alteração aceita.");
          } else if (resultado.status === "EM_APROVACAO") {
            U.avisar("Aprovado por você. Segue para a próxima etapa.");
          } else if (resultado.status === "APROVADO") {
            U.avisar("Aprovação concluída" + (s.valor > 0 ? " · conta a pagar gerada." : "."));
          } else if (resultado.status === "REJEITADO") {
            U.avisar("Solicitação #" + s.numero + " rejeitada.");
          }
        }).catch(function (erro) {
          U.avisar(erro.message || "Não foi possível registrar a decisão.");
        });
      return;
    }

    var novo = L.decidirSolicitacao(s, decisao, eu, comentario);

    // Só vira conta a pagar quando a cadeia inteira aprovou. Antes disso o
    // pedido apenas avançou para o próximo responsável.
    if (novo === "APROVADO" && s.valor > 0 && !s.gerouConta) {
      L.criar("contas", {
        descricao: s.titulo, fornecedorId: s.fornecedorId || "",
        categoria: "Administrativo", valor: s.valor,
        competencia: L.competenciaAtual(), vencimento: L.hoje(),
        status: "APROVADO", solicitacaoId: s.id,
        observacoes: "Gerada pela solicitação #" + s.numero
      });
      s.gerouConta = true;
    }
    U.fecharModal();
    T.renderizar();

    if (novo === "EM_APROVACAO") {
      var proximo = L.NIVEIS[L.responsavelPor(s)];
      U.avisar("Aprovado por você. Segue para " + (proximo ? proximo.nome : "a próxima etapa") + ".");
    } else if (novo === "APROVADO") {
      U.avisar("Aprovação concluída" + (s.gerouConta ? " · conta a pagar gerada." : "."));
    } else if (novo === "REJEITADO") {
      U.avisar("Solicitação #" + s.numero + " rejeitada.");
    }
  }

  function abrirDelegacao() {
    var candidatos = L.candidatosDelegacao(s, eu.perfil);
    if (!candidatos.length) { U.avisar("Ninguém mais tem alçada para este valor."); return; }
    U.fecharModal();
    U.abrirFormulario({
      titulo: "Delegar decisão",
      sub: "#" + s.numero + " · " + s.titulo,
      campos: [
        { id: "para", rotulo: "Passar a decisão para", tipo: "select", obrigatorio: true,
          opcoes: candidatos.map(function (p) {
            return { valor: p, rotulo: L.NIVEIS[p].nome + " — aprova " + L.brlAlcada(p) };
          }),
          dica: "Só aparecem perfis com alçada para " + L.brl(s.valor || 0) + "." },
        { id: "motivo", rotulo: "Motivo", tipo: "textarea",
          dica: "Fica registrado na trilha." }
      ],
      rotuloSalvar: "Delegar",
      aoSalvar: function (v) {
        if (L.USA_BACKEND) {
          L.api.post("/api/solicitacoes/" + s.id + "/delegar", { paraPerfil: v.para, motivo: v.motivo || undefined })
            .then(function () {
              T._solicitacoesCarregadas = false;
              carregarSolicitacoesDaApi();
              U.fecharModal();
              T.renderizar();
              U.avisar("Decisão delegada para " + L.NIVEIS[v.para].nome + ".");
            }).catch(function (erro) {
              U.avisar(erro.message || "Não foi possível delegar.");
            });
          return;
        }
        L.delegar(s, eu.perfil, v.para, eu, v.motivo);
        U.fecharModal();
        T.renderizar();
        U.avisar("Decisão delegada para " + L.NIVEIS[v.para].nome + ".");
      }
    });
  }

  U.abrirModal({
    titulo: "#" + s.numero + " · " + s.titulo,
    sub: (T.ROTULOS_TIPO_SOLICITACAO[s.tipo] || s.tipo) + " · " + s.solicitante,
    largo: true,
    corpo:
      '<dl class="ficha">' + [
        ["Valor", s.valor ? L.brl(s.valor) : "—"],
        ["Urgência", s.urgencia],
        ["Status", (T.PASTILHA_SOLICITACAO[s.status] || ["", s.status])[1]],
        ["Aberta em", L.dataBR(s.criadoEm)]
      ].map(function (p) { return "<div><dt>" + U.esc(p[0]) + "</dt><dd>" + U.esc(p[1]) + "</dd></div>"; }).join("") + "</dl>" +
      (s.tipo === "ALTERACAO_CADASTRO" && s.revisao && s.revisao.acao === "LOTACAO_VINCULO" && (s.revisao.itens || []).length
        ? '<h3 style="font-size:var(--t-2);margin:18px 0 6px">Ligações feitas na lotação (já estão valendo)</h3>' +
          U.tabelaHtml([
            { rotulo: "Na planilha", conteudo: function (i) { return '<div class="principal">' + U.esc(i.professor || "—") + '</div><div class="secundario">' + U.esc(i.disciplina) + "</div>"; } },
            { rotulo: "Ligado a", conteudo: function (i) { return "<strong>" + U.esc(T.nomeExibicao ? T.nomeExibicao(i.nomeCadastro || "") : (i.nomeCadastro || "")) + "</strong>"; } }
          ], s.revisao.itens) +
          '<p style="margin:8px 0 0;color:var(--tinta-media)">Aceitar mantém as ligações. Recusar desfaz todas (o que alguém já trocou depois fica como está).</p>'
        : '') +
      (s.tipo === "ALTERACAO_CADASTRO" && s.revisao && s.revisao.acao === "LOTACAO_VINCULO" ? "" :
      (s.tipo === "ALTERACAO_CADASTRO" && s.revisao && s.revisao.campos && s.revisao.campos.length
        ? '<h3 style="font-size:var(--t-2);margin:18px 0 6px">O que mudou (já está valendo)</h3>' +
          U.tabelaHtml([
            { rotulo: "Campo", conteudo: function (k) { return U.esc(T.ROTULOS_CAMPO_CADASTRO[k] || k); } },
            { rotulo: "Era", direita: true, conteudo: function (k) { return '<span class="num">' + U.esc(T.textoCampoCadastro(k, s.revisao.antes[k])) + "</span>"; } },
            { rotulo: "Ficou", direita: true, conteudo: function (k) { return '<span class="num"><strong>' + U.esc(T.textoCampoCadastro(k, s.revisao.depois[k])) + "</strong></span>"; } }
          ], s.revisao.campos) +
          '<p style="margin:8px 0 0;color:var(--tinta-media)">Aceitar mantém como está. Recusar devolve o cadastro ao que era antes.</p>'
        : '<h3 style="font-size:var(--t-2);margin:18px 0 6px">Justificativa</h3>' +
          '<p style="margin:0;color:var(--tinta-media)">' + U.esc(s.justificativa) + "</p>")) +
      '<h3 style="font-size:var(--t-2);margin:18px 0 6px">Percurso de aprovação</h3>' + percurso +
      (L.estaAberta(s) && responsavel
        ? '<div class="aviso-tela" style="margin-top:12px"><span aria-hidden="true">' +
          (minhaVez ? "→" : "·") + "</span><div>" +
          (minhaVez
            ? "<strong>É a sua vez.</strong> Enquanto você não decidir, o pedido não anda."
            : "Agora está com <strong>" + U.esc(L.NIVEIS[responsavel].nome) + "</strong>" +
              (eu.perfil === "DIRECAO" ? " — mas a Direção pode decidir em qualquer etapa." : ".")) +
          "</div></div>"
        : "") +
      (s.gerouConta ? '<div class="aviso-tela" style="margin-top:12px"><span aria-hidden="true">✓</span><div>' +
        "Esta solicitação já gerou uma conta a pagar. A informação foi digitada uma vez só.</div></div>" : "") +
      '<h3 style="font-size:var(--t-2);margin:18px 0 6px">Histórico de decisões</h3>' + trilha +
      (podeDecidir
        ? '<label class="campo" style="margin-top:18px"><span>Comentário</span>' +
          '<textarea id="f-comentario" placeholder="' + (s.tipo === "ALTERACAO_CADASTRO" ? "Obrigatório ao recusar" : "Obrigatório ao rejeitar") + '"></textarea>' +
          '<span class="erro oculto" id="erro-comentario"></span></label>'
        : ""),
    acoes: podeDecidir && s.tipo === "ALTERACAO_CADASTRO"
      ? [
          { rotulo: ({ CRIAR: "Recusar e apagar o cadastro novo", DESLIGAR: "Recusar e reativar a pessoa", EXCLUIR: "Recusar (manter o cadastro)", LOTACAO_VINCULO: "Recusar e desfazer as ligações" })[(s.revisao || {}).acao] || "Recusar e voltar como estava",
            classe: "perigo", esquerda: true, aoClicar: function () { decidir("REJEITAR"); } },
          { rotulo: (s.revisao || {}).acao === "EXCLUIR" ? "Aceitar e excluir" : "Aceitar", classe: "primario", aoClicar: function () { decidir("APROVAR"); } }
        ]
      : podeDecidir
      ? [
          { rotulo: "Rejeitar", classe: "perigo", esquerda: true, aoClicar: function () { decidir("REJEITAR"); } },
          { rotulo: "Delegar", aoClicar: abrirDelegacao },
          { rotulo: "Pedir alteração", aoClicar: function () { decidir("SOLICITAR_ALTERACAO"); } },
          { rotulo: "Aprovar", classe: "primario", aoClicar: function () { decidir("APROVAR"); } }
        ]
      : [{ rotulo: "Fechar", aoClicar: U.fecharModal }]
  });
};

// ---------------------------------------------------------------- férias

/** Nome de exibição de cada tipo de ausência — a constante interna
 * (MAIUSCULA_COM_UNDERSCORE) nunca aparece para quem usa o sistema. */
T.ROTULOS_AUSENCIA = {
  FERIAS: "Férias", ATESTADO: "Atestado",
  LICENCA_MATERNIDADE: "Licença maternidade", LICENCA_PATERNIDADE: "Licença paternidade",
  AFASTAMENTO_INSS: "Afastamento INSS", FOLGA: "Folga", FALTA_JUSTIFICADA: "Falta justificada"
};
/** Tipos que existem no servidor mas não se escolhem no formulário: só nome de exibição. */
T.rotuloAusencia = function (tipo) {
  var extra = { LICENCA_NAO_REMUNERADA: "Licença não remunerada", SUSPENSAO: "Suspensão", OUTRO: "Outro" };
  return T.ROTULOS_AUSENCIA[tipo] || extra[tipo] || tipo;
};
T.ROTULOS_STATUS_AUSENCIA = { APROVADA: "Aprovada" };

T._ausenciasCarregadas = false;
T._carregandoAusencias = false;

function carregarAusenciasDaApi() {
  if (T._carregandoAusencias) return;
  T._carregandoAusencias = true;
  L.api.get("/api/ausencias").then(function (lista) {
    L.estado.ausencias = lista || [];
    T._ausenciasCarregadas = true;
    T._carregandoAusencias = false;
    T.renderizar();
  }).catch(function (erro) {
    T._carregandoAusencias = false;
    console.error("Não foi possível carregar ausências:", erro);
    U.avisar("Não foi possível carregar a lista de ausências agora.");
  });
}

T.acoes["nova-ausencia"] = function () {
  if (L.ativos().length === 0) { T.ir("funcionarios"); return; }
  U.abrirFormulario({
    titulo: "Registrar ausência",
    sub: "Férias, atestado, licença ou afastamento",
    campos: [
      { id: "funcionarioId", rotulo: "Funcionário", tipo: "select", obrigatorio: true,
        opcoes: L.ativos().map(function (f) { return { valor: f.id, rotulo: f.nome }; }) },
      { id: "tipo", rotulo: "Tipo", tipo: "select",
        opcoes: Object.keys(T.ROTULOS_AUSENCIA).map(function (k) { return { valor: k, rotulo: T.ROTULOS_AUSENCIA[k] }; }) },
      { id: "inicio", rotulo: "Início", tipo: "data", obrigatorio: true, par: true, padrao: L.hoje() },
      { id: "fim", rotulo: "Fim", tipo: "data", obrigatorio: true, padrao: L.hoje() },
      { id: "observacoes", rotulo: "Observações", tipo: "textarea" }
    ],
    aoSalvar: function (v) {
      if (v.fim < v.inicio) {
        var erro = U.el("erro-fim");
        erro.textContent = "O fim não pode ser antes do início."; erro.classList.remove("oculto");
        return;
      }
      if (L.USA_BACKEND) {
        L.api.post("/api/ausencias", {
          funcionarioId: v.funcionarioId, tipo: v.tipo || undefined,
          inicio: v.inicio, fim: v.fim, observacoes: v.observacoes || undefined,
        }).then(function () {
          T._ausenciasCarregadas = false;
          carregarAusenciasDaApi();
          U.fecharModal();
          T.ir("ferias");
          U.avisar("Ausência registrada.");
        }).catch(function (erro) {
          U.avisar(erro.message || "Não foi possível registrar a ausência.");
        });
        return;
      }
      v.status = "APROVADA";
      L.criar("ausencias", v);
      U.fecharModal();
      T.ir("ferias");
    }
  });
};

T.telas.ferias = function () {
  if (L.USA_BACKEND && !T._ausenciasCarregadas) carregarAusenciasDaApi();

  var html = T.cabecalho("Férias e Ausências",
    "Férias, atestados e licenças da equipe.",
    T.botaoNovo("nova-ausencia", "Registrar ausência"));

  // Conflito: mais de um do mesmo setor fora ao mesmo tempo.
  var conflitos = [];
  var porSetor = {};
  L.estado.ausencias.forEach(function (a) {
    var f = L.buscarPorId("funcionarios", a.funcionarioId);
    if (!f) return;
    var setor = f.departamento || "sem setor";
    (porSetor[setor] = porSetor[setor] || []).push({ a: a, f: f });
  });
  Object.keys(porSetor).forEach(function (setor) {
    var itens = porSetor[setor];
    for (var i = 0; i < itens.length; i++) {
      for (var j = i + 1; j < itens.length; j++) {
        if (itens[i].a.inicio <= itens[j].a.fim && itens[j].a.inicio <= itens[i].a.fim) {
          conflitos.push(setor + ": " + itens[i].f.nome + " e " + itens[j].f.nome + " ausentes ao mesmo tempo");
        }
      }
    }
  });

  if (conflitos.length) {
    html += '<div class="aviso-tela"><span aria-hidden="true">▲</span><div><strong>Conflito de agenda detectado.</strong> ' +
      conflitos.slice(0, 3).map(U.esc).join(" · ") + "</div></div>";
  }

  html += '<div class="painel">' + U.tabelaHtml([
    { rotulo: "Funcionário", conteudo: function (a) {
      var f = L.buscarPorId("funcionarios", a.funcionarioId);
      return '<div class="principal">' + U.esc(f ? f.nome : (a.nome || "—")) + '</div><div class="secundario">' +
        U.esc(f ? (f.departamento || "") : (a.nome ? "Desligado(a)" : "")) + "</div>"; } },
    { rotulo: "Tipo", conteudo: function (a) { return U.esc(T.rotuloAusencia(a.tipo)); } },
    { rotulo: "Período", conteudo: function (a) { return L.dataBR(a.inicio) + " a " + L.dataBR(a.fim); } },
    { rotulo: "Dias", direita: true, conteudo: function (a) {
      return String(Math.round((new Date(a.fim) - new Date(a.inicio)) / 86400000) + 1); } },
    { rotulo: "Status", direita: true, conteudo: function (a) {
      return '<span class="pastilha ok">' + U.esc(T.ROTULOS_STATUS_AUSENCIA[a.status] || a.status) + "</span>"; } }
  ], L.estado.ausencias.slice().sort(function (a, b) { return a.inicio.localeCompare(b.inicio); }), {
    buscaLocal: "Funcionário, tipo ou período",
    tituloVazio: "Nenhuma ausência registrada",
    textoVazio: "",
    acaoVazio: { acao: "nova-ausencia", rotulo: "Registrar a primeira" }
  }) + "</div>";

  return html;
};

// ---------------------------------------------------------------- 13º, férias (pagamento) e rescisão
//
// Três motores reais (src/dominio/folha/decimo-terceiro.ts, ferias.ts,
// rescisao.ts), cada um com sua própria tabela no banco — sem equivalente no
// protótipo local (`L.USA_BACKEND = false`), porque a conta certa depende de
// tabelas de INSS/IRRF/CCT vindas da API, não de um seed fixo. É a mesma
// fronteira de "Controle de Acesso" (`T.telaAcessosBackend`): sem backend,
// só o aviso explicando que precisa dele.

T._decimoTerceiroAno = null;
T._carregandoDecimoTerceiro = false;

function carregarDecimoTerceiroDaApi(ano) {
  if (T._carregandoDecimoTerceiro) return;
  T._carregandoDecimoTerceiro = true;
  L.api.get("/api/decimo-terceiro/" + ano).then(function (linhas) {
    L.estado.decimoTerceiro = linhas || [];
    T._decimoTerceiroAno = ano;
    T._carregandoDecimoTerceiro = false;
    T.renderizar();
  }).catch(function (erro) {
    T._carregandoDecimoTerceiro = false;
    console.error("Não foi possível carregar o 13º salário:", erro);
    U.avisar("Não foi possível carregar o 13º salário agora.");
  });
}

/** Rubricas + totais de um resultado (13º, férias ou rescisão) — mesmo formato dos três motores. */
function resultadoEventoHtml(r, opts) {
  if (!r) return "";
  opts = opts || {};
  var linhas = (r.rubricas || []).map(function (x, i) {
    return Object.assign({ id: "rub-" + i }, x);
  });
  var temDivergencia = (r.avisos || []).some(function (a) { return a.severidade === "DIVERGENCIA"; });
  var acaoPagamento = "";
  if (opts.acao) {
    if (r[opts.campoPago]) {
      acaoPagamento = '<span class="pastilha ok">' + U.esc(opts.rotuloPago) + '</span>';
    } else if (temDivergencia) {
      acaoPagamento = '<span class="pastilha critico">divergência</span>';
    } else {
      // Pagar e homologar é da Direção/Financeiro; o RH calcula, mas não quita.
      acaoPagamento = T.temPerfil("DIRECAO")
        ? '<button class="botao miudo" data-acao="' + opts.acao + '" data-id="' + r.id + '">' + U.esc(opts.rotuloAcao) + '</button>'
        : '<span class="pastilha neutro">aguarda a Direção</span>';
    }
  }
  return '<div style="padding:0 18px 18px">' +
    (r.avisos && r.avisos.length
      ? r.avisos.map(function (a) {
          return '<div class="aviso-tela" style="margin-bottom:12px' +
            (a.severidade === "DIVERGENCIA" ? ';background:var(--vermelho-fundo);border-color:rgba(158,36,56,.28)' : '') + '">' +
            '<span aria-hidden="true">' + (a.severidade === "DIVERGENCIA" ? "▲" : "·") + '</span><div>' + U.esc(a.mensagem) + "</div></div>";
        }).join("")
      : "") +
    U.tabelaHtml([
      { rotulo: "Cód.", classe: "cod", conteudo: function (x) { return x.codigo; } },
      { rotulo: "Rubrica", conteudo: function (x) {
        return U.esc(x.descricao) + (x.tipo === "ENCARGO_EMPREGADOR" ? ' <span class="rotulo-encargo">encargo</span>' : ""); } },
      { rotulo: "Referência", secundaria: true, conteudo: function (x) { return U.esc(x.referencia); } },
      { rotulo: "Valor", direita: true, conteudo: function (x) {
        var cl = x.tipo === "PROVENTO" ? "v-provento" : x.tipo === "DESCONTO" ? "v-desconto" : "v-encargo";
        return '<span class="num ' + cl + '">' + (x.tipo === "DESCONTO" ? "− " : "") + L.brl(x.valor) + "</span>"; } }
    ], linhas) +
    '<div class="rel-linha-resumo forte" style="margin-top:8px">' +
      "<span>Líquido</span><span></span><span></span>" +
      '<span class="num">' + L.brl(r.liquido) + "</span></div>" +
    (acaoPagamento ? '<div style="margin-top:12px;text-align:right">' + acaoPagamento + "</div>" : "") +
    "</div>";
}

/**
 * No modo com banco, `/api/funcionarios` não traz quem foi desligado — a
 * rescisão busca essas pessoas numa rota própria. Sem isso a tela dizia
 * "nenhum desligado" logo depois de alguém ser desligado.
 */
/** Busca de novo quem está desligado (depois de um desligamento, por exemplo). */
T.carregarDesligados = function () {
  if (!L.USA_BACKEND) return Promise.resolve();
  return L.api.get("/api/funcionarios/desligados").then(function (lista) {
    T._desligados = (lista || []).map(function (f) { return Object.assign({ status: "DESLIGADO" }, f); });
    T._desligadosCarregados = true;
  }).catch(function () {});
};

T.funcionariosDesligados = function () {
  if (!L.USA_BACKEND) {
    return (L.estado.funcionarios || []).filter(function (f) { return f.status === "DESLIGADO"; });
  }
  if (!T._desligadosCarregados && !T._carregandoDesligados) {
    T._carregandoDesligados = true;
    L.api.get("/api/funcionarios/desligados").then(function (lista) {
      T._desligados = (lista || []).map(function (f) { return Object.assign({ status: "DESLIGADO" }, f); });
      T._desligadosCarregados = true;
      T._carregandoDesligados = false;
      if (T.atual === "eventos") T.renderizar();
    }).catch(function () { T._carregandoDesligados = false; });
  }
  return T._desligados || [];
};

T.telas.eventos = function () {
  var html = T.cabecalho("13º salário, férias e rescisão",
    "Cálculo de 13º, férias e rescisão.");

  if (!L.USA_BACKEND) {
    return html + '<div class="aviso-tela" style="background:var(--vermelho-fundo);border-color:rgba(158,36,56,.28)">' +
      '<span aria-hidden="true">▲</span><div><strong>Precisa do backend.</strong> ' +
      "13º, férias e rescisão usam INSS/IRRF/CCT vindos do banco — sem servidor não tem como calcular certo." +
      "</div></div>";
  }

  var anoAtual = String(L.hoje ? new Date(L.hoje()).getFullYear() : new Date().getFullYear());
  if (T._decimoTerceiroAno !== anoAtual) carregarDecimoTerceiroDaApi(anoAtual);

  html += U.painelHtml(
    "13º salário " + anoAtual,
    "1ª e 2ª parcela",
    '<div class="rel-nao-imprime" style="padding:18px">' +
      '<button class="botao primario miudo" data-acao="calcular-decimo-terceiro">Calcular 13º de alguém</button></div>' +
    U.tabelaHtml([
      { rotulo: "Funcionário", conteudo: function (d) { return U.esc(d.nome); } },
      { rotulo: "Parcela", direita: true, conteudo: function (d) { return String(d.parcela); } },
      { rotulo: "Meses", direita: true, conteudo: function (d) { return d.mesesTrabalhados + "/12"; } },
      { rotulo: "Líquido", direita: true, conteudo: function (d) { return L.brl(d.liquido); } },
      { rotulo: "", direita: true, conteudo: function (d) {
        if (d.temDivergencia) return '<span class="pastilha critico">divergência</span>';
        if (d.pago) return '<span class="pastilha ok">pago</span>';
        return T.temPerfil("DIRECAO")
          ? '<button class="botao miudo" data-acao="pagar-decimo-terceiro" data-id="' + d.id + '">Marcar pago</button>'
          : '<span class="pastilha neutro">aguarda a Direção</span>'; } }
    ], (L.estado.decimoTerceiro || []).map(function (d, i) { return Object.assign({ id2: "dt-" + i }, d); }), {
      tituloVazio: "Nenhum 13º calculado em " + anoAtual,
      textoVazio: "Calcule a 1ª ou 2ª parcela de alguém para começar."
    })
  );

  html += U.painelHtml(
    "Férias — cálculo de pagamento",
    "com ou sem abono de 1/3",
    '<div class="rel-nao-imprime" style="padding:18px">' +
      '<button class="botao primario miudo" data-acao="calcular-ferias-pagamento">Calcular férias de alguém</button></div>' +
    (T._ultimoResultadoFerias
      ? resultadoEventoHtml(T._ultimoResultadoFerias, { acao: "pagar-ferias", campoPago: "pago", rotuloPago: "pago", rotuloAcao: "Marcar pago" })
      : '<p class="secundario" style="padding:0 18px 18px">O resultado aparece aqui depois de calcular.</p>')
  );

  var desligados = T.funcionariosDesligados();
  html += U.painelHtml(
    "Rescisão",
    "todas as modalidades",
    '<div class="rel-nao-imprime" style="padding:18px">' +
      (desligados.length
        ? '<button class="botao primario miudo" data-acao="calcular-rescisao">Calcular rescisão</button>'
        : '<p class="secundario" style="margin:0">Nenhum funcionário desligado. Desligue em Funcionários para calcular.</p>') +
    "</div>" +
    (T._ultimoResultadoRescisao
      ? resultadoEventoHtml(T._ultimoResultadoRescisao, { acao: "homologar-rescisao", campoPago: "homologada", rotuloPago: "homologada", rotuloAcao: "Homologar" })
      : "")
  );

  return html;
};

T.acoes["calcular-decimo-terceiro"] = function () {
  var ativos = L.porNome(L.ativos());
  U.abrirFormulario({
    titulo: "Calcular 13º salário",
    sub: "Recalcular substitui o valor anterior, enquanto não estiver marcado como pago.",
    campos: [
      { id: "funcionarioId", rotulo: "Funcionário", tipo: "select",
        opcoes: ativos.map(function (f) { return { valor: f.id, rotulo: f.nome, detalhe: f.cargo || "" }; }) },
      { id: "ano", rotulo: "Ano", padrao: String(new Date().getFullYear()) },
      { id: "parcela", rotulo: "Parcela", tipo: "select",
        opcoes: [
          { valor: "1", rotulo: "1ª parcela — sem desconto" },
          { valor: "2", rotulo: "2ª parcela — com INSS e IRRF" }
        ] }
    ],
    rotuloSalvar: "Calcular",
    aoSalvar: function (v) {
      U.fecharModal();
      L.api.post("/api/decimo-terceiro/" + v.funcionarioId + "/" + v.ano + "/" + v.parcela + "/calcular")
        .then(function () {
          T._decimoTerceiroAno = null;
          T.renderizar();
          U.avisar("13º salário calculado.");
        })
        .catch(function (erro) { U.avisar(erro.message); });
    }
  });
};

T.acoes["pagar-decimo-terceiro"] = function (id) {
  L.api.post("/api/decimo-terceiro/" + id + "/pagar")
    .then(function () { T._decimoTerceiroAno = null; T.renderizar(); U.avisar("Marcado como pago."); })
    .catch(function (erro) { U.avisar(erro.message); });
};

T.acoes["pagar-ferias"] = function (id) {
  L.api.post("/api/ferias/" + id + "/pagar")
    .then(function () {
      if (T._ultimoResultadoFerias && T._ultimoResultadoFerias.id === id) T._ultimoResultadoFerias.pago = true;
      T.renderizar();
      U.avisar("Marcado como pago.");
    })
    .catch(function (erro) { U.avisar(erro.message); });
};

T.acoes["homologar-rescisao"] = function (id) {
  L.api.post("/api/rescisao/" + id + "/homologar")
    .then(function () {
      if (T._ultimoResultadoRescisao && T._ultimoResultadoRescisao.id === id) T._ultimoResultadoRescisao.homologada = true;
      T.renderizar();
      U.avisar("Rescisão homologada.");
    })
    .catch(function (erro) { U.avisar(erro.message); });
};

T.acoes["calcular-ferias-pagamento"] = function () {
  var ativos = L.porNome(L.ativos());
  U.abrirFormulario({
    titulo: "Calcular férias",
    sub: "O direito sai das faltas injustificadas (CLT art. 130: até 5 faltas = 30 dias; acima de 32, perde). Pode vender até 1/3 das férias.",
    campos: [
      { id: "funcionarioId", rotulo: "Funcionário", tipo: "select",
        opcoes: ativos.map(function (f) { return { valor: f.id, rotulo: f.nome, detalhe: f.cargo || "" }; }) },
      { id: "periodoAquisitivoInicio", rotulo: "Período aquisitivo — início", tipo: "data" },
      { id: "periodoAquisitivoFim", rotulo: "Período aquisitivo — fim", tipo: "data", par: true },
      { id: "dataInicioGozo", rotulo: "Início do gozo", tipo: "data" },
      { id: "faltasInjustificadas", rotulo: "Faltas injustificadas no período", tipo: "numero", padrao: "0" },
      { id: "diasFerias", rotulo: "Dias de férias (vazio = o direito pelas faltas)", tipo: "numero", padrao: "", par: true },
      { id: "diasVendidos", rotulo: "Dias vendidos (abono, até 1/3)", tipo: "numero", padrao: "0" }
    ],
    rotuloSalvar: "Calcular",
    aoSalvar: function (v) {
      U.fecharModal();
      L.api.post("/api/ferias/" + v.funcionarioId + "/calcular", {
        periodoAquisitivoInicio: v.periodoAquisitivoInicio,
        periodoAquisitivoFim: v.periodoAquisitivoFim,
        dataInicioGozo: v.dataInicioGozo,
        faltasInjustificadas: Number(v.faltasInjustificadas) || 0,
        diasFerias: v.diasFerias === "" || v.diasFerias == null ? undefined : Number(v.diasFerias),
        diasVendidos: Number(v.diasVendidos) || 0
      }).then(function (r) {
        T._ultimoResultadoFerias = r;
        T.renderizar();
        U.avisar("Férias calculadas.");
      }).catch(function (erro) { U.avisar(erro.message); });
    }
  });
};

T.acoes["calcular-rescisao"] = function (idSelecionado) {
  var desligados = L.porNome(T.funcionariosDesligados());
  if (!desligados.length && (T._desligadosCarregados || !L.USA_BACKEND)) {
    U.avisar("Nenhum funcionário desligado ainda. Desligue o cadastro em Funcionários para poder calcular a rescisão.");
    return;
  }
  U.abrirFormulario({
    titulo: "Calcular rescisão",
    sub: "As verbas são aplicadas conforme a modalidade.",
    campos: [
      { id: "funcionarioId", rotulo: "Funcionário desligado", tipo: "select",
        padrao: typeof idSelecionado === "string" ? idSelecionado : undefined,
        opcoes: desligados.map(function (f) { return { valor: f.id, rotulo: f.nome, detalhe: f.cargo || "" }; }) },
      { id: "tipo", rotulo: "Modalidade", tipo: "select",
        opcoes: [
          { valor: "SEM_JUSTA_CAUSA", rotulo: "Sem justa causa" },
          { valor: "PEDIDO_DEMISSAO", rotulo: "Pedido de demissão" },
          { valor: "JUSTA_CAUSA", rotulo: "Justa causa" },
          { valor: "ACORDO", rotulo: "Acordo entre as partes" }
        ] },
      { id: "diasFeriasVencidas", rotulo: "Dias de férias vencidas", tipo: "numero", padrao: "0",
        dicaCampo: "0 se não há período aquisitivo completo não gozado" },
      { id: "mesesFeriasProporcionais", rotulo: "Meses de férias proporcionais", tipo: "numero", padrao: "0", par: true },
      { id: "saldoFgtsDepositadoCentavos", rotulo: "Saldo de FGTS depositado", tipo: "moeda", padrao: "0",
        dicaCampo: "consulte o extrato do FGTS" }
    ],
    rotuloSalvar: "Calcular",
    aoSalvar: function (v) {
      U.fecharModal();
      L.api.post("/api/rescisao/" + v.funcionarioId + "/calcular", {
        tipo: v.tipo,
        avisoPrevioIndenizado: true,
        diasFeriasVencidas: Number(v.diasFeriasVencidas) || 0,
        mesesFeriasProporcionais: Number(v.mesesFeriasProporcionais) || 0,
        saldoFgtsDepositadoCentavos: v.saldoFgtsDepositadoCentavos || 0
      }).then(function (r) {
        T._ultimoResultadoRescisao = r;
        T.renderizar();
        U.avisar("Rescisão calculada.");
      }).catch(function (erro) { U.avisar(erro.message); });
    }
  });
};

// ---------------------------------------------------------------- documentos

/** Mesma ideia de T.ROTULOS_AUSENCIA: nome de exibição, nunca a constante
 * interna, para o tipo do documento e para a entidade a que ele se refere. */
T.ROTULOS_TIPO_DOCUMENTO = {
  CONTRATO: "Contrato", NOTA_FISCAL: "Nota fiscal", CERTIDAO: "Certidão", APOLICE: "Apólice",
  ALVARA: "Alvará", ATESTADO: "Atestado", LAUDO: "Laudo", DOCUMENTO_PESSOAL: "Documento pessoal", OUTRO: "Outro"
};
T.ROTULOS_ENTIDADE_DOCUMENTO = {
  escola: "Escola", employees: "Funcionário", fornecedores: "Fornecedor", contratos: "Contrato"
};

/** Nome do registro específico, quando o documento não é geral da escola —
 * "Funcionário" sozinho na coluna não diz de quem é a certidão. */
T._nomeRegistroDocumento = function (d) {
  if (!d.entidadeId) return null;
  var colecao = d.entidade === "employees" ? "funcionarios" : d.entidade;
  var r = L.buscarPorId(colecao, d.entidadeId);
  if (!r) return null;
  return r.nome || r.razaoSocial || r.objeto || null;
};

T._documentosCarregados = false;
T._carregandoDocumentos = false;

function carregarDocumentosDaApi() {
  if (T._carregandoDocumentos) return;
  T._carregandoDocumentos = true;
  L.recarregarDocumentos().then(function () {
    T._documentosCarregados = true;
    T._carregandoDocumentos = false;
    T.renderizar();
  });
}

T.acoes["novo-documento"] = function () {
  if (!L.USA_BACKEND) {
    // Modo demonstração (sem servidor): mantém o comportamento antigo,
    // só no navegador — não há onde guardar o arquivo em si.
    U.abrirFormulario({
      titulo: "Registrar documento",
      sub: "Contrato, certidão, apólice, alvará ou atestado",
      campos: [
        { id: "titulo", rotulo: "Título", obrigatorio: true },
        { id: "tipo", rotulo: "Tipo", tipo: "select",
          opcoes: Object.keys(T.ROTULOS_TIPO_DOCUMENTO).map(function (k) { return { valor: k, rotulo: T.ROTULOS_TIPO_DOCUMENTO[k] }; }) },
        { id: "vencimento", rotulo: "Vence em", tipo: "data", dica: "Documento com validade gera alerta automático." },
        { id: "tags", rotulo: "Etiquetas", dicaCampo: "Separadas por vírgula" }
      ],
      aoSalvar: function (v) {
        v.entidade = "escola";
        v.tags = v.tags ? v.tags.split(",").map(function (t) { return t.trim(); }).filter(Boolean) : [];
        L.criar("documentos", v);
        U.fecharModal();
        T.ir("documentos");
      }
    });
    return;
  }

  // Uma escolha só ("Referente a"), não categoria + registro em dois campos
  // separados: com o motor de formulário sem suporte a campo condicional,
  // dois campos sempre visíveis (um pra categoria, outro pra pessoa/contrato)
  // ficaria com metade da tela inerte a cada escolha — o oposto de "clean".
  var opcoesVinculo = [{ valor: "escola", rotulo: "Documento geral do hotel" }]
    .concat(L.estado.funcionarios.map(function (f) { return { valor: "employees|" + f.id, rotulo: f.nome, detalhe: "Funcionário" }; }))
    .concat(L.estado.fornecedores.map(function (f) { return { valor: "fornecedores|" + f.id, rotulo: f.razaoSocial, detalhe: "Fornecedor" }; }))
    .concat(L.estado.contratos.map(function (c) { return { valor: "contratos|" + c.id, rotulo: c.objeto, detalhe: "Contrato" }; }));

  U.abrirFormulario({
    titulo: "Registrar documento",
    sub: "Contrato, certidão, apólice, alvará ou atestado",
    campos: [
      { id: "titulo", rotulo: "Título", obrigatorio: true },
      { id: "tipo", rotulo: "Tipo", tipo: "select",
        opcoes: Object.keys(T.ROTULOS_TIPO_DOCUMENTO).map(function (k) { return { valor: k, rotulo: T.ROTULOS_TIPO_DOCUMENTO[k] }; }) },
      { id: "vinculo", rotulo: "Referente a", tipo: "select", opcoes: opcoesVinculo },
      { id: "vencimento", rotulo: "Vence em", tipo: "data", par: true,
        dica: "Documento com validade gera alerta automático." },
      { id: "tags", rotulo: "Etiquetas", par: true, dicaCampo: "Separadas por vírgula" },
      { id: "arquivo", rotulo: "Arquivo", tipo: "arquivo", obrigatorio: true,
        aceita: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
        dica: "PDF, imagem ou Word — até 15 MB. É este arquivo que fica guardado, não só a data." }
    ],
    aoSalvar: function (v) {
      var partes = v.vinculo.split("|");
      var entidade = partes[0], entidadeId = partes[1] || null;
      L.api.enviarArquivo("/api/documentos", {
        titulo: v.titulo,
        tipo: v.tipo,
        entidade: entidade,
        entidadeId: entidadeId,
        dataVencimento: v.vencimento || "",
        tags: v.tags ? v.tags.split(",").map(function (t) { return t.trim(); }).filter(Boolean).join(",") : "",
        arquivo: v.arquivo
      }).then(function () {
        U.fecharModal();
        T._documentosCarregados = false;
        carregarDocumentosDaApi();
        T.ir("documentos");
        U.avisar("Documento registrado.");
      }).catch(function (erro) { U.avisar(erro.message || "Não foi possível registrar o documento."); });
    }
  });
};

T.telas.documentos = function () {
  if (L.USA_BACKEND && !T._documentosCarregados) carregarDocumentosDaApi();
  if (L.USA_BACKEND && !T._fornecedoresCarregados) carregarFornecedoresDaApi();
  if (L.USA_BACKEND && !T._contratosCarregados) carregarContratosDaApi();

  var html = T.cabecalho("Central de Documentos",
    "O que tem validade gera alerta antes de vencer.",
    T.botaoNovo("novo-documento", "Registrar documento"));
  // Sem `T.avisoSemPersistenciaReal()` aqui: diferente de quando esse aviso
  // foi escrito, o arquivo agora é gravado de verdade (rota multipart +
  // bytea) — mesmo tratamento dado a Funcionários quando a API real entrou.

  html += '<div class="painel">' + U.tabelaHtml([
    { rotulo: "Documento", conteudo: function (d) {
      return '<div class="principal">' + U.esc(d.titulo) + '</div><div class="secundario">' +
        U.esc(T.ROTULOS_TIPO_DOCUMENTO[d.tipo] || d.tipo) + ((d.tags || []).length ? " · " + U.esc(d.tags.join(", ")) : "") + "</div>"; } },
    { rotulo: "Referente a", conteudo: function (d) {
      var nome = T._nomeRegistroDocumento(d);
      var categoria = U.esc(T.ROTULOS_ENTIDADE_DOCUMENTO[d.entidade] || d.entidade);
      return nome ? categoria + " · " + U.esc(nome) : categoria; } },
    { rotulo: "Validade", direita: true, conteudo: function (d) {
      if (!d.vencimento) return '<span class="pastilha neutro">sem validade</span>';
      var dias = L.diasAte(d.vencimento);
      var tom = dias < 0 ? "critico" : dias <= 30 ? "pendente" : "ok";
      return '<span class="pastilha ' + tom + '">' + L.dataBR(d.vencimento) + "</span>"; } },
    { rotulo: "Arquivo", direita: true, conteudo: function (d) {
      if (!L.USA_BACKEND || !d.id) return "";
      return '<a class="botao miudo" href="/api/documentos/' + U.esc(d.id) + '/arquivo" target="_blank" rel="noopener">Baixar</a>'; } }
  ], L.estado.documentos, {
    buscaLocal: "Documento, vínculo ou validade",
    tituloVazio: "Nenhum documento registrado",
    textoVazio: "Com a data de validade, o sistema avisa antes de vencer.",
    acaoVazio: { acao: "novo-documento", rotulo: "Registrar o primeiro" }
  }) + "</div>";
  return html;
};

// ---------------------------------------------------------------- relatórios

/**
 * Relatório geral: a folha inteira, filtrável por categoria/empresa/vínculo,
 * em três granularidades diferentes — mesma base de dados, três leituras:
 *
 *  - EXECUTIVO: só totais (por empresa e por vínculo). Serve para decisão,
 *    não teria como abrir 100 fichas para "quanto sai esse mês".
 *  - OPERACIONAL: uma linha por pessoa (proventos/descontos/líquido/custo),
 *    o dia a dia de quem confere a folha antes de pagar.
 *  - ANALÍTICO: cada pessoa com toda rubrica, base e valor — mesma memória
 *    de `L.calcular`, nada recalculado nem resumido de outro jeito. É o que
 *    sustenta uma auditoria ou uma contestação de valor.
 *
 * "Baixar em PDF" usa a impressão do próprio navegador (`@media print`
 * esconde lateral, topo e filtros): sem backend, é o jeito de gerar um PDF
 * de verdade sem inventar uma biblioteca que este protótipo não tem como
 * carregar.
 */
T.RELATORIO_TIPOS = {
  EXECUTIVO: { nome: "Executivo", descricao: "Só totais — por empresa e por vínculo." },
  OPERACIONAL: { nome: "Operacional", descricao: "Uma linha por pessoa, pronta para conferir antes de pagar." },
  ANALITICO: { nome: "Analítico", descricao: "Cada pessoa com toda rubrica, base e valor da memória de cálculo." }
};

T._folhaDetalhadaComp = null;
T._carregandoFolhaDetalhada = false;

/**
 * Folha já apurada e gravada (com rubrica por rubrica) da competência —
 * `folha_calculos`/`folha_rubricas`, os mesmos que sustentaram o fechamento.
 * O relatório usa isto em vez de `L.calcular`: sem isto, um reajuste salarial
 * ou uma mudança na CCT faria o relatório de um mês antigo recalcular com o
 * contrato e a convenção de HOJE, mostrando número diferente do que foi
 * realmente pago naquele mês.
 */
// ---------------------------------------------------------------- tempo real
// Quando outra pessoa grava, o servidor avisa (SSE) e esta aba recarrega na hora.

T.iniciarTempoReal = function () {
  if (!L.USA_BACKEND || T._fonteEventos || typeof EventSource === "undefined") return;
  var timer = null, caiu = false;
  var fonte = new EventSource("/api/eventos");
  T._fonteEventos = fonte;
  fonte.onmessage = function (e) {
    var d = null;
    try { d = JSON.parse(e.data); } catch (x) { return; }
    if (d && d.aba === L.api.abaId) return; // fui eu: a tela já se atualiza sozinha
    clearTimeout(timer);
    timer = setTimeout(T.atualizarDeFora, 400);
  };
  fonte.onerror = function () { caiu = true; };
  fonte.onopen = function () {
    // Voltou depois de uma queda de conexão: pode ter perdido avisos.
    if (caiu) { caiu = false; clearTimeout(timer); timer = setTimeout(T.atualizarDeFora, 400); }
  };
};

T.pararTempoReal = function () {
  if (T._fonteEventos) { T._fonteEventos.close(); T._fonteEventos = null; }
};

/** Esquece o que estava em cache e busca de novo; não atropela quem está digitando. */
T.atualizarDeFora = function () {
  if (!L.estado.usuario) return;
  var ativo = document.activeElement;
  var digitando = ativo && /^(INPUT|TEXTAREA|SELECT)$/.test(ativo.tagName) && !(ativo.closest && ativo.closest("#camada-modal"));
  if (digitando) { setTimeout(T.atualizarDeFora, 1500); return; }
  ["_auditoriaCarregada", "_ausenciasCarregadas", "_contasCarregadas", "_contratosCarregados", "_desligadosCarregados",
    "_documentosCarregados", "_fornecedoresCarregados", "_lancamentosBancoCarregados", "_periodosCarregados",
    "_solicitacoesCarregadas", "_tabelasCarregadas", "_usuariosAcessoCarregados"].forEach(function (k) { T[k] = false; });
  T._movimentosCarregadosPara = null;
  T._folhaDetalhadaComp = null;
  L.recarregarFuncionarios().then(function () { T.renderizar(); }).catch(function () { T.renderizar(); });
};

function carregarFolhaDetalhadaDaApi(comp) {
  if (T._carregandoFolhaDetalhada) return;
  T._carregandoFolhaDetalhada = true;
  L.api.get("/api/folha/" + comp + "/detalhado").then(function (linhas) {
    var porId = {};
    (linhas || []).forEach(function (l) { porId[l.employeeId] = l; });
    L.estado.folhaDetalhada = L.estado.folhaDetalhada || {};
    L.estado.folhaDetalhada[comp] = porId;
    T._folhaDetalhadaComp = comp;
    T._carregandoFolhaDetalhada = false;
    T.renderizar();
  }).catch(function (erro) {
    T._carregandoFolhaDetalhada = false;
    console.error("Não foi possível carregar a folha apurada da competência:", erro);
    U.avisar("Não foi possível carregar os valores calculados desta competência.");
  });
}

T.relatorioGeralHtml = function () {
  var comp = L.competenciaAberta();
  var todos = L.ativos();

  var tipo = T.filtros.relTipo && T.RELATORIO_TIPOS[T.filtros.relTipo] ? T.filtros.relTipo : "EXECUTIVO";
  var categoriaFiltro = T.filtros.relCategoria || "";
  var empresaFiltro = T.filtros.relEmpresa || "";
  var vinculoFiltro = T.filtros.relVinculo || "";
  var pessoaFiltro = T.filtros.relPessoa || "";

  var filtrados = todos.filter(function (f) {
    return (!categoriaFiltro || L.categoriaDe(f) === categoriaFiltro) &&
      (!empresaFiltro || L.empresaDe(f) === empresaFiltro) &&
      (!vinculoFiltro || L.grupoFiltroDe(f) === vinculoFiltro) &&
      (!pessoaFiltro || f.id === pessoaFiltro);
  });

  var toolbar = '<div class="rel-nao-imprime">' +
    '<div class="abas-categoria" role="tablist">' + Object.keys(T.RELATORIO_TIPOS).map(function (t) {
      return '<button role="tab" class="aba-categoria" data-filtro-aba="relTipo" data-valor="' + t + '"' +
        ' aria-selected="' + (t === tipo) + '" title="' + U.esc(T.RELATORIO_TIPOS[t].descricao) + '">' +
        U.esc(T.RELATORIO_TIPOS[t].nome) + "</button>";
    }).join("") + "</div>" +
    '<div class="barra-ferramentas">' +
      U.seletorRico({
        rotulo: "Categoria", valor: categoriaFiltro,
        itens: [{ valor: "", rotulo: "Todos" }].concat(
          Object.keys(L.CATEGORIAS).filter(function (c) { return c !== "PROFESSOR"; }).map(function (c) { return { valor: c, rotulo: L.CATEGORIAS[c].plural }; })),
        atributos: { filtro: "relCategoria" }
      }) +
      U.seletorRico({
        rotulo: "Empresa", valor: empresaFiltro,
        itens: [{ valor: "", rotulo: "Todas as empresas" }].concat(
          L.empresasPresentes(todos).map(function (e) { return { valor: e, rotulo: e }; })),
        atributos: { filtro: "relEmpresa" }
      }) +
      U.seletorRico({
        rotulo: "Vínculo", valor: vinculoFiltro,
        itens: [{ valor: "", rotulo: "Todos os vínculos" }].concat(
          L.gruposPagamentoPresentes(todos).map(function (g) { return { valor: g, rotulo: g }; })),
        atributos: { filtro: "relVinculo" }
      }) +
      // Independente dos outros três — "só o Fulano" busca por nome direto,
      // sem precisar antes achar a empresa/vínculo certos dele.
      U.seletorRico({
        rotulo: "Funcionário", valor: pessoaFiltro,
        itens: [{ valor: "", rotulo: "Todos os funcionários" }].concat(
          L.porNome(todos).map(function (f) { return { valor: f.id, rotulo: f.nome, detalhe: f.cargo || "" }; })),
        atributos: { filtro: "relPessoa" }
      }) +
      '<span class="direita"><button class="botao primario miudo" data-acao="baixar-relatorio-pdf">Baixar em PDF</button></span>' +
    "</div></div>";

  if (!filtrados.length) {
    return toolbar + U.vazioHtml("Nenhuma pessoa nesse filtro",
      "Troque categoria, empresa ou vínculo para ver o relatório.");
  }

  // Com backend, o relatório usa a folha JÁ CALCULADA e gravada — mesmo
  // contrato e mesma CCT que valeram naquela competência — nunca recalcula no
  // navegador com o cadastro de hoje (ver `carregarFolhaDetalhadaDaApi` acima).
  // Sem backend (protótipo local/offline), não há outro lugar de onde isto
  // viria: só ali o próprio navegador calcula.
  var calculos, semCalculo = [];
  // Mês aberto mostra a conta de agora, igual à tela da Folha: o último
  // cálculo gravado pode ser anterior a uma correção de cadastro. Fechado,
  // vale o que foi gravado no fechamento.
  if (L.USA_BACKEND && L.periodoFechado(comp)) {
    if (T._folhaDetalhadaComp !== comp) carregarFolhaDetalhadaDaApi(comp);
    var detalhePorId = (L.estado.folhaDetalhada || {})[comp] || {};
    calculos = [];
    filtrados.forEach(function (f) {
      var d = detalhePorId[f.id];
      if (d) {
        calculos.push({ f: f, r: {
          proventos: d.proventos, descontos: d.descontos, liquido: d.liquido,
          custoEmpregador: d.custoEmpregador, rubricas: d.rubricas || [], avisos: d.avisos || []
        } });
      } else {
        semCalculo.push(f.nome);
      }
    });
    if (!calculos.length) {
      return toolbar + U.vazioHtml(
        "Esta competência ainda não foi calculada",
        "Vá para a tela Folha e calcule " + L.competenciaBR(comp) + " antes de gerar o relatório — " +
        "assim ele mostra o que foi realmente apurado, não uma prévia.") +
        '<div class="rel-nao-imprime" style="padding:0 18px 18px">' +
        '<button class="botao" data-ir="folha">Ir para Folha</button></div>';
    }
  } else {
    calculos = filtrados.map(function (f) { return { f: f, r: L.calcular(f, comp) }; });
  }

  var avisoSemCalculo = semCalculo.length
    ? '<div class="aviso-tela rel-nao-imprime"><span aria-hidden="true">▲</span><div>' +
      "<strong>" + semCalculo.length + " pessoa(s) sem cálculo gravado nesta competência</strong> — " +
      U.esc(semCalculo.join(", ")) + ". Não entram nos totais abaixo; rode \"Calcular\" na tela Folha para incluí-las." +
      "</div></div>"
    : "";

  var somar = function (lista, campo) { return lista.reduce(function (a, x) { return a + x.r[campo]; }, 0); };
  var granTotal = {
    proventos: somar(calculos, "proventos"), descontos: somar(calculos, "descontos"),
    liquido: somar(calculos, "liquido"), custo: somar(calculos, "custoEmpregador"), pessoas: calculos.length
  };

  var linhaResumo = function (rotulo, valores, forte, quantidade) {
    return '<div class="rel-linha-resumo' + (forte ? " forte" : "") + '">' +
      "<span>" + U.esc(rotulo) + (quantidade !== undefined ? '<span class="contexto">' + quantidade + " pessoa(s)</span>" : "") + "</span>" +
      '<span class="num">' + L.brl(valores.proventos) + "</span>" +
      '<span class="num v-desconto">− ' + L.brl(valores.descontos) + "</span>" +
      '<span class="num">' + L.brl(valores.liquido) + "</span>" +
      '<span class="num">' + L.brl(valores.custo) + "</span></div>";
  };

  // Agrupado por empresa, cada grupo em ordem alfabética de nome — é a
  // mesma pergunta que RH e Direção fazem separado: "quanto sai por CNPJ".
  var porEmpresa = {};
  calculos.forEach(function (c) {
    var emp = L.empresaDe(c.f);
    (porEmpresa[emp] = porEmpresa[emp] || []).push(c);
  });
  var empresasOrdenadas = Object.keys(porEmpresa).sort();

  var colunas = '<div class="rel-cabecalho-colunas rel-linha-resumo forte">' +
    "<span>Empresa" + (tipo !== "EXECUTIVO" ? " / pessoa" : "") + "</span>" +
    "<span>Proventos</span><span>Descontos</span><span>Líquido</span><span>Custo p/ hotel</span></div>";

  var corpo;

  if (tipo === "EXECUTIVO") {
    // Só subtotal por empresa, mais um recorte por vínculo — o que decide,
    // não o que confere linha a linha.
    corpo = empresasOrdenadas.map(function (emp) {
      var lista = porEmpresa[emp];
      var subtotal = { proventos: somar(lista, "proventos"), descontos: somar(lista, "descontos"),
        liquido: somar(lista, "liquido"), custo: somar(lista, "custoEmpregador") };
      return linhaResumo(emp, subtotal, false, lista.length);
    }).join("");

    var porVinculo = {};
    calculos.forEach(function (c) {
      var v = L.grupoPagamentoDe(c.f);
      (porVinculo[v] = porVinculo[v] || []).push(c);
    });
    var blocoVinculo = '<div class="rel-empresa"><h3 class="rel-empresa-titulo">Por vínculo</h3>' +
      Object.keys(porVinculo).sort().map(function (v) {
        var lista = porVinculo[v];
        var subtotal = { proventos: somar(lista, "proventos"), descontos: somar(lista, "descontos"),
          liquido: somar(lista, "liquido"), custo: somar(lista, "custoEmpregador") };
        return linhaResumo(v, subtotal, false, lista.length);
      }).join("") + "</div>";
    corpo += blocoVinculo;

  } else if (tipo === "OPERACIONAL") {
    // Uma linha por pessoa: o suficiente para conferir antes de mandar pagar,
    // sem abrir rubrica — isso fica para o Analítico.
    corpo = empresasOrdenadas.map(function (emp) {
      var lista = porEmpresa[emp].slice().sort(function (a, b) { return a.f.nome.localeCompare(b.f.nome); });
      var subtotal = { proventos: somar(lista, "proventos"), descontos: somar(lista, "descontos"),
        liquido: somar(lista, "liquido"), custo: somar(lista, "custoEmpregador") };
      var linhas = lista.map(function (c) {
        return '<div class="rel-linha-resumo">' +
          '<div><div class="principal">' + U.esc(c.f.nome) + "</div>" +
          '<div class="secundario">' + U.esc(c.f.cargo || "—") + " · " + U.esc(L.grupoPagamentoDe(c.f)) + "</div></div>" +
          '<span class="num">' + L.brl(c.r.proventos) + "</span>" +
          '<span class="num v-desconto">− ' + L.brl(c.r.descontos) + "</span>" +
          '<span class="num">' + L.brl(c.r.liquido) + "</span>" +
          '<span class="num">' + L.brl(c.r.custoEmpregador) + "</span></div>";
      }).join("");
      return '<div class="rel-empresa">' +
        '<h3 class="rel-empresa-titulo">' + U.esc(emp) + '<span class="contexto">' + lista.length + " pessoa(s)</span></h3>" +
        linhaResumo("Subtotal " + emp, subtotal, true) + linhas + "</div>";
    }).join("");

  } else {
    // ANALÍTICO: cada pessoa com a rubrica inteira — mesma tabela que a
    // ficha individual mostra, só que para todo mundo do filtro de uma vez.
    corpo = empresasOrdenadas.map(function (emp) {
      var lista = porEmpresa[emp].slice().sort(function (a, b) { return a.f.nome.localeCompare(b.f.nome); });
      var subtotal = { proventos: somar(lista, "proventos"), descontos: somar(lista, "descontos"),
        liquido: somar(lista, "liquido"), custo: somar(lista, "custoEmpregador") };

      var blocos = lista.map(function (c) {
        var f = c.f, r = c.r;
        var rubricasHtml = r.rubricas.length
          ? U.tabelaHtml([
              { rotulo: "Cód.", classe: "cod", conteudo: function (x) { return x.cod; } },
              { rotulo: "Rubrica", conteudo: function (x) {
                return U.esc(x.desc) + (x.tipo === "E" ? ' <span class="rotulo-encargo">encargo</span>' : ""); } },
              { rotulo: "Referência", secundaria: true, conteudo: function (x) { return U.esc(x.ref); } },
              { rotulo: "Valor", direita: true, conteudo: function (x) {
                var cl = x.tipo === "P" ? "v-provento" : x.tipo === "D" ? "v-desconto" : "v-encargo";
                return '<span class="num ' + cl + '">' + (x.tipo === "D" ? "− " : "") + L.brl(x.valor) + "</span>"; } }
            ], r.rubricas.map(function (x, i) { return Object.assign({ id: f.id + "-r" + i }, x); }))
          : '<p class="secundario" style="margin:8px 18px">Sem rubrica no período — ' +
            U.esc((r.avisos[0] && r.avisos[0].texto) || "vínculo fora da competência") + "</p>";

        return '<div class="rel-pessoa">' +
          '<div class="rel-pessoa-topo">' +
            '<div><div class="principal">' + U.esc(f.nome) + '</div>' +
            '<div class="secundario">' + U.esc(f.cargo || "—") + " · " + U.esc(L.grupoPagamentoDe(f)) + "</div></div>" +
            '<div class="rel-pessoa-num">' +
              '<span>Líquido <b class="num">' + L.brl(r.liquido) + "</b></span>" +
              '<span>Custo p/ hotel <b class="num">' + L.brl(r.custoEmpregador) + "</b></span>" +
            "</div></div>" +
          rubricasHtml +
          "</div>";
      }).join("");

      return '<div class="rel-empresa">' +
        '<h3 class="rel-empresa-titulo">' + U.esc(emp) + '<span class="contexto">' + lista.length + " pessoa(s)</span></h3>" +
        linhaResumo("Subtotal " + emp, subtotal, true) +
        blocos +
        "</div>";
    }).join("");
  }

  var cabecalhoImpressao = '<div class="rel-cabecalho-impressao">' +
    "<h2>Relatório " + U.esc(T.RELATORIO_TIPOS[tipo].nome).toLowerCase() + " de folha — " + U.esc(L.competenciaBR(comp)) + "</h2>" +
    "<p>" +
      (pessoaFiltro
        ? U.esc((L.buscarPorId("funcionarios", pessoaFiltro) || {}).nome || "—")
        : (categoriaFiltro ? U.esc(L.CATEGORIAS[categoriaFiltro].plural) : "Colaboradores") + " · " +
          (empresaFiltro ? U.esc(empresaFiltro) : "todas as empresas") + " · " +
          (vinculoFiltro ? U.esc(vinculoFiltro) : "todos os vínculos")) + " · " +
      granTotal.pessoas + " pessoa(s)" +
    "</p>" +
    "<p class=\"secundario\">Gerado em " + U.esc(L.dataBR(L.hoje())) + " por " + U.esc(L.estado.usuario.nome) + "</p>" +
    "</div>";

  return toolbar +
    avisoSemCalculo +
    '<div class="rel-relatorio">' +
      cabecalhoImpressao +
      colunas +
      corpo +
      linhaResumo("Total geral", granTotal, true) +
    "</div>";
};

T.acoes["baixar-relatorio-pdf"] = function () { window.print(); };

// ---------------------------------------------------------------- holerite
//
// Recibo de pagamento, um por página, impresso pelo navegador ("Salvar como
// PDF"). Competência fechada usa o que foi gravado no cálculo oficial;
// aberta sai como prévia, marcada como tal.

function somaRubricas(rubricas, filtro) {
  return rubricas.filter(filtro).reduce(function (a, r) { return a + r.valor; }, 0);
}

T.dadosHolerite = function (f, comp) {
  var fechada = L.periodoFechado(comp);
  var gravada = L.USA_BACKEND && fechada ? ((L.estado.folhaDetalhada || {})[comp] || {})[f.id] : null;
  if (gravada) {
    return {
      oficial: true, rubricas: gravada.rubricas || [], proventos: gravada.proventos,
      descontos: gravada.descontos, liquido: gravada.liquido,
      custo: gravada.custoEmpregador,
      baseInss: gravada.baseInss, baseFgts: gravada.baseFgts, baseIrrf: gravada.baseIrrf,
      calculadoEm: gravada.calculadoEm || ""
    };
  }
  var r = L.calcular(f, comp);
  // Mesma base do motor do navegador: o que integra menos o que reduz.
  var base = Math.max(0,
    somaRubricas(r.rubricas, function (x) { return x.tipo === "P" && x.natureza === "INTEGRA"; }) -
    somaRubricas(r.rubricas, function (x) { return x.tipo === "D" && x.natureza === "REDUZ"; }));
  return {
    oficial: fechada, rubricas: r.rubricas, proventos: r.proventos, descontos: r.descontos,
    liquido: r.liquido, custo: r.custoEmpregador, baseInss: base, baseFgts: base, baseIrrf: null, calculadoEm: ""
  };
};

T.holeriteHtml = function (f, comp) {
  var d = T.dadosHolerite(f, comp);
  var estagio = f.regime === "ESTAGIARIO";
  var fgts = somaRubricas(d.rubricas, function (x) { return x.tipo === "E" && String(x.cod) === "801"; });
  var linhas = d.rubricas.filter(function (x) { return (x.tipo === "P" || x.tipo === "D") && x.valor > 0; });
  var mes = L.competenciaBR(comp);
  var celula = function (v) { return v ? L.brl(v).replace("R$", "").trim() : ""; };
  var campo = function (rotulo, valor) {
    return '<div class="hol-campo"><span>' + rotulo + "</span><strong>" + U.esc(valor || "—") + "</strong></div>";
  };

  return '<section class="holerite">' +
    '<header class="hol-topo">' +
      '<div><div class="hol-empresa">' + U.esc(L.empresaDe(f)) + "</div>" +
      '<div class="hol-titulo">' + (estagio ? "Recibo de bolsa-auxílio" : "Recibo de pagamento de salário") + "</div></div>" +
      '<div class="hol-comp"><span>Competência</span><strong>' + U.esc(mes.charAt(0).toUpperCase() + mes.slice(1)) + "</strong>" +
      (d.oficial ? "" : '<em class="hol-previa">Prévia — competência não fechada</em>') + "</div>" +
    "</header>" +
    '<div class="hol-dados">' +
      campo("Matrícula", f.matricula) + campo("Nome", T.nomeExibicao(f.nome)) +
      campo("Cargo", f.cargo) + campo("Admissão", f.admissao ? L.dataBR(f.admissao) : "") +
    "</div>" +
    '<table class="hol-tabela"><thead><tr><th>Cód.</th><th>Descrição</th><th>Referência</th>' +
      '<th class="n">Vencimentos</th><th class="n">Descontos</th></tr></thead><tbody>' +
      linhas.map(function (x) {
        return "<tr><td>" + U.esc(x.cod) + "</td><td>" + U.esc(x.desc) + "</td><td>" + U.esc(x.ref || "") + "</td>" +
          '<td class="n">' + (x.tipo === "P" ? celula(x.valor) : "") + '</td><td class="n">' +
          (x.tipo === "D" ? celula(x.valor) : "") + "</td></tr>";
      }).join("") +
    "</tbody><tfoot><tr><td colspan=\"3\">Totais</td>" +
      '<td class="n">' + celula(d.proventos) + '</td><td class="n">' + celula(d.descontos) + "</td></tr>" +
      '<tr class="hol-liquido"><td colspan="3">Valor líquido</td><td colspan="2" class="n">' + L.brl(d.liquido) + "</td></tr>" +
    "</tfoot></table>" +
    (function () {
      // Composição do pagamento: o que é CLT é CLT, o que é MEI é MEI.
      var dv = estagio ? null : L.divisaoPagamento(f, comp, d.proventos);
      if (!dv || !(dv.ticket > 0 || dv.mei > 0)) return "";
      var li = function (rot, val, forte) {
        return '<tr' + (forte ? ' class="hol-liquido"' : "") + '><td>' + rot + '</td><td class="n">' + L.brl(val) + "</td></tr>";
      };
      return '<table class="hol-tabela hol-composicao"><thead><tr><th>Composição do pagamento</th><th class="n">Valor</th></tr></thead><tbody>' +
        li("CLT (recibo)", dv.clt) +
        (dv.ticket > 0 ? li(L.ticketDesconta(f) ? "Ticket (descontado, pago à parte)" : "Ticket (soma, pago à parte)", dv.ticket) : "") +
        (dv.mei > 0 ? li("MEI (nota fiscal, pago à parte)", dv.mei) : "") +
        (dv.meiDentro ? li("Líquido CLT", Math.max(0, d.liquido - dv.mei), true) : "") +
        "</tbody></table>";
    })() +
    (estagio || L.impostosPelaContabilidade() ? "" :
      '<div class="hol-bases">' +
        campo("Base INSS", L.brl(d.baseInss)) +
        (L.impostosPelaContabilidade() ? "" : campo("Base FGTS", L.brl(d.baseFgts)) + campo("FGTS do mês", L.brl(fgts))) +
        (d.baseIrrf !== null ? campo("Base IRRF", L.brl(d.baseIrrf)) : "") +
      "</div>") +
    '<div class="hol-assinatura">' +
      "<p>Declaro ter recebido a importância líquida discriminada neste recibo.</p>" +
      '<div class="hol-linhas"><div><span></span>Data</div><div><span></span>Assinatura do funcionário</div></div>' +
    "</div>" +
    (d.calculadoEm ? '<div class="hol-rodape">Cálculo oficial de ' + U.esc(d.calculadoEm) + "</div>" : "") +
  "</section>";
};

T.imprimirHolerites = function (lista, comp) {
  lista = lista.filter(function (f) { return f.regime !== "PRESTADOR_PJ" && !f.salarioOculto; });
  if (!lista.length) { U.avisar("Nenhum holerite para imprimir: prestador PJ / MEI recebe por nota fiscal."); return; }
  var imprimir = function () {
    var area = U.el("impressao-holerite");
    if (!area) {
      area = document.createElement("div");
      area.id = "impressao-holerite";
      document.body.appendChild(area);
    }
    area.innerHTML = lista.map(function (f) { return T.holeriteHtml(f, comp); }).join("");
    document.body.classList.add("imprimindo-holerite");
    var limpar = function () {
      document.body.classList.remove("imprimindo-holerite");
      area.innerHTML = "";
      window.removeEventListener("afterprint", limpar);
    };
    window.addEventListener("afterprint", limpar);
    window.print();
  };
  // Mais de um holerite: mostra na tela primeiro; só imprime/baixa se a pessoa pedir.
  var comPrevia = function () {
    if (lista.length < 2 || T._holeritesSemPrevia) { imprimir(); return; }
    U.abrirModal({
      titulo: "Holerites — " + lista.length + " pessoa(s)",
      sub: "Confira aqui. Só baixa ou imprime se você clicar em “Imprimir / salvar PDF”.",
      corpo: '<div class="previa-holerites" style="max-height:60vh;overflow:auto;display:grid;gap:14px">' +
        lista.map(function (f) { return '<div style="border:1px solid var(--borda,#ddd);border-radius:8px;padding:8px;background:#fff;color:#111">' + T.holeriteHtml(f, comp) + "</div>"; }).join("") + "</div>",
      acoes: [
        { rotulo: "Fechar", aoClicar: function () { U.fecharModal(); } },
        { rotulo: "Imprimir / salvar PDF", classe: "primario", aoClicar: function () { U.fecharModal(); imprimir(); } }
      ]
    });
  };
  T.comFolhaGravada(comp, comPrevia);
};

/** Competência fechada no servidor: busca o que foi gravado antes de seguir. */
T.comFolhaGravada = function (comp, seguir) {
  if (!(L.USA_BACKEND && L.periodoFechado(comp))) { seguir(); return; }
  L.api.get("/api/folha/" + comp + "/detalhado").then(function (linhas) {
    var porId = {};
    (linhas || []).forEach(function (l) { porId[l.employeeId] = l; });
    L.estado.folhaDetalhada = L.estado.folhaDetalhada || {};
    L.estado.folhaDetalhada[comp] = porId;
    seguir();
  }).catch(function () { U.avisar("Não foi possível carregar a folha gravada desta competência."); });
};

/** Pessoas da folha com os filtros de regime e empresa da tela. */
function pessoasDaFolhaFiltradas() {
  var vinculo = T.filtros.folhaVinculo || "", empresa = T.filtros.folhaEmpresa || "";
  var busca = U.paraBusca(T.filtros.folhaBusca);
  return L.ativos().filter(function (x) {
    return (!vinculo || L.grupoFiltroDe(x) === vinculo) && (!empresa || L.empresaDe(x) === empresa) &&
      (!busca || U.paraBusca(x.nome + " " + (x.cargo || "") + " " + (x.matricula || "")).indexOf(busca) !== -1);
  });
}

// ---------------------------------------------------------------- Excel da folha
//
// Planilha .xlsx de verdade (formatação, seções, subtotais com fórmula), para
// o Financeiro e a contabilidade. Gerada aqui mesmo: o CSP da página não
// deixa carregar biblioteca de fora, e o formato é só XML dentro de um zip.

var CRC_TABELA = (function () {
  var t = [];
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < bytes.length; i++) c = CRC_TABELA[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** Zip sem compressão ("store"): basta para o Excel e cabe em poucas linhas. */
function zipArmazenado(arquivos) {
  var enc = new TextEncoder(), partes = [], central = [], offset = 0;
  var u16 = function (v) { return [v & 255, (v >>> 8) & 255]; };
  var u32 = function (v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; };
  arquivos.forEach(function (a) {
    var nome = enc.encode(a.nome), dados = enc.encode(a.conteudo), crc = crc32(dados);
    var comum = [].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(dados.length), u32(dados.length), u16(nome.length), u16(0));
    var local = new Uint8Array([].concat([0x50, 0x4B, 0x03, 0x04], comum));
    partes.push(local, nome, dados);
    central.push(new Uint8Array([].concat([0x50, 0x4B, 0x01, 0x02], u16(20), comum, u16(0), u16(0), u16(0), u32(0), u32(offset))), nome);
    offset += local.length + nome.length + dados.length;
  });
  var tamCentral = central.reduce(function (t, b) { return t + b.length; }, 0);
  var fimCentral = new Uint8Array([].concat([0x50, 0x4B, 0x05, 0x06], u16(0), u16(0), u16(arquivos.length), u16(arquivos.length), u32(tamCentral), u32(offset), u16(0)));
  return new Blob(partes.concat(central, [fimCentral]), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

var ESTILOS_XLSX =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/></numFmts>' +
  '<fonts count="5">' +
  '<font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="16"/><color rgb="FF142B4B"/><name val="Calibri"/></font>' +
  '<font><sz val="10"/><color rgb="FF606875"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FF142B4B"/><name val="Calibri"/></font>' +
  '</fonts>' +
  '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF142B4B"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFEEEADE"/></patternFill></fill></fills>' +
  // Linhas finas cinza em toda célula da tabela; azul marca cabeçalho e subtotal.
  '<borders count="4"><border/>' +
  '<border><left style="thin"><color rgb="FFC9C4B6"/></left><right style="thin"><color rgb="FFC9C4B6"/></right>' +
  '<top style="thin"><color rgb="FFC9C4B6"/></top><bottom style="thin"><color rgb="FF142B4B"/></bottom></border>' +
  '<border><left style="thin"><color rgb="FFC9C4B6"/></left><right style="thin"><color rgb="FFC9C4B6"/></right>' +
  '<top style="thin"><color rgb="FF142B4B"/></top><bottom style="thin"><color rgb="FFC9C4B6"/></bottom></border>' +
  '<border><left style="thin"><color rgb="FFC9C4B6"/></left><right style="thin"><color rgb="FFC9C4B6"/></right>' +
  '<top style="thin"><color rgb="FFC9C4B6"/></top><bottom style="thin"><color rgb="FFC9C4B6"/></bottom></border></borders>' +
  '<cellStyleXfs count="1"><xf/></cellStyleXfs>' +
  '<cellXfs count="11">' +
  '<xf/>' +                                                                                   // 0 padrão
  '<xf fontId="1" applyFont="1"/>' +                                                         // 1 título
  '<xf fontId="2" applyFont="1"/>' +                                                         // 2 subtítulo
  '<xf fontId="3" fillId="2" applyFont="1" applyFill="1"/>' +                                // 3 seção
  '<xf fontId="4" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/>' +   // 4 cabeçalho
  '<xf borderId="3" applyBorder="1"/>' +                                                     // 5 texto
  '<xf numFmtId="164" borderId="3" applyNumberFormat="1" applyBorder="1"/>' +                // 6 dinheiro
  '<xf fontId="4" borderId="2" applyFont="1" applyBorder="1"/>' +                            // 7 subtotal
  '<xf numFmtId="164" fontId="4" borderId="2" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' + // 8 subtotal R$
  '<xf fontId="3" fillId="2" applyFont="1" applyFill="1"/>' +                                // 9 total geral
  '<xf numFmtId="164" fontId="3" fillId="2" applyNumberFormat="1" applyFont="1" applyFill="1"/>' + // 10 total geral R$
  '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

function xmlEsc(v) {
  return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function colunaXlsx(i) { var s = ""; i++; while (i) { var r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }

/**
 * Monta uma aba. `linhas` é uma lista de { celulas: [...], altura? }, cada
 * célula { v, s } (texto ou número) ou { f, v, s } (fórmula com o valor já
 * calculado); `mesclar` lista intervalos "A1:L1".
 */
function abaXlsx(larguras, linhas, mesclar) {
  var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>' +
    "<cols>" + larguras.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join("") + "</cols><sheetData>";
  linhas.forEach(function (l, i) {
    var r = i + 1;
    xml += '<row r="' + r + '"' + (l.altura ? ' ht="' + l.altura + '" customHeight="1"' : "") + ">";
    (l.celulas || []).forEach(function (c, j) {
      if (!c) return;
      var ref = colunaXlsx(j) + r, st = c.s ? ' s="' + c.s + '"' : "";
      if (c.f) xml += '<c r="' + ref + '"' + st + "><f>" + xmlEsc(c.f) + "</f><v>" + c.v + "</v></c>";
      else if (typeof c.v === "number") xml += '<c r="' + ref + '"' + st + "><v>" + c.v + "</v></c>";
      else xml += '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(c.v) + "</t></is></c>";
    });
    xml += "</row>";
  });
  xml += "</sheetData>";
  if (mesclar.length) xml += '<mergeCells count="' + mesclar.length + '">' + mesclar.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join("") + "</mergeCells>";
  xml += '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
    '<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>';
  return xml;
}

function arquivoXlsx(abas) {
  var arquivos = [
    { nome: "[Content_Types].xml", conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      abas.map(function (a, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("") +
      "</Types>" },
    { nome: "_rels/.rels", conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { nome: "xl/workbook.xml", conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      abas.map(function (a, i) { return '<sheet name="' + xmlEsc(a.nome) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join("") + "</sheets></workbook>" },
    { nome: "xl/_rels/workbook.xml.rels", conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      abas.map(function (a, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join("") +
      '<Relationship Id="rId' + (abas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { nome: "xl/styles.xml", conteudo: ESTILOS_XLSX }
  ];
  abas.forEach(function (a, i) { arquivos.push({ nome: "xl/worksheets/sheet" + (i + 1) + ".xml", conteudo: a.xml }); });
  return zipArmazenado(arquivos);
}

/** Linhas da folha, agrupadas: uma seção por empresa (CLT e estágio) e os prestadores à parte. */
T.planilhaFolha = function (lista, comp) {
  // Impostos pela contabilidade: INSS, IRRF, FGTS e custo com encargos não
  // existem nesta folha, então as colunas saem.
  var semImpostos = L.impostosPelaContabilidade();
  // Descontos da escola em colunas próprias (cantina, plano etc.); o que não
  // cair em nenhuma vai em "Outros", então a soma sempre fecha com o total.
  var detalhes = [
    ["Vale-transporte", function (x) { return String(x.cod) === "603"; }],
    ["Pensão", function (x) { return String(x.cod) === "604"; }],
    ["Cantina", function (x) { return /cantina/i.test(x.desc); }],
    ["Material", function (x) { return /material/i.test(x.desc); }],
    ["Mensalidade", function (x) { return /mensalidade/i.test(x.desc); }],
    ["Plano de saúde", function (x) { return /plano/i.test(x.desc); }],
    ["Adiantamento", function (x) { return /adiantamento/i.test(x.desc); }],
    ["Robótica", function (x) { return /rob[óo]tica/i.test(x.desc); }],
    ["Empréstimos", function (x) { return /empr[ée]stimo/i.test(x.desc); }]
  ];
  var nomesValores = ["Proventos", "INSS", "IRRF", "Outros descontos", "Total descontos", "Líquido", "FGTS", "Custo p/ hotel"]
    .concat(detalhes.map(function (d) { return d[0]; }), ["Outros", "Aula extra / projeto (R$, já em Proventos)"]);
  var cod = function (d, codigo) { return somaRubricas(d.rubricas, function (x) { return String(x.cod) === codigo; }); };
  var reais = function (c) { return c == null ? "" : Math.round(c) / 100; };
  var pessoas = lista.map(function (f) {
    var d = T.dadosHolerite(f, comp);
    var inss = cod(d, "601"), irrf = cod(d, "602");
    var det = detalhes.map(function (g) {
      return somaRubricas(d.rubricas, function (x) { return x.tipo === "D" && x.natureza !== "REDUZ" && g[1](x); });
    });
    var outros = d.descontos - inss - irrf - det.reduce(function (a, b) { return a + b; }, 0);
    var pr = L.projetoDe(f, comp, d.rubricas);
    var todos = [d.proventos, inss, irrf, d.descontos - inss - irrf, d.descontos, d.liquido, cod(d, "801"), d.custo]
      .concat(det, [outros, pr.valor]);
    if (f.salarioOculto) todos = todos.map(function () { return null; });
    var aulasGrade = f.regime === "HORISTA_AULA" ? L.aulasSemanaisDe(f) : "";
    // CLT, Ticket e MEI em colunas próprias: o que é CLT é CLT, o que é MEI é MEI.
    var dv = f.regime === "PRESTADOR_PJ" ? null : L.divisaoPagamento(f);
    var canais = f.salarioOculto ? [null, null, null] : !dv ? [0, 0, 0]
      : [dv.meiDentro || (dv.ticket > 0 && L.ticketDesconta(f)) ? dv.clt : dv.total, dv.ticket, dv.mei];
    return { f: f, oficial: d.oficial, todos: todos, canais: canais, aulasGrade: aulasGrade, aulasProjeto: pr.aulas > 0 ? pr.aulas : "" };
  }).sort(function (a, b) { return a.f.nome.localeCompare(b.f.nome, "pt-BR"); });

  // Só entram as colunas de desconto que alguém realmente tem neste mês.
  var usados = [];
  for (var i = 8; i < nomesValores.length; i++) {
    if (pessoas.some(function (x) { return x.todos[i]; })) usados.push(i);
  }
  var usar = semImpostos ? [0].concat(usados, [4, 5]) : [0, 1, 2].concat(usados, [4, 5, 6, 7]);
  pessoas.forEach(function (x) { x.valores = x.canais.concat(usar.map(function (i) { return x.todos[i]; })); });

  var secoes = [];
  L.empresasPresentes(lista).forEach(function (e) {
    var p = pessoas.filter(function (x) { return x.f.regime !== "PRESTADOR_PJ" && L.empresaDe(x.f) === e; });
    if (p.length) secoes.push({ nome: e, pessoas: p });
  });
  var pj = pessoas.filter(function (x) { return x.f.regime === "PRESTADOR_PJ"; });
  if (pj.length) secoes.push({ nome: "Prestadores PJ / MEI (nota fiscal)", pessoas: pj });

  var titulos = ["Matrícula", "Nome", "Cargo", "Regime", "Aulas grade/sem", "Aulas projeto/sem"].concat(["CLT", "Ticket", "MEI"], usar.map(function (i) { return semImpostos && i === 4 ? "Descontos" : nomesValores[i]; }));
  var colsValor = titulos.slice(6).map(function (t, k) { return 6 + k; });
  var N = titulos.length, ultima = colunaXlsx(N - 1);
  var todosOficiais = pessoas.every(function (x) { return x.oficial || x.f.regime === "PRESTADOR_PJ"; });
  var mes = L.competenciaBR(comp);
  var agora = new Date();
  var linhas = [
    { altura: 26, celulas: [{ v: "Folha de pagamento — " + mes.charAt(0).toUpperCase() + mes.slice(1), s: 1 }] },
    { celulas: [{ v: (todosOficiais ? "Cálculo oficial (competência fechada)" : "Prévia — competência não fechada") +
      " · " + pessoas.length + " pessoa(s) · gerado em " + agora.toLocaleDateString("pt-BR") + " às " +
      agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), s: 2 }] },
    { celulas: [] }
  ];
  var mesclar = ["A1:" + ultima + "1", "A2:" + ultima + "2"];
  var subtotais = [];
  secoes.forEach(function (sec) {
    linhas.push({ altura: 20, celulas: [{ v: sec.nome + " — " + sec.pessoas.length + " pessoa(s)", s: 3 }].concat(Array(N - 1).fill({ v: "", s: 3 })) });
    mesclar.push("A" + linhas.length + ":" + ultima + linhas.length);
    linhas.push({ celulas: titulos.map(function (t) { return { v: t, s: 4 }; }) });
    var primeira = linhas.length + 1;
    sec.pessoas.forEach(function (x) {
      linhas.push({ celulas: [{ v: x.f.matricula || "", s: 5 }, { v: T.nomeExibicao(x.f.nome), s: 5 }, { v: x.f.cargo || "", s: 5 },
        { v: L.grupoPagamentoDe(x.f), s: 5 }, { v: x.aulasGrade, s: 5 }, { v: x.aulasProjeto, s: 5 }].concat(x.valores.map(function (v) { return { v: reais(v), s: 6 }; })) });
    });
    var ultimaLinha = linhas.length, somas = [];
    linhas.push({ celulas: [{ v: "", s: 7 }, { v: "Subtotal " + sec.nome, s: 7 }, { v: "", s: 7 }, { v: "", s: 7 }, { v: "", s: 7 }, { v: "", s: 7 }].concat(
      colsValor.map(function (col, k) {
        var total = sec.pessoas.reduce(function (t, x) { return t + x.valores[k]; }, 0);
        somas.push(total);
        return { f: "SUM(" + colunaXlsx(col) + primeira + ":" + colunaXlsx(col) + ultimaLinha + ")", v: reais(total), s: 8 };
      })) });
    subtotais.push({ linha: linhas.length, secao: sec, somas: somas });
    linhas.push({ celulas: [] });
  });
  linhas.push({ altura: 20, celulas: [{ v: "", s: 9 }, { v: "Total geral", s: 9 }, { v: "", s: 9 }, { v: "", s: 9 }, { v: "", s: 9 }, { v: "", s: 9 }].concat(
    colsValor.map(function (col, k) {
      var total = subtotais.reduce(function (t, x) { return t + x.somas[k]; }, 0);
      return { f: subtotais.map(function (x) { return colunaXlsx(col) + x.linha; }).join("+") || "0", v: reais(total), s: 10 };
    })) });
  var larguras = [14, 12, 12, 16, 16, 14, 12, 16, 16, 12, 14, 12, 14, 16, 14, 14, 14, 14, 18];
  var folha = abaXlsx([12, 34, 26, 16, 14, 14, 14, 14, 14].concat(usar.map(function (i) { return larguras[i]; })), linhas, mesclar);

  // Resumo: totais por empresa e por categoria. Com os encargos pela
  // contabilidade, FGTS e custo com encargos não existem aqui e saem.
  var titulosResumo = semImpostos ? ["Pessoas", "Proventos", "Descontos", "Líquido"]
    : ["Pessoas", "Proventos", "Descontos", "Líquido", "FGTS", "Custo p/ hotel"];
  var res = [
    { altura: 26, celulas: [{ v: "Resumo — " + mes.charAt(0).toUpperCase() + mes.slice(1), s: 1 }] },
    { celulas: [{ v: todosOficiais ? "Cálculo oficial" : "Prévia — competência não fechada", s: 2 }] },
    { celulas: [] },
    { celulas: ["Empresa"].concat(titulosResumo).map(function (t) { return { v: t, s: 4 }; }) }
  ];
  var linhaResumo = function (nome, grupo, estilo, estiloR) {
    var soma = function (k) { return reais(grupo.reduce(function (t, x) { return t + x.todos[k]; }, 0)); };
    var celulas = [{ v: nome, s: estilo }, { v: grupo.length, s: estilo }, { v: soma(0), s: estiloR }, { v: soma(4), s: estiloR },
      { v: soma(5), s: estiloR }];
    if (!semImpostos) celulas.push({ v: soma(6), s: estiloR }, { v: soma(7), s: estiloR });
    return { celulas: celulas };
  };
  secoes.forEach(function (sec) { res.push(linhaResumo(sec.nome, sec.pessoas, 5, 6)); });
  res.push(linhaResumo("Total", pessoas, 9, 10));
  res.push({ celulas: [] });
  res.push({ celulas: ["Categoria"].concat(titulosResumo).map(function (t) { return { v: t, s: 4 }; }) });
  [["COLABORADOR", "Colaboradores"]].forEach(function (c) {
    var g = pessoas.filter(function (x) { return L.categoriaDe(x.f) === c[0]; });
    if (g.length) res.push(linhaResumo(c[1], g, 5, 6));
  });
  var resumo = abaXlsx([34, 10, 16, 16, 16, 14, 16].slice(0, titulosResumo.length + 1), res,
    ["A1:" + colunaXlsx(titulosResumo.length) + "1", "A2:" + colunaXlsx(titulosResumo.length) + "2"]);
  return arquivoXlsx([{ nome: "Folha", xml: folha }, { nome: "Resumo", xml: resumo }]);
};

T.acoes["exportar-folha"] = function () {
  var comp = L.competenciaAberta();
  var lista = pessoasDaFolhaFiltradas();
  T.comFolhaGravada(comp, function () {
    var link = document.createElement("a");
    link.href = URL.createObjectURL(T.planilhaFolha(lista, comp));
    link.download = "folha-" + comp + ".xlsx";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  });
};

T.acoes["exportar-mei"] = function () {
  var comp = L.competenciaAberta();
  var lista = T.listaMei(L.ativos());
  var linhas = [
    { altura: 26, celulas: [{ v: "MEI — " + L.competenciaBR(comp), s: 1 }] },
    { celulas: [] },
    { celulas: ["Matrícula", "Nome", "Empresa", "Tipo", "Valor do MEI"].map(function (t) { return { v: t, s: 4 }; }) }
  ];
  var total = 0;
  lista.forEach(function (x) {
    var v = T.valorMeiDe(x);
    total += v;
    linhas.push({ celulas: [{ v: x.matricula || "", s: 5 }, { v: T.nomeExibicao(x.nome), s: 5 }, { v: L.empresaDe(x), s: 5 },
      { v: T.tipoMeiDe(x), s: 5 }, { v: Math.round(v) / 100, s: 6 }] });
  });
  linhas.push({ celulas: [{ v: "", s: 9 }, { v: "Total", s: 9 }, { v: "", s: 9 }, { v: "", s: 9 }, { v: Math.round(total) / 100, s: 10 }] });
  var xlsx = arquivoXlsx([{ nome: "MEI", xml: abaXlsx([12, 34, 22, 20, 16], linhas, ["A1:E1"]) }]);
  var link = document.createElement("a");
  link.href = URL.createObjectURL(xlsx); link.download = "mei-" + comp + ".xlsx";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
};

T.acoes["exportar-ticket"] = function () {
  var comp = L.competenciaAberta();
  var lista = L.ativos().filter(function (x) { return x.valorTicket > 0; })
    .sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
  var linhas = [
    { altura: 26, celulas: [{ v: "Ticket — " + L.competenciaBR(comp), s: 1 }] },
    { celulas: [] },
    { celulas: ["Matrícula", "Nome", "Empresa", "Tipo", "Valor do Ticket", "Na folha"].map(function (t) { return { v: t, s: 4 }; }) }
  ];
  var total = 0;
  lista.forEach(function (x) {
    total += x.valorTicket;
    linhas.push({ celulas: [{ v: x.matricula || "", s: 5 }, { v: T.nomeExibicao(x.nome), s: 5 }, { v: L.empresaDe(x), s: 5 },
      { v: x.regime === "HORISTA_AULA" ? "Professor" : x.regime === "PRESTADOR_PJ" ? "Prestador MEI/PJ" : "Colaborador", s: 5 }, { v: Math.round(x.valorTicket) / 100, s: 6 },
      { v: L.ticketDesconta(x) ? "desconta" : "soma", s: 5 }] });
  });
  linhas.push({ celulas: [{ v: "", s: 9 }, { v: "Total", s: 9 }, { v: "", s: 9 }, { v: "", s: 9 }, { v: Math.round(total) / 100, s: 10 }, { v: "", s: 9 }] });
  var xlsx = arquivoXlsx([{ nome: "Ticket", xml: abaXlsx([12, 34, 22, 14, 16, 12], linhas, ["A1:F1"]) }]);
  var link = document.createElement("a");
  link.href = URL.createObjectURL(xlsx); link.download = "ticket-" + comp + ".xlsx";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
};

T.acoes["imprimir-holerite"] = function (id) {
  var f = L.buscarPorId("funcionarios", id);
  if (f) T.imprimirHolerites([f], L.competenciaAberta());
};

T.acoes["imprimir-holerites"] = function () {
  T.imprimirHolerites(pessoasDaFolhaFiltradas(), L.competenciaAberta());
};

T.telas.relatorios = function () {
  // O card de auditoria abaixo lê `L.estado.auditoria`, que só é preenchido
  // de verdade quem já visitou a aba Auditoria (modo backend, carga
  // preguiçosa) — disparar aqui também evita que o card mostre "0
  // registro(s)" só porque ninguém abriu a outra tela ainda nesta sessão.
  // Só para quem pode ver a trilha: para os demais o servidor recusa e a
  // tela exibia um aviso de erro sem motivo.
  if (L.USA_BACKEND && !T._auditoriaCarregada && T.podeVer("auditoria")) carregarAuditoriaDaApi();

  var comp = L.competenciaAberta();
  var contas = L.contasDoMes(comp);
  var ativos = L.ativos();

  var relatorios = [
    { nome: "Banco de horas consolidado", detalhe: "Saldo por pessoa e por setor, com extrato de lançamentos.",
      dado: L.estado.lancamentosBanco.length + " lançamento(s)", pronto: L.estado.lancamentosBanco.length > 0, destino: "banco" },
    { nome: "Fechamento financeiro", detalhe: "Previsto, aprovado, pago, pendente e vencido por grupo de despesa.",
      dado: contas.length + " conta(s) em " + L.competenciaBR(comp), pronto: contas.length > 0, destino: "fechamento" },
    { nome: "Contratos a vencer", detalhe: "Vencimentos nos próximos 90 dias, com valor e responsável.",
      dado: L.estado.contratos.length + " contrato(s)", pronto: L.estado.contratos.length > 0, destino: "contratos" },
    { nome: "Solicitações e aprovações", detalhe: "Quem pediu, quem aprovou, quando e com que comentário.",
      dado: L.estado.solicitacoes.length + " solicitação(ões)", pronto: L.estado.solicitacoes.length > 0, destino: "solicitacoes" },
    { nome: "Trilha de auditoria", detalhe: "Toda alteração de dado, com autor e horário.",
      dado: L.estado.auditoria.length + " registro(s)", pronto: L.estado.auditoria.length > 0, destino: "auditoria" }
  ];

  var html = T.cabecalho("Relatórios",
    "Consulte os principais relatórios ou abra o detalhamento completo da folha.");

  var disponiveis = relatorios.filter(function (r) { return r.pronto && T.podeVer(r.destino); });
  if (disponiveis.length) html += '<div class="painel rel-nao-imprime">' + U.tabelaHtml([
    { rotulo: "Relatório", conteudo: function (r) {
      return '<div class="principal">' + U.esc(r.nome) + '</div><div class="secundario">' + U.esc(r.detalhe) + "</div>"; } },
    { rotulo: "Base de dados", conteudo: function (r) { return U.esc(r.dado); } },
    { rotulo: "", direita: true, conteudo: function (r) {
      return r.pronto
        ? '<button class="botao miudo" data-ir="' + r.destino + '">Abrir</button>'
        : '<span class="pastilha neutro">sem dados</span>'; } }
  ], disponiveis
    .map(function (r, i) { return Object.assign({ id: "rel" + i }, r); })) + "</div>";
  else html += '<p class="relatorios-sem-base">Outros relatórios aparecem aqui quando houver lançamentos de contas, contratos, solicitações ou banco de horas.</p>';

  html += '<details class="relatorio-detalhe"><summary>Relatório geral da folha <span>Filtros, rubricas e exportação em PDF</span></summary>' +
    U.painelHtml("Relatório geral da folha", "Colaboradores por empresa", T.relatorioGeralHtml()) +
    '</details>';

  return html;
};

// ---------------------------------------------------------------- controle de acesso
//
// Dois mecanismos, propositalmente separados. O perfil é regra fixa — o que
// um cargo enxerga por definição, ninguém liga de volta sozinho. Os extras
// aqui são a exceção pontual: o dono dá a UMA pessoa acesso a UM módulo fora
// do perfil dela, sem abrir aquele módulo para o cargo inteiro. E existem
// atos que continuam fora do alcance de qualquer delegação — estão listados
// no rodapé desta tela, não escondidos no código.

T.telas.acessos = function () {
  if (L.USA_BACKEND) return T.telaAcessosBackend();
  var eu = L.estado.usuario;
  var usuarios = L.estado.usuarios.slice().sort(function (a, b) {
    return (a.nome || "").localeCompare(b.nome || "");
  });

  var html = T.cabecalho("Controle de Acesso",
    "O perfil define o que o cargo vê por padrão. Aqui você concede a exceção pontual — " +
    "acesso a um módulo específico para uma pessoa específica, sem mudar o perfil dela.");

  html += U.painelHtml("Contas cadastradas", usuarios.length + " conta(s)",
    usuarios.length === 0
      ? U.vazioHtml("Ninguém além de você ainda", "Assim que outra pessoa criar a conta, ela aparece aqui para você ajustar o acesso.")
      : '<div class="rolagem"><table><thead><tr><th>Pessoa</th><th>Perfil</th><th>Módulos extras</th><th>Situação</th><th></th></tr></thead><tbody>' +
        usuarios.map(function (u) {
          var souEu = u.id === eu.id;
          var extras = u.extras || [];
          var extrasTexto = extras.length
            ? extras.map(function (c) {
                var m = T.MODULOS.find(function (x) { return x.chave === c; });
                return m ? m.nome : c;
              }).join(", ")
            : "nenhum";

          // Ninguém muda o próprio perfil — mostrar um seletor fingindo ser
          // editável e travado por baixo confundia mais do que ajudava; aqui
          // é só o nome do perfil, sem controle nenhum.
          var seletorPerfil = souEu
            ? U.esc(T.PERFIS[u.perfil].nome)
            : U.seletorRico({
                rotulo: "Perfil de acesso de " + u.nome, valor: u.perfil,
                itens: Object.keys(T.PERFIS).map(function (p) { return { valor: p, rotulo: T.PERFIS[p].nome }; }),
                atributos: { acaoInline: "perfil", usuario: u.id }
              });

          var podeMexerEmAdmin = eu.administrador && !souEu;
          var seloAdmin = u.administrador
            ? '<span class="pastilha destaque">administrador</span>'
            : "";

          return '<tr data-rotulo-linha="' + U.esc(u.nome) + '">' +
            '<td data-rotulo="Pessoa"><span class="principal">' + U.esc(u.nome) +
              (souEu ? " (você)" : "") + "</span>" + (seloAdmin ? " " + seloAdmin : "") +
              '<div class="secundario">' + U.esc(u.email) + "</div></td>" +
            '<td data-rotulo="Perfil">' + seletorPerfil + "</td>" +
            '<td data-rotulo="Módulos extras" class="secundario">' + U.esc(extrasTexto) + "</td>" +
            '<td data-rotulo="Situação">' + (u.ativo === false
              ? '<span class="pastilha critico">desativada</span>'
              : '<span class="pastilha ok">ativa</span>') + "</td>" +
            '<td data-rotulo="">' +
              '<button class="botao miudo" data-acao="editar-acesso" data-id="' + u.id + '">Ajustar</button>' +
            "</td></tr>";
        }).join("") + "</tbody></table></div>");

  return html;
};

T.acoes["editar-acesso"] = function (usuarioId) {
  if (L.USA_BACKEND) return T.editarAcessoBackend(usuarioId);
  var eu = L.estado.usuario;
  var u = L.estado.usuarios.find(function (x) { return x.id === usuarioId; });
  if (!u) return;
  var souEu = u.id === eu.id;

  var corpo = '<div class="grupo-opcoes"><div class="grupo-legenda">Módulos além do perfil de ' +
    U.esc(T.PERFIS[u.perfil].nome) + "</div>" +
    T.MODULOS_DELEGAVEIS.map(function (m) {
      var jaTem = T.PERFIS[u.perfil].modulos === "*" || T.PERFIS[u.perfil].modulos.indexOf(m.chave) !== -1;
      var concedido = (u.extras || []).indexOf(m.chave) !== -1;
      if (jaTem) {
        return '<label class="opcao-painel" style="opacity:.5"><input type="checkbox" checked disabled>' +
          "<span><span class=\"nome\">" + U.esc(m.nome) + "</span>" +
          '<span class="descricao">Já incluso no perfil dela.</span></span></label>';
      }
      return '<label class="opcao-painel"><input type="checkbox" data-extra="' + U.esc(m.chave) + '"' +
        (concedido ? " checked" : "") + "><span><span class=\"nome\">" + U.esc(m.nome) + "</span></span></label>";
    }).join("") + "</div>";

  if (eu.administrador && !souEu) {
    corpo += '<div class="grupo-opcoes"><div class="grupo-legenda">Administração</div>' +
      '<label class="opcao-painel"><input type="checkbox" id="chk-administrador"' +
      (u.administrador ? " checked" : "") + '><span><span class="nome">Também é administrador</span>' +
      '<span class="descricao">Pode gerenciar o acesso de qualquer conta, como você.</span></span></label>' +
      '<label class="opcao-painel"><input type="checkbox" id="chk-ativo"' +
      (u.ativo !== false ? " checked" : "") + '><span><span class="nome">Acesso ativo</span>' +
      '<span class="descricao">Desmarcar impede o próximo login, sem apagar nada.</span></span></label>' +
      "</div>";
  } else if (!souEu) {
    corpo += '<div class="grupo-opcoes"><div class="grupo-legenda">Acesso</div>' +
      '<label class="opcao-painel"><input type="checkbox" id="chk-ativo"' +
      (u.ativo !== false ? " checked" : "") + '><span><span class="nome">Acesso ativo</span>' +
      '<span class="descricao">Desmarcar impede o próximo login, sem apagar nada.</span></span></label>' +
      "</div>";
  } else {
    corpo += '<p style="margin:16px 0 0;color:var(--tinta-media);font-size:var(--t-1)">' +
      "Administração e ativação da própria conta não se editam por aqui — peça a outro administrador.</p>";
  }

  U.abrirModal({
    titulo: "Ajustar acesso — " + u.nome,
    sub: T.PERFIS[u.perfil].nome,
    corpo: corpo,
    acoes: [{ rotulo: "Fechar", classe: "primario", aoClicar: function () { U.fecharModal(); T.renderizar(); } }]
  });

  U.todos("[data-extra]").forEach(function (caixa) {
    caixa.addEventListener("change", function () {
      L.definirExtra(u.id, caixa.dataset.extra, caixa.checked);
    });
  });
  var chkAdmin = U.el("chk-administrador");
  if (chkAdmin) chkAdmin.addEventListener("change", function () {
    var atualizado = L.definirAdministrador(u.id, chkAdmin.checked, eu);
    if (!atualizado) { chkAdmin.checked = !chkAdmin.checked; U.avisar("Só um administrador concede isso."); }
  });
  var chkAtivo = U.el("chk-ativo");
  if (chkAtivo) chkAtivo.addEventListener("change", function () {
    L.definirAtivo(u.id, chkAtivo.checked);
  });
};

// ---------------------------------------------------------------- controle de acesso (backend)
T._usuariosAcessoCarregados = false;
T._carregandoUsuariosAcesso = false;

function carregarUsuariosAcesso() {
  if (T._carregandoUsuariosAcesso) return;
  T._carregandoUsuariosAcesso = true;
  L.api.get("/api/acesso/usuarios").then(function (lista) {
    L.estado.usuariosAcesso = lista || [];
    T._usuariosAcessoCarregados = true;
    T._carregandoUsuariosAcesso = false;
    T.renderizar();
  }).catch(function (erro) {
    T._carregandoUsuariosAcesso = false;
    console.error("Não foi possível carregar as contas de acesso:", erro);
    U.avisar("Não foi possível carregar as contas de acesso agora.");
  });
}

T.telaAcessosBackend = function () {
  var eu = L.estado.usuario;
  if (!T._usuariosAcessoCarregados) carregarUsuariosAcesso();
  var usuarios = (L.estado.usuariosAcesso || []).slice().sort(function (a, b) {
    return (a.nome || "").localeCompare(b.nome || "");
  });

  var html = T.cabecalho("Controle de Acesso",
    "Quem acessa o sistema e com qual perfil.",
    T.botaoNovo("novo-acesso", "Conceder acesso"));

  var corpoLista;
  if (!T._usuariosAcessoCarregados) {
    corpoLista = U.vazioHtml("Carregando…", "Buscando as contas cadastradas no servidor.");
  } else if (usuarios.length === 0) {
    corpoLista = U.vazioHtml("Ninguém além de você ainda", "Conceda acesso a um colaborador pelo botão acima.");
  } else {
    corpoLista = '<div class="rolagem"><table><thead><tr><th>Pessoa</th><th>Perfil</th><th>Situação</th><th></th></tr></thead><tbody>' +
      usuarios.map(function (u) {
        var souEu = u.id === eu.id;
        var perfisTexto = (u.perfis || []).map(function (p) {
          return T.PERFIS[p] ? T.PERFIS[p].nome : p;
        }).join(", ") || "nenhum";
        return '<tr data-rotulo-linha="' + U.esc(u.nome) + '">' +
          '<td data-rotulo="Pessoa"><span class="principal">' + U.esc(u.nome) +
            (souEu ? " (você)" : "") + "</span>" +
            '<div class="secundario">' + U.esc(u.email) + "</div></td>" +
          '<td data-rotulo="Perfil">' + U.esc(perfisTexto) + "</td>" +
          '<td data-rotulo="Situação">' + (u.ativo === false
            ? '<span class="pastilha critico">desativada</span>'
            : '<span class="pastilha ok">ativa</span>') + "</td>" +
          '<td data-rotulo="">' +
            '<button class="botao miudo" data-acao="editar-acesso" data-id="' + u.id + '">Ajustar</button>' +
            (souEu ? "" : ' <button class="botao miudo" data-acao="deixar-recado" data-id="' + u.id + '">Recado</button>') +
          "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  html += U.painelHtml("Contas cadastradas",
    T._usuariosAcessoCarregados ? usuarios.length + " conta(s)" : "carregando…",
    corpoLista);

  return html;
};

// Recado que aparece no painel da pessoa na próxima vez que ela entrar.
T.acoes["deixar-recado"] = function (usuarioId) {
  var u = (L.estado.usuariosAcesso || []).find(function (x) { return x.id === usuarioId; });
  if (!u) return;
  U.abrirFormulario({
    titulo: "Recado para " + u.nome.split(" ")[0],
    sub: "Aparece no painel de " + u.nome + " ao entrar, até clicar em Entendi",
    campos: [
      { id: "titulo", rotulo: "Título", obrigatorio: true },
      { id: "detalhe", rotulo: "Recado", tipo: "textarea" }
    ],
    rotuloSalvar: "Deixar recado",
    aoSalvar: function (v) {
      L.api.post("/api/recados", { userId: u.id, titulo: v.titulo, detalhe: v.detalhe }).then(function () {
        U.fecharModal();
        U.avisar("Recado deixado para " + u.nome + ". Aparece quando entrar no sistema.");
      }).catch(function (erro) {
        U.avisar(erro.message || "Não foi possível deixar o recado.");
      });
    }
  });
};

T.acoes["novo-acesso"] = function () {
  U.abrirFormulario({
    titulo: "Conceder acesso",
    sub: "Só você decide quem entra e com que perfil — a pessoa nunca escolhe isso sozinha",
    campos: [
      { id: "nome", rotulo: "Nome completo", obrigatorio: true },
      { id: "email", rotulo: "E-mail", obrigatorio: true },
      { id: "perfil", rotulo: "Perfil de acesso", tipo: "select", obrigatorio: true,
        opcoes: Object.keys(T.PERFIS).map(function (p) { return { valor: p, rotulo: T.PERFIS[p].nome }; }) },
      { id: "senha", rotulo: "Senha inicial",
        dicaCampo: "Em branco: o sistema gera uma" }
    ],
    valores: { perfil: "CONSULTA" },
    rotuloSalvar: "Conceder acesso",
    aoSalvar: function (v) {
      if (v.senha && v.senha.length < 6) {
        var alvo = U.el("erro-senha");
        if (alvo) { alvo.textContent = "A senha precisa de pelo menos 6 caracteres."; alvo.classList.remove("oculto"); }
        return;
      }
      var corpo = { nome: v.nome, email: v.email, perfis: [v.perfil] };
      if (v.senha) corpo.senha = v.senha;
      L.api.post("/api/acesso/usuarios", corpo).then(function (criado) {
        U.fecharModal();
        T._usuariosAcessoCarregados = false;
        T.ir("acessos");
        U.avisar(criado.senhaGerada
          ? "Acesso criado para " + v.nome + ". Senha gerada: " + criado.senhaGerada +
            " — repasse com segurança, ela não aparece de novo."
          : "Acesso criado para " + v.nome + ".");
      }).catch(function (erro) {
        U.avisar(erro.message || "Não foi possível criar o acesso.");
      });
    }
  });
};

T.editarAcessoBackend = function (usuarioId) {
  var eu = L.estado.usuario;
  var u = (L.estado.usuariosAcesso || []).find(function (x) { return x.id === usuarioId; });
  if (!u) return;
  var souEu = u.id === eu.id;
  var perfilAtual = (u.perfis && u.perfis[0]) || "CONSULTA";
  var idCampoPerfil = "campo-perfil-acesso";

  var corpo = '<div class="grupo-opcoes"><div class="grupo-legenda">Perfil de acesso</div>' +
    (souEu
      ? '<p style="margin:0;color:var(--tinta-media);font-size:var(--t-1)">' +
        "Você não altera o próprio perfil por aqui — peça a outra pessoa da Direção.</p>"
      : '<input type="hidden" id="' + idCampoPerfil + '" value="' + U.esc(perfilAtual) + '">' +
        U.seletorRico({
          rotulo: "Perfil de acesso de " + u.nome, valor: perfilAtual,
          itens: Object.keys(T.PERFIS).map(function (p) { return { valor: p, rotulo: T.PERFIS[p].nome }; }),
          atributos: { campoOculto: idCampoPerfil }
        })) + "</div>";

  if (!souEu) {
    corpo += '<div class="grupo-opcoes"><div class="grupo-legenda">Acesso</div>' +
      '<label class="opcao-painel"><input type="checkbox" id="chk-ativo"' +
      (u.ativo !== false ? " checked" : "") + '><span><span class="nome">Acesso ativo</span>' +
      '<span class="descricao">Desmarcar impede o próximo login, sem apagar nada.</span></span></label>' +
      "</div>";
  } else {
    corpo += '<p style="margin:16px 0 0;color:var(--tinta-media);font-size:var(--t-1)">' +
      "Você não desativa a própria conta por aqui — peça a outra pessoa da Direção.</p>";
  }

  U.abrirModal({
    titulo: "Ajustar acesso — " + u.nome,
    sub: (T.PERFIS[perfilAtual] || {}).nome || perfilAtual,
    corpo: corpo,
    acoes: souEu
      ? [{ rotulo: "Fechar", classe: "primario", aoClicar: U.fecharModal }]
      : [
          { rotulo: "Cancelar", aoClicar: U.fecharModal },
          { rotulo: "Salvar", classe: "primario", aoClicar: function () {
            var campoPerfil = U.el(idCampoPerfil);
            var perfilSelecionado = campoPerfil ? campoPerfil.value : perfilAtual;
            var chkAtivo = U.el("chk-ativo");
            var ativoSelecionado = chkAtivo ? chkAtivo.checked : true;
            L.api.patch("/api/acesso/usuarios/" + u.id, { perfis: [perfilSelecionado], ativo: ativoSelecionado })
              .then(function (atualizado) {
                U.fecharModal();
                var lista = L.estado.usuariosAcesso || [];
                var idx = lista.findIndex(function (x) { return x.id === u.id; });
                if (idx !== -1) lista[idx] = atualizado;
                T.renderizar();
                U.avisar("Acesso de " + u.nome + " atualizado.");
              }).catch(function (erro) {
                U.avisar(erro.message || "Não foi possível salvar.");
              });
          } }
        ]
  });
};

// ---------------------------------------------------------------- auditoria

T._auditoriaCarregada = false;
T._carregandoAuditoria = false;

function carregarAuditoriaDaApi() {
  if (T._carregandoAuditoria) return;
  T._carregandoAuditoria = true;
  L.api.get("/api/auditoria?limite=200").then(function (linhas) {
    // O servidor manda o nome de campo do banco (`ocorrido_em`, `entidade_id`)
    // — traduzido aqui para a mesma forma que a tabela local sempre usou
    // (`quando`, `rotulo`), assim o renderizador embaixo não precisa saber
    // que existem dois modos. Sem JOIN pro nome de cada entidade ainda: o
    // que fica registrado é o id bruto, não um rótulo bonito — mostrar o id
    // é honesto; inventar um nome não seria.
    L.estado.auditoria = (linhas || []).map(function (l) {
      return { quando: l.ocorrido_em, autor: l.autor || "sistema", acao: l.acao,
        entidade: l.entidade, rotulo: l.entidade_id };
    });
    T._auditoriaCarregada = true;
    T._carregandoAuditoria = false;
    T.renderizar();
  }).catch(function (erro) {
    T._carregandoAuditoria = false;
    console.error("Não foi possível carregar a trilha de auditoria:", erro);
    U.avisar("Não foi possível carregar a trilha de auditoria agora.");
  });
}

T.telas.auditoria = function () {
  if (L.USA_BACKEND && !T._auditoriaCarregada) carregarAuditoriaDaApi();

  var html = T.cabecalho("Trilha de Auditoria",
    "Toda alteração fica registrada com autor e horário e não pode ser apagada.");

  html += L.USA_BACKEND
    ? ""
    : '<div class="aviso-tela"><span aria-hidden="true">▲</span><div><strong>No protótipo a trilha vive na memória do navegador.</strong> ' +
      "Em produção ela é uma tabela particionada por mês que recusa UPDATE e DELETE, e o usuário da aplicação não tem privilégio para alterá-la.</div></div>";

  var linhas = L.USA_BACKEND && !T._auditoriaCarregada ? [] : L.estado.auditoria.slice(0, 100);

  html += '<div class="painel">' + U.tabelaHtml([
    { rotulo: "Quando", conteudo: function (a) {
      return new Date(a.quando).toLocaleString("pt-BR"); } },
    { rotulo: "Autor", conteudo: function (a) { return U.esc(a.autor); } },
    { rotulo: "Ação", conteudo: function (a) {
      var tom = a.acao === "EXCLUIR" || a.acao === "REJEITAR" ? "critico" : a.acao === "APROVAR" ? "ok" : "neutro";
      return '<span class="pastilha ' + tom + '">' + U.esc(a.acao) + "</span>"; } },
    { rotulo: "Entidade", secundaria: true, conteudo: function (a) { return U.esc(a.entidade); } },
    { rotulo: "Registro", conteudo: function (a) { return U.esc(a.rotulo); } }
  ], linhas.map(function (a, i) { return Object.assign({ id: "a" + i }, a); }), {
    tituloVazio: L.USA_BACKEND && !T._auditoriaCarregada ? "Carregando…" : "Nenhuma alteração registrada",
    textoVazio: L.USA_BACKEND && !T._auditoriaCarregada
      ? "Buscando a trilha no servidor."
      : "Cada cadastro, edição e aprovação feita no sistema aparece aqui."
  }) + "</div>";
  return html;
};

// ---------------------------------------------------------------- tabelas legais

function situacaoTabela(t) {
  if (!t) return { chave: "critico", rotulo: "não cadastrada" };
  if (!t.conferida) return { chave: "pendente", rotulo: "aguarda conferência" };
  return { chave: "ok", rotulo: "conferida" };
}

function vigenciaTexto(t) {
  return L.competenciaBR(t.inicio) + (t.fim ? " até " + L.competenciaBR(t.fim) : " em diante");
}

/** Centavos → texto editável em reais ("1518.00"), do jeito que o input espera. */
function emReais(centavos) {
  return (Number(centavos || 0) / 100).toFixed(2);
}

T._tabelasCarregadas = false;
T._carregandoTabelas = false;

/**
 * `L.estado.tabelas` (INSS/IRRF) e `L.estado.ccts` vinham só do seed de
 * demonstração empacotado no build — nunca refletiam o `conferida_por_rh`
 * real do banco, que é o que `calcularFolha` de fato usa para travar o
 * fechamento. CCT em especial nunca tinha essa confirmação de verdade, e
 * como toda folha depende da CCT vigente estar conferida, isso bloqueava
 * silenciosamente QUALQUER competência.
 */
function carregarTabelasDaApi() {
  if (T._carregandoTabelas) return;
  T._carregandoTabelas = true;
  L.api.get("/api/tabelas").then(function (r) {
    L.estado.tabelas = (r.inss || []).concat(r.irrf || []);
    L.estado.ccts = r.ccts || [];
    L.estado.salarioMinimo = (r.salarioMinimo || []).map(function (m) { return Object.assign({}, m, { valor: Number(m.valor) }); });
    T._tabelasCarregadas = true;
    T._carregandoTabelas = false;
    T.renderizar();
  }).catch(function (erro) {
    T._carregandoTabelas = false;
    console.error("Não foi possível carregar as tabelas legais:", erro);
    U.avisar("Não foi possível carregar as tabelas legais agora.");
  });
}

/** Configurações da escola (hoje: impostos pela contabilidade). */
T.carregarConfiguracoes = function () {
  if (!L.USA_BACKEND) return Promise.resolve();
  return L.api.get("/api/configuracoes").then(function (c) {
    L.estado.configuracoes = c || {};
    L.versao++;
    T.renderizar();
  }).catch(function () {});
};

T.acoes["alternar-impostos-contabilidade"] = function () {
  var ligar = !L.impostosPelaContabilidade();
  U.confirmar({
    titulo: ligar ? "Passar impostos e encargos para a contabilidade?" : "Voltar a calcular impostos e encargos aqui?",
    texto: ligar
      ? "A folha de todos deixa de descontar INSS e IRRF e deixa de lançar FGTS, INSS patronal e provisões. O líquido fica igual ao bruto menos os descontos do hotel (cantina, material, mensalidade, plano de saúde, adiantamento, robótica, empréstimos e outros). Mês já fechado não muda."
      : "A folha volta a descontar INSS e IRRF e a lançar os encargos do hotel. Mês já fechado não muda.",
    rotulo: ligar ? "Passar para a contabilidade" : "Voltar a calcular aqui",
    aoConfirmar: function () {
      var aplicar = function () {
        L.estado.configuracoes = Object.assign({}, L.estado.configuracoes, { impostosPelaContabilidade: ligar });
        L.versao++; L.persistir(); T.renderizar();
        U.avisar(ligar ? "Impostos e encargos agora ficam com a contabilidade." : "Impostos e encargos voltaram a ser calculados aqui.");
      };
      if (!L.USA_BACKEND) { aplicar(); return; }
      L.api.chamar("PUT", "/api/configuracoes/impostosPelaContabilidade", { valor: ligar })
        .then(aplicar).catch(function (e) { U.avisar(e.message || "Não foi possível salvar."); });
    }
  });
};

T.acoes["alternar-sem-dsr"] = function () {
  var ligar = !L.ocultarDsr();
  U.confirmar({
    titulo: ligar ? "Esconder o DSR da folha?" : "Mostrar o DSR como linha separada?",
    texto: ligar
      ? "O DSR continua sendo pago (é direito garantido em lei), mas deixa de aparecer como linha própria: o valor entra somado nas aulas. O total de cada pessoa não muda. Mês já fechado não muda."
      : "O DSR volta a aparecer como linha separada. O total de cada pessoa não muda. Mês já fechado não muda.",
    rotulo: ligar ? "Esconder o DSR" : "Mostrar o DSR",
    aoConfirmar: function () {
      var aplicar = function () {
        L.estado.configuracoes = Object.assign({}, L.estado.configuracoes, { ocultarDsr: ligar });
        L.versao++; L.persistir(); T.renderizar();
        U.avisar(ligar ? "O DSR agora vem somado nas aulas." : "O DSR voltou a aparecer separado.");
      };
      if (!L.USA_BACKEND) { aplicar(); return; }
      L.api.chamar("PUT", "/api/configuracoes/ocultarDsr", { valor: ligar })
        .then(aplicar).catch(function (e) { U.avisar(e.message || "Não foi possível salvar."); });
    }
  });
};

T.telas.tabelas = function () {
  if (L.USA_BACKEND && !T._tabelasCarregadas) carregarTabelasDaApi();

  var comp = L.estado.competencia || L.competenciaAtual();
  var html = T.cabecalho("Tabelas Legais",
    T.temPerfil("DIRECAO") ? "Tabelas de INSS, IRRF e convenção coletiva em vigor."
      : "Tabelas de INSS, IRRF e convenção coletiva em vigor. Só a Direção cadastra ou confere tabelas.",
    T.temPerfil("DIRECAO") ? T.botaoNovo("nova-tabela", "Cadastrar tabela") : "");


  var contabilidade = L.impostosPelaContabilidade();
  html += '<div class="painel"><div class="painel-topo"><h2>Impostos e encargos</h2>' +
    '<span class="contexto">INSS, IRRF, FGTS, INSS patronal e provisões</span></div>' +
    '<div class="painel-corpo"><div class="barra-dado barra-acao" style="grid-template-columns:minmax(0,1fr) auto">' +
    "<div><strong>" + (contabilidade ? "Calculados pela contabilidade" : "Calculados pelo sistema") + "</strong>" +
    '<div class="secundario">' + (contabilidade
      ? "A folha não desconta INSS e IRRF nem lança encargos do hotel."
      : "A folha desconta INSS e IRRF e lança os encargos do hotel.") + "</div></div>" +
    (T.temPerfil("DIRECAO")
      ? '<button class="botao miudo" data-acao="alternar-impostos-contabilidade">' +
        (contabilidade ? "Voltar a calcular aqui" : "Passar para a contabilidade") + "</button>" : '<span class="pastilha neutro">só a Direção altera</span>') +
    "</div></div></div>";

  var ocultarDsr = L.ocultarDsr();
  html += '<div class="painel"><div class="painel-topo"><h2>DSR</h2>' +
    '<span class="contexto">como o DSR aparece na folha</span></div>' +
    '<div class="painel-corpo"><div class="barra-dado barra-acao" style="grid-template-columns:minmax(0,1fr) auto">' +
    "<div><strong>" + (ocultarDsr ? "Somado nas aulas" : "Linha separada") + "</strong>" +
    '<div class="secundario">' + (ocultarDsr
      ? "O DSR é pago normalmente, mas não aparece como linha própria."
      : "O DSR aparece em linha própria (sobre horas extras e adicionais).") + "</div></div>" +
    (T.temPerfil("DIRECAO")
      ? '<button class="botao miudo" data-acao="alternar-sem-dsr">' +
        (ocultarDsr ? "Mostrar o DSR" : "Esconder o DSR") + "</button>" : '<span class="pastilha neutro">só a Direção altera</span>') +
    "</div></div></div>";

  // O que vale agora: é a pergunta que o RH faz antes de qualquer coisa.
  html += '<div class="painel"><div class="painel-topo"><h2>Vigente em ' + U.esc(L.competenciaBR(comp)) +
    '</h2><span class="contexto">o que o sistema está usando</span></div><div class="painel-corpo">' +
    ["INSS", "IRRF"].map(function (tipo) {
      var t = L.tabelaVigente(tipo, comp);
      var s = situacaoTabela(t);
      return '<div class="barra-dado" style="grid-template-columns:90px minmax(0,1fr) auto">' +
        '<strong>' + tipo + "</strong>" +
        "<div>" + (t
          ? U.esc(vigenciaTexto(t)) + '<div class="secundario">' + U.esc(t.fonte || "sem fonte declarada") + "</div>"
          : '<span class="secundario">Nenhuma tabela cobre esta competência — o imposto sai zerado.</span>') +
        "</div>" +
        '<span class="pastilha ' + s.chave + '">' + s.rotulo + "</span></div>";
    }).join("") + "</div></div>";

  // Convenção coletiva: shape diferente de INSS/IRRF (sem faixas, uma linha
  // por categoria), por isso é seção própria em vez de forçar dentro da
  // lista genérica de tabelas.
  var ccts = L.estado.ccts || [];
  if (ccts.length) {
    html += '<div class="painel"><div class="painel-topo"><h2>Convenção coletiva</h2>' +
      '<span class="contexto">por categoria</span></div><div class="painel-corpo">' +
      ccts.map(function (c) {
        var s = situacaoTabela({ inicio: c.inicio, fim: c.fim, conferida: c.conferida });
        return '<div class="barra-dado" style="grid-template-columns:140px minmax(0,1fr) auto" data-id="' + c.id + '">' +
          '<strong>' + U.esc(c.categoria) + "</strong>" +
          "<div>" + U.esc(c.nome) + '<div class="secundario">' + U.esc(vigenciaTexto(c)) + "</div></div>" +
          '<span class="pastilha ' + s.chave + '">' + s.rotulo + "</span></div>";
      }).join("") + "</div>" +
      (T.podeEditar() && T.temPerfil("DIRECAO")
        ? '<div class="painel-corpo acoes-tabela" style="padding-top:0">' +
          ccts.filter(function (c) { return !c.conferida; }).map(function (c) {
            return '<button class="botao miudo primario" data-acao="conferir-cct" data-id="' + c.id +
              '" data-nome="' + U.esc(c.categoria) + '">Confirmar ' + U.esc(c.categoria) + "</button>";
          }).join(" ") +
          (L.USA_BACKEND ? ultimaPorCategoria(ccts).map(function (c) {
            return ' <button class="botao miudo" data-acao="renovar-cct" data-id="' + c.id +
              '" data-nome="' + U.esc(c.categoria) + '" data-fim="' + U.esc(c.fim || "") + '">Renovar ' + U.esc(c.categoria) + "</button>";
          }).join("") : "") + "</div>"
        : "") +
      "</div>";
  }

  if (L.USA_BACKEND) {
    var minimos = (L.estado.salarioMinimo || []).slice().sort(function (a, b) { return b.inicio.localeCompare(a.inicio); });
    html += '<div class="painel"><div class="painel-topo"><h2>Salário mínimo</h2>' +
      (T.podeEditar() && T.temPerfil("DIRECAO") ? '<button class="botao miudo" data-acao="novo-salario-minimo" style="margin-left:auto">Cadastrar</button>' : "") +
      '</div><div class="painel-corpo">' +
      (minimos.length ? minimos.map(function (m) {
        var sm = situacaoTabela(m);
        return '<div class="barra-dado" style="grid-template-columns:140px minmax(0,1fr) auto">' +
          '<strong class="num">' + L.brl(m.valor) + "</strong>" +
          "<div>" + U.esc(vigenciaTexto(m)) + '<div class="secundario">' + U.esc(m.fonte || "") + "</div></div>" +
          (!m.conferida && T.podeEditar() && T.temPerfil("DIRECAO")
            ? '<button class="botao miudo primario" data-acao="conferir-salario-minimo" data-id="' + m.id + '">Confirmar</button>'
            : '<span class="pastilha ' + sm.chave + '">' + sm.rotulo + "</span>") + "</div>";
      }).join("") : '<p class="secundario" style="margin:0">Nenhum salário mínimo cadastrado.</p>') +
      "</div></div>";
  }

  var linhas = L.estado.tabelas.slice().sort(function (a, b) {
    return a.tipo.localeCompare(b.tipo) || b.inicio.localeCompare(a.inicio);
  });

  // Tabela de salário-hora do rodapé da planilha: referência de quanto vale a
  // hora por nível e titulação. Fica aqui, junto das demais tabelas, porque é
  // parâmetro de remuneração — não é cálculo, é a régua contra a qual se
  // confere o que está sendo pago.
  var sh = L.DADOS_REAIS && L.DADOS_REAIS.salarioHora;
  if (sh) {
    html += '<div class="painel"><div class="painel-topo"><h2>Salário-hora de referência</h2>' +
      '<span class="contexto">' + U.esc(sh.rotulo) + "</span></div>" +
      '<div class="painel-corpo">' +
      sh.niveis.map(function (n) {
        // A planilha repete "Mestrado" em duas colunas; mostra uma vez só.
        var vistos = {};
        var faixas = n.faixas.filter(function (fx) {
          var chave = fx.titulacao + "|" + fx.salarioHora;
          if (vistos[chave]) return false;
          vistos[chave] = true;
          return true;
        });
        return '<div class="sh-nivel"><span class="sh-rotulo">' + U.esc(n.nivel) + "</span>" +
          faixas.map(function (fx) {
            return '<span class="sh-faixa">' + U.esc(fx.titulacao) +
              " <b>" + L.brl(fx.salarioHora) + "</b></span>";
          }).join("") + "</div>";
      }).join("") + "</div></div>";
  }

  html += '<div class="painel"><div class="painel-topo"><h2>Todas as tabelas</h2>' +
    '<span class="contexto">' + linhas.length + " cadastrada(s)</span></div>" +
    U.tabelaHtml([
      { rotulo: "Tabela", conteudo: function (t) {
        return '<div class="principal">' + t.tipo + " · " + U.esc(vigenciaTexto(t)) + "</div>" +
          '<div class="secundario">' + U.esc(t.fonte || "sem fonte declarada") + "</div>"; } },
      { rotulo: "Faixas", secundaria: true, conteudo: function (t) {
        return t.faixas.length + " faixa(s)" +
          (t.tipo === "INSS" ? " · teto " + L.brl(t.teto) : " · dependente " + L.brl(t.porDependente)); } },
      { rotulo: "Situação", conteudo: function (t) {
        var s = situacaoTabela(t);
        return '<span class="pastilha ' + s.chave + '">' + s.rotulo + "</span>" +
          (t.conferida ? '<div class="secundario">' + U.esc(t.conferidaPor) + " · " +
            L.dataBR(t.conferidaEm) + "</div>" : ""); } },
      { rotulo: "", direita: true, conteudo: function (t) {
        if (!T.podeEditar() || !T.temPerfil("DIRECAO")) return "";
        return '<button class="botao miudo" data-acao="editar-tabela" data-id="' + t.id + '">Abrir</button>'; } }
    ], linhas, {
      tituloVazio: "Nenhuma tabela cadastrada",
      textoVazio: "Sem tabela de INSS e IRRF o motor calcula imposto zero.",
      acaoVazio: { acao: "nova-tabela", rotulo: "Cadastrar a primeira" }
    }) + "</div>";

  return html;
};

/** Linhas de faixa do editor. Uma linha extra em branco permite crescer. */
function faixasHtml(tipo, faixas) {
  var linhas = faixas.concat([{ ate: "", aliquota: "", parcelaDeduzir: 0 }]);
  return '<div class="faixas-editor">' +
    // O cabeçalho é orientação visual: cada campo já carrega o próprio rótulo,
    // então repeti-lo no leitor de tela só atrapalharia.
    '<div class="faixa-cabecalho" aria-hidden="true"><span>' + (tipo === "INSS" ? "Faixa até" : "Base até") + "</span>" +
    "<span>Alíquota %</span>" + (tipo === "IRRF" ? "<span>Parcela a deduzir</span>" : "") + "</div>" +
    linhas.map(function (f, i) {
      // `ate: null` é a última faixa do IRRF ("acima de"), que não tem teto.
      var ate = f.ate === null ? "" : (f.ate === "" ? "" : emReais(f.ate));
      // O cabeçalho da grade orienta quem enxerga; quem usa leitor de tela
      // precisa do rótulo no próprio campo, com o número da faixa — senão
      // ouve "campo de edição, número" dez vezes seguidas.
      var n = i + 1;
      var rotuloAte = (tipo === "INSS" ? "Faixa " : "Base até, faixa ") + n;
      return '<div class="faixa-linha" role="group" aria-label="Faixa ' + n + '">' +
        '<input type="number" step="0.01" min="0" id="fx-ate-' + i +
        '" aria-label="' + rotuloAte + '" value="' + ate +
        '" placeholder="' + (tipo === "IRRF" ? "vazio = acima de tudo" : "0,00") + '">' +
        '<input type="number" step="0.01" min="0" id="fx-aliq-' + i +
        '" aria-label="Alíquota da faixa ' + n + ', em porcento" value="' +
        (f.aliquota === "" ? "" : f.aliquota) + '" placeholder="0">' +
        (tipo === "IRRF"
          ? '<input type="number" step="0.01" min="0" id="fx-ded-' + i +
            '" aria-label="Parcela a deduzir da faixa ' + n + '" value="' + emReais(f.parcelaDeduzir) + '">'
          : "") +
        "</div>";
    }).join("") +
    '<p class="dica">Deixe a linha em branco para descartá-la. No IRRF, a faixa sem valor em "base até" é a última — a de alíquota máxima.</p></div>';
}

function lerFaixas(tipo, quantidade) {
  var faixas = [];
  for (var i = 0; i < quantidade; i++) {
    var ate = U.el("fx-ate-" + i), aliq = U.el("fx-aliq-" + i);
    if (!ate || !aliq) continue;
    var textoAte = ate.value.trim(), textoAliq = aliq.value.trim();
    // Linha inteiramente vazia: descartada. No IRRF, "até" vazio com alíquota
    // preenchida é a faixa final, que vale para tudo acima.
    if (textoAte === "" && textoAliq === "") continue;
    var faixa = {
      ate: textoAte === "" ? null : L.reais(parseFloat(textoAte) || 0),
      aliquota: parseFloat(textoAliq) || 0
    };
    if (tipo === "IRRF") {
      var ded = U.el("fx-ded-" + i);
      faixa.parcelaDeduzir = ded ? L.reais(parseFloat(ded.value) || 0) : 0;
    }
    faixas.push(faixa);
  }
  // Ordem importa no motor: ele percorre de baixo para cima. A faixa sem teto
  // vai por último, sempre.
  faixas.sort(function (a, b) {
    if (a.ate === null) return 1;
    if (b.ate === null) return -1;
    return a.ate - b.ate;
  });
  return faixas;
}

function editorTabela(tabela) {
  var tipo = tabela.tipo;
  var novo = !tabela.id;
  var campos = tipo === "INSS"
    ? [{ id: "teto", rotulo: "Teto de contribuição", tipo: "moeda", obrigatorio: true,
         dica: "Salário de contribuição máximo da portaria." }]
    : [{ id: "porDependente", rotulo: "Dedução por dependente", tipo: "moeda", obrigatorio: true, par: true },
       { id: "simplificado", rotulo: "Desconto simplificado", tipo: "moeda", obrigatorio: true }];

  var base = [
    { id: "inicio", rotulo: "Vigente a partir de (AAAA-MM)", obrigatorio: true, par: true,
      dicaCampo: "AAAA-MM" },
    { id: "fim", rotulo: "Vigente até (AAAA-MM)", dicaCampo: "Vazio = sem prazo final" }
  ].concat(campos, [
    { id: "fonte", rotulo: "Ato oficial que fundamenta", obrigatorio: true,
      dica: "Portaria, lei ou decreto — é o que aparece na memória de cálculo de cada holerite." }
  ]);

  var quantidade = tabela.faixas.length + 1;

  U.abrirModal({
    titulo: (novo ? "Cadastrar tabela de " : "Tabela de ") + tipo,
    sub: novo ? "conferir contra o ato oficial antes de usar" : vigenciaTexto(tabela),
    largo: true,
    corpo: U.formularioHtml(base, {
      inicio: tabela.inicio, fim: tabela.fim || "", fonte: tabela.fonte || "",
      teto: tabela.teto ? emReais(tabela.teto) : "",
      porDependente: tabela.porDependente ? emReais(tabela.porDependente) : "",
      simplificado: tabela.simplificado ? emReais(tabela.simplificado) : ""
    }) + faixasHtml(tipo, tabela.faixas) +
      '<div class="erros-tabela oculto" id="erros-tabela" role="alert"></div>',
    acoes: [
      { rotulo: "Cancelar", aoClicar: U.fecharModal },
      { rotulo: novo ? "Cadastrar" : "Salvar alterações", classe: "primario", aoClicar: function () {
        var v = U.lerFormulario(base);
        if (!v) return;
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v.inicio)) {
          U.avisar("A vigência inicial precisa estar no formato AAAA-MM. Ex.: 2026-01.");
          return;
        }
        if (v.fim && !/^\d{4}-(0[1-9]|1[0-2])$/.test(v.fim)) {
          U.avisar("A vigência final precisa estar no formato AAAA-MM.");
          return;
        }
        if (v.fim && v.fim < v.inicio) {
          U.avisar("A vigência final não pode ser antes da inicial.");
          return;
        }
        if (L.USA_BACKEND) {
          if (tabela.id) { U.avisar("Tabela já gravada não se edita: cadastre uma nova vigência."); return; }
          L.api.post("/api/tabelas/" + tipo.toLowerCase(), {
            inicio: v.inicio, fim: v.fim, fonte: v.fonte, faixas: lerFaixas(tipo, quantidade), teto: v.teto,
            porDependente: v.porDependente, simplificado: v.simplificado,
            // O redutor do IRRF (quando a tabela anterior tinha) segue para a nova.
            isencaoTotalAte: tabela.isencaoTotalAte, reducaoAte: tabela.reducaoAte,
            reducaoBase: tabela.reducaoBase, reducaoFator: tabela.reducaoFator
          }).then(function () {
            recarregarTabelas("Tabela cadastrada. Falta conferir contra o ato oficial para a folha poder fechar.");
          }).catch(function (erro) {
            var alvo = U.el("erros-tabela");
            if (alvo) { alvo.innerHTML = "<strong>" + U.esc(erro.message || "Não foi possível salvar.") + "</strong>"; alvo.classList.remove("oculto"); }
          });
          return;
        }
        var r = L.salvarTabela({
          id: tabela.id, tipo: tipo, inicio: v.inicio, fim: v.fim, fonte: v.fonte,
          faixas: lerFaixas(tipo, quantidade), teto: v.teto,
          porDependente: v.porDependente, simplificado: v.simplificado
        });
        if (!r.ok) {
          // A validação é o ponto do exercício: mostrar tudo de uma vez evita
          // o RH corrigir uma linha, salvar, e descobrir a próxima.
          var alvo = U.el("erros-tabela");
          if (alvo) {
            alvo.innerHTML = "<strong>Confira antes de salvar:</strong><ul>" +
              r.problemas.map(function (p) { return "<li>" + U.esc(p) + "</li>"; }).join("") + "</ul>";
            alvo.classList.remove("oculto");
            alvo.scrollIntoView({ block: "nearest" });
          }
          return;
        }
        U.fecharModal();
        U.avisar(r.encerradas.length
          ? "Tabela salva. A anterior foi encerrada em " + L.competenciaBR(r.encerradas[0].fim) +
            " para não haver dois valores no mesmo mês."
          : "Tabela salva. Falta conferir contra o ato oficial para a folha poder fechar.");
        T.renderizar();
      } }
    ]
  });
}

T.acoes["nova-tabela"] = function () {
  U.abrirModal({
    titulo: "Cadastrar tabela",
    sub: "de qual imposto?",
    corpo: '<p class="dica" style="margin-bottom:14px">A nova tabela parte da última cadastrada.</p>',
    acoes: [
      { rotulo: "Cancelar", aoClicar: U.fecharModal },
      ...(L.USA_BACKEND ? [{ rotulo: "Salário mínimo", aoClicar: function () { U.fecharModal(); T.acoes["novo-salario-minimo"](); } }] : []),
      { rotulo: "IRRF", aoClicar: function () { U.fecharModal(); abrirNova("IRRF"); } },
      { rotulo: "INSS", classe: "primario", aoClicar: function () { U.fecharModal(); abrirNova("INSS"); } }
    ]
  });
};

/** Abre o editor já com a estrutura da tabela mais recente do mesmo tipo. */
function abrirNova(tipo) {
  var anterior = L.estado.tabelas
    .filter(function (t) { return t.tipo === tipo; })
    .sort(function (a, b) { return b.inicio.localeCompare(a.inicio); })[0];
  var modelo = anterior
    ? JSON.parse(JSON.stringify(anterior))
    : { tipo: tipo, faixas: [], teto: 0, porDependente: 0, simplificado: 0 };
  delete modelo.id;
  modelo.tipo = tipo;
  // Sugere o mês seguinte ao fim da vigente; sem fim, janeiro do ano seguinte
  // ao dela (a vigente sem fim precisa ser encerrada antes, e o aviso de
  // sobreposição explica isso se for o caso).
  modelo.inicio = anterior && anterior.fim
    ? L.somarMeses(anterior.fim.slice(0, 7), 1)
    : anterior ? String(Number(anterior.inicio.slice(0, 4)) + 1) + "-01"
    : String(Number(L.competenciaAtual().slice(0, 4))) + "-01";
  modelo.fim = "";
  modelo.fonte = "";
  editorTabela(modelo);
}

T.acoes["editar-tabela"] = function (id) {
  var t = L.buscarPorId("tabelas", id);
  if (!t) return;
  var s = situacaoTabela(t);
  var faixas = t.tipo === "INSS"
    ? U.tabelaHtml([
        { rotulo: "Faixa até", conteudo: function (x) { return L.brl(x.ate); } },
        { rotulo: "Alíquota", direita: true, conteudo: function (x) { return x.aliquota + "%"; } }
      ], t.faixas.map(function (x, i) { return Object.assign({ id: "f" + i }, x); }))
    : U.tabelaHtml([
        { rotulo: "Base até", conteudo: function (x) { return x.ate === null ? "acima" : L.brl(x.ate); } },
        { rotulo: "Alíquota", direita: true, conteudo: function (x) { return x.aliquota + "%"; } },
        { rotulo: "Parcela a deduzir", direita: true, conteudo: function (x) { return L.brl(x.parcelaDeduzir); } }
      ], t.faixas.map(function (x, i) { return Object.assign({ id: "f" + i }, x); }));

  var acoes = [{ rotulo: "Fechar", aoClicar: U.fecharModal }];
  // Apagar só é oferecido quando é seguro: tabela que sustentou fechamento
  // fica, como o `ON DELETE RESTRICT` do banco.
  if (!L.tabelaEmUsoPorFechamento(t.id)) {
    acoes.push({ rotulo: "Excluir", classe: "perigo", aoClicar: function () {
      U.fecharModal();
      U.confirmar({
        titulo: "Excluir a tabela de " + t.tipo + "?",
        texto: "Vigência " + vigenciaTexto(t) + ". Se nenhuma outra tabela cobrir esses meses, " +
          "a folha deles passa a calcular imposto zero e trava o fechamento.",
        rotulo: "Excluir",
        aoConfirmar: function () {
          L.excluirTabela(t.id);
          U.avisar("Tabela excluída.");
          T.renderizar();
        }
      });
    } });
  }
  acoes.push({ rotulo: "Duplicar para outro exercício", aoClicar: function () {
    U.fecharModal();
    var copia = L.duplicarTabela(t.id, String(Number(t.inicio.slice(0, 4)) + 1) + "-01", null);
    if (!copia) {
      U.avisar("Já existe tabela de " + t.tipo + " para todos os meses do exercício seguinte. Edite a existente.");
      return;
    }
    T.renderizar();
    editorTabela(copia);
  } });
  acoes.push({ rotulo: "Editar valores", aoClicar: function () { U.fecharModal(); editorTabela(t); } });
  if (!t.conferida) {
    acoes.push({ rotulo: "Confirmo que conferi", classe: "primario", aoClicar: function () {
      if (L.USA_BACKEND) {
        L.api.post("/api/tabelas/" + t.tipo.toLowerCase() + "/" + t.id + "/conferir").then(function () {
          T._tabelasCarregadas = false;
          U.fecharModal();
          U.avisar("Tabela conferida. A folha desta vigência já pode ser fechada pela Direção.");
          carregarTabelasDaApi();
        }).catch(function (erro) {
          U.avisar(erro.message || "Não foi possível confirmar a tabela.");
        });
        return;
      }
      L.conferirTabela(t.id, L.estado.usuario);
      U.fecharModal();
      U.avisar("Tabela conferida. A folha desta vigência já pode ser fechada pela Direção.");
      T.renderizar();
    } });
  }

  U.abrirModal({
    titulo: "Tabela de " + t.tipo,
    sub: vigenciaTexto(t),
    largo: true,
    corpo:
      '<div class="ficha"><div class="ficha-item"><dt>Situação</dt><dd><span class="pastilha ' + s.chave + '">' +
      s.rotulo + "</span></dd></div>" +
      '<div class="ficha-item"><dt>Ato oficial</dt><dd>' + U.esc(t.fonte || "—") + "</dd></div>" +
      (t.conferida
        ? '<div class="ficha-item"><dt>Conferida por</dt><dd>' + U.esc(t.conferidaPor) + "</dd></div>" +
          '<div class="ficha-item"><dt>Em</dt><dd>' + L.dataBR(t.conferidaEm) + "</dd></div>"
        : "") +
      (t.tipo === "INSS"
        ? '<div class="ficha-item"><dt>Teto</dt><dd class="num">' + L.brl(t.teto) + "</dd></div>"
        : '<div class="ficha-item"><dt>Por dependente</dt><dd class="num">' + L.brl(t.porDependente) + "</dd></div>" +
          '<div class="ficha-item"><dt>Simplificado</dt><dd class="num">' + L.brl(t.simplificado) + "</dd></div>") +
      "</div>" +
      (t.conferida ? "" : '<div class="aviso-tela" style="margin-top:16px"><span aria-hidden="true">▲</span><div>' +
        "<strong>Confira cada faixa antes de confirmar.</strong> A confirmação fica registrada no seu nome.</div></div>") +
      '<h3 style="font-size:var(--t-2);margin:18px 0 8px">Faixas</h3>' + faixas,
    acoes: acoes
  });
};

/** Atalho antigo do checklist: leva para a tela, que agora é o lugar certo. */
T.acoes["conferir-tabelas"] = function () { T.ir("tabelas"); };

/** A convenção mais recente de cada categoria — é dela que se parte para renovar. */
function ultimaPorCategoria(ccts) {
  var por = {};
  ccts.forEach(function (c) { if (!por[c.categoria] || c.inicio > por[c.categoria].inicio) por[c.categoria] = c; });
  return Object.keys(por).sort().map(function (k) { return por[k]; });
}

/** Mês seguinte a uma data AAAA-MM-DD, em AAAA-MM. */
function mesSeguinte(data) {
  if (!data) return "";
  return L.somarMeses(data.slice(0, 7), 1);
}

function recarregarTabelas(aviso) {
  T._tabelasCarregadas = false;
  U.fecharModal();
  U.avisar(aviso);
  carregarTabelasDaApi();
}

T.acoes["novo-salario-minimo"] = function () {
  var ultimo = (L.estado.salarioMinimo || []).slice().sort(function (a, b) { return b.inicio.localeCompare(a.inicio); })[0];
  U.abrirFormulario({
    titulo: "Cadastrar salário mínimo",
    campos: [
      { id: "inicio", rotulo: "Vigente a partir de (AAAA-MM)", obrigatorio: true, par: true, dicaCampo: "AAAA-MM",
        padrao: ultimo && ultimo.fim ? mesSeguinte(ultimo.fim) : "" },
      { id: "fim", rotulo: "Vigente até (AAAA-MM)", dicaCampo: "Vazio = sem prazo final" },
      { id: "valor", rotulo: "Valor", tipo: "moeda", obrigatorio: true, par: true },
      { id: "fonte", rotulo: "Fonte (decreto ou portaria)", obrigatorio: true }
    ],
    rotuloSalvar: "Cadastrar",
    aoSalvar: function (v) {
      L.api.post("/api/tabelas/salario-minimo", { inicio: v.inicio, fim: v.fim, valor: v.valor, fonte: v.fonte })
        .then(function () { recarregarTabelas("Salário mínimo cadastrado. Falta confirmar para a folha poder fechar."); })
        .catch(function (erro) { U.avisar(erro.message || "Não foi possível cadastrar."); });
    }
  });
};

T.acoes["conferir-salario-minimo"] = function (id) {
  var m = (L.estado.salarioMinimo || []).filter(function (x) { return x.id === id; })[0];
  if (!m) return;
  U.confirmar({
    titulo: "Confirmar salário mínimo de " + L.brl(m.valor) + "?",
    texto: "Confira o valor com o ato oficial (" + (m.fonte || "sem fonte") + "). A confirmação fica registrada no seu nome.",
    rotulo: "Confirmo que conferi",
    aoConfirmar: function () {
      L.api.post("/api/tabelas/salario-minimo/" + id + "/conferir")
        .then(function () { recarregarTabelas("Salário mínimo conferido."); })
        .catch(function (erro) { U.avisar(erro.message || "Não foi possível confirmar."); });
    }
  });
};

T.acoes["renovar-cct"] = function (id, alvo) {
  var nome = alvo && alvo.dataset ? alvo.dataset.nome : "";
  var fimAtual = alvo && alvo.dataset ? alvo.dataset.fim : "";
  U.abrirFormulario({
    titulo: "Renovar CCT — " + nome,
    sub: "Copia todos os percentuais da convenção atual para a nova vigência.",
    campos: [
      { id: "inicio", rotulo: "Nova vigência a partir de (AAAA-MM)", obrigatorio: true, par: true, dicaCampo: "AAAA-MM",
        padrao: mesSeguinte(fimAtual) },
      { id: "fim", rotulo: "Até (AAAA-MM)", dicaCampo: "AAAA-MM",
        padrao: fimAtual ? L.somarMeses(fimAtual.slice(0, 7), 12) : "" }
    ],
    rotuloSalvar: "Renovar",
    aoSalvar: function (v) {
      L.api.post("/api/tabelas/cct/" + id + "/renovar", { inicio: v.inicio, fim: v.fim })
        .then(function () { recarregarTabelas("Convenção renovada. Confira os percentuais e confirme para liberar a folha."); })
        .catch(function (erro) { U.avisar(erro.message || "Não foi possível renovar."); });
    }
  });
};

T.acoes["conferir-cct"] = function (id, alvo) {
  var nome = alvo && alvo.dataset ? alvo.dataset.nome : "";
  U.abrirModal({
    titulo: "Confirmar CCT — " + U.esc(nome),
    sub: "Convenção coletiva de trabalho",
    corpo: '<div class="aviso-tela" style="margin:0"><span aria-hidden="true">▲</span><div>' +
      "<strong>Confira os percentuais com a convenção assinada.</strong> A confirmação fica registrada no seu nome e libera o fechamento.</div></div>",
    acoes: [
      { rotulo: "Cancelar", aoClicar: U.fecharModal },
      { rotulo: "Confirmo que conferi", classe: "primario", aoClicar: function () {
        if (!L.USA_BACKEND) { U.fecharModal(); return; }
        L.api.post("/api/tabelas/cct/" + id + "/conferir").then(function () {
          T._tabelasCarregadas = false;
          U.fecharModal();
          U.avisar("Convenção coletiva conferida.");
          carregarTabelasDaApi();
        }).catch(function (erro) {
          U.avisar(erro.message || "Não foi possível confirmar a convenção coletiva.");
        });
      } }
    ]
  });
};

// ---------------------------------------------------------------- acesso

(function () {
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function erro(id, mensagem) {
    var campo = U.el(id), alvo = U.el("erro-" + id);
    if (!alvo) return false;
    if (mensagem) {
      alvo.textContent = mensagem; alvo.classList.remove("oculto");
      campo.setAttribute("aria-invalid", "true");
      return false;
    }
    alvo.classList.add("oculto"); campo.removeAttribute("aria-invalid");
    return true;
  }

  function iniciais(nome) {
    var partes = nome.trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return "—";
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  /**
   * Carrega os professores importados da planilha da escola, se o build os
   * incluiu. Feito depois do login para que a trilha de auditoria registre
   * quem estava na sessão quando a carga aconteceu.
   */
  function carregarDadosReais() {
    if (!L.DADOS_REAIS) return;
    var primeiraCarga = L.estado.funcionarios.length === 0;
    // A sincronização cria quem falta, completa o que mudou na planilha e
    // desliga duplicata — serve tanto para a primeira carga quanto para
    // quem já tinha feito login antes de a planilha mudar.
    L.sincronizarCadastro();
    if (primeiraCarga) L.semearObservacoes();
  }

  /**
   * Só existe com `L.USA_BACKEND` ligado. Substitui `carregarDadosReais()`
   * (que lia `dados-reais.js` embutido no arquivo) por dado que vem do
   * banco de verdade — o mesmo `L.estado.funcionarios` que o resto do
   * sistema já lê, só que populado pela API em vez de planilha embutida.
   * Falhar aqui não trava o login: melhor entrar com a folha vazia e um
   * aviso do que a pessoa achar que o acesso está quebrado.
   */
  /**
   * `perfis` é lista no servidor (pensado para acumular papel no futuro); a
   * tela hoje entende um perfil só — o primeiro da lista é o que vale.
   * `administrador`/`extras` (delegação pontual) ainda não existem do lado
   * do servidor: chegam como padrão até lá ganhar essas colunas.
   */
  function registroDaSessao(sessao) {
    return {
      id: sessao.userId, nome: sessao.nome, email: sessao.email,
      perfil: (sessao.perfis && sessao.perfis[0]) || "CONSULTA",
      perfis: sessao.perfis || [],
      administrador: false, extras: [], ativo: true
    };
  }

  function carregarFuncionariosDaApi() {
    return L.recarregarFuncionarios();
  }

  /**
   * A sessão nasce do registro no diretório, não do que foi digitado no
   * formulário — é isso que impede alguém reabrir "Criar minha conta" com o
   * mesmo e-mail e escolher um perfil mais poderoso da segunda vez.
   */
  function entrarComRegistro(registro) {
    L.estado.usuario = {
      id: registro.id, nome: registro.nome, email: registro.email,
      perfil: registro.perfil, perfis: registro.perfis || [registro.perfil],
      administrador: !!registro.administrador,
      extras: registro.extras || []
    };
    L.persistir();
    U.el("app-nome").textContent = registro.nome;
    U.el("app-perfil").textContent = L.estado.usuario.perfis
      .map(function (p) { return T.PERFIS[p] ? T.PERFIS[p].nome : p; }).join(" + ");
    U.el("app-avatar").textContent = iniciais(registro.nome);
    U.el("app-alcada").textContent = L.brlAlcada(registro.perfil);
    U.el("tela-acesso").classList.add("oculto");
    U.el("tela-app").classList.remove("oculto");
    if (U.pararAtomo) U.pararAtomo();
    T.carregarConfiguracoes();
    T.montarCapsulaFixa();
    T.iniciarTempoReal();
    // Só desenha o dashboard depois que os funcionários chegam da API — sem
    // isso a primeira pintura mostra `L.estado.funcionarios = []` (valor
    // inicial) e pisca vazio até a resposta chegar.
    (L.USA_BACKEND ? carregarFuncionariosDaApi() : Promise.resolve().then(carregarDadosReais))
      .then(function () { T.ir("dashboard"); });
  }

  var formEntrar = U.el("form-entrar"), formCriar = U.el("form-criar");
  var abaEntrar = U.el("aba-entrar"), abaCriar = U.el("aba-criar");
  if (!L.USA_BACKEND && L.DADOS_REAIS && L.DADOS_REAIS.demonstracao) {
    var instrucao = formEntrar.querySelector("p");
    if (instrucao) instrucao.textContent = "Demonstração: entre com qualquer e-mail e senha.";
  }

  function trocarAba(paraCriar) {
    abaEntrar.setAttribute("aria-selected", String(!paraCriar));
    abaCriar.setAttribute("aria-selected", String(paraCriar));
    formEntrar.hidden = paraCriar;
    formCriar.hidden = !paraCriar;
  }
  abaEntrar.addEventListener("click", function () { trocarAba(false); });
  abaCriar.addEventListener("click", function () { trocarAba(true); });

  // Com backend de verdade não existe autocadastro: conta se cria com
  // `npm run semear` (a primeira, a Direção) ou pelo Controle de Acesso
  // depois — nunca escolhendo o próprio perfil numa tela pública. Some a
  // barra de abas inteira, não só "Criar minha conta" — com uma opção só
  // sobrando, a aba "Entrar" ficava repetindo o botão "Entrar" do
  // formulário logo abaixo, parecendo duplicado.
  if (L.USA_BACKEND && abaCriar && abaCriar.parentElement) {
    abaCriar.parentElement.hidden = true;
  }

  formEntrar.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var email = U.el("ent-email").value.trim();
    var senha = U.el("ent-senha").value;
    var ok = erro("ent-email", EMAIL.test(email) ? "" : "Informe um e-mail válido.");
    ok = erro("ent-senha", senha.length ? "" : "Informe a sua senha.") && ok;
    if (!ok) return;

    if (L.USA_BACKEND) {
      L.api.post("/api/acesso/entrar", { email: email, senha: senha })
        .then(function () { return L.api.get("/api/acesso/eu"); })
        .then(function (sessao) { entrarComRegistro(registroDaSessao(sessao)); })
        .catch(function (e) {
          erro("ent-senha", e.status === 401 ? "E-mail ou senha inválidos." : e.message);
        });
      return;
    }

    // Modo demonstração (sem servidor): não há verificação de senha. Mas o
    // perfil vem do diretório local, não do que a pessoa digitar — sem
    // isso, "Entrar" seria uma porta para qualquer um se declarar Direção.
    var registro = L.usuarioPorEmail(email);
    // Na demonstração pública não existe conta prévia: quem abre o link entra
    // com qualquer e-mail. A primeira conta vira Direção, as demais Consulta.
    if (!registro && L.DADOS_REAIS && L.DADOS_REAIS.demonstracao) {
      var nomeDemo = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      registro = L.entrarOuCriarUsuario(nomeDemo + " (demo)", email,
        L.estado.usuarios.length === 0 ? "DIRECAO" : "CONSULTA").registro;
    }
    if (!registro) {
      erro("ent-email", "Não encontramos essa conta. Crie a sua na aba ao lado.");
      return;
    }
    if (registro.ativo === false) {
      erro("ent-email", "Este acesso foi desativado. Fale com um administrador do sistema.");
      return;
    }
    entrarComRegistro(registro);
  });

  var inSenha = U.el("nov-senha");
  inSenha.addEventListener("input", function () {
    var v = inSenha.value, nota = 0;
    if (v.length >= 8) nota++;
    if (/[a-zA-Z]/.test(v) && /\d/.test(v)) nota++;
    if (/[^\w\s]/.test(v)) nota++;
    if (v.length >= 14) nota++;
    U.todos(".forca i").forEach(function (barra, i) {
      barra.className = i < nota ? "on-" + Math.min(3, nota) : "";
    });
    U.el("forca-texto").textContent = ["Mínimo de 8 caracteres, com letra e número.",
      "Fraca — acrescente números ou letras.", "Razoável — um símbolo deixa melhor.",
      "Boa.", "Excelente."][nota];
  });

  formCriar.addEventListener("submit", function (ev) {
    ev.preventDefault();
    // Trava redundante e deliberada: a aba já vem escondida com `L.USA_BACKEND`
    // ligado (ver acima), mas o formulário continua no DOM e o listener
    // continua ligado a ele. Sem este `return`, reexibir a aba por fora do
    // fluxo normal (ex.: DevTools) ainda deixaria alguém se autodeclarar
    // "usuários.length === 0 → DIRECAO" — `L.estado.usuarios` nunca é
    // populado neste modo, então a condição sempre seria verdadeira. Fechar
    // aqui, na única porta de entrada do formulário, é o que garante que não
    // sobra caminho nenhum de autocadastro quando há backend de verdade.
    if (L.USA_BACKEND) return;
    var nome = U.el("nov-nome").value.trim();
    var email = U.el("nov-email").value.trim();
    var ok = erro("nov-nome", nome.split(/\s+/).filter(Boolean).length >= 2 ? "" : "Informe o nome e o sobrenome.");
    ok = erro("nov-email", EMAIL.test(email) ? "" : "Informe um e-mail válido.") && ok;
    if (inSenha.value.length < 8) {
      U.el("forca-texto").textContent = "A senha precisa de pelo menos 8 caracteres.";
      inSenha.setAttribute("aria-invalid", "true");
      ok = false;
    } else { inSenha.removeAttribute("aria-invalid"); }
    if (!ok) return;
    // Ninguém escolhe o próprio cargo aqui: quem cria a conta entra só com
    // leitura (ou Direção, se for a primeira conta do sistema — sem isso
    // ninguém teria como abrir o Controle de Acesso da primeira vez). Definir
    // o perfil de verdade é ato de quem delega, feito depois em Controle de
    // Acesso — não uma escolha de quem está se cadastrando.
    var perfilInicial = L.estado.usuarios.length === 0 ? "DIRECAO" : "CONSULTA";
    var resultado = L.entrarOuCriarUsuario(nome, email, perfilInicial);
    if (resultado.jaExistia) {
      U.avisar("Essa conta já existe. Entrando com o acesso já configurado.");
    }
    if (resultado.registro.ativo === false) {
      erro("nov-email", "Este e-mail já teve o acesso desativado. Fale com um administrador.");
      return;
    }
    entrarComRegistro(resultado.registro);
  });

  // Antes um botão solto na topbar; agora mora no popover do avatar
  // (T.montarMenuUsuario, em telas-a.js) — daqui só a ação em si.
  T.acoes["sair"] = function () {
    // Encerra o cookie no servidor mesmo sem esperar a resposta: a tela
    // não pode ficar travada por causa de uma rede lenta na hora de sair,
    // e o cookie httpOnly não some por conta própria se o servidor não
    // for avisado.
    if (L.USA_BACKEND) L.api.post("/api/acesso/sair").catch(function () {});
    L.estado.usuario = null;
    L.persistir();
    T.pararTempoReal();
    U.el("tela-app").classList.add("oculto");
    U.el("tela-acesso").classList.remove("oculto");
    trocarAba(false);
    formEntrar.reset(); formCriar.reset();
    if (U.retomarAtomo) U.retomarAtomo();
  };

  // ------------------------------------------------------------ busca global

  var busca = U.el("busca-global"), painel = U.el("busca-resultados");

  busca.addEventListener("input", function () {
    var achados = L.buscaGlobal(busca.value);
    if (achados.length === 0) { painel.classList.add("oculto"); return; }
    painel.innerHTML = achados.map(function (a) {
      return '<button class="busca-item" data-destino="' + a.destino + '" data-alvo="' + U.esc(a.alvo) + '">' +
        '<span class="onde">' + U.esc(a.onde) + "</span><br>" +
        U.esc(a.rotulo) + (a.extra ? ' <span class="secundario">' + U.esc(a.extra) + "</span>" : "") +
        "</button>";
    }).join("");
    painel.classList.remove("oculto");
    U.todos(".busca-item", painel).forEach(function (b) {
      b.addEventListener("click", function () {
        painel.classList.add("oculto");
        busca.value = "";
        T.ir(b.dataset.destino, b.dataset.alvo);
      });
    });
  });

  document.addEventListener("click", function (ev) {
    if (!painel.contains(ev.target) && ev.target !== busca) painel.classList.add("oculto");
  });

  U.iniciarAtomo();
  U.iniciarTema();

  // ------------------------------------------------------------ retomada
  //
  // Recupera o que ficou gravado no navegador. Se havia sessão aberta, entra
  // direto — quem usa o sistema todo dia não digita e-mail toda manhã.
  L.restaurar();
  if (L.USA_BACKEND) {
    // Quem manda aqui é o cookie httpOnly, não o que ficou salvo no
    // localStorage — confiar no cache local sem checar de novo deixaria a
    // tela dizer "logado" mesmo com a sessão do servidor já expirada. Só
    // entra direto se `/api/acesso/eu` confirmar a sessão de verdade.
    L.api.get("/api/acesso/eu").then(function (sessao) {
      entrarComRegistro(registroDaSessao(sessao));
    }).catch(function () {
      L.estado.usuario = null;
      L.persistir();
    });
  } else if (L.estado.usuario) {
    // Não exige que o restante do estado também tenha voltado: mesmo quando
    // uma virada de versão descarta a carga de demonstração, a conta de
    // acesso atravessa sozinha (ver L.restaurar) e essa pessoa não deveria
    // precisar se cadastrar de novo por causa disso.
    //
    // Confere contra o diretório de novo: se um administrador desativou esta
    // conta desde a última visita, a sessão guardada não deve mais entrar.
    var registroAtual = L.usuarioPorEmail(L.estado.usuario.email) || L.estado.usuario;
    if (registroAtual.ativo === false) {
      L.estado.usuario = null;
      L.persistir();
    } else if (T.PERFIS[registroAtual.perfil]) {
      entrarComRegistro(registroAtual);
    }
  }

  // Ponto de inspeção: permite conferir números e estado pelo console do
  // navegador sem abrir o código. Útil para auditar a folha contra a planilha.
  window.Hotel = { dominio: L, telas: T, interface: U };
})();
