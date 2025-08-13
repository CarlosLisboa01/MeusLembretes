-- Tabela para anotações e lembretes
create table if not exists public.notes (
  id bigint primary key generated always as identity,
  title text not null,
  content text,
  status text not null default 'pendente' check (status in ('pendente','concluida')),
  remind_at timestamptz,
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


