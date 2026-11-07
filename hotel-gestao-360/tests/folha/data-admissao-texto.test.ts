import { describe, expect, it, vi } from "vitest";

// O contrato que o servidor entrega ao motor precisa trazer as datas de
// admissão/desligamento como texto 'AAAA-MM-DD' — o motor compara datas como
// texto. Com `Date` (o que o driver devolve para colunas `date`) o mês de
// admissão saía cheio, sem proporcionalizar.
vi.mock("../../servidor/banco.js", () => ({
  consultar: vi.fn(),
  transacao: vi.fn(),
  pool: {},
}));

import { consultar } from "../../servidor/banco.js";
import { contratoVigente } from "../../servidor/repositorio.js";
import { calcularFolha } from "@/dominio/folha/motor.js";
import { movimento, parametros } from "../fixtures/folha.js";
import { CCT_ADMINISTRATIVO_PADRAO } from "@/dominio/folha/tabelas-seed.js";

describe("contratoVigente: datas do vínculo", () => {
  it("pede admissão e desligamento já como texto (to_char) e o mês de admissão sai proporcional", async () => {
    vi.mocked(consultar).mockResolvedValueOnce([{
      id: "c1", cct_id: "cct", regime: "MENSALISTA", dependentes_irrf: 0, periodos_tempo_servico: 0,
      remuneracao_outros_vinculos_centavos: 0, inss_outros_vinculos_centavos: 0,
      salario_base_centavos: 300000, carga_horaria_semanal: 44,
      data_admissao: "2026-09-16", data_desligamento: null,
    }]);
    const vigente = await contratoVigente("e1", "2026-09");
    const sql = String(vi.mocked(consultar).mock.calls[0]![0]);
    expect(sql).toMatch(/to_char\(e\.data_admissao/);
    expect(sql).toMatch(/to_char\(e\.data_desligamento/);

    const cheio = calcularFolha({ ...vigente!.contrato, dataAdmissao: "2026-01-01" }, movimento({}, "2026-09"), parametros({ cct: { ...CCT_ADMINISTRATIVO_PADRAO, conferidaPorRh: true } }));
    const parcial = calcularFolha(vigente!.contrato, movimento({}, "2026-09"), parametros({ cct: { ...CCT_ADMINISTRATIVO_PADRAO, conferidaPorRh: true } }));
    expect(parcial.totalProventos).toBeLessThan(cheio.totalProventos);
    expect(parcial.totalProventos).toBe(Math.round((300000 * 15) / 30));
  });
});

import { validarNomeEData } from "../../servidor/repositorio.js";

describe("validarNomeEData", () => {
  it("recusa nome em branco e data que não existe, com mensagem de uso (422)", () => {
    expect(() => validarNomeEData("   ", "2026-09-01")).toThrow(/nome/i);
    expect(() => validarNomeEData("Ana", "2026-02-30")).toThrow(/inválida/);
    expect(() => validarNomeEData("Ana", "31/09/2026")).toThrow(/inválida/);
    expect(() => validarNomeEData("Ana", "2026-02-28")).not.toThrow();
  });
});
