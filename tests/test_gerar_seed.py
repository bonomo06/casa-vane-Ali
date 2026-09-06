import re
import subprocess
import sys
import unittest
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


class TestSincroniaComOJs(unittest.TestCase):
    """Os links vivem em dois lugares: aqui e em js/helpers.js, porque o valor
    livre precisa deles no browser. Se divergirem, alguem paga o valor errado."""

    def test_links_identicos_nos_dois_arquivos(self):
        js = (RAIZ / "js" / "helpers.js").read_text(encoding="utf-8")
        trecho = js.split("var LINKS_POR_VALOR = {")[1].split("};")[0]
        do_js = {
            int(m.group(1)): m.group(2)
            for m in re.finditer(r"(\d+):\s*'([^']+)'", trecho)
        }
        self.assertEqual(do_js, gerar_seed.LINKS)


class TestGeracao(unittest.TestCase):
    # A geracao roda uma vez, antes de qualquer teste da classe. Fazer isso dentro
    # de um dos testes criaria dependencia de ordem: unittest executa em ordem
    # alfabetica, e test_fallback_* viria antes de test_gera_*.
    @classmethod
    def setUpClass(cls):
        subprocess.run([sys.executable, str(RAIZ / "scripts" / "gerar_seed.py")], check=True)

    def test_gera_os_tres_arquivos(self):
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
