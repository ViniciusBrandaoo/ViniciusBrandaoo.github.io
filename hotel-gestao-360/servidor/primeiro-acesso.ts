/**
 * Primeiro acesso: cria a PRIMEIRA conta (perfil Direção) por uma página web, sem
 * precisar de linha de comando.
 *
 * Segurança:
 *   - só existe se a variável PRIMEIRO_ACESSO_TOKEN estiver definida no servidor;
 *   - o link leva esse código, comparado em tempo constante;
 *   - só funciona enquanto NÃO existe nenhum usuário (depois do primeiro, fecha para sempre);
 *   - quem cria digita o próprio e-mail e senha no navegador: a senha nunca passa por terceiros;
 *   - tentativas limitadas por IP.
 * Depois da primeira conta, remova a variável do servidor (a rota já fica inerte sem ela).
 */
import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { consultar, transacao } from "./banco.js";
import { criarHashSenha } from "./autenticacao.js";

const PAPEIS: Array<[string, string, string]> = [
  ["DIRECAO", "Direção", "Enxerga tudo e aprova em última instância"],
  ["FINANCEIRO", "Financeiro", "Contas, fechamento, fornecedores e folha"],
  ["RH", "Recursos Humanos", "Pessoas, ponto, folha e férias"],
  ["ADMINISTRATIVO", "Administrativo", "Compras, contratos e documentos"],
  ["COORDENACAO", "Coordenação", "Equipe, ausências e solicitações"],
  ["SECRETARIA", "Secretaria", "Solicitações e documentos"],
  ["GESTOR", "Gestor de equipe", "Aprova o que é da sua equipe"],
  ["CONSULTA", "Consulta", "Somente leitura"],
];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function tokenConfigurado(): string | null {
  const t = process.env.PRIMEIRO_ACESSO_TOKEN;
  return t && t.length >= 20 ? t : null;
}

function tokenConfere(recebido: unknown): boolean {
  const esperado = tokenConfigurado();
  if (!esperado || typeof recebido !== "string") return false;
  const a = Buffer.from(recebido), b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function semUsuarios(): Promise<boolean> {
  const r = await consultar<{ n: number }>("SELECT count(*)::int AS n FROM users");
  return (r[0]?.n ?? 1) === 0;
}

function pagina(corpo: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Primeiro acesso</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1b2d;color:#e8eef7;font:16px/1.5 system-ui,Segoe UI,Roboto,sans-serif;padding:16px}
main{width:100%;max-width:420px;background:#16263d;border:1px solid #2b4163;border-radius:14px;padding:28px}
h1{margin:0 0 6px;font-size:22px}p{margin:0 0 18px;color:#a9bad1}label{display:block;margin:14px 0 6px;font-size:14px;color:#c9d6e8}
input{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:8px;border:1px solid #35507a;background:#0f1b2d;color:#fff;font-size:16px}
button{margin-top:22px;width:100%;padding:12px;border:0;border-radius:8px;background:#e0a526;color:#1b1400;font-weight:700;font-size:16px;cursor:pointer}
button:disabled{opacity:.6}.erro{color:#ff9b9b;margin-top:14px;min-height:20px}.ok{color:#8fe3a3}a{color:#e0a526}
</style></head><body><main>${corpo}</main></body></html>`;
}

export function registrarPrimeiroAcesso(app: FastifyInstance): void {
  app.get<{ Querystring: { token?: string } }>("/primeiro-acesso", async (req, resp) => {
    resp.header("Cache-Control", "no-store");
    resp.header("Referrer-Policy", "no-referrer");
    resp.type("text/html; charset=utf-8");
    if (!tokenConfere(req.query.token) || !(await semUsuarios())) {
      return resp.code(404).send(pagina("<h1>Link indisponível</h1><p>Este link não está mais ativo. Se já criou o seu acesso, entre pela <a href=\"/\">página inicial</a>.</p>"));
    }
    const token = esc(String(req.query.token));
    return pagina(`<h1>Primeiro acesso</h1><p>Crie a conta da Direção do Acácia Hotel. Este link só funciona uma vez.</p>
<form id="f" autocomplete="on">
<label for="nome">Seu nome</label><input id="nome" name="nome" autocomplete="name" required minlength="3" maxlength="120">
<label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="email" required maxlength="200">
<label for="senha">Senha (mínimo 6 caracteres)</label><input id="senha" name="senha" type="password" autocomplete="new-password" required minlength="6" maxlength="200">
<label for="senha2">Repita a senha</label><input id="senha2" name="senha2" type="password" autocomplete="new-password" required minlength="6" maxlength="200">
<button id="b" type="submit">Criar meu acesso</button><div id="m" class="erro" role="alert"></div></form>
<script>
var f=document.getElementById('f'),m=document.getElementById('m'),b=document.getElementById('b');
f.addEventListener('submit',function(e){e.preventDefault();m.className='erro';m.textContent='';
if(f.senha.value!==f.senha2.value){m.textContent='As senhas não são iguais.';return}
b.disabled=true;
fetch('/api/primeiro-acesso',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'${token}',nome:f.nome.value,email:f.email.value,senha:f.senha.value})})
.then(function(r){return r.json().catch(function(){return {}}).then(function(d){if(!r.ok)throw new Error(d.erro||'Não foi possível criar o acesso.');return d})})
.then(function(){f.style.display='none';m.className='ok';m.innerHTML='Acesso criado. <a href="/">Entrar no sistema</a>'})
.catch(function(x){m.textContent=x.message;b.disabled=false});});
</script>`);
  });

  app.post<{ Body: { token?: string; nome?: string; email?: string; senha?: string } }>(
    "/api/primeiro-acesso",
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (req, resp) => {
      const b = req.body ?? {};
      if (!tokenConfere(b.token) || !(await semUsuarios())) {
        return resp.code(404).send({ erro: "Este link não está mais ativo." });
      }
      const nome = String(b.nome ?? "").trim();
      const email = String(b.email ?? "").trim().toLowerCase();
      const senha = String(b.senha ?? "");
      if (nome.length < 3 || nome.length > 120) return resp.code(400).send({ erro: "Informe o seu nome." });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) return resp.code(400).send({ erro: "Informe um e-mail válido." });
      if (senha.length < 6 || senha.length > 200) return resp.code(400).send({ erro: "A senha precisa de pelo menos 6 caracteres." });
      const hash = await criarHashSenha(senha);
      const criado = await transacao({ userId: null }, async (c) => {
        // Trava a tabela: dois envios ao mesmo tempo não criam duas contas.
        await c.query("LOCK TABLE users IN EXCLUSIVE MODE");
        const n = await c.query<{ n: number }>("SELECT count(*)::int AS n FROM users");
        if ((n.rows[0]?.n ?? 1) > 0) return false;
        for (const [chave, rotulo, descricao] of PAPEIS) {
          await c.query(`INSERT INTO roles (chave, nome, descricao) VALUES ($1,$2,$3) ON CONFLICT (chave) DO NOTHING`, [chave, rotulo, descricao]);
        }
        const u = await c.query<{ id: string }>(`INSERT INTO users (nome, email, senha_hash) VALUES ($1,$2,$3) RETURNING id`, [nome, email, hash]);
        await c.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE chave = 'DIRECAO'`, [u.rows[0]!.id]);
        return true;
      });
      if (!criado) return resp.code(404).send({ erro: "Este link não está mais ativo." });
      return { ok: true };
    },
  );
}
