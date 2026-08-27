// ─────────────────────────────────────────────────────────────────────────────
// TEKLİFLER
// Proje bazlı işte zincirin başı. Her kalemin satış fiyatının yanında tahmini
// maliyeti de tutulur; marj teklif gönderilmeden önce görünür.
// Kazanılan teklif tek tuşla projeye dönüşür.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from "react";
import { api, nextDocNo, logAudit } from "../services/api";
import { T, DURUM_ETIKET } from "../ui/theme";
import { Kart, Baslik, Btn, Rozet, Tablo, Modal, Alan, Giris, Metin, Secim, Satir,
         Arama, Olcum, OnayModal, SecimAra,
         fmtPara, fmtSayi, fmtTarih, parseSayi, bugun, eslesir } from "../ui/kit";

const DURUM = ["hazirlaniyor", "gonderildi", "revize", "kazanildi", "kaybedildi", "iptal"]
  .map(d => [d, DURUM_ETIKET[d] || d]);
const CURLAR = [["TRY", "₺ TL"], ["EUR", "€ EUR"], ["USD", "$ USD"], ["GBP", "£ GBP"]];

const BOS_KALEM = { material_id: "", aciklama: "", miktar: "1", birim: "Adet",
                    birim_fiyat: "", birim_maliyet: "", iskonto_yuzde: "", kdv_yuzde: 20 };

export default function Teklif({ profil, yetkiVar, goster }) {
  const [teklifler, setTeklifler] = useState([]);
  const [musteriler, setMus]      = useState([]);
  const [malzemeler, setMlz]      = useState([]);
  const [yuk, setYuk]             = useState(true);
  const [ara, setAra]             = useState("");
  const [fDurum, setFDurum]       = useState("");
  const [form, setForm]           = useState(null);
  const [kay, setKay]             = useState(false);
  const [silinecek, setSil]       = useState(null);
  const [projeOnay, setProjeOnay] = useState(null);
  const [kayipForm, setKayip]     = useState(null);

  const ekleyebilir    = yetkiVar("satis", "ekle");
  const duzenleyebilir = yetkiVar("satis", "duzenle");

  const yukle = useCallback(async () => {
    setYuk(true);
    try {
      const [q, ql, c, m] = await Promise.all([
        api.list("quotes", { select: "*,musteri:companies(unvan,kod),proje:projects(proje_kodu)",
                             order: "id.desc", limit: 500 }),
        api.list("quote_lines", { order: "sira.asc,id.asc", limit: 5000 }).catch(() => []),
        api.list("companies", { select: "id,kod,unvan,varsayilan_cur", eq: { aktif: true },
                                in: { tip: ["musteri", "her_ikisi"] }, order: "unvan.asc", limit: 2000 }),
        api.list("materials", { select: "id,malzeme_kodu,malzeme_adi,birim", eq: { aktif: true },
                                order: "malzeme_kodu.asc", limit: 5000 }),
      ]);
      setTeklifler(q.map(x => ({ ...x, kalemler: ql.filter(l => l.quote_id === x.id) })));
      setMus(c); setMlz(m);
    } catch (e) { goster("Teklifler yüklenemedi: " + e.message, "hata"); }
    finally { setYuk(false); }
  }, [goster]);

  useEffect(() => { yukle(); }, [yukle]);

  const mlzMap = useMemo(() => Object.fromEntries(malzemeler.map(m => [m.id, m])), [malzemeler]);
  const musteriSecenek = useMemo(() => musteriler.map(c => ({ deger: c.id, etiket: c.unvan, alt: c.kod })), [musteriler]);
  const malzemeSecenek = useMemo(() => malzemeler.map(m => ({
    deger: m.id, etiket: `${m.malzeme_kodu} · ${m.malzeme_adi}`, alt: m.birim })), [malzemeler]);

  const gorunen = useMemo(() => teklifler.filter(q => {
    if (fDurum && q.durum !== fDurum) return false;
    if (ara && !(eslesir(q.teklif_no, ara) || eslesir(q.musteri?.unvan, ara)
              || eslesir(q.notlar, ara))) return false;
    return true;
  }), [teklifler, ara, fDurum]);

  // ── Toplamlar ─────────────────────────────────────────────────────────────
  const hesap = useCallback(kalemler => {
    let ara = 0, iskonto = 0, kdv = 0, maliyet = 0;
    (kalemler || []).forEach(k => {
      const m = parseSayi(k.miktar) || 0;
      const brut = m * (parseSayi(k.birim_fiyat) || 0);
      const isk = brut * (parseSayi(k.iskonto_yuzde) || 0) / 100;
      const net = brut - isk;
      ara += brut; iskonto += isk;
      kdv += net * (Number(k.kdv_yuzde) || 0) / 100;
      maliyet += m * (parseSayi(k.birim_maliyet) || 0);
    });
    const netToplam = ara - iskonto;
    return { ara, iskonto, net: netToplam, kdv, genel: netToplam + kdv, maliyet,
             kar: netToplam - maliyet,
             marj: netToplam > 0 ? (netToplam - maliyet) / netToplam * 100 : null };
  }, []);

  const formHesap = useMemo(() => hesap(form?.kalemler), [form, hesap]);

  const kazanilan = teklifler.filter(q => q.durum === "kazanildi");
  const kaybedilen = teklifler.filter(q => q.durum === "kaybedildi");
  const acikTeklif = teklifler.filter(q => ["hazirlaniyor", "gonderildi", "revize"].includes(q.durum));
  const kazanmaOrani = (kazanilan.length + kaybedilen.length) > 0
    ? kazanilan.length / (kazanilan.length + kaybedilen.length) * 100 : null;

  async function yeniAc() {
    let no = "";
    try { no = await nextDocNo("TKF"); } catch { no = `TKF-${new Date().getFullYear()}-`; }
    const gecerlilik = new Date(); gecerlilik.setDate(gecerlilik.getDate() + 30);
    setForm({
      teklif_no: no, musteri_id: "", tarih: bugun(),
      gecerlilik: gecerlilik.toISOString().slice(0, 10),
      durum: "hazirlaniyor", revizyon: 0, cur: "EUR", kur: "",
      teslim_suresi: "", odeme_sarti: "", notlar: "",
      kalemler: [{ ...BOS_KALEM }],
    });
  }

  async function kaydet() {
    const f = form;
    if (!f.musteri_id) return goster("Müşteri seçilmeli.", "hata");
    const dolu = f.kalemler.filter(k => k.aciklama?.trim() || k.material_id);
    if (!dolu.length) return goster("En az bir kalem girilmeli.", "hata");
    setKay(true);
    try {
      const h = hesap(dolu);
      const govde = {
        teklif_no: f.teklif_no.trim(), musteri_id: Number(f.musteri_id),
        tarih: f.tarih, gecerlilik: f.gecerlilik || null,
        durum: f.durum, revizyon: Number(f.revizyon) || 0,
        cur: f.cur, kur: f.cur === "TRY" ? null : (parseSayi(f.kur) || null),
        ara_toplam: h.ara, iskonto: h.iskonto, kdv_tutar: h.kdv, genel_toplam: h.genel,
        tahmini_maliyet: h.maliyet,
        teslim_suresi: f.teslim_suresi || null, odeme_sarti: f.odeme_sarti || null,
        notlar: f.notlar || null, hazirlayan_id: profil?.id || null,
        kayip_nedeni: f.kayip_nedeni || null,
      };
      let id = f.id;
      if (id) {
        await api.update("quotes", id, govde);
        await api.remove("quote_lines", `quote_id=eq.${id}`);
      } else {
        const y = await api.insert("quotes", govde);
        id = y?.id;
      }
      await api.insertMany("quote_lines", dolu.map((k, i) => {
        const m = parseSayi(k.miktar) || 0, fi = parseSayi(k.birim_fiyat) || 0;
        const brut = m * fi;
        return {
          quote_id: id, sira: i + 1,
          material_id: k.material_id ? Number(k.material_id) : null,
          aciklama: (k.aciklama || mlzMap[k.material_id]?.malzeme_adi || "Kalem").trim(),
          miktar: m, birim: k.material_id ? (mlzMap[k.material_id]?.birim || "Adet") : (k.birim || "Adet"),
          birim_fiyat: fi, birim_maliyet: parseSayi(k.birim_maliyet) || 0,
          iskonto_yuzde: parseSayi(k.iskonto_yuzde) || 0,
          kdv_yuzde: Number(k.kdv_yuzde) || 0,
          toplam: brut - brut * (parseSayi(k.iskonto_yuzde) || 0) / 100,
        };
      }));
      logAudit({ tablo: "quotes", kayit_id: id, islem: f.id ? "update" : "insert", aciklama: govde.teklif_no });
      goster(f.id ? "Teklif güncellendi." : "Teklif oluşturuldu.", "basari");
      setForm(null); yukle();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  // Kazanılan teklif → proje
  async function projeyeDonustur(q) {
    setKay(true);
    try {
      let kod = "";
      try { kod = await nextDocNo("OMX"); } catch { kod = `OMX-${Date.now()}`; }
      const proje = await api.insert("projects", {
        proje_kodu: kod,
        proje_adi: q.notlar?.split("\n")[0]?.slice(0, 80) || `${q.musteri?.unvan || "Proje"} · ${q.teklif_no}`,
        musteri_id: q.musteri_id, tip: q.proje_tipi || "plc_hmi", durum: "onay_bekliyor",
        sorumlu_id: profil?.id || null, baslangic: bugun(),
        sozlesme_bedeli: q.genel_toplam, cur: q.cur, sozlesme_kur: q.kur,
        butce_malzeme: Number(q.tahmini_maliyet || 0) * 0.6,
        butce_iscilik: Number(q.tahmini_maliyet || 0) * 0.3,
        butce_diger: Number(q.tahmini_maliyet || 0) * 0.1,
        aciklama: `${q.teklif_no} numaralı tekliften oluşturuldu.\n${q.notlar || ""}`.trim(),
        created_by: profil?.id || null,
      });
      await api.update("quotes", q.id, { durum: "kazanildi", project_id: proje.id });
      logAudit({ tablo: "quotes", kayit_id: q.id, islem: "update", aciklama: `→ proje ${kod}` });
      goster(`${kod} projesi açıldı. Bütçe kalemlerini Projeler ekranından düzenleyin.`, "basari");
      setProjeOnay(null); yukle();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  async function durumDegistir(q, durum, kayip_nedeni) {
    try {
      await api.update("quotes", q.id, { durum, ...(kayip_nedeni ? { kayip_nedeni } : {}) });
      goster(`Teklif ${DURUM_ETIKET[durum]?.toLocaleLowerCase("tr-TR") || durum}.`, "basari");
      setKayip(null); yukle();
    } catch (e) { goster(e.message, "hata"); }
  }

  async function sil() {
    try { await api.remove("quotes", silinecek.id); goster("Teklif silindi.", "basari"); setSil(null); yukle(); }
    catch (e) { goster(e.message, "hata"); setSil(null); }
  }

  return (
    <>
      <Baslik ust="Operasyon" aciklama="Kalem bazlı teklif, maliyet ve marj; kazanılan teklif projeye dönüşür"
        sag={<>
          <Btn onClick={yukle} disabled={yuk}>{yuk ? "Yenileniyor…" : "Yenile"}</Btn>
          {ekleyebilir && <Btn tur="birincil" ikon="＋" onClick={yeniAc}>Yeni Teklif</Btn>}
        </>}>
        Teklifler
      </Baslik>

      <div style={{ display: "grid", gap: 12, marginBottom: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <Olcum etiket="Açık Teklif" deger={acikTeklif.length} ikon="✎"
          alt={`toplam ${teklifler.length} teklif`} />
        <Olcum etiket="Kazanılan" deger={kazanilan.length} ikon="✓"
          renk={T.renk.basari} zemin={T.renk.basariAcik} />
        <Olcum etiket="Kaybedilen" deger={kaybedilen.length} ikon="×"
          renk={T.renk.hata} zemin={T.renk.hataAcik} />
        <Olcum etiket="Kazanma Oranı"
          deger={kazanmaOrani == null ? "—" : `%${fmtSayi(kazanmaOrani, 1)}`} ikon="↗"
          renk={T.renk.mor} zemin={T.renk.morAcik}
          alt={kazanmaOrani == null ? "henüz sonuçlanan teklif yok" : `${kazanilan.length}/${kazanilan.length + kaybedilen.length}`} />
      </div>

      <Kart pad={13} style={{ marginBottom: 14 }}>
        <Satir bosluk={10} style={{ alignItems: "center" }}>
          <Arama deger={ara} onDegisim={setAra} yer="Teklif no, müşteri, not…" genislik={300} />
          <div style={{ width: 180 }}>
            <Secim value={fDurum} onChange={e => setFDurum(e.target.value)} secenekler={DURUM} bos="Tüm durumlar" />
          </div>
          <div style={{ marginLeft: "auto", fontSize: 12.5, color: T.renk.metinPasif }}>{gorunen.length} kayıt</div>
        </Satir>
      </Kart>

      <Tablo yukleniyor={yuk} veri={gorunen}
        onSatirTikla={duzenleyebilir ? q => setForm({
          ...q, musteri_id: q.musteri_id || "", kur: String(q.kur ?? ""),
          kalemler: q.kalemler.length ? q.kalemler.map(k => ({ ...k,
            material_id: k.material_id || "", miktar: String(k.miktar ?? ""),
            birim_fiyat: String(k.birim_fiyat ?? ""), birim_maliyet: String(k.birim_maliyet ?? ""),
            iskonto_yuzde: String(k.iskonto_yuzde ?? "") })) : [{ ...BOS_KALEM }],
        }) : undefined}
        bosMesaj={ara || fDurum ? "Filtreye uyan teklif yok" : "Henüz teklif yok"}
        sutunlar={[
          { anahtar: "teklif_no", baslik: "Teklif No", genislik: 140,
            render: r => (
              <div>
                <b style={{ color: T.renk.marka }}>{r.teklif_no}</b>
                {r.revizyon > 0 && <span style={{ fontSize: 11, color: T.renk.metinPasif }}> · Rev.{r.revizyon}</span>}
              </div>
            )},
          { anahtar: "musteri", baslik: "Müşteri",
            render: r => (
              <div>
                <div style={{ fontWeight: 550 }}>{r.musteri?.unvan || "—"}</div>
                <div style={{ fontSize: 11.5, color: T.renk.metinPasif }}>
                  {r.kalemler.length} kalem
                  {r.proje?.proje_kodu ? ` · ${r.proje.proje_kodu}` : ""}
                </div>
              </div>
            )},
          { anahtar: "tarih", baslik: "Tarih", genislik: 100, render: r => fmtTarih(r.tarih) },
          { anahtar: "gecerlilik", baslik: "Geçerlilik", genislik: 110,
            render: r => {
              if (!r.gecerlilik) return "—";
              const gecti = new Date(r.gecerlilik) < new Date().setHours(0, 0, 0, 0);
              const acikMi = ["hazirlaniyor", "gonderildi", "revize"].includes(r.durum);
              return <span style={{ color: gecti && acikMi ? T.renk.hata : T.renk.metin,
                fontWeight: gecti && acikMi ? 650 : 400 }}>{fmtTarih(r.gecerlilik)}</span>;
            }},
          { anahtar: "durum", baslik: "Durum", genislik: 130, render: r => <Rozet durum={r.durum} /> },
          { anahtar: "tahmini_maliyet", baslik: "Maliyet", hizala: "right", genislik: 125,
            render: r => <span style={{ color: T.renk.metinSoluk }}>{fmtPara(r.tahmini_maliyet, r.cur)}</span> },
          { anahtar: "genel_toplam", baslik: "Teklif", hizala: "right", genislik: 130,
            render: r => <b>{fmtPara(r.genel_toplam, r.cur)}</b> },
          { anahtar: "marj", baslik: "Marj", hizala: "right", genislik: 90,
            render: r => {
              const net = Number(r.genel_toplam || 0) - Number(r.kdv_tutar || 0);
              const mal = Number(r.tahmini_maliyet || 0);
              if (!net) return <span style={{ color: T.renk.metinPasif }}>—</span>;
              const m = (net - mal) / net * 100;
              return <span style={{ fontWeight: 650, color: m >= 20 ? T.renk.basari : m >= 0 ? T.renk.uyari : T.renk.hata }}>
                %{fmtSayi(m, 1)}</span>;
            }},
          { anahtar: "islem", baslik: "", genislik: 190, hizala: "center",
            render: r => (
              <div style={{ display: "flex", gap: 5, justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                {r.durum === "hazirlaniyor" && duzenleyebilir &&
                  <Btn boyut="sm" onClick={() => durumDegistir(r, "gonderildi")}>Gönderildi</Btn>}
                {["gonderildi", "revize"].includes(r.durum) && duzenleyebilir && <>
                  <Btn boyut="sm" tur="basari" onClick={() => setProjeOnay(r)}>Kazanıldı</Btn>
                  <Btn boyut="sm" tur="tehlike" onClick={() => setKayip({ q: r, neden: "" })}>Kaybedildi</Btn>
                </>}
                {r.durum === "kazanildi" && r.project_id &&
                  <span style={{ fontSize: 11.5, color: T.renk.basari }}>projeye dönüştü</span>}
              </div>
            )},
        ]} />

      {/* ── TEKLİF FORMU ── */}
      <Modal acik={!!form} onKapat={() => setForm(null)} genislik={1000}
        baslik={form?.id ? "Teklifi Düzenle" : "Yeni Teklif"} aciklama={form?.teklif_no}
        altBar={<>
          {form?.id && yetkiVar("satis", "sil") &&
            <Btn tur="tehlike" onClick={() => { setSil(form); setForm(null); }}>Sil</Btn>}
          <Btn onClick={() => setForm(null)}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={kaydet} disabled={kay}>{kay ? "Kaydediliyor…" : "Kaydet"}</Btn>
        </>}>
        {form && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Satir>
              <Alan etiket="Teklif No" genislik="160px">
                <Giris value={form.teklif_no} onChange={e => setForm(f => ({ ...f, teklif_no: e.target.value }))} />
              </Alan>
              <Alan etiket="Müşteri" zorunlu genislik="300px">
                <SecimAra deger={form.musteri_id} secenekler={musteriSecenek}
                  onSec={v => {
                    const c = musteriler.find(x => String(x.id) === String(v));
                    setForm(f => ({ ...f, musteri_id: v, cur: c?.varsayilan_cur || f.cur }));
                  }} bos="Müşteri seçin" />
              </Alan>
              <Alan etiket="Tarih" genislik="150px">
                <Giris type="date" value={form.tarih}
                  onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))} />
              </Alan>
              <Alan etiket="Geçerlilik" genislik="150px">
                <Giris type="date" value={form.gecerlilik || ""}
                  onChange={e => setForm(f => ({ ...f, gecerlilik: e.target.value }))} />
              </Alan>
            </Satir>
            <Satir>
              <Alan etiket="Durum" genislik="170px">
                <Secim value={form.durum} bos={false} secenekler={DURUM}
                  onChange={e => setForm(f => ({ ...f, durum: e.target.value }))} />
              </Alan>
              <Alan etiket="Revizyon" genislik="110px">
                <Giris type="number" value={form.revizyon}
                  onChange={e => setForm(f => ({ ...f, revizyon: e.target.value }))} />
              </Alan>
              <Alan etiket="Para Birimi" genislik="130px">
                <Secim value={form.cur} bos={false} secenekler={CURLAR}
                  onChange={e => setForm(f => ({ ...f, cur: e.target.value }))} />
              </Alan>
              {form.cur !== "TRY" && (
                <Alan etiket="Kur" genislik="130px">
                  <Giris value={form.kur} onChange={e => setForm(f => ({ ...f, kur: e.target.value }))} />
                </Alan>
              )}
              <Alan etiket="Teslim Süresi" genislik="180px">
                <Giris value={form.teslim_suresi || ""}
                  onChange={e => setForm(f => ({ ...f, teslim_suresi: e.target.value }))}
                  placeholder="Sipariş tarihinden 8 hafta" />
              </Alan>
              <Alan etiket="Ödeme Şartı" genislik="180px">
                <Giris value={form.odeme_sarti || ""}
                  onChange={e => setForm(f => ({ ...f, odeme_sarti: e.target.value }))}
                  placeholder="%40 peşin, %60 teslimde" />
              </Alan>
            </Satir>

            {/* KALEMLER */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em",
                  textTransform: "uppercase", color: T.renk.metinPasif }}>Teklif Kalemleri</div>
                <Btn boyut="sm" ikon="＋" onClick={() => setForm(f => ({ ...f,
                  kalemler: [...f.kalemler, { ...BOS_KALEM }] }))}>Kalem Ekle</Btn>
              </div>
              <div style={{ border: `1px solid ${T.renk.cizgi}`, borderRadius: T.r.md }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px 110px 80px 70px 110px 36px",
                  gap: 7, padding: "9px 12px", background: "#f8fafc", fontSize: 10, fontWeight: 700,
                  letterSpacing: ".04em", textTransform: "uppercase", color: T.renk.metinSoluk }}>
                  <span>Açıklama</span><span style={{ textAlign: "right" }}>Miktar</span>
                  <span style={{ textAlign: "right" }}>Birim Fiyat</span>
                  <span style={{ textAlign: "right" }}>Birim Maliyet</span>
                  <span style={{ textAlign: "right" }}>İsk. %</span><span style={{ textAlign: "right" }}>KDV %</span>
                  <span style={{ textAlign: "right" }}>Tutar</span><span />
                </div>
                {form.kalemler.map((k, i) => {
                  const guncelle = (alan, deger) => setForm(f => ({ ...f,
                    kalemler: f.kalemler.map((x, j) => j === i ? { ...x, [alan]: deger } : x) }));
                  const m = parseSayi(k.miktar) || 0;
                  const brut = m * (parseSayi(k.birim_fiyat) || 0);
                  const net = brut - brut * (parseSayi(k.iskonto_yuzde) || 0) / 100;
                  const mal = m * (parseSayi(k.birim_maliyet) || 0);
                  const marj = net > 0 ? (net - mal) / net * 100 : null;
                  return (
                    <div key={i} style={{ display: "grid",
                      gridTemplateColumns: "1fr 80px 110px 110px 80px 70px 110px 36px", gap: 7,
                      padding: "9px 12px", borderTop: `1px solid ${T.renk.cizgi}`, alignItems: "center" }}>
                      <div style={{ minWidth: 0 }}>
                        <SecimAra deger={k.material_id} secenekler={malzemeSecenek}
                          onSec={v => { guncelle("material_id", v);
                            if (v && !k.aciklama) guncelle("aciklama", mlzMap[v]?.malzeme_adi || ""); }}
                          bos="Serbest kalem" yer="Malzeme ara…" />
                        <Giris value={k.aciklama} placeholder="Kalem açıklaması"
                          onChange={e => guncelle("aciklama", e.target.value)}
                          style={{ marginTop: 5, padding: "6px 9px", fontSize: 12.5 }} />
                        {marj != null && (
                          <div style={{ fontSize: 10.5, marginTop: 4,
                            color: marj >= 20 ? T.renk.basari : marj >= 0 ? T.renk.uyari : T.renk.hata }}>
                            marj %{fmtSayi(marj, 1)}
                          </div>
                        )}
                      </div>
                      {[["miktar", "0"], ["birim_fiyat", "0,00"], ["birim_maliyet", "0,00"],
                        ["iskonto_yuzde", "0"], ["kdv_yuzde", "20"]].map(([alan, yer]) => (
                        <Giris key={alan} value={k[alan]} placeholder={yer}
                          onChange={e => guncelle(alan, e.target.value)}
                          style={{ padding: "7px 8px", fontSize: 12.5, textAlign: "right" }} />
                      ))}
                      <span style={{ textAlign: "right", fontSize: 12.5, fontWeight: 600 }}>
                        {net ? fmtPara(net, form.cur) : "—"}
                      </span>
                      <button onClick={() => setForm(f => ({ ...f,
                        kalemler: f.kalemler.length > 1 ? f.kalemler.filter((_, j) => j !== i) : [{ ...BOS_KALEM }] }))}
                        style={{ border: "none", background: "none", cursor: "pointer",
                          color: T.renk.hata, fontSize: 15 }}>×</button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* TOPLAMLAR */}
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              <div style={{ background: "#f8fafc", borderRadius: 10, padding: "13px 16px",
                display: "flex", flexDirection: "column", gap: 5, fontSize: 13 }}>
                {[["Ara toplam", formHesap.ara], ["İskonto", -formHesap.iskonto],
                  ["Net", formHesap.net], ["KDV", formHesap.kdv]].map(([ad, v]) => (
                  <div key={ad} style={{ display: "flex", justifyContent: "space-between", color: T.renk.metinSoluk }}>
                    <span>{ad}</span><span>{fmtPara(v, form.cur)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15,
                  borderTop: `1px solid ${T.renk.cizgi}`, paddingTop: 7, marginTop: 3 }}>
                  <span>Genel toplam</span><span>{fmtPara(formHesap.genel, form.cur)}</span>
                </div>
              </div>
              <div style={{ background: formHesap.marj != null && formHesap.marj < 15 ? T.renk.uyariAcik : T.renk.basariAcik,
                borderRadius: 10, padding: "13px 16px", display: "flex", flexDirection: "column", gap: 5, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: T.renk.metinSoluk }}>
                  <span>Tahmini maliyet</span><span>{fmtPara(formHesap.maliyet, form.cur)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: T.renk.metinSoluk }}>
                  <span>Beklenen kâr</span>
                  <b style={{ color: formHesap.kar >= 0 ? T.renk.basari : T.renk.hata }}>
                    {fmtPara(formHesap.kar, form.cur)}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15,
                  borderTop: `1px solid rgba(0,0,0,.08)`, paddingTop: 7, marginTop: 3 }}>
                  <span>Kâr marjı</span>
                  <span style={{ color: formHesap.marj == null ? T.renk.metinPasif
                    : formHesap.marj >= 20 ? T.renk.basari : formHesap.marj >= 0 ? T.renk.uyari : T.renk.hata }}>
                    {formHesap.marj == null ? "—" : `%${fmtSayi(formHesap.marj, 1)}`}
                  </span>
                </div>
                {formHesap.marj != null && formHesap.marj < 15 && (
                  <div style={{ fontSize: 11.5, color: T.renk.uyari, marginTop: 2 }}>
                    Marj %15'in altında — saha ve seyahat maliyetleri hesaba katıldı mı?
                  </div>
                )}
              </div>
            </div>

            <Alan etiket="Notlar" ipucu="İlk satır, projeye dönüştürüldüğünde proje adı olarak kullanılır">
              <Metin value={form.notlar || ""} satir={3}
                onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))}
                placeholder="Kapsam, varsayımlar, hariç tutulanlar…" />
            </Alan>
          </div>
        )}
      </Modal>

      {/* ── KAZANILDI → PROJE ── */}
      <Modal acik={!!projeOnay} onKapat={() => setProjeOnay(null)} genislik={560}
        baslik="Teklif kazanıldı"
        aciklama={projeOnay && `${projeOnay.teklif_no} · ${projeOnay.musteri?.unvan || ""}`}
        altBar={<>
          <Btn onClick={() => { durumDegistir(projeOnay, "kazanildi"); setProjeOnay(null); }}>
            Sadece işaretle</Btn>
          <Btn tur="birincil" onClick={() => projeyeDonustur(projeOnay)} disabled={kay}>
            {kay ? "Açılıyor…" : "Proje Aç"}</Btn>
        </>}>
        {projeOnay && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13.5, lineHeight: 1.7 }}>
            <p style={{ margin: 0, color: T.renk.metinSoluk }}>
              Teklifi kazanıldı olarak işaretleyip aynı anda bir proje açabilirsiniz. Proje;
              müşteri, sözleşme bedeli ({fmtPara(projeOnay.genel_toplam, projeOnay.cur)}) ve
              kur bilgisiyle oluşturulur.
            </p>
            <div style={{ background: "#f8fafc", borderRadius: 9, padding: "12px 15px", fontSize: 12.5 }}>
              Bütçe, tahmini maliyet ({fmtPara(projeOnay.tahmini_maliyet, projeOnay.cur)}) üzerinden
              malzeme %60 · işçilik %30 · diğer %10 olarak ön doldurulur.
              Projeler ekranından gerçek dağılımla düzeltmeyi unutmayın.
            </div>
          </div>
        )}
      </Modal>

      {/* ── KAYBEDİLDİ ── */}
      <Modal acik={!!kayipForm} onKapat={() => setKayip(null)} genislik={520}
        baslik="Teklif kaybedildi"
        aciklama="Kayıp nedeni sonraki tekliflerde işe yarar; boş bırakmayın."
        altBar={<>
          <Btn onClick={() => setKayip(null)}>Vazgeç</Btn>
          <Btn tur="birincil"
            onClick={() => durumDegistir(kayipForm.q, "kaybedildi", kayipForm.neden)}>Kaydet</Btn>
        </>}>
        {kayipForm && (
          <Alan etiket="Kayıp Nedeni">
            <Metin value={kayipForm.neden} satir={3}
              onChange={e => setKayip(f => ({ ...f, neden: e.target.value }))}
              placeholder="Fiyat yüksek kaldı / teslim süresi uzundu / rakip tercih edildi…" />
          </Alan>
        )}
      </Modal>

      <OnayModal acik={!!silinecek} tehlike onHayir={() => setSil(null)} onEvet={sil}
        baslik="Teklif silinsin mi?" mesaj={`"${silinecek?.teklif_no}" ve kalemleri silinecek.`} />
    </>
  );
}
