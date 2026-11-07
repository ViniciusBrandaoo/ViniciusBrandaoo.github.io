import { describe, expect, it } from "vitest";
import {
  competenciaIso, dataIso, documento, inteiro, texto, umDe, validarAno, validarAusencia, validarConta,
  validarContrato, validarFornecedor, validarLancamentoBanco, validarSolicitacao, validarCamposFuncionario,
} from "../../servidor/validacao.js";

const UUID = "11111111-2222-3333-4444-555555555555";
const falha = (fn: () => unknown) => { try { fn(); } catch (e) { return e as Error & { statusCode: number }; } throw new Error("não lançou"); };

describe("validação de entrada (mensagens de uso, nunca erro de banco)", () => {
  it("texto: só espaços e tamanho absurdo são recusados com frase clara", () => {
    expect(falha(() => texto("   ", "a descrição", { obrigatorio: true })).message).toMatch(/só com espaços/);
    expect(falha(() => texto("x".repeat(30000), "o nome", { max: 150 })).message).toMatch(/muito longo/);
    expect(falha(() => texto(5, "o nome")).message).toMatch(/precisa ser um texto/);
    expect(texto("  ok  ", "o nome")).toBe("ok");
  });

  it("inteiro: decimal, texto, negativo e absurdo", () => {
    expect(falha(() => inteiro(1.5, "o valor")).message).toMatch(/inteiro/);
    expect(falha(() => inteiro("150,00", "o valor")).message).toMatch(/número/);
    expect(falha(() => inteiro(-1, "o valor", { min: 0 })).message).toMatch(/negativo/);
    expect(falha(() => inteiro(0, "o valor", { min: 1 })).message).toMatch(/maior que zero/);
    expect(falha(() => inteiro(1e30, "o valor", { max: 100 })).message).toMatch(/acima do limite/);
  });

  it("datas e competências inexistentes", () => {
    expect(falha(() => dataIso("2026-02-31", "o vencimento")).message).toMatch(/não existe no calendário/);
    expect(falha(() => dataIso("1900-01-01", "a data")).message).toMatch(/fora do intervalo/);
    expect(falha(() => dataIso(20260910, "a data")).message).toMatch(/AAAA-MM-DD/);
    expect(falha(() => competenciaIso("2026-13")).message).toMatch(/AAAA-MM/);
    expect(competenciaIso("2026-09")).toBe("2026-09");
  });

  it("listas fechadas e documentos", () => {
    expect(falha(() => umDe("XX", "o status", ["A", "B"] as const)).message).toMatch(/Opções: A, B/);
    expect(falha(() => documento("123", "CNPJ", "o CNPJ")).message).toMatch(/14 números/);
    expect(documento("11.222.333/0001-81", "CNPJ", "o CNPJ")).toBeTruthy();
    expect(falha(() => validarAno("abc")).statusCode).toBe(400);
  });

  it("conta a pagar: valor, categoria em branco, status e datas", () => {
    const ok = { descricao: "Luz", categoria: "Estrutura", valorCentavos: 15000, competencia: "2026-09", vencimento: "2026-09-20" };
    expect(validarConta(ok, false)).toMatchObject({ descricao: "Luz", valorCentavos: 15000 });
    expect(falha(() => validarConta({ ...ok, descricao: "  " }, false)).message).toMatch(/descrição/);
    expect(falha(() => validarConta({ ...ok, valorCentavos: -100 }, false)).message).toMatch(/maior que zero/);
    expect(falha(() => validarConta({ ...ok, status: "XX" }, false)).message).toMatch(/Opções/);
    expect(falha(() => validarConta([], false)).statusCode).toBe(400);
    // edição parcial: campo apagado vai vazio e preserva o vazio
    expect(validarConta({ observacoes: "", numeroDocumento: "" }, true)).toMatchObject({ observacoes: "", numeroDocumento: "" });
    expect(falha(() => validarConta({ descricao: "" }, true)).message).toMatch(/descrição/);
  });

  it("fornecedor: razão em branco, documento do tamanho errado, e-mail", () => {
    const ok = { razaoSocial: "Papelaria", tipoDocumento: "CNPJ", documento: "11222333000181" };
    expect(validarFornecedor(ok, false)).toMatchObject({ razaoSocial: "Papelaria" });
    expect(falha(() => validarFornecedor({ ...ok, razaoSocial: "   " }, false)).message).toMatch(/razão social/);
    expect(falha(() => validarFornecedor({ ...ok, documento: "123" }, false)).message).toMatch(/14 números/);
    expect(falha(() => validarFornecedor({ ...ok, email: "nao" }, false)).message).toMatch(/E-mail inválido/);
    expect(falha(() => validarFornecedor({ razaoSocial: 5, tipoDocumento: 5, documento: 5 }, false)).statusCode).toBeLessThan(500);
  });

  it("contrato: término antes do início e valor negativo", () => {
    const ok = { objeto: "Limpeza", dataInicio: "2026-05-01", valorCentavos: 100 };
    expect(validarContrato(ok, false)).toMatchObject({ objeto: "Limpeza" });
    expect(falha(() => validarContrato({ ...ok, dataFim: "2026-01-01" }, false)).message).toMatch(/anterior/);
    expect(falha(() => validarContrato({ ...ok, valorCentavos: -1 }, false)).message).toMatch(/negativo/);
    expect(validarContrato({ dataFim: "" }, true)).toMatchObject({ dataFim: "" });
  });

  it("ausência e banco de horas", () => {
    const a = { funcionarioId: UUID, inicio: "2026-10-10", fim: "2026-10-05" };
    expect(falha(() => validarAusencia(a)).message).toMatch(/anterior/);
    expect(falha(() => validarAusencia({ ...a, fim: "2099-01-01" })).message).toMatch(/mais de um ano/);
    expect(falha(() => validarAusencia({ ...a, funcionarioId: "abc", fim: "2026-10-12" })).statusCode).toBe(404);

    const b = { funcionarioId: UUID, dia: "2026-09-10", minutos: -90, justificativa: "compensação" };
    expect(validarLancamentoBanco(b)).toMatchObject({ minutos: -90 });
    expect(falha(() => validarLancamentoBanco({ ...b, justificativa: undefined })).message).toMatch(/justificativa/);
    expect(falha(() => validarLancamentoBanco({ ...b, minutos: 99999999999999 })).message).toMatch(/Confira o valor/);
    expect(falha(() => validarLancamentoBanco({ ...b, minutos: 1.5 })).message).toMatch(/inteiro/);
  });

  it("solicitação", () => {
    const s = { tipo: "COMPRA", titulo: "Toner", justificativa: "acabou" };
    expect(validarSolicitacao(s)).toMatchObject({ titulo: "Toner" });
    expect(falha(() => validarSolicitacao({ ...s, titulo: "  " })).message).toMatch(/título/);
    expect(falha(() => validarSolicitacao({ ...s, tipo: "XX" })).message).toMatch(/Opções/);
    expect(falha(() => validarSolicitacao({ ...s, valorCentavos: -5 })).message).toMatch(/negativo/);
  });

  it("cadastro de funcionário: tipo errado vira 4xx, nunca 500", () => {
    expect(falha(() => validarCamposFuncionario({ nome: 5 })).statusCode).toBeLessThan(500);
    expect(falha(() => validarCamposFuncionario({ nome: "A".repeat(30000) })).message).toMatch(/muito longo/);
    expect(falha(() => validarCamposFuncionario({ salarioBaseCentavos: "abc" })).message).toMatch(/salário base/);
    expect(falha(() => validarCamposFuncionario({ temMei: "sim" })).message).toMatch(/sim ou não/);
    expect(() => validarCamposFuncionario({ nome: "Maria", salarioBaseCentavos: 300000, dependentesIrrf: 2 })).not.toThrow();
  });
});

describe("CNPJ e banco de horas (rodada 3)", () => {
  it("CNPJ confere os dígitos verificadores", () => {
    expect(documento("12.345.678/0001-95", "CNPJ", "o CNPJ")).toBeTruthy();
    expect(falha(() => documento("11111111111111", "CNPJ", "o CNPJ")).message).toMatch(/não é um CNPJ válido/);
    expect(falha(() => documento("12345678000196", "CNPJ", "o CNPJ")).message).toMatch(/não é um CNPJ válido/);
  });
  it("banco de horas recusa data no futuro", () => {
    const base = { funcionarioId: UUID, minutos: 60, justificativa: "ajuste" };
    expect(falha(() => validarLancamentoBanco({ ...base, dia: "2099-01-01" })).message).toMatch(/no futuro/);
    expect(validarLancamentoBanco({ ...base, dia: "2026-09-10" }).dia).toBe("2026-09-10");
  });
});
