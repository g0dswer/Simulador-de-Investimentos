# Simulador de Meta Patrimonial

Aplicação React para planejar aportes mensais e metas patrimoniais. Pronta para deploy no GitHub Pages.

## Scripts

- `npm run dev`: ambiente de desenvolvimento.
- `npm run build`: build de produção.
- `npm run preview`: pré-visualização do build.
- `npm run test`: executa testes unitários (Vitest).

## Deploy no GitHub Pages

1. Rode `npm install` e `npm run build`.
2. Publique o conteúdo de `dist/` na branch `gh-pages`. Você pode usar GitHub Actions ou a CLI `gh-pages`.
3. Garanta que o repositório esteja configurado para servir a branch `gh-pages` em `Settings > Pages`.

O arquivo `vite.config.ts` já ajusta a base automaticamente usando a variável `GITHUB_REPOSITORY` do GitHub Actions. Para builds locais, defina `VITE_BASE_PATH="/Simulador-de-Investimentos/"` se publicar em um subcaminho diferente.
