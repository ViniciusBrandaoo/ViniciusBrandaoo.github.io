-- Convite de acesso: link de uso único para a pessoa criar a própria senha.
-- Só o hash do código fica no banco; o link vale por prazo curto e uma vez só.
CREATE TABLE convites_acesso (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  email       citext NOT NULL,
  nome        text NOT NULL,
  perfis      text[] NOT NULL CHECK (cardinality(perfis) > 0),
  expira_em   timestamptz NOT NULL,
  usado_em    timestamptz,
  criado_por  uuid REFERENCES users(id),
  criado_em   timestamptz NOT NULL DEFAULT now()
);
