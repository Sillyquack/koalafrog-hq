alter table public.supplier_quote_lines
  add column if not exists created_at timestamptz not null default transaction_timestamp();
