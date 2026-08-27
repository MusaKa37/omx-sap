// ─────────────────────────────────────────────────────────────────────────────
// CARİ & MUHASEBE
// ESATLAS'ta oturmuş olan davranışlar korundu: para birimi kırılımlı alacak/borç,
// firma ve işlem olarak iki görünüm, ay+yıl birlikte filtreleme, fatura/ödeme
// ayrımı, masraf düşülerek kâr hesabı ve işlem anındaki kurun sabitlenmesi.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from "react";
import { api, uploadFile, logAudit } from "../services/api";
import { T, CUR_SEMBOL } from "../ui/theme";
import { Kart, Baslik, Btn, Rozet, Tablo, Modal, Alan, Giris, Metin, Secim, Satir,
         Arama, Sekmeler, OnayModal, SecimAra,
         fmtPara, fmtTarih, parseSayi, sayiMetni, bugun, eslesir } from "../ui/kit";

const PARALAR = ["TRY", "EUR", "USD"];
const TIP = [["fatura", "Fatura"], ["odeme", "Ödeme"], ["tahsilat", "Tahsilat"],
             ["masraf", "Masraf"], ["avans", "Avans"]];
const TIP_AD = Object.fromEntries(TIP);
const YON = [["satis", "Satış (bizim kestiğimiz)"], ["alis", "Alış (bize kesilen)"]];
const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
               "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const SIRALAMA = [["unvan", "İsme göre"], ["alacak", "Alacak hacmi (çoktan aza)"],
                  ["borc", "Borç hacmi (çoktan aza)"], ["net", "Net bakiye (çoktan aza)"]];

const BOS = {
  company_id: "", project_id: "", tip: "fatura", yon: "satis", tarih: bugun(), vade: "",
  fatura_no: "", belge_no: "", tutar: "", cur: "TRY", kur: "", masraf: "", odeme: "",
  kdv_yuzde: 20, aciklama: "", notlar: "", odendi: false, dosya: null, belge_url: null,
};

// Bir işlemin cari bakiyeye etkisi. Alış tarafında yön terstir.
function etki(t) {
  const tutar = Number(t.tutar || 0);
  if (t.yon === "satis" && t.tip === "fatura") return { alacak: tutar, borc: 0 };
  if (t.yon === "satis" && ["odeme", "tahsilat"].includes(t.tip)) return { alacak: 0, borc: tutar };
  if (t.yon === "alis" && t.tip === "fatura") return { alacak: 0, borc: tutar };
  if (t.yon === "alis" && ["odeme", "tahsilat"].includes(t.tip)) return { alacak: tutar, borc: 0 };
  return { alacak: 0, borc: 0 };
}

export default function Muhasebe({ profil, yetkiVar, goster }) {
  const [islemler, setIslemler] = useState([]);
  const [firmalar, setFirmalar] = useState([]);
  const [projeler, setProjeler] = useState([]);
  const [yuk, setYuk]           = useState(true);
  const [gorunum, setGorunum]   = useState("firmalar");
  const [ara, setAra]           = useState("");
  const [sirala, setSirala]     = useState("unvan");
  const [fAy, setFAy]           = useState("");
  const [fYil, setFYil]         = useState("");
  const [fTip, setFTip]         = useState("");
  const [secili, setSecili]     = useState(null);
  const [form, setForm]         = useState(null);
  const [kay, setKay]           = useState(false);
  const [silinecek, setSil]     = useState(null);

  const ekleyebilir    = yetkiVar("muhasebe", "ekle");
  const duzenleyebilir = yetkiVar("muhasebe", "duzenle");
  const silebilir      = yetkiVar("muhasebe", "sil");

  const yukle = useCallback(async () => {
    setYuk(true);
    try {
      const [t, c, p] = await Promise.all([
        api.list("transactions", { select: "*,firma:companies(unvan,kod),proje:projects(proje_kodu)",
                                   order: "tarih.desc,id.desc", limit: 5000 }),
        api.list("companies", { order: "unvan.asc", limit: 2000 }),
        api.list("projects", { select: "id,proje_kodu,proje_adi", order: "proje_kodu.desc", limit: 500 }),
      ]);
      setIslemler(t); setFirmalar(c); setProjeler(p);
    } catch (e) { goster("Muhasebe verisi yüklenemedi: " + e.message, "hata"); }
    finally { setYuk(false); }
  }, [goster]);

  useEffect(() => { yukle(); }, [yukle]);

  const yillar = useMemo(() => {
    const s = new Set(islemler.map(t => t.tarih?.slice(0, 4)).filter(Boolean));
    return [...s].sort().reverse();
  }, [islemler]);

  // Ay ve yıl birlikte çalışır: yıl seçilmeden ay seçilirse tüm yılların o ayı gelir
  const donemde = useCallback(t => {
    if (fYil && t.tarih?.slice(0, 4) !== fYil) return false;
    if (fAy && t.tarih?.slice(5, 7) !== fAy) return false;
    return true;
  }, [fAy, fYil]);

  const donemIslemleri = useMemo(() => islemler.filter(donemde), [islemler, donemde]);

  // ── Para birimi kırılımlı toplamlar ───────────────────────────────────────
  const toplamlar = useMemo(() => {
    const h = {};
    PARALAR.forEach(c => { h[c] = { alacak: 0, borc: 0 }; });
    donemIslemleri.forEach(t => {
      const c = t.cur || "TRY";
      if (!h[c]) h[c] = { alacak: 0, borc: 0 };
      const e = etki(t);
      h[c].alacak += e.alacak; h[c].borc += e.borc;
    });
    return h;
  }, [donemIslemleri]);

  // Kâr TL bazında hesaplanır: farklı para birimlerindeki ham `tutar` değerleri
  // toplanamaz (10.000 EUR + 100.000 TL ≠ 110.000 ₺). İşlem anında donmuş
  // `tutar_try` kullanılır; eski kayıtlarda yoksa kur ile çevrilir.
  const tlTutar = t => Number(t.tutar_try) ||
    Number(t.tutar || 0) * ((t.cur || "TRY") === "TRY" ? 1 : (Number(t.kur) || 1));
  const donemKar = useMemo(() => donemIslemleri
    .filter(t => t.tip === "fatura" && t.yon === "satis")
    .reduce((s, t) => s + (tlTutar(t) - Number(t.masraf || 0)), 0),
    [donemIslemleri]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Firma bazlı bakiyeler ─────────────────────────────────────────────────
  const firmaBakiye = useMemo(() => {
    const h = {};
    donemIslemleri.forEach(t => {
      if (!t.company_id) return;
      const c = t.cur || "TRY";
      h[t.company_id] ||= {};
      h[t.company_id][c] ||= { alacak: 0, borc: 0 };
      const e = etki(t);
      h[t.company_id][c].alacak += e.alacak;
      h[t.company_id][c].borc += e.borc;
    });
    return h;
  }, [donemIslemleri]);

  const netTL = id => {
    const b = firmaBakiye[id];
    if (!b) return 0;
    // Sıralama için kaba bir TL karşılığı; ekranda para birimleri ayrı gösterilir
    const kaba = { TRY: 1, EUR: 47, USD: 41, GBP: 55 };
    return Object.entries(b).reduce((s, [c, v]) => s + (v.alacak - v.borc) * (kaba[c] || 1), 0);
  };
  const hacim = (id, alan) => {
    const b = firmaBakiye[id];
    if (!b) return 0;
    const kaba = { TRY: 1, EUR: 47, USD: 41, GBP: 55 };
    return Object.entries(b).reduce((s, [c, v]) => s + v[alan] * (kaba[c] || 1), 0);
  };

  const gorunenFirmalar = useMemo(() => {
    const liste = firmalar.filter(c => {
      if (ara && !(eslesir(c.unvan, ara) || eslesir(c.kod, ara) || eslesir(c.vergi_no, ara))) return false;
      return true;
    });
    const s = [...liste];
    if (sirala === "unvan") s.sort((a, b) => a.unvan.localeCompare(b.unvan, "tr"));
    if (sirala === "alacak") s.sort((a, b) => hacim(b.id, "alacak") - hacim(a.id, "alacak"));
    if (sirala === "borc")   s.sort((a, b) => hacim(b.id, "borc") - hacim(a.id, "borc"));
    if (sirala === "net")    s.sort((a, b) => netTL(b.id) - netTL(a.id));
    return s;
  }, [firmalar, ara, sirala, firmaBakiye]); // eslint-disable-line react-hooks/exhaustive-deps

  const gorunenIslemler = useMemo(() => donemIslemleri.filter(t => {
    if (fTip === "fatura" && t.tip !== "fatura") return false;
    if (fTip === "odeme" && !["odeme", "tahsilat"].includes(t.tip)) return false;
    if (ara && !(eslesir(t.firma?.unvan, ara) || eslesir(t.fatura_no, ara)
              || eslesir(t.aciklama, ara) || eslesir(t.proje?.proje_kodu, ara))) return false;
    return true;
  }), [donemIslemleri, fTip, ara]);

  const seciliIslemler = useMemo(() => secili
    ? donemIslemleri.filter(t => String(t.company_id) === String(secili.id))
    : [], [donemIslemleri, secili]);

  // ── Kaydet ────────────────────────────────────────────────────────────────
  async function kaydet() {
    const f = form;
    const tutar = parseSayi(f.tutar);
    if (!f.company_id) return goster("Firma seçilmeli.", "hata");
    if (!tutar || tutar <= 0) return goster("Tutar sıfırdan büyük olmalı.", "hata");
    if (f.cur !== "TRY" && !(parseSayi(f.kur) > 0))
      return goster("Yabancı para işleminde kur girilmeli — işlem anındaki değer sabitlenir.", "hata");
    setKay(true);
    try {
      let url = f.belge_url || null;
      if (f.dosya) {
        const yol = `muhasebe/${f.company_id}/${Date.now()}_${f.dosya.name.replace(/[^\w.-]/g, "_")}`;
        url = await uploadFile(yol, f.dosya);
      }
      const kur = f.cur === "TRY" ? null : parseSayi(f.kur);
      const masraf = parseSayi(f.masraf) || 0;
      const govde = {
        company_id: Number(f.company_id),
        project_id: f.project_id ? Number(f.project_id) : null,
        tip: f.tip, yon: f.yon, tarih: f.tarih, vade: f.vade || null,
        fatura_no: f.fatura_no || null, belge_no: f.belge_no || null,
        aciklama: f.aciklama || null, tutar, cur: f.cur, kur,
        tutar_try: f.cur === "TRY" ? tutar : Math.round(tutar * kur * 100) / 100,
        masraf, kar: f.tip === "fatura" && f.yon === "satis" ? tutar - masraf : 0,
        kdv_yuzde: Number(f.kdv_yuzde) || 0,
        belge_url: url, odendi: !!f.odendi, notlar: f.notlar || null,
        created_by: profil?.id || null,
      };
      let id = f.id;
      if (id) await api.update("transactions", id, govde);
      else { const y = await api.insert("transactions", govde); id = y?.id; }

      // Alış faturasına ödeme yazıldıysa aynı firmaya ayrı bir ödeme kaydı açılır
      const odeme = parseSayi(f.odeme) || 0;
      if (!f.id && f.tip === "fatura" && f.yon === "alis" && odeme > 0) {
        await api.insert("transactions", {
          company_id: Number(f.company_id),
          project_id: f.project_id ? Number(f.project_id) : null,
          tip: "odeme", yon: "alis", tarih: f.tarih,
          aciklama: `${f.fatura_no || "Fatura"} için ödeme`,
          tutar: odeme, cur: f.cur, kur,
          tutar_try: f.cur === "TRY" ? odeme : Math.round(odeme * kur * 100) / 100,
          created_by: profil?.id || null,
        });
      }
      logAudit({ tablo: "transactions", kayit_id: id, islem: f.id ? "update" : "insert",
                 aciklama: `${TIP_AD[f.tip]} · ${fmtPara(tutar, f.cur)}` });
      goster(f.id ? "İşlem güncellendi." : "İşlem kaydedildi.", "basari");
      setForm(null); yukle();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  async function sil() {
    try {
      await api.remove("transactions", silinecek.id);
      goster("İşlem silindi.", "basari"); setSil(null); yukle();
    } catch (e) { goster(e.message, "hata"); setSil(null); }
  }

  function islemAc(firmaId) {
    setForm({ ...BOS, company_id: firmaId || "", tarih: bugun() });
  }

  const firmaSecenek = useMemo(() => firmalar.map(c => ({
    deger: c.id, etiket: c.unvan, alt: c.kod })), [firmalar]);
  const projeSecenek = useMemo(() => projeler.map(p => ({
    deger: p.id, etiket: `${p.proje_kodu} · ${p.proje_adi}` })), [projeler]);

  const donemEtiketi = [fAy && AYLAR[Number(fAy) - 1], fYil].filter(Boolean).join(" ") || "Tüm zamanlar";

  // ── FİRMA DETAYI ──────────────────────────────────────────────────────────
  if (secili) {
    const b = firmaBakiye[secili.id] || {};
    const kar = seciliIslemler.filter(t => t.tip === "fatura" && t.yon === "satis")
      .reduce((s, t) => s + (tlTutar(t) - Number(t.masraf || 0)), 0);
    return (
      <>
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => setSecili(null)} style={{ border: "none", background: "none",
            cursor: "pointer", color: T.renk.metinSoluk, fontSize: 12.5, padding: 0, marginBottom: 8 }}>
            ← Muhasebe
          </button>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 23, fontWeight: 650, letterSpacing: "-.02em" }}>{secili.unvan}</h1>
              <div style={{ fontSize: 13, color: T.renk.metinSoluk, marginTop: 5 }}>
                {[secili.kod, secili.vergi_dairesi, secili.vergi_no, secili.ilgili_kisi, secili.telefon]
                  .filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            {ekleyebilir && <Btn tur="birincil" ikon="＋" onClick={() => islemAc(secili.id)}>Yeni İşlem</Btn>}
          </div>
        </div>

        <DonemFiltresi {...{ fAy, setFAy, fYil, setFYil, yillar, donemEtiketi }} />
        <BakiyeTablosu bakiye={b} kar={kar} />

        <div style={{ marginTop: 18 }}>
          <Sekmeler aktif={fTip || "hepsi"} onDegisim={k => setFTip(k === "hepsi" ? "" : k)} sekmeler={[
            { anahtar: "hepsi", baslik: "Tümü", sayi: seciliIslemler.length },
            { anahtar: "fatura", baslik: "Faturalar", sayi: seciliIslemler.filter(t => t.tip === "fatura").length },
            { anahtar: "odeme", baslik: "Ödemeler",
              sayi: seciliIslemler.filter(t => ["odeme", "tahsilat"].includes(t.tip)).length },
          ]} />
          <IslemTablosu veri={seciliIslemler.filter(t =>
              fTip === "fatura" ? t.tip === "fatura"
              : fTip === "odeme" ? ["odeme", "tahsilat"].includes(t.tip) : true)}
            firmaGoster={false} yuk={yuk}
            onSatirTikla={duzenleyebilir ? t => setForm({ ...BOS, ...t,
              company_id: t.company_id || "", project_id: t.project_id || "",
              tutar: sayiMetni(t.tutar), kur: sayiMetni(t.kur), masraf: sayiMetni(t.masraf),
              dosya: null }) : undefined} />
        </div>

        <IslemFormu {...{ form, setForm, kaydet, kay, firmaSecenek, projeSecenek,
          silebilir, setSil }} />
        <OnayModal acik={!!silinecek} tehlike onHayir={() => setSil(null)} onEvet={sil}
          baslik="İşlem silinsin mi?" mesaj="Bu muhasebe kaydı kalıcı olarak silinecek." />
      </>
    );
  }

  // ── ANA EKRAN ─────────────────────────────────────────────────────────────
  return (
    <>
      <Baslik ust="Finans" aciklama="Cari hesaplar, fatura ve ödeme takibi"
        sag={<>
          <Btn onClick={yukle} disabled={yuk}>{yuk ? "Yenileniyor…" : "Yenile"}</Btn>
          {ekleyebilir && <Btn tur="birincil" ikon="＋" onClick={() => islemAc("")}>Yeni İşlem</Btn>}
        </>}>
        Cari & Muhasebe
      </Baslik>

      <DonemFiltresi {...{ fAy, setFAy, fYil, setFYil, yillar, donemEtiketi }} />
      <BakiyeTablosu bakiye={toplamlar} kar={donemKar} />

      <div style={{ display: "flex", gap: 8, margin: "18px 0 14px", flexWrap: "wrap" }}>
        <Btn tur={gorunum === "firmalar" ? "birincil" : "ikincil"}
          onClick={() => setGorunum("firmalar")}>Firmalar</Btn>
        <Btn tur={gorunum === "islemler" ? "birincil" : "ikincil"}
          onClick={() => setGorunum("islemler")}>İşlemler</Btn>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Arama deger={ara} onDegisim={setAra}
            yer={gorunum === "firmalar" ? "Firma, kod, vergi no…" : "Firma, fatura no, açıklama…"} genislik={260} />
          {gorunum === "firmalar" ? (
            <div style={{ width: 230 }}>
              <Secim value={sirala} bos={false} secenekler={SIRALAMA}
                onChange={e => setSirala(e.target.value)} />
            </div>
          ) : (
            <div style={{ width: 170 }}>
              <Secim value={fTip} onChange={e => setFTip(e.target.value)}
                secenekler={[["fatura", "Faturalar"], ["odeme", "Ödemeler"]]} bos="Tüm işlemler" />
            </div>
          )}
        </div>
      </div>

      {gorunum === "firmalar" ? (
        <Tablo yukleniyor={yuk} veri={gorunenFirmalar} onSatirTikla={c => { setSecili(c); setFTip(""); }}
          bosMesaj={ara ? "Aramaya uyan firma yok" : "Firma kaydı yok"}
          sutunlar={[
            { anahtar: "unvan", baslik: "Firma",
              render: r => (
                <div>
                  <div style={{ fontWeight: 550 }}>{r.unvan}</div>
                  <div style={{ fontSize: 11.5, color: T.renk.metinPasif }}>
                    {[r.kod, r.ilgili_kisi, r.il].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
              )},
            { anahtar: "islem", baslik: "İşlem", hizala: "right", genislik: 80,
              render: r => donemIslemleri.filter(t => String(t.company_id) === String(r.id)).length || "—" },
            { anahtar: "alacak", baslik: "Alacak", hizala: "right", genislik: 160,
              render: r => <ParaSutun bakiye={firmaBakiye[r.id]} alan="alacak" renk={T.renk.basari} /> },
            { anahtar: "borc", baslik: "Borç", hizala: "right", genislik: 160,
              render: r => <ParaSutun bakiye={firmaBakiye[r.id]} alan="borc" renk={T.renk.hata} /> },
            { anahtar: "net", baslik: "Net", hizala: "right", genislik: 160,
              render: r => <ParaSutun bakiye={firmaBakiye[r.id]} alan="net" /> },
          ]} />
      ) : (
        <IslemTablosu veri={gorunenIslemler} firmaGoster yuk={yuk}
          onSatirTikla={t => { const c = firmalar.find(x => x.id === t.company_id); if (c) setSecili(c); }}
          ipucu="Bu listede kayıt değiştirilmez; düzenlemek için firmaya girin." />
      )}

      <IslemFormu {...{ form, setForm, kaydet, kay, firmaSecenek, projeSecenek, silebilir, setSil }} />
      <OnayModal acik={!!silinecek} tehlike onHayir={() => setSil(null)} onEvet={sil}
        baslik="İşlem silinsin mi?" mesaj="Bu muhasebe kaydı kalıcı olarak silinecek." />
    </>
  );
}

// ── Dönem filtresi (ay ve yıl birlikte çalışır) ─────────────────────────────
function DonemFiltresi({ fAy, setFAy, fYil, setFYil, yillar, donemEtiketi }) {
  return (
    <Kart pad={13} style={{ marginBottom: 14 }}>
      <Satir bosluk={10} style={{ alignItems: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em",
          textTransform: "uppercase", color: T.renk.metinPasif }}>Dönem</div>
        <div style={{ width: 150 }}>
          <Secim value={fAy} onChange={e => setFAy(e.target.value)}
            secenekler={AYLAR.map((a, i) => [String(i + 1).padStart(2, "0"), a])} bos="Tüm aylar" />
        </div>
        <div style={{ width: 130 }}>
          <Secim value={fYil} onChange={e => setFYil(e.target.value)}
            secenekler={yillar.map(y => [y, y])} bos="Tüm yıllar" />
        </div>
        {(fAy || fYil) && (
          <Btn boyut="sm" onClick={() => { setFAy(""); setFYil(""); }}>Temizle</Btn>
        )}
        <div style={{ marginLeft: "auto", fontSize: 12.5, color: T.renk.metinSoluk }}>
          Gösterilen dönem: <b>{donemEtiketi}</b>
        </div>
      </Satir>
    </Kart>
  );
}

// ── Alacak / Borç / Net · para birimi alt alta ──────────────────────────────
function BakiyeTablosu({ bakiye, kar }) {
  const kutu = (baslik, alan, renk) => (
    <Kart pad={16} style={{ borderTop: `3px solid ${renk}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase",
        color: T.renk.metinPasif, marginBottom: 10 }}>{baslik}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {PARALAR.map(c => {
          const v = bakiye?.[c] || { alacak: 0, borc: 0 };
          const d = alan === "net" ? v.alacak - v.borc : v[alan];
          return (
            <div key={c} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 11.5, color: T.renk.metinPasif, fontWeight: 600 }}>{CUR_SEMBOL[c]} {c}</span>
              <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                color: d === 0 ? T.renk.metinPasif : (alan === "net" ? (d >= 0 ? T.renk.basari : T.renk.hata) : renk) }}>
                {d === 0 ? "—" : fmtPara(d, c)}
              </span>
            </div>
          );
        })}
      </div>
    </Kart>
  );
  return (
    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
      {kutu("Toplam Alacak", "alacak", T.renk.basari)}
      {kutu("Toplam Borç", "borc", T.renk.hata)}
      {kutu("Net Bakiye", "net", T.renk.marka)}
      <Kart pad={16} style={{ borderTop: `3px solid ${T.renk.mor}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase",
          color: T.renk.metinPasif, marginBottom: 10 }}>Dönem Kârı</div>
        <div style={{ fontSize: 23, fontWeight: 700, color: kar >= 0 ? T.renk.basari : T.renk.hata,
          letterSpacing: "-.02em" }}>{fmtPara(kar)}</div>
        <div style={{ fontSize: 11.5, color: T.renk.metinPasif, marginTop: 5 }}>
          satış faturaları − masraflar
        </div>
      </Kart>
    </div>
  );
}

function ParaSutun({ bakiye, alan, renk }) {
  if (!bakiye) return <span style={{ color: T.renk.metinPasif }}>—</span>;
  const satirlar = PARALAR.map(c => {
    const v = bakiye[c];
    if (!v) return null;
    const d = alan === "net" ? v.alacak - v.borc : v[alan];
    return d ? [c, d] : null;
  }).filter(Boolean);
  if (!satirlar.length) return <span style={{ color: T.renk.metinPasif }}>—</span>;
  return (
    <div style={{ lineHeight: 1.45 }}>
      {satirlar.map(([c, d]) => (
        <div key={c} style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
          color: renk || (d >= 0 ? T.renk.basari : T.renk.hata) }}>{fmtPara(d, c)}</div>
      ))}
    </div>
  );
}

// ── İşlem tablosu ───────────────────────────────────────────────────────────
function IslemTablosu({ veri, firmaGoster, yuk, onSatirTikla, ipucu }) {
  return (
    <>
      {ipucu && <div style={{ fontSize: 12.5, color: T.renk.metinPasif, marginBottom: 9 }}>{ipucu}</div>}
      <Tablo yukleniyor={yuk} veri={veri} onSatirTikla={onSatirTikla}
        bosMesaj="Bu dönemde işlem yok"
        sutunlar={[
          { anahtar: "tarih", baslik: "Tarih", genislik: 104, render: r => fmtTarih(r.tarih) },
          { anahtar: "tip", baslik: "Tip", genislik: 110,
            render: r => {
              const fatura = r.tip === "fatura";
              return <Rozet renk={fatura ? T.renk.marka : T.renk.basari}
                zemin={fatura ? T.renk.markaAcik : T.renk.basariAcik}>{TIP_AD[r.tip] || r.tip}</Rozet>;
            }},
          { anahtar: "yon", baslik: "Yön", genislik: 90,
            render: r => <span style={{ fontSize: 12.5, color: T.renk.metinSoluk }}>
              {r.yon === "satis" ? "Satış" : "Alış"}</span> },
          ...(firmaGoster ? [{ anahtar: "firma", baslik: "Firma",
            render: r => (
              <div>
                <div style={{ fontWeight: 550 }}>{r.firma?.unvan || "—"}</div>
                {r.proje?.proje_kodu && <div style={{ fontSize: 11.5, color: T.renk.metinPasif,
                  fontFamily: "monospace" }}>{r.proje.proje_kodu}</div>}
              </div>
            )}] : []),
          { anahtar: "fatura_no", baslik: "Fatura No", genislik: 150,
            render: r => r.fatura_no
              ? <span style={{ fontFamily: "monospace", fontSize: 12 }}>{r.fatura_no}</span>
              : <span style={{ color: T.renk.metinPasif }}>—</span> },
          { anahtar: "kar", baslik: "Kâr", hizala: "right", genislik: 120,
            render: r => {
              if (r.tip !== "fatura" || r.yon !== "satis") return <span style={{ color: T.renk.metinPasif }}>—</span>;
              const k = Number(r.tutar || 0) - Number(r.masraf || 0);
              return <span style={{ fontWeight: 650, color: k >= 0 ? T.renk.basari : T.renk.hata }}>
                {fmtPara(k, r.cur)}</span>;
            }},
          ...(firmaGoster ? [] : [{ anahtar: "aciklama", baslik: "Açıklama",
            render: r => <span style={{ fontSize: 12.5, color: T.renk.metinSoluk }}>{r.aciklama || "—"}</span> }]),
          { anahtar: "masraf", baslik: "Masraf", hizala: "right", genislik: 110,
            render: r => Number(r.masraf) ? fmtPara(r.masraf, r.cur) : <span style={{ color: T.renk.metinPasif }}>—</span> },
          { anahtar: "tutar", baslik: "Tutar", hizala: "right", genislik: 130,
            render: r => <b style={{ fontVariantNumeric: "tabular-nums" }}>{fmtPara(r.tutar, r.cur)}</b> },
          { anahtar: "belge_url", baslik: "Belge", genislik: 70, hizala: "center",
            render: r => r.belge_url
              ? <a href={r.belge_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                  style={{ color: T.renk.marka, fontWeight: 600, fontSize: 12 }}>Aç ↗</a>
              : <span style={{ color: T.renk.metinPasif }}>—</span> },
        ]} />
    </>
  );
}

// ── İşlem formu ─────────────────────────────────────────────────────────────
function IslemFormu({ form, setForm, kaydet, kay, firmaSecenek, projeSecenek, silebilir, setSil }) {
  const tutar = parseSayi(form?.tutar) || 0;
  const masraf = parseSayi(form?.masraf) || 0;
  const satisFaturasi = form?.tip === "fatura" && form?.yon === "satis";
  const alisFaturasi  = form?.tip === "fatura" && form?.yon === "alis";

  return (
    <Modal acik={!!form} onKapat={() => setForm(null)} genislik={820}
      baslik={form?.id ? "İşlemi Düzenle" : "Yeni Muhasebe İşlemi"}
      altBar={<>
        {form?.id && silebilir &&
          <Btn tur="tehlike" onClick={() => { setSil(form); setForm(null); }}>Sil</Btn>}
        <Btn onClick={() => setForm(null)}>Vazgeç</Btn>
        <Btn tur="birincil" onClick={kaydet} disabled={kay}>{kay ? "Kaydediliyor…" : "Kaydet"}</Btn>
      </>}>
      {form && (
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          <Satir>
            <Alan etiket="Firma" zorunlu genislik="300px">
              <SecimAra deger={form.company_id} secenekler={firmaSecenek}
                onSec={v => setForm(f => ({ ...f, company_id: v }))} bos="Firma seçin" />
            </Alan>
            <Alan etiket="Proje" genislik="280px" ipucu="Bağlanırsa proje kârına yansır">
              <SecimAra deger={form.project_id} secenekler={projeSecenek}
                onSec={v => setForm(f => ({ ...f, project_id: v }))} bos="Projesiz" />
            </Alan>
          </Satir>

          <Satir>
            <Alan etiket="İşlem Tipi" genislik="170px">
              <Secim value={form.tip} bos={false} secenekler={TIP}
                onChange={e => setForm(f => ({ ...f, tip: e.target.value }))} />
            </Alan>
            <Alan etiket="Yön" genislik="240px">
              <Secim value={form.yon} bos={false} secenekler={YON}
                onChange={e => setForm(f => ({ ...f, yon: e.target.value }))} />
            </Alan>
            <Alan etiket="Tarih" genislik="150px">
              <Giris type="date" value={form.tarih}
                onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))} />
            </Alan>
            <Alan etiket="Vade" genislik="150px">
              <Giris type="date" value={form.vade || ""}
                onChange={e => setForm(f => ({ ...f, vade: e.target.value }))} />
            </Alan>
          </Satir>

          <Satir>
            <Alan etiket="Fatura No" genislik="200px">
              <Giris value={form.fatura_no || ""}
                onChange={e => setForm(f => ({ ...f, fatura_no: e.target.value }))} />
            </Alan>
            <Alan etiket="Tutar" zorunlu genislik="170px">
              <Giris value={form.tutar} onChange={e => setForm(f => ({ ...f, tutar: e.target.value }))}
                placeholder="0,00" />
            </Alan>
            <Alan etiket="Para Birimi" genislik="130px">
              <Secim value={form.cur} bos={false}
                secenekler={PARALAR.map(c => [c, `${CUR_SEMBOL[c]} ${c}`])}
                onChange={e => setForm(f => ({ ...f, cur: e.target.value }))} />
            </Alan>
            {form.cur !== "TRY" && (
              <Alan etiket="Kur" zorunlu genislik="140px" ipucu="İşlem anında sabitlenir">
                <Giris value={form.kur} onChange={e => setForm(f => ({ ...f, kur: e.target.value }))}
                  placeholder="0,0000" />
              </Alan>
            )}
            <Alan etiket="KDV (%)" genislik="110px">
              <Giris type="number" value={form.kdv_yuzde}
                onChange={e => setForm(f => ({ ...f, kdv_yuzde: e.target.value }))} />
            </Alan>
          </Satir>

          {/* Satış faturasında masraf, alış faturasında ödeme alanı */}
          {satisFaturasi && (
            <Satir>
              <Alan etiket="Masraf" genislik="200px"
                ipucu="Tutardan düşülerek kâr hesaplanır">
                <Giris value={form.masraf} onChange={e => setForm(f => ({ ...f, masraf: e.target.value }))}
                  placeholder="0,00" />
              </Alan>
              <div style={{ flex: "1 1 240px", display: "flex", alignItems: "flex-end" }}>
                <div style={{ background: "#f8fafc", borderRadius: 9, padding: "10px 14px",
                  width: "100%", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: T.renk.metinSoluk }}>Kâr (tutar − masraf)</span>
                  <b style={{ color: tutar - masraf >= 0 ? T.renk.basari : T.renk.hata }}>
                    {fmtPara(tutar - masraf, form.cur)}</b>
                </div>
              </div>
            </Satir>
          )}

          {alisFaturasi && !form.id && (
            <Alan etiket="Ödeme" genislik="240px"
              ipucu="Değer girilirse aynı firmaya ayrı bir ödeme kaydı da açılır; boş bırakılırsa sadece fatura işlenir">
              <Giris value={form.odeme} onChange={e => setForm(f => ({ ...f, odeme: e.target.value }))}
                placeholder="0,00" />
            </Alan>
          )}

          <Alan etiket="Açıklama">
            <Giris value={form.aciklama || ""}
              onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))}
              placeholder="Neyin faturası / ödemesi…" />
          </Alan>

          <Satir>
            <Alan etiket="Belge (PDF)" genislik="300px"
              ipucu={form.belge_url ? "Yeni dosya seçilirse mevcut belge değişir" : "Fatura veya dekont"}>
              <Giris type="file" accept=".pdf,image/*"
                onChange={e => setForm(f => ({ ...f, dosya: e.target.files?.[0] || null }))} />
            </Alan>
            {form.belge_url && (
              <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 9 }}>
                <a href={form.belge_url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 12.5, color: T.renk.marka, fontWeight: 600 }}>Mevcut belgeyi aç ↗</a>
              </div>
            )}
          </Satir>

          <Alan etiket="Notlar">
            <Metin value={form.notlar || ""} satir={2}
              onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))} />
          </Alan>
        </div>
      )}
    </Modal>
  );
}
