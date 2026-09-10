# Seu próximo passo — Simulador de investimentos

Planejador React para quem está começando: descubra quanto pode juntar,
quanto guardar por mês ou quando pode chegar à sua meta. Totalmente estático,
publicado no GitHub Pages, sem cadastro ou backend.

## Experiência guiada

Ao clicar em **Ver meu plano**, o guia abre o dashboard da versão anterior
(`0a35958`) já preenchido com os valores escolhidos. Foram recuperados os
controles, a disposição e as abas **planejar**, **sensibilidade**, **dados** e
**testes**, incluindo a matriz 5×5 e a exportação CSV. O resumo guiado continua
disponível no seletor de visualização. Alterações do dashboard acompanham a
troca de visualização e o retorno às perguntas.

- Três etapas: pergunta, valores e hipóteses; voltar preserva as informações.
- Valores brasileiros (`1.000,50`) e taxas em porcentagem (`6` ou `6%`).
- Cenários ilustrativos de 4%, 6% e 8% ao ano, ou taxa personalizada.
- Comparações de mais R$ 100 por mês, mais dois anos e menos dois pontos
  percentuais de rendimento, preservando o plano original.
- Inflação, reajustes, momento do depósito e tabela anual em ajustes opcionais.
- Gráfico e resumo com o mesmo horizonte. Dados anuais acessíveis em tabela.
- Salvamento explícito neste navegador e migração da configuração v2.
- Gráfico carregado sob demanda; layout responsivo, foco entre etapas e
  mensagens de erro associadas aos campos.

O modo de valores futuros não desconta inflação. No modo dinheiro de hoje,
`src/lib/planner.ts` converte o saldo nominal pelo índice acumulado de preços
e cada depósito pelo índice de sua data (início ou fim do mês). A meta está na
mesma unidade do resultado. Reajustes são aplicados aos depósitos nominais.
O solver mensal exige alcançar a meta **ao final** do prazo, inclusive com
retorno negativo, e arredonda para cima ao centavo antes de verificar de novo.

As taxas são hipóteses educativas, não previsões ou produtos. Não há desconto
automático de impostos ou custos. Valores fora do domínio numérico são
recusados. O roteiro de avaliação com iniciantes está em `docs/UX_VALIDATION.md`.

## Desenvolvimento local

Requer Node.js 22.12 ou superior.

```sh
npm ci
npm test
npm run build
npm run dev
```

## Especificação Lean

O núcleo formal fica em `formal/` e usa a versão registrada em
`formal/lean-toolchain`:

```sh
cd formal
lake build
```

Lean prova as identidades, recorrências e invariantes de bisseção documentados
em `formal/README.md`. Os testes em `tests/formal-contract.test.ts` verificam
que o caminho TypeScript segue os mesmos contratos em casos numéricos
controlados e nas pós-condições dos solvers.

As provas existentes continuam cobrindo os contratos descritos no documento
formal; elas não são uma prova integral da interface, do arredondamento IEEE-754
ou do novo adaptador `planner.ts`. A conversão monetária, o solver de prazo final
e os fluxos de interface são verificados adicionalmente pelos testes
`planner.test.ts` e `planner-ui.test.tsx`.

## GitHub Pages

### Planejamento da aposentadoria

Após concluir o guia, a opção **Aposentadoria** abre a área de patrimônio,
capacidade de poupança, fases de acumulação e retiradas, estratégias de consumo
ou preservação da reserva, cenários e relatórios. O dashboard original e o
resumo guiado continuam disponíveis. Os cenários são salvos apenas neste
navegador. Veja o [mapa de funcionalidades e limites](docs/retirement-features.md).

O novo módulo é verificado por testes numéricos e de interface; as provas Lean
existentes não foram ampliadas para cobrir as estratégias de aposentadoria.

O workflow `.github/workflows/deploy.yml` testa TypeScript, gera o build Vite,
compila a especificação Lean e só então publica `dist/` no GitHub Pages. O
`base` do Vite é derivado automaticamente de `GITHUB_REPOSITORY`, mantendo os
assets sob `/Simulador-de-Investimentos/` no deploy.
