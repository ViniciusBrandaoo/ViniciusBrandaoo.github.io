-- Hotel Gestão 360 — Controle de migrations
-- Roda antes de tudo. Cada migration seguinte registra a sua linha aqui.

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  versao      text PRIMARY KEY,
  descricao   text NOT NULL,
  aplicada_em timestamptz NOT NULL DEFAULT now(),
  checksum    text
);

COMMIT;
