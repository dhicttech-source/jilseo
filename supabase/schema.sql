-- 질서(jilseo) Supabase 스키마 — 지시문 §5
-- 2026-10-08부터 사용자의 기존(유료) Supabase 프로젝트에 함께 둔다. 다른 테이블과 충돌하지 않도록 jilseo_ 접두어.
-- Supabase 대시보드 > SQL Editor 에서 그대로 실행한다. 여러 번 실행해도 안전(idempotent).

create extension if not exists pgcrypto;

create table if not exists public.jilseo_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  folder text,
  title text,
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.jilseo_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  service_id text,
  conversation_url text,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists public.jilseo_comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  prompt text not null,
  responses jsonb not null,   -- {chatgpt:"...", claude:"...", ...}
                              -- 파이프라인: 생성은 서비스 id, 검증은 "verify:<id>", 수정본은 "revised:<생성 id>",
                              --             판정 메타는 "_verdicts": {<id>: {lens, grade, counts, headline, judged}},
                              --             실행 메타는 "_meta": {presetId, depth, generator, verifiers[], revised}
  device text,                -- "mac_studio" | "macbook"
  created_at timestamptz default now()
);

create index if not exists jilseo_prompts_user_folder_idx on public.jilseo_prompts (user_id, folder, created_at desc);
create index if not exists jilseo_notes_user_created_idx on public.jilseo_notes (user_id, created_at desc);
create index if not exists jilseo_comparisons_user_created_idx on public.jilseo_comparisons (user_id, created_at desc);

alter table public.jilseo_prompts enable row level security;
alter table public.jilseo_notes enable row level security;
alter table public.jilseo_comparisons enable row level security;

-- RLS: 본인 행만 (auth.uid() = user_id). 같은 프로젝트의 다른 사용자에게는 보이지 않는다.
drop policy if exists "own rows" on public.jilseo_prompts;
create policy "own rows" on public.jilseo_prompts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.jilseo_notes;
create policy "own rows" on public.jilseo_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.jilseo_comparisons;
create policy "own rows" on public.jilseo_comparisons
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
