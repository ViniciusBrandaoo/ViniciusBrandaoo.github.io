import { describe, expect, it } from "vitest";
import { reais } from "@/dominio/comum/dinheiro.js";
import { calcularFolha } from "@/dominio/folha/motor.js";
import {
  horistaRelogio,
  mensalista,
  movimento,
  parametros,
  parametrosComCct,
  valorDaRubrica,
} from "../fixtures/folha.js";

describe("mensalista", () => {
  it("paga o salário mensal integral", () => {
    const r = calcularFolha(mensalista(), movimento(), parametros());
    expect(valorDaRubrica(r, "001")).toBe(reais(3000));
  });

  it("não arredonda o valor da hora antes de multiplicar pelas extras", () => {
    // R$ 3.000,00 ÷ 220h = R$ 13,6363… Fixar em R$ 13,64 antes de multiplicar
    // por 20h a 50% daria R$ 409,20 — R$ 0,11 a mais, todo mês, por pessoa.
    const r = calcularFolha(
      mensalista(),
      movimento({ horasExtras50: 20 }),
      parametros(),
    );
    expect(valorDaRubrica(r, "201")).toBe(reais(409.09));
  });

  it("reflete as horas extras no repouso (Súmula 172 TST)", () => {
    const r = calcularFolha(
      mensalista(),
      movimento({ horasExtras50: 20 }),
      parametros(),
    );
    expect(valorDaRubrica(r, "203")).toBe(reais(68.18));
  });

  it("desconta faltas em dias", () => {
    const r = calcularFolha(
      mensalista(),
      movimento({ diasFalta: 3 }),
      parametros(),
    );
    // R$ 3.000,00 ÷ 31 dias × 3 = R$ 290,32
    expect(valorDaRubrica(r, "521")).toBe(reais(290.32));
    expect(r.baseInss).toBe(reais(2709.68));
  });

  it("desconta o repouso perdido por falta injustificada", () => {
    const r = calcularFolha(
      mensalista(),
      movimento({ diasFalta: 1, diasFaltaInjustificada: 1 }),
      parametros(),
    );
    expect(valorDaRubrica(r, "522")).toBe(reais(96.77));
  });

  it("desconta banco de horas negativo autorizado", () => {
    const r = calcularFolha(
      mensalista(),
      movimento({ horasBancoADescontar: 10 }),
      parametros(),
    );
    expect(valorDaRubrica(r, "511")).toBe(reais(136.36));
  });

  it("acusa divisor mensal não configurado em vez de calcular errado", () => {
    const r = calcularFolha(
      mensalista(),
      movimento({ horasExtras50: 20 }),
      parametrosComCct((cct) => ({
        ...cct,
        mensalista: { ...cct.mensalista, divisorMensalHoras: 0 },
      })),
    );
    expect(
      r.avisos.some((a) => a.mensagem.includes("Divisor mensal")),
    ).toBe(true);
    expect(valorDaRubrica(r, "201")).toBeUndefined();
  });

  it("acusa salário abaixo do mínimo em jornada integral", () => {
    const r = calcularFolha(
      mensalista({ salarioBaseMensal: reais(1200) }),
      movimento(),
      parametros(),
    );
    expect(
      r.avisos.some((a) => a.mensagem.includes("abaixo do mínimo vigente")),
    ).toBe(true);
  });

  it("proporcionaliza o mês de admissão", () => {
    const r = calcularFolha(
      mensalista({ dataAdmissao: "2025-08-18" }),
      movimento(),
      parametros(),
    );
    // R$ 3.000,00 × 14/31 = R$ 1.354,84
    expect(valorDaRubrica(r, "001")).toBe(reais(1354.84));
  });
});

describe("horista-relógio", () => {
  it("usa o divisor do próprio regime, não as 4,5 semanas do professor", () => {
    const r = calcularFolha(horistaRelogio(), movimento(), parametros());
    // 40h × 5 semanas × R$ 12,00 = R$ 2.400,00
    expect(valorDaRubrica(r, "051")).toBe(reais(2400));
    expect(valorDaRubrica(r, "052")).toBe(reais(400));
  });

  it("consome o movimento do mês em vez de descartá-lo", () => {
    // O regime chegou a ignorar horas extras e faltas por completo: quem fez
    // 20h extras não recebia nada e a folha fechava sem aviso.
    const r = calcularFolha(
      horistaRelogio(),
      movimento({ horasExtras50: 20, diasFalta: 2, horasBancoADescontar: 5 }),
      parametros(),
    );
    expect(valorDaRubrica(r, "201")).toBe(reais(360));
    expect(valorDaRubrica(r, "203")).toBe(reais(60));
    expect(valorDaRubrica(r, "521")).toBe(reais(160));
    expect(valorDaRubrica(r, "511")).toBe(reais(60));
  });

  it("paga adicional noturno sobre horas", () => {
    const r = calcularFolha(
      horistaRelogio(),
      movimento({ horasNoturnas: 30 }),
      parametros(),
    );
    expect(valorDaRubrica(r, "221")).toBe(reais(72));
  });
});
