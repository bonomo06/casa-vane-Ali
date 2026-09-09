# Site de casamento — Vanessa & Ali

Site estático (HTML/CSS/JS), sem build e sem servidor. Para publicar, é só copiar
a pasta para qualquer hospedagem de arquivos estáticos.

## Onde cada coisa fica guardada

| Dado | Fonte de verdade |
|---|---|
| Lista de presentes, o que já foi dado | Supabase, tabela `presentes_casamento` |
| Recados dos convidados | Supabase, tabela `recados` |
| **Lista de convidados e confirmações** | **Planilha do Google, aba `Convidados`** |
| Contato de quem deu jantar / música / bar | Fluxo do n8n (webhook), veja abaixo |

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
  **Isto é só para vocês:** o site não mostra mais nada disso ao convidado — nem
  selo, nem ordem diferente. Quem entra vê os 16 presentes iguais, do primeiro ao
  último dia.
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

## Os 3 presentes que dão algo em troca (jantar, música, bar)

Três presentes têm contrapartida, e para entregá-la os noivos precisam saber
quem deu. Depois de clicar em "Ir para o pagamento", esses três (e só esses)
mostram um formulário antes do "Já fiz o pagamento":

| Presente | `tipo` enviado | Campos pedidos |
|---|---|---|
| Jantar no apê | `ape` | nome, WhatsApp |
| Escolher uma música no repertório da banda | `musica` | nome, WhatsApp, **música** |
| Preferência na fila do bar | `bar` | nome, WhatsApp |

Ao confirmar, o site faz um POST em JSON para o webhook do n8n configurado em
`js/webhook-client.js`:

```json
{ "tipo": "musica", "presente": "Escolher uma música no repertório da banda",
  "nome": "Fulana de Tal", "telefone": "11912345678",
  "musica": "Evidências - Chitãozinho & Xororó",
  "valor": 1200, "enviado_em": "2027-04-01T18:30:00.000Z" }
```

`telefone` vai só com dígitos. `musica` vem `null` nos outros dois tipos, em vez
de sair do objeto, para o fluxo do n8n ver sempre a mesma forma.

**Para trocar a URL do webhook:** só `js/webhook-client.js`. Ela não está em
mais nenhum lugar.

Três coisas que valem saber:

- **A URL do webhook é pública.** Ela aparece no código-fonte do site, como
  qualquer coisa no front-end. Dá para alguém disparar o fluxo com dados
  inventados. Para o que ele faz hoje — avisar de um pedido de música e guardar
  um contato — o pior caso é registro falso. Se algum dia esse webhook passar a
  disparar cobrança ou algo irreversível, precisa de um intermediário.
- **O reconhecimento é pelo NOME do presente**, porque a tabela do Supabase não
  tem coluna de tipo. O mapa está em `PERKS`, em `js/helpers.js`. Renomear um
  desses presentes em `scripts/gerar_seed.py` sem atualizar o mapa faria o site
  parar de pedir o contato **em silêncio** — o convidado pagaria e ninguém
  saberia que música ele quer. Existe um teste em `tests/test_gerar_seed.py` que
  falha nesse caso; ele é o alarme.
- **Se o webhook estiver fora**, o site não perde o presente: registra o
  pagamento no Supabase de todo jeito e pede ao convidado que mande nome e
  WhatsApp pelo WhatsApp. O envio ao n8n vem **antes** da marcação no banco de
  propósito — a marcação vocês fazem na mão depois, o pedido de música não.

## Tipografia e ornamentos florais

**A fonte do site é a The Seasons** (a mesma do Canva), auto-hospedada em
`fonts/theseasons.woff2`. Ela vale para o site inteiro **menos os parágrafos da
história**, em `.sobre-nos p` (Cormorant Garamond) e `.sobre-nos .sobre-remate`
(Great Vibes) — foi pedido assim. É o único motivo pelo qual o site ainda
carrega Google Fonts.

Duas coisas para saber antes de mexer nela:

- **Só existe um peso com acentuação completa.** As versões Light/Regular/itálico
  que circulam livremente são demos de 96 glifos, sem `ã ç é ô`. Em português
  isso quebra o site. O `@font-face` declara `font-weight: 100 900` de propósito:
  o mesmo arquivo atende qualquer peso e o navegador nunca aplica negrito
  sintético. A hierarquia é feita por tamanho e cor, não por peso.
- **É licenciada como gratuita para uso pessoal.** Serve para o site do
  casamento. Para uso comercial, a licença sai com a My Creative Land.

Os ornamentos em `img/ornamentos/` são recortes de `img/Caderno de votos.png` e
`img/Save the date (1).png`, que ficam guardados como material de origem e não
são carregados pelo site. Os dois vinham como página A4 inteira — o "Caderno de
votos" trazia a mesma moldura duplicada lado a lado, com 2px de emenda no meio.
Cada peça é usada colada na aresta do container, porque o corte reto da arte foi
desenhado para sangrar na borda da página. Esticar a moldura inteira distorceria
as peônias; por isso são peças soltas e não uma imagem só.

Onde entram: o par de cantos no topo do hero e a moldura da "página do caderno de
votos" em volta da história. O padding vertical de `.sobre-nos` é dimensionado
para caber a arte — ao mudar o tamanho de um, mudar o do outro, senão o texto
volta a cair por cima da folhagem.

## Testes

    python -m unittest discover -s tests    # gerador de seed (14 testes)
    node --test                             # helpers do site (21 testes)

Rodar os dois a partir da raiz do projeto. `node --test` sem argumento descobre
os arquivos sozinho; passar `tests/` quebra no Git Bash do Windows, que converte
o caminho antes de o Node vê-lo.

Para a verificação de ponta a ponta no navegador (67 checagens: renderização,
os 2 passos do pagamento, formulário dos 3 presentes com contrapartida, valor
livre, paleta, enquadramento da foto):

    python -m http.server 8765

E abrir <http://localhost:8765/tests/verificacao-navegador.html>. Ela não escreve
nada no banco.

Nenhum dos três é necessário para o site rodar.

