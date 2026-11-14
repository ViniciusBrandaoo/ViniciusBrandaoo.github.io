-- Outro emprego CLT no mês (remuneração e INSS já retido lá) passa a ser
-- lançado no movimento da competência. No contrato ele não podia ser editado
-- depois que o contrato sustentasse uma folha fechada, e é valor que muda.
ALTER TABLE folha_movimentos
  ADD COLUMN IF NOT EXISTS remuneracao_outros_vinculos_centavos bigint NOT NULL DEFAULT 0
    CHECK (remuneracao_outros_vinculos_centavos >= 0),
  ADD COLUMN IF NOT EXISTS inss_outros_vinculos_centavos bigint NOT NULL DEFAULT 0
    CHECK (inss_outros_vinculos_centavos >= 0);
