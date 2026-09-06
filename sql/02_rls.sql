-- 02_rls.sql — políticas de acesso.
-- CRÍTICO: rodar ANTES de publicar o site. A chave publicável fica visível no
-- código-fonte, então estas políticas são a única barreira contra um visitante
-- apagar a lista de presentes ou a lista de convidados.
-- Rodar no SQL Editor do Supabase.

alter table presentes_casamento enable row level security;
alter table convidados          enable row level security;
alter table recados             enable row level security;

-- Recriar do zero para o arquivo ser idempotente.
drop policy if exists presentes_leitura_publica  on presentes_casamento;
drop policy if exists presentes_marcar_pago      on presentes_casamento;
drop policy if exists convidados_leitura_visivel on convidados;
drop policy if exists convidados_confirmar       on convidados;
drop policy if exists recados_insercao_publica   on recados;

-- ---------- presentes_casamento ----------
-- Qualquer visitante lê a lista inteira.
create policy presentes_leitura_publica
  on presentes_casamento for select
  to anon, authenticated
  using (true);

-- Só é possível marcar como pago, nunca desmarcar. USING casa a linha ANTES do
-- update (precisa estar não-paga); WITH CHECK valida a linha DEPOIS (precisa
-- ficar paga). Juntos permitem exclusivamente a transição false -> true.
create policy presentes_marcar_pago
  on presentes_casamento for update
  to anon, authenticated
  using (pagou = false)
  with check (pagou = true);

-- ---------- convidados ----------
-- Placeholders (banda, nomes incompletos) não aparecem para o visitante.
create policy convidados_leitura_visivel
  on convidados for select
  to anon, authenticated
  using (visivel = true);

-- A condição visivel = true se repete aqui de propósito: esconder a linha no
-- SELECT não a protege de um UPDATE por quem adivinhe o id.
create policy convidados_confirmar
  on convidados for update
  to anon, authenticated
  using (visivel = true)
  with check (visivel = true and (confirmacao is null or confirmacao in ('pago', 'recusado')));

-- ---------- recados ----------
-- Write-only: o site insere, mas ninguém lê pelo site. Um recado é uma mensagem
-- particular para os noivos, que leem no painel do Supabase.
create policy recados_insercao_publica
  on recados for insert
  to anon, authenticated
  with check (true);

-- Nenhuma policy de DELETE em nenhuma tabela: com RLS ligado, a ausência de
-- policy nega a operação.
