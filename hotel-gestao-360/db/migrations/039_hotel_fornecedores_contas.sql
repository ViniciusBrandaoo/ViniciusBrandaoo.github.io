-- Fornecedores do hotel: muitos chegam só com nome e contato (sem CNPJ à mão).
ALTER TABLE fornecedores ALTER COLUMN tipo_documento DROP NOT NULL;
ALTER TABLE fornecedores ALTER COLUMN documento_cifrado DROP NOT NULL;
ALTER TABLE fornecedores ALTER COLUMN documento_hash DROP NOT NULL;
ALTER TABLE fornecedores ADD COLUMN canal_cobranca text;  -- WhatsApp, E-mail, Portal, Site
-- Categorias de despesa do hotel; as da escola que não servem saem da lista.
UPDATE categorias_financeiras SET ativa = false WHERE nome IN ('Material didático', 'Eventos');
INSERT INTO categorias_financeiras (nome, grupo, natureza) VALUES
  ('Alimentos e café da manhã', 'OUTROS', 'DESPESA'),
  ('Água, energia e gás', 'ESTRUTURA', 'DESPESA'),
  ('Internet e telefone', 'TECNOLOGIA', 'DESPESA'),
  ('Contabilidade e honorários', 'ADMINISTRATIVO', 'DESPESA')
ON CONFLICT (nome) DO NOTHING;
-- Contas antigas lançadas da planilha da Direção vêm sem a forma de pagamento.
ALTER TABLE contas_pagar DROP CONSTRAINT IF EXISTS contas_pagar_forma_pagamento_check;
ALTER TABLE contas_pagar ADD CONSTRAINT contas_pagar_forma_pagamento_check
  CHECK (forma_pagamento IN ('BOLETO','PIX','TRANSFERENCIA','CARTAO','DINHEIRO','DEBITO_AUTOMATICO','NAO_INFORMADO'));
