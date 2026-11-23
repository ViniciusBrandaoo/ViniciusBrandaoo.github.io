import { describe, expect, it } from "vitest";
import { trocasDeApartamento } from "../../src/dominio/hotel/trocas.js";

describe("trocasDeApartamento", () => {
  it("mesma reserva arrastada no mapa: o apartamento muda entre importações", () => {
    const r = trocasDeApartamento([{ codigo: "RJK1", hospede: "DENES SOTERO", apto: "131", checkin: "2026-11-16", checkout: "2026-11-22", situacao: "Checked-in" }],
      [{ codigo: "RJK1", apto: "107", visto: "2026-11-18T10:00:00" }, { codigo: "RJK1", apto: "131", visto: "2026-11-21T10:00:00" }, { codigo: "RJK1", apto: "131", visto: "2026-11-21T11:00:00" }]);
    expect(r).toEqual([{ tipo: "MESMA_RESERVA", hospede: "DENES SOTERO", de: "107", para: "131", dia: "2026-11-21", codigos: ["RJK1"] }]);
  });

  it("reserva nova do mesmo hóspede no dia em que a outra terminou, em outro apartamento", () => {
    const r = trocasDeApartamento([
      { codigo: "A", hospede: "Maria da Silva Souza", apto: "112", checkin: "2026-11-10", checkout: "2026-11-12", situacao: "Checked-out" },
      { codigo: "B", hospede: "MARIA SOUZA", apto: "139", checkin: "2026-11-12", checkout: "2026-11-14", situacao: "Checked-out" },
      { codigo: "C", hospede: "Maria Souza", apto: "139", checkin: "2026-11-14", checkout: "2026-11-15", situacao: "Checked-out" },
    ]);
    expect(r).toEqual([{ tipo: "NOVA_RESERVA", hospede: "MARIA SOUZA", de: "112", para: "139", dia: "2026-11-12", codigos: ["A", "B"] }]);
  });

  it("não confunde hóspedes diferentes nem reserva cancelada", () => {
    const r = trocasDeApartamento([
      { codigo: "A", hospede: "João Lima", apto: "101", checkin: "2026-11-10", checkout: "2026-11-12", situacao: "Checked-out" },
      { codigo: "B", hospede: "João Pereira", apto: "102", checkin: "2026-11-12", checkout: "2026-11-13", situacao: "Checked-out" },
      { codigo: "C", hospede: "João Lima", apto: "103", checkin: "2026-11-12", checkout: "2026-11-13", situacao: "Cancelada" },
    ]);
    expect(r).toEqual([]);
  });
});
