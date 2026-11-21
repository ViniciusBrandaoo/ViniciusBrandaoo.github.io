import pg from "pg";
import { describe, expect, it } from "vitest";
import { janelaTrabalhada } from "../../src/dominio/comum/competencia.js";
import { configurarTiposPg } from "../../servidor/tipos-pg.js";

describe("datas vindas do banco", () => {
  it("coluna date chega como texto, não como Date", () => {
    configurarTiposPg(pg);
    const converter = pg.types.getTypeParser(1082 as never) as (v: string) => unknown;
    expect(converter("2026-09-17")).toBe("2026-09-17");
  });

  it("com a data em texto, quem entrou no meio do mês é proporcional", () => {
    configurarTiposPg(pg);
    const converter = pg.types.getTypeParser(1082 as never) as (v: string) => string;
    const janela = janelaTrabalhada("2026-09", converter("2026-09-17"), null);
    expect(janela.parcial).toBe(true);
    expect(janela.dias).toBe(14);
    expect(janela.admitiuNoMes).toBe(true);
  });

  it("um Date no lugar do texto não proporcionaliza (o defeito que isto evita)", () => {
    const janela = janelaTrabalhada("2026-09", new Date("2026-09-17T00:00:00Z") as never, null);
    expect(janela.parcial).toBe(false);
  });
});
