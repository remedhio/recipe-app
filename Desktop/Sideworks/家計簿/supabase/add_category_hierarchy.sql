-- カテゴリ階層構造の追加
-- 支出カテゴリに「固定費」「変動費」「投資」という親カテゴリを追加し、
-- その中に子カテゴリを配置できるようにする

-- 1. parent_idカラムを追加（自己参照）
alter table public.categories
add column if not exists parent_id uuid references public.categories(id) on delete cascade;

-- 2. インデックスを追加（パフォーマンス向上）
create index if not exists categories_parent_id_idx on public.categories(parent_id);
create index if not exists categories_user_id_type_idx on public.categories(user_id, type) where parent_id is null;

-- 3. 既存のユーザーに対して、支出の親カテゴリ（固定費、変動費、投資）を作成
-- 注意: このSQLは既存のユーザーごとに実行する必要があります
-- アプリ側（categories.tsx）で自動的に作成するロジックも実装済みです

-- 既存のユーザーに対して親カテゴリを作成する場合の例:
-- insert into public.categories (user_id, name, type, parent_id)
-- select
--   id as user_id,
--   '固定費' as name,
--   'expense' as type,
--   null as parent_id
-- from auth.users
-- where not exists (
--   select 1 from public.categories
--   where categories.user_id = auth.users.id
--   and categories.name = '固定費'
--   and categories.type = 'expense'
--   and categories.parent_id is null
-- );

-- 同様に変動費と投資も作成:
-- insert into public.categories (user_id, name, type, parent_id)
-- select
--   id as user_id,
--   '変動費' as name,
--   'expense' as type,
--   null as parent_id
-- from auth.users
-- where not exists (
--   select 1 from public.categories
--   where categories.user_id = auth.users.id
--   and categories.name = '変動費'
--   and categories.type = 'expense'
--   and categories.parent_id is null
-- );

-- insert into public.categories (user_id, name, type, parent_id)
-- select
--   id as user_id,
--   '投資' as name,
--   'expense' as type,
--   null as parent_id
-- from auth.users
-- where not exists (
--   select 1 from public.categories
--   where categories.user_id = auth.users.id
--   and categories.name = '投資'
--   and categories.type = 'expense'
--   and categories.parent_id is null
-- );

-- 注意: アプリ側（categories.tsx）で自動的に作成するロジックが実装されているため、
-- 上記のSQLを実行しなくても、ユーザーがカテゴリ画面を開いた時に自動的に作成されます。
