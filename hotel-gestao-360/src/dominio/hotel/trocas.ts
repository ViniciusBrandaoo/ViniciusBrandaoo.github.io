/**
 * Troca de apartamento: o mesmo hóspede sai de um apartamento e vai para outro.
 * No DataHotel isso aparece de dois jeitos:
 *  1. a recepção "arrasta" a reserva no mapa: o código continua o mesmo e o
 *     apartamento muda de uma exportação para a outra (só o histórico mostra);
 *  2. a recepção fecha a reserva e abre outra: códigos diferentes, mesmo
 *     hóspede, e a nova começa no dia em que a antiga termina.
 * Nos dois casos é o mesmo cliente, com as mesmas datas, checkout e pagamento.
 */

export interface ReservaTroca { codigo: string; hospede?: string; apto: string; checkin: string; checkout: string; situacao: string }
/** Apartamento de cada reserva em cada importação (ordem não importa). */
export interface VistoApto { codigo: string; apto: string; visto: string }

export interface Troca {
  tipo: "MESMA_RESERVA" | "NOVA_RESERVA";
  hospede: string;
  de: string;
  para: string;
  /** Dia da troca (nova reserva) ou da importação em que a troca apareceu (mesma reserva). */
  dia: string;
  codigos: string[];
}

const nomeChave = (s: string) => {
  const p = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter((x) => x.length > 1 && !["DA", "DE", "DO", "DAS", "DOS"].includes(x));
  return p.length >= 2 ? p[0] + " " + p[p.length - 1] : "";
};

export function trocasDeApartamento(reservas: ReservaTroca[], historico: VistoApto[] = []): Troca[] {
  const out: Troca[] = [];
  const nomeDe = new Map(reservas.map((r) => [r.codigo, (r.hospede ?? "").trim()]));

  // 1) mesma reserva, apartamento diferente entre importações
  const porCodigo = new Map<string, VistoApto[]>();
  for (const h of historico) { if (!h.codigo || !h.apto) continue; const l = porCodigo.get(h.codigo) ?? []; l.push(h); porCodigo.set(h.codigo, l); }
  for (const [codigo, l] of porCodigo) {
    l.sort((a, b) => a.visto.localeCompare(b.visto));
    for (let i = 1; i < l.length; i++) {
      if (l[i]!.apto !== l[i - 1]!.apto) out.push({ tipo: "MESMA_RESERVA", hospede: nomeDe.get(codigo) ?? "", de: l[i - 1]!.apto, para: l[i]!.apto, dia: l[i]!.visto.slice(0, 10), codigos: [codigo] });
    }
  }

  // 2) reserva nova para o mesmo hóspede, começando quando a anterior termina, em outro apartamento
  const validas = reservas.filter((r) => !/cancel|no-?show/i.test(r.situacao) && nomeChave(r.hospede ?? ""));
  for (const a of validas) {
    for (const b of validas) {
      if (a.codigo === b.codigo || a.apto === b.apto) continue;
      if (b.checkin !== a.checkout) continue;
      if (nomeChave(a.hospede!) !== nomeChave(b.hospede!)) continue;
      out.push({ tipo: "NOVA_RESERVA", hospede: (b.hospede ?? "").trim(), de: a.apto, para: b.apto, dia: b.checkin, codigos: [a.codigo, b.codigo] });
    }
  }
  return out.sort((x, y) => x.dia.localeCompare(y.dia) || x.de.localeCompare(y.de));
}
