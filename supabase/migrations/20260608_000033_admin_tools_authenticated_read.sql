-- The admin console card states (admin_tools, migration 000032) only needed to
-- be read by admins. Now the same table also holds the activation state for the
-- sales-rep tools (keys like `sales:internal:chat` / `sales:external:commission`),
-- and those must be readable by the reps themselves so their dashboard can hide
-- a deactivated tool. The values are non-sensitive feature flags (a key + a
-- boolean), so we let any authenticated user read the table. Writes stay
-- admin-only (handled by the service-role API route at /api/admin/tools).

drop policy if exists "Authenticated can read admin tools" on public.admin_tools;
create policy "Authenticated can read admin tools"
  on public.admin_tools for select
  to authenticated
  using (true);
