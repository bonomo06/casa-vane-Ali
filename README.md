# Site de casamento — Vanessa & Ali

Site estático (HTML/CSS/JS), sem build e sem servidor. Para publicar, é só copiar
a pasta para qualquer hospedagem de arquivos estáticos.

## Onde cada coisa fica guardada

| Dado | Fonte de verdade |
|---|---|
| Lista de presentes, o que já foi dado | Supabase, tabela `presentes_casamento` |
| Recados dos convidados | Supabase, tabela `recados` |
| **Lista de convidados e confirmações** | **Planilha do Google, aba `Convidados`** |

## Antes de publicar

**1. Rode `sql/02_rls.sql` no SQL Editor do Supabase.** A chave do banco fica
visível no código-fonte do site; sem essas políticas, qualquer visitante consegue
apagar a lista de presentes.

**2. Publique `apps-script/Codigo.gs` e cole a URL em `js/sheets-client.js`.**
O passo a passo está comentado no começo do próprio arquivo `.gs`. Sem isso a
busca de nomes não funciona — o site avisa no console e mostra uma mensagem de
erro ao convidado.

**3. Deixe a planilha privada.** Ela está pública hoje, e isso expõe as abas de
custos a qualquer pessoa com o link. Como o Apps Script faz a leitura, o site
funciona com ela privada. Para a Vanessa continuar acessando, compartilhe com o
e-mail dela em Compartilhar → Adicionar pessoas — isso é diferente de deixar
pública.

## Ordem dos arquivos SQL

| Arquivo | Quando rodar |
|---|---|
| `sql/01_schema.sql` | Uma vez, ao criar o banco. Pode rodar de novo sem risco |
| `sql/02_rls.sql` | Uma vez, obrigatoriamente antes de publicar |
| `sql/03_seed_presentes.sql` | Ao criar ou refazer a lista de presentes |

`03_seed_presentes.sql` **apaga a tabela antes de reinserir**. Rodá-lo com o site
no ar perde a marcação de quais presentes já foram dados.

## Tarefas do dia a dia

**Na planilha do Google, aba `Convidados`:**

- **Ver quem confirmou:** coluna `Confirmação`. `pago` = vai, `recusado` = não vai,
  vazio = ainda não respondeu. A coluna `Confirmado em` guarda a data e é
  preenchida pelo site.
- **Adicionar um convidado:** basta escrever o nome numa linha nova na coluna A.
  Não precisa mexer em código nem republicar nada.
- **Corrigir um nome:** editar a célula. Se alguém já tinha confirmado, a
  confirmação continua na linha.

Nomes de `banda 1` a `banda 7` ficam fora da busca do site de propósito, para
ninguém achar esses registros digitando "banda". A regra está em `ehPlaceholder`,
no `apps-script/Codigo.gs`.

**No painel do Supabase (Table Editor):**

- **Ler os recados:** tabela `recados`. Eles não aparecem no site de propósito.
- **Ver o que já foi presenteado:** tabela `presentes_casamento`, coluna `pagou`.
  Ela marca que **ao menos uma** pessoa deu aquele presente — o mesmo presente
  pode ser dado por várias, então `pagou` não é uma contagem.
- **Desfazer uma marcação feita por engano:** mudar `pagou` para `false`. O site
  não consegue fazer isso — só vocês.

## Mudar presentes, preços ou links

A lista de presentes tem uma única fonte de verdade: `scripts/gerar_seed.py`.
Editar lá e rodar:

    python scripts/gerar_seed.py

Isso regenera `sql/03_seed_presentes.sql` e `js/presentes-fallback.js`. Depois é
só rodar o SQL novo no Supabase.

A lista de convidados **não** passa por aqui — ela vive só na planilha.

Os links do Mercado Pago aparecem em dois lugares — `scripts/gerar_seed.py` e
`js/helpers.js` — porque o valor livre precisa deles no browser. Ao adicionar um
link novo, atualizar os dois; há um teste que falha se divergirem.

## Testes

    python -m unittest discover -s tests    # gerador de seed (14 testes)
    node --test                             # helpers do site (21 testes)

Rodar os dois a partir da raiz do projeto. `node --test` sem argumento descobre
os arquivos sozinho; passar `tests/` quebra no Git Bash do Windows, que converte
o caminho antes de o Node vê-lo.

Para a verificação de ponta a ponta no navegador (43 checagens: renderização,
os 2 passos do pagamento, valor livre, paleta, enquadramento da foto):

    python -m http.server 8765

E abrir <http://localhost:8765/tests/verificacao-navegador.html>. Ela não escreve
nada no banco.

Nenhum dos três é necessário para o site rodar.

