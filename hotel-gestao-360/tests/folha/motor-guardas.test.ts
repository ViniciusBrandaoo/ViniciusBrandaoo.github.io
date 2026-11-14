import { describe, expect, it } from "vitest";
import { reais } from "@/dominio/comum/dinheiro.js";
import {
  bloqueiosParaConferir,
  calcularFolha,
  statusSugerido,
} from "@/dominio/folha/motor.js";
import {
  SALARIO_MINIMO_2025,
  TABELA_INSS_2025,
  TABELA_IRRF_2025,
} from "@/dominio/folha/tabelas-seed.js";
import {
  divergenciasSobre,
  movimento,
  parametros,
  professor,
  temDivergencia,
  valorDaRubrica,
} from "../fixtures/folha.js";

describe("guardas de parâmetro", () => {
  it("acusa cada tabela cuja vigência não cobre a competência", () => {
    const r = calcularFolha(
      professor(),
      movimento({}, "2026-09"),
      parametros({
        inss: TABELA_INSS_2025,
        irrf: TABELA_IRRF_2025,
        salarioMinimo: SALARIO_MINIMO_2025,
      }),
    );
    expect(divergenciasSobre(r, "INSS").length).toBeGreaterThan(0);
    expect(divergenciasSobre(r, "IRRF").length).toBeGreaterThan(0);
    expect(divergenciasSobre(r, "2026-09").length).toBeGreaterThan(0);
  });

  it("trava o fechamento enquanto o RH não conferir a tabela", () => {
    const p = parametros();
    const r = calcularFolha(
      professor(),
      movimento(),
      { ...p, inss: { ...p.inss, conferidaPorRh: false } },
    );
    expect(divergenciasSobre(r, "conferida pelo RH").length).toBe(1);
    expect(statusSugerido(r)).toBe("COM_DIVERGENCIA");
  });

  it("não confunde competência sem zero à esquerda com fora de vigência", () => {
    const r = calcularFolha(professor(), movimento({}, "2025-8"), parametros());
    expect(temDivergencia(r)).toBe(false);
    expect(r.competencia).toBe("2025-08");
  });

  it("recusa competência malformada", () => {
    const r = calcularFolha(professor(), movimento({}, "2026-13"), parametros());
    expect(divergenciasSobre(r, "inválida").length).toBe(1);
  });

  it("acusa tabela de faixas cadastrada fora de ordem", () => {
    const p = parametros();
    const r = calcularFolha(professor(), movimento(), {
      ...p,
      inss: { ...p.inss, faixas: [...p.inss.faixas].reverse() },
    });
    expect(divergenciasSobre(r, "ordem crescente").length).toBeGreaterThan(0);
  });

  it("acusa tabela de INSS sem faixa alguma em vez de descontar zero calado", () => {
    const p = parametros();
    const r = calcularFolha(professor(), movimento(), {
      ...p,
      inss: { ...p.inss, faixas: [] },
    });
    expect(valorDaRubrica(r, "601")).toBe(0);
    expect(divergenciasSobre(r, "sem nenhuma faixa").length).toBe(1);
  });
});

describe("lançamentos avulsos", () => {
  it("desconto redutor reduz as três bases pelo mesmo valor", () => {
    const r = calcularFolha(
      professor(),
      movimento({
        outrosDescontos: [
          {
            descricao: "Adiantamento de aulas não compensadas",
            valor: reais(500),
            naturezaBase: "REDUZ",
            incideInss: true,
            incideIrrf: true,
            incideFgts: true,
          },
        ],
      }),
      parametros(),
    );
    expect(r.baseInss).toBe(reais(2125));
    expect(r.baseIrrf).toBe(reais(2125));
    expect(r.baseFgts).toBe(reais(2125));
    expect(valorDaRubrica(r, "601")).toBe(reais(168.48));
  });

  it("desconto neutro não mexe em base nenhuma", () => {
    // Consignado, coparticipação e adiantamento não reduzem base de INSS/IRRF.
    const r = calcularFolha(
      professor(),
      movimento({
        outrosDescontos: [
          {
            descricao: "Empréstimo consignado",
            valor: reais(500),
            naturezaBase: "NEUTRA",
            incideInss: false,
            incideIrrf: false,
            incideFgts: false,
          },
        ],
      }),
      parametros(),
    );
    expect(r.baseInss).toBe(reais(2625));
    expect(r.baseFgts).toBe(reais(2625));
    expect(r.liquido).toBe(reais(1911.52));
  });

  it("provento sem incidência de FGTS ainda entra no custo do empregador", () => {
    const r = calcularFolha(
      professor(),
      movimento({
        outrosProventos: [
          {
            descricao: "Reembolso de material",
            valor: reais(400),
            naturezaBase: "INTEGRA",
            incideInss: false,
            incideIrrf: false,
            incideFgts: false,
          },
        ],
      }),
      parametros(),
    );
    expect(r.baseFgts).toBe(reais(2625));
    expect(r.remuneracaoBruta).toBe(reais(3025));
    expect(r.custoTotalEmpregador).toBeGreaterThan(reais(3025));
  });
});

describe("pensão alimentícia", () => {
  it("aceita valor fixo e o deduz da base do IRRF", () => {
    const r = calcularFolha(
      professor({ valorHoraAula: reais(65) }),
      movimento({ pensao: { modo: "VALOR", quantidade: reais(800) } }),
      parametros(),
    );
    expect(valorDaRubrica(r, "604")).toBe(reais(800));
    const semPensao = calcularFolha(
      professor({ valorHoraAula: reais(65) }),
      movimento(),
      parametros(),
    );
    expect(valorDaRubrica(r, "602")).toBeLessThan(
      valorDaRubrica(semPensao, "602") ?? 0,
    );
  });

  it("resolve percentual sobre o salário mínimo sem circularidade", () => {
    const r = calcularFolha(
      professor(),
      movimento({
        pensao: { modo: "PERCENTUAL_SALARIO_MINIMO", quantidade: 30 },
      }),
      parametros(),
    );
    expect(valorDaRubrica(r, "604")).toBe(reais(455.4));
  });

  it("resolve percentual do líquido usando o líquido antes da própria pensão", () => {
    const r = calcularFolha(
      professor(),
      movimento({ pensao: { modo: "PERCENTUAL_LIQUIDO", quantidade: 20 } }),
      parametros(),
    );
    // Líquido antes da pensão = 2.625,00 − 213,48 − 0 = 2.411,52 → 20% = 482,30
    expect(valorDaRubrica(r, "604")).toBe(reais(482.3));
    expect(r.liquido).toBe(reais(1929.22));
  });
});

describe("estado da folha", () => {
  it("acusa líquido negativo em vez de emitir holerite inválido", () => {
    const r = calcularFolha(
      professor(),
      movimento({
        outrosDescontos: [
          {
            descricao: "Acerto",
            valor: reais(5000),
            naturezaBase: "NEUTRA",
            incideInss: false,
            incideIrrf: false,
            incideFgts: false,
          },
        ],
      }),
      parametros(),
    );
    expect(r.liquido).toBeLessThan(0);
    expect(divergenciasSobre(r, "Líquido negativo").length).toBe(1);
  });

  it("avisa sobre líquido zerado sem tratá-lo como erro", () => {
    const r = calcularFolha(
      professor(),
      movimento({
        outrosDescontos: [
          {
            descricao: "Acerto integral",
            valor: reais(2411.52),
            naturezaBase: "NEUTRA",
            incideInss: false,
            incideIrrf: false,
            incideFgts: false,
          },
        ],
      }),
      parametros(),
    );
    expect(r.liquido).toBe(0);
    expect(temDivergencia(r)).toBe(false);
    expect(r.avisos.some((a) => a.severidade === "ATENCAO")).toBe(true);
  });

  it("só bloqueia a conferência por divergência, não por atenção", () => {
    const comAtencao = calcularFolha(
      professor({ dataAdmissao: "2025-08-18" }),
      movimento(),
      parametros(),
    );
    expect(bloqueiosParaConferir(comAtencao)).toEqual([]);
    expect(statusSugerido(comAtencao)).toBe("EM_CALCULO");
  });
});

describe("pureza do motor", () => {
  it("devolve o mesmo resultado em duas execuções", () => {
    const a = calcularFolha(professor(), movimento(), parametros());
    const b = calcularFolha(professor(), movimento(), parametros());
    expect(a).toEqual(b);
  });

  it("não altera contrato, movimento nem parâmetros recebidos", () => {
    const contrato = professor();
    const mov = movimento({ aulasExtras: 3 });
    const params = parametros();
    const antes = structuredClone({ contrato, mov, params });
    calcularFolha(contrato, mov, params);
    expect({ contrato, mov, params }).toEqual(antes);
  });
});
