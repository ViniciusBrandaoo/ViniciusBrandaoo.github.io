-- Hotel Gestão 360 — base do hotel no banco (Etapa 3, passo 1)
--
-- Até aqui as telas do hotel gravavam no navegador. Esta migration cria o
-- mínimo para a importação do DataHotel ir para o PostgreSQL:
--   * perfis Recepção, Governança e Auditor;
--   * unidade, apartamentos e empresas clientes;
--   * lotes e linhas de importação (com hash do arquivo e quarentena);
--   * hospedagens e recebimentos importados.
--
-- Regras que o banco garante (não dependem da aplicação):
--   * o mesmo registro de origem não entra duas vezes: UNIQUE (origem, codigo_origem);
--   * o mesmo arquivo não é confirmado duas vezes para o mesmo tipo;
--   * líquido = bruto − desconto − taxa;
--   * check-out nunca antes do check-in;
--   * recebimento e hospedagem não são apagados (DELETE barrado): cancelar é mudar a situação.

BEGIN;

-- ------------------------------------------------------------- perfis

ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_chave_check;
ALTER TABLE roles ADD CONSTRAINT roles_chave_check CHECK (chave IN (
  'DIRECAO','FINANCEIRO','RH','ADMINISTRATIVO','COORDENACAO','SECRETARIA','GESTOR','CONSULTA',
  'RECEPCAO','GOVERNANCA','AUDITOR'));

INSERT INTO roles (chave, nome, descricao) VALUES
  ('RECEPCAO',   'Recepção',   'Hospedagens, café, frigobar e fechamento operacional do caixa.'),
  ('GOVERNANCA', 'Governança', 'Apartamentos, enxoval, lavanderia e reposição. Não vê dado financeiro nem salário.'),
  ('AUDITOR',    'Auditor',    'Somente leitura, para conferência externa (contador).')
ON CONFLICT (chave) DO NOTHING;

-- ------------------------------------------------------------- cadastros

CREATE TABLE hotel_unidades (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           text NOT NULL,
  fuso           text NOT NULL DEFAULT 'America/Sao_Paulo',
  config         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo          boolean NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER hotel_unidades_atualizado_em BEFORE UPDATE ON hotel_unidades
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- Uma unidade inicial, para o sistema funcionar antes do cadastro completo.
INSERT INTO hotel_unidades (nome) VALUES ('Hotel');

CREATE TABLE hotel_apartamentos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id    uuid NOT NULL REFERENCES hotel_unidades(id) ON DELETE RESTRICT,
  numero        text NOT NULL CHECK (btrim(numero) <> ''),
  tipo          text,
  capacidade    smallint CHECK (capacidade IS NULL OR capacidade > 0),
  situacao      text NOT NULL DEFAULT 'ATIVO' CHECK (situacao IN ('ATIVO','BLOQUEADO','INATIVO')),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade_id, numero)
);
CREATE TRIGGER hotel_apartamentos_atualizado_em BEFORE UPDATE ON hotel_apartamentos
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TABLE hotel_empresas_clientes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id     uuid NOT NULL REFERENCES hotel_unidades(id) ON DELETE RESTRICT,
  razao_social   text NOT NULL,
  nome_fantasia  text,
  cnpj           text CHECK (cnpj IS NULL OR cnpj ~ '^\d{14}$'),
  contato_nome   text,
  email_cobranca citext,
  telefone       text,
  prazo_dias     smallint NOT NULL DEFAULT 30 CHECK (prazo_dias BETWEEN 0 AND 180),
  dia_corte      smallint CHECK (dia_corte IS NULL OR dia_corte BETWEEN 1 AND 31),
  limite_centavos bigint CHECK (limite_centavos IS NULL OR limite_centavos >= 0),
  ativo          boolean NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_hotel_empresas_cnpj ON hotel_empresas_clientes (unidade_id, cnpj) WHERE cnpj IS NOT NULL;
CREATE UNIQUE INDEX uq_hotel_empresas_nome ON hotel_empresas_clientes (unidade_id, lower(razao_social));
CREATE TRIGGER hotel_empresas_clientes_atualizado_em BEFORE UPDATE ON hotel_empresas_clientes
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- ------------------------------------------------------------- importação

CREATE TABLE hotel_import_lotes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id      uuid NOT NULL REFERENCES hotel_unidades(id) ON DELETE RESTRICT,
  tipo            text NOT NULL CHECK (tipo IN ('hospedagens','recebimentos')),
  origem          text NOT NULL DEFAULT 'DATAHOTEL' CHECK (origem ~ '^[A-Z_]{3,30}$'),
  layout_versao   text NOT NULL,
  arquivo_nome    text NOT NULL,
  arquivo_formato text NOT NULL CHECK (arquivo_formato IN ('CSV','XLSX')),
  arquivo_sha256  text NOT NULL CHECK (arquivo_sha256 ~ '^[0-9a-f]{64}$'),
  periodo_inicio  date,
  periodo_fim     date,
  situacao        text NOT NULL DEFAULT 'PREVIA' CHECK (situacao IN ('PREVIA','CONFIRMADO','DESCARTADO')),
  qtd_total       integer NOT NULL DEFAULT 0 CHECK (qtd_total >= 0),
  qtd_novo        integer NOT NULL DEFAULT 0 CHECK (qtd_novo >= 0),
  qtd_atualizado  integer NOT NULL DEFAULT 0 CHECK (qtd_atualizado >= 0),
  qtd_identico    integer NOT NULL DEFAULT 0 CHECK (qtd_identico >= 0),
  qtd_rejeitado   integer NOT NULL DEFAULT 0 CHECK (qtd_rejeitado >= 0),
  erro_geral      text,
  criado_por      uuid REFERENCES users(id),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  confirmado_por  uuid REFERENCES users(id),
  confirmado_em   timestamptz,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lote_periodo_ordenado CHECK (periodo_fim IS NULL OR periodo_inicio IS NULL OR periodo_fim >= periodo_inicio),
  CONSTRAINT lote_confirmado_tem_autor CHECK (situacao <> 'CONFIRMADO' OR (confirmado_por IS NOT NULL AND confirmado_em IS NOT NULL)),
  -- Arquivo com erro de estrutura nunca é confirmado.
  CONSTRAINT lote_com_erro_nao_confirma CHECK (situacao <> 'CONFIRMADO' OR erro_geral IS NULL)
);
-- O mesmo arquivo não entra duas vezes no mesmo tipo.
CREATE UNIQUE INDEX uq_hotel_lote_arquivo_confirmado
  ON hotel_import_lotes (unidade_id, tipo, arquivo_sha256) WHERE situacao = 'CONFIRMADO';
CREATE INDEX idx_hotel_lotes_recentes ON hotel_import_lotes (unidade_id, tipo, criado_em DESC);
CREATE TRIGGER hotel_import_lotes_atualizado_em BEFORE UPDATE ON hotel_import_lotes
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TABLE hotel_import_linhas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id           uuid NOT NULL REFERENCES hotel_import_lotes(id) ON DELETE CASCADE,
  numero_linha      integer NOT NULL CHECK (numero_linha >= 1),
  codigo_origem     text,
  dados_brutos      jsonb NOT NULL,
  registro          jsonb,
  situacao          text NOT NULL CHECK (situacao IN ('NOVO','ATUALIZADO','IDENTICO','REJEITADO')),
  problemas         text[] NOT NULL DEFAULT '{}',
  campos_alterados  text[] NOT NULL DEFAULT '{}',
  registro_id       uuid,
  UNIQUE (lote_id, numero_linha),
  CONSTRAINT linha_rejeitada_tem_motivo CHECK (situacao <> 'REJEITADO' OR cardinality(problemas) > 0)
);
CREATE INDEX idx_hotel_import_linhas_lote ON hotel_import_linhas (lote_id, situacao);

-- ------------------------------------------------------------- hospedagens

CREATE TABLE hotel_hospedagens (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id         uuid NOT NULL REFERENCES hotel_unidades(id) ON DELETE RESTRICT,
  origem             text NOT NULL,
  codigo_origem      text NOT NULL CHECK (btrim(codigo_origem) <> ''),
  lote_id            uuid REFERENCES hotel_import_lotes(id) ON DELETE RESTRICT,
  apartamento        text NOT NULL,
  apartamento_id     uuid REFERENCES hotel_apartamentos(id) ON DELETE RESTRICT,
  -- Minimização (LGPD): só o nome como veio no relatório; documento do hóspede não é importado.
  hospede            text NOT NULL,
  empresa            text,
  empresa_id         uuid REFERENCES hotel_empresas_clientes(id) ON DELETE RESTRICT,
  checkin            date NOT NULL,
  checkout_previsto  date NOT NULL,
  checkout_real      date,
  adultos            smallint CHECK (adultos IS NULL OR adultos >= 0),
  criancas           smallint CHECK (criancas IS NULL OR criancas >= 0),
  cafe_incluido      boolean,
  valor_diaria_centavos bigint CHECK (valor_diaria_centavos IS NULL OR valor_diaria_centavos >= 0),
  consumos_centavos  bigint CHECK (consumos_centavos IS NULL OR consumos_centavos >= 0),
  descontos_centavos bigint CHECK (descontos_centavos IS NULL OR descontos_centavos >= 0),
  valor_pago_centavos bigint CHECK (valor_pago_centavos IS NULL OR valor_pago_centavos >= 0),
  forma_pagamento    text,
  situacao_origem    text,
  situacao           text NOT NULL DEFAULT 'ATIVA' CHECK (situacao IN ('ATIVA','ENCERRADA','CANCELADA')),
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade_id, origem, codigo_origem),
  CONSTRAINT hospedagem_datas CHECK (checkout_previsto >= checkin AND (checkout_real IS NULL OR checkout_real >= checkin))
);
CREATE INDEX idx_hotel_hosp_periodo ON hotel_hospedagens (unidade_id, checkin, checkout_previsto);
CREATE INDEX idx_hotel_hosp_empresa ON hotel_hospedagens (empresa_id) WHERE empresa_id IS NOT NULL;
CREATE TRIGGER hotel_hospedagens_atualizado_em BEFORE UPDATE ON hotel_hospedagens
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- ------------------------------------------------------------- recebimentos

CREATE TABLE hotel_recebimentos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id         uuid NOT NULL REFERENCES hotel_unidades(id) ON DELETE RESTRICT,
  origem             text NOT NULL,
  codigo_origem      text NOT NULL CHECK (btrim(codigo_origem) <> ''),
  lote_id            uuid REFERENCES hotel_import_lotes(id) ON DELETE RESTRICT,
  data               date NOT NULL,
  descricao          text,
  pagador            text,
  apartamento        text,
  reserva            text,
  hospedagem_id      uuid REFERENCES hotel_hospedagens(id) ON DELETE RESTRICT,
  forma              text NOT NULL CHECK (forma IN ('DINHEIRO','DEBITO','CREDITO','PIX','BOLETO','FATURADO','OUTRO')),
  bruto_centavos     bigint NOT NULL CHECK (bruto_centavos >= 0),
  desconto_centavos  bigint NOT NULL DEFAULT 0 CHECK (desconto_centavos >= 0),
  taxa_centavos      bigint NOT NULL DEFAULT 0 CHECK (taxa_centavos >= 0),
  liquido_centavos   bigint NOT NULL,
  parcelas           smallint CHECK (parcelas IS NULL OR parcelas BETWEEN 1 AND 48),
  codigo_transacao   text,
  bandeira           text,
  operadora          text,
  situacao           text NOT NULL DEFAULT 'REGISTRADO'
                       CHECK (situacao IN ('REGISTRADO','A_LIQUIDAR','LIQUIDADO','CONCILIADO','ESTORNADO','CANCELADO')),
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade_id, origem, codigo_origem),
  CONSTRAINT recebimento_liquido CHECK (liquido_centavos = bruto_centavos - desconto_centavos - taxa_centavos),
  CONSTRAINT recebimento_liquido_nao_negativo CHECK (liquido_centavos >= 0)
);
CREATE INDEX idx_hotel_receb_data ON hotel_recebimentos (unidade_id, data, forma);
CREATE INDEX idx_hotel_receb_reserva ON hotel_recebimentos (unidade_id, reserva) WHERE reserva IS NOT NULL;
CREATE TRIGGER hotel_recebimentos_atualizado_em BEFORE UPDATE ON hotel_recebimentos
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- ------------------------------------------------------------- sem DELETE

CREATE OR REPLACE FUNCTION hotel_barrar_exclusao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registro de % não pode ser apagado; mude a situação para CANCELADA/CANCELADO com motivo.', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER hotel_hospedagens_sem_delete BEFORE DELETE ON hotel_hospedagens
  FOR EACH ROW EXECUTE FUNCTION hotel_barrar_exclusao();
CREATE TRIGGER hotel_recebimentos_sem_delete BEFORE DELETE ON hotel_recebimentos
  FOR EACH ROW EXECUTE FUNCTION hotel_barrar_exclusao();
CREATE TRIGGER hotel_import_lotes_sem_delete BEFORE DELETE ON hotel_import_lotes
  FOR EACH ROW EXECUTE FUNCTION hotel_barrar_exclusao();

-- ------------------------------------------------------------- auditoria

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hotel_unidades','hotel_apartamentos','hotel_empresas_clientes',
    'hotel_import_lotes','hotel_hospedagens','hotel_recebimentos'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER zzz_auditoria AFTER INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION registrar_auditoria()', t);
  END LOOP;
END $$;

COMMIT;
