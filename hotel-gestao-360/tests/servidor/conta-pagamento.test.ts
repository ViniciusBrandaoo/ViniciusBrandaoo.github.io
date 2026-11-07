import { afterAll, describe, expect, it } from "vitest";

/**
 * Regressão: pagar a mesma conta duas vezes registrava dois pagamentos.
 * Roda só com banco migrado em DATABASE_URL; cria e remove a própria conta.
 */
describe.skipIf(!process.env.DATABASE_URL)("pagamento de conta a pagar", () => {
  afterAll(async () => {
    const { encerrar } = await import("../../servidor/banco.js");
    await encerrar();
  });

  it("segundo pagamento da mesma conta é recusado com 409", async () => {
    const { consultar } = await import("../../servidor/banco.js");
    const { registrarPagamento } = await import("../../servidor/repositorio.js");
    const [cat] = await consultar<{ id: string }>("SELECT id FROM categorias_financeiras LIMIT 1");
    const [conta] = await consultar<{ id: string }>(
      `INSERT INTO contas_pagar (descricao, categoria_id, competencia, vencimento, valor_centavos, status)
       VALUES ('teste-regressao-pagamento-duplo', $1, '2026-09', '2026-09-20', 1000, 'APROVADO') RETURNING id`,
      [cat!.id],
    );
    try {
      const dados = { dataPagamento: "2026-09-21", formaPagamento: "PIX" };
      await registrarPagamento({ userId: null as never }, conta!.id, dados);
      await expect(registrarPagamento({ userId: null as never }, conta!.id, dados))
        .rejects.toMatchObject({ statusCode: 409 });
      const [n] = await consultar<{ n: string }>("SELECT count(*)::text AS n FROM pagamentos WHERE conta_id = $1", [conta!.id]);
      expect(n!.n).toBe("1");
    } finally {
      await consultar("DELETE FROM pagamentos WHERE conta_id = $1", [conta!.id]);
      await consultar("DELETE FROM contas_pagar WHERE id = $1", [conta!.id]);
    }
  });
});
