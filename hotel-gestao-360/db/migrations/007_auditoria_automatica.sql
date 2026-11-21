-- Hotel Gestão 360 — Auditoria automática
--
-- Antes desta migration a tabela `audit_logs` existia mas nada a alimentava:
-- dependia de a aplicação lembrar de registrar. Agora é o banco que registra,
-- em toda alteração de toda tabela de negócio, sem a aplicação participar.
-- Se alguém alterar um dado por psql, por script ou por um bug, fica gravado.

BEGIN;

-- Quem fez a alteração vem da sessão: a aplicação faz
--   SET LOCAL app.user_id = '<uuid do usuário>';
-- logo após abrir a transação. Sem isso o log grava a mudança do mesmo jeito,
-- só que sem autor — perder o autor é ruim, perder o fato seria pior.
CREATE OR REPLACE FUNCTION registrar_auditoria() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_antes  jsonb;
  v_depois jsonb;
  v_id     text;
  -- Nunca copiar segredo nem dado sensível para dentro do log.
  v_sigilo text[] := ARRAY[
    'senha_hash','mfa_secret','token_hash',
    'cpf_cifrado','documento_cifrado','dados_bancarios_cifrados'
  ];
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_antes := to_jsonb(OLD) - v_sigilo;
    v_id    := OLD.id::text;
  ELSIF TG_OP = 'UPDATE' THEN
    v_antes  := to_jsonb(OLD) - v_sigilo;
    v_depois := to_jsonb(NEW) - v_sigilo;
    v_id     := NEW.id::text;
    -- UPDATE que não mudou nada não vira linha de log.
    IF v_antes = v_depois THEN RETURN NULL; END IF;
  ELSE
    v_depois := to_jsonb(NEW) - v_sigilo;
    v_id     := NEW.id::text;
  END IF;

  INSERT INTO audit_logs (user_id, acao, entidade, entidade_id, antes, depois)
  VALUES (
    NULLIF(current_setting('app.user_id', true), '')::uuid,
    CASE TG_OP WHEN 'INSERT' THEN 'CRIAR' WHEN 'UPDATE' THEN 'ALTERAR' ELSE 'EXCLUIR' END,
    TG_TABLE_NAME,
    v_id,
    v_antes,
    v_depois
  );
  RETURN NULL;
END;
$$;

-- Aplica em tudo que é dado de negócio. Ficam de fora as tabelas de apoio
-- (papéis, permissões, calendário) e a própria trilha.
DO $$
DECLARE
  t text;
  alvos text[] := ARRAY[
    'users','pessoas','employees','departments','cargos','cost_centers',
    'folha_salario_minimo','folha_tabela_inss','folha_tabela_inss_faixa',
    'folha_tabela_irrf','folha_tabela_irrf_faixa','folha_cct',
    'contratos_remuneracao','folha_periodos','folha_movimentos',
    'folha_lancamentos_avulsos','folha_calculos',
    'fornecedores','contas_pagar','pagamentos','receitas',
    'solicitacoes','solicitacao_decisoes','solicitacao_orcamentos',
    'contratos','contrato_reajustes','documentos',
    'jornadas','ponto_registros','banco_horas_lancamentos',
    'ausencias','ferias_periodos_aquisitivos'
  ];
BEGIN
  FOREACH t IN ARRAY alvos LOOP
    EXECUTE format(
      'CREATE TRIGGER zzz_auditoria AFTER INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION registrar_auditoria()', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------- partições

-- `audit_logs` cresce para sempre. Particionar por mês desde já custa quase
-- nada; fazer isso com 50 milhões de linhas custa uma janela de manutenção.
CREATE OR REPLACE FUNCTION criar_particao_audit(p_mes date) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_inicio date := date_trunc('month', p_mes)::date;
  v_fim    date := (date_trunc('month', p_mes) + interval '1 month')::date;
  v_nome   text := 'audit_logs_' || to_char(v_inicio, 'YYYY_MM');
BEGIN
  IF to_regclass(v_nome) IS NOT NULL THEN
    RETURN v_nome || ' (já existia)';
  END IF;
  EXECUTE format(
    'CREATE TABLE %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
    v_nome, v_inicio, v_fim);
  RETURN v_nome || ' (criada)';
END;
$$;

-- 24 meses adiante. Um job mensal deve chamar criar_particao_audit() para
-- manter a folga; enquanto isso a partição DEFAULT segura o que sobrar.
DO $$
DECLARE i int;
BEGIN
  FOR i IN -12..24 LOOP
    PERFORM criar_particao_audit((date_trunc('month', now()) + (i || ' months')::interval)::date);
  END LOOP;
END $$;

-- ---------------------------------------------------------- papéis de banco

-- A aplicação nunca deve poder apagar a trilha. Estes GRANTs valem para o role
-- que a aplicação usa; ajuste o nome conforme o provedor de nuvem.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hotel_app') THEN
    CREATE ROLE hotel_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hotel_leitura') THEN
    CREATE ROLE hotel_leitura NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO hotel_app, hotel_leitura;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hotel_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hotel_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM hotel_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO hotel_leitura;
-- Relatórios e BI não enxergam dado pessoal cifrado.
REVOKE SELECT ON pessoas, fornecedores FROM hotel_leitura;

COMMIT;
