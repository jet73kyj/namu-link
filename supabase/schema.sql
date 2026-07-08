-- =============================================
-- 나무링크 Supabase 스키마
-- =============================================
-- 실행: Supabase 대시보드 → SQL Editor → 아래 전체 붙여넣고 Run
--
-- 정책: 모든 테이블 anon 키로 읽기·쓰기 가능 (RLS off).
-- 프로덕션에서는 아래 주석 처리된 RLS 정책을 활성화하고
-- 인증 방식을 강화해야 합니다.
-- =============================================

-- 아동
create table if not exists children (
  id text primary key,
  name text,
  birth text,
  manager_id text,
  phase text default 'active',
  status text default '치료중',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
create index if not exists children_name_idx on children(name);
create index if not exists children_manager_id_idx on children(manager_id);
create index if not exists children_updated_at_idx on children(updated_at desc);

-- 치료사
create table if not exists therapists (
  id text primary key,
  name text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
create index if not exists therapists_name_idx on therapists(name);

-- 납부
create table if not exists payments (
  id text primary key,
  child_id text,
  child_name text,
  year int,
  month int,
  paid boolean default false,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
create index if not exists payments_child_id_idx on payments(child_id);
create index if not exists payments_year_month_idx on payments(year, month);

-- 치료 기록
create table if not exists records (
  id text primary key,
  child_id text,
  year int,
  month int,
  category text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
create index if not exists records_child_id_idx on records(child_id);
create index if not exists records_year_month_idx on records(year, month);

-- 바우처 데이터
create table if not exists voucher_data (
  id bigserial primary key,
  child_name text,
  birth text,
  appr_date text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
create index if not exists voucher_child_name_idx on voucher_data(child_name);

-- 신규 상담 (레거시 - children 으로 통합 완료됐지만 백업용)
create table if not exists intake_list (
  id text primary key,
  name text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- 초기상담지 토큰
create table if not exists assessment_tokens (
  id text primary key,
  token text unique not null,
  child_id text,
  age_group text,
  is_used boolean default false,
  expires_at timestamptz,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists tokens_token_idx on assessment_tokens(token);
create index if not exists tokens_child_id_idx on assessment_tokens(child_id);

-- 초기상담 응답
create table if not exists initial_assessments (
  id text primary key,
  child_id text,
  token_id text,
  age_group text,
  submitted_at timestamptz default now(),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
create index if not exists assessments_child_id_idx on initial_assessments(child_id);
create index if not exists assessments_submitted_idx on initial_assessments(submitted_at desc);

-- 부가 아동별 데이터 (문서·타임라인·학부모 메모)
create table if not exists child_extras (
  id bigserial primary key,
  child_id text,
  kind text,   -- 'docs' | 'timeline' | 'parent_memos'
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  unique(child_id, kind)
);
create index if not exists extras_child_id_idx on child_extras(child_id);

-- =============================================
-- 프로덕션 RLS (선택) — 활성화하려면 주석 해제
-- =============================================
-- alter table children enable row level security;
-- create policy "anon_read"  on children for select using (true);
-- create policy "anon_write" on children for all using (true) with check (true);
-- (다른 테이블도 동일하게 반복)
