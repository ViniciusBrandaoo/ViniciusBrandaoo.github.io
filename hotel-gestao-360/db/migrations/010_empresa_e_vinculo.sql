-- Hotel Gestão 360 — Empresa pagadora e vínculo CLT/Ticket/MEI
-- PostgreSQL 16+. Valores monetários em CENTAVOS (bigint). Nunca float.
--
-- Duas lacunas que existiam desde o início do sistema e só viviam no
-- protótipo (`prototipo/partes/dados-reais.js`, `L.EMPRESAS`/`L.VINCULOS`
-- em `prototipo/partes/dominio.js`), nunca modeladas no banco real:
--
-- 1) EMPRESA PAGADORA. A escola paga por três CNPJs (Hotel,
--    ServJU, ServMA) e o mesmo professor pode migrar de um para outro ao
--    longo do tempo — na prática, junto com um reajuste de contrato. Por
--    isso a empresa é atributo do CONTRATO (`contratos_remuneracao`,
--    vigente por período), não do vínculo (`employees`, que não tem
--    vigência por período e não deveria carregar um dado que muda no
--    tempo independente de admissão/desligamento).
--
--    Tabela de apoio (`empresas`), não CHECK enum: hoje são só três, mas
--    o próprio enunciado já documenta "pode ganhar uma quarta um dia" —
--    com tabela, isso é um INSERT; com CHECK, seria outra migration só
--    para alargar a lista. Mesmo padrão já usado em `cargos` e
--    `cost_centers` (001_nucleo.sql), que também são conjuntos pequenos
--    e abertos a crescer, ao contrário de `roles.chave`, que é fechado
--    por desenho (papel de acesso não é algo que o RH cadastra).
--
-- 2) VÍNCULO CLT / TICKET / MEI. Uma fração dos professores tem a
--    remuneração dividida em até três "colunas" de pagamento — CLT,
--    Ticket (vale-alimentação/refeição declarado à parte) e MEI (parte
--    paga como nota fiscal de pessoa jurídica do próprio professor,
--    mesmo ele sendo também CLT horista-aula). É uma característica
--    juridicamente sensível: é exatamente o desenho que carrega risco de
--    reconhecimento de vínculo quando a divisão não reflete a prestação
--    real (ver `project_hotel_mei_prestadores`). Aqui só se modela o
--    dado fielmente como ele já existe na planilha/protótipo — nenhuma
--    regra de cálculo nova, nenhum julgamento sobre a divisão ser
--    correta ou não.
--
--    No protótipo, `vinculoCodigos` é um array de códigos de planilha
--    ("1".."5", cada um já composto — "4" é "CLT + MEI" sozinho) que
--    `L.vinculoDe` reduz a três bandeiras por união (tem CLT / tem
--    Ticket / tem MEI), e opcionalmente `valorClt`/`valorTicket`/
--    `valorMei` guardam o centavo exato de cada canal quando o
--    pagamento É de fato dividido (a maioria dos professores tem os
--    três zerados: só a bandeira importa pra eles). Guardar aqui os
--    CÓDIGOS crus da planilha replicaria uma codificação auxiliar sem
--    valor próprio — o que o resto do sistema (relatório, folha,
--    auditoria de risco de vínculo) precisa ler é a bandeira e o valor,
--    não "o código era 4". Por isso: três booleans + três colunas de
--    centavos, direto em `contratos_remuneracao` — o mesmo motivo do
--    empresa acima (cada professor tem no máximo uma linha vigente por
--    vez) torna uma tabela separada custo sem benefício aqui.
--
-- Nem `empresa_id` nem as colunas de vínculo entram com NOT NULL: as
-- ~99 pessoas já importadas não têm esse dado ainda, e o backfill (script
-- separado, a partir de `dados-reais.js`) roda DEPOIS desta migration.
-- Uma migration futura, depois do backfill confirmado, deve adicionar
-- `NOT NULL` em `empresa_id` (todo contrato tem que ter empresa pagadora;
-- vínculo pode legitimamente ficar de fora — ver `L.gruposPagamentoPresentes`
-- tratando ausência de vínculo como estado real a resolver, não erro).

BEGIN;

-- ============================================================ empresa pagadora

CREATE TABLE empresas (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Código histórico da planilha da escola ("1","2","3") — mantido para o
  -- backfill localizar a linha certa sem depender só do nome.
  codigo text NOT NULL UNIQUE,
  nome   text NOT NULL UNIQUE,
  ativa  boolean NOT NULL DEFAULT true
);

INSERT INTO empresas (codigo, nome) VALUES
  ('1', 'Hotel'),
  ('2', 'ServJU'),
  ('3', 'ServMA');

ALTER TABLE contratos_remuneracao
  ADD COLUMN empresa_id uuid REFERENCES empresas(id) ON DELETE RESTRICT;

CREATE INDEX idx_remuneracao_empresa ON contratos_remuneracao (empresa_id);

-- ============================================================ vínculo CLT / Ticket / MEI

ALTER TABLE contratos_remuneracao
  ADD COLUMN tem_clt                boolean NOT NULL DEFAULT false,
  ADD COLUMN tem_ticket             boolean NOT NULL DEFAULT false,
  ADD COLUMN tem_mei                boolean NOT NULL DEFAULT false,
  ADD COLUMN valor_clt_centavos     bigint  NOT NULL DEFAULT 0 CHECK (valor_clt_centavos >= 0),
  ADD COLUMN valor_ticket_centavos  bigint  NOT NULL DEFAULT 0 CHECK (valor_ticket_centavos >= 0),
  ADD COLUMN valor_mei_centavos     bigint  NOT NULL DEFAULT 0 CHECK (valor_mei_centavos >= 0);

-- Todo valor lançado num canal implica a bandeira correspondente marcada.
-- Não vale o inverso: a bandeira sozinha (sem valor) é o caso comum de quem
-- não tem o pagamento detalhado por canal, só classificado. Este é o dado
-- que sustenta a auditoria de risco de vínculo — se o valor existe sem a
-- bandeira, o relatório "quem recebe parte como MEI" erra em silêncio.
ALTER TABLE contratos_remuneracao ADD CONSTRAINT vinculo_valor_coerente_com_bandeira CHECK (
  (valor_clt_centavos = 0 OR tem_clt)
  AND (valor_ticket_centavos = 0 OR tem_ticket)
  AND (valor_mei_centavos = 0 OR tem_mei)
);

COMMIT;
