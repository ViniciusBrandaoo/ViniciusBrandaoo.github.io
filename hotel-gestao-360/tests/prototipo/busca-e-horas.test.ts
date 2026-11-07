import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const parte = (nome: string) => readFileSync(join(RAIZ, "prototipo", "partes", nome), "utf8");

/** Extrai `U.paraBusca` de interface.js sem precisar de navegador. */
function paraBusca(): (t: unknown) => string {
  const fonte = parte("interface.js");
  const m = fonte.match(/U\.paraBusca = function[\s\S]*?\n\};/);
  if (!m) throw new Error("U.paraBusca não encontrada");
  return new Function("U", `${m[0]}\nreturn U.paraBusca;`)({}) as (t: unknown) => string;
}

describe("busca da folha e dos funcionários", () => {
  const p = paraBusca();
  const contem = (texto: string, termo: string) => p(texto).indexOf(p(termo)) !== -1;

  it("ignora acento, maiúscula e espaços nas pontas", () => {
    expect(contem("André Luiz Gonçalves Pinto", "andre")).toBe(true);
    expect(contem("André Luiz Gonçalves Pinto", "GONCALVES")).toBe(true);
    expect(contem("Andre Cardoso de Araujo", "ANDRÉ")).toBe(true);
    expect(contem("José Rubens", "  jose  ")).toBe(true);
    expect(contem("Maria", "joao")).toBe(false);
  });

  it("aguenta valor vazio ou nulo", () => {
    expect(p(null)).toBe("");
    expect(p(undefined)).toBe("");
  });
});

describe("saldo de horas zerado", () => {
  it("mostra 0h00 sem sinal, e sinal só quando há saldo", () => {
    const fonte = parte("dominio.js");
    const m = fonte.match(/L\.horas = function[\s\S]*?\n\};/);
    if (!m) throw new Error("L.horas não encontrada");
    const horas = new Function("L", `${m[0]}\nreturn L.horas;`)({}) as (n: number) => string;
    expect(horas(0)).toBe("0h00");
    expect(horas(90)).toBe("+1h30");
    expect(horas(-45)).toBe("−0h45");
  });
});
