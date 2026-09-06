-- GERADO POR scripts/gerar_seed.py — NÃO EDITAR À MÃO.
-- Para alterar, edite o script (ou o CSV) e rode: python scripts/gerar_seed.py
-- Rodar no SQL Editor do Supabase, depois de 02_rls.sql.
-- Recria a lista do zero; presentes ja marcados como pagos sao perdidos.

delete from presentes_casamento;

insert into presentes_casamento
  (ordem, emoji, nome, categoria, preco, descricao, link_pagamento)
values
  (1, '👞', 'Sapatos dos noivos', 'casal', 500, 'Porque ir descalço é feio.', 'https://mpago.la/1QnLMJq'),
  (2, '🧁', 'Cota de doces finos', 'casal', 250, 'A nutri mandou repor a glicose depois de tantos drinks.', 'https://mpago.la/2pjkV7C'),
  (3, '🐾', 'Petsitter da Dora e da Ágata', 'pets', 350, 'Estão banidas da festa para não criar um caos.', 'https://mpago.la/2oD5cr5'),
  (4, '🍹', 'Cota de drinks', 'casal', 400, 'Para manter a energia alta e os brindes animados a noite toda.', 'https://mpago.la/2Bb3UCc'),
  (5, '🧀', 'Cota da mesa de frios', 'casal', 200, 'Para beliscar e recarregar as energias entre uma dança e outra.', 'https://mpago.la/1DxCxep'),
  (6, '✨', 'Brincos da noiva', 'casal', 150, 'O toque de brilho e elegância especial para o grande dia.', 'https://mpago.la/2rYBAzG'),
  (7, '📸', 'Ensaio fotográfico pré-casamento', 'casal', 700, 'Guardando os melhores sorrisos e momentos antes do ''sim''.', 'https://mpago.la/21zartN'),
  (8, '🧱', 'Cota de pisos do apartamento', 'casa', 300, 'Cada metro quadrado conta para deixar nosso lar perfeito.', 'https://mpago.la/1iESGbX'),
  (9, '📐', 'Cota de móveis planejados', 'casa', 550, 'Tudo no seu devido lugar no nosso novo apartamento.', 'https://mpago.la/2t9WLoL'),
  (10, '⚡', 'Cota de eletrodomésticos', 'casa', 450, 'Facilitando a rotina e o dia a dia do novo casal.', 'https://mpago.la/2VB4y4z'),
  (11, '🛋️', 'Cota do sofá', 'casa', 600, 'Para a Dora tirar muitos cochilos.', 'https://mpago.la/1rTw746'),
  (12, '🪟', 'Redes de proteção', 'pets', 200, 'Para a Ágata ficar na janela com segurança.', 'https://mpago.la/1DxCxep'),
  (13, '🏡', 'Estadia do casal em Arujá', 'casal', 800, 'Um descanso super especial e merecido para os noivos.', 'https://mpago.la/1rn5fXk'),
  (14, '🍻', 'Preferência na fila do bar', 'casal', 1000, 'Passe na frente e não perca nenhum segundo da festa!', 'https://mpago.la/21DHeUS'),
  (15, '🎵', 'Escolher uma música no repertório da banda', 'casal', 1000, 'Sua música favorita tocando ao vivo para agitar a pista!', 'https://mpago.la/21DHeUS');
