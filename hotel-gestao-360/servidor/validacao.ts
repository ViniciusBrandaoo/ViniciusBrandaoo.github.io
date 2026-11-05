/**
 * Validação de entrada das rotas de cadastro simples (contas, fornecedores,
 * contratos, ausências, banco de horas, solicitações...).
 *
 * Objetivo: quem digita recebe, na hora, uma frase que diz o que corrigir —
 * em vez de um erro de banco traduzido de forma genérica ("Algum valor
 * informado não é permitido") ou um 500. Aqui só se barra o que o banco
 * recusaria de qualquer jeito (ou que não faz sentido em nenhum uso).
 */

export function erroDeEntrada(mensagem: string, statusCode = 422): Error & { statusCode: number } {
  return Object.assign(new Error(mensagem), { statusCode });
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const vazio = (v: unknown) => v === undefined || v === null;

/** Texto obrigatório (não pode ser só espaços) ou opcional, com limite de tamanho. */
export function texto(v: unknown, rotulo: string, opc: { obrigatorio?: boolean; max?: number } = {}): string | undefined {
  if (vazio(v) || v === "") {
    if (opc.obrigatorio) throw erroDeEntrada(`Informe ${rotulo}.`, 400);
    return undefined;
  }
  if (typeof v !== "string") throw erroDeEntrada(`${cap(rotulo)} ${precisa(rotulo)} ser um texto.`, 400);
  const t = v.trim();
  if (!t) {
    if (opc.obrigatorio) throw erroDeEntrada(`Informe ${rotulo} (não pode ficar só com espaços).`, 400);
    return undefined;
  }
  const max = opc.max ?? 500;
  if (t.length > max) throw erroDeEntrada(`${cap(rotulo)} está muito longo (máximo ${max} caracteres).`, 422);
  return t;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "precisa" / "precisam" conforme o rótulo seja plural ("as horas"). */
function precisa(rotulo: string): string {
  return /^(as|os) /.test(rotulo) ? "precisam" : "precisa";
}

/** Número inteiro (centavos, minutos, dias) dentro de uma faixa. */
export function inteiro(
  v: unknown,
  rotulo: string,
  opc: { min?: number; max?: number; obrigatorio?: boolean; dica?: string } = {},
): number | undefined {
  if (vazio(v) || v === "") {
    if (opc.obrigatorio) throw erroDeEntrada(`Informe ${rotulo}.`, 400);
    return undefined;
  }
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw erroDeEntrada(`${cap(rotulo)} ${precisa(rotulo)} ser um número${opc.dica ? ` (${opc.dica})` : ""}.`, 422);
  }
  if (!Number.isInteger(v)) {
    throw erroDeEntrada(`${cap(rotulo)} ${precisa(rotulo)} ser um número inteiro${opc.dica ? ` (${opc.dica})` : ""}.`, 422);
  }
  if (opc.min !== undefined && v < opc.min) {
    throw erroDeEntrada(
      opc.min === 0 ? `${cap(rotulo)} não pode ser negativo.`
        : opc.min === 1 ? `${cap(rotulo)} ${precisa(rotulo)} ser maior que zero.`
        : `${cap(rotulo)} ${precisa(rotulo)} ser no mínimo ${opc.min}.`,
    );
  }
  if (opc.max !== undefined && v > opc.max) {
    throw erroDeEntrada(`${cap(rotulo)} está acima do limite aceito (${opc.max}). Confira se não digitou a mais.`);
  }
  return v;
}

/** Data AAAA-MM-DD que existe no calendário. */
export function dataIso(v: unknown, rotulo: string, opc: { obrigatorio?: boolean } = {}): string | undefined {
  if (vazio(v) || v === "") {
    if (opc.obrigatorio) throw erroDeEntrada(`Informe ${rotulo}.`, 400);
    return undefined;
  }
  const m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
  if (!m) throw erroDeEntrada(`${cap(rotulo)} ${precisa(rotulo)} ser uma data no formato AAAA-MM-DD.`);
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  if (d.getUTCFullYear() !== +m[1]! || d.getUTCMonth() !== +m[2]! - 1 || d.getUTCDate() !== +m[3]!) {
    throw erroDeEntrada(`${cap(rotulo)} (${v}) não existe no calendário. Confira dia e mês.`);
  }
  if (+m[1]! < 1990 || +m[1]! > 2100) throw erroDeEntrada(`${cap(rotulo)} (${v}) está fora do intervalo aceito (1990 a 2100). Confira o ano.`);
  return v as string;
}

/** Competência AAAA-MM com mês de 01 a 12. */
export function competenciaIso(v: unknown, rotulo = "a competência", opc: { obrigatorio?: boolean } = {}): string | undefined {
  if (vazio(v) || v === "") {
    if (opc.obrigatorio) throw erroDeEntrada(`Informe ${rotulo}.`, 400);
    return undefined;
  }
  const m = typeof v === "string" ? /^(\d{4})-(\d{2})$/.exec(v) : null;
  if (!m || +m[2]! < 1 || +m[2]! > 12 || +m[1]! < 1990 || +m[1]! > 2100) {
    throw erroDeEntrada(`${cap(rotulo)} ${precisa(rotulo)} estar no formato AAAA-MM, com mês de 01 a 12 (por exemplo, 2026-10).`);
  }
  return v as string;
}

/** Um valor dentre uma lista fechada. */
export function umDe<T extends string>(v: unknown, rotulo: string, permitidos: readonly T[], opc: { obrigatorio?: boolean } = {}): T | undefined {
  if (vazio(v) || v === "") {
    if (opc.obrigatorio) throw erroDeEntrada(`Informe ${rotulo}.`, 400);
    return undefined;
  }
  if (typeof v !== "string" || !permitidos.includes(v as T)) {
    throw erroDeEntrada(`Valor não aceito para ${rotulo.replace(/^(o|a|os|as) /, "")}. Opções: ${permitidos.join(", ")}.`);
  }
  return v as T;
}

export function uuid(v: unknown, rotulo: string, opc: { obrigatorio?: boolean } = {}): string | undefined {
  if (vazio(v) || v === "") {
    if (opc.obrigatorio) throw erroDeEntrada(`Informe ${rotulo}.`, 400);
    return undefined;
  }
  if (typeof v !== "string" || !UUID_RE.test(v)) {
    throw erroDeEntrada(`${cap(rotulo)} não foi encontrado(a). Atualize a tela e escolha de novo.`, 404);
  }
  return v;
}

/** Confere os dois dígitos verificadores de um CNPJ (14 números). Rejeita sequências repetidas (11111111111111). */
export function cnpjValido(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (base: string) => {
    let soma = 0, peso = base.length - 7;
    for (const ch of base) { soma += +ch * peso; peso = peso === 2 ? 9 : peso - 1; }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(d.slice(0, 12));
  return d1 === +d[12]! && dv(d.slice(0, 12) + d1) === +d[13]!;
}

/** Só dígitos de um CPF/CNPJ, conferindo o tamanho; o CNPJ também tem os dígitos verificadores conferidos. */
export function documento(v: unknown, tipo: "CPF" | "CNPJ", rotulo: string): string {
  if (typeof v !== "string") throw erroDeEntrada(`${cap(rotulo)} precisa ser um texto com os números do ${tipo}.`, 400);
  const d = v.replace(/\D/g, "");
  const esperado = tipo === "CPF" ? 11 : 14;
  if (d.length !== esperado) {
    throw erroDeEntrada(`${cap(rotulo)} deve ter ${esperado} números (${tipo}); foram informados ${d.length}. Confira e tente de novo.`);
  }
  if (tipo === "CNPJ" && !cnpjValido(d)) {
    throw erroDeEntrada(`${cap(rotulo)} não é um CNPJ válido: confira os números (os dois últimos dígitos não batem).`);
  }
  return v;
}

export function email(v: unknown): string | undefined {
  const t = texto(v, "o e-mail", { max: 200 });
  if (t && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) throw erroDeEntrada("E-mail inválido. Use o formato nome@empresa.com.");
  return t;
}

/** O corpo precisa ser um objeto JSON (não lista, texto ou número). */
export function corpoObjeto(b: unknown): Record<string, unknown> {
  if (b === undefined || b === null) return {};
  if (typeof b !== "object" || Array.isArray(b)) {
    throw erroDeEntrada("Os dados enviados estão em formato inválido. Recarregue a tela e tente de novo.", 400);
  }
  return b as Record<string, unknown>;
}

// ---------------------------------------------------------------- listas fechadas (espelham os CHECKs do banco)

export const STATUS_CONTA = ["RASCUNHO", "AGUARDANDO_APROVACAO", "APROVADO", "AGENDADO", "PAGO", "VENCIDO", "CANCELADO"] as const;
export const FORMAS_PAGAMENTO = ["BOLETO", "PIX", "TRANSFERENCIA", "CARTAO", "DINHEIRO", "DEBITO_AUTOMATICO"] as const;
export const TIPOS_CONTRATO = ["FORNECEDOR", "PRESTADOR", "SOFTWARE", "MANUTENCAO", "LOCACAO", "SERVICO", "OUTRO"] as const;
export const PERIODICIDADES = ["UNICA", "MENSAL", "BIMESTRAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"] as const;
export const STATUS_CONTRATO = ["RASCUNHO", "ATIVO", "EM_RENOVACAO", "ENCERRADO", "CANCELADO"] as const;
export const TIPOS_AUSENCIA = [
  "FERIAS", "ATESTADO", "LICENCA_MATERNIDADE", "LICENCA_PATERNIDADE", "LICENCA_NAO_REMUNERADA",
  "AFASTAMENTO_INSS", "FOLGA", "FALTA_JUSTIFICADA", "SUSPENSAO", "OUTRO",
] as const;
export const ORIGENS_BANCO = ["PONTO", "AJUSTE_MANUAL", "COMPENSACAO", "PAGAMENTO_EM_FOLHA", "EXPIRACAO"] as const;
export const TIPOS_SOLICITACAO = [
  "COMPRA", "PAGAMENTO", "REEMBOLSO", "HORA_EXTRA", "AJUSTE_PONTO", "AJUSTE_BANCO_HORAS",
  "MATERIAL", "MANUTENCAO", "TECNOLOGIA", "CONTRATACAO", "FERIAS", "OUTRO",
] as const;
export const URGENCIAS = ["BAIXA", "NORMAL", "ALTA", "CRITICA"] as const;
export const PERFIS_SOLICITACAO = ["DIRECAO", "FINANCEIRO", "RH", "ADMINISTRATIVO", "COORDENACAO", "GESTOR", "SECRETARIA", "CONSULTA"] as const;

/** Maior valor aceito em centavos para uma linha avulsa: R$ 100 milhões — acima disso é erro de digitação. */
export const MAX_CENTAVOS = 10_000_000_000;

// ---------------------------------------------------------------- por tela

export function validarConta(b: unknown, parcial: boolean): Record<string, unknown> {
  const d = corpoObjeto(b);
  const o: Record<string, unknown> = {};
  const req = !parcial;
  const set = (k: string, v: unknown) => { if (v !== undefined) o[k] = v; };
  set("descricao", texto(d.descricao, "a descrição da conta", { obrigatorio: req || d.descricao !== undefined, max: 200 }));
  set("categoria", texto(d.categoria, "a categoria", { obrigatorio: req, max: 80 }));
  set("fornecedorId", uuid(d.fornecedorId, "o fornecedor"));
  const valor = inteiro(d.valorCentavos, "o valor da conta", { min: 1, max: MAX_CENTAVOS, obrigatorio: req, dica: "em centavos" });
  if (d.valorCentavos === 0) throw erroDeEntrada("O valor da conta precisa ser maior que zero.");
  set("valorCentavos", valor);
  set("competencia", competenciaIso(d.competencia, "a competência", { obrigatorio: req }));
  set("vencimento", dataIso(d.vencimento, "o vencimento", { obrigatorio: req }));
  set("numeroDocumento", texto(d.numeroDocumento, "o número do documento", { max: 60 }));
  set("formaPagamento", umDe(d.formaPagamento, "a forma de pagamento", FORMAS_PAGAMENTO));
  set("status", umDe(d.status, "o status", STATUS_CONTA));
  set("observacoes", texto(d.observacoes, "as observações", { max: 2000 }));
  // Campos que o formulário envia vazios para "limpar": preserva o vazio.
  for (const k of ["fornecedorId", "numeroDocumento", "formaPagamento", "observacoes"]) {
    if (parcial && (d[k] === "" || d[k] === null)) o[k] = "";
  }
  return o;
}

export function validarFornecedor(b: unknown, parcial: boolean): Record<string, unknown> {
  const d = corpoObjeto(b);
  const o: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => { if (v !== undefined) o[k] = v; };
  set("razaoSocial", texto(d.razaoSocial, "a razão social", { obrigatorio: !parcial || d.razaoSocial !== undefined, max: 200 }));
  set("nomeFantasia", texto(d.nomeFantasia, "o nome fantasia", { max: 200 }));
  set("tipoDocumento", umDe(d.tipoDocumento, "o tipo de documento", ["CNPJ", "CPF"] as const, { obrigatorio: !parcial }));
  if (!parcial || d.documento !== undefined) {
    const tipo = (o.tipoDocumento as "CNPJ" | "CPF" | undefined) ?? (typeof d.documento === "string" && d.documento.replace(/\D/g, "").length === 11 ? "CPF" : "CNPJ");
    set("documento", documento(d.documento, tipo, "o documento"));
  }
  set("categoria", texto(d.categoria, "a categoria", { max: 80 }));
  set("contatoNome", texto(d.contatoNome, "o nome do contato", { max: 120 }));
  set("telefone", texto(d.telefone, "o telefone", { max: 40 }));
  set("email", email(d.email));
  if (parcial) for (const k of ["nomeFantasia", "categoria", "contatoNome", "telefone", "email"]) {
    if (d[k] === "" || d[k] === null) o[k] = "";
  }
  return o;
}

export function validarContrato(b: unknown, parcial: boolean): Record<string, unknown> {
  const d = corpoObjeto(b);
  const o: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => { if (v !== undefined) o[k] = v; };
  set("objeto", texto(d.objeto, "o objeto do contrato", { obrigatorio: !parcial || d.objeto !== undefined, max: 200 }));
  set("tipo", umDe(d.tipo, "o tipo de contrato", TIPOS_CONTRATO));
  set("fornecedorId", uuid(d.fornecedorId, "o fornecedor"));
  set("dataInicio", dataIso(d.dataInicio, "a data de início", { obrigatorio: !parcial }));
  set("dataFim", dataIso(d.dataFim, "a data de término"));
  set("valorCentavos", inteiro(d.valorCentavos, "o valor", { min: 0, max: MAX_CENTAVOS, obrigatorio: !parcial, dica: "em centavos" }));
  set("periodicidade", umDe(d.periodicidade, "a periodicidade", PERIODICIDADES));
  set("status", umDe(d.status, "o status", STATUS_CONTRATO));
  set("observacoes", texto(d.observacoes, "as observações", { max: 2000 }));
  if (o.dataInicio && o.dataFim && (o.dataFim as string) < (o.dataInicio as string)) {
    throw erroDeEntrada("A data de término não pode ser anterior à data de início.");
  }
  if (parcial) for (const k of ["dataFim", "fornecedorId", "observacoes"]) {
    if (d[k] === "" || d[k] === null) o[k] = "";
  }
  return o;
}

export function validarAusencia(b: unknown): { funcionarioId: string; tipo?: string | undefined; inicio: string; fim: string; observacoes?: string | undefined } {
  const d = corpoObjeto(b);
  const inicio = dataIso(d.inicio, "a data de início", { obrigatorio: true })!;
  const fim = dataIso(d.fim, "a data de fim", { obrigatorio: true })!;
  if (fim < inicio) throw erroDeEntrada("A data de fim não pode ser anterior à data de início.");
  const dias = (Date.parse(fim) - Date.parse(inicio)) / 86400000 + 1;
  if (dias > 366) throw erroDeEntrada(`O período tem ${dias} dias — mais de um ano. Confira as datas.`);
  return {
    funcionarioId: uuid(d.funcionarioId, "o funcionário", { obrigatorio: true })!,
    tipo: umDe(d.tipo, "o tipo de ausência", TIPOS_AUSENCIA),
    inicio, fim,
    observacoes: texto(d.observacoes, "as observações", { max: 2000 }),
  };
}

/** Banco de horas: o lançamento não se apaga, então o que entra precisa estar certo. */
export function validarLancamentoBanco(b: unknown): { funcionarioId: string; dia: string; minutos: number; origem?: string | undefined; justificativa?: string | undefined } {
  const d = corpoObjeto(b);
  const minutos = inteiro(d.minutos, "as horas", { obrigatorio: true, dica: "em minutos" })!;
  if (minutos === 0) throw erroDeEntrada("Informe as horas (diferente de zero). Use sinal de menos para débito.", 400);
  if (Math.abs(minutos) > 24 * 60 * 31) {
    throw erroDeEntrada(`Esse lançamento é de ${Math.round(Math.abs(minutos) / 60)} horas — mais do que cabe num mês. Confira o valor digitado.`);
  }
  const dia = dataIso(d.dia, "a data", { obrigatorio: true })!;
  const amanha = new Date(Date.now() + 36 * 3600_000).toISOString().slice(0, 10);
  if (dia > amanha) throw erroDeEntrada(`A data (${dia}) está no futuro: o banco de horas só registra o que já aconteceu.`);
  const origem = umDe(d.origem, "a origem", ORIGENS_BANCO);
  const justificativa = texto(d.justificativa, "a justificativa", { max: 1000 });
  if ((origem ?? "AJUSTE_MANUAL") === "AJUSTE_MANUAL" && !justificativa) {
    throw erroDeEntrada("Informe a justificativa: um ajuste manual de banco de horas não pode ser feito sem ela (o lançamento não se apaga depois).", 400);
  }
  return {
    funcionarioId: uuid(d.funcionarioId, "o funcionário", { obrigatorio: true })!,
    dia,
    minutos, origem, justificativa,
  };
}

export function validarSolicitacao(b: unknown): {
  tipo: string; titulo: string; justificativa: string; valorCentavos?: number | undefined; urgencia?: string | undefined; fornecedorId?: string | undefined;
} {
  const d = corpoObjeto(b);
  return {
    tipo: umDe(d.tipo, "o tipo da solicitação", TIPOS_SOLICITACAO, { obrigatorio: true })!,
    titulo: texto(d.titulo, "o título", { obrigatorio: true, max: 200 })!,
    justificativa: texto(d.justificativa, "a justificativa", { obrigatorio: true, max: 3000 })!,
    valorCentavos: inteiro(d.valorCentavos, "o valor", { min: 0, max: MAX_CENTAVOS, dica: "em centavos" }),
    urgencia: umDe(d.urgencia, "a urgência", URGENCIAS),
    fornecedorId: uuid(d.fornecedorId, "o fornecedor"),
  };
}

/** Ano do 13º: quatro dígitos plausíveis. */
export function validarAno(v: string): string {
  if (!/^\d{4}$/.test(v) || +v < 2000 || +v > 2100) throw erroDeEntrada(`Ano inválido (${v.slice(0, 20)}). Use quatro dígitos, por exemplo 2026.`, 400);
  return v;
}

const BOOLEANOS_FUNC = ["temTicket", "temMei", "ticketSoma"];
const TEXTOS_FUNC: Array<[string, string, number]> = [
  ["nome", "o nome", 150], ["cpf", "o CPF", 20], ["matricula", "a matrícula", 30], ["cargo", "o cargo", 120],
  ["departamento", "o setor", 120], ["empresaCodigo", "a empresa", 10],
];
const CENTAVOS_FUNC = ["valorHoraAulaCentavos", "salarioBaseCentavos", "valorHoraCentavos", "valorTicketCentavos", "valorMeiCentavos"];
const NUMEROS_FUNC = ["dependentesIrrf", "aulasSemanais", "cargaHorariaSemanal", "horasSemanais"];

/**
 * Tipo e tamanho dos campos do cadastro de funcionário (CLT ou MEI). Só
 * rejeita o que não é texto/número/sim-não ou é absurdo — as regras de
 * negócio (regime, carga, CPF) continuam onde estavam.
 */
export function validarCamposFuncionario(b: unknown): void {
  const d = corpoObjeto(b);
  for (const [k, rotulo, max] of TEXTOS_FUNC) texto(d[k], rotulo, { max });
  for (const k of CENTAVOS_FUNC) inteiro(d[k], rotuloValor(k), { min: 0, max: MAX_CENTAVOS });
  for (const k of NUMEROS_FUNC) {
    const v = d[k];
    if (vazio(v)) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) throw erroDeEntrada(`${cap(rotuloNumero(k))} precisa ser um número.`, 422);
    if (v < 0) throw erroDeEntrada(`${cap(rotuloNumero(k))} não pode ser negativo.`);
    if (v > 100000) throw erroDeEntrada(`${cap(rotuloNumero(k))} está acima do limite aceito. Confira se não digitou a mais.`);
  }
  for (const k of BOOLEANOS_FUNC) {
    if (!vazio(d[k]) && typeof d[k] !== "boolean") throw erroDeEntrada(`O campo ${k === "temTicket" ? "Ticket" : k === "ticketSoma" ? "Ticket soma" : "MEI"} precisa ser sim ou não.`, 400);
  }
  if (d.dataAdmissao !== undefined && d.dataAdmissao !== null && typeof d.dataAdmissao !== "string") {
    throw erroDeEntrada("Data de admissão inválida. Use uma data que exista no calendário.");
  }
}

function rotuloValor(campo: string): string {
  const nomes: Record<string, string> = {
    valorHoraAulaCentavos: "o valor da hora-aula", salarioBaseCentavos: "o salário base", valorHoraCentavos: "o valor da hora",
    valorTicketCentavos: "o valor do Ticket", valorMeiCentavos: "o valor do MEI",
  };
  return nomes[campo] ?? "o valor";
}

function rotuloNumero(k: string): string {
  const nomes: Record<string, string> = {
    dependentesIrrf: "o número de dependentes", aulasSemanais: "as aulas por semana",
    cargaHorariaSemanal: "a carga horária semanal", horasSemanais: "as horas por semana",
  };
  return nomes[k] ?? k;
}
