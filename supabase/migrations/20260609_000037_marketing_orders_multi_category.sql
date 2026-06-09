-- Marketing orders can now span multiple categories (samples + swag + ...).
-- Convert the single `category text` column into `categories text[]`.
--
-- Idempotent and safe whether or not the original migration's single-category
-- column is still present:
--   * add `categories` if missing
--   * if the old `category` column exists, backfill it into `categories` and drop it

alter table public.marketing_orders
  add column if not exists categories text[] not null default '{}';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'marketing_orders'
      and column_name = 'category'
  ) then
    update public.marketing_orders
      set categories = array[category]
      where category is not null
        and (categories is null or array_length(categories, 1) is null);

    alter table public.marketing_orders drop column category;
  end if;
end $$;
