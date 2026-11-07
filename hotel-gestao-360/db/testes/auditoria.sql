-- Prova que o banco registra sozinho toda alteração de dado de negócio,
-- com autor, valor anterior e valor novo — sem a aplicação participar.

\pset tuples_only on
BEGIN;

INSERT INTO users (id, nome, email, senha_hash)
VALUES ('11111111-1111-1111-1111-111111111111', 'Direção', 'direcao@teste.local', 'argon2id$segredo');

-- A aplicação declara quem está agindo logo após abrir a transação.
SET LOCAL app.user_id = '11111111-1111-1111-1111-111111111111';

INSERT INTO pessoas (id, nome, cpf_cifrado, cpf_hash)
VALUES ('22222222-2222-2222-2222-222222222222', 'Pedro Financeiro', '\xdeadbeef', 'hmac-pedro');

UPDATE pessoas SET telefone = '(11) 90000-0000'
 WHERE id = '22222222-2222-2222-2222-222222222222';

UPDATE pessoas SET telefone = '(11) 90000-0000'   -- não muda nada
 WHERE id = '22222222-2222-2222-2222-222222222222';

SELECT '1. alterações registradas para a pessoa: ' || count(*)::text
  FROM audit_logs WHERE entidade = 'pessoas';

SELECT '2. o UPDATE sem mudança real não virou log: ' ||
       CASE WHEN count(*) = 2 THEN 'confirmado' ELSE 'FALHOU (' || count(*) || ')' END
  FROM audit_logs WHERE entidade = 'pessoas';

SELECT '3. autor gravado: ' || COALESCE(u.nome, 'NENHUM')
  FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
 WHERE a.entidade = 'pessoas' AND a.acao = 'ALTERAR';

SELECT '4. valor anterior e novo preservados: ' ||
       COALESCE(antes->>'telefone', 'nulo') || ' -> ' || (depois->>'telefone')
  FROM audit_logs WHERE entidade = 'pessoas' AND acao = 'ALTERAR';

SELECT '5. dado sigiloso NÃO copiado para a trilha: ' ||
       CASE WHEN depois ? 'cpf_cifrado' THEN 'FALHOU — vazou' ELSE 'confirmado' END
  FROM audit_logs WHERE entidade = 'pessoas' AND acao = 'CRIAR';

SELECT '6. senha NÃO copiada para a trilha: ' ||
       CASE WHEN depois ? 'senha_hash' THEN 'FALHOU — vazou' ELSE 'confirmado' END
  FROM audit_logs WHERE entidade = 'users' AND acao = 'CRIAR';

-- Exclusão também deixa rastro, com o conteúdo do que foi apagado.
DELETE FROM pessoas WHERE id = '22222222-2222-2222-2222-222222222222';

SELECT '7. exclusão registrada com o conteúdo apagado: ' ||
       COALESCE(antes->>'nome', 'FALHOU')
  FROM audit_logs WHERE entidade = 'pessoas' AND acao = 'EXCLUIR';

SELECT '8. particionamento ativo: ' || count(*)::text || ' partições mensais'
  FROM pg_class c JOIN pg_inherits i ON i.inhrelid = c.oid
 WHERE i.inhparent = 'audit_logs'::regclass;

ROLLBACK;
