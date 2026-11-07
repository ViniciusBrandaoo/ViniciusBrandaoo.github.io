# DataHotel — onde fica cada relatório

Levantado em 06/11/2026 na instalação do hotel (DataHotel versão 2023.07.11,
acesso por Área de Trabalho Remota em `cloud.datahotel.com.br`).

## Como exportar

1. Abra o relatório pelo menu (lista abaixo).
2. Espere a tela de filtros carregar. Ela fica "Não respondendo" por uns 10 segundos.
3. Ajuste o período e clique **OK**: abre a **Pré-Visualizar**.
4. Na barra de cima, clique no **disquete (Salvar)**. Aparecem os formatos:
   **Tabela Excel (OLE)**, **Ficheiro PDF**, **Ficheiro CSV**.
5. Escolha **Ficheiro CSV** → OK (separador `;`) → escolha a pasta → Salvar.

**Atenção:** a janela Salvar mostra o computador do DataHotel, não o seu. Para
o arquivo chegar ao seu computador, a conexão "Hotel" precisa compartilhar o
disco local (ver "Compartilhar o disco" abaixo).

## Mapa dos menus

**Hospedagem**: Controle de Reservas · Consultar Reserva · Calendário Mensal ·
Integração Channel Manager · Tarifador Telefônico · SNRHos · Mala Direta ·
**Lista de Café da Manhã** · **Lista de Check-in/out Diário** · **Resumo de
Ocupação Diário** · **Relatório Diário (RDS)** · Mapa de Disponibilidade ·
Relatório de Reservas (Sintético) · **Relatório de Reservas** · Relatório de
Pré-Reservas Vencidas · Ranking de Reservas

**Vendas**: Venda Balcão · Day Use · Consulta Preço · Notas Fiscais de Serviço
(NFS-e) · Relatório de Vendas Balcão · **Relatório de Consumo** · **Relatório de
Vendas Itens (Consumo + Venda Balcão)** · Resumo de Vendas Balcão / Day Use /
Reservas · Relatório de Vendas Day Use

**Financeiro**: Controle do Caixa · Contas a Pagar · Contas a Receber ·
Consultar Faturas · Conta Corrente · Controle de Créditos · **Relatório de
Contas a Receber** · **Relatório de Contas Recebidas** · Relatório de Contas a
Pagar · Relatório de Contas Pagas · Comissão por Reservas · Créditos x Débitos
por Forma Pgto. · **Recebimentos do Caixa por Forma de Pgto.** · **Resumo de
Movimentação por Caixa** · Receitas x Despesas

**Governança**: Governança · **Lista de Camareira** · Lista de Camas Adicionais ·
Check List de Inspeção

**Gerencial**: Indicadores de Ocupação · Indicadores de Ocupação por Hóspedes ·
Indicadores de Reservas · Indicadores de Performance (KPI's-REVPAR/TREVPAR) ·
Taxa de Ocupação Diária · Taxa de Ocupação Mensal · Gráfico de Situação dos
Apartamentos · Gráfico de Despesas Mensais · Gráficos de Faturamento Diário /
Mensal / por Tipo de Conta · **Relatório de Faturamento** · Resumo de
Faturamento Diário · Manutenção nos Dados · Auditoria de Usuários

**Relatórios**: Auditoria

Em negrito, os que alimentam o Hotel 360.

## Relatório de Reservas (conferido)

Filtros: Agrupado por · Período (Check-in/Check-out, de/até) · Hóspedes ·
Empresas · Grupos · Canal de Venda · Funcionários · situações (Pré-Reserva,
Reserva, Checked-in, Checked-out, Cancelada, No-Show).

Colunas: **Cód. Res.** (ex.: `ABC123456`) · Check-in · Check-out · Hóspede ·
Apto. · Nº Diárias · Nº Hósp. · Canal de Venda · Funcionário · Situação ·
Vr. Total. Rodapé com "Total Geral" (precisa ser ignorado na importação).

## Compartilhar o disco com a Área de Trabalho Remota

Uma vez só, no seu computador:
1. Feche o DataHotel (saia da sessão).
2. Clique com o botão direito no atalho **Hotel** da área de trabalho → **Editar**.
3. Aba **Recursos Locais** → **Mais...** → marque **Unidades** (ou só o `C:`) → OK.
4. Aba **Geral** → **Salvar**. Conecte de novo.

Na janela Salvar do DataHotel vai aparecer "C em <seu computador>". Salve em
`C:\Users\<você>\Downloads\datahotel\`.

Se a opção não aparecer ou o disco continuar sem aparecer, o servidor do
DataHotel bloqueia isso; aí o caminho é pedir ao suporte do DataHotel
("Atendimento Online") para liberar o redirecionamento de unidades.

---

## Exportações feitas em 06/11/2026 (período 26/10 a 06/11/2026)

Regra do usuário: **não trazer dado anterior a 26/10/2026**. Pasta no computador
do usuário: `Downloads\datahotel\`. Cada arquivo foi conferido contra o
rodapé do próprio relatório.

| Arquivo | Relatório no DataHotel | O que traz | O sistema lê? |
|---|---|---|---|
| `reservas_extrato_2026-10-26_2026-11-06.csv` | Hospedagem → Relatório de Reservas, com *Exibir extrato resumido* e *Cancelada* | 42 reservas; por reserva: diária lançada, consumo e recebimento. Resumo final: diária R$ 16.285,00, consumo R$ 36,00 | **Sim** (tipo Hospedagens) |
| `contas_recebidas_2026-10-26_2026-11-06.csv` | Financeiro → Relatório de Contas Recebidas | 88 recebimentos, R$ 14.570,50, cada um com número de lançamento | **Sim** (tipo Recebimentos, recomendado) |
| `movimentacao_caixa_2026-10-26_2026-11-06.csv` | Financeiro → Resumo de Movimentação por Caixa | Livro-caixa por sessão (entradas, sangrias, fechamento) e consumo por apartamento. Sessões 1365 e 1366 | **Sim** (tipo Recebimentos; **não usar junto** com Contas Recebidas) |
| `cafe_manha_2026-10-26_2026-11-06.csv` | Hospedagem → Lista de Café da Manhã | Por dia e apartamento: hóspede, adultos e crianças (rodapé: 148 adultos, 1 criança) | Ainda não |
| `camareira_apartamentos_2026-11-06.csv` | Governança → Lista de Camareira | Todos os apartamentos com a situação (Livre, Ocupado, Bloqueado, Reservado) em 06/11 | Ainda não |
| `mapa_ocupacao_2026-11-06.csv` | Hospedagem → Resumo de Ocupação Diário | Retrato de 06/11: empresa, código da reserva, pago Sim/Parcial/Não | Ainda não |
| `faturamento_analitico_2026-10-26_2026-11-06.csv` | Gerencial → Relatório de Faturamento (Analítico) | Diária por reserva e por noite (competência), consumo por reserva e vendas de balcão | Ainda não |
| `consumo_por_data_2026-10-26_2026-11-06.csv` | Vendas → Relatório de Consumo (agrupado por Data) | 5 registros, R$ 36,00 (bate com o extrato) | Ainda não |
| `vendas_itens_por_data_2026-10-26_2026-11-06.csv` | Vendas → Relatório de Vendas Itens | Por dia e produto: quantidade, custo e preço (73 itens, custo R$ 161,98, venda R$ 330,50) | Ainda não |
| `contas_a_receber_venc_2026-10-26_2026-12-06.csv` | Financeiro → Relatório de Contas a Receber | 1 conta: R$ 215,00 vence 15/11 (empresa) | Ainda não |
| `estoque_atual_2026-11-06_transcrito.csv` | Estoque → Relatório Estoque Atual | 25 itens com saldo. **Transcrito da tela** (a sessão não compartilhava o disco). Saldos negativos: chocolate −30, sprite −1, hóspede adicional −76, lavanderia −2.247 | Ainda não |
| `cadastro_apartamentos_transcrito.csv` | Cadastros → Apartamentos (aba Pesquisa) | 31 apartamentos, todos categoria LUXO, bloco 1, andar T (101–113) ou 1 (114–131); 79 leitos (confere com o total do DataHotel). **Transcrito da tela** | Ainda não |
| `receitas_x_despesas_2026-10-26_2026-11-06.csv` | Financeiro → Receitas x Despesas, com *Sangrias e Suprimentos* | Receita por dia (total R$ 14.570,50 = Contas Recebidas) e despesas só de sangria (R$ 370,00) | Ainda não (serve de conferência) |

### O que isso respondeu das perguntas da Etapa 1

- **D2/P3:** a reserva tem código único (ex.: `ABC123456`); o recebimento tem número de lançamento em Contas Recebidas. No livro-caixa não há número.
- **P5:** o hotel **não lança contas a pagar no DataHotel** (Relatório de Contas a Pagar de 26/10 a 06/12 veio vazio). As únicas despesas lá são sangrias do caixa. As contas a pagar ficam no Hotel 360.
- **P4:** o consumo de frigobar **é** lançado na conta do hóspede no DataHotel (aparece como CONSUMO no extrato).
- **P11:** o café traz adultos e crianças separados na Lista de Café, mas não no Relatório de Reservas.
- **Exportação:** todos os relatórios exportam CSV, Excel e PDF pela pré-visualização.

### Cuidados ao exportar

- A janela Salvar às vezes ignora o nome digitado e usa o anterior, sobrescrevendo o arquivo. Sempre confira o nome no campo antes de clicar em Salvar.
- O campo de data é por partes (dia, mês, ano): clique no dia, digite, setinha para a direita, digite o mês.
- O relatório "Consumo agrupado por Apartamento" mostra o apartamento 112 como "12/04/1900" (defeito do DataHotel): não use.
- A exportação de relatórios longos leva minutos (uma página por vez). Não feche a pré-visualização até a barra "Exportando" sumir.

- **Se a janela Salvar não mostrar "C on <seu computador>"**, a sessão foi aberta sem compartilhar unidades. Feche o DataHotel e abra de novo pelo atalho Hotel (Recursos Locais → Mais... → Unidades marcado e salvo). Em 06/11 isso aconteceu depois de uma reconexão; o estoque (uma página) foi lido da tela.

### Cadastros do DataHotel (vistos em 06/11/2026, somente leitura)

- **Menu Cadastros:** Hóspedes, Empresas, Fornecedores, Categorias, Apartamentos, Caixas/Bancos, Formas de Pagamento, Plano de Contas, Eventos/Feriados, Pacotes, Tipos de Tarifa, Tarifário, Canais de Venda, Tipos de Contas, Grupos de Produtos, Produtos/Serviços, Locais de Estoque, Centro de Custo, Funcionários, Usuários, Parâmetros. **Hóspedes e Funcionários não foram abertos** (dados pessoais).
- **Empresas:** 121 cadastradas, com CNPJ, endereço, telefone, e-mail, limite de crédito, comissão e prazo de pagamento. Não transcritas: o sistema só precisa das que aparecem nas reservas. Para exportar a lista inteira, use Imprimir → Salvar → CSV com o compartilhamento de unidades ativo.
- **Tarifário:** por calendário e por número de adultos e crianças ("Cobrança por Adultos e Crianças"); a tabela do dia consultado estava vazia. Diárias observadas nas reservas: R$ 135,00 (1 hóspede) e R$ 215,00 (2).
- **Fornecedores, Plano de Contas e Centro de Custo existem no DataHotel**, mas as contas a pagar estão vazias; o hotel não os usa para despesas.
