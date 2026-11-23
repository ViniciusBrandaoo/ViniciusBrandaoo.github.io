-- Hotel Gestão 360 — lista de café e apartamentos vindos do DataHotel
--
--   * hotel_cafe_dia: a Lista de Café da Manhã do DataHotel, por dia e
--     apartamento, com adultos e crianças separados. `tipo` separa a lista
--     principal (LISTA) do "Check-in Antecipado" (ANTECIPADO).
--   * hotel_apartamentos passa a aceitar importação da Lista de Camareira
--     (origem + código de origem + lote), como as hospedagens.
--   * os tipos de importação 'cafe' e 'apartamentos' entram no lote.

BEGIN;

ALTER TABLE hotel_import_lotes DROP CONSTRAINT IF EXISTS hotel_import_lotes_tipo_check;
ALTER TABLE hotel_import_lotes ADD CONSTRAINT hotel_import_lotes_tipo_check
  CHECK (tipo IN ('hospedagens','recebimentos','cafe','apartamentos'));

CREATE TABLE hotel_cafe_dia (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id     uuid NOT NULL REFERENCES hotel_unidades(id) ON DELETE RESTRICT,
  origem         text NOT NULL,
  codigo_origem  text NOT NULL CHECK (btrim(codigo_origem) <> ''),
  lote_id        uuid REFERENCES hotel_import_lotes(id) ON DELETE RESTRICT,
  data           date NOT NULL,
  apartamento    text NOT NULL,
  hospede        text NOT NULL,
  adultos        smallint NOT NULL CHECK (adultos >= 0),
  criancas       smallint NOT NULL DEFAULT 0 CHECK (criancas >= 0),
  tipo           text NOT NULL DEFAULT 'LISTA' CHECK (tipo IN ('LISTA','ANTECIPADO')),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade_id, origem, codigo_origem)
);
CREATE INDEX idx_hotel_cafe_dia ON hotel_cafe_dia (unidade_id, data);
CREATE TRIGGER hotel_cafe_dia_atualizado_em BEFORE UPDATE ON hotel_cafe_dia
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
CREATE TRIGGER hotel_cafe_dia_sem_delete BEFORE DELETE ON hotel_cafe_dia
  FOR EACH ROW EXECUTE FUNCTION hotel_barrar_exclusao();
CREATE TRIGGER zzz_auditoria AFTER INSERT OR UPDATE OR DELETE ON hotel_cafe_dia
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

ALTER TABLE hotel_apartamentos
  ADD COLUMN origem          text,
  ADD COLUMN codigo_origem   text,
  ADD COLUMN lote_id         uuid REFERENCES hotel_import_lotes(id) ON DELETE RESTRICT,
  ADD COLUMN situacao_origem text;
CREATE UNIQUE INDEX uq_hotel_apartamentos_origem
  ON hotel_apartamentos (unidade_id, origem, codigo_origem) WHERE origem IS NOT NULL;

COMMIT;
