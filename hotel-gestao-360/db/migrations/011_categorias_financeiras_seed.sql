-- Hotel Gestão 360 — semente de categorias financeiras
--
-- `categorias_financeiras` (003_financeiro.sql) nunca foi semeada: toda conta
-- a pagar e todo contrato exige `categoria_id NOT NULL`, então sem isto
-- nenhum dos dois consegue ser cadastrado pela API real. Uma linha por
-- `grupo` do CHECK original, com o mesmo rótulo que o front-end já usa em
-- `T.CATEGORIAS` (prototipo/partes/telas-b.js) — cadastrar por nome
-- (`categoriaIdPorNome`, igual a `acharOuCriar` para cargo/departamento) é o
-- que liga as duas pontas sem duplicar a lista em dois lugares incompatíveis.

BEGIN;

INSERT INTO categorias_financeiras (nome, grupo, natureza) VALUES
  ('Folha e pessoal',   'FOLHA_E_PESSOAL',   'DESPESA'),
  ('Impostos',          'IMPOSTOS',          'DESPESA'),
  ('Material didático', 'MATERIAL_DIDATICO', 'DESPESA'),
  ('Tecnologia',        'TECNOLOGIA',        'DESPESA'),
  ('Estrutura',         'ESTRUTURA',         'DESPESA'),
  ('Manutenção',        'MANUTENCAO',        'DESPESA'),
  ('Marketing',         'MARKETING',         'DESPESA'),
  ('Terceirizados',     'TERCEIRIZADOS',     'DESPESA'),
  ('Eventos',           'EVENTOS',           'DESPESA'),
  ('Administrativo',    'ADMINISTRATIVO',    'DESPESA'),
  ('Outros',            'OUTROS',            'DESPESA')
ON CONFLICT (nome) DO NOTHING;

COMMIT;
