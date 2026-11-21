/**
 * Lança no Hotel 360 os fornecedores e as contas a pagar enviados pela Direção
 * (planilha "Contas - Setembro 2026" e lista "Fornecedores"). Valores transcritos
 * exatamente como estão na planilha; o que não está nela fica "não informado".
 *
 *   node --import tsx servidor/importar-contas-hotel.ts [e-mail do autor]
 *
 * Pode rodar de novo: fornecedor ou conta que já existe é pulado.
 */
import { consultar, encerrar } from "./banco.js";
import { criarContaPagar, criarFornecedor, registrarPagamento } from "./repositorio.js";

const ORIGEM = "Planilha da Direção: Contas - Setembro 2026";

type Canal = "WhatsApp" | "E-mail" | "Portal" | "Site";
const FORNECEDORES: [string, Canal | null, string | null, string, string?][] = [
  // nome, canal, telefone, categoria, observação
  ["Água Canarana", "WhatsApp", "(65) 99972-8983", "Água, energia e gás"],
  ["Energisa", "Portal", null, "Água, energia e gás", "Fatura Online Energisa"],
  ["Bitz Softwares", "E-mail", "(46) 9107-1641", "Tecnologia"],
  ["CDL", "E-mail", "(66) 99685-0088", "Administrativo"],
  ["Café Viola", "WhatsApp", "(66) 99209-7378", "Alimentos e café da manhã"],
  ["Pão de Queijo", "WhatsApp", "(66) 99695-4656", "Alimentos e café da manhã"],
  ["Astemar", "WhatsApp", "(66) 99292-0482", "Outros"],
  ["Polpa Fiory", "WhatsApp", "(66) 99981-1930", "Alimentos e café da manhã"],
  ["Laticínios Fiorentin", "WhatsApp", "(66) 99691-8934", "Alimentos e café da manhã"],
  ["Granja do Vale", "WhatsApp", "(66) 99933-2192", "Alimentos e café da manhã"],
  ["Azat Internet", "WhatsApp", "(66) 99968-3668", "Internet e telefone"],
  ["Honorários", "WhatsApp", "(66) 8407-7899", "Contabilidade e honorários"],
  ["Gás", "WhatsApp", "(66) 99654-4037", "Água, energia e gás"],
  ["Enersim", "WhatsApp", "(66) 99685-0088", "Água, energia e gás"],
  ["ComaBem", "WhatsApp", "(66) 99616-7651", "Alimentos e café da manhã"],
  ["Queiroz", "Site", null, "Outros", "Portal"],
  ["Estrelão Gás", "WhatsApp", "(66) 9654-4037", "Água, energia e gás"],
  ["Disbek", "E-mail", null, "Outros", "Samuel envia"],
  ["Simples Nacional", "WhatsApp", "(66) 3468-1998", "Impostos"],
  ["FGTS", "WhatsApp", "(66) 3468-1998", "Impostos"],
  ["Crédito do Trabalhador", "WhatsApp", "(66) 3468-1998", "Folha e pessoal"],
  ["Receita Federal", "WhatsApp", "(66) 3468-1998", "Impostos"],
  ["Cartório", "WhatsApp", "(66) 8125-0154", "Administrativo"],
  // Aparecem nas contas de setembro, sem contato na lista.
  ["CanAR", null, null, "Manutenção"],
  ["Jardinagem Sempre Verde", null, null, "Manutenção"],
  ["SOS Chaveiro", null, null, "Manutenção"],
];

// CP, descrição, fornecedor, valor documento, valor pago, vencimento (null = "X"), documento, data do pagamento (null = em aberto)
const CONTAS: [string, string, string, number, number | null, string | null, string | null, string | null][] = [
  ["CP6.09.1", "CanAR I", "CanAR", 18000, 18000, null, "307", "2026-09-14"],
  ["CP6.09.2", "CanAR II", "CanAR", 18000, 18000, null, "321", "2026-09-14"],
  ["CP6.09.3", "Pão de Queijo I", "Pão de Queijo", 54000, 54000, null, "16655", "2026-09-14"],
  ["CP6.09.4", "Jardinagem Sempre Verde", "Jardinagem Sempre Verde", 15000, 15000, null, null, "2026-09-14"],
  ["CP6.09.5", "Estrelão Gás", "Estrelão Gás", 14000, 14000, null, "2092026", "2026-09-14"],
  ["CP6.09.6", "CDL", "CDL", 4200, 4289, "2026-09-10", "337429/001", "2026-09-14"],
  ["CP6.09.7", "ComaBem", "ComaBem", 427024, 427024, null, "821", "2026-09-14"],
  ["CP6.09.8", "Café Viola", "Café Viola", 35500, 36740, "2026-09-09", "1790951", "2026-09-14"],
  ["CP6.09.9", "Astemar", "Astemar", 13000, 13000, "2026-09-15", "1 CT-7560-3/6", "2026-09-14"],
  ["CP6.09.10", "Azat Internet", "Azat Internet", 29999, 29999, "2026-09-18", "1141605", "2026-09-18"],
  ["CP6.09.11", "Disbek", "Disbek", 177530, 184402, "2026-09-03", "438846", "2026-09-14"],
  ["CP6.09.12", "Enersim I", "Enersim", 123914, 126557, "2026-09-10", "8,35379E+12 (número cortado na planilha)", "2026-09-14"],
  ["CP6.09.13", "Enersim II", "Enersim", 254312, 259736, "2026-09-10", "2,91855E+12 (número cortado na planilha)", "2026-09-14"],
  ["CP6.09.14", "Bitz Softwares", "Bitz Softwares", 26000, 26000, "2026-09-15", "15769", "2026-09-14"],
  ["CP6.09.15", "Honorário", "Honorários", 81000, 81000, "2026-09-15", "01/jan", "2026-09-14"],
  // CP6.09.16 Energisa I: R$ 0,00 na planilha — não lançada (conta com valor zero).
  ["CP6.09.17", "Energisa II", "Energisa", 21590, 21590, "2026-09-03", "3785070-2026-08-4", "2026-09-14"],
  ["CP6.09.18", "SOS Chaveiro", "SOS Chaveiro", 9500, 9500, null, null, "2026-09-18"],
  ["CP6.09.19", "Água Canarana", "Água Canarana", 163250, 163250, "2026-09-22", "85194706", "2026-09-25"],
  ["CP6.09.20", "Café Viola II", "Café Viola", 35500, null, "2026-10-21", "1800971", null],
  ["CP6.09.21", "Polpas Fiory", "Polpa Fiory", 37500, 37500, null, "414", "2026-09-25"],
];

const TOTAL_PLANILHA = 1558819; // "TOTAL R$ 15.588,19" (soma do Valor Documento)
const soma = CONTAS.reduce((a, c) => a + c[3], 0);
if (soma !== TOTAL_PLANILHA) { console.error(`Soma ${soma} ≠ total da planilha ${TOTAL_PLANILHA}. Nada foi lançado.`); process.exit(1); }

const emailAutor = process.argv[2];
const usuarios = await consultar<{ id: string; nome: string }>(
  `SELECT id, nome FROM users WHERE ($1::text IS NULL OR email = $1) ORDER BY criado_em LIMIT 2`, [emailAutor ?? null]);
if (usuarios.length !== 1) { console.error("Informe o e-mail do autor (há mais de um usuário ou nenhum)."); process.exit(1); }
const ator = { userId: usuarios[0]!.id };
console.log(`Autor: ${usuarios[0]!.nome}`);

const ids = new Map<string, string>();
for (const f of await consultar<{ id: string; razao_social: string }>("SELECT id, razao_social FROM fornecedores")) ids.set(f.razao_social, f.id);
let novosF = 0;
for (const [nome, canal, tel, cat, obs] of FORNECEDORES) {
  if (ids.has(nome)) continue;
  const r = await criarFornecedor(ator, { razaoSocial: nome, categoria: cat, telefone: tel ?? undefined, canalCobranca: canal ?? undefined, contatoNome: obs });
  ids.set(nome, r.id); novosF++;
}
console.log(`Fornecedores: ${novosF} novos, ${FORNECEDORES.length - novosF} já existiam.`);

const ja = new Set((await consultar<{ obs: string }>("SELECT observacoes AS obs FROM contas_pagar WHERE observacoes LIKE $1", [`${ORIGEM}%`])).map((x) => x.obs.split(" · ")[1]));
let novasC = 0;
for (const [cp, desc, forn, doc, pago, venc, numero, dataPg] of CONTAS) {
  if (ja.has(cp)) continue;
  const juros = pago !== null ? pago - doc : 0;
  const { id } = await criarContaPagar(ator, {
    descricao: desc, fornecedorId: ids.get(forn), categoria: FORNECEDORES.find((f) => f[0] === forn)![3],
    valorCentavos: doc, competencia: "2026-09", vencimento: venc ?? dataPg ?? "2026-09-30",
    numeroDocumento: numero ?? undefined, status: dataPg ? "APROVADO" : "AGUARDANDO_APROVACAO",
    observacoes: `${ORIGEM} · ${cp}${venc ? "" : " · sem vencimento na planilha (usada a data do pagamento)"}`,
  });
  if (dataPg) await registrarPagamento(ator, id, {
    dataPagamento: dataPg, formaPagamento: "NAO_INFORMADO", valorPagoCentavos: pago!,
    observacoes: `Pago conforme a planilha${juros ? ` · juros R$ ${(juros / 100).toFixed(2).replace(".", ",")}` : ""}. Forma de pagamento não informada.`,
  });
  novasC++;
}
console.log(`Contas: ${novasC} novas, ${CONTAS.length - novasC} já existiam. Soma do documento confere com a planilha: R$ 15.588,19.`);
const r = await consultar<{ status: string; n: string; v: string }>("SELECT status, count(*) n, sum(valor_centavos) v FROM contas_pagar GROUP BY 1");
console.log(r.map((x) => `${x.status}: ${x.n} (R$ ${(Number(x.v) / 100).toFixed(2)})`).join(" | "));
await encerrar();
