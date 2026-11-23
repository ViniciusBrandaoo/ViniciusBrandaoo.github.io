-- Hotel Gestão 360 — colunas do "Relatório de Reservas" real do DataHotel
--
-- O relatório traz, por reserva: nº de diárias, nº de hóspedes (sem separar
-- adultos e crianças), canal de venda, funcionário e o valor total. Até aqui
-- só havia valor da diária; o total vem pronto do DataHotel e é guardado como
-- veio (sem recalcular a diária a partir dele).

BEGIN;

ALTER TABLE hotel_hospedagens
  ADD COLUMN total_hospedes       smallint CHECK (total_hospedes IS NULL OR total_hospedes >= 0),
  ADD COLUMN diarias              integer  CHECK (diarias IS NULL OR diarias >= 0),
  ADD COLUMN valor_total_centavos bigint   CHECK (valor_total_centavos IS NULL OR valor_total_centavos >= 0),
  ADD COLUMN canal_venda          text,
  ADD COLUMN funcionario          text;

COMMIT;
