import { afterAll, describe, expect, it } from "vitest";

/**
 * Conta já paga não muda de valor/vencimento/competência/categoria/status:
 * o pagamento gravado tem o valor da época. Editar descrição ou observações continua livre.
 * Roda só com banco migrado em DATABASE_URL; cria e remove a própria conta.
 */
describe.skipIf(!process.env.DATABASE_URL)("edição de conta paga", () => {
  afterAll(async () => {
    const { encerrar } = await import("../../servidor/banco.js");
    await encerrar();
  });

  it("recusa mudar o valor de conta paga (409) e aceita corrigir a descrição", async () => {
    const { consultar } = await import("../../servidor/banco.js");
    const { registrarPagamento, atualizarContaPagar } = await import("../../servidor/repositorio.js");
    const [cat] = await consultar<{ id: string }>("SELECT id FROM categorias_financeiras LIMIT 1");
    const [conta] = await consultar<{ id: string }>(
      `INSERT INTO contas_pagar (descricao, categoria_id, competencia, vencimento, valor_centavos, status)
       VALUES ('teste-regressao-conta-paga', $1, '2026-09', '2026-09-20', 1000, 'APROVADO') RETURNING id`,
      [cat!.id],
    );
    try {
      const ator = { userId: null as never };
      await registrarPagamento(ator, conta!.id, { dataPagamento: "2026-09-21", formaPagamento: "PIX" });
      await expect(atualizarContaPagar(ator, conta!.id, { valorCentavos: 999999 })).rejects.toMatchObject({ statusCode: 409 });
      await expect(atualizarContaPagar(ator, conta!.id, { vencimento: "2026-10-30" })).rejects.toMatchObject({ statusCode: 409 });
      await expect(atualizarContaPagar(ator, conta!.id, { status: "RASCUNHO" })).rejects.toMatchObject({ statusCode: 409 });
      // mesmo valor e descrição nova: o formulário reenvia tudo, e isso tem de passar
      await atualizarContaPagar(ator, conta!.id, { valorCentavos: 1000, descricao: "teste-regressao-conta-paga (corrigida)" });
      const [c] = await consultar<{ descricao: string; valor: string }>("SELECT descricao, valor_centavos::text AS valor FROM contas_pagar WHERE id = $1", [conta!.id]);
      expect(c!.valor).toBe("1000");
      expect(c!.descricao).toMatch(/corrigida/);
    } finally {
      await consultar("DELETE FROM pagamentos WHERE conta_id = $1", [conta!.id]);
      await consultar("DELETE FROM contas_pagar WHERE id = $1", [conta!.id]);
    }
  });
});
