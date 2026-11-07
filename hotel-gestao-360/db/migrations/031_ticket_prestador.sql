-- Ticket (vale-alimentação/refeição) também para prestador MEI/PJ.
-- Pago à parte, não entra na nota fiscal: por isso não faz parte dos campos
-- que o gatilho `prestador_contrato_congelado` protege depois do pagamento.
ALTER TABLE contratos_prestador
  ADD COLUMN tem_ticket boolean NOT NULL DEFAULT false,
  ADD COLUMN valor_ticket_centavos bigint NOT NULL DEFAULT 0
    CONSTRAINT prestador_ticket_nao_negativo CHECK (valor_ticket_centavos >= 0);
