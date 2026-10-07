-- TEST-only (gjvmnzldisachojkdmid). Follows 20261007052949 feedback_product_registry.
-- Production (rhtyktjebiunkchddxvg) must receive the registry migration first.
--
-- Product contract:
--   create  -> product required, must be an ACTIVE registry entry
--   update  -> unchanged product only needs to exist (FK); a CHANGED product
--              must be ACTIVE. Historic posts on inactive products stay editable.

-- 1. Legacy six-argument create no longer classifies silently as OTHER.
create or replace function public.feedback_create_post_v3(
  p_actor_id text,
  p_request_id uuid,
  p_payload_hash text,
  p_author_display_name text,
  p_title text,
  p_body text
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
begin
  raise exception 'FEEDBACK_PRODUCT_INVALID';
end;
$function$;

revoke all on function public.feedback_create_post_v3(text,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.feedback_create_post_v3(text,uuid,text,text,text,text) to service_role;

-- 2. Product-aware update: active check only when the product changes.
create or replace function public.feedback_update_post_v3(
  p_actor_id text,
  p_request_id uuid,
  p_payload_hash text,
  p_post_id uuid,
  p_expected_revision bigint,
  p_title text,
  p_body text,
  p_product text
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_claim record;
  v_title text;
  v_body text;
  v_product text;
  v_row record;
  v_revision bigint;
begin
  if p_post_id is null or p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'FEEDBACK_MUTATION_ARGUMENT_INVALID';
  end if;

  v_product := upper(btrim(coalesce(p_product, '')));
  if v_product is distinct from (
    select p.product from public.feedback_posts p where p.post_id = p_post_id
  ) then
    v_product := feedback_internal.normalize_product_v1(p_product);
  end if;

  select * into v_claim
  from feedback_internal.claim_request_v3(
    p_actor_id, p_request_id, 'UPDATE_POST',
    p_post_id, p_expected_revision, p_payload_hash
  );

  if v_claim.is_replay then
    return jsonb_build_object(
      'ok', true,
      'replay', true,
      'entityId', v_claim.result_entity_id,
      'revision', v_claim.result_revision
    );
  end if;

  v_title := btrim(
    regexp_replace(
      replace(replace(coalesce(p_title,''), E'\r\n', E'\n'), E'\r', E'\n'),
      '[[:space:]]+', ' ', 'g'
    )
  );
  v_body := btrim(
    replace(replace(coalesce(p_body,''), E'\r\n', E'\n'), E'\r', E'\n')
  );

  if char_length(v_title) < 1 or char_length(v_title) > 120 then
    raise exception 'FEEDBACK_TITLE_LENGTH_INVALID';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 5000 then
    raise exception 'FEEDBACK_POST_BODY_LENGTH_INVALID';
  end if;

  select p.author_id, p.status, p.revision, p.ownership_verified
  into v_row
  from public.feedback_posts p
  where p.post_id = p_post_id
  for update;

  if not found
     or v_row.author_id <> p_actor_id
     or v_row.status <> 'ACTIVE'
     or v_row.ownership_verified is not true then
    raise exception 'FEEDBACK_MUTATION_NOT_ALLOWED';
  end if;

  -- A concurrent product change bumps revision, so the unchanged-product
  -- shortcut above can never apply to a stale product.
  if v_row.revision <> p_expected_revision then
    raise exception 'FEEDBACK_REVISION_CONFLICT';
  end if;

  update public.feedback_posts
  set title = v_title,
      body = v_body,
      product = v_product,
      revision = revision + 1,
      updated_at = clock_timestamp()
  where post_id = p_post_id
  returning revision into v_revision;

  perform feedback_internal.complete_request_v3(
    p_actor_id, p_request_id,
    p_post_id, v_revision, 'ACTIVE', false
  );

  return jsonb_build_object(
    'ok', true,
    'replay', false,
    'entityId', p_post_id,
    'revision', v_revision
  );
end;
$function$;

revoke all on function public.feedback_update_post_v3(text,uuid,text,uuid,bigint,text,text,text) from public, anon, authenticated;
grant execute on function public.feedback_update_post_v3(text,uuid,text,uuid,bigint,text,text,text) to service_role;
