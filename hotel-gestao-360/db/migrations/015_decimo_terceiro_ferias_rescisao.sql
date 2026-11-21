-- Hotel Gestão 360 — 13º salário, férias e rescisão
-- Mesmo padrão de folha_calculos/folha_rubricas: um registro por evento
-- calculado, com rubrica detalhada, memória de cálculo e avisos — nunca
-- sobrescrito, sempre uma "foto" do que foi apurado.

BEGIN;

-- ============================================================ 13º salário

CREATE TABLE folha_decimo_terceiro (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id               uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  ano                       text NOT NULL CHECK (ano ~ '^[0-9]{4}$'),
  parcela                   smallint NOT NULL CHECK (parcela IN (1, 2)),
  contrato_remuneracao_id   uuid NOT NULL,
  base_remuneracao_centavos bigint NOT NULL CHECK (base_remuneracao_centavos >= 0),
  meses_trabalhados         smallint NOT NULL CHECK (meses_trabalhados BETWEEN 0 AND 12),
  base_proporcional_centavos bigint NOT NULL CHECK (base_proporcional_centavos >= 0),
  total_proventos_centavos  bigint NOT NULL CHECK (total_proventos_centavos >= 0),
  total_descontos_centavos  bigint NOT NULL CHECK (total_descontos_centavos >= 0),
  liquido_centavos          bigint NOT NULL,
  fgts_centavos             bigint NOT NULL CHECK (fgts_centavos >= 0),
  memoria                   jsonb NOT NULL DEFAULT '[]'::jsonb,
  avisos                    jsonb NOT NULL DEFAULT '[]'::jsonb,
  tem_divergencia boolean GENERATED ALWAYS AS
    (avisos @> '[{"severidade":"DIVERGENCIA"}]'::jsonb) STORED,
  pago                      boolean NOT NULL DEFAULT false,
  pago_em                   timestamptz,
  calculado_em              timestamptz NOT NULL DEFAULT now(),

  UNIQUE (employee_id, ano, parcela),
  CONSTRAINT decimo_liquido_coerente
    CHECK (liquido_centavos = total_proventos_centavos - total_descontos_centavos),
  CONSTRAINT decimo_contrato_do_mesmo_employee
    FOREIGN KEY (contrato_remuneracao_id, employee_id)
    REFERENCES contratos_remuneracao (id, employee_id) ON DELETE RESTRICT
);

CREATE TABLE folha_decimo_terceiro_rubricas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decimo_id      uuid NOT NULL REFERENCES folha_decimo_terceiro(id) ON DELETE RESTRICT,
  ordem          int  NOT NULL,
  codigo         text NOT NULL,
  descricao      text NOT NULL,
  referencia     text NOT NULL,
  tipo           text NOT NULL CHECK (tipo IN ('PROVENTO','DESCONTO','ENCARGO_EMPREGADOR')),
  valor_centavos bigint NOT NULL CHECK (valor_centavos >= 0),
  incide_inss    boolean NOT NULL,
  incide_irrf    boolean NOT NULL,
  incide_fgts    boolean NOT NULL,
  UNIQUE (decimo_id, ordem)
);

CREATE INDEX idx_decimo_rubricas ON folha_decimo_terceiro_rubricas (decimo_id);
CREATE INDEX idx_decimo_employee ON folha_decimo_terceiro (employee_id, ano);

-- ============================================================ férias

CREATE TABLE folha_ferias (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  contrato_remuneracao_id     uuid NOT NULL,
  periodo_aquisitivo_inicio   date NOT NULL,
  periodo_aquisitivo_fim      date NOT NULL,
  data_inicio_gozo            date NOT NULL,
  base_remuneracao_centavos   bigint NOT NULL CHECK (base_remuneracao_centavos >= 0),
  dias_ferias                 smallint NOT NULL CHECK (dias_ferias BETWEEN 0 AND 30),
  dias_vendidos                smallint NOT NULL DEFAULT 0 CHECK (dias_vendidos >= 0),
  dias_gozados                smallint NOT NULL CHECK (dias_gozados >= 0),
  total_proventos_centavos    bigint NOT NULL CHECK (total_proventos_centavos >= 0),
  total_descontos_centavos    bigint NOT NULL CHECK (total_descontos_centavos >= 0),
  liquido_centavos            bigint NOT NULL,
  fgts_centavos                bigint NOT NULL CHECK (fgts_centavos >= 0),
  memoria                     jsonb NOT NULL DEFAULT '[]'::jsonb,
  avisos                      jsonb NOT NULL DEFAULT '[]'::jsonb,
  tem_divergencia boolean GENERATED ALWAYS AS
    (avisos @> '[{"severidade":"DIVERGENCIA"}]'::jsonb) STORED,
  pago                        boolean NOT NULL DEFAULT false,
  pago_em                     timestamptz,
  calculado_em                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ferias_periodo_valido CHECK (periodo_aquisitivo_fim > periodo_aquisitivo_inicio),
  CONSTRAINT ferias_dias_coerentes CHECK (dias_gozados + dias_vendidos <= dias_ferias),
  CONSTRAINT ferias_liquido_coerente
    CHECK (liquido_centavos = total_proventos_centavos - total_descontos_centavos),
  CONSTRAINT ferias_contrato_do_mesmo_employee
    FOREIGN KEY (contrato_remuneracao_id, employee_id)
    REFERENCES contratos_remuneracao (id, employee_id) ON DELETE RESTRICT,
  -- Um período aquisitivo só se resolve (goza) uma vez.
  UNIQUE (employee_id, periodo_aquisitivo_inicio)
);

CREATE TABLE folha_ferias_rubricas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ferias_id      uuid NOT NULL REFERENCES folha_ferias(id) ON DELETE RESTRICT,
  ordem          int  NOT NULL,
  codigo         text NOT NULL,
  descricao      text NOT NULL,
  referencia     text NOT NULL,
  tipo           text NOT NULL CHECK (tipo IN ('PROVENTO','DESCONTO','ENCARGO_EMPREGADOR')),
  valor_centavos bigint NOT NULL CHECK (valor_centavos >= 0),
  incide_inss    boolean NOT NULL,
  incide_irrf    boolean NOT NULL,
  incide_fgts    boolean NOT NULL,
  UNIQUE (ferias_id, ordem)
);

CREATE INDEX idx_ferias_rubricas ON folha_ferias_rubricas (ferias_id);
CREATE INDEX idx_ferias_employee ON folha_ferias (employee_id);

-- ============================================================ rescisão

CREATE TABLE folha_rescisoes (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Um funcionário só rescinde o vínculo uma vez (o registro de desligamento
  -- já vive em employees.data_desligamento) — cadastro novo para quem volta.
  employee_id                       uuid NOT NULL UNIQUE REFERENCES employees(id) ON DELETE RESTRICT,
  contrato_remuneracao_id           uuid NOT NULL,
  tipo                              text NOT NULL CHECK (tipo IN ('SEM_JUSTA_CAUSA','PEDIDO_DEMISSAO','JUSTA_CAUSA','ACORDO')),
  data_desligamento                 date NOT NULL,
  base_remuneracao_centavos         bigint NOT NULL CHECK (base_remuneracao_centavos >= 0),
  aviso_previo_indenizado           boolean NOT NULL,
  dias_ferias_vencidas              smallint NOT NULL DEFAULT 0 CHECK (dias_ferias_vencidas >= 0),
  meses_ferias_proporcionais        smallint NOT NULL CHECK (meses_ferias_proporcionais BETWEEN 0 AND 12),
  meses_decimo_terceiro             smallint NOT NULL CHECK (meses_decimo_terceiro BETWEEN 0 AND 12),
  saldo_fgts_depositado_centavos    bigint NOT NULL DEFAULT 0 CHECK (saldo_fgts_depositado_centavos >= 0),
  total_proventos_centavos          bigint NOT NULL CHECK (total_proventos_centavos >= 0),
  total_descontos_centavos          bigint NOT NULL CHECK (total_descontos_centavos >= 0),
  liquido_centavos                  bigint NOT NULL,
  fgts_centavos                     bigint NOT NULL CHECK (fgts_centavos >= 0),
  multa_fgts_centavos               bigint NOT NULL CHECK (multa_fgts_centavos >= 0),
  memoria                           jsonb NOT NULL DEFAULT '[]'::jsonb,
  avisos                            jsonb NOT NULL DEFAULT '[]'::jsonb,
  homologada                        boolean NOT NULL DEFAULT false,
  homologada_por                    uuid REFERENCES users(id),
  homologada_em                     timestamptz,
  calculada_em                      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rescisao_liquido_coerente
    CHECK (liquido_centavos = total_proventos_centavos - total_descontos_centavos),
  CONSTRAINT rescisao_contrato_do_mesmo_employee
    FOREIGN KEY (contrato_remuneracao_id, employee_id)
    REFERENCES contratos_remuneracao (id, employee_id) ON DELETE RESTRICT
);

CREATE TABLE folha_rescisoes_rubricas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rescisao_id    uuid NOT NULL REFERENCES folha_rescisoes(id) ON DELETE RESTRICT,
  ordem          int  NOT NULL,
  codigo         text NOT NULL,
  descricao      text NOT NULL,
  referencia     text NOT NULL,
  tipo           text NOT NULL CHECK (tipo IN ('PROVENTO','DESCONTO','ENCARGO_EMPREGADOR')),
  valor_centavos bigint NOT NULL CHECK (valor_centavos >= 0),
  incide_inss    boolean NOT NULL,
  incide_irrf    boolean NOT NULL,
  incide_fgts    boolean NOT NULL,
  UNIQUE (rescisao_id, ordem)
);

CREATE INDEX idx_rescisoes_rubricas ON folha_rescisoes_rubricas (rescisao_id);

-- ============================================================ congelamento
--
-- Mesma lógica de folha_impedir_alteracao_de_parametro (002_folha.sql), mas
-- aqui a trava é mais simples: uma vez PAGO (13º/férias) ou HOMOLOGADA
-- (rescisão), o registro não muda mais — é o próprio holerite/TRCT emitido.

CREATE OR REPLACE FUNCTION folha_extra_impedir_alteracao_apos_pago() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.pago THEN
    RAISE EXCEPTION 'Registro já pago em % — não pode ser alterado nem excluído', OLD.pago_em
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.pago THEN
    RAISE EXCEPTION 'Registro já pago em % — não pode ser excluído', OLD.pago_em
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER decimo_congelado_apos_pago BEFORE UPDATE OR DELETE ON folha_decimo_terceiro
  FOR EACH ROW EXECUTE FUNCTION folha_extra_impedir_alteracao_apos_pago();
CREATE TRIGGER ferias_congelada_apos_pago BEFORE UPDATE OR DELETE ON folha_ferias
  FOR EACH ROW EXECUTE FUNCTION folha_extra_impedir_alteracao_apos_pago();

CREATE OR REPLACE FUNCTION folha_rescisao_impedir_alteracao_apos_homologada() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.homologada THEN
    RAISE EXCEPTION 'Rescisão já homologada em % — não pode ser alterada', OLD.homologada_em
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.homologada THEN
    RAISE EXCEPTION 'Rescisão já homologada em % — não pode ser excluída', OLD.homologada_em
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER rescisao_congelada_apos_homologada BEFORE UPDATE OR DELETE ON folha_rescisoes
  FOR EACH ROW EXECUTE FUNCTION folha_rescisao_impedir_alteracao_apos_homologada();

COMMIT;
