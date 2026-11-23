import { describe, expect, it } from "vitest";
import {
  dentroDaVigencia,
  diasNoMes,
  ehCompetenciaValida,
  janelaTrabalhada,
  normalizar,
  ultimoDia,
} from "@/dominio/comum/competencia.js";

describe("normalização da competência", () => {
  it("completa o zero à esquerda do mês", () => {
    expect(normalizar("2025-8")).toBe("2025-08");
    expect(normalizar("2025-08")).toBe("2025-08");
  });

  it("rejeita mês fora de 1 a 12", () => {
    expect(ehCompetenciaValida("2026-13")).toBe(false);
    expect(ehCompetenciaValida("2026-00")).toBe(false);
    expect(ehCompetenciaValida("abcdefg")).toBe(false);
    expect(ehCompetenciaValida("2026-09")).toBe(true);
  });

  it("conhece o tamanho do mês, inclusive fevereiro bissexto", () => {
    expect(diasNoMes("2025-02")).toBe(28);
    expect(diasNoMes("2024-02")).toBe(29);
    expect(diasNoMes("2025-08")).toBe(31);
    expect(ultimoDia("2025-09")).toBe("2025-09-30");
  });
});

describe("vigência", () => {
  const vigencia2025 = { inicio: "2025-01-01", fim: "2025-12-31" };

  it("aceita as bordas exatas do período", () => {
    expect(dentroDaVigencia("2025-01", vigencia2025)).toBe(true);
    expect(dentroDaVigencia("2025-12", vigencia2025)).toBe(true);
  });

  it("recusa a competência seguinte ao fim da vigência", () => {
    expect(dentroDaVigencia("2026-01", vigencia2025)).toBe(false);
  });

  it("não se confunde com competência sem zero à esquerda", () => {
    // "2025-8-01" > "2025-12-31" na comparação de texto: sem normalizar, a
    // folha de agosto acusaria divergência falsa e travaria o fechamento.
    expect(dentroDaVigencia("2025-8", vigencia2025)).toBe(true);
  });

  it("trata fim nulo como vigente indefinidamente", () => {
    expect(dentroDaVigencia("2099-01", { inicio: "2025-01-01", fim: null })).toBe(
      true,
    );
  });
});

describe("janela trabalhada na competência", () => {
  it("devolve o mês inteiro para vínculo já ativo", () => {
    const j = janelaTrabalhada("2025-08", "2022-02-01", null);
    expect(j.dias).toBe(31);
    expect(j.fator).toBe(1);
    expect(j.parcial).toBe(false);
  });

  it("conta só os dias a partir da admissão", () => {
    const j = janelaTrabalhada("2025-08", "2025-08-18", null);
    expect(j.dias).toBe(14);
    expect(j.parcial).toBe(true);
    expect(j.admitiuNoMes).toBe(true);
  });

  it("conta só os dias até o desligamento", () => {
    const j = janelaTrabalhada("2025-08", "2022-02-01", "2025-08-10");
    expect(j.dias).toBe(10);
    expect(j.desligouNoMes).toBe(true);
  });

  it("devolve zero dia quando o vínculo não existia na competência", () => {
    const j = janelaTrabalhada("2025-08", "2025-10-01", null);
    expect(j.dias).toBe(0);
    expect(j.fator).toBe(0);
  });

  it("devolve zero dia para competência posterior ao desligamento", () => {
    const j = janelaTrabalhada("2025-08", "2020-01-01", "2025-06-30");
    expect(j.dias).toBe(0);
  });
});
