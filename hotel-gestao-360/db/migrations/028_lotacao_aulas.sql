-- Lotação de aulas (lotacionograma): quantas aulas semanais cada professor dá
-- em cada turma, por disciplina, por ano letivo. É planejamento pedagógico,
-- não mexe na folha: o vínculo com o cadastro (employee_id) serve só para
-- comparar com as aulas do contrato.
CREATE TABLE IF NOT EXISTS lotacao_turmas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano           int  NOT NULL CHECK (ano BETWEEN 2020 AND 2100),
  codigo        text NOT NULL,
  etapa         text NOT NULL CHECK (etapa IN ('INFANTIL','FUND_I','FUND_II','MEDIO','PREP')),
  ordem         int  NOT NULL DEFAULT 0,
  aulas_semana  numeric(5,1) CHECK (aulas_semana IS NULL OR aulas_semana BETWEEN 0 AND 80),
  UNIQUE (ano, codigo)
);

CREATE TABLE IF NOT EXISTS lotacao_linhas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano              int  NOT NULL CHECK (ano BETWEEN 2020 AND 2100),
  disciplina       text NOT NULL,
  professor        text,
  employee_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
  camara           numeric(5,1) NOT NULL DEFAULT 0 CHECK (camara BETWEEN 0 AND 80),
  outros           numeric(5,1) NOT NULL DEFAULT 0 CHECK (outros BETWEEN 0 AND 80),
  disponibilidade  text,
  ordem            int NOT NULL DEFAULT 0,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lotacao_linhas_ano ON lotacao_linhas (ano, ordem);

CREATE TABLE IF NOT EXISTS lotacao_aulas (
  id        uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  linha_id  uuid NOT NULL REFERENCES lotacao_linhas(id) ON DELETE CASCADE,
  turma_id  uuid NOT NULL REFERENCES lotacao_turmas(id) ON DELETE CASCADE,
  aulas     numeric(4,1) NOT NULL CHECK (aulas > 0 AND aulas <= 40),
  PRIMARY KEY (linha_id, turma_id)
);

-- Mesma trilha automática de toda tabela de negócio (migration 007).
CREATE TRIGGER zzz_auditoria AFTER INSERT OR UPDATE OR DELETE ON lotacao_turmas
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();
CREATE TRIGGER zzz_auditoria AFTER INSERT OR UPDATE OR DELETE ON lotacao_linhas
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();
CREATE TRIGGER zzz_auditoria AFTER INSERT OR UPDATE OR DELETE ON lotacao_aulas
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();
