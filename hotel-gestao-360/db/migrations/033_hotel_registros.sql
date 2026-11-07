-- Hotel Gestão 360 — todas as áreas do hotel no banco
--
-- Até aqui café, enxoval, frigobar, caixa, cartões, boletos, empresas,
-- contas fixas, relatório diário e ponto gravavam só no navegador de quem
-- usava. Esta tabela guarda cada registro dessas áreas no PostgreSQL, com:
--   * versão (duas pessoas editando o mesmo registro: a segunda é avisada);
--   * autor de cada criação e alteração;
--   * exclusão só lógica (o registro fica, marcado como excluído);
--   * auditoria automática com valor anterior e novo (trigger da 007).
--
-- Hospedagens e recebimentos importados do DataHotel continuam nas tabelas
-- da 032 e NÃO são alterados por aqui: a correção feita pela equipe vira um
-- complemento nesta tabela, com o mesmo id, e o dado original fica intacto.
--
-- As regras de cada área (quem grava, o que trava depois de fechado) são
-- aplicadas pelo servidor (servidor/hotel-dados.ts).

BEGIN;

CREATE TABLE hotel_registros (
  colecao        text NOT NULL CHECK (colecao IN (
                   'apartamentos','hospedagens','empresas','cafeAjustes',
                   'enxovalItens','enxovalMovimentos','frigobarProdutos','frigobarConsumos',
                   'recebimentos','fechamentosCaixa','transacoesCartao','boletos',
                   'notasFiscais','cobrancas','contasRecorrentes','contasBancarias',
                   'relatoriosDiarios','diarias','marcacoesPonto','ajustesPonto',
                   'fechamentosMes','config')),
  id             text NOT NULL CHECK (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  unidade_id     uuid NOT NULL REFERENCES hotel_unidades(id) ON DELETE RESTRICT,
  dados          jsonb NOT NULL CHECK (jsonb_typeof(dados) = 'object'),
  -- Complemento de um registro importado (hotel_hospedagens / hotel_recebimentos).
  complemento    boolean NOT NULL DEFAULT false,
  versao         integer NOT NULL DEFAULT 1 CHECK (versao >= 1),
  excluido       boolean NOT NULL DEFAULT false,
  motivo         text,
  criado_por     uuid REFERENCES users(id),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES users(id),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (colecao, id),
  CONSTRAINT complemento_so_de_importado CHECK (NOT complemento OR colecao IN ('hospedagens','recebimentos')),
  CONSTRAINT exclusao_com_motivo CHECK (NOT excluido OR motivo IS NOT NULL)
);

CREATE INDEX idx_hotel_registros_colecao ON hotel_registros (unidade_id, colecao) WHERE NOT excluido;
CREATE TRIGGER hotel_registros_atualizado_em BEFORE UPDATE ON hotel_registros
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- Ninguém apaga de verdade: excluir é marcar `excluido` com motivo.
CREATE TRIGGER hotel_registros_sem_delete BEFORE DELETE ON hotel_registros
  FOR EACH ROW EXECUTE FUNCTION hotel_barrar_exclusao();

CREATE TRIGGER zzz_auditoria AFTER INSERT OR UPDATE OR DELETE ON hotel_registros
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

COMMIT;
