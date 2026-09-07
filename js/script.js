// Lógica do site. Depende, nesta ordem, de:
//   js/presentes-fallback.js  → window.PRESENTES_FALLBACK
//   js/helpers.js             → window.WeddingHelpers
//   js/supabase-client.js     → window.WeddingDB

// ========== TOAST ==========
const toast = document.getElementById('toast');
let toastTimer;
function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ========== CONFETTI ==========
function confettiBurst(x, y) {
    const colors = ['#3E5732', '#C7365F', '#D4890A', '#6E8759', '#E8648A', '#6B5CA5'];
    for (let i = 0; i < 28; i++) {
        const p = document.createElement('div');
        p.className = 'confetti-piece';
        p.style.left = x + 'px';
        p.style.top = y + 'px';
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        const angle = Math.random() * Math.PI * 2;
        const dist = 60 + Math.random() * 140;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist - 50;
        const rot = Math.random() * 720 - 360;
        document.body.appendChild(p);
        p.animate([
            { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
            { transform: `translate(${dx}px, ${dy + 240}px) rotate(${rot}deg)`, opacity: 0 }
        ], { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.3,1)' });
        setTimeout(() => p.remove(), 1500);
    }
}

// Nome e descrição vêm do banco. Hoje só os noivos escrevem lá, mas escapar é
// barato e evita que um dia um texto com < ou & quebre o cartão.
function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
}

// ========== PRESENTES ==========
const giftsGrid = document.getElementById('giftsGrid');

// Carregados do Supabase. Vazio até recarregarPresentes() rodar.
let estadoPresentes = [];
let categoriaAtual = 'todos';

async function recarregarPresentes() {
    const doBanco = await WeddingDB.listarPresentes();

    // Lista vazia conta como falha: uma lista de presentes sem nenhum presente
    // não é estado legítimo deste site — significa seed não rodado ou RLS
    // barrando a leitura. Sem esta guarda a página ficaria presa num "carregando"
    // que nunca resolve.
    if (doBanco && doBanco.length) {
        estadoPresentes = doBanco;
    } else {
        // Sem banco o site continua de pé; só não sabe o que já foi dado.
        estadoPresentes = (window.PRESENTES_FALLBACK || []).map(p => Object.assign({}, p));
        showToast('Não conseguimos conferir a lista agora. Os presentes estão aí, mas pode ser que algum já tenha sido dado.');
    }

    // `chave` identifica o cartão no DOM e existe sempre. `id` é o identificador
    // do banco e só existe quando os dados vieram de lá — é ele que decide se dá
    // para marcar o presente como pago. Separar os dois evita o bug de procurar
    // o presente por um `id` que o fallback não tem.
    estadoPresentes.forEach((p, i) => { p.chave = 'p' + i; });

    renderizarPresentes(categoriaAtual);
}

function tagLabel(tag) {
    const labels = { casa: 'Apartamento', pets: 'Dora & Ágata', casal: 'Casório' };
    return labels[tag] || tag;
}

function renderizarPresentes(categoria = 'todos') {
    categoriaAtual = categoria;
    const filtrados = categoria === 'todos'
        ? estadoPresentes.slice()
        : estadoPresentes.filter(p => p.categoria === categoria);

    // Já presenteados vão para o fim: ver que um presente caro já foi dado é
    // informação útil, mas não deve competir com o que ainda está disponível.
    filtrados.sort((a, b) => (a.pagou === b.pagou) ? 0 : (a.pagou ? 1 : -1));

    // Só cai aqui numa categoria sem itens, já que a lista completa nunca fica
    // vazia (recarregarPresentes garante o fallback).
    if (!filtrados.length) {
        giftsGrid.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:var(--ink-soft);">Nenhum presente nesta categoria por enquanto.</p>';
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
            <button class="present-btn" data-chave="${p.chave}" ${p.pagou ? 'disabled' : ''}>
                ${p.pagou ? 'Já foi presenteado' : 'Quero presentear'}
            </button>
        </div>
    `).join('');

    giftsGrid.querySelectorAll('.present-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
            const presente = estadoPresentes.find(p => p.chave === btn.dataset.chave);
            if (!presente) return;
            abrirModalPagamento(presente);
            const r = btn.getBoundingClientRect();
            confettiBurst(r.left + r.width / 2, r.top);
        });
    });
}

// ========== TABS ==========
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderizarPresentes(btn.dataset.category);
    });
});

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

modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

// ========== POPUP "JÁ CONFIRMOU PRESENÇA?" ==========
function abrirPromptRsvp() {
    if (rsvpPromptModal) {
        rsvpPromptModal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

function closeRsvpPromptModal() {
    if (rsvpPromptModal) rsvpPromptModal.classList.remove('open');
    document.body.style.overflow = '';
}

document.getElementById('goRsvpBtn')?.addEventListener('click', () => {
    closeRsvpPromptModal();
    openRsvpModal();
});

document.getElementById('alreadyRsvpBtn')?.addEventListener('click', () => {
    closeRsvpPromptModal();
    showToast('Perfeito! Nos vemos na pista de dança! 🕺💃');
});

if (rsvpPromptModal) {
    rsvpPromptModal.addEventListener('click', (e) => {
        if (e.target === rsvpPromptModal) closeRsvpPromptModal();
    });
}

// ========== VALOR LIVRE ==========
// Só existem 15 links fixos, então o valor digitado vira o link mais próximo.
// O aviso aparece enquanto a pessoa digita, para a troca não ser surpresa.
const campoValorLivre = document.getElementById('freeValue');
const avisoValorLivre = document.getElementById('avisoValorLivre');

function atualizarAvisoValorLivre() {
    const digitado = parseFloat(campoValorLivre.value);
    const proximo = WeddingHelpers.valorMaisProximo(digitado);
    if (!proximo || proximo === digitado) {
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

// ========== RECADO ==========
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

// ========== RSVP ==========
const rsvpModal = document.getElementById('rsvpModal');
const rsvpSearchInput = document.getElementById('rsvpSearchInput');
const guestResults = document.getElementById('guestResults');
const rsvpSearchStep = document.getElementById('rsvpSearchStep');
const rsvpConfirmStep = document.getElementById('rsvpConfirmStep');
const selectedGuestName = document.getElementById('selectedGuestName');

let convidadosCarregados = [];
let convidadoSelecionado = null;   // objeto {id, nome, confirmacao}, não string

async function carregarConvidados() {
    const dados = await WeddingSheets.listarConvidados();
    convidadosCarregados = dados || [];
    // `chave` identifica a linha no DOM. A planilha não tem id, e usar o nome
    // como atributo HTML exigiria escapar aspas — o índice é mais simples.
    convidadosCarregados.forEach((c, i) => { c.chave = 'c' + i; });
    return dados !== null;
}

async function openRsvpModal() {
    if (!rsvpModal) return;
    rsvpModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    resetRsvpModal();
    if (!convidadosCarregados.length) await carregarConvidados();
    renderGuestResults(rsvpSearchInput ? rsvpSearchInput.value : '');
}

function closeRsvpModal() {
    if (!rsvpModal) return;
    rsvpModal.classList.remove('open');
    document.body.style.overflow = '';
}

function resetRsvpModal() {
    convidadoSelecionado = null;
    if (rsvpSearchInput) rsvpSearchInput.value = '';
    if (rsvpSearchStep) rsvpSearchStep.style.display = 'block';
    if (rsvpConfirmStep) rsvpConfirmStep.style.display = 'none';
    renderGuestResults('');
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
        <div class="guest-item" data-chave="${c.chave}">
            <span>👤 ${escaparHtml(c.nome)}${rotuloConfirmacao(c.confirmacao)}</span>
            <span style="font-size:0.8rem; color:var(--forest); font-weight:700;">Selecionar ›</span>
        </div>
    `).join('');

    guestResults.querySelectorAll('.guest-item').forEach(item => {
        item.addEventListener('click', () => {
            const c = convidadosCarregados.find(x => x.chave === item.dataset.chave);
            if (c) selectGuest(c);
        });
    });
}

// Mostra quem já respondeu, para a pessoa não confirmar duas vezes sem saber —
// e para quem recusou por engano perceber e poder trocar.
function rotuloConfirmacao(confirmacao) {
    if (confirmacao === 'pago') return ' <small style="color:var(--forest);">(já confirmado)</small>';
    if (confirmacao === 'recusado') return ' <small style="color:var(--rose);">(marcado como ausente)</small>';
    return '';
}

function selectGuest(convidado) {
    convidadoSelecionado = convidado;
    if (selectedGuestName) selectedGuestName.textContent = '👤 ' + convidado.nome;
    if (rsvpSearchStep) rsvpSearchStep.style.display = 'none';
    if (rsvpConfirmStep) rsvpConfirmStep.style.display = 'block';
}

if (rsvpSearchInput) {
    rsvpSearchInput.addEventListener('input', (e) => renderGuestResults(e.target.value));
}

document.getElementById('openRsvpModalBtn')?.addEventListener('click', openRsvpModal);
document.getElementById('closeRsvpModalBtn')?.addEventListener('click', closeRsvpModal);
document.getElementById('backToSearchBtn')?.addEventListener('click', () => {
    if (rsvpSearchStep) rsvpSearchStep.style.display = 'block';
    if (rsvpConfirmStep) rsvpConfirmStep.style.display = 'none';
});

if (rsvpModal) {
    rsvpModal.addEventListener('click', (e) => {
        if (e.target === rsvpModal) closeRsvpModal();
    });
}

// Links do nav e botões que apontam para #rsvp abrem o modal em vez de rolar.
document.querySelectorAll('a[href="#rsvp"]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        openRsvpModal();
    });
});

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

    const ok = await WeddingSheets.salvarConfirmacao(convidadoSelecionado.nome, confirmacao);

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

// ========== SCROLL REVEAL ==========
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// ========== KEYBOARD: ESC fecha os modais ==========
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
        closeRsvpPromptModal();
        closeRsvpModal();
    }
});

// ========== HERO CAROUSEL (SAVE THE DATE) ==========
function initHeroCarousel() {
    const slides = document.querySelectorAll('.photo-slide');
    const dotsContainer = document.getElementById('carouselDots');
    const prevBtn = document.getElementById('carouselPrev');
    const nextBtn = document.getElementById('carouselNext');
    const currentSlideNum = document.getElementById('currentSlideNum');
    const totalSlidesNum = document.getElementById('totalSlidesNum');

    if (!slides.length) return;

    if (totalSlidesNum) {
        totalSlidesNum.textContent = String(slides.length).padStart(2, '0');
    }

    let currentIndex = 0;
    let autoPlayInterval = null;

    if (dotsContainer) {
        dotsContainer.innerHTML = '';
        slides.forEach((_, idx) => {
            const dot = document.createElement('div');
            dot.classList.add('dot');
            if (idx === 0) dot.classList.add('active');
            dot.addEventListener('click', () => goToSlide(idx));
            dotsContainer.appendChild(dot);
        });
    }

    const dots = dotsContainer ? dotsContainer.querySelectorAll('.dot') : [];

    function goToSlide(index) {
        slides[currentIndex].classList.remove('active');
        if (dots[currentIndex]) dots[currentIndex].classList.remove('active');

        currentIndex = (index + slides.length) % slides.length;

        slides[currentIndex].classList.add('active');
        if (dots[currentIndex]) dots[currentIndex].classList.add('active');

        if (currentSlideNum) {
            currentSlideNum.textContent = String(currentIndex + 1).padStart(2, '0');
        }

        resetAutoPlay();
    }

    function nextSlide() { goToSlide(currentIndex + 1); }
    function prevSlide() { goToSlide(currentIndex - 1); }

    function startAutoPlay() {
        if (!autoPlayInterval) {
            autoPlayInterval = setInterval(nextSlide, 4500);
        }
    }

    function resetAutoPlay() {
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
        startAutoPlay();
    }

    if (nextBtn) nextBtn.addEventListener('click', nextSlide);
    if (prevBtn) prevBtn.addEventListener('click', prevSlide);

    let touchStartX = 0;
    let touchEndX = 0;
    const heroCarousel = document.getElementById('heroCarousel');

    if (heroCarousel) {
        heroCarousel.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        heroCarousel.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
        }, { passive: true });
    }

    function handleSwipe() {
        const swipeThreshold = 40;
        if (touchEndX < touchStartX - swipeThreshold) {
            nextSlide();
        } else if (touchEndX > touchStartX + swipeThreshold) {
            prevSlide();
        }
    }

    startAutoPlay();
}

// ========== COUNTDOWN TIMER (10/04/2027 - 18:30) ==========
function initCountdownTimer() {
    const weddingDate = new Date('2027-04-10T18:30:00').getTime();

    function updateCountdown() {
        const now = new Date().getTime();
        const difference = weddingDate - now;

        const cdDaysEl = document.getElementById('cdDays');
        const cdHoursEl = document.getElementById('cdHours');
        const cdMinEl = document.getElementById('cdMinutes');
        const cdSecEl = document.getElementById('cdSeconds');

        if (difference <= 0) {
            if (cdDaysEl) cdDaysEl.textContent = '00';
            if (cdHoursEl) cdHoursEl.textContent = '00';
            if (cdMinEl) cdMinEl.textContent = '00';
            if (cdSecEl) cdSecEl.textContent = '00';
            return;
        }

        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);

        if (cdDaysEl) cdDaysEl.textContent = String(days).padStart(2, '0');
        if (cdHoursEl) cdHoursEl.textContent = String(hours).padStart(2, '0');
        if (cdMinEl) cdMinEl.textContent = String(minutes).padStart(2, '0');
        if (cdSecEl) cdSecEl.textContent = String(seconds).padStart(2, '0');
    }

    updateCountdown();
    setInterval(updateCountdown, 1000);
}

function initPage() {
    initHeroCarousel();
    initCountdownTimer();
    recarregarPresentes();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
} else {
    initPage();
}
