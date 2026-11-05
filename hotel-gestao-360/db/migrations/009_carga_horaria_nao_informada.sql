-- Hotel Gestão 360 — Carga horária não informada, para Mensalista
--
-- `remuneracao_campos_do_regime` (002) exigia carga_horaria_semanal
-- preenchida para todo Mensalista — certo para impedir o bug que a própria
-- constraint documenta (campo mapeado errado sem nada acusar), mas errado
-- para quem a planilha da escola trouxe SEM carga horária: colaboradora de
-- meio período, salário abaixo do mínimo de jornada cheia. Inventar 44h
-- nesse caso reintroduziria o bug já corrigido no protótipo (ver
-- `L.colaboradorDaPlanilha` — "44h aqui inventaria jornada integral que não
-- existe"): dispara "abaixo do mínimo" para gente cujo salário é legal, só
-- que por jornada parcial não registrada.
--
-- Mensalista passa a aceitar carga_horaria_semanal NULL — "não informada",
-- estado explícito, não um zero disfarçado. Os outros dois regimes
-- continuam exigindo o campo deles: a proteção contra campo trocado
-- permanece para quem tem carga certa.

BEGIN;

ALTER TABLE contratos_remuneracao
  DROP CONSTRAINT remuneracao_campos_do_regime;

ALTER TABLE contratos_remuneracao
  ADD CONSTRAINT remuneracao_campos_do_regime CHECK (
    (regime = 'HORISTA_AULA'    AND valor_hora_aula_centavos IS NOT NULL AND aulas_semanais IS NOT NULL)
 OR (regime = 'MENSALISTA'      AND salario_base_centavos IS NOT NULL)
 OR (regime = 'HORISTA_RELOGIO' AND valor_hora_centavos IS NOT NULL AND horas_semanais IS NOT NULL)
  );

-- `= 1` barrava justamente o caso de Mensalista sem carga: os três campos
-- de carga viravam NULL de propósito, e exigir exatamente um preenchido
-- proibia isso. `<= 1` continua pegando o bug original (mais de um campo
-- preenchido ao mesmo tempo, sinal de mapeamento errado) e passa a aceitar
-- os três vazios.
ALTER TABLE contratos_remuneracao
  DROP CONSTRAINT remuneracao_carga_exclusiva;

ALTER TABLE contratos_remuneracao
  ADD CONSTRAINT remuneracao_carga_exclusiva CHECK (
    num_nonnulls(aulas_semanais, carga_horaria_semanal, horas_semanais) <= 1
  );

COMMIT;
