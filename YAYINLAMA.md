# Vercel'e Yayınlama

Üretim derlemesi Vercel'in koşullarıyla (`CI=true`) test edildi ve geçiyor.
Paket boyutu ~72 kB (gzip).

## Önce: Supabase şeması

Site yayına alınsa bile veritabanı boşsa kimse giriş yapamaz. Sırayla:

1. https://supabase.com/dashboard → proje → **SQL Editor**
2. `db/01_schema.sql` içeriğini yapıştır, **Run**
3. `db/02_rls.sql` → Run
4. `db/03_seed.sql` → Run
5. **Storage** → New bucket → ad: `omx-files`, Public işaretli
6. **Authentication → Users → Add user** ile kendini ekle
7. SQL Editor'de kendini yönetici yap:
   ```sql
   update app_users set role_id = (select id from roles where kod='admin')
    where email = 'senin@epostan';
   ```

## Yol A — Vercel CLI (git gerekmez, en hızlı)

Proje klasöründe:

```bash
npm install
npx vercel login
npx vercel            # ilk seferde soruları yanıtla (Framework: Create React App)
```

Ortam değişkenlerini ekle (bunlar `.env.local`'da ve `.gitignore`'da olduğu için
Vercel'e kendiliğinden gitmez):

```bash
npx vercel env add REACT_APP_SB_URL production
npx vercel env add REACT_APP_SB_KEY production
npx vercel --prod
```

## Yol B — GitHub üzerinden

```bash
git init -b main
git add -A
git commit -m "OMX ERP ilk sürüm"
git remote add origin https://github.com/<kullanici>/omx-erp.git
git push -u origin main
```

Sonra vercel.com → **Add New → Project** → depoyu seç. Framework otomatik
"Create React App" algılanır. **Import etmeden önce** Environment Variables
bölümüne şu ikisini ekle:

| Ad | Değer |
|---|---|
| `REACT_APP_SB_URL` | `https://qwmszizecrzcqxixebhy.supabase.co` |
| `REACT_APP_SB_KEY` | `sb_publishable_…` (Supabase → Settings → API) |

Bunları eklemezsen site "Supabase bağlantısı tanımlı değil" ekranıyla açılır.

## Yayın sonrası Supabase ayarı

Supabase → **Authentication → URL Configuration**:
- **Site URL**: Vercel'in verdiği adres (örn. `https://omx-erp.vercel.app`)
- **Redirect URLs**: aynı adres

## Notlar

- `sb_publishable_…` (Supabase → Settings → API) anahtarı istemci tarafı içindir, pakete gömülür — normaldir.
  `service_role` / secret anahtarı **asla** koda veya Vercel'e girilmez.
- `CI=true` altında uyarılar hata sayılır. Derlemeyi bozan iki nokta düzeltildi:
  `package.json` içine CRA'nın `eslintConfig` alanı eklendi, `ProjeDetay.js`
  içindeki gereksiz regex kaçışı temizlendi.
- `onizleme.html` yalnızca yerel önizleme dosyasıdır; derlemeye dahil olmaz.
