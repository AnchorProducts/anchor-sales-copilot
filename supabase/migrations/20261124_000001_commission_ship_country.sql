-- Commission claims can ship outside the US (Canada, Mexico, South America).
-- ISO 3166-1 alpha-2 code from SHIP_COUNTRIES; null on older rows means US.
alter table public.commission_claims
  add column if not exists ship_country text;

comment on column public.commission_claims.ship_country is
  'ISO alpha-2 ship-to country (US, CA, MX, ...). Null = US (rows before 11/24/2026).';
