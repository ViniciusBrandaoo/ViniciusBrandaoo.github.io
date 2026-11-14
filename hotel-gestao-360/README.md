# Hotel Gestão 360

Camada executiva de gestão do hotel. Liga
Financeiro, RH, Direção, Administrativo, Secretaria e Coordenação em torno de
uma pergunta: **o que precisa da decisão de alguém hoje?**

Plataforma herdada do Gestão 360 escolar, **sem nenhum dado** — abre vazia,
como um cliente novo a receberia. O lado administrativo (folha, contas,
contratos, banco de horas, solicitações e aprovações) já funciona; os módulos
que ainda falam de escola (hora-aula, lotação de aulas, conectores
Easyschool/ClipEscola) serão adaptados à operação do hotel aos poucos.

---

## Como rodar

```bash
npm install
npm test                    # 239 testes
npm run typecheck           # TypeScript sem erro
npm run prototipo           # gera o protótipo com os dados reais da escola
npm run build:demo          # gera a versão sem dados pessoais, publicável
```

O protótipo é um **arquivo HTML único**, sem servidor e sem build de framework.
Abrir no navegador é o suficiente. Ele guarda o estado no `localStorage` do
próprio navegador.

| Arquivo gerado | Contém | Pode publicar? |
|---|---|---|
| `prototipo/hotel-gestao-360.html` | 43 professores reais, salários reais | **Não** |
| `prototipo/hotel-gestao-360-demo.html` | Nada de dado pessoal | Sim |

`prototipo/partes/dados-reais.js` é gerado da planilha da escola por
`npm run importar` e **não deve ser versionado nem publicado**.

---

## As três camadas do cálculo

O mesmo cálculo de folha existe em três lugares, de propósito, com rigor
crescente. Quando divergem, a ordem de autoridade é da direita para a esquerda.

| Camada | Onde | Papel |
|---|---|---|
| Réplica JS | `prototipo/partes/dominio.js` | Roda no navegador, sem build. É o que se demonstra. |
| Motor | `src/dominio/folha/` | TypeScript, tipado, com testes de invariante e propriedade. |
| Banco | `db/migrations/` | PostgreSQL com constraints, triggers e congelamento. A verdade final. |

`tests/prototipo/dominio-prototipo.test.ts` existe justamente para a réplica não
divergir do motor em silêncio — carrega o `dominio.js` de verdade e confere os
mesmos números.

### Regras de folha que o motor implementa

- **Hora-aula do professor** (CLT art. 320 §1º): mês = 4,5 semanas fixas, não o
  calendário. Carga somada por segmento, cada um com a sua hora-aula.
- **DSR de 1/6** (Súmula 351 do TST), com perda por falta injustificada
  (Lei 605/49 art. 6º).
- **INSS progressivo por faixa** — aplicar a alíquota do topo sobre o total é o
  erro clássico de planilha e superestima o desconto.
- **IRRF** comparando a base por deduções legais com a do desconto
  simplificado, adotando a menor.
- **Encargos do empregador** (FGTS, CPP, RAT, terceiros) fora do líquido, mas
  dentro do custo real.
- **Prestador PJ/MEI** não é folha: sai como nota fiscal, sem INSS nem FGTS.

Cada centavo sai com memória de cálculo e o artigo de lei que o sustenta.

---

## Tabelas legais: por que a folha não fecha sozinha

As tabelas de INSS e IRRF **não estão fixas no código**. São cadastro, com
vigência por competência, em *Configuração → Tabelas Legais*.

A carga inicial traz as tabelas de 2025 marcadas como **não conferidas** e com
vigência encerrada em 12/2025. Para qualquer competência de 2026 em diante não
existe tabela vigente até o RH cadastrar a do exercício.

Duas travas em série, de propósito:

1. **RH confere** a tabela contra o ato oficial — competência técnica de quem
   entende de folha. Fica registrado com nome e data.
2. **Direção fecha** a competência — decisão de quem responde pela escola.

Sem tabela vigente e conferida, o motor calcula para simulação, marca
divergência e **recusa fechar**. Alíquota errada em folha fechada vira passivo
trabalhista; é mais barato travar.

### O que o fechamento congela

Fechar uma competência grava, dentro do próprio período:

- a **folha apurada de cada funcionário**, com rubricas e memória de cálculo;
- as **tabelas de INSS e IRRF** usadas.

Por isso um aumento concedido em janeiro não reescreve a folha de agosto que já
foi paga, e reemitir um holerite de cinco anos atrás devolve o mesmo número.
Reabrir exige justificativa escrita e guarda o ciclo anterior no histórico.

---

## Controle interno na aprovação

Solicitações sobem por alçada: cada perfil decide sozinho até um teto, e acima
dele a decisão sobe. Três regras sustentam isso:

- **Ninguém aprova o próprio pedido.** Quem abriu sai da própria cadeia, e a
  trava vale mesmo se uma delegação apontar de volta para ele.
- **A cadeia sempre termina em quem tem alçada** para aquele valor. Tirar o
  solicitante nunca deixa o pedido nas mãos de quem não podia decidir — nesse
  caso ele sobe para a Direção.
- **A Direção decide em última instância**: aprovou ou rejeitou, encerrou. A
  decisão de quem responde pela escola não fica esperando o aval de quem
  responde a ela.

As mesmas CHECK constraints do banco valem no domínio (`L.INVARIANTES`):
conta a pagar exige valor positivo e vencimento, ausência e contrato não
terminam antes de começar. Validar só no formulário deixaria a porta aberta
para importação e telas novas.

## Acesso e delegação

Três camadas, e a terceira não se atravessa:

1. **Perfil** — autorização fixa por cargo (Direção, Financeiro, RH,
   Administrativo, Coordenação, Secretaria, Gestor, Consulta). Ninguém edita o
   próprio.
2. **Extras** — exceções pontuais que só Direção ou administrador concedem, em
   *Configuração → Controle de Acesso*.
3. **Ações reservadas** — fechar/reabrir competência e gerenciar acessos são
   sempre da Direção ou do administrador, mesmo com o módulo liberado.

Quem cria conta pelo formulário entra como **Consulta** (somente leitura). A
primeira conta do sistema é a exceção: vira Direção e administrador, senão
ninguém abriria o Controle de Acesso da primeira vez.

---

## Backend e banco

`db/migrations/` está completo e é a camada mais rigorosa: constraints de
vigência sem sobreposição, triggers que validam as faixas das tabelas, trilha
de auditoria por trigger (nada some, nem por script), congelamento de
competência fechada e histórico de remuneração com vigência.

`servidor/` é uma **fatia fina e proposital**, não uma API completa. Hoje
existem cinco rotas (`/api/saude`, `/api/acesso/eu`, `/api/acesso/sair`,
`/api/competencias`, `/api/funcionarios`), o suficiente para provar
autenticação com sessão em cookie, `SET LOCAL app.user_id` alimentando a
auditoria, e a leitura da folha vinda do banco de verdade.

**O restante das telas ainda vive só no protótipo, contra o `localStorage`.**
Migrar significa trocar `L.persistir`/`L.restaurar` por chamadas de API — o
domínio não muda.

Hospedagem: ver [HOSPEDAGEM.md](HOSPEDAGEM.md). Esquema e migrações:
[db/README.md](db/README.md).

---

## Estado honesto

Pronto e testado:

- Motor de folha (horista hora-aula, mensalista, horista relógio, prestador PJ)
- Cadastro de tabelas legais com vigência, validação e conferência
- Ciclo mensal: abrir, lançar movimento, fechar, reabrir com justificativa
- Banco de horas, férias e ausências, solicitações com cadeia de aprovação
- Contas a pagar, fornecedores, contratos, documentos
- Controle de acesso com delegação
- Trilha de auditoria
- Esquema PostgreSQL completo

Ainda não existe:

- 13º salário, férias (o pagamento) e rescisão — hoje só o mês normal
- Consolidação de INSS entre vínculos no protótipo (o motor TypeScript já tem)
- API completa; o backend cobre cinco rotas
- Separação das três empresas (CNPJs) da escola em uma única visão consolidada
