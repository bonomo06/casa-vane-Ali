// Acesso à planilha do Google, que é a fonte de verdade da lista de convidados.
// Toda leitura e escrita passa pelo Web App em apps-script/Codigo.gs — o site
// nunca fala com a API do Google direto, e por isso não carrega credencial
// nenhuma nem exige que a planilha seja pública.
(function () {

    // ⚠️ PREENCHER depois de publicar apps-script/Codigo.gs.
    // Formato: https://script.google.com/macros/s/AKfycb.../exec
    var URL_APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycbxCZ5VekyIl5FLacS1MSB_pv80B_5yEzQE_gXEid5Ob7g4ENbMWm-UHmiNfbBh235DC/exec';

    var MENSAGENS = {
        'vazia':
            'URL_APPS_SCRIPT está vazia em js/sheets-client.js. Publique ' +
            'apps-script/Codigo.gs (Implantar → Nova implantação → App da Web) e cole ' +
            'aqui a URL gerada.',
        'url-de-teste':
            'URL_APPS_SCRIPT aponta para a URL de TESTE (termina em /dev). Ela só ' +
            'responde para quem está logado como dono do script, então nenhum convidado ' +
            'conseguiria usar. Pegue a URL de produção, que termina em /exec, em ' +
            'Implantar → Gerenciar implantações.',
        'formato-desconhecido':
            'URL_APPS_SCRIPT não parece uma URL de Web App do Apps Script. O formato ' +
            'esperado é https://script.google.com/macros/s/<id>/exec — confira se não ' +
            'colou o link da planilha por engano.'
    };

    function estadoDaUrl() {
        return WeddingHelpers.validarUrlAppsScript(URL_APPS_SCRIPT);
    }

    function configurado() {
        return estadoDaUrl() === 'ok';
    }

    function avisarNaoConfigurado(operacao) {
        console.error('[WeddingSheets] ' + operacao + ' cancelada. ' + MENSAGENS[estadoDaUrl()]);
    }

    // Devolve null (e não []) quando falha, para quem chama distinguir
    // "não consegui perguntar" de "perguntei e a lista está vazia".
    async function listarConvidados() {
        if (!configurado()) {
            avisarNaoConfigurado('leitura da lista de convidados');
            return null;
        }
        try {
            const resposta = await fetch(URL_APPS_SCRIPT, { method: 'GET' });
            if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
            const dados = await resposta.json();
            if (!dados.ok) throw new Error(dados.erro || 'resposta sem ok');
            return dados.convidados;
        } catch (e) {
            console.error('[WeddingSheets] falha ao listar convidados:', e);
            return null;
        }
    }

    // `nome` precisa bater exatamente com a coluna A da planilha — é ele que
    // identifica a linha, já que a planilha não tem id.
    async function salvarConfirmacao(nome, confirmacao) {
        if (!configurado()) {
            avisarNaoConfigurado('gravação da confirmação');
            return false;
        }
        try {
            const resposta = await fetch(URL_APPS_SCRIPT, {
                method: 'POST',
                // text/plain de propósito. Com application/json o browser manda
                // um preflight OPTIONS antes do POST, e o Apps Script não
                // responde a OPTIONS — a chamada falharia por CORS sem deixar
                // erro claro no console.
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ nome: nome, confirmacao: confirmacao })
            });
            if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
            const dados = await resposta.json();
            if (!dados.ok) throw new Error(dados.erro || 'resposta sem ok');
            return true;
        } catch (e) {
            console.error('[WeddingSheets] falha ao salvar confirmação:', e);
            return false;
        }
    }

    window.WeddingSheets = {
        configurado: configurado,
        estadoDaUrl: estadoDaUrl,
        listarConvidados: listarConvidados,
        salvarConfirmacao: salvarConfirmacao
    };
})();
