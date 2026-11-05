#!/usr/bin/env node
/**
 * Cria o primeiro acesso e os papéis do sistema.
 *
 *   DATABASE_URL="..." CPF_PEPPER="..." npm run semear -- "Nome" email@escola senha
 *
 * Roda uma vez, na instalação. Depois disso os demais gestores são criados
 * pela própria aplicação.
 */

import { transacao, consultar, encerrar } from "./banco.js";
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

const [nome, email, senha] = process.argv.slice(2);
if (!nome || !email || !senha) {
  console.error('Uso: npm run semear -- "Nome Completo" email@escola.com.br senha');
  process.exit(1);
}
if (senha.length < 10) {
  console.error("A senha precisa de pelo menos 10 caracteres.");
  process.exit(1);
}

const hash = await criarHashSenha(senha);

await transacao({ userId: null }, async (c) => {
  for (const [chave, rotulo, descricao] of PAPEIS) {
    await c.query(
      `INSERT INTO roles (chave, nome, descricao) VALUES ($1, $2, $3)
       ON CONFLICT (chave) DO NOTHING`,
      [chave, rotulo, descricao],
    );
  }

  const u = await c.query(
    `INSERT INTO users (nome, email, senha_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING RETURNING id`,
    [nome, email.trim(), hash],
  );
  if (u.rowCount === 0) {
    console.log(`Usuário ${email} já existe. Nada foi alterado.`);
    return;
  }

  await c.query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE chave = 'DIRECAO'`,
    [u.rows[0].id],
  );
  console.log(`Acesso criado para ${nome} <${email}> com perfil Direção.`);
});

const [{ total }] = await consultar<{ total: string }>("SELECT count(*)::text AS total FROM roles");
console.log(`${total} papéis disponíveis.`);
await encerrar();
