# Ideia: "Meu espaço" do colaborador (guardada, não iniciada)

Pedido de 29/09/2026 (Vinicius). Decidido não fazer por enquanto.

## O que se quer
Um acesso individual para cada funcionário, onde ele vê só o que é dele:
1. **Holerite com aceite de termos.** O holerite só vale depois que o
   funcionário marca "Li e aceito". Guardar data, hora e o aceite de cada
   holerite, sem poder apagar. Lista para o RH ver quem ainda não aceitou.
2. **Ponto.** Ver registros de ponto e banco de horas (a tabela
   `ponto_registros` já existe; falta a tela). Bater ponto pelo sistema é
   uma etapa à parte (validade legal, fraude).
3. **Área individual.** Um novo perfil "Colaborador" com uma tela "Meu
   espaço"; nunca enxerga dados de outra pessoa. RH cria e desativa os
   acessos em Acessos.

## Etapas sugeridas
1. Acesso individual (login ligado ao cadastro do funcionário + perfil).
2. Holerite com aceite (reaproveitar `T.holeriteHtml` e os dados gravados
   do fechamento; nova tabela de aceites, só de acréscimo).
3. Ponto (consulta primeiro; registro depois).

## Perguntas em aberto
- Texto dos termos do holerite (ideal: aprovado pela escola/jurídico).
- Como cada pessoa entra: e-mail próprio ou CPF? Os 102 têm e-mail?

## Cuidados
Dados salariais individuais: senha forte, registro de cada acesso, aceite
imutável, holerite não muda depois de aceito.

## Modelo do holerite (29/09/2026)
O holerite deve seguir o modelo da contabilidade (SCI), recibo em A4 deitado:
- **Cabeçalho da empresa:** código, razão social, endereço, CEP, CNPJ, e
  "Referente ao mês". Usar o nome de cada empresa como está no cadastro
  (Hotel, ServJU, ServMA); CNPJ e endereço a confirmar com a
  contabilidade.
- **Dados do colaborador:** código, nome, admissão, CBO, função, CPF, PIS,
  CTPS e série. Hoje o sistema só guarda o CPF; CBO, PIS e CTPS faltam.
- **Tabela:** Códigos, Descrições, Referências, Proventos, Descontos (com a
  referência em dias, ex.: 30,00), totais e "SALÁRIO LÍQUIDO".
- **Rodapé:** Salário base, Base INSS, Base FGTS, Valor FGTS, Base IRRF,
  sempre visíveis; "Declaro ter recebido o valor líquido deste recibo"; data
  e assinatura.

### Ao construir
- Reverter a PR #16 (ela esconde base e valor do FGTS no rodapé quando a
  contabilidade cuida dos encargos): no modelo oficial, FGTS e Base IRRF
  aparecem no rodapé.
- A chave "encargos pela contabilidade" só deve afetar custo da escola, não o
  holerite do funcionário.
- Pedir à contabilidade: CNPJ, endereço, CBO por cargo, PIS e CTPS.
