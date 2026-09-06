# Site de casamento — Vanessa & Ali

Site estático (HTML/CSS/JS), sem build e sem servidor. Para publicar, é só copiar
a pasta para qualquer hospedagem de arquivos estáticos.

## Antes de publicar

**Rode `sql/02_rls.sql` no SQL Editor do Supabase.** A chave do banco fica visível
no código-fonte do site; sem essas políticas, qualquer visitante consegue apagar a
lista de presentes e a lista de convidados.

## Ordem dos arquivos SQL

| Arquivo | Quando rodar |
|---|---|
| `sql/01_schema.sql` | Uma vez, ao criar o banco. Pode rodar de novo sem risco |
| `sql/02_rls.sql` | Uma vez, obrigatoriamente antes de publicar |
| `sql/03_seed_presentes.sql` | Ao criar ou refazer a lista de presentes |
| `sql/04_seed_convidados.sql` | Ao criar ou refazer a lista de convidados |

Os dois arquivos de seed **apagam a tabela antes de reinserir**. Rodar
`04_seed_convidados.sql` de novo depois do site no ar perde as confirmações já
recebidas.

## Tarefas do dia a dia

Tudo pelo painel do Supabase (Table Editor):

- **Ver quem confirmou:** tabela `convidados`, coluna `confirmacao`.
  `pago` = vai, `recusado` = não vai, vazio = ainda não respondeu.
- **Ler os recados:** tabela `recados`. Eles não aparecem no site de propósito.
- **Desfazer um presente marcado por engano:** tabela `presentes_casamento`, mudar
  `pagou` para `false`. O site não consegue fazer isso — só vocês.
- **Adicionar um convidado:** inserir uma linha em `convidados` com `visivel = true`.
- **Revelar um convidado oculto** (`namorada Renato`, `Ogney`): corrigir o `nome` e
  marcar `visivel = true`.

## Mudar presentes, preços ou links

A lista de presentes tem uma única fonte de verdade: `scripts/gerar_seed.py`.
Editar lá e rodar:

    python scripts/gerar_seed.py

Isso regenera `sql/03_seed_presentes.sql` e `js/presentes-fallback.js`. Depois é
só rodar o SQL novo no Supabase.

Os links do Mercado Pago aparecem em dois lugares — `scripts/gerar_seed.py` e
`js/helpers.js` — porque o valor livre precisa deles no browser. Ao adicionar um
link novo, atualizar os dois; há um teste que falha se divergirem.

## Testes

    python -m unittest discover -s tests    # gerador de seed (17 testes)
    node --test                             # helpers do site (15 testes)

Rodar os dois a partir da raiz do projeto. `node --test` sem argumento descobre
os arquivos sozinho; passar `tests/` quebra no Git Bash do Windows, que converte
o caminho antes de o Node vê-lo.

Para a verificação de ponta a ponta no navegador (30 checagens: renderização,
os 3 passos do pagamento, valor livre, paleta, enquadramento da foto):

    python -m http.server 8765

E abrir <http://localhost:8765/tests/verificacao-navegador.html>. Ela não escreve
nada no banco.

Nenhum dos três é necessário para o site rodar.

