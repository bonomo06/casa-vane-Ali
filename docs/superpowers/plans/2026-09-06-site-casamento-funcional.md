# Site de casamento funcional — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ligar o site estático de casamento ao Supabase, substituir a chave Pix falsa por links do Mercado Pago com confirmação manual em três passos, importar os 113 convidados reais, e aplicar os ajustes de cor, enquadramento e texto pedidos pelos noivos.

**Architecture:** O site continua sendo HTML/CSS/JS puro, sem build e sem servidor. O `supabase-js` v2 entra por CDN com versão fixada. A lógica pura (arredondamento de valor, busca de nomes sem acento) sai para `js/helpers.js` num wrapper UMD, o que a torna testável no Node sem alterar como o browser carrega o site. Os dados dos presentes têm uma única fonte de verdade — `scripts/gerar_seed.py` — que emite tanto o SQL do seed quanto o fallback JS.

**Tech Stack:** HTML5, CSS3, JavaScript ES2020 (sem módulos), `@supabase/supabase-js@2` via cdn.jsdelivr.net, PostgreSQL/Supabase, Python 3 (só para gerar seed, não roda em produção), `node --test` (só para testes, não roda em produção).

**Spec:** `docs/superpowers/specs/2026-09-06-site-casamento-funcional-design.md`

## Global Constraints

- **Zero build, zero deploy step.** Não criar `package.json`, não introduzir bundler, não converter para ES modules. O deploy é copiar a pasta; o site precisa continuar abrindo por `file://`.
- **Nenhuma dependência de runtime além do CDN do Supabase.** Python e `node --test` são ferramentas de desenvolvimento e nunca são referenciados por `index.html`.
- **Credenciais Supabase** (públicas por natureza, vão no código-fonte):
  - URL: `https://lhywppgqvzxxdsmjvmdk.supabase.co`
  - Publishable key: `sb_publishable_Ys0jd4lJmV8clvj-yjh_1w_zqLnc72u`
- **`confirmacao`** aceita exatamente três valores: `'pago'` (confirmou presença), `'recusado'` (não vai), `NULL` (pendente). Nunca `'confirmado'`.
- **RLS é pré-requisito de publicação.** Hoje um `DELETE` anônimo retorna `204` nas três tabelas. A Task 2 precisa estar aplicada no banco antes de o site ir ao ar.
- **Idioma:** todo texto visível ao convidado em português do Brasil. Comentários e nomes de função em português, seguindo o código existente (`renderGifts` é exceção herdada; código novo usa português).
- **Sem `DELETE` e sem `INSERT`** em `presentes_casamento` ou `convidados` a partir do site.

### Sobre TDD neste plano

O projeto não tem suíte de testes e adicionar um framework de teste de DOM
contradiz a restrição de zero build. A divisão adotada:

- **Lógica pura** (Tasks 3 e 4) — TDD real com `node --test`, que é builtin do Node
  24 e não exige `package.json` nem instalação.
- **Banco de dados** (Tasks 1 e 2) — verificação real por `curl` contra o Supabase,
  incluindo teste negativo (a operação proibida precisa falhar).
- **DOM e integração** (Tasks 5 a 10) — roteiro de verificação manual explícito ao
  fim de cada task, herdado da seção "Verificação" da spec.

Nunca escrever "testar manualmente" sem listar os passos exatos e o resultado
esperado de cada um.

---

### Task 1: Schema idempotente

Documenta o schema já aplicado no banco, de forma reproduzível. Rodar este arquivo num banco já configurado não pode causar erro nem perder dados.

**Files:**
- Create: `sql/01_schema.sql`

**Interfaces:**
- Consumes: nada.
- Produces: as tabelas `presentes_casamento(id, nome, categoria, preco, pagou, emoji, descricao, link_pagamento, ordem)`, `convidados(id, nome, confirmacao, visivel, confirmado_em)`, `recados(id, nome, mensagem, criado_em)`. Todas as tasks seguintes dependem desses nomes de coluna.

- [ ] **Step 1: Escrever o schema idempotente**

Criar `sql/01_schema.sql`:

```sql
-- 01_schema.sql — estrutura das tabelas do site de casamento.
-- Idempotente: pode rodar quantas vezes quiser, em banco novo ou já configurado.
-- Rodar no SQL Editor do Supabase.

alter table presentes_casamento add column if not exists emoji          text;
alter table presentes_casamento add column if not exists descricao      text;
alter table presentes_casamento add column if not exists link_pagamento text;
alter table presentes_casamento add column if not exists ordem          int;

create table if not exists convidados (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  confirmacao   text,                     -- null | 'pago' | 'recusado'
  visivel       boolean not null default true,
  confirmado_em timestamptz
);

create table if not exists recados (
  id        uuid primary key default gen_random_uuid(),
  nome      text,
  mensagem  text not null,
  criado_em timestamptz default now()
);

-- A busca de convidados filtra por visivel e ordena por nome.
create index if not exists convidados_visivel_idx on convidados (visivel);
```

- [ ] **Step 2: Verificar que as colunas existem no banco**

Este comando sonda cada coluna: `200` significa que existe, `400` que falta.

```bash
URL="https://lhywppgqvzxxdsmjvmdk.supabase.co"
KEY="sb_publishable_Ys0jd4lJmV8clvj-yjh_1w_zqLnc72u"
probe(){ for c in $2; do code=$(curl -s -o /dev/null -w "%{http_code}" \
  "$URL/rest/v1/$1?select=$c&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"); \
  echo "$code $1.$c"; done; }
probe presentes_casamento "id nome categoria preco pagou emoji descricao link_pagamento ordem"
probe convidados "id nome confirmacao visivel confirmado_em"
probe recados "id nome mensagem criado_em"
```

Esperado: `200` nas 18 linhas. Qualquer `400` significa que o schema divergiu e o arquivo precisa ser rodado no SQL Editor antes de continuar.

- [ ] **Step 3: Commit**

```bash
git add sql/01_schema.sql
git commit -m "feat(sql): schema idempotente das tabelas do site"
```

---

### Task 2: Políticas de RLS

A task mais importante do plano. Hoje qualquer pessoa com a chave pública apaga as três tabelas.

**Files:**
- Create: `sql/02_rls.sql`

**Interfaces:**
- Consumes: as tabelas da Task 1.
- Produces: um banco onde o papel `anon` pode ler presentes e convidados visíveis, inserir recados, marcar `pagou` de `false` para `true`, e gravar `confirmacao`/`confirmado_em` — e nada além disso.

- [ ] **Step 1: Escrever o teste negativo e vê-lo falhar**

Antes de aplicar as políticas, registrar o estado atual. Rodar:

```bash
URL="https://lhywppgqvzxxdsmjvmdk.supabase.co"
KEY="sb_publishable_Ys0jd4lJmV8clvj-yjh_1w_zqLnc72u"
for t in presentes_casamento convidados recados; do
  printf "%-22s " "$t"
  curl -s -o /dev/null -X DELETE \
    "$URL/rest/v1/$t?id=eq.00000000-0000-0000-0000-000000000000" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -w "DELETE=%{http_code}\n"
done
```

Esperado **agora** (o bug): `DELETE=204` nas três — a exclusão é permitida.
Esperado **depois** da Step 3: `DELETE=401` ou `403` nas três.

O filtro usa um `id` que não existe, então nada é apagado em nenhum dos casos.

- [ ] **Step 2: Escrever as políticas**

Criar `sql/02_rls.sql`:

```sql
-- 02_rls.sql — políticas de acesso.
-- CRÍTICO: rodar ANTES de publicar o site. A chave publicável fica visível no
-- código-fonte, então estas políticas são a única barreira contra um visitante
-- apagar a lista de presentes ou a lista de convidados.
-- Rodar no SQL Editor do Supabase.

alter table presentes_casamento enable row level security;
alter table convidados          enable row level security;
alter table recados             enable row level security;

-- Recriar do zero para o arquivo ser idempotente.
drop policy if exists presentes_leitura_publica  on presentes_casamento;
drop policy if exists presentes_marcar_pago      on presentes_casamento;
drop policy if exists convidados_leitura_visivel on convidados;
drop policy if exists convidados_confirmar       on convidados;
drop policy if exists recados_insercao_publica   on recados;

-- ---------- presentes_casamento ----------
-- Qualquer visitante lê a lista inteira.
create policy presentes_leitura_publica
  on presentes_casamento for select
  to anon, authenticated
  using (true);

-- Só é possível marcar como pago, nunca desmarcar. USING casa a linha ANTES do
-- update (precisa estar não-paga); WITH CHECK valida a linha DEPOIS (precisa
-- ficar paga). Juntos permitem exclusivamente a transição false -> true.
create policy presentes_marcar_pago
  on presentes_casamento for update
  to anon, authenticated
  using (pagou = false)
  with check (pagou = true);

-- ---------- convidados ----------
-- Placeholders (banda, nomes incompletos) não aparecem para o visitante.
create policy convidados_leitura_visivel
  on convidados for select
  to anon, authenticated
  using (visivel = true);

-- A condição visivel = true se repete aqui de propósito: esconder a linha no
-- SELECT não a protege de um UPDATE por quem adivinhe o id.
create policy convidados_confirmar
  on convidados for update
  to anon, authenticated
  using (visivel = true)
  with check (visivel = true and (confirmacao is null or confirmacao in ('pago', 'recusado')));

-- ---------- recados ----------
-- Write-only: o site insere, mas ninguém lê pelo site. Um recado é uma mensagem
-- particular para os noivos, que leem no painel do Supabase.
create policy recados_insercao_publica
  on recados for insert
  to anon, authenticated
  with check (true);

-- Nenhuma policy de DELETE em nenhuma tabela: com RLS ligado, a ausência de
-- policy nega a operação.
```

- [ ] **Step 3: Pedir ao usuário para rodar no Supabase**

Este passo depende de uma ação humana — o agente não tem acesso ao SQL Editor.

Mensagem ao usuário: *"Cola `sql/02_rls.sql` no SQL Editor do Supabase e roda. Me avisa quando terminar que eu verifico."*

Não seguir para a Step 4 antes da confirmação.

- [ ] **Step 4: Rodar o teste negativo de novo e verificar que agora falha**

Rodar exatamente o comando da Step 1.

Esperado: `DELETE=401` ou `DELETE=403` nas três tabelas. Se ainda vier `204`, as políticas não foram aplicadas — voltar à Step 3.

- [ ] **Step 5: Verificar que o permitido continua permitido**

```bash
URL="https://lhywppgqvzxxdsmjvmdk.supabase.co"
KEY="sb_publishable_Ys0jd4lJmV8clvj-yjh_1w_zqLnc72u"
H=(-H "apikey: $KEY" -H "Authorization: Bearer $KEY")
echo -n "SELECT presentes  (espera 200): "; curl -s -o /dev/null -w "%{http_code}\n" "$URL/rest/v1/presentes_casamento?select=id&limit=1" "${H[@]}"
echo -n "SELECT convidados (espera 200): "; curl -s -o /dev/null -w "%{http_code}\n" "$URL/rest/v1/convidados?select=id&limit=1" "${H[@]}"
echo -n "SELECT recados    (espera 200 e lista vazia sempre): "; curl -s "$URL/rest/v1/recados?select=id" "${H[@]}"; echo
```

Esperado: `200` nos dois primeiros. O terceiro devolve `[]` — sem policy de `SELECT`, o RLS filtra tudo, então a leitura é sempre vazia mesmo com recados gravados. É o comportamento desejado.

- [ ] **Step 6: Commit**

```bash
git add sql/02_rls.sql
git commit -m "feat(sql): políticas de RLS restringindo escrita anônima"
```

---

### Task 3: Gerador de seed a partir do CSV

Uma única fonte de verdade para os 15 presentes, emitindo tanto o SQL quanto o fallback JS. Transcrever 113 nomes à mão garante erro, e o CSV contém um apóstrofo perigoso para SQL.

**Files:**
- Create: `scripts/gerar_seed.py`
- Create: `tests/test_gerar_seed.py`
- Generate: `sql/03_seed_presentes.sql`, `sql/04_seed_convidados.sql`, `js/presentes-fallback.js`
- Read: `Cópia de Casamento - Convidados.csv`

**Interfaces:**
- Consumes: as colunas da Task 1.
- Produces: `js/presentes-fallback.js`, que define `window.PRESENTES_FALLBACK` — um array de objetos `{nome, categoria, preco, emoji, descricao, link_pagamento, ordem, pagou: false}`. A Task 6 consome essa variável.

- [ ] **Step 1: Escrever o teste falhando**

Criar `tests/test_gerar_seed.py`:

```python
import subprocess, sys, unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))

import gerar_seed


class TestEscapeSql(unittest.TestCase):
    def test_apostrofo_e_duplicado(self):
        # "antes do 'sim'" na descricao do ensaio fotografico quebraria o INSERT.
        self.assertEqual(gerar_seed.sql_txt("antes do 'sim'"), "'antes do ''sim'''")

    def test_none_vira_null(self):
        self.assertEqual(gerar_seed.sql_txt(None), "NULL")


class TestLeituraCsv(unittest.TestCase):
    def setUp(self):
        self.convidados = gerar_seed.ler_convidados(RAIZ / "Cópia de Casamento - Convidados.csv")

    def test_total_de_convidados(self):
        self.assertEqual(len(self.convidados), 113)

    def test_espaco_no_fim_do_nome_e_removido(self):
        nomes = [c["nome"] for c in self.convidados]
        self.assertIn("Bruna Causo", nomes)
        self.assertIn("Karen", nomes)
        self.assertNotIn("Bruna Causo ", nomes)

    def test_cinco_ja_confirmados_com_pago(self):
        pagos = sorted(c["nome"] for c in self.convidados if c["confirmacao"] == "pago")
        self.assertEqual(pagos, sorted([
            "Theo Antoneli Calegari", "Bernardo Baliero Bertolotti",
            "Julio Lavorenti Gardenal", "Theo Pires", "Ian Pires",
        ]))

    def test_pendentes_ficam_none(self):
        pedro = next(c for c in self.convidados if c["nome"] == "Pedro Bonomo")
        self.assertIsNone(pedro["confirmacao"])

    def test_nove_placeholders_invisiveis(self):
        ocultos = sorted(c["nome"] for c in self.convidados if not c["visivel"])
        self.assertEqual(ocultos, sorted([
            "banda1", "banda2", "banda 3", "banda 4", "banda 5", "banda 6",
            "banda 7", "namorada Renato", "Ogney",
        ]))

    def test_convidado_real_e_visivel(self):
        rosana = next(c for c in self.convidados if c["nome"] == "Rosana Gardenal Antoneli")
        self.assertTrue(rosana["visivel"])


class TestPresentes(unittest.TestCase):
    def test_sao_quinze(self):
        self.assertEqual(len(gerar_seed.PRESENTES), 15)

    def test_todo_presente_tem_link(self):
        sem_link = [p["nome"] for p in gerar_seed.PRESENTES if not p.get("link_pagamento")]
        self.assertEqual(sem_link, [])

    def test_precos_ajustados(self):
        por_nome = {p["nome"]: p["preco"] for p in gerar_seed.PRESENTES}
        self.assertEqual(por_nome["Brincos da noiva"], 150)
        self.assertEqual(por_nome["Redes de proteção"], 200)
        self.assertEqual(por_nome["Preferência na fila do bar"], 1000)

    def test_link_corresponde_ao_preco(self):
        for p in gerar_seed.PRESENTES:
            self.assertEqual(
                p["link_pagamento"], gerar_seed.LINKS[p["preco"]],
                f"{p['nome']}: link nao corresponde ao preco {p['preco']}",
            )

    def test_categorias_validas(self):
        for p in gerar_seed.PRESENTES:
            self.assertIn(p["categoria"], {"casa", "pets", "casal"})


class TestGeracao(unittest.TestCase):
    def test_gera_os_tres_arquivos(self):
        subprocess.run([sys.executable, str(RAIZ / "scripts" / "gerar_seed.py")], check=True)
        for caminho in ("sql/03_seed_presentes.sql", "sql/04_seed_convidados.sql", "js/presentes-fallback.js"):
            self.assertTrue((RAIZ / caminho).exists(), caminho)

    def test_sql_de_convidados_tem_113_inserts(self):
        texto = (RAIZ / "sql" / "04_seed_convidados.sql").read_text(encoding="utf-8")
        self.assertEqual(texto.count("\n  ("), 113)

    def test_fallback_js_expoe_a_variavel(self):
        texto = (RAIZ / "js" / "presentes-fallback.js").read_text(encoding="utf-8")
        self.assertIn("window.PRESENTES_FALLBACK", texto)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `python -m unittest discover -s tests -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'gerar_seed'`

- [ ] **Step 3: Escrever o gerador**

Criar `scripts/gerar_seed.py`:

```python
#!/usr/bin/env python3
"""Gera os arquivos de seed a partir de uma fonte unica de verdade.

Roda so em desenvolvimento; nada aqui vai para o site publicado.

    python scripts/gerar_seed.py

Emite:
    sql/03_seed_presentes.sql   presentes para o Supabase
    sql/04_seed_convidados.sql  convidados para o Supabase
    js/presentes-fallback.js    mesma lista, para o site funcionar sem banco
"""
import csv
import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CSV_CONVIDADOS = RAIZ / "Cópia de Casamento - Convidados.csv"

# Links do Mercado Pago, por valor. O link e do valor, nao do presente:
# presentes de mesmo preco compartilham o mesmo link.
LINKS = {
    150: "https://mpago.la/2rYBAzG",
    200: "https://mpago.la/1DxCxep",
    250: "https://mpago.la/2pjkV7C",
    300: "https://mpago.la/1iESGbX",
    350: "https://mpago.la/2oD5cr5",
    400: "https://mpago.la/2Bb3UCc",
    450: "https://mpago.la/2VB4y4z",
    500: "https://mpago.la/1QnLMJq",
    550: "https://mpago.la/2t9WLoL",
    600: "https://mpago.la/1rTw746",
    700: "https://mpago.la/21zartN",
    800: "https://mpago.la/1rn5fXk",
    1000: "https://mpago.la/21DHeUS",
    1200: "https://mpago.la/2qwk9Ht",  # sem presente associado
    1500: "https://mpago.la/1r2Wf66",  # sem presente associado
}

# Precos ajustados aos links disponiveis: Brincos 120->150, Redes 180->200,
# Fila do bar 900->1000.
_PRESENTES = [
    ("👞", "Sapatos dos noivos", "casal", 500, "Porque ir descalço é feio."),
    ("🧁", "Cota de doces finos", "casal", 250, "A nutri mandou repor a glicose depois de tantos drinks."),
    ("🐾", "Petsitter da Dora e da Ágata", "pets", 350, "Estão banidas da festa para não criar um caos."),
    ("🍹", "Cota de drinks", "casal", 400, "Para manter a energia alta e os brindes animados a noite toda."),
    ("🧀", "Cota da mesa de frios", "casal", 200, "Para beliscar e recarregar as energias entre uma dança e outra."),
    ("✨", "Brincos da noiva", "casal", 150, "O toque de brilho e elegância especial para o grande dia."),
    ("📸", "Ensaio fotográfico pré-casamento", "casal", 700, "Guardando os melhores sorrisos e momentos antes do 'sim'."),
    ("🧱", "Cota de pisos do apartamento", "casa", 300, "Cada metro quadrado conta para deixar nosso lar perfeito."),
    ("📐", "Cota de móveis planejados", "casa", 550, "Tudo no seu devido lugar no nosso novo apartamento."),
    ("⚡", "Cota de eletrodomésticos", "casa", 450, "Facilitando a rotina e o dia a dia do novo casal."),
    ("🛋️", "Cota do sofá", "casa", 600, "Para a Dora tirar muitos cochilos."),
    ("🪟", "Redes de proteção", "pets", 200, "Para a Ágata ficar na janela com segurança."),
    ("🏡", "Estadia do casal em Arujá", "casal", 800, "Um descanso super especial e merecido para os noivos."),
    ("🍻", "Preferência na fila do bar", "casal", 1000, "Passe na frente e não perca nenhum segundo da festa!"),
    ("🎵", "Escolher uma música no repertório da banda", "casal", 1000, "Sua música favorita tocando ao vivo para agitar a pista!"),
]

PRESENTES = [
    {
        "ordem": i + 1,
        "emoji": emoji,
        "nome": nome,
        "categoria": categoria,
        "preco": preco,
        "descricao": descricao,
        "link_pagamento": LINKS[preco],
    }
    for i, (emoji, nome, categoria, preco, descricao) in enumerate(_PRESENTES)
]

# Entradas que nao sao convidados nomeados: ficam no banco mas fora da busca.
OCULTOS = {"namorada Renato", "Ogney"}


def sql_txt(valor):
    """Literal de texto para SQL, com apostrofo duplicado. None vira NULL."""
    if valor is None:
        return "NULL"
    return "'" + str(valor).replace("'", "''") + "'"


def e_placeholder(nome):
    return nome in OCULTOS or re.match(r"^banda\s*\d+$", nome, re.IGNORECASE) is not None


def ler_convidados(caminho=CSV_CONVIDADOS):
    """Le o CSV exportado da planilha. Colunas: Nomes, Confirmação."""
    convidados = []
    with open(caminho, encoding="utf-8", newline="") as f:
        for linha in csv.DictReader(f):
            nome = (linha.get("Nomes") or "").strip()
            if not nome:
                continue
            marca = (linha.get("Confirmação") or "").strip().lower()
            convidados.append({
                "nome": nome,
                # 'pago' na planilha significa "confirmou presenca".
                "confirmacao": "pago" if marca == "pago" else None,
                "visivel": not e_placeholder(nome),
            })
    return convidados


CABECALHO = (
    "-- GERADO POR scripts/gerar_seed.py — NÃO EDITAR À MÃO.\n"
    "-- Para alterar, edite o script (ou o CSV) e rode: python scripts/gerar_seed.py\n"
)


def gerar_sql_presentes():
    linhas = ",\n".join(
        "  ({ordem}, {emoji}, {nome}, {categoria}, {preco}, {descricao}, {link})".format(
            ordem=p["ordem"],
            emoji=sql_txt(p["emoji"]),
            nome=sql_txt(p["nome"]),
            categoria=sql_txt(p["categoria"]),
            preco=p["preco"],
            descricao=sql_txt(p["descricao"]),
            link=sql_txt(p["link_pagamento"]),
        )
        for p in PRESENTES
    )
    return (
        CABECALHO
        + "-- Rodar no SQL Editor do Supabase, depois de 02_rls.sql.\n"
        + "-- Recria a lista do zero; presentes ja marcados como pagos sao perdidos.\n\n"
        + "delete from presentes_casamento;\n\n"
        + "insert into presentes_casamento\n"
        + "  (ordem, emoji, nome, categoria, preco, descricao, link_pagamento)\nvalues\n"
        + linhas
        + ";\n"
    )


def gerar_sql_convidados(convidados):
    linhas = ",\n".join(
        "  ({nome}, {conf}, {vis})".format(
            nome=sql_txt(c["nome"]),
            conf=sql_txt(c["confirmacao"]),
            vis="true" if c["visivel"] else "false",
        )
        for c in convidados
    )
    visiveis = sum(1 for c in convidados if c["visivel"])
    confirmados = sum(1 for c in convidados if c["confirmacao"] == "pago")
    return (
        CABECALHO
        + "-- Fonte: Cópia de Casamento - Convidados.csv\n"
        + f"-- {len(convidados)} convidados · {visiveis} buscáveis no site · {confirmados} já confirmados\n"
        + "-- Rodar no SQL Editor do Supabase, depois de 02_rls.sql.\n"
        + "-- Recria a lista do zero; confirmações feitas pelo site são perdidas.\n\n"
        + "delete from convidados;\n\n"
        + "insert into convidados (nome, confirmacao, visivel)\nvalues\n"
        + linhas
        + ";\n"
    )


def gerar_fallback_js():
    dados = [dict(p, pagou=False) for p in PRESENTES]
    corpo = json.dumps(dados, ensure_ascii=False, indent=2)
    return (
        "// GERADO POR scripts/gerar_seed.py — NÃO EDITAR À MÃO.\n"
        "// Para alterar, edite o script e rode: python scripts/gerar_seed.py\n"
        "//\n"
        "// Lista usada quando o Supabase não responde. O site mostra os presentes\n"
        "// mesmo offline; só não sabe quais já foram dados.\n"
        "window.PRESENTES_FALLBACK = " + corpo + ";\n"
    )


def main():
    convidados = ler_convidados()
    escrever(RAIZ / "sql" / "03_seed_presentes.sql", gerar_sql_presentes())
    escrever(RAIZ / "sql" / "04_seed_convidados.sql", gerar_sql_convidados(convidados))
    escrever(RAIZ / "js" / "presentes-fallback.js", gerar_fallback_js())


def escrever(caminho, conteudo):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(conteudo, encoding="utf-8")
    print(f"gerado: {caminho.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `python -m unittest discover -s tests -v`
Expected: PASS, 14 testes.

- [ ] **Step 5: Gerar os arquivos e conferir o apóstrofo**

```bash
python scripts/gerar_seed.py
grep -n "sim" sql/03_seed_presentes.sql
```

Esperado: a linha do ensaio fotográfico aparece com `''sim''` (dois apóstrofos de cada lado), não `'sim'`.

- [ ] **Step 6: Pedir ao usuário para rodar os seeds no Supabase**

Mensagem ao usuário: *"Roda `sql/03_seed_presentes.sql` e depois `sql/04_seed_convidados.sql` no SQL Editor. Me avisa que eu confiro."*

- [ ] **Step 7: Verificar as contagens no banco**

```bash
URL="https://lhywppgqvzxxdsmjvmdk.supabase.co"
KEY="sb_publishable_Ys0jd4lJmV8clvj-yjh_1w_zqLnc72u"
H=(-H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Prefer: count=exact")
echo -n "presentes (espera 15):            "; curl -s -o /dev/null -D- "$URL/rest/v1/presentes_casamento?select=id" "${H[@]}" | grep -i content-range
echo -n "convidados visiveis (espera 104): "; curl -s -o /dev/null -D- "$URL/rest/v1/convidados?select=id" "${H[@]}" | grep -i content-range
echo -n "ja confirmados (espera 5):        "; curl -s -o /dev/null -D- "$URL/rest/v1/convidados?select=id&confirmacao=eq.pago" "${H[@]}" | grep -i content-range
echo -n "banda1 na busca (espera lista []):"; curl -s "$URL/rest/v1/convidados?select=nome&nome=eq.banda1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"; echo
```

Esperado: `content-range: 0-14/15`, `0-103/104`, `0-4/5`, e `[]` na última — o RLS esconde os placeholders.

- [ ] **Step 8: Commit**

```bash
git add scripts/gerar_seed.py tests/test_gerar_seed.py sql/03_seed_presentes.sql sql/04_seed_convidados.sql js/presentes-fallback.js
git commit -m "feat(sql): gerador de seed com 15 presentes e 113 convidados"
```

---

### Task 4: Helpers puros

Toda a lógica que pode estar errada de forma silenciosa: arredondar um valor livre para um link existente e buscar nomes ignorando acento e caixa.

**Files:**
- Create: `js/helpers.js`
- Create: `tests/helpers.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `window.WeddingHelpers` no browser e `module.exports` no Node, com:
  - `VALORES_COM_LINK: number[]` — os 15 valores, em ordem crescente.
  - `LINKS_POR_VALOR: Record<number, string>`
  - `valorMaisProximo(valor: number): number` — empate resolve para o menor.
  - `linkParaValor(valor: number): string | null`
  - `normalizar(texto: string): string` — minúscula, sem acento, espaços colapsados.
  - `buscarConvidados(lista: {nome: string}[], termo: string): {nome: string}[]`
  - `formatarBRL(valor: number): string` — ex.: `"R$ 1.200"`.

  As Tasks 6, 7 e 8 consomem esses nomes exatos.

- [ ] **Step 1: Escrever os testes falhando**

Criar `tests/helpers.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const H = require('../js/helpers.js');

test('valorMaisProximo devolve o proprio valor quando ele tem link', () => {
    assert.strictEqual(H.valorMaisProximo(300), 300);
    assert.strictEqual(H.valorMaisProximo(1500), 1500);
});

test('valorMaisProximo arredonda para o link mais proximo', () => {
    assert.strictEqual(H.valorMaisProximo(320), 300);
    assert.strictEqual(H.valorMaisProximo(340), 350);
});

test('valorMaisProximo resolve empate para o menor valor', () => {
    // 175 esta a 25 de 150 e a 25 de 200; escolhe 150 por ser mais gentil.
    assert.strictEqual(H.valorMaisProximo(175), 150);
});

test('valorMaisProximo satura nos extremos', () => {
    assert.strictEqual(H.valorMaisProximo(1), 150);
    assert.strictEqual(H.valorMaisProximo(99999), 1500);
});

test('valorMaisProximo rejeita entrada invalida', () => {
    assert.strictEqual(H.valorMaisProximo(0), null);
    assert.strictEqual(H.valorMaisProximo(-50), null);
    assert.strictEqual(H.valorMaisProximo(NaN), null);
    assert.strictEqual(H.valorMaisProximo('abc'), null);
});

test('linkParaValor devolve o link do valor exato', () => {
    assert.strictEqual(H.linkParaValor(600), 'https://mpago.la/1rTw746');
});

test('linkParaValor devolve null para valor sem link', () => {
    assert.strictEqual(H.linkParaValor(999), null);
});

test('normalizar remove acento e caixa', () => {
    assert.strictEqual(H.normalizar('Ágata Mourad'), 'agata mourad');
    assert.strictEqual(H.normalizar('GONÇALVES'), 'goncalves');
});

test('normalizar colapsa espacos e apara as pontas', () => {
    assert.strictEqual(H.normalizar('  Bruna   Causo  '), 'bruna causo');
});

test('normalizar aceita valores vazios sem quebrar', () => {
    assert.strictEqual(H.normalizar(null), '');
    assert.strictEqual(H.normalizar(undefined), '');
});

test('buscarConvidados encontra ignorando acento', () => {
    const lista = [{ nome: 'Elias Jose Piazentin Gonçalves Junior' }, { nome: 'Pedro Bonomo' }];
    assert.deepStrictEqual(H.buscarConvidados(lista, 'goncalves'), [lista[0]]);
    assert.deepStrictEqual(H.buscarConvidados(lista, 'GONÇAL'), [lista[0]]);
});

test('buscarConvidados casa por sobrenome no meio do nome', () => {
    const lista = [{ nome: 'Rosana Gardenal Antoneli' }, { nome: 'Max Eisele' }];
    assert.deepStrictEqual(H.buscarConvidados(lista, 'antoneli'), [lista[0]]);
});

test('buscarConvidados com termo vazio devolve lista vazia', () => {
    const lista = [{ nome: 'Pedro Bonomo' }];
    assert.deepStrictEqual(H.buscarConvidados(lista, '   '), []);
});

test('formatarBRL usa ponto de milhar e nao mostra centavos redondos', () => {
    assert.strictEqual(H.formatarBRL(600), 'R$ 600');
    assert.strictEqual(H.formatarBRL(1200), 'R$ 1.200');
});

test('VALORES_COM_LINK tem os 15 valores em ordem crescente', () => {
    assert.strictEqual(H.VALORES_COM_LINK.length, 15);
    const ordenado = [...H.VALORES_COM_LINK].sort((a, b) => a - b);
    assert.deepStrictEqual(H.VALORES_COM_LINK, ordenado);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/helpers.test.js`
Expected: FAIL com `Cannot find module '../js/helpers.js'`

- [ ] **Step 3: Escrever os helpers**

Criar `js/helpers.js`:

```js
// Funções puras: sem DOM, sem rede, sem estado.
// O wrapper abaixo faz o arquivo servir para os dois mundos — <script> no browser
// (expõe window.WeddingHelpers) e require() no Node (para os testes) — sem exigir
// bundler nem ES modules, que quebrariam o site aberto por file://.
(function (raiz, fabrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabrica();
    else raiz.WeddingHelpers = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {

    // Links do Mercado Pago, por valor. Mantido em sincronia manual com
    // scripts/gerar_seed.py — os presentes vêm do banco, mas o valor livre
    // precisa dos links no browser.
    var LINKS_POR_VALOR = {
        150: 'https://mpago.la/2rYBAzG',
        200: 'https://mpago.la/1DxCxep',
        250: 'https://mpago.la/2pjkV7C',
        300: 'https://mpago.la/1iESGbX',
        350: 'https://mpago.la/2oD5cr5',
        400: 'https://mpago.la/2Bb3UCc',
        450: 'https://mpago.la/2VB4y4z',
        500: 'https://mpago.la/1QnLMJq',
        550: 'https://mpago.la/2t9WLoL',
        600: 'https://mpago.la/1rTw746',
        700: 'https://mpago.la/21zartN',
        800: 'https://mpago.la/1rn5fXk',
        1000: 'https://mpago.la/21DHeUS',
        1200: 'https://mpago.la/2qwk9Ht',
        1500: 'https://mpago.la/1r2Wf66'
    };

    var VALORES_COM_LINK = Object.keys(LINKS_POR_VALOR)
        .map(Number)
        .sort(function (a, b) { return a - b; });

    // Empate resolve para o menor valor: entre pedir R$150 e R$200 de quem digitou
    // R$175, pedir menos é mais gentil.
    function valorMaisProximo(valor) {
        var n = Number(valor);
        if (!isFinite(n) || n <= 0) return null;
        return VALORES_COM_LINK.reduce(function (melhor, atual) {
            return Math.abs(atual - n) < Math.abs(melhor - n) ? atual : melhor;
        }, VALORES_COM_LINK[0]);
    }

    function linkParaValor(valor) {
        return LINKS_POR_VALOR[Number(valor)] || null;
    }

    // NFD separa a letra do acento; a faixa U+0300-U+036F são os acentos soltos.
    // Os escapes \u são obrigatórios aqui: escrever os acentos combinantes
    // literalmente no regex depende do encoding do arquivo e quebra silenciosamente.
    function normalizar(texto) {
        if (texto === null || texto === undefined) return '';
        return String(texto)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }


    // Busca por trecho em qualquer posição: quem digita só o sobrenome se acha.
    function buscarConvidados(lista, termo) {
        var alvo = normalizar(termo);
        if (!alvo) return [];
        return (lista || []).filter(function (c) {
            return normalizar(c && c.nome).indexOf(alvo) !== -1;
        });
    }

    function formatarBRL(valor) {
        return 'R$ ' + Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    }

    return {
        LINKS_POR_VALOR: LINKS_POR_VALOR,
        VALORES_COM_LINK: VALORES_COM_LINK,
        valorMaisProximo: valorMaisProximo,
        linkParaValor: linkParaValor,
        normalizar: normalizar,
        buscarConvidados: buscarConvidados,
        formatarBRL: formatarBRL
    };
});
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `node --test tests/helpers.test.js`
Expected: PASS, 15 testes.

- [ ] **Step 5: Garantir que os links do JS batem com os do Python**

Os dois arquivos guardam a mesma tabela de links. Conferir que não divergiram:

```bash
node -e "console.log(Object.entries(require('./js/helpers.js').LINKS_POR_VALOR).map(([k,v])=>k+' '+v).sort().join('\n'))" > /tmp/js.txt
python -c "import sys; sys.path.insert(0,'scripts'); import gerar_seed; print('\n'.join(sorted(f'{k} {v}' for k,v in gerar_seed.LINKS.items())))" > /tmp/py.txt
diff /tmp/js.txt /tmp/py.txt && echo "IGUAIS"
```

Expected: `IGUAIS`, sem diferenças.

- [ ] **Step 6: Commit**

```bash
git add js/helpers.js tests/helpers.test.js
git commit -m "feat(js): helpers puros de valor e busca de convidados, com testes"
```

---

### Task 5: Cliente Supabase

Carrega o `supabase-js` e cria um cliente único, com as funções de acesso ao banco isoladas num só lugar.

**Files:**
- Create: `js/supabase-client.js`
- Modify: `index.html` (tags `<script>` antes de `js/script.js`)

**Interfaces:**
- Consumes: `window.supabase` (do CDN).
- Produces: `window.WeddingDB` com:
  - `disponivel(): boolean`
  - `listarPresentes(): Promise<Array|null>` — `null` se o banco falhar.
  - `marcarPresentePago(id: string): Promise<boolean>`
  - `listarConvidados(): Promise<Array|null>`
  - `salvarConfirmacao(id: string, confirmacao: 'pago'|'recusado'): Promise<boolean>`
  - `salvarRecado(nome: string, mensagem: string): Promise<boolean>`

  As Tasks 6, 7, 8 e 9 consomem esses nomes exatos.

- [ ] **Step 1: Escrever o cliente**

Criar `js/supabase-client.js`:

```js
// Acesso ao banco. Todo SELECT/UPDATE/INSERT do site passa por aqui — nenhuma
// outra parte do código conhece nomes de tabela ou de coluna.
//
// A chave abaixo é publicável por definição: ela aparece no código-fonte de
// qualquer visitante. Quem protege os dados são as políticas de RLS em
// sql/02_rls.sql, não o segredo da chave.
(function () {
    var SUPABASE_URL = 'https://lhywppgqvzxxdsmjvmdk.supabase.co';
    var SUPABASE_KEY = 'sb_publishable_Ys0jd4lJmV8clvj-yjh_1w_zqLnc72u';

    var cliente = null;
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
        console.warn('[WeddingDB] supabase-js não carregou; o site vai usar o fallback local.');
    }

    function disponivel() {
        return cliente !== null;
    }

    // Devolve null (e não []) quando o banco falha, para quem chama distinguir
    // "não consegui perguntar" de "perguntei e não há nada".
    async function listarPresentes() {
        if (!cliente) return null;
        try {
            const { data, error } = await cliente
                .from('presentes_casamento')
                .select('id, nome, categoria, preco, pagou, emoji, descricao, link_pagamento, ordem')
                .order('ordem', { ascending: true });
            if (error) throw error;
            return data;
        } catch (e) {
            console.error('[WeddingDB] falha ao listar presentes:', e);
            return null;
        }
    }

    // A policy só aceita a transição false -> true, então o filtro .eq('pagou', false)
    // também evita sobrescrever um presente que outra pessoa acabou de dar.
    async function marcarPresentePago(id) {
        if (!cliente) return false;
        try {
            const { error } = await cliente
                .from('presentes_casamento')
                .update({ pagou: true })
                .eq('id', id)
                .eq('pagou', false);
            if (error) throw error;
            return true;
        } catch (e) {
            console.error('[WeddingDB] falha ao marcar presente como pago:', e);
            return false;
        }
    }

    async function listarConvidados() {
        if (!cliente) return null;
        try {
            const { data, error } = await cliente
                .from('convidados')
                .select('id, nome, confirmacao')
                .order('nome', { ascending: true });
            if (error) throw error;
            return data;
        } catch (e) {
            console.error('[WeddingDB] falha ao listar convidados:', e);
            return null;
        }
    }

    async function salvarConfirmacao(id, confirmacao) {
        if (!cliente) return false;
        try {
            const { error } = await cliente
                .from('convidados')
                .update({ confirmacao: confirmacao, confirmado_em: new Date().toISOString() })
                .eq('id', id);
            if (error) throw error;
            return true;
        } catch (e) {
            console.error('[WeddingDB] falha ao salvar confirmação:', e);
            return false;
        }
    }

    async function salvarRecado(nome, mensagem) {
        if (!cliente) return false;
        try {
            const { error } = await cliente
                .from('recados')
                .insert({ nome: nome || null, mensagem: mensagem });
            if (error) throw error;
            return true;
        } catch (e) {
            console.error('[WeddingDB] falha ao salvar recado:', e);
            return false;
        }
    }

    window.WeddingDB = {
        disponivel: disponivel,
        listarPresentes: listarPresentes,
        marcarPresentePago: marcarPresentePago,
        listarConvidados: listarConvidados,
        salvarConfirmacao: salvarConfirmacao,
        salvarRecado: salvarRecado
    };
})();
```

- [ ] **Step 2: Ligar os scripts no HTML**

Em `index.html`, substituir a linha `<script src="js/script.js"></script>` por:

```html
    <!-- Versão fixada de propósito: um major novo do supabase-js não pode
         quebrar o site sem ninguém perceber. -->
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/dist/umd/supabase.js"></script>
    <script src="js/presentes-fallback.js"></script>
    <script src="js/helpers.js"></script>
    <script src="js/supabase-client.js"></script>
    <script src="js/script.js"></script>
```

A ordem importa: `supabase-client.js` lê `window.supabase`, e `script.js` lê os três anteriores.

- [ ] **Step 3: Verificar no browser**

Abrir `index.html` e, no console do navegador, rodar:

```js
WeddingDB.disponivel()                                  // → true
(await WeddingDB.listarPresentes()).length              // → 15
(await WeddingDB.listarConvidados()).length             // → 104
WeddingHelpers.valorMaisProximo(320)                    // → 300
window.PRESENTES_FALLBACK.length                        // → 15
```

Esperado: exatamente esses valores, sem erro no console.

- [ ] **Step 4: Verificar que a RLS barra o que deve barrar**

Ainda no console, confirmar que a proteção funciona de dentro do site:

```js
const p = (await WeddingDB.listarPresentes())[0];
// Tentativa de "despresentear" — precisa falhar.
await supabase.createClient('https://lhywppgqvzxxdsmjvmdk.supabase.co','sb_publishable_Ys0jd4lJmV8clvj-yjh_1w_zqLnc72u')
  .from('presentes_casamento').update({pagou:false}).eq('id', p.id);
```

Esperado: a resposta traz `error` preenchido, ou `data` vazio sem nenhuma linha alterada. Se a linha for alterada, a Task 2 não foi aplicada.

- [ ] **Step 5: Commit**

```bash
git add js/supabase-client.js index.html
git commit -m "feat(js): cliente Supabase isolando o acesso ao banco"
```

---

### Task 6: Lista de presentes vinda do banco

Substitui o array hardcoded, mostra o que já foi presenteado e cai para o fallback quando o banco não responde.

**Files:**
- Modify: `js/script.js:8-127` (remover o array `gifts`), `js/script.js:129-175` (`renderGifts`)
- Modify: `css/style.css` (estado "já presenteado")

**Interfaces:**
- Consumes: `WeddingDB.listarPresentes`, `window.PRESENTES_FALLBACK`, `WeddingHelpers.formatarBRL`.
- Produces: `estadoPresentes` — array em memória com os presentes carregados; `recarregarPresentes()`; `renderizarPresentes(categoria)`. A Task 7 chama `recarregarPresentes()` após confirmar um pagamento.

- [ ] **Step 1: Remover o array hardcoded e carregar do banco**

Em `js/script.js`, apagar o bloco `const gifts = [...]` (linhas 8-127) e a constante `PIX_KEY`, e substituir por:

```js
// Presentes carregados do Supabase. Vazio até recarregarPresentes() rodar.
let estadoPresentes = [];
let categoriaAtual = 'todos';

async function recarregarPresentes() {
    const doBanco = await WeddingDB.listarPresentes();
    if (doBanco) {
        estadoPresentes = doBanco;
    } else {
        // Sem banco o site continua de pé; só não sabe o que já foi dado.
        estadoPresentes = (window.PRESENTES_FALLBACK || []).map(p => Object.assign({}, p));
        showToast('Não conseguimos conferir a lista agora. Os presentes estão aí, mas pode ser que algum já tenha sido dado.');
    }
    renderizarPresentes(categoriaAtual);
}
```

- [ ] **Step 2: Reescrever a renderização**

Substituir a função `renderGifts` inteira por:

```js
const giftsGrid = document.getElementById('giftsGrid');

function renderizarPresentes(categoria = 'todos') {
    categoriaAtual = categoria;
    const filtrados = categoria === 'todos'
        ? estadoPresentes.slice()
        : estadoPresentes.filter(p => p.categoria === categoria);

    // Já presenteados vão para o fim: ver que um presente caro já foi dado é
    // informação útil, mas não deve competir com o que ainda está disponível.
    filtrados.sort((a, b) => (a.pagou === b.pagou) ? 0 : (a.pagou ? 1 : -1));

    if (!filtrados.length) {
        giftsGrid.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:var(--ink-soft);">Carregando os presentes...</p>';
        return;
    }

    giftsGrid.innerHTML = filtrados.map((p, i) => `
        <div class="gift-card${p.pagou ? ' presenteado' : ''}" style="animation: slideUp .5s ${i * 0.04}s ease both;">
            ${p.pagou ? '<span class="gift-badge-dado">💚 Já presenteado</span>' : ''}
            <div class="gift-emoji">${p.emoji || '🎁'}</div>
            <span class="gift-tag ${p.categoria}">${tagLabel(p.categoria)}</span>
            <div class="gift-title">${escaparHtml(p.nome)}</div>
            <p class="gift-desc">${escaparHtml(p.descricao || '')}</p>
            <div class="gift-price">${WeddingHelpers.formatarBRL(p.preco)}</div>
            <div class="gift-divider"></div>
            <button class="present-btn" data-id="${p.id || ''}" ${p.pagou ? 'disabled' : ''}>
                ${p.pagou ? 'Já foi presenteado' : 'Quero presentear'}
            </button>
        </div>
    `).join('');

    giftsGrid.querySelectorAll('.present-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
            const presente = estadoPresentes.find(p => String(p.id) === btn.dataset.id);
            if (!presente) return;
            abrirModalPagamento(presente);
            const r = btn.getBoundingClientRect();
            confettiBurst(r.left + r.width / 2, r.top);
        });
    });
}

// Nome e descrição vêm do banco. Hoje só os noivos escrevem lá, mas escapar é
// barato e evita que um dia um texto com < ou & quebre o cartão.
function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
}
```

Trocar a chamada solta `renderGifts();` por nada (a Task 10 chama `recarregarPresentes()` na inicialização) e, no listener das abas, trocar `renderGifts(btn.dataset.category)` por `renderizarPresentes(btn.dataset.category)`.

- [ ] **Step 3: Estilo do presente já dado**

Acrescentar ao fim de `css/style.css`:

```css
/* ---------- PRESENTE JÁ DADO ---------- */
.gift-card.presenteado {
    opacity: 0.55;
    filter: grayscale(0.85);
    position: relative;
}

.gift-card.presenteado .present-btn {
    background: transparent;
    border: 1.5px solid var(--ink-soft);
    color: var(--ink-soft);
    cursor: not-allowed;
}

.gift-badge-dado {
    position: absolute;
    top: 12px;
    right: 12px;
    background: var(--forest);
    color: var(--white);
    font-size: 0.72rem;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 999px;
    letter-spacing: 0.02em;
}
```

- [ ] **Step 4: Verificar no browser**

1. Abrir `index.html`. Esperado: 15 cartões, com os preços 150 (Brincos), 200 (Redes) e 1000 (Fila do bar) já ajustados.
2. Clicar nas abas Apartamento / Dora & Ágata / Casório. Esperado: 4, 2 e 9 cartões respectivamente.
3. No SQL Editor: `update presentes_casamento set pagou = true where nome = 'Cota do sofá';`
4. Recarregar a página. Esperado: "Cota do sofá" aparece em cinza, no fim da lista, com selo "💚 Já presenteado" e botão desabilitado que não abre modal ao clicar.
5. Desfazer: `update presentes_casamento set pagou = false where nome = 'Cota do sofá';`
6. Testar o fallback: no DevTools, aba Network, marcar "Offline" e recarregar. Esperado: os 15 cartões aparecem mesmo assim, com o toast avisando que a lista não pôde ser conferida.

- [ ] **Step 5: Commit**

```bash
git add js/script.js css/style.css
git commit -m "feat(presentes): lista carregada do Supabase com estado de já presenteado"
```

---

### Task 7: Fluxo de pagamento em três passos

O coração da mudança. Sem API do Mercado Pago, a confirmação é do convidado — o desenho torna o clique acidental improvável.

**Files:**
- Modify: `index.html` (trocar o markup de `#giftModal`)
- Modify: `js/script.js` (trocar `openGiftModal`, `copyPixBtn`)
- Modify: `css/style.css` (aviso do passo 3)

**Interfaces:**
- Consumes: `WeddingDB.marcarPresentePago`, `recarregarPresentes`, `WeddingHelpers.formatarBRL`.
- Produces: `abrirModalPagamento(presente)`, chamado pela Task 6 e pela Task 8 (valor livre).

- [ ] **Step 1: Trocar o markup do modal**

Em `index.html`, substituir o bloco inteiro `<div class="modal-overlay" id="giftModal">...</div>` por:

```html
    <!-- MODAL DE PAGAMENTO — 3 passos -->
    <div class="modal-overlay" id="giftModal">
        <div class="modal-box">
            <h3 id="modalTitle">Presentear</h3>
            <p class="modal-gift-name" id="modalGiftName"></p>
            <div class="modal-valor" id="modalValor"></div>

            <!-- PASSO 1 -->
            <div id="pagoStep1">
                <p style="font-size:0.84rem; color:var(--ink-soft); margin-bottom:14px;">
                    O pagamento abre em outra aba, direto no Mercado Pago. Pix, cartão ou boleto, como preferir.
                </p>
                <div class="modal-actions">
                    <a class="btn btn-primary" id="irPagamentoBtn" href="#" target="_blank" rel="noopener noreferrer">💳 Ir para o pagamento</a>
                    <button class="btn-close" id="closeModalBtn">Fechar</button>
                </div>
            </div>

            <!-- PASSO 2 — inserido só depois do clique no passo 1 -->
            <div id="pagoStep2" style="display:none;">
                <p style="font-size:0.9rem; color:var(--ink-soft); margin-bottom:16px; line-height:1.5;">
                    Abrimos o pagamento em outra aba 👉<br>
                    Quando terminar, volta aqui para a gente tirar esse presente da lista.
                </p>
                <div class="modal-actions">
                    <button class="btn btn-primary" id="jaPagueiBtn">✅ Já fiz o pagamento</button>
                    <button class="btn-close" id="pagarDepoisBtn">Ainda não / vou fazer depois</button>
                </div>
            </div>

            <!-- PASSO 3 — reconfirmação -->
            <div id="pagoStep3" style="display:none;">
                <div class="aviso-irreversivel">
                    <strong>⚠️ Só confirme se o pagamento foi concluído de verdade.</strong>
                    <p id="avisoTextoPresente"></p>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-primary" id="confirmarPagamentoBtn">Sim, tenho certeza — paguei</button>
                    <button class="btn-close" id="voltarPasso2Btn">Voltar</button>
                </div>
            </div>
        </div>
    </div>
```

- [ ] **Step 2: Escrever a lógica dos passos**

Em `js/script.js`, substituir `openGiftModal`, `closeModal` e o listener de `copyPixBtn` por:

```js
// ========== MODAL DE PAGAMENTO (3 passos) ==========
const modal = document.getElementById('giftModal');
const modalTitle = document.getElementById('modalTitle');
const modalGiftName = document.getElementById('modalGiftName');
const modalValor = document.getElementById('modalValor');
const passo1 = document.getElementById('pagoStep1');
const passo2 = document.getElementById('pagoStep2');
const passo3 = document.getElementById('pagoStep3');
const irPagamentoBtn = document.getElementById('irPagamentoBtn');
const rsvpPromptModal = document.getElementById('rsvpPromptModal');

let presenteEmPagamento = null;

function mostrarPasso(n) {
    passo1.style.display = n === 1 ? 'block' : 'none';
    passo2.style.display = n === 2 ? 'block' : 'none';
    passo3.style.display = n === 3 ? 'block' : 'none';
}

// `presente` precisa de: nome, preco, link_pagamento, emoji. `id` é opcional —
// o valor livre não tem id e por isso não marca nada como pago.
function abrirModalPagamento(presente) {
    presenteEmPagamento = presente;
    modalTitle.textContent = (presente.emoji || '🎁') + ' Presentear';
    modalGiftName.textContent = presente.nome;
    modalValor.textContent = WeddingHelpers.formatarBRL(presente.preco);
    irPagamentoBtn.href = presente.link_pagamento || '#';
    document.getElementById('avisoTextoPresente').textContent =
        'Isso vai marcar "' + presente.nome + '" como presenteado e ele sai da lista para todos os outros convidados. Não dá para desfazer.';
    mostrarPasso(1);
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    modal.classList.remove('open');
    document.body.style.overflow = '';
    presenteEmPagamento = null;
}

// O passo 2 só aparece depois deste clique. Quem não abriu o link de pagamento
// não tem como marcar o presente — é a única trava que o site verifica sozinho.
irPagamentoBtn.addEventListener('click', () => {
    // Sem id não há o que marcar no banco (caso do valor livre): fecha e agradece.
    if (!presenteEmPagamento || !presenteEmPagamento.id) {
        setTimeout(() => { closeModal(); abrirPromptRsvp(); }, 600);
        return;
    }
    setTimeout(() => mostrarPasso(2), 600);
});

document.getElementById('closeModalBtn').addEventListener('click', closeModal);
document.getElementById('pagarDepoisBtn').addEventListener('click', () => {
    closeModal();
    showToast('Sem pressa! O presente continua na lista.');
});
document.getElementById('jaPagueiBtn').addEventListener('click', () => mostrarPasso(3));
document.getElementById('voltarPasso2Btn').addEventListener('click', () => mostrarPasso(2));

document.getElementById('confirmarPagamentoBtn').addEventListener('click', async (e) => {
    if (!presenteEmPagamento || !presenteEmPagamento.id) return closeModal();
    const botao = e.currentTarget;
    botao.disabled = true;
    botao.textContent = 'Registrando...';

    const ok = await WeddingDB.marcarPresentePago(presenteEmPagamento.id);
    botao.disabled = false;
    botao.textContent = 'Sim, tenho certeza — paguei';

    if (!ok) {
        showToast('Não conseguimos registrar agora. O pagamento está feito — a gente marca na mão, pode deixar!');
        closeModal();
        return;
    }

    showToast('Presente registrado! Muito obrigado ❤️');
    closeModal();
    await recarregarPresentes();
    setTimeout(abrirPromptRsvp, 450);
});

function abrirPromptRsvp() {
    if (rsvpPromptModal) {
        rsvpPromptModal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
```

Apagar as referências a `pixKeyDisplay` e ao botão `copyPixBtn`, que não existem mais.

- [ ] **Step 3: Estilo do aviso**

Acrescentar ao fim de `css/style.css`:

```css
/* ---------- AVISO IRREVERSÍVEL (passo 3 do pagamento) ---------- */
.aviso-irreversivel {
    background: var(--rose-pale);
    border: 1.5px solid var(--rose-light);
    border-radius: var(--radius);
    padding: 16px;
    margin-bottom: 18px;
    text-align: left;
}

.aviso-irreversivel strong {
    display: block;
    color: var(--rose);
    font-size: 0.92rem;
    margin-bottom: 8px;
}

.aviso-irreversivel p {
    font-size: 0.86rem;
    color: var(--ink-soft);
    line-height: 1.5;
    margin: 0;
}
```

- [ ] **Step 4: Verificar no browser**

1. Clicar em "Quero presentear" na Cota do sofá. Esperado: passo 1, com o botão "Ir para o pagamento". **Nenhum** botão de "já paguei" visível.
2. No DevTools, rodar `document.getElementById('pagoStep2').style.display`. Esperado: `"none"`.
3. Clicar em "Ir para o pagamento". Esperado: abre `https://mpago.la/1rTw746` em nova aba; ao voltar, o modal está no passo 2.
4. Clicar em "Já fiz o pagamento". Esperado: passo 3, com o aviso citando "Cota do sofá" pelo nome.
5. Clicar em "Voltar". Esperado: volta ao passo 2 sem gravar nada. Conferir no SQL Editor que `pagou` ainda é `false`.
6. Repetir até o passo 3 e clicar em "Sim, tenho certeza". Esperado: toast de agradecimento, o cartão fica cinza sem recarregar a página, e o modal de RSVP abre.
7. Conferir no banco: `select pagou from presentes_casamento where nome = 'Cota do sofá';` → `true`.
8. Desfazer: `update presentes_casamento set pagou = false where nome = 'Cota do sofá';`

- [ ] **Step 5: Commit**

```bash
git add index.html js/script.js css/style.css
git commit -m "feat(pagamento): fluxo em 3 passos com link do Mercado Pago e reconfirmação"
```

---

### Task 8: Valor livre arredondado

**Files:**
- Modify: `index.html` (seção `#valor-livre`)
- Modify: `js/script.js` (listener de `freeGiftBtn`)

**Interfaces:**
- Consumes: `WeddingHelpers.valorMaisProximo`, `WeddingHelpers.linkParaValor`, `abrirModalPagamento`.
- Produces: nada novo.

- [ ] **Step 1: Ajustar o texto da seção**

Em `index.html`, na seção `#valor-livre`, trocar o parágrafo por:

```html
            <p>Mande qualquer valor que faça sentido pro seu coração (e pro seu bolso). Qualquer quantia já é linda.</p>
            <div class="free-amount">
                <label for="freeValue">R$</label>
                <input type="number" id="freeValue" placeholder="100" min="1">
            </div>
            <p id="avisoValorLivre" style="font-size:0.82rem; color:var(--ink-soft); margin:8px 0 12px; min-height:1.2em;"></p>
```

- [ ] **Step 2: Arredondar e avisar**

Em `js/script.js`, substituir o listener de `freeGiftBtn` por:

```js
// ========== VALOR LIVRE ==========
// Só existem 15 links fixos, então o valor digitado vira o link mais próximo.
// O aviso aparece enquanto a pessoa digita, para a troca não ser surpresa.
const campoValorLivre = document.getElementById('freeValue');
const avisoValorLivre = document.getElementById('avisoValorLivre');

function atualizarAvisoValorLivre() {
    const digitado = parseFloat(campoValorLivre.value);
    const proximo = WeddingHelpers.valorMaisProximo(digitado);
    if (!proximo) {
        avisoValorLivre.textContent = '';
    } else if (proximo === digitado) {
        avisoValorLivre.textContent = '';
    } else {
        avisoValorLivre.textContent = 'O valor mais próximo disponível é ' + WeddingHelpers.formatarBRL(proximo) + '.';
    }
}

campoValorLivre.addEventListener('input', atualizarAvisoValorLivre);

document.getElementById('freeGiftBtn').addEventListener('click', (e) => {
    const proximo = WeddingHelpers.valorMaisProximo(parseFloat(campoValorLivre.value));
    if (!proximo) {
        showToast('Coloca um valor, pode ser qualquer um!');
        return;
    }
    abrirModalPagamento({
        emoji: '🎁',
        nome: 'Presente de valor livre',
        preco: proximo,
        link_pagamento: WeddingHelpers.linkParaValor(proximo)
        // Sem `id`: não há linha na tabela para marcar como paga.
    });
    const r = e.currentTarget.getBoundingClientRect();
    confettiBurst(r.left + r.width / 2, r.top);
});
```

- [ ] **Step 3: Verificar no browser**

1. Digitar `320`. Esperado: aviso *"O valor mais próximo disponível é R$ 300."*
2. Digitar `300`. Esperado: aviso some.
3. Digitar `175`. Esperado: *"...é R$ 150."* (empate resolve para baixo).
4. Digitar `0` e clicar no botão. Esperado: toast "Coloca um valor, pode ser qualquer um!".
5. Digitar `320` e clicar. Esperado: modal com "Presente de valor livre", R$ 300, link de R$300.
6. Clicar em "Ir para o pagamento". Esperado: abre o link e o modal **fecha**, indo direto ao prompt de RSVP — sem passo 2, porque não há presente a marcar.

- [ ] **Step 4: Commit**

```bash
git add index.html js/script.js
git commit -m "feat(valor-livre): arredonda para o link disponível mais próximo"
```

---

### Task 9: RSVP e recados no banco

**Files:**
- Modify: `js/script.js:377-399` (remover `guestList` fictícia) e o listener de `confirmRsvpBtn`
- Modify: `js/script.js` (listener de `enviarRecado`)
- Modify: `index.html` (rótulos das opções de RSVP)

**Interfaces:**
- Consumes: `WeddingDB.listarConvidados`, `WeddingDB.salvarConfirmacao`, `WeddingDB.salvarRecado`, `WeddingHelpers.buscarConvidados`.
- Produces: nada novo.

- [ ] **Step 1: Trocar a lista fictícia pelo banco**

Em `js/script.js`, apagar o array `guestList` (os 20 nomes fictícios) e substituir a busca por:

```js
// ========== RSVP ==========
let convidadosCarregados = [];
let convidadoSelecionado = null;   // objeto {id, nome, confirmacao}, não string

async function carregarConvidados() {
    const dados = await WeddingDB.listarConvidados();
    convidadosCarregados = dados || [];
    return dados !== null;
}

function renderGuestResults(query) {
    if (!guestResults) return;

    if (!convidadosCarregados.length) {
        guestResults.innerHTML = '<div style="font-size:0.86rem; color:var(--ink-soft); padding:8px;">Não conseguimos carregar a lista agora. Tenta de novo em instantes.</div>';
        return;
    }

    const termo = (query || '').trim();
    if (!termo) {
        guestResults.innerHTML = '<div style="font-size:0.86rem; color:var(--ink-soft); padding:8px;">Digite seu nome acima para buscar!</div>';
        return;
    }

    const achados = WeddingHelpers.buscarConvidados(convidadosCarregados, termo).slice(0, 8);

    if (!achados.length) {
        // Sem opção de "confirmar como <texto digitado>": a lista é fechada, e
        // deixar criar nome livre encheria o banco de duplicatas com erro de grafia.
        guestResults.innerHTML = '<div style="font-size:0.86rem; color:var(--ink-soft); padding:8px;">Não encontramos esse nome. Tenta só o primeiro nome ou o sobrenome — se não achar, chama a gente no WhatsApp!</div>';
        return;
    }

    guestResults.innerHTML = achados.map(c => `
        <div class="guest-item" data-id="${c.id}">
            <span>👤 ${escaparHtml(c.nome)}${c.confirmacao === 'pago' ? ' <small style="color:var(--forest);">(já confirmado)</small>' : ''}</span>
            <span style="font-size:0.8rem; color:var(--forest); font-weight:700;">Selecionar ›</span>
        </div>
    `).join('');

    guestResults.querySelectorAll('.guest-item').forEach(item => {
        item.addEventListener('click', () => {
            const c = convidadosCarregados.find(x => String(x.id) === item.dataset.id);
            if (c) selectGuest(c);
        });
    });
}

function selectGuest(convidado) {
    convidadoSelecionado = convidado;
    if (selectedGuestName) selectedGuestName.textContent = '👤 ' + convidado.nome;
    if (rsvpSearchStep) rsvpSearchStep.style.display = 'none';
    if (rsvpConfirmStep) rsvpConfirmStep.style.display = 'block';
}
```

Em `resetRsvpModal`, trocar `currentSelectedGuest = ""` por `convidadoSelecionado = null`.

Em `openRsvpModal`, carregar a lista antes de resetar:

```js
async function openRsvpModal() {
    if (!rsvpModal) return;
    rsvpModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    resetRsvpModal();
    if (!convidadosCarregados.length) await carregarConvidados();
    renderGuestResults(rsvpSearchInput ? rsvpSearchInput.value : '');
}
```

- [ ] **Step 2: Gravar a confirmação**

Substituir o listener de `confirmRsvpBtn` por:

```js
document.getElementById('confirmRsvpBtn')?.addEventListener('click', async (e) => {
    if (!convidadoSelecionado) {
        showToast('Por favor, selecione um nome!');
        return;
    }
    const escolha = document.querySelector('input[name="modalRsvpStatus"]:checked');
    // 'pago' é a convenção que os noivos já usam na planilha para "vai comparecer".
    const confirmacao = (escolha && escolha.value === 'recusado') ? 'recusado' : 'pago';

    const botao = e.currentTarget;
    botao.disabled = true;
    botao.textContent = 'Enviando...';

    const ok = await WeddingDB.salvarConfirmacao(convidadoSelecionado.id, confirmacao);

    botao.disabled = false;
    botao.textContent = 'Confirme sua Presença';

    if (!ok) {
        showToast('Não conseguimos registrar agora. Tenta de novo daqui a pouco?');
        return;
    }

    convidadoSelecionado.confirmacao = confirmacao;
    showToast(confirmacao === 'pago'
        ? `Presença confirmada! Te esperamos na festa, ${convidadoSelecionado.nome}! 🎉`
        : `Presença registrada! Sentiremos sua falta, ${convidadoSelecionado.nome}! ❤️`);
    closeRsvpModal();
});
```

Em `index.html`, o `value` do primeiro radio precisa deixar de ser `confirmado`:

```html
                            <input type="radio" name="modalRsvpStatus" value="pago" checked>
```

- [ ] **Step 3: Gravar o recado**

Substituir o listener de `enviarRecado` por:

```js
document.getElementById('enviarRecado').addEventListener('click', async (e) => {
    const nome = document.getElementById('nomeRecado').value.trim();
    const msg = document.getElementById('msgRecado').value.trim();
    if (!msg) {
        showToast('Escreve algo pra gente! Até um oi vale.');
        return;
    }

    const botao = e.currentTarget;
    botao.disabled = true;
    botao.textContent = 'Enviando...';

    const ok = await WeddingDB.salvarRecado(nome, msg);

    botao.disabled = false;
    botao.textContent = 'Enviar recado';

    if (!ok) {
        showToast('Não conseguimos enviar agora. Tenta de novo daqui a pouco?');
        return;
    }

    showToast(`Valeu${nome ? ', ' + nome : ''}! Recado guardado com carinho`);
    document.getElementById('nomeRecado').value = '';
    document.getElementById('msgRecado').value = '';
});
```

- [ ] **Step 4: Verificar no browser**

1. Abrir o RSVP, digitar `goncalves` (sem cedilha). Esperado: encontra "Elias Jose Piazentin Gonçalves Junior".
2. Digitar `ANTONELI`. Esperado: encontra os Antoneli, ignorando a caixa.
3. Digitar `banda`. Esperado: mensagem de "não encontramos esse nome" — os placeholders estão fora pela RLS.
4. Digitar `Theo Pires` e selecionar. Esperado: o item mostra "(já confirmado)".
5. Selecionar `Pedro Bonomo`, marcar "Com certeza" e confirmar. Esperado: toast de confirmação. No banco: `select confirmacao from convidados where nome='Pedro Bonomo';` → `pago`.
6. Repetir marcando "não poderei ir". Esperado: `recusado` no banco.
7. Enviar um recado com nome e texto. Esperado: toast de agradecimento e os campos limpos. No SQL Editor: `select * from recados;` mostra a linha.
8. No console do site: `await WeddingDB.listarConvidados()` funciona, mas ler recados não — conferir que `select` em `recados` pelo site devolve `[]`.
9. Limpar o teste: `delete from recados; update convidados set confirmacao=null, confirmado_em=null where nome='Pedro Bonomo';`

- [ ] **Step 5: Commit**

```bash
git add js/script.js index.html
git commit -m "feat(rsvp): busca de convidados e recados ligados ao Supabase"
```

---

### Task 10: Cor oliva, foto centralizada e inicialização

**Files:**
- Modify: `css/style.css:1-15` (variáveis), fim do arquivo (foto 7)
- Modify: `js/script.js` (cores do confete, `initPage`)

**Interfaces:**
- Consumes: `recarregarPresentes` (Task 6).
- Produces: nada novo.

- [ ] **Step 1: Trocar o verde por oliva**

Em `css/style.css`, nas três primeiras variáveis de `:root`:

```css
    --forest: #3E5732;
    --forest-light: #6E8759;
    --forest-pale: #DDE6D2;
```

Mesma luminosidade do verde anterior, com o tom girado para o amarelo-esverdeado — o contraste do texto sobre `--forest` não muda.

- [ ] **Step 2: Centralizar a sétima foto**

Acrescentar ao fim de `css/style.css`:

```css
/* ---------- ENQUADRAMENTO DA FOTO 7 ---------- */
/* O casal está a ~68% da largura desta foto. Como a moldura é retrato e usa
   object-fit: cover, o object-position: center padrão cortaria para o lado
   errado, deixando os dois encostados na borda direita. */
.photo-slide img[src*="vane-ali7"] {
    object-position: 66% center;
}
```

- [ ] **Step 3: Alinhar as cores do confete**

Em `js/script.js`, na função `confettiBurst`, trocar a linha do array `colors` por:

```js
    const colors = ['#3E5732', '#C7365F', '#D4890A', '#6E8759', '#E8648A', '#6B5CA5'];
```

- [ ] **Step 4: Carregar os presentes na inicialização**

Em `js/script.js`, trocar `initPage` por:

```js
function initPage() {
    initHeroCarousel();
    initCountdownTimer();
    recarregarPresentes();
}
```

- [ ] **Step 5: Verificar no browser**

1. Recarregar a página. Esperado: menu, títulos e botões em verde-oliva, sem nenhum resquício do verde anterior. Conferir com `getComputedStyle(document.documentElement).getPropertyValue('--forest')` → ` #3E5732`.
2. Navegar o carrossel até a sétima foto (a do bolo com as estrelícias). Esperado: o casal aparece centralizado na moldura, não encostado na direita.
3. Conferir que as outras 8 fotos não mudaram de enquadramento.
4. Clicar em "Quero presentear". Esperado: o confete sai em tons de oliva, sem verde antigo.
5. Abrir a página com o cache limpo. Esperado: os 15 presentes carregam sozinhos, sem precisar clicar em nada.

- [ ] **Step 6: Commit**

```bash
git add css/style.css js/script.js
git commit -m "style: paleta oliva, enquadramento da foto 7 e carga inicial dos presentes"
```

---

### Task 11: Textos dos pets e seção "Sobre nós"

**Files:**
- Modify: `index.html` (seção `#pets`, nav, nova seção `#sobre`)
- Modify: `css/style.css` (estilo da nova seção)

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Trocar os textos dos pets**

Em `index.html`, substituir o conteúdo dos dois cartões da seção `#pets`:

```html
            <div class="pet-card dora-card">
                <img src="img/doraCerto.png" alt="Dora, a cachorra preta da Vanessa e do Ali">
                <h3>Dora</h3>
                <p class="pet-sub">A filha mais velha que é apaixonada pela mãe. Cachorra gênia que sabe infinitas palavras e responde até ao "com licença", faz tudo juntinho e dorme grudada.</p>
            </div>
            <div class="pet-card agata-card">
                <img src="img/gatocoitado.png" alt="Ágata, a gata preta da Vanessa e do Ali">
                <h3>Ágata</h3>
                <p class="pet-sub">A filha mais nova que é apaixonada pelo pai. Boazinha e brabrinha ao mesmo tempo, dorme no colo mas também ama correr atrás e atacar pés.</p>
            </div>
```

`brabrinha` é intencional — é como os noivos escreveram.

- [ ] **Step 2: Criar a seção "Sobre nós"**

Em `index.html`, inserir entre o fechamento de `</section>` do hero (`#inicio`) e a abertura de `<section id="presentes">`:

```html
    <!-- SOBRE NÓS -->
    <section id="sobre">
        <div class="section-head reveal">
            <h2>Sobre nós</h2>
        </div>
        <div class="sobre-nos reveal">
            <p>Nossa história começou muito antes de sabermos que ela existia. Pois é, nos conhecemos ainda crianças, estivemos nos mesmos lugares diversas vezes. Foram aniversários, jogos da Copa, rolês aleatórios, e os dois lá, um sem reparar no outro.</p>
            <p>Mas sete anos atrás isso mudou, começamos a conversar e na primeira vez em que saímos só os dois fomos praticamente expulsos do barzinho porque eles queriam fechar e nós não íamos embora, foram horas conversando e dando risada, porque se tem uma coisa que não falta nesse relacionamento é crise de riso e piada boba. Tiramos a sorte grande em podermos nos chamar de amor e melhores amigos.</p>
            <p>Bom, e o resto é história…</p>
            <p class="sobre-remate">Na verdade, o resto a gente conta na cerimônia!</p>
        </div>
    </section>
```

- [ ] **Step 3: Adicionar ao menu**

Em `index.html`, no `<nav>`, inserir logo depois do item "Início":

```html
            <li><a href="#sobre">Sobre nós</a></li>
```

- [ ] **Step 4: Estilizar a seção**

Acrescentar ao fim de `css/style.css`:

```css
/* ---------- SOBRE NÓS ---------- */
.sobre-nos {
    max-width: 720px;
    margin: 0 auto;
    text-align: center;
}

.sobre-nos p {
    font-family: 'Cormorant Garamond', serif;
    font-size: 1.18rem;
    line-height: 1.75;
    color: var(--ink-soft);
    margin-bottom: 20px;
}

.sobre-nos .sobre-remate {
    font-family: 'Great Vibes', cursive;
    font-size: 1.7rem;
    color: var(--forest);
    margin-top: 26px;
}

@media (max-width: 640px) {
    .sobre-nos p {
        font-size: 1.05rem;
    }

    .sobre-nos .sobre-remate {
        font-size: 1.4rem;
    }
}
```

- [ ] **Step 5: Verificar no browser**

1. Recarregar. Esperado: "Sobre nós" aparece no menu, entre "Início" e "Presentes".
2. Clicar nesse item. Esperado: a página rola até a seção nova, que fica entre o hero e a lista de presentes.
3. Conferir os quatro parágrafos, com o remate "Na verdade, o resto a gente conta na cerimônia!" na fonte cursiva e em oliva.
4. Conferir o texto da Dora e da Ágata, incluindo o `brabrinha`.
5. Reduzir a janela para 375px de largura. Esperado: os parágrafos continuam legíveis, sem rolagem horizontal.

- [ ] **Step 6: Commit**

```bash
git add index.html css/style.css
git commit -m "feat(conteudo): textos da Dora e da Ágata e seção Sobre nós"
```

---

### Task 12: Verificação final e README de operação

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: tudo.
- Produces: a documentação que os noivos precisam para operar o site sem um desenvolvedor.

- [ ] **Step 1: Rodar a suíte inteira**

```bash
python -m unittest discover -s tests -v
node --test tests/
```

Expected: PASS em todos. Nenhum teste pulado.

- [ ] **Step 2: Repassar o roteiro de verificação da spec**

Percorrer os 10 itens da seção "Verificação" do documento de design, marcando cada um. Qualquer falha vira correção antes de seguir.

- [ ] **Step 3: Escrever o README**

Criar `README.md`:

```markdown
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
`04_seed_convidados.sql` de novo depois do casamento no ar perde as confirmações
já recebidas.

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
link novo, atualizar os dois; o teste da Task 4 confere se divergiram.

## Testes

    python -m unittest discover -s tests    # gerador de seed
    node --test tests/                      # helpers do site

Nenhum dos dois é necessário para o site rodar.
```

- [ ] **Step 4: Verificar que nada de desenvolvimento vazou para o site**

```bash
grep -n "helpers.js\|supabase\|fallback" index.html
grep -rn "scripts/\|tests/" index.html
```

Esperado: o primeiro lista as quatro tags `<script>` esperadas; o segundo não devolve nada.

- [ ] **Step 5: Confirmar que a chave Pix falsa sumiu**

```bash
grep -rn "pix\|PIX" index.html js/ css/ --ignore-case
```

Esperado: nenhuma ocorrência de `vanessa.ali.casamento@pix.com.br`. Menções a "Pix" como forma de pagamento no texto do modal são esperadas.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: README de operação do site e dos arquivos SQL"
```

---

## Self-Review

**Cobertura da spec** — cada seção do design tem task correspondente:

| Seção da spec | Task |
|---|---|
| Arquitetura / cliente CDN | 5 |
| Degradação sem banco | 6 (fallback + toast) |
| Modelo de dados | 1 |
| Segurança / RLS | 2 |
| Fluxo de pagamento 3 passos | 7 |
| Valor livre | 8 |
| Preços e links | 3 |
| Importação dos convidados | 3 |
| Front-end (oliva, foto 7) | 10 |
| Textos e "Sobre nós" | 11 |
| Entregáveis | 1, 2, 3, 12 |
| Verificação | 12 |

**Consistência de nomes** — verificados entre tasks: `WeddingDB.marcarPresentePago`,
`WeddingDB.salvarConfirmacao`, `WeddingDB.salvarRecado`, `WeddingHelpers.valorMaisProximo`,
`WeddingHelpers.linkParaValor`, `WeddingHelpers.buscarConvidados`, `WeddingHelpers.formatarBRL`,
`recarregarPresentes`, `renderizarPresentes`, `abrirModalPagamento`, `escaparHtml`,
`window.PRESENTES_FALLBACK`. `escaparHtml` é definida na Task 6 e reutilizada na Task 9.

**Dependências humanas** — três pontos em que o agente precisa parar e esperar o
usuário rodar SQL no Supabase: Task 2 Step 3, Task 3 Step 6. A Task 2 bloqueia a
publicação; as demais bloqueiam a verificação, não a implementação.
