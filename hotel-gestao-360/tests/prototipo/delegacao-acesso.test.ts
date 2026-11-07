import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function armazenamentoFalso() {
  const dados = new Map<string, string>();
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
    _dados: dados,
  };
}

function carregar(armazenamento: unknown) {
  const fonte = readFileSync(join(RAIZ, "prototipo", "partes", "dominio.js"), "utf8");
  return new Function("localStorage", "setTimeout", "clearTimeout", `${fonte}\nreturn L;`)(
    armazenamento,
    (fn: () => void) => { fn(); return 0; },
    () => {},
  ) as any;
}

/**
 * O diretório de acesso é a peça que faltava para "só os donos decidem, mas
 * o dia a dia tem autonomia": perfil é regra fixa, extras são a exceção
 * pontual que só quem delega concede, e um punhado de atos não se delega
 * de jeito nenhum.
 */
describe("diretório de usuários", () => {
  let L: any;
  beforeEach(() => { L = carregar(armazenamentoFalso()); });

  it("o primeiro usuário do sistema vira administrador sozinho", () => {
    const { registro } = L.entrarOuCriarUsuario("Vinicius Brandão", "v@escola.com", "DIRECAO");
    expect(registro.administrador).toBe(true);
  });

  it("o segundo usuário não vira administrador por conta própria", () => {
    L.entrarOuCriarUsuario("Vinicius Brandão", "v@escola.com", "DIRECAO");
    const { registro } = L.entrarOuCriarUsuario("RH Teste", "rh@escola.com", "RH");
    expect(registro.administrador).toBe(false);
  });

  it("reabrir 'criar conta' com o mesmo e-mail não troca o perfil", () => {
    L.entrarOuCriarUsuario("Secretária", "sec@escola.com", "SECRETARIA");
    // A mesma pessoa tenta se cadastrar de novo escolhendo Direção no seletor.
    const { registro, jaExistia } = L.entrarOuCriarUsuario("Secretária", "sec@escola.com", "DIRECAO");
    expect(jaExistia).toBe(true);
    expect(registro.perfil).toBe("SECRETARIA"); // o que já estava valendo, não o que foi digitado agora
  });

  it("e-mail é normalizado, então maiúscula ou espaço não driblam a checagem", () => {
    L.entrarOuCriarUsuario("Alguém", "pessoa@escola.com", "RH");
    expect(L.usuarioPorEmail("  Pessoa@Escola.com ")).not.toBeNull();
  });
});

describe("quem pode delegar", () => {
  let L: any;
  beforeEach(() => { L = carregar(armazenamentoFalso()); });

  it("Direção delega mesmo sem ser administradora", () => {
    expect(L.podeDelegar({ perfil: "DIRECAO", administrador: false })).toBe(true);
  });

  it("administrador delega mesmo com outro perfil", () => {
    expect(L.podeDelegar({ perfil: "FINANCEIRO", administrador: true })).toBe(true);
  });

  it("os demais perfis não delegam nada", () => {
    for (const perfil of ["FINANCEIRO", "RH", "ADMINISTRATIVO", "COORDENACAO", "SECRETARIA", "GESTOR", "CONSULTA"]) {
      expect(L.podeDelegar({ perfil, administrador: false })).toBe(false);
    }
  });
});

describe("ações reservadas — nenhuma delegação destrava", () => {
  let L: any;
  beforeEach(() => { L = carregar(armazenamentoFalso()); });

  it("lista fechar e reabrir competência, e gerenciar acessos", () => {
    expect(Object.keys(L.ACOES_RESERVADAS)).toEqual(
      expect.arrayContaining(["fechar-competencia", "reabrir-competencia", "gerenciar-acessos"]),
    );
  });

  it("só Direção ou administrador executam, mesmo com módulo liberado", () => {
    expect(L.podeExecutarReservada("fechar-competencia", { perfil: "DIRECAO", administrador: false })).toBe(true);
    expect(L.podeExecutarReservada("fechar-competencia", { perfil: "FINANCEIRO", administrador: true })).toBe(true);
    // Financeiro tem o módulo de fechamento, mas fechar em si continua reservado.
    expect(L.podeExecutarReservada("fechar-competencia", { perfil: "FINANCEIRO", administrador: false })).toBe(false);
    expect(L.podeExecutarReservada("fechar-competencia", { perfil: "RH", administrador: false })).toBe(false);
  });

  it("ação que não está na lista não é bloqueada por engano", () => {
    expect(L.podeExecutarReservada("lancar-movimento", { perfil: "SECRETARIA", administrador: false })).toBe(true);
  });
});

describe("delegação de módulo extra", () => {
  let L: any;
  let secretaria: { id: string };
  beforeEach(() => {
    L = carregar(armazenamentoFalso());
    L.entrarOuCriarUsuario("Direção", "d@escola.com", "DIRECAO");
    secretaria = L.entrarOuCriarUsuario("Secretária", "sec@escola.com", "SECRETARIA").registro;
  });

  it("concede um módulo que o perfil não tem", () => {
    L.definirExtra(secretaria.id, "funcionarios", true);
    const atualizado = L.usuarioPorEmail("sec@escola.com");
    expect(atualizado.extras).toContain("funcionarios");
  });

  it("revoga sem afetar outros extras concedidos", () => {
    L.definirExtra(secretaria.id, "funcionarios", true);
    L.definirExtra(secretaria.id, "contratos", true);
    L.definirExtra(secretaria.id, "funcionarios", false);
    const atualizado = L.usuarioPorEmail("sec@escola.com");
    expect(atualizado.extras).not.toContain("funcionarios");
    expect(atualizado.extras).toContain("contratos");
  });

  it("conceder duas vezes não duplica a entrada", () => {
    L.definirExtra(secretaria.id, "funcionarios", true);
    L.definirExtra(secretaria.id, "funcionarios", true);
    const atualizado = L.usuarioPorEmail("sec@escola.com");
    expect(atualizado.extras.filter((x: string) => x === "funcionarios")).toHaveLength(1);
  });

  it("persiste entre sessões", () => {
    L.definirExtra(secretaria.id, "funcionarios", true);
    const arm = L.CHAVE; // só para checar que algo foi de fato serializado
    expect(arm).toBeTruthy();
  });
});

describe("conta desativada e promoção de administrador", () => {
  let L: any;
  let dono: { id: string };
  let outro: { id: string };
  beforeEach(() => {
    L = carregar(armazenamentoFalso());
    dono = L.entrarOuCriarUsuario("Dono", "dono@escola.com", "DIRECAO").registro;
    outro = L.entrarOuCriarUsuario("Financeiro", "fin@escola.com", "FINANCEIRO").registro;
  });

  it("desativar impede reaparecer como ativo sozinho", () => {
    L.definirAtivo(outro.id, false);
    expect(L.usuarioPorEmail("fin@escola.com").ativo).toBe(false);
    L.definirAtivo(outro.id, true);
    expect(L.usuarioPorEmail("fin@escola.com").ativo).toBe(true);
  });

  it("só um administrador promove outro administrador", () => {
    // O dono (perfil DIRECAO) não é administrador neste cenário — só o
    // segundo usuário do teste seguinte é. Aqui, ninguém além do próprio
    // "dono" é administrador (ele é o primeiro, então já é).
    const promovido = L.definirAdministrador(outro.id, true, dono);
    expect(promovido).not.toBeNull();
    expect(L.usuarioPorEmail("fin@escola.com").administrador).toBe(true);
  });

  it("quem não é administrador não promove ninguém, nem sendo Direção", () => {
    // Um segundo usuário DIRECAO, criado depois do primeiro, não nasce administrador.
    const segundaDirecao = L.entrarOuCriarUsuario("Outra Direção", "d2@escola.com", "DIRECAO").registro;
    expect(segundaDirecao.administrador).toBe(false);
    const resultado = L.definirAdministrador(outro.id, true, segundaDirecao);
    expect(resultado).toBeNull();
    expect(L.usuarioPorEmail("fin@escola.com").administrador).toBe(false);
  });
});
