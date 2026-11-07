# Banco de dados — Hotel Gestão 360

PostgreSQL 16 ou superior. **Nada aqui depende de Docker** — o container é só
bancada de teste local. O mesmo schema roda em qualquer Postgres gerenciado.

## Aplicar as migrations

```bash
DATABASE_URL="postgresql://usuario:senha@host:5432/hotel?sslmode=require" npm run db:migrate
```

```bash
DATABASE_URL="..." npm run db:status
```

O executor registra cada migration aplicada em `schema_migrations` com checksum.
Migration já aplicada nunca roda de novo, e se o arquivo for editado depois o
executor avisa em vez de reaplicar em silêncio — corrigir um schema em produção
se faz com migration nova, nunca editando uma antiga.

## Onde hospedar

Qualquer um serve; a diferença está em backup e custo.

| Provedor | Observação |
|---|---|
| **Neon** | Postgres serverless, branch de banco por ambiente, escala a zero. Bom para começar. |
| **Supabase** | Postgres + storage de arquivos no mesmo lugar, o que resolve a Central de Documentos junto. |
| **Railway / Render** | Simples de subir, custo previsível. |
| **RDS / Cloud SQL** | Para quando a escola exigir contrato e SLA formais. |

Exija do provedor, seja qual for: **PITR** (point-in-time recovery),
retenção de no mínimo 30 dias, e TLS obrigatório na conexão.

## O que garante que nada se perde

**Auditoria automática.** Toda alteração em toda tabela de negócio vira uma
linha em `audit_logs`, com autor, valor anterior e valor novo — gravada por
trigger no banco, não pela aplicação. Vale também para mudança feita por script
ou por engano direto no psql.

A aplicação declara quem está agindo logo depois de abrir a transação:

```sql
BEGIN;
SET LOCAL app.user_id = '<uuid do usuário logado>';
-- ... as operações da requisição ...
COMMIT;
```

Sem isso o fato ainda é registrado, só que sem autor.

**Trilha imutável.** `audit_logs`, `banco_horas_lancamentos` e
`solicitacao_decisoes` recusam `UPDATE` e `DELETE` por trigger, e o role da
aplicação não tem esses privilégios na trilha. Uma decisão de aprovação
registrada não se apaga.

**Nada de segredo no log.** Senha, secret de MFA, token de sessão, CPF e dados
bancários cifrados são removidos antes de gravar.

**Folha fechada congela.** Depois que um período vai a `APROVADO`,
`ENVIADO_CONTABILIDADE` ou `FECHADO`, o banco recusa alterar a hora-aula, as
alíquotas, as faixas, a convenção e o próprio resultado. Além disso cada
cálculo guarda `parametros_snapshot` — os parâmetros por valor, não por
referência —, então recalcular uma competência antiga devolve exatamente o
mesmo número, mesmo anos depois.

**Histórico em vez de sobrescrita.** Reajuste de hora-aula cria uma linha nova
em `contratos_remuneracao`, com vigência. O valor antigo continua lá.
Banco de horas é razão de lançamentos, não saldo mutável: o saldo é derivado,
e "por que meu saldo é −12h40?" sempre tem resposta.

## Papéis de banco

`007` cria dois roles sem login, para o provedor conceder a usuários reais:

- **`hotel_app`** — a aplicação. Lê e escreve tudo, mas não pode alterar nem
  apagar a trilha de auditoria.
- **`hotel_leitura`** — relatórios e BI. Somente leitura, sem acesso às
  tabelas que guardam dado pessoal cifrado.

```sql
CREATE USER app_producao WITH PASSWORD '...';
GRANT hotel_app TO app_producao;
```

## Testar o schema localmente

```bash
docker run -d --name hotel-pg -e POSTGRES_PASSWORD=hotel -e POSTGRES_DB=hotel -p 55433:5432 postgres:16
```

```bash
DATABASE_URL="postgresql://postgres:hotel@localhost:55433/hotel?sslmode=disable" npm run db:migrate
```

Os arquivos em `db/testes/` provam que o schema recusa estado inválido:
`invariantes.sql` (18 casos) e `auditoria.sql` (8 casos).

```bash
docker exec hotel-pg psql -U postgres -d hotel -f /testes/invariantes.sql
```

## Antes de guardar dado real

1. **Chave de cifra fora do banco.** `cpf_cifrado`, `documento_cifrado` e
   `dados_bancarios_cifrados` usam chave de KMS ou variável de ambiente. Chave
   junto do dado no mesmo dump não protege nada.
2. **Pepper do hash fora do banco.** `cpf_hash` precisa ser HMAC-SHA256 com
   pepper secreto. Hash simples de CPF se reverte em minutos: são só 10⁹
   candidatos, e o dígito verificador reduz ainda mais.
3. **Job mensal de partição.** Chamar `SELECT criar_particao_audit(...)` para
   manter folga à frente. Hoje há 38 partições criadas e uma DEFAULT de reserva.
4. **Restaurar o backup uma vez.** Backup nunca testado não é backup.
