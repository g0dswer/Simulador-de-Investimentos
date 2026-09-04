# Plano de validação formal em Lean

## Veredito de viabilidade

A validação formal é viável e útil para o núcleo matemático, mas não para a
aplicação inteira de uma vez. Lean deve descrever a matemática exata; testes
diferenciais devem verificar se a implementação TypeScript/JavaScript segue
essa especificação sob aritmética de ponto flutuante.

## Fronteiras da garantia

Lean pode provar:

- as equações de atualização mensal;
- a relação entre contribuição no início e no fim do mês;
- identidades da taxa real, como taxa nominal igual à inflação implicar taxa
  real zero;
- preservação de não negatividade e monotonicidade sob hipóteses explícitas;
- fórmulas fechadas e invariantes dos algoritmos de busca, depois que seus
  contratos de domínio e falha forem definidos.

Lean, sozinho, não prova:

- o comportamento IEEE-754 de `number`, `Math.pow` ou `Intl`;
- parsing de texto, React, gráficos, armazenamento local ou responsividade;
- que os parâmetros financeiros escolhidos pelo usuário são realistas;
- que o código TypeScript executado é idêntico à especificação sem uma ponte de
  testes diferenciais.

## Etapa 0 — estabilizar o contrato

Antes de provar os solvers, definir e testar:

1. formato aceito para inflação com ponto e vírgula decimal;
2. domínio: montantes, aportes e metas não negativos; taxas e inflação maiores
   que `-1`; políticas de reajuste que preservem aportes não negativos;
3. semântica da “taxa necessária” no modo real: a busca usa uma taxa mensal
   nominal, e o resultado anual deve ser a anualização dessa mesma taxa;
4. falha explícita quando a meta não é alcançável dentro do intervalo de busca.

## Etapa 1 — modelo exato mínimo

Criar um módulo Lean com:

- `realRate nominal inflation = (1 + nominal) / (1 + inflation) - 1`;
- `stepEnd balance contribution rate = balance * (1 + rate) + contribution`;
- `stepBeginning balance contribution rate = (balance + contribution) * (1 + rate)`;
- uma recorrência de `n` meses para taxa e aporte constantes.

Critério: `lake build`, zero `sorry` e nomes/hipóteses que correspondam ao
vocabulário do TypeScript.

## Etapa 2 — teoremas prioritários

1. com taxa zero, após `n` meses o saldo é `principal + n * aporte`;
2. em um passo, início menos fim é `aporte * taxa`;
3. nominal igual à inflação implica taxa real zero, se `1 + inflação ≠ 0`;
4. saldos e aportes não negativos continuam não negativos quando `rate ≥ -1`;
5. a projeção é monotônica no principal e no aporte quando o fator de
   crescimento é não negativo;
6. a fórmula fechada da anuidade coincide com a recorrência, tratando taxa zero
   separadamente.

## Etapa 3 — ponte com TypeScript

- adicionar testes unitários individuais, em vez de um único teste agregado;
- gerar vetores de referência racionais para taxa zero e taxas simples;
- comparar Lean/especificação e TypeScript em casos determinísticos;
- manter testes de propriedade contra a fórmula fechada para centenas de casos
  dentro do domínio;
- incluir explicitamente os bugs já reproduzidos de parsing e dupla contagem de
  inflação como regressões.

## Etapa 4 — solvers

Só formalizar `aporteNecessario` e `taxaNecessaria` depois da Etapa 0. Provar:

- monotonicidade do predicado pesquisado sob as restrições do domínio;
- invariante `lo` não satisfaz / `hi` satisfaz;
- o valor retornado satisfaz a meta dentro da tolerância declarada;
- ausência de bracket retorna falha, nunca um número apresentado como solução.

## Etapa 5 — CI e gates

Executar em toda mudança do núcleo:

```text
npm test
npm run build
lake build
testes diferenciais TypeScript ↔ especificação
```

O MVP termina quando os teoremas da Etapa 2 compilarem sem axiomas adicionais
ou `sorry`, e os testes diferenciais falharem de forma controlada quando uma
fórmula do TypeScript for adulterada.

## Estado desta entrega

- Etapa 0: contratos de domínio, parsing e falha explícita implementados no
  TypeScript e cobertos por regressões.
- Etapa 1: modelo racional em `formal/Investment.lean` compilando sem `sorry`.
- Etapa 2: identidades de passo, taxa real zero, ordem do aporte,
  monotonicidade no aporte e forma fechada sem juros provadas; preservação de
  não negatividade da recorrência e anuidade geométrica geral ficam pendentes.
- Etapa 3: ponte executável adicionada, incluindo 500 cenários determinísticos
  contra a fórmula fechada nominal.
- Etapa 4: solvers corrigidos e testados no TypeScript; sua prova formal ainda
  é trabalho futuro.
- Etapa 5: `npm test`, build Vite e `lake build` agora bloqueiam o deploy do
  GitHub Pages em caso de falha.
