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
