-- Hotel Gestão 360 — carga do professor por segmento (Infantil, Fundamental
-- 1/2, Médio, Pré-Vestibular)
--
-- `contratos_remuneracao.aulas_semanais` (migration 002) sempre guardou só o
-- TOTAL de aulas do professor — nunca como ele se divide entre os segmentos.
-- Essa divisão sempre existiu na planilha de origem (é dela que vem o valor
-- de hora-aula, calculado como média ponderada por segmento em
-- `importar-planilha.ts`), mas era descartada depois de somada. Resultado:
-- o filtro "por módulo" da tela de Funcionários (`L.modulosDe`) não tinha o
-- que ler contra o banco real — só contra `dados-reais.js`, carga de
-- demonstração que nunca chega à produção.
--
-- Uma tabela, não uma coluna nova em `contratos_remuneracao`: um professor
-- dá aula em vários segmentos ao mesmo tempo (Fundamental 1 e 2, por
-- exemplo), então é 1:N por contrato — mesmo padrão de `contrato_reajustes`
-- em `contratos_remuneracao`.

BEGIN;

CREATE TABLE contrato_cargas_segmento (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id  uuid NOT NULL REFERENCES contratos_remuneracao(id) ON DELETE CASCADE,
  segmento     text NOT NULL CHECK (segmento IN ('Infantil','Fundamental 1','Fundamental 2','Ensino Médio','Pré-Vestibular')),
  aulas        numeric(6,2) NOT NULL CHECK (aulas > 0),
  valor_hora_centavos bigint CHECK (valor_hora_centavos > 0),
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contrato_id, segmento)
);

CREATE INDEX idx_cargas_segmento_contrato ON contrato_cargas_segmento (contrato_id);

-- Mesma trilha automática de toda tabela de negócio (migration 007) —
-- tabela nova depois daquele `DO $$` precisa do próprio `CREATE TRIGGER`.
CREATE TRIGGER zzz_auditoria AFTER INSERT OR UPDATE OR DELETE ON contrato_cargas_segmento
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

COMMIT;
