-- Descontos do mês pedidos pelo Financeiro: Robótica, Empréstimos e Outros
-- (este com observação obrigatória na tela).
ALTER TABLE folha_movimentos
  ADD COLUMN IF NOT EXISTS desconto_robotica_centavos bigint NOT NULL DEFAULT 0
    CHECK (desconto_robotica_centavos >= 0),
  ADD COLUMN IF NOT EXISTS desconto_emprestimos_centavos bigint NOT NULL DEFAULT 0
    CHECK (desconto_emprestimos_centavos >= 0),
  ADD COLUMN IF NOT EXISTS desconto_outros_centavos bigint NOT NULL DEFAULT 0
    CHECK (desconto_outros_centavos >= 0),
  ADD COLUMN IF NOT EXISTS desconto_outros_obs text NOT NULL DEFAULT '';
