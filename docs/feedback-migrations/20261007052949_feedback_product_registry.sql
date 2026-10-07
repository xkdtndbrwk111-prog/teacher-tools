create table public.feedback_products (
  product_key text primary key,
  display_name text not null,
  sort_order integer not null,
  active boolean not null default true,
  constraint feedback_products_key_check
    check (product_key ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  constraint feedback_products_display_name_check
    check (char_length(btrim(display_name)) between 1 and 80),
  constraint feedback_products_sort_order_check
    check (sort_order >= 0)
);

alter table public.feedback_products enable row level security;

create policy feedback_products_public_read
on public.feedback_products
for select
to anon, authenticated
using (true);

revoke all on table public.feedback_products from public, anon, authenticated, service_role;
grant select (product_key, display_name, sort_order, active)
  on table public.feedback_products to anon, authenticated;
grant select, insert, update, delete
  on table public.feedback_products to service_role;

insert into public.feedback_products (product_key, display_name, sort_order, active)
values
  ('HUB', '역사보리꼬리 공작소', 10, true),
  ('PROJECT_A', '마리오 게임', 20, true),
  ('PROJECT_B', '퀴즈 매니저', 30, true),
  ('SEATING', '자리배치 매니저', 40, true),
  ('HANJA', '한자 매니저', 50, true),
  ('PROJECT_C', 'Project C', 60, true),
  ('ROLE_MANAGER', '1인1역 배치 매니저', 70, true),
  ('OTHER', '기타', 80, true);

alter table public.feedback_posts
  drop constraint feedback_posts_product_check;

alter table public.feedback_posts
  add constraint feedback_posts_product_fkey
  foreign key (product)
  references public.feedback_products(product_key)
  on update restrict
  on delete restrict;

create or replace function feedback_internal.normalize_product_v1(p_product text)
returns text
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_product text := upper(btrim(coalesce(p_product, '')));
begin
  if not exists (
    select 1
    from public.feedback_products p
    where p.product_key = v_product
      and p.active is true
  ) then
    raise exception 'FEEDBACK_PRODUCT_INVALID';
  end if;
  return v_product;
end;
$function$;

revoke all on function feedback_internal.normalize_product_v1(text)
  from public, anon, authenticated;
grant execute on function feedback_internal.normalize_product_v1(text)
  to service_role;
