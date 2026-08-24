# Projeto — Dashboard de Medições (Contrato 131/2024)

Esta pasta guarda todo o "motor" por trás do dashboard entregue (`index.html`, na pasta principal, publicado em https://allison-souto.github.io/Equipe-Preventiva-Aparecida-do-Taboado/). Como ela está dentro do OneDrive, sincroniza automaticamente para qualquer computador logado na mesma conta — é isso que permite continuar o trabalho de outra máquina.

## O que tem aqui

- `parsed.json` — dados já extraídos dos 13 boletins de medição em PDF (mão de obra, materiais, custo operacional). É o resultado mais "caro" de gerar; a partir dele tudo o mais é recalculado em segundos.
- `dashboard_data.json` — dados já tratados (pivots por mês, deltas, curva ABC) que alimentam o dashboard.
- `scripts/extract.py` — lê os PDFs de medição e gera `parsed.json`.
- `scripts/build_dataset.py` — lê `parsed.json` e gera `dashboard_data.json` + os CSVs de apoio.
- `scripts/build_xlsx.py` — lê `dashboard_data.json` e gera a planilha `Medicoes_Equipe_Preventiva.xlsx`.
- `scripts/template.html` — modelo do dashboard (HTML + Chart.js embutido), com o placeholder `__DATA_JSON__` onde os dados são injetados na hora de gerar o arquivo final.

## Como continuar de outro computador

1. Abra o Claude Desktop nesse outro computador, logado na mesma conta.
2. Conecte a pasta OneDrive "Equipe Preventiva" (ou a pasta raiz do OneDrive) quando o Claude pedir acesso a arquivos.
3. Peça a alteração que quiser (ex: "mude a cor dos gráficos", "adicione a 14ª medição", "ajuste a tabela X"). Claude vai encontrar estes scripts e os dados já processados aqui dentro e continuar dali — não precisa reprocessar os PDFs do zero, a menos que uma nova medição tenha sido adicionada.
4. Se quiser um espaço de trabalho mais permanente (com instruções e memória fixas para este projeto), no Claude Desktop use **Projects** (painel esquerdo → "+") → "Use an existing folder" → aponte para esta pasta do OneDrive. Vale notar: as configurações do Project (memória, instruções) ficam salvas localmente em cada computador — não sincronizam sozinhas — mas os arquivos aqui dentro (scripts e dados) sincronizam normalmente pelo OneDrive.

## Adicionando uma nova medição

Coloque o novo PDF na pasta principal "Equipe Preventiva" (mesmo padrão de nome: "14º Medição.pdf") e peça para o Claude atualizar o dashboard e a planilha — ele vai reexecutar `extract.py` → `build_dataset.py` → `build_xlsx.py` e regenerar o HTML a partir do `template.html`.

## Formatos aceitos pelo botão "Adicionar Medição"

A partir da 14ª medição (maio/26) a Prefeitura passou a emitir, em vez do **BOLETIM DE MEDIÇÃO**, um **ORÇAMENTO SINTÉTICO COM FÓRMULAS** — outro documento, com outro cabeçalho e outras colunas. O leitor do dashboard reconhece os dois, em PDF ou em Excel:

| Documento | PDF | Excel (.xlsx) |
|---|---|---|
| **Boletim de medição** (1ª a 13ª) — "MEDIÇÃO Nº n", colunas Contrato/Período/Saldo | sim | sim (aba com ITEM / SERVIÇO / UNID.) |
| **Orçamento sintético** (14ª em diante) — colunas Item / Código / Banco / Descrição / Und / Quant. / Valor Unit / Total / Peso (%) | sim | sim |

Como funciona a leitura:

- **Boletim**: identificado pelo texto "MEDIÇÃO Nº n" na 1ª página. Traz o nº da medição, a data, o período e a contratada dentro do próprio documento.
- **Orçamento sintético**: identificado pelo cabeçalho da tabela (Item / Descrição / Quant. / Total). As seções `1` (técnico-profissionais), `2` (insumos) e `3` (custo operacional) viram, respectivamente, mão de obra, materiais e custo operacional; o valor de cada linha é a coluna **Total** e o preço unitário é a coluna de valor unitário que reproduz `Total = Quant. × unitário`.
  - O orçamento **não traz o número da medição**: ele é lido do nome do arquivo (`14º Medição.pdf`, `Medição 14.xlsx`, …). Se não der para deduzir, o dashboard pergunta.
  - O **mês de competência** vem do nome da obra ("MANUTENÇÃO PREVENTIVA - MAIO") combinado com o ano da referência de banco (SINAPI - 04/2026). Se não der para deduzir, o dashboard pergunta.
  - **Contratada e nº do contrato** são herdados da última medição já carregada (o orçamento não os traz).
- Antes de publicar, o dashboard mostra nº da medição, mês e total de cada arquivo lido, e confere a soma das linhas contra os subtotais impressos no documento — se divergir, avisa antes de deixar publicar.

O leitor de `.xlsx` é próprio (ZIP + XML via `DecompressionStream`), sem biblioteca externa: o HTML continua autossuficiente. Ele procura a aba certa sozinho, e localiza as colunas pelos nomes do cabeçalho — então mudanças de posição de coluna na planilha não quebram a leitura.

Validação feita ao implementar: a 14ª e a 15ª medições lidas do PDF e do Excel dão resultados idênticos (154 e 106 itens, R$ 184.457,74 e R$ 187.012,00, batendo com o "Total Geral" impresso); e a 13ª medição lida do Excel reproduz item por item o que o `extract.py` tirou do PDF.

> Atenção ao comparar meses: a partir de maio/26 a composição do **custo operacional** mudou no documento de origem (saíram "vale transporte", "combustíveis" e os veículos medidos por unidade; entraram "veículo leve" por hora e "transporte - mensalista"). O dashboard mostra isso como supressão de umas linhas e início de outras, que é o que de fato aconteceu — não é erro de leitura.

## Dashboard autoatualizável (nova versão do HTML)

O `index.html` é autossuficiente e autoatualizável — não depende do OneDrive nem de internet para ser visualizado, e traz três recursos na barra superior:

1. **Imprimir Relatório Técnico** — gera uma versão resumida (KPIs, gráficos e tabelas por categoria, top-10 insumos da curva ABC, funções de mão de obra) pronta para imprimir/salvar em PDF e encaminhar. Use o diálogo de impressão do navegador → "Salvar como PDF".
2. **Baixar cópia para compartilhar** — gera na hora uma cópia idêntica do HTML (com o nome `Dashboard_Medicoes_Equipe_Preventiva.html`); qualquer pessoa abre no navegador dela, sem precisar da pasta OneDrive. A cópia é sempre gerada sob demanda, com os dados do momento — por isso não existe mais um arquivo fixo desse nome versionado na pasta: ele só ficava desatualizado.
3. **Adicionar Medição (PDF ou Excel)** — o próprio HTML lê o novo documento (boletim de medição ou orçamento sintético; PDF via pdf.js, que só precisa de internet nessa 1ª leitura), recalcula tudo no navegador e publica/baixa o HTML já atualizado. Substitui automaticamente medições de mesmo número.

O "motor" desse HTML autossuficiente está em `scripts/self_update/`:
- `browser_agg.js` — porta de `build_dataset.py` para JavaScript (agregação: pivots, curva ABC, deltas). Validado contra a saída do Python (totais, valores e deltas idênticos).
- `browser_parse.js` — porta de `extract.py` para o navegador usando pdf.js (detecção de linhas/colunas por geometria, calibração automática por PDF). Validado 100% (valores, descrições, unidades, subtotais) contra o `extract.py` nas medições 1, 6, 9 e 13.
- `features.js` — relatório de impressão, upload/merge de PDF e download da cópia/atualização.
- `assemble.py` + `template_full.html` — montam o HTML final injetando os dados brutos (`parsed.json`) e os módulos acima. O HTML embute os dados brutos e roda a agregação no próprio navegador, o que permite recalcular ao adicionar uma medição.

Observação: o fluxo Python original (`extract.py` → `build_dataset.py`) continua válido e é a via mais robusta; o upload no navegador é a alternativa self-service.
