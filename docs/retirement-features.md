# Planejamento da aposentadoria

Área adicional ao guia e ao dashboard original, baseada nos controles visíveis na captura de referência. Não reproduz a marca, dados pessoais ou serviços privados do produto fotografado.

## Funcionalidades

| Área da referência                  | Implementação                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| Ativos                              | Patrimônio financeiro e imobilizado editáveis, total e composição                            |
| Sucessão patrimonial                | Estimativa configurável de custos e patrimônio líquido, sem presumir legislação              |
| Aposentadoria e expectativa de vida | Idade atual, aposentadoria e horizonte de vida                                               |
| Juros e inflação                    | CDI hipotético, percentual do CDI, retorno nominal, inflação e retorno real equivalente      |
| Taxas após aposentadoria            | Premissa específica opcional para a fase de retiradas                                        |
| Capacidade de poupança              | Receitas, despesas e saldo mensal                                                            |
| Planejamento                        | Renda mensal desejada e aportes antes da aposentadoria                                       |
| Estratégias                         | Consumir a reserva no horizonte ou preservar seu poder de compra                             |
| Necessidades adicionais             | Aporte mensal adicional, aporte único, reserva necessária e retirada mensal suportada        |
| Aportes e retiradas                 | Fluxos adicionais por faixa etária, com inclusão e remoção                                   |
| Cenários                            | Criar, editar, salvar localmente, carregar, remover e comparar                               |
| Gráficos e relatórios               | Diagnóstico, evolução da reserva, comparação, tabela, intervalo e CSV                        |
| Inflação                            | Correção opcional dos aportes e retiradas e visualização nominal ou em poder de compra atual |

## Limites e interpretação

- Todos os cálculos acontecem no navegador; continua compatível com GitHub Pages.
- As taxas são hipóteses constantes, não cotações nem previsões. O atalho do CDI é uma aproximação anual, não um cálculo diário de um título financeiro.
- Patrimônio imobilizado aparece na composição e sucessão, mas não financia retiradas automaticamente.
- O horizonte escolhido é uma hipótese de planejamento, não uma previsão individual de longevidade.
- A simulação não inclui automaticamente impostos, taxas, pensões, venda de imóveis ou custos sucessórios legais. Fluxos conhecidos podem ser incluídos manualmente.
- A compilação Lean existente cobre a especificação anterior. Não constitui prova formal deste novo módulo de aposentadoria, que é validado separadamente por testes numéricos e de interface.
