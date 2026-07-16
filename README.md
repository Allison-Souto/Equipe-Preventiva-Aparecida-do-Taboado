# Equipe Preventiva – Aparecida do Taboado/MS

Dashboard de Medições do **Contrato 131/2024** (Solo Construções e Incorporações).

**Link público (abre em qualquer celular ou computador, no clique):**
https://allison-souto.github.io/Equipe-Preventiva-Aparecida-do-Taboado/

---

## O que é

Uma página única (`index.html`), autossuficiente, que mostra:

- Evolução mensal do custo direto (mão de obra, materiais/insumos e custo operacional);
- Tabelas por medição, curva ABC (concentração de gastos) e comparativos entre medições;
- Botão **Imprimir Relatório Técnico** — gera um relatório resumido para o prefeito (salvar em PDF pelo navegador), já com **QR Code** do link;
- Botão **Enviar por WhatsApp** — abre o WhatsApp com o link pronto para enviar.

Os dados ficam embutidos no próprio arquivo; a leitura de PDF e todos os cálculos rodam no próprio navegador.

---

## Como atualizar (adicionar uma nova medição) — automático

1. Abra o **link público** acima.
2. Clique em **Adicionar Medição (PDF)** e selecione o boletim de medição (PDF).
3. O painel lê o PDF, recalcula tudo e **publica sozinho**. O mesmo link passa a mostrar a versão nova em cerca de 1 minuto. O prefeito continua usando exatamente o mesmo endereço.

> Não é preciso subir nada manualmente nem gerar link novo. O endereço é sempre o mesmo.

### Configuração única da publicação automática (a secretaria faz uma vez, no próprio navegador)

Para o botão publicar sozinho, é preciso um **token do GitHub** guardado **apenas no seu navegador** — ele nunca vai para o arquivo publicado nem para terceiros:

1. No GitHub: **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Em *Repository access*: **Only select repositories → Equipe-Preventiva-Aparecida-do-Taboado**.
3. Em *Permissions → Repository permissions → Contents*: **Read and write**.
4. Gere o token e copie.
5. No dashboard, clique em **Publicação automática** e cole o token. Pronto — a partir daí o botão **Adicionar Medição** publica sozinho.

Se preferir não usar token, o botão **Adicionar Medição** apenas **baixa** um `index.html`; nesse caso, suba esse arquivo no repositório (**Add file → Upload files**) que o link atualiza do mesmo jeito.

---

## Estrutura do projeto

- `index.html` — o dashboard publicado (é o que o GitHub Pages serve no link).
- A pasta de trabalho no OneDrive guarda o "motor" (scripts de leitura de PDF e de montagem do HTML) em `_projeto-dashboard/`.
