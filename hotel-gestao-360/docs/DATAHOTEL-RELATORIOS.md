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
