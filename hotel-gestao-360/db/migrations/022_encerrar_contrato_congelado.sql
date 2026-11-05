-- Depois do primeiro fechamento, qualquer reajuste falhava: para abrir o
-- contrato novo o sistema encerra a vigência do anterior, e o congelamento
-- (016) recusava toda alteração num contrato que sustenta folha fechada.
--
-- Encerrar a vigência não muda o que foi pago, desde que o fim não corte
-- nenhuma competência travada. Isso passa a ser permitido; qualquer outra
-- alteração continua recusada.

BEGIN;

CREATE OR REPLACE FUNCTION folha_impedir_alteracao_de_contrato_remuneracao() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid := COALESCE(NEW.id, OLD.id);
  v_qtd int;
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'vigencia_fim') = (to_jsonb(OLD) - 'vigencia_fim')
     AND NEW.vigencia_fim IS NOT NULL
     AND NEW.vigencia_fim >= NEW.vigencia_inicio
     AND NOT EXISTS (
       SELECT 1 FROM folha_calculos c JOIN folha_periodos p ON p.id = c.periodo_id
        WHERE c.contrato_remuneracao_id = NEW.id
          AND folha_periodo_travado(p.status)
          AND (p.competencia || '-01')::date > NEW.vigencia_fim)
  THEN
    RETURN NEW;
  END IF;

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

COMMIT;
