-- ============================================================================
-- OMX ERP · DOSYA DEPOSU (Supabase Storage)
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
