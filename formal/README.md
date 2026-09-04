# Formalização Lean do passo mensal

`Investment.lean` é um núcleo pequeno, sem Mathlib e sem `sorry`, que modela
com números racionais (`Rat`) o passo usado pelo simulador:

```text
início: saldo' = (saldo + aporte) * (1 + taxaMensal)
fim:    saldo' = saldo * (1 + taxaMensal) + aporte
```

Ele prova, de forma exata:

- ambos os ordenamentos dão `saldo + aporte` quando a taxa é zero;
- com aporte não-negativo e fator de crescimento pelo menos um, contribuição
  no início produz saldo pelo menos tão grande quanto contribuição no fim;
- monotonicidade de cada passo em relação ao aporte;
- taxa real zero quando a taxa nominal e a inflação são iguais (denominador
  não nulo);
- forma fechada sem juros após `n` meses, para os dois ordenamentos;
- monotonicidade da forma fechada em saldo inicial e aporte.

## Validação

O toolchain Lean `v4.33.1` já está instalado em `~/.elan` neste ambiente (os
binários não estão no `PATH`). A validação foi executada sem instalação nem
acesso à rede:

```sh
cd formal
/Users/thiagogruber/.elan/bin/lake build
```

Resultado: `Build completed successfully (3 jobs)`.

O módulo intencionalmente não afirma equivalência com `number`/IEEE-754 nem
com a conversão anual→mensal baseada em `Math.pow`. Essa ponte deve ser
validada depois por testes diferenciais contra casos racionais/numéricos
controlados. Também ficam fora deste MVP as políticas variáveis de aporte e a
busca binária de `aporteNecessario`/`taxaNecessaria`.
