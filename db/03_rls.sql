-- ============================================================================
-- OMX ERP · Dosya 2/3 : Güvenlik (RLS) ve rol bazlı yetki
-- ESATLAS'ta yetki yalnızca arayüzde (e-posta karşılaştırması) idi; burada
-- gerçek sınır veritabanında. Arayüz sadece görünümü sadeleştirir.
-- ============================================================================

-- Oturumdaki kullanıcının rol kodunu döner
create or replace function current_role_kod() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(r.kod, 'misafir')
  from app_users u left join roles r on r.id = u.role_id
  where u.id = auth.uid() and u.aktif
$$;

-- Modül bazlı yetki kontrolü
create or replace function has_perm(p_modul text, p_islem text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case p_islem
              when 'goruntule' then rp.goruntule
              when 'ekle'      then rp.ekle
              when 'duzenle'   then rp.duzenle
              when 'sil'       then rp.sil
              when 'onayla'    then rp.onayla
              else false end
     from app_users u
     join role_permissions rp on rp.role_id = u.role_id
     where u.id = auth.uid() and u.aktif and rp.modul = p_modul),
    false)
  or current_role_kod() = 'admin'
$$;

-- Tüm tablolarda RLS aç ve modül eşlemesine göre politika üret
do $$
declare
  rec record;
  modul_map jsonb := jsonb_build_object(
    'companies','cari',              'contacts','cari',
    'materials','malzeme',           'material_categories','malzeme',
    'material_suppliers','malzeme',
    'projects','proje',              'project_tasks','proje',
    'project_documents','dokuman',   'project_costs','maliyet',
    'project_notes','proje',
    'quotes','satis',                'quote_lines','satis',
    'boms','bom',                    'bom_lines','bom',
    'purchase_requests','satinalma', 'purchase_request_lines','satinalma',
    'purchase_orders','satinalma',   'purchase_order_lines','satinalma',
    'warehouses','depo',             'stock_balances','depo',
    'stock_moves','depo',            'goods_receipts','depo',
    'goods_receipt_lines','depo',
    'timesheets','puantaj',
    'equipment','servis',            'service_orders','servis',
    'service_order_parts','servis',
    'quality_checklists','kalite',   'quality_records','kalite',
    'transactions','muhasebe',       'progress_billings','muhasebe',
    'exchange_rates','muhasebe',
    'approvals','proje',             'departments','sistem',
    'app_users','sistem',            'roles','sistem',
    'role_permissions','sistem',     'audit_logs','sistem',
    'doc_counters','sistem'
  );
  m text;
begin
  for rec in select key as tbl from jsonb_each_text(modul_map) loop
    m := modul_map ->> rec.tbl;
    execute format('alter table %I enable row level security', rec.tbl);

    execute format('drop policy if exists p_sel_%1$s on %1$I', rec.tbl);
    execute format($f$create policy p_sel_%1$s on %1$I for select
                      to authenticated using (has_perm(%2$L,'goruntule'))$f$, rec.tbl, m);

    execute format('drop policy if exists p_ins_%1$s on %1$I', rec.tbl);
    execute format($f$create policy p_ins_%1$s on %1$I for insert
                      to authenticated with check (has_perm(%2$L,'ekle'))$f$, rec.tbl, m);

    execute format('drop policy if exists p_upd_%1$s on %1$I', rec.tbl);
    execute format($f$create policy p_upd_%1$s on %1$I for update
                      to authenticated using (has_perm(%2$L,'duzenle'))
                      with check (has_perm(%2$L,'duzenle'))$f$, rec.tbl, m);

    execute format('drop policy if exists p_del_%1$s on %1$I', rec.tbl);
    execute format($f$create policy p_del_%1$s on %1$I for delete
                      to authenticated using (has_perm(%2$L,'sil'))$f$, rec.tbl, m);
  end loop;
end $$;

-- Herkes kendi kullanıcı kaydını okuyabilsin (rol/ad soyad arayüzde lazım)
drop policy if exists p_self_read on app_users;
create policy p_self_read on app_users for select to authenticated using (id = auth.uid());

-- Puantaj: personel yalnızca kendi kaydını görsün/girsin (yönetici hepsini)
drop policy if exists p_ts_own on timesheets;
create policy p_ts_own on timesheets for select to authenticated
  using (user_id = auth.uid() or has_perm('puantaj','onayla'));

-- Döngünün ürettiği genel görüntüleme politikası p_ts_own'u OR ile deliyordu:
-- puantaj.goruntule yetkisi olan herkes (ör. saha) tüm personelin kaydını ve
-- saatlik maliyetini görebiliyordu. Genel politika kaldırılır; görünürlük
-- yalnızca p_ts_own: kendi kaydı veya 'onayla' yetkisi.
drop policy if exists p_sel_timesheets on timesheets;

-- ── Herkes KENDİ rolünü ve o rolün izin satırlarını okuyabilsin ──────────────
-- roles/role_permissions 'sistem' modülüne bağlı olduğundan admin/yönetici
-- dışındaki roller yetki matrisini hiç okuyamıyor, uygulama onlara tamamen
-- kilitleniyordu. Bu iki politika yalnızca kullanıcının kendi rol satırlarını açar.
create or replace function current_role_id() returns bigint
language sql stable security definer set search_path = public as $$
  select role_id from app_users where id = auth.uid() and aktif
$$;

drop policy if exists p_self_role on roles;
create policy p_self_role on roles for select to authenticated
  using (id = current_role_id());

drop policy if exists p_self_perms on role_permissions;
create policy p_self_perms on role_permissions for select to authenticated
  using (role_id = current_role_id());

-- ── Puantaj onayı: 'onayla' yetkisi 'duzenle' istemeden onay verebilsin ──────
-- Eski akış düz UPDATE atıyordu; RLS 'duzenle' istediği için (ör. muhasebe
-- rolünde yok) güncelleme SESSİZCE 0 satır etkiliyor, ekranda ise "Onaylandı"
-- görünüyordu. Onay bu RPC üzerinden yapılır ve yalnızca onay alanlarını değiştirir.
create or replace function puantaj_onayla(p_id bigint, p_karar text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_karar not in ('bekliyor','onaylandi','reddedildi') then
    raise exception 'Geçersiz karar: %', p_karar;
  end if;
  if not has_perm('puantaj','onayla') then
    raise exception 'Bu işlem için yetkiniz yok.' using errcode = '42501';
  end if;
  update timesheets
     set onay_durum   = p_karar::onay_durum,
         onaylayan_id = case when p_karar = 'bekliyor' then null else auth.uid() end
   where id = p_id;
  if not found then
    raise exception 'Puantaj kaydı bulunamadı (id=%).', p_id;
  end if;
end $$;
revoke all on function puantaj_onayla(bigint, text) from public;
grant execute on function puantaj_onayla(bigint, text) to authenticated;

-- Yeni auth kullanıcısı → app_users kaydı (varsayılan rol: en düşük yetki)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.app_users (id, email, ad_soyad, role_id)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'ad_soyad',
                   initcap(replace(split_part(new.email,'@',1), '.', ' '))),
          (select id from roles where kod = 'saha' limit 1))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
