-- ============================================================================
-- OMX ERP · MEVCUT KURULUMU GÜNCELLE / ONAR
--
-- `create table if not exists` yeni sütun eklemez; bu bölüm daha önce kurulmuş
-- veritabanlarını güncel şemaya taşır. Yeni kurulumda hiçbir şey yapmaz.
-- Her çalıştırmada güvenle tekrarlanabilir.
-- ============================================================================

-- ── Sonradan eklenen sütunlar ───────────────────────────────────────────────
alter table project_documents add column if not exists dosya_adi  text;
alter table project_documents add column if not exists dosya_tipi text;

-- ── Kalite formu kopyalarını temizle, ardından benzersizlik kısıtını ekle ───
-- (Betiğin eski sürümü tekrar çalıştırıldığında form kopyalıyordu.)
delete from quality_checklists q
 where exists (select 1 from quality_checklists q2
                where q2.ad = q.ad and q2.tip is not distinct from q.tip and q2.id < q.id);

do $$ begin
  alter table quality_checklists add constraint quality_checklists_ad_tip_key unique (ad, tip);
exception when duplicate_table or duplicate_object then null; end $$;

-- ── Yeni tablolar için yetki ve RLS ─────────────────────────────────────────
-- (02_rls.sql her çalıştırmada politikaları yeniden ürettiği için burada
--  yalnızca tablo düzeyi yetkiler tazelenir.)
grant select, insert, update, delete on all tables    in schema public to authenticated;
grant usage, select                on all sequences in schema public to authenticated;

-- ============================================================================
-- DOSYA DEPOSU (Storage)
-- Proje dosyaları (pdf, zip, xlsx, dwg, görsel…) 'omx-files' kovasında tutulur.
-- Kova ve erişim politikaları burada kurulur; panelden elle açmaya gerek yok.
-- ============================================================================
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage şeması yok (yerel test) — kova adımı atlandı';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('omx-files', 'omx-files', true)
  on conflict (id) do update set public = true;

  -- Politikalar: oturum açmış kullanıcı yükler/siler, dosyalar herkese okunur
  -- (public kova; bağlantıyı bilen erişir — hassas belge için kovayı private
  --  yapıp imzalı bağlantıya geçilmelidir).
  drop policy if exists omx_files_okuma     on storage.objects;
  drop policy if exists omx_files_yukleme   on storage.objects;
  drop policy if exists omx_files_guncelle  on storage.objects;
  drop policy if exists omx_files_silme     on storage.objects;

  create policy omx_files_okuma on storage.objects
    for select using (bucket_id = 'omx-files');

  create policy omx_files_yukleme on storage.objects
    for insert to authenticated with check (bucket_id = 'omx-files');

  create policy omx_files_guncelle on storage.objects
    for update to authenticated using (bucket_id = 'omx-files');

  create policy omx_files_silme on storage.objects
    for delete to authenticated using (bucket_id = 'omx-files');
end $$;
