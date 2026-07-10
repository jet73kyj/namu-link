-- =============================================
-- 나무링크 마이그레이션: center_payments + refunds 테이블 추가
-- =============================================
-- ⚠️ 이 파일은 기존 테이블(children, payments 등)을 건드리지 않고
--    center_payments, refunds 두 개만 신규 생성합니다.
--
-- 사용법:
--   1) Supabase 대시보드 → SQL Editor
--   2) 이 파일 전체 붙여넣고 Run
-- =============================================

-- 센터비용 납부 (자연키: childId__tIdx__year__month)
create table if not exists center_payments (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- 환불 내역 (id 는 앱에서 Date.now() 로 생성)
create table if not exists refunds (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- 조회 성능을 위한 인덱스
create index if not exists center_payments_child_idx on center_payments ((data ->> 'childId'));
create index if not exists center_payments_year_idx  on center_payments (((data ->> 'year')::int));
create index if not exists refunds_child_idx         on refunds         ((data ->> 'childId'));
create index if not exists refunds_date_idx          on refunds         ((data ->> 'date'));
