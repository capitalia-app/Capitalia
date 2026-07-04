alter table public.financial_accounts
drop constraint financial_accounts_type_check;

alter table public.financial_accounts
add constraint financial_accounts_type_check check (
  type in (
    'checking',
    'savings',
    'credit_card',
    'brokerage',
    'crypto_wallet',
    'cash',
    'loan',
    'mortgage',
    'real_estate',
    'business',
    'other'
  )
);

insert into public.institutions (name, slug, type, country, website_url)
values
  ('BBVA', 'bbva', 'bank', 'ES', 'https://www.bbva.es'),
  ('MyInvestor', 'myinvestor', 'broker', 'ES', 'https://myinvestor.es'),
  ('Ledger', 'ledger', 'wallet', null, 'https://www.ledger.com'),
  ('Trade Republic', 'trade-republic', 'broker', 'DE', 'https://traderepublic.com'),
  ('Coinbase', 'coinbase', 'crypto_exchange', 'US', 'https://www.coinbase.com'),
  ('Manual', 'manual', 'manual', null, null)
on conflict (slug) do update
set
  name = excluded.name,
  type = excluded.type,
  country = excluded.country,
  website_url = excluded.website_url,
  is_active = true,
  updated_at = now();
