-- Hotel Gestão 360 — Contratos recorrentes e Central de Documentos

BEGIN;

CREATE TABLE contratos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero             text UNIQUE,
  objeto             text NOT NULL,
  tipo               text NOT NULL CHECK (tipo IN ('FORNECEDOR','PRESTADOR','SOFTWARE','MANUTENCAO','LOCACAO','SERVICO','OUTRO')),
  fornecedor_id      uuid REFERENCES fornecedores(id) ON DELETE RESTRICT,
  categoria_id       uuid REFERENCES categorias_financeiras(id),
  cost_center_id     uuid REFERENCES cost_centers(id),
  data_inicio        date   NOT NULL,
  data_fim           date,
  valor_centavos     bigint NOT NULL CHECK (valor_centavos >= 0),
  periodicidade      text   NOT NULL DEFAULT 'MENSAL'
                       CHECK (periodicidade IN ('UNICA','MENSAL','BIMESTRAL','TRIMESTRAL','SEMESTRAL','ANUAL')),
  indice_reajuste    text,
  mes_reajuste       int CHECK (mes_reajuste IS NULL OR mes_reajuste BETWEEN 1 AND 12),
  renovacao_automatica boolean NOT NULL DEFAULT false,
  responsavel_id     uuid REFERENCES users(id),
  status             text NOT NULL DEFAULT 'ATIVO'
                       CHECK (status IN ('RASCUNHO','ATIVO','EM_RENOVACAO','ENCERRADO','CANCELADO')),
  observacoes        text,
  criado_por         uuid REFERENCES users(id),
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contrato_periodo_valido CHECK (data_fim IS NULL OR data_fim >= data_inicio),
  CONSTRAINT contrato_com_prazo_tem_fim CHECK (renovacao_automatica OR status <> 'ATIVO' OR data_fim IS NOT NULL)
);

CREATE TRIGGER contratos_atualizado_em BEFORE UPDATE ON contratos
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- O alerta de vencimento é a razão de ser do módulo: 90, 60, 30, 15 e 7 dias.
CREATE INDEX idx_contratos_vencendo ON contratos (data_fim)
  WHERE status IN ('ATIVO','EM_RENOVACAO') AND data_fim IS NOT NULL;
CREATE INDEX idx_contratos_fornecedor ON contratos (fornecedor_id);
CREATE INDEX idx_contratos_objeto_trgm ON contratos USING gin (objeto gin_trgm_ops);

CREATE TABLE contrato_reajustes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id    uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  aplicado_em    date   NOT NULL,
  valor_anterior_centavos bigint NOT NULL,
  valor_novo_centavos     bigint NOT NULL,
  percentual     numeric(7,3),
  indice         text,
  registrado_por uuid REFERENCES users(id),
  registrado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reajustes_contrato ON contrato_reajustes (contrato_id, aplicado_em DESC);

-- Central de Documentos: uma tabela para tudo (funcionário, fornecedor,
-- contrato, financeiro, pedagógico), com referência polimórfica e checksum.
-- O checksum é o que permite provar que o arquivo não foi trocado depois.
CREATE TABLE documentos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo           text NOT NULL,
  tipo             text NOT NULL CHECK (tipo IN (
                     'CONTRATO','NOTA_FISCAL','BOLETO','COMPROVANTE','ATESTADO','CERTIDAO',
                     'DOCUMENTO_PESSOAL','APOLICE','ALVARA','LAUDO','OUTRO')),
  -- Dono do documento. `entidade` diz qual tabela, `entidade_id` qual linha.
  entidade         text NOT NULL CHECK (entidade IN (
                     'employees','fornecedores','contratos','contas_pagar','solicitacoes','pessoas','escola')),
  entidade_id      uuid,
  storage_chave    text NOT NULL UNIQUE,   -- caminho no object storage
  nome_arquivo     text NOT NULL,
  mime_type        text NOT NULL,
  tamanho_bytes    bigint NOT NULL CHECK (tamanho_bytes > 0),
  checksum_sha256  text NOT NULL,
  -- Documento que vence gera alerta: certidão negativa, alvará, apólice, ASO.
  data_documento   date,
  data_vencimento  date,
  tags             text[] NOT NULL DEFAULT '{}',
  responsavel_id   uuid REFERENCES users(id),
  enviado_por      uuid REFERENCES users(id),
  enviado_em       timestamptz NOT NULL DEFAULT now(),
  removido_em      timestamptz,
  CONSTRAINT documento_da_escola_sem_id CHECK (
    (entidade = 'escola' AND entidade_id IS NULL) OR (entidade <> 'escola' AND entidade_id IS NOT NULL)
  )
);

CREATE INDEX idx_documentos_entidade ON documentos (entidade, entidade_id) WHERE removido_em IS NULL;
CREATE INDEX idx_documentos_vencendo ON documentos (data_vencimento)
  WHERE removido_em IS NULL AND data_vencimento IS NOT NULL;
CREATE INDEX idx_documentos_tags     ON documentos USING gin (tags);
CREATE INDEX idx_documentos_titulo_trgm ON documentos USING gin (titulo gin_trgm_ops);

COMMIT;
