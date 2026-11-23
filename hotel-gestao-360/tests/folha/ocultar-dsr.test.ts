import { describe, expect, it } from "vitest";
import { calcularFolha } from "@/dominio/folha/motor.js";
import { movimento, parametros, professor } from "../fixtures/folha.js";

describe("DSR escondido", () => {
  it("continua pago: o total não muda e a linha some, somada nas aulas", () => {
    const normal = calcularFolha(professor(), movimento({}), parametros());
    const oculto = calcularFolha(professor(), movimento({}), { ...parametros(), ocultarDsr: true });

    expect(normal.rubricas.some((r) => /^DSR sobre/i.test(r.descricao))).toBe(true);
    expect(oculto.rubricas.some((r) => /^DSR sobre/i.test(r.descricao))).toBe(false);
    expect(oculto.totalProventos).toBe(normal.totalProventos);
    expect(oculto.liquido).toBe(normal.liquido);
    expect(oculto.baseInss).toBe(normal.baseInss);
    expect(oculto.memoria.some((m) => /^(Repouso semanal|DSR)/i.test(m.titulo))).toBe(false);
    const aulas = (r: typeof normal) => r.rubricas.find((x) => x.codigo === "101")!.valor;
    const dsr = normal.rubricas.find((x) => x.codigo === "102")!.valor;
    expect(aulas(oculto)).toBe(aulas(normal) + dsr);
  });
});

describe("DSR escondido: perda por falta injustificada", () => {
  it("continua descontada, mas sem a palavra DSR/repouso em rubrica nem memória", () => {
    const m = movimento({ semanasComFaltaInjustificada: 2 } as never);
    const normal = calcularFolha(professor(), m, parametros());
    const oculto = calcularFolha(professor(), m, { ...parametros(), ocultarDsr: true });
    const perda = (r: typeof normal) => r.rubricas.filter((x) => x.tipo === "DESCONTO" && x.codigo === "502");
    expect(perda(normal).length).toBeGreaterThan(0);
    expect(perda(oculto)[0]!.valor).toBe(perda(normal)[0]!.valor);
    expect(oculto.liquido).toBe(normal.liquido);
    const textos = [
      ...oculto.rubricas.flatMap((r) => [r.descricao, r.referencia]),
      ...oculto.memoria.flatMap((x) => [x.titulo, x.formula, x.fundamento ?? ""]),
    ].join(" | ");
    expect(textos.match(/.{30}(DSR|repouso).{30}/gi)).toBeNull();
  });
});
