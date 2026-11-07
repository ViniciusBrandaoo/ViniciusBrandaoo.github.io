import { describe, expect, it } from "vitest";
import {
  conferir, lerCreditosDebitos, lerEstoque, lerFaturamentoAnalitico, lerFaturamentoDiario, lerReceitasDespesas,
  type DadosConferencia,
} from "../../src/dominio/hotel/conferencia.js";

const base = (): DadosConferencia => ({
  inicio: "2026-11-01", fim: "2026-11-02", hoje: "2026-11-02",
  reservas: [], recebimentos: [], receitasDespesas: [], faturamentoDiario: [],
  faturamentoAnalitico: { diarias: [], subDiaria: null, subConsumo: null, subVendas: null, total: null },
  creditosDebitos: [], contasAReceber: [], consumoPorDataTotal: null, vendasItensVenda: null,
  rds: null, mapa: [], cafe: [], apartamentos: [], estoque: [],
});
const regra = (d: DadosConferencia, id: string) => conferir(d).find((r) => r.regra === id)!;

describe("leitura dos relatórios usados na conferência", () => {
  it("Receitas x Despesas e Faturamento Diário (coluna de consumo pode vir vazia)", () => {
    const rd = lerReceitasDespesas("DATA;;RECEITAS;;DESPESAS;;TOTAL;\n26/10/2026;;;;R$ 988,50;;R$ 370,00;;R$ 618,50;");
    expect(rd).toEqual([{ dia: "2026-10-26", receitas: 98850, despesas: 37000 }]);
    const fd = lerFaturamentoDiario("DATA;CONSUMO;;DIÁRIA;VENDA;;TOTAL\n26/10/2026;;;1.845,00;18,50;;1.863,50\n30/10/2026;20,00;;735,00;14,00;;769,00");
    expect(fd[0]).toMatchObject({ dia: "2026-10-26", consumo: 0, diaria: 184500, venda: 1850, total: 186350 });
    expect(fd[1]).toMatchObject({ consumo: 2000, diaria: 73500 });
  });

  it("Faturamento Analítico: diária por noite e subtotais", () => {
    const a = lerFaturamentoAnalitico([
      "DIÁRIA;", "Cód. Reserva;Data;Descrição;Valor;", ";UDJ264986;26/10/2026;HOSPEDAGEM 26/10/2026;R$ 215,00;",
      "Sub-Total;R$ 215,00;", "CONSUMO;", ";Sub-Total;R$ 6,00;", "VENDAS;", ";Sub-Total;R$ 9,00;", "Total Geral;R$ 230,00;",
    ].join("\n"));
    expect(a.diarias).toEqual([{ reserva: "UDJ264986", dia: "2026-10-26", valor: 21500 }]);
    expect([a.subDiaria, a.subConsumo, a.subVendas, a.total]).toEqual([21500, 600, 900, 23000]);
  });

  it("Créditos x Débitos e Estoque (negativos com ponto de milhar)", () => {
    const cd = lerCreditosDebitos("Forma de Pgto.;;Créditos;Débitos;Saldo\nFATURAR EMPRESA(CONVÊNIO);;11.445,00;6.315,00;5.130,00\n5 registro(s);Total:;31.980,46;17.630,46;14.350,00");
    expect(cd).toEqual([{ forma: "FATURADO", creditos: 1144500, debitos: 631500, saldo: 513000 }]);
    const es = lerEstoque("Código;Descrição;Estoque;Un.\n;-4;UN\n20;LAVANDERIA;-2.247;UN\n06;AGUA;179;UN");
    expect(es.map((e) => [e.codigo, e.saldo])).toEqual([["", -4], ["20", -2247], ["06", 179]]);
  });
});

describe("regras de conferência", () => {
  it("C1/C2: recebido bate com Receitas x Despesas, dia a dia, e aponta o dia que não bate", () => {
    const d = base();
    d.receitasDespesas = [{ dia: "2026-11-01", receitas: 10000, despesas: 0 }, { dia: "2026-11-02", receitas: 5000, despesas: 0 }];
    d.recebimentos = [
      { codigo: "LR1", dia: "2026-11-01", forma: "PIX", valor: 10000, reserva: "", apto: "", pagador: "" },
      { codigo: "LR2", dia: "2026-11-02", forma: "PIX", valor: 4000, reserva: "", apto: "", pagador: "" },
    ];
    expect(regra(d, "C1")).toMatchObject({ situacao: "DIVERGENTE", diferenca: -1000 });
    const c2 = regra(d, "C2");
    expect(c2.situacao).toBe("DIVERGENTE");
    expect(c2.detalhes[0]).toMatch(/2026-11-02/);
    d.recebimentos[1]!.valor = 5000;
    expect(regra(d, "C1").situacao).toBe("OK");
    expect(regra(d, "C2").situacao).toBe("OK");
  });

  it("C4: diária do dia no resumo diferente do analítico é divergência, e diz o dia", () => {
    const d = base();
    d.hoje = "2026-11-03";
    d.faturamentoDiario = [{ dia: "2026-11-02", consumo: 0, diaria: 54000, venda: 0, total: 54000 }];
    d.faturamentoAnalitico.diarias = [{ reserva: "ABC123456", dia: "2026-11-02", valor: 40500 }];
    const r = regra(d, "C4");
    expect(r).toMatchObject({ situacao: "DIVERGENTE", diferenca: -13500 });
    expect(r.detalhes.join(" ")).toMatch(/2026-11-02.*R\$\s?540,00.*R\$\s?405,00/);
  });

  it("C3: Contas Recebidas × livro-caixa por dia e forma; o dia de hoje fica fora da C4", () => {
    const d = base();
    d.livroCaixa = [{ dia: "2026-11-01", forma: "PIX", valor: 10000 }, { dia: "2026-11-01", forma: "DINHEIRO", valor: 500 }];
    d.recebimentos = [
      { codigo: "LR1", dia: "2026-11-01", forma: "PIX", valor: 10000, reserva: "", apto: "", pagador: "" },
      { codigo: "LR2", dia: "2026-11-01", forma: "CARTAO_CREDITO", valor: 500, reserva: "", apto: "", pagador: "" },
      { codigo: "LR3", dia: "2026-11-02", forma: "PIX", valor: 999, reserva: "", apto: "", pagador: "" },
    ];
    const c3 = regra(d, "C3");
    expect(c3.situacao).toBe("DIVERGENTE");
    expect(c3.detalhes.join(" ")).toMatch(/DINHEIRO/);
    expect(c3.detalhes.join(" ")).not.toMatch(/2026-11-02/);
    d.recebimentos[1]!.forma = "DINHEIRO";
    expect(regra(d, "C3").situacao).toBe("OK");
    d.faturamentoDiario = [{ dia: "2026-11-02", consumo: 0, diaria: 54000, venda: 0, total: 54000 }];
    expect(regra(d, "C4").situacao).toBe("OK");
    expect(conferir(d).some((r) => r.regra === "C7")).toBe(false);
  });

  it("C8: faturado para empresas sem título a receber é divergência", () => {
    const d = base();
    d.recebimentos = [{ codigo: "LR1", dia: "2026-11-01", forma: "FATURADO", valor: 513000, reserva: "", apto: "", pagador: "" }];
    d.creditosDebitos = [{ forma: "FATURADO", creditos: 1144500, debitos: 631500, saldo: 513000 }];
    d.contasAReceber = [{ lancto: "1", vencimento: "2026-11-15", valor: 21500, descricao: "x" }];
    expect(regra(d, "C8")).toMatchObject({ situacao: "DIVERGENTE", esperado: 513000, encontrado: 21500, diferenca: -491500 });
    d.contasAReceber = [{ lancto: "1", vencimento: "2026-11-15", valor: 513000, descricao: "x" }];
    expect(regra(d, "C8").situacao).toBe("OK");
  });

  it("C9: estadia encerrada com saldo em aberto e com recebimento a mais", () => {
    const d = base();
    const r = (codigo: string, recebido: number) => ({ codigo, checkin: "2026-11-01", checkout: "2026-11-02", apto: "101", situacao: "Checked-out", hospedes: 1, vrTotal: 0, diariaLancada: 15500, consumo: 500, recebido });
    d.reservas = [r("AAA111111", 16000), r("BBB222222", 10000), r("CCC333333", 20000)];
    expect(regra(d, "C9a")).toMatchObject({ situacao: "DIVERGENTE" });
    expect(regra(d, "C9a").detalhes.join(" ")).toMatch(/BBB222222.*faltam/);
    expect(regra(d, "C9b")).toMatchObject({ situacao: "ATENCAO" });
    expect(regra(d, "C9b").detalhes.join(" ")).toMatch(/CCC333333/);
  });

  it("C10, C14 e C15: reserva desconhecida, estoque negativo e noite sem diária", () => {
    const d = base();
    d.recebimentos = [{ codigo: "LR9", dia: "2026-11-01", forma: "PIX", valor: 100, reserva: "ZZZ999999", apto: "", pagador: "" }];
    expect(regra(d, "C10").situacao).toBe("ATENCAO");
    d.estoque = [{ codigo: "09", descricao: "CHOCOLATE", saldo: -30 }];
    expect(regra(d, "C14").situacao).toBe("ATENCAO");
    d.reservas = [{ codigo: "AAA111111", checkin: "2026-11-01", checkout: "2026-11-02", apto: "101", situacao: "Checked-out", hospedes: 1, vrTotal: 15500, diariaLancada: 0, consumo: 0, recebido: 0 }];
    expect(regra(d, "C15").situacao).toBe("DIVERGENTE");
    d.faturamentoAnalitico.diarias = [{ reserva: "AAA111111", dia: "2026-11-01", valor: 15500 }];
    expect(regra(d, "C15").situacao).toBe("OK");
  });

  it("C12/C13: ocupação e apartamentos em contagens (não em dinheiro)", () => {
    const d = base();
    d.rds = { ocupados: 5, livres: 21, bloqueados: 5, receitaDiaria: 0, receitaConsumo: 0 };
    d.mapa = [{ apto: "105", reserva: "RAK261843", pago: "Não" }];
    const c12 = regra(d, "C12");
    expect(c12).toMatchObject({ situacao: "ATENCAO", unidade: "un", esperado: 5, encontrado: 1 });
    d.apartamentos = Array.from({ length: 31 }, (_, i) => ({ numero: String(101 + i), situacao: i < 5 ? "Bloqueado" : "Livre" }));
    expect(regra(d, "C13")).toMatchObject({ situacao: "OK", unidade: "un" });
    expect(regra(d, "C12b").situacao).toBe("ATENCAO");
  });
});

describe("envio parcial de relatórios", () => {
  it("o que não foi enviado não gera erro técnico nem divergência falsa: só o aviso C0", async () => {
    const { montarDados, reconhecer } = await import("../../src/dominio/hotel/conferencia-arquivos.js");
    const { conferir } = await import("../../src/dominio/hotel/conferencia.js");
    const rds = "Relatório Diário de Situação (RDS) - 06/11/2026;\nOcupadas;5;13\nLivres;21;56\nBloqueadas;5;10\n";
    const cam = "Lista de Camareira;\n101;Livre;\n102;Bloqueado;\n";
    expect(reconhecer(rds)).toBe("rds");
    expect(reconhecer(cam)).toBe("camareira");
    expect(reconhecer("a;b\n1;2")).toBeNull();
    const m = montarDados([{ nome: "a.csv", texto: rds }, { nome: "b.csv", texto: cam }, { nome: "c.csv", texto: "a;b" }], "2026-10-26", "2026-11-06");
    expect(m.erros).toEqual([]);
    expect(m.naoReconhecidos).toEqual(["c.csv"]);
    const r = conferir(m.dados);
    expect(r.map((x) => x.regra)).toEqual(["C0", "C13"]);
    expect(r[0]!.detalhes[0]).toMatch(/Contas Recebidas/);
  });
});
