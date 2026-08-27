# OMX · Proje Yönetim Sistemi

Proje bazlı ERP. Mühendislik & revizyon, taahhüt & saha montaj, bakım & servis ve
PLC/HMI otomasyon işleri için tasarlandı.

Klasik ERP'lerden farkı ekseninde ürün değil **proje** olması: her malzeme çıkışı,
her adam-saat ve her fatura otomatik olarak bir projeye düşer. Proje kârı tahmin
edilmez, tek bir görünümden okunur.

**Stack:** React 18 (CRA) · Supabase (PostgreSQL + Auth + Storage) · Vercel

---

## Hızlı başlangıç

```bash
npm install
cp .env.ornek .env.local     # Supabase bilgilerini doldur
npm start
```

Veritabanı kurulumu ve yayınlama adımları: [YAYINLAMA.md](YAYINLAMA.md)
Mimari ve modül haritası: [OKUBENI.md](OKUBENI.md)

---

## Modüller

| Durum | Modül | Kapsam |
|---|---|---|
| ✅ | **Panel** | Aktif proje, geciken termin, ciro, net kâr, açık sipariş, kritik stok, yaklaşan bakım |
| ✅ | **Projeler** | Proje kartı, iş kırılımı (WBS), maliyet defteri, revizyonlu doküman |
| ✅ | **Müşteri & Tedarikçi** | Tek cari kartı, para birimi kırılımlı bakiye, vade, risk limiti |
| ✅ | **Malzeme Kartları** | Otomasyon kategori ağacı, üretici parça no, kritik seviye, tedarikçi fiyatları |
| ◻ | Ürün Ağacı (BOM) | Çok seviyeli ağaç, revizyon, pano etiketi, BOM → talep |
| ◻ | Satın Alma | Talep → onay → sipariş → mal kabul, kur sabitleme |
| ◻ | Depo & Stok | Çok depolu bakiye, transfer, sayım, rezerve |
| ◻ | Puantaj | Proje × faaliyet saat girişi, harcırah, yönetici onayı |
| ◻ | Servis & Ekipman | İş emri, ekipman parkı, PLC/HMI sürüm takibi, bakım takvimi |
| ◻ | Teklif · Maliyet · Muhasebe | Teklif marjı, bütçe karşılaştırması, hakediş, cari ekstre |

Tüm modüllerin veritabanı tabloları kurulu; ◻ işaretliler arayüz bekliyor.

---

## Veritabanı

`db/kurulum.sql` tek seferde her şeyi kurar (aşağıdaki üç dosyanın birleşimi +
PostgREST yetkileri). Tekrar çalıştırılabilir. Ayrı ayrı çalıştırmak isterseniz:

| # | Dosya | İçerik |
|---|---|---|
| 1 | `01_schema.sql` | 39 tablo, 5 rapor görünümü, trigger'lar, belge numarası sayacı |
| 2 | `02_onarim.sql` | Eski kurulumlara eksik sütun ve kısıtları ekler |
| 3 | `03_rls.sql` | Satır bazlı güvenlik (RLS), 8 rol × 14 modül yetki matrisi |
| 4 | `04_seed.sql` | Roller, yetkiler, malzeme kategorileri, depolar, kalite formları |
| 5 | `05_storage.sql` | `omx-files` kovası ve dosya erişim politikaları |

**Sıra önemlidir:** tohum verisi (4) onarım bölümünün (2) eklediği kısıtlara
güvenir. `kurulum.sql` bu sırayı zaten uygular.

### Otomatik akışlar

- **Depo çıkışı → proje maliyeti.** `project_id` dolu bir çıkış hareketi girildiği
  anda malzeme maliyeti proje defterine yazılır.
- **Puantaj → proje maliyeti.** Onaylanınca (saat × saatlik maliyet + harcırah +
  konaklama + yol) projeye düşer; onay geri alınınca kayıt silinir.
- **Stok bakiyesi hareketten hesaplanır.** Bakiye elle güncellenmez; transfer iki
  depoyu birlikte günceller, sayım mutlak değer yazar.
- **Belge numaraları** yıl bazlı sayaçtan gelir: `OMX-2026-0001`.

### Rapor görünümleri

`v_project_summary` · `v_company_balance` · `v_critical_stock` ·
`v_open_purchase_orders` · `v_upcoming_maintenance`

---

## Proje yapısı

```
db/                 Supabase şeması (3 dosya, sırayla çalıştırılır)
public/index.html
src/
  services/         config.js · api.js (REST katmanı, oturum, dosya, denetim)
  ui/               theme.js (token'lar) · kit.js (bileşenler) · Kabuk.js (menü)
  modules/          Panel · Projeler · ProjeDetay · Cariler · Malzeme · Yapim
onizleme.html       Örnek veriyle çalışan tek dosyalık arayüz önizlemesi
```

Modüller ham renk kodu yazmaz, `ui/theme.js` içindeki token'ları kullanır.
Form bileşenleri `ui/kit.js`'ten import edilir — modül içinde tanımlanırsa her
tuş vuruşunda odak kaybı olur.

---

## Ortam değişkenleri

`.env.local` (git'e girmez):

```
REACT_APP_SB_URL=https://xxxxx.supabase.co
REACT_APP_SB_KEY=sb_publishable_...
```

Vercel'de aynı ikisi Environment Variables bölümüne eklenir. Publishable key
istemci tarafına gömülür, bu normaldir — güvenlik sınırı RLS politikalarıdır.
`service_role` anahtarı hiçbir zaman koda veya Vercel'e girilmez.
