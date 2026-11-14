-- Hotel Gestão 360 — Ponto, Banco de Horas, Férias e Ausências
-- O ponto é a origem do banco de horas, que é a origem do movimento da folha.
-- Uma falta registrada aqui percorre Ponto → Banco de horas → Folha → Dashboard.

BEGIN;

-- Jornada contratual: o que se espera do funcionário em cada dia da semana.
CREATE TABLE jornadas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  vigencia_inicio date NOT NULL,
  vigencia_fim    date,
  -- Minutos previstos por dia da semana, índice 0 = domingo.
  minutos_por_dia int[] NOT NULL,
  tolerancia_minutos int NOT NULL DEFAULT 10 CHECK (tolerancia_minutos >= 0),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jornada_sete_dias CHECK (array_length(minutos_por_dia, 1) = 7),
  CONSTRAINT jornada_vigencia_valida CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);

ALTER TABLE jornadas ADD CONSTRAINT jornada_sem_sobreposicao
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(vigencia_inicio, vigencia_fim, '[]') WITH &&
  ) DEFERRABLE INITIALLY IMMEDIATE;

-- Calendário escolar: sem ele o DSR sobre parcelas variáveis fica preso em 1/6
-- e a apuração por aulas efetivas não sabe distinguir recesso de falta.
CREATE TABLE calendario_dias (
  dia         date PRIMARY KEY,
  tipo        text NOT NULL DEFAULT 'LETIVO'
                CHECK (tipo IN ('LETIVO','NAO_LETIVO','FERIADO','RECESSO','FIM_DE_SEMANA','EXAMES')),
  descricao   text,
  conta_como_util boolean NOT NULL DEFAULT true,
  conta_como_repouso boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_calendario_tipo ON calendario_dias (tipo, dia);

CREATE TABLE ponto_registros (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  dia            date NOT NULL,
  entrada        time,
  saida_intervalo time,
  volta_intervalo time,
  saida          time,
  minutos_previstos int NOT NULL DEFAULT 0 CHECK (minutos_previstos >= 0),
  minutos_realizados int NOT NULL DEFAULT 0 CHECK (minutos_realizados >= 0),
  situacao       text NOT NULL DEFAULT 'NORMAL'
                   CHECK (situacao IN ('NORMAL','FALTA','FALTA_JUSTIFICADA','ATESTADO','FOLGA','FERIAS','AFASTAMENTO','FERIADO')),
  justificativa  text,
  ajustado_por   uuid REFERENCES users(id),
  ajustado_em    timestamptz,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, dia),
  CONSTRAINT ponto_ajuste_tem_justificativa
    CHECK (ajustado_por IS NULL OR justificativa IS NOT NULL)
);

CREATE TRIGGER ponto_atualizado_em BEFORE UPDATE ON ponto_registros
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE INDEX idx_ponto_employee_dia ON ponto_registros (employee_id, dia DESC);
CREATE INDEX idx_ponto_dia ON ponto_registros (dia) WHERE situacao <> 'NORMAL';

-- Banco de horas como razão (lançamentos), não como saldo mutável: o saldo é
-- derivado. Assim "por que meu saldo é -12h40?" sempre tem resposta.
CREATE TABLE banco_horas_lancamentos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  dia            date NOT NULL,
  minutos        int  NOT NULL,   -- positivo = crédito, negativo = débito
  origem         text NOT NULL
                   CHECK (origem IN ('PONTO','AJUSTE_MANUAL','COMPENSACAO','PAGAMENTO_EM_FOLHA','EXPIRACAO')),
  ponto_id       uuid REFERENCES ponto_registros(id) ON DELETE RESTRICT,
  solicitacao_id uuid REFERENCES solicitacoes(id) ON DELETE RESTRICT,
  justificativa  text,
  registrado_por uuid REFERENCES users(id),
  registrado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT banco_ajuste_tem_justificativa
    CHECK (origem <> 'AJUSTE_MANUAL' OR (justificativa IS NOT NULL AND registrado_por IS NOT NULL)),
  CONSTRAINT banco_lancamento_nao_nulo CHECK (minutos <> 0)
);

CREATE TRIGGER banco_sem_alteracao BEFORE UPDATE OR DELETE ON banco_horas_lancamentos
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao();

CREATE INDEX idx_banco_employee ON banco_horas_lancamentos (employee_id, dia DESC);

-- Saldo derivado. Materializar viria depois, se a leitura pesar.
CREATE VIEW banco_horas_saldo AS
SELECT
  e.id AS employee_id,
  COALESCE(sum(l.minutos) FILTER (WHERE l.minutos > 0), 0) AS minutos_positivos,
  COALESCE(sum(l.minutos) FILTER (WHERE l.minutos < 0), 0) AS minutos_negativos,
  COALESCE(sum(l.minutos), 0) AS saldo_minutos,
  CASE
    WHEN COALESCE(sum(l.minutos), 0) <= -600 THEN 'CRITICO'
    WHEN COALESCE(sum(l.minutos), 0) <   0   THEN 'ATENCAO'
    WHEN COALESCE(sum(l.minutos), 0) >= 1200 THEN 'EXCESSO'
    ELSE 'REGULAR'
  END AS situacao
FROM employees e
LEFT JOIN banco_horas_lancamentos l ON l.employee_id = e.id
WHERE e.status <> 'DESLIGADO'
GROUP BY e.id;

-- Férias, licenças, atestados e afastamentos no mesmo lugar: o calendário do
-- gestor precisa mostrar todos juntos para detectar conflito de equipe.
CREATE TABLE ausencias (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  tipo           text NOT NULL CHECK (tipo IN (
                   'FERIAS','ATESTADO','LICENCA_MATERNIDADE','LICENCA_PATERNIDADE','LICENCA_NAO_REMUNERADA',
                   'AFASTAMENTO_INSS','FOLGA','FALTA_JUSTIFICADA','SUSPENSAO','OUTRO')),
  data_inicio    date NOT NULL,
  data_fim       date NOT NULL,
  dias           int GENERATED ALWAYS AS (data_fim - data_inicio + 1) STORED,
  -- Férias: abono pecuniário (venda de até 1/3) e adiantamento do 13º.
  dias_abono     int NOT NULL DEFAULT 0 CHECK (dias_abono >= 0),
  adiantou_decimo_terceiro boolean NOT NULL DEFAULT false,
  status         text NOT NULL DEFAULT 'SOLICITADA'
                   CHECK (status IN ('SOLICITADA','APROVADA','EM_ANDAMENTO','CONCLUIDA','REJEITADA','CANCELADA')),
  solicitacao_id uuid REFERENCES solicitacoes(id) ON DELETE SET NULL,
  documento_id   uuid REFERENCES documentos(id) ON DELETE SET NULL,
  observacoes    text,
  criado_por     uuid REFERENCES users(id),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ausencia_periodo_valido CHECK (data_fim >= data_inicio)
);

CREATE TRIGGER ausencias_atualizado_em BEFORE UPDATE ON ausencias
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- Um funcionário não pode estar de férias e de atestado no mesmo dia.
ALTER TABLE ausencias ADD CONSTRAINT ausencia_sem_sobreposicao
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(data_inicio, data_fim, '[]') WITH &&
  ) WHERE (status IN ('SOLICITADA','APROVADA','EM_ANDAMENTO'))
  DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX idx_ausencias_periodo ON ausencias USING gist (daterange(data_inicio, data_fim, '[]'))
  WHERE status IN ('APROVADA','EM_ANDAMENTO');
CREATE INDEX idx_ausencias_employee ON ausencias (employee_id, data_inicio DESC);

-- Período aquisitivo de férias: sem ele não há como saber quem está próximo de
-- vencer o direito nem calcular a dobra do art. 137.
CREATE TABLE ferias_periodos_aquisitivos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  inicio             date NOT NULL,
  fim                date NOT NULL,
  limite_concessivo  date NOT NULL,
  dias_direito       int  NOT NULL DEFAULT 30 CHECK (dias_direito BETWEEN 0 AND 30),
  dias_gozados       int  NOT NULL DEFAULT 0  CHECK (dias_gozados >= 0),
  status             text NOT NULL DEFAULT 'ABERTO'
                       CHECK (status IN ('ABERTO','PARCIAL','QUITADO','VENCIDO')),
  UNIQUE (employee_id, inicio),
  CONSTRAINT aquisitivo_valido CHECK (fim > inicio AND limite_concessivo > fim),
  CONSTRAINT aquisitivo_nao_goza_mais_que_direito CHECK (dias_gozados <= dias_direito)
);

CREATE INDEX idx_aquisitivo_vencendo ON ferias_periodos_aquisitivos (limite_concessivo)
  WHERE status IN ('ABERTO','PARCIAL');

COMMIT;
