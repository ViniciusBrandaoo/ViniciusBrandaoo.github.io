-- Recebimento que estava no DataHotel e saiu do Relatório de Contas Recebidas numa
-- exportação posterior do mesmo período (estornado/excluído lá). Não se apaga: marca-se,
-- e a conferência mostra quando isso aconteceu.
ALTER TABLE hotel_recebimentos ADD COLUMN ausente_na_origem_desde timestamptz;
