-- Grade prevista por disciplina: quantas aulas semanais de cada disciplina
-- cada turma precisa ter (ex.: Matemática no 6ºA = 5). A tela compara com o
-- que já foi distribuído aos professores e mostra o que falta/sobra.
CREATE TABLE IF NOT EXISTS lotacao_previsto (
  id          uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  turma_id    uuid NOT NULL REFERENCES lotacao_turmas(id) ON DELETE CASCADE,
  disciplina  text NOT NULL,
  aulas       numeric(4,1) NOT NULL CHECK (aulas > 0 AND aulas <= 40),
  PRIMARY KEY (turma_id, disciplina)
);
CREATE TRIGGER zzz_auditoria AFTER INSERT OR UPDATE OR DELETE ON lotacao_previsto
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();
