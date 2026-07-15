-- Internal ledger helpers are callable only by authenticated sessions; RLS on
-- the underlying tables still scopes every lookup to the owner workspace.
grant execute on function public.kf_convert_quantity(numeric,text,text),public.kf_inventory_balance(uuid,text),public.kf_packaging_balance(uuid,text) to authenticated;
