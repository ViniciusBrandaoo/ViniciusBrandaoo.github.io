-- Hotel Gestão 360 — cadeia de aprovação dinâmica para solicitações
--
-- `004_solicitacoes.sql` desenhou um motor de fluxo CONFIGURÁVEL:
-- `fluxos_aprovacao`/`fluxos_etapas` são um template fixo por tipo (etapas
-- por `role_id`), e `solicitacoes.etapa_atual` navega esse template. Mas o
-- protótipo local (`prototipo/partes/dominio.js`, `L.cadeiaDeAprovacao`)
-- nunca usou um template fixo — a cadeia é CALCULADA por solicitação, a
-- partir do VALOR: sobe de nível em nível até achar quem tem alçada para
-- aquele valor, e só chega na Direção quando ninguém abaixo cobre. Duas
-- pessoas com o mesmo cargo podem ter cadeias de tamanhos diferentes na
-- mesma tela, dependendo só do valor de cada pedido — um template de etapas
-- fixas (`fluxos_etapas.ordem`) não representa isso sem reinventar a mesma
-- lógica por fora, then discordando dela.
--
-- Em vez de forçar os dois modelos a coexistir (ou descartar o motor já
-- testado do protótipo para caber no template), esta migration guarda a
-- cadeia computada DIRETO na solicitação — como se fosse "a foto do cálculo
-- no momento em que o pedido foi aberto", igual ao `dados.cadeia` que o
-- protótipo já monta. `fluxos_aprovacao`/`fluxos_etapas` ficam no banco,
-- sem uso por enquanto — não atrapalham, e uma migração futura pode
-- aposentá-los se de fato nunca forem necessários.

BEGIN;

-- Nasce sem fluxo_id (não usamos o motor de template) — a CHECK antiga
-- exigia fluxo_id sempre que valor e status não fossem rascunho.
ALTER TABLE solicitacoes DROP CONSTRAINT solicitacao_com_valor_tem_fluxo;

ALTER TABLE solicitacoes
  ADD COLUMN perfil_solicitante text,
  -- Perfis na ordem em que decidem, calculada uma vez na abertura
  -- (`L.cadeiaDeAprovacao`) — nunca recalculada depois: subir o teto de um
  -- perfil no meio do caminho não pode reescrever a rota de um pedido já
  -- em curso (mesmo raciocínio do comentário original em dominio.js).
  ADD COLUMN cadeia_perfis text[] NOT NULL DEFAULT '{}',
  -- Perfil de origem -> perfil de destino, só para a etapa que foi
  -- delegada; o resto da cadeia não muda.
  ADD COLUMN delegacoes jsonb NOT NULL DEFAULT '{}'::jsonb;

-- `etapa_atual` já existia (pensado para indexar `fluxos_etapas.ordem`,
-- 1-based); aqui vira o índice 0-based em `cadeia_perfis`, igual ao `etapa`
-- do protótipo — por isso o novo default é 0, não 1.
ALTER TABLE solicitacoes ALTER COLUMN etapa_atual SET DEFAULT 0;

-- "Delegou" é uma decisão real no fluxo local (`L.delegar` registra
-- decisao:"DELEGAR" na trilha) — a CHECK original só previa
-- APROVAR/REJEITAR/SOLICITAR_ALTERACAO/COMENTAR.
ALTER TABLE solicitacao_decisoes DROP CONSTRAINT solicitacao_decisoes_decisao_check;
ALTER TABLE solicitacao_decisoes
  ADD CONSTRAINT solicitacao_decisoes_decisao_check
    CHECK (decisao IN ('APROVAR','REJEITAR','SOLICITAR_ALTERACAO','COMENTAR','DELEGAR'));

-- "Fora da vez" (a Direção decidindo antes de ser sua etapa, por exemplo) é
-- informação que a trilha já mostra hoje ("fora da vez" na tela) — vale
-- gravar junto da decisão, não recalcular depois com dado que já mudou.
ALTER TABLE solicitacao_decisoes ADD COLUMN na_vez boolean NOT NULL DEFAULT true;

COMMIT;
