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

test('validarUrlAppsScript aceita URL de conta pessoal', () => {
    assert.strictEqual(
        H.validarUrlAppsScript('https://script.google.com/macros/s/AKfycbxAbC123_-def456/exec'),
        'ok');
});

test('validarUrlAppsScript aceita URL de conta Google Workspace', () => {
    // Contas com domínio próprio recebem /a/macros/<dominio>/ no caminho.
    assert.strictEqual(
        H.validarUrlAppsScript('https://script.google.com/a/macros/makevendas.com.br/s/AKfycbxAbC123/exec'),
        'ok');
});

test('validarUrlAppsScript tolera barra final e querystring', () => {
    assert.strictEqual(
        H.validarUrlAppsScript('https://script.google.com/macros/s/AKfycbxAbC123/exec/'), 'ok');
    assert.strictEqual(
        H.validarUrlAppsScript('https://script.google.com/macros/s/AKfycbxAbC123/exec?x=1'), 'ok');
});

test('validarUrlAppsScript reconhece a URL vazia', () => {
    assert.strictEqual(H.validarUrlAppsScript(''), 'vazia');
    assert.strictEqual(H.validarUrlAppsScript('   '), 'vazia');
    assert.strictEqual(H.validarUrlAppsScript(null), 'vazia');
});

test('validarUrlAppsScript identifica a URL de teste /dev', () => {
    // Erro comum: copiar a URL de teste em vez da de produção. A /dev só
    // funciona para quem está logado como dono do script.
    assert.strictEqual(
        H.validarUrlAppsScript('https://script.google.com/macros/s/AKfycbxAbC123/dev'),
        'url-de-teste');
});

test('validarUrlAppsScript rejeita qualquer outra coisa', () => {
    assert.strictEqual(H.validarUrlAppsScript('https://docs.google.com/spreadsheets/d/abc/edit'),
        'formato-desconhecido');
    assert.strictEqual(H.validarUrlAppsScript('cole aqui a url'), 'formato-desconhecido');
});

test('VALORES_COM_LINK tem os 15 valores em ordem crescente', () => {
    assert.strictEqual(H.VALORES_COM_LINK.length, 15);
    const ordenado = [...H.VALORES_COM_LINK].sort((a, b) => a - b);
    assert.deepStrictEqual(H.VALORES_COM_LINK, ordenado);
});
