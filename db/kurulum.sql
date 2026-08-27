-- ============================================================================
-- OMX ERP · TEK SEFERLİK KURULUM
--
-- Supabase → SQL Editor → New query → bu dosyanın TAMAMINI yapıştır → Run.
-- 01_schema + 02_rls + 03_seed dosyalarının sırayla birleştirilmiş hâlidir;
-- ayrıca PostgREST'in tabloları görebilmesi için gereken yetkileri verir.
--
-- Tekrar çalıştırılabilir: mevcut kurulumu bozmaz (create if not exists /
-- on conflict do nothing kullanılır).
-- ============================================================================



-- ══════════════════════════════════════════════════════════════════════════
-- BÖLÜM 1/3 · ŞEMA
-- ══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- OMX ERP  ·  Supabase / PostgreSQL Şeması
-- Proje bazlı ERP: Mühendislik & Revizyon · Taahhüt & Saha Montaj ·
--                  Bakım & Servis · PLC / HMI Otomasyon
-- Dosya 1/3 : Şema (tablolar, enum'lar, indeksler, trigger'lar)
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. ENUM TİPLERİ
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  create type para_birimi   as enum ('TRY','USD','EUR','GBP');
  create type firma_tipi    as enum ('musteri','tedarikci','taseron','her_ikisi');
  create type proje_tipi    as enum ('muhendislik','revizyon','taahhut_montaj','bakim_servis','plc_hmi','diger');
  create type proje_durum   as enum ('teklif','onay_bekliyor','devam','beklemede','tamamlandi','iptal','garanti');
  create type malzeme_tipi  as enum ('hammadde','yari_mamul','ticari_mal','sarf','hizmet','ekipman');
  create type depo_tipi     as enum ('merkez','saha','arac','karantina');
  create type hareket_tipi  as enum ('giris','cikis','transfer','sayim','sarf','iade','fire');
  create type talep_durum   as enum ('taslak','onay_bekliyor','onaylandi','reddedildi','siparise_donustu','kapandi');
  create type siparis_durum as enum ('taslak','gonderildi','onaylandi','kismi_teslim','teslim_alindi','iptal');
  create type bom_durum     as enum ('taslak','onayli','pasif');
  create type teklif_durum  as enum ('hazirlaniyor','gonderildi','revize','kazanildi','kaybedildi','iptal');
  create type islem_tipi    as enum ('fatura','odeme','tahsilat','masraf','avans');
  create type islem_yonu    as enum ('alis','satis');
  create type maliyet_kaynak as enum ('malzeme','iscilik','taseron','seyahat','ekipman','nakliye','genel_gider','diger');
  create type faaliyet_tipi as enum ('tasarim','plc_yazilim','hmi_scada','elektrik_proje','panel_imalat','saha_montaj','devreye_alma','servis','egitim','dokumantasyon','seyahat','ofis');
  create type is_emri_tipi  as enum ('ariza','periyodik_bakim','revizyon','devreye_alma','garanti','kesif');
  create type is_emri_durum as enum ('acik','planlandi','devam','tamamlandi','iptal','musteri_bekliyor');
  create type onay_durum    as enum ('bekliyor','onaylandi','reddedildi');
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. KULLANICI · ROL · YETKİ
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists roles (
  id           serial primary key,
  kod          text unique not null,          -- admin, yonetici, muhendis, satinalma, depo, saha, muhasebe, satis
  ad           text not null,
  aciklama     text,
  created_at   timestamptz default now()
);

create table if not exists app_users (
  id           uuid primary key,              -- auth.users.id ile aynı
  email        text unique not null,
  ad_soyad     text,
  role_id      int references roles(id),
  departman    text,
  telefon      text,
  aktif        boolean default true,
  -- İşçilik maliyeti hesabı için (puantaj → proje maliyeti)
  saatlik_maliyet numeric(12,2) default 0,
  maliyet_cur  para_birimi default 'TRY',
  created_at   timestamptz default now()
);

create table if not exists role_permissions (
  id           serial primary key,
  role_id      int references roles(id) on delete cascade,
  modul        text not null,                 -- proje, malzeme, bom, satinalma, depo, maliyet, muhasebe...
  goruntule    boolean default false,
  ekle         boolean default false,
  duzenle      boolean default false,
  sil          boolean default false,
  onayla       boolean default false,
  unique (role_id, modul)
);

-- Her kritik değişikliğin izi (kim, ne, ne zaman, eski → yeni)
create table if not exists audit_logs (
  id           bigserial primary key,
  tablo        text not null,
  kayit_id     text,
  islem        text not null,                 -- insert / update / delete / login / export
  user_email   text,
  user_id      uuid,
  eski_deger   jsonb,
  yeni_deger   jsonb,
  aciklama     text,
  created_at   timestamptz default now()
);
create index if not exists idx_audit_created on audit_logs (created_at desc);
create index if not exists idx_audit_tablo   on audit_logs (tablo, kayit_id);

-- Genel onay mekanizması (talep, sipariş, BOM revizyonu, hakediş...)
create table if not exists approvals (
  id           bigserial primary key,
  kayit_tipi   text not null,                 -- purchase_request, purchase_order, bom, progress_billing
  kayit_id     bigint not null,
  seviye       int default 1,
  onaylayan_id uuid references app_users(id),
  durum        onay_durum default 'bekliyor',
  not_metni    text,
  karar_tarihi timestamptz,
  created_at   timestamptz default now()
);
create index if not exists idx_approvals_kayit on approvals (kayit_tipi, kayit_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. FİRMA & DEPARTMAN (ana veri)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists departments (
  id           serial primary key,
  kod          text unique not null,
  ad           text not null,
  yonetici_id  uuid references app_users(id)
);

create table if not exists companies (
  id           bigserial primary key,
  kod          text unique,                   -- CAR-0001
  unvan        text not null,
  kisa_ad      text,
  tip          firma_tipi not null default 'musteri',
  vergi_dairesi text,
  vergi_no     text,
  adres        text,
  il           text,
  ulke         text default 'Türkiye',
  telefon      text,
  email        text,
  web          text,
  ilgili_kisi  text,
  varsayilan_cur para_birimi default 'TRY',
  vade_gun     int default 0,
  risk_limiti  numeric(14,2),
  notlar       text,
  aktif        boolean default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists idx_companies_unvan on companies using gin (unvan gin_trgm_ops);
create index if not exists idx_companies_tip   on companies (tip);

create table if not exists contacts (
  id           bigserial primary key,
  company_id   bigint references companies(id) on delete cascade,
  ad_soyad     text not null,
  gorev        text,
  telefon      text,
  email        text,
  notlar       text
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. MALZEME ANA VERİSİ
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists material_categories (
  id           serial primary key,
  kod          text unique not null,
  ad           text not null,
  ust_id       int references material_categories(id)
);

create table if not exists materials (
  id           bigserial primary key,
  malzeme_kodu text unique not null,
  malzeme_adi  text not null,
  aciklama     text,
  tip          malzeme_tipi default 'ticari_mal',
  category_id  int references material_categories(id),
  alt_kategori text,
  marka        text,
  uretici      text,
  uretici_parca_no text,
  birim        text default 'Adet',
  kdv          numeric(5,2) default 20,
  min_stok     numeric(14,3) default 0,
  max_stok     numeric(14,3) default 0,
  kritik_stok  numeric(14,3) default 0,
  seri_takipli boolean default false,
  lot_takipli  boolean default false,
  raf_kodu     text,
  -- Otomasyon tarafı: PLC/HMI/sürücü kartlarında işe yarayan teknik alanlar
  teknik_ozellikler jsonb default '{}'::jsonb,
  gorseller    jsonb default '[]'::jsonb,
  dokumanlar   jsonb default '[]'::jsonb,       -- datasheet, CE, kılavuz
  alternatifler jsonb default '[]'::jsonb,      -- [{material_id, not}]
  aktif        boolean default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists idx_materials_kod  on materials using gin (malzeme_kodu gin_trgm_ops);
create index if not exists idx_materials_ad   on materials using gin (malzeme_adi  gin_trgm_ops);
create index if not exists idx_materials_cat  on materials (category_id);

-- Malzeme ⇄ Tedarikçi fiyat ilişkisi (n:n, çok fiyatlı)
create table if not exists material_suppliers (
  id           bigserial primary key,
  material_id  bigint references materials(id) on delete cascade,
  company_id   bigint references companies(id) on delete cascade,
  tedarikci_kodu text,
  fiyat        numeric(14,4),
  cur          para_birimi default 'EUR',
  temin_suresi_gun int,
  min_siparis  numeric(14,3),
  gecerlilik   date,
  tercih_sirasi int default 1,
  notlar       text,
  updated_at   timestamptz default now()
);
create index if not exists idx_matsup_mat on material_suppliers (material_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. PROJE  (sistemin merkezi)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists projects (
  id           bigserial primary key,
  proje_kodu   text unique not null,          -- OMX-2026-014
  proje_adi    text not null,
  musteri_id   bigint references companies(id),
  tip          proje_tipi not null default 'muhendislik',
  durum        proje_durum not null default 'teklif',
  sorumlu_id   uuid references app_users(id),
  department_id int references departments(id),
  -- Saha/tesis bilgisi (taahhüt ve servis işlerinde şart)
  saha_adi     text,
  saha_adres   text,
  -- Takvim
  baslangic    date,
  termin       date,
  bitis        date,
  -- Sözleşme & bütçe
  sozlesme_no  text,
  sozlesme_bedeli numeric(16,2) default 0,
  cur          para_birimi default 'TRY',
  sozlesme_kur numeric(14,6),                 -- sözleşme anındaki kur (kar/zarar sabitlenir)
  butce_malzeme  numeric(16,2) default 0,
  butce_iscilik  numeric(16,2) default 0,
  butce_taseron  numeric(16,2) default 0,
  butce_diger    numeric(16,2) default 0,
  -- İlerleme
  ilerleme_yuzde numeric(5,2) default 0,
  aciklama     text,
  etiketler    text[],
  created_by   uuid references app_users(id),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists idx_projects_musteri on projects (musteri_id);
create index if not exists idx_projects_durum   on projects (durum);
create index if not exists idx_projects_kod     on projects using gin (proje_kodu gin_trgm_ops);

-- İş kırılım yapısı (WBS): faz / görev
create table if not exists project_tasks (
  id           bigserial primary key,
  project_id   bigint references projects(id) on delete cascade,
  parent_id    bigint references project_tasks(id) on delete cascade,
  sira         int default 0,
  ad           text not null,
  faaliyet     faaliyet_tipi,
  sorumlu_id   uuid references app_users(id),
  plan_baslangic date,
  plan_bitis   date,
  plan_saat    numeric(10,2) default 0,
  gercek_saat  numeric(10,2) default 0,
  ilerleme_yuzde numeric(5,2) default 0,
  durum        text default 'planlandi',
  notlar       text,
  created_at   timestamptz default now()
);
create index if not exists idx_ptasks_proj on project_tasks (project_id);

-- Proje dokümanları — revizyon takipli.
-- Otomasyon işinde kritik: hangi sahada hangi PLC/HMI/EPLAN versiyonu yüklü?
create table if not exists project_documents (
  id           bigserial primary key,
  project_id   bigint references projects(id) on delete cascade,
  tip          text not null,                 -- sozlesme, teknik_resim, eplan, plc_program, hmi_program, test_raporu, devreye_alma, fotograf
  ad           text not null,
  revizyon     text default 'Rev.0',
  versiyon     text,                          -- PLC/HMI yazılım sürümü: v2.3.1
  dosya_url    text,
  dosya_boyut  bigint,
  sahada_yuklu boolean default false,         -- bu versiyon sahada aktif mi
  yukleme_tarihi date,
  yukleyen_id  uuid references app_users(id),
  notlar       text,
  created_at   timestamptz default now()
);
create index if not exists idx_pdocs_proj on project_documents (project_id, tip);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. TEKLİF  (proje bazlı işte her şey teklifle başlar)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists quotes (
  id           bigserial primary key,
  teklif_no    text unique not null,
  musteri_id   bigint references companies(id),
  project_id   bigint references projects(id), -- kazanılınca bağlanır
  tarih        date default current_date,
  gecerlilik   date,
  durum        teklif_durum default 'hazirlaniyor',
  revizyon     int default 0,
  cur          para_birimi default 'EUR',
  kur          numeric(14,6),
  ara_toplam   numeric(16,2) default 0,
  iskonto      numeric(16,2) default 0,
  kdv_tutar    numeric(16,2) default 0,
  genel_toplam numeric(16,2) default 0,
  tahmini_maliyet numeric(16,2) default 0,     -- teklif aşamasında kâr marjı görünsün
  teslim_suresi text,
  odeme_sarti  text,
  notlar       text,
  hazirlayan_id uuid references app_users(id),
  kayip_nedeni text,
  created_at   timestamptz default now()
);

create table if not exists quote_lines (
  id           bigserial primary key,
  quote_id     bigint references quotes(id) on delete cascade,
  sira         int default 0,
  material_id  bigint references materials(id),
  aciklama     text not null,
  miktar       numeric(14,3) default 1,
  birim        text default 'Adet',
  birim_fiyat  numeric(14,4) default 0,
  birim_maliyet numeric(14,4) default 0,
  iskonto_yuzde numeric(5,2) default 0,
  kdv_yuzde    numeric(5,2) default 20,
  toplam       numeric(16,2) default 0
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ÜRÜN AĞACI / BOM  (çok seviyeli, revizyonlu)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists boms (
  id           bigserial primary key,
  kod          text,                           -- BOM-PANO-001
  ad           text not null,
  material_id  bigint references materials(id), -- ürün bazlı BOM
  project_id   bigint references projects(id),  -- projeye özel BOM
  revizyon     text default 'Rev.A',
  durum        bom_durum default 'taslak',
  gecerli_baslangic date,
  gecerli_bitis     date,
  onaylayan_id uuid references app_users(id),
  onay_tarihi  timestamptz,
  aciklama     text,
  created_by   uuid references app_users(id),
  created_at   timestamptz default now()
);
create index if not exists idx_boms_proj on boms (project_id);
create index if not exists idx_boms_mat  on boms (material_id);

create table if not exists bom_lines (
  id           bigserial primary key,
  bom_id       bigint references boms(id) on delete cascade,
  parent_line_id bigint references bom_lines(id) on delete cascade,  -- çok seviyeli ağaç
  seviye       int default 1,
  sira         int default 0,
  material_id  bigint references materials(id),
  -- Malzeme kartı olmayan serbest kalem de girilebilsin
  serbest_aciklama text,
  miktar       numeric(14,4) default 1,
  birim        text default 'Adet',
  fire_yuzde   numeric(5,2) default 0,
  alternatif_material_id bigint references materials(id),
  -- Otomasyon: pano etiket / klemens / adres bilgisi
  etiket       text,
  notlar       text
);
create index if not exists idx_bomlines_bom on bom_lines (bom_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. SATIN ALMA
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists purchase_requests (
  id           bigserial primary key,
  talep_no     text unique not null,          -- TLP-2026-0087
  project_id   bigint references projects(id),
  bom_id       bigint references boms(id),    -- BOM'dan otomatik talep üretimi
  talep_eden_id uuid references app_users(id),
  tarih        date default current_date,
  ihtiyac_tarihi date,
  aciliyet     text default 'normal',         -- normal / acil / kritik
  durum        talep_durum default 'taslak',
  aciklama     text,
  created_at   timestamptz default now()
);
create index if not exists idx_preq_proj on purchase_requests (project_id, durum);

create table if not exists purchase_request_lines (
  id           bigserial primary key,
  request_id   bigint references purchase_requests(id) on delete cascade,
  material_id  bigint references materials(id),
  serbest_aciklama text,
  miktar       numeric(14,3) not null default 1,
  birim        text default 'Adet',
  stok_miktar  numeric(14,3) default 0,       -- talep anındaki stok (eksik hesabı)
  eksik_miktar numeric(14,3) default 0,
  ihtiyac_tarihi date,
  durum        talep_durum default 'taslak',
  notlar       text
);

create table if not exists purchase_orders (
  id           bigserial primary key,
  siparis_no   text unique not null,          -- SPR-2026-0142
  tedarikci_id bigint references companies(id),
  project_id   bigint references projects(id),
  request_id   bigint references purchase_requests(id),
  tarih        date default current_date,
  termin       date,
  durum        siparis_durum default 'taslak',
  cur          para_birimi default 'EUR',
  kur          numeric(14,6),                 -- sipariş anındaki TCMB satış kuru — sonradan değişmez
  ara_toplam   numeric(16,2) default 0,
  kdv_tutar    numeric(16,2) default 0,
  genel_toplam numeric(16,2) default 0,
  nakliye_bedeli numeric(14,2) default 0,
  gumruk_bedeli  numeric(14,2) default 0,
  odeme_sarti  text,
  teslim_yeri  text,
  notlar       text,
  created_by   uuid references app_users(id),
  created_at   timestamptz default now()
);
create index if not exists idx_po_ted  on purchase_orders (tedarikci_id);
create index if not exists idx_po_proj on purchase_orders (project_id, durum);

create table if not exists purchase_order_lines (
  id           bigserial primary key,
  order_id     bigint references purchase_orders(id) on delete cascade,
  sira         int default 0,
  material_id  bigint references materials(id),
  serbest_aciklama text,
  miktar       numeric(14,3) not null default 1,
  birim        text default 'Adet',
  birim_fiyat  numeric(14,4) default 0,
  kdv_yuzde    numeric(5,2) default 20,
  toplam       numeric(16,2) default 0,
  teslim_alinan numeric(14,3) default 0,
  termin       date,
  notlar       text
);
create index if not exists idx_poline_ord on purchase_order_lines (order_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. DEPO & STOK
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists warehouses (
  id           serial primary key,
  kod          text unique not null,
  ad           text not null,
  tip          depo_tipi default 'merkez',
  project_id   bigint references projects(id),  -- saha deposu bir projeye bağlı olabilir
  adres        text,
  sorumlu_id   uuid references app_users(id),
  aktif        boolean default true
);

-- Depo bazlı bakiye (material × warehouse benzersiz)
create table if not exists stock_balances (
  id           bigserial primary key,
  material_id  bigint not null references materials(id) on delete cascade,
  warehouse_id int    not null references warehouses(id) on delete cascade,
  raf          text,
  miktar       numeric(14,3) default 0,
  rezerve      numeric(14,3) default 0,        -- projeye ayrılmış ama çıkışı yapılmamış
  ortalama_maliyet numeric(14,4) default 0,
  maliyet_cur  para_birimi default 'TRY',
  son_hareket  timestamptz,
  unique (material_id, warehouse_id)
);
create index if not exists idx_stbal_mat on stock_balances (material_id);

create table if not exists stock_moves (
  id           bigserial primary key,
  material_id  bigint not null references materials(id),
  warehouse_id int    not null references warehouses(id),
  hedef_warehouse_id int references warehouses(id),  -- transferde
  project_id   bigint references projects(id),       -- çıkış hangi projeye
  tip          hareket_tipi not null,
  miktar       numeric(14,3) not null,
  yeni_bakiye  numeric(14,3),
  birim_maliyet numeric(14,4),
  cur          para_birimi default 'TRY',
  kur          numeric(14,6),
  lot_no       text,
  seri_no      text,
  belge_tipi   text,                            -- goods_receipt / service_order / manual
  belge_id     bigint,
  aciklama     text,
  user_email   text,
  user_id      uuid,
  created_at   timestamptz default now()
);
alter table stock_moves drop constraint if exists chk_transfer_hedef;
alter table stock_moves add constraint chk_transfer_hedef
  check (tip <> 'transfer' or hedef_warehouse_id is not null);

create index if not exists idx_stmove_mat  on stock_moves (material_id, created_at desc);
create index if not exists idx_stmove_proj on stock_moves (project_id);

-- Mal kabul (sipariş → depo girişi)
create table if not exists goods_receipts (
  id           bigserial primary key,
  kabul_no     text unique not null,
  order_id     bigint references purchase_orders(id),
  warehouse_id int references warehouses(id),
  tarih        date default current_date,
  irsaliye_no  text,
  fatura_no    text,
  teslim_alan_id uuid references app_users(id),
  kalite_kontrol boolean default false,
  notlar       text,
  created_at   timestamptz default now()
);

create table if not exists goods_receipt_lines (
  id           bigserial primary key,
  receipt_id   bigint references goods_receipts(id) on delete cascade,
  order_line_id bigint references purchase_order_lines(id),
  material_id  bigint references materials(id),
  miktar       numeric(14,3) not null,
  kabul_edilen numeric(14,3),
  red_edilen   numeric(14,3) default 0,
  lot_no       text,
  seri_no      text,
  raf          text,
  notlar       text
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. PUANTAJ / ADAM-SAAT
--    Mühendislik ve saha işlerinde en büyük maliyet kalemi işçiliktir.
--    Malzeme takip edilip adam-saat edilmezse proje kârı yanlış çıkar.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists timesheets (
  id           bigserial primary key,
  user_id      uuid references app_users(id),
  project_id   bigint references projects(id),
  task_id      bigint references project_tasks(id),
  service_order_id bigint,                     -- servis işi ise
  tarih        date not null default current_date,
  saat         numeric(6,2) not null,
  mesai_saat   numeric(6,2) default 0,
  faaliyet     faaliyet_tipi not null default 'tasarim',
  lokasyon     text default 'ofis',            -- ofis / saha / uzaktan
  aciklama     text,
  -- Saha işlerinde harcırah/konaklama ayrı maliyet kalemi
  harcirah     numeric(12,2) default 0,
  konaklama    numeric(12,2) default 0,
  yol          numeric(12,2) default 0,
  onay_durum   onay_durum default 'bekliyor',
  onaylayan_id uuid references app_users(id),
  -- Maliyet kaydı: puantaj girildiği anda geçerli saatlik maliyet donar
  saatlik_maliyet numeric(12,2) default 0,
  toplam_maliyet  numeric(14,2) default 0,
  created_at   timestamptz default now(),
  unique (user_id, project_id, tarih, faaliyet)
);
create index if not exists idx_ts_proj on timesheets (project_id, tarih);
create index if not exists idx_ts_user on timesheets (user_id, tarih);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. EKİPMAN PARKI (installed base) & SERVİS
--     Müşteri sahasındaki ekipman kartı: hangi PLC, hangi yazılım sürümü,
--     garanti ne zaman bitiyor, periyodik bakımı ne zaman.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists equipment (
  id           bigserial primary key,
  kod          text unique,
  ad           text not null,
  musteri_id   bigint references companies(id),
  project_id   bigint references projects(id), -- devreye alan proje
  saha_adi     text,
  konum        text,
  marka        text,
  model        text,
  seri_no      text,
  uretim_yili  int,
  -- Otomasyon kimliği
  plc_marka    text,
  plc_model    text,
  hmi_marka    text,
  hmi_model    text,
  yazilim_versiyon text,
  yazilim_tarih date,
  devreye_alma_tarihi date,
  garanti_bitis date,
  bakim_periyot_ay int,
  son_bakim    date,
  sonraki_bakim date,
  durum        text default 'aktif',
  teknik_ozellikler jsonb default '{}'::jsonb,
  notlar       text,
  created_at   timestamptz default now()
);
create index if not exists idx_equip_musteri on equipment (musteri_id);
create index if not exists idx_equip_bakim   on equipment (sonraki_bakim);

create table if not exists service_orders (
  id           bigserial primary key,
  is_emri_no   text unique not null,          -- SRV-2026-0231
  tip          is_emri_tipi default 'ariza',
  durum        is_emri_durum default 'acik',
  musteri_id   bigint references companies(id),
  equipment_id bigint references equipment(id),
  project_id   bigint references projects(id),
  talep_tarihi timestamptz default now(),
  planlanan_tarih date,
  baslangic    timestamptz,
  bitis        timestamptz,
  teknisyen_id uuid references app_users(id),
  ekip         text[],
  ariza_tanimi text,
  tespit       text,
  yapilan_islem text,
  sonuc        text,
  garanti_kapsaminda boolean default false,
  faturalanacak boolean default true,
  musteri_onay_ad text,
  musteri_imza_url text,
  fotograflar  jsonb default '[]'::jsonb,
  toplam_saat  numeric(10,2) default 0,
  created_at   timestamptz default now()
);
create index if not exists idx_srv_musteri on service_orders (musteri_id, durum);
create index if not exists idx_srv_equip   on service_orders (equipment_id);

create table if not exists service_order_parts (
  id           bigserial primary key,
  service_order_id bigint references service_orders(id) on delete cascade,
  material_id  bigint references materials(id),
  serbest_aciklama text,
  miktar       numeric(14,3) default 1,
  birim_fiyat  numeric(14,4) default 0,
  cur          para_birimi default 'TRY',
  warehouse_id int references warehouses(id),
  stok_dusuldu boolean default false
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. KALİTE  (FAT / SAT / devreye alma check-list'leri)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists quality_checklists (
  id           bigserial primary key,
  ad           text not null,
  tip          text default 'FAT',            -- FAT / SAT / periyodik / imalat
  proje_tipi   proje_tipi,
  maddeler     jsonb default '[]'::jsonb,     -- [{sira, madde, kriter}]
  aktif        boolean default true,
  -- Kurulum betiği tekrar çalıştırıldığında form kopyalanmasın
  unique (ad, tip)
);

create table if not exists quality_records (
  id           bigserial primary key,
  checklist_id bigint references quality_checklists(id),
  project_id   bigint references projects(id),
  service_order_id bigint references service_orders(id),
  equipment_id bigint references equipment(id),
  tarih        date default current_date,
  kontrol_eden_id uuid references app_users(id),
  sonuclar     jsonb default '[]'::jsonb,     -- [{madde, sonuc: uygun|uygun_degil|na, not}]
  genel_sonuc  text,
  uygunsuzluk_sayisi int default 0,
  rapor_url    text,
  notlar       text,
  created_at   timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. FİNANS · MUHASEBE · HAKEDİŞ
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists exchange_rates (
  tarih        date not null,
  cur          para_birimi not null,
  alis         numeric(14,6),
  satis        numeric(14,6) not null,
  kaynak       text default 'TCMB',
  primary key (tarih, cur)
);

create table if not exists transactions (
  id           bigserial primary key,
  company_id   bigint references companies(id),
  project_id   bigint references projects(id),
  tip          islem_tipi not null default 'fatura',
  yon          islem_yonu not null default 'satis',
  tarih        date not null default current_date,
  vade         date,
  belge_no     text,
  fatura_no    text,
  aciklama     text,
  tutar        numeric(16,2) not null default 0,
  cur          para_birimi default 'TRY',
  kur          numeric(14,6),                 -- işlem anındaki kur — sabitlenir
  tutar_try    numeric(16,2),                 -- kur × tutar, rapor için donmuş değer
  masraf       numeric(16,2) default 0,
  kar          numeric(16,2) default 0,
  kdv_yuzde    numeric(5,2) default 20,
  belge_url    text,                          -- fatura PDF
  odendi       boolean default false,
  notlar       text,
  created_by   uuid references app_users(id),
  created_at   timestamptz default now()
);
create index if not exists idx_tx_company on transactions (company_id, tarih desc);
create index if not exists idx_tx_proj    on transactions (project_id);
create index if not exists idx_tx_tarih   on transactions (tarih desc);

-- Hakediş / ilerleme faturası — taahhüt işlerinin olmazsa olmazı
create table if not exists progress_billings (
  id           bigserial primary key,
  hakedis_no   text unique not null,
  project_id   bigint references projects(id) on delete cascade,
  sira_no      int default 1,
  donem_bas    date,
  donem_bit    date,
  ilerleme_yuzde numeric(5,2) default 0,
  onceki_yuzde numeric(5,2) default 0,
  hakedis_tutar numeric(16,2) default 0,
  cur          para_birimi default 'TRY',
  kesinti      numeric(16,2) default 0,       -- teminat/stopaj kesintisi
  net_tutar    numeric(16,2) default 0,
  durum        text default 'taslak',         -- taslak / onaya_sunuldu / onaylandi / faturalandi
  transaction_id bigint references transactions(id),
  onaylayan_id uuid references app_users(id),
  notlar       text,
  created_at   timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. PROJE MALİYET DEFTERİ
--     Tüm modüller buraya yazar; proje kârı tek yerden okunur.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists project_costs (
  id           bigserial primary key,
  project_id   bigint references projects(id) on delete cascade,
  tarih        date not null default current_date,
  kaynak       maliyet_kaynak not null,
  -- Hangi kayıttan geldi (izlenebilirlik)
  kaynak_tablo text,                          -- stock_moves / timesheets / purchase_orders / transactions / service_orders
  kaynak_id    bigint,
  aciklama     text,
  miktar       numeric(14,3),
  birim_fiyat  numeric(14,4),
  tutar        numeric(16,2) not null default 0,
  cur          para_birimi default 'TRY',
  kur          numeric(14,6),
  tutar_try    numeric(16,2) not null default 0,
  butce_kalemi text,
  notlar       text,
  created_at   timestamptz default now()
);
create index if not exists idx_pcost_proj   on project_costs (project_id, tarih);
create index if not exists idx_pcost_kaynak on project_costs (kaynak_tablo, kaynak_id);

-- ═════════════════════════════════════════════════════════════════════════════
-- 14. YARDIMCI FONKSİYONLAR & TRIGGER'LAR
-- ═════════════════════════════════════════════════════════════════════════════

-- 14.1 Belge numarası üretici:  next_doc_no('SPR') → 'SPR-2026-0001'
create table if not exists doc_counters (
  prefix       text not null,
  yil          int  not null,
  sayac        int  not null default 0,
  primary key (prefix, yil)
);

create or replace function next_doc_no(p_prefix text)
returns text language plpgsql as $$
declare v_yil int := extract(year from current_date)::int; v_no int;
begin
  insert into doc_counters (prefix, yil, sayac) values (p_prefix, v_yil, 1)
    on conflict (prefix, yil) do update set sayac = doc_counters.sayac + 1
    returning sayac into v_no;
  return p_prefix || '-' || v_yil || '-' || lpad(v_no::text, 4, '0');
end $$;

-- 14.2 updated_at otomatik
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$ declare t text;
begin
  foreach t in array array['companies','materials','projects','material_suppliers'] loop
    execute format('drop trigger if exists trg_touch_%1$s on %1$I', t);
    execute format('create trigger trg_touch_%1$s before update on %1$I
                    for each row execute function touch_updated_at()', t);
  end loop;
end $$;

-- 14.3 Kur çevrimi: belirli tarihteki TCMB satış kuruyla TL karşılığı
create or replace function tl_karsiligi(p_tutar numeric, p_cur para_birimi, p_tarih date)
returns numeric language plpgsql stable as $$
declare v_kur numeric;
begin
  if p_cur = 'TRY' then return p_tutar; end if;
  select satis into v_kur from exchange_rates
   where cur = p_cur and tarih <= p_tarih order by tarih desc limit 1;
  return round(p_tutar * coalesce(v_kur, 1), 2);
end $$;

-- 14.4 Stok hareketi → bakiye güncelle (tek doğruluk kaynağı hareket tablosudur)
create or replace function apply_stock_move() returns trigger language plpgsql as $$
declare v_delta numeric;
begin
  v_delta := case new.tip
    when 'giris'  then  new.miktar
    when 'iade'   then  new.miktar
    when 'cikis'  then -new.miktar
    when 'sarf'   then -new.miktar
    when 'fire'   then -new.miktar
    when 'sayim'  then  0
    when 'transfer' then -new.miktar
    else 0 end;

  insert into stock_balances (material_id, warehouse_id, miktar, son_hareket)
  values (new.material_id, new.warehouse_id,
          case when new.tip = 'sayim' then new.miktar else v_delta end, now())
  on conflict (material_id, warehouse_id)
  do update set miktar = case when new.tip = 'sayim' then new.miktar
                              else stock_balances.miktar + v_delta end,
                son_hareket = now();

  if new.tip = 'transfer' and new.hedef_warehouse_id is not null then
    insert into stock_balances (material_id, warehouse_id, miktar, son_hareket)
    values (new.material_id, new.hedef_warehouse_id, new.miktar, now())
    on conflict (material_id, warehouse_id)
    do update set miktar = stock_balances.miktar + new.miktar, son_hareket = now();
  end if;

  -- Projeye çıkan malzeme doğrudan proje maliyetine yazılır
  if new.project_id is not null and new.tip in ('cikis','sarf') then
    insert into project_costs (project_id, tarih, kaynak, kaynak_tablo, kaynak_id,
                               aciklama, miktar, birim_fiyat, tutar, cur, kur, tutar_try)
    values (new.project_id, current_date, 'malzeme', 'stock_moves', new.id,
            coalesce(new.aciklama, 'Depo çıkışı'), new.miktar,
            coalesce(new.birim_maliyet,0), coalesce(new.birim_maliyet,0) * new.miktar,
            coalesce(new.cur,'TRY'), new.kur,
            tl_karsiligi(coalesce(new.birim_maliyet,0) * new.miktar, coalesce(new.cur,'TRY'), current_date));
  end if;
  return new;
end $$;

drop trigger if exists trg_stock_move on stock_moves;
create trigger trg_stock_move after insert on stock_moves
  for each row execute function apply_stock_move();

-- 14.5 Puantaj → proje maliyeti (onaylandığında)
create or replace function apply_timesheet_cost() returns trigger language plpgsql as $$
declare v_tutar numeric;
begin
  if new.project_id is null then return new; end if;
  v_tutar := (coalesce(new.saat,0) + coalesce(new.mesai_saat,0) * 1.5) * coalesce(new.saatlik_maliyet,0)
             + coalesce(new.harcirah,0) + coalesce(new.konaklama,0) + coalesce(new.yol,0);
  new.toplam_maliyet := v_tutar;

  delete from project_costs where kaynak_tablo = 'timesheets' and kaynak_id = new.id;
  if new.onay_durum = 'onaylandi' then
    insert into project_costs (project_id, tarih, kaynak, kaynak_tablo, kaynak_id,
                               aciklama, miktar, birim_fiyat, tutar, cur, tutar_try)
    values (new.project_id, new.tarih, 'iscilik', 'timesheets', new.id,
            coalesce(new.aciklama, new.faaliyet::text), new.saat, new.saatlik_maliyet,
            v_tutar, 'TRY', v_tutar);
  end if;
  return new;
end $$;

drop trigger if exists trg_timesheet_cost on timesheets;
create trigger trg_timesheet_cost before insert or update on timesheets
  for each row execute function apply_timesheet_cost();

-- ═════════════════════════════════════════════════════════════════════════════
-- 15. RAPOR GÖRÜNÜMLERİ
-- ═════════════════════════════════════════════════════════════════════════════

-- Proje kâr/zarar özeti: bütçe · gerçekleşen maliyet · faturalanan gelir
create or replace view v_project_summary
with (security_invoker = on) as
select
  p.id, p.proje_kodu, p.proje_adi, p.tip, p.durum, p.termin, p.ilerleme_yuzde,
  c.unvan as musteri,
  p.sozlesme_bedeli, p.cur,
  tl_karsiligi(p.sozlesme_bedeli, p.cur, coalesce(p.baslangic, current_date)) as sozlesme_try,
  (p.butce_malzeme + p.butce_iscilik + p.butce_taseron + p.butce_diger)      as butce_toplam,
  coalesce(mc.malzeme,0)  as maliyet_malzeme,
  coalesce(mc.iscilik,0)  as maliyet_iscilik,
  coalesce(mc.taseron,0)  as maliyet_taseron,
  coalesce(mc.diger,0)    as maliyet_diger,
  coalesce(mc.toplam,0)   as maliyet_toplam,
  coalesce(gl.gelir,0)    as faturalanan_gelir,
  coalesce(gl.gelir,0) - coalesce(mc.toplam,0) as net_kar,
  case when coalesce(gl.gelir,0) > 0
       then round((coalesce(gl.gelir,0) - coalesce(mc.toplam,0)) / gl.gelir * 100, 2)
       else null end as kar_marji_yuzde
from projects p
left join companies c on c.id = p.musteri_id
left join (
  select project_id,
         sum(tutar_try) filter (where kaynak = 'malzeme') as malzeme,
         sum(tutar_try) filter (where kaynak = 'iscilik') as iscilik,
         sum(tutar_try) filter (where kaynak = 'taseron') as taseron,
         sum(tutar_try) filter (where kaynak not in ('malzeme','iscilik','taseron')) as diger,
         sum(tutar_try) as toplam
  from project_costs group by project_id
) mc on mc.project_id = p.id
left join (
  select project_id, sum(coalesce(tutar_try, tutar)) as gelir
  from transactions where tip = 'fatura' and yon = 'satis' group by project_id
) gl on gl.project_id = p.id;

-- Cari bakiye (alacak / borç, para birimi kırılımlı)
create or replace view v_company_balance
with (security_invoker = on) as
select c.id, c.kod, c.unvan, c.tip, t.cur,
  sum(case when t.yon='satis' and t.tip='fatura' then t.tutar
           when t.yon='alis'  and t.tip in ('odeme','tahsilat') then t.tutar else 0 end) as alacak,
  sum(case when t.yon='alis'  and t.tip='fatura' then t.tutar
           when t.yon='satis' and t.tip in ('odeme','tahsilat') then t.tutar else 0 end) as borc,
  sum(case when t.yon='satis' and t.tip='fatura' then t.tutar
           when t.yon='alis'  and t.tip in ('odeme','tahsilat') then t.tutar
           when t.yon='alis'  and t.tip='fatura' then -t.tutar
           when t.yon='satis' and t.tip in ('odeme','tahsilat') then -t.tutar else 0 end) as net
from companies c
left join transactions t on t.company_id = c.id
group by c.id, c.kod, c.unvan, c.tip, t.cur;

-- Kritik stok
create or replace view v_critical_stock
with (security_invoker = on) as
select m.id, m.malzeme_kodu, m.malzeme_adi, m.birim, m.kritik_stok, m.min_stok,
       coalesce(sum(sb.miktar),0) as toplam_stok,
       coalesce(sum(sb.rezerve),0) as rezerve
from materials m
left join stock_balances sb on sb.material_id = m.id
where m.aktif and m.kritik_stok > 0
group by m.id
having coalesce(sum(sb.miktar),0) <= m.kritik_stok;

-- Açık satın alma siparişleri
create or replace view v_open_purchase_orders
with (security_invoker = on) as
select po.id, po.siparis_no, po.tarih, po.termin, po.durum,
       c.unvan as tedarikci, p.proje_kodu, po.genel_toplam, po.cur,
       (po.termin < current_date) as gecikmis
from purchase_orders po
left join companies c on c.id = po.tedarikci_id
left join projects  p on p.id = po.project_id
where po.durum in ('gonderildi','onaylandi','kismi_teslim');

-- Yaklaşan periyodik bakımlar (servis modülü için hatırlatıcı)
create or replace view v_upcoming_maintenance
with (security_invoker = on) as
select e.id, e.kod, e.ad, e.marka, e.model, e.seri_no,
       c.unvan as musteri, e.saha_adi, e.sonraki_bakim, e.garanti_bitis,
       (e.sonraki_bakim - current_date) as kalan_gun
from equipment e
left join companies c on c.id = e.musteri_id
where e.durum = 'aktif' and e.sonraki_bakim is not null
  and e.sonraki_bakim <= current_date + interval '60 days';


-- ══════════════════════════════════════════════════════════════════════════
-- BÖLÜM 2/3 · GÜVENLİK (RLS)
-- ══════════════════════════════════════════════════════════════════════════

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

-- Yeni auth kullanıcısı → app_users kaydı (varsayılan rol: en düşük yetki)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.app_users (id, email, ad_soyad, role_id)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'ad_soyad', split_part(new.email,'@',1)),
          (select id from roles where kod = 'saha' limit 1))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();


-- ══════════════════════════════════════════════════════════════════════════
-- BÖLÜM 3/3 · BAŞLANGIÇ VERİSİ
-- ══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- OMX ERP · Dosya 3/3 : Başlangıç verisi (roller, yetkiler, kategoriler, depolar)
-- ============================================================================

-- ── ROLLER ───────────────────────────────────────────────────────────────────
insert into roles (kod, ad, aciklama) values
  ('admin',     'Sistem Yöneticisi', 'Tam yetki'),
  ('yonetici',  'Yönetici',          'Tüm modülleri görür, onay verir'),
  ('muhendis',  'Mühendis',          'Proje, BOM, doküman, puantaj'),
  ('satinalma', 'Satın Alma',        'Talep, sipariş, tedarikçi, fiyat'),
  ('depo',      'Depo Sorumlusu',    'Stok, mal kabul, sevkiyat'),
  ('saha',      'Saha / Teknisyen',  'İş emri, servis raporu, kendi puantajı'),
  ('muhasebe',  'Muhasebe',          'Cari, fatura, ödeme, hakediş'),
  ('satis',     'Satış',             'Teklif, müşteri, sipariş')
on conflict (kod) do nothing;

-- ── ROL YETKİLERİ ────────────────────────────────────────────────────────────
-- (goruntule, ekle, duzenle, sil, onayla)
insert into role_permissions (role_id, modul, goruntule, ekle, duzenle, sil, onayla)
select r.id, x.modul, x.g, x.e, x.d, x.s, x.o
from (values
  -- YÖNETİCİ: her şeyi görür ve onaylar, silme sınırlı
  ('yonetici','proje',true,true,true,true,true),   ('yonetici','cari',true,true,true,true,true),
  ('yonetici','malzeme',true,true,true,true,true), ('yonetici','bom',true,true,true,true,true),
  ('yonetici','satinalma',true,true,true,true,true),('yonetici','depo',true,true,true,true,true),
  ('yonetici','maliyet',true,true,true,true,true), ('yonetici','muhasebe',true,true,true,true,true),
  ('yonetici','puantaj',true,true,true,true,true), ('yonetici','servis',true,true,true,true,true),
  ('yonetici','kalite',true,true,true,true,true),  ('yonetici','dokuman',true,true,true,true,true),
  ('yonetici','satis',true,true,true,true,true),   ('yonetici','sistem',true,false,false,false,false),
  -- MÜHENDİS
  ('muhendis','proje',true,true,true,false,false), ('muhendis','cari',true,false,false,false,false),
  ('muhendis','malzeme',true,true,true,false,false),('muhendis','bom',true,true,true,true,false),
  ('muhendis','satinalma',true,true,false,false,false),('muhendis','depo',true,false,false,false,false),
  ('muhendis','maliyet',true,false,false,false,false),('muhendis','puantaj',true,true,true,false,false),
  ('muhendis','dokuman',true,true,true,false,false),('muhendis','kalite',true,true,true,false,false),
  ('muhendis','servis',true,true,true,false,false),
  -- SATIN ALMA
  ('satinalma','satinalma',true,true,true,true,false),('satinalma','cari',true,true,true,false,false),
  ('satinalma','malzeme',true,true,true,false,false),('satinalma','proje',true,false,false,false,false),
  ('satinalma','depo',true,false,false,false,false),('satinalma','bom',true,false,false,false,false),
  ('satinalma','maliyet',true,false,false,false,false),
  -- DEPO
  ('depo','depo',true,true,true,false,false),      ('depo','malzeme',true,false,false,false,false),
  ('depo','satinalma',true,false,true,false,false),('depo','proje',true,false,false,false,false),
  -- SAHA / TEKNİSYEN
  ('saha','servis',true,true,true,false,false),    ('saha','puantaj',true,true,true,false,false),
  ('saha','proje',true,false,false,false,false),   ('saha','malzeme',true,false,false,false,false),
  ('saha','depo',true,false,false,false,false),    ('saha','kalite',true,true,false,false,false),
  ('saha','dokuman',true,false,false,false,false),
  -- MUHASEBE
  ('muhasebe','muhasebe',true,true,true,true,false),('muhasebe','cari',true,true,true,false,false),
  ('muhasebe','maliyet',true,false,false,false,false),('muhasebe','proje',true,false,false,false,false),
  ('muhasebe','satinalma',true,false,false,false,false),('muhasebe','puantaj',true,false,false,false,true),
  -- SATIŞ
  ('satis','satis',true,true,true,true,false),     ('satis','cari',true,true,true,false,false),
  ('satis','proje',true,true,true,false,false),    ('satis','malzeme',true,false,false,false,false),
  ('satis','muhasebe',true,false,false,false,false)
) as x(rol,modul,g,e,d,s,o)
join roles r on r.kod = x.rol
on conflict (role_id, modul) do nothing;

-- ── MALZEME KATEGORİLERİ (otomasyon / elektrik / mekanik) ────────────────────
insert into material_categories (kod, ad) values
  ('OTM','Otomasyon'),      ('ELK','Elektrik'),      ('MEK','Mekanik'),
  ('PNO','Pnömatik'),       ('HID','Hidrolik'),      ('KBL','Kablo ve Kanal'),
  ('PAN','Pano Malzemesi'), ('SAR','Sarf Malzeme'),  ('YZL','Yazılım / Lisans'),
  ('HZM','Hizmet / Taşeron'),('EKP','Ekipman')
on conflict (kod) do nothing;

insert into material_categories (kod, ad, ust_id)
select v.kod, v.ad, p.id from (values
  ('OTM-PLC','PLC ve I/O Modülü','OTM'),      ('OTM-HMI','HMI / Operatör Paneli','OTM'),
  ('OTM-SRV','Servo / Sürücü','OTM'),         ('OTM-SNS','Sensör','OTM'),
  ('OTM-NET','Endüstriyel Haberleşme','OTM'), ('OTM-SAF','Güvenlik (Safety)','OTM'),
  ('ELK-SLT','Şalt Malzemesi','ELK'),         ('ELK-TRF','Trafo / Güç Kaynağı','ELK'),
  ('ELK-MTR','Motor','ELK'),                  ('ELK-AYD','Aydınlatma','ELK'),
  ('PAN-KAB','Pano Kabini','PAN'),            ('PAN-KLM','Klemens ve Bara','PAN'),
  ('PAN-KLM2','Pano İçi Aksesuar','PAN'),
  ('KBL-ENJ','Enerji Kablosu','KBL'),         ('KBL-SNY','Sinyal / Data Kablosu','KBL'),
  ('MEK-KNS','Konstrüksiyon','MEK'),          ('MEK-BGL','Bağlantı Elemanı','MEK')
) as v(kod, ad, ust)
join material_categories p on p.kod = v.ust
on conflict (kod) do nothing;

-- ── DEPOLAR ──────────────────────────────────────────────────────────────────
insert into warehouses (kod, ad, tip) values
  ('MRK','Merkez Depo','merkez'),
  ('PAN','Pano Atölyesi','merkez'),
  ('KAR','Karantina / Red','karantina')
on conflict (kod) do nothing;

-- ── DEPARTMANLAR ─────────────────────────────────────────────────────────────
insert into departments (kod, ad) values
  ('MUH','Mühendislik'), ('OTO','Otomasyon'), ('SAH','Saha Operasyonları'),
  ('SAT','Satın Alma'),  ('TIC','Ticaret / Satış'), ('FIN','Finans & Muhasebe')
on conflict (kod) do nothing;

-- ── KALİTE CHECK-LİST ŞABLONLARI ─────────────────────────────────────────────
insert into quality_checklists (ad, tip, maddeler) values
 ('Pano İmalat Kontrol', 'imalat', '[
   {"sira":1,"madde":"Kabin ölçüleri ve montaj plakası projeye uygun","kriter":"görsel"},
   {"sira":2,"madde":"Klemens etiketleme projeye uygun","kriter":"görsel"},
   {"sira":3,"madde":"Kablo kesitleri ve renk kodu doğru","kriter":"görsel"},
   {"sira":4,"madde":"Topraklama süreklilik testi","kriter":"< 0,1 Ω"},
   {"sira":5,"madde":"İzolasyon direnci ölçümü","kriter":"> 1 MΩ"},
   {"sira":6,"madde":"Sigorta / termik ayar değerleri","kriter":"proje değeri"},
   {"sira":7,"madde":"Etiket ve uyarı levhaları takılı","kriter":"görsel"}
 ]'::jsonb),
 ('FAT - Fabrika Kabul Testi', 'FAT', '[
   {"sira":1,"madde":"PLC programı yüklü ve doğru sürüm","kriter":"sürüm no"},
   {"sira":2,"madde":"HMI ekranları eksiksiz","kriter":"görsel"},
   {"sira":3,"madde":"Tüm dijital girişler simüle edilip doğrulandı","kriter":"I/O listesi"},
   {"sira":4,"madde":"Tüm analog girişler kalibre edildi","kriter":"±%1"},
   {"sira":5,"madde":"Alarm listesi test edildi","kriter":"tam liste"},
   {"sira":6,"madde":"Acil stop devresi ve safety röle testi","kriter":"fonksiyonel"},
   {"sira":7,"madde":"Haberleşme (Profinet/Modbus) testi","kriter":"hatasız"}
 ]'::jsonb),
 ('SAT - Saha Kabul Testi', 'SAT', '[
   {"sira":1,"madde":"Saha montajı proje ve şartnameye uygun","kriter":"görsel"},
   {"sira":2,"madde":"Enerji verme öncesi kontroller tamam","kriter":"check-list"},
   {"sira":3,"madde":"Motor yön kontrolleri","kriter":"fonksiyonel"},
   {"sira":4,"madde":"Otomatik çevrim testi","kriter":"fonksiyonel"},
   {"sira":5,"madde":"Emniyet fonksiyonları saha testi","kriter":"fonksiyonel"},
   {"sira":6,"madde":"Operatör eğitimi verildi","kriter":"imzalı tutanak"},
   {"sira":7,"madde":"Yedekleme (PLC/HMI) müşteriye teslim","kriter":"teslim tutanağı"}
 ]'::jsonb),
 ('Periyodik Bakım', 'periyodik', '[
   {"sira":1,"madde":"Pano içi temizlik ve toz alma","kriter":"görsel"},
   {"sira":2,"madde":"Klemens sıkma kontrolü","kriter":"tork"},
   {"sira":3,"madde":"Fan ve filtre kontrolü","kriter":"görsel"},
   {"sira":4,"madde":"Yedekleme alındı (PLC/HMI)","kriter":"dosya"},
   {"sira":5,"madde":"Alarm geçmişi incelendi","kriter":"rapor"},
   {"sira":6,"madde":"UPS / akü durumu","kriter":"ölçüm"}
 ]'::jsonb)
on conflict (ad, tip) do nothing;

-- ============================================================================
-- YETKİLER — PostgREST'in (REST API) tabloları görebilmesi için.
-- Satır bazlı erişimi yine RLS politikaları belirler; bu yalnızca tablo düzeyi.
-- ============================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables    in schema public to authenticated;
grant usage, select                on all sequences in schema public to authenticated;
grant execute                      on all functions in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables    to authenticated;
alter default privileges in schema public
  grant usage, select                  on sequences to authenticated;

-- ============================================================================
-- KURULUM ÖZETİ
-- ============================================================================
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE')          as tablo,
  (select count(*) from information_schema.views
    where table_schema='public')                                      as gorunum,
  (select count(*) from roles)                                        as rol,
  (select count(*) from role_permissions)                             as yetki_kaydi,
  (select count(*) from material_categories)                          as malzeme_kategorisi,
  (select count(*) from warehouses)                                   as depo,
  (select count(*) from quality_checklists)                           as kalite_formu;
