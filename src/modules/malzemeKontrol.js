// Boş üretici parça numaraları benzersizlik kontrolüne dahil edilmez.
export const parcaAnahtari = deger => String(deger || "").trim().toUpperCase();

export function malzemeCakismalari(form, liste) {
  const digerleri = liste.filter(m => !form.id || String(m.id) !== String(form.id));
  const cakismalar = {};
  ["malzeme_kodu", "uretici_parca_no"].forEach(alan => {
    const deger = parcaAnahtari(form[alan]);
    if (!deger) return;
    const kayit = digerleri.find(m => parcaAnahtari(m[alan]) === deger);
    if (kayit) cakismalar[alan] = kayit;
  });
  return cakismalar;
}

export function cakismaMesaji(alan, kayit) {
  if (!kayit) return "";
  const etiket = alan === "malzeme_kodu" ? "Malzeme kodu" : "Üretici parça numarası";
  return `${etiket} zaten kayıtlı: ${kayit.malzeme_kodu} — ${kayit.malzeme_adi}${kayit.aktif === false ? " (pasif kart)" : ""}. Aynı parça tekrar kaydedilemez.`;
}
