-- Linha da lista de café que estava no DataHotel e saiu dela numa exportação
-- posterior do mesmo período (reserva alterada lá). Não se apaga: marca-se.
ALTER TABLE hotel_cafe_dia ADD COLUMN ausente_na_origem_desde timestamptz;

-- Relatórios da Direção gerados junto com a conferência (HTML pronto para PDF).
ALTER TABLE hotel_conferencias ADD COLUMN relatorios jsonb;
