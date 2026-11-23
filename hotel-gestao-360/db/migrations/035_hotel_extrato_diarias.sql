-- Hotel Gestão 360 — diárias lançadas no extrato do DataHotel
--
-- O Relatório de Reservas com "Exibir extrato resumido" traz, por reserva, o
-- que foi realmente lançado na conta: DIÁRIA, CONSUMO e RECEBIMENTO. A diária
-- lançada pode diferir do "Vr. Total" da reserva (tarifa reservada x cobrada),
-- então os dois ficam guardados. Consumo e recebimento usam as colunas que já
-- existiam (consumos_centavos e valor_pago_centavos).

BEGIN;

ALTER TABLE hotel_hospedagens
  ADD COLUMN diarias_lancadas_centavos bigint CHECK (diarias_lancadas_centavos IS NULL OR diarias_lancadas_centavos >= 0);

COMMIT;
