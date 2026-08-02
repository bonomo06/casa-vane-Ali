// ========== CONFIG ==========
const PIX_KEY = "vanessa.ali.casamento@pix.com.br";
// TODO: Replace with your actual Supabase URL and anon key
const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";

// ========== GIFTS DATA ==========
const gifts = [
    {
        emoji: "👞",
        tag: "casal",
        title: "Sapatos dos noivos",
        desc: "Porque ir descalço é feio.",
        price: 500
    },
    {
        emoji: "🧁",
        tag: "casal",
        title: "Cota de doces finos",
        desc: "A nutri mandou repor a glicose depois de tantos drinks.",
        price: 250
    },
    {
        emoji: "🐾",
        tag: "pets",
        title: "Petsitter da Dora e da Ágata",
        desc: "Estão banidas da festa para não criar um caos.",
        price: 350
    },
    {
        emoji: "🍹",
        tag: "casal",
        title: "Cota de drinks",
        desc: "Para manter a energia alta e os brindes animados a noite toda.",
        price: 400
    },
    {
        emoji: "🧀",
        tag: "casal",
        title: "Cota da mesa de frios",
        desc: "Para beliscar e recarregar as energias entre uma dança e outra.",
        price: 200
    },
    {
        emoji: "✨",
        tag: "casal",
        title: "Brincos da noiva",
        desc: "O toque de brilho e elegância especial para o grande dia.",
        price: 120
    },
    {
        emoji: "📸",
        tag: "casal",
        title: "Ensaio fotográfico pré-casamento",
        desc: "Guardando os melhores sorrisos e momentos antes do 'sim'.",
        price: 700
    },
    {
        emoji: "🧱",
        tag: "casa",
        title: "Cota de pisos do apartamento",
        desc: "Cada metro quadrado conta para deixar nosso lar perfeito.",
        price: 300
    },
    {
        emoji: "📐",
        tag: "casa",
        title: "Cota de móveis planejados",
        desc: "Tudo no seu devido lugar no nosso novo apartamento.",
        price: 550
    },
    {
        emoji: "⚡",
        tag: "casa",
        title: "Cota de eletrodomésticos",
        desc: "Facilitando a rotina e o dia a dia do novo casal.",
        price: 450
    },
    {
        emoji: "🛋️",
        tag: "casa",
        title: "Cota do sofá",
        desc: "Para a Dora tirar muitos cochilos.",
        price: 600
    },
    {
        emoji: "🪟",
        tag: "pets",
        title: "Redes de proteção",
        desc: "Para a Ágata ficar na janela com segurança.",
        price: 180
    },
    {
        emoji: "🏡",
        tag: "casal",
        title: "Estadia do casal em Arujá",
        desc: "Um descanso super especial e merecido para os noivos.",
        price: 800
    },
    {
        emoji: "🍻",
        tag: "casal",
        title: "Preferência na fila do bar",
        desc: "Passe na frente e não perca nenhum segundo da festa!",
        price: 900
    },
    {
        emoji: "🎵",
        tag: "casal",
        title: "Escolher uma música no repertório da banda",
        desc: "Sua música favorita tocando ao vivo para agitar a pista!",
        price: 1000
    }
];

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
    const colors = ['#2D5A3D', '#C7365F', '#D4890A', '#5A8A6A', '#E8648A', '#6B5CA5'];
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

// ========== RENDER GIFTS ==========
const giftsGrid = document.getElementById('giftsGrid');

function renderGifts(category = 'todos') {
    const filtered = category === 'todos' ? gifts : gifts.filter(g => g.tag === category);
    giftsGrid.innerHTML = filtered.map((g, i) => `
        <div class="gift-card" style="animation: slideUp .5s ${i * 0.04}s ease both;">
            <div class="gift-emoji">${g.emoji}</div>
            <span class="gift-tag ${g.tag}">${tagLabel(g.tag)}</span>
            <div class="gift-title">${g.title}</div>
            <p class="gift-desc">${g.desc}</p>
            <div class="gift-price">R$ ${g.price}</div>
            <div class="gift-divider"></div>
            <button class="present-btn" data-index="${gifts.indexOf(g)}">Quero presentear</button>
        </div>
    `).join('');

    giftsGrid.querySelectorAll('.present-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const gift = gifts[parseInt(btn.dataset.index)];
            openGiftModal(gift);
            const rect = btn.getBoundingClientRect();
            confettiBurst(rect.left + rect.width / 2, rect.top);
        });
    });
}

function tagLabel(tag) {
    const labels = { casa: 'Apartamento', pets: 'Dora & Ágata', dora: 'Dora & Ágata', agata: 'Dora & Ágata', casal: 'Casório' };
    return labels[tag] || tag;
}

renderGifts();

// ========== TABS ==========
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderGifts(btn.dataset.category);
    });
});

// ========== MODAL ==========
const modal = document.getElementById('giftModal');
const modalTitle = document.getElementById('modalTitle');
const modalGiftName = document.getElementById('modalGiftName');
const modalValor = document.getElementById('modalValor');
const pixKeyDisplay = document.getElementById('pixKeyDisplay');

const rsvpPromptModal = document.getElementById('rsvpPromptModal');

function openGiftModal(gift) {
    modalTitle.textContent = gift.emoji + ' Presentear';
    modalGiftName.textContent = gift.title;
    modalValor.textContent = `R$ ${gift.price}`;
    pixKeyDisplay.textContent = PIX_KEY;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    modal.classList.remove('open');
    document.body.style.overflow = '';
}

function closeRsvpPromptModal() {
    if (rsvpPromptModal) rsvpPromptModal.classList.remove('open');
    document.body.style.overflow = '';
}

document.getElementById('closeModalBtn').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

document.getElementById('copyPixBtn').addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(PIX_KEY);
    } catch (err) { /* fallback */ }
    showToast('Chave Pix copiada! Obrigado pelo carinho');

    // Transição para o modal perguntando da confirmação de presença
    closeModal();
    setTimeout(() => {
        if (rsvpPromptModal) {
            rsvpPromptModal.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
    }, 450);
});

// POPUP RSVP BUTTONS
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

// ========== FREE GIFT ==========
document.getElementById('freeGiftBtn').addEventListener('click', () => {
    const val = document.getElementById('freeValue').value;
    if (!val || val <= 0) {
        showToast('Coloca um valor, pode ser qualquer um!');
        return;
    }
    modalTitle.textContent = '🎁 Presente livre';
    modalGiftName.textContent = 'Valor escolhido por você';
    modalValor.textContent = `R$ ${parseFloat(val).toFixed(2)}`;
    pixKeyDisplay.textContent = PIX_KEY;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    const btn = document.getElementById('freeGiftBtn');
    const rect = btn.getBoundingClientRect();
    confettiBurst(rect.left + rect.width / 2, rect.top);
});

// ========== MESSAGE ==========
document.getElementById('enviarRecado').addEventListener('click', async () => {
    const nome = document.getElementById('nomeRecado').value.trim();
    const msg = document.getElementById('msgRecado').value.trim();
    if (!msg) {
        showToast('Escreve algo pra gente! Até um oi vale.');
        return;
    }

    // TODO: Send to Supabase
    // if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    //     await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    //         method: 'POST',
    //         headers: {
    //             'Content-Type': 'application/json',
    //             'apikey': SUPABASE_ANON_KEY,
    //             'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    //         },
    //         body: JSON.stringify({ nome, mensagem: msg })
    //     });
    // }

    showToast(`Valeu${nome ? ', ' + nome : ''}! Recado guardado com carinho`);
    document.getElementById('nomeRecado').value = '';
    document.getElementById('msgRecado').value = '';
});

// ========== RSVP SEARCH & CONFIRMATION MODAL ==========
const guestList = [
    "Ana Paula Souza",
    "Bruno Henrique Alves",
    "Carlos Eduardo Lima",
    "Daniela Freitas",
    "Eduardo Martins",
    "Fernanda Rocha",
    "Gabriel Barbosa",
    "Helena Castro",
    "Isabela Ferreira",
    "João Pedro Silva",
    "Lucas Mendes",
    "Mariana Costa",
    "Natan Oliveira",
    "Patricia Ramos",
    "Rafael Gardenal",
    "Renata Vasconcelos",
    "Rodrigo Santos",
    "Sophia Ribeiro",
    "Thiago Cardoso",
    "Vanessa & Ali"
];

const rsvpModal = document.getElementById('rsvpModal');
const rsvpSearchInput = document.getElementById('rsvpSearchInput');
const guestResults = document.getElementById('guestResults');
const rsvpSearchStep = document.getElementById('rsvpSearchStep');
const rsvpConfirmStep = document.getElementById('rsvpConfirmStep');
const selectedGuestName = document.getElementById('selectedGuestName');

let currentSelectedGuest = "";

function openRsvpModal() {
    if (!rsvpModal) return;
    rsvpModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    resetRsvpModal();
}

function closeRsvpModal() {
    if (!rsvpModal) return;
    rsvpModal.classList.remove('open');
    document.body.style.overflow = '';
}

function resetRsvpModal() {
    currentSelectedGuest = "";
    if (rsvpSearchInput) rsvpSearchInput.value = "";
    if (rsvpSearchStep) rsvpSearchStep.style.display = "block";
    if (rsvpConfirmStep) rsvpConfirmStep.style.display = "none";
    renderGuestResults("");
}

function renderGuestResults(query) {
    if (!guestResults) return;
    const q = query.trim().toLowerCase();
    const matches = q ? guestList.filter(g => g.toLowerCase().includes(q)) : guestList.slice(0, 5);

    let html = matches.map(name => `
        <div class="guest-item" data-name="${name}">
            <span>👤 ${name}</span>
            <span style="font-size: 0.8rem; color: var(--forest); font-weight:700;">Selecionar ›</span>
        </div>
    `).join('');

    if (q && !guestList.some(g => g.toLowerCase() === q)) {
        html += `
            <div class="guest-item custom-guest" data-name="${query.trim()}">
                <span>➕ Confirmar como "<strong>${query.trim()}</strong>"</span>
                <span style="font-size: 0.8rem; color: var(--rose); font-weight:700;">Selecionar ›</span>
            </div>
        `;
    }

    guestResults.innerHTML = html || '<div style="font-size: 0.86rem; color: var(--ink-soft); padding: 8px;">Digite seu nome acima para buscar!</div>';

    guestResults.querySelectorAll('.guest-item').forEach(item => {
        item.addEventListener('click', () => {
            selectGuest(item.dataset.name);
        });
    });
}

function selectGuest(name) {
    currentSelectedGuest = name;
    if (selectedGuestName) selectedGuestName.textContent = "👤 " + name;
    if (rsvpSearchStep) rsvpSearchStep.style.display = "none";
    if (rsvpConfirmStep) rsvpConfirmStep.style.display = "block";
}

if (rsvpSearchInput) {
    rsvpSearchInput.addEventListener('input', (e) => {
        renderGuestResults(e.target.value);
    });
}

document.getElementById('openRsvpModalBtn')?.addEventListener('click', openRsvpModal);
document.getElementById('closeRsvpModalBtn')?.addEventListener('click', closeRsvpModal);
document.getElementById('backToSearchBtn')?.addEventListener('click', () => {
    if (rsvpSearchStep) rsvpSearchStep.style.display = "block";
    if (rsvpConfirmStep) rsvpConfirmStep.style.display = "none";
});

if (rsvpModal) {
    rsvpModal.addEventListener('click', (e) => {
        if (e.target === rsvpModal) closeRsvpModal();
    });
}

// Botões do nav e links para RSVP
document.querySelectorAll('a[href="#rsvp"]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        openRsvpModal();
    });
});

// Confirmação final
document.getElementById('confirmRsvpBtn')?.addEventListener('click', async () => {
    if (!currentSelectedGuest) {
        showToast('Por favor, selecione um nome!');
        return;
    }
    const statusEl = document.querySelector('input[name="modalRsvpStatus"]:checked');
    const status = statusEl ? statusEl.value : 'confirmado';

    // TODO: Send RSVP to Supabase
    // if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    //     await fetch(`${SUPABASE_URL}/rest/v1/rsvp`, {
    //         method: 'POST',
    //         headers: {
    //             'Content-Type': 'application/json',
    //             'apikey': SUPABASE_ANON_KEY,
    //             'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    //         },
    //         body: JSON.stringify({ nome: currentSelectedGuest, status, criado_em: new Date() })
    //     });
    // }

    const isSim = status === 'confirmado';
    showToast(isSim ? `Presença confirmada! Te esperamos na festa, ${currentSelectedGuest}! 🎉` : `Presença registrada! Sentiremos sua falta, ${currentSelectedGuest}! ❤️`);
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

// ========== KEYBOARD: ESC closes modals ==========
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

    // Create dot pagination dynamically
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

    function nextSlide() {
        goToSlide(currentIndex + 1);
    }

    function prevSlide() {
        goToSlide(currentIndex - 1);
    }

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

    // Touch swipe support for mobile devices
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

        if (difference <= 0) {
            document.getElementById('cdDays').textContent = '00';
            document.getElementById('cdHours').textContent = '00';
            document.getElementById('cdMinutes').textContent = '00';
            document.getElementById('cdSeconds').textContent = '00';
            return;
        }

        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);

        const cdDaysEl = document.getElementById('cdDays');
        const cdHoursEl = document.getElementById('cdHours');
        const cdMinEl = document.getElementById('cdMinutes');
        const cdSecEl = document.getElementById('cdSeconds');

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
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
} else {
    initPage();
}




