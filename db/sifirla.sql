-- ============================================================================
-- OMX ERP · SIFIRLAMA  (DİKKAT: VERİ SİLER)
--
-- Ne zaman gerekir?  Neredeyse hiçbir zaman. `kurulum.sql` mevcut kurulumu
-- onarır ve tekrar çalıştırılabilir; önce onu deneyin.
-- Bu betik yalnızca "baştan temiz kurayım" demek istediğinizde kullanılır.
--
-- GÜVENLİK KİLİDİ: içeride gerçek kayıt (proje / cari / malzeme / fatura)
-- varsa betik kendini durdurur. Yine de silmek istiyorsanız aşağıdaki
-- ZORLA satırını true yapın.
--
-- Kullanım: bu dosyayı çalıştır → sonra kurulum.sql'i çalıştır.
-- Supabase Authentication'daki kullanıcı hesapları SİLİNMEZ; yalnızca
-- uygulama tabloları düşer. Hesaplar kurulum sonrası tekrar app_users'a
-- düşmez, o yüzden kullanicilar.sql'i yeniden çalıştırmanız gerekir.
-- ============================================================================

do $$
declare
  ZORLA  boolean := false;        -- ← veri olsa bile silmek için true yapın
  v_kayit bigint := 0;
  r record;
begin
  -- ── Güvenlik kilidi ──────────────────────────────────────────────────────
  if not ZORLA then
    for r in select unnest(array['projects','companies','materials','transactions']) as t
    loop
      if to_regclass('public.' || r.t) is not null then
        execute format('select count(*) from public.%I', r.t) into strict v_kayit;
        if v_kayit > 0 then
          raise exception
            'DURDURULDU: "%" tablosunda % kayıt var. Veri silinecekti. Emin iseniz betiğin başındaki ZORLA değerini true yapın.',
            r.t, v_kayit;
        end if;
      end if;
    end loop;
  end if;

  -- ── auth.users tetikleyicisi ─────────────────────────────────────────────
  if to_regclass('auth.users') is not null then
    execute 'drop trigger if exists on_auth_user_created on auth.users';
  end if;

  -- ── Görünümler ───────────────────────────────────────────────────────────
  for r in select viewname from pg_views where schemaname = 'public' loop
    execute format('drop view if exists public.%I cascade', r.viewname);
  end loop;

  -- ── Tablolar ─────────────────────────────────────────────────────────────
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;

  -- ── Fonksiyonlar ─────────────────────────────────────────────────────────
  for r in
    select p.oid::regprocedure as imza
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('next_doc_no','touch_updated_at','tl_karsiligi',
                         'apply_stock_move','apply_timesheet_cost',
                         'current_role_kod','has_perm','handle_new_user')
  loop
    execute format('drop function if exists %s cascade', r.imza);
  end loop;

  -- ── Enum tipleri ─────────────────────────────────────────────────────────
  for r in
    select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typtype = 'e'
  loop
    execute format('drop type if exists public.%I cascade', r.typname);
  end loop;

  raise notice 'OMX tabloları, görünümleri, fonksiyonları ve tipleri kaldırıldı. Şimdi kurulum.sql çalıştırın.';
end $$;

-- Kalan var mı? (0 olmalı)
select
  (select count(*) from pg_tables where schemaname='public') as kalan_tablo,
  (select count(*) from pg_views  where schemaname='public') as kalan_gorunum;
