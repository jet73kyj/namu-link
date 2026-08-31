-- ===========================================================
-- nl_make_sessions(달)
--   그 달 전체 회기를 깐다. 없는 것만 새로 넣는다(있는 줄은 안 건드림).
--
--   2026-08-29 시점 원문 보관본
--   ※ 앞으로 고칠 때는 이 파일을 고쳐서 통째로 다시 만들 것.
--     글자를 찾아 바꾸는 방식(replace)은 쓰지 말 것.
-- ===========================================================
create or replace function public.nl_make_sessions(p_month text) returns int language plpgsql security definer as $f$
declare
  v_start date := to_date(p_month || '-01', 'YYYY-MM-DD');
  v_end date := (v_start + interval '1 month')::date;
  v_cnt int;
begin
  insert into nl_sessions
    (child_id, therapy_id, schedule_id, month_key, run_no,
     plan_date, status, therapist_id, start_time, support_type_id)
  select y.child_id, y.therapy_id, y.schedule_id, p_month,
         case when exists (select 1 from nl_offdays o3 where o3.off_date = y.d   and (o3.therapist_id is null or o3.therapist_id = y.therapist_id)) then 0 else row_number() over (partition by y.schedule_id, y.sp,   (exists (select 1 from nl_offdays o4 where o4.off_date = y.d     and (o4.therapist_id is null or o4.therapist_id = y.therapist_id)))   order by y.d) end,
         y.d,
         case
           when exists (
             select 1 from nl_offdays o
             where o.off_date = y.d
               and (o.therapist_id is null or o.therapist_id = y.therapist_id)
           ) then '휴무'
           when not y.wk_on then '쉼'
           else '예정' end,
         y.therapist_id, y.start_time, y.sp
  from (
    select x.*,
           case
             -- 5주차에는 센터비용으로 (발4+센1)
             when x.count_mode = '발4+센1' and x.wk = 5 then 1
             -- 발달재활 요일이 그 달에 4번뿐일 때만 1주차를 발추로 (발추대체)
             when x.count_mode = '발추대체' and x.wk = 1 and x.dev_cnt = 4 then 8
             -- 그 요일이 5번 있는 달만 5회차를 발추로 (발4+5주발추)
             when x.count_mode in ('발4+5주발추', '발4+발추1') and x.wk = 5 then 8
             else x.support_type_id end as sp,
           coalesce(case
             when x.wk = 1 then x.week1
             when x.wk = 2 then x.week2
             when x.wk = 3 then x.week3
             when x.wk = 4 then x.week4
             when x.wk = 5 then (x.count_mode in ('매주', '발4+발추1', '발4+센1', '발추대체', '발4+5주발추'))
             else false end, false) as wk_on
    from (
      select t.child_id, t.id as therapy_id, s.id as schedule_id,
             t.support_type_id, s.therapist_id, s.start_time,
             d::date as d,
             row_number() over (partition by s.id order by d) - (select count(*) from nl_offdays o2     where o2.off_date < d::date       and o2.off_date >= v_start and o2.off_date < v_end       and (o2.therapist_id is null or o2.therapist_id = s.therapist_id)       and extract(dow from o2.off_date) = extract(dow from d)) as wk,
             count(*)  over (partition by s.id)               as wd_cnt,
             (select count(distinct d2::date)
                from nl_therapy_schedules s2
                join nl_therapies t2 on t2.id = s2.therapy_id
                cross join generate_series(v_start, v_end - 1, interval '1 day') d2
               where t2.child_id = t.child_id
                 and t2.support_type_id = 2
                 and t2.ended_on is null
                 and (s2.from_month is null or s2.from_month <= p_month)
                 and (s2.to_month is null or s2.to_month >= p_month)
                 and s2.weekday = (array['일','월','화','수','목','금','토'])[extract(dow from d2)::int + 1]
             ) as dev_cnt,
             t.count_mode, s.week1, s.week2, s.week3, s.week4,
             s.from_date, s.to_date
      from nl_therapy_schedules s
      join nl_therapies t on t.id = s.therapy_id
      join nl_children c on c.id = t.child_id
      cross join generate_series(v_start, v_end - 1, interval '1 day') d
      where c.status = '치료중'
        and t.ended_on is null
        and (s.from_month is null or s.from_month <= p_month)
        and (s.to_month is null or s.to_month >= p_month)
        and s.weekday = (array['일','월','화','수','목','금','토'])[extract(dow from d)::int + 1]
    ) x
    where true
      and (x.from_date is null or x.d >= x.from_date)
      and (x.to_date is null or x.d <= x.to_date)
  ) y
  where y.wk_on on conflict do nothing;

  get diagnostics v_cnt = row_count;
  return v_cnt;
end $f$;
