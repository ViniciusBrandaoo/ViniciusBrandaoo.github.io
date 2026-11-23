-- Descontos lançados no mês (cantina, material, mensalidade, plano de saúde,
-- adiantamento). Valor cheio, fora das bases de INSS/IRRF/FGTS; não passam
-- para a competência seguinte.
ALTER TABLE folha_movimentos
  ADD COLUMN IF NOT EXISTS desconto_cantina_centavos bigint NOT NULL DEFAULT 0
    CHECK (desconto_cantina_centavos >= 0),
  ADD COLUMN IF NOT EXISTS desconto_material_centavos bigint NOT NULL DEFAULT 0
    CHECK (desconto_material_centavos >= 0),
  ADD COLUMN IF NOT EXISTS desconto_mensalidade_centavos bigint NOT NULL DEFAULT 0
    CHECK (desconto_mensalidade_centavos >= 0),
  ADD COLUMN IF NOT EXISTS desconto_plano_saude_centavos bigint NOT NULL DEFAULT 0
    CHECK (desconto_plano_saude_centavos >= 0),
  ADD COLUMN IF NOT EXISTS desconto_adiantamento_centavos bigint NOT NULL DEFAULT 0
    CHECK (desconto_adiantamento_centavos >= 0);
