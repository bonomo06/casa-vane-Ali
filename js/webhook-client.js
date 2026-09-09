// Envio dos dados dos presentes que dão algo em troca (jantar no apê, escolher
// a música, preferência no bar) para o fluxo do n8n. Nenhuma outra parte do
// código conhece esta URL.
//
// Não há credencial aqui de propósito: a URL do webhook é o próprio segredo, e
// ela aparece no código-fonte para qualquer visitante. Ou seja, qualquer pessoa
// pode disparar o fluxo com dados inventados. Para o que este webhook faz —
// avisar os noivos de um pedido de música e de um contato — o risco é receber
// registro falso, não perder dado nem expor ninguém. Se algum dia passar a
// disparar cobrança ou algo irreversível, isto precisa de um intermediário.
(function () {

    var URL_WEBHOOK = 'https://barbeariapj-n8n.q781cx.easypanel.host/webhook/7c2afb9a-727b-47c1-a84c-5abc78ebd472';

    // O servidor responde ao preflight OPTIONS e reflete o Origin, então
    // application/json passa sem problema de CORS — diferente do Apps Script em
    // js/sheets-client.js, que exige text/plain justamente por não responder
    // OPTIONS. Não copie o truque de lá para cá sem necessidade: aqui o JSON
    // chega ao n8n já desserializado.
    async function enviarPerk(dados) {
        try {
            const resposta = await fetch(URL_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tipo: dados.tipo,
                    presente: dados.presente,
                    nome: dados.nome,
                    telefone: dados.telefone,
                    // Só o pedido de música tem este campo; nos outros dois vai
                    // null em vez de ficar ausente, para o fluxo do n8n ver
                    // sempre a mesma forma de objeto.
                    musica: dados.musica || null,
                    valor: dados.valor === undefined ? null : dados.valor,
                    enviado_em: new Date().toISOString()
                })
            });
            if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
            return true;
        } catch (e) {
            // Uma rejeição aqui pode significar duas coisas opostas: a
            // requisição não saiu, ou saiu, o n8n processou e só a resposta não
            // voltou. Quem chama trata as duas como falha e pede o dado por
            // WhatsApp — é melhor os noivos receberem em duplicidade do que
            // perderem o pedido de música de alguém.
            console.error('[WeddingWebhook] falha ao enviar dados do presente:', e);
            return false;
        }
    }

    window.WeddingWebhook = {
        enviarPerk: enviarPerk
    };
})();
