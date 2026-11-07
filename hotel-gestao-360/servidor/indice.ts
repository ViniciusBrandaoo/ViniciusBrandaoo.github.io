#!/usr/bin/env node
/**
 * API do Hotel Gestão 360.
 *
 *   DATABASE_URL="postgresql://..." CPF_PEPPER="..." npm run servidor
 *
 * Roda em qualquer lugar que execute Node: Railway, Render, Fly, um VPS de
 * R$ 25/mês ou a máquina da secretaria. Nada aqui é específico de provedor.
 */

import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { randomBytes, createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { consultar, encerrar, pool, transacao } from "./banco.js";
import { UUID, ocultarValores } from "./salario-restrito.js";
import {
  abrirSessao, conferirSenha, criarHashSenha, encerrarSessao, lerSessao,
  type Sessao,
} from "./autenticacao.js";
import { calcularFolha } from "../src/dominio/folha/motor.js";
import { ehCompetenciaValida, normalizar } from "../src/dominio/comum/competencia.js";
import type { ParametrosFolha } from "../src/dominio/folha/parametros.js";
import {
  abrirSolicitacao, atualizarAcessoUsuario, atualizarContaPagar, atualizarContrato, atualizarFornecedor,
  atualizarFuncionario, atualizarFuncionarioComRevisao, atualizarMovimentoComRevisao, atualizarPrestadorComRevisao, registrarCriacaoParaAprovacao, desligarFuncionarioComRevisao, pedirExclusaoFuncionario, atualizarMovimento, baseRemuneracaoMensal, contratoVigente,
  contratosVigentesEmLote, garantirELerMovimentos, gravarCalculosEmLote, movimentoDeLinha, outrosVinculosDeLinha, criarAusencia, criarContaPagar, criarContrato,
  criarFornecedor, criarFuncionario, criarLancamentoBanco, criarUsuarioAcesso, decidirSolicitacao,
  delegarSolicitacao, desligarFuncionario, anteciparContratoVigente, excluirFuncionario,
  gravarDecimoTerceiro, gravarFerias, gravarRescisao,
  listarAusencias, listarContasPagar, listarContratos, listarFornecedores, listarLancamentosBanco,
  listarMovimentosCompetencia, listarConfiguracoes, gravarConfiguracao, listarSolicitacoes, listarUsuariosAcesso,
  parametrosDaCompetencia, PERFIS_VALIDOS, reabrirCompetencia, registrarPagamento,
  atualizarCnpjPrestador, atualizarPrestador, idsSalarioRestrito, definirSalarioRestrito, contratoPrestadorVigente, criarFuncionarioPrestador, converterParaPrestador, gravarPagamentoPrestador,
  redefinirSenhaAcesso,
  buscarArquivoDocumento, criarDocumento, listarDocumentos,
  type AusenciaEntrada, type ContaPagarEntrada, type ContratoEntrada, type FornecedorEntrada,
  type FuncionarioEntrada, type FuncionarioPrestadorEntrada, type LancamentoBancoEntrada,
  type MovimentoEntrada, type PagamentoEntrada, type PerfilAcesso, type SolicitacaoEntrada,
  type EntidadeDocumento,
  buscarRescisao,
  rescisaoTemDivergencia,
  vincularLotacaoComAprovacao,
} from "./repositorio.js";
import { diasFeriasPorFaltas } from "../src/dominio/folha/ferias.js";
import { diasAvisoPrevio, projetarData, type TipoRescisao } from "../src/dominio/folha/rescisao.js";
import { mesesTrabalhadosNoAno } from "../src/dominio/folha/decimo-terceiro.js";
import * as validar from "./validacao.js";
import * as lotacao from "./lotacao.js";
import * as hotel from "./hotel.js";
import * as hotelDados from "./hotel-dados.js";
import * as hotelConferencia from "./hotel-conferencia.js";
import { registrarPrimeiroAcesso } from "./primeiro-acesso.js";
import { perfisQuePodem, type AcaoHotel } from "../src/dominio/hotel/permissoes.js";
import { lerLotacionogramaDeBuffer } from "../src/importacao/lotacionograma.js";
import * as clipescola from "./conectores/clipescola.js";
import * as easyschool from "./conectores/easyschool.js";

declare module "fastify" {
  interface FastifyRequest {
    sessao: Sessao | null;
  }
}

const app = Fastify({
  logger: { level: process.env.LOG_NIVEL ?? "info" },
  // Atrás de proxy (Railway, Render, Cloudflare) o IP real vem no cabeçalho.
  trustProxy: true,
  bodyLimit: 1_048_576,
});

const PRODUCAO = process.env.NODE_ENV === "production";

// Rebaixado de 10 para 7 a pedido explícito da Direção (2026-09-16) — abaixo
// disso o custo do scrypt (~100ms) já não segura muito uma tentativa de
// força bruta, mas a decisão de quanto risco aceitar na própria conta é dela.
const TAMANHO_MINIMO_SENHA = 6;

await app.register(cookie, {
  secret: process.env.COOKIE_SECRET ?? randomBytes(32).toString("hex"),
});

// `global: false` — sem isso toda rota herdaria o limite; o custo do scrypt
// (~100ms) já atrasa força bruta, mas não impede um script lento e distribuído
// de testar milhares de senhas ao longo do tempo contra a folha da escola.
// Instância única no Railway: a store em memória (padrão do plugin) basta,
// sem precisar de Redis.
await app.register(rateLimit, {
  global: false,
  errorResponseBuilder: (_req, ctx) => Object.assign(
    new Error(`Muitas tentativas seguidas. Aguarde ${Math.max(1, Math.ceil(ctx.ttl / 1000))} segundos e tente de novo.`),
    { statusCode: 429 },
  ),
});

// Limite bem acima do bodyLimit global (1 MB, pensado para JSON) — Central
// de Documentos recebe PDF de contrato/certidão, que passa disso fácil.
await app.register(multipart, {
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});

// Cabeçalhos de segurança em toda resposta. A página não pode ser embutida
// em outro site (clickjacking), o navegador fica preso ao HTTPS e só carrega
// script/estilo daqui e fonte do Google Fonts.
app.addHook("onSend", async (_req, resp) => {
  resp.header("X-Content-Type-Options", "nosniff");
  resp.header("X-Frame-Options", "DENY");
  resp.header("Referrer-Policy", "same-origin");
  resp.header("Strict-Transport-Security", "max-age=31536000");
  resp.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; " +
      "img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
});

// ---------------------------------------------------------------- sessão

app.decorateRequest("sessao", null);

app.addHook("onRequest", async (req) => {
  req.sessao = await lerSessao(req.cookies.sessao);
});

// ---------------------------------------------------------------- tempo real
//
// Quando alguém grava algo, todos os navegadores abertos recarregam na hora.
// O aviso não leva dado nenhum (só "mudou"); quem recebe busca de novo pelas
// rotas normais, que já aplicam perfil e salário restrito.

const assinantesEventos = new Set<{ escrever: (texto: string) => void }>();

app.get("/api/eventos", async (req, resp) => {
  if (!req.sessao) return resp.code(401).send({ erro: "Não autenticado" });
  resp.hijack();
  const raw = resp.raw;
  raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff",
  });
  raw.write("retry: 2000\n\n");
  const assinante = { escrever: (texto: string) => { try { raw.write(texto); } catch { /* conexão já fechada */ } } };
  assinantesEventos.add(assinante);
  const batida = setInterval(() => assinante.escrever(": ping\n\n"), 15000);
  req.raw.on("close", () => { clearInterval(batida); assinantesEventos.delete(assinante); });
});

app.addHook("onResponse", async (req, resp) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
  if (!req.url.startsWith("/api/") || resp.statusCode >= 400 || req.url.startsWith("/api/acesso/")) return;
  const aba = String(req.headers["x-aba"] ?? "").slice(0, 64);
  const msg = `data: ${JSON.stringify({ aba, t: Date.now() })}\n\n`;
  for (const a of assinantesEventos) a.escrever(msg);
});

// ---------------------------------------------------------------- salário restrito
//
// Algumas pessoas têm o salário visível só para a Direção. Para os demais
// perfis: acesso direto a essa pessoa (URL com o id) é negado e, nas listas,
// todo valor em dinheiro dela vai vazio. É filtro do servidor, não da tela.

app.addHook("preHandler", async (req, resp) => {
  const s = req.sessao;
  if (!s || s.perfis.includes("DIRECAO") || !req.url.startsWith("/api/")) return;
  const achados = req.url.match(UUID);
  if (!achados) return;
  const restritos = new Set(await idsSalarioRestrito());
  if (restritos.size && achados.some((u) => restritos.has(u.toLowerCase()))) {
    return resp.code(403).send({ erro: "Os valores desta pessoa só a Direção enxerga." });
  }
});

app.addHook("onSend", async (req, resp, payload) => {
  const s = req.sessao;
  if (!s || s.perfis.includes("DIRECAO") || !req.url.startsWith("/api/") || typeof payload !== "string") return payload;
  if (!String(resp.getHeader("content-type") ?? "").includes("json")) return payload;
  const restritos = new Set(await idsSalarioRestrito());
  if (!restritos.size) return payload;
  try {
    return JSON.stringify(ocultarValores(JSON.parse(payload), restritos));
  } catch {
    return payload;
  }
});

/** Traduz o erro cru do banco para algo que o RH entenda. */
function mensagemDeRestricao(msg: string): string {
  if (/employees_matricula_key/.test(msg)) return "Já existe um funcionário com esta matrícula. Use outra.";
  if (/pessoas_cpf_hash_key/.test(msg)) return "Já existe um cadastro com este CPF.";
  if (/contratos_prestador.*cnpj|cnpj_hash/.test(msg)) return "Já existe um prestador com este CNPJ.";
  if (/employees_vinculo_sem_sobreposicao/.test(msg)) return "Esta pessoa (CPF) já tem cadastro ativo com o mesmo cargo. Edite o cadastro existente ou informe outro cargo.";
  if (/exclusion/.test(msg)) return "Este período conflita com outro já cadastrado para a mesma pessoa.";
  return msg;
}

/**
 * Traduz erro técnico (banco, regra interna) para uma frase que diz o que
 * aconteceu e o que fazer — quem usa não deve precisar de ajuda para ler.
 */
function humanizarErro(msg: string): string {
  if (/remuneracao_carga_exclusiva/.test(msg)) {
    return "Os campos de carga (aulas por semana, carga horária, horas) estão misturados de dois regimes. Confira o regime e deixe preenchidos só os campos dele.";
  }
  if (/vinculo_valor_coerente_com_bandeira/.test(msg)) {
    return "O valor de CLT, Ticket ou MEI não combina com o vínculo marcado. Marque \"Sim\" no vínculo que tem valor, ou zere o valor.";
  }
  if (/remuneracao_vigencia/.test(msg)) {
    return "A vigência do contrato é inválida: ela começa no dia 1 do mês e termina no último dia do mês.";
  }
  if (/remuneracao_(valor|regime)/.test(msg)) {
    return "Falta o valor do regime escolhido (salário, valor da hora-aula ou valor da hora). Preencha o valor do regime e tente de novo.";
  }
  if (/remuneracao_campos_do_regime/.test(msg)) {
    return "Falta o valor do regime escolhido (salário, valor da hora-aula e aulas por semana, ou valor da hora e horas por semana). Preencha e tente de novo.";
  }
  if (/date\/time field value out of range/.test(msg)) return "Há uma data que não existe no calendário. Confira as datas e tente de novo.";
  if (/desligamento_apos_admissao/.test(msg)) return "A data de desligamento não pode ser anterior à data de admissão.";
  const check = /violates check constraint "([^"]+)"/.exec(msg);
  if (check) return `Algum valor informado não é permitido. Confira os campos, principalmente valores negativos ou combinações que não fazem sentido.`;
  if (/^insert or update on table .* violates foreign key constraint/.test(msg)) {
    return "O funcionário, fornecedor ou outro registro escolhido não existe mais. Atualize a tela (F5) e escolha de novo.";
  }
  if (/violates foreign key constraint/.test(msg)) {
    return "Este cadastro já está ligado a outros dados (folha, férias, 13º ou rescisão) e não pode ser alterado ou excluído assim. Use \"Desligar\" para encerrar e manter o histórico.";
  }
  const nulo = /null value in column "([^"]+)"/.exec(msg);
  if (nulo) return `Falta preencher um campo obrigatório (${(nulo[1] ?? "").replace(/_/g, " ")}).`;
  if (/duplicate key value/.test(msg)) return "Já existe um cadastro igual a este (mesma matrícula, CPF ou CNPJ).";
  if (/invalid input syntax/.test(msg)) return "Algum campo está com formato inválido, como texto onde devia haver número ou uma data incorreta.";
  if (/Rescisão já homologada em/.test(msg)) return "Esta rescisão já foi homologada pela Direção e não pode mais ser recalculada. Peça a ela para tratar o caso.";
  if (/Pagamento já feito em/.test(msg)) return "Este pagamento de prestador já foi feito e não pode mais ser recalculado.";
  if (/Registro já pago em/.test(msg)) return "Este 13º ou estas férias já foram pagos e não podem mais ser recalculados.";
  if (/sustenta .* (folha|evento)/.test(msg)) {
    return "Este contrato já tem folha fechada, pagamento ou rescisão homologada e não pode ser alterado. Peça à Direção para reabrir a competência, se for necessário.";
  }
  // Travas de "já pago/homologado em <timestamp do banco>": mostra só a data.
  return msg.replace(/(\d{4})-(\d{2})-(\d{2}) \d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}(?::\d{2})?/g, "$3/$2/$1");
}

function exigirSessao(req: { sessao: Sessao | null }): Sessao {
  if (!req.sessao) {
    const erro = new Error("Não autenticado") as Error & { statusCode?: number };
    erro.statusCode = 401;
    throw erro;
  }
  return req.sessao;
}

function exigirPerfil(req: { sessao: Sessao | null }, ...permitidos: string[]): Sessao {
  const s = exigirSessao(req);
  if (!permitidos.some((p) => s.perfis.includes(p))) {
    const soDirecao = permitidos.length === 1 && permitidos[0] === "DIRECAO";
    const erro = new Error(
      soDirecao
        ? "Esta ação é da Direção (fechar ou reabrir folha, homologar, pagar, aprovar e gerenciar acessos). Peça a ela; o seu perfil não tem este botão."
        : "O seu perfil não tem permissão para esta ação. Se precisar dela, peça à Direção para ajustar o seu acesso.",
    ) as Error & { statusCode?: number };
    erro.statusCode = 403;
    throw erro;
  }
  return s;
}

const COOKIE = {
  httpOnly: true,          // JavaScript da página não lê o token
  sameSite: "lax" as const, // corta CSRF vindo de outro site
  secure: PRODUCAO,        // só por HTTPS em produção
  path: "/",
  maxAge: Number(process.env.SESSAO_HORAS ?? 12) * 3600,
};

// ---------------------------------------------------------------- interface
//
// Serve o HTML compilado SEM dados embutidos (`--sem-dados`) — a versão com
// nomes e salário real (`prototipo/partes/dados-reais.js`) nunca passa perto
// deste servidor. Com o backend de pé, quem entra vê a folha vinda da API,
// filtrada por perfil; o HTML em si não carrega segredo nenhum.
//
// Uma rota só, não `@fastify/static` numa pasta: o sistema é um arquivo
// único sem outros assets, e servir arquivo por arquivo evita qualquer
// travessia de diretório acidental expor `partes/dados-reais.js` se algum
// dia ele ficar ao lado do HTML por engano.
const AQUI = dirname(fileURLToPath(import.meta.url));
const HTML_INTERFACE = join(AQUI, "..", "prototipo", "hotel-gestao-360-demo.local.html");

// Lido uma vez e guardado; relê só se o arquivo mudar (build novo no mesmo
// processo, em desenvolvimento). Antes relia ~780 KB do disco a cada acesso.
// (A compressão gzip fica com a borda do Railway, que já comprime.)
let htmlEmCache: { mtimeMs: number; texto: string } | null = null;
function htmlDaInterface(): { texto: string } | null {
  if (!existsSync(HTML_INTERFACE)) return null;
  const mtimeMs = statSync(HTML_INTERFACE).mtimeMs;
  if (!htmlEmCache || htmlEmCache.mtimeMs !== mtimeMs) {
    const texto = readFileSync(HTML_INTERFACE, "utf8");
    htmlEmCache = { mtimeMs, texto };
  }
  return htmlEmCache;
}

app.get("/", async (req, resp) => {
  const html = htmlDaInterface();
  if (html === null) {
    return resp.code(503).send("Interface não compilada. Rode `npm run build:demo` antes de subir o servidor.");
  }
  // `return` do reply: sem ele o Fastify tentava responder de novo ("Reply was already sent").
  return resp.type("text/html; charset=utf-8").header("Cache-Control", "no-cache").send(html.texto);
});

// ---------------------------------------------------------------- saúde

app.get("/api/saude", async () => {
  const inicio = Date.now();
  await consultar("SELECT 1");
  return { ok: true, banco: `${Date.now() - inicio}ms` };
});

// ---------------------------------------------------------------- primeiro acesso (só com PRIMEIRO_ACESSO_TOKEN e sem usuários)

registrarPrimeiroAcesso(app);

// ---------------------------------------------------------------- acesso

app.post<{ Body: { email: string; senha: string } }>(
  "/api/acesso/entrar",
  {
    config: {
      // Só por IP: o hook do plugin roda em `onRequest`, antes do corpo ser
      // lido, então uma chave que tentasse combinar IP + e-mail do body
      // sempre veria `body` vazio ali — todo mundo cairia no mesmo balde
      // (e um login de verdade podia ser barrado por causa de tentativas
      // erradas de outra conta, do mesmo IP). Por IP já barra o que importa
      // hoje: um script testando muitas senhas rápido.
      rateLimit: { max: 5, timeWindow: "1 minute" },
    },
  },
  async (req, resp) => {
    const { email, senha } = req.body ?? ({} as { email: string; senha: string });
    if (!email || !senha) return resp.code(400).send({ erro: "Informe e-mail e senha." });

    const linhas = await consultar<{ id: string; senha_hash: string; ativo: boolean }>(
      "SELECT id, senha_hash, ativo FROM users WHERE email = $1",
      [email.trim()],
    );
    const u = linhas[0];

    // Confere a senha mesmo sem usuário: responder rápido quando o e-mail não
    // existe revelaria quais e-mails estão cadastrados.
    const referencia = u?.senha_hash ?? "scrypt$32768$8$1$AAAA$AAAA";
    const ok = await conferirSenha(senha, referencia);

    if (!u || !u.ativo || !ok) {
      return resp.code(401).send({ erro: "E-mail ou senha inválidos." });
    }

    const token = await abrirSessao(u.id, req.ip, req.headers["user-agent"]);
    return resp.setCookie("sessao", token, COOKIE).send({ ok: true });
  },
);

app.post("/api/acesso/sair", async (req, resp) => {
  await encerrarSessao(req.cookies.sessao);
  return resp.clearCookie("sessao", COOKIE).send({ ok: true });
});

app.get("/api/acesso/eu", async (req, resp) => {
  if (!req.sessao) return resp.code(401).send({ erro: "Não autenticado" });
  return req.sessao;
});

// ---------------------------------------------------------------- recados no painel
//
// Recado deixado para uma pessoa (tabela `notifications`): aparece no topo do
// painel dela até clicar em "Entendi". Cada um só vê e marca os próprios.

app.get("/api/recados", async (req) => {
  const s = exigirSessao(req);
  return consultar(
    `SELECT id, severidade, titulo, detalhe, criada_em AS "criadaEm"
       FROM notifications WHERE user_id = $1 AND lida_em IS NULL
      ORDER BY criada_em DESC LIMIT 10`,
    [s.userId],
  );
});

app.post<{ Body: { userId?: string; titulo?: string; detalhe?: string } }>("/api/recados", async (req, resp) => {
  exigirPerfil(req, "DIRECAO");
  const b = validar.corpoObjeto(req.body);
  const titulo = validar.texto(b.titulo, "o título", { max: 200 });
  const detalhe = validar.texto(b.detalhe, "o recado", { max: 4000 });
  if (!titulo || !titulo.trim()) return resp.code(400).send({ erro: "Informe o título do recado." });
  if (typeof b.userId !== "string" || !/^[0-9a-f-]{36}$/i.test(b.userId)) return resp.code(400).send({ erro: "Escolha para quem é o recado." });
  const r = await consultar<{ id: string }>(
    `INSERT INTO notifications (user_id, severidade, titulo, detalhe)
     SELECT id, 'ATENCAO', $2, $3 FROM users WHERE id = $1 RETURNING id`,
    [b.userId, titulo.trim(), detalhe?.trim() || null],
  );
  return r.length ? resp.code(201).send({ id: r[0]!.id }) : resp.code(404).send({ erro: "Conta não encontrada." });
});

app.post<{ Params: { id: string } }>("/api/recados/:id/lido", async (req, resp) => {
  const s = exigirSessao(req);
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return resp.code(404).send({ erro: "Recado não encontrado." });
  const r = await consultar<{ id: string }>(
    "UPDATE notifications SET lida_em = now() WHERE id = $1 AND user_id = $2 AND lida_em IS NULL RETURNING id",
    [req.params.id, s.userId],
  );
  return r.length ? resp.code(204).send() : resp.code(404).send({ erro: "Recado não encontrado." });
});

// ---------------------------------------------------------------- acesso (administração de contas)
//
// Só a Direção cria conta e decide perfil de quem mais entra no sistema —
// não existe autocadastro público (a tela de login nem mostra a opção
// quando `L.USA_BACKEND` está ligado). A primeira conta continua nascendo
// por `npm run semear`, na linha de comando; todas as demais entram por
// aqui, uma vez que já existe alguém da Direção logado para criá-las.

function validarPerfis(perfis: unknown): perfis is PerfilAcesso[] {
  return Array.isArray(perfis) && perfis.length > 0 &&
    perfis.every((p) => (PERFIS_VALIDOS as readonly string[]).includes(p as string));
}

app.get("/api/acesso/usuarios", async (req) => {
  exigirPerfil(req, "DIRECAO");
  return listarUsuariosAcesso();
});

app.post<{ Body: { nome?: string; email?: string; senha?: string; perfis?: unknown } }>(
  "/api/acesso/usuarios",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO");
    const corpoU = validar.corpoObjeto(req.body);
    validar.texto(corpoU.nome, "o nome", { max: 150 });
    validar.texto(corpoU.email, "o e-mail", { max: 200 });
    if (corpoU.senha !== undefined && corpoU.senha !== null && typeof corpoU.senha !== "string") {
      return resp.code(400).send({ erro: "A senha precisa ser um texto." });
    }
    const { nome, email, perfis } = req.body ?? {};
    if (!nome?.trim() || !email?.trim()) {
      return resp.code(400).send({ erro: "Informe nome e e-mail." });
    }
    if (!validarPerfis(perfis)) {
      return resp.code(400).send({ erro: "Informe ao menos um perfil válido." });
    }

    // Sem e-mail transacional neste sistema: a Direção define a senha na hora
    // ou deixa em branco e o servidor gera uma para repassar à pessoa por
    // fora (WhatsApp, presencial) — nunca uma senha previsível tipo "123456".
    let senha = req.body.senha;
    let senhaGerada: string | undefined;
    if (senha !== undefined && senha !== "") {
      if (senha.length < TAMANHO_MINIMO_SENHA) {
        return resp.code(400).send({ erro: `A senha precisa de pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.` });
      }
    } else {
      senha = randomBytes(9).toString("base64url"); // 12 caracteres, sempre acima do mínimo
      senhaGerada = senha;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return resp.code(400).send({ erro: "E-mail inválido. Use o formato nome@empresa.com." });
    }
    try {
      const criado = await criarUsuarioAcesso(
        { userId: s.userId },
        { nome: nome.trim(), email: email.trim(), senha, perfis },
      );
      return resp.code(201).send(senhaGerada ? { ...criado, senhaGerada } : criado);
    } catch (erro) {
      const msg = (erro as Error).message;
      if (/duplicate key|violates unique constraint/.test(msg)) {
        return resp.code(422).send({ erro: "Já existe uma conta com este e-mail." });
      }
      throw erro;
    }
  },
);

app.patch<{ Params: { id: string }; Body: { ativo?: boolean; perfis?: unknown; nome?: string; email?: string } }>(
  "/api/acesso/usuarios/:id",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO");
    const { id } = req.params;
    const { ativo, nome, email } = req.body ?? {};
    const perfisBrutos = req.body?.perfis;

    if (ativo === undefined && perfisBrutos === undefined && !nome && !email) {
      return resp.code(400).send({ erro: "Informe ativo, perfis, nome e/ou e-mail para alterar." });
    }
    if (perfisBrutos !== undefined && !validarPerfis(perfisBrutos)) {
      return resp.code(400).send({ erro: "Informe ao menos um perfil válido." });
    }
    const perfis = perfisBrutos as PerfilAcesso[] | undefined;

    // Ninguém desativa a própria conta nem tira o próprio DIRECAO — sem essa
    // trava, a Direção consegue se trancar para fora do próprio sistema, sem
    // ninguém mais com acesso para reverter.
    if (id === s.userId) {
      if (ativo === false) {
        return resp.code(422).send({ erro: "Você não pode desativar a própria conta." });
      }
      if (perfis && !perfis.includes("DIRECAO")) {
        return resp.code(422).send({ erro: "Você não pode remover Direção do seu próprio acesso." });
      }
    }

    let atualizado;
    try {
      atualizado = await atualizarAcessoUsuario({ userId: s.userId }, id, { ativo, perfis, nome, email });
    } catch (erro) {
      const msg = (erro as Error).message;
      if (/duplicate key|violates unique constraint/.test(msg)) {
        return resp.code(422).send({ erro: "Já existe uma conta com este e-mail." });
      }
      throw erro;
    }
    if (!atualizado) return resp.code(404).send({ erro: "Usuário não encontrado." });
    return atualizado;
  },
);

app.post<{ Params: { id: string }; Body: { senha?: string } }>(
  "/api/acesso/usuarios/:id/redefinir-senha",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO");
    let senha = req.body?.senha;
    let senhaGerada: string | undefined;
    if (senha !== undefined && senha !== "") {
      if (senha.length < TAMANHO_MINIMO_SENHA) {
        return resp.code(400).send({ erro: `A senha precisa de pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.` });
      }
    } else {
      senha = randomBytes(9).toString("base64url");
      senhaGerada = senha;
    }
    const atualizado = await redefinirSenhaAcesso({ userId: s.userId }, req.params.id, senha);
    if (!atualizado) return resp.code(404).send({ erro: "Usuário não encontrado." });
    return senhaGerada ? { ...atualizado, senhaGerada } : atualizado;
  },
);

// ---------------------------------------------------------------- documentos

app.get("/api/documentos", async (req) => {
  exigirSessao(req);
  return listarDocumentos();
});

app.get<{ Params: { id: string } }>("/api/documentos/:id/arquivo", async (req, resp) => {
  exigirSessao(req);
  const doc = await buscarArquivoDocumento(req.params.id);
  if (!doc) return resp.code(404).send({ erro: "Documento não encontrado." });
  resp.header("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.nomeArquivo)}"`);
  resp.type(doc.mimeType || "application/octet-stream");
  return doc.bytes;
});

// Multipart, não JSON: título/tipo/etc. chegam como campos de texto e o
// arquivo como parte binária, na mesma requisição — por isso a rota lê
// `req.parts()` em vez do `req.body` tipado do resto do arquivo.
app.post(
  "/api/documentos",
  { bodyLimit: 15 * 1024 * 1024 },
  async (req, resp) => {
    const s = exigirSessao(req);
    const campos: Record<string, string> = {};
    let arquivo: { nome: string; mime: string; buffer: Buffer } | null = null;

    for await (const parte of req.parts()) {
      if (parte.type === "file") {
        if (parte.fieldname === "arquivo" && !arquivo) {
          arquivo = { nome: parte.filename, mime: parte.mimetype, buffer: await parte.toBuffer() };
        } else {
          parte.file.resume();
        }
      } else {
        campos[parte.fieldname] = String(parte.value ?? "");
      }
    }

    if (!arquivo) return resp.code(400).send({ erro: "Envie um arquivo." });
    if (!campos.titulo?.trim() || !campos.tipo || !campos.entidade) {
      return resp.code(400).send({ erro: "Informe título, tipo e a que o documento se refere." });
    }
    const entidade = campos.entidade as EntidadeDocumento;
    const entidadeId = entidade === "escola" ? null : (campos.entidadeId || null);
    if (entidade !== "escola" && !entidadeId) {
      return resp.code(400).send({ erro: "Selecione o registro específico (funcionário, fornecedor ou contrato)." });
    }
    const tags = campos.tags ? campos.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];

    try {
      const criado = await criarDocumento({ userId: s.userId }, {
        titulo: campos.titulo.trim(),
        tipo: campos.tipo,
        entidade,
        entidadeId,
        dataVencimento: campos.dataVencimento || null,
        tags,
        nomeArquivo: arquivo.nome,
        mimeType: arquivo.mime,
        tamanhoBytes: arquivo.buffer.length,
        checksumSha256: createHash("sha256").update(arquivo.buffer).digest("hex"),
        arquivoBytes: arquivo.buffer,
      });
      return resp.code(201).send(criado);
    } catch (erro) {
      return resp.code(422).send({ erro: (erro as Error).message });
    }
  },
);

// ---------------------------------------------------------------- funcionários

// Quem pode ver salário — o resto da sessão (qualquer perfil válido) vê
// nome/cargo/vínculo, sem remuneração nenhuma. É a garantia pedida ficando
// no servidor: quem não tem perfil autorizado nunca recebe o campo, não é
// um filtro que a tela aplicaria depois de já ter o dado em mãos.
const PERFIS_VEEM_SALARIO = ["DIRECAO", "RH", "FINANCEIRO"];

app.get("/api/funcionarios", async (req) => {
  const sessao = exigirSessao(req);
  const veSalario = sessao.perfis.some((p) => PERFIS_VEEM_SALARIO.includes(p));

  // `DISTINCT ON` pega o contrato de vigência mais recente por funcionário —
  // simplificação honesta enquanto a folha ainda não lê o histórico de
  // reajustes por competência; suficiente para listar quem existe e o
  // regime de cada um.
  // `bigint` e `numeric` voltam do `pg` como STRING por padrão (evita perda
  // de precisão além de Number.MAX_SAFE_INTEGER) — inofensivo para saldo de
  // conta bancária, quebraria toda conta de folha aqui. Centavos de salário
  // cabem folgado num `int`; carga/aulas viram `float8` (raramente têm
  // fração, mas `numeric(6,2)` permite).
  const camposRemuneracao = veSalario
    ? `, coalesce(cr.regime, case when cp.id is not null then 'PRESTADOR_PJ' end) AS regime,
         cr.dependentes_irrf AS dependentes,
         cr.valor_hora_aula_centavos::int AS "valorHoraAula", cr.aulas_semanais::float8 AS "aulasSemanais",
         cr.salario_base_centavos::int AS "salarioBase", cr.carga_horaria_semanal::float8 AS "cargaHoraria",
         cr.valor_hora_centavos::int AS "valorHora", cr.horas_semanais::float8 AS "horasSemanais",
         cr.valor_clt_centavos::int AS "valorClt", coalesce(cr.valor_ticket_centavos, cp.valor_ticket_centavos)::int AS "valorTicket",
         cr.valor_mei_centavos::int AS "valorMei",
         cp.id AS "contratoPrestadorId", cp.enquadramento, cp.servico,
         cp.valor_mensal_centavos::int AS "valorMensal", (cp.cnpj_hash IS NOT NULL) AS "temCnpj",
         cp.descontos_fixos AS "descontosFixos"`
    // regime não é segredo — só o valor é; sem ele a lista nem sabe montar a coluna certa
    : `, coalesce(cr.regime, case when cp.id is not null then 'PRESTADOR_PJ' end) AS regime`;

  // Empresa pagadora e a bandeira CLT/Ticket/MEI não são valor de remuneração
  // (não dizem "quanto", só "quem paga" e "por qual canal") — mesmo nível de
  // sensibilidade de cargo/departamento, por isso ficam fora do gate de
  // `veSalario`: qualquer perfil autenticado usa os filtros de empresa/regime
  // de pagamento da tela de Funcionários. `L.empresaDe`/`L.vinculoDe` (front)
  // leem exatamente `empresaCodigo`/`temClt`/`temTicket`/`temMei`.
  const linhas = await consultar<Record<string, unknown>>(
    `SELECT e.id, e.matricula, e.status, e.tipo_contrato AS "tipoContrato",
            to_char(e.data_admissao, 'YYYY-MM-DD') AS admissao,
            to_char(e.data_desligamento, 'YYYY-MM-DD') AS "dataDesligamento",
            p.nome, c.nome AS cargo, d.nome AS departamento,
            emp.codigo AS "empresaCodigo",
            coalesce(cr.tem_clt, false) AS "temClt",
            coalesce(cr.tem_ticket, cp.tem_ticket, false) AS "temTicket",
            e.ticket_soma AS "ticketSoma",
            coalesce(cr.tem_mei, false) AS "temMei",
            -- A divisão por segmento (Infantil, Fundamental 1/2...) alimenta
            -- o filtro "por módulo" pra qualquer perfil — não diz "quanto".
            -- O valor-hora de cada segmento é que é remuneração de verdade,
            -- por isso só entra no json_build_object quando veSalario.
            coalesce((
              SELECT json_agg(json_build_object(
                'segmento', cs.segmento, 'aulas', cs.aulas::float8
                ${veSalario ? ", 'valorHora', cs.valor_hora_centavos::int" : ""}
              ) ORDER BY cs.segmento)
                FROM contrato_cargas_segmento cs WHERE cs.contrato_id = cr.id
            ), '[]') AS cargas
            ${camposRemuneracao}
       FROM employees e
       JOIN pessoas p ON p.id = e.pessoa_id
       LEFT JOIN cargos c ON c.id = e.cargo_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN LATERAL (
         SELECT * FROM contratos_remuneracao cr2
          WHERE cr2.employee_id = e.id AND e.tipo_contrato <> 'PJ'
          ORDER BY cr2.vigencia_inicio DESC LIMIT 1
       ) cr ON true
       -- funcionário PJ/MEI não tem contratos_remuneracao nenhum (migration
       -- 017) — sem este LEFT JOIN ele nem apareceria na lista.
       LEFT JOIN contratos_prestador cp ON cp.employee_id = e.id AND cp.data_fim IS NULL
       LEFT JOIN empresas emp ON emp.id = coalesce(cr.empresa_id, cp.empresa_id)
      WHERE e.status <> 'DESLIGADO'
      ORDER BY p.nome`,
  );

  // Categoria é o que a tela usa pra separar aba Professores/Colaboradores
  // — deduzida do regime, mesma regra de `L.categoriaDe` no front.
  return linhas.map((l) => ({ ...l, categoria: l.regime === "HORISTA_AULA" ? "PROFESSOR" : "COLABORADOR" }));
});

// A lista acima esconde quem foi desligado; a tela de rescisão precisa
// justamente dessas pessoas para escolher de quem calcular.
app.post<{ Body: { cpf?: string; restrito?: boolean } }>("/api/funcionarios/restringir-salario", async (req, resp) => {
  const s = exigirPerfil(req, "DIRECAO");
  if (!req.body?.cpf || typeof req.body.restrito !== "boolean") return resp.code(400).send({ erro: "Informe o CPF e se é restrito." });
  try {
    const n = await definirSalarioRestrito({ userId: s.userId }, req.body.cpf, req.body.restrito);
    return { atualizados: n };
  } catch (erro) {
    const status = (erro as { statusCode?: number }).statusCode;
    if (status) return resp.code(status).send({ erro: (erro as Error).message });
    throw erro;
  }
});

app.get("/api/funcionarios/desligados", async (req) => {
  exigirPerfil(req, "DIRECAO", "RH", "FINANCEIRO");
  return consultar(
    `SELECT e.id, e.matricula, p.nome,
            to_char(e.data_desligamento, 'YYYY-MM-DD') AS "dataDesligamento"
       FROM employees e
       JOIN pessoas p ON p.id = e.pessoa_id
      WHERE e.status = 'DESLIGADO'
      ORDER BY e.data_desligamento DESC NULLS LAST, p.nome`,
  );
});

// ---------------------------------------------------------------- tabelas legais
//
// A tela "Tabelas Legais" rodava inteira em cima de `L.estado.tabelas`, que
// só existe como dado de demonstração empacotado no build — nunca foi ligada
// ao banco real. Resultado prático: o card "conferida" que o RH vê não tem
// nenhuma relação com `conferida_por_rh` no banco (o que o motor de cálculo
// realmente lê), e confirmar uma tabela ali não gravava nada. INSS e IRRF
// só pareciam certos porque o seed de demonstração e a migração real
// carregam os mesmos valores por coincidência de origem — CCT nunca teve
// esse seed "conferida: true", e como toda folha depende da CCT vigente
// estar conferida (`calcularFolha`, guarda de parâmetro), isso trava o
// fechamento de QUALQUER competência até alguém confirmar de verdade.

app.get("/api/tabelas", async (req) => {
  exigirSessao(req);
  const [inss, irrf, ccts, salarioMinimo] = await Promise.all([
    consultar(
      `SELECT i.id, 'INSS' AS tipo, i.descricao, to_char(i.vigencia_inicio,'YYYY-MM-DD') AS inicio,
              to_char(i.vigencia_fim,'YYYY-MM-DD') AS fim, i.teto_centavos::bigint AS teto,
              i.fonte, i.conferida_por_rh AS conferida, u.nome AS "conferidaPor",
              i.conferida_em AS "conferidaEm",
              coalesce((SELECT json_agg(json_build_object('ordem', f.ordem, 'ate', f.ate_centavos::bigint, 'aliquota', f.aliquota) ORDER BY f.ordem)
                          FROM folha_tabela_inss_faixa f WHERE f.tabela_id = i.id), '[]') AS faixas
         FROM folha_tabela_inss i LEFT JOIN users u ON u.id = i.conferida_por
        ORDER BY i.vigencia_inicio DESC`,
    ),
    consultar(
      `SELECT r.id, 'IRRF' AS tipo, r.descricao, to_char(r.vigencia_inicio,'YYYY-MM-DD') AS inicio,
              to_char(r.vigencia_fim,'YYYY-MM-DD') AS fim,
              r.deducao_dependente_centavos::bigint AS "porDependente",
              r.desconto_simplificado_centavos::bigint AS simplificado,
              r.fonte, r.conferida_por_rh AS conferida, u.nome AS "conferidaPor",
              r.conferida_em AS "conferidaEm",
              r.isencao_total_ate_centavos::bigint AS "isencaoTotalAte",
              r.reducao_ate_centavos::bigint AS "reducaoAte",
              r.reducao_base_centavos::bigint AS "reducaoBase",
              r.reducao_fator::float8 AS "reducaoFator",
              coalesce((SELECT json_agg(json_build_object('ordem', f.ordem, 'ate', f.ate_centavos::bigint, 'aliquota', f.aliquota, 'parcelaDeduzir', f.parcela_deduzir_centavos::bigint) ORDER BY f.ordem)
                          FROM folha_tabela_irrf_faixa f WHERE f.tabela_id = r.id), '[]') AS faixas
         FROM folha_tabela_irrf r LEFT JOIN users u ON u.id = r.conferida_por
        ORDER BY r.vigencia_inicio DESC`,
    ),
    consultar(
      `SELECT c.id, c.nome, c.categoria, to_char(c.vigencia_inicio,'YYYY-MM-DD') AS inicio,
              to_char(c.vigencia_fim,'YYYY-MM-DD') AS fim,
              c.conferida_por_rh AS conferida, u.nome AS "conferidaPor", c.conferida_em AS "conferidaEm"
         FROM folha_cct c LEFT JOIN users u ON u.id = c.conferida_por
        ORDER BY c.categoria, c.vigencia_inicio DESC`,
    ),
    consultar(
      `SELECT m.id, to_char(m.vigencia_inicio,'YYYY-MM-DD') AS inicio,
              to_char(m.vigencia_fim,'YYYY-MM-DD') AS fim, m.valor_centavos::bigint AS valor,
              m.fonte, m.conferido_por_rh AS conferida, u.nome AS "conferidaPor",
              m.conferido_em AS "conferidaEm"
         FROM folha_salario_minimo m LEFT JOIN users u ON u.id = m.conferido_por
        ORDER BY m.vigencia_inicio DESC`,
    ),
  ]);
  return { inss, irrf, ccts, salarioMinimo };
});

const TABELA_CONFIG: Record<string, { tabela: string; colConferida: string; colPor: string; colEm: string }> = {
  inss: { tabela: "folha_tabela_inss", colConferida: "conferida_por_rh", colPor: "conferida_por", colEm: "conferida_em" },
  irrf: { tabela: "folha_tabela_irrf", colConferida: "conferida_por_rh", colPor: "conferida_por", colEm: "conferida_em" },
  cct: { tabela: "folha_cct", colConferida: "conferida_por_rh", colPor: "conferida_por", colEm: "conferida_em" },
  "salario-minimo": { tabela: "folha_salario_minimo", colConferida: "conferido_por_rh", colPor: "conferido_por", colEm: "conferido_em" },
};

/**
 * Confirmar aqui é assinar que os números batem contra o ato oficial —
 * por isso não existe "desconfirmar": é sempre um usuário identificado
 * (`colPor`) numa data (`colEm`), a trilha que a Direção cobra depois.
 */
app.post<{ Params: { tipo: string; id: string } }>(
  "/api/tabelas/:tipo/:id/conferir",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO");
    const config = TABELA_CONFIG[req.params.tipo];
    if (!config) return resp.code(400).send({ erro: "Tipo de tabela inválido." });
    try {
      const r = await consultar(
        `UPDATE ${config.tabela} SET ${config.colConferida} = true, ${config.colPor} = $2, ${config.colEm} = now()
          WHERE id = $1 RETURNING id`,
        [req.params.id, s.userId],
      );
      if (!r.length) return resp.code(404).send({ erro: "Tabela não encontrada." });
      return { ok: true };
    } catch (erro) {
      const msg = (erro as Error).message;
      if (/violates check|Não é possível conferir/.test(msg)) {
        return resp.code(422).send({ erro: msg.replace(/^.*ERROR:\s*/, "") });
      }
      throw erro;
    }
  },
);

// ---------------------------------------------------------------- cadastro de tabelas
//
// Tabela nova entra sempre como "aguardando conferência": só vale para
// fechar a folha depois que alguém confirma contra o ato oficial (rota
// /conferir acima). Vigência em AAAA-MM; o fim vira o último dia do mês.

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

function vigenciaDe(b: { inicio?: string; fim?: string }): { inicio: string; fim: string | null } {
  if (!b.inicio || !MES.test(b.inicio)) {
    throw Object.assign(new Error("Vigência inicial no formato AAAA-MM, ex.: 2027-01."), { statusCode: 400 });
  }
  if (b.fim && !MES.test(b.fim)) {
    throw Object.assign(new Error("Vigência final no formato AAAA-MM."), { statusCode: 400 });
  }
  if (b.fim && b.fim < b.inicio) {
    throw Object.assign(new Error("A vigência final não pode ser antes da inicial."), { statusCode: 400 });
  }
  let fim: string | null = null;
  if (b.fim) {
    const [a, m] = b.fim.split("-").map(Number);
    fim = new Date(Date.UTC(a!, m!, 0)).toISOString().slice(0, 10);
  }
  return { inicio: `${b.inicio}-01`, fim };
}

function inteiroPositivo(v: unknown, rotulo: string, podeZero = false): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || (!podeZero && n === 0)) {
    throw Object.assign(new Error(`${rotulo}: valor inválido.`), { statusCode: 400 });
  }
  return n;
}

async function comTratamento<T>(resp: { code: (n: number) => { send: (b: unknown) => unknown } }, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (erro) {
    const e = erro as { statusCode?: number; message: string; code?: string };
    if (e.statusCode) return resp.code(e.statusCode).send({ erro: e.message });
    if (e.code === "23P01") {
      return resp.code(409).send({
        erro: "Já existe uma tabela desse tipo cobrindo parte desse período. Comece no mês seguinte ao fim da vigente.",
      });
    }
    if (e.code === "23514") return resp.code(400).send({ erro: "Algum valor está fora do permitido. Confira os campos." });
    throw erro;
  }
}

type FaixaEntrada = { ate?: number | null; aliquota?: number; parcelaDeduzir?: number };

function faixasValidas(faixas: unknown, tipo: "INSS" | "IRRF"): FaixaEntrada[] {
  if (!Array.isArray(faixas) || faixas.length === 0) {
    throw Object.assign(new Error("Informe pelo menos uma faixa."), { statusCode: 400 });
  }
  let anterior = 0;
  faixas.forEach((f: FaixaEntrada, i) => {
    const ultima = i === faixas.length - 1;
    const semTeto = f.ate === null || f.ate === undefined;
    if (semTeto && !(tipo === "IRRF" && ultima)) {
      throw Object.assign(new Error(`Faixa ${i + 1}: informe o limite ("até").`), { statusCode: 400 });
    }
    if (!semTeto && (Number(f.ate) <= anterior)) {
      throw Object.assign(new Error(`Faixa ${i + 1}: o limite precisa ser maior que o da faixa anterior.`), { statusCode: 400 });
    }
    const a = Number(f.aliquota);
    if (!Number.isFinite(a) || a < 0 || a > 100) {
      throw Object.assign(new Error(`Faixa ${i + 1}: alíquota entre 0 e 100.`), { statusCode: 400 });
    }
    if (!semTeto) anterior = Number(f.ate);
  });
  return faixas as FaixaEntrada[];
}

app.post<{ Body: { inicio?: string; fim?: string; fonte?: string; teto?: number; faixas?: FaixaEntrada[] } }>(
  "/api/tabelas/inss",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO");
    return comTratamento(resp, async () => {
      const b = req.body ?? {};
      const v = vigenciaDe(b);
      if (!b.fonte?.trim()) throw Object.assign(new Error("Informe a fonte (portaria ou ato)."), { statusCode: 400 });
      const teto = inteiroPositivo(b.teto, "Teto");
      const faixas = faixasValidas(b.faixas, "INSS");
      return transacao({ userId: s.userId }, async (c) => {
        const r = await c.query(
          `INSERT INTO folha_tabela_inss (descricao, vigencia_inicio, vigencia_fim, teto_centavos, fonte)
           VALUES ($1, $2::date, $3::date, $4, $5) RETURNING id`,
          [`INSS ${b.inicio!.slice(0, 4)}`, v.inicio, v.fim, teto, b.fonte!.trim()],
        );
        const id = r.rows[0].id;
        for (const [i, f] of faixas.entries()) {
          await c.query(
            `INSERT INTO folha_tabela_inss_faixa (tabela_id, ordem, ate_centavos, aliquota) VALUES ($1, $2, $3, $4)`,
            [id, i + 1, Number(f.ate), Number(f.aliquota)],
          );
        }
        return { id };
      });
    });
  },
);

app.post<{ Body: {
  inicio?: string; fim?: string; fonte?: string; porDependente?: number; simplificado?: number;
  faixas?: FaixaEntrada[]; isencaoTotalAte?: number | null; reducaoAte?: number | null;
  reducaoBase?: number | null; reducaoFator?: number | null;
} }>(
  "/api/tabelas/irrf",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO");
    return comTratamento(resp, async () => {
      const b = req.body ?? {};
      const v = vigenciaDe(b);
      if (!b.fonte?.trim()) throw Object.assign(new Error("Informe a fonte (lei ou ato)."), { statusCode: 400 });
      const porDependente = inteiroPositivo(b.porDependente ?? 0, "Dedução por dependente", true);
      const simplificado = inteiroPositivo(b.simplificado ?? 0, "Desconto simplificado", true);
      const faixas = faixasValidas(b.faixas, "IRRF");
      const redutor = [b.isencaoTotalAte, b.reducaoAte, b.reducaoBase, b.reducaoFator];
      const temRedutor = redutor.every((x) => x !== null && x !== undefined);
      return transacao({ userId: s.userId }, async (c) => {
        const r = await c.query(
          `INSERT INTO folha_tabela_irrf (descricao, vigencia_inicio, vigencia_fim, deducao_dependente_centavos,
             desconto_simplificado_centavos, fonte, isencao_total_ate_centavos, reducao_ate_centavos,
             reducao_base_centavos, reducao_fator)
           VALUES ($1, $2::date, $3::date, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id`,
          [`IRRF ${b.inicio!.slice(0, 4)}`, v.inicio, v.fim, porDependente, simplificado, b.fonte!.trim(),
            ...(temRedutor ? redutor : [null, null, null, null])],
        );
        const id = r.rows[0].id;
        for (const [i, f] of faixas.entries()) {
          await c.query(
            `INSERT INTO folha_tabela_irrf_faixa (tabela_id, ordem, ate_centavos, aliquota, parcela_deduzir_centavos)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, i + 1, f.ate === null || f.ate === undefined ? null : Number(f.ate), Number(f.aliquota),
              Number(f.parcelaDeduzir ?? 0)],
          );
        }
        return { id };
      });
    });
  },
);

app.post<{ Body: { inicio?: string; fim?: string; fonte?: string; valor?: number } }>(
  "/api/tabelas/salario-minimo",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO");
    return comTratamento(resp, async () => {
      const b = req.body ?? {};
      const v = vigenciaDe(b);
      if (!b.fonte?.trim()) throw Object.assign(new Error("Informe a fonte (decreto ou portaria)."), { statusCode: 400 });
      const valor = inteiroPositivo(b.valor, "Valor do salário mínimo");
      return transacao({ userId: s.userId }, async (c) => {
        const r = await c.query(
          `INSERT INTO folha_salario_minimo (vigencia_inicio, vigencia_fim, valor_centavos, fonte)
           VALUES ($1::date, $2::date, $3, $4) RETURNING id`,
          [v.inicio, v.fim, valor, b.fonte!.trim()],
        );
        return { id: r.rows[0].id };
      });
    });
  },
);

// Renovar a convenção: copia todos os parâmetros da CCT escolhida para a
// nova vigência. Se a convenção nova mudou algum percentual, a mudança é
// feita no banco antes de conferir; na maioria dos anos só a data muda.
app.post<{ Params: { id: string }; Body: { inicio?: string; fim?: string; nome?: string } }>(
  "/api/tabelas/cct/:id/renovar",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO");
    return comTratamento(resp, async () => {
      const b = req.body ?? {};
      const v = vigenciaDe(b);
      return transacao({ userId: s.userId }, async (c) => {
        const cols = await c.query(
          `SELECT column_name FROM information_schema.columns
            WHERE table_name = 'folha_cct' AND column_name NOT IN
              ('id','nome','vigencia_inicio','vigencia_fim','conferida_por_rh','conferida_por','conferida_em','criada_em')`,
        );
        const lista = cols.rows.map((r: { column_name: string }) => r.column_name).join(", ");
        const r = await c.query(
          `INSERT INTO folha_cct (nome, vigencia_inicio, vigencia_fim, ${lista})
           SELECT coalesce(nullif($2, ''), regexp_replace(nome, '\\s*\\d{4}.*$', '') || ' ' || to_char($3::date, 'YYYY')),
                  $3::date, $4::date, ${lista}
             FROM folha_cct WHERE id = $1
           RETURNING id`,
          [req.params.id, b.nome ?? "", v.inicio, v.fim],
        );
        if (!r.rowCount) throw Object.assign(new Error("Convenção não encontrada."), { statusCode: 404 });
        return { id: r.rows[0].id };
      });
    });
  },
);

// ---------------------------------------------------------------- competências

// ---------------------------------------------------------------- configurações

const CONFIGURACOES_PERMITIDAS = ["impostosPelaContabilidade", "ocultarDsr"];

app.get("/api/configuracoes", async (req) => {
  exigirSessao(req);
  return listarConfiguracoes();
});

app.put<{ Params: { chave: string }; Body: { valor?: unknown } }>(
  "/api/configuracoes/:chave",
  async (req, resp) => {
    // As chaves mudam o que a folha calcula e mostra: só a Direção liga ou desliga.
    const s = exigirPerfil(req, "DIRECAO");
    if (!CONFIGURACOES_PERMITIDAS.includes(req.params.chave)) {
      return resp.code(404).send({ erro: "Configuração desconhecida." });
    }
    if (typeof req.body?.valor !== "boolean") return resp.code(400).send({ erro: "Informe ativo ou inativo." });
    await gravarConfiguracao({ userId: s.userId }, req.params.chave, req.body.valor);
    return resp.code(204).send();
  },
);

app.get("/api/competencias", async (req) => {
  exigirSessao(req);
  return consultar(
    `SELECT p.id, p.competencia, p.tipo_folha, p.status, p.aberto_em, p.fechado_em,
            u.nome AS fechado_por_nome
       FROM folha_periodos p LEFT JOIN users u ON u.id = p.fechado_por
      ORDER BY p.competencia DESC, p.tipo_folha`,
  );
});

app.post<{ Body: { competencia: string; tipoFolha?: string } }>(
  "/api/competencias",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO", "RH", "FINANCEIRO");
    const competencia = normalizar(String(req.body?.competencia ?? ""));
    if (!ehCompetenciaValida(competencia)) {
      return resp.code(400).send({ erro: "Informe a competência no formato AAAA-MM (por exemplo, 2026-10)." });
    }
    const tipoFolha = req.body?.tipoFolha ?? "MENSAL";

    return transacao({ userId: s.userId }, async (c) => {
      const legais = await c.query(
        `SELECT
           (SELECT id FROM folha_tabela_inss
             WHERE daterange(vigencia_inicio, vigencia_fim, '[]') @> ($1 || '-01')::date
             LIMIT 1) AS inss,
           (SELECT id FROM folha_tabela_irrf
             WHERE daterange(vigencia_inicio, vigencia_fim, '[]') @> ($1 || '-01')::date
             LIMIT 1) AS irrf,
           (SELECT id FROM folha_salario_minimo
             WHERE daterange(vigencia_inicio, vigencia_fim, '[]') @> ($1 || '-01')::date
             LIMIT 1) AS minimo`,
        [competencia],
      );
      const { inss, irrf, minimo } = legais.rows[0];
      if (!inss || !irrf || !minimo) {
        return resp.code(422).send({
          erro: "Faltam tabelas legais vigentes para esta competência.",
          faltando: { inss: !inss, irrf: !irrf, salarioMinimo: !minimo },
        });
      }

      const criado = await c.query(
        `INSERT INTO folha_periodos
           (competencia, tipo_folha, tabela_inss_id, tabela_irrf_id, salario_minimo_id, aberto_por)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (competencia, tipo_folha) DO NOTHING
         RETURNING id, competencia, tipo_folha, status`,
        [competencia, tipoFolha, inss, irrf, minimo, s.userId],
      );
      if (criado.rowCount === 0) {
        return resp.code(409).send({ erro: "Competência já aberta." });
      }
      const periodo = criado.rows[0];

      // Copia do mês anterior só o que se repete todo mês: carga extra
      // semanal (e a hora-aula dela), aulas e horas noturnas, vale-transporte
      // e pensão. O que é pontual (faltas, aulas avulsas, substituições,
      // horas extras, banco de horas, aulas efetivas) começa zerado, senão uma
      // falta de um mês reaparecia no seguinte sem ninguém lançar.
      let movimentosCopiados = 0;
      if (tipoFolha === "MENSAL") {
        const copiados = await c.query(
          `INSERT INTO folha_movimentos (
             periodo_id, employee_id, aulas_extras_semanais, valor_hora_extra_centavos,
             aulas_noturnas, horas_noturnas, vale_transporte_centavos, pensao_modo,
             pensao_quantidade, remuneracao_outros_vinculos_centavos,
             inss_outros_vinculos_centavos, origem
           )
           SELECT $2, m.employee_id, m.aulas_extras_semanais, m.valor_hora_extra_centavos,
             m.aulas_noturnas, m.horas_noturnas, m.vale_transporte_centavos, m.pensao_modo,
             m.pensao_quantidade, m.remuneracao_outros_vinculos_centavos,
             m.inss_outros_vinculos_centavos, 'MANUAL'
             FROM folha_movimentos m
             JOIN folha_periodos p ON p.id = m.periodo_id
            WHERE p.competencia = to_char((($1 || '-01')::date - interval '1 month'), 'YYYY-MM')
              AND p.tipo_folha = 'MENSAL'
           ON CONFLICT (periodo_id, employee_id) DO NOTHING
           RETURNING employee_id`,
          [competencia, periodo.id],
        );
        movimentosCopiados = copiados.rowCount ?? 0;
      }

      return { ...periodo, movimentosCopiados };
    });
  },
);

app.post<{ Params: { competencia: string }; Body: { motivo?: string } }>(
  "/api/competencias/:competencia/reabrir",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO");
    try {
      return await reabrirCompetencia({ userId: s.userId }, req.params.competencia, req.body?.motivo ?? "");
    } catch (erro) {
      const status = (erro as { statusCode?: number }).statusCode;
      if (status) return resp.code(status).send({ erro: (erro as Error).message });
      throw erro;
    }
  },
);

app.get<{ Querystring: { competencia?: string } }>("/api/movimentos", async (req, resp) => {
  exigirSessao(req);
  if (!req.query.competencia) return resp.code(400).send({ erro: "Informe a competência." });
  return listarMovimentosCompetencia(req.query.competencia);
});

app.patch<{ Params: { competencia: string; funcionarioId: string }; Body: MovimentoEntrada }>(
  "/api/movimentos/:competencia/:funcionarioId",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO", "RH", "FINANCEIRO");
    try {
      const r = await atualizarMovimentoComRevisao({ userId: s.userId }, s.perfis.includes("DIRECAO"), req.params.competencia, req.params.funcionarioId, req.body ?? {});
      return r.aprovacao ? resp.code(200).send(r) : resp.code(204).send();
    } catch (erro) {
      const status = (erro as { statusCode?: number }).statusCode;
      if (status) return resp.code(status).send({ erro: (erro as Error).message });
      throw erro;
    }
  },
);

// ---------------------------------------------------------------- folha

app.get<{ Params: { competencia: string } }>(
  "/api/folha/:competencia",
  async (req) => {
    exigirPerfil(req, "DIRECAO", "RH", "FINANCEIRO");
    return consultar(
      // `employeeId` é o que permite ocultar o valor de quem tem salário
      // restrito: sem ele a linha só tinha o id do cálculo e o líquido
      // vazava para o Financeiro/RH.
      `SELECT c.id, c.employee_id AS "employeeId", p.nome, c.competencia,
              c.total_proventos_centavos, c.total_descontos_centavos,
              c.liquido_centavos, c.custo_empregador_centavos, c.tem_divergencia
         FROM folha_calculos c
         JOIN employees e ON e.id = c.employee_id
         JOIN pessoas p ON p.id = e.pessoa_id
        WHERE c.competencia = $1
        ORDER BY p.nome`,
      [normalizar(req.params.competencia)],
    );
  },
);

/**
 * Mesma folha calculada, mas com a rubrica inteira de cada pessoa — o
 * relatório geral (tela de Relatórios, incluindo o PDF) usa esta rota para
 * mostrar exatamente o que foi apurado e gravado no fechamento/cálculo, em
 * vez de recalcular no navegador com o contrato e a CCT de HOJE. Sem isto, um
 * reajuste salarial ou uma mudança na convenção coletiva faria o relatório de
 * um mês antigo mostrar números diferentes do que foi de fato pago naquele
 * mês — o `folha_calculos`/`folha_rubricas` já guardam o que sustentou o
 * resultado; só precisavam de uma rota para chegar até a tela.
 */
app.get<{ Params: { competencia: string } }>(
  "/api/folha/:competencia/detalhado",
  async (req) => {
    exigirPerfil(req, "DIRECAO", "RH", "FINANCEIRO");
    const linhas = await consultar<{
      employeeId: string;
      proventos: number; descontos: number; liquido: number; custoEmpregador: number;
      temDivergencia: boolean; avisos: unknown; rubricas: unknown;
      baseInss: number; baseIrrf: number; baseFgts: number; calculadoEm: string; nome: string;
    }>(
      `SELECT c.employee_id AS "employeeId",
              (SELECT pe.nome FROM employees e JOIN pessoas pe ON pe.id = e.pessoa_id WHERE e.id = c.employee_id) AS nome,
              c.total_proventos_centavos::int AS proventos,
              c.total_descontos_centavos::int AS descontos,
              c.liquido_centavos::int AS liquido,
              c.custo_empregador_centavos::int AS "custoEmpregador",
              c.tem_divergencia AS "temDivergencia",
              c.base_inss_centavos::int AS "baseInss",
              c.base_irrf_centavos::int AS "baseIrrf",
              c.base_fgts_centavos::int AS "baseFgts",
              to_char(c.calculado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS "calculadoEm",
              coalesce(
                (SELECT json_agg(json_build_object('texto', a->>'mensagem', 'nivel', lower(a->>'severidade')))
                   FROM jsonb_array_elements(c.avisos) AS a),
                '[]'::json
              ) AS avisos,
              coalesce(
                (SELECT json_agg(json_build_object(
                    'cod', r.codigo, 'desc', r.descricao, 'ref', r.referencia,
                    'valor', r.valor_centavos::int,
                    'tipo', CASE r.tipo WHEN 'PROVENTO' THEN 'P' WHEN 'DESCONTO' THEN 'D' ELSE 'E' END
                  ) ORDER BY r.ordem)
                 FROM folha_rubricas r WHERE r.calculo_id = c.id),
                '[]'::json
              ) AS rubricas
         FROM folha_calculos c
         JOIN folha_periodos p ON p.id = c.periodo_id
        WHERE p.competencia = $1 AND p.tipo_folha = 'MENSAL'`,
      [normalizar(req.params.competencia)],
    );
    return linhas;
  },
);

/**
 * Prévia sem gravar. O motor é o mesmo módulo testado por 162 casos — a API
 * não recalcula nada por conta própria, só monta os insumos e o chama.
 */
app.post<{ Body: { contrato: unknown; movimento: unknown; parametros: unknown } }>(
  "/api/folha/previa",
  async (req, resp) => {
    exigirPerfil(req, "DIRECAO", "RH", "FINANCEIRO");
    const { contrato, movimento, parametros } = req.body ?? {};
    if (!contrato || !movimento || !parametros) {
      return resp.code(400).send({ erro: "Informe contrato, movimento e parametros." });
    }
    try {
      return calcularFolha(contrato as never, movimento as never, parametros as never);
    } catch (erro) {
      return resp.code(422).send({ erro: (erro as Error).message });
    }
  },
);

/**
 * Calcula a folha inteira da competência e grava.
 *
 * É aqui que "subir a planilha e o cálculo sair sozinho" acontece: para cada
 * funcionário com contrato vigente, monta contrato + movimento + parâmetros e
 * chama o mesmo motor dos 162 testes. Nada é recalculado à mão nesta camada.
 */
app.post<{ Params: { competencia: string } }>(
  "/api/folha/:competencia/calcular",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO", "RH", "FINANCEIRO");
    const competencia = normalizar(req.params.competencia);

    const [periodo] = await consultar<{ id: string; status: string }>(
      `SELECT id, status FROM folha_periodos
        WHERE competencia = $1 AND tipo_folha = 'MENSAL'`,
      [competencia],
    );
    if (!periodo) {
      return resp.code(404).send({ erro: "Competência não aberta. Abra antes de calcular." });
    }
    if (["APROVADO", "ENVIADO_CONTABILIDADE", "FECHADO"].includes(periodo.status)) {
      return resp.code(409).send({
        erro: `Competência em ${periodo.status}. Reabra antes de recalcular.`,
      });
    }

    return recalcularCompetencia(s.userId, competencia, periodo.id);
  },
);

/**
 * Calcula a folha inteira da competência com os dados de agora e grava. É o
 * mesmo passo que "fechar" roda antes de congelar: fechar sem recalcular
 * congelava o último cálculo, e um cadastro corrigido depois dele (admissão,
 * salário) saía errado no holerite oficial.
 */
async function recalcularCompetencia(userId: string, competencia: string, periodoId: string) {
  const funcionarios = await consultar<{ id: string; nome: string; categoria: string }>(
    `SELECT e.id, p.nome,
            CASE WHEN c.eh_docente THEN 'DOCENTE' ELSE 'ADMINISTRATIVO' END AS categoria
       FROM employees e
       JOIN pessoas p ON p.id = e.pessoa_id
       LEFT JOIN cargos c ON c.id = e.cargo_id
      WHERE e.status <> 'DESLIGADO'
        AND e.tipo_contrato <> 'PJ' -- prestador é pago pela rota própria, nunca pela folha CLT
      ORDER BY p.nome`,
  );

  const parametrosPorCategoria = new Map<string, ParametrosFolha>();
  const calculados: Array<{ id: string; nome: string; liquido: number; divergencias: number }> = [];
  const semContrato: string[] = [];
  let comDivergencia = 0;

  await transacao({ userId }, async (c) => {
    // Tudo que o cálculo precisa vem em lote (contratos, movimentos) e tudo é
    // gravado em lote: antes eram ~10 idas ao banco por pessoa, o que num
    // banco remoto transformava "Calcular" em minutos de espera.
    const contratos = await contratosVigentesEmLote(funcionarios.map((f) => f.id), competencia);
    const comContrato = funcionarios.filter((f) => contratos.has(f.id));
    for (const f of funcionarios) if (!contratos.has(f.id)) semContrato.push(f.nome);
    const linhasMovimento = await garantirELerMovimentos(c, periodoId, comContrato.map((f) => f.id));

    const paraGravar: Parameters<typeof gravarCalculosEmLote>[2] = [];
    for (const f of comContrato) {
      const vigente = contratos.get(f.id)!;

      if (!parametrosPorCategoria.has(f.categoria)) {
        parametrosPorCategoria.set(
          f.categoria,
          await parametrosDaCompetencia(competencia, f.categoria as never),
        );
      }
      const parametros = parametrosPorCategoria.get(f.categoria)!;

      const linha = linhasMovimento.get(f.id);
      const movimento = movimentoDeLinha(linha, competencia);
      // Outro vínculo lançado no mês vale sobre o do contrato.
      const outros = outrosVinculosDeLinha(linha);
      const contrato = outros ? { ...vigente.contrato, ...outros } : vigente.contrato;
      const resultado = calcularFolha(contrato, movimento, parametros);

      paraGravar.push({
        employeeId: f.id, contratoId: vigente.contratoId, parametros, contrato, movimento, resultado,
      });

      const divergencias = resultado.avisos.filter((a) => a.severidade === "DIVERGENCIA").length;
      if (divergencias > 0) comDivergencia++;
      calculados.push({ id: f.id, nome: f.nome, liquido: resultado.liquido, divergencias });
    }
    await gravarCalculosEmLote(c, periodoId, paraGravar);

    // Quem saiu da folha desde o último cálculo (desligado, sem contrato)
    // não pode continuar no total da competência.
    const ids = calculados.map((x) => x.id);
    await c.query(
      `DELETE FROM folha_rubricas WHERE calculo_id IN (
         SELECT id FROM folha_calculos WHERE periodo_id = $1 AND NOT (employee_id = ANY($2::uuid[])))`,
      [periodoId, ids],
    );
    await c.query(
      "DELETE FROM folha_calculos WHERE periodo_id = $1 AND NOT (employee_id = ANY($2::uuid[]))",
      [periodoId, ids],
    );

    // A competência só sai de EM_CALCULO quando nada estiver divergente.
    await c.query("UPDATE folha_periodos SET status = $2 WHERE id = $1", [
      periodoId,
      comDivergencia > 0 ? "COM_DIVERGENCIA" : "CONFERIDO",
    ]);
  });

  return {
    competencia,
    calculados: calculados.length,
    comDivergencia,
    semContrato,
    totalLiquido: calculados.reduce((a, x) => a + x.liquido, 0),
    status: comDivergencia > 0 ? "COM_DIVERGENCIA" : "CONFERIDO",
  };
}

/** Fecha a competência. O banco congela o resto por trigger. */
app.post<{ Params: { competencia: string } }>(
  "/api/folha/:competencia/fechar",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO");
    const competencia = normalizar(req.params.competencia);

    const [periodo] = await consultar<{ id: string; status: string }>(
      `SELECT id, status FROM folha_periodos WHERE competencia = $1 AND tipo_folha = 'MENSAL'`,
      [competencia],
    );
    if (!periodo) return resp.code(404).send({ erro: "Competência não encontrada." });
    if (periodo.status === "FECHADO") return resp.code(409).send({ erro: "Competência já fechada." });
    // Fecha o que vale agora: cadastro ou lançamento corrigido depois do
    // último cálculo entra no holerite oficial.
    await recalcularCompetencia(s.userId, competencia, periodo.id);

    const [pendentes] = await consultar<{ total: string }>(
      `SELECT count(*)::text AS total
         FROM folha_calculos c JOIN folha_periodos p ON p.id = c.periodo_id
        WHERE p.competencia = $1 AND c.tem_divergencia`,
      [competencia],
    );
    if (Number(pendentes.total) > 0) {
      return resp.code(422).send({
        erro: `${pendentes.total} funcionário(s) com divergência. Resolva antes de fechar.`,
      });
    }

    return transacao({ userId: s.userId }, async (c) => {
      const r = await c.query(
        `UPDATE folha_periodos
            SET status = 'FECHADO', fechado_por = $2, fechado_em = now()
          WHERE competencia = $1 AND tipo_folha = 'MENSAL'
          RETURNING id, competencia, status, fechado_em`,
        [competencia, s.userId],
      );
      if (!r.rowCount) return resp.code(404).send({ erro: "Competência não encontrada." });
      return r.rows[0];
    });
  },
);

// ---------------------------------------------------------------- 13º, férias e rescisão

async function categoriaDoFuncionario(employeeId: string): Promise<"DOCENTE" | "ADMINISTRATIVO"> {
  const [f] = await consultar<{ categoria: "DOCENTE" | "ADMINISTRATIVO" }>(
    `SELECT CASE WHEN c.eh_docente THEN 'DOCENTE' ELSE 'ADMINISTRATIVO' END AS categoria
       FROM employees e LEFT JOIN cargos c ON c.id = e.cargo_id WHERE e.id = $1`,
    [employeeId],
  );
  return f?.categoria ?? "ADMINISTRATIVO";
}

app.post<{ Params: { employeeId: string; ano: string; parcela: string } }>(
  "/api/decimo-terceiro/:employeeId/:ano/:parcela/calcular",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO", "RH", "FINANCEIRO");
    const parcela = Number(req.params.parcela);
    if (parcela !== 1 && parcela !== 2) {
      return resp.code(400).send({ erro: "Parcela deve ser 1 ou 2." });
    }
    validar.validarAno(req.params.ano);
    const competenciaReferencia = `${req.params.ano}-12`;
    const vigente = await contratoVigente(req.params.employeeId, competenciaReferencia);
    if (!vigente) {
      return resp.code(404).send({ erro: "Sem contrato vigente em dezembro deste ano para calcular." });
    }
    const categoria = await categoriaDoFuncionario(req.params.employeeId);
    const parametros = await parametrosDaCompetencia(competenciaReferencia, categoria);
    const base = await baseRemuneracaoMensal(req.params.employeeId, vigente.contratoId, vigente.contrato, parametros);

    try {
      return await transacao({ userId: s.userId }, async (c) => {
        const { id, resultado } = await gravarDecimoTerceiro(
          c, req.params.employeeId, vigente.contratoId, vigente.contrato,
          req.params.ano, parcela as 1 | 2, base, parametros,
        );
        return { id, ...resultado };
      });
    } catch (erro) {
      const msg = (erro as Error).message;
      if (/já pago em/.test(msg)) {
        return resp.code(409).send({ erro: msg.replace(/^.*ERROR:\s*/, "") });
      }
      if (/violates check|invalid input syntax|violates foreign key|duplicate key/.test(msg)) {
        return resp.code(422).send({ erro: msg.replace(/^.*ERROR:\s*/, "") });
      }
      throw erro;
    }
  },
);

app.get<{ Params: { ano: string } }>("/api/decimo-terceiro/:ano", async (req) => {
  exigirPerfil(req, "DIRECAO", "RH", "FINANCEIRO");
  validar.validarAno(req.params.ano);
  return consultar(
    `SELECT d.id, d.employee_id AS "employeeId", p.nome, d.parcela, d.meses_trabalhados AS "mesesTrabalhados",
            d.total_proventos_centavos AS proventos, d.total_descontos_centavos AS descontos,
            d.liquido_centavos AS liquido, d.tem_divergencia AS "temDivergencia", d.pago
       FROM folha_decimo_terceiro d
       JOIN employees e ON e.id = d.employee_id JOIN pessoas p ON p.id = e.pessoa_id
      WHERE d.ano = $1
      ORDER BY p.nome, d.parcela`,
    [req.params.ano],
  );
});

app.post<{ Params: { id: string } }>("/api/decimo-terceiro/:id/pagar", async (req, resp) => {
  const s = exigirPerfil(req, "DIRECAO");
  const [divergente] = await consultar<{ tem: boolean }>(
    "SELECT tem_divergencia AS tem FROM folha_decimo_terceiro WHERE id = $1",
    [req.params.id],
  );
  if (!divergente) return resp.code(404).send({ erro: "Não encontrado." });
  if (divergente.tem) {
    return resp.code(422).send({ erro: "Cálculo com divergência. Resolva antes de marcar como pago." });
  }
  const r = await consultar(
    "UPDATE folha_decimo_terceiro SET pago = true, pago_em = now() WHERE id = $1 AND NOT pago RETURNING id",
    [req.params.id],
  );
  if (!r.length) return resp.code(409).send({ erro: "Já pago ou não encontrado." });
  return { ok: true };
});

app.post<{ Params: { employeeId: string }; Body: {
  periodoAquisitivoInicio?: string; periodoAquisitivoFim?: string; dataInicioGozo?: string;
  diasFerias?: number; faltasInjustificadas?: number; diasVendidos?: number;
} }>(
  "/api/ferias/:employeeId/calcular",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO", "RH", "FINANCEIRO");
    const b = req.body ?? {};
    if (!b.periodoAquisitivoInicio || !b.periodoAquisitivoFim || !b.dataInicioGozo) {
      return resp.code(400).send({ erro: "Informe período aquisitivo (início e fim) e data de início do gozo." });
    }
    validar.dataIso(b.periodoAquisitivoInicio, "o início do período aquisitivo", { obrigatorio: true });
    validar.dataIso(b.periodoAquisitivoFim, "o fim do período aquisitivo", { obrigatorio: true });
    validar.dataIso(b.dataInicioGozo, "o início do gozo", { obrigatorio: true });
    if (b.periodoAquisitivoFim < b.periodoAquisitivoInicio) {
      return resp.code(422).send({ erro: "O fim do período aquisitivo não pode ser anterior ao início." });
    }
    validar.inteiro(b.diasFerias, "os dias de férias", { min: 1, max: 30 });
    validar.inteiro(b.faltasInjustificadas, "as faltas injustificadas", { min: 0, max: 366 });
    validar.inteiro(b.diasVendidos, "os dias vendidos", { min: 0, max: 30 });
    const competencia = b.dataInicioGozo.slice(0, 7);
    const vigente = await contratoVigente(req.params.employeeId, competencia);
    if (!vigente) {
      return resp.code(404).send({ erro: "Sem contrato vigente na data de início do gozo." });
    }
    const categoria = await categoriaDoFuncionario(req.params.employeeId);
    const parametros = await parametrosDaCompetencia(competencia, categoria);
    const base = await baseRemuneracaoMensal(req.params.employeeId, vigente.contratoId, vigente.contrato, parametros);
    // Direito pelas faltas injustificadas (CLT art. 130): 30/24/18/12 dias; acima de 32 faltas, nenhum.
    const direito = diasFeriasPorFaltas(b.faltasInjustificadas ?? 0);
    if (direito < 1) {
      return resp.code(422).send({ erro: `Com ${b.faltasInjustificadas} faltas injustificadas no período aquisitivo a pessoa perde o direito a férias (CLT art. 130: acima de 32 faltas); não há o que calcular.` });
    }
    const diasFerias = b.diasFerias ?? direito;
    if (diasFerias > direito) {
      return resp.code(422).send({ erro: `Com ${b.faltasInjustificadas ?? 0} faltas injustificadas o direito é de ${direito} dias de férias (CLT art. 130); foram informados ${diasFerias}.` });
    }
    const diasVendidos = b.diasVendidos ?? 0;
    // Abono pecuniário: no máximo 1/3 dos dias de férias (CLT art. 143).
    const maxVenda = Math.floor(diasFerias / 3);
    if (diasVendidos > maxVenda) {
      return resp.code(422).send({ erro: `Só é possível vender até 1/3 das férias (CLT art. 143): no máximo ${maxVenda} dia(s) de ${diasFerias}; foram informados ${diasVendidos}.` });
    }
    // Validado ANTES de gravar: dias vendidos > dias de direito não é uma
    // divergência para revisar depois, é dado inválido (a constraint
    // `ferias_dias_coerentes` rejeitaria o INSERT com um erro cru).
    if (diasVendidos < 0 || diasVendidos > diasFerias) {
      return resp.code(400).send({
        erro: `Dias vendidos (${diasVendidos}) precisa estar entre 0 e ${diasFerias} (os dias de direito).`,
      });
    }

    try {
      return await transacao({ userId: s.userId }, async (c) => {
        const { id, resultado } = await gravarFerias(
          c, req.params.employeeId, vigente.contratoId, base,
          b.periodoAquisitivoInicio!, b.periodoAquisitivoFim!, b.dataInicioGozo!,
          diasFerias, b.diasVendidos ?? 0, vigente.contrato.dependentesIrrf, parametros,
        );
        return { id, ...resultado };
      });
    } catch (erro) {
      const msg = (erro as Error).message;
      if (/já pago em/.test(msg)) {
        return resp.code(409).send({ erro: msg.replace(/^.*ERROR:\s*/, "") });
      }
      if (/violates check|invalid input syntax|violates foreign key|duplicate key/.test(msg)) {
        return resp.code(422).send({ erro: msg.replace(/^.*ERROR:\s*/, "") });
      }
      throw erro;
    }
  },
);

app.get<{ Params: { employeeId: string } }>("/api/ferias/:employeeId", async (req) => {
  exigirPerfil(req, "DIRECAO", "RH", "FINANCEIRO");
  return consultar(
    `SELECT id, periodo_aquisitivo_inicio AS "periodoInicio", periodo_aquisitivo_fim AS "periodoFim",
            data_inicio_gozo AS "dataInicioGozo", dias_ferias AS "diasFerias", dias_vendidos AS "diasVendidos",
            dias_gozados AS "diasGozados", total_proventos_centavos AS proventos,
            total_descontos_centavos AS descontos, liquido_centavos AS liquido,
            tem_divergencia AS "temDivergencia", pago
       FROM folha_ferias WHERE employee_id = $1 ORDER BY data_inicio_gozo DESC`,
    [req.params.employeeId],
  );
});

app.post<{ Params: { id: string } }>("/api/ferias/:id/pagar", async (req, resp) => {
  const s = exigirPerfil(req, "DIRECAO");
  const [divergente] = await consultar<{ tem: boolean }>(
    "SELECT tem_divergencia AS tem FROM folha_ferias WHERE id = $1",
    [req.params.id],
  );
  if (!divergente) return resp.code(404).send({ erro: "Não encontrado." });
  if (divergente.tem) {
    return resp.code(422).send({ erro: "Cálculo com divergência. Resolva antes de marcar como pago." });
  }
  const r = await consultar(
    "UPDATE folha_ferias SET pago = true, pago_em = now() WHERE id = $1 AND NOT pago RETURNING id",
    [req.params.id],
  );
  if (!r.length) return resp.code(409).send({ erro: "Já pago ou não encontrado." });
  return { ok: true };
});

/**
 * Calcula a rescisão. `mesesFeriasProporcionais` fica a cargo de quem chama
 * informar: o início do período aquisitivo ATUAL depende do histórico do
 * contrato (admissão ou fim do período aquisitivo anterior), que este
 * sistema ainda não reconstrói sozinho a partir de `folha_ferias`.
 */
app.post<{ Params: { employeeId: string }; Body: {
  tipo?: TipoRescisao; avisoPrevioIndenizado?: boolean; diasFeriasVencidas?: number;
  mesesFeriasProporcionais?: number; saldoFgtsDepositadoCentavos?: number;
} }>(
  "/api/rescisao/:employeeId/calcular",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO", "RH", "FINANCEIRO");
    const b = req.body ?? {};
    const tiposValidos: TipoRescisao[] = ["SEM_JUSTA_CAUSA", "PEDIDO_DEMISSAO", "JUSTA_CAUSA", "ACORDO"];
    if (!b.tipo || !tiposValidos.includes(b.tipo)) {
      return resp.code(400).send({ erro: "Informe o tipo de rescisão: " + tiposValidos.join(", ") + "." });
    }
    validar.inteiro(b.diasFeriasVencidas, "os dias de férias vencidas", { min: 0, max: 120 });
    validar.inteiro(b.mesesFeriasProporcionais, "os meses de férias proporcionais", { min: 0, max: 12 });
    validar.inteiro(b.saldoFgtsDepositadoCentavos, "o saldo de FGTS", { min: 0, max: validar.MAX_CENTAVOS, dica: "em centavos" });
    if (b.avisoPrevioIndenizado !== undefined && typeof b.avisoPrevioIndenizado !== "boolean") {
      return resp.code(400).send({ erro: "Aviso prévio indenizado precisa ser sim ou não." });
    }
    const diasFeriasVencidas = b.diasFeriasVencidas ?? 0;
    const mesesFeriasProporcionais = b.mesesFeriasProporcionais ?? 0;
    // Mesma lógica da validação em /api/ferias/:employeeId/calcular: barra
    // valor fora de faixa ANTES de gravar, para dar 400 com mensagem clara em
    // vez de deixar o CHECK do banco (migration 015) estourar como erro cru.
    if (diasFeriasVencidas < 0) {
      return resp.code(400).send({ erro: "Dias de férias vencidas não pode ser negativo." });
    }
    if (mesesFeriasProporcionais < 0 || mesesFeriasProporcionais > 12) {
      return resp.code(400).send({ erro: "Meses de férias proporcionais precisa estar entre 0 e 12." });
    }
    if ((b.saldoFgtsDepositadoCentavos ?? 0) < 0) {
      return resp.code(400).send({ erro: "Saldo de FGTS depositado não pode ser negativo." });
    }

    const [emp] = await consultar<{ dataDesligamento: string | null; dataAdmissao: string }>(
      `SELECT to_char(data_desligamento,'YYYY-MM-DD') AS "dataDesligamento",
              to_char(data_admissao,'YYYY-MM-DD') AS "dataAdmissao"
         FROM employees WHERE id = $1`,
      [req.params.employeeId],
    );
    if (!emp?.dataDesligamento) {
      return resp.code(422).send({ erro: "Funcionário sem data de desligamento cadastrada — desligue antes de calcular a rescisão." });
    }

    const competenciaDesligamento = emp.dataDesligamento.slice(0, 7);
    // Contrato vigente no MÊS ANTERIOR ao desligamento: no mês do próprio
    // desligamento `contratoVigente` pode já não encontrar vigência (a janela
    // fecha na própria data), e é o último salário efetivo que vale de base.
    const vigente =
      (await contratoVigente(req.params.employeeId, competenciaDesligamento)) ??
      (await contratoVigente(req.params.employeeId, `${emp.dataDesligamento.slice(0, 4)}-01`));
    if (!vigente) {
      return resp.code(404).send({ erro: "Sem contrato vigente para calcular a rescisão." });
    }

    const categoria = await categoriaDoFuncionario(req.params.employeeId);
    const parametros = await parametrosDaCompetencia(competenciaDesligamento, categoria);
    const base = await baseRemuneracaoMensal(req.params.employeeId, vigente.contratoId, vigente.contrato, parametros);

    const avisoPrevioIndenizado = b.avisoPrevioIndenizado ?? true;
    const projecao =
      avisoPrevioIndenizado && (b.tipo === "SEM_JUSTA_CAUSA" || b.tipo === "ACORDO")
        ? projetarData(emp.dataDesligamento, diasAvisoPrevio(emp.dataAdmissao, emp.dataDesligamento))
        : emp.dataDesligamento;
    const mesesDecimoTerceiro = mesesTrabalhadosNoAno(
      emp.dataAdmissao, projecao, emp.dataDesligamento.slice(0, 4),
    );

    try {
      return await transacao({ userId: s.userId }, async (c) => {
        const { id, resultado } = await gravarRescisao(
          c, req.params.employeeId, vigente.contratoId, base, b.tipo!, emp.dataDesligamento!,
          avisoPrevioIndenizado, diasFeriasVencidas, mesesFeriasProporcionais,
          mesesDecimoTerceiro, b.saldoFgtsDepositadoCentavos ?? 0, emp.dataAdmissao,
          vigente.contrato.dependentesIrrf, parametros,
        );
        return { id, ...resultado };
      });
    } catch (erro) {
      const msg = (erro as Error).message;
      if (/já homologada em/.test(msg)) {
        return resp.code(409).send({ erro: msg.replace(/^.*ERROR:\s*/, "") });
      }
      if (/violates check|invalid input syntax|violates foreign key|duplicate key/.test(msg)) {
        return resp.code(422).send({ erro: msg.replace(/^.*ERROR:\s*/, "") });
      }
      throw erro;
    }
  },
);

app.get<{ Params: { employeeId: string } }>("/api/rescisao/:employeeId", async (req, resp) => {
  exigirPerfil(req, "DIRECAO", "RH", "FINANCEIRO");
  const r = await buscarRescisao(req.params.employeeId);
  if (!r) return resp.code(404).send({ erro: "Sem rescisão calculada para este funcionário." });
  return r;
});

app.post<{ Params: { id: string } }>("/api/rescisao/:id/homologar", async (req, resp) => {
  const s = exigirPerfil(req, "DIRECAO");
  const divergente = await rescisaoTemDivergencia(req.params.id);
  if (divergente === null) return resp.code(404).send({ erro: "Não encontrada." });
  if (divergente) {
    return resp.code(422).send({ erro: "Cálculo com divergência. Resolva antes de homologar." });
  }
  const r = await consultar(
    "UPDATE folha_rescisoes SET homologada = true, homologada_por = $2, homologada_em = now() WHERE id = $1 AND NOT homologada RETURNING id",
    [req.params.id, s.userId],
  );
  if (!r.length) return resp.code(409).send({ erro: "Já homologada ou não encontrada." });
  return { ok: true };
});

// ---------------------------------------------------------------- funcionários (escrita)

app.post<{ Body: FuncionarioEntrada }>("/api/funcionarios", async (req, resp) => {
  const s = exigirPerfil(req, "DIRECAO", "RH");
  const d = req.body;
  if (!d?.nome || !d?.matricula || !d?.dataAdmissao || !d?.regime) {
    return resp.code(400).send({ erro: "Informe nome, matrícula, data de admissão e regime." });
  }
  validar.validarCamposFuncionario(d);
  if (!["HORISTA_AULA", "MENSALISTA", "HORISTA_RELOGIO"].includes(d.regime)) {
    return resp.code(400).send({ erro: "Regime inválido. Escolha horista-aula, mensalista ou horista-relógio." });
  }
  try {
    const criado = await criarFuncionario({ userId: s.userId }, d);
    const rev = await registrarCriacaoParaAprovacao({ userId: s.userId }, s.perfis.includes("DIRECAO"), criado.id);
    return { ...criado, ...rev };
  } catch (erro) {
    const status = (erro as { statusCode?: number }).statusCode;
    if (status) return resp.code(status).send({ erro: (erro as Error).message });
    const msg = (erro as Error).message;
    // Violação de constraint é erro de quem chamou, não do servidor.
    if (/duplicate key|violates check|violates exclusion/.test(msg)) {
      return resp.code(422).send({ erro: mensagemDeRestricao(msg) });
    }
    throw erro;
  }
});

app.patch<{ Params: { id: string }; Body: Partial<FuncionarioEntrada> }>(
  "/api/funcionarios/:id",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO", "RH");
    validar.validarCamposFuncionario(req.body);
    try {
      const r = await atualizarFuncionarioComRevisao({ userId: s.userId }, s.perfis.includes("DIRECAO"), req.params.id, req.body ?? {});
      return r.aprovacao ? resp.code(200).send(r) : resp.code(204).send();
    } catch (erro) {
      const status = (erro as { statusCode?: number }).statusCode;
      if (status) return resp.code(status).send({ erro: (erro as Error).message });
      const msg = (erro as Error).message;
      if (/duplicate key|violates check|violates exclusion/.test(msg)) {
        return resp.code(422).send({ erro: mensagemDeRestricao(msg) });
      }
      throw erro;
    }
  },
);

app.post<{ Params: { id: string }; Body: { competencia?: string } }>(
  "/api/funcionarios/:id/valer-desde",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO");
    if (!req.body?.competencia || !/^\d{4}-\d{2}$/.test(req.body.competencia)) {
      return resp.code(400).send({ erro: "Informe a competência no formato AAAA-MM." });
    }
    try {
      return await anteciparContratoVigente({ userId: s.userId }, req.params.id, req.body.competencia);
    } catch (erro) {
      const status = (erro as { statusCode?: number }).statusCode;
      if (status) return resp.code(status).send({ erro: (erro as Error).message });
      throw erro;
    }
  },
);

app.post<{ Params: { id: string }; Body: { dataDesligamento?: string } }>(
  "/api/funcionarios/:id/desligar",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO", "RH");
    if (!req.body?.dataDesligamento) {
      return resp.code(400).send({ erro: "Informe a data de desligamento." });
    }
    validar.dataIso(req.body.dataDesligamento, "a data de desligamento", { obrigatorio: true });
    const [homologada] = await consultar<{ n: number }>(
      "SELECT count(*)::int AS n FROM folha_rescisoes WHERE employee_id = $1 AND homologada", [req.params.id],
    );
    if (homologada && homologada.n > 0) {
      return resp.code(409).send({ erro: "A rescisão desta pessoa já foi homologada pela Direção: a data de desligamento não pode mais mudar." });
    }
    try {
      const r = await desligarFuncionarioComRevisao({ userId: s.userId }, s.perfis.includes("DIRECAO"), req.params.id, req.body.dataDesligamento);
      return r.aprovacao ? resp.code(200).send(r) : resp.code(204).send();
    } catch (erro) {
      const status = (erro as { statusCode?: number }).statusCode;
      if (status) return resp.code(status).send({ erro: (erro as Error).message });
      throw erro;
    }
  },
);

app.delete<{ Params: { id: string } }>("/api/funcionarios/:id", async (req, resp) => {
  const s = exigirPerfil(req, "DIRECAO", "RH");
  try {
    if (!s.perfis.includes("DIRECAO")) {
      // RH: a exclusão não tem volta, então só vira pedido; quem apaga é a Direção ao aceitar.
      return resp.code(200).send(await pedirExclusaoFuncionario({ userId: s.userId }, req.params.id));
    }
    await excluirFuncionario({ userId: s.userId }, req.params.id);
    return resp.code(204).send();
  } catch (erro) {
    const status = (erro as { statusCode?: number }).statusCode;
    if (status) return resp.code(status).send({ erro: (erro as Error).message });
    const msg = (erro as Error).message;
    // A FK `ON DELETE RESTRICT` (contratos, movimentos, cálculos de folha,
    // ausências, jornada) é a própria trava legal — traduz pra quem chamou
    // em vez de deixar vazar "violates foreign key constraint fk_xyz".
    if (/violates foreign key constraint/.test(msg)) {
      return resp.code(422).send({
        erro: "Não é possível excluir: já existem registros vinculados a este cadastro (folha, ausência ou jornada). Use \"Desligar\" para preservar o histórico.",
      });
    }
    throw erro;
  }
});

// ---------------------------------------------------------------- funcionário PJ/MEI (prestador)

app.post<{ Body: FuncionarioPrestadorEntrada }>("/api/funcionarios/prestador", async (req, resp) => {
  const s = exigirPerfil(req, "DIRECAO", "RH");
  const d = req.body;
  if (!d?.nome || !d?.matricula || !d?.dataAdmissao || !d?.enquadramento || !d?.servico) {
    return resp.code(400).send({ erro: "Informe nome, matrícula, data de admissão, enquadramento e serviço." });
  }
  d.valorMensalCentavos = d.valorMensalCentavos ?? 0;
  validar.validarCamposFuncionario(d);
  validar.inteiro(d.valorMensalCentavos, "o valor mensal", { min: 0, max: validar.MAX_CENTAVOS, dica: "em centavos" });
  validar.umDe(d.enquadramento, "o enquadramento", ["MEI", "PJ_SIMPLES", "PJ_LUCRO_PRESUMIDO"] as const, { obrigatorio: true });
  if (d.cnpj) validar.documento(d.cnpj, "CNPJ", "o CNPJ");
  try {
    const criado = await criarFuncionarioPrestador({ userId: s.userId }, d);
    const rev = await registrarCriacaoParaAprovacao({ userId: s.userId }, s.perfis.includes("DIRECAO"), (criado as { id: string }).id);
    return { ...criado, ...rev };
  } catch (erro) {
    const msg = (erro as Error).message;
    if (/duplicate key|violates check|violates exclusion/.test(msg)) {
      return resp.code(422).send({ erro: mensagemDeRestricao(msg) });
    }
    throw erro;
  }
});

app.post<{ Params: { employeeId: string }; Body: Parameters<typeof converterParaPrestador>[2] }>(
  "/api/prestadores/:employeeId/converter",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO", "RH");
    try {
      const r = await converterParaPrestador({ userId: s.userId }, req.params.employeeId, {
        ...(req.body ?? {}), enquadramento: req.body?.enquadramento ?? "MEI",
      } as never);
      return resp.code(201).send(r);
    } catch (erro) {
      const status = (erro as { statusCode?: number }).statusCode;
      if (status) return resp.code(status).send({ erro: (erro as Error).message });
      throw erro;
    }
  },
);

app.patch<{ Params: { employeeId: string }; Body: Parameters<typeof atualizarPrestador>[2] }>(
  "/api/prestadores/:employeeId",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO", "RH", "FINANCEIRO");
    const pb = validar.corpoObjeto(req.body);
    validar.inteiro(pb.valorMensalCentavos, "o valor mensal", { min: 0, max: validar.MAX_CENTAVOS, dica: "em centavos" });
    validar.umDe(pb.enquadramento, "o enquadramento", ["MEI", "PJ_SIMPLES", "PJ_LUCRO_PRESUMIDO"] as const);
    validar.texto(pb.servico, "o serviço", { max: 200 });
    validar.dataIso(pb.dataAdmissao, "a data de admissão");
    validar.validarCamposFuncionario(pb);
    try {
      const r = await atualizarPrestadorComRevisao({ userId: s.userId }, s.perfis.includes("DIRECAO"), req.params.employeeId, req.body ?? {});
      return r.aprovacao ? resp.code(200).send(r) : resp.code(204).send();
    } catch (erro) {
      const status = (erro as { statusCode?: number }).statusCode;
      if (status) return resp.code(status).send({ erro: (erro as Error).message });
      const msg = (erro as Error).message;
      if (/sustenta|restrict/.test(msg)) {
        return resp.code(422).send({ erro: "Este prestador já tem pagamento registrado; o contrato não pode mais ser alterado." });
      }
      if (/duplicate key|violates check/.test(msg)) {
        return resp.code(422).send({ erro: mensagemDeRestricao(msg) });
      }
      throw erro;
    }
  },
);

app.patch<{ Params: { id: string }; Body: { cnpj?: string } }>(
  "/api/prestadores/contrato/:id/cnpj",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO", "RH", "FINANCEIRO");
    if (!req.body?.cnpj) return resp.code(400).send({ erro: "Informe o CNPJ." });
    validar.documento(req.body.cnpj, "CNPJ", "o CNPJ");
    try {
      await atualizarCnpjPrestador({ userId: s.userId }, req.params.id, req.body.cnpj);
      return resp.code(204).send();
    } catch (erro) {
      const status = (erro as { statusCode?: number }).statusCode;
      if (status) return resp.code(status).send({ erro: (erro as Error).message });
      const msg = (erro as Error).message;
      if (/duplicate key|violates unique/.test(msg)) return resp.code(422).send({ erro: "Já existe um prestador com este CNPJ." });
      if (/violates check/.test(msg)) return resp.code(422).send({ erro: "CNPJ inválido: confira os 14 números." });
      throw erro;
    }
  },
);

app.get("/api/prestadores", async (req) => {
  exigirPerfil(req, "DIRECAO", "RH", "FINANCEIRO");
  return consultar(
    `SELECT cp.id AS "contratoId", cp.employee_id AS "employeeId", p.nome,
            cp.enquadramento, cp.servico, cp.valor_mensal_centavos AS "valorMensal",
            (cp.cnpj_hash IS NOT NULL) AS "temCnpj", cp.data_inicio AS "dataInicio"
       FROM contratos_prestador cp
       JOIN employees e ON e.id = cp.employee_id
       JOIN pessoas p ON p.id = e.pessoa_id
      WHERE cp.data_fim IS NULL
      ORDER BY p.nome`,
  );
});

app.post<{ Params: { employeeId: string; competencia: string } }>(
  "/api/prestadores/:employeeId/:competencia/calcular",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO", "RH", "FINANCEIRO");
    const competencia = normalizar(req.params.competencia);
    const vigente = await contratoPrestadorVigente(req.params.employeeId);
    if (!vigente) {
      return resp.code(404).send({ erro: "Sem contrato de prestador vigente para este funcionário." });
    }
    const [pessoa] = await consultar<{ nome: string }>(
      `SELECT p.nome FROM employees e JOIN pessoas p ON p.id = e.pessoa_id WHERE e.id = $1`,
      [req.params.employeeId],
    );
    if (!vigente.contrato.valorMensal) {
      return resp.code(422).send({
        erro: "Este prestador está sem valor mensal cadastrado: o pagamento sairia de R$ 0,00. Informe o valor da nota em Editar funcionário e calcule de novo.",
      });
    }
    const [inicio] = await consultar<{ ini: string }>(
      "SELECT to_char(data_inicio, 'YYYY-MM') AS ini FROM contratos_prestador WHERE id = $1", [vigente.contratoId],
    );
    if (inicio && competencia < inicio.ini) {
      return resp.code(422).send({
        erro: `O contrato deste prestador começa em ${inicio.ini.slice(5)}/${inicio.ini.slice(0, 4)}; não há pagamento a calcular em ${competencia.slice(5)}/${competencia.slice(0, 4)}.`,
      });
    }
    try {
      return await transacao({ userId: s.userId }, async (c) => {
        const { id, resultado } = await gravarPagamentoPrestador(
          c, req.params.employeeId, vigente.contratoId, vigente.contrato, competencia, pessoa?.nome ?? "",
        );
        return { id, ...resultado };
      });
    } catch (erro) {
      const msg = (erro as Error).message;
      if (/já feito em/.test(msg)) {
        return resp.code(409).send({ erro: msg.replace(/^.*ERROR:\s*/, "") });
      }
      if (/violates check|invalid input syntax|violates foreign key|duplicate key/.test(msg)) {
        return resp.code(422).send({ erro: msg.replace(/^.*ERROR:\s*/, "") });
      }
      throw erro;
    }
  },
);

app.get<{ Params: { employeeId: string } }>("/api/prestadores/:employeeId", async (req) => {
  exigirPerfil(req, "DIRECAO", "RH", "FINANCEIRO");
  return consultar(
    `SELECT id, competencia, valor_bruto_centavos AS "valorBruto",
            total_retencoes_centavos AS "totalRetencoes", total_descontos_fixos_centavos AS "totalDescontosFixos",
            liquido_a_pagar_centavos AS "liquidoAPagar", encargo_contratante_centavos AS "encargoContratante",
            custo_total_centavos AS "custoTotal", tem_divergencia AS "temDivergencia", pago
       FROM prestador_pagamentos WHERE employee_id = $1 ORDER BY competencia DESC`,
    [req.params.employeeId],
  );
});

app.post<{ Params: { id: string } }>("/api/prestadores/pagamento/:id/pagar", async (req, resp) => {
  const s = exigirPerfil(req, "DIRECAO");
  const [divergente] = await consultar<{ tem: boolean; zero: boolean }>(
    "SELECT tem_divergencia AS tem, (valor_bruto_centavos = 0) AS zero FROM prestador_pagamentos WHERE id = $1",
    [req.params.id],
  );
  if (!divergente) return resp.code(404).send({ erro: "Não encontrado." });
  if (divergente.zero) {
    return resp.code(422).send({ erro: "Este pagamento é de R$ 0,00 (prestador sem valor mensal). Informe o valor em Editar funcionário e calcule de novo antes de pagar." });
  }
  if (divergente.tem) {
    return resp.code(422).send({ erro: "Cálculo com divergência. Resolva antes de marcar como pago." });
  }
  const r = await consultar(
    "UPDATE prestador_pagamentos SET pago = true, pago_em = now() WHERE id = $1 AND NOT pago RETURNING id",
    [req.params.id],
  );
  if (!r.length) return resp.code(409).send({ erro: "Já pago ou não encontrado." });
  return { ok: true };
});

// ---------------------------------------------------------------- fornecedores

app.get("/api/fornecedores", async (req) => {
  exigirSessao(req);
  return listarFornecedores();
});

app.post<{ Body: FornecedorEntrada }>("/api/fornecedores", async (req, resp) => {
  const s = exigirPerfil(req, "DIRECAO", "FINANCEIRO");
  if (!req.body?.razaoSocial || !req.body?.tipoDocumento || !req.body?.documento) {
    return resp.code(400).send({ erro: "Informe razão social, tipo de documento e documento." });
  }
  const d = validar.validarFornecedor(req.body, false) as unknown as FornecedorEntrada;
  try {
    return await criarFornecedor({ userId: s.userId }, d);
  } catch (erro) {
    const msg = (erro as Error).message;
    if (/duplicate key|violates check|violates unique constraint/.test(msg)) {
      return resp.code(422).send({ erro: "Já existe um fornecedor com este documento." });
    }
    throw erro;
  }
});

app.patch<{ Params: { id: string }; Body: Partial<FornecedorEntrada> }>(
  "/api/fornecedores/:id",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO", "FINANCEIRO");
    try {
      await atualizarFornecedor({ userId: s.userId }, req.params.id, validar.validarFornecedor(req.body, true) as Partial<FornecedorEntrada>);
      return resp.code(204).send();
    } catch (erro) {
      const status = (erro as { statusCode?: number }).statusCode;
      if (status) return resp.code(status).send({ erro: (erro as Error).message });
      throw erro;
    }
  },
);

// ---------------------------------------------------------------- contas a pagar

app.get("/api/contas", async (req) => {
  exigirSessao(req);
  return listarContasPagar();
});

app.post<{ Body: ContaPagarEntrada }>("/api/contas", async (req, resp) => {
  const s = exigirPerfil(req, "DIRECAO", "FINANCEIRO");
  if (!req.body?.descricao || !req.body?.categoria || !req.body?.valorCentavos || !req.body?.competencia || !req.body?.vencimento) {
    return resp.code(400).send({ erro: "Informe descrição, categoria, valor (maior que zero), competência e vencimento." });
  }
  const d = validar.validarConta(req.body, false) as unknown as ContaPagarEntrada;
  if (d.status && ["APROVADO", "AGENDADO"].includes(d.status) && !s.perfis.includes("DIRECAO")) {
    return resp.code(403).send({ erro: "Aprovar ou agendar pagamento é decisão da Direção. Lance a conta como Rascunho ou Aguardando aprovação e peça a ela." });
  }
  if (d.status === "PAGO") {
    return resp.code(422).send({ erro: "Uma conta nova não pode nascer como \"Pago\": lance a conta e use o botão Pagar (feito pela Direção)." });
  }
  try {
    return await criarContaPagar({ userId: s.userId }, d);
  } catch (erro) {
    const status = (erro as { statusCode?: number }).statusCode;
    if (status) return resp.code(status).send({ erro: (erro as Error).message });
    throw erro;
  }
});

app.patch<{ Params: { id: string }; Body: Partial<ContaPagarEntrada> }>(
  "/api/contas/:id",
  async (req, resp) => {
    // Aprovar ou rejeitar pagamento é decisão da Direção; editar os dados da
    // conta continua com o Financeiro.
    const decide = ["APROVADO", "REJEITADO", "AGENDADO"].includes(String((req.body as { status?: string } | undefined)?.status ?? ""));
    const s = decide ? exigirPerfil(req, "DIRECAO") : exigirPerfil(req, "DIRECAO", "FINANCEIRO");
    const dados = validar.validarConta(req.body, true) as Partial<ContaPagarEntrada>;
    if (dados.status === "PAGO") {
      return resp.code(422).send({ erro: "Para marcar como paga use o botão Pagar, que registra data e forma de pagamento (é feito pela Direção)." });
    }
    try {
      await atualizarContaPagar({ userId: s.userId }, req.params.id, dados);
      return resp.code(204).send();
    } catch (erro) {
      const status = (erro as { statusCode?: number }).statusCode;
      if (status) return resp.code(status).send({ erro: (erro as Error).message });
      throw erro;
    }
  },
);

app.post<{ Params: { id: string }; Body: PagamentoEntrada }>("/api/contas/:id/pagar", async (req, resp) => {
  const s = exigirPerfil(req, "DIRECAO");
  if (!req.body?.dataPagamento || !req.body?.formaPagamento) {
    return resp.code(400).send({ erro: "Informe data e forma de pagamento." });
  }
  const d: PagamentoEntrada = {
    dataPagamento: validar.dataIso(req.body.dataPagamento, "a data do pagamento", { obrigatorio: true })!,
    formaPagamento: validar.umDe(req.body.formaPagamento, "a forma de pagamento", validar.FORMAS_PAGAMENTO, { obrigatorio: true })!,
  };
  const obsPagamento = validar.texto(req.body.observacoes, "as observações", { max: 2000 });
  if (obsPagamento) d.observacoes = obsPagamento;
  try {
    await registrarPagamento({ userId: s.userId }, req.params.id, d);
    return resp.code(204).send();
  } catch (erro) {
    const status = (erro as { statusCode?: number }).statusCode;
    if (status) return resp.code(status).send({ erro: (erro as Error).message });
    throw erro;
  }
});

// ---------------------------------------------------------------- contratos

app.get("/api/contratos", async (req) => {
  exigirSessao(req);
  return listarContratos();
});

app.post<{ Body: ContratoEntrada }>("/api/contratos", async (req, resp) => {
  const s = exigirPerfil(req, "DIRECAO", "FINANCEIRO");
  if (!req.body?.objeto || !req.body?.dataInicio || req.body?.valorCentavos === undefined) {
    return resp.code(400).send({ erro: "Informe objeto, início e valor." });
  }
  const d = validar.validarContrato(req.body, false) as unknown as ContratoEntrada;
  try {
    return await criarContrato({ userId: s.userId }, d);
  } catch (erro) {
    const status = (erro as { statusCode?: number }).statusCode;
    if (status) return resp.code(status).send({ erro: (erro as Error).message });
    throw erro;
  }
});

app.patch<{ Params: { id: string }; Body: Partial<ContratoEntrada> }>(
  "/api/contratos/:id",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO", "FINANCEIRO");
    const dados = validar.validarContrato(req.body, true) as Partial<ContratoEntrada>;
    try {
      await atualizarContrato({ userId: s.userId }, req.params.id, dados);
      return resp.code(204).send();
    } catch (erro) {
      const status = (erro as { statusCode?: number }).statusCode;
      if (status) return resp.code(status).send({ erro: (erro as Error).message });
      throw erro;
    }
  },
);

// ---------------------------------------------------------------- férias e ausências

app.get("/api/ausencias", async (req) => {
  exigirSessao(req);
  return listarAusencias();
});

app.post<{ Body: AusenciaEntrada }>("/api/ausencias", async (req, resp) => {
  const s = exigirPerfil(req, "DIRECAO", "RH");
  if (!req.body?.funcionarioId || !req.body?.inicio || !req.body?.fim) {
    return resp.code(400).send({ erro: "Informe funcionário, início e fim." });
  }
  const d = validar.validarAusencia(req.body);
  try {
    return await criarAusencia({ userId: s.userId }, d);
  } catch (erro) {
    const msg = (erro as Error).message;
    if (/violates check|violates exclusion|violates foreign key/.test(msg)) {
      return resp.code(422).send({ erro: /exclusion/.test(msg)
        ? "Este período já tem outra ausência sobreposta para a mesma pessoa."
        : msg });
    }
    throw erro;
  }
});

// ---------------------------------------------------------------- lotação de aulas

// Planejamento pedagógico (quem dá quantas aulas em cada turma). Não mexe em
// contrato nem folha, por isso não passa pela aprovação da Direção.
// ---------------------------------------------------------------- hotel: importação do DataHotel
//
// Enviar arquivo → prévia gravada → confirmar ou descartar. A permissão é
// checada aqui, antes de ler ou gravar (matriz em src/dominio/hotel/permissoes.ts).

const ID_HOTEL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exigirAcaoHotel(req: { sessao: Sessao | null }, acao: AcaoHotel): Sessao {
  return exigirPerfil(req, ...perfisQuePodem(acao));
}

app.get("/api/hotel/importacoes", async (req) => {
  exigirAcaoHotel(req, "importacao.ver");
  return { lotes: await hotel.listarLotes(), ultima: await hotel.ultimaImportacao() };
});

app.get<{ Params: { id: string }; Querystring: { situacao?: string } }>(
  "/api/hotel/importacoes/:id/linhas", async (req, resp) => {
    exigirAcaoHotel(req, "importacao.ver");
    if (!ID_HOTEL.test(req.params.id)) return resp.code(400).send({ erro: "Importação inválida." });
    const sit = req.query.situacao;
    if (sit && !["NOVO", "ATUALIZADO", "IDENTICO", "REJEITADO"].includes(sit)) return resp.code(400).send({ erro: "Situação inválida." });
    return hotel.linhasDoLote(req.params.id, sit);
  });

app.post("/api/hotel/importacoes/previa", { bodyLimit: 15 * 1024 * 1024 }, async (req, resp) => {
  const s = exigirAcaoHotel(req, "importacao.enviar");
  const campos: Record<string, string> = {};
  let buffer: Buffer | null = null;
  let nome = "";
  for await (const parte of req.parts()) {
    if (parte.type === "file") {
      if (parte.fieldname === "arquivo" && !buffer) { buffer = await parte.toBuffer(); nome = parte.filename || "arquivo"; }
      else parte.file.resume();
    } else {
      campos[parte.fieldname] = String(parte.value ?? "");
    }
  }
  const tipo = campos.tipo ?? "";
  if (!hotel.tipoValido(tipo)) return resp.code(400).send({ erro: "Escolha o tipo de relatório (hospedagens ou recebimentos)." });
  if (!buffer || !buffer.length) return resp.code(400).send({ erro: "Envie o arquivo exportado do DataHotel (.xlsx ou .csv)." });
  const data = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return hotel.criarPrevia({ userId: s.userId }, {
    tipo, nome, buffer, periodoInicio: data(campos.periodoInicio), periodoFim: data(campos.periodoFim),
  });
});

app.post<{ Params: { id: string } }>("/api/hotel/importacoes/:id/confirmar", async (req, resp) => {
  const s = exigirAcaoHotel(req, "importacao.confirmar");
  if (!ID_HOTEL.test(req.params.id)) return resp.code(400).send({ erro: "Importação inválida." });
  return hotel.confirmar({ userId: s.userId }, req.params.id);
});

app.post<{ Params: { id: string } }>("/api/hotel/importacoes/:id/descartar", async (req, resp) => {
  const s = exigirAcaoHotel(req, "importacao.enviar");
  if (!ID_HOTEL.test(req.params.id)) return resp.code(400).send({ erro: "Importação inválida." });
  return hotel.descartar({ userId: s.userId }, req.params.id);
});

// ---------------------------------------------------------------- hotel: conferência do fechamento
//
// Envia os CSVs do DataHotel, roda as regras e guarda o resultado (histórico).

app.get("/api/hotel/conferencias", async (req) => {
  exigirAcaoHotel(req, "conferencia.ver");
  return { conferencias: await hotelConferencia.listar(), alerta: await hotelConferencia.alertaDoDia() };
});

app.get<{ Params: { conf: string } }>("/api/hotel/conferencias/:conf", async (req, resp) => {
  exigirAcaoHotel(req, "conferencia.ver");
  if (!ID_HOTEL.test(req.params.conf)) return resp.code(400).send({ erro: "Conferência inválida." });
  return hotelConferencia.obter(req.params.conf);
});

app.post("/api/hotel/conferencias", { bodyLimit: 30 * 1024 * 1024 }, async (req, resp) => {
  const s = exigirAcaoHotel(req, "conferencia.executar");
  const campos: Record<string, string> = {};
  const arquivos: Array<{ nome: string; buffer: Buffer }> = [];
  // O limite global é de 1 arquivo; a conferência recebe vários relatórios de uma vez.
  for await (const parte of req.parts({ limits: { files: 30, fileSize: 8 * 1024 * 1024 } })) {
    if (parte.type === "file") {
      if (parte.fieldname === "arquivos") arquivos.push({ nome: parte.filename || "arquivo.csv", buffer: await parte.toBuffer() });
      else parte.file.resume();
    } else {
      campos[parte.fieldname] = String(parte.value ?? "");
    }
  }
  if (!campos.inicio || !campos.fim) return resp.code(400).send({ erro: "Informe o período da conferência (início e fim)." });
  return hotelConferencia.executar({ userId: s.userId }, arquivos, campos.inicio, campos.fim);
});

// ---------------------------------------------------------------- hotel: todas as áreas no banco
//
// Café, enxoval, frigobar, caixa, cartões, boletos, empresas, contas fixas,
// relatório diário e ponto. Permissão e travas de fechamento conferidas em
// servidor/hotel-dados.ts antes de gravar.

app.get("/api/hotel/dados", async (req) => {
  const s = exigirSessao(req);
  return hotelDados.carregar(s.perfis);
});

// O parâmetro se chama `registro` (não `id`): os ids das telas não são UUID,
// e o hook de preValidation recusa qualquer `:id` que não seja.
app.put<{ Params: { colecao: string; registro: string }; Body: { dados?: unknown; versao?: number } }>(
  "/api/hotel/dados/:colecao/:registro", { bodyLimit: 512 * 1024 }, async (req) => {
    const s = exigirSessao(req);
    const versao = typeof req.body?.versao === "number" ? req.body.versao : undefined;
    return hotelDados.gravar({ userId: s.userId }, s.perfis, {
      colecao: req.params.colecao, id: req.params.registro, dados: req.body?.dados, ...(versao !== undefined ? { versao } : {}),
    });
  });

app.delete<{ Params: { colecao: string; registro: string }; Querystring: { motivo?: string } }>(
  "/api/hotel/dados/:colecao/:registro", async (req) => {
    const s = exigirSessao(req);
    return hotelDados.excluir({ userId: s.userId }, s.perfis, req.params.colecao, req.params.registro, String(req.query.motivo ?? ""));
  });

const PERFIS_LOTACAO = ["DIRECAO", "RH", "COORDENACAO"];

function anoDaRota(v: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 2020 || n > 2100) {
    const e = new Error("Ano letivo inválido.") as Error & { statusCode?: number };
    e.statusCode = 400;
    throw e;
  }
  return n;
}
const UUID_EXATO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function idDaRota(v: string): string {
  if (!UUID_EXATO.test(v)) {
    const e = new Error("Registro não encontrado. Atualize a tela (F5).") as Error & { statusCode?: number };
    e.statusCode = 404;
    throw e;
  }
  return v;
}

app.get("/api/lotacao", async (req) => {
  exigirPerfil(req, ...PERFIS_LOTACAO);
  return { anos: await lotacao.anosLotacao() };
});

app.get<{ Params: { ano: string } }>("/api/lotacao/:ano", async (req) => {
  exigirPerfil(req, ...PERFIS_LOTACAO);
  return lotacao.obterLotacao(anoDaRota(req.params.ano));
});

// Recebe o .xlsx do lotacionograma (multipart, campo "arquivo"). Com
// `previa=1` só lê e devolve o que encontrou, sem gravar.
app.post<{ Params: { ano: string } }>(
  "/api/lotacao/:ano/importar",
  { bodyLimit: 15 * 1024 * 1024 },
  async (req, resp) => {
    const s = exigirPerfil(req, ...PERFIS_LOTACAO);
    const ano = anoDaRota(req.params.ano);
    const campos: Record<string, string> = {};
    let buffer: Buffer | null = null;
    for await (const parte of req.parts()) {
      if (parte.type === "file") {
        if (parte.fieldname === "arquivo" && !buffer) buffer = await parte.toBuffer();
        else parte.file.resume();
      } else {
        campos[parte.fieldname] = String(parte.value ?? "");
      }
    }
    if (!buffer) return resp.code(400).send({ erro: "Envie a planilha do lotacionograma (.xlsx)." });
    let lido;
    try {
      lido = await lerLotacionogramaDeBuffer(buffer);
    } catch (e) {
      const msg = e instanceof Error && /lotacionograma/.test(e.message) ? e.message
        : "Não consegui abrir esta planilha. Confira se é um arquivo .xlsx (Excel) e tente de novo.";
      return resp.code(422).send({ erro: msg });
    }
    if (campos.previa === "1") {
      return {
        previa: true, aba: lido.aba, titulo: lido.titulo, turmas: lido.turmas.length, linhas: lido.linhas.length,
        professores: [...new Set(lido.linhas.map((l) => l.professor).filter(Boolean))].length,
        avisos: lido.avisos,
      };
    }
    const r = await lotacao.importarLotacao({ userId: s.userId }, ano, lido, campos.substituir === "1");
    return { ...r, avisos: lido.avisos };
  },
);

app.post<{ Params: { ano: string }; Body: { destino?: number } }>("/api/lotacao/:ano/mover", async (req) => {
  const s = exigirPerfil(req, "DIRECAO");
  return lotacao.moverLotacao({ userId: s.userId }, anoDaRota(req.params.ano), anoDaRota(String(req.body?.destino ?? "")));
});

app.post<{ Params: { ano: string }; Body: { origem?: number } }>("/api/lotacao/:ano/copiar", async (req) => {
  const s = exigirPerfil(req, ...PERFIS_LOTACAO);
  return lotacao.copiarLotacao({ userId: s.userId }, anoDaRota(String(req.body?.origem ?? "")), anoDaRota(req.params.ano));
});

app.post<{ Params: { ano: string }; Body: lotacao.LinhaEntrada }>("/api/lotacao/:ano/linhas", async (req) => {
  const s = exigirPerfil(req, ...PERFIS_LOTACAO);
  return lotacao.criarLinha({ userId: s.userId }, anoDaRota(req.params.ano), req.body ?? {});
});

app.patch<{ Params: { id: string }; Body: lotacao.LinhaEntrada }>("/api/lotacao/linhas/:id", async (req, resp) => {
  const s = exigirPerfil(req, ...PERFIS_LOTACAO);
  await lotacao.atualizarLinha({ userId: s.userId }, idDaRota(req.params.id), req.body ?? {});
  return resp.code(204).send();
});

app.delete<{ Params: { id: string } }>("/api/lotacao/linhas/:id", async (req, resp) => {
  const s = exigirPerfil(req, ...PERFIS_LOTACAO);
  await lotacao.excluirLinha({ userId: s.userId }, idDaRota(req.params.id));
  return resp.code(204).send();
});

app.put<{ Params: { id: string; turmaId: string }; Body: { aulas?: number } }>(
  "/api/lotacao/linhas/:id/aulas/:turmaId",
  async (req, resp) => {
    const s = exigirPerfil(req, ...PERFIS_LOTACAO);
    await lotacao.definirAulas({ userId: s.userId }, idDaRota(req.params.id), idDaRota(req.params.turmaId),
      Number(req.body?.aulas ?? 0));
    return resp.code(204).send();
  },
);

app.put<{ Params: { ano: string }; Body: { turmaId?: string; disciplina?: string; aulas?: number } }>(
  "/api/lotacao/:ano/previsto",
  async (req, resp) => {
    const s = exigirPerfil(req, ...PERFIS_LOTACAO);
    await lotacao.definirPrevisto({ userId: s.userId }, anoDaRota(req.params.ano), idDaRota(String(req.body?.turmaId ?? "")),
      String(req.body?.disciplina ?? ""), Number(req.body?.aulas ?? 0));
    return resp.code(204).send();
  },
);

app.post<{ Params: { ano: string }; Body: { itens?: Array<{ linhaId: string; employeeId: string }> } }>(
  "/api/lotacao/:ano/vincular-com-aprovacao",
  async (req) => {
    const s = exigirPerfil(req, ...PERFIS_LOTACAO);
    const itens = (req.body?.itens ?? []).map((i) => ({ linhaId: idDaRota(String(i?.linhaId ?? "")), employeeId: idDaRota(String(i?.employeeId ?? "")) }));
    return vincularLotacaoComAprovacao({ userId: s.userId }, anoDaRota(req.params.ano), itens);
  },
);

app.post<{ Params: { ano: string } }>("/api/lotacao/:ano/previsto/do-distribuido", async (req) => {
  const s = exigirPerfil(req, ...PERFIS_LOTACAO);
  return lotacao.preverPeloDistribuido({ userId: s.userId }, anoDaRota(req.params.ano));
});

app.post<{ Params: { ano: string }; Body: { codigo?: string; etapa?: string; aulasSemana?: number | null } }>(
  "/api/lotacao/:ano/turmas",
  async (req) => {
    const s = exigirPerfil(req, ...PERFIS_LOTACAO);
    return lotacao.criarTurma({ userId: s.userId }, anoDaRota(req.params.ano), req.body ?? {});
  },
);

app.patch<{ Params: { id: string }; Body: { codigo?: string; aulasSemana?: number | null } }>(
  "/api/lotacao/turmas/:id",
  async (req, resp) => {
    const s = exigirPerfil(req, ...PERFIS_LOTACAO);
    await lotacao.atualizarTurma({ userId: s.userId }, idDaRota(req.params.id), req.body ?? {});
    return resp.code(204).send();
  },
);

app.delete<{ Params: { id: string } }>("/api/lotacao/turmas/:id", async (req, resp) => {
  const s = exigirPerfil(req, ...PERFIS_LOTACAO);
  await lotacao.excluirTurma({ userId: s.userId }, idDaRota(req.params.id));
  return resp.code(204).send();
});

// ---------------------------------------------------------------- banco de horas

app.get("/api/banco-horas", async (req) => {
  exigirSessao(req);
  return listarLancamentosBanco();
});

app.post<{ Body: LancamentoBancoEntrada }>("/api/banco-horas", async (req, resp) => {
  const s = exigirPerfil(req, "DIRECAO", "RH");
  if (!req.body?.funcionarioId || !req.body?.dia || !req.body?.minutos) {
    return resp.code(400).send({ erro: "Informe funcionário, data e horas (diferente de zero)." });
  }
  const d = validar.validarLancamentoBanco(req.body);
  return await criarLancamentoBanco({ userId: s.userId }, d);
});

// ---------------------------------------------------------------- solicitações

app.get("/api/solicitacoes", async (req) => {
  exigirSessao(req);
  return listarSolicitacoes();
});

app.post<{ Body: SolicitacaoEntrada }>("/api/solicitacoes", async (req, resp) => {
  const s = exigirSessao(req);
  if (!req.body?.tipo || !req.body?.titulo || !req.body?.justificativa) {
    return resp.code(400).send({ erro: "Informe tipo, título e justificativa." });
  }
  const d = validar.validarSolicitacao(req.body);
  const perfil = s.perfis[0] || "CONSULTA";
  return abrirSolicitacao({ userId: s.userId }, perfil, d);
});

app.post<{ Params: { id: string }; Body: { decisao: "APROVAR" | "REJEITAR" | "SOLICITAR_ALTERACAO"; comentario?: string } }>(
  "/api/solicitacoes/:id/decidir",
  async (req, resp) => {
    // Nada é aprovado sem passar pela Direção (Vinicius, Fernanda e Dércio).
    const s = exigirPerfil(req, "DIRECAO");
    const d = req.body;
    if (!d?.decisao) return resp.code(400).send({ erro: "Informe a decisão." });
    const comentario = validar.texto(d.comentario, "o comentário", { max: 2000 });
    const perfil = "DIRECAO";
    try {
      return await decidirSolicitacao({ userId: s.userId }, perfil, req.params.id, d.decisao, comentario);
    } catch (erro) {
      const status = (erro as { statusCode?: number }).statusCode;
      if (status) return resp.code(status).send({ erro: (erro as Error).message });
      throw erro;
    }
  },
);

app.post<{ Params: { id: string }; Body: { paraPerfil: string; motivo?: string } }>(
  "/api/solicitacoes/:id/delegar",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO");
    const d = req.body;
    if (!d?.paraPerfil) return resp.code(400).send({ erro: "Informe para quem delegar." });
    validar.umDe(d.paraPerfil, "o perfil de destino", validar.PERFIS_SOLICITACAO, { obrigatorio: true });
    const motivoDelegacao = validar.texto(d.motivo, "o motivo", { max: 1000 });
    const perfil = "DIRECAO";
    try {
      await delegarSolicitacao({ userId: s.userId }, perfil, req.params.id, d.paraPerfil, motivoDelegacao);
      return resp.code(204).send();
    } catch (erro) {
      const status = (erro as { statusCode?: number }).statusCode;
      if (status) return resp.code(status).send({ erro: (erro as Error).message });
      throw erro;
    }
  },
);

// ---------------------------------------------------------------- conectores externos
//
// ClipEscola e Easyschool continuam sendo os sistemas de secretaria,
// matrícula e diário de classe — o Gestão 360 não duplica isso. O que estas
// rotas expõem é só o estado da integração (credencial configurada? a API
// deles responde?), para a Direção acompanhar sem abrir o servidor. As
// funções de busca de dados de verdade entram nos módulos de `conectores/`
// assim que o acesso for liberado e o escopo, decidido.

app.get("/api/conectores/status", async (req) => {
  exigirPerfil(req, "DIRECAO");
  const [statusClip, statusEasy] = await Promise.all([
    clipescola.testarConexao(),
    easyschool.testarConexao(),
  ]);
  return { clipescola: statusClip, easyschool: statusEasy };
});

app.post<{ Params: { sistema: string } }>(
  "/api/conectores/:sistema/testar",
  async (req, resp) => {
    exigirPerfil(req, "DIRECAO");
    const sistema = req.params.sistema.toUpperCase();
    if (sistema === "CLIPESCOLA") return clipescola.testarConexao();
    if (sistema === "EASYSCHOOL") return easyschool.testarConexao();
    return resp.code(404).send({ erro: "Conector desconhecido. Use clipescola ou easyschool." });
  },
);

// ---------------------------------------------------------------- trilha

// Trilha de auditoria expõe alteração técnica bruta do banco (inclusive
// mudança feita por script/psql) — é informação de quem administra o
// sistema, não do dia a dia da Direção/RH/Financeiro. Travado no e-mail de
// quem mantém de verdade, não no perfil: Direção normalmente vê tudo, mas
// este módulo é exceção deliberada.
const EMAIL_ADMINISTRADOR_SISTEMA = "viniciussbrd@gmail.com";

app.get<{ Querystring: { entidade?: string; id?: string; limite?: string } }>(
  "/api/auditoria",
  async (req, resp) => {
    const s = exigirPerfil(req, "DIRECAO", "RH", "FINANCEIRO");
    if (s.email !== EMAIL_ADMINISTRADOR_SISTEMA) {
      return resp.code(403).send({ erro: "O histórico de alterações (auditoria) é restrito ao administrador do sistema." });
    }
    const limite = Math.min(Math.max(Math.trunc(Number(req.query.limite ?? 100)) || 100, 1), 500);
    if (req.query.entidade && req.query.id) {
      return consultar(
        `SELECT a.ocorrido_em, a.acao, a.entidade, a.entidade_id, u.nome AS autor
           FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
          WHERE a.entidade = $1 AND a.entidade_id = $2
          ORDER BY a.ocorrido_em DESC LIMIT $3`,
        [req.query.entidade, req.query.id, limite],
      );
    }
    return consultar(
      `SELECT a.ocorrido_em, a.acao, a.entidade, a.entidade_id, u.nome AS autor
         FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.ocorrido_em DESC LIMIT $1`,
      [limite],
    );
  },
);

// ---------------------------------------------------------------- erros

// Identificador que não tem cara de id (texto solto, "abc") nunca vai existir:
// responde "não encontrado" em vez de deixar o banco reclamar de formato.
app.addHook("preValidation", async (req, resp) => {
  const params = (req.params ?? {}) as Record<string, string>;
  for (const [nome, valor] of Object.entries(params)) {
    if (/^(id|employeeId|funcionarioId)$/.test(nome) && typeof valor === "string" && !validar.UUID_RE.test(valor)) {
      return resp.code(404).send({ erro: "Registro não encontrado. Atualize a tela (F5) e tente de novo." });
    }
  }
});

app.setNotFoundHandler((req, resp) => {
  resp.code(404).send({
    erro: req.url.startsWith("/api/")
      ? "Esta função não existe nesta versão do sistema. Recarregue a página (Ctrl+F5); se continuar, avise o administrador."
      : "Página não encontrada.",
  });
});

app.setErrorHandler((erro: Error & { statusCode?: number }, req, resp) => {
  const status = erro.statusCode ?? 500;
  // O erro de banco que chegou como 500 vira uma frase de uso; o que não for
  // reconhecido ganha um código para o administrador achar no log.
  const porCodigo: Record<string, string> = {
    FST_ERR_CTP_BODY_TOO_LARGE: "Os dados enviados são grandes demais. Reduza o texto ou o arquivo e tente de novo.",
    FST_ERR_CTP_INVALID_JSON_BODY: "Os dados enviados estão em formato inválido. Recarregue a tela (F5) e tente de novo.",
    FST_ERR_CTP_EMPTY_JSON_BODY: "Os dados enviados chegaram vazios. Recarregue a tela (F5) e tente de novo.",
    FST_ERR_CTP_INVALID_MEDIA_TYPE: "Formato de envio não aceito. Recarregue a tela (F5) e tente de novo.",
    FST_ERR_CTP_INVALID_CONTENT_LENGTH: "Os dados enviados chegaram incompletos. Tente de novo.",
  };
  const traduzido = (erro as { code?: string }).code && porCodigo[(erro as { code?: string }).code!]
    ? porCodigo[(erro as { code?: string }).code!]!
    : humanizarErro(String(erro.message ?? ""));
  const conhecido = traduzido !== erro.message;
  const codigo = Date.now().toString(36).toUpperCase().slice(-6);
  if (status >= 500) req.log.error({ err: erro, codigo });
  // Detalhe de erro interno não vai para o cliente: mensagem de banco expõe
  // nome de tabela e estrutura.
  resp.code(conhecido && status >= 500 ? 422 : status).send({
    erro: status >= 500 && !conhecido
      ? `Algo deu errado do nosso lado (código ${codigo}). Tente de novo e, se repetir, avise o administrador com este código e o horário.`
      : traduzido,
  });
});

// Erros que as rotas devolvem como texto cru (ex.: mensagem do banco) também
// passam pelo tradutor antes de chegar à tela.
app.addHook("onSend", async (_req, resp, payload) => {
  if (resp.statusCode < 400 || typeof payload !== "string" || !payload.startsWith("{\"erro\"")) return payload;
  try {
    const corpo = JSON.parse(payload) as { erro?: unknown };
    if (typeof corpo.erro !== "string") return payload;
    const frase = humanizarErro(corpo.erro);
    return frase === corpo.erro ? payload : JSON.stringify({ ...corpo, erro: frase });
  } catch {
    return payload;
  }
});

// ---------------------------------------------------------------- ciclo de vida

const porta = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, async () => {
    app.log.info("encerrando...");
    await app.close();
    await encerrar();
    process.exit(0);
  });
}

try {
  await pool.query("SELECT 1");
  await app.listen({ port: porta, host });
  app.log.info(`Hotel Gestão 360 em http://${host}:${porta}`);
} catch (erro) {
  app.log.error(erro);
  process.exit(1);
}

export { app, criarHashSenha };
