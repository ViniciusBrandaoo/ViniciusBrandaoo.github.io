import { describe, expect, it } from "vitest";
import { reais } from "@/dominio/comum/dinheiro.js";
import { calcularInss, calcularIrrf } from "@/dominio/folha/impostos.js";
import {
  validarTabelaInss,
  validarTabelaIrrf,
} from "@/dominio/folha/parametros.js";
import {
  TABELA_INSS_2025,
  TABELA_IRRF_2025,
} from "@/dominio/folha/tabelas-seed.js";

const inssDe = (base: number) =>
  calcularInss(
    {
      base,
      remuneracaoOutrosVinculos: 0,
      inssDescontadoOutrosVinculos: 0,
    },
    TABELA_INSS_2025,
  ).valor;

/** Com INSS, dependentes e pensão zerados, a base adotada é sempre a simplificada. */
const irrfSobreBase = (base: number) =>
  calcularIrrf(
    {
      baseTributavel: base + TABELA_IRRF_2025.descontoSimplificado,
      inssDescontado: 0,
      dependentes: 0,
      pensaoAlimenticia: 0,
    },
    TABELA_IRRF_2025,
  ).valor;

describe("INSS", () => {
  it("soma faixa a faixa, sem alíquota única", () => {
    expect(inssDe(reais(2625))).toBe(reais(213.48));
  });

  it("acerta as bordas exatas de cada faixa", () => {
    expect(inssDe(reais(1518))).toBe(reais(113.85));
    expect(inssDe(reais(1518.01))).toBe(reais(113.85));
    expect(inssDe(reais(2793.88))).toBe(reais(228.68));
    expect(inssDe(reais(4190.83))).toBe(reais(396.31));
  });

  it("limita a contribuição ao teto, inclusive um centavo acima dele", () => {
    const noTeto = inssDe(TABELA_INSS_2025.teto);
    expect(noTeto).toBe(reais(951.63));
    expect(inssDe(TABELA_INSS_2025.teto + 1)).toBe(noTeto);
    expect(inssDe(reais(30000))).toBe(noTeto);
  });

  it("não cobra nada sobre base zero", () => {
    expect(inssDe(0)).toBe(0);
  });

  it("é monotônico: base maior nunca desconta menos", () => {
    let anterior = 0;
    for (let base = 0; base <= reais(9000); base += reais(37.5)) {
      const atual = inssDe(base);
      expect(atual).toBeGreaterThanOrEqual(anterior);
      expect(atual).toBeLessThanOrEqual(base);
      anterior = atual;
    }
  });

  it("consolida vínculos e abate o que a outra escola já descontou", () => {
    // Professor de duas escolas: sem consolidar, cada uma aplicaria a tabela
    // desde a primeira faixa e ele pagaria INSS a maior.
    const r = calcularInss(
      {
        base: reais(2625),
        remuneracaoOutrosVinculos: reais(3000),
        inssDescontadoOutrosVinculos: reais(300),
      },
      TABELA_INSS_2025,
    );
    expect(r.valor).toBe(reais(297.09));
    expect(r.memoria.some((p) => p.titulo.includes("consolidação"))).toBe(true);
  });

  it("nunca devolve valor negativo quando o outro vínculo já pagou tudo", () => {
    const r = calcularInss(
      {
        base: reais(1000),
        remuneracaoOutrosVinculos: reais(8000),
        inssDescontadoOutrosVinculos: reais(951.63),
      },
      TABELA_INSS_2025,
    );
    expect(r.valor).toBe(0);
  });
});

describe("IRRF", () => {
  it("escolhe a base mais favorável ao contribuinte", () => {
    // Base alta: as deduções legais superam o desconto simplificado.
    const r = calcularIrrf(
      {
        baseTributavel: reais(6825),
        inssDescontado: reais(765.09),
        dependentes: 0,
        pensaoAlimenticia: 0,
      },
      TABELA_IRRF_2025,
    );
    expect(
      r.memoria.some((p) => p.titulo.includes("base adotada (deduções legais)")),
    ).toBe(true);
    expect(r.valor).toBe(reais(757.75));
  });

  it("abate dependentes da base", () => {
    const semDependentes = calcularIrrf(
      {
        baseTributavel: reais(6825),
        inssDescontado: reais(765.09),
        dependentes: 0,
        pensaoAlimenticia: 0,
      },
      TABELA_IRRF_2025,
    ).valor;
    const comDois = calcularIrrf(
      {
        baseTributavel: reais(6825),
        inssDescontado: reais(765.09),
        dependentes: 2,
        pensaoAlimenticia: 0,
      },
      TABELA_IRRF_2025,
    ).valor;
    expect(comDois).toBeLessThan(semDependentes);
    expect(semDependentes - comDois).toBe(reais(104.28));
  });

  it("é contínuo na troca de faixa — o teste que pega tabela digitada errada", () => {
    // Se o RH errar a parcela a deduzir ao cadastrar a tabela do ano, o imposto
    // dá um salto na fronteira. Nenhum outro teste detecta isso.
    for (const faixa of TABELA_IRRF_2025.faixas) {
      if (faixa.ate === null) continue;
      expect(irrfSobreBase(faixa.ate + 1)).toBe(irrfSobreBase(faixa.ate));
    }
  });

  it("é monotônico e nunca negativo", () => {
    let anterior = 0;
    for (let base = 0; base <= reais(12000); base += reais(50)) {
      const atual = irrfSobreBase(base);
      expect(atual).toBeGreaterThanOrEqual(anterior);
      anterior = atual;
    }
  });
});

describe("IRRF — redutor da Lei 15.270/2025 (Reforma da Renda)", () => {
  // Tabela com os quatro parâmetros do redutor — mesmos valores que a
  // migration real semeia para 2026 (ver `db/migrations/014_...sql`).
  const TABELA_COM_REDUTOR = {
    ...TABELA_IRRF_2025,
    id: "irrf-teste-redutor",
    isencaoTotalAte: reais(5000),
    reducaoAte: reais(7350),
    reducaoBase: reais(978.62),
    reducaoFator: 0.133145,
  };

  it("zera o imposto dentro do teto de isenção total, inclusive na borda exata", () => {
    expect(
      calcularIrrf(
        { baseTributavel: reais(4000), inssDescontado: 0, dependentes: 0, pensaoAlimenticia: 0 },
        TABELA_COM_REDUTOR,
      ).valor,
    ).toBe(0);
    expect(
      calcularIrrf(
        { baseTributavel: reais(5000), inssDescontado: 0, dependentes: 0, pensaoAlimenticia: 0 },
        TABELA_COM_REDUTOR,
      ).valor,
    ).toBe(0);
  });

  it("aplica o redutor na faixa de transição, sobre o rendimento tributável — não sobre a base já deduzida", () => {
    // baseTributavel R$ 6.000: base adotada (simplificado) = 6.000 − 607,20 = R$ 5.392,80,
    // que cai na última faixa (27,5%, deduzir R$ 908,73) → imposto de tabela R$ 574,29.
    // Redutor = 978,62 − (0,133145 × 6.000) = 978,62 − 798,87 = R$ 179,75.
    // Imposto final = 574,29 − 179,75 = R$ 394,54.
    const r = calcularIrrf(
      { baseTributavel: reais(6000), inssDescontado: 0, dependentes: 0, pensaoAlimenticia: 0 },
      TABELA_COM_REDUTOR,
    );
    expect(r.valor).toBe(reais(394.54));
    expect(r.memoria.some((p) => p.titulo.includes("redutor"))).toBe(true);
  });

  it("não aplica redutor nenhum acima do teto da faixa de transição — tabela cheia", () => {
    // baseTributavel R$ 8.000, acima de R$ 7.350: sem redutor. Base adotada
    // (simplificado) = 8.000 − 607,20 = R$ 7.392,80 → 27,5% − 908,73 = R$ 1.124,29.
    const r = calcularIrrf(
      { baseTributavel: reais(8000), inssDescontado: 0, dependentes: 0, pensaoAlimenticia: 0 },
      TABELA_COM_REDUTOR,
    );
    expect(r.valor).toBe(reais(1124.29));
    expect(r.memoria.some((p) => p.titulo.includes("redutor"))).toBe(false);
  });

  it("uma tabela sem os quatro campos do redutor (ex.: 2025, anterior à lei) calcula exatamente como antes", () => {
    // Mesma entrada, tabela sem redutor: bate com o teste de tabela normal
    // já existente acima — prova que os campos opcionais não vazam efeito
    // nenhum quando ausentes.
    const semRedutor = calcularIrrf(
      { baseTributavel: reais(6825), inssDescontado: reais(765.09), dependentes: 0, pensaoAlimenticia: 0 },
      TABELA_IRRF_2025,
    ).valor;
    expect(semRedutor).toBe(reais(757.75));
  });

  it("é monotônico e nunca negativo com o redutor ativo", () => {
    let anterior = 0;
    for (let baseTrib = 0; baseTrib <= reais(12000); baseTrib += reais(50)) {
      const atual = calcularIrrf(
        { baseTributavel: baseTrib, inssDescontado: 0, dependentes: 0, pensaoAlimenticia: 0 },
        TABELA_COM_REDUTOR,
      ).valor;
      expect(atual).toBeGreaterThanOrEqual(0);
      expect(atual).toBeGreaterThanOrEqual(anterior);
      anterior = atual;
    }
  });
});

describe("validação das tabelas cadastradas pelo RH", () => {
  it("aprova as tabelas do seed", () => {
    expect(validarTabelaInss(TABELA_INSS_2025)).toEqual([]);
    expect(validarTabelaIrrf(TABELA_IRRF_2025)).toEqual([]);
  });

  it("recusa tabela de INSS sem faixa alguma", () => {
    expect(
      validarTabelaInss({ ...TABELA_INSS_2025, faixas: [] }).length,
    ).toBeGreaterThan(0);
  });

  it("recusa faixas de INSS fora de ordem", () => {
    const invertida = {
      ...TABELA_INSS_2025,
      faixas: [...TABELA_INSS_2025.faixas].reverse(),
    };
    expect(validarTabelaInss(invertida).length).toBeGreaterThan(0);
  });

  it("exige que a última faixa do INSS bata com o teto", () => {
    const semTeto = {
      ...TABELA_INSS_2025,
      teto: reais(9999),
    };
    expect(
      validarTabelaInss(semTeto).some((p) => p.includes("teto")),
    ).toBe(true);
  });

  it("recusa faixa sem limite fora da última posição do IRRF", () => {
    const embaralhada = {
      ...TABELA_IRRF_2025,
      faixas: [...TABELA_IRRF_2025.faixas].reverse(),
    };
    expect(validarTabelaIrrf(embaralhada).length).toBeGreaterThan(0);
  });
});
