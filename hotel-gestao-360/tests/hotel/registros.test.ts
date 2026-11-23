import { describe, expect, it } from "vitest";
import { complementoDe, conferirTrava, podeGravar, podeLer, validarDados } from "../../src/dominio/hotel/registros.js";

describe("quem lê e grava cada área do hotel", () => {
  it("Governança não lê recebimentos, caixa, boletos nem ponto", () => {
    for (const c of ["recebimentos", "fechamentosCaixa", "boletos", "diarias", "marcacoesPonto"] as const) {
      expect(podeLer(["GOVERNANCA"], c)).toBe(false);
    }
    expect(podeGravar(["GOVERNANCA"], "enxovalMovimentos")).toBe(true);
  });
  it("Recepção não grava boletos nem cartões; Auditor não grava nada", () => {
    expect(podeGravar(["RECEPCAO"], "boletos")).toBe(false);
    expect(podeGravar(["RECEPCAO"], "transacoesCartao")).toBe(false);
    expect(podeGravar(["AUDITOR"], "recebimentos")).toBe(false);
    expect(podeLer(["AUDITOR"], "recebimentos")).toBe(true);
  });
});

describe("formato dos registros", () => {
  it("dinheiro só em centavos inteiros", () => {
    expect(validarDados("recebimentos", { valorBruto: 100.5 })).toEqual([expect.stringMatching(/centavos/)]);
    expect(validarDados("recebimentos", { valorBruto: 10050, taxa: 300 })).toEqual([]);
  });
  it("data inválida e check-out antes do check-in são recusados", () => {
    expect(validarDados("hospedagens", { checkin: "2026-11-05", checkout: "2026-11-01" })).toContain("Check-out antes do check-in.");
    expect(validarDados("boletos", { vencimento: "05/11/2026" })[0]).toMatch(/Data inválida/);
  });
  it("movimento de enxoval com quantidade zero é recusado", () => {
    expect(validarDados("enxovalMovimentos", { quantidade: 0 })).toHaveLength(1);
  });
});

describe("cenário 11 — travas de fechamento no servidor", () => {
  const fechado = { status: "FECHADO", diferenca: 0 };
  it("caixa fechado não aceita alteração", () => {
    expect(conferirTrava("fechamentosCaixa", fechado, { status: "FECHADO", saldoConferido: 1 }, ["DIRECAO"])).toMatch(/não pode ser alterado/);
  });
  it("reabrir: só Direção e com justificativa", () => {
    expect(conferirTrava("fechamentosCaixa", fechado, { status: "REABERTO", justificativa: "erro" }, ["FINANCEIRO"])).toMatch(/Só a Direção/);
    expect(conferirTrava("fechamentosCaixa", fechado, { status: "REABERTO", justificativa: "" }, ["DIRECAO"])).toMatch(/justificativa/);
    expect(conferirTrava("fechamentosCaixa", fechado, { status: "REABERTO", justificativa: "troco lançado errado" }, ["DIRECAO"])).toBeNull();
  });
  it("caixa com diferença: precisa de justificativa e de quem aprova", () => {
    expect(conferirTrava("fechamentosCaixa", null, { status: "FECHADO", diferenca: -500 }, ["DIRECAO"])).toMatch(/justificativa/);
    expect(conferirTrava("fechamentosCaixa", null, { status: "FECHADO", diferenca: -500, justificativa: "x" }, ["RECEPCAO"])).toMatch(/Direção ou pelo Financeiro/);
    expect(conferirTrava("fechamentosCaixa", null, { status: "FECHADO", diferenca: 0 }, ["RECEPCAO"])).toBeNull();
  });
  it("relatório do dia: Recepção não aprova e não pula etapa", () => {
    expect(conferirTrava("relatoriosDiarios", { status: "CONFERIDO" }, { status: "APROVADO" }, ["RECEPCAO"])).toMatch(/Direção ou do Financeiro/);
    expect(conferirTrava("relatoriosDiarios", { status: "ELABORACAO" }, { status: "FECHADO" }, ["DIRECAO"])).toMatch(/uma etapa/);
    expect(conferirTrava("relatoriosDiarios", { status: "FECHADO" }, { status: "FECHADO", pendencias: "x" }, ["DIRECAO"])).toMatch(/não pode ser alterado/);
  });
});

describe("correção em registro importado", () => {
  it("guarda só o que difere do DataHotel", () => {
    const base = { id: "u1", hospede: "Ana", valorDiaria: 25000, importado: true };
    expect(complementoDe(base, { ...base, valorDiaria: 26000, justificativa: "tarifa acordo" }))
      .toEqual({ valorDiaria: 26000, justificativa: "tarifa acordo" });
  });
});
