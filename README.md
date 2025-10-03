# Simulador de Meta Patrimonial

Aplicação React para planejar aportes mensais e metas patrimoniais. Pronta para deploy no GitHub Pages.

## Scripts

- `npm run dev`: ambiente de desenvolvimento.
- `npm run build`: build de produção.
- `npm run preview`: pré-visualização do build.
- `npm run test`: executa testes unitários (Vitest).

## Deploy no GitHub Pages

Os commits em `main` já disparam um workflow que executa `npm run build` e publica automaticamente o conteúdo de `dist/` usando o GitHub Pages. Certifique-se apenas de manter o Pages configurado para a fonte **GitHub Actions** em `Settings > Pages`.

Se preferir fazer o processo manualmente:

1. Rode `npm install` e `npm run build`.
2. Publique o conteúdo de `dist/` na branch `gh-pages` ou em outro host estático.

O arquivo `vite.config.ts` já ajusta a base automaticamente usando a variável `GITHUB_REPOSITORY` do GitHub Actions e funciona localmente sem configurações extras. Só defina `VITE_BASE_PATH` se for publicar o build em um caminho incomum.
