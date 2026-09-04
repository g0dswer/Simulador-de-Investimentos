# Formalização Lean do simulador

Os módulos não dependem de Mathlib e não usam `sorry`:

- `Investment.lean` modela com números racionais (`Rat`) o passo mensal;
- `Solvers.lean` formaliza recorrências, monotonicidade, bracket e bisseção.

O passo usado pelo simulador é:

```text
início: saldo' = (saldo + aporte) * (1 + taxaMensal)
fim:    saldo' = saldo * (1 + taxaMensal) + aporte
```

Os módulos provam, de forma exata:

- ambos os ordenamentos dão `saldo + aporte` quando a taxa é zero;
- com aporte não-negativo e fator de crescimento pelo menos um, contribuição
  no início produz saldo pelo menos tão grande quanto contribuição no fim;
- monotonicidade de cada passo em relação ao aporte;
- taxa real zero quando a taxa nominal e a inflação são iguais (denominador
  não nulo);
- forma fechada sem juros após `n` meses, para os dois ordenamentos;
- monotonicidade da forma fechada em saldo inicial e aporte.
- preservação de não negatividade da recorrência;
- monotonicidade da projeção em principal, aporte e fator de crescimento;
- formas fechadas gerais para taxa e aporte constantes;
- identidade da soma geométrica e sua forma de quociente quando o fator de
  crescimento é diferente de um;
- monotonicidade dos predicados de meta usados nos dois solvers;
- preservação do bracket em um passo e após qualquer número de bisseções;
- redução exata da largura do bracket pela metade em cada iteração;
- o limite superior final atinge a meta e o inferior não a atinge;
- resultado dentro de uma tolerância quando a largura calculada está abaixo
  dela;
- distinção entre “meta já atingida”, “bracket válido” e “sem bracket”.

## Validação

O toolchain Lean `v4.33.1` já está instalado em `~/.elan` neste ambiente (os
binários não estão no `PATH`). A validação foi executada sem instalação nem
acesso à rede:

```sh
cd formal
/Users/thiagogruber/.elan/bin/lake build
```

Resultado atual: `Build completed successfully (5 jobs)`.

Os módulos intencionalmente não afirmam equivalência com `number`/IEEE-754 nem
com a conversão anual→mensal baseada em `Math.pow`. Essa ponte é exercitada
por testes diferenciais e de pós-condição em `tests/formal-contract.test.ts`.
As provas dos solvers cobrem o núcleo exato com entradas mensais constantes;
políticas variáveis de aporte e tabelas variáveis de inflação ainda são
abstraídas pelos contratos de monotonicidade, não traduzidas linha a linha.
