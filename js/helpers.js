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

    // NFD separa a letra do acento; U+0300-U+036F são os acentos soltos.
    // Os escapes \u são obrigatórios: escrever os acentos combinantes
    // literalmente aqui depende do encoding do arquivo e quebra em silêncio.
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

    // Valida a URL do Web App do Apps Script. Devolve 'ok', 'vazia',
    // 'url-de-teste' ou 'formato-desconhecido' — cada caso merece uma mensagem
    // diferente, porque "não preenchi" e "preenchi com a URL errada" pedem
    // ações opostas de quem está configurando.
    //
    // Dois formatos são válidos, e esquecer o segundo é fácil:
    //   conta pessoal → /macros/s/<id>/exec
    //   Workspace     → /a/macros/<dominio>/s/<id>/exec
    function validarUrlAppsScript(url) {
        var texto = String(url === null || url === undefined ? '' : url).trim();
        if (!texto) return 'vazia';

        var base = 'https://script.google.com/(?:a/macros/[^/]+|macros)/s/[^/]+/';
        if (new RegExp('^' + base + 'exec(?:[/?#]|$)').test(texto)) return 'ok';
        // A URL /dev só responde para quem está logado como dono do script,
        // então um convidado sempre receberia erro.
        if (new RegExp('^' + base + 'dev(?:[/?#]|$)').test(texto)) return 'url-de-teste';
        return 'formato-desconhecido';
    }

    function formatarBRL(valor) {
        return 'R$ ' + Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    }

    // Os três presentes que dão algo em troca. Quem escolhe um deles precisa
    // deixar contato, então o site pede os dados e manda para o n8n.
    //
    // A chave é o nome do presente já passado por normalizar() — sem acento e
    // em minúsculas. É o nome que liga as duas pontas porque a tabela do
    // Supabase não tem coluna de tipo; um teste em tests/test_gerar_seed.py
    // falha se algum desses nomes deixar de existir em scripts/gerar_seed.py.
    var PERKS = {
        'jantar no ape': {
            tipo: 'ape',
            pedeMusica: false,
            aviso: 'Esse presente é um jantar com a gente — deixa seu contato que a gente combina a data com você.'
        },
        'escolher uma musica no repertorio da banda': {
            tipo: 'musica',
            pedeMusica: true,
            aviso: 'Conta pra gente qual música você quer ouvir na pista, que a gente passa pra banda.'
        },
        'preferencia na fila do bar': {
            tipo: 'bar',
            pedeMusica: false,
            aviso: 'Deixa seu contato que a gente te avisa como funciona a preferência no bar na festa.'
        }
    };

    function perkDoPresente(nome) {
        return PERKS[normalizar(nome)] || null;
    }

    function digitosTelefone(texto) {
        return String(texto === null || texto === undefined ? '' : texto).replace(/\D/g, '');
    }

    // Aceita fixo (10) e celular (11), com ou sem o 55 do país na frente.
    // Deliberadamente frouxo: barrar um número válido custa um presente, e
    // errar o telefone só custa uma mensagem no WhatsApp.
    function telefoneValido(texto) {
        var d = digitosTelefone(texto);
        if (d.length === 12 || d.length === 13) {
            if (d.slice(0, 2) !== '55') return false;
            d = d.slice(2);
        }
        return d.length === 10 || d.length === 11;
    }

    return {
        LINKS_POR_VALOR: LINKS_POR_VALOR,
        VALORES_COM_LINK: VALORES_COM_LINK,
        valorMaisProximo: valorMaisProximo,
        linkParaValor: linkParaValor,
        normalizar: normalizar,
        buscarConvidados: buscarConvidados,
        validarUrlAppsScript: validarUrlAppsScript,
        formatarBRL: formatarBRL,
        PERKS: PERKS,
        perkDoPresente: perkDoPresente,
        digitosTelefone: digitosTelefone,
        telefoneValido: telefoneValido
    };
});
