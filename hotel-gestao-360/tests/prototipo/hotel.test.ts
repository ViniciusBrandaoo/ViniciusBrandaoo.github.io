import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

// Dados 100% fictícios. Carrega o domínio de verdade (o mesmo do navegador).
const RAIZ = join(__dirname, "..", "..");
type Dom = any;
function carregar(): Dom {
  const p = join(RAIZ, "prototipo", "partes");
  const fonte = readFileSync(join(p, "dominio.js"), "utf8") + "\n" + readFileSync(join(p, "hotel-dominio.js"), "utf8");
  const globais = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
  return new Function("localStorage", `${fonte}\nreturn L;`)(globais.localStorage) as Dom;
}

let L: Dom, H: Dom;
beforeEach(() => {
  L = carregar();
  H = L.hotel;
  L.estado.usuario = { nome: "Teste", perfil: "DIRECAO" };
  ["101", "102", "103", "104"].forEach((n, i) => L.criar("apartamentos", { numero: n, bloqueado: i === 3 }));
});

const CSV_HOSP = `codigo;hospede;apartamento;checkin;checkout;adultos;criancas;valor_diaria;valor_pago;forma_pagamento;empresa;cafe
R1;Ana Teste;101;01/03/2026;04/03/2026;2;1;200,00;600,00;Dinheiro;;sim
R2;Beto Exemplo;102;02/03/2026;03/03/2026;1;0;150,00;0;Faturado;Empresa Fictícia;nao
R3;Caio Modelo;103;03/03/2026;05/03/2026;1;0;180,00;;Cartão de crédito;;sim`;

describe("1-3 importação sem duplicar, atualizando e preservando ajustes internos", () => {
  it("primeira carga cria; segunda idêntica não cria nada", () => {
    const linhas = H.lerCsv(CSV_HOSP);
    const p1 = H.preverImportacao("hospedagens", "DATAHOTEL", linhas);
    expect(p1.resumo).toMatchObject({ total: 3, novo: 3, inconsistente: 0 });
    H.aplicarImportacao(p1, { arquivo: "a.csv" });
    expect(L.estado.hospedagens).toHaveLength(3);
    const p2 = H.preverImportacao("hospedagens", "DATAHOTEL", linhas);
    expect(p2.resumo).toMatchObject({ novo: 0, duplicado: 3 });
    H.aplicarImportacao(p2, {});
    expect(L.estado.hospedagens).toHaveLength(3);
    expect(L.estado.importacoes).toHaveLength(2);
  });

  it("atualiza o campo que mudou e não apaga o que foi complementado aqui", () => {
    H.aplicarImportacao(H.preverImportacao("hospedagens", "DATAHOTEL", H.lerCsv(CSV_HOSP)), {});
    const r1 = L.estado.hospedagens.find((h: any) => h.codigoOrigem === "R1");
    L.atualizar("hospedagens", r1.id, { observacaoInterna: "Hóspede pediu berço" });
    // Nova exportação: diária mudou, e a coluna de valor pago veio vazia.
    const csv2 = `codigo;hospede;apartamento;checkin;checkout;valor_diaria;valor_pago\nR1;Ana Teste;101;01/03/2026;04/03/2026;210,00;`;
    const p = H.preverImportacao("hospedagens", "DATAHOTEL", H.lerCsv(csv2));
    expect(p.resumo.atualizado).toBe(1);
    H.aplicarImportacao(p, {});
    const depois = L.buscarPorId("hospedagens", r1.id);
    expect(depois.valorDiaria).toBe(21000);
    expect(depois.valorPago).toBe(60000); // vazio não zera
    expect(depois.observacaoInterna).toBe("Hóspede pediu berço");
    expect(depois.adultos).toBe(2);
  });

  it("mesmo código de outra origem é outro registro; repetido no arquivo é duplicado", () => {
    const linhas = H.lerCsv(CSV_HOSP + "\nR1;Ana Teste;101;01/03/2026;04/03/2026;2;1;200,00;600,00;Dinheiro;;sim");
    const p = H.preverImportacao("hospedagens", "DATAHOTEL", linhas);
    expect(p.resumo).toMatchObject({ novo: 3, duplicado: 1 });
    H.aplicarImportacao(p, {});
    const outra = H.preverImportacao("hospedagens", "PLANILHA_ANTIGA", H.lerCsv(CSV_HOSP));
    expect(outra.resumo.novo).toBe(3);
  });

  it("26 erros aparecem antes de confirmar e a linha inválida não entra", () => {
    const csv = `codigo;hospede;apartamento;checkin;checkout;valor_diaria\nX1;A;101;31/02/2026;01/03/2026;10\nX2;B;;01/03/2026;02/03/2026;abc\n;C;101;01/03/2026;02/03/2026;10\nX4;D;102;05/03/2026;01/03/2026;10`;
    const p = H.preverImportacao("hospedagens", "DATAHOTEL", H.lerCsv(csv));
    expect(p.resumo.inconsistente).toBe(4);
    const imp = H.aplicarImportacao(p, {});
    expect(L.estado.hospedagens).toHaveLength(0);
    expect(imp.status).toBe("CONCLUIDA_COM_PENDENCIAS");
    expect(imp.erros).toHaveLength(4);
  });
});

describe("ocupação, extrato e café", () => {
  beforeEach(() => H.aplicarImportacao(H.preverImportacao("hospedagens", "DATAHOTEL", H.lerCsv(CSV_HOSP)), {}));

  it("taxa de ocupação ignora apartamento bloqueado", () => {
    const o = H.ocupacao("2026-03-03");
    expect(o).toMatchObject({ total: 4, bloqueados: 1, ocupados: 2, entradas: 1, saidas: 1 });
    expect(o.taxa).toBeCloseTo(2 / 3);
  });

  it("extrato: total, pago e pendente; faturado aparece como FATURAR", () => {
    const e = H.extratoDiario("2026-03-03");
    const r1 = e.find((x: any) => x.hospedagem.codigoOrigem === "R1");
    expect(r1).toMatchObject({ diarias: 3, total: 60000, pago: 60000, pendente: 0, situacao: "QUITADA" });
    const r2 = e.find((x: any) => x.hospedagem.codigoOrigem === "R2");
    expect(r2.situacao).toBe("FATURAR");
  });

  it("café de 03/03 = quem pernoitou de 02 para 03, separando quem não tem café", () => {
    L.criar("cafeAjustes", { data: "2026-03-03", quantidade: 1, justificativa: "Visitante autorizado" });
    const c = H.listaCafe("2026-03-03");
    expect(c.comCafe).toBe(3); // R1: 2 adultos + 1 criança
    expect(c.semCafe).toBe(1); // R2 sem café
    expect(c.totalPrevisto).toBe(4);
  });
});

describe("4-5 fechamento de caixa: faturado ≠ recebido", () => {
  it("dinheiro entra no caixa; cartão e faturado ficam a receber", () => {
    L.criar("recebimentos", { data: "2026-03-03", forma: "DINHEIRO", valorBruto: 10000 });
    L.criar("recebimentos", { data: "2026-03-03", forma: "CREDITO", valorBruto: 20000, taxa: 600 });
    L.criar("recebimentos", { data: "2026-03-03", forma: "FATURADO", valorBruto: 50000 });
    L.criar("recebimentos", { data: "2026-03-03", tipo: "SAIDA_CAIXA", valorBruto: 3000, descricao: "Gás" });
    L.estado.configHotel.saldoInicialCaixa = 5000;
    const f = H.fechamentoDia("2026-03-03");
    expect(f.totais).toEqual({ faturado: 10000 + 19400 + 50000, recebido: 10000, aReceber: 69400 });
    expect(f.saldoCalculado).toBe(5000 + 10000 - 3000);
  });

  it("diferença de caixa exige justificativa e autorização", () => {
    const f = H.fechamentoDia("2026-03-03");
    expect(H.validarFechamentoCaixa(f, f.saldoCalculado - 100, "", null).problemas).toHaveLength(2);
    expect(H.validarFechamentoCaixa(f, f.saldoCalculado - 100, "Troco errado", "Direção").problemas).toHaveLength(0);
    expect(H.validarFechamentoCaixa(f, f.saldoCalculado, "", null).problemas).toHaveLength(0);
  });
});

describe("6-7 cartões", () => {
  it("concilia, aponta parcial, divergente e atrasado", () => {
    expect(H.conciliarCartao({ valorVenda: 10000, taxa: 300, valorDepositado: 9700 }, "2026-03-10").status).toBe("CONCILIADO");
    expect(H.conciliarCartao({ valorVenda: 10000, taxa: 300, valorDepositado: 5000 }, "2026-03-10").status).toBe("PARCIAL");
    const d = H.conciliarCartao({ valorVenda: 10000, taxa: 300, valorDepositado: 9800 }, "2026-03-10");
    expect(d).toMatchObject({ status: "DIVERGENTE", diferenca: 100 });
    expect(H.conciliarCartao({ valorVenda: 10000, dataPrevista: "2026-03-05" }, "2026-03-10").status).toBe("ATRASADO");
  });
});

describe("8 boletos e 12 sem dupla contagem", () => {
  it("status por data e baixa idempotente", () => {
    const b = L.criar("boletos", { documento: "B1", valor: 50000, vencimento: "2026-03-20", empresaNome: "Empresa Fictícia" });
    expect(H.statusBoleto(b, "2026-03-01")).toBe("EMITIDO");
    expect(H.statusBoleto(b, "2026-03-15")).toBe("A_VENCER");
    expect(H.statusBoleto(b, "2026-03-21")).toBe("VENCIDO");
    H.baixarBoleto(b.id, { data: "2026-03-22", valor: 50000 });
    H.baixarBoleto(b.id, { data: "2026-03-22", valor: 50000 });
    expect(L.estado.recebimentos.filter((r: any) => r.boletoId === b.id)).toHaveLength(1);
    expect(H.statusBoleto(L.buscarPorId("boletos", b.id), "2026-03-25")).toBe("PAGO");
  });
});

describe("9-10 faturamento mensal de empresa", () => {
  it("consolida hospedagens e desconta o que já tem nota", () => {
    const e = L.criar("empresas", { razaoSocial: "Empresa Fictícia Ltda", nomeFantasia: "Empresa Fictícia" });
    H.aplicarImportacao(H.preverImportacao("hospedagens", "DATAHOTEL", H.lerCsv(CSV_HOSP)), {});
    let c = H.consolidarEmpresa(e.id, "2026-03");
    expect(c.hospedagens).toHaveLength(1);
    expect(c.saldoAFaturar).toBe(15000);
    L.criar("notasFiscais", { empresaId: e.id, competencia: "2026-03", numero: "123", valor: 15000, status: "EMITIDA" });
    c = H.consolidarEmpresa(e.id, "2026-03");
    expect(c.saldoAFaturar).toBe(0);
  });
});

describe("11 frigobar diário e mensal", () => {
  it("soma os dias reais do mês, com margem; fevereiro tem 28 dias", () => {
    const agua = L.criar("frigobarProdutos", { nome: "Água", precoVenda: 600, custo: 200 });
    L.criar("frigobarConsumos", { data: "2026-02-01", apartamento: "101", produtoId: agua.id, quantidade: 2 });
    L.criar("frigobarConsumos", { data: "2026-02-28", apartamento: "102", produtoId: agua.id, quantidade: 3 });
    L.criar("frigobarConsumos", { data: "2026-03-01", apartamento: "102", produtoId: agua.id, quantidade: 9 });
    expect(H.frigobarDia("2026-02-28").total).toBe(1800);
    const m = H.frigobarMes("2026-02");
    expect(m.dias).toBe(28);
    expect(m.evolucao).toHaveLength(28);
    expect(m.receita).toBe(3000);
    expect(m.produtos[0]).toMatchObject({ quantidade: 5, receita: 3000, custo: 1000, margem: 2000 });
    expect(H.diasDoMes("2028-02")).toBe(29);
  });

  it("consumo já lançado no DataHotel não vira alerta de não cobrado", () => {
    L.criar("frigobarConsumos", { data: "2026-03-02", apartamento: "101", produto: "Suco", quantidade: 1, valorUnitario: 800 });
    L.criar("frigobarConsumos", { data: "2026-03-02", apartamento: "101", produto: "Suco", quantidade: 1, valorUnitario: 800, jaNoDataHotel: true });
    expect(H.frigobarNaoCobrado("2026-03")).toHaveLength(1);
  });
});

describe("13 enxoval", () => {
  it("transferência não muda o total; perda sim", () => {
    const t = L.criar("enxovalItens", { nome: "Toalha de banho", minimo: 30 });
    const mov = (m: any) => L.criar("enxovalMovimentos", { itemId: t.id, data: "2026-03-01", ...m });
    mov({ tipo: "INICIAL", quantidade: 100, para: "ROUPARIA" });
    mov({ tipo: "TRANSFERENCIA", quantidade: 40, de: "ROUPARIA", para: "APARTAMENTOS" });
    mov({ tipo: "TRANSFERENCIA", quantidade: 40, de: "APARTAMENTOS", para: "LAVANDERIA" });
    mov({ tipo: "DANO", quantidade: 2, de: "LAVANDERIA" });
    const r = H.resumoEnxoval(t.id, "2026-03-01", "2026-03-31");
    expect(r).toMatchObject({ inicial: 0, final: 98, entradas: 100, entreguesApartamentos: 40, enviadosLavanderia: 40, danificados: 2, pendenteLavanderia: 38, disponivel: 60 });
    expect(() => mov({ tipo: "TRANSFERENCIA", quantidade: 999, de: "ROUPARIA", para: "RESERVA" })).toThrow();
  });
});

describe("16 recorrentes e 15 vencimentos", () => {
  it("gera previsão uma vez, sem pagar", () => {
    L.criar("contasRecorrentes", { descricao: "Internet", valorPrevisto: 15000, dia: 31, periodicidade: "MENSAL" });
    const a = H.gerarRecorrentes("2026-02");
    const b = H.gerarRecorrentes("2026-02");
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0);
    expect(a[0].vencimento).toBe("2026-02-28");
    expect(a[0].status).not.toBe("PAGO");
  });
  it("marcos de alerta", () => {
    expect(H.marcoAlerta("2026-03-10", "2026-03-03")).toBe("D-7");
    expect(H.marcoAlerta("2026-03-10", "2026-03-05")).toBeNull();
    expect(H.marcoAlerta("2026-03-10", "2026-03-11")).toBe("VENCIDA");
  });
});

describe("17 fluxo de caixa", () => {
  it("a receber não entra no realizado; projeção aponta falta de caixa", () => {
    L.criar("recebimentos", { data: "2026-03-01", forma: "DINHEIRO", valorBruto: 10000 });
    L.criar("recebimentos", { data: "2026-03-01", forma: "FATURADO", valorBruto: 50000, previstoPara: "2026-03-05" });
    L.criar("contas", { descricao: "Energia", valor: 30000, vencimento: "2026-03-03", status: "APROVADO" });
    const f = H.fluxoCaixa("2026-03-01", "2026-03-05", 0);
    expect(f.saldoFinalRealizado).toBe(10000);
    expect(f.diasInsuficientes).toEqual(["2026-03-03", "2026-03-04"]);
    expect(f.saldoFinalProjetado).toBe(30000);
  });
});

describe("19-21 ponto, banco de horas e diárias", () => {
  it("horas trabalhadas com intervalo e virada de noite", () => {
    expect(H.minutosTrabalhados({ entrada: "08:00", inicioIntervalo: "12:00", fimIntervalo: "13:00", saida: "17:00" })).toBe(480);
    expect(H.minutosTrabalhados({ entrada: "22:00", saida: "06:00" })).toBe(480);
  });
  it("ajuste aprovado vale, marcação original fica intacta", () => {
    const m = L.criar("marcacoesPonto", { funcionarioId: "f1", data: "2026-03-02", entrada: "08:30", saida: "17:00", inicioIntervalo: "12:00", fimIntervalo: "13:00" });
    L.criar("ajustesPonto", { marcacaoId: m.id, novos: { entrada: "08:00" }, status: "APROVADO", aprovadoEm: "2026-03-03", justificativa: "Relógio travou" });
    expect(H.diaDePonto(m, 480)).toMatchObject({ trabalhados: 480, diferenca: 0, ajustado: true });
    expect(L.buscarPorId("marcacoesPonto", m.id).entrada).toBe("08:30");
  });
  it("banco: hora extra paga não entra no saldo", () => {
    const b = H.bancoDeHoras({ saldoInicial: 60, creditos: [{ minutos: 120 }, { minutos: 90, destino: "PAGAMENTO" }], compensacoes: [{ minutos: 30 }], debitos: [{ minutos: 10 }] });
    expect(b.saldoFinal).toBe(140);
    expect(b.pagaveis).toBe(90);
  });
  it("diárias: base = quantidade × valor; pendente desconta adiantamento", () => {
    L.criar("diarias", { funcionarioId: "d1", data: "2026-03-01", quantidade: 1, valorUnitario: 12000 });
    L.criar("diarias", { funcionarioId: "d1", data: "2026-03-02", quantidade: 1, valorUnitario: 12000, adiantamento: 5000 });
    expect(H.fechamentoDiarias("d1", "2026-03")).toMatchObject({ quantidade: 2, base: 24000, pendente: 19000 });
  });
});

describe("24 auditoria preserva o valor anterior", () => {
  it("guarda antes/depois e a justificativa", () => {
    const r = L.criar("recebimentos", { data: "2026-03-01", forma: "DINHEIRO", valorBruto: 10000 });
    L.atualizar("recebimentos", r.id, { valorBruto: 9000, justificativa: "Digitado errado" });
    const a = L.estado.auditoria[0];
    expect(a.antes).toEqual({ valorBruto: 10000 });
    expect(a.depois).toEqual({ valorBruto: 9000 });
    expect(a.justificativa).toBe("Digitado errado");
    expect(() => L.atualizar("recebimentos", r.id, { valorBruto: -5 })).toThrow();
  });
});

describe("25 exportação", () => {
  it("CSV com ; e vírgula decimal", () => {
    expect(H.paraCsv(["a", "b"], [["x;y", H.reaisCsv(12345)]])).toBe('﻿a;b\r\n"x;y";123,45');
  });
});
