/**
 * Gera um link de convite (uso único) para alguém criar a própria senha.
 *   node --import tsx servidor/criar-convite.ts <e-mail> "<nome>" [PERFIL,PERFIL] [dias]
 * Perfil padrão: DIRECAO. O link aparece só aqui: no banco fica apenas o hash.
 */
import { consultar, encerrar } from "./banco.js";
import { criarConvite } from "./convite.js";

const [email, nome, perfisArg, diasArg] = process.argv.slice(2);
if (!email || !nome || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error('Uso: criar-convite.ts <e-mail> "<nome>" [PERFIS] [dias]');
  process.exit(1);
}
const perfis = (perfisArg || "DIRECAO").split(",").map((p) => p.trim().toUpperCase()).filter(Boolean);
const validos = (await consultar<{ chave: string }>("SELECT chave FROM roles")).map((r) => r.chave);
const ruins = perfis.filter((p) => !validos.includes(p));
if (ruins.length) { console.error(`Perfil desconhecido: ${ruins.join(", ")}. Existem: ${validos.join(", ")}`); process.exit(1); }
if ((await consultar("SELECT 1 FROM users WHERE email = $1", [email.toLowerCase()])).length) { console.error("Já existe usuário com este e-mail."); process.exit(1); }
const autor = (await consultar<{ id: string }>("SELECT id FROM users ORDER BY criado_em LIMIT 1"))[0];
const { token, expiraEm } = await criarConvite({ userId: autor?.id ?? null }, { email: email.toLowerCase(), nome: nome.trim(), perfis, dias: Number(diasArg) || 7 });
const base = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "http://localhost:3000";
console.log(`LINK ${base}/convite?token=${token}`);
console.log(`Para ${nome} <${email}> · perfil ${perfis.join(", ")} · vale até ${expiraEm} · uso único`);
await encerrar();
