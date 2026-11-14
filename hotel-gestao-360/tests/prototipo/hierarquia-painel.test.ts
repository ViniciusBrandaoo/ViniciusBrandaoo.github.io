import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** localStorage de mentira: o domínio grava nele e nós inspecionamos. */
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
  const fonte = readFileSync(
    join(RAIZ, "prototipo", "partes", "dominio.js"),
    "utf8",
  );
  return new Function("localStorage", "setTimeout", "clearTimeout", `${fonte}\nreturn L;`)(
    armazenamento,
    // Grava na hora: sem o agrupamento assíncrono o teste não precisa esperar.
    (fn: () => void) => { fn(); return 0; },
    () => {},
  ) as any;
}

describe("alçadas por valor", () => {
  const L = carregar(armazenamentoFalso());

  it("dá teto a cada nível e nenhum à direção", () => {
    expect(L.alcadaDe("DIRECAO")).toBeNull();
    expect(L.alcadaDe("GESTOR")).toBe(L.reais(1000));
    expect(L.alcadaDe("CONSULTA")).toBe(0);
  });

  it("deixa o gestor decidir o pequeno e barra o grande", () => {
    expect(L.podeAprovarValor("GESTOR", L.reais(80))).toBe(true);
    expect(L.podeAprovarValor("GESTOR", L.reais(5000))).toBe(false);
  });

  it("nunca deixa quem é somente leitura aprovar", () => {
    expect(L.podeAprovarValor("CONSULTA", L.reais(1))).toBe(false);
    expect(L.podeAprovarValor("SECRETARIA", L.reais(1))).toBe(false);
  });

  it("encurta a cadeia para valor pequeno e alonga para valor grande", () => {
    const pequena = L.cadeiaDeAprovacao(L.reais(80));
    const grande = L.cadeiaDeAprovacao(L.reais(60000));

    expect(pequena[0]).toBe("GESTOR");
    expect(pequena).toHaveLength(1);

    // Acima de todos os tetos, sobe até a direção.
    expect(grande[grande.length - 1]).toBe("DIRECAO");
    expect(grande.length).toBeGreaterThan(pequena.length);
  });

  it("sobe por teto crescente, sem descer no meio do caminho", () => {
    const cadeia = L.cadeiaDeAprovacao(L.reais(18400));
    const tetos = cadeia.map((p: string) => L.alcadaDe(p) ?? Infinity);
    for (let i = 1; i < tetos.length; i++) {
      expect(tetos[i], `${cadeia[i - 1]} → ${cadeia[i]}`).toBeGreaterThan(tetos[i - 1]);
    }
  });

  it("sempre termina em quem pode decidir aquele valor", () => {
    for (const v of [50, 900, 1500, 4000, 18400, 60000, 500000]) {
      const cadeia = L.cadeiaDeAprovacao(L.reais(v));
      const ultimo = cadeia[cadeia.length - 1];
      expect(L.podeAprovarValor(ultimo, L.reais(v)), `valor ${v}`).toBe(true);
    }
  });
});

describe("persistência no navegador", () => {
  let L: any;
  let armazenamento: ReturnType<typeof armazenamentoFalso>;

  beforeEach(() => {
    armazenamento = armazenamentoFalso();
    L = carregar(armazenamento);
    L.estado.usuario = { nome: "Vinicius Brandão", perfil: "DIRECAO" };
  });

  it("grava o que foi cadastrado", () => {
    L.criar("fornecedores", { razaoSocial: "Papelaria Central" });
    expect(armazenamento._dados.has(L.CHAVE)).toBe(true);
    const guardado = JSON.parse(armazenamento._dados.get(L.CHAVE)!);
    expect(guardado.estado.fornecedores).toHaveLength(1);
  });

  it("recupera o estado numa sessão nova", () => {
    L.criar("fornecedores", { razaoSocial: "Papelaria Central" });
    L.criar("contas", {
      descricao: "Material", valor: L.reais(1840),
      competencia: "2026-08", vencimento: "2026-08-20",
    });

    // Outra "aba": mesmo armazenamento, domínio zerado.
    const L2 = carregar(armazenamento);
    expect(L2.estado.fornecedores).toHaveLength(0);
    expect(L2.restaurar()).toBe(true);
    expect(L2.estado.fornecedores).toHaveLength(1);
    expect(L2.estado.contas[0].valor).toBe(L2.reais(1840));
    expect(L2.estado.usuario.nome).toBe("Vinicius Brandão");
  });

  it("recusa dado gravado por uma versão diferente em vez de quebrar", () => {
    L.criar("fornecedores", { razaoSocial: "X" });
    const guardado = JSON.parse(armazenamento._dados.get(L.CHAVE)!);
    guardado.versao = 99;
    armazenamento._dados.set(L.CHAVE, JSON.stringify(guardado));

    const L2 = carregar(armazenamento);
    expect(L2.restaurar()).toBe(false);
    expect(L2.estado.fornecedores).toHaveLength(0);
  });

  it("continua funcionando quando o navegador recusa gravar", () => {
    const bloqueado = {
      getItem: () => null,
      setItem: () => { throw Object.assign(new Error("cheio"), { name: "QuotaExceededError" }); },
      removeItem: () => {},
    };
    const L3 = carregar(bloqueado);
    expect(() => L3.criar("fornecedores", { razaoSocial: "Y" })).not.toThrow();
    expect(L3.estado.fornecedores).toHaveLength(1);
    expect(L3.avisoPersistencia).toMatch(/cheio|anônima|Não foi possível/i);
  });

  it("apaga tudo quando pedido", () => {
    L.criar("fornecedores", { razaoSocial: "X" });
    L.apagarTudo();
    expect(L.estado.fornecedores).toHaveLength(0);
    expect(armazenamento._dados.has(L.CHAVE)).toBe(false);
  });
});

describe("roteamento de solicitação", () => {
  let L: any;
  beforeEach(() => {
    L = carregar(armazenamentoFalso());
    L.estado.usuario = { nome: "Coordenador", perfil: "COORDENACAO" };
  });

  const pedido = (L: any, valor: number) =>
    L.abrirSolicitacao({
      tipo: "COMPRA", titulo: "Cadeiras", justificativa: "Quebradas",
      valor: L.reais(valor), urgencia: "NORMAL",
      solicitante: "Coordenador", perfilSolicitante: "COORDENACAO",
    });

  it("vai para uma pessoa por vez, não para todos", () => {
    const s = pedido(L, 18400);
    expect(L.responsavelPor(s)).toBe("GESTOR");

    // Só o responsável da vez vê como pendência sua.
    expect(L.aguardandoMim("GESTOR")).toHaveLength(1);
    expect(L.aguardandoMim("FINANCEIRO")).toHaveLength(0);
    expect(L.aguardandoMim("ADMINISTRATIVO")).toHaveLength(0);
    expect(L.aguardandoMim("SECRETARIA")).toHaveLength(0);
  });

  it("impede quem não é da vez de decidir", () => {
    const s = pedido(L, 18400);
    expect(L.podeDecidir(s, "GESTOR")).toBe(true);
    expect(L.podeDecidir(s, "FINANCEIRO")).toBe(false);
    expect(L.podeDecidir(s, "ADMINISTRATIVO")).toBe(false);
  });

  it("não aprova de uma vez quando o valor passa da alçada", () => {
    const s = pedido(L, 18400);
    const apos = L.decidirSolicitacao(s, "APROVAR", { nome: "G", perfil: "GESTOR" }, "");
    // Uma aprovação de gestor não finaliza um pedido de R$ 18.400.
    expect(apos).toBe("EM_APROVACAO");
    expect(s.status).not.toBe("APROVADO");
    // Pula a Coordenação: foi ela quem abriu o pedido.
    expect(L.responsavelPor(s)).toBe("ADMINISTRATIVO");
  });

  it("percorre a cadeia inteira até aprovar", () => {
    const s = pedido(L, 18400);
    const visitados: string[] = [];
    let guarda = 0;
    while (L.estaAberta(s) && guarda++ < 10) {
      const quem = L.responsavelPor(s);
      visitados.push(quem);
      L.decidirSolicitacao(s, "APROVAR", { nome: quem, perfil: quem }, "");
    }
    expect(s.status).toBe("APROVADO");
    expect(visitados).toEqual(s.cadeia);
    expect(visitados[visitados.length - 1]).toBe("FINANCEIRO");
  });

  it("aprova numa etapa só quando o valor cabe na primeira alçada", () => {
    const s = pedido(L, 80);
    const apos = L.decidirSolicitacao(s, "APROVAR", { nome: "G", perfil: "GESTOR" }, "");
    expect(apos).toBe("APROVADO");
  });

  it("rejeição encerra sem passar adiante", () => {
    const s = pedido(L, 18400);
    L.decidirSolicitacao(s, "REJEITAR", { nome: "G", perfil: "GESTOR" }, "sem verba");
    expect(s.status).toBe("REJEITADO");
    expect(L.aguardandoMim("COORDENACAO")).toHaveLength(0);
  });

  it("deixa a direção decidir fora da vez, e registra isso", () => {
    const s = pedido(L, 18400);
    expect(L.podeDecidir(s, "DIRECAO")).toBe(true);
    L.decidirSolicitacao(s, "APROVAR", { nome: "Vinicius", perfil: "DIRECAO" }, "urgente");
    expect(s.decisoes[0].naVez).toBe(false);
    expect(s.decisoes[0].perfil).toBe("DIRECAO");
  });

  it("delega a etapa sem mudar o resto da cadeia", () => {
    const s = pedido(L, 18400);
    const cadeiaAntes = [...s.cadeia];
    L.delegar(s, "GESTOR", "ADMINISTRATIVO", { nome: "G", perfil: "GESTOR" }, "de férias");

    expect(s.cadeia).toEqual(cadeiaAntes);
    expect(L.responsavelPor(s)).toBe("ADMINISTRATIVO");
    expect(L.aguardandoMim("ADMINISTRATIVO")).toHaveLength(1);
    expect(L.aguardandoMim("GESTOR")).toHaveLength(0);
    expect(s.decisoes.some((d: any) => d.decisao === "DELEGAR")).toBe(true);
  });

  it("só oferece delegação a quem tem alçada para o valor", () => {
    const s = pedido(L, 18400);
    const candidatos = L.candidatosDelegacao(s, "GESTOR");
    expect(candidatos).toContain("FINANCEIRO");
    expect(candidatos).toContain("DIRECAO");
    expect(candidatos).not.toContain("COORDENACAO"); // teto de R$ 2.000
    expect(candidatos).not.toContain("SECRETARIA");
  });

  it("quem está na cadeia acompanha sem poder agir", () => {
    const s = pedido(L, 18400);
    expect(L.acompanhandoEu("FINANCEIRO")).toHaveLength(1);
    expect(L.podeDecidir(s, "FINANCEIRO")).toBe(false);
    // Quem nem está na cadeia não acompanha nada.
    expect(L.acompanhandoEu("SECRETARIA")).toHaveLength(0);
  });
});

describe("ciclo mensal", () => {
  let L: any;
  beforeEach(() => {
    L = carregar(armazenamentoFalso());
    L.estado.usuario = { nome: "RH", perfil: "RH" };
    L.criar("funcionarios", {
      id: "p1", nome: "Professor", regime: "HORISTA_AULA", status: "ATIVO",
      valorHoraAula: L.reais(25), aulasSemanais: 20, dependentes: 0,
    });
  });

  it("abre uma competência e passa a operar nela", () => {
    L.abrirCompetencia("2026-09");
    expect(L.competenciaAberta()).toBe("2026-09");
    expect(L.periodoDe("2026-09").status).toBe("ABERTO");
  });

  it("copia o movimento do mês anterior ao abrir o seguinte", () => {
    L.abrirCompetencia("2026-09");
    L.lancarMovimento("p1", "2026-09", { aulasExtrasSemanais: 4, valorHoraExtra: L.reais(35) });

    const p = L.abrirCompetencia("2026-10");
    expect(p.movimentosCopiados).toBe(1);

    const outubro = L.movimentoGravado("p1", "2026-10");
    expect(outubro.aulasExtrasSemanais).toBe(4);
    expect(outubro.copiadoDe).toBe("2026-09");
  });

  it("guarda folha diferente em cada competência", () => {
    L.abrirCompetencia("2026-09");
    L.abrirCompetencia("2026-10");
    // Outubro herdou zero extras; agora o professor ganha carga extra.
    L.lancarMovimento("p1", "2026-10", { aulasExtrasSemanais: 4, valorHoraExtra: L.reais(25) });

    const f = L.estado.funcionarios[0];
    const set = L.calcular(f, "2026-09").proventos;
    const out = L.calcular(f, "2026-10").proventos;

    expect(set).toBe(L.reais(2625));
    // 4 aulas/sem × 4,5 × R$ 25 = R$ 450, mais 1/6 de DSR.
    expect(out).toBe(L.reais(3150));
  });

  it("competência fechada não aceita mais lançamento", () => {
    L.abrirCompetencia("2026-09");
    L.lancarMovimento("p1", "2026-09", { aulasExtrasSemanais: 2 });
    L.fecharCompetencia("2026-09");

    expect(L.periodoFechado("2026-09")).toBe(true);
    expect(L.lancarMovimento("p1", "2026-09", { aulasExtrasSemanais: 99 })).toBeNull();
    expect(L.movimentoGravado("p1", "2026-09").aulasExtrasSemanais).toBe(2);
  });

  it("reabrir volta a aceitar, e a reabertura fica na trilha", () => {
    L.abrirCompetencia("2026-09");
    L.fecharCompetencia("2026-09");
    L.reabrirCompetencia("2026-09", "Correção de lançamento antes do envio.");

    expect(L.periodoFechado("2026-09")).toBe(false);
    expect(L.lancarMovimento("p1", "2026-09", { aulasExtrasSemanais: 3 })).not.toBeNull();
    expect(L.estado.auditoria.some((a: any) => /reaberta/.test(a.rotulo))).toBe(true);
  });

  it("sugere sempre o mês seguinte ao último conhecido", () => {
    L.abrirCompetencia("2026-09");
    expect(L.proximaCompetencia()).toBe("2026-10");
    L.abrirCompetencia("2026-10");
    expect(L.proximaCompetencia()).toBe("2026-11");
  });

  it("vira o ano corretamente", () => {
    L.abrirCompetencia("2026-12");
    expect(L.proximaCompetencia()).toBe("2027-01");
    L.abrirCompetencia("2027-01");
    expect(L.periodoDe("2027-01")).not.toBeNull();
  });

  it("não abre a mesma competência duas vezes", () => {
    const a = L.abrirCompetencia("2026-09");
    const b = L.abrirCompetencia("2026-09");
    expect(b).toBe(a);
    expect(L.estado.periodos.filter((p: any) => p.competencia === "2026-09")).toHaveLength(1);
  });

  it("sobrevive ao recarregar", () => {
    const armazenamento = armazenamentoFalso();
    const A = carregar(armazenamento);
    A.estado.usuario = { nome: "RH", perfil: "RH" };
    A.criar("funcionarios", { id: "p1", nome: "P", regime: "HORISTA_AULA", status: "ATIVO",
      valorHoraAula: A.reais(25), aulasSemanais: 20, dependentes: 0 });
    A.abrirCompetencia("2026-09");
    A.lancarMovimento("p1", "2026-09", { aulasExtrasSemanais: 4 });
    A.fecharCompetencia("2026-09");

    const B = carregar(armazenamento);
    B.restaurar();
    expect(B.competenciaAberta()).toBe("2026-09");
    expect(B.periodoFechado("2026-09")).toBe(true);
    expect(B.movimentoGravado("p1", "2026-09").aulasExtrasSemanais).toBe(4);
  });
});

describe("painel configurável", () => {
  let L: any;
  beforeEach(() => {
    L = carregar(armazenamentoFalso());
    L.estado.usuario = { nome: "Teste", perfil: "DIRECAO" };
  });

  it("segue a sugestão do perfil quando ninguém configurou nada", () => {
    // O ponto central: banco de horas por funcionário é ruído na mesa da
    // Direção — ela decide sobre exposição financeira e aprovação, não sobre
    // o saldo de horas de uma pessoa. RH e Financeiro vivem esse dado todo
    // dia, então começam com ele ligado.
    expect(L.blocoVisivel("kpi-banco")).toBe(false);

    L.estado.usuario = { nome: "Teste", perfil: "RH" };
    expect(L.blocoVisivel("kpi-banco")).toBe(true);

    L.estado.usuario = { nome: "Teste", perfil: "FINANCEIRO" };
    expect(L.blocoVisivel("kpi-banco")).toBe(true);
  });

  it("perfil sem sugestão cadastrada não esconde nada por engano", () => {
    L.estado.usuario = { nome: "Teste", perfil: "PERFIL_INEXISTENTE" };
    for (const b of L.BLOCOS_PAINEL) expect(L.blocoVisivel(b.id)).toBe(true);
  });

  it("a escolha do gestor vence a sugestão do perfil", () => {
    expect(L.blocoVisivel("kpi-banco")).toBe(false); // sugestão da Direção
    L.definirBloco("kpi-banco", true);
    expect(L.blocoVisivel("kpi-banco")).toBe(true); // escolha explícita vence
  });

  it("esconde só o que foi desmarcado, sem mexer no resto da sugestão", () => {
    L.definirBloco("kpi-folha", false);
    expect(L.blocoVisivel("kpi-folha")).toBe(false);
    expect(L.blocoVisivel("kpi-pagar7")).toBe(true); // no padrão da Direção, intocado
    // kpi-banco já não aparecia por padrão; kpi-folha foi desmarcado agora.
    expect(L.blocosOcultos()).toBe(2);
  });

  it("restaurar sugestão do perfil volta ao padrão, não a 'mostrar tudo'", () => {
    L.definirBloco("kpi-folha", false);
    L.definirBloco("kpi-banco", true); // Direção decide olhar banco de horas hoje
    L.restaurarPainel();
    // Volta ao padrão da Direção: kpi-banco oculto de novo, kpi-folha visível.
    expect(L.blocoVisivel("kpi-banco")).toBe(false);
    expect(L.blocoVisivel("kpi-folha")).toBe(true);
  });

  it("silencia categoria de alerta sem parar de calculá-la", () => {
    const d = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    L.criar("contratos", {
      objeto: "Licença", status: "ATIVO", valor: L.reais(2400),
      fim: d(20), periodicidade: "MENSAL",
    });

    expect(L.alertas().some((a: any) => /Contrato/.test(a.titulo))).toBe(true);
    L.definirAlerta("contratos", false);
    expect(L.alertas().some((a: any) => /Contrato/.test(a.titulo))).toBe(false);
    // Voltar a ligar recupera o alerta: nada foi perdido.
    L.definirAlerta("contratos", true);
    expect(L.alertas().some((a: any) => /Contrato/.test(a.titulo))).toBe(true);
  });

  it("guarda a preferência entre sessões", () => {
    const armazenamento = armazenamentoFalso();
    const A = carregar(armazenamento);
    A.estado.usuario = { nome: "Teste", perfil: "DIRECAO" };
    A.definirBloco("kpi-folha", false);

    const B = carregar(armazenamento);
    B.restaurar();
    expect(B.blocoVisivel("kpi-folha")).toBe(false);
  });
});

/**
 * Duas regras de controle interno que faltavam. A primeira é segregação de
 * funções: quem pede não assina. A segunda vem da governança da escola —
 * quem responde por ela decide em última instância, e a decisão de quem manda
 * não pode ficar esperando o aval de quem responde a ele.
 */
describe("controle interno na aprovação", () => {
  let L: any;
  beforeEach(() => {
    L = carregar(armazenamentoFalso());
    L.estado.usuario = { nome: "Coordenador", perfil: "COORDENACAO" };
  });

  const pedidoDe = (perfil: string, valor: number) =>
    L.abrirSolicitacao({
      tipo: "COMPRA", titulo: "Cadeiras", justificativa: "Quebradas",
      valor: L.reais(valor), urgencia: "NORMAL",
      solicitante: perfil, perfilSolicitante: perfil,
    });

  it("tira o solicitante da própria cadeia", () => {
    const s = pedidoDe("COORDENACAO", 3000);
    expect(s.cadeia).not.toContain("COORDENACAO");
    expect(s.cadeia).toContain("ADMINISTRATIVO");
  });

  it("recusa o solicitante decidir, mesmo se a vez cair nele", () => {
    const s = pedidoDe("ADMINISTRATIVO", 3000);
    // Força a situação: uma delegação apontando para quem pediu.
    s.delegacoes = { GESTOR: "ADMINISTRATIVO" };
    expect(L.podeDecidir(s, "ADMINISTRATIVO")).toBe(false);
  });

  it("um pedido que só ele mesmo poderia aprovar sobe para a Direção", () => {
    // Financeiro pede R$ 15.000: a única alçada suficiente abaixo da Direção
    // seria a dele. Sem alguém acima, a decisão sobe.
    const s = pedidoDe("FINANCEIRO", 15000);
    expect(s.cadeia).not.toContain("FINANCEIRO");
    expect(s.cadeia[s.cadeia.length - 1]).toBe("DIRECAO");
  });

  it("aprovação da Direção encerra o pedido na hora", () => {
    const s = pedidoDe("SECRETARIA", 18400);
    expect(s.cadeia.length).toBeGreaterThan(1);
    const apos = L.decidirSolicitacao(s, "APROVAR", { nome: "Dércio", perfil: "DIRECAO" }, "urgente");
    expect(apos).toBe("APROVADO");
    expect(L.estaAberta(s)).toBe(false);
  });

  it("e fica registrado que a Direção decidiu fora da vez", () => {
    const s = pedidoDe("SECRETARIA", 18400);
    L.decidirSolicitacao(s, "APROVAR", { nome: "Dércio", perfil: "DIRECAO" }, "urgente");
    expect(s.decisoes[0].naVez).toBe(false);
    expect(s.decisoes[0].perfil).toBe("DIRECAO");
  });

  it("rejeição da Direção também encerra", () => {
    const s = pedidoDe("SECRETARIA", 18400);
    L.decidirSolicitacao(s, "REJEITAR", { nome: "Fernanda", perfil: "DIRECAO" }, "sem verba");
    expect(s.status).toBe("REJEITADO");
  });
});

/**
 * Invariante que quase se perdeu ao tirar o solicitante da cadeia: seja qual
 * for quem pediu e quanto pediu, quem decide por último precisa ter alçada
 * para aquele valor. Sem isto o pedido sai "aprovado" por quem não podia.
 */
describe("invariantes da cadeia com solicitante removido", () => {
  const L = carregar(armazenamentoFalso());
  const PERFIS = ["DIRECAO","FINANCEIRO","RH","ADMINISTRATIVO","COORDENACAO","GESTOR","SECRETARIA","CONSULTA"];
  const VALORES = [0, 50, 900, 1500, 4000, 9000, 15000, 18400, 60000, 500000];

  it("quem fecha a cadeia sempre tem alçada para o valor", () => {
    for (const perfil of PERFIS) {
      for (const v of VALORES) {
        const s = L.abrirSolicitacao({
          tipo: "COMPRA", titulo: "x", valor: L.reais(v),
          solicitante: perfil, perfilSolicitante: perfil,
        });
        const ultimo = s.cadeia[s.cadeia.length - 1];
        expect(
          L.podeAprovarValor(ultimo, L.reais(v)),
          `${perfil} pedindo R$ ${v} terminou em ${ultimo}`,
        ).toBe(true);
      }
    }
  });

  it("nenhuma cadeia sai vazia nem contém o solicitante", () => {
    for (const perfil of PERFIS) {
      for (const v of VALORES) {
        const s = L.abrirSolicitacao({
          tipo: "COMPRA", titulo: "x", valor: L.reais(v),
          solicitante: perfil, perfilSolicitante: perfil,
        });
        expect(s.cadeia.length, `${perfil} / R$ ${v}`).toBeGreaterThan(0);
        if (perfil !== "DIRECAO") {
          expect(s.cadeia, `${perfil} / R$ ${v}`).not.toContain(perfil);
        }
      }
    }
  });

  it("não duplica a Direção quando ela já estava na cadeia", () => {
    const s = L.abrirSolicitacao({
      tipo: "COMPRA", titulo: "x", valor: L.reais(500000),
      solicitante: "FINANCEIRO", perfilSolicitante: "FINANCEIRO",
    });
    expect(s.cadeia.filter((p: string) => p === "DIRECAO")).toHaveLength(1);
  });
});

/**
 * As mesmas CHECK constraints do PostgreSQL, valendo no domínio. Validar só no
 * formulário deixa a porta aberta para importação, script e telas novas.
 */
describe("invariantes de dado", () => {
  let L: any;
  beforeEach(() => {
    L = carregar(armazenamentoFalso());
    L.estado.usuario = { nome: "T", perfil: "DIRECAO" };
  });

  const conta = (extra: Record<string, unknown> = {}) => ({
    descricao: "Material", valor: L.reais(500),
    vencimento: "2026-08-20", competencia: "2026-08", status: "RASCUNHO",
    ...extra,
  });

  it("recusa conta a pagar com valor negativo", () => {
    expect(() => L.criar("contas", conta({ valor: L.reais(-500) }))).toThrow(/maior que zero/);
    expect(L.estado.contas).toHaveLength(0);
  });

  it("recusa conta a pagar com valor zero", () => {
    expect(() => L.criar("contas", conta({ valor: 0 }))).toThrow(/maior que zero/);
  });

  it("recusa conta sem vencimento — o banco tem NOT NULL nessa coluna", () => {
    expect(() => L.criar("contas", conta({ vencimento: undefined }))).toThrow(/vencimento/i);
  });

  it("aceita conta bem formada", () => {
    expect(() => L.criar("contas", conta())).not.toThrow();
    expect(L.estado.contas).toHaveLength(1);
  });

  it("recusa ausência que termina antes de começar", () => {
    expect(() => L.criar("ausencias", {
      funcionarioId: "x", tipo: "FERIAS", inicio: "2026-08-20", fim: "2026-08-10", status: "APROVADA",
    })).toThrow(/antes do início/);
  });

  it("recusa contrato com fim antes do início e com valor não positivo", () => {
    expect(() => L.criar("contratos", {
      objeto: "X", valor: L.reais(100), inicio: "2026-08-01", fim: "2026-07-01",
    })).toThrow(/antes do início/);
    expect(() => L.criar("contratos", {
      objeto: "X", valor: 0, inicio: "2026-01-01", fim: "2026-12-01",
    })).toThrow(/maior que zero/);
  });
});

describe("conta de acesso atravessa virada de versão", () => {
  // Toda vez que o formato dos dados muda (uma categoria nova, um campo
  // novo), a carga de demonstração salva no navegador fica incompatível e é
  // descartada. Mas o diretório de contas não é carga de demonstração — é
  // quem já pode entrar e com que perfil. Perder isso a cada atualização
  // forçaria todo mundo a se cadastrar de novo, e o primeiro a recriar a
  // conta viraria Direção de novo enquanto quem já era Direção cairia para
  // Consulta.
  const usuarioDirecao = {
    id: "id-1", nome: "Vinicius Brandão", email: "vinicius@hotel.com",
    perfil: "DIRECAO", administrador: true, extras: [], ativo: true,
    criadoEm: "2026-08-01T00:00:00.000Z",
  };

  it("preserva o diretório de contas quando o formato dos dados muda", () => {
    const armazenamento = armazenamentoFalso();
    armazenamento.setItem("hotel-gestao-360", JSON.stringify({
      versao: 1, // versão antiga, incompatível com a atual
      gravadoEm: "2026-08-01T00:00:00.000Z",
      estado: {
        usuario: usuarioDirecao,
        usuarios: [usuarioDirecao],
        funcionarios: [{ nome: "Fulano de Tal" }], // carga de demonstração
      },
      preferencias: {},
    }));

    const L = carregar(armazenamento);
    const restaurouTudo = L.restaurar();

    expect(restaurouTudo).toBe(false); // versão antiga: o resto não volta
    expect(L.estado.usuarios).toHaveLength(1);
    expect(L.estado.usuarios[0].email).toBe("vinicius@hotel.com");
    expect(L.estado.usuario?.email).toBe("vinicius@hotel.com");
    expect(L.estado.funcionarios).toHaveLength(0); // demonstração não atravessa

    // A conta preservada já fica gravada, sem esperar um novo login para isso.
    const salvo = JSON.parse(armazenamento._dados.get("hotel-gestao-360")!);
    expect(salvo.estado.usuarios).toHaveLength(1);
  });

  it("não inventa conta nenhuma quando a carga antiga não tinha usuário algum", () => {
    const armazenamento = armazenamentoFalso();
    armazenamento.setItem("hotel-gestao-360", JSON.stringify({
      versao: 1, estado: { usuarios: [] }, preferencias: {},
    }));
    const L = carregar(armazenamento);

    expect(L.restaurar()).toBe(false);
    expect(L.estado.usuarios).toHaveLength(0);
    expect(L.estado.usuario).toBeNull();
  });

  it("com a versão em dia, restaura tudo normalmente — sem tratamento especial", () => {
    const armazenamento = armazenamentoFalso();
    const L1 = carregar(armazenamento);
    L1.estado.usuario = usuarioDirecao;
    L1.estado.usuarios = [usuarioDirecao];
    L1.estado.funcionarios = [{ nome: "Fulano de Tal" }];
    L1.persistir();

    const L2 = carregar(armazenamento);
    expect(L2.restaurar()).toBe(true);
    expect(L2.estado.usuario?.email).toBe("vinicius@hotel.com");
    expect(L2.estado.funcionarios).toHaveLength(1);
  });
});
