-- 질서(jilseo) Supabase 스키마 — 지시문 §5
-- Supabase 대시보드 > SQL Editor 에서 그대로 실행한다. 여러 번 실행해도 안전(idempotent).

create extension if not exists pgcrypto;

create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  folder text,
  title text,
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  service_id text,
  conversation_url text,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists public.comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  prompt text not null,
  responses jsonb not null,   -- {chatgpt:"...", claude:"...", ...}
                              -- 파이프라인: 생성은 서비스 id, 검증은 "verify:<id>", 수정본은 "revised:<생성 id>",
                              --             판정 메타는 "_verdicts": {<id>: {lens, grade, counts, headline, judged}}
  device text,                -- "mac_studio" | "macbook"
  created_at timestamptz default now()
);

create index if not exists prompts_user_folder_idx on public.prompts (user_id, folder, created_at desc);
create index if not exists notes_user_created_idx on public.notes (user_id, created_at desc);
create index if not exists comparisons_user_created_idx on public.comparisons (user_id, created_at desc);

alter table public.prompts enable row level security;
alter table public.notes enable row level security;
alter table public.comparisons enable row level security;

-- RLS: 본인 행만 (auth.uid() = user_id)
drop policy if exists "own rows" on public.prompts;
create policy "own rows" on public.prompts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.notes;
create policy "own rows" on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.comparisons;
create policy "own rows" on public.comparisons
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Free 프로젝트 일시정지 방지용 (Mac Studio cron에서 REST로 호출):
--   curl -s "$SUPABASE_URL/rest/v1/comparisons?select=count" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
