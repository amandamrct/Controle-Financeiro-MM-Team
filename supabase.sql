-- Rode isto no SQL Editor do seu projeto Supabase (Project > SQL Editor > New query)

create table if not exists kv_store (
  user_id uuid references auth.users(id) on delete cascade not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz default now(),
  primary key (user_id, key)
);

-- Row Level Security: cada usuário só vê e altera os próprios dados
alter table kv_store enable row level security;

create policy "usuarios_gerenciam_seus_dados"
  on kv_store
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
