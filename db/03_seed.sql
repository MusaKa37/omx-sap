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
on conflict do nothing;
