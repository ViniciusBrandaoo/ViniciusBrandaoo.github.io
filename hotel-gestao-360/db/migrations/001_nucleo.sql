-- Hotel Gestão 360 — Núcleo: acesso, estrutura organizacional, pessoas e auditoria
-- PostgreSQL 16+. Valores monetários em CENTAVOS (bigint). Nunca float.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================ utilitários

-- `atualizado_em` com DEFAULT now() e sem trigger mente: fica igual ao criado_em
-- para sempre. Uma função só, reaproveitada por todas as tabelas mutáveis.
CREATE OR REPLACE FUNCTION set_atualizado_em() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION bloquear_alteracao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registro imutável: % em % não é permitido', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- ============================================================ acesso

CREATE TABLE roles (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave     text NOT NULL UNIQUE
              CHECK (chave IN ('DIRECAO','FINANCEIRO','RH','ADMINISTRATIVO','COORDENACAO','SECRETARIA','GESTOR','CONSULTA')),
  nome      text NOT NULL,
  descricao text
);

CREATE TABLE permissions (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave     text NOT NULL UNIQUE,   -- 'financeiro.contas.aprovar'
  modulo    text NOT NULL,
  descricao text NOT NULL
);

CREATE TABLE role_permissions (
  role_id       uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          text NOT NULL,
  email         citext NOT NULL UNIQUE,
  -- Argon2id. O hash e o salt ficam na própria string; nunca guardar a senha.
  senha_hash    text NOT NULL,
  mfa_secret    text,
  ativo         boolean NOT NULL DEFAULT true,
  ultimo_acesso timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER users_atualizado_em BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  ip          inet,
  user_agent  text,
  expira_em   timestamptz NOT NULL,
  revogada_em timestamptz,
  criada_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user ON sessions (user_id) WHERE revogada_em IS NULL;

-- ============================================================ estrutura organizacional

CREATE TABLE departments (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome      text NOT NULL UNIQUE,
  gestor_id uuid,                       -- FK para employees adicionada abaixo
  ativo     boolean NOT NULL DEFAULT true
);

CREATE TABLE cargos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL UNIQUE,
  eh_docente boolean NOT NULL DEFAULT false,
  ativo      boolean NOT NULL DEFAULT true
);

CREATE TABLE cost_centers (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome   text NOT NULL,
  ativo  boolean NOT NULL DEFAULT true
);

-- ============================================================ pessoas e vínculos

-- Pessoa é única por CPF. Vínculo (`employees`) não é: recontratação e o caso
-- comum do professor que também coordena geram dois vínculos para o mesmo CPF,
-- cada um com sua admissão, seu cargo e sua folha.
CREATE TABLE pessoas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  -- CPF e dados bancários são dado pessoal sob LGPD. `cpf_cifrado` usa chave de
  -- KMS/env, nunca guardada no banco. `cpf_hash` é HMAC-SHA256 com pepper fora
  -- do banco: hash simples de CPF é reversível em minutos (só 10^9 candidatos,
  -- e o dígito verificador reduz mais ainda).
  cpf_cifrado     bytea NOT NULL,
  cpf_hash        text  NOT NULL UNIQUE,
  data_nascimento date,
  telefone        text,
  email           citext,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER pessoas_atualizado_em BEFORE UPDATE ON pessoas
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE INDEX idx_pessoas_nome_trgm ON pessoas USING gin (nome gin_trgm_ops);

CREATE TABLE employees (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id                uuid NOT NULL REFERENCES pessoas(id) ON DELETE RESTRICT,
  user_id                  uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  -- A contabilidade não trabalha com UUID.
  matricula                text NOT NULL UNIQUE,
  cargo_id                 uuid REFERENCES cargos(id),
  department_id            uuid REFERENCES departments(id),
  cost_center_id           uuid REFERENCES cost_centers(id),
  gestor_id                uuid REFERENCES employees(id),
  data_admissao            date NOT NULL,
  data_desligamento        date,
  tipo_contrato            text NOT NULL DEFAULT 'CLT'
                             CHECK (tipo_contrato IN ('CLT','ESTAGIO','APRENDIZ','TEMPORARIO','PJ')),
  status                   text NOT NULL DEFAULT 'ATIVO'
                             CHECK (status IN ('ATIVO','AFASTADO','FERIAS','DESLIGADO')),
  dados_bancarios_cifrados bytea,
  observacoes              text,
  criado_em                timestamptz NOT NULL DEFAULT now(),
  atualizado_em            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT desligamento_apos_admissao
    CHECK (data_desligamento IS NULL OR data_desligamento >= data_admissao),
  CONSTRAINT desligado_tem_data
    CHECK (status <> 'DESLIGADO' OR data_desligamento IS NOT NULL)
);

CREATE TRIGGER employees_atualizado_em BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

ALTER TABLE departments
  ADD CONSTRAINT departments_gestor_fk FOREIGN KEY (gestor_id) REFERENCES employees(id);

-- Dois vínculos ativos da mesma pessoa podem coexistir (professor que coordena),
-- mas não dois vínculos com períodos sobrepostos e o mesmo cargo.
ALTER TABLE employees ADD CONSTRAINT employees_vinculo_sem_sobreposicao
  EXCLUDE USING gist (
    pessoa_id WITH =,
    cargo_id WITH =,
    daterange(data_admissao, data_desligamento, '[]') WITH &&
  );

CREATE INDEX idx_employees_pessoa     ON employees (pessoa_id);
CREATE INDEX idx_employees_department ON employees (department_id) WHERE status <> 'DESLIGADO';
CREATE INDEX idx_employees_gestor     ON employees (gestor_id);
CREATE INDEX idx_employees_matricula_trgm ON employees USING gin (matricula gin_trgm_ops);

-- ============================================================ auditoria

-- Trilha imutável de verdade: as triggers barram UPDATE e DELETE mesmo para
-- quem tiver privilégio de escrita. Particionada por mês desde o início —
-- particionar depois, com dezenas de milhões de linhas, é doloroso.
CREATE TABLE audit_logs (
  id            bigserial,
  ocorrido_em   timestamptz NOT NULL DEFAULT now(),
  user_id       uuid REFERENCES users(id),
  acao          text NOT NULL
                  CHECK (acao IN ('CRIAR','ALTERAR','EXCLUIR','APROVAR','REJEITAR','ACESSAR','EXPORTAR','LOGIN','LOGOUT')),
  entidade      text NOT NULL,
  entidade_id   text NOT NULL,
  antes         jsonb,
  depois        jsonb,
  ip            inet,
  justificativa text,
  PRIMARY KEY (id, ocorrido_em)
) PARTITION BY RANGE (ocorrido_em);

CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;

CREATE TRIGGER audit_logs_sem_alteracao
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao();

CREATE INDEX idx_audit_entidade ON audit_logs (entidade, entidade_id, ocorrido_em DESC);
CREATE INDEX idx_audit_user     ON audit_logs (user_id, ocorrido_em DESC);

-- ============================================================ notificações e alertas

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  severidade  text NOT NULL DEFAULT 'INFO' CHECK (severidade IN ('INFO','ATENCAO','CRITICO')),
  titulo      text NOT NULL,
  detalhe     text,
  -- Para onde o alerta leva. O gestor clica e cai na tela onde resolve.
  destino_modulo text,
  destino_id     text,
  lida_em     timestamptz,
  criada_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_pendentes
  ON notifications (user_id, criada_em DESC) WHERE lida_em IS NULL;

COMMIT;
