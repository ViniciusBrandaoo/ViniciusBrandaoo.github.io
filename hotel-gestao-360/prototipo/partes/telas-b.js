/* ============================================================================
   Telas B: cadastros, financeiro, solicitações, aprovações e relatórios.
   ========================================================================== */

// ---------------------------------------------------------------- funcionários

/**
 * Nome do segmento encurtado para caber em coluna de tabela. Só encurta o que
 * tem forma óbvia de abreviar — nome desconhecido volta inteiro, em vez de
 * virar reticências no meio da palavra.
 */
T.MODULO_CURTO = {
  "Fundamental 1": "Fund. 1",
  "Fundamental 2": "Fund. 2",
  "Ensino Médio": "Médio",
  "Pré-Vestibular": "Pré-Vest."
};
T.moduloCurto = function (nome) { return T.MODULO_CURTO[nome] || nome; };

/** Nome para exibir em lista: "ADRIANA DE OLIVEIRA" vira "Adriana de Oliveira".
 * Só mexe em nome todo em maiúsculas; o cadastro fica como foi digitado. */
T.nomeExibicao = function (nome) {
  if (!nome || nome !== nome.toUpperCase()) return nome;
  var minusculas = { DE: 1, DA: 1, DO: 1, DAS: 1, DOS: 1, E: 1 };
  return nome.toLowerCase().split(/\s+/).map(function (p, i) {
    return i > 0 && minusculas[p.toUpperCase()] ? p : p.charAt(0).toUpperCase() + p.slice(1);
  }).join(" ");
};

T.CAMPOS_FUNCIONARIO = function (v) {
  var regime = (v && v.regime) || "MENSALISTA";
  var base = [
    { secao: "Identificação" },
    { id: "nome", rotulo: "Nome completo", obrigatorio: true },
    { id: "matricula", rotulo: "Matrícula", obrigatorio: true, par: true, dica: "A contabilidade não trabalha com código interno." },
    { id: "cpf", rotulo: "CPF", dica: "Cifrado no banco; nunca aparece em log." },
    { id: "cargo", rotulo: "Cargo", obrigatorio: true, par: true },
    // O setor atual da pessoa entra na lista mesmo que não seja um dos padrões: sem isso o
    // formulário trocava o setor por "Direção" ao salvar (ex.: "Aux. Gerência de Setor", "Gerente ADM").
    { id: "departamento", rotulo: "Setor", tipo: "select",
      opcoes: ["Direção", "Recepção", "Governança", "Alimentos e Bebidas", "Manutenção", "Financeiro", "Administrativo", "Reservas e Comercial", "Lazer"]
        .concat(v && v.departamento && ["Direção", "Recepção", "Governança", "Alimentos e Bebidas", "Manutenção", "Financeiro", "Administrativo", "Reservas e Comercial", "Lazer"].indexOf(v.departamento) === -1 ? [v.departamento] : []) },
    { id: "admissao", rotulo: "Data de admissão", tipo: "data", obrigatorio: true, par: true, padrao: L.hoje() },
    { id: "dependentes", rotulo: "Dependentes de IRRF", tipo: "numero", min: 0 },
    { fimSecao: true },
    { secao: "Remuneração" },
    // Estagiário ainda não tem tabela no banco real — oferecer a opção no
    // modo backend levaria a pessoa a preencher um formulário inteiro para o
    // servidor recusar no final. Prestador PJ/MEI já tem (migration 017,
    // `contratos_prestador`/`prestador_pagamentos`), sem contrato CLT nenhum.
    { id: "regime", rotulo: "Regime", tipo: "select", padrao: regime,
      opcoes: [{ valor: "MENSALISTA", rotulo: "Mensalista CLT — salário fixo" },
               { valor: "HORISTA_RELOGIO", rotulo: "Horista CLT — por hora batida" },
               { valor: "PRESTADOR_PJ", rotulo: "Prestador — MEI ou PJ" }].concat(L.USA_BACKEND ? [] : [
               { valor: "ESTAGIARIO", rotulo: "Estagiário — bolsa" }]),
      dica: L.USA_BACKEND
        ? "Trocar o regime remonta os campos abaixo. Estagiário ainda não tem cadastro nesta versão."
        : "Trocar o regime remonta os campos abaixo." }
  ];
  var ehCLT = regime === "HORISTA_AULA" || regime === "MENSALISTA" || regime === "HORISTA_RELOGIO";
  if (regime === "HORISTA_AULA") {
    base.push({ id: "valorHoraAula", rotulo: "Valor da hora-aula", tipo: "moeda", obrigatorio: true, par: true });
    base.push({ id: "aulasSemanais", rotulo: "Aulas por semana", tipo: "numero", obrigatorio: true, min: 1,
      dica: "Grade de até 40 aulas. O que passar disso entra em Aula extra / projeto. O mês é de 4,5 semanas (CLT art. 320 §1º)." });
    base.push({ id: "aulasProjeto", rotulo: "Aulas de projeto por semana", tipo: "numero", min: 0, meia: true,
      dica: "O que passa da grade de 40 aulas. Pago pela mesma hora-aula, ×4,5 semanas, na folha do mês aberto." });
  } else if (regime === "MENSALISTA") {
    base.push({ id: "salarioBase", rotulo: "Salário mensal", tipo: "moeda", obrigatorio: true, par: true });
    base.push({ id: "cargaHoraria", rotulo: "Carga semanal (horas)", tipo: "numero", obrigatorio: true, min: 1 });
  } else if (regime === "HORISTA_RELOGIO") {
    // Não-docente pago por hora batida (recepção, portaria, manutenção) —
    // regime diferente de mensalista (não tem salário fixo) e de professor
    // (não é hora-aula: o divisor do mês é outro, 5 semanas, não 4,5).
    base.push({ id: "valorHora", rotulo: "Valor da hora", tipo: "moeda", obrigatorio: true, par: true });
    base.push({ id: "horasSemanais", rotulo: "Horas por semana", tipo: "numero", obrigatorio: true, min: 1,
      dica: "O mês deste regime é de 5 semanas, não as 4,5 do colaborador." });
  } else if (regime === "ESTAGIARIO") {
    // Lei 11.788/2008: não é vínculo empregatício — bolsa e auxílio, não
    // salário; sem INSS, sem FGTS, sem 13º nem férias.
    base.push({ id: "bolsa", rotulo: "Bolsa-auxílio mensal", tipo: "moeda", obrigatorio: true, par: true });
    base.push({ id: "auxilioTransporte", rotulo: "Auxílio-transporte mensal", tipo: "moeda", min: 0 });
    base.push({ id: "instituicaoEnsino", rotulo: "Instituição de ensino", obrigatorio: true, par: true });
    base.push({ id: "supervisor", rotulo: "Supervisor do estágio" });
    base.push({ id: "dataFimPrevista", rotulo: "Fim previsto do estágio", tipo: "data", obrigatorio: true, par: true,
      dica: "Limite legal de 2 anos na mesma concedente (art. 11), exceto estagiário com deficiência." });
  } else {
    // Prestador não é folha: nota fiscal, retenções e pagamento.
    base.push({ id: "servico", rotulo: "Serviço prestado", obrigatorio: true, par: true,
      dica: "Ex.: \"Consultoria de engenharia civil\". Decide se cabe CPP no MEI (art. 18-B)." });
    base.push({ id: "enquadramento", rotulo: "Enquadramento", tipo: "select",
      opcoes: [{ valor: "MEI", rotulo: "MEI" },
               { valor: "PJ_SIMPLES", rotulo: "PJ — Simples Nacional" },
               { valor: "PJ_LUCRO_PRESUMIDO", rotulo: "PJ — Lucro Presumido" }] });
    base.push({ id: "cnpj", rotulo: "CNPJ", par: true,
      dica: "Pode deixar em branco e completar depois — o cadastro funciona sem." });
    base.push({ id: "valorMensal", rotulo: "Valor mensal da nota", tipo: "moeda", par: true,
      dica: "Pode deixar em branco e completar depois." });
    base.push({ id: "servicoComCpp", rotulo: "Serviço gera CPP para o hotel?", tipo: "select",
      opcoes: [{ valor: "NAO", rotulo: "Não" }, { valor: "SIM", rotulo: "Sim" }],
      dica: "Só hidráulica, eletricidade, pintura, alvenaria, carpintaria e manutenção de veículos geram CPP de 20% para o hotel." });
    if (L.USA_BACKEND) {
      base.push({ id: "empresaCodigo", rotulo: "Empresa pagadora", tipo: "select", par: true,
        opcoes: Object.keys(L.EMPRESAS).map(function (k) { return { valor: k, rotulo: L.EMPRESAS[k].nome }; }) });
    }
    base.push({ id: "descontosFixos", rotulo: "Descontos fixos mensais", tipo: "textarea",
      dicaCampo: "Uma por linha — ex.: Mensalidade: 248,10",
      dica: "Só o que é igual todo mês (Material, Mensalidade): repete sozinho. Cantina e Plano de saúde mudam a cada mês: lance em “Lançar movimento” na folha do mês." });
    if (L.USA_BACKEND) {
      base.push({ id: "temTicket", rotulo: "Recebe Ticket (vale-alimentação/refeição)?", tipo: "select",
        padrao: "NAO", par: true, opcoes: [{ valor: "NAO", rotulo: "Não" }, { valor: "SIM", rotulo: "Sim" }] });
      base.push({ id: "valorTicket", rotulo: "Valor do Ticket", tipo: "moeda", min: 0,
        dica: "Pago à parte, no cartão: não entra na nota fiscal nem nas retenções." });
    }
    base.push({ fimSecao: true });
    // Estas quatro perguntas são o que separa prestador autônomo de empregado
    // disfarçado. Errar aqui é passivo trabalhista, não erro de cálculo.
    base.push({ secao: "Checagem de vínculo" });
    base.push({ id: "temHorarioFixo", rotulo: "Cumpre horário fixo?", tipo: "select", par: true,
      opcoes: [{ valor: "NAO", rotulo: "Não" }, { valor: "SIM", rotulo: "Sim" }] });
    base.push({ id: "temExclusividade", rotulo: "Presta serviço só para o hotel?", tipo: "select",
      opcoes: [{ valor: "NAO", rotulo: "Não" }, { valor: "SIM", rotulo: "Sim" }] });
    base.push({ id: "temSubordinacao", rotulo: "Recebe ordens diretas?", tipo: "select", par: true,
      opcoes: [{ valor: "NAO", rotulo: "Não" }, { valor: "SIM", rotulo: "Sim" }] });
    base.push({ id: "substituivel", rotulo: "Pode mandar outro no lugar?", tipo: "select",
      opcoes: [{ valor: "SIM", rotulo: "Sim" }, { valor: "NAO", rotulo: "Não" }] });
  }
  if (ehCLT) {
    base.push({ fimSecao: true });
    base.push({ secao: "Tipo de contrato" });
    base.push({ id: "tipoContrato", rotulo: "Tipo de contrato", tipo: "select", padrao: "CLT", par: true,
      opcoes: [{ valor: "CLT", rotulo: "CLT comum (prazo indeterminado)" },
               { valor: "APRENDIZ", rotulo: "Aprendiz" },
               { valor: "TEMPORARIO", rotulo: "Temporário (prazo determinado)" }],
      dica: "Aprendiz recolhe FGTS a 2%, não os 8% do CLT comum (Lei 8.036/90 art. 15 §7º)." });
    base.push({ id: "dataFimPrevista", rotulo: "Data prevista de término", tipo: "data",
      dica: "Obrigatória por lei em aprendiz (máx. 2 anos, CLT art. 428 §3º) e em contrato temporário." });
  }
  // Empresa pagadora e divisão CLT/Ticket/MEI só existem como coluna no banco
  // real (migration 010) — no protótipo local isso nunca teve tela própria,
  // só vinha pronto da planilha. `tem_clt` fica implícito (as três opções de
  // regime aqui JÁ são CLT); só Ticket e MEI perguntam, porque são o que de
  // fato varia de pessoa pra pessoa.
  if (L.USA_BACKEND && ehCLT) {
    base.push({ fimSecao: true });
    base.push({ secao: "Empresa e vínculo" });
    base.push({ id: "empresaCodigo", rotulo: "Empresa pagadora", tipo: "select", obrigatorio: true,
      opcoes: Object.keys(L.EMPRESAS).map(function (k) { return { valor: k, rotulo: L.EMPRESAS[k].nome }; }) });
    base.push({ id: "temTicket", rotulo: "Recebe parte como Ticket (vale-alimentação/refeição)?", tipo: "select",
      padrao: "NAO", par: true, opcoes: [{ valor: "NAO", rotulo: "Não" }, { valor: "SIM", rotulo: "Sim" }] });
    base.push({ id: "temMei", rotulo: "Recebe parte como MEI (nota fiscal PJ)?", tipo: "select",
      padrao: "NAO", opcoes: [{ valor: "NAO", rotulo: "Não" }, { valor: "SIM", rotulo: "Sim" }],
      dica: "Ver checklist de risco de vínculo antes de marcar — a divisão precisa refletir a prestação real." });
    base.push({ id: "valorTicket", rotulo: "Valor do Ticket (se dividido por canal)", tipo: "moeda", min: 0, par: true });
    base.push({ id: "valorMei", rotulo: "Valor do MEI (se dividido por canal)", tipo: "moeda", min: 0,
      dica: "Deixe em branco se só a bandeira importa, sem quebrar o valor por canal." });
  }
  base.push({ fimSecao: true });
  return base;
};

/**
 * Forma que a API real espera (`FuncionarioEntrada` em `servidor/repositorio.ts`)
 * — nomes com sufixo `Centavos` e só os campos que o banco de fato modela
 * hoje (três regimes CLT; Estagiário/Prestador PJ ficam de fora do formulário
 * quando `L.USA_BACKEND`, então nunca chegam aqui).
 */
function funcionarioParaApi(v) {
  // Campo de outro regime que ficou preenchido no formulário não vai junto.
  var mens = v.regime === "MENSALISTA", aula = v.regime === "HORISTA_AULA", rel = v.regime === "HORISTA_RELOGIO";
  return {
    nome: v.nome,
    cpf: v.cpf || undefined,
    matricula: v.matricula,
    cargo: v.cargo || undefined,
    departamento: v.departamento || undefined,
    dataAdmissao: v.admissao,
    regime: v.regime,
    dependentesIrrf: v.dependentes || 0,
    valorHoraAulaCentavos: aula ? (v.valorHoraAula || undefined) : undefined,
    aulasSemanais: aula ? (v.aulasSemanais || undefined) : undefined,
    salarioBaseCentavos: mens ? (v.salarioBase || undefined) : undefined,
    cargaHorariaSemanal: mens ? (v.cargaHoraria || undefined) : undefined,
    valorHoraCentavos: rel ? (v.valorHora || undefined) : undefined,
    horasSemanais: rel ? (v.horasSemanais || undefined) : undefined,
    // Só aparecem no formulário para os três regimes CLT (`ehCLT` em
    // `CAMPOS_FUNCIONARIO`) — `v.empresaCodigo` vem `undefined` para quem não
    // passou por essa seção, e o servidor trata ausência como "não mexe".
    empresaCodigo: v.empresaCodigo || undefined,
    temTicket: v.temTicket === "SIM",
    temMei: v.temMei === "SIM",
    // Sem a bandeira marcada o valor é zero (e vai zero de fato), senão tirar
    // o Ticket de alguém não surtia efeito: o valor antigo ficava.
    valorTicketCentavos: v.temTicket === "SIM" ? (v.valorTicket || 0) : 0,
    valorMeiCentavos: v.temMei === "SIM" ? (v.valorMei || 0) : 0
  };
}

/** Mesma ideia de `funcionarioParaApi`, mas para o formulário de Prestador
 * (`POST /api/funcionarios/prestador`, `FuncionarioPrestadorEntrada`). */
function descontosFixosDoTexto(texto) {
  // `{nome, valor}` — mesmo formato de `dados-colaboradores.js` e do que
  // `L.calcularPrestador` (front) já lê para montar a rubrica de desconto.
  return (texto || "").split("\n").map(function (linha) {
    // Aceita "Nome: R$ 266,85" e também "Nome R$ 266,85" (sem dois-pontos).
    var achou = linha.match(/^(.*?)\s*[:\-]?\s*(?:R\$\s*)?(\d[\d.]*(?:,\d{1,2})?)\s*$/);
    if (!achou) return null;
    var nome = achou[1].replace(/[:\-\s]+$/, "").trim();
    var bruto = parseFloat(achou[2].replace(/\./g, "").replace(",", "."));
    var valor = isNaN(bruto) ? 0 : L.reais(bruto);
    if (!nome || !valor) return null;
    return { nome: nome, valor: valor };
  }).filter(Boolean);
}

function funcionarioPrestadorParaApi(v) {
  return {
    nome: v.nome,
    cpf: v.cpf || undefined,
    matricula: v.matricula,
    cargo: v.cargo || undefined,
    departamento: v.departamento || undefined,
    dataAdmissao: v.admissao,
    enquadramento: v.enquadramento || "MEI",
    cnpj: v.cnpj || undefined,
    servico: v.servico,
    servicoComCppNoMei: v.servicoComCpp === "SIM",
    empresaCodigo: v.empresaCodigo || undefined,
    valorMensalCentavos: v.valorMensal || 0,
    descontosFixos: descontosFixosDoTexto(v.descontosFixos),
    temHorarioFixo: v.temHorarioFixo === "SIM",
    temExclusividade: v.temExclusividade === "SIM",
    temSubordinacaoDireta: v.temSubordinacao === "SIM",
    substituivelPorOutro: v.substituivel !== "NAO",
    temTicket: v.temTicket === "SIM",
    valorTicketCentavos: v.temTicket === "SIM" ? (v.valorTicket || 0) : 0
  };
}

T.acoes["novo-funcionario"] = function (id) {
  var atual = id ? L.buscarPorId("funcionarios", id) : null;
  function abrir(valores) {
    var campos = T.CAMPOS_FUNCIONARIO(valores);
    U.abrirFormulario({
      titulo: atual ? "Editar funcionário" : "Cadastrar funcionário",
      sub: atual ? atual.matricula : "",
      largo: true,
      campos: campos,
      valores: valores,
      aoSalvar: function (v) {
        if (v.regime === "PRESTADOR_PJ" && /cantina|plano|sa[uú]de/i.test(v.descontosFixos || "")) {
          U.avisar("Cantina e Plano de saúde não podem ficar em “Descontos fixos mensais”: eles se repetiriam todo mês. " +
            "Tire daqui e lance o valor do mês em Folha → Lançar movimento.");
          return;
        }
        v.status = "ATIVO";
        if (L.USA_BACKEND) {
          if (v.regime === "PRESTADOR_PJ") {
            if (atual && atual.regime !== "PRESTADOR_PJ") {
              // CLT que virou MEI: mesmo cadastro, vínculo novo a partir do mês aberto.
              L.api.post("/api/prestadores/" + atual.id + "/converter", funcionarioPrestadorParaApi(v))
                .then(function () { return L.recarregarFuncionarios(); })
                .then(function () {
                  U.fecharModal();
                  T.ir("funcionarios");
                  U.avisar("Agora é prestador PJ / MEI. O vínculo CLT terminou no mês anterior.");
                }).catch(function (erro) {
                  U.avisar(erro.message || "Não foi possível salvar.");
                });
              return;
            }
            if (atual) {
              var dadosPrestador = funcionarioPrestadorParaApi(v);
              L.api.patch("/api/prestadores/" + atual.id, {
                valorMensalCentavos: dadosPrestador.valorMensalCentavos,
                descontosFixos: dadosPrestador.descontosFixos,
                empresaCodigo: dadosPrestador.empresaCodigo,
                servico: dadosPrestador.servico,
                enquadramento: dadosPrestador.enquadramento,
                servicoComCppNoMei: dadosPrestador.servicoComCppNoMei,
                dataAdmissao: dadosPrestador.dataAdmissao,
                nome: dadosPrestador.nome,
                cpf: dadosPrestador.cpf,
                matricula: dadosPrestador.matricula,
                cargo: dadosPrestador.cargo,
                departamento: dadosPrestador.departamento,
                temTicket: dadosPrestador.temTicket,
                valorTicketCentavos: dadosPrestador.valorTicketCentavos
              }).then(function (resp) {
                return L.recarregarFuncionarios();
              }).then(function () {
                U.fecharModal();
                T.ir("funcionarios");
                U.avisar(resp && resp.aprovacao ? "Prestador atualizado. Pedido #" + resp.aprovacao.numero + " enviado para a Direção aprovar." : "Prestador atualizado.");
              }).catch(function (erro) {
                U.avisar(erro.message || "Não foi possível salvar.");
              });
              return;
            }
            L.api.post("/api/funcionarios/prestador", funcionarioPrestadorParaApi(v)).then(function () {
              return L.recarregarFuncionarios();
            }).then(function () {
              U.fecharModal();
              T.ir("funcionarios");
              U.avisar("Prestador cadastrado.");
            }).catch(function (erro) {
              U.avisar(erro.message || "Não foi possível salvar.");
            });
            return;
          }
          var corpo = funcionarioParaApi(v);
          var chamada = atual
            ? L.api.patch("/api/funcionarios/" + atual.id, corpo)
            : L.api.post("/api/funcionarios", corpo);
          var compProjeto = L.competenciaAberta();
          var projetoNovo = Number(v.aulasProjeto) || 0;
          var projetoAntes = atual ? (L.movimentoDe(atual.id, compProjeto).aulasExtrasSemanais || 0) : 0;
          chamada.then(function (resposta) {
            var idPessoa = atual ? atual.id : (resposta && resposta.id);
            // Aulas de projeto vão para o movimento do mês aberto (mesmo lugar do botão "Aula extra / projeto").
            if (corpo.regime === "HORISTA_AULA" && idPessoa && projetoNovo !== projetoAntes) {
              return L.api.patch("/api/movimentos/" + compProjeto + "/" + idPessoa, { aulasExtrasSemanais: projetoNovo })
                .then(function () { T._movimentosCarregadosPara = null; });
            }
          }).then(function () {
            return L.recarregarFuncionarios();
          }).then(function () {
            U.fecharModal();
            T.ir("funcionarios");
            U.avisar((atual ? "Cadastro atualizado." : "Funcionário cadastrado.") +
              (corpo.regime === "HORISTA_AULA" && Number(corpo.aulasSemanais) > 40
                ? " Atenção: a grade passa de 40 aulas — passe o excedente para Aula extra / projeto (botão no cadastro do colaborador)." : ""));
          }).catch(function (erro) {
            U.avisar(erro.message || "Não foi possível salvar.");
          });
          return;
        }
        if (atual) L.atualizar("funcionarios", atual.id, v);
        else L.criar("funcionarios", v);
        U.fecharModal();
        T.ir("funcionarios");
      },
      acoesExtras: []
    });
    // Trocar o regime remonta o formulário preservando o que já foi digitado.
    var sel = U.el("f-regime");
    if (sel) sel.addEventListener("change", function () {
      var parciais = {};
      campos.forEach(function (c) {
        if (c.secao || c.fimSecao) return;
        var campo = U.el("f-" + c.id);
        if (campo) parciais[c.id] = c.tipo === "moeda" && campo.value ? campo.value : campo.value;
      });
      parciais.regime = sel.value;
      if (parciais.valorHoraAula) parciais.valorHoraAula = parciais.valorHoraAula;
      abrir(parciais);
    });
  }
  abrir(atual ? Object.assign({}, atual, {
    valorHoraAula: atual.valorHoraAula ? (atual.valorHoraAula / 100).toFixed(2) : "",
    aulasProjeto: (L.movimentoDe(atual.id, L.competenciaAberta()).aulasExtrasSemanais) || "",
    salarioBase: atual.salarioBase ? (atual.salarioBase / 100).toFixed(2) : "",
    valorHora: atual.valorHora ? (atual.valorHora / 100).toFixed(2) : "",
    valorMensal: atual.valorMensal ? (atual.valorMensal / 100).toFixed(2) : "",
    bolsa: atual.bolsa ? (atual.bolsa / 100).toFixed(2) : "",
    auxilioTransporte: atual.auxilioTransporte ? (atual.auxilioTransporte / 100).toFixed(2) : "",
    valorTicket: atual.valorTicket ? (atual.valorTicket / 100).toFixed(2) : "",
    valorMei: atual.valorMei ? (atual.valorMei / 100).toFixed(2) : "",
    temTicket: atual.temTicket ? "SIM" : "NAO",
    temMei: atual.temMei ? "SIM" : "NAO",
    // Lista vinda da API vira uma linha por desconto no campo de texto.
    descontosFixos: Array.isArray(atual.descontosFixos)
      ? atual.descontosFixos.map(function (d) { return d.nome + ": " + L.brl(d.valor); }).join("\n")
      : (atual.descontosFixos || "")
  }) : { regime: "MENSALISTA", admissao: L.hoje() });
};

T.telas.funcionarios = function () {
  var termo = L.semAcento(T.filtros.funcionarios || "");
  var modulo = T.filtros.modulo || "";
  var vinculo = T.filtros.vinculo || "";
  var empresaFiltro = T.filtros.empresa || "";
  // Categoria vazia = todos. Professor e colaborador têm colunas diferentes;
  // a aba escolhe qual tabela faz sentido mostrar.
  var categoria = T.filtros.categoria || "";
  var lista = L.porNome(L.ativos()).filter(function (f) {
    var casaTermo = !termo ||
      L.semAcento(f.nome + " " + (f.cargo || "") + " " + (f.matricula || "")).indexOf(termo) !== -1;
    var casaModulo = !modulo || L.modulosDe(f).some(function (m) { return m.modulo === modulo; });
    var casaCategoria = !categoria || L.categoriaDe(f) === categoria;
    var casaVinculo = !vinculo || L.grupoFiltroDe(f) === vinculo;
    var casaEmpresa = !empresaFiltro || L.empresaDe(f) === empresaFiltro;
    return casaTermo && casaModulo && casaCategoria && casaVinculo && casaEmpresa;
  });
  var soProfessores = categoria === "PROFESSOR";
  var soColaboradores = categoria === "COLABORADOR";

  var html = T.cabecalho("Funcionários",
    "Cadastrar aqui alimenta folha, banco de horas e férias.",
    T.botaoNovo("novo-funcionario", "Cadastrar funcionário"));

  html += T.abasCategoria();
  // A conferência de aulas é assunto de professor; não polui a aba de
  // colaborador, que não tem carga por módulo.
  if (!soColaboradores && L.professores().length) html += T.resumoConferenciaHtml();

  var barra = '<div class="barra-ferramentas">' +
    '<input type="search" data-filtro="funcionarios" aria-label="Buscar funcionário por nome, cargo ou matrícula" placeholder="Buscar por nome, cargo ou matrícula" value="' + U.esc(T.filtros.funcionarios || "") + '">' +
    (soColaboradores || !L.professores().length ? "" :
      U.seletorRico({
        rotulo: "Filtrar por setor", valor: T.filtros.modulo || "",
        itens: [{ valor: "", rotulo: "Todos os setores" }].concat(
          L.MODULOS_ENSINO.map(function (m) { return { valor: m, rotulo: m }; })),
        atributos: { filtro: "modulo" }
      })) +
    // "Hoje quero pagar só os MEI": todo mundo que recebe MEI (MEI, CLT + MEI, CLT + Ticket + MEI)
    // fica no grupo "MEI", numa lista só, para não haver conflito no pagamento.
    U.seletorRico({
      rotulo: "Filtrar por regime de pagamento", valor: vinculo,
      itens: [{ valor: "", rotulo: "Todos os regimes" }].concat(
        L.gruposFiltroPresentes(L.ativos()).map(function (g) { return { valor: g, rotulo: g }; })),
      atributos: { filtro: "vinculo" }
    }) +
    // Cada empresa é um CNPJ diferente de verdade (Hotel, ServJU, ServMA)
    // — separar por ela é o mesmo tipo de corte que separar por regime.
    U.seletorRico({
      rotulo: "Filtrar por empresa", valor: empresaFiltro,
      itens: [{ valor: "", rotulo: "Todas as empresas" }].concat(
        L.empresasPresentes(L.ativos()).map(function (e) { return { valor: e, rotulo: e }; })),
      atributos: { filtro: "empresa" }
    }) +
    '<span class="direita"><span class="pastilha neutro">' + lista.length + " de " + L.ativos().length + "</span></span></div>";

  // Coluna do banco só quando alguém tem saldo: toda em "—" ela só
  // empurrava o custo para fora da tela.
  var temBanco = lista.some(function (f) { return L.saldoBanco(f.id); });
  html += '<div class="painel">' + barra + U.tabelaHtml([
    { rotulo: "Funcionário", conteudo: function (f) {
      // Cargo e matrícula saíram daqui (poluíam a lista) — continuam na
      // ficha do funcionário, ao abrir, e nos filtros de busca.
      return '<div class="principal nome-lista">' + U.esc(T.nomeExibicao(f.nome)) + "</div>"; } },
    { rotulo: "Empresa", conteudo: function (f) {
      var e = L.empresaDe(f);
      // Só a ausência ganha destaque: 41 pastilhas iguais viram ruído, duas
      // marcas vermelhas viram pendência.
      return e === "—"
        ? '<span class="falta">sem empresa</span>'
        : '<span class="quieto sem-quebra">' + U.esc(e) + "</span>"; } },
    { rotulo: "Vínculo", conteudo: function (f) {
      var v = L.vinculoDe(f);
      var extra = [];
      var div = L.divisaoPagamento(f);
      var cltMostrado = div ? div.clt : f.valorClt;
      if (cltMostrado > 0) extra.push({ rotulo: "CLT", valor: L.brl(cltMostrado) });
      if (f.valorTicket > 0) extra.push({ rotulo: "Ticket", valor: L.brl(f.valorTicket) });
      if (f.valorMei > 0) extra.push({ rotulo: "MEI", valor: L.brl(f.valorMei) });
      else if (div && div.meiADefinir) extra.push({ rotulo: "MEI", valor: "a definir" });
      // `v.codigos` só existe no protótipo local (planilha); dado vindo da API
      // real não tem array de códigos, só a bandeira já resolvida — por isso
      // o que decide "tem vínculo" é o rótulo, não o array cru.
      // Um canal por linha, rótulo e valor alinhados: numa frase corrida
      // ("CLT R$ 8.000,00 · Ticket …") a coluna estreita quebrava no meio.
      var soUm = extra.length === 1 && extra[0].rotulo.toLowerCase() === v.rotulo.toLowerCase();
      return (v.rotulo !== "—"
        ? '<span class="quieto sem-quebra">' + U.esc(v.rotulo) + "</span>"
        : '<span class="falta">sem código</span>') +
        (soUm ? '<div class="secundario sem-quebra">' + U.esc(extra[0].valor) + "</div>"
          : extra.length ? '<dl class="vinculo-valores">' + extra.map(function (item) {
              return "<dt>" + U.esc(item.rotulo) + "</dt><dd>" + U.esc(item.valor) + "</dd>";
            }).join("") + "</dl>" : ""); } },
    { rotulo: soColaboradores ? "Salário e jornada" : "Carga e hora-aula",
      secundaria: true, conteudo: function (f) {
      if (f.regime === "MENSALISTA") {
        // Colaborador importado sem a coluna "Bruto" na planilha de origem
        // entra com salarioBase 0 de propósito — R$ 0,00/mês pareceria o
        // valor de verdade em vez do que é: falta lançar.
        if (!f.salarioBase) return '<span class="falta">sem salário cadastrado</span>';
        // Carga horária não veio na planilha (salário incompatível com 44h,
        // provavelmente jornada parcial) — mostrar "44h" adivinhado seria
        // inventar o dado que faltou.
        if (!f.cargaHoraria) return L.brl(f.salarioBase) + '/mês · <span class="falta">jornada não informada</span>';
        return L.brl(f.salarioBase) + "/mês · " + f.cargaHoraria + "h";
      }
      if (f.regime === "PRESTADOR_PJ") {
        return L.brl(f.valorMensal) + "/mês";
      }
      if (f.regime === "HORISTA_RELOGIO") {
        return (f.horasSemanais || 0) + "h/sem × " + L.brl(f.valorHora || 0);
      }
      if (f.regime === "ESTAGIARIO") {
        return L.brl(f.bolsa || 0) + '/mês <span class="pastilha neutro">estágio</span>';
      }
      var aulas = L.aulasSemanaisDe(f);
      var media = L.horaAulaDe(f);
      var mods = L.modulosDe(f);
      // Divisão por segmento numa linha discreta, com o nome curto e a carga
      // ao lado ("Fund. 1: 10 · Fund. 2: 20"), sem barra.
      var detalhe = mods.length > 1
        ? '<div class="modulos">' + mods.map(function (m) {
            return '<span class="sem-quebra">' + U.esc(T.moduloCurto(m.modulo)) + ": " + m.aulas + "</span>";
          }).join(" · ") + "</div>"
        // Módulo único: o número já está no total acima, repetir seria eco.
        // O nome do segmento não — sem ele a lista não diz onde a pessoa dá aula.
        : (mods.length ? '<div class="modulos">' + U.esc(mods[0].modulo) + "</div>" : "");
      var projetoLista = L.movimentoDe(f.id, L.competenciaAberta()).aulasExtrasSemanais || 0;
      return aulas + " aulas/sem × " + L.brl(media) +
        (projetoLista > 0 ? ' <strong class="sem-quebra">+ ' + projetoLista + " de projeto</strong>" : "") + detalhe; } },
    !temBanco ? null : { rotulo: "Banco de horas", direita: true, conteudo: function (f) {
      // Prestador não tem jornada controlada pela escola — controlar seria
      // mais um sinal de subordinação. Estágio não tem banco de horas: é
      // instituto próprio da CLT, sem equivalente na Lei 11.788.
      if (f.regime === "PRESTADOR_PJ" || f.regime === "ESTAGIARIO") return '<span class="secundario">—</span>';
      var m = L.saldoBanco(f.id);
      if (!m) return '<span class="secundario">—</span>';
      // Pílula só quando pede atenção (devendo muitas horas ou acumulando demais).
      var sit = L.situacaoBanco(m);
      return sit.chave === "critico" || sit.chave === "destaque"
        ? '<span class="pastilha ' + sit.chave + '">' + L.horas(m) + "</span>"
        : '<span class="num">' + L.horas(m) + "</span>"; } },
    { rotulo: "Custo mensal", direita: true, conteudo: function (f) {
      var r = L.calcular(f);
      // O alerta de vínculo só faz sentido para prestador: num contrato CLT a
      // divergência que aparece é outra (tabela legal por conferir).
      var risco = f.regime === "PRESTADOR_PJ" &&
        r.avisos.some(function (a) { return a.nivel === "divergencia"; });
      // CLT + MEI: o MEI é pago além da folha, então o total soma os dois.
      // Só quando o MEI é pago por fora: o CLT cadastrado é igual ao que a folha calcula
      // (se não, o MEI já está dentro do valor da folha e somar contaria em dobro).
      var somaMei = f.regime !== "PRESTADOR_PJ" && f.valorMei > 0 && f.valorClt > 0 &&
        Math.abs(f.valorClt - r.custoEmpregador) <= 100 ? f.valorMei : 0;
      return '<span class="num">' + L.brl(r.custoEmpregador + somaMei) + "</span>" +
        (somaMei ? '<div class="secundario">folha ' + L.brl(r.custoEmpregador) + " + MEI " + L.brl(somaMei) + "</div>" : "") +
        (risco ? '<div class="secundario" style="color:var(--vermelho)">risco de vínculo</div>' : ""); } }
  ].filter(Boolean), lista, {
    aoClicarLinha: true,
    tituloVazio: termo ? "Nenhum resultado" : "Nenhum funcionário cadastrado",
    textoVazio: termo ? "Nenhum funcionário corresponde a “" + termo + "”."
      : "O cadastro de pessoas é o primeiro passo: sem ele não há folha, banco de horas nem controle de férias.",
    acaoVazio: termo ? null : { acao: "novo-funcionario", rotulo: "Cadastrar o primeiro" }
  }) + "</div>";

  return html;
};

T.acoes["ficha-funcionario"] = function (id) {
  var f = L.buscarPorId("funcionarios", id);
  if (!f) return;
  var r = L.calcular(f);
  var pj = f.regime === "PRESTADOR_PJ";
  var estagiario = f.regime === "ESTAGIARIO";
  var semVinculo = pj || estagiario;
  var ausencias = L.estado.ausencias.filter(function (a) { return a.funcionarioId === id; });

  var linhas = [
    ["Matrícula", f.matricula], ["Cargo", f.cargo || "—"], ["Setor", f.departamento || "—"],
    ["Início", L.dataBR(f.admissao)],
    ["Regime", pj ? "Prestador " + (f.enquadramento || "MEI")
      : estagiario ? "Estagiário (Lei 11.788)"
      : f.regime === "HORISTA_AULA" ? "Hora-aula (CLT)"
      : f.regime === "HORISTA_RELOGIO" ? "Horista por hora batida (CLT)"
      : f.tipoContrato === "APRENDIZ" ? "Mensalista — aprendiz (CLT)"
      : f.tipoContrato === "TEMPORARIO" ? "Mensalista — temporário (CLT)" : "Mensalista (CLT)"]
  ];
  // Modo backend nunca devolve o documento em texto puro (mesma regra do
  // CPF) — só se está cadastrado ou não; modo local/demo guarda o CNPJ cru
  // em memória, então mostra ele mesmo.
  linhas.push(pj ? ["CNPJ", L.USA_BACKEND ? (f.temCnpj ? "Cadastrado" : "Ainda não informado") : (f.cnpj || "—")]
    : estagiario ? ["Instituição de ensino", f.instituicaoEnsino || "—"]
    : ["Dependentes IRRF", String(f.dependentes || 0)]);
  if (semVinculo) {
    // Cada item numa linha, com nome e valor: imposto retido na nota (cód. 95x) é uma coisa;
    // desconto da escola (cantina, plano etc.) é outra.
    var itensRet = [], itensDesc = [];
    (r.rubricas || []).forEach(function (x) {
      if (x.tipo !== "D") return;
      (/^95/.test(String(x.cod)) ? itensRet : itensDesc).push(x);
    });
    linhas.push(["Valor da nota", L.brl(f.valorMensal || 0)]);
    // Retenção de imposto só aparece quando existe (MEI/Simples não tem).
    itensRet.forEach(function (x) { linhas.push(["Retenção — " + x.desc, L.brl(x.valor)]); });
    // Descontos da escola (cantina, plano etc.) somados numa linha só.
    var totalDesc = itensDesc.reduce(function (t, x) { return t + x.valor; }, 0);
    if (totalDesc > 0) linhas.push(["Descontos", "− " + L.brl(totalDesc)]);
  } else {
    linhas.push(["Banco de horas", L.horas(L.saldoBanco(id))]);
  }
  var div = pj || estagiario ? null : L.divisaoPagamento(f);
  if (div && (div.ticket > 0 || div.mei > 0 || div.meiADefinir)) {
    // Cada canal na sua linha: o que é CLT é CLT, o que é MEI é MEI.
    linhas.push(["CLT (folha)", L.brl(div.clt)]);
    if (div.ticket > 0) linhas.push([L.ticketDesconta(f) ? "Ticket (descontado, pago à parte)" : "Ticket (soma, pago à parte)", L.brl(div.ticket)]);
    if (div.mei > 0) linhas.push(["MEI (nota fiscal)", L.brl(div.mei)]);
    else if (div.meiADefinir) linhas.push(["MEI (nota fiscal)", "valor a definir"]);
  }
  // MEI dentro do total: o líquido da folha inclui o MEI; o líquido CLT é só a parte CLT.
  if (div && div.meiDentro) linhas.push(["Líquido CLT previsto", L.brl(Math.max(0, r.liquido - div.mei))]);
  else linhas.push([pj ? "Líquido da nota" : "Líquido previsto", L.brl(r.liquido)]);
  linhas.push(["Custo p/ o hotel", L.brl(r.custoEmpregador + (!pj && f.valorMei > 0 && f.valorClt > 0 && Math.abs(f.valorClt - r.custoEmpregador) <= 100 ? f.valorMei : 0))]);
  if (estagiario && f.dataFimPrevista) linhas.push(["Fim previsto", L.dataBR(f.dataFimPrevista)]);

  var ficha = '<dl class="ficha">' + linhas.map(function (p) {
    return "<div><dt>" + U.esc(p[0]) + "</dt><dd>" + U.esc(p[1]) + "</dd></div>";
  }).join("") + "</dl>";

  // Carga por segmento: é onde a direção enxerga como o professor se divide
  // entre Infantil, Fundamental e Médio, cada um com a sua hora-aula.
  if (f.cargas && f.cargas.length) {
    // Aulas de projeto / aula extra (o que passa da grade de 40) entram como uma
    // linha a mais, abaixo dos segmentos, e o total soma tudo.
    var movProjeto = L.movimentoDe(f.id, L.competenciaAberta());
    var aulasProjeto = movProjeto.aulasExtrasSemanais || 0;
    var horaProjeto = movProjeto.valorHoraExtra > 0 ? movProjeto.valorHoraExtra : (f.valorHoraAula || L.horaAulaDe(f));
    // "No mês" já com o repouso semanal (4,5 semanas + 1/6 = 5,25), igual à folha.
    var noMes = function (aulas, hora) {
      var v = L.arredondar(aulas * hora * L.CCT.semanasPorMes);
      return v + L.fracDe(v, L.CCT.diasDescansoSemana, L.CCT.diasUteisSemana);
    };
    var linhasCarga = f.cargas.map(function (c, i) {
      var hora = c.valorHora || 0;
      return { id: "c" + i, segmento: c.segmento, aulas: c.aulas, hora: hora, mes: noMes(c.aulas, hora) };
    });
    if (aulasProjeto > 0) {
      linhasCarga.push({ id: "proj", segmento: "Projeto / aula extra", aulas: aulasProjeto, hora: horaProjeto, mes: noMes(aulasProjeto, horaProjeto), projeto: true });
    }
    if (linhasCarga.length > 1) {
      var totalAulas = linhasCarga.reduce(function (a, c) { return a + c.aulas; }, 0);
      var totalMes = linhasCarga.reduce(function (a, c) { return a + c.mes; }, 0);
      linhasCarga.push({ id: "total", segmento: "Total", aulas: totalAulas, hora: null, mes: totalMes, total: true });
    }
    ficha += '<h3 style="font-size:var(--t-2);margin:20px 0 8px">Carga por setor</h3>' +
      U.tabelaHtml([
        { rotulo: "Segmento", conteudo: function (c) {
          return c.total ? "<strong>Total</strong>" : (c.projeto ? "<strong>" + U.esc(c.segmento) + "</strong>" : U.esc(c.segmento)); } },
        { rotulo: "Aulas/semana", direita: true, conteudo: function (c) { return c.total ? "<strong>" + c.aulas + "</strong>" : String(c.aulas); } },
        { rotulo: "Hora-aula", direita: true, conteudo: function (c) { return c.hora === null ? "" : L.brl(c.hora); } },
        { rotulo: "No mês", direita: true, conteudo: function (c) {
          return '<span class="num">' + (c.total ? "<strong>" + L.brl(c.mes) + "</strong>" : L.brl(c.mes)) + "</span>"; } }
      ], linhasCarga);
    if (div && div.meiDentro) {
      ficha += '<p class="secundario" style="margin:8px 0 0">Do total acima, ' + L.brl(div.mei) + " é pago como MEI (nota fiscal) e " +
        L.brl(div.clt) + " é CLT" + (div.ticket > 0 && L.ticketDesconta(f) ? "; o Ticket de " + L.brl(div.ticket) + " é pago à parte." : ".") + "</p>";
    }
  }

  var alertaVinculo = r.avisos.filter(function (a) { return a.nivel !== "info"; })
    .map(function (a) {
      return '<div class="aviso-tela" style="margin-top:16px' +
        (a.nivel === "divergencia" ? ";background:var(--vermelho-fundo);border-color:rgba(158,36,56,.28)" : "") + '">' +
        '<span aria-hidden="true">▲</span><div>' + U.esc(a.texto) + "</div></div>";
    }).join("");

  U.abrirModal({
    titulo: f.nome,
    sub: pj ? L.brl(f.valorMensal) + " por mês · nota fiscal"
      : estagiario ? L.brl(f.bolsa || 0) + " de bolsa por mês · sem vínculo empregatício"
      : f.regime === "HORISTA_AULA"
        ? L.aulasSemanaisDe(f) + " aulas/semana" +
          (L.movimentoDe(f.id, L.competenciaAberta()).aulasExtrasSemanais > 0 ? " + " + L.movimentoDe(f.id, L.competenciaAberta()).aulasExtrasSemanais + " de projeto" : "") +
          " · hora-aula média de " + L.brl(L.horaAulaDe(f))
        : f.regime === "HORISTA_RELOGIO"
          ? (f.horasSemanais || 0) + " horas/semana · " + L.brl(f.valorHora || 0) + "/hora"
          : L.brl(f.salarioBase) + " por mês",
    largo: true,
    corpo: ficha + alertaVinculo +
      '<h3 style="font-size:var(--t-2);margin:20px 0 8px">Ausências registradas</h3>' +
      (ausencias.length === 0
        ? '<p style="color:var(--tinta-media);font-size:var(--t-1);margin:0">Nenhuma ausência lançada.</p>'
        : U.tabelaHtml([
            { rotulo: "Tipo", conteudo: function (a) { return U.esc(T.rotuloAusencia ? T.rotuloAusencia(a.tipo) : (T.ROTULOS_AUSENCIA[a.tipo] || a.tipo)); } },
            { rotulo: "Período", conteudo: function (a) { return L.dataBR(a.inicio) + " a " + L.dataBR(a.fim); } },
            { rotulo: "Status", direita: true, conteudo: function (a) {
              return '<span class="pastilha neutro">' + U.esc(T.ROTULOS_STATUS_AUSENCIA[a.status] || a.status) + "</span>"; } }
          ], ausencias)),
    acoes: (function () {
      // Prestador PJ/MEI não tem folha mensal — "Ver folha" levaria a uma
      // tela que nunca vai mostrar nada para ele.
      var lista = pj ? [] : [
        { rotulo: "Ver folha", esquerda: true, aoClicar: function () { U.fecharModal(); T.ir("folha", id); } }
      ];
      if (pj && L.USA_BACKEND) {
        lista.push({ rotulo: "Calcular pagamento", esquerda: true,
          aoClicar: function () { U.fecharModal(); T.acoes["calcular-prestador"](id); } });
        if (!f.temCnpj) {
          lista.push({ rotulo: "Adicionar CNPJ", esquerda: true,
            aoClicar: function () { U.fecharModal(); T.acoes["adicionar-cnpj-prestador"](id); } });
        }
      }
      if (f.regime === "HORISTA_AULA" && L.USA_BACKEND && T.podeEditar()) {
        lista.push({ rotulo: "Carga por setor", esquerda: true,
          aoClicar: function () { U.fecharModal(); T.acoes["editar-cargas-segmento"](id); } });
        lista.push({ rotulo: "Aula extra / projeto", esquerda: true,
          aoClicar: function () { U.fecharModal(); T.acoes["lancar-movimento"](id); } });
      }
      if (L.USA_BACKEND && T.podeEditar() && T.temPerfil("DIRECAO") && f.regime !== "PRESTADOR_PJ") {
        lista.push({ rotulo: "Valer desde " + L.competenciaBR(L.competenciaAberta()), esquerda: true,
          aoClicar: function () { U.fecharModal(); T.acoes["valer-desde"](id); } });
      }
      if (T.podeEditar()) {
        if (!L.USA_BACKEND || T.temPerfil("DIRECAO", "RH")) {
          lista.push({ rotulo: "Desligar", esquerda: true, classe: "perigo",
            aoClicar: function () { U.fecharModal(); T.acoes["desligar-funcionario"](id); } });
        }
        var checagem = L.podeExcluirFuncionario(f);
        // Com servidor, Direção e RH excluem (o servidor recusa quem já tem
        // folha fechada ou pagamento); sem servidor vale a regra local.
        var podeExcluir = L.USA_BACKEND ? T.temPerfil("DIRECAO", "RH")
          : checagem.pode && L.podeExecutarReservada("excluir-funcionario", L.estado.usuario);
        if (podeExcluir) {
          lista.push({ rotulo: "Excluir cadastro", esquerda: true, classe: "perigo",
            aoClicar: function () { U.fecharModal(); T.acoes["excluir-funcionario"](id); } });
        }
      }
      lista.push({ rotulo: "Fechar", aoClicar: U.fecharModal });
      if (T.podeEditar()) {
        lista.push({ rotulo: "Editar", classe: "primario", aoClicar: function () { U.fecharModal(); T.acoes["novo-funcionario"](id); } });
      }
      return lista;
    })()
  });
};

T.acoes["adicionar-cnpj-prestador"] = function (id) {
  var f = L.buscarPorId("funcionarios", id);
  if (!f || !f.contratoPrestadorId) return;
  U.abrirFormulario({
    titulo: "CNPJ de " + f.nome,
    sub: "Cifrado no banco assim que salvo — nunca aparece em log.",
    campos: [{ id: "cnpj", rotulo: "CNPJ", obrigatorio: true }],
    rotuloSalvar: "Salvar",
    aoSalvar: function (v) {
      U.fecharModal();
      L.api.patch("/api/prestadores/contrato/" + f.contratoPrestadorId + "/cnpj", { cnpj: v.cnpj })
        .then(function () { return L.recarregarFuncionarios(); })
        .then(function () { U.avisar("CNPJ cadastrado."); })
        .catch(function (erro) { U.avisar(erro.message || "Não foi possível salvar."); });
    }
  });
};

/** Como um professor de hora-aula se divide entre Infantil/Fundamental/
 * Médio — o que alimenta o filtro "por módulo" da lista. Um campo por
 * segmento (em vez de uma lista de pares livre): fixa em `L.MODULOS_ENSINO`,
 * a mesma lista que a tela já usa no filtro, então não há como digitar um
 * nome de segmento que o banco depois rejeita. */
T.acoes["editar-cargas-segmento"] = function (id) {
  var f = L.buscarPorId("funcionarios", id);
  if (!f) return;
  var atuais = {};
  (f.cargas || []).forEach(function (c) { atuais[c.segmento] = c.aulas; });
  var total = f.aulasSemanais || 0;

  U.abrirFormulario({
    titulo: "Carga por setor",
    sub: f.nome + " · a soma precisa bater com o total de " + total + " aula(s) semanais",
    campos: L.MODULOS_ENSINO.map(function (seg, i) {
      return { id: "seg" + i, rotulo: seg, tipo: "numero", passo: "0.5", par: i % 2 === 1,
        padrao: atuais[seg] || "" };
    }),
    rotuloSalvar: "Salvar",
    aoSalvar: function (v) {
      var cargas = L.MODULOS_ENSINO
        .map(function (seg, i) { return { segmento: seg, aulas: Number(v["seg" + i]) || 0 }; })
        .filter(function (c) { return c.aulas > 0; });
      var soma = cargas.reduce(function (a, c) { return a + c.aulas; }, 0);
      if (Math.abs(soma - total) > 0.01) {
        U.avisar("A soma das aulas (" + soma + ") precisa bater com o total de " + total + " aula(s) semanais.");
        return;
      }
      L.api.patch("/api/funcionarios/" + id, { cargasPorSegmento: cargas })
        .then(function () { return L.recarregarFuncionarios(); })
        .then(function () { U.fecharModal(); U.avisar("Carga por setor atualizada."); })
        .catch(function (erro) { U.avisar(erro.message || "Não foi possível salvar."); });
    }
  });
};

T.acoes["calcular-prestador"] = function (id) {
  var f = L.buscarPorId("funcionarios", id);
  if (!f) return;
  U.abrirFormulario({
    titulo: "Calcular pagamento de " + f.nome,
    sub: "Roda a apuração real (retenções, CPP e descontos fixos) e grava o resultado.",
    campos: [{ id: "competencia", rotulo: "Competência (AAAA-MM)", obrigatorio: true,
      padrao: L.competenciaAtual() }],
    rotuloSalvar: "Calcular",
    aoSalvar: function (v) {
      U.fecharModal();
      L.api.post("/api/prestadores/" + id + "/" + v.competencia + "/calcular")
        .then(function (r) {
          U.avisar("Pagamento calculado: líquido de " + L.brl(r.liquidoAPagar) + ".");
        })
        .catch(function (erro) { U.avisar(erro.message || "Não foi possível calcular."); });
    }
  });
};

/**
 * Desligar mantém o cadastro e tudo que ele já gerou (folha, banco de
 * horas, auditoria) — só tira a pessoa das próximas folhas a partir da
 * data informada. É o oposto de excluir de propósito: aqui o histórico é
 * o ponto, não o que se descarta.
 */
/** Depois do desligamento, o próximo passo é a rescisão: oferece ir direto. */
T.oferecerRescisao = function (id, nome) {
  if (!L.USA_BACKEND || !T.podeVer("eventos")) return;
  U.confirmar({
    titulo: "Calcular a rescisão de " + nome + " agora?",
    texto: "Abre o cálculo da rescisão já com a pessoa selecionada.",
    rotulo: "Calcular rescisão",
    aoConfirmar: function () {
      T.carregarDesligados().then(function () {
        T.ir("eventos");
        T.acoes["calcular-rescisao"](id);
      }).catch(function () { T.ir("eventos"); });
    }
  });
};

T.acoes["desligar-funcionario"] = function (id) {
  var f = L.buscarPorId("funcionarios", id);
  if (!f) return;
  U.abrirFormulario({
    titulo: "Desligar " + f.nome,
    sub: "O cadastro e o histórico de folha continuam — só sai das competências a partir desta data.",
    campos: [
      { id: "dataDesligamento", rotulo: "Data de desligamento", tipo: "data", obrigatorio: true, padrao: L.hoje() }
    ],
    rotuloSalvar: "Confirmar desligamento",
    aoSalvar: function (v) {
      if (L.USA_BACKEND) {
        L.api.post("/api/funcionarios/" + id + "/desligar", { dataDesligamento: v.dataDesligamento })
          .then(function () { T._desligadosCarregados = false; return L.recarregarFuncionarios(); })
          .then(function () {
            U.fecharModal();
            T.renderizar();
            U.avisar(f.nome + " desligado(a) a partir de " + L.dataBR(v.dataDesligamento) + ".");
            T.oferecerRescisao(id, f.nome);
          }).catch(function (erro) {
            U.avisar(erro.message || "Não foi possível desligar.");
          });
        return;
      }
      L.atualizar("funcionarios", id, { status: "DESLIGADO", dataDesligamento: v.dataDesligamento });
      U.fecharModal();
      T.renderizar();
      U.avisar(f.nome + " desligado(a) a partir de " + L.dataBR(v.dataDesligamento) + ".");
    }
  });
};

/**
 * Excluir é definitivo — `L.podeExcluirFuncionario` já barrou a chamada
 * antes de o botão aparecer para quem já esteve em folha fechada; aqui só
 * confirma a consequência, como todo ato irreversível do sistema.
 */
T.acoes["excluir-funcionario"] = function (id) {
  var f = L.buscarPorId("funcionarios", id);
  if (!f) return;
  // No modo backend quem decide de verdade é o servidor (a FK do banco
  // recusa apagar quem já tem cálculo de folha, ausência ou jornada
  // vinculada) — a checagem local (`L.podeExcluirFuncionario`) depende de
  // `L.estado.periodos`, que não existe neste modo.
  if (!L.USA_BACKEND) {
    var checagem = L.podeExcluirFuncionario(f);
    if (!checagem.pode) { U.avisar(checagem.motivo); return; }
  }
  U.confirmar({
    titulo: "Excluir " + f.nome + "?",
    texto: L.USA_BACKEND && !T.temPerfil("DIRECAO")
      ? "Excluir não tem volta, então isto envia um PEDIDO para a Direção. O cadastro só sai do sistema se ela aceitar; até lá nada é apagado."
      : L.USA_BACKEND
      ? "O cadastro some do sistema, sem volta, junto com os lançamentos de meses ainda abertos. Se já houver folha fechada, pagamento ou banco de horas, a exclusão é recusada: nesse caso, use \"Desligar\"."
      : "O cadastro some do sistema, sem volta. Ninguém foi pago em cima dele em nenhuma folha fechada — " +
        "por isso a exclusão é permitida. Se essa pessoa já trabalhou aqui de verdade, prefira \"Desligar\".",
    rotulo: L.USA_BACKEND && !T.temPerfil("DIRECAO") ? "Pedir exclusão" : "Excluir de vez",
    aoConfirmar: function () {
      if (L.USA_BACKEND) {
        L.api.del("/api/funcionarios/" + id).then(function (resposta) {
          return L.recarregarFuncionarios().then(function () { return resposta; });
        }).then(function (resposta) {
          T.renderizar();
          // RH: a exclusão só acontece quando a Direção aceitar (o aviso do pedido vem da API).
          if (!(resposta && resposta.aprovacao)) U.avisar(f.nome + " excluído(a).");
        }).catch(function (erro) {
          U.avisar(erro.message || "Não foi possível excluir.");
        });
        return;
      }
      L.excluir("funcionarios", id);
      T.renderizar();
      U.avisar(f.nome + " excluído(a).");
    }
  });
};

// ---------------------------------------------------------------- fornecedores

T._fornecedoresCarregados = false;
T._carregandoFornecedores = false;

function carregarFornecedoresDaApi() {
  if (T._carregandoFornecedores) return;
  T._carregandoFornecedores = true;
  L.api.get("/api/fornecedores").then(function (lista) {
    L.estado.fornecedores = lista || [];
    T._fornecedoresCarregados = true;
    T._carregandoFornecedores = false;
    T.renderizar();
  }).catch(function (erro) {
    T._carregandoFornecedores = false;
    console.error("Não foi possível carregar fornecedores:", erro);
    U.avisar("Não foi possível carregar a lista de fornecedores agora.");
  });
}

/** CNPJ tem 14 dígitos, CPF tem 11 — o formulário local não separa os dois
 * campos, só pede "CNPJ ou CPF" num campo só; a API real precisa saber qual
 * é qual pra gravar em `tipo_documento`. */
function tipoDocumentoDe(documento) {
  return (documento || "").replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF";
}

T.acoes["novo-fornecedor"] = function (id) {
  var atual = id ? L.buscarPorId("fornecedores", id) : null;
  U.abrirFormulario({
    titulo: atual ? "Editar fornecedor" : "Cadastrar fornecedor",
    campos: [
      { id: "razaoSocial", rotulo: "Nome / razão social", obrigatorio: true },
      { id: "documento", rotulo: "CNPJ ou CPF", par: true, dica: "Opcional. Cifrado no banco." },
      { id: "categoria", rotulo: "Categoria", tipo: "select",
        opcoes: ["Alimentos e café da manhã", "Água, energia e gás", "Internet e telefone", "Contabilidade e honorários", "Impostos", "Enxoval e amenities", "Tecnologia", "Estrutura", "Manutenção", "Marketing", "Terceirizados", "Eventos", "Administrativo", "Outros"] },
      { id: "contato", rotulo: "Contato", par: true },
      { id: "canalCobranca", rotulo: "Manda a cobrança por", tipo: "select", opcoes: ["", "WhatsApp", "E-mail", "Portal", "Site"] },
      { id: "telefone", rotulo: "Telefone" },
      { id: "email", rotulo: "E-mail" }
    ],
    valores: atual || {},
    aoSalvar: function (v) {
      if (L.USA_BACKEND) {
        var corpo = {
          razaoSocial: v.razaoSocial, categoria: v.categoria || (atual ? "" : undefined),
          contatoNome: v.contato || (atual ? "" : undefined), telefone: v.telefone || (atual ? "" : undefined),
          email: v.email || (atual ? "" : undefined), canalCobranca: v.canalCobranca || undefined,
        };
        if (v.documento) { corpo.documento = v.documento; corpo.tipoDocumento = tipoDocumentoDe(v.documento); }
        var chamada = atual
          ? L.api.patch("/api/fornecedores/" + atual.id, corpo)
          : L.api.post("/api/fornecedores", corpo);
        chamada.then(function () {
          T._fornecedoresCarregados = false;
          carregarFornecedoresDaApi();
          U.fecharModal(); T.ir("fornecedores");
          U.avisar(atual ? "Fornecedor atualizado." : "Fornecedor cadastrado.");
        }).catch(function (erro) { U.avisar(erro.message || "Não foi possível salvar."); });
        return;
      }
      if (atual) L.atualizar("fornecedores", atual.id, v); else L.criar("fornecedores", v);
      U.fecharModal(); T.ir("fornecedores");
    }
  });
};

T.telas.fornecedores = function () {
  if (L.USA_BACKEND && !T._fornecedoresCarregados) carregarFornecedoresDaApi();

  var html = T.cabecalho("Fornecedores",
    "Quem o hotel paga, com histórico de compras.",
    T.botaoNovo("novo-fornecedor", "Cadastrar fornecedor"));

  html += '<div class="painel">' + U.tabelaHtml([
    { rotulo: "Fornecedor", conteudo: function (f) {
      return '<div class="principal">' + U.esc(f.razaoSocial) + '</div><div class="secundario">' + U.esc(f.documento || "") + "</div>"; } },
    { rotulo: "Categoria", secundaria: true, conteudo: function (f) { return U.esc(f.categoria || "—"); } },
    { rotulo: "Contato", conteudo: function (f) {
      return U.esc(f.contato || "—") + (f.telefone ? '<div class="secundario">' + U.esc(f.telefone) + "</div>" : ""); } },
    { rotulo: "Pago no ano", direita: true, conteudo: function (f) {
      var total = L.estado.contas.filter(function (c) { return c.fornecedorId === f.id && c.status === "PAGO"; })
        .reduce(function (a, c) { return a + c.valor; }, 0);
      return '<span class="num">' + (total ? L.brl(total) : "—") + "</span>"; } },
    { rotulo: "", direita: true, conteudo: function (f) {
      return '<button class="botao miudo" data-acao="novo-fornecedor" data-id="' + f.id + '">Editar</button>'; } }
  ], L.estado.fornecedores, {
    buscaLocal: "Fornecedor, categoria ou contato",
    tituloVazio: "Nenhum fornecedor cadastrado",
    textoVazio: "",
    acaoVazio: { acao: "novo-fornecedor", rotulo: "Cadastrar o primeiro" }
  }) + "</div>";
  return html;
};

// ---------------------------------------------------------------- contas a pagar

T.CATEGORIAS = ["Folha e pessoal", "Impostos", "Enxoval e amenities", "Tecnologia", "Estrutura",
  "Manutenção", "Marketing", "Terceirizados", "Eventos", "Administrativo", "Outros"];

/** Mesmo padrão de T.ROTULOS_AUSENCIA (telas-c.js): nome de exibição, nunca
 * a constante interna. T.ROTULO_STATUS (logo abaixo) já cobre "status". */
T.ROTULO_FORMA_PAGAMENTO = {
  BOLETO: "Boleto", PIX: "Pix", TRANSFERENCIA: "Transferência",
  CARTAO: "Cartão", DEBITO_AUTOMATICO: "Débito automático", DINHEIRO: "Dinheiro"
};

T._contasCarregadas = false;
T._carregandoContas = false;

function carregarContasDaApi() {
  if (T._carregandoContas) return;
  T._carregandoContas = true;
  L.api.get("/api/contas").then(function (lista) {
    L.estado.contas = lista || [];
    T._contasCarregadas = true;
    T._carregandoContas = false;
    T.renderizar();
  }).catch(function (erro) {
    T._carregandoContas = false;
    console.error("Não foi possível carregar contas a pagar:", erro);
    U.avisar("Não foi possível carregar a lista de contas agora.");
  });
}

T.acoes["nova-conta"] = function (id) {
  var atual = id ? L.buscarPorId("contas", id) : null;
  U.abrirFormulario({
    titulo: atual ? "Editar conta" : "Lançar conta a pagar",
    largo: true,
    campos: [
      { id: "descricao", rotulo: "Descrição", obrigatorio: true },
      { id: "fornecedorId", rotulo: "Fornecedor", tipo: "select",
        opcoes: [{ valor: "", rotulo: "— sem fornecedor —" }].concat(
          L.estado.fornecedores.map(function (f) { return { valor: f.id, rotulo: f.razaoSocial }; })) },
      { id: "categoria", rotulo: "Categoria", tipo: "select", obrigatorio: true, opcoes: T.CATEGORIAS },
      { id: "centroCusto", rotulo: "Centro de custo", par: true,
        opcoes: [], dica: "Ex.: Ensino Fundamental, Administrativo" },
      { id: "valor", rotulo: "Valor", tipo: "moeda", obrigatorio: true },
      { id: "competencia", rotulo: "Competência", obrigatorio: true, par: true, padrao: L.competenciaAberta(),
        dicaCampo: "AAAA-MM" },
      { id: "vencimento", rotulo: "Vencimento", tipo: "data", obrigatorio: true, padrao: L.hoje() },
      { id: "numeroDocumento", rotulo: "Nota fiscal / documento", par: true },
      { id: "formaPagamento", rotulo: "Forma de pagamento", tipo: "select",
        opcoes: Object.keys(T.ROTULO_FORMA_PAGAMENTO).map(function (k) { return { valor: k, rotulo: T.ROTULO_FORMA_PAGAMENTO[k] }; }) },
      // "Pago" só nasce do botão Pagar (que registra data e forma); "Aprovado"
      // é decisão da Direção. Oferecer essas opções ao RH/Financeiro só levava a um erro.
      { id: "status", rotulo: "Status", tipo: "select",
        opcoes: ["RASCUNHO", "AGUARDANDO_APROVACAO", "APROVADO", "AGENDADO", "CANCELADO"]
          .filter(function (k) { return !L.USA_BACKEND || T.temPerfil("DIRECAO") || k !== "APROVADO" || (atual && atual.status === "APROVADO"); })
          .concat(atual && atual.status === "PAGO" ? ["PAGO"] : [])
          .map(function (k) { return { valor: k, rotulo: T.ROTULO_STATUS[k][1] }; }) },
      { id: "observacoes", rotulo: "Observações", tipo: "textarea" }
    ],
    valores: atual ? Object.assign({}, atual, { valor: (atual.valor / 100).toFixed(2) })
      : { competencia: L.competenciaAberta(), vencimento: L.hoje(), status: "RASCUNHO" },
    aoSalvar: function (v) {
      if (L.USA_BACKEND) {
        var corpo = {
          descricao: v.descricao, fornecedorId: v.fornecedorId || (atual ? "" : undefined), categoria: v.categoria,
          valorCentavos: v.valor, competencia: v.competencia, vencimento: v.vencimento,
          // Ao editar, campo apagado vai vazio (""): com undefined o servidor manteria o valor antigo.
          numeroDocumento: v.numeroDocumento || (atual ? "" : undefined), formaPagamento: v.formaPagamento || (atual ? "" : undefined),
          status: v.status || undefined, observacoes: v.observacoes || (atual ? "" : undefined),
        };
        // Conta já paga mantém o status: Pago não se escolhe no formulário.
        if (atual && atual.status === "PAGO") delete corpo.status;
        var chamada = atual
          ? L.api.patch("/api/contas/" + atual.id, corpo)
          : L.api.post("/api/contas", corpo);
        chamada.then(function () {
          T._contasCarregadas = false;
          carregarContasDaApi();
          U.fecharModal(); T.ir("contas");
          U.avisar(atual ? "Conta atualizada." : "Conta lançada.");
        }).catch(function (erro) { U.avisar(erro.message || "Não foi possível salvar."); });
        return;
      }
      if (atual) L.atualizar("contas", atual.id, v); else L.criar("contas", v);
      U.fecharModal(); T.ir("contas");
    }
  });
};

T.ROTULO_STATUS = {
  RASCUNHO: ["neutro", "Rascunho"], AGUARDANDO_APROVACAO: ["pendente", "Aguardando aprovação"],
  APROVADO: ["destaque", "Aprovado"], AGENDADO: ["destaque", "Agendado"],
  PAGO: ["ok", "Pago"], VENCIDO: ["critico", "Vencido"], CANCELADO: ["neutro", "Cancelado"]
};

T.telas.contas = function () {
  if (L.USA_BACKEND && !T._fornecedoresCarregados) carregarFornecedoresDaApi();
  if (L.USA_BACKEND && !T._contasCarregadas) carregarContasDaApi();

  var filtro = T.filtros.contaStatus || "";
  var lista = L.estado.contas.filter(function (c) {
    return !filtro || L.statusConta(c) === filtro;
  }).sort(function (a, b) { return a.vencimento.localeCompare(b.vencimento); });

  var html = T.cabecalho("Contas a Pagar",
    "O status vira vencido sozinho quando a data passa.",
    T.botaoNovo("nova-conta", "Lançar conta"));

  var barra = '<div class="barra-ferramentas"><span class="filtro-rotulo">Status</span>' +
    U.seletorRico({
      rotulo: "Filtrar contas por situação", valor: filtro,
      itens: [{ valor: "", rotulo: "Todos" }].concat(
        Object.keys(T.ROTULO_STATUS).map(function (s) { return { valor: s, rotulo: T.ROTULO_STATUS[s][1] }; })),
      atributos: { filtro: "contaStatus" }
    }) +
    '<span class="direita"><span class="pastilha neutro">' +
    L.brl(lista.reduce(function (a, c) { return a + c.valor; }, 0)) + " no filtro</span></span></div>";

  html += '<div class="painel">' + barra + U.tabelaHtml([
    { rotulo: "Descrição", conteudo: function (c) {
      var forn = c.fornecedorId ? L.buscarPorId("fornecedores", c.fornecedorId) : null;
      return '<div class="principal">' + U.esc(c.descricao) + '</div><div class="secundario">' +
        U.esc(forn ? forn.razaoSocial : c.categoria) + (c.numeroDocumento ? " · NF " + U.esc(c.numeroDocumento) : "") + "</div>"; } },
    { rotulo: "Categoria", secundaria: true, conteudo: function (c) { return U.esc(c.categoria); } },
    { rotulo: "Vencimento", conteudo: function (c) {
      var d = L.diasAte(c.vencimento);
      var nota = c.status === "PAGO" ? "" : (d < 0 ? "há " + Math.abs(d) + " dias" : "em " + d + " dias");
      return L.dataBR(c.vencimento) + (nota ? '<div class="secundario">' + nota + "</div>" : ""); } },
    { rotulo: "Valor", direita: true, conteudo: function (c) { return '<span class="num">' + L.brl(c.valor) + "</span>"; } },
    { rotulo: "Status", direita: true, conteudo: function (c) {
      var s = T.ROTULO_STATUS[L.statusConta(c)] || ["neutro", c.status];
      return '<span class="pastilha ' + s[0] + '">' + s[1] + "</span>"; } },
    { rotulo: "", direita: true, conteudo: function (c) {
      var acoes = '<button class="botao miudo" data-acao="nova-conta" data-id="' + c.id + '">Editar</button>';
      if (c.status !== "PAGO" && c.status !== "CANCELADO" && T.podeEditar() && (!L.USA_BACKEND || T.temPerfil("DIRECAO"))) {
        acoes += ' <button class="botao miudo" data-acao="pagar-conta" data-id="' + c.id + '">Pagar</button>';
      }
      return acoes; } }
  ], lista, {
    buscaLocal: "Descrição, fornecedor ou valor",
    tituloVazio: filtro ? "Nenhuma conta neste status" : "Nenhuma conta lançada",
    textoVazio: filtro ? "Troque o filtro para ver as demais."
      : "",
    acaoVazio: filtro ? null : { acao: "nova-conta", rotulo: "Lançar a primeira" }
  }) + "</div>";

  return html;
};

T.acoes["pagar-conta"] = function (id) {
  var c = L.buscarPorId("contas", id);
  if (!c) return;
  U.abrirFormulario({
    titulo: "Registrar pagamento",
    sub: c.descricao + " · " + L.brl(c.valor),
    campos: [
      { id: "dataPagamento", rotulo: "Data do pagamento", tipo: "data", obrigatorio: true, padrao: L.hoje(), par: true },
      { id: "formaPagamento", rotulo: "Forma", tipo: "select",
        opcoes: Object.keys(T.ROTULO_FORMA_PAGAMENTO).map(function (k) { return { valor: k, rotulo: T.ROTULO_FORMA_PAGAMENTO[k] }; }), padrao: c.formaPagamento },
      { id: "observacoes", rotulo: "Observações", tipo: "textarea" }
    ],
    rotuloSalvar: "Confirmar pagamento",
    aoSalvar: function (v) {
      if (L.USA_BACKEND) {
        L.api.post("/api/contas/" + id + "/pagar", {
          dataPagamento: v.dataPagamento, formaPagamento: v.formaPagamento, observacoes: v.observacoes || undefined,
        }).then(function () {
          T._contasCarregadas = false;
          carregarContasDaApi();
          U.fecharModal(); T.renderizar();
          U.avisar("Pagamento registrado.");
        }).catch(function (erro) {
          U.avisar(erro.message || "Não foi possível registrar o pagamento.");
        });
        return;
      }
      L.atualizar("contas", id, { status: "PAGO", dataPagamento: v.dataPagamento, formaPagamento: v.formaPagamento });
      U.fecharModal(); T.renderizar();
    }
  });
};

// ---------------------------------------------------------------- fechamento

/** Folha da competência: do histórico importado, ou calculada pelo cadastro. */
L.folhaDaCompetencia = function (comp) {
  var h = L.DADOS_REAIS && L.DADOS_REAIS.historico &&
    L.DADOS_REAIS.historico.find(function (x) { return x.competencia === comp; });
  if (h) return { valor: h.totalPlanilha, professores: h.professores, doHistorico: true };
  return { valor: L.folhaEstimada(), professores: L.ativos().length, doHistorico: false };
};

/**
 * Evolução da folha de professores mês a mês, com a variação sobre o mês
 * anterior — é o número que a direção procura primeiro no fechamento.
 */
T.evolucaoFolha = function (compAtual) {
  var h = L.DADOS_REAIS && L.DADOS_REAIS.historico;
  if (!h || h.length < 2) return "";

  var maior = h.reduce(function (m, x) { return Math.max(m, x.totalPlanilha); }, 1);
  var primeiro = h[0], ultimo = h[h.length - 1];
  var variacao = primeiro.totalPlanilha > 0
    ? ((ultimo.totalPlanilha - primeiro.totalPlanilha) / primeiro.totalPlanilha) * 100
    : 0;

  var barras = h.map(function (x, i) {
    var anterior = i > 0 ? h[i - 1].totalPlanilha : 0;
    var dif = anterior ? x.totalPlanilha - anterior : 0;
    var pct = anterior ? (dif / anterior) * 100 : 0;
    var sinal = dif > 0 ? "critico" : dif < 0 ? "ok" : "neutro";
    var atual = x.competencia === compAtual;
    return '<div class="barra-dado"' + (atual ? ' style="background:var(--superficie-alt)"' : "") + ">" +
      "<span>" + U.esc(L.competenciaBR(x.competencia)) +
      '<div class="secundario">' + x.professores + " colaboradores · " + x.aulasSemanais + " aulas/sem</div></span>" +
      '<span class="trilho"><span class="preenche" style="width:' +
      Math.max(3, Math.round((x.totalPlanilha / maior) * 100)) + '%"></span></span>' +
      '<span class="valor num">' + L.brl(x.totalPlanilha) +
      (anterior
        ? '<div class="secundario"><span class="pastilha ' + sinal + '">' +
          (dif >= 0 ? "+" : "−") + L.brl(Math.abs(dif)) + " · " +
          (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%</span></div>"
        : "") +
      "</span></div>";
  }).join("");

  return U.painelHtml("Evolução da folha de colaboradores",
    L.competenciaBR(primeiro.competencia) + " a " + L.competenciaBR(ultimo.competencia),
    '<div class="aviso-tela" style="margin:16px 18px 6px"><span aria-hidden="true">·</span><div>' +
    "Valores brutos importados da planilha do hotel, antes de encargos. " +
    "No período a folha variou <strong>" +
    (variacao >= 0 ? "+" : "") + variacao.toFixed(1) + "%</strong>, de " +
    L.brl(primeiro.totalPlanilha) + " para " + L.brl(ultimo.totalPlanilha) + ".</div></div>" +
    barras);
};

T.telas.fechamento = function () {
  if (L.USA_BACKEND && !T._contasCarregadas) carregarContasDaApi();
  // A lista de divergentes abaixo usa `L.calcularFolha`, que agora também
  // depende de CCT/salário mínimo carregados — mesmo motivo do gate em
  // `T.telas.folha`.
  if (L.USA_BACKEND && !T._tabelasCarregadas) carregarTabelasDaApi();

  // A competência vem do seletor do topo: é o contexto do sistema inteiro.
  var comp = L.competenciaAberta();
  var periodo = L.periodoDe(comp);
  var fechada = L.periodoFechado(comp);
  var contas = L.contasDoMes(comp);
  var soma = function (fn) { return contas.filter(fn).reduce(function (a, c) { return a + c.valor; }, 0); };

  var previsto = soma(function () { return true; });
  var pago = soma(function (c) { return c.status === "PAGO"; });
  var aprovado = soma(function (c) { return c.status === "APROVADO" || c.status === "AGENDADO"; });
  var pendente = soma(function (c) { return c.status === "AGUARDANDO_APROVACAO" || c.status === "RASCUNHO"; });
  var vencido = soma(function (c) { return L.statusConta(c) === "VENCIDO"; });
  var apuracao = L.folhaDaCompetencia(comp);
  var folha = apuracao.valor;

  // Fechar e reabrir são atos reservados: quem não pode executar nem vê o
  // botão como se pudesse tentar — a explicação já vem no lugar dele.
  var podeFecharOuReabrir = L.podeExecutarReservada("fechar-competencia", L.estado.usuario);
  var seloReservado = '<span class="pastilha neutro">só a Direção fecha</span>';

  var acoes = fechada
    ? (podeFecharOuReabrir
        ? '<button class="botao" data-acao="reabrir-competencia">Reabrir competência</button>'
        : seloReservado)
    : (periodo
        ? '<button class="botao" data-acao="gerar-fechamento">Gerar relatório</button>' +
          (podeFecharOuReabrir
            ? ' <button class="botao primario" data-acao="fechar-competencia">Fechar competência</button>'
            : " " + seloReservado)
        : '<button class="botao primario" data-acao="abrir-competencia">Abrir competência</button>');

  var html = T.cabecalho("Fechamento de " + L.competenciaBR(comp),
    "Previsto, aprovado, pago e vencido, pelos grupos da contabilidade.", acoes);

  if (fechada) {
    html += '<div class="aviso-tela"><span aria-hidden="true">✓</span><div>' +
      "Competência <strong>fechada</strong> por " + U.esc(periodo.fechadoPor || "—") +
      " em " + L.dataBR(periodo.fechadoEm) + ". Os valores não mudam mais.</div></div>";
  } else if (periodo && periodo.movimentosCopiados > 0) {
    html += '<div class="aviso-tela"><span aria-hidden="true">·</span><div>' +
      "Aberta com <strong>" + periodo.movimentosCopiados + " lançamento(s)</strong> copiados de " +
      U.esc(L.competenciaBR(L.somarMeses(comp, -1))) + ". Ajuste só o que mudou.</div></div>";
  } else if (!periodo) {
    html += '<div class="aviso-tela"><span aria-hidden="true">·</span><div>' +
      "Competência ainda não aberta. Ao abrir, o movimento do mês anterior é copiado.</div></div>";
  }

  // Reabertura não é detalhe: é a pergunta que auditoria e contabilidade fazem
  // primeiro. Guardar no estado e não mostrar seria o mesmo que não guardar.
  if (periodo && periodo.historico && periodo.historico.length) {
    html += U.painelHtml("Fechamentos anteriores desta competência",
      periodo.historico.length + " reabertura(s)",
      U.tabelaHtml([
        { rotulo: "Fechada por", conteudo: function (h) {
          return '<div class="principal">' + U.esc(h.fechadoPor || "—") + "</div>" +
            '<div class="secundario">' + (h.fechadoEm ? L.dataBR(h.fechadoEm) : "—") + "</div>"; } },
        { rotulo: "Reaberta por", conteudo: function (h) {
          return U.esc(h.reabertoPor) + '<div class="secundario">' +
            L.dataBR(h.reabertoEm) + "</div>"; } },
        { rotulo: "Motivo", conteudo: function (h) { return U.esc(h.motivo); } }
      ], periodo.historico.map(function (h, i) { return Object.assign({ id: "h" + i }, h); })));
  }

  html += '<div class="painel">' +
    '<dl class="resumo">' + [
      { r: "Previsto", v: previsto }, { r: "Aprovado", v: aprovado }, { r: "Pago", v: pago },
      { r: "Pendente", v: pendente }, { r: "Vencido", v: vencido },
      { r: apuracao.doHistorico ? "Folha bruta dos colaboradores" : (L.impostosPelaContabilidade() ? "Custo da folha" : "Folha com encargos"), v: folha, forte: true }
    ].map(function (i) {
      return '<div class="resumo-item' + (i.forte ? " forte" : "") + '"><dt>' + i.r +
        '</dt><dd class="num">' + L.brl(i.v) + "</dd></div>";
    }).join("") + "</dl></div>";

  html += T.evolucaoFolha(comp);

  var porCategoria = {};
  // Categoria é opcional no lançamento; sem esta guarda a chave vira a
  // string "undefined" e aparece assim na tela.
  contas.forEach(function (c) {
    var cat = c.categoria || "Sem categoria";
    porCategoria[cat] = (porCategoria[cat] || 0) + c.valor;
  });
  // Rótulo diferente para não somar bruto com custo no mesmo gráfico sem aviso.
  var rotuloFolha = apuracao.doHistorico
    ? "Folha de colaboradores (bruto)"
    : (L.impostosPelaContabilidade() ? "Folha e pessoal" : "Folha e pessoal (com encargos)");
  if (folha > 0) porCategoria[rotuloFolha] = (porCategoria[rotuloFolha] || 0) + folha;
  var categorias = Object.keys(porCategoria).sort(function (a, b) { return porCategoria[b] - porCategoria[a]; });
  var maior = categorias.length ? porCategoria[categorias[0]] : 1;

  html += U.painelHtml("Despesas por grupo", L.competenciaBR(comp),
    categorias.length === 0
      ? U.vazioHtml("Sem despesas nesta competência",
          "Lance contas para " + L.competenciaBR(comp) + " ou troque o mês no topo.",
          { acao: "nova-conta", rotulo: "Lançar conta" })
      : categorias.map(function (nome) {
          var v = porCategoria[nome];
          return '<div class="barra-dado"><span>' + U.esc(nome) + "</span>" +
            '<span class="trilho"><span class="preenche" style="width:' + Math.max(2, Math.round((v / maior) * 100)) + '%"></span></span>' +
            '<span class="valor num">' + L.brl(v) + "</span></div>";
        }).join(""));

  return html;
};

T.acoes["gerar-fechamento"] = function () {
  // A mesma competência que T.telas.fechamento está mostrando — não "hoje".
  // `T.filtros.competencia` nunca chega a ser escrito em lugar nenhum do
  // código, então esse fallback antigo (L.competenciaAtual()) era na
  // prática sempre usado: o botão "Gerar relatório" de uma competência
  // futura ou passada gerava o relatório do mês corrente do calendário.
  var comp = L.competenciaAberta();
  var contas = L.contasDoMes(comp);
  var abertas = contas.filter(function (c) {
    return c.status !== "PAGO" && c.status !== "CANCELADO";
  });
  var divergentes = L.ativos().filter(function (f) {
    return L.calcularFolha(L.contratoDe(f), L.movimentoDe(f.id), f).avisos
      .some(function (a) { return a.nivel === "divergencia"; });
  });

  var bloqueios = [];
  if (abertas.length) bloqueios.push(abertas.length + " conta(s) ainda em aberto na competência.");
  if (divergentes.length) bloqueios.push(divergentes.length + " funcionário(s) com divergência de folha.");

  U.abrirModal({
    titulo: "Fechamento de " + L.competenciaBR(comp),
    sub: bloqueios.length ? "Com pendências" : "Pronto para fechar",
    corpo: bloqueios.length
      ? '<div class="aviso-tela"><span aria-hidden="true">▲</span><div><strong>Dá para fechar, mas fica registrado com ressalva.</strong></div></div>' +
        "<ul style=\"margin:0;padding-left:18px;color:var(--tinta-media)\">" +
        bloqueios.map(function (b) { return "<li>" + U.esc(b) + "</li>"; }).join("") + "</ul>"
      : '<p style="margin:0;color:var(--tinta-media)">Contas liquidadas e folha sem divergência. Ao fechar, os valores ficam congelados.</p>',
    acoes: [
      { rotulo: "Cancelar", aoClicar: U.fecharModal },
      { rotulo: "Gerar relatório de fechamento", classe: "primario", aoClicar: function () {
        L.registrar("fechamento", { nome: "Fechamento " + comp }, "APROVAR");
        U.fecharModal();
        T.ir("relatorios");
      } }
    ]
  });
};

// ---------------------------------------------------------------- contratos

/** Mesmo padrão de T.ROTULOS_AUSENCIA (telas-c.js): nome de exibição, nunca
 * a constante interna. */
T.ROTULOS_TIPO_CONTRATO = {
  FORNECEDOR: "Fornecedor", PRESTADOR: "Prestador", SOFTWARE: "Software",
  MANUTENCAO: "Manutenção", LOCACAO: "Locação", SERVICO: "Serviço"
};
T.ROTULOS_PERIODICIDADE = { MENSAL: "Mensal", TRIMESTRAL: "Trimestral", SEMESTRAL: "Semestral", ANUAL: "Anual", UNICA: "Única" };
T.ROTULOS_STATUS_CONTRATO = { ATIVO: "Ativo", EM_RENOVACAO: "Em renovação", ENCERRADO: "Encerrado", RASCUNHO: "Rascunho" };

T._contratosCarregados = false;
T._carregandoContratos = false;

function carregarContratosDaApi() {
  if (T._carregandoContratos) return;
  T._carregandoContratos = true;
  L.api.get("/api/contratos").then(function (lista) {
    L.estado.contratos = lista || [];
    T._contratosCarregados = true;
    T._carregandoContratos = false;
    T.renderizar();
  }).catch(function (erro) {
    T._carregandoContratos = false;
    console.error("Não foi possível carregar contratos:", erro);
    U.avisar("Não foi possível carregar a lista de contratos agora.");
  });
}

T.acoes["novo-contrato"] = function (id) {
  var atual = id ? L.buscarPorId("contratos", id) : null;
  U.abrirFormulario({
    titulo: atual ? "Editar contrato" : "Cadastrar contrato",
    largo: true,
    campos: [
      { id: "objeto", rotulo: "Objeto do contrato", obrigatorio: true },
      { id: "tipo", rotulo: "Tipo", tipo: "select",
        opcoes: Object.keys(T.ROTULOS_TIPO_CONTRATO).map(function (k) { return { valor: k, rotulo: T.ROTULOS_TIPO_CONTRATO[k] }; }) },
      { id: "fornecedorId", rotulo: "Fornecedor", tipo: "select", par: true,
        opcoes: [{ valor: "", rotulo: "— sem fornecedor —" }].concat(
          L.estado.fornecedores.map(function (f) { return { valor: f.id, rotulo: f.razaoSocial }; })) },
      { id: "valor", rotulo: "Valor", tipo: "moeda", obrigatorio: true },
      { id: "inicio", rotulo: "Início", tipo: "data", obrigatorio: true, par: true, padrao: L.hoje() },
      { id: "fim", rotulo: "Fim", tipo: "data", dica: "Deixe vazio se for por prazo indeterminado." },
      { id: "periodicidade", rotulo: "Periodicidade", tipo: "select", par: true,
        opcoes: Object.keys(T.ROTULOS_PERIODICIDADE).map(function (k) { return { valor: k, rotulo: T.ROTULOS_PERIODICIDADE[k] }; }) },
      { id: "status", rotulo: "Status", tipo: "select",
        opcoes: Object.keys(T.ROTULOS_STATUS_CONTRATO).map(function (k) { return { valor: k, rotulo: T.ROTULOS_STATUS_CONTRATO[k] }; }) },
      { id: "observacoes", rotulo: "Observações", tipo: "textarea" }
    ],
    valores: atual ? Object.assign({}, atual, { valor: (atual.valor / 100).toFixed(2) })
      : { inicio: L.hoje(), status: "ATIVO", periodicidade: "MENSAL" },
    aoSalvar: function (v) {
      if (L.USA_BACKEND) {
        var corpo = {
          objeto: v.objeto, tipo: v.tipo || undefined, fornecedorId: v.fornecedorId || (atual ? "" : undefined),
          dataInicio: v.inicio, dataFim: v.fim || (atual ? "" : undefined), valorCentavos: v.valor,
          periodicidade: v.periodicidade || undefined, status: v.status || undefined,
          observacoes: v.observacoes || (atual ? "" : undefined),
        };
        var chamada = atual
          ? L.api.patch("/api/contratos/" + atual.id, corpo)
          : L.api.post("/api/contratos", corpo);
        chamada.then(function () {
          T._contratosCarregados = false;
          carregarContratosDaApi();
          U.fecharModal(); T.ir("contratos");
          U.avisar(atual ? "Contrato atualizado." : "Contrato cadastrado.");
        }).catch(function (erro) { U.avisar(erro.message || "Não foi possível salvar."); });
        return;
      }
      if (atual) L.atualizar("contratos", atual.id, v); else L.criar("contratos", v);
      U.fecharModal(); T.ir("contratos");
    }
  });
};

T.telas.contratos = function () {
  if (L.USA_BACKEND && !T._fornecedoresCarregados) carregarFornecedoresDaApi();
  if (L.USA_BACKEND && !T._contratosCarregados) carregarContratosDaApi();

  var lista = L.estado.contratos.slice().sort(function (a, b) {
    return (a.fim || "9999").localeCompare(b.fim || "9999");
  });

  var html = T.cabecalho("Contratos",
    "Alerta 90, 60, 30, 15 e 7 dias antes de cada vencimento.",
    T.botaoNovo("novo-contrato", "Cadastrar contrato"));

  html += '<div class="painel">' + U.tabelaHtml([
    { rotulo: "Objeto", conteudo: function (c) {
      var f = c.fornecedorId ? L.buscarPorId("fornecedores", c.fornecedorId) : null;
      return '<div class="principal">' + U.esc(c.objeto) + '</div><div class="secundario">' +
        U.esc(f ? f.razaoSocial : (T.ROTULOS_TIPO_CONTRATO[c.tipo] || c.tipo)) + "</div>"; } },
    { rotulo: "Vigência", conteudo: function (c) {
      return L.dataBR(c.inicio) + " → " + (c.fim ? L.dataBR(c.fim) : "indeterminado"); } },
    { rotulo: "Valor", direita: true, conteudo: function (c) {
      return '<span class="num">' + L.brl(c.valor) + "</span>" +
        '<div class="secundario">' + U.esc(T.ROTULOS_PERIODICIDADE[c.periodicidade] || c.periodicidade || "") + "</div>"; } },
    { rotulo: "Vencimento", direita: true, conteudo: function (c) {
      if (!c.fim) return '<span class="pastilha neutro">sem prazo</span>';
      var d = L.diasAte(c.fim);
      if (d < 0) return '<span class="pastilha critico">vencido</span>';
      if (d <= 30) return '<span class="pastilha critico">em ' + d + " dias</span>";
      if (d <= 90) return '<span class="pastilha pendente">em ' + d + " dias</span>";
      return '<span class="pastilha ok">em ' + d + " dias</span>"; } },
    { rotulo: "", direita: true, conteudo: function (c) {
      return '<button class="botao miudo" data-acao="novo-contrato" data-id="' + c.id + '">Editar</button>'; } }
  ], lista, {
    buscaLocal: "Contrato, fornecedor ou vencimento",
    tituloVazio: "Nenhum contrato cadastrado",
    textoVazio: "O sistema avisa antes de cada vencimento.",
    acaoVazio: { acao: "novo-contrato", rotulo: "Cadastrar o primeiro" }
  }) + "</div>";
  return html;
};


/** Faz o contrato mais novo valer desde a competência aberta (ex.: o que foi digitado entrou só a partir do mês seguinte). */
T.acoes["valer-desde"] = function (id) {
  var f = L.buscarPorId("funcionarios", id);
  if (!f) return;
  var comp = L.competenciaAberta();
  U.abrirModal({
    titulo: "Valer desde " + L.competenciaBR(comp),
    sub: T.nomeExibicao(f.nome),
    corpo: "<p>O contrato mais recente desta pessoa (salário, hora-aula, Ticket, MEI) passa a valer já em " + U.esc(L.competenciaBR(comp)) +
      ". Nenhum valor muda; só a data de início. Depois, clique em “Calcular folha”.</p>",
    acoes: [
      { rotulo: "Cancelar", aoClicar: U.fecharModal },
      { rotulo: "Aplicar", classe: "primario", aoClicar: function () {
        L.api.post("/api/funcionarios/" + id + "/valer-desde", { competencia: comp })
          .then(function () { return L.recarregarFuncionarios(); })
          .then(function () { U.fecharModal(); T.renderizar(); U.avisar("Contrato valendo desde " + L.competenciaBR(comp) + ". Clique em “Calcular folha” para atualizar."); })
          .catch(function (erro) { U.avisar(erro.message || "Não foi possível aplicar."); });
      } }
    ]
  });
};
