-- =============================================
-- 나무링크 Supabase 스키마 (v2 · 스키마 무관 최소 컬럼)
-- =============================================
-- 방침: 각 테이블은 primary key + data JSONB 만 필수.
-- 이렇게 하면 앱 코드가 컬럼 매핑 오류 없이 항상 동작합니다.
--
-- 사용법:
--   1) Supabase 대시보드 → SQL Editor 접속
--   2) 아래 전체 붙여넣고 Run
--   3) 이미 다른 스키마로 만든 테이블이 있으면 DROP → CREATE 실행됨
-- =============================================

-- 안전을 위해 기존 테이블 제거 (데이터 있으면 백업 먼저!)
drop table if exists child_extras     cascade;
drop table if exists initial_assessments cascade;
drop table if exists assessment_tokens  cascade;
drop table if exists intake_list        cascade;
drop table if exists voucher_data       cascade;
drop table if exists records            cascade;
drop table if exists payments           cascade;
drop table if exists therapists         cascade;
drop table if exists children           cascade;

-- =============================================
-- 각 테이블은 (id text PK, data jsonb, updated_at)
-- =============================================

create table children (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table therapists (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table payments (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table records (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- voucher_data 는 자연키가 없어 bigserial 사용
create table voucher_data (
  id bigserial primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table intake_list (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table assessment_tokens (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table initial_assessments (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table child_extras (
  id text primary key,   -- 형식: {child_id}::{kind}
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- =============================================
-- JSONB 안의 값으로 검색이 잦은 경우를 위한 인덱스
-- =============================================
create index children_name_idx           on children           using gin ((data -> 'name'));
create index children_birth_idx          on children           ((data ->> 'birth'));
create index children_managerId_idx      on children           ((data ->> 'managerId'));
create index payments_year_idx           on payments           (((data ->> 'year')::int));
create index payments_month_idx          on payments           (((data ->> 'month')::int));
create index tokens_token_idx            on assessment_tokens  ((data ->> 'token'));
create index tokens_child_id_idx         on assessment_tokens  ((data ->> 'child_id'));
create index assessments_child_id_idx    on initial_assessments((data ->> 'child_id'));
create index extras_child_id_idx         on child_extras       ((data ->> 'child_id'));
create index extras_kind_idx             on child_extras       ((data ->> 'kind'));

-- =============================================
-- 프로덕션 RLS (선택) — 활성화하려면 주석 해제
-- =============================================
-- alter table children enable row level security;
-- create policy "anon_all_children" on children for all using (true) with check (true);
-- (다른 테이블도 동일하게 반복)
