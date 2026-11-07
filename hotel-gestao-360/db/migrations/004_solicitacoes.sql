-- Hotel Gestão 360 — Central de Solicitações e Aprovações
-- Máquina genérica: compra, pagamento, reembolso, hora extra, ajuste de ponto,
-- férias e contratação compartilham o mesmo fluxo. Uma implementação, não seis.

BEGIN;

CREATE TABLE fluxos_aprovacao (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          text NOT NULL UNIQUE,
  tipo_alvo     text NOT NULL CHECK (tipo_alvo IN (
                  'COMPRA','PAGAMENTO','REEMBOLSO','HORA_EXTRA','AJUSTE_PONTO','AJUSTE_BANCO_HORAS',
                  'MATERIAL','MANUTENCAO','TECNOLOGIA','CONTRATACAO','FERIAS','FOLHA','OUTRO')),
  -- Faixa de valor que aciona este fluxo. Compra de R$ 200 não precisa passar
  -- pela Direção; de R$ 20.000 precisa.
  valor_minimo_centavos bigint NOT NULL DEFAULT 0 CHECK (valor_minimo_centavos >= 0),
  valor_maximo_centavos bigint CHECK (valor_maximo_centavos IS NULL OR valor_maximo_centavos > valor_minimo_centavos),
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fluxos_etapas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fluxo_id      uuid NOT NULL REFERENCES fluxos_aprovacao(id) ON DELETE CASCADE,
  ordem         int  NOT NULL CHECK (ordem >= 1),
  nome          text NOT NULL,
  -- Quem aprova: por papel ('FINANCEIRO') ou pelo gestor direto do solicitante.
  role_id       uuid REFERENCES roles(id) ON DELETE RESTRICT,
  eh_gestor_direto boolean NOT NULL DEFAULT false,
  prazo_horas   int CHECK (prazo_horas IS NULL OR prazo_horas > 0),
  UNIQUE (fluxo_id, ordem),
  CONSTRAINT etapa_tem_aprovador CHECK (num_nonnulls(role_id) = 1 OR eh_gestor_direto)
);

CREATE TABLE solicitacoes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero            bigserial UNIQUE,          -- número legível para o dia a dia
  tipo              text NOT NULL CHECK (tipo IN (
                      'COMPRA','PAGAMENTO','REEMBOLSO','HORA_EXTRA','AJUSTE_PONTO','AJUSTE_BANCO_HORAS',
                      'MATERIAL','MANUTENCAO','TECNOLOGIA','CONTRATACAO','FERIAS','OUTRO')),
  titulo            text NOT NULL,
  justificativa     text NOT NULL,
  solicitante_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  department_id     uuid REFERENCES departments(id),
  cost_center_id    uuid REFERENCES cost_centers(id),
  fornecedor_id     uuid REFERENCES fornecedores(id),
  valor_centavos    bigint CHECK (valor_centavos IS NULL OR valor_centavos >= 0),
  urgencia          text NOT NULL DEFAULT 'NORMAL' CHECK (urgencia IN ('BAIXA','NORMAL','ALTA','CRITICA')),
  fluxo_id          uuid REFERENCES fluxos_aprovacao(id) ON DELETE RESTRICT,
  etapa_atual       int  NOT NULL DEFAULT 1,
  status            text NOT NULL DEFAULT 'RASCUNHO'
                      CHECK (status IN ('RASCUNHO','SOLICITADO','EM_APROVACAO','ALTERACAO_SOLICITADA',
                                        'APROVADO','REJEITADO','CONCLUIDO','CANCELADO')),
  -- Alvo do efeito quando a solicitação vira outra coisa (conta a pagar,
  -- lançamento de banco de horas, período de férias).
  gerou_entidade    text,
  gerou_entidade_id uuid,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  concluido_em      timestamptz,
  CONSTRAINT solicitacao_com_valor_tem_fluxo
    CHECK (status = 'RASCUNHO' OR valor_centavos IS NULL OR fluxo_id IS NOT NULL)
);

CREATE TRIGGER solicitacoes_atualizado_em BEFORE UPDATE ON solicitacoes
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE INDEX idx_solicitacoes_solicitante ON solicitacoes (solicitante_id, criado_em DESC);
CREATE INDEX idx_solicitacoes_abertas ON solicitacoes (status, urgencia, criado_em)
  WHERE status IN ('SOLICITADO','EM_APROVACAO','ALTERACAO_SOLICITADA');
CREATE INDEX idx_solicitacoes_titulo_trgm ON solicitacoes USING gin (titulo gin_trgm_ops);

-- Trilha completa: quem pediu, quem aprovou, quem rejeitou, quando e por quê.
-- Append-only: uma decisão registrada não se apaga.
CREATE TABLE solicitacao_decisoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE RESTRICT,
  etapa          int  NOT NULL,
  decisao        text NOT NULL CHECK (decisao IN ('APROVAR','REJEITAR','SOLICITAR_ALTERACAO','COMENTAR')),
  decidido_por   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  comentario     text,
  decidido_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rejeicao_tem_motivo CHECK (decisao <> 'REJEITAR' OR comentario IS NOT NULL)
);

CREATE TRIGGER decisoes_sem_alteracao BEFORE UPDATE OR DELETE ON solicitacao_decisoes
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao();

CREATE INDEX idx_decisoes_solicitacao ON solicitacao_decisoes (solicitacao_id, decidido_em);

-- Orçamentos para comparação antes da compra.
CREATE TABLE solicitacao_orcamentos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  fornecedor_id  uuid NOT NULL REFERENCES fornecedores(id) ON DELETE RESTRICT,
  valor_centavos bigint NOT NULL CHECK (valor_centavos > 0),
  prazo_dias     int,
  escolhido      boolean NOT NULL DEFAULT false,
  observacoes    text,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (solicitacao_id, fornecedor_id)
);

CREATE UNIQUE INDEX idx_orcamento_escolhido_unico
  ON solicitacao_orcamentos (solicitacao_id) WHERE escolhido;

-- Histórico de preço por item, para o alerta "este item está 21% mais caro
-- que na última compra".
CREATE TABLE compras_itens (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id   uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  fornecedor_id    uuid REFERENCES fornecedores(id),
  descricao        text NOT NULL,
  quantidade       numeric(12,3) NOT NULL CHECK (quantidade > 0),
  unidade          text NOT NULL DEFAULT 'UN',
  valor_unitario_centavos bigint NOT NULL CHECK (valor_unitario_centavos >= 0),
  comprado_em      date
);

CREATE INDEX idx_compras_itens_historico
  ON compras_itens (lower(descricao), comprado_em DESC NULLS LAST);

COMMIT;
