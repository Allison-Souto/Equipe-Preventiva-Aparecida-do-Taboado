# Projeto — Dashboard de Medições (Contrato 131/2024)

Esta pasta guarda todo o "motor" por trás do dashboard e da planilha entregues (`Dashboard_Medicoes_Equipe_Preventiva.html` e `Medicoes_Equipe_Preventiva.xlsx`, na pasta principal). Como ela está dentro do OneDrive, sincroniza automaticamente para qualquer computador logado na mesma conta — é isso que permite continuar o trabalho de outra máquina.

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

## Dashboard autoatualizável (nova versão do HTML)

O `Dashboard_Medicoes_Equipe_Preventiva.html` agora é autossuficiente e autoatualizável — não depende do OneDrive nem de internet para ser visualizado, e traz três recursos na barra superior:

1. **Imprimir Relatório Técnico** — gera uma versão resumida (KPIs, gráficos e tabelas por categoria, top-10 insumos da curva ABC, funções de mão de obra) pronta para imprimir/salvar em PDF e encaminhar. Use o diálogo de impressão do navegador → "Salvar como PDF".
2. **Baixar cópia para compartilhar** — salva uma cópia idêntica do HTML; qualquer pessoa abre no navegador dela, sem precisar da pasta OneDrive.
3. **Adicionar Medição (PDF)** — o próprio HTML lê o novo boletim em PDF (via pdf.js, só precisa de internet nessa 1ª leitura), recalcula tudo no navegador e baixa o HTML já atualizado. Substitui automaticamente medições de mesmo número.

O "motor" desse HTML autossuficiente está em `scripts/self_update/`:
- `browser_agg.js` — porta de `build_dataset.py` para JavaScript (agregação: pivots, curva ABC, deltas). Validado contra a saída do Python (totais, valores e deltas idênticos).
- `browser_parse.js` — porta de `extract.py` para o navegador usando pdf.js (detecção de linhas/colunas por geometria, calibração automática por PDF). Validado 100% (valores, descrições, unidades, subtotais) contra o `extract.py` nas medições 1, 6, 9 e 13.
- `features.js` — relatório de impressão, upload/merge de PDF e download da cópia/atualização.
- `assemble.py` + `template_full.html` — montam o HTML final injetando os dados brutos (`parsed.json`) e os módulos acima. O HTML embute os dados brutos e roda a agregação no próprio navegador, o que permite recalcular ao adicionar uma medição.

Observação: o fluxo Python original (`extract.py` → `build_dataset.py`) continua válido e é a via mais robusta; o upload no navegador é a alternativa self-service.
