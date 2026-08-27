// ─────────────────────────────────────────────────────────────────────────────
// OMX ERP · Supabase bağlantı ayarları
//
// Yeni Supabase projesi açtıktan sonra:
//   1) Project Settings → API → Project URL ve anon public key'i kopyala
//   2) Proje kökünde .env.local dosyası oluştur:
//        REACT_APP_SB_URL=https://xxxx.supabase.co
//        REACT_APP_SB_KEY=eyJhbGciOi...
//   3) db/01_schema.sql → 02_rls.sql → 03_seed.sql dosyalarını sırayla
//      SQL Editor'de çalıştır.
// ─────────────────────────────────────────────────────────────────────────────
export const SB_URL = process.env.REACT_APP_SB_URL || "";
export const SB_KEY = process.env.REACT_APP_SB_KEY || "";

export const STORAGE_KEY = "omx_session";
export const STORAGE_BUCKET = "omx-files";

export const APP = {
  ad: "OMX",
  altAd: "Proje Yönetim Sistemi",
  surum: "0.1.0",
};
