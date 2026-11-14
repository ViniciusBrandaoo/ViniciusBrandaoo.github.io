/**
 * Conferência automática dos relatórios exportados do DataHotel.
 *
 * Uso:
 *   npx tsx scripts/conferir-datahotel.mts [pasta] [AAAA-MM-DD início] [AAAA-MM-DD fim]
 *
 * Padrão: C:\Users\<você>\Downloads\datahotel, de 2026-10-26 a 2026-11-06.
 * Só lê. Gera `conferencia_<início>_<fim>.md` e `.csv` na própria pasta.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  lerApartamentosCamareiraDataHotel, lerContasRecebidasDataHotel, lerListaCafeDataHotel, lerMovimentoCaixaDataHotel, lerRelatorioReservasDataHotel,
} from "../src/dominio/hotel/importacao.js";
import {
  conferir, lerContasAReceber, lerCreditosDebitos, lerEstoque, lerFaturamentoAnalitico, lerFaturamentoDiario,
  lerMapaOcupacao, lerRds, lerReceitasDespesas, lerTotalGeral, recebimentosDeLinhas, reservasDeLinhas, resumo,
  type DadosConferencia, type Resultado,
} from "../src/dominio/hotel/conferencia.js";

const pasta = process.argv[2] ?? join(homedir(), "Downloads", "datahotel");
const inicio = process.argv[3] ?? "2026-10-26";
const fim = process.argv[4] ?? "2026-11-06";
const hoje = fim;
const br = (iso: string) => iso.split("-").reverse().join("-");

function texto(prefixo: string): string {
  const f = readdirSync(pasta).filter((n) => n.startsWith(prefixo) && n.endsWith(".csv") && !n.includes("transcrito")).sort().pop();
  if (!f) throw new Error(`Falta o arquivo "${prefixo}*.csv" em ${pasta}.`);
  const b = readFileSync(join(pasta, f));
  let t = b.toString("utf8");
  if (t.includes("\uFFFD")) t = b.toString("latin1");
  return t;
}
const opcional = (prefixo: string): string | null => { try { return texto(prefixo); } catch { return null; } };

if (!existsSync(pasta)) throw new Error(`Pasta não encontrada: ${pasta}`);

// O Relatório de Reservas agrupado por empresa é o mesmo relatório: vale o emitido por último.
const reservasR = lerRelatorioReservasDataHotel(texto("reservas_extrato"));
if (!reservasR) throw new Error("reservas_extrato não é um Relatório de Reservas do DataHotel.");
const futuras = opcional("reservas_futuras");
const futurasR = futuras ? lerRelatorioReservasDataHotel(futuras) : null;
const recebidasR = lerContasRecebidasDataHotel(texto("contas_recebidas"), inicio);
if (!recebidasR) throw new Error("contas_recebidas não é o Relatório de Contas Recebidas.");
const cafeR = lerListaCafeDataHotel(texto("cafe_manha"), inicio);
const camareiraR = lerApartamentosCamareiraDataHotel(texto("camareira_apartamentos"));
const analitico = lerFaturamentoAnalitico(texto("faturamento_analitico"));
const consumoPorData = lerTotalGeral(texto("consumo_por_data"));
const vendasItens = opcional("vendas_itens_por_data");
const rds = opcional("rds_relatorio_diario");
const mapa = opcional("mapa_ocupacao");
const estoque = opcional("estoque_atual");

const dados: DadosConferencia = {
  inicio, fim, hoje,
  reservas: reservasDeLinhas([...reservasR.linhas, ...(futurasR?.linhas ?? [])]),
  recebimentos: recebimentosDeLinhas(recebidasR.linhas),
  receitasDespesas: lerReceitasDespesas(texto("receitas_x_despesas")),
  faturamentoDiario: lerFaturamentoDiario(texto("faturamento_diario_resumo")),
  faturamentoAnalitico: analitico,
  creditosDebitos: lerCreditosDebitos(texto("creditos_debitos_por_forma")),
  contasAReceber: lerContasAReceber(texto("contas_a_receber")),
  consumoPorDataTotal: consumoPorData,
  vendasItensVenda: vendasItens ? lerTotalGeral(vendasItens) : null,
  rds: rds ? lerRds(rds) : null,
  mapa: mapa ? lerMapaOcupacao(mapa) : [],
  cafe: (cafeR?.linhas ?? []).map((l) => ({ dia: l.data!.split("/").reverse().join("-"), apto: l.apartamento!, adultos: Number(l.adultos), criancas: Number(l.criancas), tipo: l.tipo! })),
  apartamentos: (camareiraR?.linhas ?? []).map((l) => ({ numero: l.apartamento!, situacao: l.situacao! })),
  estoque: estoque ? lerEstoque(estoque) : [],
};
const caixa = opcional("movimentacao_caixa");
const caixaR = caixa ? lerMovimentoCaixaDataHotel(caixa, inicio) : null;
if (caixaR) dados.livroCaixa = recebimentosDeLinhas(caixaR.linhas).map((x) => ({ dia: x.dia, forma: x.forma, valor: x.valor }));
// "vendas itens" soma consumo + balcão em "Total Geral" só no valor de venda: pega o último R$ = venda
const resultados: Resultado[] = conferir(dados);
const r = resumo(resultados);

const brl = (c: number | undefined, un?: string) => c === undefined ? "" : un === "un" ? String(c) : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const marca = { OK: "OK", DIVERGENTE: "DIVERGENTE", ATENCAO: "ATENÇÃO" } as const;

let md = `# Conferência do fechamento — ${br(inicio)} a ${br(fim)}\n\n`;
md += `**${r.ok} regra(s) OK · ${r.divergentes} divergente(s) · ${r.atencao} com atenção**\n\n`;
md += `| Regra | O que foi conferido | Situação | Esperado | Encontrado | Diferença |\n|---|---|---|---:|---:|---:|\n`;
for (const x of resultados) md += `| ${x.regra} | ${x.titulo} | ${marca[x.situacao]} | ${brl(x.esperado, x.unidade)} | ${brl(x.encontrado, x.unidade)} | ${brl(x.diferenca, x.unidade)} |\n`;
md += `\n## Detalhes\n`;
for (const x of resultados) {
  md += `\n### ${x.regra} — ${x.titulo} (${marca[x.situacao]})\n*${x.entre}*\n\n`;
  for (const l of x.detalhes) md += `- ${l}\n`;
}
const csv = ["regra;titulo;situacao;esperado;encontrado;diferenca;entre", ...resultados.map((x) =>
  [x.regra, x.titulo, marca[x.situacao], (x.esperado ?? "") === "" ? "" : (x.esperado! / 100).toFixed(2), x.encontrado === undefined ? "" : (x.encontrado / 100).toFixed(2), x.diferenca === undefined ? "" : (x.diferenca / 100).toFixed(2), x.entre].join(";"))].join("\r\n");

writeFileSync(join(pasta, `conferencia_${inicio}_${fim}.md`), md, "utf8");
writeFileSync(join(pasta, `conferencia_${inicio}_${fim}.csv`), "\uFEFF" + csv, "utf8");
writeFileSync(join(pasta, `conferencia_${inicio}_${fim}.json`), JSON.stringify({ inicio, fim, resumo: r, resultados }, null, 1), "utf8");
console.log(md);
