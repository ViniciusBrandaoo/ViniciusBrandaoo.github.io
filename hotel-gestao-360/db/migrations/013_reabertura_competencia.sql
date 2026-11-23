-- Hotel Gestão 360 — histórico de reabertura de competência
--
-- Reabrir uma folha fechada já é auditado automaticamente pela migration 007
-- (o trigger em `folha_periodos` grava o `status` mudando de FECHADO para
-- EM_CALCULO), mas não existe onde guardar o PORQUÊ — e reabrir folha paga é
-- sensível o bastante para exigir justificativa (mesma regra do protótipo:
-- "Descreva em pelo menos 10 caracteres"). Uma tabela à parte, no mesmo
-- padrão append-only de `solicitacao_decisoes`, em vez de um campo só em
-- `folha_periodos` que perderia o motivo da reabertura anterior a cada nova.

BEGIN;

CREATE TABLE folha_periodo_reaberturas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id    uuid NOT NULL REFERENCES folha_periodos(id) ON DELETE RESTRICT,
  motivo        text NOT NULL CHECK (char_length(motivo) >= 10),
  reaberto_por  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reaberto_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER folha_reaberturas_sem_alteracao BEFORE UPDATE OR DELETE ON folha_periodo_reaberturas
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao();

CREATE INDEX idx_reaberturas_periodo ON folha_periodo_reaberturas (periodo_id, reaberto_em);

COMMIT;
