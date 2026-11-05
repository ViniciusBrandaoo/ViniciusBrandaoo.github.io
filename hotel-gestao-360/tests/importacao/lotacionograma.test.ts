import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { lerLotacionograma, lerLotacionogramaDeBuffer } from "../../src/importacao/lotacionograma.js";
import { casarProfessor } from "../../src/importacao/lotacionograma.js";

/** Monta um lotacionograma no formato da coordenação (cabeçalho na linha 4). */
function planilha(): ExcelJS.Worksheet {
  const wb = new ExcelJS.Workbook();
  const aba = wb.addWorksheet("Janeiro 26");
  aba.getCell("A1").value = "Lotacionograma: Professores X Disciplina - 2027";
  const turmas = ["I2", "I2", "1ºAM", "6ºA", "6ºB", "1ºEM", "2ºMA", "Pré 1"];
  aba.getRow(2).getCell(12).value = "Total Médio";
  aba.getRow(2).getCell(13).value = "Câmara";
  aba.getRow(2).getCell(14).value = "Outros";
  aba.getRow(2).getCell(15).value = "Disponibilidade";
  aba.getRow(4).values = ["Nº", "Disciplinas", "Professor", ...turmas];
  aba.getRow(5).values = [null, "Total por turma"];
  aba.getRow(6).values = [1, "Geral", "Raiza", 20, 20];
  aba.getRow(7).values = [2, "Matemática", "Rafael Hen.", null, null, 6, 4, { error: "#REF!" } as unknown as ExcelJS.CellValue, 3];
  aba.getRow(7).getCell(12).value = 9; // total do Médio digitado errado (as turmas somam 3)
  aba.getRow(7).getCell(13).value = 1;
  aba.getRow(7).getCell(15).value = "segunda e quarta";
  aba.getRow(8).values = [null, null, "Alexandra", null, null, null, null, 3, null, 2, 2];
  aba.getRow(9).values = [3, "História", null, null, null, null, 3, 3];
  aba.getRow(10).values = [null, null, null];
  aba.getRow(11).values = [null, "Física", "Mateus", null, null, null, null, null, 4, 4];
  aba.getRow(11).getCell(14).value = 2;
  aba.getRow(12).values = ["Total por Série", null, null, null, null, null, 33, 33, 34, 34];
  aba.getRow(13).values = [null, null, "Fora da grade", null, 50];
  return aba;
}

describe("leitor do lotacionograma", () => {
  const lido = lerLotacionograma(planilha())!;

  it("acha as turmas, separa as repetidas e classifica a etapa pela posição", () => {
    expect(lido.titulo).toMatch(/Lotacionograma/);
    expect(lido.turmas.map((t) => t.codigo)).toEqual(["I2 A", "I2 B", "1ºAM", "6ºA", "6ºB", "1ºEM", "2ºMA", "Pré1"]);
    expect(lido.turmas.map((t) => t.etapa)).toEqual(["INFANTIL", "INFANTIL", "FUND_I", "FUND_II", "FUND_II", "MEDIO", "MEDIO", "PREP"]);
  });

  it("lê a grade da turma da linha Total por Série e para ali", () => {
    expect(lido.turmas.find((t) => t.codigo === "6ºA")!.aulasSemana).toBe(33);
    expect(lido.turmas.find((t) => t.codigo === "1ºEM")!.aulasSemana).toBe(34);
    expect(lido.turmas.find((t) => t.codigo === "I2 A")!.aulasSemana).toBeNull();
    expect(lido.linhas.some((l) => l.professor === "Fora da grade")).toBe(false);
  });

  it("carrega a disciplina para baixo, ignora #REF! e vazio, mantém linha sem professor com aula", () => {
    const junior = lido.linhas.find((l) => l.professor === "Rafael Hen.")!;
    expect(junior.disciplina).toBe("Matemática");
    expect(junior.aulas).toEqual({ "1ºAM": 6, "6ºA": 4, "1ºEM": 3 });
    expect(junior.camara).toBe(1);
    expect(junior.disponibilidade).toBe("segunda e quarta");
    const alexandra = lido.linhas.find((l) => l.professor === "Alexandra")!;
    expect(alexandra.disciplina).toBe("Matemática");
    const semProf = lido.linhas.find((l) => l.disciplina === "História")!;
    expect(semProf.professor).toBeNull();
    expect(semProf.aulas).toEqual({ "6ºA": 3, "6ºB": 3 });
    expect(lido.linhas.find((l) => l.professor === "Mateus")!.outros).toBe(2);
    expect(lido.linhas).toHaveLength(5);
  });

  it("avisa quando o total digitado não bate com a soma das turmas, sem corrigir", () => {
    expect(lido.avisos).toHaveLength(1);
    expect(lido.avisos[0]).toMatch(/Rafael Hen\..*9.*somam 3/);
  });

  it("recusa planilha sem cabeçalho de professor com frase clara", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("x").getCell("A1").value = "nada";
    const buf = await wb.xlsx.writeBuffer();
    await expect(lerLotacionogramaDeBuffer(Buffer.from(buf))).rejects.toThrow(/Professor/);
  });
});

describe("vínculo do nome da planilha com o cadastro", () => {
  const cadastro = [
    { id: "1", nome: "Rafael Henrique da Silva", professor: true },
    { id: "2", nome: "Rafael Nunes Souza", professor: true },
    { id: "3", nome: "Vania Maria Sousa Da Costa", professor: true },
    { id: "4", nome: "Paulo Cesar Matos", professor: true },
    { id: "5", nome: "Paulo Roberto Lima", professor: true },
    { id: "6", nome: "Mateus Ferreira", professor: false },
    { id: "7", nome: "Mateus Oliveira", professor: true },
  ];
  it("liga abreviação e acento quando há um candidato só", () => {
    expect(casarProfessor("Rafael Hen.", cadastro)).toBe("1");
    expect(casarProfessor("Rafael Nunes", cadastro)).toBe("2");
    expect(casarProfessor("Vânia", cadastro)).toBe("3");
  });
  it("não adivinha quando há dois iguais, nem em nome composto com barra", () => {
    expect(casarProfessor("Paulo", cadastro)).toBeNull();
    expect(casarProfessor("Rafael", cadastro)).toBeNull();
    expect(casarProfessor("Kemilli/ Mateus", cadastro)).toBeNull();
    expect(casarProfessor("Ninguém", cadastro)).toBeNull();
  });
  it("desempata pelo professor (hora-aula) quando só um dos homônimos é professor", () => {
    expect(casarProfessor("Mateus", cadastro)).toBe("7");
  });
});
