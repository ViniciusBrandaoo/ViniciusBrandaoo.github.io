import { describe, expect, it } from "vitest";
import { reais } from "@/dominio/comum/dinheiro.js";
import {
  calcularPrestador,
  PARAMETROS_PRESTADOR_PADRAO,
  type ContratoPrestador,
} from "@/dominio/folha/prestador.js";

function prestador(ajustes: Partial<ContratoPrestador> = {}): ContratoPrestador {
  return {
    prestadorId: "pj-001",
    nome: "Marina Alves",
    enquadramento: "MEI",
    cnpj: "12.345.678/0001-90",
    servico: "Oficina de robótica",
    servicoComCppNoMei: false,
    issRetidoNaFonte: false,
    valorMensal: reais(2800),
    dataInicio: "2025-02-01",
    dataFim: null,
    temHorarioFixo: false,
    temExclusividade: false,
    temSubordinacaoDireta: false,
    substituivelPorOutro: true,
    ...ajustes,
  };
}

describe("MEI", () => {
  it("paga a nota cheia: não há retenção sobre optante do Simples", () => {
    const r = calcularPrestador(prestador(), "2025-08");
    expect(r.retencoes).toEqual([]);
    expect(r.liquidoAPagar).toBe(reais(2800));
    expect(r.custoTotal).toBe(reais(2800));
  });

  it("não gera FGTS, 13º nem férias — o custo é só a nota", () => {
    const r = calcularPrestador(prestador(), "2025-08");
    // Um professor CLT de mesma remuneração custaria cerca de 60% a mais.
    expect(r.custoTotal).toBe(r.valorBruto);
    expect(r.encargoContratante).toBe(0);
    expect(
      r.avisos.some((a) => a.mensagem.includes("não gera FGTS")),
    ).toBe(true);
  });

  it("cobra CPP de 20% apenas nos serviços do art. 18-B", () => {
    const semCpp = calcularPrestador(prestador(), "2025-08");
    expect(semCpp.encargoContratante).toBe(0);

    const comCpp = calcularPrestador(
      prestador({ servico: "Manutenção elétrica", servicoComCppNoMei: true }),
      "2025-08",
    );
    expect(comCpp.encargoContratante).toBe(reais(560));
    expect(comCpp.custoTotal).toBe(reais(3360));
    // A CPP é encargo da escola: não sai do valor do prestador.
    expect(comCpp.liquidoAPagar).toBe(reais(2800));
  });

  it("retém ISS quando o município exige", () => {
    const r = calcularPrestador(
      prestador({ issRetidoNaFonte: true }),
      "2025-08",
      { ...PARAMETROS_PRESTADOR_PADRAO, issPercentual: 5 },
    );
    expect(r.totalRetencoes).toBe(reais(140));
    expect(r.liquidoAPagar).toBe(reais(2660));
  });
});

describe("PJ fora do Simples", () => {
  it("sofre IRRF e CSRF", () => {
    const r = calcularPrestador(
      prestador({ enquadramento: "PJ_LUCRO_PRESUMIDO" }),
      "2025-08",
    );
    // IRRF 1,5% = 42,00 · CSRF 4,65% = 130,20
    expect(r.retencoes.map((x) => x.valor)).toEqual([reais(42), reais(130.2)]);
    expect(r.liquidoAPagar).toBe(reais(2627.8));
  });

  it("dispensa a CSRF abaixo do piso de retenção", () => {
    const r = calcularPrestador(
      prestador({ enquadramento: "PJ_LUCRO_PRESUMIDO", valorMensal: reais(200) }),
      "2025-08",
    );
    expect(r.retencoes.map((x) => x.descricao)).toEqual(["IRRF sobre serviço"]);
  });
});

describe("risco de reconhecimento de vínculo", () => {
  it("acusa divergência quando há dois ou mais sinais de subordinação", () => {
    // O caso que preocupa numa escola: professor "MEI" com horário de aula
    // fixo, exclusividade e ordens da coordenação.
    const r = calcularPrestador(
      prestador({
        temHorarioFixo: true,
        temExclusividade: true,
        temSubordinacaoDireta: true,
        substituivelPorOutro: false,
      }),
      "2025-08",
    );
    const divergencia = r.avisos.find((a) => a.severidade === "DIVERGENCIA");
    expect(divergencia).toBeDefined();
    expect(divergencia?.mensagem).toContain("vínculo empregatício");
    expect(divergencia?.mensagem).toContain("CLT art. 3º");
  });

  it("apenas alerta quando o sinal é isolado", () => {
    const r = calcularPrestador(prestador({ temHorarioFixo: true }), "2025-08");
    expect(r.avisos.some((a) => a.severidade === "DIVERGENCIA")).toBe(false);
    expect(r.avisos.some((a) => a.severidade === "ATENCAO")).toBe(true);
  });

  it("não alerta quando o prestador é autônomo de fato", () => {
    const r = calcularPrestador(prestador(), "2025-08");
    expect(r.avisos.every((a) => a.severidade === "INFO")).toBe(true);
  });
});

describe("mês de início do contrato", () => {
  it("começou dia 19 de outubro: paga 13 de 31 dias do valor mensal", () => {
    const r = calcularPrestador(prestador({ valorMensal: reais(7000), dataInicio: "2026-10-19" }), "2026-10");
    expect(r.valorBruto).toBe(Math.round((reais(7000) * 13) / 31));
    expect(r.memoria.some((m) => /proporcional/.test(m.titulo))).toBe(true);
    expect(r.avisos.some((a) => /13 de 31 dias/.test(a.mensagem))).toBe(true);
  });

  it("no mês seguinte volta ao valor cheio", () => {
    const r = calcularPrestador(prestador({ valorMensal: reais(7000), dataInicio: "2026-10-19" }), "2026-11");
    expect(r.valorBruto).toBe(reais(7000));
  });

  it("começou no dia 1º: valor cheio, sem aviso", () => {
    const r = calcularPrestador(prestador({ valorMensal: reais(7000), dataInicio: "2026-10-01" }), "2026-10");
    expect(r.valorBruto).toBe(reais(7000));
    expect(r.avisos.some((a) => /proporcional/.test(a.mensagem))).toBe(false);
  });
});
