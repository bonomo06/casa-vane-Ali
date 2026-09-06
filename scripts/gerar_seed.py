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


def escrever(caminho, conteudo):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(conteudo, encoding="utf-8")
    print(f"gerado: {caminho.relative_to(RAIZ)}")


def main():
    convidados = ler_convidados()
    escrever(RAIZ / "sql" / "03_seed_presentes.sql", gerar_sql_presentes())
    escrever(RAIZ / "sql" / "04_seed_convidados.sql", gerar_sql_convidados(convidados))
    escrever(RAIZ / "js" / "presentes-fallback.js", gerar_fallback_js())


if __name__ == "__main__":
    main()
