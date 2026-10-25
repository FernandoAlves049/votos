# Radar do Voto · Brasil

**Site:** https://fernandoalves049.github.io/votos/

Painel independente que consulta os arquivos oficiais do TSE para acompanhar a apuração de 2026 por Brasil, UF, município e zona eleitoral. O exterior também está disponível no seletor. Não é um produto do TSE.

## Mapa

- 26 estados e Distrito Federal como polígonos individuais, identificados pelos códigos das UFs do IBGE.
- Contornos, siglas clicáveis e destaque para a UF selecionada.
- Opção **Separar estados**, com redução visual de 2,5% em cada polígono; desative para ver a malha contínua.
- Perspectivas 2D, 3D e globo. No 3D, altura e cor representam o percentual de seções totalizadas.
- Estados sem dados consultados têm altura de apuração zero e indicação explícita de indisponibilidade. Isso não significa zero votos.
- O mapa usa arquivos incluídos na própria publicação e continua disponível se o TSE não responder. O exterior aparece nos filtros e tabelas.

## Dados oficiais

As consultas são feitas diretamente no navegador a https://resultados.tse.jus.br, sem proxies de terceiros. O GitHub Pages hospeda somente os arquivos estáticos. A disponibilidade depende do TSE, da política CORS e da rede do visitante.

A tela consulta o recorte a cada 30 segundos enquanto estiver visível. O panorama das UFs, depois de carregado, é atualizado a cada 60 segundos. Cache, deduplicação e pausa após bloqueio evitam consultas excessivas. Erros não viram zero votos. O horário de geração informado pelo TSE é diferente do horário de consulta.

Arquivos EA20 fornecem resultados por Brasil, UF, município e zona. EA16 e EA18 dão acesso ao cadastro e aos arquivos de cada seção, incluindo agregações. Os boletins originais podem ser baixados; este painel não decodifica BU binário nem apresenta contagem individual de votos de seção. Baixar não verifica a assinatura digital.

Resultados parciais não são projeções. A indicação de eleito depende da informação recebida do TSE. Dados de simulação são rejeitados.

## Publicação e desenvolvimento

O workflow em [.github/workflows/pages.yml](.github/workflows/pages.yml) testa e valida a malha incluída das **27 UFs**, inclui o MapLibre 6.16.0 e publica no GitHub Pages. A fonte nas configurações de Pages deve ser **GitHub Actions**.

Com Node.js 22 ou superior, sem instalar dependências:

```sh
npm test
npm run prepare:assets
npm run build
npm run preview
```

Abra http://127.0.0.1:4186. A preparação exige internet. Os arquivos gerados ficam em dist; os caminhos relativos funcionam sob /votos/.

- src/tse.mjs: URLs e leitura dos arquivos oficiais.
- src/client.mjs: consultas diretas para hospedagem estática.
- src/map-data.mjs: validação de UFs, rótulos e separação cartográfica.
- src/map.mjs: mapa e navegação.
- src/app.js e src/styles.css: painel, filtros, favoritos e exportação CSV.
- scripts/prepare-assets.mjs: downloads das fontes verificadas.
- tests/: verificações de integração e regressão.

Favoritos são salvos somente no navegador.

## Fontes

- [Divulgação de resultados — documentação TSE](https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados)
- [API de malhas geográficas do IBGE](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3)
- [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js)
- [GitHub Pages e workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

A malha incluída é uma base de referência do CodeGeo, distribuída pelo projeto [Click That Hood](https://github.com/codeforgermany/click_that_hood/blob/main/public/data/brazil-states.metadata.json), com origem, versão e simplificação registradas em data/provenance.json. Ela foi publicada em 2015 e não substitui limites oficiais atuais. Os resultados eleitorais continuam vindo somente do TSE. A cópia cartográfica elimina a dependência do serviço do IBGE durante a publicação.

As licenças acompanham a distribuição em data/LICENSE-ClickThatHood.txt e vendor/LICENSE-MapLibre.txt.
