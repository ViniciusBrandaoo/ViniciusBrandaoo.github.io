-- Hotel Gestão 360 — Carga extra semanal no movimento
--
-- `folha_movimentos.aulas_extras` guarda aula AVULSA do mês: substituição,
-- reposição pontual. Paga uma vez, sem multiplicar.
--
-- A planilha da escola tem outra coisa nas colunas Tb.Ex, Raízes, Câmara e
-- Monitoria: carga que se repete TODA SEMANA. Ela segue a mesma regra da
-- carga regular — multiplica pelas 4,5 semanas do art. 320 antes do reflexo
-- de repouso.
--
-- Guardar as duas na mesma coluna paga um quarto do devido. Em agosto de 2026
-- isso seria R$ 26.894 a menos, distribuídos em 20 professores.

BEGIN;

ALTER TABLE folha_movimentos
  ADD COLUMN aulas_extras_semanais numeric(7,2) NOT NULL DEFAULT 0
    CHECK (aulas_extras_semanais >= 0),
  -- A hora-aula das extras costuma diferir da regular. 0 usa a do contrato.
  ADD COLUMN valor_hora_extra_centavos bigint NOT NULL DEFAULT 0
    CHECK (valor_hora_extra_centavos >= 0);

COMMENT ON COLUMN folha_movimentos.aulas_extras_semanais IS
  'Carga extra que se repete toda semana (monitoria, projetos, plantão). Multiplica pelas semanas do mês.';
COMMENT ON COLUMN folha_movimentos.aulas_extras IS
  'Aulas avulsas do mês (substituição, reposição). Não multiplica pelas semanas.';

COMMIT;
