import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  colunasFaltantes, LAYOUTS, lerCsv, lerData, lerValor, lerXlsx, preverImportacao, sha256,
  type Registro,
} from "../../src/dominio/hotel/importacao.js";
import { pode } from "../../src/dominio/hotel/permissoes.js";

const CSV_HOSP = [
  "Reserva;Hóspede;Apto;Entrada;Saída;Adultos;Crianças;Valor Diária",
  "R1;Ana;101;01/11/2026;03/11/2026;2;0;250,00",
  "R2;Bruno;102;02/11/2026;04/11/2026;1;1;1.200,50",
].join("\r\n");

const semNada = new Map<string, Registro>();

describe("leitura do arquivo", () => {
  it("lê CSV com ; acentos no cabeçalho e valores brasileiros", () => {
    const { colunas, linhas } = lerCsv(CSV_HOSP);
    expect(colunas).toEqual(["reserva", "hospede", "apto", "entrada", "saida", "adultos", "criancas", "valor_diaria"]);
    expect(linhas[1]).toMatchObject({ reserva: "R2", valor_diaria: "1.200,50" });
  });

  it("valor e data: vazio é ausente, inválido é erro, nunca zero em silêncio", () => {
    expect(lerValor("1.200,50")).toBe(120050);
    expect(lerValor("R$ 10")).toBe(1000);
    expect(lerValor("")).toBeNull();
    expect(lerValor("dez")).toBeNaN();
    expect(lerData("31/02/2026")).toBeNaN();
    expect(lerData("2026-11-05")).toBe("2026-11-05");
  });

  it("lê a primeira aba de um .xlsx", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Relatório");
    ws.addRow(["Código", "Data", "Forma", "Valor"]);
    ws.addRow(["P1", new Date(Date.UTC(2026, 10, 5)), "Cartão de Débito", 150.5]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const { colunas, linhas } = await lerXlsx(buf);
    expect(colunas).toEqual(["codigo", "data", "forma", "valor"]);
    expect(linhas[0]).toMatchObject({ codigo: "P1", data: "2026-11-05", forma: "Cartão de Débito", valor: "150.5" });
  });

  it("o hash identifica o mesmo arquivo", () => {
    expect(sha256(Buffer.from(CSV_HOSP))).toBe(sha256(Buffer.from(CSV_HOSP)));
    expect(sha256(Buffer.from(CSV_HOSP + " "))).not.toBe(sha256(Buffer.from(CSV_HOSP)));
  });
});

describe("cenário 1 — importar duas vezes não duplica", () => {
  it("segunda importação do mesmo conteúdo sai toda IDENTICA", () => {
    const { colunas, linhas } = lerCsv(CSV_HOSP);
    const p1 = preverImportacao("hospedagens", colunas, linhas, semNada);
    expect(p1.resumo).toMatchObject({ novo: 2, rejeitado: 0 });
    // simula o banco depois da 1ª confirmação
    const banco = new Map(p1.itens.map((i) => [i.codigo!, i.registro!]));
    const p2 = preverImportacao("hospedagens", colunas, linhas, banco);
    expect(p2.resumo).toMatchObject({ novo: 0, atualizado: 0, identico: 2 });
  });

  it("mudança num campo vira ATUALIZADO e diz qual campo", () => {
    const { colunas, linhas } = lerCsv(CSV_HOSP);
    const banco = new Map(preverImportacao("hospedagens", colunas, linhas, semNada).itens.map((i) => [i.codigo!, i.registro!]));
    const editado = lerCsv(CSV_HOSP.replace("250,00", "260,00"));
    const p = preverImportacao("hospedagens", editado.colunas, editado.linhas, banco);
    expect(p.resumo).toMatchObject({ atualizado: 1, identico: 1 });
    expect(p.itens[0]?.camposAlterados).toEqual(["valorDiaria"]);
  });

  it("código repetido dentro do arquivo é rejeitado, não somado", () => {
    const { colunas, linhas } = lerCsv(CSV_HOSP + "\r\nR1;Ana;101;01/11/2026;03/11/2026;2;0;250,00");
    const p = preverImportacao("hospedagens", colunas, linhas, semNada);
    expect(p.resumo).toMatchObject({ novo: 2, rejeitado: 1 });
    expect(p.itens[2]?.problemas[0]).toMatch(/repetido.*linha 2/);
  });
});

describe("cenário 2 — coluna faltando ou dado inválido", () => {
  it("sem a coluna de check-in, o arquivo inteiro é recusado", () => {
    const { colunas, linhas } = lerCsv(CSV_HOSP.replace("Entrada", "Chegou"));
    expect(colunasFaltantes(LAYOUTS.hospedagens, colunas)).toEqual([expect.stringMatching(/^checkin/)]);
    const p = preverImportacao("hospedagens", colunas, linhas, semNada);
    expect(p.erroGeral).toMatch(/colunas obrigatórias/);
    expect(p.resumo).toMatchObject({ novo: 0, rejeitado: 2 });
  });

  it("linha com data inválida vai para quarentena; as outras seguem", () => {
    const { colunas, linhas } = lerCsv(CSV_HOSP.replace("03/11/2026", "33/11/2026"));
    const p = preverImportacao("hospedagens", colunas, linhas, semNada);
    expect(p.erroGeral).toBeNull();
    expect(p.resumo).toMatchObject({ novo: 1, rejeitado: 1 });
    expect(p.itens[0]?.problemas[0]).toMatch(/Data inválida/);
  });

  it("check-out antes do check-in é rejeitado", () => {
    const { colunas, linhas } = lerCsv(CSV_HOSP.replace("03/11/2026", "30/10/2026"));
    expect(preverImportacao("hospedagens", colunas, linhas, semNada).itens[0]?.problemas).toContain("Check-out antes do check-in.");
  });

  it("recebimento: forma normalizada e taxa maior que o valor é rejeitada", () => {
    const csv = "Código;Data;Forma;Valor;Taxa\nP1;05/11/2026;Cartão de Crédito;100,00;2,50\nP2;05/11/2026;Dinheiro;10,00;20,00";
    const { colunas, linhas } = lerCsv(csv);
    const p = preverImportacao("recebimentos", colunas, linhas, semNada);
    expect(p.itens[0]?.registro).toMatchObject({ forma: "CREDITO", bruto: 10000, taxa: 250 });
    expect(p.itens[1]?.situacao).toBe("REJEITADO");
  });
});

describe("cenário 10 — permissões do hotel", () => {
  it("Governança não vê salário nem recebimentos, nem importa", () => {
    expect(pode(["GOVERNANCA"], "salario.ver")).toBe(false);
    expect(pode(["GOVERNANCA"], "recebimento.ver")).toBe(false);
    expect(pode(["GOVERNANCA"], "importacao.enviar")).toBe(false);
    expect(pode(["GOVERNANCA"], "hospedagem.ver")).toBe(true);
  });

  it("Auditor só lê", () => {
    expect(pode(["AUDITOR"], "importacao.ver")).toBe(true);
    expect(pode(["AUDITOR"], "importacao.confirmar")).toBe(false);
  });
});

describe("Relatório de Reservas exportado do DataHotel (CSV com desenho de página)", () => {
  // Mesmo formato do arquivo real (dados fictícios): título, filtros,
  // cabeçalho, colunas que mudam de posição entre páginas e rodapé com totais.
  const REAL = [
    ";",
    "Relatório de Reservas;;;;;;;;;;;;;;;;;;",
    "Período: 01/10/2026 até 01/12/2026;;;;;;;;;;",
    "Cód. Res.;Check-in;;Check-out;Hóspede;;Apto.;Nº Diárias;Nº Hósp.;;Canal de Venda;;Funcionário;;Situação;Vr. Total;",
    "",
    "AAA111111;29/05/2025;;21/10/2026;HOSPEDE UM ;;117;510;1;;Não Informado;; ;;Checked-out;R$ 48.450,00;;;",
    ";;;;;;;;;;;;;;;;",
    "BBB222222;01/10/2026;;03/10/2026;HOSPEDE DOIS;;103;2;1;;Booking;;MARIA;;Checked-out;R$ 310,00;",
    "Emitido em: 06/11/2026;;;;;;;;www.datahotel.com.br;;;;;;;;;Pág. 1/2;;;;;",
    "CCC333333;;03/11/2026;;;04/11/2026;HOSPEDE TRES;;;112;;1;2;;Não Informado;; ;;Cancelada;R$ 155,00;;;",
    "3 registro(s);;Total Geral:;;;513;4;;R$ 48.915,00;",
  ].join("\r\n");

  it("lê pelo conteúdo, mesmo com colunas deslocadas, e confere o rodapé", async () => {
    const { lerRelatorioReservasDataHotel, conferirTotais } = await import("../../src/dominio/hotel/importacao.js");
    const r = lerRelatorioReservasDataHotel(REAL)!;
    expect(r.linhas.map((l) => l.codigo)).toEqual(["AAA111111", "BBB222222", "CCC333333"]);
    expect(r.linhas[1]).toMatchObject({ apartamento: "103", n_diarias: "2", canal_de_venda: "Booking", funcionario: "MARIA", situacao: "Checked-out" });
    expect(r.linhas[2]).toMatchObject({ checkin: "03/11/2026", checkout: "04/11/2026", n_hosp: "2", situacao: "Cancelada", funcionario: "" });
    expect(r.conferencia).toEqual({ registros: 3, totalCentavos: 4891500 });
    expect(conferirTotais(r.linhas, r.conferencia)).toBeNull();
    const p = preverImportacao("hospedagens", r.colunas, r.linhas, semNada);
    expect(p.resumo).toMatchObject({ novo: 3, rejeitado: 0 });
    expect(p.itens[0]?.registro).toMatchObject({ checkin: "2025-05-29", checkoutPrevisto: "2026-10-21", diarias: 510, hospedes: 1, valorTotal: 4845000 });
  });

  it("total do rodapé que não confere recusa o arquivo inteiro", async () => {
    const { lerRelatorioReservasDataHotel, conferirTotais } = await import("../../src/dominio/hotel/importacao.js");
    const r = lerRelatorioReservasDataHotel(REAL.replace("R$ 48.915,00", "R$ 49.000,00"))!;
    const erro = conferirTotais(r.linhas, r.conferencia);
    expect(erro).toMatch(/não bate/);
    expect(preverImportacao("hospedagens", r.colunas, r.linhas, semNada, erro).resumo.novo).toBe(0);
    const faltando = lerRelatorioReservasDataHotel(REAL.replace("3 registro(s)", "4 registro(s)"))!;
    expect(conferirTotais(faltando.linhas, faltando.conferencia)).toMatch(/4 registro/);
  });

  it("CSV comum não é confundido com o relatório", async () => {
    const { lerRelatorioReservasDataHotel } = await import("../../src/dominio/hotel/importacao.js");
    expect(lerRelatorioReservasDataHotel(CSV_HOSP)).toBeNull();
  });
});

describe("Reservas com extrato e livro-caixa do DataHotel", () => {
  const EXTRATO = [
    "Relatório de Reservas;;;;;;",
    "Cód. Res.;Check-in;;Check-out;Hóspede;;;;Apto.;;Nº Diárias;Nº Hósp.;;;;Canal de Venda;;Funcionário;;Situação;Vr. Total;",
    "AAA111111;01/11/2026;;03/11/2026;HOSPEDE UM;;;;101;;2;1;;;;Não Informado;; ;;Checked-out;R$ 300,00;",
    "Tipo Conta;;;Valor;;;",
    "DIÁRIA;;;R$ 300,00;;;",
    "CONSUMO;;;R$ 6,00;;;",
    "RECEBIMENTO;;;R$ 306,00;;;",
    "BBB222222;02/11/2026;;03/11/2026;HOSPEDE DOIS;;;;102;;1;1;;;;Booking;; ;;Checked-in;R$ 135,00;",
    "Pág. 1/2;;;",
    "DIÁRIA;;;R$ 135,00;;;",
    "2 registro(s);;Total Geral:;;3;2;;R$ 435,00;",
    "Resumo do Extrato de Hospedagem (Sintético);",
    "DIÁRIA;R$ 435,00;",
    "CONSUMO;R$ 6,00;",
  ].join("\r\n");

  it("soma diária, consumo e recebimento de cada reserva (inclusive depois de quebra de página) e ignora o resumo final", async () => {
    const { lerRelatorioReservasDataHotel, conferirTotais } = await import("../../src/dominio/hotel/importacao.js");
    const r = lerRelatorioReservasDataHotel(EXTRATO)!;
    expect(r.linhas[0]).toMatchObject({ diarias_lancadas: "300,00", consumos: "6,00", valor_pago: "306,00" });
    // BBB: a diária veio depois da quebra de página; sem recebimento vale zero
    expect(r.linhas[1]).toMatchObject({ diarias_lancadas: "135,00", consumos: "0,00", valor_pago: "0,00" });
    expect(conferirTotais(r.linhas, r.conferencia)).toBeNull();
    const p = preverImportacao("hospedagens", r.colunas, r.linhas, semNada);
    expect(p.itens[0]?.registro).toMatchObject({ diariasLancadas: 30000, consumos: 600, valorPago: 30600, valorTotal: 30000 });
  });

  const CAIXA = [
    "Resumo por Movimentação de Caixa;;;;",
    "Caixa: 1365 Data Abertura: 16/10/2026 14:00:21 Data Fechamento: 26/10/2026 09:45:51;;;",
    ";;16/10/2026;;;;;SALDO DE CAIXA (FUNDO DE CAIXA - 1364);;;DINHEIRO;;;R$ 100,00;;;C;;",
    ";;20/10/2026;;;;;VENDA 100;;;CARTÃO DE DÉBITO;;;R$ 6,00;;;C;;",
    ";;26/10/2026;;;;;PAGAMENTO UH 105 FULANO DE TAL;;;PIX OUTRANSFERENCIADIRETO EM CONTACORRENTE;;;R$ 215,00;;;C;;",
    ";;26/10/2026;;;;;FECHAMENTO DE CAIXA;;;CARTÃO DE DÉBITO;;;R$ 6,00;;;D;;",
    "4 registro(s);;;",
    "Caixa: 1366 Data Abertura: 26/10/2026 09:45:55 Data Fechamento: 05/11/2026 15:59:44;;;",
    ";;27/10/2026;;;;;CHECK-OUT COD. RESERVA: ABC123456;;;CARTÃO DE CRÉDITO;;;R$ 300,00;;;C;;",
    ";;27/10/2026;;;;;VENDA 101;;;DINHEIRO;;;R$ 3,00;;;C;;",
    ";;27/10/2026;;;;;VENDA 101;;;DINHEIRO;;;R$ 3,00;;;C;;",
    ";;27/10/2026;;;;;SANGRIA DE CAIXA - diárias;;;DINHEIRO;;;R$ 5,00;;;D;;",
    "4 registro(s);;;",
  ].join("\r\n");

  it("livro-caixa: só entradas de pagamento viram recebimento; fundo, sangria e fechamento ficam de fora", async () => {
    const { lerMovimentoCaixaDataHotel, conferirTotais } = await import("../../src/dominio/hotel/importacao.js");
    const r = lerMovimentoCaixaDataHotel(CAIXA)!;
    expect(r.ignoradas).toEqual({ fundo: 1, saidas: 2, antigas: 0 });
    expect(r.linhas).toHaveLength(5);
    expect(r.linhas[1]).toMatchObject({ apartamento: "105", pagador: "FULANO DE TAL", forma: expect.stringMatching(/^PIX/) });
    expect(r.linhas[2]).toMatchObject({ reserva: "ABC123456", forma: "CARTÃO DE CRÉDITO" });
    // duas vendas idênticas no mesmo dia continuam sendo dois recebimentos (código com ordem)
    expect(r.linhas[3]!.codigo).not.toBe(r.linhas[4]!.codigo);
    expect(conferirTotais(r.linhas, r.conferencia)).toBeNull();
    const p = preverImportacao("recebimentos", r.colunas, r.linhas, semNada);
    expect(p.resumo).toMatchObject({ novo: 5, rejeitado: 0 });
    expect(p.itens[1]?.registro).toMatchObject({ forma: "PIX", bruto: 21500, data: "2026-10-26" });
  });

  it("corte de data: o que for mais antigo não entra, mas ainda conta para conferir o rodapé", async () => {
    const { lerMovimentoCaixaDataHotel, conferirTotais } = await import("../../src/dominio/hotel/importacao.js");
    const r = lerMovimentoCaixaDataHotel(CAIXA, "2026-10-26")!;
    expect(r.ignoradas.antigas).toBe(1);
    expect(r.linhas).toHaveLength(4);
    expect(conferirTotais(r.linhas, r.conferencia)).toBeNull();
  });

  it("rodapé que não confere recusa o arquivo", async () => {
    const { lerMovimentoCaixaDataHotel, conferirTotais } = await import("../../src/dominio/hotel/importacao.js");
    const r = lerMovimentoCaixaDataHotel(CAIXA.replace("4 registro(s);;;\r\nCaixa: 1366", "9 registro(s);;;\r\nCaixa: 1366"))!;
    expect(conferirTotais(r.linhas, r.conferencia)).toMatch(/9|lidas/);
  });
});

describe("Contas Recebidas do DataHotel (número de lançamento como chave)", () => {
  const RECEBIDAS = [
    "Contas Recebidas por Cliente;;;;",
    "Lançto;Emissão;Descrição/Doc.;;;;Forma de Pagamento;;Tipo de Receita;;Caixa/Banco;Data Pgto;;;Vencimento;;Valor;",
    ";64009;;26/10/2026;;VENDA 22064 22064;;;;;CARTÃO DE DÉBITO;;;RECEITA DE VENDA;;;CAIXA;;27/10/2026;;;;;27/10/2026;;;R$ 9,00;;",
    "FULANO DE TAL;",
    "64091;04/11/2026;Recebimento uh 106 fulano de tal;CARTÃO DE CRÉDITO;RECEITA DE HOSPEDAGEM;CAIXA;04/11/2026;04/11/2026;R$ 135,00;",
    "Total:;R$ 135,00;",
    "64092;04/11/2026;HOSPEDAGEM: FRJ262760 - HÓSPEDE: BELTRANO;FATURAR EMPRESA(CONVÊNIO);RECEITA DE HOSPEDAGEM;CAIXA;05/11/2026;05/11/2026;R$ 215,00;",
    "1 registro(s);",
    "3 registro(s);Total Geral:;R$ 359,00;",
    "Emitido em: 06/11/2026;www.datahotel.com.br;Pág. 1/1;",
  ].join("\r\n");

  it("usa o número do lançamento como código e a data de pagamento como data", async () => {
    const { lerContasRecebidasDataHotel, conferirTotais } = await import("../../src/dominio/hotel/importacao.js");
    const r = lerContasRecebidasDataHotel(RECEBIDAS)!;
    expect(r.linhas.map((l) => l.codigo)).toEqual(["LR64009", "LR64091", "LR64092"]);
    expect(r.linhas[0]).toMatchObject({ data: "27/10/2026", forma: "CARTÃO DE DÉBITO", valor: "R$ 9,00" });
    expect(r.linhas[1]).toMatchObject({ apartamento: "106", pagador: "fulano de tal" });
    expect(r.linhas[2]).toMatchObject({ reserva: "FRJ262760", forma: expect.stringMatching(/^FATURAR/) });
    expect(r.conferencia).toEqual({ registros: 3, totalCentavos: 35900, vistas: 3 });
    expect(conferirTotais(r.linhas, r.conferencia)).toBeNull();
    const p = preverImportacao("recebimentos", r.colunas, r.linhas, semNada);
    expect(p.resumo).toMatchObject({ novo: 3, rejeitado: 0 });
    expect(p.itens[2]?.registro).toMatchObject({ forma: "FATURADO", bruto: 21500, data: "2026-11-05" });
  });

  it("total do rodapé diferente da soma recusa o arquivo", async () => {
    const { lerContasRecebidasDataHotel, conferirTotais } = await import("../../src/dominio/hotel/importacao.js");
    const r = lerContasRecebidasDataHotel(RECEBIDAS.replace("R$ 359,00", "R$ 360,00"))!;
    expect(conferirTotais(r.linhas, r.conferencia)).toMatch(/não bate/);
  });

  it("o mesmo recebimento não é confundido entre os dois relatórios de caixa", async () => {
    const { lerContasRecebidasDataHotel, lerMovimentoCaixaDataHotel } = await import("../../src/dominio/hotel/importacao.js");
    expect(lerMovimentoCaixaDataHotel(RECEBIDAS)).toBeNull();
    expect(lerContasRecebidasDataHotel(CSV_HOSP)).toBeNull();
  });
});
