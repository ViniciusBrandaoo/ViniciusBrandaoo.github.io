/**
 * Regras do servidor para gravar os registros do hotel (tabela hotel_registros).
 * Funções puras: o servidor chama antes de gravar e os testes chamam direto.
 */

export type Colecao =
  | "apartamentos" | "hospedagens" | "empresas" | "cafeAjustes"
  | "enxovalItens" | "enxovalMovimentos" | "frigobarProdutos" | "frigobarConsumos"
  | "recebimentos" | "fechamentosCaixa" | "transacoesCartao" | "boletos"
  | "notasFiscais" | "cobrancas" | "contasRecorrentes" | "contasBancarias"
  | "relatoriosDiarios" | "diarias" | "marcacoesPonto" | "ajustesPonto"
  | "fechamentosMes" | "config" | "pendencias" | "folhaMes";

interface RegraColecao {
  ler: readonly string[];
  gravar: readonly string[];
  /** Registro financeiro ou de fechamento: não se exclui, cancela-se. */
  semExclusao?: boolean;
}

const TODOS_OPERACAO = ["DIRECAO", "FINANCEIRO", "RECEPCAO", "GOVERNANCA", "AUDITOR"];
const FIN_LER = ["DIRECAO", "FINANCEIRO", "AUDITOR"];
const FIN_GRAVAR = ["DIRECAO", "FINANCEIRO"];
const RH_LER = ["DIRECAO", "RH", "AUDITOR"];
const RH_GRAVAR = ["DIRECAO", "RH"];

export const COLECOES: Record<Colecao, RegraColecao> = {
  apartamentos: { ler: TODOS_OPERACAO, gravar: ["DIRECAO", "FINANCEIRO", "RECEPCAO"] },
  hospedagens: { ler: TODOS_OPERACAO, gravar: ["DIRECAO", "FINANCEIRO", "RECEPCAO"], semExclusao: true },
  empresas: { ler: ["DIRECAO", "FINANCEIRO", "RECEPCAO", "AUDITOR"], gravar: FIN_GRAVAR },
  cafeAjustes: { ler: TODOS_OPERACAO, gravar: ["DIRECAO", "RECEPCAO", "GOVERNANCA"] },
  enxovalItens: { ler: TODOS_OPERACAO, gravar: ["DIRECAO", "GOVERNANCA"] },
  enxovalMovimentos: { ler: TODOS_OPERACAO, gravar: ["DIRECAO", "GOVERNANCA"], semExclusao: true },
  frigobarProdutos: { ler: TODOS_OPERACAO, gravar: ["DIRECAO", "FINANCEIRO", "GOVERNANCA"] },
  frigobarConsumos: { ler: TODOS_OPERACAO, gravar: ["DIRECAO", "FINANCEIRO", "RECEPCAO", "GOVERNANCA"], semExclusao: true },
  recebimentos: { ler: ["DIRECAO", "FINANCEIRO", "RECEPCAO", "AUDITOR"], gravar: ["DIRECAO", "FINANCEIRO", "RECEPCAO"], semExclusao: true },
  fechamentosCaixa: { ler: ["DIRECAO", "FINANCEIRO", "RECEPCAO", "AUDITOR"], gravar: ["DIRECAO", "FINANCEIRO", "RECEPCAO"], semExclusao: true },
  transacoesCartao: { ler: FIN_LER, gravar: FIN_GRAVAR, semExclusao: true },
  boletos: { ler: FIN_LER, gravar: FIN_GRAVAR, semExclusao: true },
  notasFiscais: { ler: FIN_LER, gravar: FIN_GRAVAR, semExclusao: true },
  cobrancas: { ler: FIN_LER, gravar: FIN_GRAVAR, semExclusao: true },
  contasRecorrentes: { ler: FIN_LER, gravar: FIN_GRAVAR },
  contasBancarias: { ler: FIN_LER, gravar: FIN_GRAVAR },
  relatoriosDiarios: { ler: ["DIRECAO", "FINANCEIRO", "RECEPCAO", "AUDITOR"], gravar: ["DIRECAO", "FINANCEIRO", "RECEPCAO"], semExclusao: true },
  diarias: { ler: RH_LER, gravar: RH_GRAVAR, semExclusao: true },
  marcacoesPonto: { ler: RH_LER, gravar: RH_GRAVAR, semExclusao: true },
  ajustesPonto: { ler: RH_LER, gravar: RH_GRAVAR, semExclusao: true },
  fechamentosMes: { ler: ["DIRECAO", "FINANCEIRO", "AUDITOR"], gravar: FIN_GRAVAR, semExclusao: true },
  config: { ler: [...TODOS_OPERACAO, "RH"], gravar: ["DIRECAO"] },
  pendencias: { ler: TODOS_OPERACAO, gravar: ["DIRECAO", "FINANCEIRO", "RECEPCAO"], semExclusao: true },
  folhaMes: { ler: RH_LER, gravar: RH_GRAVAR, semExclusao: true },
};

export function colecaoValida(c: string): c is Colecao {
  return Object.prototype.hasOwnProperty.call(COLECOES, c);
}

const tem = (perfis: readonly string[], lista: readonly string[]) => lista.some((p) => perfis.includes(p));
export const podeLer = (perfis: readonly string[], c: Colecao) => tem(perfis, COLECOES[c].ler);
export const podeGravar = (perfis: readonly string[], c: Colecao) => tem(perfis, COLECOES[c].gravar);

export const ID_REGISTRO = /^[A-Za-z0-9_-]{1,64}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
/** Campos de dinheiro (centavos): inteiros. */
const CAMPO_DINHEIRO = /^(valor|desconto|taxa|saldo|custo|preco|bruto|liquido|total|limite|juros|multa)/i;

export type Dados = Record<string, unknown>;

/** Erros de formato do registro. Lista vazia = aceitável. */
export function validarDados(colecao: Colecao, dados: unknown): string[] {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return ["Registro inválido."];
  const d = dados as Dados;
  const erros: string[] = [];
  const tamanho = JSON.stringify(d).length;
  if (tamanho > 200_000) erros.push("Registro grande demais.");
  for (const [k, v] of Object.entries(d)) {
    if (CAMPO_DINHEIRO.test(k) && typeof v === "number" && !Number.isInteger(v)) {
      erros.push(`O campo ${k} precisa estar em centavos (número inteiro).`);
    }
    if (CAMPO_DINHEIRO.test(k) && typeof v === "number" && !Number.isFinite(v)) erros.push(`O campo ${k} não é um número válido.`);
    if (/^(data|vencimento|checkin|checkout)/i.test(k) && typeof v === "string" && v !== "" && !DATA.test(v.slice(0, 10))) {
      erros.push(`Data inválida em ${k}.`);
    }
  }
  if (colecao === "recebimentos") {
    const bruto = Number(d.valorBruto ?? 0), desc = Number(d.desconto ?? 0), taxa = Number(d.taxa ?? 0);
    if (bruto < 0 || desc < 0 || taxa < 0) erros.push("Valor, desconto e taxa não podem ser negativos.");
  }
  if (colecao === "hospedagens") {
    const ci = d.checkin, co = d.checkout;
    if (typeof ci === "string" && typeof co === "string" && co < ci) erros.push("Check-out antes do check-in.");
  }
  if (colecao === "enxovalMovimentos" && d.quantidade !== undefined && !(Number(d.quantidade) > 0)) {
    erros.push("A quantidade do movimento precisa ser maior que zero.");
  }
  if (colecao === "frigobarConsumos" && d.quantidade !== undefined && !(Number(d.quantidade) > 0)) {
    erros.push("A quantidade consumida precisa ser maior que zero.");
  }
  return erros;
}

const ORDEM_RELATORIO = ["ELABORACAO", "CONFERIDO", "APROVADO", "FECHADO"];

/**
 * Travas de fechamento, conferidas no servidor (não só no botão da tela).
 * Devolve a mensagem de recusa, ou null se pode gravar.
 */
export function conferirTrava(colecao: Colecao, antes: Dados | null, depois: Dados, perfis: readonly string[]): string | null {
  const direcao = perfis.includes("DIRECAO");
  const aprovador = direcao || perfis.includes("FINANCEIRO");
  if (colecao === "fechamentosCaixa") {
    const de = antes?.status, para = depois.status;
    if (de === "FECHADO") {
      if (para !== "REABERTO") return "Caixa fechado não pode ser alterado. A Direção pode reabrir, com justificativa.";
      if (!direcao) return "Só a Direção reabre um caixa fechado.";
      if (!String(depois.justificativa ?? "").trim()) return "Informe a justificativa da reabertura.";
    }
    if (para === "FECHADO") {
      const dif = Number(depois.diferenca ?? 0);
      if (dif !== 0 && !String(depois.justificativa ?? "").trim()) return "Caixa com diferença só fecha com justificativa.";
      if (dif !== 0 && !aprovador) return "Caixa com diferença precisa ser fechado pela Direção ou pelo Financeiro.";
    }
  }
  if (colecao === "relatoriosDiarios") {
    const de = String(antes?.status ?? ""), para = String(depois.status ?? "");
    if (de === "FECHADO") {
      if (para !== "REABERTO") return "Relatório do dia fechado não pode ser alterado. A Direção pode reabrir, com justificativa.";
      if (!direcao) return "Só a Direção reabre um relatório fechado.";
      if (!String(depois.justificativa ?? "").trim()) return "Informe a justificativa da reabertura.";
    }
    if ((para === "APROVADO" || para === "FECHADO") && de !== para && !aprovador) {
      return "Aprovar e fechar é da Direção ou do Financeiro.";
    }
    const iDe = ORDEM_RELATORIO.indexOf(de), iPara = ORDEM_RELATORIO.indexOf(para);
    if (iPara >= 0 && iDe >= 0 && iPara > iDe + 1) return "O relatório avança uma etapa por vez.";
  }
  if (colecao === "fechamentosMes" && antes?.fechado && !direcao) {
    return "Mês fechado: só a Direção altera.";
  }
  return null;
}

/**
 * Para registro importado, o complemento guarda só o que difere do dado
 * original. Assim uma reimportação que muda outros campos continua valendo.
 */
export function complementoDe(base: Dados, dados: Dados): Dados {
  const out: Dados = {};
  for (const [k, v] of Object.entries(dados)) {
    if (k === "id") continue;
    if (JSON.stringify(base[k]) !== JSON.stringify(v)) out[k] = v;
  }
  return out;
}
