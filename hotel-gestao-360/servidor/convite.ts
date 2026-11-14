/**
 * Convite de acesso: a Direção gera um link de uso único para um e-mail e a pessoa
 * cria a própria senha no navegador. A senha nunca passa por terceiros.
 *   - o link leva um código aleatório; no banco fica só o SHA-256 dele;
 *   - vale por prazo curto (padrão 7 dias) e uma vez só;
 *   - o e-mail e o perfil vêm do convite, não do que a pessoa digitar;
 *   - tentativas limitadas por IP.
 */
import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { consultar, transacao } from "./banco.js";
import { criarHashSenha } from "./autenticacao.js";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
const hashDe = (token: string) => createHash("sha256").update(token).digest("hex");
const TOKEN = /^[A-Za-z0-9_-]{40,80}$/;

interface Convite { id: string; email: string; nome: string; perfis: string[] }

/** Cria o convite e devolve o código (só existe aqui: no banco fica o hash). */
export async function criarConvite(ator: { userId: string | null }, d: { email: string; nome: string; perfis: string[]; dias?: number }): Promise<{ token: string; expiraEm: string }> {
  const token = randomBytes(32).toString("base64url");
  const r = await transacao(ator, async (c) => {
    // Um convite pendente por e-mail: gerar outro invalida o anterior.
    await c.query(`UPDATE convites_acesso SET expira_em = now() WHERE email = $1 AND usado_em IS NULL AND expira_em > now()`, [d.email]);
    return c.query<{ expira: string }>(
      `INSERT INTO convites_acesso (token_hash, email, nome, perfis, expira_em, criado_por)
       VALUES ($1,$2,$3,$4, now() + make_interval(days => $5), $6)
       RETURNING to_char(expira_em AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') AS expira`,
      [hashDe(token), d.email, d.nome, d.perfis, d.dias ?? 7, ator.userId]);
  });
  return { token, expiraEm: r.rows[0]!.expira };
}

async function conviteValido(token: unknown): Promise<Convite | null> {
  if (typeof token !== "string" || !TOKEN.test(token)) return null;
  const r = await consultar<Convite>(
    `SELECT c.id, c.email::text AS email, c.nome, c.perfis FROM convites_acesso c
      WHERE c.token_hash = $1 AND c.usado_em IS NULL AND c.expira_em > now()
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.email = c.email)`, [hashDe(token)]);
  return r[0] ?? null;
}

function pagina(corpo: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Acácia Hotel · Criar acesso</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F6F7F3;color:#171A16;font:16px/1.5 Manrope,system-ui,Segoe UI,Roboto,sans-serif;padding:16px}
main{width:100%;max-width:420px;background:#fff;border:1px solid #E6E8E1;border-radius:18px;padding:30px;box-shadow:0 18px 48px -12px rgba(23,26,22,.14)}
.marca{display:flex;align-items:center;gap:10px;font-weight:700;margin-bottom:22px}
h1{margin:0 0 6px;font-size:22px;letter-spacing:-.02em}p{margin:0 0 16px;color:#5F665C}label{display:block;margin:14px 0 6px;font-size:14px;font-weight:600;color:#5F665C}
input{width:100%;box-sizing:border-box;min-height:46px;padding:10px 12px;border-radius:10px;border:1px solid #BFC4B9;background:#fff;color:#171A16;font:inherit}
input[readonly]{background:#F4F5F1;color:#5F665C}input:focus-visible{outline:3px solid #9CCB8F;outline-offset:2px}
button{margin-top:22px;width:100%;min-height:46px;border:0;border-radius:10px;background:#1B1F1A;color:#fff;font:inherit;font-weight:600;cursor:pointer}
button:disabled{opacity:.6}.erro{color:#A32D43;margin-top:14px;min-height:20px}.ok{color:#2F6B2B}a{color:#2F6B2B}
</style></head><body><main><div class="marca"><svg width="28" height="28" viewBox="0 0 40 40" aria-hidden="true"><path d="M4 18c0-6.5 7.2-11 16-11s16 4.5 16 11z" fill="#9CCB8F"/><path d="M20 35V25m0 2-7-9m7 7 7-7" fill="none" stroke="#171A16" stroke-width="2.4" stroke-linecap="round"/><circle cx="27.5" cy="12" r="2.6" fill="#E3B93F"/></svg>Acácia Hotel</div>${corpo}</main></body></html>`;
}

export function registrarConvite(app: FastifyInstance): void {
  app.get<{ Querystring: { token?: string } }>("/convite", { config: { rateLimit: { max: 30, timeWindow: "10 minutes" } } }, async (req, resp) => {
    resp.header("Cache-Control", "no-store");
    resp.header("Referrer-Policy", "no-referrer");
    resp.type("text/html; charset=utf-8");
    const c = await conviteValido(req.query.token);
    if (!c) return resp.code(404).send(pagina(`<h1>Link indisponível</h1><p>Este convite já foi usado ou venceu. Se você já criou a sua senha, entre pela <a href="/">página inicial</a>. Se não, peça um novo link.</p>`));
    return pagina(`<h1>Crie a sua senha</h1><p>Olá, ${esc(c.nome.split(" ")[0]!)}. Este link é só seu e funciona uma vez.</p>
<form id="f" autocomplete="on">
<label for="email">E-mail (seu login)</label><input id="email" name="email" type="email" autocomplete="username" value="${esc(c.email)}" readonly>
<label for="senha">Senha (mínimo 8 caracteres)</label><input id="senha" name="senha" type="password" autocomplete="new-password" required minlength="8" maxlength="200">
<label for="senha2">Repita a senha</label><input id="senha2" name="senha2" type="password" autocomplete="new-password" required minlength="8" maxlength="200">
<button id="b" type="submit">Criar meu acesso</button><div id="m" class="erro" role="alert"></div></form>
<script>
var f=document.getElementById('f'),m=document.getElementById('m'),b=document.getElementById('b');
f.addEventListener('submit',function(e){e.preventDefault();m.className='erro';m.textContent='';
if(f.senha.value!==f.senha2.value){m.textContent='As senhas não são iguais.';return}
b.disabled=true;
fetch('/api/convite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:new URLSearchParams(location.search).get('token'),senha:f.senha.value})})
.then(function(r){return r.json().catch(function(){return {}}).then(function(d){if(!r.ok)throw new Error(d.erro||'Não foi possível criar o acesso.');return d})})
.then(function(){f.style.display='none';m.className='ok';m.innerHTML='Acesso criado. <a href="/">Entrar no sistema</a>'})
.catch(function(x){m.textContent=x.message;b.disabled=false});});
</script>`);
  });

  app.post<{ Body: { token?: string; senha?: string } }>("/api/convite", { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } }, async (req, resp) => {
    const b = req.body ?? {};
    const senha = String(b.senha ?? "");
    if (senha.length < 8 || senha.length > 200) return resp.code(400).send({ erro: "A senha precisa de pelo menos 8 caracteres." });
    const convite = await conviteValido(b.token);
    if (!convite) return resp.code(404).send({ erro: "Este convite já foi usado ou venceu." });
    const hash = await criarHashSenha(senha);
    const criado = await transacao({ userId: null }, async (c) => {
      // Marca como usado primeiro: dois envios ao mesmo tempo não criam duas contas.
      const u0 = await c.query(`UPDATE convites_acesso SET usado_em = now() WHERE id = $1 AND usado_em IS NULL AND expira_em > now() RETURNING id`, [convite.id]);
      if (!u0.rowCount) return false;
      const u = await c.query<{ id: string }>(`INSERT INTO users (nome, email, senha_hash) VALUES ($1,$2,$3) RETURNING id`, [convite.nome, convite.email, hash]);
      const r = await c.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE chave = ANY($2)`, [u.rows[0]!.id, convite.perfis]);
      if (!r.rowCount) throw new Error("Perfil do convite não existe.");
      return true;
    });
    if (!criado) return resp.code(404).send({ erro: "Este convite já foi usado ou venceu." });
    return { ok: true };
  });
}
