-- Planilha do frigobar por turno: a recepção registra o que recebeu e o que vendeu de cada produto.
ALTER TABLE hotel_registros DROP CONSTRAINT IF EXISTS hotel_registros_colecao_check;
ALTER TABLE hotel_registros ADD CONSTRAINT hotel_registros_colecao_check CHECK (colecao IN (
  'apartamentos','hospedagens','empresas','cafeAjustes',
  'enxovalItens','enxovalMovimentos','frigobarProdutos','frigobarConsumos',
  'recebimentos','fechamentosCaixa','transacoesCartao','boletos',
  'notasFiscais','cobrancas','contasRecorrentes','contasBancarias',
  'relatoriosDiarios','diarias','marcacoesPonto','ajustesPonto',
  'fechamentosMes','config','pendencias','folhaMes','comprovantes','frigobarPlanilhas'));
