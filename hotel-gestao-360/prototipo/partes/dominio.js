/* ============================================================================
   Domínio: dinheiro, estado, motor de folha e derivações.
   Espelha src/dominio/ — mesma aritmética em centavos inteiros, mesmas regras.
   ========================================================================== */

var L = {};

/**
 * `false`: tudo em `localStorage`, como o protótipo sempre foi — é o modo do
 * artefato publicado e da demonstração, sem servidor por trás.
 * `true`: login e cadastro de acesso passam pelo servidor real
 * (`servidor/indice.ts`); ligado pelo build com `--com-backend`, nunca por
 * este arquivo sozinho, já que o mesmo `dominio.js` serve os dois modos.
 */
L.USA_BACKEND = false;

// ---------------------------------------------------------------- dinheiro

L.arredondar = function (v) {
  var sinal = v < 0 ? -1 : 1;
  return sinal * Math.floor(Math.abs(v) + 0.5 + 1e-9) || 0;
};
L.reais = function (v) { return L.arredondar(v * 100); };
L.pctDe = function (b, p) { return L.arredondar((b * p) / 100); };
L.fracDe = function (b, n, d) { return d === 0 ? 0 : L.arredondar((b * n) / d); };
L.mult = function (b, f) { return L.arredondar(b * f); };
/**
 * `toLocaleString` com opções monta um formatador novo a CADA chamada — 64
 * vezes mais caro que reaproveitar um. São 31 chamadas por folha calculada,
 * o que sozinho respondia por 3,5 dos 4,8 ms de cada cálculo.
 *
 * O formatador nasce na primeira chamada e vive pela sessão. Se o navegador
 * não tiver `Intl` (muito antigo), cai no caminho antigo em vez de quebrar.
 */
var formatadorBRL = null;
L.brl = function (c) {
  // Valor que o servidor escondeu (salário restrito) chega vazio: sai "—".
  if (c === null || c === undefined || c !== c) return "—";
  var v = c / 100;
  if (formatadorBRL === null) {
    try {
      formatadorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    } catch (e) {
      formatadorBRL = false;
    }
  }
  return formatadorBRL
    ? formatadorBRL.format(v)
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};
L.horas = function (minutos) {
  var sinal = minutos < 0 ? "−" : minutos > 0 ? "+" : "";
  var abs = Math.abs(minutos);
  return sinal + Math.floor(abs / 60) + "h" + String(abs % 60).padStart(2, "0");
};

// ---------------------------------------------------------------- datas

L.hoje = function () { return new Date().toISOString().slice(0, 10); };
L.competenciaAtual = function () { return L.hoje().slice(0, 7); };
/**
 * ISO (2026-08-31) para o formato brasileiro. Nem tudo que chega é ISO — a
 * planilha da escola traz "06/02/24" e "16.06.26" —, e montar às cegas
 * produzia "undefined/undefined/06/02/24" na ficha. O que não é ISO volta
 * como veio: melhor mostrar a data original que uma remontada errada.
 */
L.dataBR = function (iso) {
  if (!iso) return "—";
  var texto = String(iso);
  if (!/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto;
  var p = texto.slice(0, 10).split("-");
  return p[2] + "/" + p[1] + "/" + p[0];
};
L.competenciaBR = function (c) {
  var meses = ["janeiro","fevereiro","março","abril","maio","junho",
               "julho","agosto","setembro","outubro","novembro","dezembro"];
  var p = String(c).split("-");
  return meses[Number(p[1]) - 1] + " de " + p[0];
};
/**
 * Prazos que a folha de uma competência gera no mês seguinte. Feriados não
 * entram na conta: perto de um feriado, confira a data.
 */
L.prazosFolha = function (comp) {
  var p = String(comp).split("-").map(Number);
  var ano = p[1] === 12 ? p[0] + 1 : p[0], mes = p[1] === 12 ? 1 : p[1] + 1;
  var iso = function (d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  // Vencimento em fim de semana antecipa para a sexta.
  var antecipado = function (dia) {
    var d = new Date(ano, mes - 1, dia);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return iso(d);
  };
  // Salário: 5º dia útil, contando o sábado e pulando o domingo.
  var d = new Date(ano, mes - 1, 1), uteis = 0;
  for (;;) { if (d.getDay() !== 0 && ++uteis === 5) break; d.setDate(d.getDate() + 1); }
  return [
    { nome: "Pagamento dos salários", detalhe: "5º dia útil", data: iso(d) },
    { nome: "eSocial", detalhe: "envio da folha", data: antecipado(15) },
    { nome: "FGTS Digital", detalhe: "guia do FGTS", data: antecipado(20) },
    { nome: "DCTFWeb", detalhe: "INSS e IRRF", data: antecipado(20) }
  ];
};

L.diasAte = function (iso) {
  if (!iso) return null;
  var alvo = new Date(iso + "T00:00:00");
  var agora = new Date(L.hoje() + "T00:00:00");
  return Math.round((alvo - agora) / 86400000);
};
L.diasNoMes = function (comp) {
  var p = comp.split("-");
  return new Date(Date.UTC(Number(p[0]), Number(p[1]), 0)).getUTCDate();
};
L.somarMeses = function (comp, n) {
  var p = comp.split("-");
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1 + n, 1));
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
};
L.primeiroDia = function (comp) { return comp + "-01"; };
L.ultimoDia = function (comp) { return comp + "-" + String(L.diasNoMes(comp)).padStart(2, "0"); };

/**
 * Quantos dias do mês o vínculo esteve ativo — espelha
 * `src/dominio/comum/competencia.ts`. Sem isso, quem foi admitido dia 25
 * recebia o mês inteiro, e quem só é admitido em outubro já aparecia pesando
 * na folha de agosto: o motor não conhecia "hoje", só a data do contrato.
 *
 * Só cobre ADMISSÃO — desligamento no meio do mês pede rescisão (saldo de
 * salário, aviso, 13º e férias proporcionais), que este sistema ainda não
 * calcula (mesma lacuna documentada no README para 13º/férias/rescisão).
 */
L.janelaTrabalhada = function (competencia, dataAdmissao) {
  var inicioMes = L.primeiroDia(competencia);
  var fimMes = L.ultimoDia(competencia);
  var total = L.diasNoMes(competencia);

  if (!dataAdmissao || dataAdmissao <= inicioMes) {
    return { dias: total, totalDeDias: total, fator: 1, parcial: false, admitiuNoMes: false };
  }
  if (dataAdmissao > fimMes) {
    return { dias: 0, totalDeDias: total, fator: 0, parcial: true, admitiuNoMes: false };
  }
  var diaInicio = Number(dataAdmissao.slice(8, 10));
  var dias = total - diaInicio + 1;
  return { dias: dias, totalDeDias: total, fator: dias / total, parcial: dias < total, admitiuNoMes: true };
};

// ---------------------------------------------------------------- estado
// Em memória. No sistema real cada coleção é uma tabela do PostgreSQL, com a
// trilha de auditoria gravada por trigger — nada some, nada se sobrescreve.

L.estado = {
  usuario: null,
  /** Competência em que o sistema está operando. Todo o resto segue ela. */
  competencia: null,
  /** Ciclo mensal: uma linha por competência aberta. */
  periodos: [],
  /** Diretório de contas. Quem pode entrar, com que perfil e que exceção. */
  usuarios: [],
  /** Cache do diretório de acesso quando `L.USA_BACKEND` está ligado — vem de
   * `/api/acesso/usuarios`, nunca escrito por `L.entrarOuCriarUsuario` e nunca
   * lido pela tela de Controle de Acesso em modo local (esse usa `usuarios`
   * acima). Mantidos separados para não misturar os dois modelos de dado. */
  usuariosAcesso: [],
  /** O que variou no mês, por funcionário. Uma linha por (competência, pessoa). */
  movimentos: [],
  funcionarios: [],
  fornecedores: [],
  contas: [],
  contratos: [],
  solicitacoes: [],
  ausencias: [],
  documentos: [],
  lancamentosBanco: [],
  pontos: [],
  auditoria: [],
  /** Tabelas legais (INSS, IRRF) por vigência. Uma por exercício. */
  tabelas: [],
  /** A legenda da planilha: o que mudou no mês, por competência. */
  observacoes: [],
  proximoNumero: 1
};

L.id = function () { return "id-" + Math.random().toString(36).slice(2, 10); };

// ---------------------------------------------------------------- persistência
//
// Guarda o estado no navegador de quem usa. Não é banco de dados: vale para
// um computador e uma pessoa. É o que separa "demonstração" de "dá para
// começar a usar" enquanto o servidor não existe.
//
// Quando o backend entrar, `L.persistir` e `L.restaurar` viram as duas únicas
// funções a trocar por chamadas de API — o resto do domínio não muda.

L.CHAVE = "hotel-gestao-360";
// 2: as tabelas legais deixaram de ser constante no código e viraram cadastro
// com vigência em `estado.tabelas`. Payload da versão 1 é descartado no
// restaurar — é carga de demonstração, não folha fechada de ninguém.
L.VERSAO_DADOS = 2;

// ---------------------------------------------------------------- hierarquia
//
// Dois eixos diferentes, que costumam ser confundidos:
//
//   NÍVEL   — quem manda em quem. Define quem pode ser aprovador de quem e
//             quem enxerga o dado de quem.
//   ALÇADA  — até quanto cada nível decide sozinho. Uma compra de R$ 200 não
//             precisa da Direção; uma de R$ 20.000 precisa.
//
// Separar os dois é o que evita a armadilha clássica: dar poder de aprovar
// R$ 50 mil a quem só precisava liberar material de papelaria.

L.NIVEIS = {
  DIRECAO:        { ordem: 1, nome: "Direção", aprovaAte: null },
  FINANCEIRO:     { ordem: 2, nome: "Financeiro", aprovaAte: 2000000 },
  RH:             { ordem: 2, nome: "Recursos Humanos", aprovaAte: 1000000 },
  ADMINISTRATIVO: { ordem: 3, nome: "Administrativo", aprovaAte: 500000 },
  COORDENACAO:    { ordem: 3, nome: "Gerência de Setor", aprovaAte: 200000 },
  GESTOR:         { ordem: 4, nome: "Gestor de equipe", aprovaAte: 100000 },
  SECRETARIA:     { ordem: 5, nome: "Secretaria", aprovaAte: 0 },
  CONSULTA:       { ordem: 6, nome: "Consulta", aprovaAte: 0 }
};

/** Até quanto este perfil decide sozinho. `null` = sem teto. */
L.alcadaDe = function (perfil) {
  var n = L.NIVEIS[perfil];
  return n ? n.aprovaAte : 0;
};

L.podeAprovarValor = function (perfil, valor) {
  var teto = L.alcadaDe(perfil);
  if (teto === null) return true;
  return teto > 0 && (valor || 0) <= teto;
};

/**
 * Cadeia de aprovação exigida por um valor: do nível mais baixo que ainda
 * decide sozinho até a Direção, quando o valor passa de todos os tetos.
 */
L.cadeiaDeAprovacao = function (valor) {
  var v = valor || 0;
  // Ordena por TETO crescente, não por nível: a decisão sobe pelo valor que
  // cada um pode aprovar. Ordenar por hierarquia colocava a Coordenação
  // (teto de R$ 2 mil) depois do Administrativo (R$ 5 mil), o que faria a
  // solicitação descer no meio do caminho.
  var niveis = Object.keys(L.NIVEIS)
    .filter(function (p) { return L.NIVEIS[p].aprovaAte !== 0; })
    .sort(function (a, b) {
      var ta = L.NIVEIS[a].aprovaAte, tb = L.NIVEIS[b].aprovaAte;
      if (ta === null) return 1;   // sem teto vai para o fim
      if (tb === null) return -1;
      return ta - tb;
    });

  var cadeia = [];
  var resolvido = false;
  for (var i = 0; i < niveis.length; i++) {
    var p = niveis[i];
    cadeia.push(p);
    // Encontrou quem decide sozinho: a cadeia para aqui e não sobe mais.
    if (L.podeAprovarValor(p, v)) { resolvido = true; break; }
  }
  // Só quando nenhum teto cobre o valor a decisão sobe até a Direção.
  if (!resolvido && cadeia.indexOf("DIRECAO") === -1) cadeia.push("DIRECAO");
  return cadeia;
};

L.brlAlcada = function (perfil) {
  var teto = L.alcadaDe(perfil);
  if (teto === null) return "sem limite";
  if (teto === 0) return "não aprova";
  return "até " + L.brl(teto);
};

// ---------------------------------------------------------------- ciclo mensal
//
// A folha não é uma foto do mês corrente: é uma série. Cada competência abre,
// recebe o que variou, é conferida e fecha. Fechada, não muda mais.
//
// Abrir um mês novo COPIA o movimento do anterior. Na prática quase nada muda
// de um mês para o outro — o RH ajusta só quem entrou, saiu ou mudou de carga,
// em vez de redigitar 43 professores.

L.STATUS_PERIODO = {
  ABERTO: { rotulo: "Aberto", tom: "pendente" },
  // Os quatro abaixo só existem no banco real (`folha_periodos.status`) —
  // o protótipo local nunca teve estado intermediário entre "aberto" e
  // "conferido/fechado", ia direto de um pro outro em `L.fecharCompetencia`.
  EM_CALCULO: { rotulo: "Aberto — ainda sem cálculo", tom: "pendente" },
  COM_DIVERGENCIA: { rotulo: "Calculado, com divergência", tom: "critico" },
  APROVADO: { rotulo: "Aprovado", tom: "destaque" },
  ENVIADO_CONTABILIDADE: { rotulo: "Enviado à contabilidade", tom: "destaque" },
  CONFERIDO: { rotulo: "Conferido", tom: "destaque" },
  FECHADO: { rotulo: "Fechado", tom: "ok" }
};

L.competenciaAberta = function () {
  return L.estado.competencia || L.competenciaAtual();
};

L.periodoDe = function (comp) {
  return L.estado.periodos.find(function (p) { return p.competencia === comp; }) || null;
};

L.periodoFechado = function (comp) {
  var p = L.periodoDe(comp);
  return !!p && p.status === "FECHADO";
};

/**
 * Abre uma competência. Copia o movimento da anterior como ponto de partida:
 * é isso que faz o mês seguinte custar minutos em vez de uma tarde.
 */
L.abrirCompetencia = function (comp) {
  if (L.periodoDe(comp)) return L.periodoDe(comp);

  var anterior = L.somarMeses(comp, -1);
  var copiados = 0;
  L.estado.movimentos
    .filter(function (m) { return m.competencia === anterior; })
    .forEach(function (m) {
      // Mesma regra do servidor: só o recorrente atravessa o mês; falta,
      // avulsa, substituição e hora extra começam zeradas.
      var copia = {
        funcionarioId: m.funcionarioId,
        aulasExtrasSemanais: m.aulasExtrasSemanais || 0,
        valorHoraExtra: m.valorHoraExtra || 0,
        aulasNoturnas: m.aulasNoturnas || 0,
        horasNoturnas: m.horasNoturnas || 0,
        valeTransporte: m.valeTransporte || 0
      };
      copia.competencia = comp;
      copia.copiadoDe = anterior;
      L.criar("movimentos", copia);
      copiados++;
    });

  var p = L.criar("periodos", {
    competencia: comp,
    status: "ABERTO",
    abertoPor: L.estado.usuario ? L.estado.usuario.nome : "sistema",
    movimentosCopiados: copiados
  });
  L.estado.competencia = comp;
  L.versao++;
  L.persistir();
  return p;
};

/**
 * Fechar CONGELA as tabelas usadas dentro do próprio período — cópia, não
 * referência. Sem isso, o RH editar a tabela em novembro mudaria a folha de
 * agosto que já foi paga e enviada à contabilidade. É o mesmo que o banco faz
 * guardando `tabela_inss_id` em `folha_periodos`, com a diferença de que aqui
 * a cópia é o próprio registro: nada some se a tabela for apagada depois.
 */
/** Folha apurada e gravada no fechamento, se houver. */
L.folhaApurada = function (funcionarioId, comp) {
  var p = L.periodoDe(comp);
  if (!p || p.status !== "FECHADO" || !p.folhaApurada) return null;
  return p.folhaApurada[funcionarioId] || null;
};

L.fecharCompetencia = function (comp) {
  var p = L.periodoDe(comp);
  if (!p) return null;
  p.status = "FECHADO";
  p.fechadoPor = L.estado.usuario ? L.estado.usuario.nome : "sistema";
  p.fechadoEm = new Date().toISOString();
  p.tabelasUsadas = {
    INSS: clonar(L.tabelaVigente("INSS", comp)),
    IRRF: clonar(L.tabelaVigente("IRRF", comp))
  };
  // Grava a folha de cada um como ela ficou, com rubricas e memória de
  // cálculo. É o holerite: precisa poder ser reemitido igual daqui a cinco
  // anos, mesmo que o contrato, a CCT e as tabelas tenham mudado três vezes.
  p.folhaApurada = {};
  L.ativos().forEach(function (f) {
    p.folhaApurada[f.id] = clonar(L.calcular(f, comp));
  });
  L.versao++;
  L.registrar("periodos", { nome: "Competência " + comp }, "APROVAR");
  L.persistir();
  return p;
};

function clonar(o) { return o ? JSON.parse(JSON.stringify(o)) : null; }

/**
 * Reabrir uma folha já fechada é o ato mais sensível do sistema: ela pode ter
 * sido paga e enviada à contabilidade. Por isso exige justificativa escrita e
 * guarda o ciclo inteiro em `historico` — auditoria não pergunta "está
 * fechada?", pergunta "quantas vezes foi reaberta, por quem e por quê".
 */
L.reabrirCompetencia = function (comp, motivo) {
  var p = L.periodoDe(comp);
  if (!p) return null;
  var texto = String(motivo || "").trim();
  if (texto.length < 10) {
    return { ok: false, erro: "Descreva em pelo menos 10 caracteres por que a folha precisa ser reaberta." };
  }

  if (!p.historico) p.historico = [];
  p.historico.push({
    fechadoPor: p.fechadoPor || null,
    fechadoEm: p.fechadoEm || null,
    reabertoPor: L.estado.usuario ? L.estado.usuario.nome : "sistema",
    reabertoEm: new Date().toISOString(),
    motivo: texto,
    // A folha apurada daquele fechamento vai junto: reabrir não pode apagar o
    // que já tinha sido apurado e eventualmente pago.
    folhaApurada: p.folhaApurada || null,
    tabelasUsadas: p.tabelasUsadas || null
  });

  p.status = "ABERTO";
  delete p.fechadoEm;
  delete p.fechadoPor;
  delete p.folhaApurada;
  delete p.tabelasUsadas;
  L.versao++;
  L.registrar("periodos",
    { nome: "Competência " + comp + " reaberta — " + texto }, "ALTERAR");
  L.persistir();
  return { ok: true, periodo: p };
};

L.trocarCompetencia = function (comp) {
  L.estado.competencia = comp;
  L.versao++;
  L.persistir();
};

/** Competências com período aberto, mais as do histórico importado. */
L.competenciasConhecidas = function () {
  var vistas = {};
  L.estado.periodos.forEach(function (p) { vistas[p.competencia] = true; });
  if (L.DADOS_REAIS && L.DADOS_REAIS.historico) {
    L.DADOS_REAIS.historico.forEach(function (h) { vistas[h.competencia] = true; });
  }
  vistas[L.competenciaAberta()] = true;
  return Object.keys(vistas).sort();
};

/** A próxima competência a abrir, depois da última conhecida. */
L.proximaCompetencia = function () {
  var conhecidas = L.competenciasConhecidas();
  return L.somarMeses(conhecidas[conhecidas.length - 1], 1);
};

// ---------------------------------------------------------------- diretório e delegação
//
// Autorização por perfil (T.PERFIS) é regra fixa — o que cada cargo enxerga.
// Isto aqui é a exceção controlada: o dono concede a UMA pessoa acesso a UM
// módulo que o perfil dela não inclui, sem abrir aquele módulo para o cargo
// inteiro. E existe um punhado de atos que nenhuma delegação destrava —
// fechar a competência, gerenciar quem tem acesso — porque são decisão de
// quem responde pela escola, não tarefa operacional.

L.normalizarEmail = function (email) { return String(email || "").trim().toLowerCase(); };

L.usuarioPorEmail = function (email) {
  var e = L.normalizarEmail(email);
  return L.estado.usuarios.find(function (u) { return u.email === e; }) || null;
};

/**
 * Chamado ao criar conta. Quem já existe não se promove reabrindo o
 * formulário com outro perfil no seletor — entra com o que já está
 * registrado. O primeiro usuário do sistema vira administrador: alguém
 * precisa poder nomear os demais antes de existir alguém para nomear.
 */
L.entrarOuCriarUsuario = function (nome, email, perfilEscolhido) {
  var existente = L.usuarioPorEmail(email);
  if (existente) {
    existente.nome = nome;
    L.persistir();
    return { registro: existente, jaExistia: true };
  }
  var registro = {
    id: L.id(), nome: nome, email: L.normalizarEmail(email),
    perfil: perfilEscolhido, administrador: L.estado.usuarios.length === 0,
    extras: [], ativo: true, criadoEm: new Date().toISOString()
  };
  L.estado.usuarios.push(registro);
  L.versao++;
  L.registrar("usuarios", { nome: nome }, "CRIAR");
  L.persistir();
  return { registro: registro, jaExistia: false };
};

/** Diretores e administradores concedem e retiram acesso de outras contas. */
L.podeDelegar = function (usuario) {
  return !!usuario && (usuario.perfil === "DIRECAO" || !!usuario.administrador);
};

/** Ações que nenhuma delegação destrava — só quem decide de fato. */
L.ACOES_RESERVADAS = {
  "fechar-competencia": "Fechar a competência trava os valores da folha. É decisão final, reservada à Direção.",
  "reabrir-competencia": "Reabrir uma competência fechada desfaz uma decisão já tomada — só a Direção volta atrás.",
  "gerenciar-acessos": "Conceder ou tirar o acesso de alguém é decisão de quem responde pelo hotel.",
  "excluir-funcionario": "Excluir um cadastro apaga o registro de vez, sem volta — só quem decide pelo hotel faz isso."
};

L.podeExecutarReservada = function (acaoId, usuario) {
  if (!L.ACOES_RESERVADAS[acaoId]) return true;
  return !!usuario && (usuario.perfil === "DIRECAO" || !!usuario.administrador);
};

L.definirPerfilUsuario = function (usuarioId, perfil) {
  var u = L.estado.usuarios.find(function (x) { return x.id === usuarioId; });
  if (!u) return null;
  u.perfil = perfil;
  L.versao++; L.registrar("usuarios", { nome: u.nome }, "ALTERAR"); L.persistir();
  return u;
};

L.definirExtra = function (usuarioId, chave, concedido) {
  var u = L.estado.usuarios.find(function (x) { return x.id === usuarioId; });
  if (!u) return null;
  u.extras = u.extras || [];
  var i = u.extras.indexOf(chave);
  if (concedido && i === -1) u.extras.push(chave);
  if (!concedido && i !== -1) u.extras.splice(i, 1);
  L.versao++; L.registrar("usuarios", { nome: u.nome }, "ALTERAR"); L.persistir();
  return u;
};

L.definirAtivo = function (usuarioId, ativo) {
  var u = L.estado.usuarios.find(function (x) { return x.id === usuarioId; });
  if (!u) return null;
  u.ativo = !!ativo;
  L.versao++; L.registrar("usuarios", { nome: u.nome }, "ALTERAR"); L.persistir();
  return u;
};

/** Só um administrador nomeia outro — evita corrente de auto-promoção. */
L.definirAdministrador = function (usuarioId, administrador, quemPede) {
  if (!quemPede || !quemPede.administrador) return null;
  var u = L.estado.usuarios.find(function (x) { return x.id === usuarioId; });
  if (!u) return null;
  u.administrador = !!administrador;
  L.versao++; L.registrar("usuarios", { nome: u.nome }, "ALTERAR"); L.persistir();
  return u;
};

// ---------------------------------------------------------------- roteamento
//
// Uma solicitação tem UM responsável por vez. Sem isso ela aparece para todo
// mundo que enxerga a tela de aprovações, e a primeira pessoa a clicar decide
// sozinha — inclusive um valor muito acima da própria alçada.
//
// A cadeia é fixada no momento em que a solicitação é criada. Mudar o teto de
// um perfil depois não pode reescrever o caminho de um pedido já em curso.

L.abrirSolicitacao = function (dados) {
  var cadeia = L.cadeiaDeAprovacao(dados.valor || 0);

  // Ninguém aprova o próprio pedido. Sem isto, a Coordenação abria uma compra
  // de R$ 3.000 e assinava embaixo quando a cadeia chegava nela — segregação
  // de funções é justamente o que impede isso.
  var solicitante = dados.perfilSolicitante;
  if (solicitante && solicitante !== "DIRECAO") {
    cadeia = cadeia.filter(function (p) { return p !== solicitante; });
    // Tirar o solicitante pode deixar a cadeia terminando em quem NÃO tem
    // alçada para o valor — o pedido sairia "aprovado" por alguém sem poder
    // para aquilo. Nesse caso, e quando não sobra ninguém, a decisão sobe.
    var ultimo = cadeia[cadeia.length - 1];
    if (!ultimo || !L.podeAprovarValor(ultimo, dados.valor || 0)) {
      cadeia.push("DIRECAO");
    }
  }

  return L.criar("solicitacoes", Object.assign({}, dados, {
    numero: L.estado.proximoNumero++,
    status: "EM_APROVACAO",
    cadeia: cadeia,
    etapa: 0,
    delegacoes: {},
    decisoes: []
  }));
};

/** De quem é a vez. Respeita delegação da etapa. */
L.responsavelPor = function (s) {
  if (!s.cadeia || !s.cadeia.length) return null;
  if (s.etapa >= s.cadeia.length) return null;
  var perfil = s.cadeia[s.etapa];
  return (s.delegacoes && s.delegacoes[perfil]) || perfil;
};

L.estaAberta = function (s) {
  return s.status === "SOLICITADO" || s.status === "EM_APROVACAO" ||
    s.status === "ALTERACAO_SOLICITADA";
};

/**
 * A Direção pode decidir em qualquer etapa — puxar a decisão para si é
 * legítimo e fica registrado como tal. Ninguém mais decide fora da sua vez.
 */
L.podeDecidir = function (s, perfil) {
  if (!L.estaAberta(s)) return false;
  // Segunda tranca: mesmo que uma delegação aponte para o perfil de quem
  // pediu, ele não decide o próprio pedido.
  if (perfil && perfil === s.perfilSolicitante && perfil !== "DIRECAO") return false;
  if (perfil === "DIRECAO") return true;
  return L.responsavelPor(s) === perfil;
};

L.aguardandoMim = function (perfil) {
  return L.estado.solicitacoes.filter(function (s) {
    return L.estaAberta(s) && L.responsavelPor(s) === perfil;
  });
};

/** Abertas que passaram ou vão passar por mim, mas não são a minha vez agora. */
L.acompanhandoEu = function (perfil) {
  return L.estado.solicitacoes.filter(function (s) {
    if (!L.estaAberta(s)) return false;
    if (L.responsavelPor(s) === perfil) return false;
    return (s.cadeia || []).indexOf(perfil) !== -1;
  });
};

L.decidirSolicitacao = function (s, decisao, quem, comentario) {
  var registro = {
    decisao: decisao,
    por: quem.nome,
    perfil: quem.perfil,
    etapa: s.etapa,
    naVez: L.responsavelPor(s) === quem.perfil,
    comentario: comentario || "",
    quando: new Date().toISOString()
  };
  s.decisoes.push(registro);

  if (decisao === "REJEITAR") {
    s.status = "REJEITADO";
  } else if (decisao === "SOLICITAR_ALTERACAO") {
    s.status = "ALTERACAO_SOLICITADA";
  } else if (quem.perfil === "DIRECAO") {
    // Quem responde pela escola decide em última instância: aprovou, acabou.
    // Antes a Direção só avançava um degrau e o pedido continuava dependendo
    // de Coordenação e Administrativo — a decisão de quem manda ficava
    // aguardando o aval de quem responde a ela.
    s.etapa = s.cadeia.length;
    s.status = "APROVADO";
  } else {
    // Aprovar avança uma etapa. Só quando a cadeia acaba o pedido está
    // realmente aprovado — antes disso ele segue para o próximo responsável.
    s.etapa += 1;
    s.status = s.etapa >= s.cadeia.length ? "APROVADO" : "EM_APROVACAO";
  }

  L.versao++;
  L.registrar("solicitacoes", s, decisao);
  L.persistir();
  return s.status;
};

/** Passa a MINHA etapa para outro perfil, sem alterar o resto da cadeia. */
L.delegar = function (s, dePerfil, paraPerfil, quem, motivo) {
  if (!s.delegacoes) s.delegacoes = {};
  s.delegacoes[dePerfil] = paraPerfil;
  s.decisoes.push({
    decisao: "DELEGAR",
    por: quem.nome,
    perfil: quem.perfil,
    etapa: s.etapa,
    comentario: "Delegado para " + (L.NIVEIS[paraPerfil] ? L.NIVEIS[paraPerfil].nome : paraPerfil) +
      (motivo ? " — " + motivo : ""),
    quando: new Date().toISOString()
  });
  L.versao++;
  L.registrar("solicitacoes", s, "ALTERAR");
  L.persistir();
};

/** Perfis que podem receber uma delegação: só quem tem alçada para o valor. */
L.candidatosDelegacao = function (s, perfilAtual) {
  return Object.keys(L.NIVEIS).filter(function (p) {
    return p !== perfilAtual && L.podeAprovarValor(p, s.valor || 0);
  });
};

// ---------------------------------------------------------------- painel
//
// Cada gestor escolhe o que aparece na tela inicial. Direção e Financeiro
// olham a mesma escola por ângulos diferentes, e um painel que serve aos dois
// acaba não servindo a nenhum.

L.BLOCOS_PAINEL = [
  { id: "kpi-pagar7", grupo: "Indicadores", nome: "A pagar em 7 dias",
    descricao: "Quanto vence nesta semana." },
  { id: "kpi-contasMes", grupo: "Indicadores", nome: "Contas do mês",
    descricao: "Total lançado na competência e quanto já foi pago." },
  { id: "kpi-folha", grupo: "Indicadores", nome: "Folha estimada",
    descricao: "Custo total da folha dos funcionários ativos." },
  { id: "kpi-aprovacao", grupo: "Indicadores", nome: "Aguardando aprovação",
    descricao: "Pagamentos parados esperando decisão." },
  { id: "kpi-banco", grupo: "Indicadores", nome: "Banco de horas negativo",
    descricao: "Quantos funcionários devem horas." },
  { id: "kpi-contratos", grupo: "Indicadores", nome: "Contratos vencendo",
    descricao: "O que encerra nos próximos 90 dias." },
  { id: "atencao", grupo: "Painéis", nome: "Precisa da sua atenção",
    descricao: "Os alertas clicáveis que levam à tela onde se resolve." },
  { id: "configuracao", grupo: "Painéis", nome: "Configuração inicial",
    descricao: "A trilha do que falta cadastrar. Some sozinha quando tudo estiver pronto." },
  { id: "evolucao", grupo: "Painéis", nome: "Evolução da folha",
    descricao: "A folha de colaboradores mês a mês, com a variação." }
];

/**
 * Padrão por perfil. Direção decide sobre exposição financeira, aprovações e
 * risco de contrato — banco de horas por funcionário é ruído operacional na
 * mesa dela, por mais que seja o pão de cada dia do RH. Cada perfil começa no
 * que costuma abrir primeiro; a personalização é o ajuste fino em cima disso,
 * não a única fonte de verdade.
 */
L.PAINEL_PADRAO_POR_PERFIL = {
  DIRECAO: ["kpi-pagar7", "kpi-contasMes", "kpi-folha", "kpi-aprovacao",
            "kpi-contratos", "atencao", "configuracao", "evolucao"],
  FINANCEIRO: ["kpi-pagar7", "kpi-contasMes", "kpi-folha", "kpi-aprovacao",
               "kpi-banco", "kpi-contratos", "atencao", "evolucao"],
  RH: ["kpi-banco", "kpi-folha", "kpi-aprovacao", "atencao", "configuracao"],
  ADMINISTRATIVO: ["kpi-pagar7", "kpi-contasMes", "kpi-aprovacao", "kpi-contratos", "atencao"],
  COORDENACAO: ["kpi-aprovacao", "kpi-banco", "atencao"],
  SECRETARIA: ["kpi-aprovacao", "atencao"],
  GESTOR: ["kpi-aprovacao", "kpi-banco", "atencao"],
  CONSULTA: ["kpi-pagar7", "kpi-contasMes", "kpi-folha", "atencao"]
};

L.preferencias = { painel: {}, alertas: {} };

L.blocoVisivel = function (id) {
  var p = L.preferencias.painel || {};
  // Preferência explícita do gestor sempre vence. Sem ela, cai no padrão do
  // perfil; sem perfil reconhecido, mostra tudo em vez de esconder por engano.
  if (Object.prototype.hasOwnProperty.call(p, id)) return p[id];
  var perfil = L.estado.usuario ? L.estado.usuario.perfil : null;
  var padrao = L.PAINEL_PADRAO_POR_PERFIL[perfil];
  return padrao ? padrao.indexOf(id) !== -1 : true;
};

L.definirBloco = function (id, visivel) {
  if (!L.preferencias.painel) L.preferencias.painel = {};
  L.preferencias.painel[id] = !!visivel;
  L.persistir();
};

L.restaurarPainel = function () {
  L.preferencias.painel = {};
  L.persistir();
};

L.blocosOcultos = function () {
  return L.BLOCOS_PAINEL.filter(function (b) { return !L.blocoVisivel(b.id); }).length;
};

/** Categorias de alerta que o gestor pode silenciar. */
L.TIPOS_ALERTA = [
  { id: "contas", nome: "Contas vencendo e vencidas" },
  { id: "contratos", nome: "Contratos perto do fim" },
  { id: "banco", nome: "Banco de horas fora do limite" },
  { id: "aprovacoes", nome: "Solicitações aguardando decisão" },
  { id: "documentos", nome: "Documentos vencendo" },
  { id: "folha", nome: "Divergências de folha" },
  { id: "tabelas", nome: "Tabelas legais vencendo" },
  { id: "pessoas", nome: "Experiência, férias e cadastro incompleto" }
];

L.alertaVisivel = function (destino) {
  var a = L.preferencias.alertas || {};
  return a[destino] !== false;
};

L.definirAlerta = function (destino, visivel) {
  if (!L.preferencias.alertas) L.preferencias.alertas = {};
  L.preferencias.alertas[destino] = !!visivel;
  L.persistir();
};

var salvamentoPendente = null;

L.persistir = function () {
  // Agrupa gravações do mesmo ciclo: cadastrar 43 professores não deve
  // serializar o estado 43 vezes.
  if (salvamentoPendente) clearTimeout(salvamentoPendente);
  salvamentoPendente = setTimeout(function () {
    salvamentoPendente = null;
    try {
      localStorage.setItem(L.CHAVE, JSON.stringify({
        versao: L.VERSAO_DADOS,
        gravadoEm: new Date().toISOString(),
        // Com o servidor ligado, o que já vive no banco não fica no navegador.
        estado: typeof L.filtrarParaLocal === "function" ? L.filtrarParaLocal(L.estado) : L.estado,
        preferencias: L.preferencias
      }));
    } catch (e) {
      // Cota estourada ou navegação anônima: o sistema continua funcionando
      // em memória, mas quem usa precisa saber que não vai persistir.
      L.avisoPersistencia = "Não foi possível salvar neste navegador. " +
        (e && e.name === "QuotaExceededError"
          ? "O armazenamento local está cheio."
          : "Pode ser navegação anônima ou bloqueio de dados do site.");
    }
  }, 0);
};

L.restaurar = function () {
  var bruto = null;
  try { bruto = localStorage.getItem(L.CHAVE); } catch (e) { return false; }
  if (!bruto) return false;
  try {
    var dados = JSON.parse(bruto);
    if (dados.versao !== L.VERSAO_DADOS) {
      // Mudou o formato dos dados (uma coluna nova, uma categoria nova) —
      // a carga de demonstração de fato não serve mais e é descartada. Mas o
      // diretório de contas não é carga de demonstração: é quem já pode
      // entrar e com que perfil. Perder isso a cada atualização forçaria todo
      // mundo a se cadastrar de novo — e pior, o primeiro a recriar a conta
      // vira Direção de novo, enquanto quem já era Direção cairia para
      // Consulta. Por isso o acesso atravessa a virada de versão sozinho.
      if (dados.estado && Array.isArray(dados.estado.usuarios) && dados.estado.usuarios.length) {
        L.estado.usuarios = dados.estado.usuarios;
        if (dados.estado.usuario) L.estado.usuario = dados.estado.usuario;
        L.persistir();
      }
      return false;
    }
    Object.keys(dados.estado).forEach(function (k) { L.estado[k] = dados.estado[k]; });
    if (!L.estado.tabelas) L.estado.tabelas = [];
    L.semearTabelas();
    if (dados.preferencias) L.preferencias = dados.preferencias;
    L.versao++;
    return true;
  } catch (e) {
    return false;
  }
};

L.apagarTudo = function () {
  try { localStorage.removeItem(L.CHAVE); } catch (e) { /* nada a fazer */ }
  Object.keys(L.estado).forEach(function (k) {
    if (Array.isArray(L.estado[k])) L.estado[k] = [];
  });
  L.estado.proximoNumero = 1;
  // Sem tabela nenhuma o motor nem calcula; a carga inicial volta (não
  // conferida, como sempre).
  L.semearTabelas();
  L.versao++;
};

L.gravadoEm = function () {
  try {
    var d = JSON.parse(localStorage.getItem(L.CHAVE) || "null");
    return d && d.gravadoEm ? d.gravadoEm : null;
  } catch (e) { return null; }
};

/** Toda escrita passa por aqui: é o que garante a trilha, como no banco. */
L.registrar = function (colecao, registro, acao) {
  L.estado.auditoria.unshift({
    id: L.id(),
    quando: new Date().toISOString(),
    autor: L.estado.usuario ? L.estado.usuario.nome : "sistema",
    acao: acao || "CRIAR",
    entidade: colecao,
    rotulo: registro.nome || registro.descricao || registro.titulo || registro.razaoSocial || registro.objeto || registro.id
  });
};

/**
 * Invariantes que no banco são CHECK constraints. Aqui elas vivem no domínio,
 * não na tela: validar só no formulário deixa a porta aberta para importação,
 * script e qualquer caminho novo que apareça depois.
 *
 * Devolvem uma lista de problemas; vazia significa registro aceitável.
 */
L.INVARIANTES = {
  // `CHECK (valor_centavos > 0)` em 003_financeiro.sql. Conta a pagar de valor
  // negativo é estorno disfarçado e desmonta todo somatório do fechamento.
  contas: function (c) {
    var p = [];
    if (!(c.valor > 0)) p.push("O valor da conta precisa ser maior que zero.");
    if (!c.vencimento) p.push("Informe o vencimento.");
    return p;
  },
  // `CHECK (data_fim >= data_inicio)` em 006_ponto_ausencias.sql.
  ausencias: function (a) {
    var p = [];
    if (a.inicio && a.fim && a.fim < a.inicio) {
      p.push("O fim da ausência não pode ser antes do início.");
    }
    return p;
  },
  contratos: function (c) {
    var p = [];
    if (c.valor !== undefined && !(c.valor > 0)) p.push("O valor do contrato precisa ser maior que zero.");
    if (c.inicio && c.fim && c.fim < c.inicio) p.push("O fim do contrato não pode ser antes do início.");
    return p;
  }
};

L.validarRegistro = function (colecao, registro) {
  var fn = L.INVARIANTES[colecao];
  return fn ? fn(registro) : [];
};

L.criar = function (colecao, registro) {
  var problemas = L.validarRegistro(colecao, registro);
  if (problemas.length) {
    // Lança em vez de devolver null: criar registro inválido em silêncio é
    // pior do que quebrar alto na hora de quem escreveu a chamada.
    throw new Error(problemas.join(" "));
  }
  registro.id = registro.id || L.id();
  registro.criadoEm = new Date().toISOString();
  L.estado[colecao].push(registro);
  L.versao++;
  L.registrar(colecao, registro, "CRIAR");
  L.persistir();
  return registro;
};

L.atualizar = function (colecao, id, mudancas) {
  var alvo = L.estado[colecao].find(function (r) { return r.id === id; });
  if (!alvo) return null;
  Object.assign(alvo, mudancas);
  L.versao++;
  L.registrar(colecao, alvo, "ALTERAR");
  L.persistir();
  return alvo;
};

/**
 * Apaga o registro de vez — ao contrário de `L.atualizar`, não sobra rastro
 * do dado em si (só a entrada "EXCLUIR" na auditoria, com o rótulo de quando
 * ele existia). Por isso `L.podeExcluirFuncionario` below existe: usar isto
 * em alguém que já apareceu numa folha fechada apagaria histórico de
 * pagamento, que é passivo legal, não só "dado velho".
 */
L.excluir = function (colecao, id) {
  var indice = L.estado[colecao].findIndex(function (r) { return r.id === id; });
  if (indice === -1) return null;
  var registro = L.estado[colecao][indice];
  L.estado[colecao].splice(indice, 1);
  L.versao++;
  L.registrar(colecao, registro, "EXCLUIR");
  L.persistir();
  return registro;
};

/**
 * Excluir de vez só é seguro para quem nunca apareceu numa folha JÁ FECHADA
 * — cadastro feito por engano, nunca processado. Quem já foi pago em algum
 * mês fechado precisa de "Desligar" (mantém o histórico, só tira da folha
 * daqui pra frente), nunca de exclusão — apagar apagaria o próprio
 * comprovante de pagamento.
 */
L.podeExcluirFuncionario = function (f) {
  var fechados = L.estado.periodos.filter(function (p) { return p.status === "FECHADO"; });
  var participouDeFechada = fechados.some(function (p) {
    return L.janelaTrabalhada(p.competencia, f.admissao).dias > 0;
  });
  if (participouDeFechada) {
    return { pode: false,
      motivo: "Este cadastro já esteve em folha fechada — excluir apagaria o histórico de pagamento. Desligue em vez de excluir." };
  }
  return { pode: true, motivo: "" };
};

L.buscarPorId = function (colecao, id) {
  return L.estado[colecao].find(function (r) { return r.id === id; }) || null;
};

/**
 * Busca a lista de funcionários de novo no servidor — depois de cadastrar,
 * editar, desligar ou excluir alguém, é a única forma de garantir que a tela
 * mostra o que ficou salvo de verdade (não o que o formulário local supunha),
 * e que outra pessoa logada em outra sessão veria o mesmo dado se recarregasse.
 */
L.recarregarFuncionarios = function () {
  return L.api.get("/api/funcionarios").then(function (lista) {
    L.estado.funcionarios = lista || [];
    L.versao++;
  }).catch(function (erro) {
    console.error("Não foi possível recarregar funcionários da API:", erro);
    U.avisar("Cadastro salvo, mas não foi possível atualizar a lista na tela. Recarregue a página.");
  });
};

/**
 * Mesma ideia de `L.recarregarFuncionarios`. A API devolve `dataVencimento`
 * (nome da coluna); o resto do sistema (alertas do dashboard incluídos) lê
 * `vencimento` — o mapeamento fica aqui, um lugar só, para não espalhar o
 * "ou um nome ou outro" pelas telas.
 */
L.recarregarDocumentos = function () {
  return L.api.get("/api/documentos").then(function (lista) {
    L.estado.documentos = (lista || []).map(function (d) {
      return Object.assign({}, d, { vencimento: d.dataVencimento });
    });
    L.versao++;
  }).catch(function (erro) {
    console.error("Não foi possível recarregar documentos da API:", erro);
    U.avisar("Documento salvo, mas não foi possível atualizar a lista na tela. Recarregue a página.");
  });
};

// ---------------------------------------------------------------- tabelas legais

/**
 * Carga inicial, NÃO fonte de verdade. São as tabelas de 2025, com vigência
 * declarada até 12/2025 e `conferida: false`. Para qualquer competência de
 * 2026 em diante não existe tabela vigente até o RH cadastrar a do exercício
 * contra a portaria oficial — e sem tabela vigente e conferida a folha não
 * fecha. É de propósito: alíquota errada em folha fechada vira passivo.
 */
L.TABELAS_SEED = [
  {
    id: "inss-2025", tipo: "INSS", inicio: "2025-01", fim: "2025-12",
    faixas: [
      { ate: L.reais(1518.0), aliquota: 7.5 },
      { ate: L.reais(2793.88), aliquota: 9 },
      { ate: L.reais(4190.83), aliquota: 12 },
      { ate: L.reais(8157.41), aliquota: 14 }
    ],
    teto: L.reais(8157.41),
    fonte: "Portaria Interministerial MPS/MF nº 6/2025",
    conferida: false, conferidaPor: null, conferidaEm: null, origemSeed: 3
  },
  {
    id: "irrf-2025-05", tipo: "IRRF", inicio: "2025-05", fim: "2025-12",
    faixas: [
      { ate: L.reais(2428.8), aliquota: 0, parcelaDeduzir: 0 },
      { ate: L.reais(2826.65), aliquota: 7.5, parcelaDeduzir: L.reais(182.16) },
      { ate: L.reais(3751.05), aliquota: 15, parcelaDeduzir: L.reais(394.16) },
      { ate: L.reais(4664.68), aliquota: 22.5, parcelaDeduzir: L.reais(675.49) },
      { ate: null, aliquota: 27.5, parcelaDeduzir: L.reais(908.73) }
    ],
    porDependente: L.reais(189.59),
    simplificado: L.reais(607.2),
    fonte: "Tabela vigente a partir de maio/2025 — conferir o ato oficial",
    conferida: false, conferidaPor: null, conferidaEm: null, origemSeed: 3
  },
  /* ---- 2026: valores oficiais, conferidos contra o ato citado ----
   *
   * Nascem `conferida: true` porque foram verificadas contra a norma que a
   * própria tabela declara. O controle de conferência existe para pegar
   * TABELA DIGITADA À MÃO — onde o risco é trocar um dígito de uma faixa e
   * descontar errado de todo mundo, calado. Tabela que vem com o sistema,
   * com o ato nomeado, é outra classe de risco.
   *
   * Qualquer edição derruba a conferência (ver `salvarTabela`): mexeu, alguém
   * assina de novo. */
  {
    id: "inss-2026", tipo: "INSS", inicio: "2026-01", fim: "2026-12",
    faixas: [
      { ate: L.reais(1621.0), aliquota: 7.5 },
      { ate: L.reais(2902.84), aliquota: 9 },
      { ate: L.reais(4354.27), aliquota: 12 },
      { ate: L.reais(8475.55), aliquota: 14 }
    ],
    teto: L.reais(8475.55),
    fonte: "Portaria Interministerial MPS/MF nº 13, de 09/01/2026",
    conferida: true, conferidaPor: "Conferida na carga, contra o ato citado", conferidaEm: null, origemSeed: 3
  },
  /**
   * A Lei 15.270/2025 (Reforma da Renda) não mexeu na tabela progressiva: ela
   * criou um REDUTOR aplicado depois do imposto calculado. Até R$ 5.000 de
   * rendimento tributável o imposto zera; entre R$ 5.000,01 e R$ 7.350,00 o
   * redutor decresce em linha reta até zerar. Acima disso, tabela cheia.
   *
   * O redutor é parâmetro da tabela, não constante no código — em 2027 os
   * valores mudam e quem atualiza é o RH, sem tocar em programa.
   */
  {
    id: "irrf-2026", tipo: "IRRF", inicio: "2026-01", fim: "2026-12",
    faixas: [
      { ate: L.reais(2428.8), aliquota: 0, parcelaDeduzir: 0 },
      { ate: L.reais(2826.65), aliquota: 7.5, parcelaDeduzir: L.reais(182.16) },
      { ate: L.reais(3751.05), aliquota: 15, parcelaDeduzir: L.reais(394.16) },
      { ate: L.reais(4664.68), aliquota: 22.5, parcelaDeduzir: L.reais(675.49) },
      { ate: null, aliquota: 27.5, parcelaDeduzir: L.reais(908.73) }
    ],
    porDependente: L.reais(189.59),
    simplificado: L.reais(607.2),
    isencaoTotalAte: L.reais(5000),
    reducaoAte: L.reais(7350),
    reducaoBase: L.reais(978.62),
    reducaoFator: 0.133145,
    fonte: "Tabela do IRRF c/ redutor da Lei 15.270/2025",
    conferida: true, conferidaPor: "Conferida na carga, contra o ato citado", conferidaEm: null, origemSeed: 3
  }
];

/**
 * Versão da carga inicial. Sobe sempre que os valores das tabelas que vêm com
 * o sistema mudarem — é o que faz a correção chegar a quem já usou o sistema.
 */
L.VERSAO_SEED = 3;

/**
 * Reconcilia as tabelas que vêm com o sistema, em vez de semear só uma vez.
 *
 * Antes isto era `if (tabelas.length) return`: quem já tinha usado o sistema
 * ficava preso à carga antiga para sempre. Foi assim que as tabelas de 2026
 * não chegaram a quem abriu o sistema antes de elas existirem — e a folha
 * passou a acusar "não há tabela para esta competência".
 *
 * O que a pessoa cadastrou ou editou NUNCA é tocado: `salvarTabela` apaga a
 * marca `origemSeed`, e sem essa marca a tabela é de quem a digitou.
 */
L.semearTabelas = function () {
  var mudou = false;
  L.TABELAS_SEED.forEach(function (seed) {
    var existente = L.estado.tabelas.find(function (t) { return t.id === seed.id; });
    if (!existente) {
      L.estado.tabelas.push(JSON.parse(JSON.stringify(seed)));
      mudou = true;
      return;
    }
    // Sem `origemSeed`, a tabela passou pela mão de alguém: não se mexe.
    if (!existente.origemSeed) return;
    if (existente.origemSeed === L.VERSAO_SEED) return;
    Object.assign(existente, JSON.parse(JSON.stringify(seed)));
    mudou = true;
  });
  if (mudou) L.versao++;
  return mudou;
};

/** Devolve `true` se a competência cai dentro da vigência da tabela. */
L.tabelaCobre = function (t, competencia) {
  if (!competencia) return false;
  if (competencia < t.inicio) return false;
  return !t.fim || competencia <= t.fim;
};

/**
 * A tabela que vale para a competência. Havendo mais de uma, ganha a de
 * início mais recente — é assim que uma tabela nova substitui a anterior no
 * meio do ano sem ninguém precisar apagar a antiga.
 */
L.tabelaVigente = function (tipo, competencia) {
  var comp = competencia || L.estado.competencia || L.competenciaAtual();

  // Competência fechada não consulta o cadastro: ela já tem a sua cópia. É o
  // que garante que reabrir agosto em dezembro devolve o número de agosto.
  var periodo = L.periodoDe(comp);
  if (periodo && periodo.status === "FECHADO" && periodo.tabelasUsadas) {
    return periodo.tabelasUsadas[tipo] || null;
  }

  return L.estado.tabelas
    .filter(function (t) { return t.tipo === tipo && L.tabelaCobre(t, comp); })
    .sort(function (a, b) { return b.inicio.localeCompare(a.inicio); })[0] || null;
};

/**
 * Devolvida quando não há tabela cadastrada para a competência: zera imposto
 * e carrega `ausente`, que o motor transforma em divergência bloqueante.
 * Melhor calcular zero e gritar do que aplicar a alíquota do ano passado.
 */
function tabelaAusente(tipo) {
  return {
    ausente: true, tipo: tipo, faixas: [], teto: 0,
    porDependente: 0, simplificado: 0,
    fonte: "sem tabela cadastrada para a competência",
    conferida: false
  };
}

// Getters: todo o motor continua lendo `L.TABELA_INSS` como antes, mas agora
// o que ele lê depende da competência em que o sistema está operando.
Object.defineProperty(L, "TABELA_INSS", {
  get: function () { return L.tabelaVigente("INSS") || tabelaAusente("INSS"); }
});
Object.defineProperty(L, "TABELA_IRRF", {
  get: function () { return L.tabelaVigente("IRRF") || tabelaAusente("IRRF"); }
});

L.SALARIO_MINIMO = L.reais(1518.0);

// ---------------------------------------------------------------- cadastro de tabelas

/**
 * Espelha `validarTabelaInss`/`validarTabelaIrrf` do motor em TypeScript e as
 * triggers de `002_folha.sql`. Faixa fora de ordem não dá erro em lugar
 * nenhum: só desconta o valor errado, de todo mundo, todo mês, calada.
 */
L.validarTabela = function (t) {
  var problemas = [];
  if (!t.faixas || t.faixas.length === 0) {
    problemas.push("Cadastre pelo menos uma faixa.");
    return problemas;
  }
  t.faixas.forEach(function (f, i) {
    if (f.aliquota < 0 || f.aliquota > 100) {
      problemas.push("A faixa " + (i + 1) + " tem alíquota fora de 0% a 100%.");
    }
  });

  if (t.tipo === "INSS") {
    var anterior = 0;
    t.faixas.forEach(function (f, i) {
      if (f.ate === null) {
        problemas.push("Faixa " + (i + 1) + ": no INSS toda faixa tem limite — quem limita o topo é o teto.");
        return;
      }
      if (f.ate <= anterior) {
        problemas.push("A faixa " + (i + 1) + " tem limite menor ou igual ao da anterior. As faixas precisam ser crescentes.");
      }
      anterior = f.ate;
    });
    if (!t.teto || t.teto <= 0) {
      problemas.push("Informe o teto de contribuição.");
    } else {
      var ultima = t.faixas[t.faixas.length - 1];
      if (ultima && ultima.ate !== null && ultima.ate !== t.teto) {
        problemas.push("O limite da última faixa (" + L.brl(ultima.ate) +
          ") precisa ser igual ao teto (" + L.brl(t.teto) + ").");
      }
    }
  } else {
    var semTeto = t.faixas.filter(function (f) { return f.ate === null; });
    if (semTeto.length !== 1) {
      problemas.push("O IRRF precisa de exatamente uma faixa sem limite — a de alíquota máxima. " +
        (semTeto.length === 0 ? "Deixe o campo \"base até\" da última em branco." : "Há " + semTeto.length + " em branco."));
    }
    var ultimaIr = t.faixas[t.faixas.length - 1];
    if (ultimaIr && ultimaIr.ate !== null && semTeto.length === 1) {
      problemas.push("A faixa sem limite precisa ser a última da tabela.");
    }
    var ant = -1;
    t.faixas.forEach(function (f, i) {
      if (f.ate === null) return;
      if (f.ate <= ant) {
        problemas.push("A faixa " + (i + 1) + " tem limite menor ou igual ao da anterior. As faixas precisam ser crescentes.");
      }
      ant = f.ate;
    });
    if (!t.porDependente || t.porDependente <= 0) problemas.push("Informe a dedução por dependente.");
    if (!t.simplificado || t.simplificado <= 0) problemas.push("Informe o desconto simplificado.");
  }
  return problemas;
};

/**
 * Vigências que se sobrepõem tornam ambíguo qual tabela vale no mês — o banco
 * proíbe por constraint (`inss_sem_sobreposicao`). Aqui a saída é a que o RH
 * quis dizer: a tabela anterior, que estava em aberto, é encerrada no mês
 * antes de a nova começar.
 */
/**
 * Duas tabelas do mesmo imposto começando no mesmo mês tornam indefinido qual
 * vale — a ordenação desempataria por acaso. O banco recusa pela constraint
 * `inss_sem_sobreposicao`; aqui a recusa é explícita, com o nome de quem
 * conflita, para o RH editar a tabela certa em vez de criar uma gêmea.
 */
L.conflitoDeVigencia = function (tipo, inicio, ignorarId) {
  return L.estado.tabelas.find(function (t) {
    return t.tipo === tipo && t.id !== ignorarId && t.inicio === inicio;
  }) || null;
};

L.encerrarVigenciaAnterior = function (tipo, inicio, ignorarId) {
  var encerradas = [];
  L.estado.tabelas.forEach(function (t) {
    if (t.tipo !== tipo || t.id === ignorarId) return;
    if (t.inicio >= inicio) return;
    if (t.fim && t.fim < inicio) return; // já terminava antes: não se sobrepõe
    t.fim = L.somarMeses(inicio, -1);
    encerradas.push(t);
  });
  return encerradas;
};

/**
 * Cria ou atualiza. Sempre volta a `conferida: false`: mexeu, confere de novo.
 * Devolve `{ ok: false, problemas: [...] }` quando a tabela não passa na
 * validação — nada é gravado pela metade.
 */
L.salvarTabela = function (dados) {
  var problemas = L.validarTabela(dados);

  var conflito = L.conflitoDeVigencia(dados.tipo, dados.inicio, dados.id || null);
  if (conflito) {
    problemas.push("Já existe uma tabela de " + dados.tipo + " começando em " +
      L.competenciaBR(dados.inicio) + ". Edite aquela, ou escolha outro mês de início — " +
      "duas tabelas no mesmo mês deixam indefinido qual vale.");
  }
  if (problemas.length) return { ok: false, problemas: problemas };

  var existente = dados.id ? L.buscarPorId("tabelas", dados.id) : null;
  var registro = existente || { id: L.id() };
  registro.tipo = dados.tipo;
  registro.inicio = dados.inicio;
  registro.fim = dados.fim || null;
  registro.fonte = dados.fonte;
  registro.faixas = dados.faixas;
  if (dados.tipo === "INSS") {
    registro.teto = dados.teto;
  } else {
    registro.porDependente = dados.porDependente;
    registro.simplificado = dados.simplificado;
  }
  registro.conferida = false;
  registro.conferidaPor = null;
  registro.conferidaEm = null;
  // Passou pela mão de alguém: deixa de ser tabela do sistema e a carga
  // inicial nunca mais a sobrescreve.
  delete registro.origemSeed;
  if (!existente) L.estado.tabelas.push(registro);
  var encerradas = L.encerrarVigenciaAnterior(registro.tipo, registro.inicio, registro.id);
  // Mexer na tabela muda toda folha já calculada: sem subir a versão o cache
  // devolveria o número antigo.
  L.versao++;
  L.registrar("tabelas", { nome: registro.tipo + " " + registro.inicio },
    existente ? "EDITAR" : "CRIAR");
  encerradas.forEach(function (t) {
    L.registrar("tabelas", { nome: t.tipo + " " + t.inicio + " encerrada em " + t.fim }, "EDITAR");
  });
  L.persistir();
  return { ok: true, registro: registro, encerradas: encerradas };
};

/**
 * Conferir é ato técnico do RH: alguém bateu a tabela contra o ato oficial e
 * assina embaixo. Não confunde com fechar a folha, que segue sendo decisão da
 * Direção — são duas travas em série, não uma só.
 */
L.conferirTabela = function (id, quemConfere) {
  var t = L.buscarPorId("tabelas", id);
  if (!t) return null;
  t.conferida = true;
  t.conferidaPor = (quemConfere && quemConfere.nome) || "—";
  t.conferidaEm = new Date().toISOString();
  L.versao++;
  L.registrar("tabelas", { nome: t.tipo + " " + t.inicio + " conferida" }, "APROVAR");
  L.persistir();
  return t;
};

/**
 * Espelha o `ON DELETE RESTRICT` de `folha_periodos`: tabela que já sustentou
 * uma competência fechada não some. A folha fechada guarda a sua própria cópia,
 * mas apagar o original apagaria a rastreabilidade de onde ela veio.
 */
L.tabelaEmUsoPorFechamento = function (id) {
  return L.estado.periodos.some(function (p) {
    if (p.status !== "FECHADO" || !p.tabelasUsadas) return false;
    return ["INSS", "IRRF"].some(function (tipo) {
      return p.tabelasUsadas[tipo] && p.tabelasUsadas[tipo].id === id;
    });
  });
};

L.excluirTabela = function (id) {
  if (L.tabelaEmUsoPorFechamento(id)) return false;
  var i = L.estado.tabelas.findIndex(function (t) { return t.id === id; });
  if (i === -1) return false;
  var t = L.estado.tabelas[i];
  L.estado.tabelas.splice(i, 1);
  L.versao++;
  L.registrar("tabelas", { nome: t.tipo + " " + t.inicio }, "EXCLUIR");
  L.persistir();
  return true;
};

/** Copia a tabela do exercício anterior para o RH só ajustar os valores. */
L.duplicarTabela = function (id, inicio, fim) {
  var origem = L.buscarPorId("tabelas", id);
  if (!origem) return null;
  // Se o mês sugerido já tem tabela, anda para frente até achar um livre: o
  // RH veio duplicar, não colidir. Um ano de busca é mais que suficiente.
  var alvo = inicio;
  for (var i = 0; i < 12 && L.conflitoDeVigencia(origem.tipo, alvo, null); i++) {
    alvo = L.somarMeses(alvo, 1);
  }
  if (L.conflitoDeVigencia(origem.tipo, alvo, null)) return null;

  var copia = JSON.parse(JSON.stringify(origem));
  copia.id = L.id();
  copia.inicio = alvo;
  copia.fim = fim || null;
  copia.fonte = "";
  copia.conferida = false;
  copia.conferidaPor = null;
  copia.conferidaEm = null;
  L.estado.tabelas.push(copia);
  L.encerrarVigenciaAnterior(copia.tipo, copia.inicio, copia.id);
  L.versao++;
  L.registrar("tabelas", { nome: copia.tipo + " " + copia.inicio }, "CRIAR");
  L.persistir();
  return copia;
};

// Carga inicial já na abertura: `restaurar` sobrescreve com o que estiver
// salvo, e semeia de novo se o salvo vier sem tabela alguma.
L.semearTabelas();

/** O que impede a competência de fechar, do ponto de vista das tabelas. */
/** INSS, IRRF e encargos apurados pela contabilidade (configuração da escola). */
L.ocultarDsr = function () {
  return !!(L.estado.configuracoes && L.estado.configuracoes.ocultarDsr);
};

L.impostosPelaContabilidade = function () {
  return !!(L.estado.configuracoes && L.estado.configuracoes.impostosPelaContabilidade);
};

L.pendenciaTabelas = function (competencia) {
  var faltando = [];
  // Sem imposto calculado aqui, as tabelas de INSS e IRRF não bloqueiam nada.
  if (L.impostosPelaContabilidade()) return faltando;
  ["INSS", "IRRF"].forEach(function (tipo) {
    var t = L.tabelaVigente(tipo, competencia);
    if (!t) faltando.push({ tipo: tipo, motivo: "ausente" });
    else if (!t.conferida) faltando.push({ tipo: tipo, motivo: "nao-conferida", tabela: t });
  });
  return faltando;
};

/** A CCT vigente da categoria (DOCENTE/ADMINISTRATIVO) para a competência. */
L.cctVigente = function (categoria, competencia) {
  var comp = competencia || L.estado.competencia || L.competenciaAtual();
  return (L.estado.ccts || [])
    .filter(function (c) { return c.categoria === categoria && L.tabelaCobre(c, comp); })
    .sort(function (a, b) { return b.inicio.localeCompare(a.inicio); })[0] || null;
};

/** O salário mínimo vigente para a competência. */
L.salarioMinimoVigente = function (competencia) {
  var comp = competencia || L.estado.competencia || L.competenciaAtual();
  return (L.estado.salarioMinimo || [])
    .filter(function (m) { return L.tabelaCobre(m, comp); })
    .sort(function (a, b) { return b.inicio.localeCompare(a.inicio); })[0] || null;
};

L.CCT = {
  semanasPorMes: 4.5,
  // 4,5 semanas é regra específica de hora-aula (professor); horista comum
  // (recepção, portaria, manutenção) usa o divisor de 5 semanas — são
  // categorias de CCT diferentes, não a mesma conta com nome trocado.
  semanasPorMesHorista: 5,
  diasUteisSemana: 6,
  diasDescansoSemana: 1,
  percentualHoraAtividade: 0,
  percentualAulaExtra: 0,
  percentualAdicionalNoturno: 20,
  reflexoDsrSobreNoturno: true,
  perdeDsrPorFaltaInjustificada: true,
  divisorMensalHoras: 220,
  reflexoDsrSobreHorasExtras: true,
  fgtsPercentual: 8,
  cppPercentual: 20,
  ratPercentual: 1,
  terceirosPercentual: 5.8,
  tercoConstitucional: 33.3333,
  vtPercentualMaximo: 6
};

// ---------------------------------------------------------------- impostos

/**
 * A tabela sai da competência que está sendo calculada — não da competência
 * que a tela está mostrando. Recalcular agosto/2025 tem que devolver o mesmo
 * número de agosto/2025, com a tabela daquele exercício, para sempre.
 */
/**
 * Professor com duas escolas é regra, não exceção. A tabela incide sobre a
 * SOMA das remunerações (limitada ao teto único) e cada empregador desconta a
 * sua parte, abatendo o que os outros já descontaram — IN RFB 2.110/2022
 * art. 66. Aplicar a tabela isolada em cada vínculo desconta a menos, e quem
 * responde pelo recolhimento a menor é a fonte pagadora.
 */
L.calcularInss = function (base, competencia, outrosVinculos) {
  var tabela = L.tabelaVigente("INSS", competencia) || tabelaAusente("INSS");
  var outraRemuneracao = (outrosVinculos && outrosVinculos.remuneracao) || 0;
  var outroDesconto = (outrosVinculos && outrosVinculos.inssDescontado) || 0;
  var consolidada = base + outraRemuneracao;

  var limitada = Math.min(consolidada, tabela.teto), anterior = 0, total = 0, passos = [];
  for (var i = 0; i < tabela.faixas.length; i++) {
    var f = tabela.faixas[i];
    if (limitada <= anterior) break;
    var topo = Math.min(f.ate, tabela.teto);
    var parcela = Math.min(limitada, topo) - anterior;
    if (parcela > 0) {
      var v = L.pctDe(parcela, f.aliquota);
      total += v;
      passos.push({
        titulo: "INSS — faixa até " + L.brl(topo),
        formula: "parcela na faixa × alíquota",
        substituicao: L.brl(parcela) + " × " + f.aliquota + "%",
        resultado: v,
        fundamento: tabela.fonte
      });
    }
    anterior = topo;
  }

  if (outraRemuneracao > 0) {
    passos.push({
      titulo: "INSS — consolidação de vínculos",
      formula: "remuneração desto hotel + remuneração dos demais vínculos",
      substituicao: L.brl(base) + " + " + L.brl(outraRemuneracao),
      resultado: Math.min(consolidada, tabela.teto),
      fundamento: "Teto único somando os dois empregos"
    });
  }

  var devido = Math.max(0, total - outroDesconto);
  if (outroDesconto > 0) {
    passos.push({
      titulo: "INSS — abatimento do já descontado",
      formula: "soma das faixas − INSS retido pelos outros empregadores",
      substituicao: L.brl(total) + " − " + L.brl(outroDesconto),
      resultado: devido,
      fundamento: "Consolidação entre empregos, com teto único"
    });
  }

  return { valor: devido, passos: passos };
};

L.calcularIrrf = function (tributavel, inss, dependentes, pensao, competencia) {
  var tabela = L.tabelaVigente("IRRF", competencia) || tabelaAusente("IRRF");
  var passos = [];
  var completa = Math.max(0, tributavel - inss - dependentes * tabela.porDependente - (pensao || 0));
  var simples = Math.max(0, tributavel - tabela.simplificado);
  var usaSimples = simples < completa;
  var base = usaSimples ? simples : completa;

  passos.push({ titulo: "IRRF — base por deduções legais",
    formula: "tributável − INSS − (dependentes × dedução) − pensão",
    substituicao: L.brl(tributavel) + " − " + L.brl(inss) + " − " + dependentes + " × " + L.brl(tabela.porDependente),
    resultado: completa, fundamento: "Deduções legais: INSS, dependentes e pensão" });
  passos.push({ titulo: "IRRF — base pelo desconto simplificado",
    formula: "tributável − desconto simplificado",
    substituicao: L.brl(tributavel) + " − " + L.brl(tabela.simplificado),
    resultado: simples, fundamento: tabela.fonte });
  passos.push({ titulo: "IRRF — base adotada (" + (usaSimples ? "simplificado" : "deduções legais") + ")",
    formula: "menor das duas bases",
    substituicao: "min(" + L.brl(completa) + ", " + L.brl(simples) + ")",
    resultado: base, fundamento: "Opção mais favorável ao contribuinte" });

  var faixa = null;
  for (var i = 0; i < tabela.faixas.length; i++) {
    var f = tabela.faixas[i];
    if (f.ate === null || base <= f.ate) { faixa = f; break; }
  }
  if (!faixa || faixa.aliquota === 0) {
    passos.push({ titulo: "IRRF — isento", formula: "base dentro da faixa de isenção",
      substituicao: L.brl(base), resultado: 0, fundamento: tabela.fonte });
    return { valor: 0, passos: passos };
  }
  var imposto = Math.max(0, L.pctDe(base, faixa.aliquota) - faixa.parcelaDeduzir);
  passos.push({ titulo: "IRRF — imposto pela tabela", formula: "base × alíquota − parcela a deduzir",
    substituicao: L.brl(base) + " × " + faixa.aliquota + "% − " + L.brl(faixa.parcelaDeduzir),
    resultado: imposto, fundamento: tabela.fonte });

  /**
   * Redutor da Reforma da Renda: incide DEPOIS do imposto apurado e olha o
   * rendimento tributável, não a base. Até o teto de isenção zera; daí até o
   * fim da faixa decresce em linha reta; acima disso não existe.
   *
   * Os quatro parâmetros vêm da tabela cadastrada — em 2027 mudam, e quem
   * atualiza é o RH.
   */
  if (tabela.isencaoTotalAte && tributavel <= tabela.isencaoTotalAte) {
    passos.push({ titulo: "IRRF — isenção da faixa de rendimento",
      formula: "rendimento dentro do teto de isenção total",
      substituicao: L.brl(tributavel) + " ≤ " + L.brl(tabela.isencaoTotalAte),
      resultado: 0, fundamento: tabela.fonte });
    return { valor: 0, passos: passos };
  }
  if (tabela.reducaoAte && tributavel <= tabela.reducaoAte) {
    var redutor = Math.max(0, tabela.reducaoBase - L.arredondar(tributavel * tabela.reducaoFator));
    var comReducao = Math.max(0, imposto - redutor);
    passos.push({ titulo: "IRRF — redutor da faixa de transição",
      formula: "redutor = base do redutor − (fator × rendimento)",
      substituicao: L.brl(tabela.reducaoBase) + " − (" + tabela.reducaoFator + " × " +
        L.brl(tributavel) + ") = " + L.brl(redutor),
      resultado: comReducao, fundamento: tabela.fonte });
    return { valor: comReducao, passos: passos };
  }
  return { valor: imposto, passos: passos };
};

// ---------------------------------------------------------------- motor de folha

function prov(cod, desc, ref, valor) {
  return { cod: cod, desc: desc, ref: ref, valor: valor, tipo: "P", natureza: "INTEGRA" };
}
function red(cod, desc, ref, valor) {
  return { cod: cod, desc: desc, ref: ref, valor: valor, tipo: "D", natureza: "REDUZ" };
}
function neutro(cod, desc, ref, tipo, valor) {
  return { cod: cod, desc: desc, ref: ref, valor: valor, tipo: tipo, natureza: "NEUTRA" };
}

/**
 * Puro e determinístico: mesmo insumo, mesmo resultado. Nenhuma leitura de
 * "hoje" — recalcular uma competência fechada devolve sempre o mesmo número.
 */
L.calcularFolha = function (contrato, mov, f) {
  var rubricas = [], memoria = [], avisos = [];
  var ocultarDsr = L.ocultarDsr();
  var cct = L.CCT;
  // Tudo que depende de tabela legal sai daqui: a competência do movimento,
  // não a que a tela está mostrando.
  var competencia = (mov && mov.competencia) || L.estado.competencia || L.competenciaAtual();

  var pendencias = L.pendenciaTabelas(competencia);
  var ausentes = pendencias.filter(function (p) { return p.motivo === "ausente"; });
  var naoConferidas = pendencias.filter(function (p) { return p.motivo === "nao-conferida"; });
  if (ausentes.length) {
    avisos.push({ nivel: "divergencia",
      texto: "Não há tabela de " + ausentes.map(function (p) { return p.tipo; }).join(" nem de ") +
        " cadastrada para esta competência. O imposto está saindo zerado — cadastre a tabela do exercício em Tabelas Legais antes de usar qualquer número daqui." });
  }
  if (naoConferidas.length) {
    // Provisória é pior que apenas não conferida: os valores são de outro
    // exercício. Quem lê precisa saber qual dos dois casos é o seu.
    var provisorias = naoConferidas.filter(function (p) { return p.tabela && p.tabela.provisoria; });
    if (provisorias.length) {
      avisos.push({ nivel: "divergencia",
        texto: "A tabela de " + provisorias.map(function (p) { return p.tipo; }).join(" e de ") +
          " em uso é PROVISÓRIA: repete os valores do exercício anterior porque a tabela de " +
          String(competencia).slice(0, 4) + " ainda não foi cadastrada. Os descontos saem aproximados — " +
          "lance a tabela oficial em Tabelas Legais antes de pagar por estes números." });
    }
    var apenasSemConferir = naoConferidas.filter(function (p) { return !(p.tabela && p.tabela.provisoria); });
    if (apenasSemConferir.length) {
      // "ainda não foi conferida pelo RH" soava como acusação e não dizia o
      // que fazer. O aviso é um passo pendente, não um defeito: diz o que
      // falta, quem faz e onde.
      avisos.push({ nivel: "divergencia", acao: "tabelas",
        texto: "Falta o RH conferir a tabela de " +
          apenasSemConferir.map(function (p) { return p.tipo; }).join(" e de ") +
          " contra o ato oficial. Os valores já estão cadastrados e o cálculo abaixo usa eles; " +
          "a conferência é a assinatura que libera o fechamento — em Tabelas Legais." });
    }
  }

  // Mesma trava de INSS/IRRF acima, mas para CCT e salário mínimo — sem isto,
  // esta tela (prévia no navegador) mostrava "0 divergências" mesmo com a CCT
  // pendente de conferência, porque só INSS/IRRF eram checados aqui. O motor
  // do backend (`src/dominio/folha/motor.ts`) já barra o fechamento por isso;
  // esta checagem só faz o navegador mostrar o mesmo motivo, não cria um
  // bloqueio novo.
  var categoriaCct = L.categoriaDe(f) === "PROFESSOR" ? "DOCENTE" : "ADMINISTRATIVO";
  var rotuloCategoria = categoriaCct === "DOCENTE" ? "de colaboradores" : "de colaboradores";
  var cctVig = L.cctVigente(categoriaCct, competencia);
  if (!cctVig) {
    avisos.push({ nivel: "divergencia",
      texto: "Não há convenção coletiva (CCT) " + rotuloCategoria + " cadastrada para esta competência. " +
        "Cadastre a CCT vigente em Tabelas Legais antes de fechar a folha." });
  } else if (!cctVig.conferida) {
    avisos.push({ nivel: "divergencia", acao: "tabelas",
      texto: "Falta o RH conferir a convenção coletiva (CCT) " + rotuloCategoria +
        " contra o ato oficial. A conferência é a assinatura que libera o fechamento — em Tabelas Legais." });
  }

  var salMinVig = L.salarioMinimoVigente(competencia);
  if (!salMinVig) {
    avisos.push({ nivel: "divergencia",
      texto: "Não há salário mínimo cadastrado para esta competência. Cadastre o valor vigente em Tabelas Legais antes de fechar a folha." });
  } else if (!salMinVig.conferida) {
    avisos.push({ nivel: "divergencia", acao: "tabelas",
      texto: "Falta o RH conferir o salário mínimo vigente contra o ato oficial — em Tabelas Legais." });
  }

  // Vínculo pode não ter existido ainda, ou só ter começado no meio do mês —
  // sem isso, admitido dia 25 recebia o mês inteiro, e alguém contratado em
  // outubro já pesava na folha de agosto.
  var janela = L.janelaTrabalhada(competencia, contrato.admissao);
  if (janela.dias === 0 && contrato.admissao && contrato.admissao > competencia + "-31") {
    // Admitido depois desta competência: simplesmente não entra nela — não é erro e não trava o fechamento.
    avisos.push({ nivel: "info",
      texto: "Admitido em " + L.dataBR(contrato.admissao) + ": entra na folha a partir de " + L.competenciaBR(contrato.admissao.slice(0, 7)) + "." });
    return { rubricas: [], memoria: [], avisos: avisos, proventos: 0, descontos: 0, encargos: 0,
      liquido: 0, remuneracaoBruta: 0, custoEmpregador: 0 };
  }
  if (janela.dias === 0) {
    avisos.push({ nivel: "divergencia",
      texto: "Vínculo não esteve ativo em " + L.competenciaBR(competencia) + " (admissão em " +
        L.dataBR(contrato.admissao) + "). Esta pessoa não deveria entrar nesta folha." });
    return { rubricas: [], memoria: [], avisos: avisos, proventos: 0, descontos: 0, encargos: 0,
      liquido: 0, remuneracaoBruta: 0, custoEmpregador: 0 };
  }
  if (janela.parcial) {
    avisos.push({ nivel: "atencao",
      texto: "Mês de admissão: remuneração proporcional a " + janela.dias + " de " + janela.totalDeDias +
        " dias (admitido em " + L.dataBR(contrato.admissao) + ")." });
  }

  var salarioBase = 0;

  if (contrato.regime === "HORISTA_AULA") {
    // O professor pode ter carga em vários segmentos, cada um com a sua
    // hora-aula (Infantil, Fundamental, Fundamental 2, Médio, PV). A base é a
    // soma dos produtos; multiplicar a média pelo total daria o mesmo número,
    // mas esconderia de onde ele veio.
    // Só vale a divisão por segmento quando ela traz valor de hora; editar
    // apenas as aulas de cada segmento deixa o valor em branco, e aí a conta
    // volta à hora-aula média do contrato (igual ao servidor) em vez de zerar.
    var cargasComValor = contrato.cargas && contrato.cargas.some(function (c) { return c.valorHora > 0; });
    var cargas = cargasComValor
      ? contrato.cargas.map(function (c) { return { segmento: c.segmento, aulas: c.aulas, valorHora: c.valorHora || 0 }; })
      : [{ segmento: "", aulas: contrato.aulasSemanais, valorHora: contrato.valorHoraAula }];

    var aulasSemana = cargas.reduce(function (a, c) { return a + c.aulas; }, 0);
    var aulasMes = aulasSemana * cct.semanasPorMes;
    var valorAulas = L.arredondar(cargas.reduce(function (a, c) {
      return a + c.aulas * c.valorHora;
    }, 0) * cct.semanasPorMes);
    // Mês de admissão: a mesma proporção de dias que o mensalista usa —
    // tudo que segue (DSR, hora-atividade) deriva de valorAulas, então
    // proporcionalizar aqui já proporcionaliza o resto.
    if (janela.parcial) {
      aulasMes = aulasMes * janela.fator;
      valorAulas = L.arredondar(valorAulas * janela.fator);
    }

    // Hora-aula de referência para falta, adicional noturno e DSR perdido:
    // com carga em vários segmentos, é a média ponderada pelas aulas.
    var horaAula = aulasSemana > 0
      ? L.arredondar(cargas.reduce(function (a, c) { return a + c.aulas * c.valorHora; }, 0) / aulasSemana)
      : 0;

    var referencia = cargas.length > 1
      ? cargas.map(function (c) { return c.aulas + "×" + L.brl(c.valorHora); }).join(" + ")
      : aulasMes.toLocaleString("pt-BR") + " aulas × " + L.brl(cargas[0].valorHora);

    rubricas.push(prov("101", "Aulas ministradas", referencia, valorAulas));
    memoria.push({ titulo: "Aulas do mês",
      formula: cargas.length > 1
        ? "Σ(aulas do setor × hora-aula do setor) × semanas do mês"
        : "aulas semanais × semanas do mês × valor da hora-aula",
      substituicao: cargas.map(function (c) {
        return (c.segmento ? c.segmento + " " : "") + c.aulas + " × " + L.brl(c.valorHora);
      }).join(" + ") + " × " + cct.semanasPorMes,
      resultado: valorAulas, fundamento: "Mês de quatro semanas e meia" });

    var dsr = L.fracDe(valorAulas, cct.diasDescansoSemana, cct.diasUteisSemana);
    rubricas.push(prov("102", "DSR sobre aulas", cct.diasDescansoSemana + "/" + cct.diasUteisSemana, dsr));
    memoria.push({ titulo: "Repouso semanal remunerado",
      formula: "valor das aulas × dias de descanso ÷ dias úteis",
      substituicao: L.brl(valorAulas) + " × 1/6", resultado: dsr,
      fundamento: "Repouso semanal: acréscimo de 1/6 sobre as aulas" });

    var horaAtiv = 0, dsrAtiv = 0;
    if (cct.percentualHoraAtividade > 0) {
      horaAtiv = L.pctDe(valorAulas, cct.percentualHoraAtividade);
      dsrAtiv = L.fracDe(horaAtiv, cct.diasDescansoSemana, cct.diasUteisSemana);
      rubricas.push(prov("103", "Hora-atividade", cct.percentualHoraAtividade + "% das aulas", horaAtiv));
      rubricas.push(prov("104", "DSR sobre hora-atividade", "1/6", dsrAtiv));
    }
    salarioBase = valorAulas + dsr + horaAtiv + dsrAtiv;

    // Duas naturezas diferentes de aula extra, e confundi-las erra o mês
    // inteiro: a carga extra SEMANAL (Tb.Ex, Raízes, Câmara, Monitoria) se
    // repete toda semana e por isso multiplica pelas 4,5 semanas; a aula
    // AVULSA (substituição pontual) acontece uma vez e não multiplica.
    var horaExtra = mov.valorHoraExtra || horaAula;
    var unit = L.arredondar(horaExtra * (1 + cct.percentualAulaExtra / 100));

    var extrasSemanais = mov.aulasExtrasSemanais || 0;
    if (extrasSemanais > 0) {
      var vSemanais = L.arredondar(unit * extrasSemanais * cct.semanasPorMes);
      var dsrSemanais = L.fracDe(vSemanais, cct.diasDescansoSemana, cct.diasUteisSemana);
      rubricas.push(prov("111", "Aula extra / projeto (semanal)",
        extrasSemanais + " aulas/sem × " + cct.semanasPorMes + " × " + L.brl(unit), vSemanais));
      rubricas.push(prov("112", "DSR sobre carga extra", "1/6", dsrSemanais));
      memoria.push({ titulo: "Aula extra / projeto (semanal)",
        formula: "aulas extras por semana × semanas do mês × hora-aula, mais 1/6 de DSR",
        substituicao: extrasSemanais + " × " + cct.semanasPorMes + " × " + L.brl(unit) + " + " + L.brl(dsrSemanais),
        resultado: vSemanais + dsrSemanais,
        fundamento: "Mesma regra da carga regular: mês de 4,5 semanas mais o repouso" });
    }

    var avulsas = (mov.aulasExtras || 0) + (mov.aulasSubstituicao || 0);
    if (avulsas > 0) {
      var vAvulsas = L.mult(unit, avulsas);
      var dsrAvulsas = L.fracDe(vAvulsas, cct.diasDescansoSemana, cct.diasUteisSemana);
      rubricas.push(prov("113", "Aulas avulsas e substituições", avulsas + " aulas × " + L.brl(unit), vAvulsas));
      rubricas.push(prov("114", "DSR sobre aulas avulsas", "1/6", dsrAvulsas));
      memoria.push({ titulo: "Aulas avulsas e substituições",
        formula: "aulas do mês × hora-aula, mais 1/6 de DSR",
        substituicao: avulsas + " × " + L.brl(unit) + " + " + L.brl(dsrAvulsas),
        resultado: vAvulsas + dsrAvulsas, fundamento: "Hora extra habitual reflete no repouso" });
    }

    if ((mov.aulasNoturnas || 0) > 0) {
      var baseNot = L.mult(horaAula, mov.aulasNoturnas);
      var adicional = L.pctDe(baseNot, cct.percentualAdicionalNoturno);
      rubricas.push(prov("121", "Adicional noturno",
        mov.aulasNoturnas + " aulas × " + cct.percentualAdicionalNoturno + "%", adicional));
      memoria.push({ titulo: "Adicional noturno",
        formula: "aulas após as 22h × hora-aula × percentual",
        substituicao: mov.aulasNoturnas + " × " + L.brl(horaAula) + " × " + cct.percentualAdicionalNoturno + "%",
        resultado: adicional, fundamento: "Adicional pelo trabalho em horário noturno" });
      if (cct.reflexoDsrSobreNoturno) {
        var dsrNot = L.fracDe(adicional, cct.diasDescansoSemana, cct.diasUteisSemana);
        rubricas.push(prov("122", "DSR sobre adicional noturno", "1/6", dsrNot));
        memoria.push({ titulo: "DSR sobre adicional noturno", formula: "adicional noturno × 1/6",
          substituicao: L.brl(adicional) + " × 1/6", resultado: dsrNot,
          fundamento: "O adicional noturno habitual integra a base do repouso" });
      }
    }

    if ((mov.aulasNaoDadas || 0) > 0) {
      var vFaltas = L.mult(horaAula, mov.aulasNaoDadas);
      rubricas.push(red("501", "Aulas não ministradas",
        mov.aulasNaoDadas + " aulas × " + L.brl(horaAula), vFaltas));
      memoria.push({ titulo: "Desconto de aulas não ministradas",
        formula: "aulas não dadas × valor da hora-aula",
        substituicao: mov.aulasNaoDadas + " × " + L.brl(horaAula),
        resultado: vFaltas, fundamento: "Falta sem justificativa: desconta o dia" });
    }

    if (cct.perdeDsrPorFaltaInjustificada && (mov.semanasFalta || 0) > 0) {
      var limite = Math.floor(cct.semanasPorMes);
      var semanas = Math.min(mov.semanasFalta, limite);
      if (semanas < mov.semanasFalta) {
        avisos.push({ nivel: "atencao",
          texto: "Semanas com falta injustificada limitadas às " + limite + " semanas da competência." });
      }
      var dsrSemanal = L.fracDe(L.mult(horaAula, aulasSemana),
        cct.diasDescansoSemana, cct.diasUteisSemana);
      var dsrPerdido = L.mult(dsrSemanal, semanas);
      rubricas.push(red("502", "DSR perdido por falta injustificada", semanas + " semana(s)", dsrPerdido));
      memoria.push({ titulo: "Perda do DSR por falta injustificada",
        formula: "DSR de uma semana × semanas com falta",
        substituicao: L.brl(dsrSemanal) + " × " + semanas, resultado: dsrPerdido,
        fundamento: "Falta sem justificativa faz perder o repouso da semana" });
    }
  } else if (contrato.regime === "HORISTA_RELOGIO") {
    // Não-docente pago por hora batida (recepção, portaria, manutenção):
    // mesma lógica de hora-aula sem a aula — horas contratadas × semanas do
    // mês, com o mesmo direito ao repouso semanal de 1/6.
    var horasSemana = contrato.horasSemanais || 0;
    // 5 semanas, não as 4,5 do professor: divisor próprio do horista comum.
    var semanasHorista = cct.semanasPorMesHorista || 5;
    var horasMes = horasSemana * semanasHorista;
    if (janela.parcial) horasMes = horasMes * janela.fator;
    var valorHoras = L.arredondar(contrato.valorHora * horasMes);
    rubricas.push(prov("051", "Horas trabalhadas",
      horasMes.toLocaleString("pt-BR") + "h × " + L.brl(contrato.valorHora), valorHoras));
    memoria.push({ titulo: "Horas do mês",
      formula: "horas semanais × semanas do mês × valor da hora",
      substituicao: horasSemana + " × " + semanasHorista + " × " + L.brl(contrato.valorHora),
      resultado: valorHoras, fundamento: "CLT art. 64 — divisor próprio do regime (5 semanas, não as 4,5 do colaborador)" });

    var dsrRel = L.fracDe(valorHoras, cct.diasDescansoSemana, cct.diasUteisSemana);
    rubricas.push(prov("052", "DSR sobre horas", cct.diasDescansoSemana + "/" + cct.diasUteisSemana, dsrRel));
    memoria.push({ titulo: "Repouso semanal remunerado (DSR)",
      formula: "valor das horas × dias de descanso ÷ dias úteis",
      substituicao: L.brl(valorHoras) + " × " + cct.diasDescansoSemana + "/" + cct.diasUteisSemana,
      resultado: dsrRel, fundamento: "Lei 605/49 art. 7º" });

    salarioBase = valorHoras + dsrRel;
    var valorHora = contrato.valorHora;

    var totalExtrasRel = 0;
    [[mov.horasExtras50 || 0, 50, "201"], [mov.horasExtras100 || 0, 100, "202"]].forEach(function (par) {
      if (par[0] <= 0) return;
      var v = L.arredondar(valorHora * par[0] * (1 + par[1] / 100));
      totalExtrasRel += v;
      rubricas.push(prov(par[2], "Horas extras " + par[1] + "%", par[0] + "h", v));
      memoria.push({ titulo: "Horas extras " + par[1] + "%",
        formula: "valor da hora × horas × (1 + adicional)",
        substituicao: L.brl(valorHora) + " × " + par[0] + " × " + (1 + par[1] / 100),
        resultado: v, fundamento: "Hora extra com o adicional sobre a hora normal" });
    });
    if (totalExtrasRel > 0 && cct.reflexoDsrSobreHorasExtras) {
      var dsrHERel = L.fracDe(totalExtrasRel, cct.diasDescansoSemana, cct.diasUteisSemana);
      rubricas.push(prov("203", "DSR sobre horas extras",
        cct.diasDescansoSemana + "/" + cct.diasUteisSemana, dsrHERel));
      memoria.push({ titulo: "DSR sobre horas extras", formula: "horas extras × dias de descanso ÷ dias úteis",
        substituicao: L.brl(totalExtrasRel) + " × " + cct.diasDescansoSemana + "/" + cct.diasUteisSemana,
        resultado: dsrHERel, fundamento: "Hora extra habitual reflete no repouso" });
    }

    if ((mov.horasNoturnas || 0) > 0 && cct.percentualAdicionalNoturno > 0) {
      var adicionalRel = L.arredondar(valorHora * mov.horasNoturnas * (cct.percentualAdicionalNoturno / 100));
      rubricas.push(prov("221", "Adicional noturno",
        mov.horasNoturnas + "h × " + cct.percentualAdicionalNoturno + "%", adicionalRel));
      memoria.push({ titulo: "Adicional noturno",
        formula: "valor da hora × horas noturnas × percentual",
        substituicao: L.brl(valorHora) + " × " + mov.horasNoturnas + " × " + cct.percentualAdicionalNoturno + "%",
        resultado: adicionalRel, fundamento: "CLT art. 73" });
    }

    var horasDoDia = cct.diasUteisSemana > 0 ? horasSemana / cct.diasUteisSemana : 0;
    if ((mov.diasFalta || 0) > 0 && horasDoDia > 0) {
      var vfRel = L.arredondar(valorHora * horasDoDia * mov.diasFalta);
      rubricas.push(red("521", "Faltas", mov.diasFalta + " dia(s)", vfRel));
      memoria.push({ titulo: "Desconto de faltas",
        formula: "valor da hora × horas do dia × dias de falta",
        substituicao: L.brl(valorHora) + " × " + horasDoDia.toFixed(2) + " × " + mov.diasFalta,
        resultado: vfRel, fundamento: "CLT art. 473 a contrario sensu" });
    }

    if ((mov.horasBanco || 0) > 0) {
      var vbRel = L.arredondar(valorHora * mov.horasBanco);
      rubricas.push(red("511", "Saldo negativo de banco de horas", mov.horasBanco + "h", vbRel));
      memoria.push({ titulo: "Desconto de banco de horas negativo",
        formula: "valor da hora × horas negativas autorizadas",
        substituicao: L.brl(valorHora) + " × " + mov.horasBanco,
        resultado: vbRel, fundamento: "Compensação de horas do banco" });
    }
  } else {
    // Mensalista
    salarioBase = janela.parcial ? L.arredondar(contrato.salarioBase * janela.fator) : contrato.salarioBase;
    rubricas.push(prov("001", "Salário base",
      contrato.cargaHoraria ? contrato.cargaHoraria + "h semanais" : "carga horária não informada", salarioBase));

    // CF art. 7º IV: jornada integral não pode pagar abaixo do mínimo. Só vale
    // para jornada integral — meio período (por jornada OU por mês de
    // admissão) recebe proporcional, e acusar aí seria alarme falso todo
    // mês. Espelha a guarda do motor em TypeScript.
    if (!janela.parcial && (contrato.cargaHoraria || 0) >= 40 && salarioBase > 0 && salarioBase < L.SALARIO_MINIMO) {
      avisos.push({ nivel: "divergencia",
        texto: "Salário base (" + L.brl(salarioBase) + ") está abaixo do mínimo vigente (" +
          L.brl(L.SALARIO_MINIMO) + ") para jornada integral de " + contrato.cargaHoraria + "h." });
    }
    var valorHora = contrato.salarioBase / cct.divisorMensalHoras;
    memoria.push({ titulo: "Valor da hora normal",
      formula: "salário mensal ÷ divisor mensal de horas",
      substituicao: L.brl(contrato.salarioBase) + " ÷ " + cct.divisorMensalHoras + "h",
      resultado: L.arredondar(valorHora), fundamento: "Salário mensal dividido pelo divisor de horas" });

    var totalExtras = 0;
    [[mov.horasExtras50 || 0, 50, "201"], [mov.horasExtras100 || 0, 100, "202"]].forEach(function (par) {
      if (par[0] <= 0) return;
      // Não arredonda o valor da hora antes de multiplicar: fixar o centavo
      // aqui gera divergência sistemática com a contabilidade.
      var v = L.arredondar(valorHora * par[0] * (1 + par[1] / 100));
      totalExtras += v;
      rubricas.push(prov(par[2], "Horas extras " + par[1] + "%", par[0] + "h", v));
      memoria.push({ titulo: "Horas extras " + par[1] + "%",
        formula: "valor da hora × horas × (1 + adicional)",
        substituicao: L.brl(L.arredondar(valorHora)) + " × " + par[0] + " × " + (1 + par[1] / 100),
        resultado: v, fundamento: "Hora extra com o adicional sobre a hora normal" });
    });

    if (totalExtras > 0 && cct.reflexoDsrSobreHorasExtras) {
      var dsrHE = L.fracDe(totalExtras, cct.diasDescansoSemana, cct.diasUteisSemana);
      rubricas.push(prov("203", "DSR sobre horas extras", "1/6", dsrHE));
      memoria.push({ titulo: "DSR sobre horas extras", formula: "horas extras × 1/6",
        substituicao: L.brl(totalExtras) + " × 1/6", resultado: dsrHE,
        fundamento: "Hora extra habitual reflete no repouso" });
    }

    // Espelha o motor do servidor: o mensalista com horas noturnas também
    // recebe o adicional (CLT art. 73). Sem isto a prévia da tela ficava
    // abaixo do cálculo oficial para quem tinha hora noturna lançada.
    if ((mov.horasNoturnas || 0) > 0 && cct.percentualAdicionalNoturno > 0) {
      var adicionalMens = L.arredondar(valorHora * mov.horasNoturnas * (cct.percentualAdicionalNoturno / 100));
      rubricas.push(prov("221", "Adicional noturno",
        mov.horasNoturnas + "h × " + cct.percentualAdicionalNoturno + "%", adicionalMens));
      memoria.push({ titulo: "Adicional noturno",
        formula: "valor da hora × horas noturnas × percentual",
        substituicao: L.brl(L.arredondar(valorHora)) + " × " + mov.horasNoturnas + " × " + cct.percentualAdicionalNoturno + "%",
        resultado: adicionalMens, fundamento: "CLT art. 73" });
    }

    var diasMes = L.diasNoMes(mov.competencia || L.competenciaAtual());
    if ((mov.diasFalta || 0) > 0) {
      var vDia = contrato.salarioBase / diasMes;
      var vf = L.arredondar(vDia * mov.diasFalta);
      rubricas.push(red("521", "Faltas", mov.diasFalta + " dia(s)", vf));
      memoria.push({ titulo: "Desconto de faltas",
        formula: "salário mensal ÷ dias do mês × dias de falta",
        substituicao: L.brl(contrato.salarioBase) + " ÷ " + diasMes + " × " + mov.diasFalta,
        resultado: vf, fundamento: "Falta sem justificativa: desconta o dia" });
    }

    if ((mov.horasBanco || 0) > 0) {
      var vb = L.arredondar(valorHora * mov.horasBanco);
      rubricas.push(red("511", "Saldo negativo de banco de horas", mov.horasBanco + "h", vb));
      memoria.push({ titulo: "Desconto de banco de horas negativo",
        formula: "valor da hora × horas negativas autorizadas",
        substituicao: L.brl(L.arredondar(valorHora)) + " × " + mov.horasBanco,
        resultado: vb, fundamento: "Compensação de horas do banco" });
    }
  }

  // Natureza explícita decide o sinal na base: INTEGRA soma, REDUZ subtrai,
  // NEUTRA não toca. Sem isso um desconto avulso derrubaria a base do FGTS e
  // não a do INSS, e o eSocial acusaria divergência.
  function base() {
    return rubricas.reduce(function (acc, r) {
      if (r.natureza === "INTEGRA") return acc + r.valor;
      if (r.natureza === "REDUZ") return acc - r.valor;
      return acc;
    }, 0);
  }

  var baseComum = base();
  if (baseComum < 0) {
    avisos.push({ nivel: "divergencia",
      texto: "Base de cálculo negativa: os descontos superam a remuneração do mês. Revise o lançamento do ponto." });
  }

  // Com impostos e encargos pela contabilidade, nada disso entra aqui.
  var semImpostos = L.impostosPelaContabilidade();
  var zero = { valor: 0, passos: [] };
  var inss = semImpostos ? zero : L.calcularInss(Math.max(0, baseComum), competencia, {
    remuneracao: mov.remuneracaoOutrosVinculos || 0,
    inssDescontado: mov.inssOutrosVinculos || 0
  });
  if ((mov.remuneracaoOutrosVinculos || 0) > 0 && !(mov.inssOutrosVinculos > 0)) {
    avisos.push({ nivel: "atencao",
      texto: "Foi informada remuneração de outro vínculo sem o INSS que aquele empregador reteve. " +
        "Sem esse valor o desconto sai maior do que o devido — peça o holerite da outro hotel." });
  }
  memoria = memoria.concat(inss.passos);
  if (!semImpostos) rubricas.push(neutro("601", "INSS", "base " + L.brl(baseComum), "D", inss.valor));

  var irrf = semImpostos ? zero : L.calcularIrrf(Math.max(0, baseComum), inss.valor, contrato.dependentes || 0, 0, competencia);

  // Pensão alimentícia — mesma regra do motor do servidor: valor fixo,
  // % do salário mínimo ou % do líquido antes da própria pensão; depois de
  // conhecida, o IRRF é refeito com ela como dedução.
  var pensaoValor = 0;
  if (mov.pensaoModo && (mov.pensaoQuantidade || 0) > 0) {
    if (mov.pensaoModo === "VALOR") {
      pensaoValor = Math.round(mov.pensaoQuantidade);
    } else if (mov.pensaoModo === "PERCENTUAL_SALARIO_MINIMO") {
      var sm = L.salarioMinimoVigente(competencia);
      if (sm) pensaoValor = L.pctDe(sm.valor, mov.pensaoQuantidade);
      else avisos.push({ nivel: "divergencia", texto: "Pensão sobre o salário mínimo, mas não há salário mínimo cadastrado para esta competência." });
    } else {
      pensaoValor = L.pctDe(Math.max(0, baseComum - inss.valor - irrf.valor), mov.pensaoQuantidade);
    }
    if (pensaoValor > 0) {
      if (!semImpostos) irrf = L.calcularIrrf(Math.max(0, baseComum), inss.valor, contrato.dependentes || 0, pensaoValor, competencia);
      memoria.push({ titulo: "Pensão alimentícia",
        formula: mov.pensaoModo === "VALOR" ? "valor fixo" : mov.pensaoModo === "PERCENTUAL_SALARIO_MINIMO"
          ? "salário mínimo × percentual" : "(remuneração − INSS − IRRF) × percentual",
        substituicao: mov.pensaoModo === "VALOR" ? L.brl(pensaoValor) : mov.pensaoQuantidade + "%",
        resultado: pensaoValor, fundamento: "Determinação judicial" });
    }
  }

  memoria = memoria.concat(irrf.passos);
  if (!semImpostos) rubricas.push(neutro("602", "IRRF", "base " + L.brl(baseComum), "D", irrf.valor));
  if (pensaoValor > 0) rubricas.push(neutro("604", "Pensão alimentícia", "determinação judicial", "D", pensaoValor));

  if ((mov.valeTransporte || 0) > 0) {
    var teto = L.pctDe(salarioBase, cct.vtPercentualMaximo);
    var vt = Math.min(mov.valeTransporte, teto);
    rubricas.push(neutro("603", "Vale-transporte",
      "limitado a " + cct.vtPercentualMaximo + "% do salário base", "D", vt));
    memoria.push({ titulo: "Vale-transporte",
      formula: "menor entre o custo e o percentual máximo do salário",
      substituicao: "min(" + L.brl(mov.valeTransporte) + ", " + L.brl(teto) + ")",
      resultado: vt, fundamento: "Desconto do vale-transporte, limitado a 6% do salário" });
  }

  // Descontos fixos combinados com o colaborador (cantina, saúde, mensalidade
  // de dependente, material, armário) — reduzem o líquido como o
  // vale-transporte, mas não são parcela salarial: não entram na base de
  // INSS/FGTS, e por isso vêm depois dela, não antes.
  var codigoDesconto = 610;
  (contrato.descontosFixos || []).forEach(function (d) {
    if (!d.valor) return;
    rubricas.push(neutro(String(codigoDesconto++), d.nome, "combinado com a pessoa", "D", d.valor));
  });
  // Descontos do mês lançados no movimento: valor cheio, fora das bases.
  [["descontoCantina", "Cantina"], ["descontoMaterial", "Material hotelr"], ["descontoMensalidade", "Mensalidade"],
   ["descontoPlanoSaude", "Plano de saúde"], ["descontoAdiantamento", "Adiantamento (vale)"],
   ["descontoRobotica", "Robótica"], ["descontoEmprestimos", "Empréstimos"], ["descontoOutros", "Outros descontos"]].forEach(function (d, i) {
    var nome = d[0] === "descontoOutros" && mov.descontoOutrosObs ? d[1] + " — " + mov.descontoOutrosObs : d[1];
    if ((mov[d[0]] || 0) > 0) rubricas.push(neutro(String(620 + i), nome, "lançado no mês", "D", mov[d[0]]));
  });
  // Ticket é pago à parte: sai da folha para não pagar duas vezes (igual ao servidor).
  if ((contrato.valorTicket || 0) > 0) rubricas.push(neutro("680", "Ticket (pago à parte)", "pago à parte", "D", contrato.valorTicket));

  var baseEnc = Math.max(0, baseComum);
  // Aprendiz recolhe FGTS a 2%, não os 8% do CLT comum — é a única alíquota
  // que muda; INSS patronal segue igual (Lei 8.036/90 art. 15 §7º).
  var souAprendiz = contrato.tipoContrato === "APRENDIZ";
  var fgtsPct = souAprendiz ? 2 : cct.fgtsPercentual;
  var fgts = L.pctDe(baseEnc, fgtsPct);
  rubricas.push(neutro("801", "FGTS", fgtsPct + "% sobre " + L.brl(baseEnc), "E", fgts));
  memoria.push({ titulo: "FGTS (encargo do empregador)", formula: "base × alíquota",
    substituicao: L.brl(baseEnc) + " × " + fgtsPct + "%", resultado: fgts,
    fundamento: souAprendiz ? "FGTS reduzido do aprendiz — Lei 8.036/90 art. 15 §7º" : "FGTS sobre a remuneração do mês" });

  var patronalPct = cct.cppPercentual + cct.ratPercentual + cct.terceirosPercentual;
  var patronal = L.pctDe(baseEnc, patronalPct);
  rubricas.push(neutro("802", "INSS patronal, RAT e terceiros",
    patronalPct.toFixed(2) + "% sobre " + L.brl(baseEnc), "E", patronal));
  memoria.push({ titulo: "Contribuição patronal (CPP + RAT + terceiros)",
    formula: "base × (CPP + RAT/FAP + terceiros)",
    substituicao: L.brl(baseEnc) + " × (" + cct.cppPercentual + "% + " + cct.ratPercentual + "% + " + cct.terceirosPercentual + "%)",
    resultado: patronal, fundamento: "Encargo patronal, variável por atividade da empresa" });

  var encPct = fgtsPct + patronalPct;
  var p13 = L.fracDe(baseEnc, 1, 12);
  rubricas.push(neutro("811", "Provisão de 13º salário", "1/12 + encargos", "E", p13 + L.pctDe(p13, encPct)));
  var pFer = L.mult(L.fracDe(baseEnc, 1, 12), 1 + cct.tercoConstitucional / 100);
  rubricas.push(neutro("812", "Provisão de férias + 1/3", "1/12 × 1,3333 + encargos", "E", pFer + L.pctDe(pFer, encPct)));

  if (semImpostos) {
    rubricas = rubricas.filter(function (r) { return r.tipo !== "E"; });
    memoria = memoria.filter(function (p) { return !/^FGTS \(encargo|patronal/i.test(p.titulo); });
  }
  var somaTipo = function (t) {
    return rubricas.filter(function (r) { return r.tipo === t; })
      .reduce(function (a, r) { return a + r.valor; }, 0);
  };
  var proventos = somaTipo("P"), descontos = somaTipo("D"), encargos = somaTipo("E");
  var reducoes = rubricas.filter(function (r) { return r.natureza === "REDUZ"; })
    .reduce(function (a, r) { return a + r.valor; }, 0);
  var liquido = proventos - descontos;

  if (liquido < 0) {
    avisos.push({ nivel: "divergencia",
      texto: "Líquido negativo: os descontos superam os proventos. Revise antes de fechar." });
  }

  if (ocultarDsr) {
    // O DSR é devido e continua pago: só deixa de aparecer como linha própria.
    for (var k = rubricas.length - 1; k > 0; k--) {
      var r = rubricas[k], origem = rubricas[k - 1];
      if (r.tipo === "P" && /^DSR sobre/i.test(r.desc) && origem.tipo === "P") {
        rubricas[k - 1] = Object.assign({}, origem, { valor: origem.valor + r.valor });
        rubricas.splice(k, 1);
      }
    }
    // Memória de cálculo: o passo do DSR some, o valor entra no passo de
    // origem e nenhuma frase fala de repouso/DSR.
    for (var q = memoria.length - 1; q > 0; q--) {
      var passo = memoria[q];
      if (/^(Repouso semanal|DSR)/i.test(passo.titulo)) {
        memoria[q - 1] = Object.assign({}, memoria[q - 1], { resultado: memoria[q - 1].resultado + passo.resultado });
        memoria.splice(q, 1);
      }
    }
    var limpar = function (t) {
      return t ? String(t).replace(/,? ?mais (o )?(1\/6 de )?(repouso|DSR)/gi, "").replace(/ \+ (reflexo de )?(repouso|DSR)/gi, "") : t;
    };
    memoria = memoria.map(function (m) {
      return Object.assign({}, m, { formula: limpar(m.formula), fundamento: limpar(m.fundamento) });
    });
    // Perda do repouso por falta injustificada é desconto: continua, com outro nome.
    var renomear = function (t) {
      return t ? String(t).replace(/DSR perdido/gi, "Perda semanal").replace(/Perda do DSR/gi, "Perda semanal")
        .replace(/DSR de uma semana/gi, "valor de uma semana")
        .replace(/perder o repouso da semana/gi, "perder a remuneração semanal")
        .replace(/(\d+) repouso\(s\)/gi, "$1 semana(s)") : t;
    };
    rubricas = rubricas.map(function (r) {
      return r.tipo === "D" ? Object.assign({}, r, { desc: renomear(r.desc), ref: renomear(r.ref) }) : r;
    });
    memoria = memoria.map(function (m) {
      return Object.assign({}, m, { titulo: renomear(m.titulo), formula: renomear(m.formula), fundamento: renomear(m.fundamento) });
    });
  }

  return {
    rubricas: rubricas, memoria: memoria, avisos: avisos,
    proventos: proventos, descontos: descontos, liquido: liquido,
    // Bruto pago menos o que reduz a remuneração, mais encargos. Não usa a
    // base do FGTS como aproximação do bruto.
    remuneracaoBruta: proventos - reducoes,
    custoEmpregador: proventos - reducoes + encargos
  };
};

// ---------------------------------------------------------------- prestador PJ / MEI
// Não é folha: não há salário, INSS de segurado, FGTS, 13º nem férias. Existe
// uma nota fiscal, eventuais retenções e um pagamento. Tratar MEI dentro do
// motor da CLT criaria rubricas que não existem e um custo falso.

L.PARAMETROS_PRESTADOR = {
  cppPercentualSobreMei: 20, irrfPercentual: 1.5,
  csrfPercentual: 4.65, csrfValorMinimo: L.reais(215), issPercentual: 0
};

L.calcularPrestador = function (f, competencia) {
  var comp = competencia || L.competenciaAtual();
  // O contrato não existia antes de começar: sem isto, um prestador admitido
  // em setembro já pesava na folha de agosto. No mês de início o valor é
  // proporcional aos dias (mesma regra do mensalista).
  var janela = L.janelaTrabalhada(comp, f.admissao);
  if (janela.dias === 0) {
    return { prestador: true, rubricas: [], memoria: [],
      avisos: [{ nivel: "divergencia",
        texto: "Contrato de prestação não estava ativo em " + L.competenciaBR(comp) + " (início em " + L.dataBR(f.admissao) + ")." }],
      proventos: 0, descontos: 0, liquido: 0, remuneracaoBruta: 0, custoEmpregador: 0 };
  }
  var p = L.PARAMETROS_PRESTADOR;
  var bruto = f.valorMensal || 0;
  var memoria = [], avisos = [], retencoes = [];

  memoria.push({ titulo: "Valor da nota fiscal de serviço",
    formula: "valor mensal contratado", substituicao: L.brl(bruto), resultado: bruto,
    fundamento: "Contrato de prestação de serviço — " + (f.enquadramento || "MEI") });

  var comecouNoMes = f.admissao && f.admissao.slice(0, 7) === comp;
  if (comecouNoMes && janela.dias < janela.totalDeDias) {
    var cheio = bruto;
    bruto = Math.round(cheio * janela.dias / janela.totalDeDias);
    memoria.push({ titulo: "Mês de início — valor proporcional aos dias",
      formula: "valor mensal × dias de contrato ÷ dias do mês",
      substituicao: L.brl(cheio) + " × " + janela.dias + "/" + janela.totalDeDias, resultado: bruto,
      fundamento: "Contrato iniciado em " + L.dataBR(f.admissao) });
    avisos.push({ nivel: "info",
      texto: "Mês de início: valor proporcional a " + janela.dias + " de " + janela.totalDeDias +
        " dias (" + L.brl(bruto) + " de " + L.brl(cheio) + "). Confira com a nota fiscal do prestador." });
  }

  var optanteSimples = f.enquadramento === "MEI" || f.enquadramento === "PJ_SIMPLES";

  if (!optanteSimples) {
    var irrf = L.pctDe(bruto, p.irrfPercentual);
    retencoes.push({ desc: "IRRF sobre serviço", valor: irrf });
    memoria.push({ titulo: "IRRF retido na fonte", formula: "valor do serviço × alíquota",
      substituicao: L.brl(bruto) + " × " + p.irrfPercentual + "%", resultado: irrf,
      fundamento: "Serviço profissional prestado por empresa" });
    if (bruto >= p.csrfValorMinimo) {
      var csrf = L.pctDe(bruto, p.csrfPercentual);
      retencoes.push({ desc: "PIS, COFINS e CSLL", valor: csrf });
      memoria.push({ titulo: "CSRF retida na fonte", formula: "valor do serviço × alíquota conjunta",
        substituicao: L.brl(bruto) + " × " + p.csrfPercentual + "%", resultado: csrf,
        fundamento: "Retenção na nota do prestador" });
    }
  } else {
    memoria.push({ titulo: "Sem retenção de IRRF e CSRF", formula: "optante do Simples Nacional",
      substituicao: f.enquadramento || "MEI", resultado: 0,
      fundamento: "MEI recolhe por conta própria, no DAS" });
  }

  var encargo = 0;
  if (f.enquadramento === "MEI" && f.servicoComCpp === "SIM") {
    encargo = L.pctDe(bruto, p.cppPercentualSobreMei);
    memoria.push({ titulo: "CPP da contratante sobre serviço de MEI",
      formula: "valor do serviço × 20%",
      substituicao: L.brl(bruto) + " × " + p.cppPercentualSobreMei + "%", resultado: encargo,
      fundamento: "Devida só em hidráulica, eletricidade, pintura, alvenaria, carpintaria e manutenção de veículos" });
  } else if (f.enquadramento === "MEI") {
    memoria.push({ titulo: "Sem CPP sobre o serviço de MEI",
      formula: "serviço fora da lista do art. 18-B", substituicao: f.cargo || "—", resultado: 0,
      fundamento: "Contribuição patronal sobre serviço de MEI" });
  }

  // O maior risco de contratar professor como MEI não é tributário: é a ação
  // de reconhecimento de vínculo. Se vier, a escola paga tudo retroativo.
  var sinais = [];
  if (f.temHorarioFixo === "SIM") sinais.push("cumpre horário fixo");
  if (f.temExclusividade === "SIM") sinais.push("presta serviço com exclusividade");
  if (f.temSubordinacao === "SIM") sinais.push("recebe ordens diretas");
  if (f.substituivel === "NAO") sinais.push("não pode ser substituído por outro profissional");

  if (sinais.length >= 2) {
    avisos.push({ nivel: "divergencia",
      texto: "Risco alto de reconhecimento de vínculo empregatício: " + sinais.join(", ") +
        ". Reunidos pessoalidade, habitualidade, subordinação e onerosidade (CLT art. 3º), a contratação como MEI pode ser desconsiderada e o hotel responder por todo o passivo trabalhista retroativo. Recomenda-se revisão jurídica do contrato." });
  } else if (sinais.length === 1) {
    avisos.push({ nivel: "atencao",
      texto: "Atenção ao contrato: " + sinais[0] + ". Sinal isolado não caracteriza vínculo, mas convém documentar a autonomia do prestador." });
  }
  avisos.push({ nivel: "info",
    texto: "Prestador de serviço não gera FGTS, 13º salário, férias nem provisões. O custo do hotel é a nota fiscal mais eventuais encargos da contratante." });

  var totalRetencoes = retencoes.reduce(function (a, r) { return a + r.valor; }, 0);

  var rubricas = [{ cod: "901", desc: "Serviço prestado (nota fiscal)", ref: f.cargo || "—", valor: bruto, tipo: "P", natureza: "INTEGRA" }];
  retencoes.forEach(function (r, i) {
    rubricas.push({ cod: "95" + (i + 1), desc: r.desc, ref: "retenção na fonte", valor: r.valor, tipo: "D", natureza: "NEUTRA" });
  });
  if (encargo > 0) {
    rubricas.push({ cod: "902", desc: "CPP da contratante", ref: "20% sobre a nota", valor: encargo, tipo: "E", natureza: "NEUTRA" });
  }

  // Desconto combinado com a pessoa (cantina, saúde, material) — mesmo
  // tratamento do colaborador MENSALISTA: abate do líquido pago, não da nota
  // nem do custo da contratante.
  var codigoDesconto = 610;
  var totalDescontosFixos = 0;
  (f.descontosFixos || []).forEach(function (d) {
    // Valor negativo aqui viraria PROVENTO disfarçado de desconto: some do
    // total e aumenta o líquido sem nenhuma rubrica que explique de onde veio.
    if (!(d.valor > 0)) return;
    totalDescontosFixos += d.valor;
    rubricas.push(neutro(String(codigoDesconto++), d.nome, "combinado com a pessoa", "D", d.valor));
  });

  // Descontos do mês (Cantina, Plano de saúde...): lançados em "Lançar
  // movimento" só para esta competência — não se repetem no mês seguinte.
  var mov = L.movimentoDe(f.id, comp);
  [["descontoCantina", "Cantina"], ["descontoMaterial", "Material hotelr"], ["descontoMensalidade", "Mensalidade"],
   ["descontoPlanoSaude", "Plano de saúde"], ["descontoAdiantamento", "Adiantamento (vale)"],
   ["descontoRobotica", "Robótica"], ["descontoEmprestimos", "Empréstimos"], ["descontoOutros", "Outros descontos"]]
    .forEach(function (par) {
      var v = mov[par[0]] || 0;
      if (!(v > 0)) return;
      totalDescontosFixos += v;
      rubricas.push(neutro(String(codigoDesconto++), par[1], "lançado no mês", "D", v));
    });

  var liquido = bruto - totalRetencoes - totalDescontosFixos;
  if (liquido < 0) {
    avisos.push({ nivel: "divergencia",
      texto: "Os descontos combinados (" + L.brl(totalDescontosFixos) + ") passam do valor da nota (" +
        L.brl(bruto) + "): o líquido ficaria negativo, ou seja, a pessoa deveria dinheiro ao hotel no fim do mês. " +
        "Confira os descontos lançados ou o valor contratado antes de pagar." });
  }

  return {
    prestador: true, rubricas: rubricas, memoria: memoria, avisos: avisos,
    proventos: bruto, descontos: totalRetencoes + totalDescontosFixos,
    liquido: liquido,
    remuneracaoBruta: bruto, custoEmpregador: bruto + encargo
  };
};

// ---------------------------------------------------------------- estágio
// Lei 11.788/2008 art. 3º: NÃO é vínculo empregatício. Bolsa e auxílio-
// transporte, não salário — sem INSS de segurado, sem FGTS, sem 13º nem
// férias no sentido da CLT. Tratar como MENSALISTA cobraria imposto que a
// lei não prevê e geraria um passivo de FGTS que não existe.

L.calcularEstagiario = function (f, competencia) {
  var comp = competencia || L.competenciaAtual();
  var janela = L.janelaTrabalhada(comp, f.admissao);
  if (janela.dias === 0) {
    return { estagiario: true, rubricas: [], memoria: [],
      avisos: [{ nivel: "divergencia",
        texto: "Estágio não estava ativo em " + L.competenciaBR(comp) + " (início em " + L.dataBR(f.admissao) + ")." }],
      proventos: 0, descontos: 0, liquido: 0, remuneracaoBruta: 0, custoEmpregador: 0 };
  }
  var bolsa = f.bolsa || 0;
  var auxilio = f.auxilioTransporte || 0;
  if (janela.parcial) { bolsa = L.arredondar(bolsa * janela.fator); auxilio = L.arredondar(auxilio * janela.fator); }
  var memoria = [], avisos = [];
  if (janela.parcial) {
    avisos.push({ nivel: "atencao",
      texto: "Mês de início do estágio: bolsa proporcional a " + janela.dias + " de " + janela.totalDeDias + " dias." });
  }

  memoria.push({ titulo: "Bolsa-auxílio", formula: "valor contratado",
    substituicao: L.brl(bolsa), resultado: bolsa,
    fundamento: "Lei 11.788/2008 art. 12 — não é salário, é bolsa" });
  if (auxilio > 0) {
    memoria.push({ titulo: "Auxílio-transporte", formula: "valor contratado",
      substituicao: L.brl(auxilio), resultado: auxilio,
      fundamento: "Lei 11.788/2008 art. 12 — obrigatório quando há deslocamento" });
  }

  // Bolsa de estágio é rendimento tributável pela tabela progressiva mensal,
  // mesmo sem vínculo empregatício — só não tem a dedução de INSS que o
  // salário tem, porque não há INSS de segurado a descontar.
  var tributavel = bolsa + auxilio;
  var irrf = L.calcularIrrf(tributavel, 0, f.dependentes || 0, 0, competencia);
  memoria = memoria.concat(irrf.passos);

  var rubricas = [
    { cod: "901", desc: "Bolsa-auxílio", ref: f.instituicaoEnsino || "—", valor: bolsa, tipo: "P", natureza: "INTEGRA" }
  ];
  if (auxilio > 0) {
    rubricas.push({ cod: "902", desc: "Auxílio-transporte", ref: "—", valor: auxilio, tipo: "P", natureza: "INTEGRA" });
  }
  if (irrf.valor > 0) {
    rubricas.push({ cod: "602", desc: "IRRF", ref: "retenção na fonte", valor: irrf.valor, tipo: "D", natureza: "NEUTRA" });
  }

  avisos.push({ nivel: "info",
    texto: "Estágio: sem INSS, FGTS, 13º e férias. Recesso de 30 dias/ano e seguro de acidentes não entram neste cálculo." });

  var liquido = tributavel - irrf.valor;
  return {
    estagiario: true, rubricas: rubricas, memoria: memoria, avisos: avisos,
    proventos: tributavel, descontos: irrf.valor, liquido: liquido,
    remuneracaoBruta: tributavel, custoEmpregador: tributavel
  };
};

/** Dispatcher: PJ e estágio têm natureza jurídica diferente e motor próprio. */
/**
 * Cache da folha por funcionário. O dashboard sozinho pedia 129 cálculos —
 * uma vez para os indicadores, outra para os alertas, outra para a
 * conferência contra a planilha. O motor é puro, então o mesmo estado sempre
 * devolve o mesmo resultado: guardar é seguro.
 *
 * `L.versao` sobe a cada escrita e invalida tudo de uma vez. É grosseiro de
 * propósito — invalidação fina é onde nasce bug de valor desatualizado, e o
 * ganho aqui já é de uma ordem de grandeza.
 */
L.versao = 0;
var cacheFolha = new Map();

L.calcular = function (f, competencia) {
  var comp = competencia || L.competenciaAberta();
  // Salário restrito à Direção: sem conta, sem valor.
  if (f.salarioOculto) {
    return { rubricas: [], memoria: [], avisos: [], proventos: null, descontos: null, liquido: null,
      remuneracaoBruta: null, custoEmpregador: null, oculto: true };
  }

  // Competência fechada devolve o que foi APURADO no fechamento, não um
  // recálculo. Sem isto, dar aumento a um professor em janeiro mudaria a folha
  // de agosto que já foi paga — e aumento acontece todo ano. É o equivalente
  // ao `folha_calculos` do banco, que grava o resultado com o contrato, a CCT
  // e as tabelas que o produziram.
  var apurada = L.folhaApurada(f.id, comp);
  if (apurada) return apurada;

  var regimeCustom = f.regime === "PRESTADOR_PJ" || f.regime === "ESTAGIARIO";
  var contrato = regimeCustom ? null : L.contratoDe(f);
  var movimento = regimeCustom ? null : L.movimentoDe(f.id, comp);

  /**
   * A chave são os INSUMOS, não um contador global. Com `L.versao` na chave,
   * mexer em qualquer registro do sistema derrubava o cache dos 43 — corrigir
   * o telefone de uma pessoa recalculava a folha da escola inteira.
   *
   * Chavear pelo insumo é seguro porque o motor é puro e determinístico
   * (mesmo insumo, mesmo resultado — há teste para isso): se contrato,
   * movimento e tabelas não mudaram, o resultado não pode ter mudado.
   */
  var chave = f.id + "|" + comp + "|" + JSON.stringify([
    contrato, movimento,
    // O prestador não passa por `contrato`, então TODO insumo dele precisa
    // estar aqui: faltando `descontosFixos`, mudar o desconto de alguém
    // devolvia o líquido antigo do cache. Os quatro campos de vínculo entram
    // porque mudam os avisos de risco trabalhista.
    f.regime === "PRESTADOR_PJ"
      ? [f.valorMensal, f.enquadramento, f.servicoComCpp, f.descontosFixos, f.cargo,
         f.temHorarioFixo, f.temExclusividade, f.temSubordinacao, f.substituivel, f.admissao]
      : null,
    // Estagiário também não passa por `contrato` — os insumos são a bolsa,
    // o auxílio e o prazo, não um regime de folha.
    f.regime === "ESTAGIARIO"
      ? [f.bolsa, f.auxilioTransporte, f.dependentes, f.dataFimPrevista, f.instituicaoEnsino, f.admissao]
      : null,
    L.tabelaVigente("INSS", comp), L.tabelaVigente("IRRF", comp),
    L.impostosPelaContabilidade(), L.ocultarDsr(),
    L.CCT,
    // CCT e salário mínimo têm `conferida` mudando fora deste cálculo (RH
    // confirma em Tabelas Legais) — sem entrar na chave, o divergência sumia
    // da tela só quando outra escrita qualquer derrubasse o cache inteiro.
    L.estado.ccts, L.estado.salarioMinimo
  ]);
  var guardado = cacheFolha.get(chave);
  if (guardado) return guardado;

  var r = f.regime === "PRESTADOR_PJ" ? L.calcularPrestador(f, comp)
    : f.regime === "ESTAGIARIO" ? L.calcularEstagiario(f, comp)
    : L.calcularFolha(contrato, movimento, f);

  // Só o ciclo corrente interessa: ao mudar a versão o mapa inteiro vira lixo.
  // Sem contador global na chave, entradas antigas não se invalidam sozinhas:
  // o teto evita o mapa crescer sem fim numa sessão longa. Descartar é seguro
  // — o pior caso é recalcular.
  if (cacheFolha.size > 400) cacheFolha.clear();
  cacheFolha.set(chave, r);
  return r;
};

/** Monta o contrato a partir do cadastro do funcionário. */
L.contratoDe = function (f) {
  if (f.regime === "HORISTA_AULA") {
    return {
      regime: "HORISTA_AULA",
      valorHoraAula: f.valorHoraAula,
      aulasSemanais: f.aulasSemanais,
      // Carga por segmento, quando veio da planilha da escola.
      cargas: f.cargas,
      dependentes: f.dependentes,
      // "CLT" (padrão) ou "APRENDIZ" — só o aprendiz muda o cálculo (FGTS a
      // 2%); "TEMPORARIO" não muda nada aqui, só exige prazo de término.
      tipoContrato: f.tipoContrato,
      admissao: f.admissao,
      valorTicket: f.temTicket && !f.ticketSoma ? (f.valorTicket || 0) : 0
    };
  }
  if (f.regime === "HORISTA_RELOGIO") {
    // Não-docente pago por hora batida (recepção, portaria, manutenção) —
    // hora fixa contratada, não hora-aula: sem carga por segmento, sem
    // hora-atividade, mas com o mesmo direito a hora extra e DSR de quem
    // é mensalista.
    return { regime: "HORISTA_RELOGIO", valorHora: f.valorHora, horasSemanais: f.horasSemanais,
      dependentes: f.dependentes, descontosFixos: f.descontosFixos || null, tipoContrato: f.tipoContrato,
      admissao: f.admissao, valorTicket: 0 };
  }
  return { regime: "MENSALISTA", salarioBase: f.salarioBase, cargaHoraria: f.cargaHoraria, dependentes: f.dependentes,
    // Descontos fixos recorrentes do colaborador (cantina, plano de
    // saúde, mensalidade escolar de dependente, material, armário) —
    // acordo entre a pessoa e a escola, não desconto trabalhista, por
    // isso não entram na base de INSS/FGTS (mesmo tratamento do VT).
    descontosFixos: f.descontosFixos || null, tipoContrato: f.tipoContrato, admissao: f.admissao,
    valorTicket: 0 };
};

/** Total de aulas semanais, somando os segmentos. */
L.aulasSemanaisDe = function (f) {
  if (f.cargas && f.cargas.length) {
    return f.cargas.reduce(function (a, c) { return a + c.aulas; }, 0);
  }
  return f.aulasSemanais || 0;
};

/** Hora-aula média ponderada pelas aulas de cada segmento. */
L.horaAulaDe = function (f) {
  if (f.cargas && f.cargas.length) {
    var aulas = L.aulasSemanaisDe(f);
    if (aulas === 0) return 0;
    return L.arredondar(f.cargas.reduce(function (a, c) {
      return a + c.aulas * c.valorHora;
    }, 0) / aulas);
  }
  return f.valorHoraAula || 0;
};

/**
 * Aulas de projeto / aula extra (o que passa da grade de 40): quantas por semana
 * e quanto valem na folha (linha + repouso). Serve a tela da Folha e o Excel.
 */
L.projetoDe = function (f, competencia, rubricas) {
  if (!f || f.regime !== "HORISTA_AULA") return { aulas: 0, valor: 0 };
  var aulas = L.movimentoDe(f.id, competencia).aulasExtrasSemanais || 0;
  var valor = (rubricas || []).reduce(function (t, x) {
    return /^(111|112|115|116)$/.test(String(x.cod)) && x.tipo === "P" ? t + x.valor : t;
  }, 0);
  return { aulas: aulas, valor: valor };
};

/** Movimento gravado da competência, se houver. */
L.movimentoGravado = function (funcionarioId, competencia) {
  return L.estado.movimentos.find(function (m) {
    return m.funcionarioId === funcionarioId && m.competencia === competencia;
  }) || null;
};

/**
 * O que varia no mês. Vem do lançamento da competência quando existe; senão,
 * do cadastro do funcionário, que é a carga que se repete todo mês.
 */
L.movimentoDe = function (funcionarioId, competencia) {
  var comp = competencia || L.competenciaAberta();
  var minutos = L.saldoBanco(funcionarioId);
  var f = L.buscarPorId("funcionarios", funcionarioId);
  var g = L.movimentoGravado(funcionarioId, comp);

  return {
    competencia: comp,
    // Carga extra semanal (Tb.Ex, Raízes, Câmara, Monitoria).
    // Aceita os dois nomes: o cadastro traz `aulasExtrasSemanais` (soma das
    // aulas de projeto nomeadas), e o campo antigo `aulasExtras` continua
    // valendo para quem foi cadastrado à mão antes.
    aulasExtrasSemanais: g
      ? (g.aulasExtrasSemanais || 0)
      : ((f && (f.aulasExtrasSemanais || f.aulasExtras)) || 0),
    valorHoraExtra: g ? (g.valorHoraExtra || 0) : ((f && f.valorHoraExtra) || 0),
    aulasExtras: g ? (g.aulasExtras || 0) : 0,
    aulasSubstituicao: g ? (g.aulasSubstituicao || 0) : 0,
    aulasNoturnas: g ? (g.aulasNoturnas || 0) : 0,
    aulasNaoDadas: g ? (g.aulasNaoDadas || 0) : 0,
    semanasFalta: g ? (g.semanasFalta || 0) : 0,
    horasExtras50: g ? (g.horasExtras50 || 0) : 0,
    horasExtras100: g ? (g.horasExtras100 || 0) : 0,
    diasFalta: g ? (g.diasFalta || 0) : 0,
    horasNoturnas: g ? (g.horasNoturnas || 0) : 0,
    horasBanco: minutos < 0 ? Math.round((-minutos / 60) * 100) / 100 : 0,
    valeTransporte: g ? (g.valeTransporte || 0) : 0,
    // Outro emprego CLT no mesmo mês: entra no INSS consolidado.
    remuneracaoOutrosVinculos: g ? (g.remuneracaoOutrosVinculos || 0) : 0,
    inssOutrosVinculos: g ? (g.inssOutrosVinculos || 0) : 0,
    pensaoModo: g ? (g.pensaoModo || null) : null,
    pensaoQuantidade: g ? (g.pensaoQuantidade || 0) : 0,
    descontoCantina: g ? (g.descontoCantina || 0) : 0,
    descontoMaterial: g ? (g.descontoMaterial || 0) : 0,
    descontoMensalidade: g ? (g.descontoMensalidade || 0) : 0,
    descontoPlanoSaude: g ? (g.descontoPlanoSaude || 0) : 0,
    descontoAdiantamento: g ? (g.descontoAdiantamento || 0) : 0,
    descontoRobotica: g ? (g.descontoRobotica || 0) : 0,
    descontoEmprestimos: g ? (g.descontoEmprestimos || 0) : 0,
    descontoOutros: g ? (g.descontoOutros || 0) : 0,
    descontoOutrosObs: g ? (g.descontoOutrosObs || "") : ""
  };
};

/** Grava o que variou para uma pessoa numa competência. */
L.lancarMovimento = function (funcionarioId, competencia, dados) {
  if (L.periodoFechado(competencia)) return null;
  var f = L.buscarPorId("funcionarios", funcionarioId);
  var descricao = "Movimento de " + (f ? f.nome : funcionarioId) + " em " + L.competenciaBR(competencia);
  var g = L.movimentoGravado(funcionarioId, competencia);
  if (g) return L.atualizar("movimentos", g.id, Object.assign({ descricao: descricao }, dados));
  return L.criar("movimentos", Object.assign(
    { funcionarioId: funcionarioId, competencia: competencia, descricao: descricao }, dados));
};

// ---------------------------------------------------------------- derivações

L.saldoBanco = function (funcionarioId) {
  return L.estado.lancamentosBanco
    .filter(function (l) { return l.funcionarioId === funcionarioId; })
    .reduce(function (a, l) { return a + l.minutos; }, 0);
};

L.situacaoBanco = function (minutos) {
  if (minutos <= -600) return { chave: "critico", rotulo: "Crítico" };
  if (minutos < 0) return { chave: "pendente", rotulo: "Atenção" };
  if (minutos >= 1200) return { chave: "destaque", rotulo: "Excesso" };
  if (minutos === 0) return { chave: "neutro", rotulo: "Zerado" };
  return { chave: "ok", rotulo: "Crédito" };
};

/**
 * Ordem alfabética por nome, sempre. Quem confere folha lê com a planilha do
 * lado, e procurar alguém numa lista fora de ordem é o que faz a conferência
 * demorar. `localeCompare` com "pt-BR" põe acento no lugar certo: Álvaro antes
 * de Amanda, não depois de Zuleica.
 */
// ---------------------------------------------------------------- vínculo e empresa
//
// Os códigos são os da planilha da escola. Ficam aqui, não na tela, porque
// quem lê "2" precisa saber que é CLT + Ticket em qualquer lugar do sistema.

L.EMPRESAS = {
  "1": { nome: "Hotel", curto: "Hotel" },
  "2": { nome: "ServJU", curto: "ServJU" },
  "3": { nome: "ServMA", curto: "ServMA" }
};

L.VINCULOS = {
  "1": { nome: "CLT", clt: true, ticket: false, mei: false },
  "2": { nome: "CLT + Ticket", clt: true, ticket: true, mei: false },
  "3": { nome: "MEI", clt: false, ticket: false, mei: true },
  "4": { nome: "CLT + MEI", clt: true, ticket: false, mei: true },
  "5": { nome: "CLT + MEI + Ticket", clt: true, ticket: true, mei: true }
};

/**
 * Uma pessoa pode ter mais de um código na planilha (ex.: "1;4"), e os
 * códigos já são compostos ("4" é "CLT + MEI" sozinho) — juntar o NOME de
 * cada código com os outros duplicava a parte que os dois já tinham em
 * comum ("1"=CLT e "4"=CLT+MEI virava "CLT · CLT + MEI" em vez de só
 * "CLT + MEI"). Por isso o rótulo sai da UNIÃO das três bandeiras
 * (tem CLT / tem ticket / tem MEI), não da concatenação dos nomes.
 */
/** Ticket descontado da folha: só professor (hora-aula), salvo quem foi marcado para somar como colaborador. */
L.ticketDesconta = function (f) { return !!f && f.regime === "HORISTA_AULA" && !f.ticketSoma; };

/**
 * Como o total da pessoa se divide: CLT (folha), Ticket (pago à parte) e MEI (nota fiscal).
 * O total que a folha calcula é CLT + Ticket + MEI; o CLT é o que sobra depois de tirar o Ticket que
 * desconta e o MEI que já está dentro do total. MEI "por fora" (CLT cadastrado = folha) fica de fora do total.
 */
L.divisaoPagamento = function (f, comp, totalOficial) {
  if (!f || f.regime === "PRESTADOR_PJ") return null;
  var c = L.calcular(f, comp);
  if (totalOficial != null) c = Object.assign({}, c, { proventos: totalOficial });
  var meiPorFora = f.valorMei > 0 && f.valorClt > 0 && Math.abs(f.valorClt - c.custoEmpregador) <= 100;
  var ticket = f.valorTicket > 0 ? f.valorTicket : 0;
  var tiraTicket = ticket && L.ticketDesconta(f) ? ticket : 0;
  var tiraMei = f.valorMei > 0 && !meiPorFora ? f.valorMei : 0;
  var clt = tiraTicket || tiraMei ? Math.max(0, c.proventos - tiraTicket - tiraMei) : (f.valorClt || (f.temMei || f.valorMei > 0 || ticket > 0 ? c.proventos : 0) || 0);
  return { clt: clt, ticket: ticket, mei: f.valorMei > 0 ? f.valorMei : 0, meiADefinir: !!f.temMei && !(f.valorMei > 0), meiPorFora: meiPorFora, meiDentro: tiraMei > 0, total: c.proventos };
};

L.vinculoDe = function (f) {
  // Prestador PJ/MEI não tem contrato CLT nenhum — `temClt`/`temTicket`/
  // `temMei` vêm todos `false` da API para ele (são colunas de
  // `contratos_remuneracao`, que ele não tem linha nenhuma), e sem este
  // caso a função caía no "—" (sem código), como se o vínculo não
  // estivesse cadastrado, quando na verdade é 100% MEI/PJ.
  if (f && f.regime === "PRESTADOR_PJ") {
    var rotuloPrestador =
      { MEI: "MEI", PJ_SIMPLES: "PJ — Simples Nacional", PJ_LUCRO_PRESUMIDO: "PJ — Lucro Presumido" }[f.enquadramento]
      || "PJ";
    return { codigos: [], rotulo: rotuloPrestador, temTicket: false, temMei: f.enquadramento === "MEI", temClt: false };
  }
  var codigos = (f && f.vinculoCodigos) || [];
  // `temClt`/`temTicket`/`temMei` vêm prontos da API (banco real guarda a
  // bandeira direto, não o código de planilha) — o protótipo local só tem
  // `vinculoCodigos`/`valorX`. As três formas convivem sem conflito.
  var temTicket = codigos.some(function (c) { return (L.VINCULOS[c] || {}).ticket; }) || (f && f.valorTicket > 0) || !!(f && f.temTicket);
  var temMei = codigos.some(function (c) { return (L.VINCULOS[c] || {}).mei; }) || (f && f.valorMei > 0) || !!(f && f.temMei);
  var temClt = codigos.some(function (c) { return (L.VINCULOS[c] || {}).clt; }) || (f && f.valorClt > 0) || !!(f && f.temClt);
  var partes = [];
  if (temClt) partes.push("CLT");
  if (temTicket) partes.push("Ticket");
  if (temMei) partes.push("MEI");
  return {
    codigos: codigos,
    rotulo: partes.length ? partes.join(" + ") : "—",
    temTicket: temTicket, temMei: temMei, temClt: temClt
  };
};

/**
 * Grupo EXATO de pagamento — "CLT" e "CLT + MEI" são grupos diferentes, não
 * o mesmo grupo com uma bandeira a mais. É o que "hoje quero pagar os MEI"
 * pede de verdade: só quem é MEI puro, sem misturar quem também tem CLT.
 */
L.grupoPagamentoDe = function (f) {
  if (f && f.regime === "PRESTADOR_PJ") {
    return { MEI: "MEI", PJ_SIMPLES: "PJ — Simples Nacional", PJ_LUCRO_PRESUMIDO: "PJ — Lucro Presumido" }[f.enquadramento] || "PJ";
  }
  if (f && f.regime === "ESTAGIARIO") return "Estágio";
  return L.vinculoDe(f).rotulo;
};

/** Ordem de leitura: menos combinado primeiro, PJ por último — não
 * alfabética, que espalharia "CLT" e "CLT + MEI" longe um do outro. */
L.ORDEM_GRUPOS_PAGAMENTO = [
  "CLT", "Ticket", "MEI",
  "CLT + Ticket", "CLT + MEI", "Ticket + MEI", "CLT + Ticket + MEI",
  "Estágio", "PJ — Simples Nacional", "PJ — Lucro Presumido", "PJ"
];

/** Só os grupos que de fato aparecem nesta lista de funcionários — o filtro
 * não oferece "Ticket + MEI" se ninguém está nesse grupo. */
L.gruposPagamentoPresentes = function (lista) {
  var vistos = {};
  (lista || []).forEach(function (f) { vistos[L.grupoPagamentoDe(f)] = true; });
  return L.ORDEM_GRUPOS_PAGAMENTO.filter(function (g) { return vistos[g]; })
    .concat(Object.keys(vistos).filter(function (g) { return L.ORDEM_GRUPOS_PAGAMENTO.indexOf(g) === -1 && g !== "—"; }));
};

/**
 * Grupo do FILTRO de regime: quem recebe MEI (MEI puro, CLT + MEI, CLT + Ticket + MEI...) fica num grupo só,
 * "MEI", para pagar as notas sem conflito. Os demais mantêm o grupo de sempre.
 */
L.grupoFiltroDe = function (f) {
  if (f && f.regime === "PRESTADOR_PJ") return L.grupoPagamentoDe(f);
  var v = L.vinculoDe(f);
  return v.temMei ? "MEI" : L.grupoPagamentoDe(f);
};

L.gruposFiltroPresentes = function (lista) {
  var vistos = {};
  (lista || []).forEach(function (f) { vistos[L.grupoFiltroDe(f)] = true; });
  return L.ORDEM_GRUPOS_PAGAMENTO.filter(function (g) { return vistos[g]; })
    .concat(Object.keys(vistos).filter(function (g) { return L.ORDEM_GRUPOS_PAGAMENTO.indexOf(g) === -1 && g !== "—"; }));
};

L.empresaDe = function (f) {
  var e = L.EMPRESAS[(f && f.empresaCodigo) || ""];
  return e ? e.nome : (f && f.empresa) || "—";
};

/** Só as empresas que de fato aparecem nesta lista — mesma ideia de
 * `gruposPagamentoPresentes`, na ordem cadastrada em L.EMPRESAS primeiro. */
L.empresasPresentes = function (lista) {
  var vistas = {};
  (lista || []).forEach(function (f) { var e = L.empresaDe(f); if (e !== "—") vistas[e] = true; });
  var ordem = Object.keys(L.EMPRESAS).map(function (c) { return L.EMPRESAS[c].nome; });
  return ordem.filter(function (e) { return vistas[e]; })
    .concat(Object.keys(vistas).filter(function (e) { return ordem.indexOf(e) === -1; }));
};


/** Um collator só, criado uma vez. `localeCompare` com opções recria o
 * collator a CADA comparação: ordenar as 100 pessoas custava 6,5ms, e a tela
 * de Funcionários reordena a cada tecla digitada na busca. Reaproveitando,
 * cai para 0,08ms. */
var COLLATOR_PT = new Intl.Collator("pt-BR", { sensitivity: "base" });

L.porNome = function (lista) {
  return lista.slice().sort(function (a, b) {
    return COLLATOR_PT.compare(String(a.nome || ""), String(b.nome || ""));
  });
};

/**
 * Converte uma linha da planilha no funcionário do sistema. Vive no domínio,
 * e não na tela, porque o teste precisa montar exatamente o mesmo registro —
 * foi montando "quase igual" que os extras sumiram de 19 professores sem
 * ninguém perceber.
 */
L.funcionarioDaPlanilha = function (p, competencia) {
  var extrasSemanais = (p.extras || []).reduce(function (soma, e) {
    return soma + (e.aulas || 0);
  }, 0);
  return {
    nome: p.nome,
    // A coluna de numeracao da planilha vem com valores decimais de um arrasto
    // de formula; so vira matricula quando e inteira.
    matricula: p.matricula || "",
    numeroPlanilha: p.numeroPlanilha,
    cargo: p.disciplina || "Professor",
    departamento: "Docente",
    categoria: "PROFESSOR",
    admissao: p.registro,
    titulacao: p.titulacao,
    empresaCodigo: p.empresaCodigo,
    empresa: p.empresa,
    vinculoCodigos: p.vinculoCodigos || [],
    valorClt: p.valorClt,
    valorTicket: p.valorTicket,
    valorMei: p.valorMei,
    regime: "HORISTA_AULA",
    dependentes: 0,
    cargas: p.cargas,
    // Sem carga por segmento (professor novo, ainda fora do PPP por
    // segmento): calcularFolha cai para aulasSemanais × valorHoraAula.
    aulasSemanais: p.aulasSemanais,
    valorHoraAula: p.valorHoraAula,
    extras: p.extras || [],
    aulasExtrasSemanais: extrasSemanais,
    valorHoraExtra: p.valorHoraExtra,
    totalAulasPlanilha: p.totalAulasPlanilha,
    totalPlanilha: p.totalPlanilha,
    mudancaNoMes: p.mudancaNoMes,
    status: "ATIVO",
    origem: "Planilha " + (competencia || "")
  };
};

/**
 * Mesma ideia de `funcionarioDaPlanilha`, para colaborador (não-professor):
 * mensalista, salário fixo, com os descontos combinados (cantina, saúde,
 * mensalidade, material, armário) direto do cadastro. Quem veio de uma
 * planilha sem coluna de bruto entra com `salarioBase: 0` — visível na tela
 * como pendência, nunca inventado.
 */
L.colaboradorDaPlanilha = function (c) {
  // Prestador de serviço (MEI/PJ) não é mensalista: não tem salário, jornada
  // nem vínculo CLT — o que existe é a nota do mês. Forçá-lo no molde abaixo
  // faria o motor calcular INSS, FGTS e IRRF de um contrato que não é de
  // emprego.
  if (c.regime === "PRESTADOR_PJ") {
    return {
      nome: c.nome,
      matricula: "",
      cargo: c.cargo || "Prestador de serviço",
      departamento: c.departamento || c.cargo || "Serviços",
      categoria: "COLABORADOR",
      admissao: c.admissao,
      empresaCodigo: c.empresaCodigo,
      empresa: c.empresa,
      vinculoCodigos: c.enquadramento === "MEI" ? ["3"] : [],
      regime: "PRESTADOR_PJ",
      enquadramento: c.enquadramento || "MEI",
      valorMensal: c.valorMensal || 0,
      servicoComCpp: c.servicoComCpp || "NAO",
      descontosFixos: c.descontosFixos || [],
      observacao: c.observacao || "",
      status: "ATIVO",
      origem: c.origem || "Planilha " + (c.empresa || "")
    };
  }
  return {
    nome: c.nome,
    matricula: "",
    cargo: c.cargo || "Colaborador",
    departamento: c.cargo || "Apoio",
    categoria: "COLABORADOR",
    admissao: c.admissao,
    empresaCodigo: c.empresaCodigo,
    empresa: c.empresa,
    vinculoCodigos: ["1"], // colaborador CLT mensalista, salvo indicação contrária no cadastro
    regime: "MENSALISTA",
    salarioBase: c.salarioBase || 0,
    // Sem a carga semanal na planilha de colaboradores: 44h (CLT art. 58) é
    // o padrão do quadro de apoio da escola até o cadastro dizer diferente.
    // MAS só quando o salário é compatível com jornada cheia — quem ganha
    // abaixo do mínimo quase certamente trabalha poucas horas (é assim que
    // o valor é legal), e a planilha não trouxe a carga real dessa pessoa.
    // Assumir 44h aqui inventaria jornada integral que não existe e
    // dispararia "abaixo do mínimo" como se fosse violação — não é: é
    // carga horária não informada, então fica em aberto, não inventada.
    cargaHoraria: (c.salarioBase > 0 && c.salarioBase < L.SALARIO_MINIMO) ? null : 44,
    dependentes: 0,
    descontosFixos: c.descontosFixos || [],
    observacao: c.observacao || "",
    status: "ATIVO",
    origem: "Planilha " + (c.empresa || "")
  };
};

/**
 * Nome só serve de chave se "José da Silva " e "JOSE DA SILVA" forem a mesma
 * pessoa: um espaço a mais na planilha criava um cadastro novo e desligava o
 * antigo, levando junto tudo que tinha sido ajustado à mão.
 */
L.normalizarNome = function (nome) {
  return String(nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/\s+/g, " ").trim();
};

/** Minúsculas e sem acento: "JOSÉ", "josé" e "jose" casam entre si nas buscas. */
L.semAcento = function (texto) {
  return String(texto == null ? "" : texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

/**
 * Põe o cadastro em dia com as planilhas importadas, para quem JÁ tinha feito
 * login antes de uma delas mudar. Sem isto, dado novo (colaborador que faltava,
 * salário conciliado contra a folha, empresa corrigida) só chegaria a quem
 * criasse a conta do zero.
 *
 * Casa em duas fases, e cada registro só pode ser reivindicado por UMA
 * entrada da planilha:
 *   1) nome + empresa EXATOS — resolve o caso comum (nada mudou) e quem
 *      genuinamente trabalha em duas empresas ao mesmo tempo (aí existem dois
 *      registros de antes, um por empresa, e cada um casa com o seu).
 *   2) sobrou sem casar na própria empresa? Se existir exatamente UM
 *      homônimo livre (de outra empresa), é a mesma pessoa mudando de
 *      empresa — atualiza no lugar. Se existir MAIS de um, não tem como
 *      adivinhar qual dos dois é: fica registrado como ambíguo e a entrada
 *      da planilha ganha um cadastro novo, para ninguém ficar de fora da
 *      folha por causa da dúvida.
 * A fase (1) antes da (2) é o que evita o problema do meio: transferência de
 * empresa coincidindo, no mesmo mês, com a contratação de um homônimo na
 * empresa que a pessoa deixou — sem as fases separadas, as duas entradas
 * ficam indistinguíveis e a comparação de salário compara gente diferente.
 *
 * Só participa da fase de casamento quem já veio de planilha (`origem`
 * começando com "Planilha"): cadastro feito à mão na tela é invisível para
 * esta função — nunca é reivindicado, nunca é desligado por "não estar na
 * planilha". Sem este filtro, uma pessoa da tela com o mesmo nome de alguém
 * novo na planilha teria a empresa dela trocada silenciosamente.
 *
 * Desligado não é reaproveitado: quem foi desligado pela tela não volta à
 * folha só porque continua na planilha do mês passado.
 *
 * É idempotente de propósito: roda a cada login, e rodar de novo não pode
 * criar, alterar nem desligar mais nada.
 */
L.sincronizarCadastro = function () {
  var resumo = { criados: [], atualizados: [], desligados: [], ignorados: [], ambiguos: [], divergencias: [] };
  if (!L.DADOS_REAIS) return resumo;

  var fontes = [
    { categoria: "PROFESSOR", lista: L.DADOS_REAIS.professores || [],
      montar: function (p) { return L.funcionarioDaPlanilha(p, L.DADOS_REAIS.competencia); } },
    { categoria: "COLABORADOR", lista: (L.DADOS_COLABORADORES && L.DADOS_COLABORADORES.colaboradores) || [],
      montar: function (c) { return L.colaboradorDaPlanilha(c); } }
  ];
  function vemDePlanilha(f) { return String(f.origem || "").indexOf("Planilha") === 0; }

  function aplicar(existente, origem, duvidoso) {
    var mudancas = {};
    if (existente.empresaCodigo !== origem.empresaCodigo) {
      mudancas.empresaCodigo = origem.empresaCodigo;
      mudancas.empresa = origem.empresa;
    }
    // "Duvidoso" é o caso em que o mesmo nome apareceu mais de uma vez nesta
    // rodada e não dá pra saber com certeza qual entrada é quem: aí ainda
    // preenche o que está genuinamente vazio (ninguém fica sem salário à
    // toa), mas NUNCA compara valor já preenchido como se fosse a mesma
    // pessoa discordando — seria comparar o salário de duas pessoas
    // diferentes e chamar isso de divergência.
    var campoBase = null;
    ["salarioBase", "valorMensal"].forEach(function (campo) {
      if (!origem[campo]) return;
      campoBase = campo;
      if (!existente[campo]) {
        mudancas[campo] = origem[campo];
        mudancas.descontosFixos = origem.descontosFixos || [];
      } else if (!duvidoso && existente[campo] !== origem[campo]) {
        resumo.divergencias.push({ funcionario: existente, campo: campo,
          cadastro: existente[campo], planilha: origem[campo] });
      }
    });
    // Desconto mudou (plano de saúde reajustou, cantina mudou de valor) sem a
    // base mudar — mesma regra de nunca sobrescrever sozinho: só preenche
    // quando é a primeira vez; discordando, também vira divergência.
    if (!duvidoso && campoBase && existente[campoBase] && !mudancas.descontosFixos) {
      var atual = JSON.stringify(existente.descontosFixos || []);
      var novo = JSON.stringify(origem.descontosFixos || []);
      if (atual !== novo && novo !== "[]") {
        resumo.divergencias.push({ funcionario: existente, campo: "descontosFixos",
          cadastro: existente.descontosFixos || [], planilha: origem.descontosFixos });
      }
    }
    // Autocorreção: uma versão anterior sempre gravava 44h (jornada integral)
    // pro colaborador mensalista, mesmo quando o salário só é legal em
    // jornada parcial — isso inventava jornada integral e virava "abaixo do
    // mínimo" como falso alarme. Só mexe em quem veio de colaboradorDaPlanilha
    // (categoria+regime exatos): um professor mensalista de verdade, cadastrado
    // à mão com 44h confirmadas, não é tocado por engano.
    if (existente.categoria === "COLABORADOR" && existente.regime === "MENSALISTA" &&
        existente.salarioBase > 0 && existente.salarioBase < L.SALARIO_MINIMO && existente.cargaHoraria) {
      mudancas.cargaHoraria = null;
    }
    if (Object.keys(mudancas).length) {
      resumo.atualizados.push(L.atualizar("funcionarios", existente.id, mudancas));
    }
  }

  var reivindicados = {};
  fontes.forEach(function (fonte) {
    // Só registros vindos de planilha entram no grupo de candidatos — cadastro
    // manual é invisível aqui, tanto para casar quanto para desligar.
    var porNome = {};
    L.estado.funcionarios.forEach(function (f) {
      if (L.categoriaDe(f) !== fonte.categoria || !vemDePlanilha(f)) return;
      (porNome[L.normalizarNome(f.nome)] = porNome[L.normalizarNome(f.nome)] || []).push(f);
    });
    function livres(nome, incluirDesligado) {
      return (porNome[L.normalizarNome(nome)] || []).filter(function (f) {
        return !reivindicados[f.id] && (incluirDesligado || f.status !== "DESLIGADO");
      });
    }
    // Nome repetido nesta rodada, em quantidade diferente de quantos já
    // existiam: sinal de que uma transferência de empresa coincidiu com a
    // chegada de um homônimo (ou vice-versa) — a identidade de quem casar
    // por empresa exata deixa de ser garantida.
    var contagemLote = {};
    fonte.lista.forEach(function (x) {
      var k = L.normalizarNome(x.nome);
      contagemLote[k] = (contagemLote[k] || 0) + 1;
    });
    function duvidoso(nome) {
      var k = L.normalizarNome(nome);
      return contagemLote[k] > 1 && contagemLote[k] !== (porNome[k] || []).length;
    }

    var pendentes = [];
    fonte.lista.forEach(function (origem) {
      var exato = livres(origem.nome).find(function (f) { return f.empresaCodigo === origem.empresaCodigo; });
      if (exato) {
        reivindicados[exato.id] = true;
        var duvida = duvidoso(origem.nome);
        if (duvida) resumo.ambiguos.push({ nome: origem.nome, categoria: fonte.categoria, candidatos: contagemLote[L.normalizarNome(origem.nome)] });
        aplicar(exato, origem, duvida);
      }
      else pendentes.push(origem);
    });

    pendentes.forEach(function (origem) {
      var candidatos = livres(origem.nome);
      if (candidatos.length === 1) {
        reivindicados[candidatos[0].id] = true;
        aplicar(candidatos[0], origem);
        return;
      }
      if (candidatos.length > 1) {
        resumo.ambiguos.push({ nome: origem.nome, categoria: fonte.categoria, candidatos: candidatos.length });
      }
      // Ninguém ativo disponível com este nome — mas se o único homônimo
      // estiver DESLIGADO, é ele que a planilha está trazendo de volta, e
      // desligamento é decisão de gente: não volta à folha sozinho.
      var desligado = livres(origem.nome, true).find(function (f) { return f.status === "DESLIGADO"; });
      if (desligado) { resumo.ignorados.push(desligado); return; }
      var novo = L.criar("funcionarios", fonte.montar(origem));
      reivindicados[novo.id] = true;
      resumo.criados.push(novo);
    });
  });

  // Quem veio de planilha e ficou sem reivindicar nesta rodada não pode
  // seguir pesando na folha — seja porque saiu de verdade, foi reclassificado
  // (o prestador que constava como professor), ou é duplicata que uma versão
  // anterior desta sincronização criou por engano. Os três casos são
  // indistinguíveis daqui, e o tratamento é o mesmo: fica DESLIGADO, não
  // apagado, para não sumir com o histórico sem deixar rastro.
  L.estado.funcionarios.forEach(function (f) {
    if (f.status === "DESLIGADO" || !vemDePlanilha(f) || reivindicados[f.id]) return;
    resumo.desligados.push(L.atualizar("funcionarios", f.id, { status: "DESLIGADO",
      observacao: "Não apareceu na planilha desta sincronização — reclassificado, desligado de fato, ou duplicata de uma versão anterior do carregamento. Mantido apenas para histórico." }));
  });

  L.divergenciasDaPlanilha = resumo.divergencias;
  L.ambiguidadesDaPlanilha = resumo.ambiguos;
  return resumo;
};

/**
 * Cadastro incompleto que a planilha trouxe assim. Não é erro de cálculo: é
 * campo em branco na origem, e cada um deles impede uma decisão. Sem empresa
 * não se sabe qual CNPJ paga; sem código de vínculo não se sabe se tem Ticket
 * ou MEI; MEI sem nota é pagamento sem documento que o sustente.
 */
L.pendenciasCadastro = function () {
  var semEmpresa = [], semVinculo = [];
  L.ativos().forEach(function (f) {
    if (!f.empresaCodigo) semEmpresa.push(f);
    // `vinculoCodigos` só existe no protótipo local; a API manda a bandeira já
    // reduzida (`temClt`/`temTicket`/`temMei`) — checar os dois por `L.vinculoDe`
    // em vez do array cru evita marcar as 99 pessoas reais como pendência falsa.
    var v = L.vinculoDe(f);
    if (!v.temClt && !v.temTicket && !v.temMei) semVinculo.push(f);
  });
  // MEI sem nota não entra aqui: todo mundo na escola já sabe que MEI
  // trabalha com nota, e avisar o óbvio em toda tela vira ruído que faz
  // ignorar o aviso que importa.
  return {
    semEmpresa: semEmpresa,
    semVinculo: semVinculo,
    total: semEmpresa.length + semVinculo.length
  };
};

// ---------------------------------------------------------------- observações
//
// A legenda que a escola mantém na planilha: "Gerciandra assumiu as aulas da
// Verônica em 10/08". É o único registro de POR QUE a carga de alguém mudou no
// meio do mês — sem isso, o número muda e ninguém lembra o motivo.
//
// Ficam por competência: a observação de agosto não polui setembro.

L.observacoesDe = function (competencia) {
  var comp = competencia || L.competenciaAberta();
  return L.estado.observacoes.filter(function (o) { return o.competencia === comp; });
};

L.adicionarObservacao = function (texto, competencia) {
  var limpo = String(texto || "").trim();
  if (!limpo) return null;
  return L.criar("observacoes", {
    competencia: competencia || L.competenciaAberta(),
    texto: limpo,
    autor: L.estado.usuario ? L.estado.usuario.nome : "sistema"
  });
};

L.editarObservacao = function (id, texto) {
  var limpo = String(texto || "").trim();
  if (!limpo) return null;
  return L.atualizar("observacoes", id, { texto: limpo });
};

/**
 * A competência mais recente que tem observação, tirando a que já está aberta.
 * Serve para o mês vazio apontar onde a anotação está, em vez de fingir que
 * ela nunca existiu.
 */
L.competenciaComObservacao = function (excluindo) {
  var comps = L.estado.observacoes
    .map(function (o) { return o.competencia; })
    .filter(function (c) { return c !== excluindo; });
  return comps.sort().reverse()[0] || null;
};

L.excluirObservacao = function (id) {
  var i = L.estado.observacoes.findIndex(function (o) { return o.id === id; });
  if (i === -1) return false;
  var o = L.estado.observacoes[i];
  L.estado.observacoes.splice(i, 1);
  L.versao++;
  L.registrar("observacoes", { nome: o.texto.slice(0, 40) }, "EXCLUIR");
  L.persistir();
  return true;
};


/** Traz as observações da planilha para o estado, uma única vez. */
L.semearObservacoes = function () {
  if (!L.DADOS_REAIS || !L.DADOS_REAIS.observacoes) return;
  var comp = L.DADOS_REAIS.competencia;
  if (L.observacoesDe(comp).length) return;
  L.DADOS_REAIS.observacoes.forEach(function (o) {
    L.criar("observacoes", {
      competencia: comp,
      texto: o.texto,
      autor: "Planilha " + comp,
      daPlanilha: true
    });
  });
};

// ---------------------------------------------------------------- módulos
//
// Os cinco módulos da escola, na ordem em que ela os enumera. Um professor
// costuma dar aula em mais de um, com hora-aula diferente em cada.

// ---------------------------------------------------------------- categorias
//
// Professor e colaborador são duas folhas com regras diferentes: um é pago por
// hora-aula e tem carga por módulo; o outro tem salário e jornada. Somar os
// dois numa lista só obriga a escola a ler uma tabela cuja metade das colunas
// nunca se aplica à linha que ela está olhando.

L.CATEGORIAS = {
  PROFESSOR: { nome: "Professor", plural: "Professores", regimePadrao: "HORISTA_AULA" },
  COLABORADOR: { nome: "Colaborador", plural: "Colaboradores", regimePadrao: "MENSALISTA" }
};

/**
 * A categoria é explícita no cadastro. Quando falta — registro antigo, ou
 * importação que não a trouxe — deduz pelo regime, que é o que de fato muda
 * o cálculo: quem é pago por hora-aula é professor.
 */
L.categoriaDe = function (f) {
  if (f && f.categoria && L.CATEGORIAS[f.categoria]) return f.categoria;
  return f && f.regime === "HORISTA_AULA" ? "PROFESSOR" : "COLABORADOR";
};

L.ehProfessor = function (f) { return L.categoriaDe(f) === "PROFESSOR"; };

/** Ativos de uma categoria, em ordem alfabética. */
L.daCategoria = function (categoria) {
  return L.ativos().filter(function (f) { return L.categoriaDe(f) === categoria; });
};

L.professores = function () { return L.daCategoria("PROFESSOR"); };
L.colaboradores = function () { return L.daCategoria("COLABORADOR"); };

/**
 * Totais separados por categoria. O custo de professor e o de colaborador
 * respondem a perguntas diferentes — um escala com a grade de aulas, o outro
 * com o quadro fixo — e somá-los esconde qual dos dois cresceu.
 */
L.totaisPorCategoria = function (competencia) {
  return Object.keys(L.CATEGORIAS).map(function (cat) {
    var gente = L.daCategoria(cat);
    var soma = gente.reduce(function (a, f) {
      var r = L.calcular(f, competencia);
      return {
        proventos: a.proventos + r.proventos,
        liquido: a.liquido + r.liquido,
        custo: a.custo + r.custoEmpregador
      };
    }, { proventos: 0, liquido: 0, custo: 0 });
    return {
      categoria: cat,
      nome: L.CATEGORIAS[cat].plural,
      pessoas: gente.length,
      proventos: soma.proventos,
      liquido: soma.liquido,
      custo: soma.custo
    };
  }).filter(function (t) { return t.pessoas > 0; });
};

L.MODULOS_ENSINO = ["Recepção", "Governança", "Alimentos e Bebidas", "Manutenção", "Administrativo"];

/** Em que módulos esta pessoa dá aula, e quantas aulas em cada. */
L.modulosDe = function (f) {
  return (f.cargas || [])
    .filter(function (c) { return (c.aulas || 0) > 0; })
    .map(function (c) { return { modulo: c.segmento, aulas: c.aulas, valorHora: c.valorHora }; })
    .sort(function (a, b) {
      return L.MODULOS_ENSINO.indexOf(a.modulo) - L.MODULOS_ENSINO.indexOf(b.modulo);
    });
};


/**
 * Agrupa as divergências da folha por CAUSA. Quarenta e três pessoas com o
 * mesmo aviso não são quarenta e três problemas: são um problema que atinge
 * quarenta e três pessoas — e a diferença entre as duas leituras é a
 * diferença entre "abra 43 fichas" e "clique em Tabelas Legais".
 */
L.divergenciasPorCausa = function (competencia) {
  var mapa = {};
  L.ativos().forEach(function (f) {
    L.calcular(f, competencia).avisos
      .filter(function (a) { return a.nivel === "divergencia"; })
      .forEach(function (a) {
        if (!mapa[a.texto]) mapa[a.texto] = { texto: a.texto, acao: a.acao || null, pessoas: [] };
        mapa[a.texto].pessoas.push(f);
      });
  });
  return Object.keys(mapa)
    .map(function (k) { return mapa[k]; })
    .sort(function (a, b) { return b.pessoas.length - a.pessoas.length; });
};

/**
 * Confere a carga lançada contra o PPP — o quadro de aulas previstas por
 * segmento. Aula a mais no sistema é aula sendo paga sem estar prevista; aula
 * a menos é professor sem alocação. Nos dois casos alguém precisa olhar antes
 * de a folha fechar.
 */
L.conferenciaAulas = function () {
  var previsto = (L.DADOS_REAIS && L.DADOS_REAIS.ppp) || null;
  var real = {};
  // Só professor entra: colaborador não tem carga por módulo, e incluí-lo
  // faria a conferência comparar contra um previsto que não é dele.
  L.professores().forEach(function (f) {
    (f.cargas || []).forEach(function (c) {
      real[c.segmento] = (real[c.segmento] || 0) + (c.aulas || 0);
    });
  });

  var linhas = [];
  var segmentos = previsto
    ? previsto.map(function (p) { return p.segmento; })
    : Object.keys(real);

  segmentos.forEach(function (seg) {
    var prev = previsto ? (previsto.find(function (p) { return p.segmento === seg; }) || {}).aulas || 0 : null;
    var atual = real[seg] || 0;
    linhas.push({
      segmento: seg,
      previsto: prev,
      real: atual,
      diferenca: prev === null ? null : atual - prev
    });
  });

  var totalPrevisto = previsto ? previsto.reduce(function (s, p) { return s + p.aulas; }, 0) : null;
  var totalReal = Object.keys(real).reduce(function (s, k) { return s + real[k]; }, 0);

  return {
    linhas: linhas,
    totalPrevisto: totalPrevisto,
    totalReal: totalReal,
    diferenca: totalPrevisto === null ? null : totalReal - totalPrevisto,
    bate: totalPrevisto !== null && totalReal === totalPrevisto
  };
};

L.ativos = function () {
  return L.porNome(L.estado.funcionarios.filter(function (f) { return f.status !== "DESLIGADO"; }));
};

L.folhaEstimada = function () {
  return L.ativos().reduce(function (a, f) {
    return a + L.calcular(f).custoEmpregador;
  }, 0);
};

L.contasDoMes = function (competencia) {
  var c = competencia || L.competenciaAtual();
  return L.estado.contas.filter(function (x) { return x.competencia === c; });
};

L.statusConta = function (conta) {
  if (conta.status === "PAGO" || conta.status === "CANCELADO") return conta.status;
  var dias = L.diasAte(conta.vencimento);
  return dias !== null && dias < 0 ? "VENCIDO" : conta.status;
};

/** Motor de alertas: o que precisa da decisão do gestor, com destino. */
/**
 * Tabela legal (INSS, IRRF, salário mínimo, CCT de cada categoria) perto do
 * fim sem a seguinte cadastrada, ou cadastrada sem conferência: é o que trava
 * o fechamento da primeira folha depois da virada. Avisa com 60 dias.
 */
L.alertasTabelas = function () {
  var hoje = L.competenciaAtual();
  var fimData = function (t) { return t.fim.length === 7 ? t.fim + "-" + L.diasNoMes(t.fim) : t.fim; };
  var grupos = [
    ["INSS", (L.estado.tabelas || []).filter(function (t) { return t.tipo === "INSS"; })],
    ["IRRF", (L.estado.tabelas || []).filter(function (t) { return t.tipo === "IRRF"; })],
    ["Salário mínimo", L.estado.salarioMinimo || []]
  ];
  var porCategoria = {};
  (L.estado.ccts || []).forEach(function (c) { (porCategoria[c.categoria] = porCategoria[c.categoria] || []).push(c); });
  Object.keys(porCategoria).forEach(function (cat) { grupos.push(["CCT " + cat.toLowerCase(), porCategoria[cat]]); });

  var saida = [];
  grupos.forEach(function (g) {
    var nome = g[0], lista = g[1];
    if (!lista.length) return;
    var vigente = lista.filter(function (t) { return L.tabelaCobre(t, hoje); })
      .sort(function (a, b) { return b.inicio.localeCompare(a.inicio); })[0];
    if (!vigente) {
      saida.push({ nivel: "critico", destino: "tabelas", alvo: null,
        titulo: nome + ": nenhuma tabela vigente em " + L.competenciaBR(hoje),
        detalhe: "Sem ela a folha não fecha. Cadastre em Tabelas Legais." });
      return;
    }
    if (!vigente.fim) return;
    var dias = L.diasAte(fimData(vigente));
    if (dias === null || dias > 60) return;
    var mesSeguinte = L.somarMeses(vigente.fim.slice(0, 7), 1);
    var seguinte = lista.filter(function (t) { return L.tabelaCobre(t, mesSeguinte); })[0];
    if (!seguinte) {
      saida.push({ nivel: dias <= 15 ? "critico" : "atencao", destino: "tabelas", alvo: null,
        titulo: nome + " vigente termina em " + Math.max(0, dias) + " dia(s)",
        detalhe: "Cadastre a tabela nova antes da folha de " + L.competenciaBR(mesSeguinte) + "." });
    } else if (!seguinte.conferida) {
      saida.push({ nivel: "atencao", destino: "tabelas", alvo: null,
        titulo: nome + " de " + L.competenciaBR(mesSeguinte) + " aguarda conferência",
        detalhe: "Já cadastrada; falta confirmar contra o ato oficial." });
    }
  });
  return saida;
};

function somarDias(iso, dias) {
  var d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function somarAnos(iso, anos) { return (Number(iso.slice(0, 4)) + anos) + iso.slice(4); }
function nomesResumidos(itens) {
  return itens.slice(0, 4).join(" · ") + (itens.length > 4 ? " · e mais " + (itens.length - 4) : "");
}

/**
 * Avisos de RH tirados do próprio cadastro: fim da experiência (45 e 90
 * dias), férias chegando ao limite de concessão e cadastro com dado que
 * derruba o cálculo. Um aviso por assunto, com os nomes, não um por pessoa.
 */
L.alertasPessoas = function () {
  var lista = [];
  if (!L.alertaVisivel("pessoas")) return lista;
  var hoje = L.hoje();
  var clt = L.ativos().filter(function (f) {
    return f.regime !== "PRESTADOR_PJ" && f.regime !== "ESTAGIARIO" &&
      f.tipoContrato !== "APRENDIZ" && f.tipoContrato !== "TEMPORARIO";
  });
  var admissaoValida = function (f) { return f.admissao && f.admissao >= "1950-01-01" && f.admissao <= hoje; };

  // Experiência: 45º e 90º dia contados da admissão.
  clt.forEach(function (f) {
    if (!admissaoValida(f)) return;
    [[45, "1º período (45 dias)", "prorrogar até 90 dias ou encerrar"],
     [90, "90 dias", "efetivar ou encerrar; depois disso o contrato passa a ser por prazo indeterminado"]
    ].forEach(function (m) {
      var data = somarDias(f.admissao, m[0] - 1);
      var dias = L.diasAte(data);
      if (dias === null || dias < 0 || dias > 10) return;
      lista.push({ nivel: dias <= 3 ? "critico" : "atencao", destino: "funcionarios", alvo: f.id,
        titulo: "Experiência de " + f.nome + ": " + m[1] + " em " + (dias === 0 ? "hoje" : dias + " dia(s)"),
        detalhe: L.dataBR(data) + " · se o contrato é de experiência, decida: " + m[2] });
    });
  });

  // Férias: limite de concessão do último período aquisitivo completo.
  var ferias = (L.estado.ausencias || []).filter(function (a) {
    return a.tipo === "FERIAS" && a.status !== "REJEITADA" && a.status !== "CANCELADA";
  });
  var aConceder = [];
  clt.forEach(function (f) {
    if (!admissaoValida(f)) return;
    var anos = Number(hoje.slice(0, 4)) - Number(f.admissao.slice(0, 4));
    if (somarAnos(f.admissao, anos) > hoje) anos--;
    if (anos < 1) return;
    var fimAquisitivo = somarDias(somarAnos(f.admissao, anos), -1);
    var limite = somarDias(somarAnos(f.admissao, anos + 1), -1);
    var dias = L.diasAte(limite);
    if (dias === null || dias < 0 || dias > 60) return;
    var marcada = ferias.some(function (a) { return a.funcionarioId === f.id && a.inicio > fimAquisitivo; });
    if (!marcada) aConceder.push({ f: f, limite: limite, dias: dias });
  });
  if (aConceder.length) {
    aConceder.sort(function (a, b) { return a.dias - b.dias; });
    lista.push({ nivel: aConceder[0].dias <= 15 ? "critico" : "atencao", destino: "ferias", alvo: null,
      titulo: aConceder.length + " pessoa(s) com férias a conceder até " + L.dataBR(aConceder[aConceder.length - 1].limite),
      detalhe: nomesResumidos(aConceder.map(function (x) { return x.f.nome + " até " + L.dataBR(x.limite); })) +
        ". Passou do limite, paga em dobro. Se já foram marcadas, registre em Férias e Ausências." });
  }

  // Cadastro com dado que derruba o cálculo.
  var incompletos = [];
  L.ativos().forEach(function (f) {
    if (f.regime === "PRESTADOR_PJ") return;
    var faltas = [];
    if (!f.admissao) faltas.push("sem data de admissão");
    else if (!admissaoValida(f)) faltas.push("admissão em " + L.dataBR(f.admissao));
    if (f.regime === "MENSALISTA" && !f.cargaHoraria) faltas.push("sem carga horária");
    if (f.regime === "HORISTA_AULA" && (f.cargas || []).some(function (c) { return c.aulas > 0 && !c.valorHora; })) faltas.push("hora-aula R$ 0,00");
    if (L.empresaDe(f) === "—") faltas.push("sem empresa");
    if (faltas.length) incompletos.push(f.nome + ": " + faltas.join(", "));
  });
  if (incompletos.length) {
    lista.push({ nivel: "atencao", destino: "funcionarios", alvo: null,
      titulo: incompletos.length + " cadastro(s) incompleto(s)",
      detalhe: nomesResumidos(incompletos) });
  }
  return lista;
};

L.alertas = function () {
  var lista = [];

  L.estado.contas.forEach(function (c) {
    var st = L.statusConta(c);
    var dias = L.diasAte(c.vencimento);
    if (st === "VENCIDO") {
      lista.push({ nivel: "critico", destino: "contas", alvo: c.id,
        titulo: c.descricao + " venceu há " + Math.abs(dias) + " dia(s)",
        detalhe: L.brl(c.valor) + " · vencimento " + L.dataBR(c.vencimento) });
    } else if (st === "AGUARDANDO_APROVACAO") {
      lista.push({ nivel: "atencao", destino: "contas", alvo: c.id,
        titulo: "Pagamento de " + L.brl(c.valor) + " aguarda aprovação",
        detalhe: c.descricao + " · vence em " + dias + " dia(s)" });
    } else if (dias !== null && dias >= 0 && dias <= 7) {
      lista.push({ nivel: "atencao", destino: "contas", alvo: c.id,
        titulo: c.descricao + " vence em " + dias + " dia(s)",
        detalhe: L.brl(c.valor) + " · " + L.dataBR(c.vencimento) });
    }
  });

  // Um alerta só, não um por pessoa: colaborador importado de planilha sem
  // coluna "Bruto" (ServJU e ServMA, hoje) entra com salário zerado de
  // propósito — 43 alertas iguais viram ruído, um resumo com destino certo
  // é o que dá pra agir de verdade.
  var semSalario = L.ativos().filter(function (f) {
    return f.regime === "MENSALISTA" && !f.salarioBase;
  });
  if (semSalario.length) {
    lista.push({ nivel: "atencao", destino: "funcionarios", alvo: null,
      titulo: semSalario.length + " colaborador(es) sem salário cadastrado",
      detalhe: "Vieram da planilha sem a coluna de bruto — lance o valor assim que a planilha certa chegar." });
  }

  // Valor que está no cadastro discordando do que a planilha nova trouxe. A
  // sincronização NÃO sobrescreve sozinha (o valor de cá pode ter sido
  // lançado à mão de propósito), então a escolha tem que aparecer para
  // alguém fazer — calada, a diferença viraria folha errada em silêncio.
  (L.divergenciasDaPlanilha || []).forEach(function (d) {
    var descreverDescontos = function (arr) {
      return (arr && arr.length) ? arr.map(function (x) { return x.nome + " " + L.brl(x.valor); }).join(", ") : "nenhum";
    };
    var cadastro = d.campo === "descontosFixos" ? descreverDescontos(d.cadastro) : L.brl(d.cadastro);
    var planilha = d.campo === "descontosFixos" ? descreverDescontos(d.planilha) : L.brl(d.planilha);
    lista.push({ nivel: "atencao", destino: "funcionarios", alvo: d.funcionario.id,
      titulo: d.funcionario.nome + ": cadastro e planilha discordam",
      detalhe: "O cadastro traz " + cadastro + " e a planilha importada traz " + planilha +
        ". O sistema não trocou sozinho porque o valor de cá pode ter sido lançado à mão — confira qual é o certo." });
  });

  // Nome repetido na planilha em quantidade diferente de quem já existia:
  // pode ser transferência de empresa coincidindo com a chegada de um
  // homônimo, ou o contrário. O sistema não arrisca juntar duas pessoas —
  // fica marcado aqui para alguém que conhece os dois nomes decidir.
  (L.ambiguidadesDaPlanilha || []).forEach(function (a) {
    lista.push({ nivel: "atencao", destino: "funcionarios", alvo: null,
      titulo: "\"" + a.nome + "\" aparece " + a.candidatos + " vezes na planilha, sem bater com o cadastro",
      detalhe: "Pode ser mudança de empresa coincidindo com a chegada de um homônimo, ou duas pessoas diferentes com o mesmo nome. " +
        "Nenhum valor foi trocado sozinho — confira em Funcionários e ajuste o que for preciso." });
  });

  L.estado.contratos.forEach(function (c) {
    if (c.status !== "ATIVO" || !c.fim) return;
    var dias = L.diasAte(c.fim);
    if (dias === null || dias > 90 || dias < 0) return;
    lista.push({ nivel: dias <= 30 ? "critico" : "atencao", destino: "contratos", alvo: c.id,
      titulo: "Contrato " + c.objeto + " vence em " + dias + " dias",
      detalhe: L.brl(c.valor) + " " + (c.periodicidade || "").toLowerCase() + " · encerra " + L.dataBR(c.fim) });
  });

  // Estágio, aprendiz e temporário têm prazo legal de encerramento — ao
  // contrário do CLT comum, aqui vencer o prazo sem providência é o cadastro
  // ficando fora da lei, não só uma renovação de contrato perdida.
  L.ativos().forEach(function (f) {
    if (!f.dataFimPrevista) return;
    if (f.regime !== "ESTAGIARIO" && f.tipoContrato !== "APRENDIZ" && f.tipoContrato !== "TEMPORARIO") return;
    var diasPrazo = L.diasAte(f.dataFimPrevista);
    if (diasPrazo === null || diasPrazo > 60 || diasPrazo < 0) return;
    var rotuloPrazo = f.regime === "ESTAGIARIO" ? "Estágio" : f.tipoContrato === "APRENDIZ" ? "Contrato de aprendiz" : "Contrato temporário";
    lista.push({ nivel: diasPrazo <= 15 ? "critico" : "atencao", destino: "funcionarios", alvo: f.id,
      titulo: rotuloPrazo + " de " + f.nome + " termina em " + diasPrazo + " dia(s)",
      detalhe: "Previsto para " + L.dataBR(f.dataFimPrevista) +
        (f.regime === "ESTAGIARIO" || f.tipoContrato === "APRENDIZ" ? " · limite legal de 2 anos"
          : " · decida entre efetivar, encerrar ou prorrogar") });
  });

  L.ativos().forEach(function (f) {
    var minutos = L.saldoBanco(f.id);
    if (minutos <= -600) {
      lista.push({ nivel: "critico", destino: "banco", alvo: f.id,
        titulo: f.nome + " está com " + L.horas(minutos) + " de banco de horas",
        detalhe: (f.departamento || "sem setor") + " · limite de −10h ultrapassado" });
    } else if (minutos >= 1200) {
      lista.push({ nivel: "atencao", destino: "banco", alvo: f.id,
        titulo: f.nome + " acumula " + L.horas(minutos) + " de crédito",
        detalhe: "Acima de 20h — programar compensação ou pagamento" });
    }
  });

  // Alerta só do que é meu: a solicitação que está com outra pessoa não é
  // pendência minha, é acompanhamento.
  var meuPerfil = L.estado.usuario ? L.estado.usuario.perfil : null;
  L.estado.solicitacoes.forEach(function (s) {
    if (!L.estaAberta(s)) return;
    var minha = meuPerfil === "DIRECAO" || L.responsavelPor(s) === meuPerfil;
    if (!minha) return;
    lista.push({ nivel: s.urgencia === "CRITICA" ? "critico" : "atencao",
      destino: "aprovacoes", alvo: s.id,
      titulo: "Solicitação #" + s.numero + " aguarda a sua decisão",
      detalhe: s.titulo + (s.valor ? " · " + L.brl(s.valor) : "") });
  });

  L.estado.documentos.forEach(function (d) {
    if (!d.vencimento) return;
    var dias = L.diasAte(d.vencimento);
    if (dias === null || dias > 30) return;
    lista.push({ nivel: dias < 0 ? "critico" : "atencao", destino: "documentos", alvo: d.id,
      titulo: dias < 0 ? d.titulo + " está vencido" : d.titulo + " vence em " + dias + " dias",
      detalhe: "Validade " + L.dataBR(d.vencimento) });
  });

  // Conferência contra a planilha de origem: é o que pega fórmula não
  // arrastada, célula em branco e aula lançada sem valor-hora.
  L.ativos().forEach(function (f) {
    if (!f.totalPlanilha) return;
    var r = L.calcular(f);
    var dif = r.proventos - f.totalPlanilha;
    if (Math.abs(dif) <= 100) return; // até um real é arredondamento
    lista.push({
      nivel: dif > 0 ? "critico" : "atencao",
      destino: "folha", alvo: f.id,
      titulo: dif > 0
        ? f.nome + " está recebendo " + L.brl(dif) + " a menos que o devido"
        : f.nome + " está recebendo " + L.brl(-dif) + " a mais que o calculado",
      detalhe: "Planilha " + L.brl(f.totalPlanilha) + " · sistema " + L.brl(r.proventos) +
        " · conferir o lançamento na " + (f.origem || "planilha de origem")
    });
  });

  L.alertasTabelas().forEach(function (a) { lista.push(a); });
  L.alertasPessoas().forEach(function (a) { lista.push(a); });

  // Conta causas, não pessoas: uma tabela faltando não são 24 problemas.
  var causas = L.divergenciasPorCausa();
  if (causas.length > 0) {
    lista.push({ nivel: "critico", destino: "folha", alvo: null,
      titulo: causas.length === 1
        ? "1 pendência bloqueia o fechamento da folha"
        : causas.length + " pendências bloqueiam o fechamento da folha",
      detalhe: causas[0].texto.split(". ")[0] + (causas.length > 1 ? " · e mais " + (causas.length - 1) : "") });
  }

  var pendTabelas = L.pendenciaTabelas(L.estado.competencia);
  if (pendTabelas.length > 0) {
    var ausente = pendTabelas.some(function (p) { return p.motivo === "ausente"; });
    lista.push({ nivel: "critico", destino: "tabelas", alvo: null,
      titulo: ausente
        ? "Não há tabela de " + pendTabelas.filter(function (p) { return p.motivo === "ausente"; })
            .map(function (p) { return p.tipo; }).join(" nem de ") + " para esta competência"
        : "Tabelas legais aguardando conferência do RH",
      detalhe: ausente
        ? "O imposto está saindo zerado até a tabela do exercício ser cadastrada"
        : pendTabelas.map(function (p) { return p.tipo; }).join(" e ") +
          " · sem conferência a competência não fecha" });
  }

  // Lotação do ANO CORRENTE que não bate com o contrato: a folha vai pagar
  // pelo contrato, então o RH precisa ajustar. (A do ano seguinte é
  // planejamento e não alarma — a lista fica na própria tela de Lotação.)
  if (L._lotacaoAtual && L._lotacaoAtual.ano === new Date().getFullYear()) {
    var ajustes = L.ajustesContratoLotacao(L._lotacaoAtual, L.estado.funcionarios);
    if (ajustes.length) {
      lista.push({ nivel: "atencao", destino: "lotacao", alvo: null,
        titulo: ajustes.length + " colaborador(es) com aulas da lotação diferentes do contrato",
        detalhe: ajustes.slice(0, 3).map(function (x) { return x.nome; }).join(", ") + (ajustes.length > 3 ? "…" : "") +
          " · a folha paga pelo contrato" });
    }
  }

  var ordem = { critico: 0, atencao: 1, info: 2 };
  return lista
    // Categoria silenciada pelo gestor não aparece — mas continua sendo
    // calculada, então voltar a ligar não perde nada.
    .filter(function (a) { return L.alertaVisivel(a.destino); })
    .sort(function (a, b) { return ordem[a.nivel] - ordem[b.nivel]; });
};

/** Quantos alertas existem, incluindo os silenciados. */
L.alertasSilenciados = function () {
  return L.TIPOS_ALERTA.filter(function (t) { return !L.alertaVisivel(t.id); }).length;
};

L.buscaGlobal = function (termo) {
  var t = U.paraBusca(termo);
  if (t.length < 2) return [];
  var achados = [];
  function varrer(colecao, onde, destino, rotuloDe, extraDe) {
    L.estado[colecao].forEach(function (r) {
      var rotulo = rotuloDe(r);
      var extra = extraDe ? extraDe(r) : "";
      if (U.paraBusca(rotulo + " " + extra).indexOf(t) === -1) return;
      achados.push({ onde: onde, destino: destino, alvo: r.id, rotulo: rotulo, extra: extra });
    });
  }
  varrer("funcionarios", "Funcionário", "funcionarios",
    function (r) { return r.nome; }, function (r) { return (r.cargo || "") + " " + (r.matricula || ""); });
  varrer("fornecedores", "Fornecedor", "fornecedores",
    function (r) { return r.razaoSocial; }, function (r) { return r.documento || ""; });
  varrer("contas", "Conta a pagar", "contas",
    function (r) { return r.descricao; }, function (r) { return L.brl(r.valor) + " " + (r.numeroDocumento || ""); });
  varrer("contratos", "Contrato", "contratos",
    function (r) { return r.objeto; }, function (r) { return L.brl(r.valor); });
  varrer("solicitacoes", "Solicitação", "solicitacoes",
    function (r) { return "#" + r.numero + " " + r.titulo; }, function (r) { return r.justificativa || ""; });
  varrer("documentos", "Documento", "documentos",
    function (r) { return r.titulo; }, function (r) { return (r.tags || []).join(" "); });
  return achados.slice(0, 12);
};



// ---------------------------------------------------------------- lotação de aulas

/**
 * Lotacionograma: aulas semanais de cada linha (professor × disciplina) em
 * cada turma. Estas contas são puras: a tela só desenha o que sai daqui.
 * "Total" segue a planilha da coordenação (turmas + Outros); "Câmara" fica
 * à parte, como lá.
 */
L.ETAPAS_LOTACAO = [
  { chave: "INFANTIL", rotulo: "Infantil", curto: "Infantil" },
  { chave: "FUND_I", rotulo: "Fundamental I", curto: "Fund. I" },
  { chave: "FUND_II", rotulo: "Fundamental II", curto: "Fund. II" },
  { chave: "MEDIO", rotulo: "Ensino Médio", curto: "Médio" },
  { chave: "PREP", rotulo: "Pré-vestibular", curto: "Pré" }
];

L.totaisLotacaoLinha = function (linha, turmas) {
  var porEtapa = {};
  L.ETAPAS_LOTACAO.forEach(function (e) { porEtapa[e.chave] = 0; });
  var emTurmas = 0;
  (turmas || []).forEach(function (t) {
    var n = Number((linha.aulas || {})[t.id]) || 0;
    porEtapa[t.etapa] = (porEtapa[t.etapa] || 0) + n;
    emTurmas += n;
  });
  var outros = Number(linha.outros) || 0;
  return { porEtapa: porEtapa, emTurmas: emTurmas, camara: Number(linha.camara) || 0, outros: outros, total: emTurmas + outros };
};

/** Chave de agrupamento por professor: o cadastro, se ligado; senão o nome escrito. */
L.chaveProfessorLotacao = function (linha) {
  if (linha.employeeId) return "e:" + linha.employeeId;
  var nome = L.semAcento(String(linha.professor || "")).toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  return nome ? "n:" + nome : "";
};

/**
 * Um registro por professor somando todas as disciplinas dele. `contrato` é
 * o total de aulas semanais do cadastro (só quando o perfil enxerga e a
 * linha está ligada a um funcionário); `diferenca` = distribuído − contrato.
 */
L.resumoLotacaoProfessores = function (dados, funcionarios) {
  var porChave = {};
  var ordem = [];
  var turmas = (dados && dados.turmas) || [];
  ((dados && dados.linhas) || []).forEach(function (l) {
    var chave = L.chaveProfessorLotacao(l);
    if (!chave) return;
    var r = porChave[chave];
    if (!r) {
      r = porChave[chave] = { chave: chave, nome: l.nomeCadastro || l.professor, apelido: l.professor, employeeId: l.employeeId || null,
        disciplinas: [], porEtapa: {}, emTurmas: 0, camara: 0, outros: 0, total: 0, disponibilidade: [], linhas: 0, turmas: {} };
      L.ETAPAS_LOTACAO.forEach(function (e) { r.porEtapa[e.chave] = 0; });
      ordem.push(chave);
    }
    var t = L.totaisLotacaoLinha(l, turmas);
    r.linhas++;
    if (r.disciplinas.indexOf(l.disciplina) === -1) r.disciplinas.push(l.disciplina);
    Object.keys(t.porEtapa).forEach(function (k) { r.porEtapa[k] += t.porEtapa[k]; });
    r.emTurmas += t.emTurmas; r.camara += t.camara; r.outros += t.outros; r.total += t.total;
    Object.keys(l.aulas || {}).forEach(function (tid) { if (Number(l.aulas[tid]) > 0) r.turmas[tid] = true; });
    if (l.disponibilidade && r.disponibilidade.indexOf(l.disponibilidade) === -1) r.disponibilidade.push(l.disponibilidade);
  });
  var cadastro = {};
  (funcionarios || []).forEach(function (f) { cadastro[f.id] = f; });
  return ordem.map(function (k) {
    var r = porChave[k];
    r.qtdTurmas = Object.keys(r.turmas).length;
    delete r.turmas;
    var f = r.employeeId ? cadastro[r.employeeId] : null;
    r.contrato = f && typeof f.aulasSemanais === "number" && f.aulasSemanais > 0 ? f.aulasSemanais : null;
    r.diferenca = r.contrato === null ? null : Math.round((r.total - r.contrato) * 10) / 10;
    return r;
  }).sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), "pt-BR"); });
};

/** Por turma: quanto já foi distribuído, a grade prevista e o saldo. */
L.resumoLotacaoTurmas = function (dados) {
  var turmas = (dados && dados.turmas) || [];
  var linhas = (dados && dados.linhas) || [];
  return turmas.map(function (t) {
    var alocado = 0, semProfessor = 0, disciplinas = {};
    linhas.forEach(function (l) {
      var n = Number((l.aulas || {})[t.id]) || 0;
      if (!n) return;
      alocado += n;
      disciplinas[l.disciplina] = true;
      if (!l.professor && !l.employeeId) semProfessor += n;
    });
    var meta = typeof t.aulasSemana === "number" ? t.aulasSemana : null;
    return { id: t.id, codigo: t.codigo, etapa: t.etapa, alocado: alocado, meta: meta,
      saldo: meta === null ? null : Math.round((alocado - meta) * 10) / 10,
      semProfessor: semProfessor, disciplinas: Object.keys(disciplinas).length };
  });
};

/** Linhas com aula marcada mas sem ninguém para dar ("A definir"). */
L.lotacaoSemProfessor = function (dados) {
  var turmas = (dados && dados.turmas) || [];
  return ((dados && dados.linhas) || []).filter(function (l) {
    return !l.professor && !l.employeeId && L.totaisLotacaoLinha(l, turmas).total > 0;
  });
};

/** Como cada etapa da lotação se chama na carga por segmento do contrato. */
L.SEGMENTO_DA_ETAPA = { INFANTIL: "Infantil", FUND_I: "Fundamental 1", FUND_II: "Fundamental 2", MEDIO: "Ensino Médio", PREP: "Pré-Vestibular" };

/**
 * Grade prevista × distribuída, por disciplina e turma. `falta` soma o que a
 * turma precisa e ninguém pegou; `sobra`, o distribuído além do previsto;
 * `semPrevisto` conta turmas com aula distribuída mas sem previsão cadastrada.
 */
L.resumoLotacaoDisciplinas = function (dados) {
  var turmas = (dados && dados.turmas) || [];
  var ordem = [], por = {};
  function reg(d) {
    if (!por[d]) { por[d] = { disciplina: d, celulas: {}, distribuido: 0, previsto: 0, falta: 0, sobra: 0, semPrevisto: 0 }; ordem.push(d); }
    return por[d];
  }
  ((dados && dados.linhas) || []).forEach(function (l) {
    var r = reg(l.disciplina);
    Object.keys(l.aulas || {}).forEach(function (tid) {
      var n = Number(l.aulas[tid]) || 0;
      if (!n) return;
      var c = r.celulas[tid] || (r.celulas[tid] = { distribuido: 0, previsto: null });
      c.distribuido += n;
    });
  });
  ((dados && dados.previsto) || []).forEach(function (p) {
    var r = reg(p.disciplina);
    var c = r.celulas[p.turmaId] || (r.celulas[p.turmaId] = { distribuido: 0, previsto: null });
    c.previsto = Number(p.aulas) || 0;
  });
  var existe = {};
  turmas.forEach(function (t) { existe[t.id] = true; });
  return ordem.map(function (d) {
    var r = por[d];
    Object.keys(r.celulas).forEach(function (tid) {
      if (!existe[tid]) { delete r.celulas[tid]; return; }
      var c = r.celulas[tid];
      r.distribuido += c.distribuido;
      if (c.previsto === null) { if (c.distribuido > 0) r.semPrevisto++; return; }
      r.previsto += c.previsto;
      var dif = c.distribuido - c.previsto;
      if (dif < 0) r.falta += -dif; else r.sobra += dif;
    });
    ["distribuido", "previsto", "falta", "sobra"].forEach(function (k) { r[k] = Math.round(r[k] * 10) / 10; });
    return r;
  });
};

/**
 * Professores cuja lotação não bate com o contrato: total de aulas semanais
 * e, quando o contrato tem divisão por segmento, cada segmento. É a lista que
 * o RH usa para ajustar contratos antes de a folha pagar errado.
 */
L.ajustesContratoLotacao = function (dados, funcionarios) {
  var cadastro = {};
  (funcionarios || []).forEach(function (f) { cadastro[f.id] = f; });
  var r10 = function (n) { return Math.round(n * 10) / 10; };
  return L.resumoLotacaoProfessores(dados, funcionarios).filter(function (p) { return p.employeeId && p.contrato !== null; })
    .map(function (p) {
      var f = cadastro[p.employeeId];
      var noContrato = {};
      (f.cargas || []).forEach(function (c) { noContrato[c.segmento] = (noContrato[c.segmento] || 0) + (Number(c.aulas) || 0); });
      var temDivisao = Object.keys(noContrato).length > 0;
      var segmentos = [];
      if (temDivisao) {
        L.ETAPAS_LOTACAO.forEach(function (e) {
          var seg = L.SEGMENTO_DA_ETAPA[e.chave];
          var c = r10(noContrato[seg] || 0), l = r10(p.porEtapa[e.chave] || 0);
          if (Math.abs(c - l) >= 0.5) segmentos.push({ segmento: seg, etapa: e.chave, contrato: c, lotacao: l });
        });
      }
      return { nome: p.nome, employeeId: p.employeeId, contrato: p.contrato, lotacao: r10(p.total),
        diferenca: p.diferenca, segmentos: segmentos };
    })
    .filter(function (a) { return Math.abs(a.diferenca) >= 0.5 || a.segmentos.length; });
};
