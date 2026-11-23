# Hotel Gestão 360 — Etapa 1: descoberta e análise

Data: 06/11/2026. Base: o prompt mestre da direção, o que já existe no
repositório (`docs/PLANO-HOTEL.md`) e o que foi possível verificar do DataHotel.

> **Situação real do projeto.** O prompt pede para começar pela Etapa 1 antes de
> codificar. Parte do sistema já foi construída antes desta análise: regras em
> `prototipo/partes/hotel-dominio.js` (com testes) e telas que gravam no
> navegador. Esta etapa revisa esse trabalho contra o pedido. Nada do que existe
> deve ser tratado como pronto para produção até as perguntas da seção 6 serem
> respondidas e os dados irem para o banco (PostgreSQL), não para o navegador.

---

## 1. Objetivo e escopo

**Objetivo.** Acabar com as planilhas soltas e dar à direção, todo dia e todo
mês, uma resposta clara para: o que entrou, o que saiu, o que falta receber, o
que falta pagar e onde há divergência. Cada número precisa mostrar de onde veio.

### O que continua no DataHotel (não duplicar)

| Atividade | Motivo |
|---|---|
| Reservas, check-in, check-out, mapa de disponibilidade | É o PMS. O Hotel 360 só lê. |
| Channel manager (sites de reserva) | Já existe no DataHotel. |
| Conta do hóspede, lançamento de diárias e consumos | Fonte da receita de hospedagem. |
| Caixa da recepção (abertura, recebimentos, fechamento do turno) | O DataHotel tem "Controle de Caixa" e "Alterações Caixa Fechado". O Hotel 360 **confere** esse caixa; não o substitui. |
| Venda balcão / PDV (Datacaixa) | Já integrado ao DataHotel. |
| Emissão de NFS-e | O DataHotel tem a função (a confirmar se o hotel usa). |

### O que passa a ser controlado no Hotel 360

| Área | Por que aqui |
|---|---|
| Conferência e fechamento diário (checklist único, aprovação, trava) | Não existe fluxo de aprovação auditado no PMS. |
| Conciliação de cartões, depósitos, boletos e banco | Cruza DataHotel × adquirente × extrato bancário. |
| Faturamento mensal de empresas e cobrança | Pré-fatura, aprovação, título, cobrança, baixa. |
| Café da manhã (previsto × efetivo) | Ajustes com motivo e histórico. |
| Governança e enxoval | Não identificado no DataHotel. |
| Frigobar e estoque (almoxarifado ↔ quartos) | Estoque, perdas, margem; o lançamento na conta do hóspede segue no DataHotel. |
| Fornecedores, documentos e contas a pagar | Substitui o "grupo de faturamento" no WhatsApp. |
| Despesas fixas/variáveis, orçamento e calendário | Planejamento. |
| Funcionários, ponto, banco de horas, prévia de diárias | Gerencial, não é folha oficial nem eSocial. |
| Painel da direção, relatórios, auditoria | Visão consolidada. |

---

## 2. Dados do DataHotel: o que pode vir

Fonte da verificação: página de parceiro na Omnibees ("PMS desktop, funciona sem
internet") e a lista de vídeos do canal oficial "Datahotel" no YouTube. O site
datahotel.com.br não abriu (resposta corrompida) e os vídeos não têm legenda
acessível. **Nenhuma API foi encontrada.** Formato de exportação (XLSX, CSV,
PDF) não foi confirmado para nenhum relatório.

Legenda: **Existe** = a função aparece em material oficial; **Exemplo** = depende
de um arquivo exportado de verdade; **Não visto** = não encontrado.

| Dado | Relatório provável no DataHotel | Função existe? | Exportação | Uso no Hotel 360 |
|---|---|---|---|---|
| Hospedagens / extrato da conta | Consultar Reservas; Relatórios de Faturamento | Existe | Exemplo | Extrato, café, governança, empresas |
| Situação diária (ocupados, chegadas, saídas) | Relatório Diário de Situação; Resumo Ocupação Diário; Situação dos Apartamentos | Existe | Exemplo | Café, governança, painel |
| Indicadores de ocupação | Indicadores de Ocupação / Performance | Existe | Exemplo | Painel |
| Pagamentos por forma (caixa) | Controle de Caixa | Existe | Exemplo | Fechamento e conciliação |
| Conta corrente (empresas / hóspedes a receber) | Operações Conta Corrente | Existe | Exemplo | Contas a receber, faturamento |
| Vendas / consumos | Relatórios de Vendas; Venda Balcão; Datacaixa PDV | Existe | Exemplo | Frigobar (cruzar consumo lançado) |
| Receitas × despesas | Relatório Receitas x Despesas; Gráfico de Despesas | Existe | Exemplo | Saber se o hotel já lança despesas no DataHotel |
| Comissões | Relatório Comissão por Reserva | Existe | Exemplo | Despesa de canal (fase 2) |
| NFS-e emitidas | Emissão de NFS-e | Existe | Exemplo | Registrar NF nas faturas de empresas |
| Lista de café da manhã | — | Não visto | — | Calcular pela ocupação (regra configurável) |
| Mapa de governança / enxoval | — | Não visto | — | Cadastro interno |
| Ponto de funcionários | — | Não visto | — | Cadastro interno ou relógio de ponto |
| API / integração oficial | — | Não visto | — | Só importação por arquivo |

**Amostras pedidas ao hotel** (exportar no DataHotel, anonimizar nomes e
documentos, um dia ou uma semana já fechados):

1. Relatório Diário de Situação (ou Resumo Ocupação Diário).
2. Controle de Caixa de um dia fechado, com as formas de pagamento.
3. Relatório de Faturamento do mês anterior.
4. Operações Conta Corrente (empresas com saldo).
5. Relatório de Vendas / consumos, se o frigobar é lançado ali.
6. Receitas x Despesas do mês anterior.
7. Extrato da adquirente de cartão e extrato bancário (OFX ou CSV) do mesmo mês.

Para cada um: anotar em quais formatos o DataHotel oferece salvar.

---

## 3. Processos: hoje e depois

| Rotina | Hoje (a confirmar) | Com o Hotel 360 |
|---|---|---|
| Fechamento do dia | Caixa no DataHotel + conferência em planilha/papel | Importar → conferir extrato, café, governança, frigobar, caixa → aprovar → travar |
| Cartões | Conferência manual com o extrato da maquininha | Venda (DataHotel) ↔ liquidação (adquirente) ↔ crédito (banco), com diferença apontada |
| Empresas | Planilha e e-mail | Hospedagens importadas → pré-fatura → aprovação → NF → título → cobrança → baixa |
| Documentos de fornecedor | Grupo de WhatsApp | Fila de documentos anexados, com status e responsável |
| Contas fixas | Memória / planilha | Recorrência gera previsão; a nota real substitui a previsão (sem duplicar) |
| Enxoval | Contagem manual | Movimentações (entrega, lavanderia, devolução, extravio) e inventário |
| Frigobar | Contagem no quarto + lançamento no DataHotel | Consumo e reposição com estoque; cruza com o lançado no DataHotel |
| Ponto | A confirmar | Marcações, ajustes justificados, banco de horas, prévia de diárias |

**Jornadas principais**

- **Recepção (manhã):** confere importação do dia → lista de café → pendências da noite.
- **Governança:** checklist por quarto → movimentação de enxoval → frigobar.
- **Financeiro (fim do dia):** caixa → cartões → boletos → divergências justificadas → envia para aprovação.
- **Direção:** painel → aprova fechamento e pagamentos → reabre só com motivo.
- **RH (mês):** fecha ponto por funcionário → prévia de diárias e eventos.

---

## 4. Matriz de permissões (proposta)

V = vê, E = edita, A = aprova, R = reabre período fechado, — = sem acesso.
A verificação é feita no servidor, não só escondendo botões.

| Recurso | Admin | Direção | Financeiro | Recepção | Governança | RH | Auditor |
|---|---|---|---|---|---|---|---|
| Painel geral | V | V | V | V (sem financeiro) | — | — | V |
| Importações | E | V | E | E | — | — | V |
| Hospedagens / extrato | V | V | V | E | V | — | V |
| Café da manhã | V | V | V | E | E | — | V |
| Governança / enxoval | V | V | — | V | E | — | V |
| Frigobar / estoque | V | V | V | E | E | — | V |
| Fechamento de caixa | V | A, R | E | E (só o turno) | — | — | V |
| Cartões / banco / boletos | V | V | E | — | — | — | V |
| Empresas / cobrança | V | A | E | V | — | — | V |
| Fornecedores / contas a pagar | V | A | E | — | — | — | V |
| Dados bancários de fornecedor | E | V | V | — | — | — | — |
| Despesas / orçamento | V | A | E | — | — | — | V |
| Funcionários (sem salário) | E | V | V | — | — | E | V |
| Salário, conta bancária do funcionário | E | V | — | — | — | E | — |
| Ponto / banco de horas | V | A, R | V | — | — | E, A | V |
| Usuários e permissões | E | V | — | — | — | — | V |
| Auditoria | V | V | V | — | — | — | V |

---

## 5. Glossário financeiro

| Termo | Significa | Não é |
|---|---|---|
| Competência | Dia/mês a que a receita ou despesa pertence | Data em que o dinheiro entrou |
| Receita / faturamento | Valor da operação (diárias, consumos) na competência | Dinheiro recebido |
| Recebido | Valor pago pelo cliente, por forma | Depositado na conta |
| A receber | Faturado e ainda não recebido (empresa, boleto, cartão a liquidar) | Receita nova |
| Liquidação | Adquirente paga o cartão (bruto − taxa = líquido) | Nova receita |
| Depósito / crédito | Dinheiro na conta bancária | Receita |
| Taxa | Custo do cartão ou boleto (despesa financeira) | Desconto ao cliente |
| Estorno / chargeback | Devolução de um recebimento | Despesa operacional |
| Transferência | Entre contas do próprio hotel | Receita nem despesa |
| Previsto / comprometido / pago | Recorrência esperada / nota recebida e aprovada / quitada | — |

Exemplo de controle: venda de R$ 1.000 = 200 dinheiro + 200 débito + 300 crédito
+ 200 empresa + 100 boleto. Receita: R$ 1.000 uma vez. Recebido no dia: R$ 400
(dinheiro + débito). A receber: R$ 600. Quando o crédito liquida e a empresa
paga, o "a receber" cai e o "recebido" sobe; a receita continua R$ 1.000.

---

## 6. Perguntas indispensáveis antes de codificar

Só as que mudam o modelo ou as regras. O resto vira padrão configurável (seção 7).

**Hotel e DataHotel**
1. Quantos apartamentos e de quais tipos? Há mais de uma unidade?
2. Quais relatórios o DataHotel deixa exportar e em quais formatos (XLSX, CSV, PDF)? Enviar as amostras da seção 2.
3. Cada reserva e cada pagamento têm um número único no relatório? (É a chave contra duplicidade.)
4. O frigobar é lançado na conta do hóspede no DataHotel? Quem lança e quando?
5. O hotel já lança despesas no DataHotel (há "Receitas x Despesas")? Se sim, onde fica a fonte da verdade das contas a pagar?
6. A NFS-e é emitida pelo DataHotel, pela prefeitura ou pelo contador?

**Financeiro**
7. Quais adquirentes de cartão (maquininhas) e quais bancos/contas? A adquirente exporta vendas e recebíveis?
8. Os boletos são emitidos por qual banco? Existe arquivo de retorno?
9. Quem confere e quem aprova o fechamento do dia? Que diferença de caixa é tolerada sem aprovação da direção?
10. Quais empresas faturam mensalmente, com que prazo e com que dia de corte?

**Operação**
11. Café: quem tem direito (pernoite anterior? day use?), horário de corte, crianças contam a partir de que idade?
12. Enxoval: há padrão por tipo de quarto e política de troca (diária, a cada 2 dias, a pedido)? Lavanderia é própria ou terceirizada?

**Pessoas**
13. Quantos funcionários CLT e quantos diaristas? Há relógio de ponto? Exporta arquivo?
14. Há acordo ou convenção de banco de horas (prazo de compensação, adicionais)? Quem é o contador?
15. Quem será usuário em cada perfil? Há necessidade do perfil Auditor (contador)?
16. Por quanto tempo guardar dados de hóspedes e funcionários (LGPD)?

---

## 7. Suposições adotadas (configuráveis)

| Tema | Padrão proposto |
|---|---|
| Ocupação | Quartos bloqueados ficam fora do denominador. |
| Café | Hóspede que pernoitou na noite anterior tem direito; ajuste manual exige motivo. |
| Diferença de caixa | Qualquer diferença exige justificativa; acima de R$ 20,00 exige aprovação da Direção. |
| Fechamento mensal de frigobar | Soma dos dias reais do mês (28 a 31); janela móvel de 30 dias como relatório separado. |
| Duplicidade de fornecedor | Fornecedor + número + série + valor. |
| Reimportação | Mesmo código de origem atualiza, com campos alterados registrados; nunca apaga. |
| Exclusão | Financeiro nunca é apagado: cancelamento ou estorno com trilha. |
| Ponto | Gerencial, não oficial (Portaria 671/2021); percentuais legais vêm do contador. |

---

## 8. Requisitos priorizados

### MVP (o que a direção usa todo dia)

| # | Requisito | Critério de aceite | Já existe hoje? |
|---|---|---|---|
| M1 | Banco PostgreSQL, login, perfis no servidor | Governança tenta abrir salário → 403 do servidor | Login e perfis sim; tabelas do hotel não |
| M2 | Central de importação (XLSX/CSV, mapeamento, prévia, quarentena, hash do arquivo) | Mesmo arquivo 2× → 0 novos; coluna faltante → nada importado e erro por linha | CSV com prévia e dedupe; falta XLSX, hash, mapeamento assistido |
| M3 | Hospedagem do dia + café + governança | Lista do dia bate com o Relatório Diário de Situação | Sim, no navegador |
| M4 | Fechamento diário com checklist, aprovação e trava | Não fecha com divergência sem justificativa; reabrir exige motivo | Sim, no navegador |
| M5 | Caixa por forma de pagamento, faturado × recebido × a receber | Cenário R$ 1.000 acima | Sim (regra testada) |
| M6 | Fornecedores, fila de documentos, contas a pagar com aprovação | Parcela paga parcialmente mantém saldo | Herdado |
| M7 | Contas fixas recorrentes sem duplicar | Previsão de energia + nota real = 1 obrigação | Sim (regra testada) |
| M8 | Frigobar diário/mensal e estoque | Reposição e consumo em dias diferentes → total e saldo corretos | Sim (regra testada) |
| M9 | Painel da direção com origem e data de atualização de cada número | Clicar no indicador mostra os registros | Parcial |
| M10 | Exportação XLSX/CSV/PDF | Abre no Excel sem ajuste | CSV e PDF; falta XLSX |

### Fase 2

Conciliação de cartões com arquivo da adquirente; extrato bancário OFX;
faturamento e cobrança de empresas completo; boletos com retorno; orçamento ×
realizado; gráficos diário/semanal/mensal; alertas programados.

### Fase 3

Ponto com importação do relógio; banco de horas e prévia de diárias integrados
ao fechamento; envio de e-mail/WhatsApp com integração autorizada; relatórios
agendados; múltiplas unidades.

### Não funcionais

- Valores em centavos inteiros; datas com fuso America/Sao_Paulo; data de competência, movimento, vencimento e pagamento separadas.
- HTTPS, sessão segura, CPF e conta bancária criptografados, backup diário do banco com teste de restauração.
- Toda alteração auditada com antes, depois, usuário, horário e justificativa.
- Tela do dia abre em menos de 2 s com um mês de dados.

---

## 9. Decisão sobre o que já existe

| Item | Proposta |
|---|---|
| Regras de domínio e testes | Manter. Já cobrem os cenários 1–9 e 11 da seção 15 do prompt. |
| Telas que gravam no navegador | Manter como protótipo de validação com a direção. Não usar com dados reais. |
| Próximo passo técnico | Depois das respostas: migration das tabelas do hotel, API, troca do navegador pelo banco, importação de XLSX. |
| Stack | Manter a atual (TypeScript, Fastify, PostgreSQL no Railway). O prompt sugere React/Next.js; trocar o frontend agora custaria semanas sem ganho para a operação. Reavaliar na fase 2. |

---

## 10. Próxima ação

1. Direção responde as 16 perguntas da seção 6.
2. Hotel exporta as 7 amostras da seção 2.
3. Com isso, Etapa 2: modelo de dados, layouts reais de importação e plano de API.
