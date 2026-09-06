-- 01_schema.sql — estrutura das tabelas do site de casamento.
-- Idempotente: pode rodar quantas vezes quiser, em banco novo ou já configurado.
-- Rodar no SQL Editor do Supabase.

alter table presentes_casamento add column if not exists emoji          text;
alter table presentes_casamento add column if not exists descricao      text;
alter table presentes_casamento add column if not exists link_pagamento text;
alter table presentes_casamento add column if not exists ordem          int;

create table if not exists convidados (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  confirmacao   text,                     -- null | 'pago' | 'recusado'
  visivel       boolean not null default true,
  confirmado_em timestamptz
);

create table if not exists recados (
  id        uuid primary key default gen_random_uuid(),
  nome      text,
  mensagem  text not null,
  criado_em timestamptz default now()
);

-- A busca de convidados filtra por visivel e ordena por nome.
create index if not exists convidados_visivel_idx on convidados (visivel);
