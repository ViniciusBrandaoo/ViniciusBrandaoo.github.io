# Hotel Gestão 360 — plano, status e dependências

Este documento acompanha o "Prompt mestre" (30 seções). Nenhum requisito foi
removido: cada um aparece abaixo com um destes status.

- **Feito** — regra no domínio (`prototipo/partes/hotel-dominio.js`), com teste
  em `tests/prototipo/hotel.test.ts`, e tela em `prototipo/partes/telas-hotel.js`.
- **Herdado** — já existia na plataforma (folha, contas a pagar, fornecedores,
  aprovações, auditoria, perfis) e foi reaproveitado.
- **Parcial** — funciona, mas falta uma parte, que está descrita.
- **Depende** — precisa de uma informação ou autorização externa antes de
  implementar (lista na seção D). Até lá existe um caminho manual seguro.

## A. Arquitetura atual (o que roda hoje)

| Camada | Onde | Situação |
|---|---|---|
| Tela + regras no navegador | `prototipo/partes/*.js` → `index.html` | Roda sem servidor; grava no `localStorage` do navegador. **Serve para validar o fluxo, não para produção multiusuário.** |
| Regras do hotel | `hotel-dominio.js` | Funções puras em centavos, testadas. |
| Servidor + PostgreSQL | `servidor/`, `db/migrations/` | Herdado: autenticação com sessão, auditoria por trigger, folha. **Ainda sem as tabelas do hotel** (ver Fase 1-B). |

Princípio aplicado em todo o código: **faturado ≠ recebido**, **vendido no
cartão ≠ depositado**, **boleto emitido ≠ pago**, **nota emitida ≠ recebida**.
Cada um desses estados vive num campo próprio e só vira "dinheiro" com a
confirmação correspondente.

## B. Status por seção

| § | Requisito | Status | Onde / observação |
|---|---|---|---|
| 1 | Complementar ao DataHotel, sem substituí-lo | Feito | Nada escreve no DataHotel; tudo que vem dele guarda `origem` + `codigoOrigem`. |
| 2 | Dashboard, menu lateral, login, perfis, auditoria, exportação, alertas, filtros, busca | Feito / Herdado | Grupo "Hotel" no menu; exportação CSV (abre no Excel) e PDF por impressão em todas as telas novas. |
| 3.1–3.2 | Integração DataHotel (API, Excel, CSV, relatórios) | **Depende** + caminho manual feito | Importação de CSV pronta. API: não presumida (ver D1). Excel: hoje "Salvar como CSV"; leitura direta de .xlsx entra com o servidor (a biblioteca `exceljs` já está no projeto). |
| 3.3 | Central de importações: prévia, novos/atualizados/duplicados/inconsistentes, histórico, usuário, sem apagar dado interno | Feito | Tela "Importações DataHotel". Testes 1–3 e 26. |
| 4 | Dashboard gerencial (hospedagem, financeiro, operacional) | Parcial | Bloco "Hotel hoje" no dashboard, com receita lançada, recebida e a receber separadas. Faltam gráficos de evolução e o filtro de período direto no dashboard (os filtros estão em cada tela). |
| 5.1 | Extrato diário de hospedagem | Feito | "Hospedagem do Dia". |
| 5.2 | Ocupação (bloqueados fora do denominador, configurável) | Feito | Regra em "Cadastros do Hotel". |
| 5.3 | Relatório diário: elaboração → conferência → aprovação → fechamento, com auditoria | Feito | Aprovar e fechar é da Direção ou do Financeiro. |
| 6 | Café da manhã: lista, adultos/crianças, com/sem café, extras justificados, atendidos, impressão | Feito | Quem pernoitou na noite anterior. Ajuste não altera o dado de origem. |
| 7 | Enxoval: 5 itens + novos, locais, movimentações, fórmula de estoque, lista de governança, padrão por apartamento, alertas | Feito | Transferência não muda o total. O padrão de enxoval por apartamento existe no domínio (`padraoEnxoval`); falta a tela para editá-lo. |
| 8 | Fechamento diário de caixa (por modalidade, faturado × recebido, saldo, diferença só com justificativa + autorização) | Feito | Testes 4–5. Reabertura só pela Direção, com justificativa. |
| 9 | Conciliação de cartões e depósitos (taxa, antecipação, status, diferenças) | Feito / **Depende** | Lançamento e conciliação manuais. Importar o arquivo da adquirente depende de D4. |
| 10 | Faturamento mensal de empresas, demonstrativo, NF, boleto, cobrança | Parcial | Cadastro, consolidação, demonstrativo, saldo a faturar. A NF é registrada depois de emitida no emissor externo (D5). |
| 10.5 | Cobrança automática (e-mail/WhatsApp) e histórico | Parcial / **Depende** | Mensagem pronta, abre no e-mail ou no WhatsApp e registra no histórico. O envio automático depende de canal autorizado (D7). |
| 11 | Central de boletos, status, baixa que atualiza o recebimento sem dupla contagem | Feito | Teste 8. O retorno bancário automático depende de D6. |
| 12 | Frigobar: produtos, registro diário, fechamento diário e mensal (dias reais), margem, sem receita duplicada, alerta de não cobrado | Feito | Teste 11. |
| 13 | Fornecedores, documentos, triagem do "grupo de faturamento", relatório mensal | Herdado / **Depende** | Cadastro, contas e aprovação já existem. Importar anexos do grupo depende de D7; hoje o envio é manual (Documentos). |
| 14 | Contas fixas e variáveis, recorrência sem pagamento fictício, alertas por marco, calendário com saldo projetado | Feito | "Contas Fixas e Calendário". Teste 16. |
| 15 | Fluxo de caixa realizado × previsto, insuficiência projetada | Parcial | Visão diária do mês. Faltam os agrupamentos semanal, anual, por categoria e por conta bancária. |
| 16 | Funcionários, vínculo CLT × diária, histórico, dados restritos | Herdado | Cadastro, histórico salarial e salário restrito já existem. Pagar por diária **não** presume ausência de vínculo. |
| 17 | Ponto: marcações, horas, atrasos, faltas, ajuste justificado, original preservada | Feito (gerencial) | Não é ponto oficial (Portaria 671/2021); está avisado na tela. |
| 18 | Banco de horas com fórmula e hora paga fora do saldo | Herdado + Feito | Regra em `H.bancoDeHoras`; tela existente de Banco de Horas. Prazo de compensação: D9. |
| 19 | Prévia da folha (CLT) e diárias | Herdado + Feito | Motor de folha herdado. Diárias: `H.fechamentoDiarias`, tela "Ponto e Diárias". As tabelas legais exigem conferência da contabilidade. |
| 20 | Central de relatórios diário/semanal/mensal, agendamento e envio | Parcial | Cada tela exporta o próprio relatório. Agendamento e envio automático dependem do servidor (Fase 1-B). |
| 21 | Automações e regras de confiabilidade | Parcial | As regras estão no domínio e nos testes. As execuções programadas dependem do servidor. |
| 22 | Perfis (Admin, Direção, Financeiro, Recepção, Governança, RH) | Feito | Perfis Recepção e Governança adicionados; permissões configuráveis em Controle de Acesso. |
| 23 | Banco relacional com as entidades listadas | **Pendente (Fase 1-B)** | Coleções já modeladas no domínio. Falta a migration `032_hotel.sql`. |
| 24 | Interface: cores de status, tabelas com filtro, modais, responsivo | Feito | Verde, âmbar, vermelho e azul. |
| 25 | Segurança, LGPD, auditoria com valor anterior | Parcial | A auditoria guarda antes, depois e justificativa (teste 24). Login seguro, sessão e backup ficam com o servidor; a política de retenção depende de D10. |
| 26 | Rotina diária | Feito | Importar → hospedagem → café → governança → frigobar → caixa → relatório diário. |
| 27 | Fechamento mensal com 18 etapas e status | Feito | Tela "Fechamento do Mês", com pendências automáticas. |
| 28 | 26 validações | Feito em regra | `tests/prototipo/hotel.test.ts`; cada `describe` traz o número do item. |
| 29 | Entrega por fases | Em andamento | Ver seção C. |
| 30 | Não inventar integração | Respeitado | Ver seção D. |

## C. Próximas fases

1. **Fase 1-B (servidor):**
   - migration `032_hotel.sql` com as coleções do domínio, chaves únicas em `(origem, codigo_origem)`, CHECKs iguais às invariantes e triggers de auditoria;
   - rotas da API;
   - troca do `localStorage` pelo banco nas telas do hotel.

   Sem isso o sistema não deve ser usado por mais de uma pessoa ao mesmo tempo.
2. **Layout real do DataHotel:** com um arquivo exportado de verdade (anonimizado), ajustar `H.LAYOUTS` e incluir os outros relatórios (consumos, ocupação, contas pendentes).
3. Relatórios agendados, gráficos de evolução e fluxo semanal, anual e por conta.
4. Conectores de adquirente, banco, emissor de NF e WhatsApp, à medida que D4–D7 forem confirmados.

## D. Dependências — informações necessárias antes de implementar

| # | Pergunta (§30) | Por que importa |
|---|---|---|
| D1 | O DataHotel tem API oficial? Quais exportações existem (CSV, XLS, PDF)? | Define se a importação será automática ou continua manual. |
| D2 | Quais colunas e identificadores vêm em cada exportação (número da reserva, código do pagamento)? | É a chave contra duplicidade. |
| D3 | O frigobar já é lançado na conta do hóspede no DataHotel? | Evita contar a receita duas vezes. |
| D4 | Qual adquirente de cartão? Ela exporta um relatório de vendas e de recebíveis? | Conciliação automática. |
| D5 | Como as NFS-e são emitidas hoje (prefeitura, contador, sistema)? | Integração fiscal só por meio autorizado. |
| D6 | Qual banco emite os boletos? Existe arquivo de retorno (CNAB)? | Baixa automática. |
| D7 | O "grupo de faturamento" é WhatsApp? Existe uma conta Business/API autorizada? | Importação de anexos e cobrança automática. |
| D8 | Contas bancárias e saldos iniciais. | Fluxo de caixa realizado. |
| D9 | Convenção ou acordo de banco de horas (prazo de compensação, adicional). | Regras configuráveis de ponto e banco. |
| D10 | Quem acessa cada módulo e qual a política de retenção de dados. | Perfis e LGPD. |

## E. Como testar

```bash
npm test                             # inclui tests/prototipo/hotel.test.ts
node prototipo/build.mjs --sem-dados # gera o HTML; abra hotel-gestao-360/index.html
```

Use apenas dados fictícios em demonstração.
