-- Pendências apontadas pela Direção (inconsistências de hospedagem, documentos
-- faltando) e a folha do mês como a Direção controla na planilha dela.
ALTER TABLE hotel_registros DROP CONSTRAINT IF EXISTS hotel_registros_colecao_check;
ALTER TABLE hotel_registros ADD CONSTRAINT hotel_registros_colecao_check CHECK (colecao IN (
  'apartamentos','hospedagens','empresas','cafeAjustes',
  'enxovalItens','enxovalMovimentos','frigobarProdutos','frigobarConsumos',
  'recebimentos','fechamentosCaixa','transacoesCartao','boletos',
  'notasFiscais','cobrancas','contasRecorrentes','contasBancarias',
  'relatoriosDiarios','diarias','marcacoesPonto','ajustesPonto',
  'fechamentosMes','config','pendencias','folhaMes'));
