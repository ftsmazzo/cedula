# Cédula

Colinha eleitoral para o 1º turno de 2026. Você escolhe um candidato por cargo, na ordem da urna, confere nome, número e partido, e imprime ou copia a cédula. Os dados vêm do arquivo público `consulta_cand_2026` do TSE. A cédula fica no `localStorage` do aparelho.

Não é o aplicativo oficial do TSE e não recomenda candidato. A lista é alfabética.

## Rodar

```bash
npm install
npm run data
npm run dev
```

## Atualizar a base

Baixe de novo o zip em `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip`, substitua `data/consulta_cand_2026.zip`, extraia em `data/raw/` e rode `npm run data`.

O JSON publicado em `public/dados/` guarda só nome de urna, número, partido e gênero. CPF, e-mail e título de eleitor do CSV original não entram no site.
