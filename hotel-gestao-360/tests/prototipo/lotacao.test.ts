import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const L: any = new Function(`${readFileSync(join(RAIZ, "prototipo", "partes", "dominio.js"), "utf8")}\nreturn L;`)();

const dados = {
  turmas: [
    { id: "t1", codigo: "6ºA", etapa: "FUND_II", aulasSemana: 10 },
    { id: "t2", codigo: "1ºEM", etapa: "MEDIO", aulasSemana: 5 },
    { id: "t3", codigo: "I2", etapa: "INFANTIL", aulasSemana: null },
  ],
  linhas: [
    { id: "a", disciplina: "Matemática", professor: "Rafael Hen.", employeeId: "e1", nomeCadastro: "Rafael Henrique", aulas: { t1: 4, t2: 3 }, outros: 2, camara: 1 },
    { id: "b", disciplina: "Física", professor: "Rafael H", employeeId: "e1", nomeCadastro: "Rafael Henrique", aulas: { t2: 2 }, outros: 0, camara: 0 },
    { id: "c", disciplina: "Arte", professor: "Adriana", employeeId: null, aulas: { t1: 1.5, t3: 4 }, outros: 0, camara: 0, disponibilidade: "manhã" },
    { id: "d", disciplina: "História", professor: null, employeeId: null, aulas: { t1: 3 }, outros: 0, camara: 0 },
  ],
};

describe("contas da lotação de aulas", () => {
  it("total da linha = turmas + Outros; Câmara fica à parte", () => {
    const t = L.totaisLotacaoLinha(dados.linhas[0], dados.turmas);
    expect(t.porEtapa).toMatchObject({ FUND_II: 4, MEDIO: 3, INFANTIL: 0 });
    expect(t.emTurmas).toBe(7);
    expect(t.total).toBe(9);
    expect(t.camara).toBe(1);
  });

  it("agrupa por professor pelo cadastro e compara com o contrato", () => {
    const r = L.resumoLotacaoProfessores(dados, [{ id: "e1", aulasSemanais: 12 }]);
    expect(r.map((p: { nome: string }) => p.nome)).toEqual(["Adriana", "Rafael Henrique"]);
    const j = r[1];
    expect(j.disciplinas).toEqual(["Matemática", "Física"]);
    expect(j.total).toBe(11);
    expect(j.contrato).toBe(12);
    expect(j.diferenca).toBe(-1);
    expect(j.qtdTurmas).toBe(2);
    expect(r[0].contrato).toBeNull();
    expect(r[0].disponibilidade).toEqual(["manhã"]);
  });

  it("saldo da turma contra a grade e aulas sem professor", () => {
    const r = L.resumoLotacaoTurmas(dados);
    expect(r[0]).toMatchObject({ codigo: "6ºA", alocado: 8.5, meta: 10, saldo: -1.5, semProfessor: 3, disciplinas: 3 });
    expect(r[1]).toMatchObject({ alocado: 5, saldo: 0 });
    expect(r[2]).toMatchObject({ alocado: 4, meta: null, saldo: null });
    expect(L.lotacaoSemProfessor(dados).map((l: { id: string }) => l.id)).toEqual(["d"]);
  });

  it("grade prevista por disciplina: falta, sobra e turma sem previsão", () => {
    const d = { ...dados, previsto: [
      { turmaId: "t1", disciplina: "Matemática", aulas: 5 },   // distribuído 4 → falta 1
      { turmaId: "t2", disciplina: "Matemática", aulas: 3 },   // 3 → ok
      { turmaId: "t1", disciplina: "Arte", aulas: 1 },         // 1,5 → sobra 0,5
      { turmaId: "t2", disciplina: "Química", aulas: 2 },      // ninguém → falta 2
      { turmaId: "sumiu", disciplina: "Química", aulas: 9 },   // turma excluída: ignora
    ] };
    const r = L.resumoLotacaoDisciplinas(d);
    const por = Object.fromEntries(r.map((x: { disciplina: string }) => [x.disciplina, x]));
    expect(por["Matemática"]).toMatchObject({ previsto: 8, distribuido: 7, falta: 1, sobra: 0, semPrevisto: 0 });
    expect(por["Arte"]).toMatchObject({ previsto: 1, distribuido: 5.5, falta: 0, sobra: 0.5, semPrevisto: 1 });
    expect(por["Química"]).toMatchObject({ previsto: 2, distribuido: 0, falta: 2 });
    expect(por["Física"].semPrevisto).toBe(1);
  });

  it("contratos a ajustar: total e segmento diferentes do contrato", () => {
    const funcs = [
      { id: "e1", aulasSemanais: 12, cargas: [{ segmento: "Fundamental 2", aulas: 6 }, { segmento: "Ensino Médio", aulas: 6 }] },
    ];
    const a = L.ajustesContratoLotacao(dados, funcs);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ employeeId: "e1", contrato: 12, lotacao: 11, diferenca: -1 });
    expect(a[0].segmentos).toEqual([
      { segmento: "Fundamental 2", etapa: "FUND_II", contrato: 6, lotacao: 4 },
      { segmento: "Ensino Médio", etapa: "MEDIO", contrato: 6, lotacao: 5 },
    ]);
    // Bate certinho (total e segmentos) → fora da lista; sem vínculo → fora.
    const ok = [{ id: "e1", aulasSemanais: 11, cargas: [{ segmento: "Fundamental 2", aulas: 4 }, { segmento: "Ensino Médio", aulas: 5 }] }];
    expect(L.ajustesContratoLotacao(dados, ok)).toEqual([]);
  });
});
