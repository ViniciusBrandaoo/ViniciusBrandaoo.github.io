-- Salário restrito: quem não é da Direção não vê valor nenhum desta pessoa
-- (salário, folha, descontos). A pessoa continua aparecendo na lista.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS salario_restrito boolean NOT NULL DEFAULT false;
