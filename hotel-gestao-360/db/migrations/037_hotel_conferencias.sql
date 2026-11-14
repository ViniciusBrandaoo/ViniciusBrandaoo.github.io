-- Hotel Gestão 360 — conferência automática do fechamento
--
-- Cada vez que alguém envia os relatórios do DataHotel na tela Conferência, o
-- servidor roda as regras e guarda aqui o resultado, com os arquivos usados
-- (nome e hash) e quem rodou. Nada se apaga: o histórico mostra a evolução e
-- serve de prova do que foi conferido em cada dia.

BEGIN;

CREATE TABLE hotel_conferencias (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id     uuid NOT NULL REFERENCES hotel_unidades(id) ON DELETE RESTRICT,
  periodo_inicio date NOT NULL,
  periodo_fim    date NOT NULL,
  arquivos       jsonb NOT NULL,
  resultado      jsonb NOT NULL,
  qtd_ok         integer NOT NULL CHECK (qtd_ok >= 0),
  qtd_divergente integer NOT NULL CHECK (qtd_divergente >= 0),
  qtd_atencao    integer NOT NULL CHECK (qtd_atencao >= 0),
  criado_por     uuid REFERENCES users(id),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conferencia_periodo CHECK (periodo_fim >= periodo_inicio)
);
CREATE INDEX idx_hotel_conferencias_recentes ON hotel_conferencias (unidade_id, criado_em DESC);

CREATE TRIGGER hotel_conferencias_sem_update BEFORE UPDATE ON hotel_conferencias
  FOR EACH ROW EXECUTE FUNCTION hotel_barrar_exclusao();
CREATE TRIGGER hotel_conferencias_sem_delete BEFORE DELETE ON hotel_conferencias
  FOR EACH ROW EXECUTE FUNCTION hotel_barrar_exclusao();
CREATE TRIGGER zzz_auditoria AFTER INSERT ON hotel_conferencias
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

COMMIT;
