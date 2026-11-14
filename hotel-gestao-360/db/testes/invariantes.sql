-- Prova que o schema barra os estados inválidos que antes passavam.
-- Cada bloco tenta criar um estado incoerente e espera EXCEÇÃO.
-- Uso: psql -U postgres -d hotel -v ON_ERROR_STOP=1 -f invariantes.sql

\set ON_ERROR_STOP on
\pset tuples_only on

CREATE OR REPLACE FUNCTION deve_falhar(p_sql text, p_caso text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN others THEN
    RETURN format('OK    %s  (barrado: %s)', p_caso, left(SQLERRM, 60));
  END;
  RAISE EXCEPTION 'FALHOU: % foi aceito e deveria ter sido barrado', p_caso;
END;
$$;

BEGIN;

-- ---------------------------------------------------------------- massa mínima
INSERT INTO users (id, nome, email, senha_hash)
VALUES ('11111111-1111-1111-1111-111111111111', 'RH Teste', 'rh@teste.local', 'argon2id$fake');

INSERT INTO pessoas (id, nome, cpf_cifrado, cpf_hash)
VALUES ('22222222-2222-2222-2222-222222222222', 'Ana Professora', '\x00', 'hmac-ana');

INSERT INTO cargos (id, nome, eh_docente)
VALUES ('33333333-3333-3333-3333-333333333333', 'Professor', true);

INSERT INTO employees (id, pessoa_id, matricula, cargo_id, data_admissao)
VALUES ('44444444-4444-4444-4444-444444444444',
        '22222222-2222-2222-2222-222222222222', 'M-0001',
        '33333333-3333-3333-3333-333333333333', '2022-02-01');

INSERT INTO folha_tabela_inss (id, descricao, vigencia_inicio, vigencia_fim, teto_centavos, fonte)
VALUES ('55555555-5555-5555-5555-555555555555', 'INSS 2025', '2025-01-01', '2025-12-31', 815741, 'Portaria 6/2025');

INSERT INTO folha_tabela_inss_faixa (tabela_id, ordem, ate_centavos, aliquota) VALUES
  ('55555555-5555-5555-5555-555555555555', 1, 151800, 7.5),
  ('55555555-5555-5555-5555-555555555555', 2, 279388, 9),
  ('55555555-5555-5555-5555-555555555555', 3, 419083, 12),
  ('55555555-5555-5555-5555-555555555555', 4, 815741, 14);

INSERT INTO folha_tabela_irrf (id, descricao, vigencia_inicio, vigencia_fim,
                               deducao_dependente_centavos, desconto_simplificado_centavos, fonte)
VALUES ('66666666-6666-6666-6666-666666666666', 'IRRF 2025', '2025-01-01', '2025-12-31', 18959, 60720, 'Lei 14.848');

INSERT INTO folha_tabela_irrf_faixa (tabela_id, ordem, ate_centavos, aliquota, parcela_deduzir_centavos) VALUES
  ('66666666-6666-6666-6666-666666666666', 1, 242880, 0, 0),
  ('66666666-6666-6666-6666-666666666666', 2, 282665, 7.5, 18216),
  ('66666666-6666-6666-6666-666666666666', 3, 375105, 15, 39416),
  ('66666666-6666-6666-6666-666666666666', 4, 466468, 22.5, 67549),
  ('66666666-6666-6666-6666-666666666666', 5, NULL, 27.5, 90873);

INSERT INTO folha_salario_minimo (id, vigencia_inicio, vigencia_fim, valor_centavos, fonte)
VALUES ('77777777-7777-7777-7777-777777777777', '2025-01-01', '2025-12-31', 151800, 'Decreto 12.342');

INSERT INTO folha_cct (id, nome, categoria, vigencia_inicio)
VALUES ('88888888-8888-8888-8888-888888888888', 'CCT Docente', 'DOCENTE', '2025-01-01');

INSERT INTO contratos_remuneracao (id, employee_id, cct_id, regime, vigencia_inicio,
                                   valor_hora_aula_centavos, aulas_semanais)
VALUES ('99999999-9999-9999-9999-999999999999',
        '44444444-4444-4444-4444-444444444444',
        '88888888-8888-8888-8888-888888888888',
        'HORISTA_AULA', '2025-01-01', 2500, 20);

INSERT INTO folha_periodos (id, competencia, tabela_inss_id, tabela_irrf_id, salario_minimo_id)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '2025-08',
        '55555555-5555-5555-5555-555555555555',
        '66666666-6666-6666-6666-666666666666',
        '77777777-7777-7777-7777-777777777777');

INSERT INTO folha_movimentos (periodo_id, employee_id)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444');

INSERT INTO folha_calculos (
  id, periodo_id, employee_id, competencia, contrato_remuneracao_id, cct_id,
  tabela_inss_id, tabela_irrf_id, parametros_snapshot,
  base_inss_centavos, base_irrf_centavos, base_fgts_centavos,
  total_proventos_centavos, total_descontos_centavos, liquido_centavos,
  remuneracao_bruta_centavos, custo_empregador_centavos, avisos)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001',
        '44444444-4444-4444-4444-444444444444', '2025-08',
        '99999999-9999-9999-9999-999999999999',
        '88888888-8888-8888-8888-888888888888',
        '55555555-5555-5555-5555-555555555555',
        '66666666-6666-6666-6666-666666666666',
        '{"inss":{"teto":815741}}'::jsonb,
        262500, 262500, 262500, 262500, 21348, 241152, 262500, 422655,
        '[]'::jsonb);

SELECT 'massa criada' AS etapa;

-- ---------------------------------------------------------------- competência
SELECT deve_falhar($$
  INSERT INTO folha_periodos (competencia, tabela_inss_id, tabela_irrf_id, salario_minimo_id)
  VALUES ('2026-3', '55555555-5555-5555-5555-555555555555',
          '66666666-6666-6666-6666-666666666666', '77777777-7777-7777-7777-777777777777')
$$, 'competência sem zero à esquerda');

SELECT deve_falhar($$
  INSERT INTO folha_periodos (competencia, tabela_inss_id, tabela_irrf_id, salario_minimo_id)
  VALUES ('2026-13', '55555555-5555-5555-5555-555555555555',
          '66666666-6666-6666-6666-666666666666', '77777777-7777-7777-7777-777777777777')
$$, 'competência com mês 13');

-- ---------------------------------------------------------------- faixas
-- Tabela sem faixa alguma: antes, marcá-la como conferida fazia o motor
-- descontar R$ 0,00 de INSS de todo mundo, calado.
INSERT INTO folha_tabela_inss (id, descricao, vigencia_inicio, vigencia_fim, teto_centavos, fonte)
VALUES ('55555555-5555-5555-5555-555555555556', 'INSS vazia', '2026-01-01', '2026-12-31', 900000, 'teste');

SELECT deve_falhar($$
  UPDATE folha_tabela_inss SET conferida_por_rh = true
   WHERE id = '55555555-5555-5555-5555-555555555556'
$$, 'conferir tabela de INSS sem nenhuma faixa');

-- Faixas com ordem crescente e limites decrescentes: o RH digitou a portaria
-- com as linhas trocadas.
INSERT INTO folha_tabela_inss (id, descricao, vigencia_inicio, vigencia_fim, teto_centavos, fonte)
VALUES ('55555555-5555-5555-5555-555555555557', 'INSS invertida', '2027-01-01', '2027-12-31', 815741, 'teste');
INSERT INTO folha_tabela_inss_faixa (tabela_id, ordem, ate_centavos, aliquota) VALUES
  ('55555555-5555-5555-5555-555555555557', 1, 815741, 14),
  ('55555555-5555-5555-5555-555555555557', 2, 151800, 7.5);

SELECT deve_falhar($$
  UPDATE folha_tabela_inss SET conferida_por_rh = true
   WHERE id = '55555555-5555-5555-5555-555555555557'
$$, 'conferir tabela de INSS com faixas fora de ordem');

-- Faixa sem teto do IRRF fora da última posição: jogava todo mundo em 27,5%.
INSERT INTO folha_tabela_irrf (id, descricao, vigencia_inicio, vigencia_fim,
                               deducao_dependente_centavos, desconto_simplificado_centavos, fonte)
VALUES ('66666666-6666-6666-6666-666666666667', 'IRRF torta', '2026-01-01', '2026-12-31', 18959, 60720, 'teste');
INSERT INTO folha_tabela_irrf_faixa (tabela_id, ordem, ate_centavos, aliquota, parcela_deduzir_centavos) VALUES
  ('66666666-6666-6666-6666-666666666667', 1, NULL, 27.5, 90873),
  ('66666666-6666-6666-6666-666666666667', 2, 242880, 0, 0);

SELECT deve_falhar($$
  UPDATE folha_tabela_irrf SET conferida_por_rh = true
   WHERE id = '66666666-6666-6666-6666-666666666667'
$$, 'conferir tabela de IRRF com a faixa sem teto na primeira posição');

-- Duas tabelas vigentes ao mesmo tempo deixariam a folha ambígua.
SELECT deve_falhar($$
  INSERT INTO folha_tabela_inss (descricao, vigencia_inicio, vigencia_fim, teto_centavos, fonte)
  VALUES ('INSS sobreposta', '2025-06-01', '2026-06-30', 815741, 'teste')
$$, 'duas tabelas de INSS vigentes na mesma data');

-- Mas duas CCTs de categorias diferentes DEVEM coexistir.
INSERT INTO folha_cct (nome, categoria, vigencia_inicio)
VALUES ('CCT Administrativo', 'ADMINISTRATIVO', '2025-01-01');

SELECT deve_falhar($$
  INSERT INTO folha_cct (nome, categoria, vigencia_inicio)
  VALUES ('CCT Docente duplicada', 'DOCENTE', '2025-06-01')
$$, 'duas CCTs docentes vigentes ao mesmo tempo');

-- ---------------------------------------------------------------- regime exclusivo
SELECT deve_falhar($$
  INSERT INTO contratos_remuneracao (employee_id, cct_id, regime, vigencia_inicio,
                                     salario_base_centavos, carga_horaria_semanal,
                                     valor_hora_aula_centavos)
  VALUES ('44444444-4444-4444-4444-444444444444', '88888888-8888-8888-8888-888888888888',
          'MENSALISTA', '2030-01-01', 500000, 44, 3500)
$$, 'mensalista carregando valor de hora-aula');

SELECT deve_falhar($$
  INSERT INTO contratos_remuneracao (employee_id, cct_id, regime, vigencia_inicio,
                                     valor_hora_aula_centavos, aulas_semanais)
  VALUES ('44444444-4444-4444-4444-444444444444', '88888888-8888-8888-8888-888888888888',
          'HORISTA_AULA', '2030-03-10', 3000, 20)
$$, 'vigência de contrato começando no meio do mês');

-- ---------------------------------------------------------------- coerência do cálculo
SELECT deve_falhar($$
  UPDATE folha_calculos SET liquido_centavos = 999999999
   WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001'
$$, 'líquido divergente de proventos menos descontos');

-- ---------------------------------------------------------------- avulso neutro
SELECT deve_falhar($$
  INSERT INTO folha_lancamentos_avulsos (movimento_id, tipo, descricao, valor_centavos,
                                         natureza_base, incide_inss)
  SELECT id, 'DESCONTO', 'Consignado', 50000, 'NEUTRA', true FROM folha_movimentos LIMIT 1
$$, 'desconto neutro marcado como incidente sobre INSS');

-- ---------------------------------------------------------------- auditoria imutável
INSERT INTO audit_logs (acao, entidade, entidade_id) VALUES ('CRIAR', 'employees', 'x');

SELECT deve_falhar($$ UPDATE audit_logs SET acao = 'ACESSAR' $$, 'UPDATE em audit_logs');
SELECT deve_falhar($$ DELETE FROM audit_logs $$, 'DELETE em audit_logs');

-- ---------------------------------------------------------------- congelamento
UPDATE folha_periodos SET status = 'FECHADO'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

SELECT deve_falhar($$
  UPDATE contratos_remuneracao SET valor_hora_aula_centavos = 99999
   WHERE id = '99999999-9999-9999-9999-999999999999'
$$, 'alterar hora-aula usada em folha FECHADA');

SELECT deve_falhar($$
  UPDATE folha_tabela_inss_faixa SET aliquota = 99
   WHERE tabela_id = '55555555-5555-5555-5555-555555555555'
$$, 'alterar alíquota de INSS usada em folha FECHADA');

SELECT deve_falhar($$
  DELETE FROM folha_tabela_inss_faixa WHERE tabela_id = '55555555-5555-5555-5555-555555555555'
$$, 'apagar faixas de INSS usadas em folha FECHADA');

SELECT deve_falhar($$
  UPDATE folha_calculos SET liquido_centavos = 1, total_descontos_centavos = 262499
   WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001'
$$, 'editar resultado de folha FECHADA');

SELECT deve_falhar($$
  DELETE FROM folha_periodos WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'
$$, 'apagar período FECHADO levando a folha junto');

ROLLBACK;
