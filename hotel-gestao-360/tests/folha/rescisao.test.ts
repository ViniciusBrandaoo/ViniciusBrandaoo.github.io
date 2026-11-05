import { describe, expect, it } from "vitest";
import { reais } from "@/dominio/comum/dinheiro.js";
import {
  calcularRescisao,
  diasAvisoPrevio,
  projetarData,
  type TipoRescisao,
} from "@/dominio/folha/rescisao.js";
import {
  TABELA_INSS_2025,
  TABELA_IRRF_2025,
} from "@/dominio/folha/tabelas-seed.js";

const PARAMETROS = {
  inss: TABELA_INSS_2025,
  irrf: TABELA_IRRF_2025,
  fgtsPercentual: 8,
  tercoConstitucional: 33.3333,
};

describe("diasAvisoPrevio", () => {
  it("é 30 dias para quem tem menos de 1 ano completo de casa", () => {
    expect(diasAvisoPrevio("2026-01-01", "2026-06-01")).toBe(30);
  });

  it("soma 3 dias por ano completo", () => {
    expect(diasAvisoPrevio("2025-01-01", "2026-06-01")).toBe(33); // 1 ano
    expect(diasAvisoPrevio("2020-01-01", "2026-06-01")).toBe(48); // 6 anos
  });

  it("respeita o teto de 90 dias (Lei 12.506/2011)", () => {
    expect(diasAvisoPrevio("2000-01-01", "2026-06-01")).toBe(90); // 26 anos, sem o teto seria 108
  });

  it("só conta o ano como completo se já passou o dia do aniversário de admissão", () => {
    // Admitido 20/06, desligado 15/06 do ano seguinte: falta 5 dias pro ano fechar.
    expect(diasAvisoPrevio("2025-06-20", "2026-06-15")).toBe(30);
    expect(diasAvisoPrevio("2025-06-20", "2026-06-20")).toBe(33);
  });
});

describe("projetarData", () => {
  it("soma dias corridos, virando o mês quando preciso", () => {
    expect(projetarData("2026-06-15", 30)).toBe("2026-07-15");
  });

  it("atravessa mais de um mês corretamente", () => {
    expect(projetarData("2026-01-20", 45)).toBe("2026-03-06");
  });
});

const ENTRADA_BASE = {
  funcionarioId: "f1",
  dataAdmissao: "2020-01-01",
  dataDesligamento: "2026-06-15",
  baseRemuneracaoMensal: reais(3000),
  dependentesIrrf: 0,
  avisoPrevioIndenizado: true,
  diasFeriasVencidas: 0,
  mesesFeriasProporcionais: 6,
  mesesDecimoTerceiro: 6,
  saldoFgtsDepositado: reais(20000),
};

function rescisao(tipo: TipoRescisao, extra: Partial<typeof ENTRADA_BASE> = {}) {
  return calcularRescisao({ ...ENTRADA_BASE, ...extra, tipo }, PARAMETROS);
}

describe("calcularRescisao — sem justa causa", () => {
  it("paga aviso prévio indenizado, sem desconto de INSS", () => {
    const r = rescisao("SEM_JUSTA_CAUSA");
    const aviso = r.rubricas.find((x) => x.codigo === "961");
    expect(aviso?.valor).toBe(reais(4800)); // 48 dias × R$100
    expect(r.rubricas.some((x) => x.descricao.includes("INSS") && x.descricao.includes("aviso"))).toBe(false);
  });

  it("desconta IRRF do aviso prévio (isento só de INSS, não de IRRF)", () => {
    const r = rescisao("SEM_JUSTA_CAUSA");
    expect(r.rubricas.find((x) => x.codigo === "968")?.valor).toBe(reais(267.89));
  });

  it("paga 13º proporcional com INSS e IRRF, igual ao 13º normal", () => {
    const r = rescisao("SEM_JUSTA_CAUSA");
    expect(r.rubricas.find((x) => x.codigo === "962")?.valor).toBe(reais(1500)); // 6/12 de 3.000
    expect(r.rubricas.find((x) => x.codigo === "967")?.valor).toBe(reais(112.5)); // INSS sobre 13º
  });

  it("paga férias proporcionais + 1/3 SEM INSS nem IRRF (isentas por natureza indenizatória)", () => {
    const r = rescisao("SEM_JUSTA_CAUSA");
    expect(r.rubricas.find((x) => x.codigo === "965")?.valor).toBe(reais(1500)); // 6/12 de 30 dias × R$100
    expect(r.rubricas.find((x) => x.codigo === "966")?.valor).toBe(reais(500)); // 1/3
    const doSaldo = r.rubricas.filter((x) => x.codigo === "971" || x.codigo === "972").reduce((t, x) => t + x.valor, 0);
    expect(r.totalDescontos - doSaldo).toBe(reais(380.39)); // INSS+IRRF do 13º e IRRF do aviso; o saldo tem os seus
  });

  it("aplica a multa de 40% sobre o saldo de FGTS depositado", () => {
    const r = rescisao("SEM_JUSTA_CAUSA");
    expect(r.multaFgts).toBe(reais(8000));
  });

  it("soma o FGTS de todas as verbas que o compõem (aviso, 13º e férias)", () => {
    const r = rescisao("SEM_JUSTA_CAUSA");
    expect(r.fgts).toBe(reais(784)); // 8% de (saldo 1.500 + aviso 4.800 + 13º 1.500 + férias 2.000)
  });

  it("líquido bate com proventos menos descontos", () => {
    const r = rescisao("SEM_JUSTA_CAUSA");
    expect(r.totalProventos).toBe(reais(17800)); // 16.300 + saldo de 15 dias (R$ 1.500)
    expect(r.liquido).toBe(r.totalProventos - r.totalDescontos);
  });
});

describe("calcularRescisao — pedido de demissão", () => {
  it("não paga aviso prévio indenizado nem multa de FGTS", () => {
    const r = rescisao("PEDIDO_DEMISSAO");
    expect(r.rubricas.some((x) => x.codigo === "961")).toBe(false);
    expect(r.multaFgts).toBe(0);
  });

  it("mantém 13º e férias proporcionais — só o aviso e a multa são do empregador", () => {
    const r = rescisao("PEDIDO_DEMISSAO");
    expect(r.rubricas.find((x) => x.codigo === "962")?.valor).toBe(reais(1500));
    expect(r.rubricas.find((x) => x.codigo === "965")?.valor).toBe(reais(1500));
  });
});

describe("calcularRescisao — justa causa", () => {
  it("não paga aviso prévio, 13º proporcional, férias proporcionais nem multa de FGTS", () => {
    const r = rescisao("JUSTA_CAUSA");
    expect(r.totalProventos).toBe(reais(1500)); // só o saldo de salário (15 dias)
    expect(r.rubricas.filter((x) => x.tipo === "PROVENTO").map((x) => x.codigo)).toEqual(["960"]);
    expect(r.multaFgts).toBe(0);
  });

  it("mesmo em justa causa, férias VENCIDAS (já completadas) continuam sendo devidas", () => {
    const r = rescisao("JUSTA_CAUSA", { diasFeriasVencidas: 30 });
    expect(r.rubricas.find((x) => x.codigo === "963")?.valor).toBe(reais(3000));
    expect(r.rubricas.find((x) => x.codigo === "964")?.valor).toBe(reais(1000));
  });

  it("avisa explicitamente o que foi retirado por causa da justa causa", () => {
    const r = rescisao("JUSTA_CAUSA");
    expect(r.avisos.some((a) => /justa causa/i.test(a.mensagem))).toBe(true);
  });
});

describe("calcularRescisao — acordo (distrato, CLT art. 484-A)", () => {
  it("paga metade do aviso prévio indenizado", () => {
    const r = rescisao("ACORDO");
    expect(r.rubricas.find((x) => x.codigo === "961")?.valor).toBe(reais(2400)); // metade de 4.800
  });

  it("aplica só metade da multa de FGTS (20%, não 40%)", () => {
    const r = rescisao("ACORDO");
    expect(r.multaFgts).toBe(reais(4000)); // 20% de 20.000
  });

  it("mantém 13º e férias proporcionais integrais (só o aviso e a multa são reduzidos)", () => {
    const r = rescisao("ACORDO");
    expect(r.rubricas.find((x) => x.codigo === "962")?.valor).toBe(reais(1500));
    expect(r.rubricas.find((x) => x.codigo === "965")?.valor).toBe(reais(1500));
  });
});

describe("calcularRescisao — invariantes", () => {
  it("nunca devolve líquido negativo nem NaN, para nenhum tipo de rescisão", () => {
    const tipos: TipoRescisao[] = ["SEM_JUSTA_CAUSA", "PEDIDO_DEMISSAO", "JUSTA_CAUSA", "ACORDO"];
    for (const tipo of tipos) {
      for (const base of [reais(1518), reais(3000), reais(8000)]) {
        for (const meses of [0, 3, 6, 12]) {
          const r = calcularRescisao(
            {
              ...ENTRADA_BASE,
              tipo,
              baseRemuneracaoMensal: base,
              mesesDecimoTerceiro: meses,
              mesesFeriasProporcionais: meses,
              diasFeriasVencidas: meses > 0 ? 30 : 0,
            },
            PARAMETROS,
          );
          expect(Number.isFinite(r.liquido)).toBe(true);
          expect(r.liquido).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(r.fgts)).toBe(true);
          expect(Number.isFinite(r.multaFgts)).toBe(true);
        }
      }
    }
  });

  it("a multa de FGTS nunca é maior que o percentual do tipo sobre o saldo depositado", () => {
    const r = rescisao("SEM_JUSTA_CAUSA", { saldoFgtsDepositado: reais(10000) });
    expect(r.multaFgts).toBeLessThanOrEqual(reais(4000)); // 40% de 10.000
  });
});

import { diasSaldoDeSalario } from "@/dominio/folha/rescisao.js";
import { semImpostosDaContabilidade } from "@/dominio/folha/sem-impostos.js";

describe("saldo de salário na rescisão", () => {
  it("dias trabalhados no mês do desligamento (mês comercial; dia 31 vale 30)", () => {
    expect(diasSaldoDeSalario("2020-03-01", "2026-09-20")).toBe(20);
    expect(diasSaldoDeSalario("2020-03-01", "2026-10-31")).toBe(30);
    expect(diasSaldoDeSalario("2026-09-10", "2026-09-20")).toBe(11);
  });
});

describe("saldo de salário — valores", () => {
  it("paga os dias trabalhados no mês: 15 dias de R$ 3.000 = R$ 1.500", () => {
    const r = rescisao("PEDIDO_DEMISSAO");
    expect(r.rubricas.find((x) => x.codigo === "960")?.valor).toBe(reais(1500));
  });
  it("sem impostos (contabilidade): sai o INSS/IRRF do saldo e o líquido fecha", () => {
    const r = rescisao("SEM_JUSTA_CAUSA");
    const s = semImpostosDaContabilidade(r);
    expect(s.rubricas.some((x) => x.codigo === "971" || x.codigo === "972")).toBe(false);
    expect(s.rubricas.find((x) => x.codigo === "960")?.valor).toBe(reais(1500));
    expect(s.liquido).toBe(s.totalProventos - s.totalDescontos);
  });
});
