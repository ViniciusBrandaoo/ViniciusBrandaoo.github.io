-- Hotel Gestão 360 — ajustes de integridade sobre 13º/férias/rescisão
-- (015_decimo_terceiro_ferias_rescisao.sql), encontrados numa revisão
-- canto-a-canto antes de liberar o uso real:
--
--  1. (alto) `remuneracao_congelada` (002_folha.sql) só olhava
--     `folha_calculos` para decidir se um contrato pode ser alterado — um
--     contrato que só aparece em folha_decimo_terceiro/folha_ferias/
--     folha_rescisoes (nunca em folha_calculos) podia ser editado depois de
--     pago/homologado, sem trava nenhuma.
--  2. (médio) `folha_ferias` não impedia dois períodos aquisitivos
--     sobrepostos para o mesmo funcionário — só a UNIQUE de início exato.
--  3. (baixo) dois índices redundantes com o índice implícito da própria
--     UNIQUE constraint (prefixo já coberto).

BEGIN;

-- ============================================================ 1. congelamento do contrato

CREATE OR REPLACE FUNCTION folha_impedir_alteracao_de_contrato_remuneracao() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid := COALESCE(NEW.id, OLD.id);
  v_qtd int;
BEGIN
  SELECT
    (SELECT count(*) FROM folha_calculos c JOIN folha_periodos p ON p.id = c.periodo_id
      WHERE c.contrato_remuneracao_id = v_id AND folha_periodo_travado(p.status))
    + (SELECT count(*) FROM folha_decimo_terceiro WHERE contrato_remuneracao_id = v_id AND pago)
    + (SELECT count(*) FROM folha_ferias WHERE contrato_remuneracao_id = v_id AND pago)
    + (SELECT count(*) FROM folha_rescisoes WHERE contrato_remuneracao_id = v_id AND homologada)
    INTO v_qtd;
  IF v_qtd > 0 THEN
    RAISE EXCEPTION
      'Parâmetro % sustenta % folha(s)/evento(s) aprovado(s), pago(s) ou homologado(s) e não pode ser alterado nem removido', v_id, v_qtd
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS remuneracao_congelada ON contratos_remuneracao;
CREATE TRIGGER remuneracao_congelada BEFORE UPDATE OR DELETE ON contratos_remuneracao
  FOR EACH ROW EXECUTE FUNCTION folha_impedir_alteracao_de_contrato_remuneracao();

-- ============================================================ 2. férias: sem período aquisitivo sobreposto

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE folha_ferias ADD CONSTRAINT ferias_periodo_sem_sobreposicao
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(periodo_aquisitivo_inicio, periodo_aquisitivo_fim, '[]') WITH &&
  );

-- ============================================================ 3. índices redundantes com a UNIQUE

DROP INDEX IF EXISTS idx_decimo_employee;
DROP INDEX IF EXISTS idx_ferias_employee;

COMMIT;
