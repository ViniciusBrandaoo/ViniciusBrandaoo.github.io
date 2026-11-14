import { describe, expect, it, vi } from "vitest";

// "Calcular" lia e gravava ~10 vezes por pessoa. Em banco remoto isso virava
// minutos de espera; agora é em lote. O RESULTADO tem que ser exatamente o de
// antes: estes testes comparam o caminho em lote com o individual.
vi.mock("../../servidor/banco.js", () => ({
  consultar: vi.fn(),
  transacao: vi.fn(),
  pool: {},
}));

import { consultar } from "../../servidor/banco.js";
import {
  contratoVigente, contratosVigentesEmLote, gravarCalculosEmLote, movimentoDaCompetencia,
  movimentoDeLinha, outrosVinculosDeLinha, outrosVinculosDoMovimento,
} from "../../servidor/repositorio.js";
import { calcularFolha } from "@/dominio/folha/motor.js";
import { movimento, parametros, mensalista } from "../fixtures/folha.js";

const linhaHorista = {
  id: "c1", employee_id: "e1", cct_id: "cct", regime: "HORISTA_AULA", dependentes_irrf: 0, periodos_tempo_servico: 0,
  remuneracao_outros_vinculos_centavos: 0, inss_outros_vinculos_centavos: 0,
  valor_hora_aula_centavos: 2771, aulas_semanais: 24,
  data_admissao: "2020-01-01", data_desligamento: null,
};
const linhaMensal = {
  id: "c2", employee_id: "e2", cct_id: "cct", regime: "MENSALISTA", dependentes_irrf: 1, periodos_tempo_servico: 2,
  remuneracao_outros_vinculos_centavos: 0, inss_outros_vinculos_centavos: 0,
  salario_base_centavos: 300000, carga_horaria_semanal: 44,
  data_admissao: "2026-09-16", data_desligamento: null,
};
const cargas = [{ aulas: "5", valor: null }, { aulas: "19", valor: "3500" }];

describe("contratosVigentesEmLote", () => {
  it("devolve o mesmo contrato que contratoVigente, pessoa por pessoa, em 2 consultas", async () => {
    vi.mocked(consultar).mockReset();
    vi.mocked(consultar)
      .mockResolvedValueOnce([linhaHorista]).mockResolvedValueOnce(cargas as never)
      .mockResolvedValueOnce([linhaMensal]);
    const individualH = await contratoVigente("e1", "2026-09");
    const individualM = await contratoVigente("e2", "2026-09");

    vi.mocked(consultar).mockReset();
    vi.mocked(consultar)
      .mockResolvedValueOnce([linhaHorista, linhaMensal])
      .mockResolvedValueOnce(cargas.map((c) => ({ contrato_id: "c1", ...c })) as never);
    const lote = await contratosVigentesEmLote(["e1", "e2"], "2026-09");

    expect(vi.mocked(consultar)).toHaveBeenCalledTimes(2);
    expect(lote.get("e1")).toEqual(individualH);
    expect(lote.get("e2")).toEqual(individualM);
    expect(lote.get("e1")!.contrato).toMatchObject({ regime: "HORISTA_AULA", cargas: [{ aulas: 5, valorHora: null }, { aulas: 19, valorHora: 3500 }] });
  });

  it("sem ninguém, não consulta o banco", async () => {
    vi.mocked(consultar).mockReset();
    expect((await contratosVigentesEmLote([], "2026-09")).size).toBe(0);
    expect(vi.mocked(consultar)).not.toHaveBeenCalled();
  });
});

describe("movimento a partir da linha já lida", () => {
  const linha = {
    aulas_extras: "2", aulas_extras_semanais: "3", valor_hora_extra_centavos: "3000", dias_falta: "1",
    vale_transporte_centavos: "15000", pensao_modo: "VALOR", pensao_quantidade: "20000",
    desconto_cantina_centavos: "1000", desconto_outros_centavos: "500", desconto_outros_obs: "Uniforme",
    remuneracao_outros_vinculos_centavos: "0", inss_outros_vinculos_centavos: "0",
  } as never;

  it("é idêntico ao movimentoDaCompetencia e ao outrosVinculosDoMovimento", async () => {
    vi.mocked(consultar).mockReset();
    vi.mocked(consultar).mockResolvedValueOnce([linha]);
    const individual = await movimentoDaCompetencia("p", "e", "2026-09");
    expect(movimentoDeLinha(linha, "2026-09")).toEqual(individual);
    expect(movimentoDeLinha(undefined, "2026-09")).toEqual(movimento({}, "2026-09"));

    vi.mocked(consultar).mockResolvedValueOnce([{ r: "100", i: "7" }]);
    expect(await outrosVinculosDoMovimento("p", "e")).toEqual(
      outrosVinculosDeLinha({ remuneracao_outros_vinculos_centavos: "100", inss_outros_vinculos_centavos: "7" } as never),
    );
    expect(outrosVinculosDeLinha(linha)).toBeNull();
    expect(outrosVinculosDeLinha(undefined)).toBeNull();
  });
});

describe("gravarCalculosEmLote", () => {
  it("grava todo mundo com poucas consultas e as rubricas na ordem do cálculo", async () => {
    const sqls: Array<{ sql: string; valores: unknown[] }> = [];
    const cliente = {
      query: vi.fn(async (sql: string, valores: unknown[]) => {
        sqls.push({ sql, valores });
        if (/INSERT INTO folha_calculos/.test(sql)) {
          const n = valores.length / 18;
          return { rows: Array.from({ length: n }, (_, k) => ({ id: `calc${k}`, employee_id: valores[k * 18 + 1] })), rowCount: n };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    const params = parametros();
    const itens = ["a", "b", "c"].map((id) => {
      const contrato = mensalista({ funcionarioId: id } as never);
      const mov = movimento({ horasExtras50: 2 }, "2026-09");
      return { employeeId: id, contratoId: "ct-" + id, parametros: params, contrato, movimento: mov, resultado: calcularFolha(contrato, mov, params) };
    });
    await gravarCalculosEmLote(cliente as never, "periodo", itens as never);

    // 2 apagamentos + 1 inserção de cálculos + 1 de rubricas, não ~12 por pessoa.
    expect(sqls.length).toBe(4);
    const rub = sqls[3]!;
    expect(rub.sql).toMatch(/INSERT INTO folha_rubricas/);
    const total = itens.reduce((a, i) => a + i.resultado.rubricas.length, 0);
    expect(rub.valores.length).toBe(total * 11);
    // ordem 1..n por pessoa e vínculo com o cálculo da própria pessoa
    expect(rub.valores.slice(0, 2)).toEqual(["calc0", 1]);
    const porPessoa = itens[0]!.resultado.rubricas.length;
    expect(rub.valores[porPessoa * 11]).toBe("calc1");
    expect(rub.valores[porPessoa * 11 + 1]).toBe(1);
  });

  it("não faz nada sem itens", async () => {
    const cliente = { query: vi.fn() };
    await gravarCalculosEmLote(cliente as never, "p", []);
    expect(cliente.query).not.toHaveBeenCalled();
  });
});
