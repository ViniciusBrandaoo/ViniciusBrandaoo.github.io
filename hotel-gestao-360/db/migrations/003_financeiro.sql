-- Hotel Gestão 360 — Financeiro: fornecedores, contas a pagar, receitas e pagamentos
-- Valores em CENTAVOS (bigint). Nunca float.

BEGIN;

-- Fornecedor PF tem CPF, PJ tem CNPJ — ambos dado sob LGPD. Mesmo padrão de
-- `pessoas`: cifra com chave fora do banco, HMAC com pepper para busca.
CREATE TABLE fornecedores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social        text NOT NULL,
  nome_fantasia       text,
  tipo_documento      text NOT NULL CHECK (tipo_documento IN ('CNPJ','CPF')),
  documento_cifrado   bytea NOT NULL,
  documento_hash      text  NOT NULL UNIQUE,
  categoria           text,
  contato_nome        text,
  telefone            text,
  email               citext,
  dados_bancarios_cifrados bytea,
  observacoes         text,
  ativo               boolean NOT NULL DEFAULT true,
  criado_por          uuid REFERENCES users(id),
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER fornecedores_atualizado_em BEFORE UPDATE ON fornecedores
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE INDEX idx_fornecedores_razao_trgm ON fornecedores USING gin (razao_social gin_trgm_ops);
CREATE INDEX idx_fornecedores_ativos ON fornecedores (razao_social) WHERE ativo;

CREATE TABLE categorias_financeiras (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome     text NOT NULL UNIQUE,
  -- Agrupamento do fechamento mensal.
  grupo    text NOT NULL CHECK (grupo IN (
             'FOLHA_E_PESSOAL','IMPOSTOS','MATERIAL_DIDATICO','TECNOLOGIA','ESTRUTURA',
             'MANUTENCAO','MARKETING','TERCEIRIZADOS','EVENTOS','ADMINISTRATIVO','OUTROS','RECEITA')),
  natureza text NOT NULL CHECK (natureza IN ('DESPESA','RECEITA')),
  ativa    boolean NOT NULL DEFAULT true
);

CREATE TABLE contas_pagar (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao           text NOT NULL,
  fornecedor_id       uuid REFERENCES fornecedores(id) ON DELETE RESTRICT,
  categoria_id        uuid NOT NULL REFERENCES categorias_financeiras(id) ON DELETE RESTRICT,
  cost_center_id      uuid REFERENCES cost_centers(id) ON DELETE RESTRICT,
  competencia         competencia NOT NULL,
  vencimento          date   NOT NULL,
  valor_centavos      bigint NOT NULL CHECK (valor_centavos > 0),
  forma_pagamento     text CHECK (forma_pagamento IN ('BOLETO','PIX','TRANSFERENCIA','CARTAO','DINHEIRO','DEBITO_AUTOMATICO')),
  status              text NOT NULL DEFAULT 'RASCUNHO'
                        CHECK (status IN ('RASCUNHO','AGUARDANDO_APROVACAO','APROVADO','AGENDADO','PAGO','VENCIDO','CANCELADO')),
  numero_documento    text,
  observacoes         text,
  -- Quando a conta nasceu de uma solicitação aprovada, a origem fica registrada
  -- e ninguém redigita o que já foi digitado uma vez.
  solicitacao_id      uuid,
  responsavel_id      uuid REFERENCES users(id),
  criado_por          uuid REFERENCES users(id),
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conta_paga_tem_pagamento CHECK (status <> 'PAGO' OR forma_pagamento IS NOT NULL)
);

CREATE TRIGGER contas_pagar_atualizado_em BEFORE UPDATE ON contas_pagar
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE INDEX idx_contas_vencimento ON contas_pagar (vencimento)
  WHERE status IN ('APROVADO','AGENDADO','AGUARDANDO_APROVACAO','VENCIDO');
CREATE INDEX idx_contas_competencia ON contas_pagar (competencia, status);
CREATE INDEX idx_contas_fornecedor  ON contas_pagar (fornecedor_id);
CREATE INDEX idx_contas_categoria   ON contas_pagar (categoria_id);
CREATE INDEX idx_contas_centro      ON contas_pagar (cost_center_id);
CREATE INDEX idx_contas_descricao_trgm ON contas_pagar USING gin (descricao gin_trgm_ops);

CREATE TABLE pagamentos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id         uuid NOT NULL REFERENCES contas_pagar(id) ON DELETE RESTRICT,
  data_pagamento   date   NOT NULL,
  valor_centavos   bigint NOT NULL CHECK (valor_centavos > 0),
  forma_pagamento  text   NOT NULL,
  -- Pagamento parcial é comum (acordo, parcelamento). Uma conta pode ter N.
  observacoes      text,
  registrado_por   uuid REFERENCES users(id),
  registrado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pagamentos_conta ON pagamentos (conta_id);
CREATE INDEX idx_pagamentos_data  ON pagamentos (data_pagamento DESC);

CREATE TABLE receitas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao      text NOT NULL,
  categoria_id   uuid NOT NULL REFERENCES categorias_financeiras(id) ON DELETE RESTRICT,
  cost_center_id uuid REFERENCES cost_centers(id),
  competencia    competencia NOT NULL,
  data_prevista  date NOT NULL,
  data_recebida  date,
  valor_centavos bigint NOT NULL CHECK (valor_centavos > 0),
  status         text NOT NULL DEFAULT 'PREVISTA'
                   CHECK (status IN ('PREVISTA','RECEBIDA','ATRASADA','CANCELADA')),
  observacoes    text,
  criado_por     uuid REFERENCES users(id),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT receita_recebida_tem_data CHECK (status <> 'RECEBIDA' OR data_recebida IS NOT NULL)
);

CREATE TRIGGER receitas_atualizado_em BEFORE UPDATE ON receitas
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE INDEX idx_receitas_competencia ON receitas (competencia, status);

-- Ponte folha → financeiro: uma folha aprovada vira N contas a pagar (líquido
-- de cada funcionário, INSS, FGTS, IRRF, pensão). Sem esta tabela a conciliação
-- vira trabalho manual todo mês.
CREATE TABLE folha_contas_geradas (
  calculo_id uuid NOT NULL REFERENCES folha_calculos(id) ON DELETE RESTRICT,
  conta_id   uuid NOT NULL REFERENCES contas_pagar(id) ON DELETE RESTRICT,
  natureza   text NOT NULL CHECK (natureza IN ('LIQUIDO','INSS','FGTS','IRRF','PENSAO','PATRONAL')),
  PRIMARY KEY (calculo_id, natureza),
  UNIQUE (conta_id)
);

COMMIT;
