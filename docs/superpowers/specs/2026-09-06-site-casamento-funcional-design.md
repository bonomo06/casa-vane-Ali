# Site de casamento Vanessa & Ali — tornar 100% funcional

**Data:** 2026-09-06
**Status:** aprovado para implementação

## Problema

O site é uma vitrine estática sem persistência. Três funcionalidades centrais são
fachadas: a lista de presentes vive num array hardcoded, a busca de convidados usa
20 nomes fictícios, e o "presentear" mostra uma chave Pix inventada
(`vanessa.ali.casamento@pix.com.br`). Os recados são descartados assim que o
convidado clica em enviar.

Este documento descreve como ligar o site ao Supabase, importar a lista real de
convidados, trocar o Pix por links do Mercado Pago com confirmação manual de
pagamento, e aplicar os ajustes de identidade visual e texto pedidos pelos noivos.

## Restrições

O site é HTML/CSS/JS puro, sem `package.json`, sem build e sem servidor. Deploy é
copiar a pasta. **Isso não vai mudar** — é o que permite hospedar em qualquer lugar
e o que mantém o projeto editável por quem não é desenvolvedor.

A consequência é que não existe backend. Toda chamada ao banco parte do browser
com uma chave pública visível no código-fonte, e não existe API do Mercado Pago
para saber se um pagamento aconteceu. As duas decisões mais importantes deste
design derivam dessa restrição: as políticas de RLS precisam ser a única linha de
defesa, e a baixa de um presente depende da honestidade do convidado.

## Arquitetura

```
index.html ── <script> supabase-js v2 (CDN jsdelivr)
           └─ <script> js/script.js
                         │
                         ├── presentes_casamento  SELECT · UPDATE pagou
                         ├── convidados           SELECT · UPDATE confirmacao
                         └── recados              INSERT
                                    │
                              Supabase PostgREST
```

Descartado: `@supabase/ssr` + middleware (exclusivo de Next.js, não existe request
server-side aqui); npm + Vite (introduz etapa de build); `fetch` puro no PostgREST
(economiza uma dependência mas nos deixa mantendo tratamento de erro à mão).

O cliente entra por CDN com versão fixada e o resto do JS continua sendo um arquivo
único, como já é hoje.

### Degradação sem banco

Se o Supabase não responder, a lista de presentes cai para os dados embutidos no JS
e a busca de convidados exibe um aviso pedindo para tentar de novo. Um convidado
nunca vê uma página quebrada — na pior hipótese vê a lista sem saber quais itens já
foram presenteados.

## Modelo de dados

`presentes_casamento` já existe com `id, nome, categoria, preco, pagou`. Faltam o
emoji, a descrição e o link de pagamento, hoje presos no JS. Vão todos para o banco
— assim os noivos trocam um link ou um preço sem tocar em código:

```sql
alter table presentes_casamento
  add column emoji           text,
  add column descricao       text,
  add column link_pagamento  text,
  add column ordem           int;
```

```sql
create table convidados (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  confirmacao   text,                     -- null | 'pago' | 'recusado'
  visivel       boolean not null default true,
  confirmado_em timestamptz
);

create table recados (
  id        uuid primary key default gen_random_uuid(),
  nome      text,
  mensagem  text not null,
  criado_em timestamptz default now()
);
```

`confirmacao` usa a string `pago` para "confirmou presença", preservando a convenção
que os noivos já usam na planilha. `recusado` marca quem avisou que não vai. `null`
é pendente.

`visivel = false` esconde da busca do site os registros que não são convidados
nomeados. Eles continuam na tabela e visíveis no painel do Supabase, que acessa o
banco com a chave de serviço e não passa pelas políticas de RLS — os noivos seguem
enxergando as 113 linhas.

## Estado do banco em 2026-09-06

Sondagem via PostgREST com a chave publicável confirmou que as três tabelas já
existem com as 18 colunas previstas neste documento, incluindo as adicionadas pelo
`ALTER TABLE`. Todas estão vazias. O schema, portanto, já está aplicado.

A mesma sondagem revelou que **RLS está desabilitado ou totalmente permissivo**: um
`DELETE` enviado com a chave publicável — a mesma que ficará visível no código-fonte
do site — retornou `204` nas três tabelas. O teste usou um `id` inexistente e não
apagou nada, mas um filtro abrangente teria zerado a lista de presentes e os 113
convidados.

Isso antecede a integração e não é causado por ela. Mas publicar o site coloca a
chave ao alcance de qualquer visitante, então **aplicar as políticas de RLS é
pré-requisito de publicação**, não um passo de acabamento.

## Segurança

A chave publicável aparece no código-fonte de qualquer visitante, então RLS é a
única barreira. O nível escolhido pelos noivos é "confiar nos convidados": o site
precisa funcionar sem login, e o pior caso aceitável é um convidado marcar um
presente como pago sem ter pagado.

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `presentes_casamento` | público | ✗ | só `pagou`, só `false → true` | ✗ |
| `convidados` | só onde `visivel = true` | ✗ | só `confirmacao` e `confirmado_em`, só onde `visivel = true` | ✗ |
| `recados` | ✗ | público | ✗ | ✗ |

O `UPDATE` de `convidados` repete a condição `visivel = true` no `USING`. Sem isso,
um registro invisível continuaria editável por quem adivinhasse o `id` — a
restrição do `SELECT` esconde a linha, não a protege.

Duas escolhas merecem justificativa:

**`pagou` só anda para frente.** Um `UPDATE` que tente `true → false` é rejeitado
pela policy. Isso impede que alguém "despresenteie" um item já dado — o erro
irreversível fica do lado seguro, e desfazer é uma ação manual dos noivos no painel.

**Recados são write-only.** O site insere mas não lê. Um recado é uma mensagem
particular para os noivos; deixar o `SELECT` aberto significaria que qualquer
visitante lê o que todos escreveram. Os noivos leem no painel do Supabase.

## Fluxo de pagamento

Sem API do Mercado Pago, ninguém pode confirmar o pagamento automaticamente. O
desenho abaixo torna a confirmação acidental improvável em vez de tentar
torná-la impossível.

```
Passo 1   🛋️ Cota do sofá · R$ 600
          [ 💳 Ir para o pagamento ]  → abre o Mercado Pago em nova aba
          [ Fechar ]
             │
             ↓  o passo 2 só é inserido no DOM após este clique
Passo 2   Abrimos o pagamento em outra aba 👉
          [ ✅ Já fiz o pagamento ]
          [ Ainda não / vou fazer depois ]
             │
             ↓
Passo 3   ⚠️ Só confirme se o pagamento foi concluído de verdade.
          Isso marca "Cota do sofá" como presenteada e ela sai da
          lista para todos os outros convidados. Não dá para desfazer.
          [ Sim, tenho certeza — paguei ]
          [ Voltar ]
             │
             ↓
          UPDATE pagou = true → confete → modal de RSVP (fluxo já existente)
```

O botão "já fiz o pagamento" **não existe no DOM** antes do clique em "ir para o
pagamento". Quem não abriu o link não tem como marcar o presente. É a primeira das
duas travas, e a única que o site pode verificar objetivamente.

A segunda trava é o passo 3, que nomeia a consequência (`sai da lista para todos`,
`não dá para desfazer`) em vez de pedir um "tem certeza?" genérico. Um convidado que
clicou por curiosidade para no passo 3.

Presentes com `pagou = true` vão para o fim da lista, em cinza, com selo
"💚 Já presenteado" e botão desabilitado. Não são escondidos: ver que um presente
caro já foi dado é informação útil para quem está decidindo.

### Valor livre

A seção "Quer surpreender?" aceita qualquer número, mas só existem 15 links. O campo
arredonda para o link mais próximo e informa a troca antes de prosseguir — o
convidado digita R$ 320 e lê *"o valor mais próximo disponível é R$ 300"*. A chave
Pix falsa sai do site.

## Preços e links

Três presentes não tinham link. Ajustados para valores existentes:

| Presente | Antes | Depois |
|---|---|---|
| ✨ Brincos da noiva | R$ 120 | R$ 150 |
| 🪟 Redes de proteção | R$ 180 | R$ 200 |
| 🍻 Preferência na fila do bar | R$ 900 | R$ 1000 |

Os 15 links (150 a 1500) entram no `seed.sql` por valor. Presentes de valor igual
compartilham o mesmo link — o link é do valor, não do presente. Os links de R$ 1200
e R$ 1500 ficam registrados como comentário no seed, sem presente associado.

## Importação dos convidados

Fonte: `Cópia de Casamento - Convidados.csv`, 113 linhas, colunas `Nomes` e
`Confirmação`.

O `seed_convidados.sql` é **gerado por script a partir do CSV**, não digitado. Com
113 nomes, transcrever à mão garante erro; e o script pode ser rodado de novo se a
planilha mudar.

Tratamento:

- Nomes têm `trim()` aplicado — o CSV traz `"Bruna Causo "` e `"Karen "` com espaço
  final.
- `Confirmação = pago` → `confirmacao = 'pago'`. Atinge 5 registros
  (Theo Antoneli Calegari, Bernardo Baliero Bertolotti, Julio Lavorenti Gardenal,
  Theo Pires, Ian Pires), que entram já confirmados.
- `visivel = false` para as 9 entradas que não são convidados nomeados:
  `banda1`, `banda2`, `banda 3`, `banda 4`, `banda 5`, `banda 6`, `banda 7`,
  `namorada Renato`, `Ogney`.

Resultado: 113 registros, dos quais 104 buscáveis no site e 5 já confirmados. Não há
nomes duplicados nem apóstrofos no CSV.

`namorada Renato` e `Ogney` são pessoas reais cujo nome completo ainda não se sabe.
Quando os noivos souberem, basta editar o nome e marcar `visivel = true` no painel —
nenhuma alteração de código.

## Front-end

**Verde mais oliva.** As cores são todas variáveis CSS, então são três valores em
`:root` mais dois no array de confete do JS. O tom gira para o amarelo-esverdeado
mantendo a mesma luminosidade, para não alterar o contraste do texto:

| Variável | Antes | Depois |
|---|---|---|
| `--forest` | `#2D5A3D` | `#3E5732` |
| `--forest-light` | `#5A8A6A` | `#6E8759` |
| `--forest-pale` | `#D8E8D4` | `#DDE6D2` |

**Centralizar `vane-ali7.png`.** O casal está a ~68% da largura da foto; a moldura
do carrossel é retrato e `object-fit: cover` com `object-position: center` corta
justamente para o lado oposto. Regra pontual por seletor de atributo, sem tocar nas
outras 8 fotos:

```css
.photo-slide img[src*="vane-ali7"] { object-position: 66% center; }
```

## Textos

Substituições diretas nos cartões de Dora e Ágata, com os textos fornecidos pelos
noivos. O texto novo da Ágata não menciona que ela é gata; a foto e o `alt` seguem
sendo de gato, com o `alt` ajustado para acompanhar o texto.

A seção **"Sobre nós"** não existe no site e será criada entre o hero e os
presentes, com item correspondente no menu de navegação.

## Entregáveis

Quatro arquivos SQL para os noivos colarem no SQL Editor do Supabase, na ordem:

| Arquivo | Conteúdo |
|---|---|
| `sql/01_schema.sql` | `ALTER TABLE` e `CREATE TABLE` idempotentes — já aplicados, roda como no-op |
| `sql/02_rls.sql` | Políticas da tabela acima. **Bloqueia publicação enquanto não rodar** |
| `sql/03_seed_presentes.sql` | 15 presentes com emoji, descrição, link e ordem |
| `sql/04_seed_convidados.sql` | 113 convidados, gerado a partir do CSV |

O SQL Editor roda como superusuário e não passa por RLS, então o seed funciona
mesmo com as políticas já aplicadas.

Mais as alterações em `index.html`, `css/style.css` e `js/script.js`, o novo
`js/helpers.js` e o gerador `scripts/gerar_seed.py`.

## Verificação

O projeto não tem suíte de testes e adicionar uma infraestrutura de teste
contradiz a restrição de "zero build". A verificação é manual, com um roteiro
explícito por funcionalidade:

- Lista de presentes carrega do Supabase; item com `pagou = true` aparece em cinza,
  no fim, com botão desabilitado.
- Passo 2 do modal de pagamento é inacessível sem clicar em "ir para o pagamento".
- Confirmar pagamento grava `pagou = true` e o item muda de estado sem recarregar.
- Tentativa de `UPDATE pagou = false` via console é rejeitada pela RLS.
- Busca de convidados encontra nome real com acento e ignora caixa; `banda1` não
  aparece em nenhuma busca.
- Confirmar presença grava `pago`; recusar grava `recusado`.
- Recado enviado aparece na tabela `recados`; `SELECT` em `recados` pelo browser é
  negado.
- Valor livre de R$ 320 oferece R$ 300 e abre o link correto.
- Supabase indisponível: lista cai para o fallback embutido e a busca avisa o erro.
- Sétima foto do carrossel mostra o casal centralizado.

---

## Emenda 2026-09-06 — convidados migram para o Google Sheets

Os noivos pediram que as confirmações fossem gravadas na planilha do Google, não
no Supabase, para trabalharem onde já estão acostumados. Isto substitui a seção
"Importação dos convidados" e a parte de `convidados` do "Modelo de dados".

### O que forçou o desenho

A API key fornecida **não escreve**. O Google recusa com
`401 UNAUTHENTICATED / "API keys are not supported by this API"`: uma API key só
lê dados públicos, e escrever exige credencial que identifique uma pessoa. Nenhuma
delas pode ficar num site estático — a chave privada de uma conta de serviço no
código-fonte daria a qualquer visitante poder de editar e apagar a planilha.

Descoberta relacionada: a planilha estava **pública**, e tem 4 abas, duas delas de
custos do casamento. Foi possível baixar tudo sem autenticação.

### Solução

Um **Google Apps Script Web App** (`apps-script/Codigo.gs`) faz leitura *e*
escrita. A autorização mora na conta Google dona da planilha; o site só conhece
uma URL e não carrega credencial nenhuma.

Fazer o script também ler resolve o problema de privacidade de graça: a planilha
volta a ser privada, e a Vanessa segue com acesso por compartilhamento direto
com o e-mail dela. A API key deixa de ser usada e pode ser revogada.

```
js/script.js → js/sheets-client.js → Apps Script Web App → planilha (privada)
                                     (executa como o dono)
```

| Rota | O que faz |
|---|---|
| `doGet` | Devolve os convidados em JSON, filtrando `banda N` |
| `doPost` | Recebe `{nome, confirmacao}`, acha a linha, escreve colunas B e C |

Detalhes que não são óbvios:

- O POST usa `Content-Type: text/plain`. Com `application/json` o browser manda um
  preflight `OPTIONS`, que o Apps Script não responde — a chamada falha por CORS
  sem erro legível.
- `LockService` serializa as escritas: sem ele, duas confirmações simultâneas
  poderiam procurar a linha sobre um estado desatualizado.
- A identidade do convidado passa a ser o **nome**, já que a planilha não tem id.
  Os 113 nomes são únicos, o que foi verificado.
- Republicar é obrigatório após editar o `.gs`: salvar não atualiza a URL.

### Consequências

- `convidados` sai do Supabase. `sql/04_seed_convidados.sql` e o CSV foram
  apagados, e `scripts/gerar_seed.py` gera só os presentes — uma fonte de verdade
  por dado, sem cópias divergindo.
- `visivel` deixa de existir como coluna. Os placeholders são filtrados por
  regex no Apps Script, e `namorada Renato` e `Ogney` passam a ser visíveis por
  decisão dos noivos: só `banda 1`–`banda 7` ficam fora da busca.
- Adicionar convidado agora é escrever numa linha da planilha, sem tocar em código.
- Presentes e recados seguem no Supabase, inalterados.
