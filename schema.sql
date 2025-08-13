-- Tabela para anotações e lembretes
create table if not exists public.notes (
  id bigint primary key generated always as identity,
  title text not null,
  content text,
  status text not null default 'pendente' check (status in ('pendente','concluida')),
  remind_at timestamptz,
  client_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS (Row Level Security)
alter table public.notes enable row level security;

-- Políticas simples para acesso anônimo (para protótipo). Em produção, ajuste com autenticação.
create policy "notes_read_all" on public.notes for select using (true);
create policy "notes_insert_all" on public.notes for insert with check (true);
create policy "notes_update_all" on public.notes for update using (true);
create policy "notes_delete_all" on public.notes for delete using (true);

-- Ajustes idempotentes
alter table public.notes add column if not exists client_id text;

-- Assinantes do SendPulse (armazenamos o endpoint para envio dirigido)
create table if not exists public.sendpulse_subscribers (
  id bigint primary key generated always as identity,
  client_id text not null,
  endpoint text not null,
  subscription jsonb,
  created_at timestamptz not null default now()
);

alter table public.sendpulse_subscribers enable row level security;
create policy if not exists "sps_select_all" on public.sendpulse_subscribers for select using (true);
create policy if not exists "sps_insert_all" on public.sendpulse_subscribers for insert with check (true);
create policy if not exists "sps_update_all" on public.sendpulse_subscribers for update using (true);
create policy if not exists "sps_delete_all" on public.sendpulse_subscribers for delete using (true);
create unique index if not exists sps_endpoint_unique on public.sendpulse_subscribers (endpoint);


