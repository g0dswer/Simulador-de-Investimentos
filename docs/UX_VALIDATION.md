# Validação do planejador para iniciantes

## Verificação técnica reproduzível

Execute `npm test`, `npm run build` e `cd formal && lake build`.
Os testes cobrem entradas brasileiras, porcentagens, metas não alcançadas,
edição, cenários temporários, preservação do plano original, salvamento,
armazenamento bloqueado, migração v2, inflação e coerência entre resumo e prazo.
O gráfico deve ser inspecionado também num navegador real: jsdom não calcula
dimensões. Verificar larguras de 390 e 320 pixels, além de desktop; usar teclado
para avançar e voltar, preencher campos e abrir detalhes. O gráfico possui
resumo textual, e uma tabela dá acesso aos valores sem depender de cores.

## Sessão com cinco pessoas iniciantes

Este roteiro está preparado; a implementação não equivale à execução de uma
pesquisa com participantes reais. Não foi realizada sessão com cinco pessoas.
Usar valores fictícios, sem coletar renda, patrimônio ou outros dados pessoais.

1. Juntar dinheiro: começar com R$ 0, guardar R$ 300 por mês por 10 anos e
   comparar cenários. Pedir que a pessoa explique o que ela colocou e o que
   é apenas rendimento estimado.
2. Planejar uma meta: juntar R$ 12 mil em dois anos. Localizar o valor mensal
   inicial e explicar se ele aumenta ao longo do tempo.
3. Descobrir o prazo: começar com R$ 1 mil, guardar R$ 200 por mês, meta de
   R$ 20 mil. Identificar quando a meta pode ser atingida.
4. Explorar: testar R$ 100 a mais por mês ou dois anos a mais, depois restaurar
   o original. Explicar o que mudou.
5. Inflação: ativar dinheiro de hoje e explicar por que o resultado mudou.
   Perguntar em que unidade está a meta e se o rendimento é garantido.
6. Salvar: salvar, recarregar a página e recuperar o plano. Explicar onde os
   dados estão guardados e remover o plano salvo.

Observar sem ensinar o caminho. Registrar conclusão sem ajuda, tempo,
erros, pedidos de ajuda e interpretação verbal. Não inferir entendimento
apenas porque a pessoa chegou ao último passo.

Critérios propostos: pelo menos quatro de cinco pessoas completam os três
fluxos principais sem ajuda; todas distinguem depósito de rendimento e
entendem que a estimativa não é garantida. Confusão sobre inflação, prazo ou
local de salvamento exige revisão antes de declarar a experiência validada
com iniciantes. Esses critérios são metas de avaliação, não resultados obtidos.
