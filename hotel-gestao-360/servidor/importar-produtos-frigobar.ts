/**
 * Cadastra os produtos do frigobar a partir do estoque e das vendas do DataHotel
 * (JSON montado do "Relatório de Estoque Atual" + "Vendas Itens").
 *   node --import tsx servidor/importar-produtos-frigobar.ts <produtos.json>
 * Produto já cadastrado (mesmo código) não é alterado: o preço ajustado no sistema vale.
 */
import { readFileSync } from "node:fs";
import { consultar, encerrar } from "./banco.js";
import { gravar } from "./hotel-dados.js";

const arquivo = process.argv[2];
if (!arquivo) { console.error("Uso: importar-produtos-frigobar.ts <produtos.json>"); process.exit(1); }
const lista = JSON.parse(readFileSync(arquivo, "utf8")) as { codigo: string; nome: string; nomeDataHotel: string; categoria: string; estoque: number; precoVenda: number; custo: number }[];
const autor = (await consultar<{ id: string }>("SELECT id FROM users ORDER BY criado_em LIMIT 1"))[0]!;
const ja = new Set((await consultar<{ id: string }>("SELECT id FROM hotel_registros WHERE colecao = 'frigobarProdutos'")).map((r) => r.id));
let novos = 0;
for (const p of lista) {
  const id = "fb-" + p.codigo;
  if (ja.has(id)) continue;
  // Preço médio do DataHotel arredondado para R$ 0,50 (a recepção cobra preço redondo).
  const preco = p.precoVenda ? Math.round(p.precoVenda / 50) * 50 : 0;
  await gravar({ userId: autor.id }, ["DIRECAO"], { colecao: "frigobarProdutos", id, dados: {
    codigo: p.codigo, nome: p.nome, nomeDataHotel: p.nomeDataHotel, categoria: p.categoria, estoque: p.estoque,
    precoVenda: preco, custo: p.custo, ativo: true, origem: "DataHotel (estoque e vendas de 26/10 a 20/11)",
    ...(preco ? {} : { observacoes: "Sem venda no período: confirme o preço." }) } });
  novos++;
}
console.log(`${novos} produto(s) cadastrado(s); ${lista.length - novos} já existiam.`);
await encerrar();
