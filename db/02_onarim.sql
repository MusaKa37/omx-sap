-- ============================================================================
-- OMX ERP · ŞEMA ONARIMI (mevcut kurulumları güncelle)
--
-- `create table if not exists` yeni sütun eklemez; bu bölüm daha önce kurulmuş
-- veritabanlarını güncel şemaya taşır. Yeni kurulumda hiçbir şey yapmaz.
-- Her çalıştırmada güvenle tekrarlanabilir.
-- ============================================================================

-- ── Sonradan eklenen sütunlar ───────────────────────────────────────────────
alter table project_documents add column if not exists dosya_adi  text;
alter table project_documents add column if not exists dosya_tipi text;

-- Malzeme kartlarinda tekrar kayit korumasi; mevcut verileri degistirmez.
create unique index if not exists materials_malzeme_kodu_normalized_uidx
  on public.materials (upper(btrim(malzeme_kodu)));
create unique index if not exists materials_uretici_parca_no_normalized_uidx
  on public.materials (upper(btrim(uretici_parca_no)))
  where nullif(btrim(uretici_parca_no), '') is not null;

-- ── Kalite formu kopyalarını temizle, ardından benzersizlik kısıtını ekle ───
-- (Betiğin eski sürümü tekrar çalıştırıldığında form kopyalıyordu.)
delete from quality_checklists q
 where exists (select 1 from quality_checklists q2
                where q2.ad = q.ad and q2.tip is not distinct from q.tip and q2.id < q.id);

do $$ begin
  alter table quality_checklists add constraint quality_checklists_ad_tip_key unique (ad, tip);
exception when duplicate_table or duplicate_object then null; end $$;


-- NOT: Bu bölüm ŞEMA ile GÜVENLİK/TOHUM arasında çalışır. Tohum verisi burada
-- eklenen kısıtlara güvendiği için sıra önemlidir; başa veya sona alınmamalıdır.
