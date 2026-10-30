-- Malzeme kodu VEYA dolu üretici parça numarası aynı olan ikinci kartı engeller.
-- Aktif ve pasif kartlar dahildir. Mevcut kayıtlar değiştirilmez veya silinmez.
-- Önceden çakışan kayıtlar varsa indeks oluşturma hata vererek durur;
-- bu kayıtların nasıl düzeltileceğine kullanıcı karar vermelidir.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create unique index if not exists materials_malzeme_kodu_normalized_uidx
  on public.materials (upper(btrim(malzeme_kodu)));

create unique index if not exists materials_uretici_parca_no_normalized_uidx
  on public.materials (upper(btrim(uretici_parca_no)))
  where nullif(btrim(uretici_parca_no), '') is not null;

commit;
