-- PDFs enviados ao sistema (boletos, contas, notas, comprovantes, extratos).
-- O arquivo fica guardado junto do registro que ele preencheu.
CREATE TABLE hotel_documentos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  tipo_mime   text NOT NULL,
  tamanho     integer NOT NULL CHECK (tamanho > 0 AND tamanho <= 10485760),
  conteudo    bytea NOT NULL,
  sha256      text NOT NULL,
  texto       text,
  lido        jsonb,
  criado_por  uuid REFERENCES users(id),
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hotel_documentos_sha ON hotel_documentos (sha256);

-- A conta a pagar guarda o PDF que a preencheu e a linha digitável do boleto.
ALTER TABLE contas_pagar ADD COLUMN documento_id uuid REFERENCES hotel_documentos(id) ON DELETE SET NULL;
ALTER TABLE contas_pagar ADD COLUMN linha_digitavel text CHECK (linha_digitavel IS NULL OR linha_digitavel ~ '^[0-9]{44,48}$');
