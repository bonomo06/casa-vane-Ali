// Acesso à planilha do Google, que é a fonte de verdade da lista de convidados.
// Toda leitura e escrita passa pelo Web App em apps-script/Codigo.gs — o site
// nunca fala com a API do Google direto, e por isso não carrega credencial
// nenhuma nem exige que a planilha seja pública.
(function () {

    // ⚠️ PREENCHER depois de publicar apps-script/Codigo.gs.
    // Formato: https://script.google.com/macros/s/AKfycb.../exec
    var URL_APPS_SCRIPT = '';

    function configurado() {
        return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/.test(URL_APPS_SCRIPT);
    }

    function avisarNaoConfigurado(operacao) {
        console.error(
            '[WeddingSheets] ' + operacao + ' cancelada: URL_APPS_SCRIPT não foi preenchida ' +
            'em js/sheets-client.js. Publique apps-script/Codigo.gs e cole a URL do Web App lá.'
        );
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
        listarConvidados: listarConvidados,
        salvarConfirmacao: salvarConfirmacao
    };
})();
