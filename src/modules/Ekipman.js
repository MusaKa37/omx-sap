// ─────────────────────────────────────────────────────────────────────────────
// EKİPMAN PARKI (installed base)
// Müşteri sahasındaki her ekipmanın kartı: PLC/HMI kimliği, sahada çalışan
// yazılım sürümü, garanti bitişi ve periyodik bakım takvimi.
// "Müşteri arıyor, hangi sürüm yüklüydü?" sorusunun cevabı burada durur.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from "react";
import { api, logAudit } from "../services/api";
import { T } from "../ui/theme";
import { Kart, Baslik, Btn, Rozet, Tablo, Modal, Alan, Giris, Metin, Secim, Satir,
         Arama, Olcum, OnayModal, SecimAra,
         fmtTarih, eslesir } from "../ui/kit";

const DURUM = [["aktif", "Aktif"], ["arizali", "Arızalı"], ["devre_disi", "Devre Dışı"], ["hurda", "Hurda"]];
const DURUM_RENGI = {
  aktif: [T.renk.basari, T.renk.basariAcik],
  arizali: [T.renk.hata, T.renk.hataAcik],
  devre_disi: [T.renk.metinSoluk, "#f1f5f9"],
  hurda: [T.renk.metinPasif, "#f1f5f9"],
};

const BOS = {
  kod: "", ad: "", musteri_id: "", project_id: "", saha_adi: "", konum: "",
  marka: "", model: "", seri_no: "", uretim_yili: "",
  plc_marka: "", plc_model: "", hmi_marka: "", hmi_model: "",
  yazilim_versiyon: "", yazilim_tarih: "",
  devreye_alma_tarihi: "", garanti_bitis: "", bakim_periyot_ay: "",
  son_bakim: "", sonraki_bakim: "", durum: "aktif", notlar: "",
};

export default function Ekipman({ yetkiVar, goster }) {
  const [liste, setListe]       = useState([]);
  const [musteriler, setMus]    = useState([]);
  const [projeler, setProjeler] = useState([]);
  const [isEmirleri, setIsE]    = useState([]);
  const [yuk, setYuk]           = useState(true);
  const [ara, setAra]           = useState("");
  const [fMusteri, setFMus]     = useState("");
  const [fDurum, setFDurum]     = useState("");
  const [form, setForm]         = useState(null);
  const [detay, setDetay]       = useState(null);
  const [kay, setKay]           = useState(false);
  const [silinecek, setSil]     = useState(null);

  const ekleyebilir    = yetkiVar("servis", "ekle");
  const duzenleyebilir = yetkiVar("servis", "duzenle");

  const yukle = useCallback(async () => {
    setYuk(true);
    try {
      const [e, c, p, s] = await Promise.all([
        api.list("equipment", { select: "*,musteri:companies(unvan),proje:projects(proje_kodu)",
                                order: "kod.asc", limit: 2000 }),
        api.list("companies", { select: "id,kod,unvan", eq: { aktif: true },
                                in: { tip: ["musteri", "her_ikisi"] }, order: "unvan.asc", limit: 2000 }),
        api.list("projects", { select: "id,proje_kodu,proje_adi", order: "proje_kodu.desc", limit: 500 }),
        api.list("service_orders", { select: "id,is_emri_no,equipment_id,tip,durum,talep_tarihi,ariza_tanimi,yapilan_islem",
                                     order: "talep_tarihi.desc", limit: 1000 }).catch(() => []),
      ]);
      setListe(e); setMus(c); setProjeler(p); setIsE(s);
    } catch (e) { goster("Ekipman listesi yüklenemedi: " + e.message, "hata"); }
    finally { setYuk(false); }
  }, [goster]);

  useEffect(() => { yukle(); }, [yukle]);

  const bugunTs = new Date().setHours(0, 0, 0, 0);
  const kalanGun = t => t ? Math.round((new Date(t) - bugunTs) / 86400000) : null;

  const gorunen = useMemo(() => liste.filter(e => {
    if (fMusteri && String(e.musteri_id) !== String(fMusteri)) return false;
    if (fDurum && e.durum !== fDurum) return false;
    if (ara && !(eslesir(e.ad, ara) || eslesir(e.kod, ara) || eslesir(e.seri_no, ara)
              || eslesir(e.marka, ara) || eslesir(e.model, ara) || eslesir(e.saha_adi, ara)
              || eslesir(e.plc_model, ara) || eslesir(e.musteri?.unvan, ara))) return false;
    return true;
  }), [liste, ara, fMusteri, fDurum]);

  const bakimYaklasan = liste.filter(e => e.durum === "aktif" && e.sonraki_bakim
    && kalanGun(e.sonraki_bakim) <= 60);
  const bakimGeciken = bakimYaklasan.filter(e => kalanGun(e.sonraki_bakim) < 0);
  const garantideki = liste.filter(e => e.garanti_bitis && kalanGun(e.garanti_bitis) >= 0);

  async function kaydet() {
    if (!form.ad.trim()) return goster("Ekipman adı zorunlu.", "hata");
    setKay(true);
    try {
      const sayi = v => v === "" || v == null ? null : Number(v);
      const govde = {
        kod: form.kod?.trim() || null, ad: form.ad.trim(),
        musteri_id: form.musteri_id ? Number(form.musteri_id) : null,
        project_id: form.project_id ? Number(form.project_id) : null,
        saha_adi: form.saha_adi || null, konum: form.konum || null,
        marka: form.marka || null, model: form.model || null, seri_no: form.seri_no || null,
        uretim_yili: sayi(form.uretim_yili),
        plc_marka: form.plc_marka || null, plc_model: form.plc_model || null,
        hmi_marka: form.hmi_marka || null, hmi_model: form.hmi_model || null,
        yazilim_versiyon: form.yazilim_versiyon || null,
        yazilim_tarih: form.yazilim_tarih || null,
        devreye_alma_tarihi: form.devreye_alma_tarihi || null,
        garanti_bitis: form.garanti_bitis || null,
        bakim_periyot_ay: sayi(form.bakim_periyot_ay),
        son_bakim: form.son_bakim || null, sonraki_bakim: form.sonraki_bakim || null,
        durum: form.durum, notlar: form.notlar || null,
      };
      if (form.id) await api.update("equipment", form.id, govde);
      else {
        const y = await api.insert("equipment", govde);
        logAudit({ tablo: "equipment", kayit_id: y?.id, islem: "insert", aciklama: govde.ad });
      }
      goster("Ekipman kaydedildi.", "basari");
      setForm(null); yukle();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  async function sil() {
    try {
      await api.remove("equipment", silinecek.id);
      goster("Ekipman silindi.", "basari"); setSil(null); setDetay(null); yukle();
    } catch (e) { goster(e.message, "hata"); setSil(null); }
  }

  // Son bakım + periyot → sonraki bakım tarihini önerir
  function sonrakiHesapla(f) {
    if (!f.son_bakim || !f.bakim_periyot_ay) return f.sonraki_bakim;
    const d = new Date(f.son_bakim);
    d.setMonth(d.getMonth() + Number(f.bakim_periyot_ay));
    return d.toISOString().slice(0, 10);
  }

  const musteriSecenek = useMemo(() => musteriler.map(c => ({
    deger: c.id, etiket: c.unvan, alt: c.kod })), [musteriler]);
  const projeSecenek = useMemo(() => projeler.map(p => ({
    deger: p.id, etiket: `${p.proje_kodu} · ${p.proje_adi}` })), [projeler]);

  const gecmis = detay ? isEmirleri.filter(s => String(s.equipment_id) === String(detay.id)) : [];

  return (
    <>
      <Baslik ust="Ana Veri" aciklama="Müşteri sahasındaki ekipmanlar, yazılım sürümleri ve bakım takvimi"
        sag={ekleyebilir && <Btn tur="birincil" ikon="＋"
          onClick={() => setForm({ ...BOS })}>Yeni Ekipman</Btn>}>
        Ekipman Parkı
      </Baslik>

      <div style={{ display: "grid", gap: 12, marginBottom: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <Olcum etiket="Toplam Ekipman" deger={liste.length} ikon="▣" />
        <Olcum etiket="Bakımı Geçen" deger={bakimGeciken.length} ikon="⚠"
          renk={bakimGeciken.length ? T.renk.hata : T.renk.basari}
          zemin={bakimGeciken.length ? T.renk.hataAcik : T.renk.basariAcik}
          alt={bakimGeciken.length ? "gecikmiş periyodik bakım" : "takvim güncel"} />
        <Olcum etiket="60 Gün İçinde Bakım" deger={bakimYaklasan.length - bakimGeciken.length} ikon="◷"
          renk={T.renk.uyari} zemin={T.renk.uyariAcik} alt="planlanmalı" />
        <Olcum etiket="Garanti Kapsamında" deger={garantideki.length} ikon="✓"
          renk={T.renk.mor} zemin={T.renk.morAcik} />
      </div>

      {bakimGeciken.length > 0 && (
        <Kart pad={14} style={{ marginBottom: 14, borderLeft: `3px solid ${T.renk.hata}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Bakımı geciken ekipmanlar</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {bakimGeciken.map(e => (
              <button key={e.id} onClick={() => setDetay(e)}
                style={{ border: `1px solid ${T.renk.hataAcik}`, background: T.renk.hataAcik,
                  color: T.renk.hata, borderRadius: 999, padding: "5px 12px", fontSize: 12,
                  fontWeight: 550, cursor: "pointer" }}>
                {e.ad} · {Math.abs(kalanGun(e.sonraki_bakim))} gün gecikti
              </button>
            ))}
          </div>
        </Kart>
      )}

      <Kart pad={13} style={{ marginBottom: 14 }}>
        <Satir bosluk={10} style={{ alignItems: "center" }}>
          <Arama deger={ara} onDegisim={setAra} yer="Ad, kod, seri no, marka, PLC modeli, saha…" genislik={330} />
          <div style={{ width: 220 }}>
            <Secim value={fMusteri} onChange={e => setFMus(e.target.value)}
              secenekler={musteriler.map(c => [c.id, c.unvan])} bos="Tüm müşteriler" />
          </div>
          <div style={{ width: 160 }}>
            <Secim value={fDurum} onChange={e => setFDurum(e.target.value)} secenekler={DURUM} bos="Tüm durumlar" />
          </div>
          <div style={{ marginLeft: "auto", fontSize: 12.5, color: T.renk.metinPasif }}>{gorunen.length} kayıt</div>
        </Satir>
      </Kart>

      <Tablo yukleniyor={yuk} veri={gorunen} onSatirTikla={e => setDetay(e)}
        bosMesaj={ara || fMusteri || fDurum ? "Filtreye uyan ekipman yok" : "Henüz ekipman kaydı yok"}
        sutunlar={[
          { anahtar: "kod", baslik: "Kod", genislik: 110,
            render: r => <span style={{ fontFamily: "monospace", fontSize: 12, color: T.renk.marka }}>{r.kod || "—"}</span> },
          { anahtar: "ad", baslik: "Ekipman",
            render: r => (
              <div>
                <div style={{ fontWeight: 550 }}>{r.ad}</div>
                <div style={{ fontSize: 11.5, color: T.renk.metinPasif }}>
                  {[r.marka, r.model, r.seri_no && `SN ${r.seri_no}`].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
            )},
          { anahtar: "musteri", baslik: "Müşteri / Saha", genislik: 220,
            render: r => (
              <div style={{ fontSize: 12.5 }}>
                <div>{r.musteri?.unvan || "—"}</div>
                <div style={{ fontSize: 11.5, color: T.renk.metinPasif }}>{r.saha_adi || ""}</div>
              </div>
            )},
          { anahtar: "plc", baslik: "PLC / Sürüm", genislik: 170,
            render: r => (
              <div style={{ fontSize: 12.5 }}>
                <div>{[r.plc_marka, r.plc_model].filter(Boolean).join(" ") || "—"}</div>
                {r.yazilim_versiyon && <div style={{ fontSize: 11, fontFamily: "monospace",
                  color: T.renk.marka }}>{r.yazilim_versiyon}</div>}
              </div>
            )},
          { anahtar: "garanti_bitis", baslik: "Garanti", genislik: 110,
            render: r => {
              if (!r.garanti_bitis) return <span style={{ color: T.renk.metinPasif }}>—</span>;
              const k = kalanGun(r.garanti_bitis);
              return k >= 0
                ? <Rozet renk={T.renk.basari} zemin={T.renk.basariAcik}>{fmtTarih(r.garanti_bitis)}</Rozet>
                : <span style={{ fontSize: 12, color: T.renk.metinPasif }}>bitti</span>;
            }},
          { anahtar: "sonraki_bakim", baslik: "Sonraki Bakım", genislik: 140,
            render: r => {
              if (!r.sonraki_bakim) return <span style={{ color: T.renk.metinPasif }}>planlanmadı</span>;
              const k = kalanGun(r.sonraki_bakim);
              const renk = k < 0 ? T.renk.hata : k < 30 ? T.renk.uyari : T.renk.metin;
              return (
                <div style={{ fontSize: 12.5, color: renk, fontWeight: k < 30 ? 650 : 400 }}>
                  {fmtTarih(r.sonraki_bakim)}
                  <div style={{ fontSize: 11 }}>{k < 0 ? `${Math.abs(k)} gün gecikti` : `${k} gün kaldı`}</div>
                </div>
              );
            }},
          { anahtar: "durum", baslik: "Durum", genislik: 110,
            render: r => {
              const [f, b] = DURUM_RENGI[r.durum] || [T.renk.metinSoluk, "#f1f5f9"];
              return <Rozet renk={f} zemin={b}>{DURUM.find(([k]) => k === r.durum)?.[1] || r.durum}</Rozet>;
            }},
        ]} />

      {/* ── DETAY ── */}
      <Modal acik={!!detay} onKapat={() => setDetay(null)} genislik={780}
        baslik={detay?.ad} aciklama={detay && [detay.kod, detay.musteri?.unvan, detay.saha_adi].filter(Boolean).join(" · ")}
        altBar={<>
          {yetkiVar("servis", "sil") && <Btn tur="tehlike"
            onClick={() => { setSil(detay); }}>Sil</Btn>}
          <Btn onClick={() => setDetay(null)}>Kapat</Btn>
          {duzenleyebilir && <Btn tur="birincil"
            onClick={() => { setForm({ ...BOS, ...detay, musteri_id: detay.musteri_id || "",
              project_id: detay.project_id || "", uretim_yili: detay.uretim_yili ?? "",
              bakim_periyot_ay: detay.bakim_periyot_ay ?? "" }); setDetay(null); }}>Düzenle</Btn>}
        </>}>
        {detay && (
          <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            <div>
              <BolumAd>Kimlik</BolumAd>
              <Bilgi ad="Marka / Model" deger={[detay.marka, detay.model].filter(Boolean).join(" ")} />
              <Bilgi ad="Seri No" deger={detay.seri_no} />
              <Bilgi ad="Üretim Yılı" deger={detay.uretim_yili} />
              <Bilgi ad="Konum" deger={detay.konum} />
              <Bilgi ad="Devreye Alma" deger={fmtTarih(detay.devreye_alma_tarihi)} />
              <Bilgi ad="Devreye Alan Proje" deger={detay.proje?.proje_kodu} />
            </div>
            <div>
              <BolumAd>Otomasyon</BolumAd>
              <Bilgi ad="PLC" deger={[detay.plc_marka, detay.plc_model].filter(Boolean).join(" ")} />
              <Bilgi ad="HMI" deger={[detay.hmi_marka, detay.hmi_model].filter(Boolean).join(" ")} />
              <Bilgi ad="Sahadaki Yazılım Sürümü" deger={detay.yazilim_versiyon}
                renk={detay.yazilim_versiyon ? T.renk.marka : undefined} />
              <Bilgi ad="Yükleme Tarihi" deger={fmtTarih(detay.yazilim_tarih)} />
            </div>
            <div>
              <BolumAd>Bakım ve Garanti</BolumAd>
              <Bilgi ad="Garanti Bitişi" deger={fmtTarih(detay.garanti_bitis)}
                renk={detay.garanti_bitis && kalanGun(detay.garanti_bitis) >= 0 ? T.renk.basari : undefined} />
              <Bilgi ad="Bakım Periyodu" deger={detay.bakim_periyot_ay ? `${detay.bakim_periyot_ay} ay` : null} />
              <Bilgi ad="Son Bakım" deger={fmtTarih(detay.son_bakim)} />
              <Bilgi ad="Sonraki Bakım" deger={fmtTarih(detay.sonraki_bakim)}
                renk={detay.sonraki_bakim && kalanGun(detay.sonraki_bakim) < 0 ? T.renk.hata : undefined} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <BolumAd>Servis Geçmişi ({gecmis.length})</BolumAd>
              {!gecmis.length ? (
                <div style={{ fontSize: 13, color: T.renk.metinPasif, fontStyle: "italic" }}>
                  Bu ekipman için henüz iş emri açılmadı.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {gecmis.slice(0, 8).map(s => (
                    <div key={s.id} style={{ display: "flex", gap: 12, alignItems: "flex-start",
                      padding: "9px 12px", background: "#f8fafc", borderRadius: 8, fontSize: 12.5 }}>
                      <span style={{ fontFamily: "monospace", color: T.renk.marka, flexShrink: 0 }}>{s.is_emri_no}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div>{s.yapilan_islem || s.ariza_tanimi || "—"}</div>
                        <div style={{ fontSize: 11.5, color: T.renk.metinPasif }}>{fmtTarih(s.talep_tarihi)}</div>
                      </div>
                      <Rozet durum={s.durum} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            {detay.notlar && (
              <div style={{ gridColumn: "1 / -1", fontSize: 13, color: T.renk.metinSoluk,
                background: "#f8fafc", padding: 12, borderRadius: 8, whiteSpace: "pre-wrap" }}>{detay.notlar}</div>
            )}
          </div>
        )}
      </Modal>

      {/* ── FORM ── */}
      <Modal acik={!!form} onKapat={() => setForm(null)} genislik={880}
        baslik={form?.id ? "Ekipmanı Düzenle" : "Yeni Ekipman"}
        altBar={<>
          <Btn onClick={() => setForm(null)}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={kaydet} disabled={kay}>{kay ? "Kaydediliyor…" : "Kaydet"}</Btn>
        </>}>
        {form && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <BolumAd>Tanım</BolumAd>
              <Satir>
                <Alan etiket="Kod" genislik="140px">
                  <Giris value={form.kod} onChange={e => setForm(f => ({ ...f, kod: e.target.value }))} placeholder="EKP-0001" />
                </Alan>
                <Alan etiket="Ekipman Adı" zorunlu genislik="320px">
                  <Giris value={form.ad} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))}
                    placeholder="Paketleme Hattı Kontrol Panosu" />
                </Alan>
                <Alan etiket="Durum" genislik="150px">
                  <Secim value={form.durum} bos={false} secenekler={DURUM}
                    onChange={e => setForm(f => ({ ...f, durum: e.target.value }))} />
                </Alan>
              </Satir>
              <Satir style={{ marginTop: 11 }}>
                <Alan etiket="Müşteri" genislik="260px">
                  <SecimAra deger={form.musteri_id} secenekler={musteriSecenek}
                    onSec={v => setForm(f => ({ ...f, musteri_id: v }))} bos="Müşteri seçin" />
                </Alan>
                <Alan etiket="Saha / Tesis" genislik="200px">
                  <Giris value={form.saha_adi} onChange={e => setForm(f => ({ ...f, saha_adi: e.target.value }))} />
                </Alan>
                <Alan etiket="Konum" genislik="200px" ipucu="Tesis içinde nerede">
                  <Giris value={form.konum} onChange={e => setForm(f => ({ ...f, konum: e.target.value }))} />
                </Alan>
              </Satir>
            </div>

            <div>
              <BolumAd>Kimlik</BolumAd>
              <Satir>
                <Alan etiket="Marka" genislik="170px">
                  <Giris value={form.marka} onChange={e => setForm(f => ({ ...f, marka: e.target.value }))} />
                </Alan>
                <Alan etiket="Model" genislik="170px">
                  <Giris value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
                </Alan>
                <Alan etiket="Seri No" genislik="170px">
                  <Giris value={form.seri_no} onChange={e => setForm(f => ({ ...f, seri_no: e.target.value }))} />
                </Alan>
                <Alan etiket="Üretim Yılı" genislik="120px">
                  <Giris type="number" value={form.uretim_yili}
                    onChange={e => setForm(f => ({ ...f, uretim_yili: e.target.value }))} />
                </Alan>
              </Satir>
            </div>

            <div>
              <BolumAd>Otomasyon</BolumAd>
              <Satir>
                <Alan etiket="PLC Marka" genislik="160px">
                  <Giris value={form.plc_marka} onChange={e => setForm(f => ({ ...f, plc_marka: e.target.value }))}
                    placeholder="Siemens" />
                </Alan>
                <Alan etiket="PLC Model" genislik="180px">
                  <Giris value={form.plc_model} onChange={e => setForm(f => ({ ...f, plc_model: e.target.value }))}
                    placeholder="S7-1500 CPU 1511" />
                </Alan>
                <Alan etiket="HMI Marka" genislik="160px">
                  <Giris value={form.hmi_marka} onChange={e => setForm(f => ({ ...f, hmi_marka: e.target.value }))} />
                </Alan>
                <Alan etiket="HMI Model" genislik="180px">
                  <Giris value={form.hmi_model} onChange={e => setForm(f => ({ ...f, hmi_model: e.target.value }))} />
                </Alan>
              </Satir>
              <Satir style={{ marginTop: 11 }}>
                <Alan etiket="Sahadaki Yazılım Sürümü" genislik="200px"
                  ipucu="Şu an ekipmanda çalışan sürüm">
                  <Giris value={form.yazilim_versiyon}
                    onChange={e => setForm(f => ({ ...f, yazilim_versiyon: e.target.value }))} placeholder="v3.1.2" />
                </Alan>
                <Alan etiket="Yükleme Tarihi" genislik="160px">
                  <Giris type="date" value={form.yazilim_tarih || ""}
                    onChange={e => setForm(f => ({ ...f, yazilim_tarih: e.target.value }))} />
                </Alan>
                <Alan etiket="Devreye Alan Proje" genislik="280px">
                  <SecimAra deger={form.project_id} secenekler={projeSecenek}
                    onSec={v => setForm(f => ({ ...f, project_id: v }))} bos="Bağlı değil" />
                </Alan>
              </Satir>
            </div>

            <div>
              <BolumAd>Bakım ve Garanti</BolumAd>
              <Satir>
                <Alan etiket="Devreye Alma" genislik="160px">
                  <Giris type="date" value={form.devreye_alma_tarihi || ""}
                    onChange={e => setForm(f => ({ ...f, devreye_alma_tarihi: e.target.value }))} />
                </Alan>
                <Alan etiket="Garanti Bitişi" genislik="160px">
                  <Giris type="date" value={form.garanti_bitis || ""}
                    onChange={e => setForm(f => ({ ...f, garanti_bitis: e.target.value }))} />
                </Alan>
                <Alan etiket="Bakım Periyodu (ay)" genislik="160px">
                  <Giris type="number" value={form.bakim_periyot_ay}
                    onChange={e => setForm(f => {
                      const y = { ...f, bakim_periyot_ay: e.target.value };
                      return { ...y, sonraki_bakim: sonrakiHesapla(y) };
                    })} placeholder="6" />
                </Alan>
                <Alan etiket="Son Bakım" genislik="160px">
                  <Giris type="date" value={form.son_bakim || ""}
                    onChange={e => setForm(f => {
                      const y = { ...f, son_bakim: e.target.value };
                      return { ...y, sonraki_bakim: sonrakiHesapla(y) };
                    })} />
                </Alan>
                <Alan etiket="Sonraki Bakım" genislik="160px"
                  ipucu="Periyot ve son bakımdan otomatik hesaplanır">
                  <Giris type="date" value={form.sonraki_bakim || ""}
                    onChange={e => setForm(f => ({ ...f, sonraki_bakim: e.target.value }))} />
                </Alan>
              </Satir>
            </div>

            <Alan etiket="Notlar">
              <Metin value={form.notlar} satir={2}
                onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))}
                placeholder="Özel şartlar, bilinen sorunlar, müşteri talepleri…" />
            </Alan>
          </div>
        )}
      </Modal>

      <OnayModal acik={!!silinecek} tehlike onHayir={() => setSil(null)} onEvet={sil}
        baslik="Ekipman silinsin mi?"
        mesaj={`"${silinecek?.ad}" silinecek. İş emri geçmişi varsa silme engellenir; bunun yerine durumunu “Devre Dışı” yapabilirsiniz.`} />
    </>
  );
}

const BolumAd = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase",
    color: T.renk.metinPasif, marginBottom: 10 }}>{children}</div>
);

const Bilgi = ({ ad, deger, renk }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12,
    padding: "7px 0", borderBottom: `1px solid ${T.renk.cizgi}`, fontSize: 13 }}>
    <span style={{ color: T.renk.metinPasif }}>{ad}</span>
    <span style={{ fontWeight: 550, textAlign: "right", color: renk || T.renk.metin }}>{deger || "—"}</span>
  </div>
);
