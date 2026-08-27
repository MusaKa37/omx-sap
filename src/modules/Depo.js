// ─────────────────────────────────────────────────────────────────────────────
// DEPO & STOK
// Bakiye tablosu elle güncellenmez: her şey stock_moves'a yazılır, veritabanı
// tetikleyicisi stock_balances'ı hesaplar. Projeye yapılan çıkış aynı anda
// proje maliyet defterine de düşer.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from "react";
import { api, logAudit } from "../services/api";
import { T } from "../ui/theme";
import { Kart, Baslik, Btn, Rozet, Tablo, Modal, Alan, Giris, Metin, Secim, Satir,
         Arama, Sekmeler, Olcum, Bos, SecimAra,
         fmtSayi, fmtTarih, fmtTarihSaat, parseSayi, eslesir } from "../ui/kit";

const HAREKET = [
  ["giris",    "Giriş",    "+", T.renk.basari, T.renk.basariAcik],
  ["cikis",    "Çıkış",    "−", T.renk.hata,   T.renk.hataAcik],
  ["transfer", "Transfer", "⇄", T.renk.marka,  T.renk.markaAcik],
  ["sarf",     "Sarf",     "−", T.renk.uyari,  T.renk.uyariAcik],
  ["sayim",    "Sayım",    "=", T.renk.mor,    T.renk.morAcik],
  ["iade",     "İade",     "+", T.renk.bilgi,  T.renk.bilgiAcik],
  ["fire",     "Fire",     "−", T.renk.hata,   T.renk.hataAcik],
];
const HAREKET_AD = Object.fromEntries(HAREKET.map(([k, a]) => [k, a]));
const DEPO_TIPI = [["merkez", "Merkez"], ["saha", "Saha"], ["arac", "Araç"], ["karantina", "Karantina"]];
const CURLAR = [["TRY", "₺ TL"], ["EUR", "€ EUR"], ["USD", "$ USD"]];

const BOS_HAREKET = {
  tip: "giris", material_id: "", warehouse_id: "", hedef_warehouse_id: "",
  project_id: "", miktar: "", birim_maliyet: "", cur: "TRY", kur: "",
  lot_no: "", seri_no: "", aciklama: "",
};

export default function Depo({ profil, yetkiVar, goster }) {
  const [depolar, setDepolar]   = useState([]);
  const [bakiye, setBakiye]     = useState([]);
  const [hareketler, setHar]    = useState([]);
  const [malzemeler, setMlz]    = useState([]);
  const [projeler, setProjeler] = useState([]);
  const [yuk, setYuk]           = useState(true);
  const [sekme, setSekme]       = useState("stok");
  const [ara, setAra]           = useState("");
  const [fDepo, setFDepo]       = useState("");
  const [sadeceKritik, setKrit] = useState(false);
  const [form, setForm]         = useState(null);
  const [kay, setKay]           = useState(false);
  const [gecmis, setGecmis]     = useState(null);   // { material_id, ad }
  const [depoForm, setDepoForm] = useState(null);

  const ekleyebilir = yetkiVar("depo", "ekle");

  const yukle = useCallback(async () => {
    setYuk(true);
    try {
      const [w, b, h, m, p] = await Promise.all([
        api.list("warehouses", { order: "kod.asc" }),
        api.list("stock_balances", { limit: 20000 }),
        api.list("stock_moves", { select: "*,malzeme:materials(malzeme_kodu,malzeme_adi,birim),proje:projects(proje_kodu)",
                                  order: "created_at.desc", limit: 400 }),
        api.list("materials", { select: "id,malzeme_kodu,malzeme_adi,birim,kritik_stok,min_stok",
                                eq: { aktif: true }, order: "malzeme_kodu.asc", limit: 5000 }),
        api.list("projects", { select: "id,proje_kodu,proje_adi,durum", order: "proje_kodu.desc", limit: 500 }),
      ]);
      setDepolar(w); setBakiye(b); setHar(h); setMlz(m); setProjeler(p);
    } catch (e) { goster("Depo verisi yüklenemedi: " + e.message, "hata"); }
    finally { setYuk(false); }
  }, [goster]);

  useEffect(() => { yukle(); }, [yukle]);

  const depoAd = useCallback(id => depolar.find(d => String(d.id) === String(id))?.kod || "—", [depolar]);
  const mlzMap = useMemo(() => Object.fromEntries(malzemeler.map(m => [m.id, m])), [malzemeler]);

  // Malzeme bazında toplanmış stok (depo kırılımı satır altında)
  const stokSatirlari = useMemo(() => {
    const h = {};
    bakiye.forEach(b => {
      const m = mlzMap[b.material_id];
      if (!m) return;
      h[b.material_id] ||= { ...m, toplam: 0, rezerve: 0, depolar: [] };
      h[b.material_id].toplam  += Number(b.miktar || 0);
      h[b.material_id].rezerve += Number(b.rezerve || 0);
      if (Number(b.miktar) !== 0) h[b.material_id].depolar.push({ id: b.warehouse_id, miktar: b.miktar, raf: b.raf });
    });
    return Object.values(h);
  }, [bakiye, mlzMap]);

  const gorunen = useMemo(() => stokSatirlari.filter(s => {
    if (fDepo && !s.depolar.some(d => String(d.id) === String(fDepo))) return false;
    if (sadeceKritik && !(Number(s.kritik_stok) > 0 && s.toplam <= Number(s.kritik_stok))) return false;
    if (ara && !(eslesir(s.malzeme_kodu, ara) || eslesir(s.malzeme_adi, ara))) return false;
    return true;
  }).sort((a, b) => a.malzeme_kodu.localeCompare(b.malzeme_kodu, "tr")), [stokSatirlari, ara, fDepo, sadeceKritik]);

  const kritikSayi = stokSatirlari.filter(s => Number(s.kritik_stok) > 0 && s.toplam <= Number(s.kritik_stok)).length;

  // ── Hareket kaydı ─────────────────────────────────────────────────────────
  async function hareketKaydet() {
    const f = form;
    const miktar = parseSayi(f.miktar);
    if (!f.material_id)  return goster("Malzeme seçilmeli.", "hata");
    if (!f.warehouse_id) return goster("Depo seçilmeli.", "hata");
    if (!miktar || miktar <= 0) return goster("Miktar sıfırdan büyük olmalı.", "hata");
    if (f.tip === "transfer" && !f.hedef_warehouse_id)
      return goster("Transferde hedef depo zorunlu.", "hata");
    if (f.tip === "transfer" && String(f.hedef_warehouse_id) === String(f.warehouse_id))
      return goster("Kaynak ve hedef depo aynı olamaz.", "hata");

    // Çıkışta bakiyeyi kontrol et — eksiye düşürmek genelde veri hatasıdır
    if (["cikis", "sarf", "fire", "transfer"].includes(f.tip)) {
      const mevcut = bakiye.find(b => String(b.material_id) === String(f.material_id)
                                   && String(b.warehouse_id) === String(f.warehouse_id));
      const eldeki = Number(mevcut?.miktar || 0);
      if (miktar > eldeki) {
        const m = mlzMap[f.material_id];
        return goster(`${depoAd(f.warehouse_id)} deposunda ${fmtSayi(eldeki)} ${m?.birim || ""} var, ${fmtSayi(miktar)} çıkılamaz.`, "hata");
      }
    }

    setKay(true);
    try {
      const yeni = await api.insert("stock_moves", {
        material_id: Number(f.material_id),
        warehouse_id: Number(f.warehouse_id),
        hedef_warehouse_id: f.tip === "transfer" ? Number(f.hedef_warehouse_id) : null,
        project_id: f.project_id ? Number(f.project_id) : null,
        tip: f.tip, miktar,
        birim_maliyet: parseSayi(f.birim_maliyet) || null,
        cur: f.cur, kur: f.cur === "TRY" ? null : (parseSayi(f.kur) || null),
        lot_no: f.lot_no || null, seri_no: f.seri_no || null,
        aciklama: f.aciklama || null,
        belge_tipi: "manuel",
        user_email: profil?.email || null, user_id: profil?.id || null,
      });
      logAudit({ tablo: "stock_moves", kayit_id: yeni?.id, islem: "insert",
                 aciklama: `${HAREKET_AD[f.tip]} · ${mlzMap[f.material_id]?.malzeme_kodu} · ${miktar}` });
      goster("Stok hareketi kaydedildi.", "basari");
      setForm(null); yukle();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  async function depoKaydet() {
    if (!depoForm.kod.trim() || !depoForm.ad.trim()) return goster("Kod ve ad zorunlu.", "hata");
    setKay(true);
    try {
      const govde = {
        kod: depoForm.kod.trim().toUpperCase(), ad: depoForm.ad.trim(), tip: depoForm.tip,
        adres: depoForm.adres || null, aktif: !!depoForm.aktif,
        project_id: depoForm.project_id ? Number(depoForm.project_id) : null,
      };
      if (depoForm.id) await api.update("warehouses", depoForm.id, govde);
      else await api.insert("warehouses", govde);
      goster("Depo kaydedildi.", "basari");
      setDepoForm(null); yukle();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  const malzemeSecenek = useMemo(() => malzemeler.map(m => ({
    deger: m.id, etiket: `${m.malzeme_kodu} · ${m.malzeme_adi}`, alt: m.birim })), [malzemeler]);
  const depoSecenek = useMemo(() => depolar.filter(d => d.aktif !== false)
    .map(d => ({ deger: d.id, etiket: `${d.kod} · ${d.ad}` })), [depolar]);
  const projeSecenek = useMemo(() => projeler
    .filter(p => !["iptal", "tamamlandi"].includes(p.durum))
    .map(p => ({ deger: p.id, etiket: `${p.proje_kodu} · ${p.proje_adi}` })), [projeler]);

  const gecmisHareketleri = gecmis
    ? hareketler.filter(h => String(h.material_id) === String(gecmis.material_id))
    : [];

  return (
    <>
      <Baslik ust="Tedarik Zinciri" aciklama="Çok depolu stok bakiyesi ve hareket geçmişi"
        sag={<>
          <Btn onClick={yukle} disabled={yuk}>{yuk ? "Yenileniyor…" : "Yenile"}</Btn>
          {ekleyebilir && <Btn tur="birincil" ikon="＋"
            onClick={() => setForm({ ...BOS_HAREKET })}>
            Stok Hareketi</Btn>}
        </>}>
        Depo & Stok
      </Baslik>

      <div style={{ display: "grid", gap: 12, marginBottom: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <Olcum etiket="Stoklu Kalem" deger={stokSatirlari.filter(s => s.toplam > 0).length} ikon="▤" />
        <Olcum etiket="Kritik Seviyede" deger={kritikSayi} ikon="⚠"
          renk={kritikSayi ? T.renk.hata : T.renk.basari}
          zemin={kritikSayi ? T.renk.hataAcik : T.renk.basariAcik}
          alt={kritikSayi ? "sipariş verilmeli" : "seviye yeterli"} />
        <Olcum etiket="Depo" deger={depolar.filter(d => d.aktif !== false).length} ikon="◫"
          renk={T.renk.mor} zemin={T.renk.morAcik} />
        <Olcum etiket="Son 400 Hareket" deger={hareketler.length} ikon="⇄"
          renk={T.renk.bilgi} zemin={T.renk.bilgiAcik}
          alt={hareketler[0] ? `son: ${fmtTarih(hareketler[0].created_at)}` : "hareket yok"} />
      </div>

      <Sekmeler aktif={sekme} onDegisim={setSekme} sekmeler={[
        { anahtar: "stok",     baslik: "Stok Durumu", sayi: gorunen.length },
        { anahtar: "hareket",  baslik: "Hareketler",  sayi: hareketler.length },
        { anahtar: "depolar",  baslik: "Depolar",     sayi: depolar.length },
      ]} />

      {/* ── STOK DURUMU ── */}
      {sekme === "stok" && (
        <>
          <Kart pad={13} style={{ marginBottom: 14 }}>
            <Satir bosluk={10} style={{ alignItems: "center" }}>
              <Arama deger={ara} onDegisim={setAra} yer="Malzeme kodu veya adı…" genislik={300} />
              <div style={{ width: 200 }}>
                <Secim value={fDepo} onChange={e => setFDepo(e.target.value)}
                  secenekler={depolar.map(d => [d.id, `${d.kod} · ${d.ad}`])} bos="Tüm depolar" />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={sadeceKritik} onChange={e => setKrit(e.target.checked)} />
                Sadece kritik
              </label>
              <div style={{ marginLeft: "auto", fontSize: 12.5, color: T.renk.metinPasif }}>{gorunen.length} kalem</div>
            </Satir>
          </Kart>

          <Tablo yukleniyor={yuk} veri={gorunen} anahtarAl={r => r.id}
            onSatirTikla={r => setGecmis({ material_id: r.id, ad: `${r.malzeme_kodu} · ${r.malzeme_adi}` })}
            bosMesaj={ara || fDepo || sadeceKritik ? "Filtreye uyan kalem yok" : "Henüz stok hareketi girilmedi"}
            sutunlar={[
              { anahtar: "malzeme_kodu", baslik: "Kod", genislik: 140,
                render: r => <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: T.renk.marka }}>{r.malzeme_kodu}</span> },
              { anahtar: "malzeme_adi", baslik: "Malzeme",
                render: r => (
                  <div>
                    <div style={{ fontWeight: 550 }}>{r.malzeme_adi}</div>
                    <div style={{ fontSize: 11.5, color: T.renk.metinPasif }}>
                      {r.depolar.length
                        ? r.depolar.map(d => `${depoAd(d.id)}: ${fmtSayi(d.miktar)}`).join("  ·  ")
                        : "hiçbir depoda yok"}
                    </div>
                  </div>
                )},
              { anahtar: "toplam", baslik: "Toplam", hizala: "right", genislik: 120,
                render: r => {
                  const kritik = Number(r.kritik_stok) > 0 && r.toplam <= Number(r.kritik_stok);
                  return <span style={{ fontWeight: kritik ? 700 : 600, color: kritik ? T.renk.hata : T.renk.metin }}>
                    {fmtSayi(r.toplam)} <span style={{ fontWeight: 400, fontSize: 11.5, color: T.renk.metinPasif }}>{r.birim}</span>
                  </span>;
                }},
              { anahtar: "rezerve", baslik: "Rezerve", hizala: "right", genislik: 100,
                render: r => r.rezerve ? fmtSayi(r.rezerve) : <span style={{ color: T.renk.metinPasif }}>—</span> },
              { anahtar: "kritik_stok", baslik: "Kritik", hizala: "right", genislik: 90,
                render: r => Number(r.kritik_stok) > 0 ? fmtSayi(r.kritik_stok) : <span style={{ color: T.renk.metinPasif }}>—</span> },
              { anahtar: "durum", baslik: "Durum", genislik: 120,
                render: r => {
                  if (Number(r.kritik_stok) > 0 && r.toplam <= Number(r.kritik_stok))
                    return <Rozet renk={T.renk.hata} zemin={T.renk.hataAcik}>Kritik</Rozet>;
                  if (Number(r.min_stok) > 0 && r.toplam <= Number(r.min_stok))
                    return <Rozet renk={T.renk.uyari} zemin={T.renk.uyariAcik}>Azalıyor</Rozet>;
                  return <Rozet renk={T.renk.basari} zemin={T.renk.basariAcik}>Yeterli</Rozet>;
                }},
            ]} />
        </>
      )}

      {/* ── HAREKETLER ── */}
      {sekme === "hareket" && (
        <Tablo yukleniyor={yuk} veri={hareketler} bosMesaj="Henüz stok hareketi yok"
          sutunlar={[
            { anahtar: "created_at", baslik: "Tarih", genislik: 132, render: r => fmtTarihSaat(r.created_at) },
            { anahtar: "tip", baslik: "Tip", genislik: 110,
              render: r => {
                const [, ad, , renk, zemin] = HAREKET.find(h => h[0] === r.tip) || ["", r.tip, "", T.renk.metinSoluk, "#f1f5f9"];
                return <Rozet renk={renk} zemin={zemin}>{ad}</Rozet>;
              }},
            { anahtar: "malzeme", baslik: "Malzeme",
              render: r => (
                <div>
                  <div style={{ fontWeight: 550 }}>{r.malzeme?.malzeme_adi || "—"}</div>
                  <div style={{ fontSize: 11.5, color: T.renk.metinPasif, fontFamily: "monospace" }}>{r.malzeme?.malzeme_kodu}</div>
                </div>
              )},
            { anahtar: "depo", baslik: "Depo", genislik: 130,
              render: r => r.tip === "transfer"
                ? <span style={{ fontSize: 12.5 }}>{depoAd(r.warehouse_id)} → {depoAd(r.hedef_warehouse_id)}</span>
                : <span style={{ fontSize: 12.5 }}>{depoAd(r.warehouse_id)}</span> },
            { anahtar: "proje", baslik: "Proje", genislik: 130,
              render: r => r.proje?.proje_kodu
                ? <span style={{ fontFamily: "monospace", fontSize: 11.5, color: T.renk.marka }}>{r.proje.proje_kodu}</span>
                : <span style={{ color: T.renk.metinPasif }}>—</span> },
            { anahtar: "miktar", baslik: "Miktar", hizala: "right", genislik: 110,
              render: r => {
                const [, , isaret, renk] = HAREKET.find(h => h[0] === r.tip) || ["", "", "", T.renk.metin];
                return <span style={{ fontWeight: 650, color: renk }}>
                  {isaret}{fmtSayi(r.miktar)} <span style={{ fontWeight: 400, fontSize: 11.5, color: T.renk.metinPasif }}>{r.malzeme?.birim}</span>
                </span>;
              }},
            { anahtar: "aciklama", baslik: "Açıklama",
              render: r => <span style={{ fontSize: 12.5, color: T.renk.metinSoluk }}>{r.aciklama || "—"}</span> },
            { anahtar: "user_email", baslik: "Kullanıcı", genislik: 160,
              render: r => <span style={{ fontSize: 11.5, color: T.renk.metinPasif }}>{r.user_email || "—"}</span> },
          ]} />
      )}

      {/* ── DEPOLAR ── */}
      {sekme === "depolar" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            {ekleyebilir && <Btn tur="birincil" boyut="sm" ikon="＋"
              onClick={() => setDepoForm({ kod: "", ad: "", tip: "merkez", adres: "", project_id: "", aktif: true })}>
              Depo Ekle</Btn>}
          </div>
          <Tablo yukleniyor={yuk} veri={depolar}
            onSatirTikla={ekleyebilir ? d => setDepoForm({ ...d, project_id: d.project_id || "" }) : undefined}
            bosMesaj="Depo tanımlı değil"
            sutunlar={[
              { anahtar: "kod", baslik: "Kod", genislik: 100,
                render: r => <span style={{ fontFamily: "monospace", fontWeight: 700, color: T.renk.marka }}>{r.kod}</span> },
              { anahtar: "ad", baslik: "Depo Adı", render: r => <span style={{ fontWeight: 550 }}>{r.ad}</span> },
              { anahtar: "tip", baslik: "Tip", genislik: 120,
                render: r => DEPO_TIPI.find(([k]) => k === r.tip)?.[1] || r.tip },
              { anahtar: "kalem", baslik: "Kalem", hizala: "right", genislik: 90,
                render: r => bakiye.filter(b => String(b.warehouse_id) === String(r.id) && Number(b.miktar) !== 0).length },
              { anahtar: "adres", baslik: "Adres", render: r => r.adres || "—" },
              { anahtar: "aktif", baslik: "Durum", genislik: 100,
                render: r => r.aktif === false
                  ? <Rozet renk={T.renk.hata} zemin={T.renk.hataAcik}>Pasif</Rozet>
                  : <Rozet renk={T.renk.basari} zemin={T.renk.basariAcik}>Aktif</Rozet> },
            ]} />
        </>
      )}

      {/* ── HAREKET FORMU ── */}
      <Modal acik={!!form} onKapat={() => setForm(null)} genislik={720} baslik="Stok Hareketi"
        aciklama="Bakiye doğrudan değiştirilmez; her değişiklik bir hareket kaydı olarak işlenir."
        altBar={<>
          <Btn onClick={() => setForm(null)}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={hareketKaydet} disabled={kay}>{kay ? "Kaydediliyor…" : "Kaydet"}</Btn>
        </>}>
        {form && (
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {HAREKET.map(([k, ad, , renk, zemin]) => (
                <button key={k} onClick={() => setForm(f => ({ ...f, tip: k }))}
                  style={{ padding: "7px 14px", borderRadius: 999, cursor: "pointer", fontSize: 12.5,
                    fontWeight: form.tip === k ? 650 : 500,
                    border: `1px solid ${form.tip === k ? renk : T.renk.cizgi}`,
                    background: form.tip === k ? zemin : "#fff",
                    color: form.tip === k ? renk : T.renk.metinSoluk }}>{ad}</button>
              ))}
            </div>

            <Alan etiket="Malzeme" zorunlu>
              <SecimAra deger={form.material_id} secenekler={malzemeSecenek}
                onSec={v => setForm(f => ({ ...f, material_id: v }))}
                bos="Malzeme seçin" yer="Kod veya ad ile ara…" />
            </Alan>

            <Satir>
              <Alan etiket={form.tip === "transfer" ? "Kaynak Depo" : "Depo"} zorunlu genislik="220px">
                <SecimAra deger={form.warehouse_id} secenekler={depoSecenek}
                  onSec={v => setForm(f => ({ ...f, warehouse_id: v }))} bos="Depo seçin" />
              </Alan>
              {form.tip === "transfer" && (
                <Alan etiket="Hedef Depo" zorunlu genislik="220px">
                  <SecimAra deger={form.hedef_warehouse_id} secenekler={depoSecenek}
                    onSec={v => setForm(f => ({ ...f, hedef_warehouse_id: v }))} bos="Hedef seçin" />
                </Alan>
              )}
              <Alan etiket={form.tip === "sayim" ? "Sayılan Miktar" : "Miktar"} zorunlu genislik="150px"
                ipucu={form.tip === "sayim" ? "Bakiye bu değere eşitlenir" : undefined}>
                <Giris value={form.miktar} onChange={e => setForm(f => ({ ...f, miktar: e.target.value }))}
                  placeholder="0" />
              </Alan>
            </Satir>

            {["cikis", "sarf"].includes(form.tip) && (
              <Alan etiket="Proje" ipucu="Seçilirse malzeme bedeli bu projenin maliyetine yazılır">
                <SecimAra deger={form.project_id} secenekler={projeSecenek}
                  onSec={v => setForm(f => ({ ...f, project_id: v }))} bos="Projeye bağlama" />
              </Alan>
            )}

            {["giris", "cikis", "sarf", "iade"].includes(form.tip) && (
              <Satir>
                <Alan etiket="Birim Maliyet" genislik="160px"
                  ipucu={form.project_id ? "Proje maliyetine bu değerle yazılır" : undefined}>
                  <Giris value={form.birim_maliyet}
                    onChange={e => setForm(f => ({ ...f, birim_maliyet: e.target.value }))} placeholder="0,00" />
                </Alan>
                <Alan etiket="Para Birimi" genislik="130px">
                  <Secim value={form.cur} bos={false} secenekler={CURLAR}
                    onChange={e => setForm(f => ({ ...f, cur: e.target.value }))} />
                </Alan>
                {form.cur !== "TRY" && (
                  <Alan etiket="Kur" genislik="130px" ipucu="İşlem anında sabitlenir">
                    <Giris value={form.kur} onChange={e => setForm(f => ({ ...f, kur: e.target.value }))} placeholder="0,0000" />
                  </Alan>
                )}
                <Alan etiket="Lot / Parti" genislik="150px">
                  <Giris value={form.lot_no} onChange={e => setForm(f => ({ ...f, lot_no: e.target.value }))} />
                </Alan>
                <Alan etiket="Seri No" genislik="150px">
                  <Giris value={form.seri_no} onChange={e => setForm(f => ({ ...f, seri_no: e.target.value }))} />
                </Alan>
              </Satir>
            )}

            <Alan etiket="Açıklama">
              <Metin value={form.aciklama} satir={2}
                onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))}
                placeholder="Neden giriş/çıkış yapıldı, hangi işe gitti…" />
            </Alan>
          </div>
        )}
      </Modal>

      {/* ── DEPO FORMU ── */}
      <Modal acik={!!depoForm} onKapat={() => setDepoForm(null)} genislik={560}
        baslik={depoForm?.id ? "Depoyu Düzenle" : "Yeni Depo"}
        altBar={<>
          <Btn onClick={() => setDepoForm(null)}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={depoKaydet} disabled={kay}>{kay ? "Kaydediliyor…" : "Kaydet"}</Btn>
        </>}>
        {depoForm && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Satir>
              <Alan etiket="Kod" zorunlu genislik="130px">
                <Giris value={depoForm.kod} onChange={e => setDepoForm(f => ({ ...f, kod: e.target.value }))} placeholder="SAHA1" />
              </Alan>
              <Alan etiket="Depo Adı" zorunlu genislik="280px">
                <Giris value={depoForm.ad} onChange={e => setDepoForm(f => ({ ...f, ad: e.target.value }))} />
              </Alan>
              <Alan etiket="Tip" genislik="150px">
                <Secim value={depoForm.tip} bos={false} secenekler={DEPO_TIPI}
                  onChange={e => setDepoForm(f => ({ ...f, tip: e.target.value }))} />
              </Alan>
            </Satir>
            {depoForm.tip === "saha" && (
              <Alan etiket="Bağlı Proje" ipucu="Saha deposu bir projeye bağlanabilir">
                <SecimAra deger={depoForm.project_id} secenekler={projeSecenek}
                  onSec={v => setDepoForm(f => ({ ...f, project_id: v }))} bos="Bağlı değil" />
              </Alan>
            )}
            <Alan etiket="Adres">
              <Metin value={depoForm.adres || ""} satir={2}
                onChange={e => setDepoForm(f => ({ ...f, adres: e.target.value }))} />
            </Alan>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={depoForm.aktif !== false}
                onChange={e => setDepoForm(f => ({ ...f, aktif: e.target.checked }))} />
              Depo aktif
            </label>
          </div>
        )}
      </Modal>

      {/* ── HAREKET GEÇMİŞİ ── */}
      <Modal acik={!!gecmis} onKapat={() => setGecmis(null)} genislik={820}
        baslik="Hareket Geçmişi" aciklama={gecmis?.ad}
        altBar={<Btn onClick={() => setGecmis(null)}>Kapat</Btn>}>
        {!gecmisHareketleri.length ? (
          <Bos ikon="⇄" baslik="Son 400 hareket içinde bu malzemeye ait kayıt yok" />
        ) : (
          <Tablo veri={gecmisHareketleri}
            sutunlar={[
              { anahtar: "created_at", baslik: "Tarih", genislik: 130, render: r => fmtTarihSaat(r.created_at) },
              { anahtar: "tip", baslik: "Tip", genislik: 100,
                render: r => {
                  const [, ad, , renk, zemin] = HAREKET.find(h => h[0] === r.tip) || ["", r.tip, "", T.renk.metinSoluk, "#f1f5f9"];
                  return <Rozet renk={renk} zemin={zemin}>{ad}</Rozet>;
                }},
              { anahtar: "depo", baslik: "Depo", genislik: 120,
                render: r => r.tip === "transfer" ? `${depoAd(r.warehouse_id)} → ${depoAd(r.hedef_warehouse_id)}` : depoAd(r.warehouse_id) },
              { anahtar: "miktar", baslik: "Miktar", hizala: "right", genislik: 100,
                render: r => {
                  const [, , isaret, renk] = HAREKET.find(h => h[0] === r.tip) || ["", "", "", T.renk.metin];
                  return <span style={{ fontWeight: 650, color: renk }}>{isaret}{fmtSayi(r.miktar)}</span>;
                }},
              { anahtar: "proje", baslik: "Proje", genislik: 120, render: r => r.proje?.proje_kodu || "—" },
              { anahtar: "aciklama", baslik: "Açıklama", render: r => r.aciklama || "—" },
            ]} />
        )}
      </Modal>
    </>
  );
}
