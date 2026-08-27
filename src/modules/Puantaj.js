// ─────────────────────────────────────────────────────────────────────────────
// PUANTAJ (adam-saat)
// Haftalık ızgara: satır = proje × faaliyet, sütun = günler. Hücreye saat
// yazılır, odaktan çıkınca kaydedilir. Onaylanan kayıt proje maliyet defterine
// işçilik olarak düşer (veritabanı tetikleyicisi).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from "react";
import { api, logAudit } from "../services/api";
import { T, FAALIYET_ETIKET } from "../ui/theme";
import { Kart, Baslik, Btn, Rozet, Tablo, Modal, Alan, Giris, Metin, Secim, Satir,
         Sekmeler, Olcum, Bos, SecimAra,
         fmtPara, fmtSayi, fmtTarih, parseSayi, bugun } from "../ui/kit";

const LOKASYON = [["ofis", "Ofis"], ["saha", "Saha"], ["uzaktan", "Uzaktan"]];
const GUNLER = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

// Verilen tarihin içinde bulunduğu haftanın pazartesisi
function haftaBasi(t) {
  const d = new Date(t);
  const gun = (d.getDay() + 6) % 7;          // pazartesi = 0
  d.setDate(d.getDate() - gun);
  d.setHours(12, 0, 0, 0);                   // yaz saati kaymalarına karşı
  return d;
}
const gunEkle = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const iso = d => d.toISOString().slice(0, 10);

export default function Puantaj({ profil, yetkiVar, goster }) {
  const [kayitlar, setKayitlar] = useState([]);
  const [projeler, setProjeler] = useState([]);
  const [kullanicilar, setKul]  = useState([]);
  const [yuk, setYuk]           = useState(true);
  const [hafta, setHafta]       = useState(() => haftaBasi(new Date()));
  const [sekme, setSekme]       = useState("hafta");
  const [satirlar, setSatirlar] = useState([]);   // ızgaradaki proje×faaliyet satırları
  const [yeniSatir, setYeni]    = useState(null);
  const [detay, setDetay]       = useState(null);
  const [kay, setKay]           = useState(false);
  const [fKisi, setFKisi]       = useState("");

  const onaylayabilir = yetkiVar("puantaj", "onayla");
  const kendiId = profil?.id;

  const gunler = useMemo(() => Array.from({ length: 7 }, (_, i) => gunEkle(hafta, i)), [hafta]);
  const haftaSonu = gunler[6];

  const yukle = useCallback(async () => {
    setYuk(true);
    try {
      const [t, p, u] = await Promise.all([
        api.list("timesheets", { select: "*,proje:projects(proje_kodu,proje_adi)",
                                 order: "tarih.desc,id.desc", limit: 2000 }),
        api.list("projects", { select: "id,proje_kodu,proje_adi,durum", order: "proje_kodu.desc", limit: 500 }),
        api.list("app_users", { select: "id,ad_soyad,email,saatlik_maliyet", eq: { aktif: true },
                                order: "ad_soyad.asc" }).catch(() => []),
      ]);
      setKayitlar(t); setProjeler(p); setKul(u);
    } catch (e) { goster("Puantaj verisi yüklenemedi: " + e.message, "hata"); }
    finally { setYuk(false); }
  }, [goster]);

  useEffect(() => { yukle(); }, [yukle]);

  const kulMap = useMemo(() => Object.fromEntries(kullanicilar.map(u => [u.id, u])), [kullanicilar]);
  // app_users listesi geçici bir hatayla boş dönerse maliyet 0 olarak DONUYORDU
  // (trigger insert anındaki değeri kullanır) — profil yedeği eklendi.
  const saatlikMaliyet = kulMap[kendiId]?.saatlik_maliyet ?? profil?.saatlik_maliyet ?? 0;

  const projeSecenek = useMemo(() => projeler
    .filter(p => !["iptal"].includes(p.durum))
    .map(p => ({ deger: p.id, etiket: `${p.proje_kodu} · ${p.proje_adi}` })), [projeler]);

  // ── Haftalık ızgara satırları ─────────────────────────────────────────────
  const haftaKayitlari = useMemo(() => kayitlar.filter(k =>
    k.user_id === kendiId && k.tarih >= iso(hafta) && k.tarih <= iso(haftaSonu)),
    [kayitlar, kendiId, hafta, haftaSonu]);

  useEffect(() => {
    // Mevcut kayıtlardan satırları türet; kullanıcının eklediği boş satırları koru
    const mevcut = {};
    haftaKayitlari.forEach(k => { mevcut[`${k.project_id}|${k.faaliyet}`] =
      { project_id: k.project_id, faaliyet: k.faaliyet }; });
    setSatirlar(eski => {
      const anahtarlar = new Set(Object.keys(mevcut));
      const korunan = eski.filter(s => !anahtarlar.has(`${s.project_id}|${s.faaliyet}`));
      return [...Object.values(mevcut), ...korunan];
    });
  }, [haftaKayitlari]);

  const hucre = (project_id, faaliyet, tarih) =>
    haftaKayitlari.find(k => String(k.project_id) === String(project_id)
      && k.faaliyet === faaliyet && k.tarih === tarih);

  async function saatKaydet(project_id, faaliyet, tarih, deger) {
    const saat = parseSayi(deger);
    const mevcut = hucre(project_id, faaliyet, tarih);
    // Geçersiz girdi ("-", harf) kaydı SİLMEMELİ — yalnızca gerçekten boşaltılan
    // hücre silme sayılır; NaN girdide uyar ve dokunma.
    if (String(deger).trim() !== "" && Number.isNaN(saat))
      return goster("Geçersiz saat değeri.", "hata");
    if (mevcut && (!saat || saat <= 0)) {
      try { await api.remove("timesheets", mevcut.id); yukle(); }
      catch (e) { goster(e.message, "hata"); }
      return;
    }
    if (!saat || saat <= 0) return;
    if (saat > 24) return goster("Bir güne 24 saatten fazla yazılamaz.", "hata");
    if (mevcut && Number(mevcut.saat) === saat) return;
    if (mevcut?.onay_durum === "onaylandi")
      return goster("Onaylanmış kayıt değiştirilemez. Yöneticinizden onayı geri almasını isteyin.", "hata");
    try {
      // Reddedilmiş kayıt düzeltilince onay kuyruğuna geri dönmeli; yoksa
      // "bekleyenler" listesine hiç düşmez ve maliyet sonsuza dek işlenmez.
      if (mevcut) await api.update("timesheets", mevcut.id,
        mevcut.onay_durum === "reddedildi"
          ? { saat, onay_durum: "bekliyor", onaylayan_id: null } : { saat });
      else await api.insert("timesheets", {
        user_id: kendiId, project_id: Number(project_id), tarih, saat,
        faaliyet, lokasyon: "ofis", onay_durum: "bekliyor",
        saatlik_maliyet: saatlikMaliyet,
      });
      yukle();
    } catch (e) { goster(e.message, "hata"); }
  }

  async function detayKaydet() {
    const f = detay;
    setKay(true);
    try {
      const govde = {
        saat: parseSayi(f.saat) || 0, mesai_saat: parseSayi(f.mesai_saat) || 0,
        lokasyon: f.lokasyon, aciklama: f.aciklama || null,
        harcirah: parseSayi(f.harcirah) || 0,
        konaklama: parseSayi(f.konaklama) || 0,
        yol: parseSayi(f.yol) || 0,
      };
      if (f.id) await api.update("timesheets", f.id,
        f.onay_durum === "reddedildi"
          ? { ...govde, onay_durum: "bekliyor", onaylayan_id: null } : govde);
      else await api.insert("timesheets", {
        ...govde, user_id: kendiId, project_id: Number(f.project_id),
        tarih: f.tarih, faaliyet: f.faaliyet, onay_durum: "bekliyor",
        saatlik_maliyet: saatlikMaliyet,
      });
      goster("Kayıt güncellendi.", "basari");
      setDetay(null); yukle();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  async function onayla(k, durum) {
    try {
      // Düz UPDATE, RLS 'duzenle' izni istediğinden (ör. muhasebe rolünde yok)
      // sessizce 0 satır etkiliyordu; onay artık yalnızca onay alanlarını
      // değiştiren security definer RPC üzerinden.
      await api.rpc("puantaj_onayla", { p_id: k.id, p_karar: durum });
      logAudit({ tablo: "timesheets", kayit_id: k.id, islem: "update",
                 aciklama: `${durum} · ${kulMap[k.user_id]?.ad_soyad || ""}` });
      goster(durum === "onaylandi"
        ? "Onaylandı — işçilik maliyeti projeye işlendi."
        : "Onay geri alındı, maliyet kaydı kaldırıldı.", "basari");
      yukle();
    } catch (e) { goster(e.message, "hata"); }
  }

  async function topluOnayla(liste) {
    setKay(true);
    try {
      for (const k of liste) {
        await api.rpc("puantaj_onayla", { p_id: k.id, p_karar: "onaylandi" });
      }
      goster(`${liste.length} kayıt onaylandı.`, "basari");
      yukle();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  // ── Toplamlar ─────────────────────────────────────────────────────────────
  const gunToplam = tarih => haftaKayitlari.filter(k => k.tarih === tarih)
    .reduce((t, k) => t + Number(k.saat || 0), 0);
  const haftaToplam = haftaKayitlari.reduce((t, k) => t + Number(k.saat || 0), 0);
  const bekleyen = kayitlar.filter(k => k.onay_durum === "bekliyor");
  const bekleyenBenim = bekleyen.filter(k => k.user_id === kendiId);

  const buAy = kayitlar.filter(k => k.user_id === kendiId && k.tarih?.slice(0, 7) === bugun().slice(0, 7));
  const buAySaat = buAy.reduce((t, k) => t + Number(k.saat || 0), 0);

  const projeAd = id => projeler.find(p => String(p.id) === String(id));

  return (
    <>
      <Baslik ust="Saha" aciklama="Proje ve faaliyet bazında adam-saat; onaylanan kayıt proje maliyetine düşer"
        sag={<Btn onClick={yukle} disabled={yuk}>{yuk ? "Yenileniyor…" : "Yenile"}</Btn>}>
        Puantaj
      </Baslik>

      <div style={{ display: "grid", gap: 12, marginBottom: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <Olcum etiket="Bu Hafta" deger={`${fmtSayi(haftaToplam, 1)} sa`} ikon="◷"
          alt={haftaToplam >= 45 ? "hafta tamam" : `${fmtSayi(Math.max(0, 45 - haftaToplam), 1)} sa eksik`} />
        <Olcum etiket="Bu Ay" deger={`${fmtSayi(buAySaat, 1)} sa`} ikon="▦"
          renk={T.renk.mor} zemin={T.renk.morAcik} />
        <Olcum etiket="Onay Bekleyen" deger={bekleyenBenim.length} ikon="⧗"
          renk={bekleyenBenim.length ? T.renk.uyari : T.renk.basari}
          zemin={bekleyenBenim.length ? T.renk.uyariAcik : T.renk.basariAcik}
          alt="kendi kayıtlarım" />
        <Olcum etiket="Saatlik Maliyetim" deger={saatlikMaliyet ? fmtPara(saatlikMaliyet) : "tanımsız"} ikon="₺"
          renk={saatlikMaliyet ? T.renk.metin : T.renk.metinPasif} zemin="#f1f5f9"
          alt={saatlikMaliyet ? "maliyet bu değerle hesaplanır" : "yönetici tanımlamalı"} />
      </div>

      <Sekmeler aktif={sekme} onDegisim={setSekme} sekmeler={[
        { anahtar: "hafta", baslik: "Haftalık Giriş" },
        { anahtar: "kayit", baslik: "Kayıtlarım", sayi: kayitlar.filter(k => k.user_id === kendiId).length },
        ...(onaylayabilir ? [{ anahtar: "onay", baslik: "Onay Bekleyenler", sayi: bekleyen.length }] : []),
      ]} />

      {/* ── HAFTALIK IZGARA ── */}
      {sekme === "hafta" && (
        <>
          <Kart pad={13} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Btn boyut="sm" onClick={() => setHafta(h => gunEkle(h, -7))}>‹ Önceki</Btn>
              <div style={{ fontSize: 14, fontWeight: 600, minWidth: 190, textAlign: "center" }}>
                {fmtTarih(iso(hafta))} – {fmtTarih(iso(haftaSonu))}
              </div>
              <Btn boyut="sm" onClick={() => setHafta(h => gunEkle(h, 7))}>Sonraki ›</Btn>
              <Btn boyut="sm" onClick={() => setHafta(haftaBasi(new Date()))}>Bu hafta</Btn>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 13 }}>Hafta toplamı <b style={{ fontSize: 15 }}>{fmtSayi(haftaToplam, 1)} sa</b></span>
                <Btn boyut="sm" tur="birincil" ikon="＋"
                  onClick={() => setYeni({ project_id: "", faaliyet: "tasarim" })}>Satır Ekle</Btn>
              </div>
            </div>
          </Kart>

          {!satirlar.length ? (
            <Kart><Bos ikon="◷" baslik="Bu hafta için satır yok"
              aciklama="“Satır Ekle” ile çalıştığınız projeyi ve faaliyeti seçin, ardından günlere saat yazın."
              eylem={<Btn tur="birincil" onClick={() => setYeni({ project_id: "", faaliyet: "tasarim" })}>Satır Ekle</Btn>} /></Kart>
          ) : (
            <div style={{ overflowX: "auto", border: `1px solid ${T.renk.cizgi}`,
              borderRadius: T.r.lg, background: "#fff" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0,
                fontSize: 13, minWidth: 860 }}>
                <thead>
                  <tr>
                    <th style={{ ...bh, textAlign: "left", minWidth: 260 }}>Proje / Faaliyet</th>
                    {gunler.map((g, i) => {
                      const bugunMu = iso(g) === bugun();
                      const haftaSonuMu = i >= 5;
                      return (
                        <th key={i} style={{ ...bh, width: 78, textAlign: "center",
                          background: bugunMu ? T.renk.markaAcik : (haftaSonuMu ? "#f6f7f9" : "#f8fafc"),
                          color: bugunMu ? T.renk.marka : T.renk.metinSoluk }}>
                          {GUNLER[i]}<br />
                          <span style={{ fontWeight: 500, fontSize: 10.5 }}>
                            {String(g.getDate()).padStart(2, "0")}.{String(g.getMonth() + 1).padStart(2, "0")}
                          </span>
                        </th>
                      );
                    })}
                    <th style={{ ...bh, width: 80, textAlign: "right" }}>Toplam</th>
                    <th style={{ ...bh, width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {satirlar.map((s, si) => {
                    const p = projeAd(s.project_id);
                    const satirToplam = gunler.reduce((t, g) =>
                      t + Number(hucre(s.project_id, s.faaliyet, iso(g))?.saat || 0), 0);
                    return (
                      <tr key={`${s.project_id}|${s.faaliyet}`}>
                        <td style={{ ...bd, borderRight: `1px solid ${T.renk.cizgi}` }}>
                          <div style={{ fontWeight: 550 }}>{p?.proje_adi || "—"}</div>
                          <div style={{ fontSize: 11.5, color: T.renk.metinPasif }}>
                            <span style={{ fontFamily: "monospace" }}>{p?.proje_kodu}</span>
                            {" · "}{FAALIYET_ETIKET[s.faaliyet] || s.faaliyet}
                          </div>
                        </td>
                        {gunler.map((g, i) => {
                          const t = iso(g);
                          const k = hucre(s.project_id, s.faaliyet, t);
                          const kilitli = k?.onay_durum === "onaylandi";
                          const ekstra = k && (Number(k.harcirah) || Number(k.konaklama) || Number(k.yol) || Number(k.mesai_saat));
                          return (
                            <td key={i} style={{ ...bd, padding: 0, textAlign: "center", position: "relative",
                              background: i >= 5 ? "#fcfcfd" : "#fff" }}>
                              <input defaultValue={k?.saat ? String(k.saat) : ""} key={`${k?.id}-${k?.saat}`}
                                disabled={kilitli}
                                onBlur={e => saatKaydet(s.project_id, s.faaliyet, t, e.target.value)}
                                onKeyDown={e => e.key === "Enter" && e.target.blur()}
                                placeholder="—"
                                style={{ width: "100%", border: "none", background: kilitli ? "#f8fafc" : "transparent",
                                  padding: "13px 6px", textAlign: "center", fontSize: 13.5,
                                  fontWeight: k?.saat ? 650 : 400, outline: "none",
                                  color: kilitli ? T.renk.basari : T.renk.metin,
                                  cursor: kilitli ? "not-allowed" : "text" }} />
                              {k && (
                                <button onClick={() => setDetay({ ...k, saat: String(k.saat ?? ""),
                                  mesai_saat: String(k.mesai_saat ?? ""), harcirah: String(k.harcirah ?? ""),
                                  konaklama: String(k.konaklama ?? ""), yol: String(k.yol ?? "") })}
                                  title="Detay: mesai, harcırah, konaklama, yol"
                                  style={{ position: "absolute", top: 2, right: 3, border: "none",
                                    background: "none", cursor: "pointer", fontSize: 9,
                                    color: ekstra ? T.renk.uyari : T.renk.cizgiKoyu }}>
                                  {ekstra ? "◆" : "◇"}
                                </button>
                              )}
                            </td>
                          );
                        })}
                        <td style={{ ...bd, textAlign: "right", fontWeight: 700,
                          background: "#fafbfc" }}>{satirToplam ? fmtSayi(satirToplam, 1) : "—"}</td>
                        <td style={{ ...bd, textAlign: "center" }}>
                          <button onClick={() => setSatirlar(l => l.filter((_, j) => j !== si))}
                            title="Satırı gizle (kayıtlar silinmez)"
                            style={{ border: "none", background: "none", cursor: "pointer",
                              color: T.renk.metinPasif, fontSize: 14 }}>×</button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td style={{ ...bd, fontWeight: 700, background: "#f8fafc" }}>Günlük toplam</td>
                    {gunler.map((g, i) => {
                      const t = gunToplam(iso(g));
                      return (
                        <td key={i} style={{ ...bd, textAlign: "center", fontWeight: 700, background: "#f8fafc",
                          color: t > 12 ? T.renk.hata : (t ? T.renk.metin : T.renk.metinPasif) }}>
                          {t ? fmtSayi(t, 1) : "—"}
                        </td>
                      );
                    })}
                    <td style={{ ...bd, textAlign: "right", fontWeight: 800, background: "#f1f5f9" }}>
                      {fmtSayi(haftaToplam, 1)}
                    </td>
                    <td style={{ ...bd, background: "#f8fafc" }} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {bekleyenBenim.length > 0 && (
            <div style={{ marginTop: 14, fontSize: 12.5, color: T.renk.metinPasif }}>
              Kayıtlarınız yönetici onayından sonra proje maliyetine işlenir.
              Şu an <b>{bekleyenBenim.length}</b> kaydınız onay bekliyor.
            </div>
          )}
        </>
      )}

      {/* ── KAYITLARIM ── */}
      {sekme === "kayit" && (
        <Tablo yukleniyor={yuk} veri={kayitlar.filter(k => k.user_id === kendiId).slice(0, 300)}
          bosMesaj="Henüz puantaj kaydınız yok"
          sutunlar={[
            { anahtar: "tarih", baslik: "Tarih", genislik: 104, render: r => fmtTarih(r.tarih) },
            { anahtar: "proje", baslik: "Proje",
              render: r => (
                <div>
                  <div style={{ fontWeight: 550 }}>{r.proje?.proje_adi || "—"}</div>
                  <div style={{ fontSize: 11.5, color: T.renk.metinPasif, fontFamily: "monospace" }}>{r.proje?.proje_kodu}</div>
                </div>
              )},
            { anahtar: "faaliyet", baslik: "Faaliyet", genislik: 150,
              render: r => FAALIYET_ETIKET[r.faaliyet] || r.faaliyet },
            { anahtar: "lokasyon", baslik: "Yer", genislik: 90,
              render: r => LOKASYON.find(([k]) => k === r.lokasyon)?.[1] || r.lokasyon },
            { anahtar: "saat", baslik: "Saat", hizala: "right", genislik: 90,
              render: r => <b>{fmtSayi(r.saat, 1)}{Number(r.mesai_saat) > 0 ? ` +${fmtSayi(r.mesai_saat, 1)}` : ""}</b> },
            { anahtar: "masraf", baslik: "Harcırah / Konaklama / Yol", hizala: "right", genislik: 200,
              render: r => {
                const t = Number(r.harcirah || 0) + Number(r.konaklama || 0) + Number(r.yol || 0);
                return t ? fmtPara(t) : <span style={{ color: T.renk.metinPasif }}>—</span>;
              }},
            { anahtar: "toplam_maliyet", baslik: "Maliyet", hizala: "right", genislik: 120,
              render: r => r.toplam_maliyet ? fmtPara(r.toplam_maliyet) : "—" },
            { anahtar: "onay_durum", baslik: "Onay", genislik: 110, render: r => <Rozet durum={r.onay_durum} /> },
          ]} />
      )}

      {/* ── ONAY BEKLEYENLER ── */}
      {sekme === "onay" && onaylayabilir && (
        <>
          <Kart pad={13} style={{ marginBottom: 14 }}>
            <Satir bosluk={10} style={{ alignItems: "center" }}>
              <div style={{ width: 240 }}>
                <Secim value={fKisi} onChange={e => setFKisi(e.target.value)}
                  secenekler={kullanicilar.map(u => [u.id, u.ad_soyad || u.email])} bos="Tüm personel" />
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12.5, color: T.renk.metinPasif }}>
                  {bekleyen.filter(k => !fKisi || k.user_id === fKisi).length} kayıt ·{" "}
                  {fmtSayi(bekleyen.filter(k => !fKisi || k.user_id === fKisi)
                    .reduce((t, k) => t + Number(k.saat || 0), 0), 1)} saat
                </span>
                <Btn tur="basari" boyut="sm" disabled={kay || !bekleyen.length}
                  onClick={() => topluOnayla(bekleyen.filter(k => !fKisi || k.user_id === fKisi))}>
                  {kay ? "Onaylanıyor…" : "Görünenleri Onayla"}</Btn>
              </div>
            </Satir>
          </Kart>

          <Tablo yukleniyor={yuk} veri={bekleyen.filter(k => !fKisi || k.user_id === fKisi)}
            bosMesaj="Onay bekleyen puantaj yok"
            sutunlar={[
              { anahtar: "user_id", baslik: "Personel", genislik: 160,
                render: r => <span style={{ fontWeight: 550 }}>{kulMap[r.user_id]?.ad_soyad || "—"}</span> },
              { anahtar: "tarih", baslik: "Tarih", genislik: 104, render: r => fmtTarih(r.tarih) },
              { anahtar: "proje", baslik: "Proje", render: r => r.proje?.proje_adi || "—" },
              { anahtar: "faaliyet", baslik: "Faaliyet", genislik: 150,
                render: r => FAALIYET_ETIKET[r.faaliyet] || r.faaliyet },
              { anahtar: "saat", baslik: "Saat", hizala: "right", genislik: 80, render: r => <b>{fmtSayi(r.saat, 1)}</b> },
              { anahtar: "masraf", baslik: "Masraf", hizala: "right", genislik: 110,
                render: r => {
                  const t = Number(r.harcirah || 0) + Number(r.konaklama || 0) + Number(r.yol || 0);
                  return t ? fmtPara(t) : "—";
                }},
              { anahtar: "tutar", baslik: "Maliyet", hizala: "right", genislik: 120,
                render: r => {
                  // Projeye işlenecek tutar kayıtta DONMUŞ saatlik_maliyet ile hesaplanır
                  // (trigger böyle yapar); güncel değeri göstermek yanıltıcıydı.
                  const m = r.saatlik_maliyet || kulMap[r.user_id]?.saatlik_maliyet || 0;
                  const t = (Number(r.saat || 0) + Number(r.mesai_saat || 0) * 1.5) * m
                    + Number(r.harcirah || 0) + Number(r.konaklama || 0) + Number(r.yol || 0);
                  return <b>{fmtPara(t)}</b>;
                }},
              { anahtar: "islem", baslik: "", genislik: 100, hizala: "center",
                render: r => <Btn boyut="sm" tur="basari" onClick={() => onayla(r, "onaylandi")}>Onayla</Btn> },
            ]} />
        </>
      )}

      {/* ── YENİ SATIR ── */}
      <Modal acik={!!yeniSatir} onKapat={() => setYeni(null)} genislik={560} baslik="Puantaj Satırı Ekle"
        aciklama="Proje ve faaliyet seçin; ardından haftanın günlerine saat yazabilirsiniz."
        altBar={<>
          <Btn onClick={() => setYeni(null)}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={() => {
            if (!yeniSatir.project_id) return goster("Proje seçilmeli.", "hata");
            const anahtar = `${yeniSatir.project_id}|${yeniSatir.faaliyet}`;
            if (satirlar.some(s => `${s.project_id}|${s.faaliyet}` === anahtar))
              return goster("Bu proje ve faaliyet zaten listede.", "hata");
            setSatirlar(l => [...l, { project_id: Number(yeniSatir.project_id), faaliyet: yeniSatir.faaliyet }]);
            setYeni(null);
          }}>Ekle</Btn>
        </>}>
        {yeniSatir && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Alan etiket="Proje" zorunlu>
              <SecimAra deger={yeniSatir.project_id} secenekler={projeSecenek}
                onSec={v => setYeni(f => ({ ...f, project_id: v }))} bos="Proje seçin" />
            </Alan>
            <Alan etiket="Faaliyet" zorunlu>
              <Secim value={yeniSatir.faaliyet} bos={false} secenekler={Object.entries(FAALIYET_ETIKET)}
                onChange={e => setYeni(f => ({ ...f, faaliyet: e.target.value }))} />
            </Alan>
          </div>
        )}
      </Modal>

      {/* ── HÜCRE DETAYI ── */}
      <Modal acik={!!detay} onKapat={() => setDetay(null)} genislik={620}
        baslik="Gün Detayı" aciklama={detay && `${fmtTarih(detay.tarih)} · ${FAALIYET_ETIKET[detay.faaliyet] || detay.faaliyet}`}
        altBar={<>
          {onaylayabilir && detay?.onay_durum === "onaylandi" &&
            <Btn tur="tehlike" onClick={() => { onayla(detay, "bekliyor"); setDetay(null); }}>Onayı Geri Al</Btn>}
          <Btn onClick={() => setDetay(null)}>Kapat</Btn>
          <Btn tur="birincil" onClick={detayKaydet}
            disabled={kay || detay?.onay_durum === "onaylandi"}>
            {kay ? "Kaydediliyor…" : "Kaydet"}</Btn>
        </>}>
        {detay && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {detay.onay_durum === "onaylandi" && (
              <div style={{ fontSize: 12.5, color: T.renk.basari, background: T.renk.basariAcik,
                padding: "9px 13px", borderRadius: 8 }}>
                Bu kayıt onaylandı ve proje maliyetine işlendi; değiştirmek için önce onayı geri alın.
              </div>
            )}
            <Satir>
              <Alan etiket="Normal Saat" genislik="140px">
                <Giris value={detay.saat} onChange={e => setDetay(f => ({ ...f, saat: e.target.value }))} />
              </Alan>
              <Alan etiket="Mesai Saat" genislik="140px" ipucu="1,5 katsayıyla hesaplanır">
                <Giris value={detay.mesai_saat} onChange={e => setDetay(f => ({ ...f, mesai_saat: e.target.value }))} />
              </Alan>
              <Alan etiket="Çalışma Yeri" genislik="160px">
                <Secim value={detay.lokasyon} bos={false} secenekler={LOKASYON}
                  onChange={e => setDetay(f => ({ ...f, lokasyon: e.target.value }))} />
              </Alan>
            </Satir>
            <Satir>
              <Alan etiket="Harcırah" genislik="150px">
                <Giris value={detay.harcirah} onChange={e => setDetay(f => ({ ...f, harcirah: e.target.value }))} placeholder="0,00" />
              </Alan>
              <Alan etiket="Konaklama" genislik="150px">
                <Giris value={detay.konaklama} onChange={e => setDetay(f => ({ ...f, konaklama: e.target.value }))} placeholder="0,00" />
              </Alan>
              <Alan etiket="Yol" genislik="150px">
                <Giris value={detay.yol} onChange={e => setDetay(f => ({ ...f, yol: e.target.value }))} placeholder="0,00" />
              </Alan>
            </Satir>
            <Alan etiket="Açıklama">
              <Metin value={detay.aciklama || ""} satir={2}
                onChange={e => setDetay(f => ({ ...f, aciklama: e.target.value }))}
                placeholder="Ne yapıldı…" />
            </Alan>
            <div style={{ background: "#f8fafc", padding: "11px 14px", borderRadius: 9, fontSize: 13,
              display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: T.renk.metinSoluk }}>Bu günün proje maliyetine katkısı</span>
              <b>{fmtPara(
                (parseSayi(detay.saat) || 0) * saatlikMaliyet
                + (parseSayi(detay.mesai_saat) || 0) * saatlikMaliyet * 1.5
                + (parseSayi(detay.harcirah) || 0) + (parseSayi(detay.konaklama) || 0) + (parseSayi(detay.yol) || 0)
              )}</b>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

const bh = {
  position: "sticky", top: 0, zIndex: 1, padding: "9px 12px", background: "#f8fafc",
  borderBottom: `1px solid ${T.renk.cizgi}`, fontSize: 10.5, fontWeight: 700,
  letterSpacing: ".05em", textTransform: "uppercase", color: T.renk.metinSoluk,
};
const bd = { padding: "9px 12px", borderBottom: `1px solid ${T.renk.cizgi}`, verticalAlign: "middle" };
