-- Hotel Gestão 360 — Folha de pagamento e parâmetros legais
-- PostgreSQL 16+. Valores monetários em CENTAVOS (bigint). Nunca float.

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Competência é sempre 'AAAA-MM'. `text`, nunca `char(7)`: o padding do char
-- faz '2026-3' virar '2026-3 ' e nenhum JOIN contra '2026-03' bate.
CREATE DOMAIN competencia AS text
  CHECK (VALUE ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

CREATE OR REPLACE FUNCTION folha_periodo_travado(p_status text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_status IN ('APROVADO','ENVIADO_CONTABILIDADE','FECHADO');
$$;

-- ============================================================ parâmetros legais

CREATE TABLE folha_salario_minimo (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vigencia_inicio  date   NOT NULL,
  vigencia_fim     date,
  valor_centavos   bigint NOT NULL CHECK (valor_centavos > 0),
  fonte            text   NOT NULL,
  conferido_por_rh boolean NOT NULL DEFAULT false,
  conferido_por    uuid REFERENCES users(id),
  conferido_em     timestamptz,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT minimo_vigencia_valida CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);

-- O mínimo muda por decreto em data diferente da portaria do INSS: tabela
-- própria, senão trocar um obriga a reeditar o outro.
ALTER TABLE folha_salario_minimo ADD CONSTRAINT minimo_sem_sobreposicao
  EXCLUDE USING gist (daterange(vigencia_inicio, vigencia_fim, '[]') WITH &&)
  DEFERRABLE INITIALLY IMMEDIATE;

CREATE TABLE folha_tabela_inss (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao        text   NOT NULL,
  vigencia_inicio  date   NOT NULL,
  vigencia_fim     date,
  teto_centavos    bigint NOT NULL CHECK (teto_centavos > 0),
  fonte            text   NOT NULL,
  conferida_por_rh boolean NOT NULL DEFAULT false,
  conferida_por    uuid REFERENCES users(id),
  conferida_em     timestamptz,
  criada_em        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inss_vigencia_valida CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);

-- Impede duas tabelas vigentes ao mesmo tempo: a folha nunca fica ambígua.
-- DEFERRABLE para permitir fechar a antiga e abrir a nova em qualquer ordem
-- dentro da mesma transação.
ALTER TABLE folha_tabela_inss ADD CONSTRAINT inss_sem_sobreposicao
  EXCLUDE USING gist (daterange(vigencia_inicio, vigencia_fim, '[]') WITH &&)
  DEFERRABLE INITIALLY IMMEDIATE;

CREATE TABLE folha_tabela_inss_faixa (
  id           uuid   PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela_id    uuid   NOT NULL REFERENCES folha_tabela_inss(id) ON DELETE CASCADE,
  ordem        int    NOT NULL CHECK (ordem >= 1),
  ate_centavos bigint NOT NULL CHECK (ate_centavos > 0),
  aliquota     numeric(6,3) NOT NULL CHECK (aliquota >= 0 AND aliquota <= 100),
  UNIQUE (tabela_id, ordem)
);

CREATE INDEX idx_inss_faixa_tabela ON folha_tabela_inss_faixa (tabela_id, ordem);

CREATE TABLE folha_tabela_irrf (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao                      text   NOT NULL,
  vigencia_inicio                date   NOT NULL,
  vigencia_fim                   date,
  deducao_dependente_centavos    bigint NOT NULL CHECK (deducao_dependente_centavos >= 0),
  desconto_simplificado_centavos bigint NOT NULL CHECK (desconto_simplificado_centavos >= 0),
  fonte                          text   NOT NULL,
  conferida_por_rh               boolean NOT NULL DEFAULT false,
  conferida_por                  uuid REFERENCES users(id),
  conferida_em                   timestamptz,
  criada_em                      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT irrf_vigencia_valida CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);

ALTER TABLE folha_tabela_irrf ADD CONSTRAINT irrf_sem_sobreposicao
  EXCLUDE USING gist (daterange(vigencia_inicio, vigencia_fim, '[]') WITH &&)
  DEFERRABLE INITIALLY IMMEDIATE;

CREATE TABLE folha_tabela_irrf_faixa (
  id                       uuid   PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela_id                uuid   NOT NULL REFERENCES folha_tabela_irrf(id) ON DELETE CASCADE,
  ordem                    int    NOT NULL CHECK (ordem >= 1),
  ate_centavos             bigint,            -- NULL = última faixa, sem teto
  aliquota                 numeric(6,3) NOT NULL CHECK (aliquota >= 0 AND aliquota <= 100),
  parcela_deduzir_centavos bigint NOT NULL DEFAULT 0 CHECK (parcela_deduzir_centavos >= 0),
  UNIQUE (tabela_id, ordem)
);

CREATE INDEX idx_irrf_faixa_tabela ON folha_tabela_irrf_faixa (tabela_id, ordem);

-- ---------------------------------------------------------- invariantes das faixas

-- O motor assume faixas em ordem crescente. Uma linha fora de ordem produz
-- desconto errado em TODA a folha sem nenhum sintoma, e o cenário realista é
-- justamente o RH digitando a portaria do ano. Validar aqui é mais barato que
-- auditar holerite depois.
CREATE OR REPLACE FUNCTION folha_problemas_tabela_inss(p_tabela uuid) RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE v_qtd int; v_teto bigint; v_max bigint; v_fora int;
BEGIN
  SELECT count(*) INTO v_qtd FROM folha_tabela_inss_faixa WHERE tabela_id = p_tabela;
  IF v_qtd = 0 THEN RETURN 'tabela de INSS sem nenhuma faixa cadastrada'; END IF;

  SELECT count(*) INTO v_fora FROM (
    SELECT ate_centavos, ordem,
           lag(ate_centavos) OVER (ORDER BY ordem) AS anterior,
           row_number() OVER (ORDER BY ordem) AS esperada
      FROM folha_tabela_inss_faixa WHERE tabela_id = p_tabela
  ) f WHERE (anterior IS NOT NULL AND ate_centavos <= anterior) OR ordem <> esperada;
  IF v_fora > 0 THEN
    RETURN 'faixas do INSS precisam ter ordem contígua a partir de 1 e limites estritamente crescentes';
  END IF;

  SELECT teto_centavos INTO v_teto FROM folha_tabela_inss WHERE id = p_tabela;
  SELECT max(ate_centavos) INTO v_max FROM folha_tabela_inss_faixa WHERE tabela_id = p_tabela;
  IF v_teto IS DISTINCT FROM v_max THEN
    RETURN 'o limite da última faixa do INSS precisa ser igual ao teto de contribuição';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION folha_problemas_tabela_irrf(p_tabela uuid) RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE v_qtd int; v_sem_teto int; v_ultima_ordem int; v_ordem_do_nulo int; v_fora int;
BEGIN
  SELECT count(*) INTO v_qtd FROM folha_tabela_irrf_faixa WHERE tabela_id = p_tabela;
  IF v_qtd = 0 THEN RETURN 'tabela de IRRF sem nenhuma faixa cadastrada'; END IF;

  SELECT count(*) INTO v_sem_teto FROM folha_tabela_irrf_faixa
    WHERE tabela_id = p_tabela AND ate_centavos IS NULL;
  IF v_sem_teto <> 1 THEN
    RETURN 'a tabela de IRRF precisa ter exatamente uma faixa sem limite superior';
  END IF;

  SELECT max(ordem) INTO v_ultima_ordem FROM folha_tabela_irrf_faixa WHERE tabela_id = p_tabela;
  SELECT ordem INTO v_ordem_do_nulo FROM folha_tabela_irrf_faixa
    WHERE tabela_id = p_tabela AND ate_centavos IS NULL;
  IF v_ordem_do_nulo <> v_ultima_ordem THEN
    RETURN 'a faixa sem limite superior do IRRF precisa ser a última da tabela';
  END IF;

  SELECT count(*) INTO v_fora FROM (
    SELECT ate_centavos, ordem,
           lag(ate_centavos) OVER (ORDER BY ordem) AS anterior,
           row_number() OVER (ORDER BY ordem) AS esperada
      FROM folha_tabela_irrf_faixa WHERE tabela_id = p_tabela
  ) f WHERE (anterior IS NOT NULL AND ate_centavos IS NOT NULL AND ate_centavos <= anterior)
         OR ordem <> esperada;
  IF v_fora > 0 THEN
    RETURN 'faixas do IRRF precisam ter ordem contígua a partir de 1 e limites estritamente crescentes';
  END IF;

  RETURN NULL;
END;
$$;

-- A conferência do RH é o portão: só marca como conferida uma tabela coerente.
CREATE OR REPLACE FUNCTION folha_exigir_tabela_coerente() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_problema text;
BEGIN
  IF NEW.conferida_por_rh IS DISTINCT FROM true THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'folha_tabela_inss' THEN
    v_problema := folha_problemas_tabela_inss(NEW.id);
  ELSE
    v_problema := folha_problemas_tabela_irrf(NEW.id);
  END IF;
  IF v_problema IS NOT NULL THEN
    RAISE EXCEPTION 'Não é possível conferir a tabela: %', v_problema
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- BEFORE, não CONSTRAINT TRIGGER: a validação precisa falhar no ato da
-- conferência, e não na fila de gatilhos do fim do statement. O fluxo real é
-- criar a tabela, cadastrar as faixas e só então conferir — nesta ordem a
-- checagem inline sempre tem o que validar.
CREATE TRIGGER inss_coerente_para_conferir
  BEFORE INSERT OR UPDATE ON folha_tabela_inss
  FOR EACH ROW EXECUTE FUNCTION folha_exigir_tabela_coerente();

CREATE TRIGGER irrf_coerente_para_conferir
  BEFORE INSERT OR UPDATE ON folha_tabela_irrf
  FOR EACH ROW EXECUTE FUNCTION folha_exigir_tabela_coerente();

-- ---------------------------------------------------------- convenção coletiva

CREATE TABLE folha_cct (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                              text NOT NULL,
  -- Docente e administrativo coexistem: a categoria é o que permite resolver
  -- "qual CCT vale para este funcionário nesta competência" sem ambiguidade.
  categoria                         text NOT NULL CHECK (categoria IN ('DOCENTE','ADMINISTRATIVO','APOIO')),
  vigencia_inicio                   date NOT NULL,
  vigencia_fim                      date,
  modo_apuracao_hora_aula           text NOT NULL DEFAULT 'SEMANAS_FIXAS'
                                      CHECK (modo_apuracao_hora_aula IN ('SEMANAS_FIXAS','AULAS_EFETIVAS')),
  minutos_por_hora_aula             int  NOT NULL DEFAULT 50 CHECK (minutos_por_hora_aula BETWEEN 30 AND 60),
  semanas_por_mes                   numeric(4,2) NOT NULL DEFAULT 4.50 CHECK (semanas_por_mes > 0),
  dias_uteis_semana                 int  NOT NULL DEFAULT 6 CHECK (dias_uteis_semana BETWEEN 1 AND 7),
  dias_descanso_semana              int  NOT NULL DEFAULT 1 CHECK (dias_descanso_semana BETWEEN 0 AND 6),
  percentual_hora_atividade         numeric(6,3) NOT NULL DEFAULT 0,
  percentual_aula_extra             numeric(6,3) NOT NULL DEFAULT 0,
  percentual_adicional_noturno      numeric(6,3) NOT NULL DEFAULT 20,
  reflexo_dsr_adicional_noturno     boolean NOT NULL DEFAULT true,
  perde_dsr_por_falta_injustificada boolean NOT NULL DEFAULT true,
  piso_art_322                      boolean NOT NULL DEFAULT true,
  valor_minimo_hora_aula_centavos   bigint NOT NULL DEFAULT 0 CHECK (valor_minimo_hora_aula_centavos >= 0),
  divisor_mensal_horas              numeric(7,2) NOT NULL DEFAULT 220 CHECK (divisor_mensal_horas > 0),
  reflexo_dsr_horas_extras          boolean NOT NULL DEFAULT true,
  semanas_por_mes_horista_relogio   numeric(4,2) NOT NULL DEFAULT 5 CHECK (semanas_por_mes_horista_relogio > 0),
  ats_tipo                          text NOT NULL DEFAULT 'NENHUM'
                                      CHECK (ats_tipo IN ('NENHUM','ANUENIO','TRIENIO','QUINQUENIO')),
  ats_percentual_por_periodo        numeric(6,3) NOT NULL DEFAULT 0,
  ats_limite_periodos               int,
  fgts_percentual                   numeric(6,3) NOT NULL DEFAULT 8,
  cpp_percentual                    numeric(6,3) NOT NULL DEFAULT 20,
  rat_percentual                    numeric(6,3) NOT NULL DEFAULT 1,
  terceiros_percentual              numeric(6,3) NOT NULL DEFAULT 5.8,
  provisionar_decimo_terceiro       boolean NOT NULL DEFAULT true,
  provisionar_ferias                boolean NOT NULL DEFAULT true,
  terco_constitucional              numeric(7,4) NOT NULL DEFAULT 33.3333,
  vt_percentual_maximo              numeric(6,3) NOT NULL DEFAULT 6,
  conferida_por_rh                  boolean NOT NULL DEFAULT false,
  conferida_por                     uuid REFERENCES users(id),
  conferida_em                      timestamptz,
  criada_em                         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cct_vigencia_valida CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio),
  CONSTRAINT cct_descanso_menor_que_uteis CHECK (dias_descanso_semana < dias_uteis_semana)
);

ALTER TABLE folha_cct ADD CONSTRAINT cct_sem_sobreposicao_por_categoria
  EXCLUDE USING gist (
    categoria WITH =,
    daterange(vigencia_inicio, vigencia_fim, '[]') WITH &&
  ) DEFERRABLE INITIALLY IMMEDIATE;

-- ============================================================ contrato de remuneração

-- Versionado: reajuste da hora-aula cria uma linha nova. Recalcular uma
-- competência antiga precisa ver o valor que valia naquele mês.
CREATE TABLE contratos_remuneracao (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  cct_id                   uuid NOT NULL REFERENCES folha_cct(id) ON DELETE RESTRICT,
  regime                   text NOT NULL CHECK (regime IN ('HORISTA_AULA','MENSALISTA','HORISTA_RELOGIO')),
  vigencia_inicio          date NOT NULL,
  vigencia_fim             date,
  valor_hora_aula_centavos bigint CHECK (valor_hora_aula_centavos > 0),
  aulas_semanais           numeric(6,2) CHECK (aulas_semanais > 0),
  salario_base_centavos    bigint CHECK (salario_base_centavos > 0),
  carga_horaria_semanal    numeric(6,2) CHECK (carga_horaria_semanal > 0),
  valor_hora_centavos      bigint CHECK (valor_hora_centavos > 0),
  horas_semanais           numeric(6,2) CHECK (horas_semanais > 0),
  dependentes_irrf         int NOT NULL DEFAULT 0 CHECK (dependentes_irrf >= 0),
  periodos_tempo_servico   int NOT NULL DEFAULT 0 CHECK (periodos_tempo_servico >= 0),
  remuneracao_outros_vinculos_centavos bigint NOT NULL DEFAULT 0 CHECK (remuneracao_outros_vinculos_centavos >= 0),
  inss_outros_vinculos_centavos        bigint NOT NULL DEFAULT 0 CHECK (inss_outros_vinculos_centavos >= 0),
  criado_por               uuid REFERENCES users(id),
  criado_em                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT remuneracao_vigencia_valida CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio),

  -- Cada regime exige os SEUS campos e proíbe os dos outros. Sem a segunda
  -- metade, um mensalista podia carregar valor de hora-aula e um bug de
  -- mapeamento pagaria pelo campo errado sem nada acusar.
  CONSTRAINT remuneracao_campos_do_regime CHECK (
    (regime = 'HORISTA_AULA'    AND valor_hora_aula_centavos IS NOT NULL AND aulas_semanais IS NOT NULL)
 OR (regime = 'MENSALISTA'      AND salario_base_centavos IS NOT NULL AND carga_horaria_semanal IS NOT NULL)
 OR (regime = 'HORISTA_RELOGIO' AND valor_hora_centavos IS NOT NULL AND horas_semanais IS NOT NULL)
  ),
  CONSTRAINT remuneracao_valor_exclusivo CHECK (
    num_nonnulls(valor_hora_aula_centavos, salario_base_centavos, valor_hora_centavos) = 1
  ),
  CONSTRAINT remuneracao_carga_exclusiva CHECK (
    num_nonnulls(aulas_semanais, carga_horaria_semanal, horas_semanais) = 1
  ),

  -- Vigência sempre em mês fechado. Dissídio com data-base no meio do mês vira
  -- lançamento avulso de diferença salarial — que é como a contabilidade faz —
  -- em vez de dois contratos vigentes na mesma competência, estado que o motor
  -- não sabe calcular.
  CONSTRAINT remuneracao_vigencia_mensal CHECK (
    EXTRACT(DAY FROM vigencia_inicio) = 1
    AND (
      vigencia_fim IS NULL
      OR vigencia_fim = (date_trunc('month', vigencia_fim::timestamp) + interval '1 month - 1 day')::date
    )
  ),

  -- Permite a FK composta que amarra cálculo, contrato e funcionário.
  CONSTRAINT contratos_remuneracao_id_employee_key UNIQUE (id, employee_id)
);

ALTER TABLE contratos_remuneracao ADD CONSTRAINT remuneracao_sem_sobreposicao
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(vigencia_inicio, vigencia_fim, '[]') WITH &&
  ) DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX idx_remuneracao_employee_vigencia
  ON contratos_remuneracao (employee_id, vigencia_inicio DESC);
CREATE INDEX idx_remuneracao_cct ON contratos_remuneracao (cct_id);

-- O contrato não pode começar antes do vínculo existir.
CREATE OR REPLACE FUNCTION remuneracao_dentro_do_vinculo() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_admissao date; v_desligamento date;
BEGIN
  SELECT data_admissao, data_desligamento INTO v_admissao, v_desligamento
    FROM employees WHERE id = NEW.employee_id;
  IF NEW.vigencia_fim IS NOT NULL AND NEW.vigencia_fim < v_admissao THEN
    RAISE EXCEPTION 'Vigência da remuneração termina antes da admissão (%).', v_admissao
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_desligamento IS NOT NULL AND NEW.vigencia_inicio > v_desligamento THEN
    RAISE EXCEPTION 'Vigência da remuneração começa depois do desligamento (%).', v_desligamento
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER remuneracao_dentro_do_vinculo_trg
  BEFORE INSERT OR UPDATE ON contratos_remuneracao
  FOR EACH ROW EXECUTE FUNCTION remuneracao_dentro_do_vinculo();

-- ============================================================ apuração

CREATE TABLE folha_periodos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia    competencia NOT NULL,
  -- 13º (duas parcelas), férias, rescisão e adiantamento são folhas separadas
  -- na MESMA competência. Sem isto o sistema trava em uma folha por mês, e
  -- corrigir depois é migração de dados com folha fechada em produção.
  tipo_folha     text NOT NULL DEFAULT 'MENSAL'
                   CHECK (tipo_folha IN ('MENSAL','ADIANTAMENTO','DECIMO_TERCEIRO_1','DECIMO_TERCEIRO_2','FERIAS','RESCISAO')),
  status         text NOT NULL DEFAULT 'EM_CALCULO'
                   CHECK (status IN ('EM_CALCULO','COM_DIVERGENCIA','CONFERIDO','APROVADO','ENVIADO_CONTABILIDADE','FECHADO')),
  tabela_inss_id uuid NOT NULL REFERENCES folha_tabela_inss(id) ON DELETE RESTRICT,
  tabela_irrf_id uuid NOT NULL REFERENCES folha_tabela_irrf(id) ON DELETE RESTRICT,
  salario_minimo_id uuid NOT NULL REFERENCES folha_salario_minimo(id) ON DELETE RESTRICT,
  aberto_por     uuid REFERENCES users(id),
  aberto_em      timestamptz NOT NULL DEFAULT now(),
  fechado_por    uuid REFERENCES users(id),
  fechado_em     timestamptz,
  UNIQUE (competencia, tipo_folha)
);

CREATE INDEX idx_periodos_competencia ON folha_periodos (competencia DESC, tipo_folha);

-- Movimento do mês: projeção do que veio de Ponto, Banco de Horas e
-- solicitações aprovadas. `origem` e `gerado_em` existem para responder
-- "de onde saíram estas 3,5 aulas extras?".
CREATE TABLE folha_movimentos (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id                  uuid NOT NULL REFERENCES folha_periodos(id) ON DELETE RESTRICT,
  employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  aulas_efetivas              numeric(7,2) NOT NULL DEFAULT 0 CHECK (aulas_efetivas >= 0),
  aulas_extras                numeric(7,2) NOT NULL DEFAULT 0 CHECK (aulas_extras >= 0),
  aulas_substituicao          numeric(7,2) NOT NULL DEFAULT 0 CHECK (aulas_substituicao >= 0),
  aulas_noturnas              numeric(7,2) NOT NULL DEFAULT 0 CHECK (aulas_noturnas >= 0),
  aulas_nao_dadas             numeric(7,2) NOT NULL DEFAULT 0 CHECK (aulas_nao_dadas >= 0),
  semanas_falta_injustificada int NOT NULL DEFAULT 0 CHECK (semanas_falta_injustificada BETWEEN 0 AND 6),
  dias_falta                  numeric(5,2) NOT NULL DEFAULT 0 CHECK (dias_falta >= 0),
  dias_falta_injustificada    numeric(5,2) NOT NULL DEFAULT 0 CHECK (dias_falta_injustificada >= 0),
  horas_extras_50             numeric(7,2) NOT NULL DEFAULT 0 CHECK (horas_extras_50 >= 0),
  horas_extras_100            numeric(7,2) NOT NULL DEFAULT 0 CHECK (horas_extras_100 >= 0),
  horas_noturnas              numeric(7,2) NOT NULL DEFAULT 0 CHECK (horas_noturnas >= 0),
  horas_banco_a_descontar     numeric(7,2) NOT NULL DEFAULT 0 CHECK (horas_banco_a_descontar >= 0),
  dias_uteis_competencia      int,
  repousos_competencia        int,
  vale_transporte_centavos    bigint NOT NULL DEFAULT 0 CHECK (vale_transporte_centavos >= 0),
  pensao_modo                 text CHECK (pensao_modo IN ('VALOR','PERCENTUAL_LIQUIDO','PERCENTUAL_SALARIO_MINIMO')),
  pensao_quantidade           numeric(12,2) CHECK (pensao_quantidade >= 0),
  origem                      text NOT NULL DEFAULT 'MANUAL'
                                CHECK (origem IN ('MANUAL','PONTO','BANCO_HORAS','SOLICITACAO','IMPORTACAO')),
  gerado_em                   timestamptz NOT NULL DEFAULT now(),
  atualizado_em               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (periodo_id, employee_id),
  CONSTRAINT pensao_completa CHECK (num_nonnulls(pensao_modo, pensao_quantidade) IN (0, 2))
);

CREATE TRIGGER folha_movimentos_atualizado_em BEFORE UPDATE ON folha_movimentos
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE INDEX idx_movimentos_employee ON folha_movimentos (employee_id);

CREATE TABLE folha_lancamentos_avulsos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movimento_id   uuid NOT NULL REFERENCES folha_movimentos(id) ON DELETE CASCADE,
  tipo           text NOT NULL CHECK (tipo IN ('PROVENTO','DESCONTO')),
  descricao      text NOT NULL,
  valor_centavos bigint NOT NULL CHECK (valor_centavos >= 0),
  -- NEUTRA é o default seguro: consignado, coparticipação e adiantamento não
  -- reduzem base de INSS/IRRF/FGTS. Só falta e DSR perdido reduzem, e esses
  -- vêm do motor, não daqui.
  natureza_base  text NOT NULL DEFAULT 'NEUTRA'
                   CHECK (natureza_base IN ('INTEGRA','REDUZ','NEUTRA')),
  incide_inss    boolean NOT NULL DEFAULT false,
  incide_irrf    boolean NOT NULL DEFAULT false,
  incide_fgts    boolean NOT NULL DEFAULT false,
  criado_por     uuid REFERENCES users(id),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT avulso_neutro_nao_incide CHECK (
    natureza_base <> 'NEUTRA' OR NOT (incide_inss OR incide_irrf OR incide_fgts)
  ),
  CONSTRAINT avulso_provento_integra CHECK (tipo <> 'PROVENTO' OR natureza_base <> 'REDUZ')
);

CREATE INDEX idx_avulsos_movimento ON folha_lancamentos_avulsos (movimento_id);

-- Resultado do motor. O snapshot POR VALOR é o que torna o recálculo
-- reproduzível: guardar só o id do parâmetro não adianta se a linha apontada
-- puder ser editada depois. Os ids continuam como FK para rastreabilidade.
CREATE TABLE folha_calculos (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id                uuid NOT NULL REFERENCES folha_periodos(id) ON DELETE RESTRICT,
  employee_id               uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  competencia               competencia NOT NULL,
  contrato_remuneracao_id   uuid NOT NULL,
  cct_id                    uuid NOT NULL REFERENCES folha_cct(id) ON DELETE RESTRICT,
  tabela_inss_id            uuid NOT NULL REFERENCES folha_tabela_inss(id) ON DELETE RESTRICT,
  tabela_irrf_id            uuid NOT NULL REFERENCES folha_tabela_irrf(id) ON DELETE RESTRICT,
  parametros_snapshot       jsonb  NOT NULL,
  base_inss_centavos        bigint NOT NULL,
  base_irrf_centavos        bigint NOT NULL,
  base_fgts_centavos        bigint NOT NULL,
  total_proventos_centavos  bigint NOT NULL CHECK (total_proventos_centavos >= 0),
  total_descontos_centavos  bigint NOT NULL CHECK (total_descontos_centavos >= 0),
  liquido_centavos          bigint NOT NULL,
  remuneracao_bruta_centavos bigint NOT NULL,
  custo_empregador_centavos bigint NOT NULL,
  memoria                   jsonb  NOT NULL DEFAULT '[]'::jsonb,
  avisos                    jsonb  NOT NULL DEFAULT '[]'::jsonb,
  -- "Quais funcionários estão com divergência nesta competência?" é A query do
  -- fluxo de conferência; sem a coluna gerada seria seq scan + parse de jsonb.
  tem_divergencia boolean GENERATED ALWAYS AS
    (avisos @> '[{"severidade":"DIVERGENCIA"}]'::jsonb) STORED,
  calculado_em              timestamptz NOT NULL DEFAULT now(),

  UNIQUE (periodo_id, employee_id),
  CONSTRAINT calculo_liquido_coerente
    CHECK (liquido_centavos = total_proventos_centavos - total_descontos_centavos),
  CONSTRAINT calculo_json_e_array CHECK (
    jsonb_typeof(memoria) = 'array' AND jsonb_typeof(avisos) = 'array'
      AND jsonb_typeof(parametros_snapshot) = 'object'
  ),
  -- O contrato usado tem que ser do mesmo funcionário do cálculo.
  CONSTRAINT calculo_contrato_do_mesmo_employee
    FOREIGN KEY (contrato_remuneracao_id, employee_id)
    REFERENCES contratos_remuneracao (id, employee_id) ON DELETE RESTRICT,
  -- O input do cálculo precisa existir.
  CONSTRAINT calculo_tem_movimento
    FOREIGN KEY (periodo_id, employee_id)
    REFERENCES folha_movimentos (periodo_id, employee_id) ON DELETE RESTRICT
);

CREATE TABLE folha_rubricas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calculo_id     uuid NOT NULL REFERENCES folha_calculos(id) ON DELETE RESTRICT,
  ordem          int  NOT NULL,
  codigo         text NOT NULL,
  descricao      text NOT NULL,
  referencia     text NOT NULL,
  tipo           text NOT NULL CHECK (tipo IN ('PROVENTO','DESCONTO','ENCARGO_EMPREGADOR')),
  natureza_base  text NOT NULL CHECK (natureza_base IN ('INTEGRA','REDUZ','NEUTRA')),
  valor_centavos bigint NOT NULL CHECK (valor_centavos >= 0),
  incide_inss    boolean NOT NULL,
  incide_irrf    boolean NOT NULL,
  incide_fgts    boolean NOT NULL,
  UNIQUE (calculo_id, ordem)
);

CREATE INDEX idx_folha_rubricas_calculo ON folha_rubricas (calculo_id);
-- Holerite e informe de rendimentos vivem desta query.
CREATE INDEX idx_folha_calculos_employee ON folha_calculos (employee_id, competencia DESC);
CREATE INDEX idx_folha_calculos_divergencia
  ON folha_calculos (periodo_id) WHERE tem_divergencia;
CREATE INDEX idx_folha_calculos_contrato ON folha_calculos (contrato_remuneracao_id);
CREATE INDEX idx_folha_calculos_inss     ON folha_calculos (tabela_inss_id);
CREATE INDEX idx_folha_calculos_irrf     ON folha_calculos (tabela_irrf_id);
CREATE INDEX idx_folha_calculos_cct      ON folha_calculos (cct_id);

-- ---------------------------------------------------------- congelamento

-- Nada que sustentou uma folha aprovada ou fechada pode mudar depois. Sem isto,
-- um período FECHADO e já enviado à contabilidade pode ter a hora-aula, as
-- alíquotas e o próprio resultado editados, e o recálculo devolve outro número.
CREATE OR REPLACE FUNCTION folha_impedir_alteracao_de_parametro() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_coluna text := TG_ARGV[0];
  v_id uuid := COALESCE(NEW.id, OLD.id);
  v_qtd int;
BEGIN
  EXECUTE format(
    'SELECT count(*) FROM folha_calculos c
       JOIN folha_periodos p ON p.id = c.periodo_id
      WHERE c.%I = $1 AND folha_periodo_travado(p.status)', v_coluna)
    INTO v_qtd USING v_id;
  IF v_qtd > 0 THEN
    RAISE EXCEPTION
      'Parâmetro % sustenta % folha(s) aprovada(s) ou fechada(s) e não pode ser alterado nem removido', v_id, v_qtd
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER inss_congelado BEFORE UPDATE OR DELETE ON folha_tabela_inss
  FOR EACH ROW EXECUTE FUNCTION folha_impedir_alteracao_de_parametro('tabela_inss_id');
CREATE TRIGGER irrf_congelado BEFORE UPDATE OR DELETE ON folha_tabela_irrf
  FOR EACH ROW EXECUTE FUNCTION folha_impedir_alteracao_de_parametro('tabela_irrf_id');
CREATE TRIGGER cct_congelada BEFORE UPDATE OR DELETE ON folha_cct
  FOR EACH ROW EXECUTE FUNCTION folha_impedir_alteracao_de_parametro('cct_id');
CREATE TRIGGER remuneracao_congelada BEFORE UPDATE OR DELETE ON contratos_remuneracao
  FOR EACH ROW EXECUTE FUNCTION folha_impedir_alteracao_de_parametro('contrato_remuneracao_id');

-- As faixas seguem a tabela a que pertencem.
CREATE OR REPLACE FUNCTION folha_impedir_alteracao_de_faixa() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_coluna text := TG_ARGV[0];
  v_tabela uuid := COALESCE(NEW.tabela_id, OLD.tabela_id);
  v_qtd int;
BEGIN
  EXECUTE format(
    'SELECT count(*) FROM folha_calculos c
       JOIN folha_periodos p ON p.id = c.periodo_id
      WHERE c.%I = $1 AND folha_periodo_travado(p.status)', v_coluna)
    INTO v_qtd USING v_tabela;
  IF v_qtd > 0 THEN
    RAISE EXCEPTION 'Faixa pertence a tabela usada em % folha(s) fechada(s)', v_qtd
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER inss_faixa_congelada BEFORE UPDATE OR DELETE ON folha_tabela_inss_faixa
  FOR EACH ROW EXECUTE FUNCTION folha_impedir_alteracao_de_faixa('tabela_inss_id');
CREATE TRIGGER irrf_faixa_congelada BEFORE UPDATE OR DELETE ON folha_tabela_irrf_faixa
  FOR EACH ROW EXECUTE FUNCTION folha_impedir_alteracao_de_faixa('tabela_irrf_id');

-- O próprio resultado também congela.
CREATE OR REPLACE FUNCTION folha_impedir_alteracao_de_resultado() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_periodo uuid; v_status text;
BEGIN
  v_periodo := COALESCE(NEW.periodo_id, OLD.periodo_id);
  SELECT status INTO v_status FROM folha_periodos WHERE id = v_periodo;
  IF folha_periodo_travado(v_status) THEN
    RAISE EXCEPTION 'Folha em % não pode ser alterada', v_status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER calculo_congelado BEFORE UPDATE OR DELETE ON folha_calculos
  FOR EACH ROW EXECUTE FUNCTION folha_impedir_alteracao_de_resultado();
CREATE TRIGGER movimento_congelado BEFORE UPDATE OR DELETE ON folha_movimentos
  FOR EACH ROW EXECUTE FUNCTION folha_impedir_alteracao_de_resultado();

COMMIT;
