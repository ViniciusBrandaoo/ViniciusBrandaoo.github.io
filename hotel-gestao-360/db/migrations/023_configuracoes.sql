-- Configurações da escola que valem para todo mundo (uma linha por chave).
-- Primeira: INSS e IRRF do empregado apurados pela contabilidade.
CREATE TABLE IF NOT EXISTS configuracoes (
  chave          text PRIMARY KEY,
  valor          jsonb NOT NULL,
  atualizado_por uuid REFERENCES users(id),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
