insert into public.transaction_categories (name, movement_type, system)
values
  ('Nomina Fran', 'income', true),
  ('Nomina Nieves', 'income', true),
  ('Veramar / Booking', 'income', true),
  ('Dividendos / intereses', 'income', true),
  ('Otros ingresos', 'income', true),
  ('Hipoteca', 'expense', true),
  ('Luz', 'expense', true),
  ('Agua', 'expense', true),
  ('Internet / Telefonia', 'expense', true),
  ('Seguros', 'expense', true),
  ('Comunidad', 'expense', true),
  ('Otros fijos', 'expense', true),
  ('Compras', 'expense', true),
  ('Comida / Restaurantes', 'expense', true),
  ('Transporte', 'expense', true),
  ('Salud', 'expense', true),
  ('Ocio / Entretenimiento', 'expense', true),
  ('Otros variables', 'expense', true),
  ('Gastos Veramar', 'expense', true),
  ('Ingresos Veramar / Booking', 'income', true),
  ('Transferencia a inversion', 'transfer', true),
  ('Compra de activo', 'investment', true),
  ('Fondos', 'investment', true),
  ('ETF', 'investment', true),
  ('Cripto', 'investment', true)
on conflict do nothing;

insert into public.category_rules (keyword, category_id, priority)
select rule.keyword, category.id, rule.priority
from (
  values
    ('nomina fran', 'Nomina Fran', 'income', 8),
    ('nomina nieves', 'Nomina Nieves', 'income', 8),
    ('booking', 'Ingresos Veramar / Booking', 'income', 7),
    ('veramar booking', 'Ingresos Veramar / Booking', 'income', 7),
    ('dividendo', 'Dividendos / intereses', 'income', 15),
    ('intereses', 'Dividendos / intereses', 'income', 15),
    ('hipoteca', 'Hipoteca', 'expense', 15),
    ('iberdrola', 'Luz', 'expense', 15),
    ('endesa', 'Luz', 'expense', 15),
    ('agua', 'Agua', 'expense', 20),
    ('movistar', 'Internet / Telefonia', 'expense', 15),
    ('vodafone', 'Internet / Telefonia', 'expense', 15),
    ('mapfre', 'Seguros', 'expense', 15),
    ('comunidad', 'Comunidad', 'expense', 15),
    ('gastos veramar', 'Gastos Veramar', 'expense', 8),
    ('veramar gasto', 'Gastos Veramar', 'expense', 8),
    ('mercadona', 'Compras', 'expense', 20),
    ('carrefour', 'Compras', 'expense', 20),
    ('lidl', 'Compras', 'expense', 20),
    ('aldi', 'Compras', 'expense', 20),
    ('restaurante', 'Comida / Restaurantes', 'expense', 20),
    ('repsol', 'Transporte', 'expense', 20),
    ('cepsa', 'Transporte', 'expense', 20),
    ('farmacia', 'Salud', 'expense', 20),
    ('spotify', 'Ocio / Entretenimiento', 'expense', 20),
    ('netflix', 'Ocio / Entretenimiento', 'expense', 20),
    ('myinvestor', 'Transferencia a inversion', 'transfer', 12),
    ('binance', 'Transferencia a inversion', 'transfer', 12),
    ('ledger', 'Transferencia a inversion', 'transfer', 12),
    ('trade republic', 'Transferencia a inversion', 'transfer', 12),
    ('compra activo', 'Compra de activo', 'investment', 12)
) as rule(keyword, category_name, movement_type, priority)
join public.transaction_categories category
  on category.system = true
 and category.name = rule.category_name
 and category.movement_type = rule.movement_type
on conflict do nothing;
