// ─────────────────────────────────────────────────────────────────────────────
// SATIN ALMA
// Zincir: Talep → onay → Sipariş → Mal kabul → depo girişi
// Sipariş anındaki kur satırda sabitlenir; sonradan kur değişse de sipariş
// bedeli değişmez (ESATLAS'taki doğru davranış korundu).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from "react";
import { api, nextDocNo, logAudit } from "../services/api";
import { T, DURUM_ETIKET } from "../ui/theme";
import { Kart, Baslik, Btn, Rozet, Tablo, Modal, Alan, Giris, Metin, Secim, Satir,
         Arama, Sekmeler, Olcum, Bos, OnayModal, SecimAra,
         fmtPara, fmtSayi, fmtTarih, parseSayi, sayiMetni, bugun, eslesir } from "../ui/kit";

const TALEP_DURUM = ["taslak", "onay_bekliyor", "onaylandi", "reddedildi", "siparise_donustu", "kapandi"]
  .map(d => [d, DURUM_ETIKET[d] || d]);
const SIPARIS_DURUM = ["taslak", "gonderildi", "onaylandi", "kismi_teslim", "teslim_alindi", "iptal"]
  .map(d => [d, DURUM_ETIKET[d] || d]);
const ACILIYET = [["normal", "Normal"], ["acil", "Acil"], ["kritik", "Kritik"]];
const CURLAR = [["EUR", "€ EUR"], ["USD", "$ USD"], ["TRY", "₺ TL"], ["GBP", "£ GBP"]];

export default function SatinAlma({ profil, yetkiVar, goster }) {
  const [talepler, setTalepler] = useState([]);
  const [siparisler, setSip]    = useState([]);
  const [malzemeler, setMlz]    = useState([]);
  const [projeler, setProjeler] = useState([]);
  const [tedarikciler, setTed]  = useState([]);
  const [depolar, setDepolar]   = useState([]);
  const [bakiye, setBakiye]     = useState([]);
  const [yuk, setYuk]           = useState(true);
  const [sekme, setSekme]       = useState("siparis");
  const [ara, setAra]           = useState("");
  const [fDurum, setFDurum]     = useState("");
  const [talepForm, setTalepForm] = useState(null);
  const [sipForm, setSipForm]   = useState(null);
  const [kabulForm, setKabul]   = useState(null);
  const [kay, setKay]           = useState(false);
  const [silinecek, setSil]     = useState(null);

  const ekleyebilir   = yetkiVar("satinalma", "ekle");
  const duzenleyebilir = yetkiVar("satinalma", "duzenle");
  const onaylayabilir  = yetkiVar("satinalma", "onayla") || yetkiVar("proje", "onayla");

  const yukle = useCallback(async () => {
    setYuk(true);
    try {
      const [t, tl, s, sl, m, p, c, w, b] = await Promise.all([
        api.list("purchase_requests", { select: "*,proje:projects(proje_kodu,proje_adi)",
                                        order: "id.desc", limit: 300 }),
        api.list("purchase_request_lines", { limit: 3000 }),
        api.list("purchase_orders", { select: "*,tedarikci:companies(unvan),proje:projects(proje_kodu,proje_adi)",
                                      order: "id.desc", limit: 300 }),
        api.list("purchase_order_lines", { limit: 3000 }),
        api.list("materials", { select: "id,malzeme_kodu,malzeme_adi,birim", eq: { aktif: true },
                                order: "malzeme_kodu.asc", limit: 5000 }),
        api.list("projects", { select: "id,proje_kodu,proje_adi,durum", order: "proje_kodu.desc", limit: 500 }),
        api.list("companies", { select: "id,kod,unvan,varsayilan_cur", eq: { aktif: true },
                                in: { tip: ["tedarikci", "her_ikisi", "taseron"] }, order: "unvan.asc", limit: 2000 }),
        api.list("warehouses", { order: "kod.asc" }),
        api.list("stock_balances", { select: "material_id,miktar", limit: 20000 }).catch(() => []),
      ]);
      setTalepler(t.map(x => ({ ...x, kalemler: tl.filter(l => l.request_id === x.id) })));
      setSip(s.map(x => ({ ...x, kalemler: sl.filter(l => l.order_id === x.id) })));
      setMlz(m); setProjeler(p); setTed(c); setDepolar(w); setBakiye(b);
    } catch (e) { goster("Satın alma verisi yüklenemedi: " + e.message, "hata"); }
    finally { setYuk(false); }
  }, [goster]);

  useEffect(() => { yukle(); }, [yukle]);

  const stokMap = useMemo(() => {
    const h = {};
    bakiye.forEach(b => { h[b.material_id] = (h[b.material_id] || 0) + Number(b.miktar || 0); });
    return h;
  }, [bakiye]);
  const mlzMap = useMemo(() => Object.fromEntries(malzemeler.map(m => [m.id, m])), [malzemeler]);

  const malzemeSecenek = useMemo(() => malzemeler.map(m => ({
    deger: m.id, etiket: `${m.malzeme_kodu} · ${m.malzeme_adi}`, alt: m.birim })), [malzemeler]);
  const projeSecenek = useMemo(() => projeler.filter(p => p.durum !== "iptal")
    .map(p => ({ deger: p.id, etiket: `${p.proje_kodu} · ${p.proje_adi}` })), [projeler]);
  const tedSecenek = useMemo(() => tedarikciler.map(c => ({
    deger: c.id, etiket: c.unvan, alt: c.kod })), [tedarikciler]);

  // ── Filtreleme ────────────────────────────────────────────────────────────
  const gorunenTalep = useMemo(() => talepler.filter(t => {
    if (fDurum && t.durum !== fDurum) return false;
    if (ara && !(eslesir(t.talep_no, ara) || eslesir(t.proje?.proje_kodu, ara)
              || eslesir(t.proje?.proje_adi, ara) || eslesir(t.aciklama, ara))) return false;
    return true;
  }), [talepler, ara, fDurum]);

  const gorunenSip = useMemo(() => siparisler.filter(s => {
    if (fDurum && s.durum !== fDurum) return false;
    if (ara && !(eslesir(s.siparis_no, ara) || eslesir(s.tedarikci?.unvan, ara)
              || eslesir(s.proje?.proje_kodu, ara))) return false;
    return true;
  }), [siparisler, ara, fDurum]);

  const acikSiparisler = useMemo(() =>
    siparisler.filter(s => ["gonderildi", "onaylandi", "kismi_teslim"].includes(s.durum)),
    [siparisler]);

  const bugunTs = new Date().setHours(0, 0, 0, 0);
  const geciken = acikSiparisler.filter(s => s.termin && new Date(s.termin) < bugunTs).length;
  const bekleyenTalep = talepler.filter(t => t.durum === "onay_bekliyor").length;

  // ── Talep ─────────────────────────────────────────────────────────────────
  async function talepAc() {
    let no = "";
    try { no = await nextDocNo("TLP"); } catch { no = `TLP-${Date.now()}`; }
    setTalepForm({
      talep_no: no, project_id: "", ihtiyac_tarihi: "", aciliyet: "normal",
      durum: "taslak", aciklama: "",
      kalemler: [{ material_id: "", serbest_aciklama: "", miktar: "", notlar: "" }],
    });
  }

  async function talepKaydet() {
    const f = talepForm;
    const dolu = f.kalemler.filter(k => k.material_id || k.serbest_aciklama?.trim());
    if (!dolu.length) return goster("En az bir kalem girilmeli.", "hata");
    if (dolu.some(k => !(parseSayi(k.miktar) > 0))) return goster("Her kalemin miktarı sıfırdan büyük olmalı.", "hata");
    setKay(true);
    try {
      const govde = {
        talep_no: f.talep_no.trim(), project_id: f.project_id ? Number(f.project_id) : null,
        talep_eden_id: profil?.id || null, tarih: f.tarih || bugun(),
        ihtiyac_tarihi: f.ihtiyac_tarihi || null, aciliyet: f.aciliyet,
        durum: f.durum, aciklama: f.aciklama || null,
      };
      let id = f.id;
      if (id) {
        // Önce satırlar, en son başlık — satır işlemi hata verirse başlık eski
        // hâlinde kalır (yarım güncelleme deseni düzeltildi).
        await api.remove("purchase_request_lines", `request_id=eq.${id}`);
      } else {
        const yeni = await api.insert("purchase_requests", govde);
        id = yeni?.id;
      }
      await api.insertMany("purchase_request_lines", dolu.map(k => {
        const miktar = parseSayi(k.miktar) || 0;
        const stok = k.material_id ? (stokMap[k.material_id] || 0) : 0;
        return {
          request_id: id, material_id: k.material_id ? Number(k.material_id) : null,
          serbest_aciklama: k.serbest_aciklama || null, miktar,
          birim: k.material_id ? (mlzMap[k.material_id]?.birim || "Adet") : "Adet",
          stok_miktar: stok, eksik_miktar: Math.max(0, miktar - stok),
          ihtiyac_tarihi: f.ihtiyac_tarihi || null, durum: f.durum, notlar: k.notlar || null,
        };
      }));
      if (f.id) await api.update("purchase_requests", id, govde); // başlık en son
      logAudit({ tablo: "purchase_requests", kayit_id: id, islem: f.id ? "update" : "insert", aciklama: govde.talep_no });
      goster(f.id ? "Talep güncellendi." : "Talep oluşturuldu.", "basari");
      setTalepForm(null); yukle();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  async function talepDurum(t, durum) {
    try {
      await api.update("purchase_requests", t.id, { durum });
      await api.update("purchase_request_lines", `request_id=eq.${t.id}`, { durum }).catch(() => {});
      logAudit({ tablo: "purchase_requests", kayit_id: t.id, islem: "update", aciklama: `durum → ${durum}` });
      goster(`Talep ${DURUM_ETIKET[durum]?.toLocaleLowerCase("tr-TR") || durum}.`, "basari");
      yukle();
    } catch (e) { goster(e.message, "hata"); }
  }

  // ── Sipariş ───────────────────────────────────────────────────────────────
  async function siparisAc(talepten) {
    let no = "";
    try { no = await nextDocNo("SPR"); } catch { no = `SPR-${Date.now()}`; }
    setSipForm({
      siparis_no: no,
      tedarikci_id: "", project_id: talepten?.project_id || "",
      request_id: talepten?.id || null,
      tarih: bugun(), termin: talepten?.ihtiyac_tarihi || "", durum: "taslak",
      cur: "EUR", kur: "", nakliye_bedeli: "", gumruk_bedeli: "",
      odeme_sarti: "", teslim_yeri: "", notlar: "",
      kalemler: talepten
        ? talepten.kalemler.map(k => ({
            material_id: k.material_id || "", serbest_aciklama: k.serbest_aciklama || "",
            miktar: String(k.eksik_miktar > 0 ? k.eksik_miktar : k.miktar),
            birim_fiyat: "", kdv_yuzde: 20, notlar: "",
          }))
        : [{ material_id: "", serbest_aciklama: "", miktar: "", birim_fiyat: "", kdv_yuzde: 20, notlar: "" }],
    });
  }

  const sipToplam = useMemo(() => {
    if (!sipForm) return { ara: 0, kdv: 0, genel: 0 };
    let a = 0, k = 0;
    sipForm.kalemler.forEach(l => {
      const t = (parseSayi(l.miktar) || 0) * (parseSayi(l.birim_fiyat) || 0);
      a += t; k += t * (parseSayi(l.kdv_yuzde) || 0) / 100;
    });
    const ek = (parseSayi(sipForm.nakliye_bedeli) || 0) + (parseSayi(sipForm.gumruk_bedeli) || 0);
    return { ara: a + ek, kdv: k, genel: a + ek + k };
  }, [sipForm]);

  async function siparisKaydet() {
    const f = sipForm;
    if (!f.tedarikci_id) return goster("Tedarikçi seçilmeli.", "hata");
    const dolu = f.kalemler.filter(k => k.material_id || k.serbest_aciklama?.trim());
    if (!dolu.length) return goster("En az bir kalem girilmeli.", "hata");
    if (dolu.some(k => !(parseSayi(k.miktar) > 0))) return goster("Her kalemin miktarı sıfırdan büyük olmalı.", "hata");
    if (f.cur !== "TRY" && !(parseSayi(f.kur) > 0))
      return goster("Yabancı para siparişinde kur girilmeli (sipariş anındaki değer sabitlenir).", "hata");
    setKay(true);
    try {
      const govde = {
        siparis_no: f.siparis_no.trim(),
        tedarikci_id: Number(f.tedarikci_id),
        project_id: f.project_id ? Number(f.project_id) : null,
        request_id: f.request_id || null,
        tarih: f.tarih, termin: f.termin || null, durum: f.durum,
        cur: f.cur, kur: f.cur === "TRY" ? null : parseSayi(f.kur),
        ara_toplam: sipToplam.ara, kdv_tutar: sipToplam.kdv, genel_toplam: sipToplam.genel,
        nakliye_bedeli: parseSayi(f.nakliye_bedeli) || 0,
        gumruk_bedeli: parseSayi(f.gumruk_bedeli) || 0,
        odeme_sarti: f.odeme_sarti || null, teslim_yeri: f.teslim_yeri || null,
        notlar: f.notlar || null, created_by: profil?.id || null,
      };
      let id = f.id;
      if (id) {
        // Mal kabul görmüş siparişin kalemleri "sil→yeniden ekle" ile YAZILAMAZ:
        // goods_receipt_lines FK'sı silmeyi engeller ve akış yarıda kalıp başlıkta
        // yeni, satırlarda eski değer bırakıyordu. Ayrıca satırlar yeni id alınca
        // mal kabul izlenebilirliği kopar. Böyle siparişte yalnız başlık güncellenir.
        const teslimli = (f.kalemler || []).some(k => Number(k.teslim_alinan) > 0);
        if (teslimli) {
          await api.update("purchase_orders", id, govde);
          logAudit({ tablo: "purchase_orders", kayit_id: id, islem: "update", aciklama: govde.siparis_no });
          goster("Mal kabul görmüş siparişte kalemler değiştirilemez; başlık bilgileri güncellendi.", "basari");
          setSipForm(null); yukle();
          return;
        }
        // Önce satırlar, en son başlık: satır işlemi hata verirse başlık eski
        // hâlinde kalır, kayıt tutarsızlaşmaz.
        await api.remove("purchase_order_lines", `order_id=eq.${id}`);
      } else {
        const yeni = await api.insert("purchase_orders", govde);
        id = yeni?.id;
      }
      await api.insertMany("purchase_order_lines", dolu.map((k, i) => {
        const miktar = parseSayi(k.miktar) || 0, fiyat = parseSayi(k.birim_fiyat) || 0;
        return {
          order_id: id, sira: i + 1,
          material_id: k.material_id ? Number(k.material_id) : null,
          serbest_aciklama: k.serbest_aciklama || null,
          miktar, birim: k.material_id ? (mlzMap[k.material_id]?.birim || "Adet") : "Adet",
          birim_fiyat: fiyat, kdv_yuzde: parseSayi(k.kdv_yuzde) || 0,
          toplam: miktar * fiyat, teslim_alinan: k.teslim_alinan || 0,
          termin: f.termin || null, notlar: k.notlar || null,
        };
      }));
      if (f.id) await api.update("purchase_orders", id, govde); // başlık en son
      if (f.request_id) await api.update("purchase_requests", f.request_id, { durum: "siparise_donustu" }).catch(() => {});
      logAudit({ tablo: "purchase_orders", kayit_id: id, islem: f.id ? "update" : "insert", aciklama: govde.siparis_no });
      goster(f.id ? "Sipariş güncellendi." : "Sipariş oluşturuldu.", "basari");
      setSipForm(null); yukle();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  async function siparisDurum(s, durum) {
    try {
      await api.update("purchase_orders", s.id, { durum });
      goster(`Sipariş ${DURUM_ETIKET[durum]?.toLocaleLowerCase("tr-TR") || durum}.`, "basari");
      yukle();
    } catch (e) { goster(e.message, "hata"); }
  }

  // ── Mal kabul ─────────────────────────────────────────────────────────────
  function kabulAc(s) {
    setKabul({
      order: s, warehouse_id: "", tarih: bugun(),
      irsaliye_no: "", fatura_no: "", notlar: "",
      satirlar: s.kalemler.map(k => ({
        ...k,
        kalan: Number(k.miktar || 0) - Number(k.teslim_alinan || 0),
        gelen: String(Math.max(0, Number(k.miktar || 0) - Number(k.teslim_alinan || 0))),
        lot_no: "", seri_no: "",
      })),
    });
  }

  async function kabulKaydet() {
    const f = kabulForm;
    if (!f.warehouse_id) return goster("Depo seçilmeli.", "hata");
    const gelenler = f.satirlar.filter(s => (parseSayi(s.gelen) || 0) > 0);
    if (!gelenler.length) return goster("En az bir kalemde gelen miktar girilmeli.", "hata");
    const fazla = gelenler.find(s => (parseSayi(s.gelen) || 0) > s.kalan);
    if (fazla) return goster(`Bir kalemde kalan miktardan fazla giriş yapılamaz (kalan: ${fmtSayi(fazla.kalan)}).`, "hata");

    setKay(true);
    try {
      let kabulNo = "";
      try { kabulNo = await nextDocNo("MKB"); } catch { kabulNo = `MKB-${Date.now()}`; }
      const kabul = await api.insert("goods_receipts", {
        kabul_no: kabulNo, order_id: f.order.id, warehouse_id: Number(f.warehouse_id),
        tarih: f.tarih, irsaliye_no: f.irsaliye_no || null, fatura_no: f.fatura_no || null,
        teslim_alan_id: profil?.id || null, notlar: f.notlar || null,
      });

      for (const s of gelenler) {
        const gelen = parseSayi(s.gelen) || 0;
        await api.insert("goods_receipt_lines", {
          receipt_id: kabul.id, order_line_id: s.id, material_id: s.material_id || null,
          miktar: gelen, kabul_edilen: gelen, red_edilen: 0,
          lot_no: s.lot_no || null, seri_no: s.seri_no || null,
        });
        await api.update("purchase_order_lines", s.id,
          { teslim_alinan: Number(s.teslim_alinan || 0) + gelen });

        // Malzeme kartı olan kalemler depoya girer; serbest kalemler yalnızca
        // sipariş üzerinde takip edilir (stok kartı yoktur).
        if (s.material_id) {
          await api.insert("stock_moves", {
            material_id: s.material_id, warehouse_id: Number(f.warehouse_id),
            project_id: f.order.project_id || null, tip: "giris", miktar: gelen,
            birim_maliyet: s.birim_fiyat || null, cur: f.order.cur, kur: f.order.kur,
            lot_no: s.lot_no || null, seri_no: s.seri_no || null,
            belge_tipi: "goods_receipt", belge_id: kabul.id,
            aciklama: `${f.order.siparis_no} mal kabulü${f.irsaliye_no ? ` · irsaliye ${f.irsaliye_no}` : ""}`,
            user_email: profil?.email || null, user_id: profil?.id || null,
          });
        }
      }

      // Tüm kalemler tamamlandı mı?
      const tamam = f.satirlar.every(s => {
        const yeni = Number(s.teslim_alinan || 0) + (parseSayi(s.gelen) || 0);
        return yeni >= Number(s.miktar || 0);
      });
      await api.update("purchase_orders", f.order.id, { durum: tamam ? "teslim_alindi" : "kismi_teslim" });

      logAudit({ tablo: "goods_receipts", kayit_id: kabul.id, islem: "insert",
                 aciklama: `${f.order.siparis_no} · ${gelenler.length} kalem` });
      goster(tamam ? "Sipariş tamamen teslim alındı." : "Kısmi mal kabulü kaydedildi.", "basari");
      setKabul(null); yukle();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  async function sil() {
    try {
      const { tablo, id } = silinecek;
      await api.remove(tablo, id);
      goster("Kayıt silindi.", "basari"); setSil(null); yukle();
    } catch (e) { goster(e.message, "hata"); setSil(null); }
  }

  return (
    <>
      <Baslik ust="Tedarik Zinciri" aciklama="Talep → onay → sipariş → mal kabul"
        sag={<>
          <Btn onClick={yukle} disabled={yuk}>{yuk ? "Yenileniyor…" : "Yenile"}</Btn>
          {ekleyebilir && sekme === "talep" && <Btn tur="birincil" ikon="＋" onClick={talepAc}>Yeni Talep</Btn>}
          {ekleyebilir && sekme !== "talep" && <Btn tur="birincil" ikon="＋" onClick={() => siparisAc(null)}>Yeni Sipariş</Btn>}
        </>}>
        Satın Alma
      </Baslik>

      <div style={{ display: "grid", gap: 12, marginBottom: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <Olcum etiket="Açık Sipariş" deger={acikSiparisler.length} ikon="⇩" />
        <Olcum etiket="Termini Geçen" deger={geciken} ikon="⚠"
          renk={geciken ? T.renk.hata : T.renk.basari}
          zemin={geciken ? T.renk.hataAcik : T.renk.basariAcik} />
        <Olcum etiket="Onay Bekleyen Talep" deger={bekleyenTalep} ikon="◷"
          renk={bekleyenTalep ? T.renk.uyari : T.renk.metinSoluk}
          zemin={bekleyenTalep ? T.renk.uyariAcik : "#f1f5f9"} />
        <Olcum etiket="Mal Kabul Bekleyen" deger={acikSiparisler.filter(s => s.durum !== "taslak").length} ikon="▤"
          renk={T.renk.mor} zemin={T.renk.morAcik} />
      </div>

      <Sekmeler aktif={sekme} onDegisim={k => { setSekme(k); setFDurum(""); }} sekmeler={[
        { anahtar: "siparis", baslik: "Siparişler", sayi: siparisler.length },
        { anahtar: "talep",   baslik: "Talepler",   sayi: talepler.length },
        { anahtar: "kabul",   baslik: "Mal Kabul",  sayi: acikSiparisler.length },
      ]} />

      {sekme !== "kabul" && (
        <Kart pad={13} style={{ marginBottom: 14 }}>
          <Satir bosluk={10} style={{ alignItems: "center" }}>
            <Arama deger={ara} onDegisim={setAra}
              yer={sekme === "talep" ? "Talep no, proje…" : "Sipariş no, tedarikçi, proje…"} genislik={300} />
            <div style={{ width: 190 }}>
              <Secim value={fDurum} onChange={e => setFDurum(e.target.value)}
                secenekler={sekme === "talep" ? TALEP_DURUM : SIPARIS_DURUM} bos="Tüm durumlar" />
            </div>
            <div style={{ marginLeft: "auto", fontSize: 12.5, color: T.renk.metinPasif }}>
              {(sekme === "talep" ? gorunenTalep : gorunenSip).length} kayıt
            </div>
          </Satir>
        </Kart>
      )}

      {/* ── SİPARİŞLER ── */}
      {sekme === "siparis" && (
        <Tablo yukleniyor={yuk} veri={gorunenSip}
          onSatirTikla={duzenleyebilir ? s => setSipForm({
            ...s, tedarikci_id: s.tedarikci_id || "", project_id: s.project_id || "",
            kur: sayiMetni(s.kur), nakliye_bedeli: sayiMetni(s.nakliye_bedeli), gumruk_bedeli: sayiMetni(s.gumruk_bedeli),
            kalemler: s.kalemler.length ? s.kalemler.map(k => ({
              ...k, material_id: k.material_id || "", miktar: sayiMetni(k.miktar),
              birim_fiyat: sayiMetni(k.birim_fiyat),
            })) : [{ material_id: "", serbest_aciklama: "", miktar: "", birim_fiyat: "", kdv_yuzde: 20 }],
          }) : undefined}
          bosMesaj="Sipariş yok"
          sutunlar={[
            { anahtar: "siparis_no", baslik: "Sipariş No", genislik: 140,
              render: r => <b style={{ color: T.renk.marka }}>{r.siparis_no}</b> },
            { anahtar: "tedarikci", baslik: "Tedarikçi",
              render: r => (
                <div>
                  <div style={{ fontWeight: 550 }}>{r.tedarikci?.unvan || "—"}</div>
                  <div style={{ fontSize: 11.5, color: T.renk.metinPasif }}>
                    {r.proje?.proje_kodu ? `${r.proje.proje_kodu} · ${r.proje.proje_adi}` : "projesiz"}
                    {" · "}{r.kalemler.length} kalem
                  </div>
                </div>
              )},
            { anahtar: "tarih", baslik: "Tarih", genislik: 100, render: r => fmtTarih(r.tarih) },
            { anahtar: "termin", baslik: "Termin", genislik: 104,
              render: r => {
                const gec = r.termin && new Date(r.termin) < bugunTs
                  && !["teslim_alindi", "iptal"].includes(r.durum);
                return <span style={{ color: gec ? T.renk.hata : T.renk.metin, fontWeight: gec ? 650 : 400 }}>
                  {fmtTarih(r.termin)}</span>;
              }},
            { anahtar: "durum", baslik: "Durum", genislik: 130, render: r => <Rozet durum={r.durum} /> },
            { anahtar: "teslim", baslik: "Teslim", genislik: 110, hizala: "right",
              render: r => {
                const t = r.kalemler.reduce((a, k) => a + Number(k.miktar || 0), 0);
                const a = r.kalemler.reduce((a, k) => a + Number(k.teslim_alinan || 0), 0);
                if (!t) return "—";
                return <span style={{ fontSize: 12.5, color: a >= t ? T.renk.basari : T.renk.metinSoluk }}>
                  {fmtSayi(a)} / {fmtSayi(t)}</span>;
              }},
            { anahtar: "genel_toplam", baslik: "Tutar", hizala: "right", genislik: 130,
              render: r => <b>{fmtPara(r.genel_toplam, r.cur)}</b> },
            { anahtar: "islem", baslik: "", genislik: 110, hizala: "center",
              render: r => (
                <div style={{ display: "flex", gap: 5, justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                  {r.durum === "taslak" && duzenleyebilir &&
                    <Btn boyut="sm" onClick={() => siparisDurum(r, "gonderildi")}>Gönder</Btn>}
                  {["gonderildi", "onaylandi", "kismi_teslim"].includes(r.durum) && ekleyebilir &&
                    <Btn boyut="sm" tur="basari" onClick={() => kabulAc(r)}>Mal Kabul</Btn>}
                </div>
              )},
          ]} />
      )}

      {/* ── TALEPLER ── */}
      {sekme === "talep" && (
        <Tablo yukleniyor={yuk} veri={gorunenTalep}
          onSatirTikla={duzenleyebilir ? t => setTalepForm({
            ...t, project_id: t.project_id || "",
            kalemler: t.kalemler.length ? t.kalemler.map(k => ({
              ...k, material_id: k.material_id || "", miktar: String(k.miktar ?? ""),
            })) : [{ material_id: "", serbest_aciklama: "", miktar: "" }],
          }) : undefined}
          bosMesaj="Talep yok"
          sutunlar={[
            { anahtar: "talep_no", baslik: "Talep No", genislik: 140,
              render: r => <b style={{ color: T.renk.marka }}>{r.talep_no}</b> },
            { anahtar: "proje", baslik: "Proje / Açıklama",
              render: r => (
                <div>
                  <div style={{ fontWeight: 550 }}>
                    {r.proje?.proje_adi || <span style={{ color: T.renk.metinPasif }}>projesiz</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.renk.metinPasif }}>
                    {r.kalemler.length} kalem{r.aciklama ? ` · ${r.aciklama}` : ""}
                  </div>
                </div>
              )},
            { anahtar: "aciliyet", baslik: "Aciliyet", genislik: 100,
              render: r => r.aciliyet === "normal"
                ? <span style={{ fontSize: 12.5, color: T.renk.metinPasif }}>Normal</span>
                : <Rozet renk={r.aciliyet === "kritik" ? T.renk.hata : T.renk.uyari}
                    zemin={r.aciliyet === "kritik" ? T.renk.hataAcik : T.renk.uyariAcik}>
                    {ACILIYET.find(([k]) => k === r.aciliyet)?.[1] || r.aciliyet}</Rozet> },
            { anahtar: "tarih", baslik: "Tarih", genislik: 100, render: r => fmtTarih(r.tarih) },
            { anahtar: "ihtiyac_tarihi", baslik: "İhtiyaç", genislik: 104, render: r => fmtTarih(r.ihtiyac_tarihi) },
            { anahtar: "durum", baslik: "Durum", genislik: 140, render: r => <Rozet durum={r.durum} /> },
            { anahtar: "islem", baslik: "", genislik: 190, hizala: "center",
              render: r => (
                <div style={{ display: "flex", gap: 5, justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                  {r.durum === "taslak" && duzenleyebilir &&
                    <Btn boyut="sm" onClick={() => talepDurum(r, "onay_bekliyor")}>Onaya Gönder</Btn>}
                  {r.durum === "onay_bekliyor" && onaylayabilir && <>
                    <Btn boyut="sm" tur="basari" onClick={() => talepDurum(r, "onaylandi")}>Onayla</Btn>
                    <Btn boyut="sm" tur="tehlike" onClick={() => talepDurum(r, "reddedildi")}>Reddet</Btn>
                  </>}
                  {r.durum === "onaylandi" && ekleyebilir &&
                    <Btn boyut="sm" tur="birincil" onClick={() => siparisAc(r)}>Siparişe Dönüştür</Btn>}
                </div>
              )},
          ]} />
      )}

      {/* ── MAL KABUL ── */}
      {sekme === "kabul" && (
        !acikSiparisler.length ? (
          <Kart><Bos ikon="▤" baslik="Mal kabul bekleyen sipariş yok"
            aciklama="Gönderilmiş veya onaylanmış siparişler burada listelenir." /></Kart>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {acikSiparisler.map(s => {
              const toplam = s.kalemler.reduce((a, k) => a + Number(k.miktar || 0), 0);
              const alinan = s.kalemler.reduce((a, k) => a + Number(k.teslim_alinan || 0), 0);
              const gec = s.termin && new Date(s.termin) < bugunTs;
              return (
                <Kart key={s.id} pad={16}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 14,
                    alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                        <b style={{ color: T.renk.marka }}>{s.siparis_no}</b>
                        <Rozet durum={s.durum} />
                        {gec && <Rozet renk={T.renk.hata} zemin={T.renk.hataAcik}>Termin geçti</Rozet>}
                      </div>
                      <div style={{ fontSize: 12.5, color: T.renk.metinSoluk, marginTop: 3 }}>
                        {s.tedarikci?.unvan || "—"}
                        {s.proje?.proje_kodu ? ` · ${s.proje.proje_kodu}` : ""}
                        {" · "}Termin {fmtTarih(s.termin)}
                        {" · "}{fmtSayi(alinan)} / {fmtSayi(toplam)} teslim alındı
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <b style={{ fontSize: 14 }}>{fmtPara(s.genel_toplam, s.cur)}</b>
                      {ekleyebilir && <Btn tur="birincil" boyut="sm" onClick={() => kabulAc(s)}>Mal Kabul</Btn>}
                    </div>
                  </div>
                </Kart>
              );
            })}
          </div>
        )
      )}

      {/* ── TALEP FORMU ── */}
      <Modal acik={!!talepForm} onKapat={() => setTalepForm(null)} genislik={900}
        baslik={talepForm?.id ? "Talebi Düzenle" : "Yeni Satın Alma Talebi"}
        aciklama={talepForm?.talep_no}
        altBar={<>
          {talepForm?.id && yetkiVar("satinalma", "sil") &&
            <Btn tur="tehlike" onClick={() => { setSil({ tablo: "purchase_requests", id: talepForm.id }); setTalepForm(null); }}>Sil</Btn>}
          <Btn onClick={() => setTalepForm(null)}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={talepKaydet} disabled={kay}>{kay ? "Kaydediliyor…" : "Kaydet"}</Btn>
        </>}>
        {talepForm && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Satir>
              <Alan etiket="Talep No" genislik="160px">
                <Giris value={talepForm.talep_no} onChange={e => setTalepForm(f => ({ ...f, talep_no: e.target.value }))} />
              </Alan>
              <Alan etiket="Proje" genislik="280px" ipucu="Boş bırakılırsa genel stok talebi olur">
                <SecimAra deger={talepForm.project_id} secenekler={projeSecenek}
                  onSec={v => setTalepForm(f => ({ ...f, project_id: v }))} bos="Projesiz" />
              </Alan>
              <Alan etiket="İhtiyaç Tarihi" genislik="150px">
                <Giris type="date" value={talepForm.ihtiyac_tarihi || ""}
                  onChange={e => setTalepForm(f => ({ ...f, ihtiyac_tarihi: e.target.value }))} />
              </Alan>
              <Alan etiket="Aciliyet" genislik="140px">
                <Secim value={talepForm.aciliyet} bos={false} secenekler={ACILIYET}
                  onChange={e => setTalepForm(f => ({ ...f, aciliyet: e.target.value }))} />
              </Alan>
            </Satir>

            <KalemTablosu
              baslik="Talep Kalemleri"
              kalemler={talepForm.kalemler}
              malzemeSecenek={malzemeSecenek} stokMap={stokMap}
              stokGoster
              onDegis={k => setTalepForm(f => ({ ...f, kalemler: k }))}
              bosKalem={{ material_id: "", serbest_aciklama: "", miktar: "", notlar: "" }} />

            <Alan etiket="Açıklama">
              <Metin value={talepForm.aciklama || ""} satir={2}
                onChange={e => setTalepForm(f => ({ ...f, aciklama: e.target.value }))} />
            </Alan>
          </div>
        )}
      </Modal>

      {/* ── SİPARİŞ FORMU ── */}
      <Modal acik={!!sipForm} onKapat={() => setSipForm(null)} genislik={980}
        baslik={sipForm?.id ? "Siparişi Düzenle" : "Yeni Satın Alma Siparişi"}
        aciklama={sipForm?.siparis_no}
        altBar={<>
          {sipForm?.id && yetkiVar("satinalma", "sil") &&
            <Btn tur="tehlike" onClick={() => { setSil({ tablo: "purchase_orders", id: sipForm.id }); setSipForm(null); }}>Sil</Btn>}
          <Btn onClick={() => setSipForm(null)}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={siparisKaydet} disabled={kay}>{kay ? "Kaydediliyor…" : "Kaydet"}</Btn>
        </>}>
        {sipForm && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Satir>
              <Alan etiket="Sipariş No" genislik="160px">
                <Giris value={sipForm.siparis_no} onChange={e => setSipForm(f => ({ ...f, siparis_no: e.target.value }))} />
              </Alan>
              <Alan etiket="Tedarikçi" zorunlu genislik="260px">
                <SecimAra deger={sipForm.tedarikci_id} secenekler={tedSecenek}
                  onSec={v => {
                    const c = tedarikciler.find(x => String(x.id) === String(v));
                    setSipForm(f => ({ ...f, tedarikci_id: v, cur: c?.varsayilan_cur || f.cur }));
                  }} bos="Tedarikçi seçin" />
              </Alan>
              <Alan etiket="Proje" genislik="260px">
                <SecimAra deger={sipForm.project_id} secenekler={projeSecenek}
                  onSec={v => setSipForm(f => ({ ...f, project_id: v }))} bos="Projesiz" />
              </Alan>
            </Satir>
            <Satir>
              <Alan etiket="Tarih" genislik="150px">
                <Giris type="date" value={sipForm.tarih}
                  onChange={e => setSipForm(f => ({ ...f, tarih: e.target.value }))} />
              </Alan>
              <Alan etiket="Termin" genislik="150px">
                <Giris type="date" value={sipForm.termin || ""}
                  onChange={e => setSipForm(f => ({ ...f, termin: e.target.value }))} />
              </Alan>
              <Alan etiket="Durum" genislik="160px">
                <Secim value={sipForm.durum} bos={false} secenekler={SIPARIS_DURUM}
                  onChange={e => setSipForm(f => ({ ...f, durum: e.target.value }))} />
              </Alan>
              <Alan etiket="Para Birimi" genislik="130px">
                <Secim value={sipForm.cur} bos={false} secenekler={CURLAR}
                  onChange={e => setSipForm(f => ({ ...f, cur: e.target.value }))} />
              </Alan>
              {sipForm.cur !== "TRY" && (
                <Alan etiket="Kur" zorunlu genislik="140px" ipucu="Sipariş anında sabitlenir">
                  <Giris value={sipForm.kur} onChange={e => setSipForm(f => ({ ...f, kur: e.target.value }))}
                    placeholder="0,0000" />
                </Alan>
              )}
            </Satir>

            <KalemTablosu
              baslik="Sipariş Kalemleri" fiyatli cur={sipForm.cur}
              kalemler={sipForm.kalemler}
              malzemeSecenek={malzemeSecenek} stokMap={stokMap}
              onDegis={k => setSipForm(f => ({ ...f, kalemler: k }))}
              bosKalem={{ material_id: "", serbest_aciklama: "", miktar: "", birim_fiyat: "", kdv_yuzde: 20 }} />

            <Satir>
              <Alan etiket="Nakliye Bedeli" genislik="150px">
                <Giris value={sipForm.nakliye_bedeli}
                  onChange={e => setSipForm(f => ({ ...f, nakliye_bedeli: e.target.value }))} placeholder="0,00" />
              </Alan>
              <Alan etiket="Gümrük Bedeli" genislik="150px">
                <Giris value={sipForm.gumruk_bedeli}
                  onChange={e => setSipForm(f => ({ ...f, gumruk_bedeli: e.target.value }))} placeholder="0,00" />
              </Alan>
              <Alan etiket="Ödeme Şartı" genislik="200px">
                <Giris value={sipForm.odeme_sarti || ""}
                  onChange={e => setSipForm(f => ({ ...f, odeme_sarti: e.target.value }))} placeholder="60 gün vadeli" />
              </Alan>
              <Alan etiket="Teslim Yeri" genislik="200px">
                <Giris value={sipForm.teslim_yeri || ""}
                  onChange={e => setSipForm(f => ({ ...f, teslim_yeri: e.target.value }))} />
              </Alan>
            </Satir>

            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 16px",
              display: "flex", flexDirection: "column", gap: 5, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: T.renk.metinSoluk }}>
                <span>Ara toplam (nakliye ve gümrük dahil)</span><span>{fmtPara(sipToplam.ara, sipForm.cur)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: T.renk.metinSoluk }}>
                <span>KDV</span><span>{fmtPara(sipToplam.kdv, sipForm.cur)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14.5,
                borderTop: `1px solid ${T.renk.cizgi}`, paddingTop: 7, marginTop: 2 }}>
                <span>Genel toplam</span><span>{fmtPara(sipToplam.genel, sipForm.cur)}</span>
              </div>
              {sipForm.cur !== "TRY" && parseSayi(sipForm.kur) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: T.renk.metinPasif }}>
                  <span>TL karşılığı (kur {fmtSayi(parseSayi(sipForm.kur), 4)})</span>
                  <span>{fmtPara(sipToplam.genel * parseSayi(sipForm.kur), "TRY")}</span>
                </div>
              )}
            </div>

            <Alan etiket="Notlar">
              <Metin value={sipForm.notlar || ""} satir={2}
                onChange={e => setSipForm(f => ({ ...f, notlar: e.target.value }))} />
            </Alan>
          </div>
        )}
      </Modal>

      {/* ── MAL KABUL FORMU ── */}
      <Modal acik={!!kabulForm} onKapat={() => setKabul(null)} genislik={880}
        baslik="Mal Kabul" aciklama={kabulForm && `${kabulForm.order.siparis_no} · ${kabulForm.order.tedarikci?.unvan || ""}`}
        altBar={<>
          <Btn onClick={() => setKabul(null)}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={kabulKaydet} disabled={kay}>{kay ? "İşleniyor…" : "Depoya Al"}</Btn>
        </>}>
        {kabulForm && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Satir>
              <Alan etiket="Depo" zorunlu genislik="220px" ipucu="Gelen malzeme bu depoya girer">
                <SecimAra deger={kabulForm.warehouse_id}
                  secenekler={depolar.filter(d => d.aktif !== false).map(d => ({ deger: d.id, etiket: `${d.kod} · ${d.ad}` }))}
                  onSec={v => setKabul(f => ({ ...f, warehouse_id: v }))} bos="Depo seçin" />
              </Alan>
              <Alan etiket="Kabul Tarihi" genislik="150px">
                <Giris type="date" value={kabulForm.tarih}
                  onChange={e => setKabul(f => ({ ...f, tarih: e.target.value }))} />
              </Alan>
              <Alan etiket="İrsaliye No" genislik="170px">
                <Giris value={kabulForm.irsaliye_no}
                  onChange={e => setKabul(f => ({ ...f, irsaliye_no: e.target.value }))} />
              </Alan>
              <Alan etiket="Fatura No" genislik="170px">
                <Giris value={kabulForm.fatura_no}
                  onChange={e => setKabul(f => ({ ...f, fatura_no: e.target.value }))} />
              </Alan>
            </Satir>

            <div style={{ border: `1px solid ${T.renk.cizgi}`, borderRadius: T.r.md, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 110px 120px 120px",
                gap: 8, padding: "9px 12px", background: "#f8fafc", fontSize: 10.5, fontWeight: 700,
                letterSpacing: ".06em", textTransform: "uppercase", color: T.renk.metinSoluk }}>
                <span>Kalem</span><span style={{ textAlign: "right" }}>Sipariş</span>
                <span style={{ textAlign: "right" }}>Alınan</span><span style={{ textAlign: "right" }}>Kalan</span>
                <span>Gelen</span><span>Lot / Seri</span>
              </div>
              {kabulForm.satirlar.map((s, i) => (
                <div key={s.id || i} style={{ display: "grid",
                  gridTemplateColumns: "1fr 90px 90px 110px 120px 120px", gap: 8,
                  padding: "9px 12px", borderTop: `1px solid ${T.renk.cizgi}`, alignItems: "center",
                  opacity: s.kalan <= 0 ? .5 : 1 }}>
                  <div style={{ fontSize: 12.5, minWidth: 0 }}>
                    <div style={{ fontWeight: 550, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {mlzMap[s.material_id]?.malzeme_adi || s.serbest_aciklama || "—"}
                    </div>
                    <div style={{ fontSize: 11, color: T.renk.metinPasif, fontFamily: "monospace" }}>
                      {mlzMap[s.material_id]?.malzeme_kodu || (s.material_id ? "" : "stok kartı yok")}
                    </div>
                  </div>
                  <span style={{ textAlign: "right", fontSize: 12.5 }}>{fmtSayi(s.miktar)}</span>
                  <span style={{ textAlign: "right", fontSize: 12.5, color: T.renk.metinPasif }}>{fmtSayi(s.teslim_alinan || 0)}</span>
                  <span style={{ textAlign: "right", fontSize: 12.5, fontWeight: 650,
                    color: s.kalan > 0 ? T.renk.uyari : T.renk.basari }}>{fmtSayi(s.kalan)}</span>
                  <Giris value={s.gelen} disabled={s.kalan <= 0}
                    onChange={e => setKabul(f => ({ ...f,
                      satirlar: f.satirlar.map((x, j) => j === i ? { ...x, gelen: e.target.value } : x) }))}
                    style={{ padding: "6px 9px", fontSize: 12.5 }} />
                  <Giris value={s.lot_no} placeholder="lot" disabled={s.kalan <= 0}
                    onChange={e => setKabul(f => ({ ...f,
                      satirlar: f.satirlar.map((x, j) => j === i ? { ...x, lot_no: e.target.value } : x) }))}
                    style={{ padding: "6px 9px", fontSize: 12.5 }} />
                </div>
              ))}
            </div>

            <Alan etiket="Notlar">
              <Metin value={kabulForm.notlar} satir={2}
                onChange={e => setKabul(f => ({ ...f, notlar: e.target.value }))}
                placeholder="Hasar, eksik, kalite kontrolü…" />
            </Alan>

            <div style={{ fontSize: 12.5, color: T.renk.metinPasif, background: "#f8fafc",
              padding: "10px 13px", borderRadius: 8 }}>
              Kaydedilince stok kartı olan kalemler seçilen depoya giriş yapar
              {kabulForm.order.project_id
                ? "; malzeme maliyeti projeye depodan çıkış/sarf yapıldığında düşer" : ""}. Sipariş durumu
              teslim miktarına göre otomatik güncellenir.
            </div>
          </div>
        )}
      </Modal>

      <OnayModal acik={!!silinecek} tehlike onHayir={() => setSil(null)} onEvet={sil}
        baslik="Kayıt silinsin mi?" mesaj="Bu kayıt ve kalemleri kalıcı olarak silinecek." />
    </>
  );
}

// ── Kalem tablosu (talep ve siparişte ortak) ────────────────────────────────
function KalemTablosu({ baslik, kalemler, onDegis, bosKalem, malzemeSecenek,
                        stokMap, stokGoster, fiyatli, cur }) {
  const guncelle = (i, alan, deger) =>
    onDegis(kalemler.map((k, j) => j === i ? { ...k, [alan]: deger } : k));
  const sil = i => onDegis(kalemler.length > 1 ? kalemler.filter((_, j) => j !== i) : [{ ...bosKalem }]);

  const sutunlar = fiyatli
    ? "1fr 100px 120px 80px 120px 36px"
    : (stokGoster ? "1fr 100px 90px 90px 36px" : "1fr 100px 36px");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em",
          textTransform: "uppercase", color: T.renk.metinPasif }}>{baslik}</div>
        <Btn boyut="sm" ikon="＋" onClick={() => onDegis([...kalemler, { ...bosKalem }])}>Kalem Ekle</Btn>
      </div>

      <div style={{ border: `1px solid ${T.renk.cizgi}`, borderRadius: T.r.md, overflow: "visible" }}>
        <div style={{ display: "grid", gridTemplateColumns: sutunlar, gap: 8, padding: "9px 12px",
          background: "#f8fafc", fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em",
          textTransform: "uppercase", color: T.renk.metinSoluk }}>
          <span>Malzeme</span>
          <span style={{ textAlign: "right" }}>Miktar</span>
          {stokGoster && <><span style={{ textAlign: "right" }}>Stok</span><span style={{ textAlign: "right" }}>Eksik</span></>}
          {fiyatli && <><span style={{ textAlign: "right" }}>Birim Fiyat</span>
            <span style={{ textAlign: "right" }}>KDV %</span><span style={{ textAlign: "right" }}>Tutar</span></>}
          <span />
        </div>

        {kalemler.map((k, i) => {
          const miktar = parseSayi(k.miktar) || 0;
          const stok = k.material_id ? (stokMap[k.material_id] || 0) : 0;
          const eksik = Math.max(0, miktar - stok);
          const tutar = miktar * (parseSayi(k.birim_fiyat) || 0);
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: sutunlar, gap: 8,
              padding: "9px 12px", borderTop: `1px solid ${T.renk.cizgi}`, alignItems: "center" }}>
              <div style={{ minWidth: 0 }}>
                <SecimAra deger={k.material_id} secenekler={malzemeSecenek}
                  onSec={v => guncelle(i, "material_id", v)}
                  bos="Serbest kalem (stok kartı yok)" yer="Kod veya ad…" />
                {!k.material_id && (
                  <Giris value={k.serbest_aciklama || ""} placeholder="Kalem açıklaması yazın"
                    onChange={e => guncelle(i, "serbest_aciklama", e.target.value)}
                    style={{ marginTop: 5, padding: "6px 9px", fontSize: 12.5 }} />
                )}
              </div>
              <Giris value={k.miktar} onChange={e => guncelle(i, "miktar", e.target.value)}
                placeholder="0" style={{ padding: "7px 9px", fontSize: 12.5, textAlign: "right" }} />
              {stokGoster && <>
                <span style={{ textAlign: "right", fontSize: 12.5, color: T.renk.metinPasif }}>
                  {k.material_id ? fmtSayi(stok) : "—"}
                </span>
                <span style={{ textAlign: "right", fontSize: 12.5, fontWeight: eksik > 0 ? 650 : 400,
                  color: eksik > 0 ? T.renk.hata : T.renk.basari }}>
                  {k.material_id ? fmtSayi(eksik) : "—"}
                </span>
              </>}
              {fiyatli && <>
                <Giris value={k.birim_fiyat} onChange={e => guncelle(i, "birim_fiyat", e.target.value)}
                  placeholder="0,00" style={{ padding: "7px 9px", fontSize: 12.5, textAlign: "right" }} />
                <Giris value={k.kdv_yuzde} onChange={e => guncelle(i, "kdv_yuzde", e.target.value)}
                  style={{ padding: "7px 9px", fontSize: 12.5, textAlign: "right" }} />
                <span style={{ textAlign: "right", fontSize: 12.5, fontWeight: 600 }}>
                  {tutar ? fmtPara(tutar, cur) : "—"}
                </span>
              </>}
              <button onClick={() => sil(i)} title="Kalemi sil"
                style={{ border: "none", background: "none", cursor: "pointer",
                  color: T.renk.hata, fontSize: 15 }}>×</button>
            </div>
          );
        })}
      </div>

      {stokGoster && kalemler.some(k => k.material_id && (parseSayi(k.miktar) || 0) > (stokMap[k.material_id] || 0)) && (
        <div style={{ fontSize: 12, color: T.renk.metinPasif, marginTop: 7 }}>
          Eksik sütunu, mevcut stok düşüldükten sonra satın alınması gereken miktarı gösterir.
        </div>
      )}
    </div>
  );
}
