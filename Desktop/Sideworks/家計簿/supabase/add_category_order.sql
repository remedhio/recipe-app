-- カテゴリの並び順を管理するためのorderカラムを追加
-- Run in Supabase SQL Editor

-- 1. orderカラムを追加
alter table public.categories
add column if not exists "order" integer default 0;

-- 2. 既存のカテゴリに順序を設定（親カテゴリは固定順序、子カテゴリは名前順）
-- 支出の親カテゴリ
update public.categories
set "order" = case
  when name = '固定費' and type = 'expense' and parent_id is null then 1
  when name = '変動費' and type = 'expense' and parent_id is null then 2
  when name = '投資' and type = 'expense' and parent_id is null then 3
  else "order"
end
where type = 'expense' and parent_id is null;

-- 収入の親カテゴリ
update public.categories
set "order" = case
  when name = '給料' and type = 'income' and parent_id is null then 1
  when name = '貯金' and type = 'income' and parent_id is null then 2
  else "order"
end
where type = 'income' and parent_id is null;

-- 子カテゴリの順序を設定（親カテゴリごとに名前順）
-- これは後でアプリ側で更新されるので、初期値として0を設定
update public.categories
set "order" = 0
where parent_id is not null;

-- 3. インデックスを追加（パフォーマンス向上）
create index if not exists categories_order_idx on public.categories(user_id, type, parent_id, "order");
