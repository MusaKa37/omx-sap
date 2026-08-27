// ─────────────────────────────────────────────────────────────────────────────
// MALZEME KARTLARI — sistemin ana verisi.
// BOM, satın alma, depo ve maliyet hep bu karta bağlanır.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from "react";
import { api, logAudit } from "../services/api";
import { T } from "../ui/theme";
import { Kart, Baslik, Btn, Rozet, Tablo, Modal, Alan, Giris, Metin, Secim, Satir,
         Arama, Sekmeler, Olcum, OnayModal,
         fmtPara, fmtSayi, parseSayi, eslesir } from "../ui/kit";

const TIPLER = [["hammadde", "Hammadde"], ["yari_mamul", "Yarı Mamul"], ["ticari_mal", "Ticari Mal"],
                ["sarf", "Sarf Malzeme"], ["hizmet", "Hizmet"], ["ekipman", "Ekipman"]];
const TIP_ETIKET = Object.fromEntries(TIPLER);
const BIRIMLER = ["Adet", "Metre", "Kg", "Lt", "Paket", "Rulo", "Takım", "Saat", "m²"].map(b => [b, b]);

const BOS = {
  malzeme_kodu: "", malzeme_adi: "", aciklama: "", tip: "ticari_mal", category_id: "",
  alt_kategori: "", marka: "", uretici: "", uretici_parca_no: "", birim: "Adet", kdv: 20,
  min_stok: "", max_stok: "", kritik_stok: "", seri_takipli: false, lot_takipli: false,
  raf_kodu: "", aktif: true,
};

export default function Malzeme({ yetkiVar, goster }) {
  const [liste, setListe] = useState([]);
  const [kategoriler, setKat] = useState([]);
  const [stoklar, setStok] = useState({});
  const [fiyatlar, setFiyat] = useState({});
  const [yuk, setYuk] = useState(true);
  const [ara, setAra] = useState("");
  const [fKat, setFKat] = useState("");
  const [fTip, setFTip] = useState("");
  const [sekme, setSekme] = useState("aktif");
  const [form, setForm] = useState(null);
  const [kay, setKay] = useState(false);
  const [detay, setDetay] = useState(null);
  const [silinecek, setSil] = useState(null);

  const ekleyebilir = yetkiVar("malzeme", "ekle");
  const duzenleyebilir = yetkiVar("malzeme", "duzenle");

  const yukle = useCallback(async () => {
    setYuk(true);
    try {
      const [m, k, s, f] = await Promise.all([
        api.list("materials", { order: "malzeme_kodu.asc", limit: 5000 }),
        api.list("material_categories", { order: "kod.asc", limit: 500 }).catch(() => []),
        yetkiVar("depo") ? api.list("stock_balances", { select: "material_id,miktar,rezerve", limit: 10000 }).catch(() => []) : [],
        api.list("material_suppliers", { select: "material_id,fiyat,cur,company_id,company:companies(unvan)", limit: 10000 }).catch(() => []),
      ]);
      setListe(m); setKat(k);
      const sh = {}; s.forEach(r => { sh[r.material_id] = (sh[r.material_id] || 0) + Number(r.miktar || 0); });
      setStok(sh);
      const fh = {};
      f.forEach(r => {
        if (r.fiyat == null) return;
        const mevcut = fh[r.material_id];
        // En düşük tedarikçi fiyatı listede gösterilir (aynı para birimi içinde)
        if (!mevcut || Number(r.fiyat) < Number(mevcut.fiyat)) fh[r.material_id] = r;
      });
      setFiyat(fh);
    } catch (e) { goster("Malzeme listesi yüklenemedi: " + e.message, "hata"); }
    finally { setYuk(false); }
  }, [goster, yetkiVar]);

  useEffect(() => { yukle(); }, [yukle]);

  const katAgac = useMemo(() => {
    const ust = kategoriler.filter(k => !k.ust_id);
    return kategoriler.map(k => {
      const u = ust.find(x => x.id === k.ust_id);
      return [k.id, u ? `${u.ad} › ${k.ad}` : k.ad];
    });
  }, [kategoriler]);

  const katAd = id => kategoriler.find(k => k.id === id)?.ad || "—";

  const filtreli = useMemo(() => liste.filter(m => {
    if (sekme === "aktif" && !m.aktif) return false;
    if (sekme === "pasif" && m.aktif) return false;
    if (sekme === "kritik") {
      const st = stoklar[m.id] || 0;
      if (!(Number(m.kritik_stok) > 0 && st <= Number(m.kritik_stok))) return false;
    }
    if (fKat && String(m.category_id) !== String(fKat)) return false;
    if (fTip && m.tip !== fTip) return false;
    if (ara && !(eslesir(m.malzeme_kodu, ara) || eslesir(m.malzeme_adi, ara)
              || eslesir(m.marka, ara) || eslesir(m.uretici_parca_no, ara)
              || eslesir(m.aciklama, ara))) return false;
    return true;
  }), [liste, ara, fKat, fTip, sekme, stoklar]);

  async function kaydet() {
    if (!form.malzeme_kodu.trim()) return goster("Malzeme kodu zorunlu.", "hata");
    if (!form.malzeme_adi.trim()) return goster("Malzeme adı zorunlu.", "hata");
    setKay(true);
    try {
      const govde = {
        malzeme_kodu: form.malzeme_kodu.trim().toUpperCase(),
        malzeme_adi: form.malzeme_adi.trim(), aciklama: form.aciklama || null,
        tip: form.tip, category_id: form.category_id || null, alt_kategori: form.alt_kategori || null,
        marka: form.marka || null, uretici: form.uretici || null,
        uretici_parca_no: form.uretici_parca_no || null, birim: form.birim,
        kdv: Number(form.kdv) || 0,
        min_stok: parseSayi(form.min_stok) || 0, max_stok: parseSayi(form.max_stok) || 0,
        kritik_stok: parseSayi(form.kritik_stok) || 0,
        seri_takipli: !!form.seri_takipli, lot_takipli: !!form.lot_takipli,
        raf_kodu: form.raf_kodu || null, aktif: !!form.aktif,
      };
      if (form.id) {
        await api.update("materials", form.id, govde);
        logAudit({ tablo: "materials", kayit_id: form.id, islem: "update", yeni: govde });
      } else {
        const y = await api.insert("materials", govde);
        logAudit({ tablo: "materials", kayit_id: y?.id, islem: "insert", yeni: govde });
      }
      goster("Malzeme kaydedildi.", "basari");
      setForm(null); yukle();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  async function sil() {
    try {
      await api.remove("materials", silinecek.id);
      goster("Malzeme silindi.", "basari"); setSil(null); yukle();
    } catch (e) { goster(e.message, "hata"); setSil(null); }
  }

  const sayilar = {
    aktif: liste.filter(m => m.aktif).length,
    pasif: liste.filter(m => !m.aktif).length,
    kritik: liste.filter(m => Number(m.kritik_stok) > 0 && (stoklar[m.id] || 0) <= Number(m.kritik_stok)).length,
  };

  return (
    <>
      <Baslik ust="Ana Veri" aciklama="BOM, satın alma ve depo bu kartlara bağlanır"
        sag={ekleyebilir && <Btn tur="birincil" onClick={() => setForm({ ...BOS })} ikon="＋">Yeni Malzeme</Btn>}>
        Malzeme Kartları
      </Baslik>

      <div style={{ display: "grid", gap: 12, marginBottom: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <Olcum etiket="Aktif Kart" deger={sayilar.aktif} ikon="◇" />
        <Olcum etiket="Kritik Seviyede" deger={sayilar.kritik} ikon="⚠"
          renk={sayilar.kritik ? T.renk.hata : T.renk.basari}
          zemin={sayilar.kritik ? T.renk.hataAcik : T.renk.basariAcik} />
        <Olcum etiket="Kategori" deger={kategoriler.length} ikon="▦" renk={T.renk.mor} zemin={T.renk.morAcik} />
        <Olcum etiket="Pasif" deger={sayilar.pasif} ikon="◌" renk={T.renk.metinPasif} zemin="#f1f5f9" />
      </div>

      <Sekmeler aktif={sekme} onDegisim={setSekme} sekmeler={[
        { anahtar: "aktif", baslik: "Aktif", sayi: sayilar.aktif },
        { anahtar: "kritik", baslik: "Kritik Stok", sayi: sayilar.kritik },
        { anahtar: "pasif", baslik: "Pasif", sayi: sayilar.pasif },
      ]} />

      <Kart pad={13} style={{ marginBottom: 14 }}>
        <Satir bosluk={10} style={{ alignItems: "center" }}>
          <Arama deger={ara} onDegisim={setAra} yer="Kod, ad, marka, üretici parça no…" genislik={320} />
          <div style={{ width: 230 }}>
            <Secim value={fKat} onChange={e => setFKat(e.target.value)} secenekler={katAgac} bos="Tüm kategoriler" />
          </div>
          <div style={{ width: 170 }}>
            <Secim value={fTip} onChange={e => setFTip(e.target.value)} secenekler={TIPLER} bos="Tüm tipler" />
          </div>
          <div style={{ marginLeft: "auto", fontSize: 12.5, color: T.renk.metinPasif }}>{filtreli.length} kayıt</div>
        </Satir>
      </Kart>

      <Tablo yukleniyor={yuk} veri={filtreli} onSatirTikla={m => setDetay(m)}
        bosMesaj={ara || fKat || fTip ? "Filtreye uyan malzeme yok" : "Henüz malzeme kartı yok"}
        sutunlar={[
          { anahtar: "malzeme_kodu", baslik: "Kod", genislik: 130,
            render: r => <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: T.renk.marka }}>{r.malzeme_kodu}</span> },
          { anahtar: "malzeme_adi", baslik: "Malzeme",
            render: r => (
              <div>
                <div style={{ fontWeight: 550 }}>{r.malzeme_adi}</div>
                <div style={{ fontSize: 11.5, color: T.renk.metinPasif }}>
                  {[r.marka, r.uretici_parca_no].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
            )},
          { anahtar: "category_id", baslik: "Kategori", genislik: 170,
            render: r => <span style={{ fontSize: 12.5 }}>{katAd(r.category_id)}</span> },
          { anahtar: "tip", baslik: "Tip", genislik: 120,
            render: r => <span style={{ fontSize: 12.5 }}>{TIP_ETIKET[r.tip] || r.tip}</span> },
          { anahtar: "birim", baslik: "Birim", genislik: 80 },
          { anahtar: "stok", baslik: "Stok", genislik: 110, hizala: "right",
            render: r => {
              const st = stoklar[r.id] || 0;
              const kritik = Number(r.kritik_stok) > 0 && st <= Number(r.kritik_stok);
              return <span style={{ color: kritik ? T.renk.hata : T.renk.metin, fontWeight: kritik ? 700 : 500 }}>
                {fmtSayi(st)}</span>;
            }},
          { anahtar: "fiyat", baslik: "En İyi Tedarikçi Fiyatı", genislik: 200, hizala: "right",
            render: r => {
              const f = fiyatlar[r.id];
              if (!f) return <span style={{ color: T.renk.metinPasif }}>—</span>;
              return (
                <div style={{ lineHeight: 1.35 }}>
                  <div style={{ fontWeight: 650 }}>{fmtPara(f.fiyat, f.cur)}</div>
                  <div style={{ fontSize: 11, color: T.renk.metinPasif }}>{f.company?.unvan || ""}</div>
                </div>
              );
            }},
        ]} />

      {/* DETAY */}
      <Modal acik={!!detay} onKapat={() => setDetay(null)} genislik={640}
        baslik={detay?.malzeme_adi} aciklama={detay?.malzeme_kodu}
        altBar={<>
          <Btn onClick={() => setDetay(null)}>Kapat</Btn>
          {duzenleyebilir && <Btn tur="birincil"
            onClick={() => { setForm({ ...BOS, ...detay, category_id: detay.category_id || "" }); setDetay(null); }}>Düzenle</Btn>}
        </>}>
        {detay && (
          <div>
            <Satir style={{ marginBottom: 14 }}>
              <Rozet renk={T.renk.marka} zemin={T.renk.markaAcik}>{TIP_ETIKET[detay.tip]}</Rozet>
              <Rozet renk={T.renk.mor} zemin={T.renk.morAcik}>{katAd(detay.category_id)}</Rozet>
              {!detay.aktif && <Rozet renk={T.renk.hata} zemin={T.renk.hataAcik}>Pasif</Rozet>}
            </Satir>
            {[
              ["Marka", detay.marka], ["Üretici", detay.uretici],
              ["Üretici Parça No", detay.uretici_parca_no], ["Alt Kategori", detay.alt_kategori],
              ["Birim", detay.birim], ["KDV", detay.kdv != null ? `%${detay.kdv}` : "—"],
              ["Toplam Stok", `${fmtSayi(stoklar[detay.id] || 0)} ${detay.birim}`],
              ["Min / Kritik / Max", `${fmtSayi(detay.min_stok)} / ${fmtSayi(detay.kritik_stok)} / ${fmtSayi(detay.max_stok)}`],
              ["Raf", detay.raf_kodu],
              ["Takip", [detay.seri_takipli && "Seri no", detay.lot_takipli && "Lot"].filter(Boolean).join(" · ") || "—"],
            ].map(([ad, d]) => (
              <div key={ad} style={{ display: "flex", justifyContent: "space-between", gap: 16,
                padding: "8px 0", borderBottom: `1px solid ${T.renk.cizgi}`, fontSize: 13 }}>
                <span style={{ color: T.renk.metinPasif }}>{ad}</span>
                <span style={{ fontWeight: 550, textAlign: "right" }}>{d || "—"}</span>
              </div>
            ))}
            {detay.aciklama && (
              <div style={{ marginTop: 14, fontSize: 13, color: T.renk.metinSoluk,
                background: "#f8fafc", padding: 12, borderRadius: 8, whiteSpace: "pre-wrap" }}>{detay.aciklama}</div>
            )}
          </div>
        )}
      </Modal>

      {/* FORM */}
      <Modal acik={!!form} onKapat={() => setForm(null)} genislik={800}
        baslik={form?.id ? "Malzemeyi Düzenle" : "Yeni Malzeme Kartı"}
        altBar={<>
          {form?.id && yetkiVar("malzeme", "sil") &&
            <Btn tur="tehlike" onClick={() => { setSil(form); setForm(null); }}>Sil</Btn>}
          <Btn onClick={() => setForm(null)}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={kaydet} disabled={kay}>{kay ? "Kaydediliyor…" : "Kaydet"}</Btn>
        </>}>
        {form && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Satir>
              <Alan etiket="Malzeme Kodu" zorunlu genislik="180px" ipucu="Benzersiz olmalı">
                <Giris value={form.malzeme_kodu}
                  onChange={e => setForm(f => ({ ...f, malzeme_kodu: e.target.value }))}
                  placeholder="OTM-PLC-0012" />
              </Alan>
              <Alan etiket="Malzeme Adı" zorunlu genislik="400px">
                <Giris value={form.malzeme_adi}
                  onChange={e => setForm(f => ({ ...f, malzeme_adi: e.target.value }))}
                  placeholder="Örn. Siemens S7-1200 CPU 1214C DC/DC/DC" />
              </Alan>
            </Satir>
            <Satir>
              <Alan etiket="Kategori" genislik="250px">
                <Secim value={form.category_id} secenekler={katAgac} bos="Kategori seçin…"
                  onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} />
              </Alan>
              <Alan etiket="Alt Kategori" genislik="180px">
                <Giris value={form.alt_kategori || ""} onChange={e => setForm(f => ({ ...f, alt_kategori: e.target.value }))} />
              </Alan>
              <Alan etiket="Malzeme Tipi" genislik="170px">
                <Secim value={form.tip} bos={false} secenekler={TIPLER}
                  onChange={e => setForm(f => ({ ...f, tip: e.target.value }))} />
              </Alan>
            </Satir>
            <Satir>
              <Alan etiket="Marka" genislik="170px">
                <Giris value={form.marka || ""} onChange={e => setForm(f => ({ ...f, marka: e.target.value }))}
                  placeholder="Siemens, Schneider, Phoenix…" />
              </Alan>
              <Alan etiket="Üretici" genislik="170px">
                <Giris value={form.uretici || ""} onChange={e => setForm(f => ({ ...f, uretici: e.target.value }))} />
              </Alan>
              <Alan etiket="Üretici Parça No" genislik="200px">
                <Giris value={form.uretici_parca_no || ""}
                  onChange={e => setForm(f => ({ ...f, uretici_parca_no: e.target.value }))}
                  placeholder="6ES7214-1AG40-0XB0" />
              </Alan>
            </Satir>
            <Satir>
              <Alan etiket="Birim" genislik="130px">
                <Secim value={form.birim} bos={false} secenekler={BIRIMLER}
                  onChange={e => setForm(f => ({ ...f, birim: e.target.value }))} />
              </Alan>
              <Alan etiket="KDV (%)" genislik="110px">
                <Giris type="number" value={form.kdv} onChange={e => setForm(f => ({ ...f, kdv: e.target.value }))} />
              </Alan>
              <Alan etiket="Min. Stok" genislik="120px">
                <Giris value={form.min_stok} onChange={e => setForm(f => ({ ...f, min_stok: e.target.value }))} />
              </Alan>
              <Alan etiket="Kritik Stok" genislik="120px" ipucu="Panelde uyarı verir">
                <Giris value={form.kritik_stok} onChange={e => setForm(f => ({ ...f, kritik_stok: e.target.value }))} />
              </Alan>
              <Alan etiket="Max. Stok" genislik="120px">
                <Giris value={form.max_stok} onChange={e => setForm(f => ({ ...f, max_stok: e.target.value }))} />
              </Alan>
              <Alan etiket="Raf Kodu" genislik="120px">
                <Giris value={form.raf_kodu || ""} onChange={e => setForm(f => ({ ...f, raf_kodu: e.target.value }))} />
              </Alan>
            </Satir>
            <Alan etiket="Açıklama / Teknik Not">
              <Metin value={form.aciklama || ""} satir={3}
                onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))}
                placeholder="Besleme gerilimi, dijital/analog kanal sayısı, haberleşme protokolü…" />
            </Alan>
            <Satir bosluk={20}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={!!form.seri_takipli}
                  onChange={e => setForm(f => ({ ...f, seri_takipli: e.target.checked }))} />
                Seri numarası takipli
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={!!form.lot_takipli}
                  onChange={e => setForm(f => ({ ...f, lot_takipli: e.target.checked }))} />
                Lot / parti takipli
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={!!form.aktif}
                  onChange={e => setForm(f => ({ ...f, aktif: e.target.checked }))} />
                Kart aktif
              </label>
            </Satir>
          </div>
        )}
      </Modal>

      <OnayModal acik={!!silinecek} tehlike onHayir={() => setSil(null)} onEvet={sil}
        baslik="Malzeme silinsin mi?"
        mesaj={`"${silinecek?.malzeme_adi}" silinecek. BOM veya stok hareketi varsa silme engellenir; bunun yerine kartı pasife alın.`} />
    </>
  );
}
