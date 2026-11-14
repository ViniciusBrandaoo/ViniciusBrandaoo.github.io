# Hotel Gestão 360 — Etapa 2: projeto técnico

Data: 06/11/2026. Depende de `docs/ETAPA-1-DESCOBERTA.md`.

> **Estado das premissas.** As perguntas da Etapa 1 (seção 6) e as amostras do
> DataHotel ainda não chegaram. Este projeto cobre tudo o que **não** depende
> delas. Os pontos que dependem estão marcados com **[P#]** (número da pergunta)
> ou **[Amostra]**, e o modelo foi desenhado para que a resposta mude
> configuração ou layout de importação, não a estrutura das tabelas.

---

## 1. Arquitetura

```
Navegador (HTML único, telas em prototipo/partes/*.js)
   │  fetch JSON, cookie de sessão HttpOnly
   ▼
Servidor Fastify (TypeScript, servidor/)
   ├─ autenticação e sessão         (existente: autenticacao.ts)
   ├─ autorização por permissão     (existente: roles/permissions; ampliar)
   ├─ rotas /api/hotel/*            (novo)
   ├─ regras de domínio             (hotel-dominio.js → módulo TS compartilhado)
   ├─ importação (CSV/XLSX → prévia → confirmação)  (novo; exceljs já instalado)
   └─ tarefas agendadas (alertas, importação atrasada) (novo, fase 2)
   ▼
PostgreSQL (Railway)
   ├─ tabelas do hotel (migrations 032–036)
   ├─ auditoria por trigger em todas (existente: registrar_auditoria)
   └─ backup diário
```

**Princípios técnicos**

- As regras ficam num só lugar: o arquivo de domínio vira módulo usado pelo servidor (fonte da verdade) e pela tela (só para prévia). O servidor sempre recalcula.
- Dinheiro em `bigint` de centavos. Nunca `float`.
- Datas de negócio em `date`; momentos em `timestamptz`; o "dia do hotel" é calculado em `America/Sao_Paulo`.
- Estado explícito (`text` + `CHECK`), nunca vários booleanos.
- Nada financeiro é apagado: `CANCELADO`/`ESTORNADO` com motivo. `DELETE` revogado do papel da aplicação nessas tabelas.
- Todo registro importado tem `origem` + `codigo_origem` + `lote_id`, com `UNIQUE (origem, codigo_origem)`.
- Ajuste local nunca sobrescreve o importado: fica em tabela de ajuste com motivo.

---

## 2. Modelo de dados

Convenções: `id uuid`, `criado_por/criado_em`, `atualizado_em` com trigger,
auditoria automática. `unidade_id` em toda tabela de negócio (multiunidade pronta,
uma unidade no início).

### 2.1 Reaproveitado do que já existe

| Tabela existente | Uso no hotel | Ajuste necessário |
|---|---|---|
| `users`, `roles`, `permissions`, `sessions` | Login e perfis | Criar perfis Recepção, Governança, Auditor; permissões `hotel.*` |
| `audit_logs` + `registrar_auditoria()` | Trilha antes/depois | Registrar justificativa (coluna `motivo` via `SET LOCAL app.motivo`) |
| `fornecedores` | Fornecedores | Nenhum (documento já cifrado) |
| `categorias_financeiras` | Plano de contas | O CHECK de `grupo` é de escola; migration troca por tabela `grupos_financeiros` editável |
| `contas_pagar`, `pagamentos` | Contas a pagar | Faltam parcelas, retenções, documento anexo e origem; ver 2.6 |
| `cost_centers` | Centros de custo | Nenhum |
| `employees`, `pessoas`, `contratos_*` | Funcionários e vínculo | Diarista: novo tipo de contrato com valor da diária |
| `jornadas`, `ponto_registros`, `banco_horas_lancamentos` | Ponto e banco de horas | Ajuste com marcação original preservada (verificar) |
| `documentos` | Anexos | Ligar a qualquer entidade por (`entidade`, `entidade_id`) |
| `receitas` | — | **Não usar** para hospedagem: o hotel precisa separar competência e recebimento (2.4) |

### 2.2 Cadastros do hotel (migration 032)

| Tabela | Campos principais | Restrições |
|---|---|---|
| `unidades` | nome, cnpj_cifrado, fuso, config (jsonb) | — |
| `apartamentos` | unidade_id, numero, tipo, capacidade, situacao (`ATIVO`,`BLOQUEADO`,`INATIVO`) | `UNIQUE (unidade_id, numero)` |
| `empresas_clientes` | razao_social, cnpj_hash/cifrado, contatos, prazo_dias, dia_corte, limite_centavos | `UNIQUE (cnpj_hash)` |
| `formas_pagamento` | codigo (`DINHEIRO`,`DEBITO`,`CREDITO`,`PIX`,`EMPRESA`,`BOLETO`…), conta_bancaria_id, adquirente | — |
| `contas_bancarias` | banco, agencia, conta (cifrada), saldo_inicial_centavos, data_saldo_inicial **[P7]** | — |
| `adquirentes` | nome, taxa_debito, taxa_credito_avista, taxa_parcelado, prazo_dias **[P7]** | Taxas como referência; a real vem do arquivo |

### 2.3 Importação (migration 032)

| Tabela | Finalidade |
|---|---|
| `import_layouts` | tipo de relatório, versão do DataHotel, mapeamento coluna → campo, formato de data e moeda **[Amostra]** |
| `import_lotes` | tipo, arquivo, `sha256`, período, usuário, situação (`PREVIA`,`CONFIRMADO`,`DESCARTADO`), contagens novo/atualizado/ignorado/rejeitado |
| `import_linhas` | lote_id, nº da linha, dados brutos (jsonb), situação, erros, registro_id gerado |

Restrições: `UNIQUE (sha256, tipo)` em lotes confirmados (o mesmo arquivo não entra
duas vezes); linhas rejeitadas ficam em quarentena e nunca viram registro.

### 2.4 Hospedagem e receita (migration 033)

| Tabela | Campos principais | Restrições |
|---|---|---|
| `hospedagens` | origem, codigo_origem, lote_id, apartamento_id, hospede_ref (nome reduzido), empresa_id, checkin, checkout_previsto, checkout_real, adultos, criancas, cafe_incluido, situacao | `UNIQUE (origem, codigo_origem)`; `checkout_previsto > checkin` |
| `hospedagem_lancamentos` | hospedagem_id, data_competencia, tipo (`DIARIA`,`CONSUMO`,`FRIGOBAR`,`DESCONTO`,`TAXA`,`AJUSTE`), descricao, valor_centavos (sinal pelo tipo), origem, codigo_origem | `UNIQUE (origem, codigo_origem)` |
| `recebimentos` | origem, codigo_origem, hospedagem_id, empresa_id, data_competencia, data_hora_pagamento, forma_id, bruto, desconto, taxa, liquido, parcelas, nsu, autorizacao, previsao_credito, situacao (`REGISTRADO`,`A_LIQUIDAR`,`LIQUIDADO`,`CONCILIADO`,`ESTORNADO`,`CANCELADO`) | `liquido = bruto − desconto − taxa`; `UNIQUE (origem, codigo_origem)` |
| `hospedagem_ajustes` | hospedagem_id, campo, valor_original, valor_novo, motivo, autorizado_por | motivo obrigatório |

**Regra que impede contar duas vezes:** receita = soma de `hospedagem_lancamentos`
por competência. `recebimentos` só muda *quando* e *como* entrou, nunca *quanto*
foi vendido. Liquidação de cartão, pagamento de fatura e depósito alteram a
`situacao` do recebimento ou geram vínculo de conciliação, nunca nova receita.

### 2.5 Caixa, cartões, banco e boletos (migration 034)

| Tabela | Campos principais | Restrições |
|---|---|---|
| `caixa_movimentos` | data, turno, tipo (`ABERTURA`,`SUPRIMENTO`,`SANGRIA`,`PAGAMENTO`), valor, motivo | — |
| `fechamentos_dia` | unidade_id, data, etapa (`RASCUNHO`,`EM_CONFERENCIA`,`APROVADO`,`FECHADO`,`REABERTO`), checklist (jsonb), esperado/contado por forma, diferenca, justificativa, aprovado_por | `UNIQUE (unidade_id, data)`; diferença ≠ 0 exige justificativa; acima do limite **[P9]** exige aprovação da Direção |
| `reaberturas` | entidade, entidade_id, motivo, autorizado_por | só Direção |
| `cartao_liquidacoes` | origem (arquivo da adquirente **[P7]**), codigo_origem, nsu, data_venda, data_credito, bruto, taxa, liquido, parcela | `UNIQUE (origem, codigo_origem)` |
| `extrato_bancario` | conta_id, data, valor, historico, fitid (OFX) ou hash da linha | `UNIQUE (conta_id, fitid)` |
| `conciliacoes` | recebimento_id, liquidacao_id, extrato_id, diferenca, situacao (`OK`,`DIVERGENTE`,`JUSTIFICADO`) | um extrato só concilia uma vez |
| `transferencias` | conta_origem, conta_destino, valor, data | não é receita nem despesa |
| `boletos` | empresa_id/hospedagem_id, numero, nosso_numero, emissao, vencimento, valor, juros, multa, desconto, situacao (`EMITIDO`,`PAGO`,`VENCIDO`,`CANCELADO`), banco **[P8]** | baixa gera recebimento ligado; `UNIQUE (banco, nosso_numero)` |

### 2.6 Empresas, contas a pagar e recorrência (migration 035)

| Tabela | Finalidade / restrições |
|---|---|
| `faturas_empresa` | empresa_id, periodo, etapa (`PREVIA`,`CONFERIDA`,`APROVADA`,`NF_EMITIDA`,`COBRANDO`,`PAGA`,`CANCELADA`), total; `UNIQUE (empresa_id, periodo)` |
| `fatura_itens` | fatura_id, hospedagem_lancamento_id; `UNIQUE (hospedagem_lancamento_id)` (um lançamento só entra numa fatura) |
| `notas_fiscais` | numero, serie, valor, competencia, situacao, xml/pdf (documento_id) **[P6]**; `UNIQUE (serie, numero)` |
| `cobrancas` | fatura_id/boleto_id, canal, destinatario, mensagem, aprovado_por, enviado_em, resposta; nunca presume entrega |
| `documentos_recebidos` | fila do antigo "grupo de faturamento": fornecedor, tipo, numero, serie, emissao, valor, situacao (`RECEBIDO`,`VALIDADO`,`CLASSIFICADO`,`EM_APROVACAO`,`PROGRAMADO`,`PAGO`,`CONTESTADO`,`CANCELADO`), anexo obrigatório |
| `contas_pagar_parcelas` | conta_id, numero, vencimento, valor, pago, situacao; soma das parcelas = valor da conta |
| `contas_recorrentes` | fornecedor, categoria, valor_previsto, periodicidade, dia_vencimento, aviso_dias, reajuste |
| `contas_previstas` | recorrente_id, competencia, valor, situacao (`PREVISTA`,`SUBSTITUIDA`,`CANCELADA`), conta_id; `UNIQUE (recorrente_id, competencia)` — quando a nota real chega, a previsão vira `SUBSTITUIDA` (uma obrigação só) |
| `orcamentos` | categoria, competencia, valor |

Duplicidade de documento: índice único parcial
`(fornecedor_id, serie, numero, valor_centavos) WHERE situacao <> 'CANCELADO'`.

### 2.7 Operação (migration 036)

| Tabela | Finalidade / restrições |
|---|---|
| `cafe_previsoes` | data, apartamento, adultos, criancas, previsto, efetivo, origem (`CALCULADO`,`IMPORTADO`) **[P11]**; `UNIQUE (data, apartamento_id)` |
| `cafe_ajustes` | previsao_id, campo, de, para, motivo |
| `enxoval_itens` | nome, unidade, estoque_minimo (5 itens iniciais + novos) |
| `enxoval_padroes` | tipo_apartamento, item, quantidade, politica_troca **[P12]** |
| `enxoval_locais` | `ESTOQUE`,`APARTAMENTO`,`LAVANDERIA`,`EXTRAVIO`,`BAIXA` |
| `enxoval_movimentos` | data, item, de_local, para_local, quantidade, responsavel, apartamento_id; quantidade > 0; transferência não muda o total |
| `governanca_checklists` | data, apartamento, limpeza (`PENDENTE`,`LIMPO`,`INSPECIONADO`,`BLOQUEADO`), responsavel, observacao; `UNIQUE (data, apartamento_id)` |
| `produtos` | nome, sku, unidade, custo, preco, categoria, estoque_minimo, ativo; `UNIQUE (sku)` |
| `estoque_movimentos` | produto, data, tipo (`ENTRADA`,`REPOSICAO`,`CONSUMO`,`PERDA`,`CORTESIA`,`AJUSTE`,`TRANSFERENCIA`), local, quantidade, motivo; ajuste exige motivo |
| `frigobar_consumos` | data, apartamento, produto, quantidade, unitario, total, responsavel, origem, codigo_origem, lancamento_id (vínculo com o DataHotel **[P4]**) |

### 2.8 Pessoas (reaproveita 006; ajuste na 036)

- `diarias_trabalhadas`: funcionario, data, valor, aprovado_por; `UNIQUE (funcionario, data)`.
- `ponto_fechamentos`: funcionario, competencia, situacao, aceite, travado_em.
- Percentuais e prazos de banco de horas em `config` **[P14]**, nunca fixos no código.

---

## 3. API

Todas sob `/api/hotel`, JSON, sessão por cookie, permissão checada no servidor
antes de qualquer leitura. Erros com `{ codigo, mensagem, campos }`.

| Recurso | Rotas | Permissão |
|---|---|---|
| Importação | `POST /importacoes/previa` (arquivo) → lote em `PREVIA` com linhas; `POST /importacoes/:id/confirmar`; `POST /importacoes/:id/descartar`; `GET /importacoes` | `hotel.importar` |
| Layouts | `GET/PUT /layouts/:tipo` | `hotel.config` |
| Hospedagens | `GET /hospedagens?data=&situacao=&apto=`; `GET /hospedagens/:id` (com lançamentos, recebimentos, ajustes); `POST /hospedagens/:id/ajustes` | `hotel.hospedagem.*` |
| Dia | `GET /dia/:data` (extrato, café, governança, frigobar, caixa, pendências) | `hotel.dia.ver` |
| Café | `GET /cafe/:data`; `POST /cafe/:data/ajustes`; `GET /cafe?de=&ate=` | `hotel.cafe.*` |
| Enxoval | `GET /enxoval/saldo`; `POST /enxoval/movimentos`; `GET /enxoval/relatorio?mes=` | `hotel.governanca.*` |
| Frigobar | `POST /frigobar/consumos`; `GET /frigobar/dia/:data`; `GET /frigobar/mes/:aaaa-mm`; `POST /estoque/movimentos` | `hotel.frigobar.*` |
| Fechamento | `GET/PUT /fechamentos/:data`; `POST /fechamentos/:data/enviar`, `/aprovar`, `/fechar`, `/reabrir` (motivo) | etapas por perfil |
| Conciliação | `GET /conciliacao?de=&ate=`; `POST /conciliacoes`; `POST /extratos/importar` | `hotel.financeiro.*` |
| Boletos | `GET/POST /boletos`; `POST /boletos/:id/baixar` | `hotel.financeiro.*` |
| Empresas | `GET/POST /empresas`; `POST /faturas/gerar?periodo=`; `POST /faturas/:id/{conferir,aprovar,registrar-nf,cancelar}`; `POST /cobrancas` (rascunho) e `/cobrancas/:id/aprovar` | `hotel.empresas.*` |
| Contas a pagar | `GET/POST /documentos-recebidos`; `POST /documentos-recebidos/:id/{validar,classificar,enviar-aprovacao}`; reaproveita `/api/contas` existente | `financeiro.*` |
| Recorrentes | `GET/POST /recorrentes`; `POST /recorrentes/gerar?competencia=` (idempotente) | `hotel.financeiro.*` |
| Painel | `GET /painel?de=&ate=` → cada número com `definicao`, `periodo`, `atualizado_em`, `link` para os registros | por perfil |
| Relatórios | `GET /relatorios/:nome?formato=csv|xlsx|pdf&...` | por perfil |

Toda rota que altera dado aceita `motivo` e grava na auditoria. Rotas de
confirmar/gerar são idempotentes: repetir não cria registro novo.

---

## 4. Plano de importação do DataHotel

| Relatório | Campos esperados | Chave contra duplicidade | Se não houver ID |
|---|---|---|---|
| Hospedagens / Diário de Situação **[Amostra 1]** | reserva, apto, hóspede, entrada, saída, adultos, crianças, empresa, situação | nº da reserva **[P3]** | apto + entrada + nome reduzido (marcado "chave fraca", pede conferência) |
| Controle de Caixa **[Amostra 2]** | data/hora, reserva, forma, valor, documento/NSU | código do lançamento **[P3]** | reserva + data/hora + forma + valor |
| Faturamento **[Amostra 3]** | reserva, competência, diárias, consumos, descontos, total | reserva + data + tipo | — |
| Conta Corrente **[Amostra 4]** | empresa, documento, vencimento, valor, pago | documento | empresa + vencimento + valor |
| Vendas / consumos **[Amostra 5]** | data, apto, produto, qtd, valor | código da venda | data + apto + produto + qtd |
| Extrato da adquirente **[Amostra 7]** | NSU, data venda, data crédito, bruto, taxa, líquido | NSU + parcela | — |
| Extrato bancário OFX/CSV **[Amostra 7]** | data, valor, histórico, FITID | FITID | conta + data + valor + histórico (hash) |

**Fluxo de cada arquivo**

1. Upload → `sha256`; se o mesmo arquivo já foi confirmado, avisa e para.
2. Lê XLSX (exceljs) ou CSV (detecta `;`/`,`, vírgula decimal, `DD/MM/AAAA`). PDF: fase 2, sempre com revisão manual.
3. Aplica o layout salvo; se uma coluna obrigatória falta, o lote inteiro fica em `PREVIA` com erro e nada é gravado.
4. Valida cada linha (tipos, datas, totais do arquivo × soma das linhas). Linha inválida vai para quarentena.
5. Classifica: novo, atualizado (lista os campos que mudariam), idêntico, rejeitado.
6. Usuário confirma; tudo numa transação. Registro atualizado guarda o valor anterior na auditoria; ajustes locais não são sobrescritos.
7. Painel mostra a data da última importação de cada tipo e alerta se passar de 1 dia **[configurável]**.

**Dicionário de dados:** tela gerada a partir de `import_layouts`, mostrando
campo interno, coluna de origem, transformação e se a cobertura foi confirmada
com amostra real.

---

## 5. Telas

| Tela | Situação hoje (protótipo) | O que muda |
|---|---|---|
| Painel da direção | Parcial | Números da API, com definição e "ver registros" |
| Rotina do Dia | Existe | Lê `GET /dia/:data` |
| Hospedagens, Café, Governança/Enxoval, Frigobar | Existem | Gravam via API |
| Fechamento de Caixa | Existe | Etapas e trava no servidor |
| Cartões e Banco | Parcial | Importa adquirente e OFX |
| Boletos, Empresas/Cobrança | Existem | Fatura com etapas |
| Fornecedores / Contas a Pagar | Herdado | + fila de documentos recebidos |
| Despesas / Recorrentes / Calendário | Existe | Previsão substituída pela nota |
| Funcionários, Ponto e Banco de Horas | Herdado | + diárias |
| Relatórios | Exportação por tela | Central com XLSX |
| Importações | Existe (3 passos) | Servidor, hash, quarentena, dicionário |
| Configurações e Auditoria | Existe | Layouts e limites |

Cada tela: carregando, vazio, erro e sucesso; cores por estado (pendente âmbar,
em conferência azul, aprovado/pago verde, vencido/divergente vermelho, cancelado
cinza) sempre acompanhadas de texto.

---

## 6. Decisões

| Tema | Decisão | Motivo |
|---|---|---|
| Stack | Manter TypeScript + Fastify + PostgreSQL + telas atuais | Já roda, já tem login, auditoria e folha. React/Next.js reavaliado na fase 2. |
| Hospedagem | Railway (projeto `hotel-gestao-360`, separado do Leibniz) | Já no ar; banco gerenciado. |
| Autenticação | Sessão no servidor, cookie HttpOnly/Secure/SameSite, senha com hash forte, bloqueio após tentativas, troca de senha pelo administrador | Existente; recuperação por e-mail entra quando houver envio configurado. |
| Dados sensíveis | CPF, CNPJ de pessoa física, conta bancária: cifrados (AES-256, chave em variável de ambiente) + hash para busca | Existente. |
| Hóspedes (LGPD) | Guardar só nome reduzido e nº da reserva; documento do hóspede **não** é importado | Minimização; o PMS já guarda. Retenção **[P16]**. |
| Backup | Backup diário do Postgres pelo Railway + `pg_dump` semanal fora do Railway; teste de restauração mensal | Não depender de um só lugar. |
| Observabilidade | Logs estruturados (pino), sem dados pessoais; alerta se importação falhar | — |
| Validação PG TLS | Configurar `PG_CA_PATH` no Railway | O log de deploy avisa que hoje a conexão não valida o certificado. |

---

## 7. Ordem de implementação (Etapa 3)

1. Migration 032 (cadastros e importação) + perfis e permissões novas + teste "Governança recebe 403 em salário".
2. Importação no servidor (CSV e XLSX, hash, quarentena) + testes 1 e 2 do prompt.
3. Migration 033 (hospedagens, lançamentos, recebimentos) + `GET /dia` + troca das telas do dia.
4. Migration 034 (fechamento e caixa) + aprovação e reabertura + testes 3 e 11.
5. Migration 036 (café, enxoval, frigobar) + testes 8.
6. Migration 035 (contas, recorrentes) + testes 6 e 7.
7. Painel com origem dos números.

Os passos 1, 2 e 4 não dependem das amostras. Os layouts reais (passo 3) entram
quando as amostras chegarem.
