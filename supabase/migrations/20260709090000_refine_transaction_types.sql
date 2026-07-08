alter table public.transactions
  drop constraint if exists transactions_type_check;

alter table public.transactions
  add constraint transactions_type_check check (
    transaction_type in (
      'income',
      'expense',
      'transfer',
      'investment_transfer',
      'asset_purchase',
      'investment_buy',
      'investment_sell',
      'fee',
      'tax',
      'refund',
      'adjustment'
    )
  );
