import { describe, expect, it } from "vitest";
import { centavos, lerDocumento, vencimentoPeloFator } from "../../src/dominio/hotel/ler-documento.js";

const HOJE = "2026-11-21";

describe("lerDocumento", () => {
  it("boleto: valor e vencimento pela linha digitável, conferidos com o que está escrito", () => {
    const texto = `Banco do Brasil  001-9   00190.00009 01234.567890 12345.678901 2 16560000012345
Beneficiário  DISBEK DISTRIBUIDORA LTDA   CNPJ 11.222.333/0001-81
Vencimento 10/12/2026   Valor do Documento 123,45   Nosso Número 12345678`;
    const r = lerDocumento(texto, HOJE);
    expect(r.tipo).toBe("BOLETO");
    expect(r.valor?.valor).toBe(12345);
    expect(r.vencimento?.valor).toBe("2026-12-10");
    expect(r.cnpj?.valor).toBe("11222333000181");
    expect(r.nome?.valor).toBe("DISBEK DISTRIBUIDORA LTDA");
    expect(r.avisos).toEqual([]);
  });

  it("boleto com valor escrito diferente do código de barras gera aviso", () => {
    const r = lerDocumento("00190.00009 01234.567890 12345.678901 2 16560000012345\nVencimento 10/12/2026 Valor do Documento 130,00", HOJE);
    expect(r.valor?.valor).toBe(12345);
    expect(r.avisos.join(" ")).toMatch(/diferente/);
  });

  it("fator de vencimento depois do reinício de 2025", () => {
    expect(vencimentoPeloFator(1656, HOJE)).toBe("2026-12-10");
    expect(vencimentoPeloFator(1000, "2025-03-01")).toBe("2025-02-22");
  });

  it("conta de consumo (arrecadação): valor do código de barras e vencimento escrito", () => {
    const texto = `ENERGISA MATO GROSSO  CNPJ 11.222.333/0001-81
83670000002 1 15900071004 3 70119810109 0 26111000000 1
Vencimento: 15/12/2026    Total a pagar R$ 215,90`;
    const r = lerDocumento(texto, HOJE);
    expect(r.tipo).toBe("CONTA_CONSUMO");
    expect(r.valor?.valor).toBe(215_90);
    expect(r.vencimento?.valor).toBe("2026-12-15");
  });

  it("NF-e: número e emitente pela chave de acesso, total da nota", () => {
    const chave = "5126" + "11" + "11222333000181" + "55" + "001" + "000000428" + "1" + "12345678" + "9";
    const texto = `DANFE  CHAVE DE ACESSO ${chave.match(/.{4}/g)!.join(" ")}
Data da emissão 03/11/2026   VALOR TOTAL DA NOTA 8.600,00`;
    const r = lerDocumento(texto, HOJE);
    expect(r.tipo).toBe("NFE");
    expect(r.documento?.valor).toBe("NF 428");
    expect(r.cnpj?.valor).toBe("11222333000181");
    expect(r.valor?.valor).toBe(860000);
    expect(r.emissao?.valor).toBe("2026-11-03");
  });

  it("comprovante de Pix: valor, data e pagador", () => {
    const texto = `Comprovante de transferência Pix
Valor R$ 285,00
Data 20/11/2026 14:32
Pagador
Nome: Maria Souza Lima
Recebedor ACACIA EMPREENDIMENTOS`;
    const r = lerDocumento(texto, HOJE);
    expect(r.tipo).toBe("COMPROVANTE_PIX");
    expect(r.valor?.valor).toBe(28500);
    expect(r.emissao?.valor).toBe("2026-11-20");
    expect(r.pagador?.valor).toBe("Maria Souza Lima");
  });

  it("não inventa: texto sem nada reconhecível volta vazio", () => {
    const r = lerDocumento("Folha em branco", HOJE);
    expect(r.tipo).toBe("DESCONHECIDO");
    expect(r.valor).toBeUndefined();
    expect(r.vencimento).toBeUndefined();
  });

  it("centavos", () => { expect(centavos("1.234,56")).toBe(123456); expect(centavos("9,90")).toBe(990); });
});
