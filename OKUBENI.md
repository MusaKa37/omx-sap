# OMX · Proje Yönetim Sistemi (ERP)

ESATLAS altyapısından türetilmiş, **proje bazlı** kurumsal yönetim sistemi.
Hedef iş kolları: mühendislik & revizyon, taahhüt & saha montaj, bakım & servis,
PLC / HMI otomasyon.

## Kurulum

### 1. Supabase projesi
1. supabase.com üzerinde yeni bir proje aç (bölge: Frankfurt önerilir).
2. **SQL Editor**'de sırayla çalıştır:
   - `db/kurulum.sql` — hepsi tek dosyada (önerilen; tekrar çalıştırılabilir)
   - Ayrı ayrı: `01_schema` → `02_onarim` → `03_rls` → `04_seed` → `05_storage`
4. **Authentication → Users** üzerinden kullanıcıları ekle.
   Her yeni kullanıcı otomatik olarak `app_users` tablosuna en düşük yetkiyle
   (`saha`) düşer; rolünü SQL'den veya Ayarlar ekranından yükselt:
   ```sql
   update app_users set role_id = (select id from roles where kod='admin')
    where email = 'ad.soyad@omx.com.tr';
   ```

### 2. Uygulama
```bash
npm install
# .env.local oluştur:
#   REACT_APP_SB_URL=https://xxxxx.supabase.co
#   REACT_APP_SB_KEY=eyJhbGciOi...
npm start
```

## Mimari

```
src/
  services/
    config.js   Supabase bağlantı ayarları
    api.js      REST katmanı (list/insert/update/remove), oturum, dosya, denetim kaydı
  ui/
    theme.js    Renk ve ölçü token'ları — hiçbir modül ham hex yazmaz
    kit.js      Ortak bileşenler (Tablo, Modal, Alan, Rozet, Ölçüm, İlerleme…)
    Kabuk.js    Sol menü + üst bar
  modules/
    Panel.js       Genel durum panosu
    Projeler.js    Proje listesi + form
    ProjeDetay.js  Özet · İş kırılımı · Maliyet · Doküman
    Cariler.js     Müşteri / tedarikçi / taşeron
    Malzeme.js     Malzeme ana verisi
    Yapim.js       Henüz açılmamış modüller için yer tutucu
```

## ESATLAS'tan farklar

| Konu | ESATLAS | OMX |
|---|---|---|
| Eksen | Ürün / yedek parça | **Proje** |
| Yetki | Arayüzde e-posta karşılaştırması | Veritabanında RLS + rol/modül matrisi |
| Gezinme | Ana sayfada kart ızgarası | Kalıcı sol menü |
| Stil | Her modülde tekrarlanan inline style | Tek token dosyası + ortak bileşen kütüphanesi |
| Maliyet | Yok | Depo çıkışı, puantaj ve satın alma otomatik projeye düşer |
| Kur | İşlem anında sabitleniyor | Aynı mantık korundu (`kur` sütunu + `tl_karsiligi()`) |

## Otomatik akışlar (veritabanı trigger'ları)

- **Depo çıkışı → proje maliyeti**: `stock_moves` üzerinde `project_id` dolu bir
  çıkış/sarf hareketi girildiğinde `project_costs`'a malzeme maliyeti yazılır.
- **Puantaj → proje maliyeti**: `timesheets` kaydı *onaylandığında* işçilik
  maliyeti (saat × saatlik maliyet + harcırah + konaklama + yol) projeye düşer;
  onay geri alınırsa kayıt silinir.
- **Stok bakiyesi**: `stock_balances` doğrudan güncellenmez, `stock_moves`
  tetikleyicisi hesaplar. Transfer iki depoyu birlikte günceller, sayım mutlak
  değer yazar.
- **Belge numarası**: `next_doc_no('OMX')` → `OMX-2026-0001` (yıl bazlı sayaç).

## Rapor görünümleri

| Görünüm | İçerik |
|---|---|
| `v_project_summary` | Proje bazında bütçe, gerçekleşen maliyet, gelir, net kâr, marj |
| `v_company_balance` | Cari alacak / borç / net — para birimi kırılımlı |
| `v_critical_stock` | Kritik seviyenin altına düşen malzemeler |
| `v_open_purchase_orders` | Açık siparişler ve gecikme durumu |
| `v_upcoming_maintenance` | 60 gün içindeki periyodik bakımlar |

## Sıradaki adımlar

Devrede: Panel · Projeler · Müşteri & Tedarikçi · Malzeme Kartları
Tabloları hazır, arayüzü bekleyen: Teklif · BOM · Satın Alma · Depo · Puantaj ·
Servis & Ekipman · Maliyet · Muhasebe · Ayarlar
