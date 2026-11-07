-- Hotel Gestão 360 — arquivo real da Central de Documentos
--
-- `documentos` (migration 005) já previa `storage_chave`, `checksum_sha256`
-- etc. para um object storage externo que nunca chegou a existir. Sem ele a
-- tela ficava travada em `L.criar` local — "salvo" só no navegador de quem
-- lançou, mesma armadilha que Funcionários teve antes da API real (ver
-- `T.avisoSemPersistenciaReal` em telas-a.js).
--
-- Em vez de provisionar um bucket novo só para PDFs de contrato/certidão de
-- porte pequeno, o arquivo entra como bytea na própria linha: mesmo banco já
-- usado para tudo o mais neste sistema, sem credencial nova para configurar
-- e sem risco de o arquivo sumir num deploy (filesystem do Railway é
-- efêmero). `storage_chave` continua único e preenchido, agora como
-- identificador lógico ("pg:<id>") em vez de caminho externo.

BEGIN;

ALTER TABLE documentos ADD COLUMN arquivo_bytes bytea NOT NULL DEFAULT '';
ALTER TABLE documentos ALTER COLUMN arquivo_bytes DROP DEFAULT;

COMMIT;
