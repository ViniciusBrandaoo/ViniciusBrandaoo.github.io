/**
 * Contas fixas e variáveis previstas, tiradas da planilha "Contas - Setembro 2026"
 * da Direção (valor e dia de vencimento de setembro), e pendências achadas
 * cruzando os arquivos que a Direção enviou. Nada aqui é pagamento: são
 * previsões, que a Direção ajusta na tela Contas Fixas e Calendário.
 *
 *   node --import tsx servidor/importar-recorrentes-hotel.ts [e-mail do autor]
 */
import { consultar, encerrar } from "./banco.js";
import { gravar } from "./hotel-dados.js";

const usuarios = await consultar<{ id: string }>(
  `SELECT id FROM users WHERE ($1::text IS NULL OR lower(email) = lower($1)) ORDER BY criado_em LIMIT 2`, [process.argv[2] ?? null]);
if (usuarios.length !== 1) { console.error("Informe o e-mail do autor."); process.exit(1); }
const ator = { userId: usuarios[0]!.id };
const g = (colecao: string, id: string, dados: Record<string, unknown>) => gravar(ator, ["DIRECAO", "RH"], { colecao, id, dados });
const forn = new Map((await consultar<{ id: string; razao_social: string }>("SELECT id, razao_social FROM fornecedores")).map((f) => [f.razao_social, f.id]));
const ORIGEM = "Valor e vencimento de setembro/2026 (planilha Contas - Setembro 2026 da Direção)";

// id, descrição, tipo, categoria, fornecedor, valor (centavos), dia, fim, observação
const RECORRENTES: [string, string, "FIXA" | "VARIAVEL", string, string, number, number, string, string][] = [
  ["rec-internet", "Internet (Azat)", "FIXA", "Internet e telefone", "Azat Internet", 29999, 18, "", "CP6.09.10"],
  ["rec-solar-1", "Placa solar – Enersim I", "FIXA", "Água, energia e gás", "Enersim", 123914, 10, "", "CP6.09.12 (pago com juros em setembro: venceu 10/09, pago 14/09)"],
  ["rec-solar-2", "Placa solar – Enersim II", "FIXA", "Água, energia e gás", "Enersim", 254312, 10, "", "CP6.09.13 (pago com juros em setembro: venceu 10/09, pago 14/09)"],
  ["rec-energia", "Energia (Energisa)", "VARIAVEL", "Água, energia e gás", "Energisa", 21590, 3, "", "CP6.09.17 · valor varia com o consumo"],
  ["rec-agua", "Água (Canarana)", "VARIAVEL", "Água, energia e gás", "Água Canarana", 163250, 22, "", "CP6.09.19 · valor varia com o consumo"],
  ["rec-contador", "Honorários contábeis", "FIXA", "Contabilidade e honorários", "Honorários", 81000, 15, "", "CP6.09.15"],
  ["rec-bitz", "Sistema (Bitz Softwares)", "FIXA", "Tecnologia", "Bitz Softwares", 26000, 15, "", "CP6.09.14"],
  ["rec-cdl", "CDL", "FIXA", "Administrativo", "CDL", 4200, 10, "", "CP6.09.6 (pago com juros em setembro)"],
  ["rec-astemar", "Astemar – parcelas", "FIXA", "Outros", "Astemar", 13000, 15, "2026-12-31", "CP6.09.9 · documento 1 CT-7560-3/6: parcela 3 de 6 em setembro, termina em dezembro"],
];
for (const [id, descricao, tipoConta, categoria, f, valor, dia, fim, obs] of RECORRENTES) {
  await g("contasRecorrentes", id, {
    descricao, tipoConta, categoria, fornecedorId: forn.get(f) ?? "", valorPrevisto: valor, periodicidade: "MENSAL",
    dia, inicio: "2026-10-01", fim, ativa: true, observacoes: `${ORIGEM} · ${obs}`,
  });
}
console.log(`Contas recorrentes: ${RECORRENTES.length}`);

// Pendências achadas cruzando os arquivos (não alteram nenhum valor).
const PEND: Record<string, Record<string, unknown>> = {
  "pend-salario-luismar": { data: "2026-11-13", apto: "Folha", tipo: "Salário diferente entre planilhas", hospede: "LUISMAR",
    descricao: "Na planilha 'Folha de Pagamento Outubro' o salário é R$ 2.000,00; no arquivo de dados da Direção (13/11) é R$ 2.600,00.",
    solucao: "Confirmar o salário correto e corrigir o arquivo que estiver errado.", responsavel: "Direção", prazo: "2026-11-20" },
  "pend-salario-samuel": { data: "2026-11-13", apto: "Folha", tipo: "Salário diferente entre planilhas", hospede: "SAMUEL",
    descricao: "Na planilha 'Folha de Pagamento Outubro' o salário é R$ 2.000,00; no arquivo de dados da Direção (13/11) é R$ 2.500,00. Os Pix de salário no BB foram R$ 2.488,22 (04/09), R$ 2.487,62 (06/10) e R$ 2.639,41 (11/11).",
    solucao: "Confirmar o salário correto e corrigir o arquivo que estiver errado.", responsavel: "Direção", prazo: "2026-11-20" },
  "pend-diolino-empresa": { data: "2026-11-01", apto: "109", tipo: "Faturado sem empresa", hospede: "Diolino Pereira dos Santos (reserva JCJ264262)",
    descricao: "R$ 375,00 lançados como 'Faturar empresa' em 01/11, mas a reserva não tem empresa cadastrada no DataHotel.",
    solucao: "Informar a empresa na reserva do DataHotel para o valor entrar no faturamento dela.", responsavel: "Recepção", prazo: "2026-11-16" },
  "pend-telefone": { data: "2026-11-13", apto: "Contas", tipo: "Conta fixa sem dado", hospede: "",
    descricao: "Telefone está na lista de contas fixas pedida, mas não há conta de telefone na planilha de setembro.",
    solucao: "Informar operadora, valor e dia de vencimento do telefone (se houver).", responsavel: "Direção", prazo: "2026-11-20" },
};
for (const [id, d] of Object.entries(PEND)) await g("pendencias", id, { ...d, status: "Aberta", decisao: "Pendente", observacoes: "", origem: "Conferência dos arquivos (Hotel 360)" });
console.log(`Pendências: ${Object.keys(PEND).length}`);
await encerrar();
