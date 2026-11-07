#!/usr/bin/env node
/**
 * Monta o protótipo a partir das partes em `partes/`.
 * O arquivo único é o artefato publicado; as partes é que se editam.
 *
 *   node prototipo/build.mjs
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const parte = (nome) => readFileSync(join(AQUI, "partes", nome), "utf8");

// `dados-reais.js` é gerado pelo importador a partir da planilha da escola e
// contém dado pessoal. Entra no build local quando existe; sem ele o sistema
// abre vazio, que é como um cliente novo o receberia.
//
//   node prototipo/build.mjs --sem-dados
//
// gera a versão limpa, que é a única que pode ser publicada ou hospedada em
// endereço aberto.
const semDados = process.argv.includes("--sem-dados");
// Liga `L.USA_BACKEND`: login e sessão passam a vir de `servidor/indice.ts`
// em vez de `localStorage`. É o build que `npm start` serve — nunca o que
// vira Artifact, que não tem servidor nenhum atrás.
const comBackend = process.argv.includes("--com-backend");
const temDadosReais =
  !semDados && existsSync(join(AQUI, "partes", "dados-reais.js"));

// A versão publicada abria vazia, e sistema de folha sem folha não demonstra
// nada. `dados-demo.js` traz um corpo docente fictício, com a mesma estrutura
// da planilha real — gerado por `node prototipo/gerar-demo.mjs`. Não entra
// com `--com-backend`: nesse build o funcionário vem da API, e um corpo
// docente fictício ficaria só ocupando espaço, sem nunca ser usado.
const temDadosDemo =
  semDados && !comBackend && existsSync(join(AQUI, "partes", "dados-demo.js"));

// Colaboradores (não-professores) vêm de planilhas à parte, gerado por
// `node src/importacao/xlsx-colaboradores.mjs` — mesma regra dos
// professores: dado pessoal, só entra fora da versão sem-dados.
const temDadosColaboradores =
  !semDados && existsSync(join(AQUI, "partes", "dados-colaboradores.js"));

// Logo depois de `dominio.js` (que cria `L` e o `L.USA_BACKEND = false` de
// base) e ANTES de `telas-c.js` — a tela de acesso lê essa chave assim que o
// script roda, na hora de montar os formulários; ligá-la depois não teria
// efeito nenhum, o IIFE de login já teria decidido o modo errado.
const LIGA_BACKEND = comBackend ? "L.USA_BACKEND = true;" : "";

// Cada item é nome de arquivo em `partes/`, MENOS `LIGA_BACKEND`: esse já
// vem como código pronto, não como arquivo para `parte()` ler.
const SCRIPTS = [
  "dominio.js",
  "hotel-dominio.js",
  ...(comBackend ? [LIGA_BACKEND] : []),
  ...(temDadosReais ? ["dados-reais.js"] : []),
  ...(temDadosColaboradores ? ["dados-colaboradores.js"] : []),
  ...(temDadosDemo ? ["dados-demo.js"] : []),
  "api.js",
  "interface.js",
  "telas-a.js",
  "telas-b.js",
  "telas-lotacao.js",
  "telas-c.js",
  "telas-hotel.js",
  "hotel-conferencia.js",
  "hotel-sync.js",
];

// Carregada como "preload" e só virando folha de estilo depois de baixada:
// um <link rel="stylesheet"> comum aqui seguraria a execução do script da
// aplicação inteira (átomo incluído) até a fonte do Google terminar de
// baixar. Com o texto renderizando na hora com a fonte do sistema
// (display=swap) e trocando depois, nada mais espera a fonte chegar.
const URL_FONTES = "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap";
const FONTES = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="${URL_FONTES}" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="${URL_FONTES}"></noscript>`;

// Mesmo átomo de três elipses do logo em `corpo.html` (`.lateral-logo`),
// só com traço mais grosso e o ponto central maior — um favicon de 16px
// precisa disso pra não desaparecer, o SVG do cabeçalho é pensado pra 22-30px.
// Cor fixa (não dá pra usar `currentColor`/variável de tema aqui): navy do
// traço, dourado no centro — a identidade do sistema é navy/dourado do
// início ao fim, não as cores do átomo físico da fachada (testado à parte,
// destoava do resto da marca).
const FAVICON_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><g fill='none' stroke='%230B2547' stroke-width='2.8'><ellipse cx='20' cy='20' rx='17' ry='7'/><ellipse cx='20' cy='20' rx='17' ry='7' transform='rotate(60 20 20)'/><ellipse cx='20' cy='20' rx='17' ry='7' transform='rotate(120 20 20)'/></g><circle cx='20' cy='20' r='4.6' fill='%23D8B24E'/></svg>`;
const FAVICON = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${FAVICON_SVG}">`;

const MIOLO = `<style>
${parte("estilo.css")}
${parte("clean.css")}
${parte("section-polish.css")}
${parte("minimal.css")}
${parte("hotel.css")}
</style>

${parte("corpo.html")}

<script>
(function () {
  "use strict";
${SCRIPTS.map((f) => (f === LIGA_BACKEND ? f : parte(f))).join("\n")}
})();
</script>
`;

// Duas saídas com o mesmo miolo.
//
// `hotel-gestao-360.html` é fragmento: o publicador de artefato injeta
// doctype, charset e viewport por conta própria, e repetir as tags ali
// duplicaria o <head>.
//
// `hotel-gestao-360.local.html` é documento completo. É o que abre direto
// no navegador e o que sobe para hospedagem — sem o `<meta viewport>` o
// celular renderiza numa janela virtual de 980px e o layout responsivo
// simplesmente não entra em ação.
const fragmento = `<title>Hotel Gestão 360</title>
${FAVICON}
${FONTES}

${MIOLO}`;

const completo = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="description" content="Camada de gestão executiva do Hotel: folha, banco de horas, financeiro e aprovações.">
<meta name="theme-color" content="#D9D0B9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#061527" media="(prefers-color-scheme: dark)">
${FAVICON}
<title>Hotel Gestão 360</title>
${FONTES}
</head>
<body>
${MIOLO}</body>
</html>
`;

function gravar(nome, conteudo) {
  const destino = join(AQUI, nome);
  writeFileSync(destino, conteudo, "utf8");
  const kb = (Buffer.byteLength(conteudo, "utf8") / 1024).toFixed(0);
  console.log(`  ${nome} (${kb} KB)`);
  return destino;
}

const sufixo = semDados ? "-demo" : "";
console.log("Protótipo montado:");
gravar(`hotel-gestao-360${sufixo}.html`, fragmento);
gravar(`hotel-gestao-360${sufixo}.local.html`, completo);

if (temDadosReais) {
  console.log("\n  ATENÇÃO: inclui dados-reais.js — nomes e salários reais embutidos.");
  if (temDadosColaboradores) console.log("  Inclui também dados-colaboradores.js — mesmo aviso vale para eles.");
  console.log("  Não publique nem hospede em endereço aberto.");
  console.log("  Para a versão limpa: node prototipo/build.mjs --sem-dados");
} else {
  console.log("\n  Sem dados pessoais: pode ser publicado e hospedado.");
  console.log(temDadosDemo
    ? "  Inclui corpo docente FICTÍCIO (dados-demo.js): a demonstração não abre vazia."
    : "  Abre vazio. Rode `node prototipo/gerar-demo.mjs` para ter dados de demonstração.");
}
