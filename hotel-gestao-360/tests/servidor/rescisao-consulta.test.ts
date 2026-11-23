import { afterAll, describe, expect, it } from "vitest";

/**
 * Regressão: GET /api/rescisao/:id e a homologação liam `tem_divergencia` de
 * `folha_rescisoes`, coluna que não existe (só 13º e férias a têm) — a Direção
 * recebia erro 500 ao homologar. Roda só com um banco migrado em DATABASE_URL.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("consulta de rescisão no banco", () => {
  afterAll(async () => {
    const { encerrar } = await import("../../servidor/banco.js");
    await encerrar();
  });

  it("busca rescisão inexistente sem estourar (colunas existem)", async () => {
    const { buscarRescisao } = await import("../../servidor/repositorio.js");
    expect(await buscarRescisao("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("divergência de rescisão inexistente é null (404), não erro de coluna", async () => {
    const { rescisaoTemDivergencia } = await import("../../servidor/repositorio.js");
    expect(await rescisaoTemDivergencia("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
