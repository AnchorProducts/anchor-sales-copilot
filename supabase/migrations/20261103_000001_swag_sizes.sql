-- Sizes on swag items.
--
-- Apparel used to be one inventory item per size ("Underwear — Small",
-- "Underwear — Medium", …). Now one item carries its sizes, each with its own
-- count:
--
--   marketing_inventory_items.sizes: ordered array of
--     { "label": "M", "quantity": 4 }
--   Empty (the default) = the item doesn't come in sizes, exactly as before.
--
-- When an item has sizes, quantity_available is their SUM — still the one
-- number every page, low-stock alert and stock guard already reads. The trigger
-- below keeps the two in step:
--   • a write that changes sizes sets quantity_available to their sum, so a
--     size-aware path (the editor, order fulfillment, the aisle) just writes the
--     sizes;
--   • a write that changes only quantity_available (a path that doesn't know
--     about sizes) spreads the difference over the sizes: units taken come off
--     whichever size has the most, units put back go on the first size.
--
-- marketing_orders.size_plan: { "<item id>": { "M": 2, "L": 1 } } — which sizes
-- an order asked for, so fulfillment takes the right ones off the shelf.
-- marketing_item_grabs.size: the size picked up at the aisle, for the log.

alter table public.marketing_inventory_items
  add column if not exists sizes jsonb not null default '[]'::jsonb;

alter table public.marketing_orders
  add column if not exists size_plan jsonb not null default '{}'::jsonb;

alter table public.marketing_item_grabs
  add column if not exists size text;

create or replace function public.marketing_inventory_sync_sizes()
returns trigger
language plpgsql
as $$
declare
  arr     jsonb;
  total   integer;
  delta   integer;
  i       integer;
  best    integer;
  best_q  integer;
  q       integer;
begin
  if new.sizes is null or jsonb_typeof(new.sizes) <> 'array' or jsonb_array_length(new.sizes) = 0 then
    return new;
  end if;

  select coalesce(sum(greatest(0, coalesce((e->>'quantity')::integer, 0))), 0)
    into total
    from jsonb_array_elements(new.sizes) e;

  -- Sizes were written (or this is a new row): they are the count.
  if tg_op = 'INSERT' or new.sizes is distinct from old.sizes then
    new.quantity_available := total;
    return new;
  end if;

  -- Only the total moved: spread the difference over the sizes.
  delta := new.quantity_available - total;
  if delta = 0 then
    return new;
  end if;

  arr := new.sizes;
  if delta > 0 then
    q := coalesce((arr->0->>'quantity')::integer, 0);
    arr := jsonb_set(arr, '{0,quantity}', to_jsonb(q + delta));
  else
    delta := -delta;
    while delta > 0 loop
      best := -1;
      best_q := 0;
      for i in 0 .. jsonb_array_length(arr) - 1 loop
        q := coalesce((arr->i->>'quantity')::integer, 0);
        if q > best_q then
          best := i;
          best_q := q;
        end if;
      end loop;
      exit when best < 0;
      arr := jsonb_set(arr, array[best::text, 'quantity'], to_jsonb(best_q - 1));
      delta := delta - 1;
    end loop;
  end if;
  new.sizes := arr;
  return new;
end;
$$;

drop trigger if exists marketing_inventory_sync_sizes on public.marketing_inventory_items;
create trigger marketing_inventory_sync_sizes
  before insert or update of sizes, quantity_available
  on public.marketing_inventory_items
  for each row
  execute function public.marketing_inventory_sync_sizes();

notify pgrst, 'reload schema';
