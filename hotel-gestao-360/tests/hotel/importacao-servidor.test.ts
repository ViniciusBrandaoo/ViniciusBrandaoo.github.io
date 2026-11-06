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
