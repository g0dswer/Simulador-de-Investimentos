# Simulador de Meta Patrimonial

Aplicação React para planejar aportes mensais e metas patrimoniais.

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

## GitHub Pages

O workflow `.github/workflows/deploy.yml` testa TypeScript, gera o build Vite,
compila a especificação Lean e só então publica `dist/` no GitHub Pages. O
`base` do Vite é derivado automaticamente de `GITHUB_REPOSITORY`, mantendo os
assets sob `/Simulador-de-Investimentos/` no deploy.
