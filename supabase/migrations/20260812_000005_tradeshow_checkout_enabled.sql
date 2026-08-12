-- Tradeshow stock is always checkout-eligible.
--
-- The Tradeshow category holds items that go out on loan and come back. The
-- checkout flow IS that round trip: an item filed there with checkout_enabled
-- false could be sent to an event with no way to book it back in, which is the
-- one thing the category exists to prevent.
--
-- The API now forces the flag on every create and update, including when an
-- item is merely MOVED into Tradeshow. This backfills anything categorized
-- before that shipped, so the rule holds for existing rows too. Expected to
-- affect zero rows on a database where the category is still empty.

update public.marketing_inventory_items
   set checkout_enabled = true,
       updated_at = now()
 where category = 'tradeshow'
   and checkout_enabled = false;
