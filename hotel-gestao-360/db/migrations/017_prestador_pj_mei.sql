-- Hotel Gestão 360 — funcionário PJ/MEI (prestador de serviço)
--
-- `employees.tipo_contrato` já previa 'PJ' desde a migration 001, mas nunca
-- foi usado de verdade: toda criação de funcionário até hoje força um
-- `contratos_remuneracao` CLT (HORISTA_AULA/MENSALISTA/HORISTA_RELOGIO)
-- junto. Um prestador 100% MEI não tem CLT nenhum — colocá-lo lá como
-- CLT de R$0 seria mentir no cadastro.
--
-- O motor de cálculo (`src/dominio/folha/prestador.ts`, `calcularPrestador`)
-- já existe, já é testado, mas nunca foi ligado a banco/rota/tela — mesma
-- situação em que 13º/férias/rescisão estavam antes da migration 015.
--
-- Duas tabelas, mesmo padrão de `contratos_remuneracao`/`folha_calculos`:
-- uma para o VÍNCULO (termos do contrato de prestação, vigente por período)
-- e outra para cada PAGAMENTO calculado (uma "foto" por competência, nunca
-- sobrescrita).

BEGIN;

-- ============================================================ vínculo

CREATE TABLE contratos_prestador (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id               uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  enquadramento             text NOT NULL CHECK (enquadramento IN ('MEI','PJ_SIMPLES','PJ_LUCRO_PRESUMIDO')),
  -- CNPJ não é dado pessoal sensível como CPF (é registro público), mas
  -- cifra por consistência com o resto do sistema (fornecedores.documento_*)
  -- e porque um MEI liga direto a uma pessoa física. Fica NULL de propósito
  -- até o usuário informar — diferente de pessoas/fornecedores, aqui é
  -- opcional: o vínculo é válido sem CNPJ cadastrado ainda.
  cnpj_cifrado              bytea,
  cnpj_hash                 text UNIQUE,
  servico                   text NOT NULL,
  -- LC 123 art. 18-B: CPP de 20% da contratante sobre serviço de MEI só nas
  -- listadas (hidráulica, elétrica, pintura, alvenaria, carpintaria,
  -- manutenção de veículos). Ver `prestador.ts`.
  servico_com_cpp_no_mei    boolean NOT NULL DEFAULT false,
  iss_retido_na_fonte       boolean NOT NULL DEFAULT false,
  empresa_id                uuid REFERENCES empresas(id) ON DELETE RESTRICT,
  valor_mensal_centavos     bigint NOT NULL CHECK (valor_mensal_centavos >= 0),
  -- Descontos recorrentes que a escola deduz do prestador (ex.: plano de
  -- saúde, material) — mesma ideia dos "descontosFixos" que já existiam
  -- só no protótipo (`dados-colaboradores.js`), nunca no banco real.
  descontos_fixos           jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_inicio               date NOT NULL,
  data_fim                  date,
  -- Sinais de subordinação — alimentam a checagem de risco de vínculo
  -- (CLT art. 3º) que `calcularPrestador` já faz.
  tem_horario_fixo          boolean NOT NULL DEFAULT false,
  tem_exclusividade         boolean NOT NULL DEFAULT false,
  tem_subordinacao_direta   boolean NOT NULL DEFAULT false,
  substituivel_por_outro    boolean NOT NULL DEFAULT true,
  criado_em                 timestamptz NOT NULL DEFAULT now(),
  atualizado_em             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT prestador_contrato_do_mesmo_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT prestador_periodo_valido CHECK (data_fim IS NULL OR data_fim >= data_inicio),
  CONSTRAINT prestador_descontos_e_array CHECK (jsonb_typeof(descontos_fixos) = 'array')
);

CREATE TRIGGER contratos_prestador_atualizado_em BEFORE UPDATE ON contratos_prestador
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- Só um vínculo "aberto" (sem data_fim) por funcionário de cada vez — mesma
-- regra informal que contratos_remuneracao aplica por convenção de negócio.
CREATE UNIQUE INDEX idx_prestador_vigente_unico ON contratos_prestador (employee_id) WHERE data_fim IS NULL;
CREATE INDEX idx_prestador_employee ON contratos_prestador (employee_id);

-- ============================================================ pagamentos

CREATE TABLE prestador_pagamentos (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id                     uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  contrato_prestador_id           uuid NOT NULL REFERENCES contratos_prestador(id) ON DELETE RESTRICT,
  competencia                     competencia NOT NULL,
  valor_bruto_centavos            bigint NOT NULL CHECK (valor_bruto_centavos >= 0),
  total_retencoes_centavos        bigint NOT NULL CHECK (total_retencoes_centavos >= 0),
  total_descontos_fixos_centavos  bigint NOT NULL DEFAULT 0 CHECK (total_descontos_fixos_centavos >= 0),
  liquido_a_pagar_centavos        bigint NOT NULL,
  encargo_contratante_centavos    bigint NOT NULL CHECK (encargo_contratante_centavos >= 0),
  custo_total_centavos            bigint NOT NULL CHECK (custo_total_centavos >= 0),
  retencoes                       jsonb NOT NULL DEFAULT '[]'::jsonb,
  memoria                         jsonb NOT NULL DEFAULT '[]'::jsonb,
  avisos                          jsonb NOT NULL DEFAULT '[]'::jsonb,
  tem_divergencia boolean GENERATED ALWAYS AS
    (avisos @> '[{"severidade":"DIVERGENCIA"}]'::jsonb) STORED,
  pago                            boolean NOT NULL DEFAULT false,
  pago_em                         timestamptz,
  calculado_em                    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (employee_id, competencia),
  CONSTRAINT prestador_pagamento_do_mesmo_employee
    FOREIGN KEY (contrato_prestador_id) REFERENCES contratos_prestador(id),
  CONSTRAINT prestador_pagamento_liquido_coerente CHECK (
    liquido_a_pagar_centavos = valor_bruto_centavos - total_retencoes_centavos - total_descontos_fixos_centavos
  )
);

CREATE INDEX idx_prestador_pagamentos_competencia ON prestador_pagamentos (competencia);

CREATE OR REPLACE FUNCTION prestador_pagamento_impedir_alteracao_apos_pago() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.pago THEN
    RAISE EXCEPTION 'Pagamento já feito em % — não pode ser alterado', OLD.pago_em
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.pago THEN
    RAISE EXCEPTION 'Pagamento já feito em % — não pode ser excluído', OLD.pago_em
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER prestador_pagamento_congelado BEFORE UPDATE OR DELETE ON prestador_pagamentos
  FOR EACH ROW EXECUTE FUNCTION prestador_pagamento_impedir_alteracao_apos_pago();

-- O próprio vínculo congela nos campos que sustentam pagamento já feito —
-- mesma lógica da migration 016 para contratos_remuneracao. Exceção: o CNPJ
-- pode ser preenchido/atualizado mesmo com pagamento já feito — é o caso
-- previsto de propósito (funcionário cadastrado sem CNPJ, que chega depois),
-- e o CNPJ não influencia nenhum cálculo já persistido.
CREATE OR REPLACE FUNCTION prestador_contrato_impedir_alteracao() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid := COALESCE(NEW.id, OLD.id);
  v_qtd int;
  v_so_cnpj_mudou boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_so_cnpj_mudou := (
      NEW.employee_id, NEW.enquadramento, NEW.servico, NEW.servico_com_cpp_no_mei,
      NEW.iss_retido_na_fonte, NEW.empresa_id, NEW.valor_mensal_centavos, NEW.descontos_fixos,
      NEW.data_inicio, NEW.data_fim, NEW.tem_horario_fixo, NEW.tem_exclusividade,
      NEW.tem_subordinacao_direta, NEW.substituivel_por_outro
    ) IS NOT DISTINCT FROM (
      OLD.employee_id, OLD.enquadramento, OLD.servico, OLD.servico_com_cpp_no_mei,
      OLD.iss_retido_na_fonte, OLD.empresa_id, OLD.valor_mensal_centavos, OLD.descontos_fixos,
      OLD.data_inicio, OLD.data_fim, OLD.tem_horario_fixo, OLD.tem_exclusividade,
      OLD.tem_subordinacao_direta, OLD.substituivel_por_outro
    );
    IF v_so_cnpj_mudou THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT count(*) INTO v_qtd FROM prestador_pagamentos WHERE contrato_prestador_id = v_id AND pago;
  IF v_qtd > 0 THEN
    RAISE EXCEPTION 'Contrato sustenta % pagamento(s) já feito(s) e não pode ser alterado nem removido', v_qtd
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER prestador_contrato_congelado BEFORE UPDATE OR DELETE ON contratos_prestador
  FOR EACH ROW EXECUTE FUNCTION prestador_contrato_impedir_alteracao();

COMMIT;
