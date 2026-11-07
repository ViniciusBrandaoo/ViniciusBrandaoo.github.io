-- Alteração sensível de cadastro (salário, hora-aula, Ticket, MEI...) feita pelo RH: vale na hora,
-- mas fica numa solicitação para a Direção aceitar ou recusar; se recusar, volta como estava.
ALTER TABLE solicitacoes DROP CONSTRAINT IF EXISTS solicitacoes_tipo_check;
ALTER TABLE solicitacoes ADD CONSTRAINT solicitacoes_tipo_check CHECK (tipo IN (
  'COMPRA','PAGAMENTO','REEMBOLSO','HORA_EXTRA','AJUSTE_PONTO','AJUSTE_BANCO_HORAS',
  'MATERIAL','MANUTENCAO','TECNOLOGIA','CONTRATACAO','FERIAS','OUTRO','ALTERACAO_CADASTRO'));
-- Foto do que mudou: { employeeId, campos: [...], antes: {...}, depois: {...} }
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS revisao jsonb;
