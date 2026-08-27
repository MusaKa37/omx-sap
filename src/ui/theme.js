// ─────────────────────────────────────────────────────────────────────────────
// OMX tasarım token'ları — tüm renk/ölçü kararları tek dosyada.
// Modüller ham hex kodu yazmaz, buradan okur.
// ─────────────────────────────────────────────────────────────────────────────
export const T = {
  renk: {
    marka:        "#1e40af",
    markaKoyu:    "#1e3a8a",
    markaAcik:    "#dbeafe",
    yan:          "#0f172a",   // sol menü zemini
    yanAcik:      "#1e293b",
    zemin:        "#f6f7f9",
    kart:         "#ffffff",
    cizgi:        "#e2e8f0",
    cizgiKoyu:    "#cbd5e1",
    metin:        "#0f172a",
    metinSoluk:   "#64748b",
    metinPasif:   "#94a3b8",
    basari:       "#16a34a",
    basariAcik:   "#dcfce7",
    uyari:        "#d97706",
    uyariAcik:    "#fef3c7",
    hata:         "#dc2626",
    hataAcik:     "#fee2e2",
    bilgi:        "#0891b2",
    bilgiAcik:    "#cffafe",
    mor:          "#7c3aed",
    morAcik:      "#ede9fe",
  },
  r: { sm: 6, md: 10, lg: 14, xl: 20, tam: 999 },
  golge: {
    sm: "0 1px 2px rgba(15,23,42,.06)",
    md: "0 4px 12px rgba(15,23,42,.08)",
    lg: "0 12px 32px rgba(15,23,42,.14)",
  },
  yazi: { xs: 11, sm: 12, md: 13, lg: 15, xl: 18, xxl: 24, hero: 30 },
};

// Proje/sipariş/iş emri durumlarının renk karşılıkları
export const DURUM_RENK = {
  teklif:        [T.renk.metinSoluk, "#f1f5f9"],
  onay_bekliyor: [T.renk.uyari, T.renk.uyariAcik],
  devam:         [T.renk.marka, T.renk.markaAcik],
  beklemede:     [T.renk.uyari, T.renk.uyariAcik],
  tamamlandi:    [T.renk.basari, T.renk.basariAcik],
  garanti:       [T.renk.mor, T.renk.morAcik],
  iptal:         [T.renk.hata, T.renk.hataAcik],
  taslak:        [T.renk.metinSoluk, "#f1f5f9"],
  gonderildi:    [T.renk.bilgi, T.renk.bilgiAcik],
  onaylandi:     [T.renk.basari, T.renk.basariAcik],
  reddedildi:    [T.renk.hata, T.renk.hataAcik],
  kismi_teslim:  [T.renk.uyari, T.renk.uyariAcik],
  teslim_alindi: [T.renk.basari, T.renk.basariAcik],
  acik:          [T.renk.hata, T.renk.hataAcik],
  planlandi:     [T.renk.bilgi, T.renk.bilgiAcik],
  kazanildi:     [T.renk.basari, T.renk.basariAcik],
  kaybedildi:    [T.renk.hata, T.renk.hataAcik],
  bekliyor:      [T.renk.uyari, T.renk.uyariAcik],
};

export const DURUM_ETIKET = {
  teklif: "Teklif", onay_bekliyor: "Onay Bekliyor", devam: "Devam Ediyor",
  beklemede: "Beklemede", tamamlandi: "Tamamlandı", iptal: "İptal", garanti: "Garanti",
  taslak: "Taslak", gonderildi: "Gönderildi", onaylandi: "Onaylandı",
  reddedildi: "Reddedildi", kismi_teslim: "Kısmi Teslim", teslim_alindi: "Teslim Alındı",
  siparise_donustu: "Siparişe Dönüştü", kapandi: "Kapandı", acik: "Açık",
  planlandi: "Planlandı", musteri_bekliyor: "Müşteri Bekliyor",
  hazirlaniyor: "Hazırlanıyor", revize: "Revize", kazanildi: "Kazanıldı",
  kaybedildi: "Kaybedildi", bekliyor: "Bekliyor", pasif: "Pasif", onayli: "Onaylı",
};

export const PROJE_TIPI_ETIKET = {
  muhendislik: "Mühendislik", revizyon: "Revizyon", taahhut_montaj: "Taahhüt / Montaj",
  bakim_servis: "Bakım & Servis", plc_hmi: "PLC / HMI Otomasyon", diger: "Diğer",
};

export const FAALIYET_ETIKET = {
  tasarim: "Tasarım", plc_yazilim: "PLC Yazılım", hmi_scada: "HMI / SCADA",
  elektrik_proje: "Elektrik Projesi", panel_imalat: "Pano İmalat",
  saha_montaj: "Saha Montaj", devreye_alma: "Devreye Alma", servis: "Servis",
  egitim: "Eğitim", dokumantasyon: "Dokümantasyon", seyahat: "Seyahat", ofis: "Ofis",
};

export const CUR_SEMBOL = { TRY: "₺", USD: "$", EUR: "€", GBP: "£" };
