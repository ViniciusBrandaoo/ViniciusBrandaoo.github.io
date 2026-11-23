-- Ticket que SOMA em vez de descontar: por padrão só professor (hora-aula) tem o Ticket
-- descontado da folha; esta marca permite um professor receber o Ticket como colaborador.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS ticket_soma boolean NOT NULL DEFAULT false;
