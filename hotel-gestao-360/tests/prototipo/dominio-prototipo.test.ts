import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * O protótipo carrega uma réplica do motor em JavaScript puro, para rodar no
 * navegador sem build. Réplica sem teste é réplica que diverge: estes testes
 * carregam `partes/dominio.js` de verdade e conferem que ele continua batendo
 * com a planilha da escola e com o motor em TypeScript.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface Dominio {
  semAcento(texto: unknown): string;
  reais(v: number): number;
  brl(c: number): string;
  arredondar(v: number): number;
  versao: number;
  estado: { funcionarios: any[]; usuario: unknown; [k: string]: any };
  criar(colecao: string, registro: any): any;
  atualizar(colecao: string, id: string, mudancas: any): any;
  calcular(f: any, competencia?: string): any;
  calcularFolha(contrato: any, movimento: any, f?: any): any;
  calcularInss(base: number, competencia?: string, outrosVinculos?: {
    remuneracao?: number; inssDescontado?: number;
  }): { valor: number; passos: any[] };
  calcularIrrf(tributavel: number, inss: number, dependentes: number, pensao: number, competencia?: string): { valor: number; passos: any[] };
  reabrirCompetencia(comp: string, motivo?: string): { ok: boolean; erro?: string; periodo?: any };
  folhaApurada(funcionarioId: string, comp: string): any;
  conflitoDeVigencia(tipo: string, inicio: string, ignorarId: string | null): any;
  aulasSemanaisDe(f: any): number;
  horaAulaDe(f: any): number;
  alertas(): Array<{ nivel: string; titulo: string }>;
  TABELA_INSS: { conferida: boolean; faixas: any[]; fonte: string };
  TABELA_IRRF: { conferida: boolean; faixas: any[]; fonte: string };
  TABELAS_SEED: any[];
  competenciaAtual(): string;
  tabelaVigente(tipo: string, competencia?: string): any;
  salvarTabela(dados: any): { ok: boolean; problemas?: string[]; registro?: any; encerradas?: any[] };
  validarTabela(t: any): string[];
  tabelaEmUsoPorFechamento(id: string): boolean;
  fecharCompetencia(comp: string): any;
  abrirCompetencia(comp: string): any;
  periodoDe(comp: string): any;
  conferirTabela(id: string, quem: unknown): any;
  duplicarTabela(id: string, inicio: string, fim: string | null): any;
  excluirTabela(id: string): boolean;
  pendenciaTabelas(competencia?: string): Array<{ tipo: string; motivo: string }>;
  funcionarioDaPlanilha(p: any, competencia?: string): any;
  colaboradorDaPlanilha(c: any): any;
  semearTabelas(): boolean;
  VERSAO_SEED: number;
  conferenciaAulas(): any;
  vinculoDe(f: any): any;
  empresaDe(f: any): string;
  DADOS_REAIS_ANY?: any;
  ativos(): any[];
  porNome(lista: any[]): any[];
  CATEGORIAS: Record<string, any>;
  categoriaDe(f: any): string;
  professores(): any[];
  colaboradores(): any[];
  daCategoria(c: string): any[];
  totaisPorCategoria(competencia?: string): any[];
  modulosDe(f: any): any[];
  CCT: Record<string, number | boolean>;
  DADOS_REAIS?: { professores: any[]; historico: any[]; competencia: string };
}

function carregarDominio(comDadosReais: boolean): Dominio {
  const partes = join(RAIZ, "prototipo", "partes");
  let fonte = readFileSync(join(partes, "dominio.js"), "utf8");
  if (comDadosReais) {
    try {
      fonte += "\n" + readFileSync(join(partes, "dados-reais.js"), "utf8");
    } catch {
      /* sem planilha importada: os testes que dependem dela se pulam */
    }
  }
  // O arquivo declara `var L = {}` e pendura tudo nele; devolver `L` no fim
  // entrega o namespace pronto.
  return new Function(`${fonte}\nreturn L;`)() as Dominio;
}

function professor(L: Dominio, extra: Record<string, unknown> = {}) {
  return {
    id: "p1",
    nome: "Professor de Teste",
    regime: "HORISTA_AULA",
    valorHoraAula: L.reais(25),
    aulasSemanais: 20,
    dependentes: 0,
    status: "ATIVO",
    ...extra,
  };
}

/**
 * Repete os valores de 2025 numa vigência que cobre o exercício corrente, só
 * para os testes de aritmética terem tabela. Não é afirmação de que a tabela
 * de 2026 é igual à de 2025 — no sistema quem cadastra isso é o RH, contra o
 * ato oficial.
 */
/** `salvarTabela` devolve `{ ok, registro }`; nos testes só interessa o registro. */
function uma(r: { ok: boolean; problemas?: string[]; registro?: any }) {
  if (!r.ok) throw new Error(`salvarTabela recusou: ${r.problemas?.join(" / ")}`);
  return r.registro;
}

/**
 * O seed já cobre o exercício corrente com a tabela provisória. Para os testes
 * de aritmética o que falta é a conferência — sem ela toda folha sai com
 * divergência, que é o comportamento certo mas atrapalha asserção de valor.
 */
function conferirTabelasDoAnoCorrente(L: Dominio) {
  const comp = L.competenciaAtual();
  const resultado = ["INSS", "IRRF"].map((tipo) => {
    const t = L.tabelaVigente(tipo, comp);
    if (!t) throw new Error(`sem tabela de ${tipo} vigente em ${comp}`);
    L.conferirTabela(t.id, { nome: "RH de Teste" });
    return t;
  });

  // CCT e salário mínimo não têm seed nem tela própria no protótipo local
  // (só chegam de verdade pela API, em modo backend) — para os testes de
  // aritmética chegarem à mesma base "tudo conferido" que `L.calcularFolha`
  // agora exige (mesma trava que o motor real, `motor.ts`, já tinha),
  // simulamos aqui a tabela vigente e conferida das duas categorias.
  const ano = comp.slice(0, 4);
  L.estado.ccts = ["DOCENTE", "ADMINISTRATIVO"].map((categoria) => ({
    id: `cct-teste-${categoria}`, categoria, inicio: `${ano}-01-01`, fim: null, conferida: true,
  }));
  L.estado.salarioMinimo = [
    { id: "sm-teste", inicio: `${ano}-01-01`, fim: null, valor: L.reais(1412), conferida: true },
  ];

  return resultado;
}

describe("réplica do motor no protótipo", () => {
  let L: Dominio;
  beforeEach(() => {
    L = carregarDominio(false);
  });

  it("apura o professor horista igual ao motor em TypeScript", () => {
    const r = L.calcularFolha(
      { regime: "HORISTA_AULA", valorHoraAula: L.reais(25), aulasSemanais: 20, dependentes: 0 },
      { competencia: "2025-08" },
    );
    const rubrica = (cod: string) =>
      r.rubricas.find((x: { cod: string }) => x.cod === cod)?.valor;

    expect(rubrica("101")).toBe(L.reais(2250)); // 20 × 4,5 × R$ 25,00
    expect(rubrica("102")).toBe(L.reais(375)); //  DSR de 1/6
    expect(rubrica("601")).toBe(L.reais(213.48)); // INSS progressivo
    expect(r.liquido).toBe(L.reais(2411.52));
  });

  it("DSR escondido: some como linha e o total continua igual", () => {
    const f = { regime: "HORISTA_AULA", valorHoraAula: L.reais(25), aulasSemanais: 20, dependentes: 0 };
    const normal = L.calcularFolha(f, { competencia: "2025-08" });
    (L as any).estado.configuracoes = { ocultarDsr: true };
    const r = L.calcularFolha(f, { competencia: "2025-08" });
    expect(r.rubricas.some((x: { desc: string }) => /DSR/i.test(x.desc))).toBe(false);
    expect(r.proventos).toBe(normal.proventos);
    expect(r.liquido).toBe(normal.liquido);
  });

  it("soma segmentos com hora-aula diferente", () => {
    const r = L.calcularFolha(
      {
        regime: "HORISTA_AULA",
        dependentes: 0,
        cargas: [
          { segmento: "Fundamental", aulas: 10, valorHora: L.reais(41.6) },
          { segmento: "Fundamental 2", aulas: 20, valorHora: L.reais(41.6) },
        ],
      },
      { competencia: "2026-08" },
    );
    // 30 aulas × R$ 41,60 × 4,5 = R$ 5.616,00, mais 1/6 → R$ 6.552,00
    expect(r.proventos).toBe(L.reais(6552));
  });

  it("trata carga extra semanal como recorrente, não como aula avulsa", () => {
    const semanal = L.calcularFolha(
      { regime: "HORISTA_AULA", valorHoraAula: L.reais(25), aulasSemanais: 20, dependentes: 0 },
      { competencia: "2026-08", aulasExtrasSemanais: 12, valorHoraExtra: L.reais(35) },
    );
    const avulsa = L.calcularFolha(
      { regime: "HORISTA_AULA", valorHoraAula: L.reais(25), aulasSemanais: 20, dependentes: 0 },
      { competencia: "2026-08", aulasSubstituicao: 12, valorHoraExtra: L.reais(35) },
    );
    const val = (r: any, cod: string) =>
      r.rubricas.find((x: { cod: string }) => x.cod === cod)?.valor;

    expect(val(semanal, "111")).toBe(L.reais(1890)); // 12 × 4,5 × 35
    expect(val(avulsa, "113")).toBe(L.reais(420)); //  12 × 35
  });

  it("não deixa base negativa passar calada", () => {
    const r = L.calcularFolha(
      { regime: "HORISTA_AULA", valorHoraAula: L.reais(25), aulasSemanais: 20, dependentes: 0 },
      { competencia: "2026-08", aulasNaoDadas: 200 },
    );
    expect(r.avisos.some((a: { nivel: string }) => a.nivel === "divergencia")).toBe(true);
  });
});

describe("cache de folha", () => {
  let L: Dominio;
  beforeEach(() => {
    L = carregarDominio(false);
    L.estado.usuario = { nome: "Teste", perfil: "DIRECAO" };
    conferirTabelasDoAnoCorrente(L);
  });

  it("devolve o mesmo resultado na segunda chamada", () => {
    const f = L.criar("funcionarios", professor(L));
    const a = L.calcular(f);
    const b = L.calcular(f);
    expect(b).toBe(a); // mesma referência: veio do cache
    expect(a.liquido).toBe(L.reais(2413.06)); // tabela de 2026
  });

  it("invalida ao alterar o funcionário", () => {
    const f = L.criar("funcionarios", professor(L));
    const antes = L.calcular(f).proventos;
    L.atualizar("funcionarios", f.id, { aulasSemanais: 30 });
    const depois = L.calcular(L.estado.funcionarios[0]).proventos;
    expect(depois).toBeGreaterThan(antes);
    expect(depois).toBe(L.reais(3937.5)); // 30 × 4,5 × 25 + 1/6
  });

  it("invalida ao conferir a tabela legal", () => {
    // Recomeça e DERRUBA a conferência editando a tabela, para observar a
    // virada: é o caminho real de uma tabela digitada pelo RH.
    L = carregarDominio(false);
    L.estado.usuario = { nome: "Teste", perfil: "DIRECAO" };
    const vigente = L.tabelaVigente("INSS", L.competenciaAtual());
    L.salvarTabela({ ...vigente, fonte: "digitada" });
    // O seed cobre o exercicio corrente, mas sem conferencia: e isso que a
    // folha acusa como divergencia.
    L.criar("funcionarios", professor(L));

    expect(L.alertas().filter((a) => /bloqueia/.test(a.titulo)).length).toBeGreaterThan(0);

    conferirTabelasDoAnoCorrente(L);

    expect(L.alertas().filter((a) => /bloqueia/.test(a.titulo))).toHaveLength(0);
  });
});

/**
 * `L.estado.tabelas`/`ccts`/`salarioMinimo` em produção vêm crus de
 * `GET /api/tabelas` (`servidor/indice.ts`), nunca do seed interno
 * (`TABELAS_SEED`) nem de `salvarTabela`. Um teste que só passa por esses dois
 * caminhos internos nunca pegaria um nome de campo divergente entre o SQL e o
 * motor: seed e cálculo são editados juntos no mesmo arquivo, então sempre
 * concordam entre si — foi exatamente assim que dois bugs reais sobreviveram
 * em produção (`faixa.deduzir` vs `faixa.parcelaDeduzir`, e os 4 campos do
 * redutor da Lei 15.270/2025 ausentes do SELECT). Este describe monta o
 * payload tal como a API realmente devolve, para fechar essa lacuna.
 */
describe("contrato com /api/tabelas (payload cru)", () => {
  let L: Dominio;
  beforeEach(() => {
    L = carregarDominio(false);
    L.estado.usuario = { nome: "Teste", perfil: "DIRECAO" };
  });

  function tabelaIrrf2026ComRedutor(L: Dominio) {
    return {
      id: "irrf-api", tipo: "IRRF", inicio: "2026-01-01", fim: "2026-12-31",
      porDependente: L.reais(189.59), simplificado: L.reais(607.2),
      fonte: "Tabela do IRRF c/ redutor da Lei 15.270/2025", conferida: true,
      isencaoTotalAte: L.reais(5000), reducaoAte: L.reais(7350),
      reducaoBase: L.reais(978.62), reducaoFator: 0.133157,
      faixas: [
        { ordem: 1, ate: L.reais(2428.8), aliquota: 0, parcelaDeduzir: 0 },
        { ordem: 2, ate: L.reais(2826.65), aliquota: 7.5, parcelaDeduzir: L.reais(182.16) },
        { ordem: 3, ate: L.reais(3751.05), aliquota: 15, parcelaDeduzir: L.reais(394.16) },
        { ordem: 4, ate: L.reais(4664.68), aliquota: 22.5, parcelaDeduzir: L.reais(675.49) },
        { ordem: 5, ate: null, aliquota: 27.5, parcelaDeduzir: L.reais(908.73) },
      ],
    };
  }

  it("calcula IRRF com valor exato numa faixa tributável, fora do redutor", () => {
    L.estado.tabelas = [tabelaIrrf2026ComRedutor(L)];
    const r = L.calcularIrrf(L.reais(10000), L.reais(500), 0, 0, "2026-09");
    expect(Number.isFinite(r.valor)).toBe(true);
    expect(r.valor).toBe(L.reais(1674.29)); // base simplificada 9.392,80 × 27,5% − 908,73
  });

  it("aplica o redutor da Lei 15.270/2025 quando o rendimento cai na faixa de transição", () => {
    L.estado.tabelas = [tabelaIrrf2026ComRedutor(L)];
    const r = L.calcularIrrf(L.reais(6000), L.reais(500), 0, 0, "2026-09");
    expect(Number.isFinite(r.valor)).toBe(true);
    expect(r.valor).toBe(L.reais(394.61));
    expect(r.passos.some((p: { titulo: string }) => /redutor/.test(p.titulo))).toBe(true);
  });

  it("calcula sem erro quando a tabela não tem os 4 campos do redutor (exercício anterior à lei)", () => {
    const semRedutor = { ...tabelaIrrf2026ComRedutor(L),
      isencaoTotalAte: undefined, reducaoAte: undefined, reducaoBase: undefined, reducaoFator: undefined };
    L.estado.tabelas = [semRedutor];
    const r = L.calcularIrrf(L.reais(6000), L.reais(500), 0, 0, "2026-09");
    expect(Number.isFinite(r.valor)).toBe(true);
    expect(r.valor).toBe(L.reais(574.29)); // igual ao imposto de tabela, sem redução
  });
});

/**
 * Mesmo caminho de `L.calcularFolha` que checa INSS/IRRF (linha ~1550) agora
 * também checa CCT e salário mínimo — sem isso, a tela de Folha mostrava
 * "0 divergências" mesmo com a CCT pendente de conferência, porque só
 * INSS/IRRF eram checados. `conferirTabelasDoAnoCorrente` sempre confirma as
 * duas categorias de CCT juntas, então nenhum outro teste do arquivo exercita
 * o estado "com divergência" de CCT/salário mínimo — só este describe faz.
 */
describe("CCT e salário mínimo bloqueando fechamento", () => {
  let L: Dominio;
  const comp = "2026-09";
  beforeEach(() => {
    L = carregarDominio(false);
    L.estado.usuario = { nome: "Teste", perfil: "DIRECAO" };
    conferirTabelasDoAnoCorrente(L);
  });

  function temDivergencia(r: { avisos: Array<{ nivel: string }> }) {
    return r.avisos.some((a) => a.nivel === "divergencia");
  }

  it("acusa divergência quando não há CCT cadastrada para a categoria na competência", () => {
    L.estado.ccts = [];
    const f = professor(L);
    const r = L.calcularFolha(
      { regime: "HORISTA_AULA", valorHoraAula: L.reais(25), aulasSemanais: 20, dependentes: 0 },
      { competencia: comp }, f,
    );
    expect(temDivergencia(r)).toBe(true);
  });

  it("acusa divergência quando a CCT existe mas não foi conferida pelo RH", () => {
    L.estado.ccts = L.estado.ccts.map((c: any) => ({ ...c, conferida: false }));
    const f = professor(L);
    const r = L.calcularFolha(
      { regime: "HORISTA_AULA", valorHoraAula: L.reais(25), aulasSemanais: 20, dependentes: 0 },
      { competencia: comp }, f,
    );
    expect(temDivergencia(r)).toBe(true);
  });

  it("acusa divergência quando falta o salário mínimo vigente para a competência", () => {
    L.estado.salarioMinimo = [];
    const f = professor(L);
    const r = L.calcularFolha(
      { regime: "HORISTA_AULA", valorHoraAula: L.reais(25), aulasSemanais: 20, dependentes: 0 },
      { competencia: comp }, f,
    );
    expect(temDivergencia(r)).toBe(true);
  });

  it("acusa divergência quando o salário mínimo existe mas não foi conferido", () => {
    L.estado.salarioMinimo = L.estado.salarioMinimo.map((m: any) => ({ ...m, conferida: false }));
    const f = professor(L);
    const r = L.calcularFolha(
      { regime: "HORISTA_AULA", valorHoraAula: L.reais(25), aulasSemanais: 20, dependentes: 0 },
      { competencia: comp }, f,
    );
    expect(temDivergencia(r)).toBe(true);
  });

  it("deixa de acusar divergência de CCT/salário mínimo depois que confirmados (par vivo/morto)", () => {
    L.estado.ccts = [];
    L.estado.salarioMinimo = [];
    const f = professor(L);
    const contrato = { regime: "HORISTA_AULA", valorHoraAula: L.reais(25), aulasSemanais: 20, dependentes: 0 };
    expect(temDivergencia(L.calcularFolha(contrato, { competencia: comp }, f))).toBe(true);

    conferirTabelasDoAnoCorrente(L);
    expect(temDivergencia(L.calcularFolha(contrato, { competencia: comp }, f))).toBe(false);
  });

  it("usa a CCT de docentes para professor e a de colaboradores para os demais, sem trocar", () => {
    // Confirma só DOCENTE; ADMINISTRATIVO fica pendente — se o mapeamento de
    // categoria estivesse invertido, o professor acusaria divergência e o
    // colaborador não, o oposto do esperado.
    L.estado.ccts = L.estado.ccts.map((c: any) =>
      c.categoria === "ADMINISTRATIVO" ? { ...c, conferida: false } : c);

    const prof = professor(L);
    const rProf = L.calcularFolha(
      { regime: "HORISTA_AULA", valorHoraAula: L.reais(25), aulasSemanais: 20, dependentes: 0 },
      { competencia: comp }, prof,
    );
    expect(temDivergencia(rProf)).toBe(false);

    const colaborador = { id: "c1", nome: "Colaborador de Teste", regime: "MENSALISTA", salarioBase: L.reais(2000), cargaHoraria: 44, dependentes: 0 };
    const rColab = L.calcularFolha(
      { regime: "MENSALISTA", salarioBase: L.reais(2000), cargaHoraria: 44, dependentes: 0 },
      { competencia: comp }, colaborador,
    );
    expect(temDivergencia(rColab)).toBe(true);
  });
});

/**
 * O bug que originou este cadastro: a tabela de 2025 continuava sendo aplicada
 * em 2026 porque estava fixa no código. Agora ela tem vigência, e fora dela o
 * motor recusa em vez de chutar.
 */
describe("tabela legal por vigência", () => {
  let L: Dominio;
  beforeEach(() => {
    L = carregarDominio(false);
    L.estado.usuario = { nome: "Teste", perfil: "DIRECAO" };
  });

  it("a carga inicial cobre 2025 e 2026, e para em 2026", () => {
    // Cada exercício tem a sua tabela, com os valores daquele ano.
    expect(L.tabelaVigente("INSS", "2025-08").teto).toBe(L.reais(8157.41));
    expect(L.tabelaVigente("INSS", "2026-08").teto).toBe(L.reais(8475.55));

    // 2027 em diante: nada, de propósito. Sem prazo, 2026 valeria para sempre
    // — que é exatamente o bug que este cadastro existe para impedir.
    expect(L.tabelaVigente("INSS", "2027-01")).toBeNull();
  });

  it("a tabela que vem com o sistema nasce conferida e não bloqueia", () => {
    const r = L.calcularFolha(
      { regime: "HORISTA_AULA", valorHoraAula: L.reais(25), aulasSemanais: 20, dependentes: 0 },
      { competencia: "2026-08" },
    );
    expect(r.rubricas.find((x: { cod: string }) => x.cod === "601")?.valor).toBe(L.reais(211.94));
    // Foi verificada contra o ato que ela mesma declara: nada pendente.
    expect(L.pendenciaTabelas("2026-08")).toHaveLength(0);
    expect(L.tabelaVigente("INSS", "2026-08").fonte).toMatch(/Portaria/);
  });

  /**
   * O controle de conferência existe para a tabela DIGITADA — é ali que um
   * dígito trocado numa faixa desconta errado de todo mundo, calado.
   */
  it("editar a tabela derruba a conferência e volta a bloquear", () => {
    expect(L.pendenciaTabelas("2026-08")).toHaveLength(0);

    const t = L.tabelaVigente("INSS", "2026-08");
    const r = L.salvarTabela({ ...t, fonte: "digitada à mão" });
    expect(r.ok).toBe(true);

    expect(L.tabelaVigente("INSS", "2026-08").conferida).toBe(false);
    expect(L.pendenciaTabelas("2026-08").length).toBeGreaterThan(0);
  });

  it("tabela nova cadastrada pelo RH também nasce por conferir", () => {
    const nova = uma(L.salvarTabela({
      tipo: "INSS", inicio: "2027-01", fim: null, fonte: "portaria de 2027",
      faixas: [{ ate: L.reais(9000), aliquota: 10 }], teto: L.reais(9000),
    }));
    expect(nova.conferida).toBe(false);
  });

  it("sem tabela na competência o imposto sai zero, não sai errado", () => {
    const r = L.calcularFolha(
      { regime: "HORISTA_AULA", valorHoraAula: L.reais(25), aulasSemanais: 20, dependentes: 0 },
      { competencia: "2030-08" },
    );
    const inss = r.rubricas.find((x: { cod: string }) => x.cod === "601")?.valor;
    expect(inss).toBe(0);
    expect(r.avisos.some((a: { texto: string }) => /Não há tabela/.test(a.texto))).toBe(true);
  });

  it("cadastrar a tabela do exercício destrava o cálculo daquela competência", () => {
    const t = L.salvarTabela({ ...L.TABELAS_SEED[0], id: null, inicio: "2030-01", fim: null }).registro;
    L.conferirTabela(t.id, { nome: "RH" });
    const r = L.calcularFolha(
      { regime: "HORISTA_AULA", valorHoraAula: L.reais(25), aulasSemanais: 20, dependentes: 0 },
      { competencia: "2030-08" },
    );
    expect(r.rubricas.find((x: { cod: string }) => x.cod === "601")?.valor).toBe(L.reais(213.48));
  });

  it("recalcular uma competência antiga usa a tabela daquela competência", () => {
    // Tabela nova, valores diferentes, vigente só de 2026 em diante.
    const nova = uma(L.salvarTabela({
      tipo: "INSS", inicio: "2030-01", fim: null,
      faixas: [{ ate: L.reais(99999), aliquota: 20 }],
      teto: L.reais(99999), fonte: "hipotética",
    }));
    L.conferirTabela(nova.id, { nome: "RH" });

    const contrato = { regime: "HORISTA_AULA", valorHoraAula: L.reais(25), aulasSemanais: 20, dependentes: 0 };
    const em2025 = L.calcularFolha(contrato, { competencia: "2025-08" });
    const em2030 = L.calcularFolha(contrato, { competencia: "2030-08" });
    const inss = (r: any) => r.rubricas.find((x: { cod: string }) => x.cod === "601")?.valor;

    expect(inss(em2025)).toBe(L.reais(213.48)); // progressivo de 2025
    expect(inss(em2030)).toBe(L.reais(525)); // 20% de 2625, da tabela nova
  });

  it("editar uma tabela conferida derruba a conferência", () => {
    const t = L.salvarTabela({ ...L.TABELAS_SEED[0], id: null, inicio: "2030-01", fim: null }).registro;
    L.conferirTabela(t.id, { nome: "RH" });
    expect(L.tabelaVigente("INSS", "2030-03").conferida).toBe(true);

    // Edição válida: corrige a fonte declarada, mantendo a tabela coerente.
    const r = L.salvarTabela({ ...t, fonte: "Portaria corrigida" });
    expect(r.ok).toBe(true);
    expect(L.tabelaVigente("INSS", "2030-03").conferida).toBe(false);
  });

  /**
   * O banco proíbe vigências sobrepostas por constraint. Aqui a saída é
   * encerrar a anterior no mês antes da nova, que é o que o RH quis dizer ao
   * cadastrar uma tabela nova a partir de maio.
   */
  it("cadastrar uma tabela nova encerra a vigência da anterior", () => {
    const antiga = uma(L.salvarTabela({
      tipo: "INSS", inicio: "2030-01", fim: null,
      faixas: [{ ate: L.reais(99999), aliquota: 10 }], teto: L.reais(99999), fonte: "antiga",
    }));
    expect(antiga.fim).toBeNull();

    const r = L.salvarTabela({
      tipo: "INSS", inicio: "2030-05", fim: null,
      faixas: [{ ate: L.reais(99999), aliquota: 20 }], teto: L.reais(99999), fonte: "nova",
    });
    expect(r.encerradas).toHaveLength(1);

    // A anterior passou a terminar em abril: nenhum mês tem duas tabelas.
    expect(L.tabelaVigente("INSS", "2030-04").id).toBe(antiga.id);
    expect(L.tabelaVigente("INSS", "2030-05").id).toBe(r.registro.id);
    expect(L.estado.tabelas.find((t: any) => t.id === antiga.id).fim).toBe("2030-04");
  });

  it("não encerra uma vigência que já terminava antes da nova começar", () => {
    uma(L.salvarTabela({
      tipo: "INSS", inicio: "2030-01", fim: "2030-03",
      faixas: [{ ate: L.reais(99999), aliquota: 10 }], teto: L.reais(99999), fonte: "curta",
    }));
    const r = L.salvarTabela({
      tipo: "INSS", inicio: "2030-06", fim: null,
      faixas: [{ ate: L.reais(99999), aliquota: 20 }], teto: L.reais(99999), fonte: "nova",
    });
    expect(r.encerradas).toHaveLength(0);
    // Abril e maio ficam descobertos de propósito — melhor recusar do que chutar.
    expect(L.tabelaVigente("INSS", "2030-04")).toBeNull();
  });

  it("pendenciaTabelas separa 'nao existe' de 'nao conferida'", () => {
    expect(L.pendenciaTabelas("2030-08").every((p) => p.motivo === "ausente")).toBe(true);
    const t = L.salvarTabela({ ...L.TABELAS_SEED[0], id: null, inicio: "2030-01", fim: null }).registro;
    const dep = L.pendenciaTabelas("2030-08");
    expect(dep.find((p) => p.tipo === "INSS")?.motivo).toBe("nao-conferida");
    L.conferirTabela(t.id, { nome: "RH" });
    expect(L.pendenciaTabelas("2030-08").find((p) => p.tipo === "INSS")).toBeUndefined();
  });
});

describe("dados importados da planilha da escola", () => {
  const L = carregarDominio(true);
  const temPlanilha = Boolean(L.DADOS_REAIS);

  it.skipIf(!temPlanilha)("carrega os professores da última competência", () => {
    expect(L.DADOS_REAIS!.professores.length).toBeGreaterThan(0);
    // Toda linha precisa ter carga por segmento OU o par aulasSemanais +
    // valorHoraAula (professor novo, ainda fora do PPP por segmento) — sem
    // um dos dois o professor entra zerado.
    expect(
      L.DADOS_REAIS!.professores.every(
        (p: any) => p.cargas?.length > 0 || (p.aulasSemanais > 0 && p.valorHoraAula > 0)
      )
    ).toBe(true);
  });

  it.skipIf(!temPlanilha)(
    "reproduz o total da planilha dentro da tolerância de arredondamento",
    () => {
      L.estado.usuario = { nome: "Teste", perfil: "DIRECAO" };
      // A MESMA conversão que a tela usa. Montar o registro "quase igual"
      // aqui foi o que escondeu a perda dos extras de 19 professores.
      L.DADOS_REAIS!.professores.forEach((p) => {
        L.criar("funcionarios", L.funcionarioDaPlanilha(p, L.DADOS_REAIS!.competencia));
      });

      let sistema = 0;
      let planilha = 0;
      const divergentes: string[] = [];

      for (const f of L.estado.funcionarios) {
        const r = L.calcular(f);
        sistema += r.proventos;
        planilha += f.totalPlanilha;
        // Um real de folga absorve a hora-aula fracionária que a escola usa
        // para fechar totais redondos; acima disso é erro de lançamento.
        if (Math.abs(r.proventos - f.totalPlanilha) > 100) {
          divergentes.push(`${f.nome}: ${L.brl(r.proventos - f.totalPlanilha)}`);
        }
      }

      // A única divergência real conhecida é uma fórmula não arrastada na
      // planilha, que deixa de pagar uma aula extra.
      expect(divergentes).toHaveLength(1);
      expect(divergentes[0]).toMatch(/R\$\s?199,50/);
      expect(Math.abs(sistema - planilha)).toBeLessThan(L.reais(200));
    },
  );
});

/**
 * Digitar tabela de imposto é o ponto do sistema em que um erro de tecla vira
 * desconto errado de todo mundo, todo mês, sem sintoma. O motor em TypeScript
 * e as triggers do banco já validavam; a réplica do protótipo passou a validar
 * junto — senão a tela de digitação é a porta mais frágil das três.
 */
describe("validação da tabela digitada", () => {
  let L: Dominio;
  const inss = (extra: Record<string, unknown> = {}) => ({
    tipo: "INSS", inicio: "2030-01", fim: null, fonte: "teste",
    faixas: [
      { ate: L.reais(1000), aliquota: 7.5 },
      { ate: L.reais(2000), aliquota: 9 },
    ],
    teto: L.reais(2000),
    ...extra,
  });

  beforeEach(() => {
    L = carregarDominio(false);
    L.estado.usuario = { nome: "Teste", perfil: "RH" };
  });

  it("aceita uma tabela bem formada", () => {
    expect(L.validarTabela(inss())).toEqual([]);
  });

  it("recusa faixa fora de ordem crescente", () => {
    const fora = inss({
      faixas: [
        { ate: L.reais(2000), aliquota: 9 },
        { ate: L.reais(1000), aliquota: 7.5 },
      ],
    });
    expect(L.validarTabela(fora).some((p) => /crescentes/.test(p))).toBe(true);
  });

  it("recusa alíquota fora de 0 a 100", () => {
    expect(L.validarTabela(inss({
      faixas: [{ ate: L.reais(2000), aliquota: 900 }],
    })).some((p) => /alíquota/.test(p))).toBe(true);
  });

  it("recusa teto diferente do limite da última faixa do INSS", () => {
    expect(L.validarTabela(inss({ teto: L.reais(9999) })).some((p) => /teto/.test(p))).toBe(true);
  });

  it("recusa IRRF sem exatamente uma faixa aberta", () => {
    const semAberta = {
      tipo: "IRRF", inicio: "2030-01", fim: null, fonte: "teste",
      faixas: [{ ate: L.reais(3000), aliquota: 0, deduzir: 0 }],
      porDependente: L.reais(189.59), simplificado: L.reais(607.2),
    };
    expect(L.validarTabela(semAberta).some((p) => /exatamente uma faixa sem limite/.test(p))).toBe(true);
  });

  it("nada é gravado quando a validação recusa", () => {
    const r = L.salvarTabela(inss({ teto: L.reais(9999) }));
    expect(r.ok).toBe(false);
    expect(L.tabelaVigente("INSS", "2030-03")).toBeNull();
  });
});

/**
 * "Folha fechada congela e não muda mais" é uma das três promessas escritas na
 * tela de acesso. Sem congelar a tabela junto, ela era mentira: bastava o RH
 * corrigir a tabela em novembro para agosto mudar de valor.
 */
describe("competência fechada congela a tabela usada", () => {
  let L: Dominio;
  beforeEach(() => {
    L = carregarDominio(false);
    L.estado.usuario = { nome: "Direção", perfil: "DIRECAO" };
  });

  function fecharAgostoCom(aliquota: number) {
    const t = uma(L.salvarTabela({
      tipo: "INSS", inicio: "2030-01", fim: null, fonte: "vigente",
      faixas: [{ ate: L.reais(99999), aliquota }], teto: L.reais(99999),
    }));
    L.conferirTabela(t.id, { nome: "RH" });
    L.abrirCompetencia("2030-08");
    L.fecharCompetencia("2030-08");
    return t;
  }

  it("guarda uma cópia da tabela no próprio período", () => {
    fecharAgostoCom(10);
    const p = L.periodoDe("2030-08");
    expect(p.tabelasUsadas.INSS.faixas[0].aliquota).toBe(10);
  });

  it("editar a tabela depois não muda a folha já fechada", () => {
    const t = fecharAgostoCom(10);
    const contrato = { regime: "HORISTA_AULA", valorHoraAula: L.reais(25), aulasSemanais: 20, dependentes: 0 };
    const antes = L.calcularFolha(contrato, { competencia: "2030-08" });

    // RH corrige a tabela dois meses depois.
    L.salvarTabela({ ...t, faixas: [{ ate: L.reais(99999), aliquota: 20 }] });

    const depois = L.calcularFolha(contrato, { competencia: "2030-08" });
    const inss = (r: any) => r.rubricas.find((x: { cod: string }) => x.cod === "601")?.valor;
    expect(inss(depois)).toBe(inss(antes));
    expect(inss(depois)).toBe(L.reais(262.5)); // 10% de 2625, a tabela do fechamento
  });

  it("a competência aberta seguinte já usa a tabela corrigida", () => {
    const t = fecharAgostoCom(10);
    L.salvarTabela({ ...t, faixas: [{ ate: L.reais(99999), aliquota: 20 }] });
    L.abrirCompetencia("2030-09");
    expect(L.tabelaVigente("INSS", "2030-09").faixas[0].aliquota).toBe(20);
  });

  it("não deixa apagar a tabela que sustentou um fechamento", () => {
    const t = fecharAgostoCom(10);
    expect(L.tabelaEmUsoPorFechamento(t.id)).toBe(true);
    expect(L.excluirTabela(t.id)).toBe(false);
  });
});

/**
 * Guarda que já existia no motor em TypeScript e faltava na réplica: pagar
 * abaixo do mínimo em jornada integral é risco trabalhista direto, e passava
 * calado no protótipo.
 */
describe("piso do salário mínimo", () => {
  let L: Dominio;
  beforeEach(() => {
    L = carregarDominio(false);
    conferirTabelasDoAnoCorrente(L);
  });

  const mensalista = (salario: number, carga: number) => ({
    regime: "MENSALISTA", salarioBase: L.reais(salario), cargaHoraria: carga, dependentes: 0,
  });
  const comp = { competencia: `${new Date().getFullYear()}-08` };
  const temPiso = (r: any) =>
    r.avisos.some((a: { texto: string }) => /abaixo do mínimo/.test(a.texto));

  it("acusa jornada integral abaixo do mínimo", () => {
    expect(temPiso(L.calcularFolha(mensalista(1200, 44), comp))).toBe(true);
  });

  it("não acusa jornada integral acima do mínimo", () => {
    expect(temPiso(L.calcularFolha(mensalista(3000, 44), comp))).toBe(false);
  });

  it("não acusa meio período, que recebe proporcional", () => {
    expect(temPiso(L.calcularFolha(mensalista(1000, 20), comp))).toBe(false);
  });

  /**
   * Achado real: a planilha de colaboradores não traz a carga horária, e o
   * importador assumia 44h (jornada integral) pra todo mundo. Para quem
   * ganha abaixo do mínimo — quase certamente meio período, senão o valor
   * seria ilegal — isso inventava jornada integral e disparava "abaixo do
   * mínimo" como falso alarme, bloqueando o fechamento por um dado que a
   * própria planilha nunca informou.
   */
  it("colaborador com salário abaixo do mínimo não ganha jornada integral inventada", () => {
    const baixo = L.colaboradorDaPlanilha({
      nome: "Ana Meio Período", cargo: "Auxiliar", admissao: "2026-01-01",
      empresaCodigo: "3", empresa: "ServMA", salarioBase: 48000, descontosFixos: [],
    } as any);
    expect(baixo.cargaHoraria).toBeFalsy();
    expect(temPiso(L.calcularFolha(baixo as any, comp))).toBe(false);

    const cheio = L.colaboradorDaPlanilha({
      nome: "Bruno Tempo Integral", cargo: "Auxiliar", admissao: "2026-01-01",
      empresaCodigo: "3", empresa: "ServMA", salarioBase: 200000, descontosFixos: [],
    } as any);
    expect(cheio.cargaHoraria).toBe(44);
  });
});

/**
 * Achado real: o formulário de cadastro só oferecia professor (hora-aula),
 * mensalista e prestador — faltava o não-docente pago por hora batida
 * (recepção, portaria, manutenção), que o motor em TypeScript e o banco já
 * modelam como HORISTA_RELOGIO. Os valores abaixo espelham exatamente os
 * mesmos casos testados em `tests/folha/regimes.test.ts` contra o motor em
 * TypeScript — a réplica no protótipo não pode divergir desse número.
 */
describe("horista relógio (não-docente por hora batida)", () => {
  let L: Dominio;
  beforeEach(() => {
    L = carregarDominio(false);
    conferirTabelasDoAnoCorrente(L);
  });

  const contrato = (extra: Record<string, unknown> = {}) => ({
    regime: "HORISTA_RELOGIO", valorHora: L.reais(12), horasSemanais: 40, dependentes: 0, ...extra,
  });
  const rub = (r: any, cod: string) => r.rubricas.find((x: { cod: string }) => x.cod === cod)?.valor;

  it("usa o divisor do próprio regime — 5 semanas, não as 4,5 do professor", () => {
    const r = L.calcularFolha(contrato(), { competencia: "2025-08" });
    // 40h × 5 semanas × R$ 12,00 = R$ 2.400,00; DSR de 1/6 = R$ 400,00.
    expect(rub(r, "051")).toBe(L.reais(2400));
    expect(rub(r, "052")).toBe(L.reais(400));
  });

  it("aplica horas extras, DSR sobre extras, faltas e banco de horas do movimento", () => {
    const r = L.calcularFolha(contrato(), {
      competencia: "2025-08", horasExtras50: 20, diasFalta: 2, horasBanco: 5,
    });
    expect(rub(r, "201")).toBe(L.reais(360));
    expect(rub(r, "203")).toBe(L.reais(60));
    expect(rub(r, "521")).toBe(L.reais(160));
    expect(rub(r, "511")).toBe(L.reais(60));
  });

  it("paga adicional noturno sobre as horas do mês", () => {
    const r = L.calcularFolha(contrato(), { competencia: "2025-08", horasNoturnas: 30 });
    expect(rub(r, "221")).toBe(L.reais(72));
  });

  it("categoriaDe classifica horista relógio como colaborador, não professor", () => {
    expect(L.categoriaDe({ regime: "HORISTA_RELOGIO" })).toBe("COLABORADOR");
  });
});

/**
 * Achado real, mesma sessão do horista relógio: faltavam estágio, aprendiz e
 * temporário — os três já existem como `tipo_contrato` no schema do banco
 * (`db/migrations/001_nucleo.sql`), mas nenhum tinha cálculo implementado em
 * lugar nenhum do projeto. Estágio (Lei 11.788/2008) é regime próprio, sem
 * vínculo empregatício; aprendiz e temporário são CLT comum com uma
 * particularidade cada (FGTS reduzido; prazo determinado).
 */
describe("estágio (Lei 11.788/2008 — sem vínculo empregatício)", () => {
  let L: Dominio;
  beforeEach(() => {
    L = carregarDominio(false);
    conferirTabelasDoAnoCorrente(L);
  });
  const estagiario = (extra: Record<string, unknown> = {}) => ({
    regime: "ESTAGIARIO", bolsa: L.reais(1200), auxilioTransporte: L.reais(150),
    dependentes: 0, instituicaoEnsino: "UFMT", ...extra,
  });
  const rub = (r: any, cod: string) => r.rubricas.find((x: { cod: string }) => x.cod === cod)?.valor;

  it("soma bolsa e auxílio-transporte como proventos, sem INSS", () => {
    const r = L.calcular(estagiario(), "2025-08");
    expect(r.proventos).toBe(L.reais(1350));
    expect(rub(r, "601")).toBeUndefined(); // não existe rubrica de INSS
    expect(r.custoEmpregador).toBe(L.reais(1350)); // sem FGTS nem 13º/férias no custo
  });

  it("retém IRRF pela tabela progressiva quando a bolsa ultrapassa a faixa de isenção", () => {
    const r = L.calcular(estagiario({ bolsa: L.reais(4000), auxilioTransporte: 0 }), "2025-08");
    expect(rub(r, "602")).toBeGreaterThan(0);
    expect(r.liquido).toBe(r.proventos - rub(r, "602"));
  });

  it("não gera FGTS: nenhuma rubrica de encargo no cálculo", () => {
    const r = L.calcular(estagiario(), "2025-08");
    expect(r.rubricas.some((x: any) => x.tipo === "E")).toBe(false);
  });

  it("categoriaDe classifica estagiário como colaborador", () => {
    expect(L.categoriaDe({ regime: "ESTAGIARIO" })).toBe("COLABORADOR");
  });
});

describe("aprendiz e temporário (CLT com particularidade)", () => {
  let L: Dominio;
  beforeEach(() => {
    L = carregarDominio(false);
    conferirTabelasDoAnoCorrente(L);
  });
  const mensalista = (tipoContrato?: string) => ({
    regime: "MENSALISTA", salarioBase: L.reais(1200), cargaHoraria: 20, dependentes: 0,
    tipoContrato,
  });
  const comp = { competencia: `${new Date().getFullYear()}-08` };
  const fgts = (r: any) => r.rubricas.find((x: { cod: string }) => x.cod === "801")?.valor;

  it("aprendiz recolhe FGTS a 2%, não os 8% do CLT comum", () => {
    const comum = L.calcularFolha(mensalista(undefined), comp);
    const aprendiz = L.calcularFolha(mensalista("APRENDIZ"), comp);
    expect(fgts(comum)).toBe(Math.round(L.reais(1200) * 0.08));
    expect(fgts(aprendiz)).toBe(Math.round(L.reais(1200) * 0.02));
  });

  it("temporário calcula exatamente igual ao CLT comum — só muda o prazo, não o valor", () => {
    const comum = L.calcularFolha(mensalista(undefined), comp);
    const temporario = L.calcularFolha(mensalista("TEMPORARIO"), comp);
    expect(temporario.liquido).toBe(comum.liquido);
    expect(temporario.custoEmpregador).toBe(comum.custoEmpregador);
    expect(fgts(temporario)).toBe(fgts(comum));
  });
});

/**
 * Achado real, testando o próprio cadastro: um prestador PJ admitido em
 * setembro aparecia pagando na folha de agosto, porque nada no motor olhava
 * a data de admissão contra a competência — só existia "hoje" no cadastro
 * (contratos vencendo), não no cálculo de folha em si. Quem foi admitido dia
 * 25 também recebia o mês inteiro, não os dias trabalhados.
 * `src/dominio/comum/competencia.ts` já resolvia isso no motor em TypeScript;
 * faltava a mesma proporcionalidade na réplica do protótipo.
 */
describe("proporcionalidade por dias trabalhados no mês (janela)", () => {
  let L: Dominio;
  beforeEach(() => {
    L = carregarDominio(false);
    conferirTabelasDoAnoCorrente(L);
  });
  const comp = `${new Date().getFullYear()}-09`; // mês de 30 dias

  it("mensalista admitido no meio do mês recebe proporcional aos dias, não o mês cheio", () => {
    const f = { regime: "MENSALISTA", salarioBase: L.reais(3000), cargaHoraria: 44,
      dependentes: 0, admissao: `${comp}-25`, categoria: "COLABORADOR" };
    const r = L.calcular(f, comp);
    // 6 de 30 dias (25 a 30) × R$ 3.000 = R$ 600,00.
    expect(r.proventos).toBe(L.reais(600));
  });

  it("mensalista admitido antes do mês recebe o valor cheio, sem sinalizar mês parcial", () => {
    const f = { regime: "MENSALISTA", salarioBase: L.reais(3000), cargaHoraria: 44,
      dependentes: 0, admissao: "2020-01-01", categoria: "COLABORADOR" };
    const r = L.calcular(f, comp);
    expect(r.proventos).toBe(L.reais(3000));
    expect(r.avisos.some((a: any) => /admissão/i.test(a.texto))).toBe(false);
  });

  it("mensalista de jornada integral não acusa salário abaixo do mínimo só por causa do mês parcial", () => {
    // R$ 300 é abaixo do mínimo para 44h — mas ele só trabalhou 3 dias.
    const f = { regime: "MENSALISTA", salarioBase: L.reais(3000), cargaHoraria: 44,
      dependentes: 0, admissao: `${comp}-28`, categoria: "COLABORADOR" };
    const r = L.calcular(f, comp);
    expect(r.avisos.some((a: any) => /abaixo do mínimo/.test(a.texto))).toBe(false);
  });

  it("professor horista admitido no meio do mês tem as aulas proporcionalizadas", () => {
    const f = { regime: "HORISTA_AULA", valorHoraAula: L.reais(40), aulasSemanais: 20,
      dependentes: 0, admissao: `${comp}-16`, categoria: "PROFESSOR" };
    const integral = L.calcular({ ...f, admissao: "2020-01-01" }, comp);
    const parcial = L.calcular(f, comp);
    expect(parcial.proventos).toBeLessThan(integral.proventos);
    expect(parcial.proventos).toBeGreaterThan(0);
  });

  it("ninguém pesa na folha de um mês anterior à própria admissão — CLT, PJ e estágio", () => {
    const mesAnterior = "2024-01";
    const mensalista = L.calcular({ regime: "MENSALISTA", salarioBase: L.reais(3000),
      cargaHoraria: 44, dependentes: 0, admissao: "2024-06-01" }, mesAnterior);
    const prestador = L.calcular({ regime: "PRESTADOR_PJ", valorMensal: L.reais(2000),
      enquadramento: "MEI", admissao: "2024-06-01" }, mesAnterior);
    const estagiario = L.calcular({ regime: "ESTAGIARIO", bolsa: L.reais(1200),
      admissao: "2024-06-01" }, mesAnterior);
    [mensalista, prestador, estagiario].forEach((r) => {
      expect(r.custoEmpregador).toBe(0);
      expect(r.avisos.some((a: any) => a.nivel === "divergencia")).toBe(true);
    });
  });

  it("é idempotente: calcular duas vezes o mesmo mês parcial dá o mesmo valor", () => {
    const f = { regime: "MENSALISTA", salarioBase: L.reais(3000), cargaHoraria: 44,
      dependentes: 0, admissao: `${comp}-10` };
    expect(L.calcular(f, comp).proventos).toBe(L.calcular(f, comp).proventos);
  });
});

/**
 * O banco recusa vigências sobrepostas por constraint. Sem o equivalente aqui,
 * duas tabelas começando no mesmo mês conviviam e qual valia dependia da ordem
 * do array — bug encontrado testando o próprio cadastro no navegador.
 */
describe("duas tabelas no mesmo mês", () => {
  let L: Dominio;
  const base = (extra: Record<string, unknown> = {}) => ({
    tipo: "INSS", inicio: "2030-01", fim: null, fonte: "a",
    faixas: [{ ate: L.reais(9000), aliquota: 10 }], teto: L.reais(9000),
    ...extra,
  });

  beforeEach(() => {
    L = carregarDominio(false);
    L.estado.usuario = { nome: "Teste", perfil: "RH" };
  });

  it("recusa cadastrar duas tabelas do mesmo imposto no mesmo mês", () => {
    expect(L.salvarTabela(base()).ok).toBe(true);
    const segunda = L.salvarTabela(base({ fonte: "b" }));
    expect(segunda.ok).toBe(false);
    expect(segunda.problemas?.some((p) => /já existe/i.test(p))).toBe(true);
    expect(L.estado.tabelas.filter((t: any) => t.tipo === "INSS" && t.inicio === "2030-01")).toHaveLength(1);
  });

  it("editar a própria tabela não conflita consigo mesma", () => {
    const t = uma(L.salvarTabela(base()));
    expect(L.salvarTabela({ ...t, fonte: "corrigida" }).ok).toBe(true);
  });

  it("IRRF e INSS podem começar no mesmo mês — são impostos diferentes", () => {
    expect(L.salvarTabela(base()).ok).toBe(true);
    expect(L.salvarTabela({
      tipo: "IRRF", inicio: "2030-01", fim: null, fonte: "ir",
      faixas: [{ ate: null, aliquota: 27.5, deduzir: L.reais(900) }],
      porDependente: L.reais(189.59), simplificado: L.reais(607.2),
    }).ok).toBe(true);
  });

  it("duplicar anda para o próximo mês livre em vez de criar gêmea", () => {
    // 2024-01 esta livre; a carga inicial ocupa 2025-01 e 2026-01.
    const origem = uma(L.salvarTabela({ ...base(), inicio: "2024-01" }));
    uma(L.salvarTabela(base())); // ocupa 2030-01
    const copia = L.duplicarTabela(origem.id, "2030-01", null);
    expect(copia.inicio).toBe("2030-02");
  });

  it("a carga inicial já ocupa janeiro de 2025 e recusa uma gêmea", () => {
    const r = L.salvarTabela({ ...base(), inicio: "2025-01" });
    expect(r.ok).toBe(false);
  });
});

/**
 * Congelar a tabela resolvia metade do problema. A outra metade é o contrato:
 * aumento de professor acontece todo ano, e sem gravar a folha apurada um
 * reajuste em janeiro reescreveria agosto do ano anterior, que já foi pago.
 */
describe("fechamento grava a folha apurada", () => {
  let L: Dominio;
  const COMP = "2026-08"; // coberto pela tabela provisoria do seed

  beforeEach(() => {
    L = carregarDominio(false);
    L.estado.usuario = { nome: "Direção", perfil: "DIRECAO" };
    // O seed ja cobre 2026 com a tabela provisoria; aqui so falta conferir,
    // para a folha poder fechar.
    conferirTabelasDoAnoCorrente(L);
  });

  function fecharComProfessor() {
    const f = L.criar("funcionarios", professor(L));
    L.abrirCompetencia(COMP);
    const antes = L.calcular(f, COMP).proventos;
    L.fecharCompetencia(COMP);
    return { f, antes };
  }

  it("aumento depois do fechamento não altera a folha fechada", () => {
    const { f, antes } = fecharComProfessor();
    L.atualizar("funcionarios", f.id, { valorHoraAula: L.reais(50) }); // dobra a hora-aula
    const depois = L.calcular(L.estado.funcionarios[0], COMP).proventos;
    expect(depois).toBe(antes);
  });

  it("o aumento vale normalmente na competência seguinte", () => {
    const { f, antes } = fecharComProfessor();
    L.atualizar("funcionarios", f.id, { valorHoraAula: L.reais(50) });
    L.abrirCompetencia("2026-09");
    const setembro = L.calcular(L.estado.funcionarios[0], "2026-09").proventos;
    expect(setembro).toBeGreaterThan(antes);
  });

  it("guarda a memória de cálculo, não só o total", () => {
    fecharComProfessor();
    const p = L.periodoDe(COMP);
    const ids = Object.keys(p.folhaApurada);
    expect(ids.length).toBeGreaterThan(0);
    const apurada = p.folhaApurada[ids[0]!];
    expect(apurada.rubricas.length).toBeGreaterThan(0);
    expect(apurada.memoria.length).toBeGreaterThan(0);
  });

  it("reabrir volta a calcular pelo cadastro atual", () => {
    const { f, antes } = fecharComProfessor();
    L.atualizar("funcionarios", f.id, { valorHoraAula: L.reais(50) });
    L.reabrirCompetencia(COMP, "Reabertura para conferir o efeito do reajuste.");
    const reaberta = L.calcular(L.estado.funcionarios[0], COMP).proventos;
    expect(reaberta).toBeGreaterThan(antes);
  });
});

/**
 * Reabrir folha fechada é o ato que auditoria mais questiona. Antes era um
 * clique sem justificativa, sem autor e que apagava o que fora apurado.
 */
describe("reabertura de competência", () => {
  let L: any;
  const COMP = "2026-08"; // coberto pela tabela provisoria do seed

  beforeEach(() => {
    L = carregarDominio(false);
    L.estado.usuario = { nome: "Dércio", perfil: "DIRECAO" };
    conferirTabelasDoAnoCorrente(L);
    L.criar("funcionarios", professor(L));
    L.abrirCompetencia(COMP);
    L.fecharCompetencia(COMP);
  });

  it("recusa reabrir sem justificativa", () => {
    expect(L.reabrirCompetencia(COMP, "").ok).toBe(false);
    expect(L.reabrirCompetencia(COMP, "erro").ok).toBe(false);
    expect(L.periodoDe(COMP).status).toBe("FECHADO");
  });

  it("aceita com justificativa e registra autor, data e motivo", () => {
    const r = L.reabrirCompetencia(COMP, "Faltou lançar 12 aulas extras da professora Ana.");
    expect(r.ok).toBe(true);

    const h = L.periodoDe(COMP).historico[0];
    expect(h.reabertoPor).toBe("Dércio");
    expect(h.motivo).toMatch(/aulas extras/);
    expect(h.reabertoEm).toBeTruthy();
  });

  it("guarda a folha que tinha sido apurada, em vez de apagá-la", () => {
    const antes = L.periodoDe(COMP).folhaApurada;
    L.reabrirCompetencia(COMP, "Correção de lançamento do mês.");
    const h = L.periodoDe(COMP).historico[0];
    expect(Object.keys(h.folhaApurada)).toEqual(Object.keys(antes));
    expect(h.tabelasUsadas.INSS).toBeTruthy();
  });

  it("acumula um registro por ciclo de fechar e reabrir", () => {
    L.reabrirCompetencia(COMP, "Primeira correção do mês.");
    L.fecharCompetencia(COMP);
    L.reabrirCompetencia(COMP, "Segunda correção, nota fiscal atrasada.");
    expect(L.periodoDe(COMP).historico).toHaveLength(2);
  });

  it("o motivo entra na trilha de auditoria", () => {
    L.reabrirCompetencia(COMP, "Faltou lançar 12 aulas extras da professora Ana.");
    expect(L.estado.auditoria.some((a: any) => /aulas extras/.test(a.rotulo))).toBe(true);
  });
});

/**
 * Consolidação de INSS entre vínculos (IN RFB 2.110/2022 art. 66). O motor em
 * TypeScript já fazia; a réplica calculava como se a escola fosse o único
 * emprego. Professor com duas escolas é rotina no Hotel.
 */
describe("INSS com mais de um vínculo", () => {
  let L: any;
  const COMP = "2026-08"; // coberto pela tabela provisoria do seed
  const contrato = { regime: "MENSALISTA", salarioBase: 0, cargaHoraria: 20, dependentes: 0 };

  beforeEach(() => {
    L = carregarDominio(false);
    const t = uma(L.salvarTabela({ ...L.TABELAS_SEED[0], id: null, inicio: "2030-01", fim: null }));
    L.conferirTabela(t.id, { nome: "RH" });
  });

  const inssDe = (r: any) => r.rubricas.find((x: any) => x.cod === "601")?.valor;

  it("sem outro vínculo, calcula sobre a própria remuneração", () => {
    const r = L.calcularFolha({ ...contrato, salarioBase: L.reais(3000) }, { competencia: COMP });
    expect(inssDe(r)).toBe(L.calcularInss(L.reais(3000), COMP).valor);
  });

  it("consolida as duas remunerações e abate o que a outra escola reteve", () => {
    const soComEsta = L.calcularInss(L.reais(3000), COMP).valor;
    const consolidado = L.calcularInss(L.reais(8000), COMP).valor;
    const retidoLa = L.reais(500);

    const r = L.calcularFolha(
      { ...contrato, salarioBase: L.reais(3000) },
      { competencia: COMP, remuneracaoOutrosVinculos: L.reais(5000), inssOutrosVinculos: retidoLa },
    );

    expect(inssDe(r)).toBe(consolidado - retidoLa);
    // O ponto da regra: isolado desconta menos do que o devido no total.
    expect(inssDe(r)).toBeGreaterThan(soComEsta);
  });

  it("respeita o teto único entre vínculos", () => {
    const r = L.calcularFolha(
      { ...contrato, salarioBase: L.reais(5000) },
      { competencia: COMP, remuneracaoOutrosVinculos: L.reais(90000), inssOutrosVinculos: 0 },
    );
    // Base consolidada muito acima do teto: o valor é o do teto, não mais.
    // O teto sai da tabela vigente — fixá-lo aqui faria o teste envelhecer
    // junto com o exercício.
    const teto = L.tabelaVigente("INSS", COMP).teto;
    expect(inssDe(r)).toBe(L.calcularInss(teto, COMP).valor);
  });

  it("nunca desconta abaixo de zero se a outra escola já reteve tudo", () => {
    const r = L.calcularFolha(
      { ...contrato, salarioBase: L.reais(3000) },
      { competencia: COMP, remuneracaoOutrosVinculos: L.reais(2000), inssOutrosVinculos: L.reais(99999) },
    );
    expect(inssDe(r)).toBe(0);
  });

  it("avisa quando informaram a remuneração mas esqueceram o INSS retido", () => {
    const r = L.calcularFolha(
      { ...contrato, salarioBase: L.reais(3000) },
      { competencia: COMP, remuneracaoOutrosVinculos: L.reais(5000) },
    );
    expect(r.avisos.some((a: any) => /outro vínculo sem o INSS/.test(a.texto))).toBe(true);
  });

  it("registra a consolidação na memória de cálculo", () => {
    const r = L.calcularFolha(
      { ...contrato, salarioBase: L.reais(3000) },
      { competencia: COMP, remuneracaoOutrosVinculos: L.reais(5000), inssOutrosVinculos: L.reais(500) },
    );
    expect(r.memoria.some((p: any) => /consolidação de vínculos/i.test(p.titulo))).toBe(true);
    // O fundamento explica a regra em português, sem número de norma.
    expect(r.memoria.some((p: any) => /teto único/i.test(p.fundamento))).toBe(true);
  });
});

/**
 * Os testes de imposto chamavam `calcularFolha` com um movimento literal, o que
 * pulava `movimentoDe` — a projeção que leva o que foi gravado até o motor.
 * Resultado: campo novo salvava e era descartado no caminho, sem nenhum teste
 * vermelho. Estes percorrem o trajeto inteiro, como a tela faz.
 */
describe("do lançamento até o cálculo", () => {
  let L: any;
  const COMP = "2026-08"; // coberto pela tabela provisoria do seed

  beforeEach(() => {
    L = carregarDominio(false);
    L.estado.usuario = { nome: "RH", perfil: "RH" };
    conferirTabelasDoAnoCorrente(L);
    L.abrirCompetencia(COMP);
  });

  const inssDe = (r: any) => r.rubricas.find((x: any) => x.cod === "601")?.valor;

  it("o outro vínculo lançado na tela chega ao motor", () => {
    const f = L.criar("funcionarios", professor(L));
    const semOutro = inssDe(L.calcular(f, COMP));

    L.lancarMovimento(f.id, COMP, {
      remuneracaoOutrosVinculos: L.reais(5000),
      inssOutrosVinculos: L.reais(400),
    });

    const comOutro = inssDe(L.calcular(L.estado.funcionarios[0], COMP));
    expect(comOutro).not.toBe(semOutro);
    expect(L.movimentoDe(f.id, COMP).remuneracaoOutrosVinculos).toBe(L.reais(5000));
  });

  it("todo campo do formulário de movimento sobrevive à projeção", () => {
    const f = L.criar("funcionarios", professor(L));
    const lancado = {
      aulasExtrasSemanais: 3, valorHoraExtra: L.reais(30), aulasSubstituicao: 4,
      aulasNoturnas: 2, aulasNaoDadas: 1, semanasFalta: 1,
      valeTransporte: L.reais(200),
      remuneracaoOutrosVinculos: L.reais(1000), inssOutrosVinculos: L.reais(90),
    };
    L.lancarMovimento(f.id, COMP, lancado);

    const projetado = L.movimentoDe(f.id, COMP);
    for (const [campo, valor] of Object.entries(lancado)) {
      expect(projetado[campo], `campo "${campo}" se perdeu em movimentoDe`).toBe(valor);
    }
  });
});

/**
 * Quem confere folha lê com a planilha do lado. Lista fora de ordem é o que
 * faz a conferência demorar.
 */
describe("ordem alfabética", () => {
  let L: Dominio;
  beforeEach(() => {
    L = carregarDominio(false);
    L.estado.usuario = { nome: "T", perfil: "RH" };
  });

  it("lista os ativos em ordem, com acento no lugar certo", () => {
    ["Zuleica Alves", "Álvaro Nunes", "amanda Rocha", "Beatriz Lima"].forEach((nome) =>
      L.criar("funcionarios", { nome, regime: "MENSALISTA", salarioBase: L.reais(3000), status: "ATIVO" }),
    );
    expect(L.ativos().map((f: any) => f.nome)).toEqual([
      "Álvaro Nunes", "amanda Rocha", "Beatriz Lima", "Zuleica Alves",
    ]);
  });

  it("ordenar não altera a lista guardada", () => {
    L.criar("funcionarios", { nome: "Zuleica", regime: "MENSALISTA", salarioBase: L.reais(3000), status: "ATIVO" });
    L.criar("funcionarios", { nome: "Ana", regime: "MENSALISTA", salarioBase: L.reais(3000), status: "ATIVO" });
    L.ativos();
    // A ordem de cadastro é histórico: quem reordena é a leitura, não o dado.
    expect(L.estado.funcionarios.map((f: any) => f.nome)).toEqual(["Zuleica", "Ana"]);
  });
});

/**
 * O cache era chaveado por um contador global: qualquer gravação no sistema
 * derrubava o resultado de todo mundo, e corrigir o telefone de uma pessoa
 * recalculava a folha inteira. Agora a chave são os insumos — o que só é
 * seguro porque o motor é puro, e é isso que estes testes protegem.
 */
describe("cache chaveado por insumo", () => {
  let L: Dominio;
  let execucoes: number;

  function espionar() {
    execucoes = 0;
    const orig = (L as any).calcularFolha;
    (L as any).calcularFolha = function (...a: unknown[]) {
      execucoes++;
      return orig.apply(this, a);
    };
  }

  beforeEach(() => {
    L = carregarDominio(false);
    L.estado.usuario = { nome: "T", perfil: "DIRECAO" };
    conferirTabelasDoAnoCorrente(L);
    for (let i = 0; i < 5; i++) {
      L.criar("funcionarios", professor(L, { id: `p${i}`, nome: `Professor ${i}` }));
    }
  });

  it("editar uma pessoa não recalcula as outras", () => {
    L.ativos().forEach((f: any) => L.calcular(f)); // aquece
    espionar();

    L.atualizar("funcionarios", "p0", { aulasSemanais: 30 });
    L.ativos().forEach((f: any) => L.calcular(f));

    expect(execucoes).toBe(1);
  });

  it("mas o resultado de quem mudou muda de verdade", () => {
    const antes = L.calcular(L.estado.funcionarios[0]).proventos;
    L.atualizar("funcionarios", "p0", { aulasSemanais: 30 });
    const depois = L.calcular(L.estado.funcionarios.find((f: any) => f.id === "p0")).proventos;
    expect(depois).toBeGreaterThan(antes);
  });

  it("trocar a tabela legal recalcula todo mundo", () => {
    L.ativos().forEach((f: any) => L.calcular(f));
    espionar();

    const t = L.tabelaVigente("INSS", L.competenciaAtual());
    L.salvarTabela({ ...t, fonte: "outra fonte" });
    L.ativos().forEach((f: any) => L.calcular(f));

    // A tabela entra na chave: mudou para todos, recalcula para todos.
    expect(execucoes).toBe(5);
  });

  it("cadastrar alguém novo não recalcula os que já existiam", () => {
    L.ativos().forEach((f: any) => L.calcular(f));
    espionar();

    L.criar("funcionarios", professor(L, { id: "novo", nome: "Recém-chegado" }));
    L.ativos().forEach((f: any) => L.calcular(f));

    expect(execucoes).toBe(1);
  });
});

/**
 * As tabelas de 2026 não chegavam a quem já tinha usado o sistema: a carga
 * inicial só rodava com a lista vazia, então o estado salvo no navegador
 * ficava preso à carga antiga e a folha acusava "não há tabela para esta
 * competência". Agora a carga reconcilia — sem nunca pisar no que a pessoa
 * cadastrou ou editou.
 */
describe("carga inicial alcança quem já usou o sistema", () => {
  let L: Dominio;
  beforeEach(() => {
    L = carregarDominio(false);
    L.estado.usuario = { nome: "T", perfil: "RH" };
  });

  it("traz tabela nova para um estado salvo que não a tinha", () => {
    // Simula o estado antigo: só a de 2025, como quem abriu o sistema antes.
    L.estado.tabelas = L.estado.tabelas.filter((t: any) => t.inicio.startsWith("2025"));
    expect(L.tabelaVigente("INSS", "2026-08")).toBeNull();

    L.semearTabelas();

    expect(L.tabelaVigente("INSS", "2026-08")).not.toBeNull();
    expect(L.pendenciaTabelas("2026-08")).toHaveLength(0);
  });

  it("atualiza a tabela do sistema quando a carga muda de versão", () => {
    const t = L.estado.tabelas.find((x: any) => x.id === "inss-2026");
    t.teto = L.reais(1); // simula valor antigo
    t.origemSeed = 1; // e uma carga anterior

    L.semearTabelas();

    expect(L.tabelaVigente("INSS", "2026-08").teto).toBe(L.reais(8475.55));
  });

  it("NÃO toca na tabela que alguém editou", () => {
    const t = L.tabelaVigente("INSS", "2026-08");
    const r = L.salvarTabela({ ...t, fonte: "corrigida pelo RH" });
    expect(r.ok).toBe(true);
    // Editar tira a marca de carga: a tabela passou a ser de quem a digitou.
    expect(L.tabelaVigente("INSS", "2026-08").origemSeed).toBeUndefined();

    L.semearTabelas();

    expect(L.tabelaVigente("INSS", "2026-08").fonte).toBe("corrigida pelo RH");
    expect(L.tabelaVigente("INSS", "2026-08").conferida).toBe(false);
  });

  it("não duplica ao rodar duas vezes", () => {
    const antes = L.estado.tabelas.length;
    L.semearTabelas();
    L.semearTabelas();
    expect(L.estado.tabelas.length).toBe(antes);
  });
});

/**
 * Professor e colaborador são duas folhas com regras diferentes: um é pago por
 * hora-aula com carga por módulo, o outro tem salário e jornada. Somá-los numa
 * lista só obriga a ler uma tabela cuja metade das colunas não se aplica.
 */
describe("professores e colaboradores", () => {
  let L: Dominio;
  beforeEach(() => {
    L = carregarDominio(false);
    L.estado.usuario = { nome: "T", perfil: "RH" };
    conferirTabelasDoAnoCorrente(L);
    L.criar("funcionarios", professor(L, { id: "p1", nome: "Ana Professora" }));
    L.criar("funcionarios", professor(L, { id: "p2", nome: "Bruno Professor" }));
    L.criar("funcionarios", {
      id: "c1", nome: "Carla Secretária", regime: "MENSALISTA",
      salarioBase: L.reais(2800), cargaHoraria: 44, dependentes: 0, status: "ATIVO",
    });
  });

  it("separa por categoria", () => {
    expect(L.professores().map((f: any) => f.nome)).toEqual(["Ana Professora", "Bruno Professor"]);
    expect(L.colaboradores().map((f: any) => f.nome)).toEqual(["Carla Secretária"]);
  });

  it("deduz a categoria pelo regime quando o cadastro não a traz", () => {
    // Registro antigo, importado antes de a categoria existir.
    expect(L.categoriaDe({ regime: "HORISTA_AULA" })).toBe("PROFESSOR");
    expect(L.categoriaDe({ regime: "MENSALISTA" })).toBe("COLABORADOR");
    expect(L.categoriaDe({ regime: "PRESTADOR_PJ" })).toBe("COLABORADOR");
  });

  it("a categoria explícita vence a dedução pelo regime", () => {
    // Coordenadora que ainda dá algumas aulas: o regime é hora-aula, mas a
    // escola a conta como colaboradora.
    expect(L.categoriaDe({ regime: "HORISTA_AULA", categoria: "COLABORADOR" })).toBe("COLABORADOR");
  });

  it("soma os totais separado, e a soma das partes fecha com o todo", () => {
    const t = L.totaisPorCategoria();
    const prof = t.find((x: any) => x.categoria === "PROFESSOR");
    const colab = t.find((x: any) => x.categoria === "COLABORADOR");

    expect(prof.pessoas).toBe(2);
    expect(colab.pessoas).toBe(1);

    const totalGeral = L.ativos().reduce((s: number, f: any) => s + L.calcular(f).liquido, 0);
    expect(prof.liquido + colab.liquido).toBe(totalGeral);
  });

  it("a conferência de aulas ignora colaborador", () => {
    // Colaborador não tem carga por módulo; se entrasse na conta, compararia
    // contra um previsto que não é dele.
    const c = L.conferenciaAulas();
    expect(c.totalReal).toBe(L.professores().reduce(
      (s: number, f: any) => s + L.modulosDe(f).reduce((a: number, m: any) => a + m.aulas, 0), 0));
  });

  it("categoria sem ninguém não aparece nos totais", () => {
    const soProf = carregarDominio(false);
    soProf.estado.usuario = { nome: "T", perfil: "RH" };
    conferirTabelasDoAnoCorrente(soProf);
    soProf.criar("funcionarios", professor(soProf));
    expect(soProf.totaisPorCategoria().map((t: any) => t.categoria)).toEqual(["PROFESSOR"]);
  });

  it("colaborador mensalista calcula pela tabela, como qualquer folha", () => {
    const carla = L.estado.funcionarios.find((f: any) => f.id === "c1");
    const r = L.calcular(carla);
    expect(r.proventos).toBe(L.reais(2800));
    // INSS de 2026 sobre R$ 2.800: 7,5% até 1.621 + 9% no que passa disso.
    const inss = r.rubricas.find((x: any) => x.cod === "601")?.valor;
    expect(inss).toBe(L.calcularInss(L.reais(2800), L.competenciaAtual()).valor);
    expect(r.liquido).toBeLessThan(r.proventos);
  });
});

/**
 * `sincronizarCadastro` põe o cadastro em dia com as planilhas a cada login.
 * Roda em cima de dado real de gente real, e já quebrou em produção duas
 * vezes: duplicou professor quando a empresa foi corrigida depois do primeiro
 * login, e deixou colaborador de fora quando a planilha dele chegou depois.
 * Os dois casos estão aqui embaixo, junto do que segura tudo: rodar de novo
 * não pode mexer em mais nada.
 */
describe("sincronização do cadastro com a planilha", () => {
  function comPlanilhas(professores: any[], colaboradores: any[] = []) {
    const L = carregarDominio(false);
    (L as any).DADOS_REAIS = { competencia: "2026-08", professores, historico: [], observacoes: [] };
    (L as any).DADOS_COLABORADORES = { colaboradores };
    L.estado.usuario = { nome: "Teste", perfil: "RH" };
    return L as any;
  }
  const prof = (nome: string, extra: Record<string, unknown> = {}) => ({
    nome, disciplina: "Matemática", registro: "2024-02-01", titulacao: "Especialista",
    empresaCodigo: "1", empresa: "Hotel", vinculoCodigos: ["1"],
    cargas: [{ segmento: "Ensino Médio", aulas: 10, valorHora: 5000 }],
    extras: [], valorHoraExtra: 0, totalAulasPlanilha: 10, totalPlanilha: 500000,
    valorClt: 500000, valorTicket: 0, valorMei: 0, mudancaNoMes: "", ...extra,
  });
  const colab = (nome: string, extra: Record<string, unknown> = {}) => ({
    nome, cargo: "Auxiliar", admissao: "2025-03-01", empresaCodigo: "3", empresa: "ServMA",
    salarioBase: 200000, descontosFixos: [], observacao: "", ...extra,
  });
  const ativos = (L: any, categoria: string) =>
    L.estado.funcionarios.filter((f: any) => f.status !== "DESLIGADO" && f.categoria === categoria);

  it("cria todo mundo na primeira carga", () => {
    const L = comPlanilhas([prof("Ana Lima")], [colab("Bruno Dias")]);
    const r = L.sincronizarCadastro();
    expect(r.criados).toHaveLength(2);
    expect(ativos(L, "PROFESSOR")).toHaveLength(1);
    expect(ativos(L, "COLABORADOR")).toHaveLength(1);
  });

  it("rodar de novo não cria, não altera e não desliga nada", () => {
    const L = comPlanilhas([prof("Ana Lima")], [colab("Bruno Dias")]);
    L.sincronizarCadastro();
    const antes = JSON.stringify(L.estado.funcionarios);
    const r = L.sincronizarCadastro();
    expect([r.criados, r.atualizados, r.desligados].map((x: any[]) => x.length)).toEqual([0, 0, 0]);
    expect(JSON.stringify(L.estado.funcionarios)).toBe(antes);
  });

  it("empresa corrigida na planilha CORRIGE o registro, não duplica a pessoa", () => {
    // O bug real: a pessoa entrou com a empresa errada, a planilha foi
    // corrigida depois, e a sincronização criou uma segunda ficha dela.
    const L = comPlanilhas([prof("Ana Lima", { empresaCodigo: "2", empresa: "ServJU" })]);
    L.sincronizarCadastro();
    L.DADOS_REAIS.professores[0].empresaCodigo = "3";
    L.DADOS_REAIS.professores[0].empresa = "ServMA";
    const r = L.sincronizarCadastro();
    expect(ativos(L, "PROFESSOR")).toHaveLength(1);
    expect(r.atualizados).toHaveLength(1);
    expect(ativos(L, "PROFESSOR")[0].empresa).toBe("ServMA");
  });

  it("colaborador cuja planilha chegou depois entra sem recriar a conta", () => {
    const L = comPlanilhas([prof("Ana Lima")]);
    L.sincronizarCadastro();
    L.DADOS_COLABORADORES.colaboradores.push(colab("Bruno Dias"));
    L.sincronizarCadastro();
    expect(ativos(L, "COLABORADOR").map((f: any) => f.nome)).toEqual(["Bruno Dias"]);
  });

  it("salário que chegou depois é PREENCHIDO, mas nunca sobrescrito", () => {
    const L = comPlanilhas([], [colab("Bruno Dias", { salarioBase: 0 })]);
    L.sincronizarCadastro();
    expect(ativos(L, "COLABORADOR")[0].salarioBase).toBe(0);

    L.DADOS_COLABORADORES.colaboradores[0].salarioBase = 250000;
    L.sincronizarCadastro();
    expect(ativos(L, "COLABORADOR")[0].salarioBase).toBe(250000);

    // Valor já lançado é decisão de quem lançou: a planilha não desfaz.
    L.DADOS_COLABORADORES.colaboradores[0].salarioBase = 999900;
    L.sincronizarCadastro();
    expect(ativos(L, "COLABORADOR")[0].salarioBase).toBe(250000);
  });

  it("quem saiu da planilha é desligado, não apagado", () => {
    // Foi o caso do prestador que constava como professor: sai da lista de
    // docentes sem sumir do histórico.
    const L = comPlanilhas([prof("Ana Lima"), prof("Caio Reis")]);
    L.sincronizarCadastro();
    L.DADOS_REAIS.professores = [prof("Ana Lima")];
    const r = L.sincronizarCadastro();
    expect(r.desligados).toHaveLength(1);
    expect(ativos(L, "PROFESSOR").map((f: any) => f.nome)).toEqual(["Ana Lima"]);
    expect(L.estado.funcionarios.find((f: any) => f.nome === "Caio Reis")).toBeDefined();
  });

  it("cadastro feito à mão na tela não é desligado por não estar na planilha", () => {
    const L = comPlanilhas([prof("Ana Lima")]);
    L.sincronizarCadastro();
    L.criar("funcionarios", { nome: "Contratada Direta", categoria: "COLABORADOR",
      regime: "MENSALISTA", salarioBase: 300000, cargaHoraria: 44, status: "ATIVO" });
    L.sincronizarCadastro();
    expect(ativos(L, "COLABORADOR").map((f: any) => f.nome)).toEqual(["Contratada Direta"]);
  });

  it("duplicata que já existia no cadastro é desligada, sobrando um ativo só", () => {
    const L = comPlanilhas([prof("Ana Lima")]);
    L.sincronizarCadastro();
    // Simula o estrago da versão anterior: a mesma pessoa, duas fichas.
    L.criar("funcionarios", L.funcionarioDaPlanilha(
      prof("Ana Lima", { empresaCodigo: "2", empresa: "ServJU" }), "2026-08"));
    expect(ativos(L, "PROFESSOR")).toHaveLength(2);
    L.sincronizarCadastro();
    expect(ativos(L, "PROFESSOR")).toHaveLength(1);
  });

  it("mesmo nome em duas empresas na planilha continua sendo duas pessoas", () => {
    const L = comPlanilhas([], [
      colab("Maria Souza", { empresaCodigo: "2", empresa: "ServJU" }),
      colab("Maria Souza", { empresaCodigo: "3", empresa: "ServMA" }),
    ]);
    L.sincronizarCadastro();
    expect(ativos(L, "COLABORADOR")).toHaveLength(2);
    L.sincronizarCadastro();
    expect(ativos(L, "COLABORADOR")).toHaveLength(2);
  });

  it("prestador MEI entra como prestador, não como mensalista CLT", () => {
    const L = comPlanilhas([], [colab("Engenheiro Contratado", {
      regime: "PRESTADOR_PJ", enquadramento: "MEI", valorMensal: 337097,
      salarioBase: undefined, cargo: "Engenheiro Civil",
      descontosFixos: [{ nome: "Saúde", valor: 24810 }],
    })]);
    L.sincronizarCadastro();
    const p = ativos(L, "COLABORADOR")[0];
    expect(p.regime).toBe("PRESTADOR_PJ");
    expect(p.valorMensal).toBe(337097);
    expect(p.salarioBase).toBeUndefined();
    // Nota cheia menos o desconto combinado: MEI não tem retenção do Simples.
    const r = L.calcular(p);
    expect(r.liquido).toBe(337097 - 24810);
    expect(r.custoEmpregador).toBe(337097);
  });
  it("desligado à mão NÃO volta à folha, mesmo continuando na planilha", () => {
    // Professor demitido pela tela reaparecia ATIVO no login seguinte, porque
    // a planilha do mês passado ainda tinha o nome dele.
    const L = comPlanilhas([prof("Ana Lima")]);
    L.sincronizarCadastro();
    const ana = ativos(L, "PROFESSOR")[0];
    L.atualizar("funcionarios", ana.id, { status: "DESLIGADO" });
    const r = L.sincronizarCadastro();
    expect(r.criados).toHaveLength(0);
    expect(r.ignorados).toHaveLength(1);
    expect(ativos(L, "PROFESSOR")).toHaveLength(0);
    expect(L.estado.funcionarios).toHaveLength(1);
  });

  it("acento e espaço a mais na planilha são a MESMA pessoa", () => {
    const L = comPlanilhas([prof("Ana Lima")]);
    L.sincronizarCadastro();
    const id = ativos(L, "PROFESSOR")[0].id;
    L.DADOS_REAIS.professores[0].nome = "  ANA  LIMA ";
    const r = L.sincronizarCadastro();
    expect(r.criados).toHaveLength(0);
    expect(r.desligados).toHaveLength(0);
    expect(ativos(L, "PROFESSOR").map((f: any) => f.id)).toEqual([id]);
  });

  it("salário que discorda vira DIVERGÊNCIA, não sobrescrita silenciosa", () => {
    const L = comPlanilhas([], [colab("Bruno Dias", { salarioBase: 200000 })]);
    L.sincronizarCadastro();
    L.DADOS_COLABORADORES.colaboradores[0].salarioBase = 250000;
    const r = L.sincronizarCadastro();
    expect(r.atualizados).toHaveLength(0);
    expect(r.divergencias).toHaveLength(1);
    expect(r.divergencias[0]).toMatchObject({ campo: "salarioBase", cadastro: 200000, planilha: 250000 });
    expect(ativos(L, "COLABORADOR")[0].salarioBase).toBe(200000);
  });

  it("desconto do prestador maior que a nota não sai calado nem negativo", () => {
    const L = comPlanilhas([], [colab("Prestador Teste", {
      regime: "PRESTADOR_PJ", enquadramento: "MEI", valorMensal: 100000,
      salarioBase: undefined, descontosFixos: [{ nome: "Cantina", valor: 150000 }],
    })]);
    L.sincronizarCadastro();
    const r = L.calcular(ativos(L, "COLABORADOR")[0]);
    expect(r.avisos.some((a: any) => a.nivel === "divergencia")).toBe(true);
  });

  it("mudar o desconto do prestador muda o líquido (cache não pode servir o antigo)", () => {
    const L = comPlanilhas([], [colab("Prestador Teste", {
      regime: "PRESTADOR_PJ", enquadramento: "MEI", valorMensal: 337097,
      salarioBase: undefined, descontosFixos: [{ nome: "Saúde", valor: 24810 }],
    })]);
    L.sincronizarCadastro();
    const p = ativos(L, "COLABORADOR")[0];
    expect(L.calcular(p).liquido).toBe(337097 - 24810);
    L.atualizar("funcionarios", p.id, { descontosFixos: [{ nome: "Saúde", valor: 24810 }, { nome: "Cantina", valor: 50000 }] });
    expect(L.calcular(ativos(L, "COLABORADOR")[0]).liquido).toBe(337097 - 24810 - 50000);
  });

  it("desconto que muda sozinho (sem a base mudar) também vira divergência, não sobrescrita", () => {
    const L = comPlanilhas([], [colab("Bruno Dias", {
      salarioBase: 200000, descontosFixos: [{ nome: "Cantina", valor: 5000 }],
    })]);
    L.sincronizarCadastro();
    L.DADOS_COLABORADORES.colaboradores[0].descontosFixos = [{ nome: "Cantina", valor: 8000 }];
    const r = L.sincronizarCadastro();
    expect(r.divergencias).toHaveLength(1);
    expect(r.divergencias[0].campo).toBe("descontosFixos");
    expect(ativos(L, "COLABORADOR")[0].descontosFixos).toEqual([{ nome: "Cantina", valor: 5000 }]);
  });

  it("cadastro feito à mão NUNCA é reivindicado por um homônimo da planilha", () => {
    // O achado real: RH cadastra "Maria Souza" na tela (sem origem de
    // planilha); meses depois a planilha traz uma "Maria Souza" de verdade,
    // pessoa diferente, em outra empresa. A pessoa da tela não pode ter a
    // empresa dela trocada nem ser fundida com a da planilha.
    const L = comPlanilhas([prof("Maria Souza", { empresaCodigo: "1", empresa: "Hotel" })]);
    const manual = L.criar("funcionarios", {
      nome: "Maria Souza", categoria: "PROFESSOR", regime: "HORISTA_AULA",
      empresaCodigo: "2", empresa: "ServJU", aulasSemanais: 10, valorHoraAula: 3000,
      dependentes: 0, status: "ATIVO",
    });
    const r = L.sincronizarCadastro();
    expect(L.buscarPorId("funcionarios", manual.id)?.empresaCodigo).toBe("2");
    expect(r.criados).toHaveLength(1);
    expect(ativos(L, "PROFESSOR")).toHaveLength(2);
  });

  it("transferência de empresa coincidindo com contratação de homônimo não embaralha ninguém", () => {
    // O achado real do QA: mês 1 só existe uma "Maria Souza" em ServJU. Mês 2,
    // ela se transfere para ServMA E, na mesma leva, alguém DIFERENTE (mesmo
    // nome) é contratado para a vaga que ela deixou em ServJU. Não dá pra
    // saber, só pelo nome, qual das duas entradas é a Maria antiga — o
    // certo é NÃO adivinhar: ninguém fica de fora, ninguém tem salário
    // trocado sem confirmação, e a dúvida fica registrada para uma pessoa
    // decidir, em vez de virar uma "divergência" que na verdade compara
    // duas pessoas diferentes.
    const L = comPlanilhas([], [colab("Maria Souza", { empresaCodigo: "2", empresa: "ServJU", salarioBase: 200000 })]);
    L.sincronizarCadastro();
    const original = ativos(L, "COLABORADOR")[0];

    L.DADOS_COLABORADORES.colaboradores = [
      colab("Maria Souza", { empresaCodigo: "3", empresa: "ServMA", salarioBase: 200000 }),
      colab("Maria Souza", { empresaCodigo: "2", empresa: "ServJU", salarioBase: 350000 }),
    ];
    const r = L.sincronizarCadastro();

    expect(r.divergencias).toHaveLength(0); // nunca compara salário de gente diferente
    expect(r.ambiguos.length).toBeGreaterThan(0); // mas a dúvida não passa em branco
    expect(ativos(L, "COLABORADOR")).toHaveLength(2);
    const porEmpresa = Object.fromEntries(ativos(L, "COLABORADOR").map((f: any) => [f.empresaCodigo, f]));
    // O registro que já existia não muda de valor sozinho diante da dúvida —
    // o R$ 350.000 da planilha não é aplicado sem confirmação.
    expect(porEmpresa["2"].salarioBase).toBe(200000);
    expect(porEmpresa["2"].id).toBe(original.id);
    expect(porEmpresa["3"].salarioBase).toBe(200000);
  });
});

/**
 * Achados da auditoria de números (prévia × servidor): o mensalista com hora
 * noturna não recebia o adicional na tela, e o professor com carga por
 * segmento sem valor de hora (editou só as aulas) aparecia com aulas zeradas.
 */
describe("prévia igual ao servidor: noturno do mensalista e carga por segmento", () => {
  let L: Dominio;
  beforeEach(() => {
    L = carregarDominio(false);
    conferirTabelasDoAnoCorrente(L);
  });
  const rub = (r: any, cod: string) => r.rubricas.find((x: { cod: string }) => x.cod === cod)?.valor;

  it("mensalista recebe adicional noturno sobre a hora normal", () => {
    const r = L.calcularFolha(
      { regime: "MENSALISTA", salarioBase: L.reais(2200), cargaHoraria: 44, dependentes: 0 },
      { competencia: "2025-08", horasNoturnas: 10 },
    );
    // 2200 / 220h = R$ 10,00 × 10h × 20%
    expect(rub(r, "221")).toBe(L.reais(20));
  });

  it("carga por segmento sem valor de hora cai na hora-aula média, não em zero", () => {
    const r = L.calcularFolha(
      { regime: "HORISTA_AULA", valorHoraAula: L.reais(25), aulasSemanais: 20, dependentes: 0,
        cargas: [{ segmento: "Fundamental 1", aulas: 20, valorHora: null }] },
      { competencia: "2025-08" },
    );
    expect(rub(r, "101")).toBe(L.reais(2250));
  });

  it("segmento sem valor ao lado de outro com valor conta zero, como na planilha", () => {
    const r = L.calcularFolha(
      { regime: "HORISTA_AULA", valorHoraAula: 2771, aulasSemanais: 24, dependentes: 0,
        cargas: [{ segmento: "Fundamental 1", aulas: 5, valorHora: null },
                 { segmento: "Fundamental 2", aulas: 19, valorHora: 3500 }] },
      { competencia: "2025-08" },
    );
    expect(rub(r, "101")).toBe(299250);
  });
});

describe("busca sem acento", () => {
  it("JOSÉ, josé e jose casam entre si; nulo vira texto vazio", () => {
    const L = carregarDominio(false);
    expect(L.semAcento("JOSÉ")).toBe("jose");
    expect(L.semAcento("José")).toBe(L.semAcento("jose"));
    expect(L.semAcento("Conceição Lopes")).toBe("conceicao lopes");
    expect(L.semAcento(null)).toBe("");
    expect(L.semAcento(undefined)).toBe("");
  });
});
