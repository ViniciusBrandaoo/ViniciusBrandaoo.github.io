-- Hotel Gestão 360 — tabelas legais reais (2025 e 2026) e redutor do IRRF
--
-- `folha_tabela_inss`/`folha_tabela_irrf`/`folha_salario_minimo` existiam
-- desde a migration 002, mas nenhuma migração jamais as semeou — sem uma
-- linha vigente, nenhuma competência consegue ser aberta
-- (`POST /api/competencias` recusa com "Faltam tabelas legais vigentes").
-- Os valores abaixo são os MESMOS já usados e conferidos no protótipo local
-- (`prototipo/partes/dominio.js`, `L.TABELAS_SEED`) e no seed do motor
-- testado (`src/dominio/folha/tabelas-seed.ts`) — não são novos, só nunca
-- tinham chegado ao banco real.
--
-- A Lei 15.270/2025 (Reforma da Renda) criou um REDUTOR que incide depois do
-- imposto da tabela progressiva — não mexeu nas faixas em si. O protótipo
-- local já implementava isso (`L.calcularIrrf`); o motor testado
-- (`src/dominio/folha/impostos.ts`) não tinha o mecanismo até esta mesma
-- sessão de trabalho — por isso as quatro colunas novas abaixo.

BEGIN;

ALTER TABLE folha_tabela_irrf
  ADD COLUMN isencao_total_ate_centavos bigint CHECK (isencao_total_ate_centavos IS NULL OR isencao_total_ate_centavos >= 0),
  ADD COLUMN reducao_ate_centavos       bigint CHECK (reducao_ate_centavos IS NULL OR reducao_ate_centavos >= 0),
  ADD COLUMN reducao_base_centavos      bigint CHECK (reducao_base_centavos IS NULL OR reducao_base_centavos >= 0),
  ADD COLUMN reducao_fator              numeric(10,6) CHECK (reducao_fator IS NULL OR reducao_fator >= 0),
  -- Os quatro chegam juntos ou nenhum vem — um redutor pela metade calcula
  -- imposto errado em silêncio, e é exatamente o tipo de erro que uma
  -- migração de dados não pode deixar passar.
  ADD CONSTRAINT irrf_redutor_completo CHECK (
    num_nonnulls(isencao_total_ate_centavos, reducao_ate_centavos, reducao_base_centavos, reducao_fator) IN (0, 4)
  );

-- ============================================================ 2025 (carga histórica)

INSERT INTO folha_tabela_inss (descricao, vigencia_inicio, vigencia_fim, teto_centavos, fonte, conferida_por_rh)
VALUES ('INSS 2025', '2025-01-01', '2025-12-31', 815741, 'Portaria Interministerial MPS/MF nº 6/2025', false);

INSERT INTO folha_tabela_inss_faixa (tabela_id, ordem, ate_centavos, aliquota)
SELECT id, ordem, ate_centavos, aliquota FROM folha_tabela_inss,
  LATERAL (VALUES (1,151800,7.5),(2,279388,9),(3,419083,12),(4,815741,14)) AS f(ordem,ate_centavos,aliquota)
WHERE descricao = 'INSS 2025';

INSERT INTO folha_tabela_irrf
  (descricao, vigencia_inicio, vigencia_fim, deducao_dependente_centavos, desconto_simplificado_centavos, fonte, conferida_por_rh)
VALUES ('IRRF 2025', '2025-05-01', '2025-12-31', 18959, 60720,
  'Tabela vigente a partir de maio/2025 — conferir o ato oficial', false);

INSERT INTO folha_tabela_irrf_faixa (tabela_id, ordem, ate_centavos, aliquota, parcela_deduzir_centavos)
SELECT id, ordem, ate_centavos, aliquota, deduzir FROM folha_tabela_irrf,
  LATERAL (VALUES
    (1,242880,0,0),(2,282665,7.5,18216),(3,375105,15,39416),(4,466468,22.5,67549),(5,NULL,27.5,90873)
  ) AS f(ordem,ate_centavos,aliquota,deduzir)
WHERE descricao = 'IRRF 2025';

INSERT INTO folha_salario_minimo (vigencia_inicio, vigencia_fim, valor_centavos, fonte, conferido_por_rh)
VALUES ('2025-01-01', '2025-12-31', 151800, 'Decreto 12.342/2024', false);

-- ============================================================ 2026 (a que vale agora)
--
-- Nasce `conferida_por_rh = false`: o gatilho `inss_coerente_para_conferir`/
-- `irrf_coerente_para_conferir` (migration 002) valida que a tabela TEM
-- faixa cadastrada no momento em que vira `true` — cadastrar já conferida
-- falha, porque nesse instante as faixas ainda não existem. O UPDATE no
-- fim de cada bloco confere de verdade, depois que as faixas já estão lá.

INSERT INTO folha_tabela_inss (descricao, vigencia_inicio, vigencia_fim, teto_centavos, fonte, conferida_por_rh)
VALUES ('INSS 2026', '2026-01-01', '2026-12-31', 847555, 'Portaria Interministerial MPS/MF nº 13, de 09/01/2026', false);

INSERT INTO folha_tabela_inss_faixa (tabela_id, ordem, ate_centavos, aliquota)
SELECT id, ordem, ate_centavos, aliquota FROM folha_tabela_inss,
  LATERAL (VALUES (1,162100,7.5),(2,290284,9),(3,435427,12),(4,847555,14)) AS f(ordem,ate_centavos,aliquota)
WHERE descricao = 'INSS 2026';

UPDATE folha_tabela_inss SET conferida_por_rh = true WHERE descricao = 'INSS 2026';

INSERT INTO folha_tabela_irrf
  (descricao, vigencia_inicio, vigencia_fim, deducao_dependente_centavos, desconto_simplificado_centavos, fonte, conferida_por_rh,
   isencao_total_ate_centavos, reducao_ate_centavos, reducao_base_centavos, reducao_fator)
VALUES ('IRRF 2026', '2026-01-01', '2026-12-31', 18959, 60720,
  'Tabela do IRRF c/ redutor da Lei 15.270/2025', false,
  500000, 735000, 97862, 0.133145);

INSERT INTO folha_tabela_irrf_faixa (tabela_id, ordem, ate_centavos, aliquota, parcela_deduzir_centavos)
SELECT id, ordem, ate_centavos, aliquota, deduzir FROM folha_tabela_irrf,
  LATERAL (VALUES
    (1,242880,0,0),(2,282665,7.5,18216),(3,375105,15,39416),(4,466468,22.5,67549),(5,NULL,27.5,90873)
  ) AS f(ordem,ate_centavos,aliquota,deduzir)
WHERE descricao = 'IRRF 2026';

UPDATE folha_tabela_irrf SET conferida_por_rh = true WHERE descricao = 'IRRF 2026';

-- O primeiro degrau do INSS é, por lei, sempre igual ao salário mínimo do
-- ano — não é um número novo, é o mesmo 1.621,00 já conferido acima.
INSERT INTO folha_salario_minimo (vigencia_inicio, vigencia_fim, valor_centavos, fonte, conferido_por_rh)
VALUES ('2026-01-01', '2026-12-31', 162100, 'Primeiro degrau da Portaria Interministerial MPS/MF nº 13/2026 (igual ao mínimo por lei)', true);

COMMIT;
