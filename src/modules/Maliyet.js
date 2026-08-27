// ─────────────────────────────────────────────────────────────────────────────
// PROJE MALİYET
// Tüm projelerin bütçe ↔ gerçekleşen karşılaştırması. Rakamlar
// v_project_summary görünümünden gelir; kalem kırılımı project_costs'tan.
// Excel'e (CSV) aktarım, haftalık yedek alma alışkanlığı için.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../services/api";
import { T, PROJE_TIPI_ETIKET, DURUM_ETIKET } from "../ui/theme";
import { Kart, Baslik, Btn, Rozet, Tablo, Modal, Secim, Satir, Arama, Olcum, Bos, Ilerleme,
         fmtPara, fmtSayi, fmtTarih, eslesir } from "../ui/kit";

const KAYNAK = [
  ["malzeme", "Malzeme"], ["iscilik", "İşçilik"], ["taseron", "Taşeron"],
  ["seyahat", "Seyahat & Konaklama"], ["ekipman", "Ekipman"], ["nakliye", "Nakliye"],
  ["genel_gider", "Genel Gider"], ["diger", "Diğer"],
];
const KAYNAK_AD = Object.fromEntries(KAYNAK);
const KAYNAK_TABLO_AD = {
  stock_moves: "Depo çıkışı", timesheets: "Puantaj", purchase_orders: "Satın alma",
  transactions: "Fatura", service_orders: "Servis", manuel: "Manuel giriş",
};
const SIRALAMA = [
  ["kod", "Proje koduna göre"], ["kar", "Net kâr (çoktan aza)"],
  ["marj", "Kâr marjı (çoktan aza)"], ["asim", "Bütçe aşımı (çoktan aza)"],
  ["maliyet", "Maliyet (çoktan aza)"], ["termin", "Termine göre"],
];

export default function Maliyet({ goster, yetkiVar }) {
  // v_project_summary'nin gelir tarafı (transactions + exchange_rates) muhasebe
  // görüntüleme yetkisi ister; yetkisiz kullanıcıda RLS bu alt sorguları boş
  // döndürür ve gelir/kâr SESSİZCE yanlış görünür. İlgili kart ve sütunlar gizlenir.
  const finansGorur = !yetkiVar || yetkiVar("muhasebe");
  const [ozetler, setOzetler]   = useState([]);
  const [projeler, setProjeler] = useState([]);
  const [maliyetler, setMal]    = useState([]);
  const [yuk, setYuk]           = useState(true);
  const [ara, setAra]           = useState("");
  const [fDurum, setFDurum]     = useState("");
  const [fTip, setFTip]         = useState("");
  const [sirala, setSirala]     = useState("kar");
  const [detay, setDetay]       = useState(null);

  const yukle = useCallback(async () => {
    setYuk(true);
    try {
      const [o, p, m] = await Promise.all([
        api.list("v_project_summary", { limit: 1000 }),
        api.list("projects", { select: "id,proje_kodu,proje_adi,tip,durum,termin,butce_malzeme,butce_iscilik,butce_taseron,butce_diger",
                               limit: 1000 }),
        api.list("project_costs", { order: "tarih.desc,id.desc", limit: 5000 }).catch(() => []),
      ]);
      setOzetler(o); setProjeler(p); setMal(m);
    } catch (e) { goster("Maliyet verisi yüklenemedi: " + e.message, "hata"); }
    finally { setYuk(false); }
  }, [goster]);

  useEffect(() => { yukle(); }, [yukle]);

  const projeMap = useMemo(() => Object.fromEntries(projeler.map(p => [p.id, p])), [projeler]);

  const satirlar = useMemo(() => ozetler.map(o => {
    const p = projeMap[o.id] || {};
    const butce = Number(o.butce_toplam || 0);
    const maliyet = Number(o.maliyet_toplam || 0);
    return {
      ...o, tip: o.tip || p.tip, termin: o.termin || p.termin,
      butce, maliyet, asim: butce > 0 ? maliyet - butce : 0,
      kullanim: butce > 0 ? (maliyet / butce) * 100 : (maliyet > 0 ? 100 : 0),
    };
  }), [ozetler, projeMap]);

  const gorunen = useMemo(() => {
    const l = satirlar.filter(s => {
      if (fDurum && s.durum !== fDurum) return false;
      if (fTip && s.tip !== fTip) return false;
      if (ara && !(eslesir(s.proje_kodu, ara) || eslesir(s.proje_adi, ara)
                || eslesir(s.musteri, ara))) return false;
      return true;
    });
    const s = [...l];
    if (sirala === "kod")     s.sort((a, b) => String(b.proje_kodu).localeCompare(String(a.proje_kodu), "tr"));
    if (sirala === "kar")     s.sort((a, b) => Number(b.net_kar || 0) - Number(a.net_kar || 0));
    if (sirala === "marj")    s.sort((a, b) => Number(b.kar_marji_yuzde ?? -999) - Number(a.kar_marji_yuzde ?? -999));
    if (sirala === "asim")    s.sort((a, b) => b.asim - a.asim);
    if (sirala === "maliyet") s.sort((a, b) => b.maliyet - a.maliyet);
    if (sirala === "termin")  s.sort((a, b) => String(a.termin || "9999").localeCompare(String(b.termin || "9999")));
    return s;
  }, [satirlar, ara, fDurum, fTip, sirala]);

  const genel = useMemo(() => gorunen.reduce((a, s) => ({
    butce: a.butce + s.butce, maliyet: a.maliyet + s.maliyet,
    gelir: a.gelir + Number(s.faturalanan_gelir || 0),
    kar: a.kar + Number(s.net_kar || 0),
    malzeme: a.malzeme + Number(s.maliyet_malzeme || 0),
    iscilik: a.iscilik + Number(s.maliyet_iscilik || 0),
    taseron: a.taseron + Number(s.maliyet_taseron || 0),
    diger: a.diger + Number(s.maliyet_diger || 0),
  }), { butce: 0, maliyet: 0, gelir: 0, kar: 0, malzeme: 0, iscilik: 0, taseron: 0, diger: 0 }), [gorunen]);

  const asanlar = gorunen.filter(s => s.asim > 0);
  const zararda = gorunen.filter(s => Number(s.net_kar || 0) < 0 && Number(s.faturalanan_gelir || 0) > 0);

  // ── CSV dışa aktarım ──────────────────────────────────────────────────────
  function disaAktar() {
    const basliklar = ["Proje Kodu", "Proje Adı", "Müşteri", "Tip", "Durum", "Termin",
      "Sözleşme Bedeli", "Para Birimi", "Bütçe", "Malzeme", "İşçilik", "Taşeron", "Diğer",
      "Toplam Maliyet", "Faturalanan", "Net Kâr", "Kâr Marjı %", "Bütçe Aşımı"];
    const tr = n => String(Number(n || 0).toFixed(2)).replace(".", ",");
    const alan = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const satirlarCsv = gorunen.map(s => [
      s.proje_kodu, s.proje_adi, s.musteri || "",
      PROJE_TIPI_ETIKET[s.tip] || s.tip || "", DURUM_ETIKET[s.durum] || s.durum || "",
      s.termin || "", tr(s.sozlesme_bedeli), s.cur || "TRY", tr(s.butce),
      tr(s.maliyet_malzeme), tr(s.maliyet_iscilik), tr(s.maliyet_taseron), tr(s.maliyet_diger),
      tr(s.maliyet), tr(s.faturalanan_gelir), tr(s.net_kar),
      s.kar_marji_yuzde != null ? tr(s.kar_marji_yuzde) : "", tr(s.asim),
    ].map(alan).join(";"));
    // Excel'in Türkçe yerelinde doğru açılması için BOM + noktalı virgül
    const icerik = "﻿" + [basliklar.map(alan).join(";"), ...satirlarCsv].join("\r\n");
    const blob = new Blob([icerik], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `omx-proje-maliyet-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    goster(`${gorunen.length} proje CSV olarak indirildi.`, "basari");
  }

  const detayKalemleri = detay ? maliyetler.filter(m => String(m.project_id) === String(detay.id)) : [];

  return (
    <>
      <Baslik ust="Finans" aciklama="Tüm projelerin bütçe ve gerçekleşen maliyet karşılaştırması"
        sag={<>
          <Btn onClick={yukle} disabled={yuk}>{yuk ? "Yenileniyor…" : "Yenile"}</Btn>
          <Btn tur="birincil" onClick={disaAktar} disabled={!gorunen.length} ikon="↓">Excel'e Aktar</Btn>
        </>}>
        Proje Maliyet
      </Baslik>

      <div style={{ display: "grid", gap: 12, marginBottom: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <Olcum etiket="Toplam Bütçe" deger={fmtPara(genel.butce)} ikon="◇" />
        <Olcum etiket="Gerçekleşen Maliyet" deger={fmtPara(genel.maliyet)} ikon="∑"
          renk={genel.butce > 0 && genel.maliyet > genel.butce ? T.renk.hata : T.renk.metin}
          zemin={genel.butce > 0 && genel.maliyet > genel.butce ? T.renk.hataAcik : "#f1f5f9"}
          alt={genel.butce > 0 ? `bütçenin %${Math.round(genel.maliyet / genel.butce * 100)}'i` : "bütçe girilmemiş"} />
        {finansGorur && <Olcum etiket="Faturalanan" deger={fmtPara(genel.gelir)} ikon="₺"
          renk={T.renk.basari} zemin={T.renk.basariAcik} />}
        {finansGorur && <Olcum etiket="Net Kâr" deger={fmtPara(genel.kar)} ikon="↗"
          renk={genel.kar >= 0 ? T.renk.basari : T.renk.hata}
          zemin={genel.kar >= 0 ? T.renk.basariAcik : T.renk.hataAcik}
          alt={genel.gelir > 0 ? `marj %${(genel.kar / genel.gelir * 100).toFixed(1)}` : "henüz fatura yok"} />}
        <Olcum etiket="Bütçe Aşan Proje" deger={asanlar.length} ikon="⚠"
          renk={asanlar.length ? T.renk.hata : T.renk.basari}
          zemin={asanlar.length ? T.renk.hataAcik : T.renk.basariAcik}
          alt={zararda.length ? `${zararda.length} proje zararda` : "zararda proje yok"} />
      </div>

      {/* Kalem dağılımı */}
      {genel.maliyet > 0 && (
        <Kart pad={16} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase",
            color: T.renk.metinPasif, marginBottom: 12 }}>Maliyet Dağılımı</div>
          <div style={{ display: "flex", height: 12, borderRadius: 999, overflow: "hidden", marginBottom: 12 }}>
            {[["malzeme", genel.malzeme, T.renk.marka], ["iscilik", genel.iscilik, T.renk.basari],
              ["taseron", genel.taseron, T.renk.uyari], ["diger", genel.diger, T.renk.mor]]
              .filter(([, v]) => v > 0).map(([k, v, c]) => (
                <div key={k} title={`${KAYNAK_AD[k] || k}: ${fmtPara(v)}`}
                  style={{ width: `${v / genel.maliyet * 100}%`, background: c }} />
              ))}
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {[["Malzeme", genel.malzeme, T.renk.marka], ["İşçilik", genel.iscilik, T.renk.basari],
              ["Taşeron", genel.taseron, T.renk.uyari], ["Diğer", genel.diger, T.renk.mor]].map(([ad, v, c]) => (
              <div key={ad} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: c, flexShrink: 0 }} />
                <span style={{ color: T.renk.metinSoluk }}>{ad}</span>
                <b>{fmtPara(v)}</b>
                <span style={{ color: T.renk.metinPasif }}>
                  %{genel.maliyet ? (v / genel.maliyet * 100).toFixed(1) : 0}
                </span>
              </div>
            ))}
          </div>
        </Kart>
      )}

      <Kart pad={13} style={{ marginBottom: 14 }}>
        <Satir bosluk={10} style={{ alignItems: "center" }}>
          <Arama deger={ara} onDegisim={setAra} yer="Proje kodu, adı, müşteri…" genislik={280} />
          <div style={{ width: 170 }}>
            <Secim value={fDurum} onChange={e => setFDurum(e.target.value)}
              secenekler={["teklif", "onay_bekliyor", "devam", "beklemede", "tamamlandi", "garanti", "iptal"]
                .map(d => [d, DURUM_ETIKET[d]])} bos="Tüm durumlar" />
          </div>
          <div style={{ width: 190 }}>
            <Secim value={fTip} onChange={e => setFTip(e.target.value)}
              secenekler={Object.entries(PROJE_TIPI_ETIKET)} bos="Tüm tipler" />
          </div>
          <div style={{ width: 220 }}>
            <Secim value={sirala} bos={false} secenekler={SIRALAMA}
              onChange={e => setSirala(e.target.value)} />
          </div>
          <div style={{ marginLeft: "auto", fontSize: 12.5, color: T.renk.metinPasif }}>{gorunen.length} proje</div>
        </Satir>
      </Kart>

      <Tablo yukleniyor={yuk} veri={gorunen} onSatirTikla={s => setDetay(s)}
        bosMesaj={ara || fDurum || fTip ? "Filtreye uyan proje yok" : "Henüz proje yok"}
        sutunlar={[
          { anahtar: "proje_kodu", baslik: "Kod", genislik: 132,
            render: r => <b style={{ color: T.renk.marka }}>{r.proje_kodu}</b> },
          { anahtar: "proje_adi", baslik: "Proje",
            render: r => (
              <div>
                <div style={{ fontWeight: 550 }}>{r.proje_adi}</div>
                <div style={{ fontSize: 11.5, color: T.renk.metinPasif }}>
                  {r.musteri || "—"} · {PROJE_TIPI_ETIKET[r.tip] || r.tip}
                </div>
              </div>
            )},
          { anahtar: "durum", baslik: "Durum", genislik: 118, render: r => <Rozet durum={r.durum} /> },
          { anahtar: "butce", baslik: "Bütçe", hizala: "right", genislik: 125,
            render: r => r.butce ? fmtPara(r.butce) : <span style={{ color: T.renk.metinPasif }}>girilmedi</span> },
          { anahtar: "maliyet", baslik: "Gerçekleşen", hizala: "right", genislik: 130,
            render: r => <span style={{ fontWeight: 600, color: r.asim > 0 ? T.renk.hata : T.renk.metin }}>
              {fmtPara(r.maliyet)}</span> },
          { anahtar: "kullanim", baslik: "Bütçe Kullanımı", genislik: 150,
            render: r => r.butce
              ? <Ilerleme yuzde={r.kullanim} renk={r.kullanim > 100 ? T.renk.hata : undefined} />
              : <span style={{ color: T.renk.metinPasif, fontSize: 12 }}>—</span> },
          ...(finansGorur ? [
          { anahtar: "faturalanan_gelir", baslik: "Faturalanan", hizala: "right", genislik: 130,
            render: r => fmtPara(r.faturalanan_gelir) },
          { anahtar: "net_kar", baslik: "Net Kâr", hizala: "right", genislik: 130,
            render: r => <b style={{ color: Number(r.net_kar) >= 0 ? T.renk.basari : T.renk.hata }}>
              {fmtPara(r.net_kar)}</b> },
          { anahtar: "kar_marji_yuzde", baslik: "Marj", hizala: "right", genislik: 85,
            render: r => r.kar_marji_yuzde == null
              ? <span style={{ color: T.renk.metinPasif }}>—</span>
              : <span style={{ fontWeight: 650, color: r.kar_marji_yuzde >= 0 ? T.renk.basari : T.renk.hata }}>
                  %{fmtSayi(r.kar_marji_yuzde, 1)}</span> },
          ] : []),
        ]} />

      {/* ── PROJE MALİYET DETAYI ── */}
      <Modal acik={!!detay} onKapat={() => setDetay(null)} genislik={900}
        baslik={detay?.proje_adi} aciklama={detay && `${detay.proje_kodu} · ${detay.musteri || "müşteri atanmadı"}`}
        altBar={<Btn onClick={() => setDetay(null)}>Kapat</Btn>}>
        {detay && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              {[["Bütçe", detay.butce, T.renk.metin],
                ["Gerçekleşen", detay.maliyet, detay.asim > 0 ? T.renk.hata : T.renk.metin],
                ["Faturalanan", detay.faturalanan_gelir, T.renk.basari],
                ["Net Kâr", detay.net_kar, Number(detay.net_kar) >= 0 ? T.renk.basari : T.renk.hata]]
                .map(([ad, v, c]) => (
                  <div key={ad} style={{ background: "#f8fafc", borderRadius: 9, padding: "11px 14px" }}>
                    <div style={{ fontSize: 11, color: T.renk.metinPasif, fontWeight: 600,
                      textTransform: "uppercase", letterSpacing: ".05em" }}>{ad}</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: c, marginTop: 3 }}>{fmtPara(v)}</div>
                  </div>
                ))}
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase",
                color: T.renk.metinPasif, marginBottom: 10 }}>Bütçe ↔ Gerçekleşen (kalem bazında)</div>
              {[["Malzeme", projeMap[detay.id]?.butce_malzeme, detay.maliyet_malzeme],
                ["İşçilik", projeMap[detay.id]?.butce_iscilik, detay.maliyet_iscilik],
                ["Taşeron", projeMap[detay.id]?.butce_taseron, detay.maliyet_taseron],
                ["Diğer",   projeMap[detay.id]?.butce_diger,   detay.maliyet_diger]].map(([ad, b, g]) => {
                const bs = Number(b || 0), gs = Number(g || 0);
                const oran = bs > 0 ? gs / bs * 100 : (gs > 0 ? 100 : 0);
                const asim = bs > 0 && gs > bs;
                return (
                  <div key={ad} style={{ padding: "10px 0", borderBottom: `1px solid ${T.renk.cizgi}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                      <span style={{ fontWeight: 550 }}>{ad}</span>
                      <span>
                        <b style={{ color: asim ? T.renk.hata : T.renk.metin }}>{fmtPara(gs)}</b>
                        <span style={{ fontSize: 12, color: T.renk.metinPasif }}> / {fmtPara(bs)}</span>
                      </span>
                    </div>
                    <Ilerleme yuzde={oran} renk={asim ? T.renk.hata : undefined} yukseklik={6} />
                  </div>
                );
              })}
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase",
                color: T.renk.metinPasif, marginBottom: 10 }}>
                Maliyet Defteri ({detayKalemleri.length} kayıt)
              </div>
              {!detayKalemleri.length ? (
                <Bos ikon="∑" baslik="Bu projeye henüz maliyet düşmedi" />
              ) : (
                <Tablo veri={detayKalemleri.slice(0, 100)}
                  sutunlar={[
                    { anahtar: "tarih", baslik: "Tarih", genislik: 100, render: r => fmtTarih(r.tarih) },
                    { anahtar: "kaynak", baslik: "Kalem", genislik: 150,
                      render: r => KAYNAK_AD[r.kaynak] || r.kaynak },
                    { anahtar: "aciklama", baslik: "Açıklama", render: r => r.aciklama || "—" },
                    { anahtar: "kaynak_tablo", baslik: "Kaynak", genislik: 130,
                      render: r => <span style={{ fontSize: 11.5, color: T.renk.metinPasif }}>
                        {KAYNAK_TABLO_AD[r.kaynak_tablo] || r.kaynak_tablo || "—"}</span> },
                    { anahtar: "tutar", baslik: "Tutar", hizala: "right", genislik: 120,
                      render: r => fmtPara(r.tutar, r.cur) },
                    { anahtar: "tutar_try", baslik: "TL Karşılığı", hizala: "right", genislik: 130,
                      render: r => <b>{fmtPara(r.tutar_try)}</b> },
                  ]} />
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
