import { beforeAll, describe, expect, it } from "vitest";
import { reais } from "@/dominio/comum/dinheiro.js";
import { calcularFolha } from "@/dominio/folha/motor.js";
import type { ResultadoFolha } from "@/dominio/folha/tipos.js";
import {
  movimento,
  parametros,
  parametrosComCct,
  professor,
  temDivergencia,
  valorDaRubrica,
} from "../fixtures/folha.js";

describe("remuneração base", () => {
  let r: ResultadoFolha;
  beforeAll(() => {
    r = calcularFolha(professor(), movimento(), parametros());
  });

  it("apura as aulas do mês em 4,5 semanas (CLT art. 320 §1º)", () => {
    // 20 aulas × 4,5 semanas × R$ 25,00 = R$ 2.250,00
    expect(valorDaRubrica(r, "101")).toBe(reais(2250));
  });

  it("acrescenta 1/6 de DSR sobre as aulas (Súmula 351 TST)", () => {
    expect(valorDaRubrica(r, "102")).toBe(reais(375));
  });

  it("compõe as três bases com aulas + DSR", () => {
    expect(r.baseInss).toBe(reais(2625));
    expect(r.baseIrrf).toBe(reais(2625));
    expect(r.baseFgts).toBe(reais(2625));
  });

  it("desconta INSS pela tabela progressiva, não por alíquota única", () => {
    // 1.518,00 × 7,5% = 113,85 | (2.625,00 − 1.518,00) × 9% = 99,63 → 213,48
    // Alíquota única de 9% daria R$ 236,25: R$ 22,77 a mais por professor/mês.
    expect(valorDaRubrica(r, "601")).toBe(reais(213.48));
  });

  it("isenta de IRRF pela base mais favorável", () => {
    expect(valorDaRubrica(r, "602")).toBe(0);
  });

  it("apura o líquido e não deixa encargo entrar nele", () => {
    expect(r.liquido).toBe(reais(2411.52));
    expect(r.totalProventos).toBe(reais(2625));
  });

  it("calcula FGTS e contribuição patronal como custo da escola", () => {
    expect(valorDaRubrica(r, "801")).toBe(reais(210));
    // CPP 20% + RAT 1% + terceiros 5,8% = 26,8%
    expect(valorDaRubrica(r, "802")).toBe(reais(703.5));
    expect(r.custoTotalEmpregador).toBeGreaterThan(r.remuneracaoBruta);
  });

  it("não deixa passo de memória sem fundamento legal", () => {
    expect(r.memoria.length).toBeGreaterThan(0);
    expect(r.memoria.every((p) => p.fundamento.length > 0)).toBe(true);
  });

  it("não acusa divergência quando tudo está cadastrado", () => {
    expect(temDivergencia(r)).toBe(false);
  });
});

describe("aulas extras e substituições", () => {
  it("paga a aula eventual com o reflexo de repouso", () => {
    const r = calcularFolha(
      professor(),
      movimento({ aulasExtras: 6, aulasSubstituicao: 4 }),
      parametros(),
    );
    expect(valorDaRubrica(r, "111")).toBe(reais(250));
    expect(valorDaRubrica(r, "112")).toBe(reais(41.67));
  });

  it("usa o calendário da competência quando ele existe", () => {
    // Setembro/2025: 25 dias úteis e 6 repousos → 6/25 = 0,24, não 1/6.
    const r = calcularFolha(
      professor(),
      movimento({
        aulasExtras: 10,
        diasUteisCompetencia: 25,
        repousosCompetencia: 6,
      }),
      parametros(),
    );
    expect(valorDaRubrica(r, "111")).toBe(reais(250));
    expect(valorDaRubrica(r, "112")).toBe(reais(60));
  });

  it("aplica o adicional de aula extra previsto na convenção", () => {
    const r = calcularFolha(
      professor(),
      movimento({ aulasExtras: 10 }),
      parametrosComCct((cct) => ({
        ...cct,
        horaAula: { ...cct.horaAula, percentualAulaExtra: 50 },
      })),
    );
    expect(valorDaRubrica(r, "111")).toBe(reais(375));
  });
});

describe("carga extra semanal", () => {
  it("multiplica pelas semanas do mês, como a carga regular", () => {
    // 12 aulas/semana de monitoria a R$ 25,00: 12 × 4,5 × 25 = R$ 1.350,00
    // mais 1/6 de DSR. Tratar como avulsa pagaria R$ 300,00 — um quarto.
    const r = calcularFolha(
      professor(),
      movimento({ aulasExtrasSemanais: 12 }),
      parametros(),
    );
    expect(valorDaRubrica(r, "115")).toBe(reais(1350));
    expect(valorDaRubrica(r, "116")).toBe(reais(225));
  });

  it("usa a hora-aula própria da extra quando informada", () => {
    const r = calcularFolha(
      professor(),
      movimento({ aulasExtrasSemanais: 4, valorHoraExtra: reais(30.3) }),
      parametros(),
    );
    // 4 × 4,5 × 30,30 = R$ 545,40
    expect(valorDaRubrica(r, "115")).toBe(reais(545.4));
  });

  it("convive com aula avulsa sem se confundir com ela", () => {
    const r = calcularFolha(
      professor(),
      movimento({ aulasExtrasSemanais: 2, aulasSubstituicao: 3 }),
      parametros(),
    );
    expect(valorDaRubrica(r, "115")).toBe(reais(225)); // 2 × 4,5 × 25
    expect(valorDaRubrica(r, "111")).toBe(reais(75)); //  3 × 25
  });
});

describe("adicional noturno", () => {
  it("reflete no repouso, como as aulas extras (Súmula 60 TST)", () => {
    const r = calcularFolha(
      professor(),
      movimento({ aulasNoturnas: 20 }),
      parametros(),
    );
    expect(valorDaRubrica(r, "121")).toBe(reais(100));
    expect(valorDaRubrica(r, "122")).toBe(reais(16.67));
  });

  it("dispensa o reflexo quando a convenção não o prevê", () => {
    const r = calcularFolha(
      professor(),
      movimento({ aulasNoturnas: 20 }),
      parametrosComCct((cct) => ({
        ...cct,
        horaAula: { ...cct.horaAula, reflexoDsrSobreAdicionalNoturno: false },
      })),
    );
    expect(valorDaRubrica(r, "122")).toBeUndefined();
  });
});

describe("hora-atividade", () => {
  it("entra no salário base e gera DSR próprio", () => {
    const r = calcularFolha(
      professor(),
      movimento(),
      parametrosComCct((cct) => ({
        ...cct,
        horaAula: { ...cct.horaAula, percentualHoraAtividade: 20 },
      })),
    );
    // 20% de R$ 2.250,00 = R$ 450,00, mais 1/6 de DSR.
    expect(valorDaRubrica(r, "103")).toBe(reais(450));
    expect(valorDaRubrica(r, "104")).toBe(reais(75));
    expect(r.baseInss).toBe(reais(3150));
  });
});

describe("faltas", () => {
  it("desconta as aulas não ministradas e o DSR da semana", () => {
    const r = calcularFolha(
      professor(),
      movimento({ aulasNaoDadas: 4, semanasComFaltaInjustificada: 1 }),
      parametros(),
    );
    expect(valorDaRubrica(r, "501")).toBe(reais(100));
    // DSR de uma semana = (20 × R$ 25,00) ÷ 6 = R$ 83,33
    expect(valorDaRubrica(r, "502")).toBe(reais(83.33));
  });

  it("reduz as três bases pelo mesmo valor", () => {
    const r = calcularFolha(
      professor(),
      movimento({ aulasNaoDadas: 4 }),
      parametros(),
    );
    expect(r.baseInss).toBe(reais(2525));
    expect(r.baseIrrf).toBe(reais(2525));
    expect(r.baseFgts).toBe(reais(2525));
  });

  it("limita as semanas com falta às semanas da competência", () => {
    const r = calcularFolha(
      professor(),
      movimento({ semanasComFaltaInjustificada: 9 }),
      parametros(),
    );
    // 4,5 semanas por mês → no máximo 4 repousos perdidos.
    expect(valorDaRubrica(r, "502")).toBe(reais(333.32));
    expect(r.avisos.some((a) => a.mensagem.includes("limitado"))).toBe(true);
  });

  it("acusa divergência quando a falta zera a remuneração", () => {
    const r = calcularFolha(
      professor(),
      movimento({ aulasNaoDadas: 200 }),
      parametros(),
    );
    expect(
      r.avisos.some((a) => a.mensagem.includes("Base de cálculo negativa")),
    ).toBe(true);
    expect(valorDaRubrica(r, "801")).toBe(0);
  });
});

describe("apuração por aulas efetivas", () => {
  const porEfetivas = () =>
    parametrosComCct((cct) => ({
      ...cct,
      horaAula: { ...cct.horaAula, modoApuracao: "AULAS_EFETIVAS" as const },
    }));

  it("garante o piso do art. 322 no recesso escolar", () => {
    // Janeiro e julho não têm aula lançada. Sem o piso, o professor ficaria
    // sem salário em 2 dos 12 meses — folha ilegal.
    const r = calcularFolha(professor(), movimento({ aulasEfetivas: 0 }), porEfetivas());
    expect(valorDaRubrica(r, "101")).toBe(reais(2250));
    expect(r.avisos.some((a) => a.mensagem.includes("piso da grade"))).toBe(true);
  });

  it("desconta do piso apenas as aulas que o professor deixou de dar", () => {
    const r = calcularFolha(
      professor(),
      movimento({ aulasEfetivas: 60, aulasNaoDadas: 6 }),
      porEfetivas(),
    );
    // Piso = 90 − 6 = 84 aulas, acima das 60 lançadas.
    expect(valorDaRubrica(r, "101")).toBe(reais(2100));
  });

  it("não desconta a mesma falta duas vezes", () => {
    const r = calcularFolha(
      professor(),
      movimento({ aulasEfetivas: 84, aulasNaoDadas: 6 }),
      porEfetivas(),
    );
    expect(valorDaRubrica(r, "501")).toBeUndefined();
  });

  it("calcula o DSR perdido sobre a semana efetivamente paga", () => {
    const r = calcularFolha(
      professor(),
      movimento({
        aulasEfetivas: 84,
        aulasNaoDadas: 6,
        semanasComFaltaInjustificada: 1,
      }),
      porEfetivas(),
    );
    // 84 aulas ÷ 4,5 semanas = 18,67 aulas/semana → DSR semanal R$ 77,78.
    // Usar a grade cheia (R$ 83,33) cobraria a ausência duas vezes.
    expect(valorDaRubrica(r, "502")).toBe(reais(77.78));
  });
});

describe("mês parcial", () => {
  it("proporcionaliza o mês de admissão", () => {
    const r = calcularFolha(
      professor({ dataAdmissao: "2025-08-18" }),
      movimento(),
      parametros(),
    );
    // 14 de 31 dias → 90 × 14/31 = 40,65 aulas × R$ 25,00
    expect(valorDaRubrica(r, "101")).toBe(reais(1016.13));
    expect(r.avisos.some((a) => a.mensagem.includes("Mês parcial"))).toBe(true);
  });

  it("proporcionaliza o mês de desligamento e avisa sobre a rescisão", () => {
    const r = calcularFolha(
      professor({ dataDesligamento: "2025-08-10" }),
      movimento(),
      parametros(),
    );
    expect(valorDaRubrica(r, "101")).toBe(reais(725.81));
    expect(r.avisos.some((a) => a.mensagem.includes("rescisão"))).toBe(true);
  });

  it("acusa funcionário que não deveria estar nesta folha", () => {
    const r = calcularFolha(
      professor({ dataAdmissao: "2025-10-01" }),
      movimento(),
      parametros(),
    );
    expect(
      r.avisos.some((a) => a.mensagem.includes("não deveria entrar")),
    ).toBe(true);
  });
});

describe("piso da hora-aula", () => {
  it("acusa hora-aula abaixo do piso da convenção", () => {
    const r = calcularFolha(
      professor({ valorHoraAula: reais(18) }),
      movimento(),
      parametrosComCct((cct) => ({
        ...cct,
        horaAula: { ...cct.horaAula, valorMinimoHoraAula: reais(22) },
      })),
    );
    expect(r.avisos.some((a) => a.mensagem.includes("piso da convenção"))).toBe(
      true,
    );
  });
});

describe("carga por segmento com hora-aula própria", () => {
  // Caso real da planilha: 5 aulas sem valor + 19 aulas a R$ 35,00. A hora média
  // arredondada (R$ 27,71 × 24) pagava 18 centavos a mais que a planilha.
  const contrato = professor({
    valorHoraAula: 2771,
    aulasSemanais: 24,
    cargas: [
      { aulas: 5, valorHora: null },
      { aulas: 19, valorHora: 3500 },
    ],
  } as never);

  it("paga a soma de aulas × hora de cada segmento, sem perder centavos", () => {
    const r = calcularFolha(contrato, movimento(), parametros());
    expect(valorDaRubrica(r, "101")).toBe(299250);
    expect(valorDaRubrica(r, "102")).toBe(49875);
  });

  it("sem valor em nenhum segmento, volta à hora-aula média do contrato", () => {
    const sem = professor({
      valorHoraAula: 2771,
      aulasSemanais: 24,
      cargas: [{ aulas: 24, valorHora: null }],
    } as never);
    const r = calcularFolha(sem, movimento(), parametros());
    expect(valorDaRubrica(r, "101")).toBe(299268);
  });
});

describe("Ticket pago à parte", () => {
  it("sai da folha como desconto, sem mudar as bases de INSS e FGTS", () => {
    const sem = professor({ valorHoraAula: 3500, aulasSemanais: 40 } as never);
    const com = professor({ valorHoraAula: 3500, aulasSemanais: 40, valorTicket: 100000 } as never);
    const a = calcularFolha(sem, movimento(), parametros());
    const b = calcularFolha(com, movimento(), parametros());
    expect(valorDaRubrica(b, "680")).toBe(100000);
    expect(b.totalDescontos).toBe(a.totalDescontos + 100000);
    expect(b.liquido).toBe(a.liquido - 100000);
    expect(b.baseInss).toBe(a.baseInss);
    expect(b.fgts).toBe(a.fgts);
  });
  it("sem Ticket não cria a linha", () => {
    const r = calcularFolha(professor({ valorHoraAula: 3500, aulasSemanais: 40 } as never), movimento(), parametros());
    expect(r.rubricas.some((x) => x.codigo === "680")).toBe(false);
  });
});
