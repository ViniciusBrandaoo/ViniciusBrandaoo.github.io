/* ============================================================================
   Domínio do hotel: regras puras, sem tela.

   Tudo em centavos (inteiro) e data ISO (AAAA-MM-DD), como o resto do
   domínio. Nenhuma função aqui toca no DOM: a tela só desenha o que sai
   daqui, e os testes em `tests/prototipo/hotel.test.ts` carregam este
   arquivo de verdade.

   Princípio que atravessa o arquivo inteiro: FATURADO não é RECEBIDO,
   VENDIDO NO CARTÃO não é DEPOSITADO, BOLETO EMITIDO não é PAGO. Cada uma
   dessas coisas vive em campo próprio e só vira "dinheiro" com a
   confirmação correspondente.
   ========================================================================== */

// ---------------------------------------------------------------- coleções

// Entram no estado ANTES de `L.restaurar` (que só sobrescreve chaves que o
// dado salvo traz): quem já tinha o sistema aberto ganha as coleções novas
// vazias, sem perder nada do que já estava lá.
[
  "apartamentos", "hospedagens", "empresas", "importacoes",
  "cafeAjustes", "enxovalItens", "enxovalMovimentos",
  "frigobarProdutos", "frigobarConsumos",
  "recebimentos", "fechamentosCaixa", "transacoesCartao", "boletos",
  "notasFiscais", "cobrancas", "contasRecorrentes", "contasBancarias",
  "relatoriosDiarios", "diarias", "marcacoesPonto", "ajustesPonto"
].forEach(function (c) { if (!Array.isArray(L.estado[c])) L.estado[c] = []; });

L.hotel = {};
var H = L.hotel;

/** Configuração operacional. Tudo que é regra do hotel e não da lei mora aqui. */
L.estado.configHotel = L.estado.configHotel || {
  nome: "Hotel",
  // Taxa de ocupação: apartamento bloqueado (manutenção, uso interno) sai do
  // denominador — não está à venda, não pode baixar a taxa.
  ocupacaoExcluiBloqueados: true,
  cafeHorario: "06:30–10:00",
  // Criança até esta idade não conta como adulto no café (quando o DataHotel
  // traz a idade). Configurável: cada hotel tem a sua política.
  cafeIdadeCrianca: 12,
  alertasVencimentoDias: [7, 3, 1, 0],
  saldoInicialCaixa: 0
};

H.FORMAS = {
  DINHEIRO: { nome: "Dinheiro", entraNoCaixa: true, liquidaNaHora: true },
  CREDITO: { nome: "Cartão de crédito", entraNoCaixa: false, liquidaNaHora: false },
  DEBITO: { nome: "Cartão de débito", entraNoCaixa: false, liquidaNaHora: false },
  PIX: { nome: "Pix / transferência", entraNoCaixa: false, liquidaNaHora: true },
  FATURADO: { nome: "Faturado para empresa", entraNoCaixa: false, liquidaNaHora: false },
  BOLETO: { nome: "Boleto bancário", entraNoCaixa: false, liquidaNaHora: false },
  OUTRO: { nome: "Outra modalidade", entraNoCaixa: false, liquidaNaHora: false }
};

H.ITENS_ENXOVAL_PADRAO = ["Toalha de rosto", "Toalha de banho", "Lençol", "Fronha", "Cobertor"];
H.LOCAIS_ENXOVAL = {
  ROUPARIA: "Rouparia", APARTAMENTOS: "Apartamentos", LAVANDERIA: "Lavanderia",
  RESERVA: "Estoque de reserva", INDISPONIVEL: "Itens indisponíveis"
};

// ---------------------------------------------------------------- datas

H.addDias = function (iso, n) {
  var d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
H.diasEntre = function (a, b) {
  return Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000);
};
/** Dias reais do mês (28, 29, 30 ou 31), não "30 por convenção". */
H.diasDoMes = function (competencia) {
  var p = competencia.split("-").map(Number);
  return new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
};
H.noMes = function (iso, competencia) { return !!iso && iso.slice(0, 7) === competencia; };
H.dataValida = function (s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var d = new Date(s + "T12:00:00Z");
  // 31/02 vira 03/03 no Date: a volta tem de bater com a ida.
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
};

// ---------------------------------------------------------------- importação
//
// Enquanto o acesso oficial ao DataHotel (API ou exportação documentada) não
// estiver confirmado, a porta de entrada é arquivo exportado (CSV, ou Excel
// salvo como CSV). A chave de cada registro é ORIGEM + CÓDIGO ORIGINAL: é o
// que impede importar a mesma reserva duas vezes e o que permite atualizar
// sem duplicar.

/** CSV com `;` ou `,`, aspas e cabeçalho. Devolve objetos por coluna. */
H.lerCsv = function (texto) {
  var linhas = String(texto || "").replace(/^﻿/, "").split(/\r?\n/).filter(function (l) { return l.trim() !== ""; });
  if (!linhas.length) return [];
  var sep = (linhas[0].split(";").length >= linhas[0].split(",").length) ? ";" : ",";
  function quebrar(l) {
    var out = [], atual = "", aspas = false;
    for (var i = 0; i < l.length; i++) {
      var ch = l[i];
      if (ch === '"') { if (aspas && l[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas; }
      else if (ch === sep && !aspas) { out.push(atual); atual = ""; }
      else atual += ch;
    }
    out.push(atual);
    return out.map(function (s) { return s.trim(); });
  }
  var cab = quebrar(linhas[0]).map(function (c) {
    return c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  });
  return linhas.slice(1).map(function (l) {
    var v = quebrar(l), o = {};
    cab.forEach(function (c, i) { o[c] = v[i] === undefined ? "" : v[i]; });
    return o;
  });
};

/** "1.234,56" / "1234.56" / "R$ 10" → centavos. Vazio → null (não zero!). */
H.lerValor = function (s) {
  if (s === undefined || s === null) return null;
  var t = String(s).replace(/[R$\s]/g, "");
  if (t === "") return null;
  if (t.indexOf(",") !== -1) t = t.replace(/\./g, "").replace(",", ".");
  var n = Number(t);
  return isNaN(n) ? NaN : Math.round(n * 100);
};
/** "31/12/2026" ou "2026-12-31" → ISO. Vazio → null. */
H.lerData = function (s) {
  if (!s) return null;
  var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s).trim());
  var iso = m ? m[3] + "-" + m[2] + "-" + m[1] : String(s).trim().slice(0, 10);
  return H.dataValida(iso) ? iso : NaN;
};

/**
 * Layouts aceitos. Cada campo diz de qual coluna vem (aceita apelidos, porque
 * o nome da coluna no relatório exportado ainda não foi confirmado) e de que
 * tipo é. Quando o layout real do DataHotel for conhecido, é aqui — e só
 * aqui — que se ajusta.
 */
H.LAYOUTS = {
  hospedagens: {
    nome: "Hospedagens / reservas", colecao: "hospedagens",
    codigo: ["codigo", "reserva", "id_reserva", "localizador"],
    campos: {
      hospede: { de: ["hospede", "nome", "nome_hospede"], obrigatorio: true },
      apartamento: { de: ["apartamento", "apto", "uh", "quarto"], obrigatorio: true },
      checkin: { de: ["checkin", "check_in", "entrada", "data_entrada"], tipo: "data", obrigatorio: true },
      checkout: { de: ["checkout", "check_out", "saida", "data_saida", "checkout_previsto"], tipo: "data", obrigatorio: true },
      checkoutRealizado: { de: ["checkout_realizado", "saida_realizada"], tipo: "data" },
      adultos: { de: ["adultos", "qtd_adultos", "pax"], tipo: "inteiro" },
      criancas: { de: ["criancas", "qtd_criancas", "chd"], tipo: "inteiro" },
      valorDiaria: { de: ["valor_diaria", "diaria", "tarifa"], tipo: "valor" },
      consumos: { de: ["consumos", "extras", "valor_consumos"], tipo: "valor" },
      descontos: { de: ["descontos", "desconto"], tipo: "valor" },
      valorPago: { de: ["valor_pago", "pago"], tipo: "valor" },
      formaPagamento: { de: ["forma_pagamento", "pagamento", "forma"] },
      empresa: { de: ["empresa", "empresa_pagadora", "cnpj_empresa"] },
      cafeIncluido: { de: ["cafe", "cafe_incluido", "cafe_da_manha"], tipo: "booleano" },
      status: { de: ["status", "situacao"] }
    }
  },
  recebimentos: {
    nome: "Pagamentos / recebimentos", colecao: "recebimentos",
    codigo: ["codigo", "id", "id_pagamento", "documento"],
    campos: {
      data: { de: ["data", "data_operacao", "data_pagamento"], tipo: "data", obrigatorio: true },
      descricao: { de: ["descricao", "historico"] },
      pagador: { de: ["hospede", "empresa", "pagador", "cliente"] },
      apartamento: { de: ["apartamento", "apto", "uh", "referencia"] },
      reserva: { de: ["reserva", "localizador", "codigo_reserva"] },
      forma: { de: ["forma", "forma_pagamento", "modalidade"], obrigatorio: true },
      valorBruto: { de: ["valor", "valor_bruto"], tipo: "valor", obrigatorio: true },
      desconto: { de: ["desconto"], tipo: "valor" },
      taxa: { de: ["taxa", "taxa_financeira"], tipo: "valor" },
      codigoTransacao: { de: ["nsu", "codigo_transacao", "autorizacao"] },
      bandeira: { de: ["bandeira"] }, operadora: { de: ["operadora", "adquirente"] },
      parcelas: { de: ["parcelas", "parcelamento"], tipo: "inteiro" }
    }
  },
  frigobar: {
    nome: "Consumos de frigobar", colecao: "frigobarConsumos",
    codigo: ["codigo", "id", "lancamento"],
    campos: {
      data: { de: ["data"], tipo: "data", obrigatorio: true },
      apartamento: { de: ["apartamento", "apto", "uh"], obrigatorio: true },
      produto: { de: ["produto", "item", "descricao"], obrigatorio: true },
      quantidade: { de: ["quantidade", "qtd"], tipo: "inteiro", obrigatorio: true },
      valorUnitario: { de: ["valor_unitario", "preco", "valor"], tipo: "valor" },
      reserva: { de: ["reserva", "localizador"] }
    }
  }
};

H.normalizarForma = function (s) {
  var t = String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (!t) return null;
  if (/dinheiro|especie/.test(t)) return "DINHEIRO";
  if (/debito/.test(t)) return "DEBITO";
  if (/credito|cartao/.test(t)) return "CREDITO";
  if (/pix|transf|ted|doc/.test(t)) return "PIX";
  if (/boleto/.test(t)) return "BOLETO";
  if (/fatur|empresa|faturado/.test(t)) return "FATURADO";
  return "OUTRO";
};

function pegar(linha, nomes) {
  for (var i = 0; i < nomes.length; i++) if (linha[nomes[i]] !== undefined) return linha[nomes[i]];
  return undefined;
}

/** Converte uma linha bruta no registro do layout, com a lista de problemas. */
H.converterLinha = function (layout, linha) {
  var reg = {}, problemas = [];
  var codigo = pegar(linha, layout.codigo);
  if (!codigo) problemas.push("Sem código original (a linha não teria como ser reconhecida numa próxima importação).");
  reg.codigoOrigem = codigo || null;
  Object.keys(layout.campos).forEach(function (k) {
    var c = layout.campos[k], bruto = pegar(linha, c.de);
    var vazio = bruto === undefined || String(bruto).trim() === "";
    if (vazio) {
      if (c.obrigatorio) problemas.push("Campo obrigatório vazio: " + k + ".");
      return; // vazio NÃO vira campo: não apaga o que já existe internamente.
    }
    var v = bruto;
    if (c.tipo === "data") { v = H.lerData(bruto); if (Number.isNaN(v)) { problemas.push("Data inválida em " + k + ": " + bruto); return; } }
    else if (c.tipo === "valor") { v = H.lerValor(bruto); if (Number.isNaN(v)) { problemas.push("Valor inválido em " + k + ": " + bruto); return; } if (v < 0) { problemas.push("Valor negativo em " + k + "."); return; } }
    else if (c.tipo === "inteiro") { v = parseInt(bruto, 10); if (isNaN(v) || v < 0) { problemas.push("Número inválido em " + k + ": " + bruto); return; } }
    else if (c.tipo === "booleano") { v = /^(s|sim|1|true|x|incluido|incluso)$/i.test(String(bruto).trim()); }
    reg[k] = v;
  });
  if (reg.forma !== undefined) reg.forma = H.normalizarForma(reg.forma);
  if (reg.formaPagamento !== undefined) reg.formaPagamento = H.normalizarForma(reg.formaPagamento);
  if (reg.checkin && reg.checkout && reg.checkout < reg.checkin) problemas.push("Check-out antes do check-in.");
  return { registro: reg, problemas: problemas };
};

/**
 * Pré-visualização: classifica cada linha SEM gravar nada.
 *   novo        — código ainda não existe para esta origem
 *   atualizado  — já existe e algum campo mudou
 *   duplicado   — já existe e nada mudou (ou repetido dentro do próprio arquivo)
 *   inconsistente — não passou na validação; não entra
 */
H.preverImportacao = function (tipo, origem, linhas) {
  var layout = H.LAYOUTS[tipo];
  if (!layout) throw new Error("Tipo de importação desconhecido: " + tipo);
  var existentes = L.estado[layout.colecao];
  var vistos = {};
  var itens = linhas.map(function (linha, i) {
    var c = H.converterLinha(layout, linha);
    var item = { linha: i + 2, registro: c.registro, problemas: c.problemas };
    if (c.problemas.length) { item.situacao = "inconsistente"; return item; }
    var chave = origem + "|" + c.registro.codigoOrigem;
    if (vistos[chave]) { item.situacao = "duplicado"; item.problemas = ["Repetido no próprio arquivo (linha " + vistos[chave] + ")."]; return item; }
    vistos[chave] = item.linha;
    var atual = existentes.find(function (r) { return r.origem === origem && r.codigoOrigem === c.registro.codigoOrigem; });
    if (!atual) { item.situacao = "novo"; return item; }
    item.alvoId = atual.id;
    var mudou = Object.keys(c.registro).filter(function (k) { return JSON.stringify(atual[k]) !== JSON.stringify(c.registro[k]); });
    item.situacao = mudou.length ? "atualizado" : "duplicado";
    item.camposAlterados = mudou;
    return item;
  });
  var resumo = { total: itens.length, novo: 0, atualizado: 0, duplicado: 0, inconsistente: 0 };
  itens.forEach(function (it) { resumo[it.situacao]++; });
  return { tipo: tipo, origem: origem, itens: itens, resumo: resumo };
};

/**
 * Aplica uma prévia. Atualização faz MERGE: só os campos que vieram no
 * arquivo mudam; tudo que foi complementado aqui dentro (observações,
 * conferência, ajustes) fica. Nada é apagado por vir em branco.
 */
H.aplicarImportacao = function (previa, meta) {
  var layout = H.LAYOUTS[previa.tipo];
  var agora = new Date().toISOString();
  previa.itens.forEach(function (it) {
    if (it.situacao === "novo") {
      L.criar(layout.colecao, Object.assign({ origem: previa.origem, importadoEm: agora }, it.registro));
    } else if (it.situacao === "atualizado") {
      L.atualizar(layout.colecao, it.alvoId, Object.assign({ atualizadoPelaImportacaoEm: agora }, it.registro));
    }
  });
  var u = L.estado.usuario || {};
  return L.criar("importacoes", {
    tipo: previa.tipo, origem: previa.origem,
    arquivo: (meta && meta.arquivo) || "", formato: (meta && meta.formato) || "CSV",
    periodoInicio: (meta && meta.periodoInicio) || null, periodoFim: (meta && meta.periodoFim) || null,
    resumo: previa.resumo,
    erros: previa.itens.filter(function (i) { return i.situacao === "inconsistente"; })
      .map(function (i) { return { linha: i.linha, problemas: i.problemas }; }),
    status: previa.resumo.inconsistente ? "CONCLUIDA_COM_PENDENCIAS" : "CONCLUIDA",
    usuario: u.nome || u.email || "—", em: agora
  });
};

// ---------------------------------------------------------------- hospedagem

/** Está no hotel na noite de `data`? (Entrou até `data` e sai depois dela.) */
H.pernoita = function (h, data) {
  if (h.status === "CANCELADA" || h.status === "NO_SHOW") return false;
  var saida = h.checkoutRealizado || h.checkout;
  return h.checkin <= data && saida > data;
};
H.diariasDe = function (h) {
  return Math.max(1, H.diasEntre(h.checkin, h.checkoutRealizado || h.checkout));
};
/** Valor total = diárias × tarifa + consumos − descontos. Pendente = total − pago. */
H.valoresHospedagem = function (h) {
  var diarias = H.diariasDe(h);
  var hospedagem = diarias * (h.valorDiaria || 0);
  var total = hospedagem + (h.consumos || 0) - (h.descontos || 0);
  var pago = h.valorPago || 0;
  var pendente = Math.max(0, total - pago);
  var situacao = total === 0 ? "SEM_VALOR" : pendente === 0 ? "QUITADA"
    : (h.formaPagamento === "FATURADO" || h.empresa) ? "FATURAR" : "PENDENTE";
  return { diarias: diarias, valorHospedagem: hospedagem, total: total, pago: pago, pendente: pendente, situacao: situacao };
};

H.ocupacao = function (data) {
  var cfg = L.estado.configHotel;
  var aptos = L.estado.apartamentos.filter(function (a) { return a.ativo !== false; });
  var bloqueados = aptos.filter(function (a) { return a.bloqueado; });
  var hs = L.estado.hospedagens;
  var presentes = hs.filter(function (h) { return H.pernoita(h, data); });
  var ocupadosSet = {};
  presentes.forEach(function (h) { ocupadosSet[h.apartamento] = true; });
  var ocupados = Object.keys(ocupadosSet).length;
  var vendaveis = cfg.ocupacaoExcluiBloqueados ? aptos.length - bloqueados.length : aptos.length;
  return {
    data: data,
    total: aptos.length,
    bloqueados: bloqueados.length,
    ocupados: ocupados,
    disponiveis: Math.max(0, aptos.length - bloqueados.length - ocupados),
    hospedes: presentes.reduce(function (a, h) { return a + (h.adultos || 1) + (h.criancas || 0); }, 0),
    entradas: hs.filter(function (h) { return h.checkin === data && h.status !== "CANCELADA"; }).length,
    saidas: hs.filter(function (h) { return (h.checkoutRealizado || h.checkout) === data && h.status !== "CANCELADA"; }).length,
    permanencias: presentes.filter(function (h) { return h.checkin < data; }).length,
    taxa: vendaveis > 0 ? ocupados / vendaveis : 0
  };
};

/** Extrato do dia: quem pernoita OU sai nesta data. */
H.extratoDiario = function (data) {
  return L.estado.hospedagens
    .filter(function (h) { return H.pernoita(h, data) || (h.checkoutRealizado || h.checkout) === data; })
    .map(function (h) { return Object.assign({ hospedagem: h }, H.valoresHospedagem(h)); })
    .sort(function (a, b) { return String(a.hospedagem.apartamento).localeCompare(String(b.hospedagem.apartamento), "pt-BR", { numeric: true }); });
};

// ---------------------------------------------------------------- café da manhã

/**
 * Quem toma café em `data` é quem PERNOITOU na noite anterior (entrou antes
 * e sai hoje ou depois). Ajuste manual (extra autorizado, correção) é
 * registro à parte, com justificativa: o dado de origem não é tocado.
 */
H.listaCafe = function (data) {
  var ontem = H.addDias(data, -1);
  var linhas = L.estado.hospedagens.filter(function (h) { return H.pernoita(h, ontem); }).map(function (h) {
    var adultos = h.adultos || 1, criancas = h.criancas || 0;
    var incluido = h.cafeIncluido !== false;
    return { apartamento: h.apartamento, hospede: h.hospede, adultos: adultos, criancas: criancas,
      incluido: incluido, previstos: incluido ? adultos + criancas : 0, semCafe: incluido ? 0 : adultos + criancas, hospedagemId: h.id };
  });
  var ajustes = L.estado.cafeAjustes.filter(function (a) { return a.data === data; });
  var extras = ajustes.reduce(function (s, a) { return s + (a.quantidade || 0); }, 0);
  linhas.sort(function (a, b) { return String(a.apartamento).localeCompare(String(b.apartamento), "pt-BR", { numeric: true }); });
  var soma = function (k) { return linhas.reduce(function (s, l) { return s + l[k]; }, 0); };
  return {
    data: data, linhas: linhas, ajustes: ajustes,
    adultos: soma("adultos"), criancas: soma("criancas"),
    comCafe: soma("previstos"), semCafe: soma("semCafe"), extras: extras,
    totalPrevisto: soma("previstos") + extras,
    atendidos: (L.estado.cafeAjustes.find(function (a) { return a.data === data && a.tipo === "ATENDIDOS"; }) || {}).atendidos
  };
};

// ---------------------------------------------------------------- enxoval
//
// Estoque final = estoque inicial + entradas − saídas definitivas.
// Transferência (rouparia → apartamento → lavanderia → rouparia) só muda o
// LUGAR: o total não se mexe. Saída definitiva é dano, extravio ou descarte.

H.TIPOS_MOV_ENXOVAL = {
  INICIAL: { nome: "Estoque inicial", efeito: "entrada" },
  COMPRA: { nome: "Entrada / compra", efeito: "entrada" },
  TRANSFERENCIA: { nome: "Transferência entre locais", efeito: "transferencia" },
  DANO: { nome: "Danificado", efeito: "saida" },
  EXTRAVIO: { nome: "Extraviado", efeito: "saida" },
  DESCARTE: { nome: "Descartado", efeito: "saida" },
  INVENTARIO: { nome: "Ajuste de inventário", efeito: "ajuste" }
};

H.validarMovEnxoval = function (m) {
  var p = [];
  var t = H.TIPOS_MOV_ENXOVAL[m.tipo];
  if (!t) p.push("Tipo de movimentação inválido.");
  if (!m.itemId) p.push("Escolha o item.");
  if (!(m.quantidade > 0) && m.tipo !== "INVENTARIO") p.push("Quantidade deve ser maior que zero.");
  if (t && t.efeito === "transferencia") {
    if (!m.de || !m.para) p.push("Transferência precisa de origem e destino.");
    else if (m.de === m.para) p.push("Origem e destino iguais.");
  }
  if (t && t.efeito === "entrada" && !m.para) p.push("Informe o local de entrada.");
  if (t && t.efeito === "saida" && !m.de) p.push("Informe de onde saiu.");
  if (t && t.efeito === "transferencia" && m.de && H.saldoEnxoval(m.itemId, m.data)[m.de] < m.quantidade) p.push("Não há essa quantidade em " + H.LOCAIS_ENXOVAL[m.de] + ".");
  return p;
};

/** Saldo por local até `ate` (inclusive). */
H.saldoEnxoval = function (itemId, ate) {
  var s = {};
  Object.keys(H.LOCAIS_ENXOVAL).forEach(function (k) { s[k] = 0; });
  L.estado.enxovalMovimentos.filter(function (m) { return m.itemId === itemId && (!ate || m.data <= ate); })
    .sort(function (a, b) { return a.data.localeCompare(b.data); })
    .forEach(function (m) {
      var ef = (H.TIPOS_MOV_ENXOVAL[m.tipo] || {}).efeito;
      if (ef === "entrada") s[m.para] += m.quantidade;
      else if (ef === "saida") s[m.de] -= m.quantidade;
      else if (ef === "transferencia") { s[m.de] -= m.quantidade; s[m.para] += m.quantidade; }
      else if (ef === "ajuste") s[m.local] = m.contado;
    });
  return s;
};

H.resumoEnxoval = function (itemId, inicio, fim) {
  var movs = L.estado.enxovalMovimentos.filter(function (m) { return m.itemId === itemId && m.data >= inicio && m.data <= fim; });
  var soma = function (f) { return movs.filter(f).reduce(function (a, m) { return a + m.quantidade; }, 0); };
  var antes = H.saldoEnxoval(itemId, H.addDias(inicio, -1));
  var depois = H.saldoEnxoval(itemId, fim);
  var total = function (s) { return Object.keys(s).filter(function (k) { return k !== "INDISPONIVEL"; }).reduce(function (a, k) { return a + s[k]; }, 0); };
  var item = L.buscarPorId("enxovalItens", itemId) || {};
  var r = {
    inicial: total(antes), final: total(depois), porLocal: depois,
    entradas: soma(function (m) { return (H.TIPOS_MOV_ENXOVAL[m.tipo] || {}).efeito === "entrada"; }),
    entreguesApartamentos: soma(function (m) { return m.tipo === "TRANSFERENCIA" && m.para === "APARTAMENTOS"; }),
    recolhidos: soma(function (m) { return m.tipo === "TRANSFERENCIA" && m.de === "APARTAMENTOS"; }),
    enviadosLavanderia: soma(function (m) { return m.tipo === "TRANSFERENCIA" && m.para === "LAVANDERIA"; }),
    recebidosLavanderia: soma(function (m) { return m.tipo === "TRANSFERENCIA" && m.de === "LAVANDERIA"; }),
    danificados: soma(function (m) { return m.tipo === "DANO"; }),
    extraviados: soma(function (m) { return m.tipo === "EXTRAVIO"; }),
    descartados: soma(function (m) { return m.tipo === "DESCARTE"; }),
    minimo: item.minimo || 0
  };
  r.perdas = r.danificados + r.extraviados + r.descartados;
  r.disponivel = depois.ROUPARIA + depois.RESERVA;
  r.pendenteLavanderia = depois.LAVANDERIA;
  return r;
};

H.alertasEnxoval = function (hoje) {
  var out = [];
  var inicioMes = hoje.slice(0, 8) + "01";
  L.estado.enxovalItens.filter(function (i) { return i.ativo !== false; }).forEach(function (i) {
    var r = H.resumoEnxoval(i.id, inicioMes, hoje);
    if (i.minimo && r.disponivel < i.minimo) out.push({ nivel: "critico", texto: i.nome + ": disponível (" + r.disponivel + ") abaixo do mínimo (" + i.minimo + ")." });
    var limitePerda = i.perdaMaximaMes || Math.ceil(r.inicial * 0.05);
    if (r.perdas > 0 && r.perdas > limitePerda) out.push({ nivel: "atencao", texto: i.nome + ": " + r.perdas + " perdas no mês (limite " + limitePerda + ")." });
    var velhosNaLavanderia = L.estado.enxovalMovimentos.some(function (m) {
      return m.itemId === i.id && m.tipo === "TRANSFERENCIA" && m.para === "LAVANDERIA" && H.diasEntre(m.data, hoje) > 3;
    });
    if (r.pendenteLavanderia > 0 && velhosNaLavanderia) out.push({ nivel: "atencao", texto: i.nome + ": " + r.pendenteLavanderia + " na lavanderia há mais de 3 dias." });
    var saldo = H.saldoEnxoval(i.id, hoje);
    Object.keys(saldo).forEach(function (k) { if (saldo[k] < 0) out.push({ nivel: "critico", texto: i.nome + ": saldo negativo em " + H.LOCAIS_ENXOVAL[k] + " — divergência de inventário." }); });
  });
  return out;
};

/** Lista diária de governança: o que arrumar e quanto repor. */
H.listaGovernanca = function (data) {
  var hs = L.estado.hospedagens;
  var ocupados = hs.filter(function (h) { return H.pernoita(h, data); });
  var saidas = hs.filter(function (h) { return (h.checkoutRealizado || h.checkout) === data && h.status !== "CANCELADA"; });
  var entradas = hs.filter(function (h) { return h.checkin === data && h.status !== "CANCELADA"; });
  var aptos = {};
  function marcar(apto, tipo) { aptos[apto] = aptos[apto] || { apartamento: apto, tarefas: [] }; aptos[apto].tarefas.push(tipo); }
  ocupados.filter(function (h) { return h.checkin < data; }).forEach(function (h) { marcar(h.apartamento, "Arrumação (permanência)"); });
  saidas.forEach(function (h) { marcar(h.apartamento, "Limpeza de saída"); });
  entradas.forEach(function (h) { marcar(h.apartamento, "Preparar para entrada"); });
  var lista = Object.keys(aptos).map(function (k) { return aptos[k]; })
    .sort(function (a, b) { return String(a.apartamento).localeCompare(String(b.apartamento), "pt-BR", { numeric: true }); });
  // Reposição: padrão por tipologia × apartamentos com troca de enxoval.
  var reposicao = {};
  lista.forEach(function (l) {
    var apto = L.estado.apartamentos.find(function (a) { return String(a.numero) === String(l.apartamento); }) || {};
    var padrao = apto.padraoEnxoval || {};
    Object.keys(padrao).forEach(function (itemId) { reposicao[itemId] = (reposicao[itemId] || 0) + padrao[itemId]; });
  });
  return { data: data, apartamentos: lista, ocupados: ocupados.length, saidas: saidas.length, entradas: entradas.length, reposicao: reposicao };
};

// ---------------------------------------------------------------- frigobar

H.produtoPorNome = function (nome) {
  var n = String(nome || "").toLowerCase().trim();
  return L.estado.frigobarProdutos.find(function (p) { return p.nome.toLowerCase() === n || String(p.codigo || "").toLowerCase() === n; });
};
/** Valor do consumo = quantidade × preço de venda (o do registro, senão o do cadastro). */
H.valorConsumo = function (c) {
  var p = c.produtoId ? L.buscarPorId("frigobarProdutos", c.produtoId) : H.produtoPorNome(c.produto);
  var unit = c.valorUnitario != null ? c.valorUnitario : (p ? p.precoVenda : 0);
  return { unitario: unit, total: unit * (c.quantidade || 0), custo: (p ? p.custo || 0 : 0) * (c.quantidade || 0), produto: p };
};

function agrupar(lista, chave) {
  var g = {};
  lista.forEach(function (x) { var k = chave(x); (g[k] = g[k] || []).push(x); });
  return g;
}

H.frigobarDia = function (data) {
  var cs = L.estado.frigobarConsumos.filter(function (c) { return c.data === data && c.status !== "CANCELADO"; });
  var porProduto = agrupar(cs, function (c) { var v = H.valorConsumo(c); return v.produto ? v.produto.nome : c.produto; });
  var porApto = agrupar(cs, function (c) { return c.apartamento; });
  var linha = function (k, l) {
    return { chave: k, quantidade: l.reduce(function (a, c) { return a + c.quantidade; }, 0),
      valor: l.reduce(function (a, c) { return a + H.valorConsumo(c).total; }, 0) };
  };
  return {
    data: data,
    produtos: Object.keys(porProduto).map(function (k) { return linha(k, porProduto[k]); }),
    apartamentos: Object.keys(porApto).map(function (k) { return linha(k, porApto[k]); }),
    total: cs.reduce(function (a, c) { return a + H.valorConsumo(c).total; }, 0)
  };
};

/**
 * Fechamento mensal = soma dos dias reais do mês (28/29/30/31). A receita
 * conta UMA vez: consumo marcado `jaNoDataHotel` entra no relatório de
 * produto, mas é sinalizado para a receita não ser lançada de novo fora da
 * conta do hóspede.
 */
H.frigobarMes = function (competencia) {
  var dias = H.diasDoMes(competencia);
  var evolucao = [];
  for (var d = 1; d <= dias; d++) {
    var iso = competencia + "-" + String(d).padStart(2, "0");
    evolucao.push({ data: iso, valor: H.frigobarDia(iso).total });
  }
  var cs = L.estado.frigobarConsumos.filter(function (c) { return H.noMes(c.data, competencia) && c.status !== "CANCELADO"; });
  var porProduto = agrupar(cs, function (c) { var v = H.valorConsumo(c); return v.produto ? v.produto.nome : c.produto; });
  var produtos = Object.keys(porProduto).map(function (k) {
    var l = porProduto[k];
    var qtd = l.reduce(function (a, c) { return a + c.quantidade; }, 0);
    var receita = l.reduce(function (a, c) { return a + H.valorConsumo(c).total; }, 0);
    var custo = l.reduce(function (a, c) { return a + H.valorConsumo(c).custo; }, 0);
    return { produto: k, quantidade: qtd, precoMedio: qtd ? Math.round(receita / qtd) : 0, receita: receita, custo: custo, margem: receita - custo };
  }).sort(function (a, b) { return b.receita - a.receita; });
  var porApto = agrupar(cs, function (c) { return c.apartamento; });
  return {
    competencia: competencia, dias: dias, evolucao: evolucao, produtos: produtos,
    apartamentos: Object.keys(porApto).map(function (k) { return { apartamento: k, valor: porApto[k].reduce(function (a, c) { return a + H.valorConsumo(c).total; }, 0) }; }),
    receita: evolucao.reduce(function (a, e) { return a + e.valor; }, 0),
    custo: produtos.reduce(function (a, p) { return a + p.custo; }, 0),
    receitaJaNoDataHotel: cs.filter(function (c) { return c.jaNoDataHotel || c.origem; }).reduce(function (a, c) { return a + H.valorConsumo(c).total; }, 0)
  };
};

/** Consumo registrado aqui que não aparece cobrado na conta do hóspede. */
H.frigobarNaoCobrado = function (competencia) {
  return L.estado.frigobarConsumos.filter(function (c) {
    return H.noMes(c.data, competencia) && c.status !== "CANCELADO" && !c.cobrado && !c.jaNoDataHotel && !c.origem;
  });
};

// ---------------------------------------------------------------- recebimentos e caixa

/** Líquido = bruto − desconto − taxa. Nunca negativo. */
H.liquido = function (r) { return Math.max(0, (r.valorBruto || 0) - (r.desconto || 0) - (r.taxa || 0)); };

/**
 * Situação de um recebimento. Dinheiro e Pix liquidam na hora; cartão só é
 * "recebido" quando o depósito é conciliado; faturado/boleto só quando o
 * pagamento é confirmado (baixa do boleto).
 */
H.situacaoRecebimento = function (r) {
  if (r.status === "CANCELADO" || r.status === "ESTORNADO") return r.status;
  if (r.conciliadoEm) return "CONCILIADO";
  if (r.recebidoEm) return "RECEBIDO";
  var f = H.FORMAS[r.forma] || H.FORMAS.OUTRO;
  return f.liquidaNaHora ? "RECEBIDO" : "A_RECEBER";
};

/**
 * Fechamento do dia. Três números que NUNCA se misturam:
 *   faturado  — tudo que foi vendido/lançado no dia (receita reconhecida)
 *   recebido  — o que de fato entrou (dinheiro, pix, cartão conciliado, boleto baixado)
 *   aReceber  — faturado − recebido (cartão a depositar, faturado, boleto aberto)
 * E o CAIXA físico só olha dinheiro:
 *   saldo final = saldo inicial + entradas em dinheiro − saídas em dinheiro
 */
H.fechamentoDia = function (data) {
  var rs = L.estado.recebimentos.filter(function (r) { return r.data === data && r.status !== "CANCELADO" && r.tipo !== "SAIDA_CAIXA"; });
  var porForma = {};
  Object.keys(H.FORMAS).forEach(function (k) { porForma[k] = { faturado: 0, recebido: 0, aReceber: 0, qtd: 0 }; });
  rs.forEach(function (r) {
    var f = porForma[r.forma] || porForma.OUTRO;
    var v = H.liquido(r);
    var sit = H.situacaoRecebimento(r);
    f.qtd++;
    f.faturado += v;
    if (sit === "RECEBIDO" || sit === "CONCILIADO") f.recebido += v; else if (sit !== "ESTORNADO") f.aReceber += v;
  });
  var totais = Object.keys(porForma).reduce(function (a, k) {
    a.faturado += porForma[k].faturado; a.recebido += porForma[k].recebido; a.aReceber += porForma[k].aReceber; return a;
  }, { faturado: 0, recebido: 0, aReceber: 0 });
  var anterior = L.estado.fechamentosCaixa.filter(function (f) { return f.data < data && f.status === "FECHADO"; })
    .sort(function (a, b) { return b.data.localeCompare(a.data); })[0];
  var saldoInicial = anterior ? anterior.saldoConferido : (L.estado.configHotel.saldoInicialCaixa || 0);
  var saidas = L.estado.recebimentos.filter(function (r) { return r.data === data && r.tipo === "SAIDA_CAIXA" && r.status !== "CANCELADO"; })
    .reduce(function (a, r) { return a + (r.valorBruto || 0); }, 0);
  var entradasDinheiro = porForma.DINHEIRO.recebido;
  var existente = L.estado.fechamentosCaixa.find(function (f) { return f.data === data; });
  return {
    data: data, porForma: porForma, totais: totais,
    saldoInicial: saldoInicial, entradasDinheiro: entradasDinheiro, saidasDinheiro: saidas,
    saldoCalculado: saldoInicial + entradasDinheiro - saidas,
    fechamento: existente || null
  };
};

/** Fechar exige: diferença zero, OU justificativa + aprovação de quem pode. */
H.validarFechamentoCaixa = function (calc, saldoConferido, justificativa, aprovador) {
  var dif = saldoConferido - calc.saldoCalculado;
  var p = [];
  if (calc.fechamento && calc.fechamento.status === "FECHADO") p.push("Este dia já está fechado; correção exige reabertura justificada.");
  if (dif !== 0 && !String(justificativa || "").trim()) p.push("Há diferença de caixa: escreva a justificativa.");
  if (dif !== 0 && !aprovador) p.push("Diferença de caixa precisa de autorização da Direção ou do Financeiro responsável.");
  return { diferenca: dif, problemas: p };
};

// ---------------------------------------------------------------- cartões

H.STATUS_CARTAO = ["A_RECEBER", "RECEBIDO", "CONCILIADO", "PARCIAL", "DIVERGENTE", "ATRASADO", "CANCELADO"];

/** Conciliação: esperado (bruto − taxa) contra o depositado. */
H.conciliarCartao = function (t, hoje) {
  if (t.status === "CANCELADO" || t.status === "ESTORNADO") return { status: "CANCELADO", diferenca: 0, esperado: 0 };
  var esperado = (t.valorVenda || 0) - (t.taxa || 0) - (t.antecipacao || 0);
  if (t.valorDepositado == null) {
    var atrasado = t.dataPrevista && hoje && t.dataPrevista < hoje;
    return { status: atrasado ? "ATRASADO" : "A_RECEBER", diferenca: null, esperado: esperado };
  }
  var dif = t.valorDepositado - esperado;
  var status = dif === 0 ? "CONCILIADO" : (t.valorDepositado > 0 && t.valorDepositado < esperado ? "PARCIAL" : "DIVERGENTE");
  return { status: status, diferenca: dif, esperado: esperado };
};

// ---------------------------------------------------------------- boletos

H.statusBoleto = function (b, hoje) {
  if (b.status === "CANCELADO") return "CANCELADO";
  var pago = b.valorPago || 0;
  var devido = (b.valor || 0) + (b.juros || 0) + (b.multa || 0) - (b.desconto || 0);
  if (pago >= devido && pago > 0) return "PAGO";
  if (pago > 0) return "PARCIAL";
  if (b.vencimento < hoje) return "VENCIDO";
  if (H.diasEntre(hoje, b.vencimento) <= 7) return "A_VENCER";
  return "EMITIDO";
};
H.saldoBoleto = function (b) {
  return Math.max(0, (b.valor || 0) + (b.juros || 0) + (b.multa || 0) - (b.desconto || 0) - (b.valorPago || 0));
};

/**
 * Baixa de boleto: registra o pagamento NO BOLETO e gera o recebimento
 * vinculado — uma vez só. Rodar duas vezes não cria um segundo recebimento
 * (evita a dupla contagem faturado + boleto pago).
 */
H.baixarBoleto = function (boletoId, pagamento) {
  var b = L.buscarPorId("boletos", boletoId);
  if (!b) throw new Error("Boleto não encontrado.");
  if (!(pagamento.valor > 0)) throw new Error("Informe o valor pago.");
  if (!H.dataValida(pagamento.data)) throw new Error("Informe a data do pagamento.");
  var ja = L.estado.recebimentos.find(function (r) { return r.boletoId === boletoId && r.data === pagamento.data && r.valorBruto === pagamento.valor; });
  if (ja) return ja;
  L.atualizar("boletos", boletoId, {
    valorPago: (b.valorPago || 0) + pagamento.valor, dataPagamento: pagamento.data,
    juros: pagamento.juros != null ? pagamento.juros : b.juros, multa: pagamento.multa != null ? pagamento.multa : b.multa,
    comprovante: pagamento.comprovante || b.comprovante
  });
  // O recebimento do boleto liquida o faturado que já existia: não é receita nova.
  return L.criar("recebimentos", {
    data: pagamento.data, forma: "BOLETO", valorBruto: pagamento.valor, pagador: b.empresaNome || "",
    descricao: "Baixa do boleto " + (b.documento || ""), boletoId: boletoId, recebidoEm: pagamento.data,
    liquidaFaturado: true
  });
};

// ---------------------------------------------------------------- empresas

/** Hospedagens da empresa no mês (pela data de saída) e o saldo a faturar. */
H.consolidarEmpresa = function (empresaId, competencia) {
  var e = L.buscarPorId("empresas", empresaId);
  if (!e) return null;
  var chaves = [e.id, e.razaoSocial, e.nomeFantasia, e.cnpj].filter(Boolean).map(function (s) { return String(s).toLowerCase(); });
  var hs = L.estado.hospedagens.filter(function (h) {
    return h.empresa && chaves.indexOf(String(h.empresa).toLowerCase()) !== -1 && H.noMes(h.checkoutRealizado || h.checkout, competencia);
  }).map(function (h) { return Object.assign({ hospedagem: h }, H.valoresHospedagem(h)); });
  var total = hs.reduce(function (a, x) { return a + x.total; }, 0);
  var jaPago = hs.reduce(function (a, x) { return a + x.pago; }, 0);
  var notas = L.estado.notasFiscais.filter(function (n) { return n.empresaId === empresaId && n.competencia === competencia && n.status !== "CANCELADA"; });
  var jaFaturado = notas.reduce(function (a, n) { return a + n.valor; }, 0);
  return { empresa: e, competencia: competencia, hospedagens: hs, total: total, jaPagoNaHospedagem: jaPago,
    jaFaturado: jaFaturado, saldoAFaturar: Math.max(0, total - jaPago - jaFaturado), notas: notas };
};

// ---------------------------------------------------------------- contas recorrentes

/**
 * Gera as PREVISÕES do mês para cada conta recorrente — nunca pagamento.
 * Idempotente: rodar de novo não duplica (chave recorrenciaId + competência).
 */
H.gerarRecorrentes = function (competencia) {
  var criadas = [];
  var dias = H.diasDoMes(competencia);
  L.estado.contasRecorrentes.filter(function (r) { return r.ativa !== false; }).forEach(function (r) {
    if (r.inicio && competencia < r.inicio.slice(0, 7)) return;
    if (r.fim && competencia > r.fim.slice(0, 7)) return;
    var datas = [];
    if (r.periodicidade === "SEMANAL") {
      for (var d = 1; d <= dias; d++) {
        var iso = competencia + "-" + String(d).padStart(2, "0");
        if (new Date(iso + "T12:00:00Z").getUTCDay() === (r.diaSemana || 1)) datas.push(iso);
      }
    } else if (r.periodicidade === "ANUAL") {
      if (Number(competencia.slice(5, 7)) === (r.mes || 1)) datas.push(competencia + "-" + String(Math.min(r.dia || 1, dias)).padStart(2, "0"));
    } else if (r.periodicidade === "PERSONALIZADA") {
      var meses = (Number(competencia.slice(0, 4)) * 12 + Number(competencia.slice(5, 7))) - (Number((r.inicio || competencia).slice(0, 4)) * 12 + Number((r.inicio || competencia).slice(5, 7)));
      if (meses % (r.aCadaMeses || 1) === 0) datas.push(competencia + "-" + String(Math.min(r.dia || 1, dias)).padStart(2, "0"));
    } else {
      datas.push(competencia + "-" + String(Math.min(r.dia || 1, dias)).padStart(2, "0"));
    }
    datas.forEach(function (venc) {
      var ja = L.estado.contas.some(function (c) { return c.recorrenciaId === r.id && c.vencimento === venc; });
      if (ja) return;
      criadas.push(L.criar("contas", {
        descricao: r.descricao, categoria: r.categoria || "Despesas fixas", fornecedorId: r.fornecedorId || "",
        valor: r.valorPrevisto, valorPrevisto: r.valorPrevisto, competencia: competencia, vencimento: venc,
        status: "RASCUNHO", recorrenciaId: r.id, tipoConta: r.tipoConta || "FIXA", previsao: true
      }));
    });
  });
  return criadas;
};

/** Em que marco de alerta a conta está hoje (7, 3, 1, 0 dias ou vencida). Um por marco. */
H.marcoAlerta = function (vencimento, hoje) {
  var d = H.diasEntre(hoje, vencimento);
  if (d < 0) return "VENCIDA";
  var marcos = L.estado.configHotel.alertasVencimentoDias || [7, 3, 1, 0];
  return marcos.indexOf(d) !== -1 ? "D-" + d : null;
};

// ---------------------------------------------------------------- fluxo de caixa

/**
 * Realizado: só o que foi efetivamente recebido/pago (com data efetiva).
 * Previsto: recebimentos ainda a receber e contas em aberto pela data
 * esperada. Conta a receber NUNCA entra no saldo realizado.
 */
H.fluxoCaixa = function (inicio, fim, saldoInicial) {
  var dias = [];
  for (var d = inicio; d <= fim; d = H.addDias(d, 1)) dias.push(d);
  var real = saldoInicial || 0, proj = saldoInicial || 0;
  var linhas = dias.map(function (dia) {
    var entR = L.estado.recebimentos.filter(function (r) {
      var sit = H.situacaoRecebimento(r);
      return r.tipo !== "SAIDA_CAIXA" && (sit === "RECEBIDO" || sit === "CONCILIADO") && (r.recebidoEm || r.conciliadoEm || r.data) === dia;
    }).reduce(function (a, r) { return a + H.liquido(r); }, 0);
    var entP = L.estado.recebimentos.filter(function (r) {
      return r.tipo !== "SAIDA_CAIXA" && H.situacaoRecebimento(r) === "A_RECEBER" && (r.previstoPara || r.data) === dia;
    }).reduce(function (a, r) { return a + H.liquido(r); }, 0)
      + L.estado.boletos.filter(function (b) { return b.status !== "CANCELADO" && b.vencimento === dia; })
        .reduce(function (a, b) { return a + H.saldoBoleto(b); }, 0);
    var saiR = L.estado.contas.filter(function (c) { return c.status === "PAGO" && (c.dataPagamento || c.pagoEm || "").slice(0, 10) === dia; })
      .reduce(function (a, c) { return a + (c.valorPago || c.valor); }, 0)
      + L.estado.recebimentos.filter(function (r) { return r.tipo === "SAIDA_CAIXA" && r.data === dia && r.status !== "CANCELADO"; })
        .reduce(function (a, r) { return a + (r.valorBruto || 0); }, 0);
    var saiP = L.estado.contas.filter(function (c) { return c.status !== "PAGO" && c.status !== "CANCELADO" && c.vencimento === dia; })
      .reduce(function (a, c) { return a + c.valor; }, 0);
    real += entR - saiR;
    proj += entR - saiR + entP - saiP;
    return { data: dia, entradas: entR, saidas: saiR, recebimentosPrevistos: entP, pagamentosPrevistos: saiP, saldoRealizado: real, saldoProjetado: proj, insuficiente: proj < 0 };
  });
  return { linhas: linhas, saldoFinalRealizado: real, saldoFinalProjetado: proj, diasInsuficientes: linhas.filter(function (l) { return l.insuficiente; }).map(function (l) { return l.data; }) };
};

// ---------------------------------------------------------------- ponto e diárias

function minutos(hhmm) {
  if (!hhmm) return null;
  var p = String(hhmm).split(":").map(Number);
  return p[0] * 60 + (p[1] || 0);
}
/** Horas trabalhadas = (saída − entrada) − (fim − início do intervalo). Vira a noite se preciso. */
H.minutosTrabalhados = function (m) {
  var e = minutos(m.entrada), s = minutos(m.saida);
  if (e == null || s == null) return 0;
  if (s < e) s += 24 * 60;
  var intervalo = 0;
  var ii = minutos(m.inicioIntervalo), fi = minutos(m.fimIntervalo);
  if (ii != null && fi != null) { if (fi < ii) fi += 24 * 60; intervalo = fi - ii; }
  return Math.max(0, s - e - intervalo);
};
/** A marcação vale com o ajuste aprovado mais recente; a original nunca é alterada. */
H.marcacaoEfetiva = function (m) {
  var ajustes = L.estado.ajustesPonto.filter(function (a) { return a.marcacaoId === m.id && a.status === "APROVADO"; })
    .sort(function (a, b) { return String(b.aprovadoEm).localeCompare(String(a.aprovadoEm)); });
  return ajustes.length ? Object.assign({}, m, ajustes[0].novos) : m;
};
H.diaDePonto = function (m, jornadaMin) {
  var ef = H.marcacaoEfetiva(m);
  var trab = H.minutosTrabalhados(ef);
  var falta = ef.falta ? jornadaMin : 0;
  var dif = ef.falta ? -jornadaMin : trab - jornadaMin;
  return { trabalhados: trab, previstos: jornadaMin, diferenca: dif, extras: Math.max(0, dif), atraso: dif < 0 && !ef.falta ? -dif : 0, falta: falta, ajustado: ef !== m };
};

/**
 * Saldo final = saldo inicial + créditos válidos − horas compensadas − ajustes de débito.
 * Hora extra marcada para PAGAMENTO não entra no banco (não conta duas vezes).
 */
H.bancoDeHoras = function (dados) {
  var creditos = (dados.creditos || []).filter(function (c) { return c.destino !== "PAGAMENTO" && c.aprovado !== false; })
    .reduce(function (a, c) { return a + c.minutos; }, 0);
  var compensadas = (dados.compensacoes || []).reduce(function (a, c) { return a + c.minutos; }, 0);
  var debitos = (dados.debitos || []).reduce(function (a, c) { return a + c.minutos; }, 0);
  return { saldoInicial: dados.saldoInicial || 0, creditos: creditos, compensadas: compensadas, debitos: debitos,
    saldoFinal: (dados.saldoInicial || 0) + creditos - compensadas - debitos,
    pagaveis: (dados.creditos || []).filter(function (c) { return c.destino === "PAGAMENTO"; }).reduce(function (a, c) { return a + c.minutos; }, 0) };
};

/** Valor base = diárias válidas × valor contratado; pendente = base + ajustes − adiantamentos − pagos. */
H.fechamentoDiarias = function (funcionarioId, competencia) {
  var ds = L.estado.diarias.filter(function (d) { return d.funcionarioId === funcionarioId && H.noMes(d.data, competencia) && d.status !== "CANCELADA"; });
  var qtd = ds.reduce(function (a, d) { return a + (d.quantidade || 1); }, 0);
  var base = ds.reduce(function (a, d) { return a + (d.quantidade || 1) * (d.valorUnitario || 0); }, 0);
  var ajustes = ds.reduce(function (a, d) { return a + (d.ajuste || 0); }, 0);
  var adiant = ds.reduce(function (a, d) { return a + (d.adiantamento || 0); }, 0);
  var pagos = ds.reduce(function (a, d) { return a + (d.pago || 0); }, 0);
  return { quantidade: qtd, base: base, ajustes: ajustes, adiantamentos: adiant, pagos: pagos,
    pendente: Math.max(0, base + ajustes - adiant - pagos), dias: ds };
};

// ---------------------------------------------------------------- fechamento mensal

H.STATUS_FECHAMENTO_MES = ["ABERTO", "EM_CONFERENCIA", "COM_PENDENCIAS", "AGUARDANDO_APROVACAO", "APROVADO", "FECHADO"];

/** Pendências que impedem submeter o mês à Direção. */
H.pendenciasDoMes = function (competencia, hoje) {
  var p = [];
  var dias = H.diasDoMes(competencia);
  var ultimo = competencia + "-" + String(dias).padStart(2, "0");
  var limite = ultimo < hoje ? ultimo : H.addDias(hoje, -1);
  for (var d = competencia + "-01"; d <= limite; d = H.addDias(d, 1)) {
    var temMov = L.estado.recebimentos.some(function (r) { return r.data === d; });
    var f = L.estado.fechamentosCaixa.find(function (x) { return x.data === d; });
    if (temMov && (!f || f.status !== "FECHADO")) p.push({ tipo: "caixa", texto: "Caixa de " + d.split("-").reverse().join("/") + " não fechado." });
  }
  L.estado.transacoesCartao.filter(function (t) { return H.noMes(t.dataVenda, competencia); }).forEach(function (t) {
    var c = H.conciliarCartao(t, hoje);
    if (c.status === "DIVERGENTE" || c.status === "ATRASADO") p.push({ tipo: "cartao", texto: "Cartão " + (t.codigoTransacao || "") + ": " + c.status.toLowerCase() + "." });
  });
  H.frigobarNaoCobrado(competencia).forEach(function (c) { p.push({ tipo: "frigobar", texto: "Frigobar apto " + c.apartamento + " (" + c.data + ") sem cobrança." }); });
  L.estado.boletos.filter(function (b) { return H.statusBoleto(b, hoje) === "VENCIDO"; }).forEach(function (b) {
    p.push({ tipo: "boleto", texto: "Boleto " + (b.documento || "") + " vencido (" + (b.empresaNome || "") + ")." });
  });
  return p;
};

// ---------------------------------------------------------------- exportação

/** CSV pronto para abrir no Excel (separador `;`, BOM, centavos → reais com vírgula). */
H.paraCsv = function (cabecalho, linhas) {
  var esc = function (v) {
    if (v == null) return "";
    var s = String(v);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return "﻿" + [cabecalho].concat(linhas).map(function (l) { return l.map(esc).join(";"); }).join("\r\n");
};
H.reaisCsv = function (c) { return c == null ? "" : (c / 100).toFixed(2).replace(".", ","); };

// ---------------------------------------------------------------- invariantes e auditoria

Object.assign(L.INVARIANTES, {
  hospedagens: function (h) {
    var p = [];
    if (!h.apartamento) p.push("Informe o apartamento.");
    if (!H.dataValida(h.checkin) || !H.dataValida(h.checkout)) p.push("Informe check-in e check-out.");
    else if (h.checkout < h.checkin) p.push("O check-out não pode ser antes do check-in.");
    return p;
  },
  recebimentos: function (r) {
    var p = [];
    if (!(r.valorBruto > 0)) p.push("O valor precisa ser maior que zero.");
    if (!H.dataValida(r.data)) p.push("Informe a data da operação.");
    if (r.tipo !== "SAIDA_CAIXA" && !H.FORMAS[r.forma]) p.push("Forma de pagamento inválida.");
    if ((r.desconto || 0) + (r.taxa || 0) > (r.valorBruto || 0)) p.push("Desconto + taxa maiores que o valor bruto.");
    return p;
  },
  frigobarConsumos: function (c) {
    var p = [];
    if (!(c.quantidade > 0)) p.push("Quantidade deve ser maior que zero.");
    if (!c.apartamento) p.push("Informe o apartamento.");
    if (!H.dataValida(c.data)) p.push("Informe a data.");
    return p;
  },
  enxovalMovimentos: function (m) { return H.validarMovEnxoval(m); },
  boletos: function (b) {
    var p = [];
    if (!(b.valor > 0)) p.push("O valor do boleto precisa ser maior que zero.");
    if (!H.dataValida(b.vencimento)) p.push("Informe o vencimento.");
    return p;
  },
  transacoesCartao: function (t) {
    var p = [];
    if (!(t.valorVenda > 0)) p.push("Informe o valor da venda.");
    if (!H.dataValida(t.dataVenda)) p.push("Informe a data da venda.");
    return p;
  },
  diarias: function (d) {
    var p = [];
    if (!d.funcionarioId) p.push("Escolha o colaborador.");
    if (!(d.valorUnitario > 0)) p.push("Informe o valor da diária.");
    if (!H.dataValida(d.data)) p.push("Informe a data trabalhada.");
    return p;
  }
});

// Correção em dado financeiro preserva o valor anterior: a trilha passa a
// guardar, campo a campo, o que era e o que ficou. Embrulha `L.atualizar`
// uma vez só, para todas as coleções.
(function () {
  var original = L.atualizar;
  L.atualizar = function (colecao, id, mudancas) {
    var alvo = (L.estado[colecao] || []).find(function (r) { return r.id === id; });
    var antes = {};
    if (alvo) Object.keys(mudancas).forEach(function (k) {
      if (k !== "justificativa" && JSON.stringify(alvo[k]) !== JSON.stringify(mudancas[k])) antes[k] = alvo[k] === undefined ? null : alvo[k];
    });
    if (alvo && L.INVARIANTES[colecao]) {
      var problemas = L.INVARIANTES[colecao](Object.assign({}, alvo, mudancas));
      if (problemas.length) throw new Error(problemas.join(" "));
    }
    var r = original.apply(this, arguments);
    var ultima = L.estado.auditoria[0];
    if (r && ultima && ultima.entidade === colecao) {
      ultima.antes = antes;
      ultima.depois = Object.keys(antes).reduce(function (o, k) { o[k] = mudancas[k]; return o; }, {});
      if (mudancas.justificativa) ultima.justificativa = mudancas.justificativa;
    }
    return r;
  };
})();
