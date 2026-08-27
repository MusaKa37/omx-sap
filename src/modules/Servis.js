// ─────────────────────────────────────────────────────────────────────────────
// SERVİS & BAKIM
// İş emri: arıza, periyodik bakım, revizyon, devreye alma, garanti, keşif.
// Kullanılan parçalar iş emrinde tutulur; "stoktan düş" denince depo çıkışı
// oluşturulur ve iş emri bir projeye bağlıysa maliyet oraya yazılır.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from "react";
import { api, nextDocNo, logAudit } from "../services/api";
import { T, DURUM_ETIKET } from "../ui/theme";
import { Kart, Baslik, Btn, Rozet, Tablo, Modal, Alan, Giris, Metin, Secim, Satir,
         Arama, Sekmeler, Olcum, OnayModal, SecimAra,
         fmtPara, fmtTarih, parseSayi, sayiMetni, bugun, eslesir } from "../ui/kit";

const TIP = [
  ["ariza", "Arıza"], ["periyodik_bakim", "Periyodik Bakım"], ["revizyon", "Revizyon"],
  ["devreye_alma", "Devreye Alma"], ["garanti", "Garanti"], ["kesif", "Keşif"],
];
const TIP_AD = Object.fromEntries(TIP);
const TIP_RENK = {
  ariza: [T.renk.hata, T.renk.hataAcik],
  periyodik_bakim: [T.renk.marka, T.renk.markaAcik],
  revizyon: [T.renk.mor, T.renk.morAcik],
  devreye_alma: [T.renk.basari, T.renk.basariAcik],
  garanti: [T.renk.uyari, T.renk.uyariAcik],
  kesif: [T.renk.bilgi, T.renk.bilgiAcik],
};
const DURUM = ["acik", "planlandi", "devam", "musteri_bekliyor", "tamamlandi", "iptal"]
  .map(d => [d, DURUM_ETIKET[d] || d]);
const CURLAR = [["TRY", "₺ TL"], ["EUR", "€ EUR"], ["USD", "$ USD"]];

const BOS = {
  is_emri_no: "", tip: "ariza", durum: "acik", musteri_id: "", equipment_id: "", project_id: "",
  planlanan_tarih: "", teknisyen_id: "", ariza_tanimi: "", tespit: "", yapilan_islem: "",
  sonuc: "", garanti_kapsaminda: false, faturalanacak: true, musteri_onay_ad: "",
  toplam_saat: "", parcalar: [],
};

export default function Servis({ profil, yetkiVar, goster }) {
  const [liste, setListe]       = useState([]);
  const [ekipmanlar, setEkip]   = useState([]);
  const [musteriler, setMus]    = useState([]);
  const [projeler, setProjeler] = useState([]);
  const [malzemeler, setMlz]    = useState([]);
  const [depolar, setDepolar]   = useState([]);
  const [kullanicilar, setKul]  = useState([]);
  const [yuk, setYuk]           = useState(true);
  const [sekme, setSekme]       = useState("acik");
  const [ara, setAra]           = useState("");
  const [fTip, setFTip]         = useState("");
  const [form, setForm]         = useState(null);
  const [kay, setKay]           = useState(false);
  const [silinecek, setSil]     = useState(null);
  const [stokOnay, setStokOnay] = useState(null);

  const ekleyebilir    = yetkiVar("servis", "ekle");
  const duzenleyebilir = yetkiVar("servis", "duzenle");

  const yukle = useCallback(async () => {
    setYuk(true);
    try {
      const [s, sp, e, c, p, m, w, u] = await Promise.all([
        api.list("service_orders", { select: "*,musteri:companies(unvan),ekipman:equipment(kod,ad,saha_adi),proje:projects(proje_kodu)",
                                     order: "talep_tarihi.desc", limit: 500 }),
        api.list("service_order_parts", { limit: 3000 }).catch(() => []),
        api.list("equipment", { select: "id,kod,ad,musteri_id,saha_adi,marka,model", order: "ad.asc", limit: 2000 }).catch(() => []),
        api.list("companies", { select: "id,kod,unvan", eq: { aktif: true },
                                in: { tip: ["musteri", "her_ikisi"] }, order: "unvan.asc", limit: 2000 }),
        api.list("projects", { select: "id,proje_kodu,proje_adi", order: "proje_kodu.desc", limit: 500 }),
        api.list("materials", { select: "id,malzeme_kodu,malzeme_adi,birim", eq: { aktif: true },
                                order: "malzeme_kodu.asc", limit: 5000 }),
        api.list("warehouses", { order: "kod.asc" }).catch(() => []),
        api.list("app_users", { select: "id,ad_soyad,email", eq: { aktif: true }, order: "ad_soyad.asc" }).catch(() => []),
      ]);
      setListe(s.map(x => ({ ...x, parcalar: sp.filter(l => l.service_order_id === x.id) })));
      setEkip(e); setMus(c); setProjeler(p); setMlz(m); setDepolar(w); setKul(u);
    } catch (e) { goster("Servis verisi yüklenemedi: " + e.message, "hata"); }
    finally { setYuk(false); }
  }, [goster]);

  useEffect(() => { yukle(); }, [yukle]);

  const kulMap = useMemo(() => Object.fromEntries(kullanicilar.map(u => [u.id, u])), [kullanicilar]);

  const malzemeSecenek = useMemo(() => malzemeler.map(m => ({
    deger: m.id, etiket: `${m.malzeme_kodu} · ${m.malzeme_adi}`, alt: m.birim })), [malzemeler]);
  const musteriSecenek = useMemo(() => musteriler.map(c => ({ deger: c.id, etiket: c.unvan, alt: c.kod })), [musteriler]);
  const projeSecenek = useMemo(() => projeler.map(p => ({ deger: p.id, etiket: `${p.proje_kodu} · ${p.proje_adi}` })), [projeler]);
  // Müşteri seçiliyse yalnızca o müşterinin ekipmanları
  const ekipmanSecenek = useCallback(musteriId => ekipmanlar
    .filter(e => !musteriId || String(e.musteri_id) === String(musteriId))
    .map(e => ({ deger: e.id, etiket: e.ad, alt: [e.kod, e.saha_adi, e.marka].filter(Boolean).join(" · ") })),
    [ekipmanlar]);

  const acikOlanlar = liste.filter(s => !["tamamlandi", "iptal"].includes(s.durum));

  const gorunen = useMemo(() => {
    const temel = sekme === "acik" ? acikOlanlar
      : sekme === "tamamlanan" ? liste.filter(s => s.durum === "tamamlandi")
      : liste;
    return temel.filter(s => {
      if (fTip && s.tip !== fTip) return false;
      if (ara && !(eslesir(s.is_emri_no, ara) || eslesir(s.musteri?.unvan, ara)
                || eslesir(s.ekipman?.ad, ara) || eslesir(s.ariza_tanimi, ara)
                || eslesir(s.yapilan_islem, ara))) return false;
      return true;
    });
  }, [liste, acikOlanlar, sekme, ara, fTip]);

  const parcaTutar = p => (Number(p.miktar) || 0) * (Number(p.birim_fiyat) || 0);

  async function yeniAc() {
    let no = "";
    try { no = await nextDocNo("SRV"); } catch { no = `SRV-${new Date().getFullYear()}-`; }
    setForm({ ...BOS, is_emri_no: no, planlanan_tarih: bugun(), teknisyen_id: profil?.id || "" });
  }

  async function kaydet() {
    const f = form;
    if (!f.musteri_id) return goster("Müşteri seçilmeli.", "hata");
    if (f.tip === "ariza" && !f.ariza_tanimi?.trim())
      return goster("Arıza iş emrinde arıza tanımı zorunlu.", "hata");
    setKay(true);
    try {
      const govde = {
        is_emri_no: f.is_emri_no.trim(), tip: f.tip, durum: f.durum,
        musteri_id: Number(f.musteri_id),
        equipment_id: f.equipment_id ? Number(f.equipment_id) : null,
        project_id: f.project_id ? Number(f.project_id) : null,
        planlanan_tarih: f.planlanan_tarih || null,
        teknisyen_id: f.teknisyen_id || null,
        ariza_tanimi: f.ariza_tanimi || null, tespit: f.tespit || null,
        yapilan_islem: f.yapilan_islem || null, sonuc: f.sonuc || null,
        garanti_kapsaminda: !!f.garanti_kapsaminda,
        faturalanacak: !!f.faturalanacak,
        musteri_onay_ad: f.musteri_onay_ad || null,
        toplam_saat: parseSayi(f.toplam_saat) || 0,
        bitis: f.durum === "tamamlandi" ? (f.bitis || new Date().toISOString()) : null,
      };
      let id = f.id;
      if (id) {
        // Stoktan düşülmüş parçalar depo hareketiyle eşleşir; silinip yeniden
        // eklenirse yeni id alır, izlenebilirlik kopar. Onlar olduğu gibi korunur,
        // yalnızca düşülmemiş satırlar yeniden yazılır. Başlık EN SON güncellenir
        // ki satır işlemi hata verirse kayıt tutarsız kalmasın.
        await api.remove("service_order_parts", `service_order_id=eq.${id}&stok_dusuldu=eq.false`);
      } else {
        const yeni = await api.insert("service_orders", govde);
        id = yeni?.id;
      }
      const dolu = (f.parcalar || [])
        .filter(p => !p.stok_dusuldu && (p.material_id || p.serbest_aciklama?.trim()));
      if (dolu.length) {
        await api.insertMany("service_order_parts", dolu.map(p => ({
          service_order_id: id,
          material_id: p.material_id ? Number(p.material_id) : null,
          serbest_aciklama: p.serbest_aciklama || null,
          miktar: parseSayi(p.miktar) || 0,
          birim_fiyat: parseSayi(p.birim_fiyat) || 0,
          cur: p.cur || "TRY",
          warehouse_id: p.warehouse_id ? Number(p.warehouse_id) : null,
          stok_dusuldu: false,
        })));
      }
      if (f.id) await api.update("service_orders", id, govde); // başlık en son
      logAudit({ tablo: "service_orders", kayit_id: id, islem: f.id ? "update" : "insert", aciklama: govde.is_emri_no });
      goster(f.id ? "İş emri güncellendi." : "İş emri oluşturuldu.", "basari");
      setForm(null); yukle();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  // Kullanılan parçaları depodan düşer
  async function stoktanDus(s) {
    // stock_moves RLS'i depo.ekle ister; servis.ekle yetmez — buton da gizlenir
    // ama korumayı burada da tekrarla (403'te yarım kalmış işlem olmasın).
    if (!yetkiVar("depo", "ekle"))
      return goster("Stok düşümü için depo modülünde ekleme yetkisi gerekir.", "hata");
    const dusulecek = s.parcalar.filter(p => p.material_id && !p.stok_dusuldu);
    if (!dusulecek.length) return goster("Düşülecek parça yok.", "hata");
    const depoSuz = dusulecek.find(p => !p.warehouse_id);
    if (depoSuz) return goster("Her parça için depo seçilmeli. İş emrini açıp parçalara depo atayın.", "hata");
    setKay(true);
    try {
      for (const p of dusulecek) {
        await api.insert("stock_moves", {
          material_id: p.material_id, warehouse_id: p.warehouse_id,
          project_id: s.project_id || null, tip: "cikis", miktar: p.miktar,
          birim_maliyet: p.birim_fiyat || null, cur: p.cur || "TRY",
          belge_tipi: "service_order", belge_id: s.id,
          aciklama: `${s.is_emri_no} servis işi${s.ekipman?.ad ? ` · ${s.ekipman.ad}` : ""}`,
          user_email: profil?.email || null, user_id: profil?.id || null,
        });
        await api.update("service_order_parts", p.id, { stok_dusuldu: true });
      }
      logAudit({ tablo: "service_orders", kayit_id: s.id, islem: "update",
                 aciklama: `${dusulecek.length} parça stoktan düşüldü` });
      goster(`${dusulecek.length} parça depodan düşüldü.`, "basari");
      setStokOnay(null); yukle();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  async function sil() {
    try {
      await api.remove("service_orders", silinecek.id);
      goster("İş emri silindi.", "basari"); setSil(null); yukle();
    } catch (e) { goster(e.message, "hata"); setSil(null); }
  }

  const bugunTs = new Date().setHours(0, 0, 0, 0);
  const geciken = acikOlanlar.filter(s => s.planlanan_tarih && new Date(s.planlanan_tarih) < bugunTs).length;
  const arizalar = acikOlanlar.filter(s => s.tip === "ariza").length;

  return (
    <>
      <Baslik ust="Saha" aciklama="Arıza, periyodik bakım, revizyon ve devreye alma iş emirleri"
        sag={<>
          <Btn onClick={yukle} disabled={yuk}>{yuk ? "Yenileniyor…" : "Yenile"}</Btn>
          {ekleyebilir && <Btn tur="birincil" ikon="＋" onClick={yeniAc}>Yeni İş Emri</Btn>}
        </>}>
        Servis & Bakım
      </Baslik>

      <div style={{ display: "grid", gap: 12, marginBottom: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <Olcum etiket="Açık İş Emri" deger={acikOlanlar.length} ikon="⚙" />
        <Olcum etiket="Açık Arıza" deger={arizalar} ikon="⚠"
          renk={arizalar ? T.renk.hata : T.renk.basari}
          zemin={arizalar ? T.renk.hataAcik : T.renk.basariAcik} />
        <Olcum etiket="Planlanan Tarihi Geçen" deger={geciken} ikon="◷"
          renk={geciken ? T.renk.uyari : T.renk.basari}
          zemin={geciken ? T.renk.uyariAcik : T.renk.basariAcik} />
        <Olcum etiket="Bu Ay Tamamlanan"
          deger={liste.filter(s => s.durum === "tamamlandi" && s.bitis?.slice(0, 7) === bugun().slice(0, 7)).length}
          ikon="✓" renk={T.renk.mor} zemin={T.renk.morAcik} />
      </div>

      <Sekmeler aktif={sekme} onDegisim={setSekme} sekmeler={[
        { anahtar: "acik", baslik: "Açık İşler", sayi: acikOlanlar.length },
        { anahtar: "tamamlanan", baslik: "Tamamlananlar", sayi: liste.filter(s => s.durum === "tamamlandi").length },
        { anahtar: "hepsi", baslik: "Tümü", sayi: liste.length },
      ]} />

      <Kart pad={13} style={{ marginBottom: 14 }}>
        <Satir bosluk={10} style={{ alignItems: "center" }}>
          <Arama deger={ara} onDegisim={setAra} yer="İş emri no, müşteri, ekipman, arıza…" genislik={320} />
          <div style={{ width: 190 }}>
            <Secim value={fTip} onChange={e => setFTip(e.target.value)} secenekler={TIP} bos="Tüm tipler" />
          </div>
          <div style={{ marginLeft: "auto", fontSize: 12.5, color: T.renk.metinPasif }}>{gorunen.length} kayıt</div>
        </Satir>
      </Kart>

      <Tablo yukleniyor={yuk} veri={gorunen}
        onSatirTikla={duzenleyebilir ? s => setForm({
          ...BOS, ...s, musteri_id: s.musteri_id || "", equipment_id: s.equipment_id || "",
          project_id: s.project_id || "", teknisyen_id: s.teknisyen_id || "",
          toplam_saat: sayiMetni(s.toplam_saat),
          parcalar: (s.parcalar || []).map(p => ({ ...p, material_id: p.material_id || "",
            warehouse_id: p.warehouse_id || "", miktar: sayiMetni(p.miktar),
            birim_fiyat: sayiMetni(p.birim_fiyat) })),
        }) : undefined}
        bosMesaj={ara || fTip ? "Filtreye uyan iş emri yok" : "İş emri yok"}
        sutunlar={[
          { anahtar: "is_emri_no", baslik: "İş Emri", genislik: 130,
            render: r => <b style={{ color: T.renk.marka }}>{r.is_emri_no}</b> },
          { anahtar: "tip", baslik: "Tip", genislik: 140,
            render: r => {
              const [f, b] = TIP_RENK[r.tip] || [T.renk.metinSoluk, "#f1f5f9"];
              return <Rozet renk={f} zemin={b}>{TIP_AD[r.tip] || r.tip}</Rozet>;
            }},
          { anahtar: "musteri", baslik: "Müşteri / Ekipman",
            render: r => (
              <div>
                <div style={{ fontWeight: 550 }}>{r.musteri?.unvan || "—"}</div>
                <div style={{ fontSize: 11.5, color: T.renk.metinPasif }}>
                  {r.ekipman?.ad || "ekipman seçilmedi"}{r.ekipman?.saha_adi ? ` · ${r.ekipman.saha_adi}` : ""}
                </div>
              </div>
            )},
          { anahtar: "ariza_tanimi", baslik: "Konu",
            render: r => <span style={{ fontSize: 12.5, color: T.renk.metinSoluk }}>
              {r.yapilan_islem || r.ariza_tanimi || "—"}</span> },
          { anahtar: "teknisyen_id", baslik: "Teknisyen", genislik: 140,
            render: r => <span style={{ fontSize: 12.5 }}>{kulMap[r.teknisyen_id]?.ad_soyad || "—"}</span> },
          { anahtar: "planlanan_tarih", baslik: "Planlanan", genislik: 108,
            render: r => {
              const gec = r.planlanan_tarih && new Date(r.planlanan_tarih) < bugunTs
                && !["tamamlandi", "iptal"].includes(r.durum);
              return <span style={{ color: gec ? T.renk.hata : T.renk.metin, fontWeight: gec ? 650 : 400 }}>
                {fmtTarih(r.planlanan_tarih)}</span>;
            }},
          { anahtar: "parca", baslik: "Parça", genislik: 110, hizala: "right",
            render: r => {
              if (!r.parcalar?.length) return <span style={{ color: T.renk.metinPasif }}>—</span>;
              const dusulmemis = r.parcalar.filter(p => p.material_id && !p.stok_dusuldu).length;
              return (
                <div style={{ fontSize: 12.5 }}>
                  <div>{r.parcalar.length} kalem</div>
                  {dusulmemis > 0 && <div style={{ fontSize: 11, color: T.renk.uyari, fontWeight: 600 }}>
                    {dusulmemis} düşülmedi</div>}
                </div>
              );
            }},
          { anahtar: "durum", baslik: "Durum", genislik: 140, render: r => <Rozet durum={r.durum} /> },
          { anahtar: "islem", baslik: "", genislik: 120, hizala: "center",
            render: r => {
              const bekleyen = (r.parcalar || []).filter(p => p.material_id && !p.stok_dusuldu).length;
              if (!bekleyen || !ekleyebilir || !yetkiVar("depo", "ekle")) return null;
              return (
                <div onClick={e => e.stopPropagation()}>
                  <Btn boyut="sm" tur="basari" onClick={() => setStokOnay(r)}>Stoktan Düş</Btn>
                </div>
              );
            }},
        ]} />

      {/* ── İŞ EMRİ FORMU ── */}
      <Modal acik={!!form} onKapat={() => setForm(null)} genislik={960}
        baslik={form?.id ? "İş Emrini Düzenle" : "Yeni İş Emri"} aciklama={form?.is_emri_no}
        altBar={<>
          {form?.id && yetkiVar("servis", "sil") &&
            <Btn tur="tehlike" onClick={() => { setSil(form); setForm(null); }}>Sil</Btn>}
          <Btn onClick={() => setForm(null)}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={kaydet} disabled={kay}>{kay ? "Kaydediliyor…" : "Kaydet"}</Btn>
        </>}>
        {form && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Satir>
              <Alan etiket="İş Emri No" genislik="150px">
                <Giris value={form.is_emri_no} onChange={e => setForm(f => ({ ...f, is_emri_no: e.target.value }))} />
              </Alan>
              <Alan etiket="Tip" genislik="180px">
                <Secim value={form.tip} bos={false} secenekler={TIP}
                  onChange={e => setForm(f => ({ ...f, tip: e.target.value }))} />
              </Alan>
              <Alan etiket="Durum" genislik="180px">
                <Secim value={form.durum} bos={false} secenekler={DURUM}
                  onChange={e => setForm(f => ({ ...f, durum: e.target.value }))} />
              </Alan>
              <Alan etiket="Planlanan Tarih" genislik="160px">
                <Giris type="date" value={form.planlanan_tarih || ""}
                  onChange={e => setForm(f => ({ ...f, planlanan_tarih: e.target.value }))} />
              </Alan>
              <Alan etiket="Harcanan Saat" genislik="140px">
                <Giris value={form.toplam_saat}
                  onChange={e => setForm(f => ({ ...f, toplam_saat: e.target.value }))} placeholder="0" />
              </Alan>
            </Satir>

            <Satir>
              <Alan etiket="Müşteri" zorunlu genislik="260px">
                <SecimAra deger={form.musteri_id} secenekler={musteriSecenek}
                  onSec={v => setForm(f => ({ ...f, musteri_id: v, equipment_id: "" }))} bos="Müşteri seçin" />
              </Alan>
              <Alan etiket="Ekipman" genislik="260px"
                ipucu={form.musteri_id ? "Seçili müşterinin ekipmanları" : "Önce müşteri seçin"}>
                <SecimAra deger={form.equipment_id} secenekler={ekipmanSecenek(form.musteri_id)}
                  onSec={v => setForm(f => ({ ...f, equipment_id: v }))} bos="Ekipman seçilmedi"
                  disabled={!form.musteri_id} />
              </Alan>
              <Alan etiket="Teknisyen" genislik="200px">
                <Secim value={form.teknisyen_id} bos="Atanmadı"
                  secenekler={kullanicilar.map(u => [u.id, u.ad_soyad || u.email])}
                  onChange={e => setForm(f => ({ ...f, teknisyen_id: e.target.value }))} />
              </Alan>
              <Alan etiket="Proje" genislik="240px" ipucu="Bağlanırsa maliyet projeye düşer">
                <SecimAra deger={form.project_id} secenekler={projeSecenek}
                  onSec={v => setForm(f => ({ ...f, project_id: v }))} bos="Projesiz" />
              </Alan>
            </Satir>

            <Satir bosluk={20}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={form.garanti_kapsaminda}
                  onChange={e => setForm(f => ({ ...f, garanti_kapsaminda: e.target.checked,
                    faturalanacak: e.target.checked ? false : f.faturalanacak }))} />
                Garanti kapsamında
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={form.faturalanacak}
                  onChange={e => setForm(f => ({ ...f, faturalanacak: e.target.checked }))} />
                Müşteriye faturalanacak
              </label>
            </Satir>

            <Alan etiket={form.tip === "ariza" ? "Arıza Tanımı" : "Talep / Kapsam"}
              zorunlu={form.tip === "ariza"}>
              <Metin value={form.ariza_tanimi || ""} satir={2}
                onChange={e => setForm(f => ({ ...f, ariza_tanimi: e.target.value }))}
                placeholder="Müşterinin bildirdiği durum…" />
            </Alan>
            <Alan etiket="Tespit">
              <Metin value={form.tespit || ""} satir={2}
                onChange={e => setForm(f => ({ ...f, tespit: e.target.value }))}
                placeholder="Sahada ne bulundu, kök neden…" />
            </Alan>
            <Alan etiket="Yapılan İşlem">
              <Metin value={form.yapilan_islem || ""} satir={3}
                onChange={e => setForm(f => ({ ...f, yapilan_islem: e.target.value }))}
                placeholder="Hangi müdahale yapıldı, hangi ayarlar değişti…" />
            </Alan>

            {/* PARÇALAR */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em",
                  textTransform: "uppercase", color: T.renk.metinPasif }}>Kullanılan Parçalar</div>
                <Btn boyut="sm" ikon="＋" onClick={() => setForm(f => ({ ...f,
                  parcalar: [...(f.parcalar || []), { material_id: "", serbest_aciklama: "", miktar: "1",
                    birim_fiyat: "", cur: "TRY", warehouse_id: "", stok_dusuldu: false }] }))}>
                  Parça Ekle</Btn>
              </div>
              {!form.parcalar?.length ? (
                <div style={{ fontSize: 12.5, color: T.renk.metinPasif, background: "#f8fafc",
                  padding: "12px 14px", borderRadius: 9 }}>
                  Parça kullanılmadıysa boş bırakın. Eklenen parçalar iş emri kaydedildikten sonra
                  listeden “Stoktan Düş” ile depodan düşülür.
                </div>
              ) : (
                <div style={{ border: `1px solid ${T.renk.cizgi}`, borderRadius: T.r.md }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 120px 90px 150px 90px 36px",
                    gap: 8, padding: "9px 12px", background: "#f8fafc", fontSize: 10.5, fontWeight: 700,
                    letterSpacing: ".05em", textTransform: "uppercase", color: T.renk.metinSoluk }}>
                    <span>Parça</span><span style={{ textAlign: "right" }}>Miktar</span>
                    <span style={{ textAlign: "right" }}>Birim Fiyat</span><span>Para</span>
                    <span>Depo</span><span style={{ textAlign: "right" }}>Tutar</span><span />
                  </div>
                  {form.parcalar.map((p, i) => {
                    const guncelle = (alan, deger) => setForm(f => ({ ...f,
                      parcalar: f.parcalar.map((x, j) => j === i ? { ...x, [alan]: deger } : x) }));
                    return (
                      <div key={i} style={{ display: "grid",
                        gridTemplateColumns: "1fr 90px 120px 90px 150px 90px 36px", gap: 8,
                        padding: "9px 12px", borderTop: `1px solid ${T.renk.cizgi}`, alignItems: "center" }}>
                        <div style={{ minWidth: 0 }}>
                          <SecimAra deger={p.material_id} secenekler={malzemeSecenek}
                            onSec={v => guncelle("material_id", v)}
                            bos="Serbest kalem" yer="Kod veya ad…" disabled={p.stok_dusuldu} />
                          {!p.material_id && (
                            <Giris value={p.serbest_aciklama || ""} placeholder="Parça açıklaması"
                              onChange={e => guncelle("serbest_aciklama", e.target.value)}
                              style={{ marginTop: 5, padding: "6px 9px", fontSize: 12.5 }} />
                          )}
                          {p.stok_dusuldu && (
                            <div style={{ fontSize: 11, color: T.renk.basari, marginTop: 4 }}>stoktan düşüldü</div>
                          )}
                        </div>
                        <Giris value={p.miktar} disabled={p.stok_dusuldu}
                          onChange={e => guncelle("miktar", e.target.value)}
                          style={{ padding: "7px 9px", fontSize: 12.5, textAlign: "right" }} />
                        <Giris value={p.birim_fiyat} onChange={e => guncelle("birim_fiyat", e.target.value)}
                          placeholder="0,00" style={{ padding: "7px 9px", fontSize: 12.5, textAlign: "right" }} />
                        <Secim value={p.cur} bos={false} secenekler={CURLAR}
                          onChange={e => guncelle("cur", e.target.value)}
                          style={{ padding: "7px 8px", fontSize: 12 }} />
                        <Secim value={p.warehouse_id} bos="Depo yok" disabled={p.stok_dusuldu}
                          secenekler={depolar.map(d => [d.id, d.kod])}
                          onChange={e => guncelle("warehouse_id", e.target.value)}
                          style={{ padding: "7px 8px", fontSize: 12 }} />
                        <span style={{ textAlign: "right", fontSize: 12.5, fontWeight: 600 }}>
                          {parcaTutar({ miktar: parseSayi(p.miktar), birim_fiyat: parseSayi(p.birim_fiyat) })
                            ? fmtPara(parseSayi(p.miktar) * parseSayi(p.birim_fiyat), p.cur) : "—"}
                        </span>
                        <button onClick={() => setForm(f => ({ ...f,
                          parcalar: f.parcalar.filter((_, j) => j !== i) }))}
                          style={{ border: "none", background: "none", cursor: "pointer",
                            color: T.renk.hata, fontSize: 15 }}>×</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Satir>
              <Alan etiket="Sonuç" genislik="360px">
                <Giris value={form.sonuc || ""} onChange={e => setForm(f => ({ ...f, sonuc: e.target.value }))}
                  placeholder="Sorun giderildi / geçici çözüm / parça bekleniyor" />
              </Alan>
              <Alan etiket="Müşteri Onayı (ad soyad)" genislik="240px"
                ipucu="Saha raporunu imzalayan kişi">
                <Giris value={form.musteri_onay_ad || ""}
                  onChange={e => setForm(f => ({ ...f, musteri_onay_ad: e.target.value }))} />
              </Alan>
            </Satir>
          </div>
        )}
      </Modal>

      <OnayModal acik={!!stokOnay} onHayir={() => setStokOnay(null)} onEvet={() => stoktanDus(stokOnay)}
        baslik="Parçalar depodan düşülsün mü?"
        mesaj={stokOnay
          ? `${stokOnay.is_emri_no} iş emrinde kullanılan ${stokOnay.parcalar.filter(p => p.material_id && !p.stok_dusuldu).length} parça için depo çıkışı oluşturulacak${stokOnay.project_id ? " ve proje maliyetine yazılacak" : ""}. Bu işlem geri alınamaz; yanlışlık olursa depodan giriş hareketiyle düzeltilir.`
          : ""} />

      <OnayModal acik={!!silinecek} tehlike onHayir={() => setSil(null)} onEvet={sil}
        baslik="İş emri silinsin mi?"
        mesaj={`"${silinecek?.is_emri_no}" ve parça kalemleri silinecek. Stoktan düşülmüş hareketler geri alınmaz.`} />
    </>
  );
}
