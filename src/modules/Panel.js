// ─────────────────────────────────────────────────────────────────────────────
// PANEL — işletmenin tek ekranda durumu.
// Kaynak: v_project_summary, v_critical_stock, v_open_purchase_orders,
//         v_upcoming_maintenance (veritabanı görünümleri)
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../services/api";
import { T, PROJE_TIPI_ETIKET } from "../ui/theme";
import { Kart, Baslik, Olcum, Tablo, Rozet, Ilerleme, Btn, Bos,
         fmtPara, fmtTarih, fmtSayi } from "../ui/kit";

export default function Panel({ profil, yetkiVar, goster, git }) {
  const [yukleniyor, setYukleniyor] = useState(true);
  const [projeler, setProjeler] = useState([]);
  const [kritik, setKritik]     = useState([]);
  const [siparis, setSiparis]   = useState([]);
  const [bakim, setBakim]       = useState([]);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const iste = (t, q, izin) => izin ? api.list(t, q).catch(() => []) : Promise.resolve([]);
    try {
      const [p, k, s, b] = await Promise.all([
        iste("v_project_summary", { order: "termin.asc", limit: 200 }, yetkiVar("proje")),
        iste("v_critical_stock", { limit: 50 }, yetkiVar("depo")),
        iste("v_open_purchase_orders", { order: "termin.asc", limit: 50 }, yetkiVar("satinalma")),
        iste("v_upcoming_maintenance", { order: "sonraki_bakim.asc", limit: 20 }, yetkiVar("servis")),
      ]);
      setProjeler(p); setKritik(k); setSiparis(s); setBakim(b);
    } catch (e) {
      goster("Panel verisi okunamadı: " + e.message, "hata");
    } finally { setYukleniyor(false); }
  }, [yetkiVar, goster]);

  useEffect(() => { yukle(); }, [yukle]);

  const ozet = useMemo(() => {
    const aktif = projeler.filter(p => ["devam", "beklemede", "onay_bekliyor"].includes(p.durum));
    const bugunTs = new Date().setHours(0, 0, 0, 0);
    return {
      aktifSayi:  aktif.length,
      teklifSayi: projeler.filter(p => p.durum === "teklif").length,
      geciken:    aktif.filter(p => p.termin && new Date(p.termin) < bugunTs).length,
      ciro:       projeler.reduce((t, p) => t + Number(p.faturalanan_gelir || 0), 0),
      maliyet:    projeler.reduce((t, p) => t + Number(p.maliyet_toplam || 0), 0),
      gecikenSip: siparis.filter(s => s.gecikmis).length,
    };
  }, [projeler, siparis]);

  const netKar = ozet.ciro - ozet.maliyet;
  // v_project_summary security_invoker olduğundan muhasebe görüntüleme yetkisi
  // olmayan kullanıcıda faturalanan gelir/kur verisi RLS ile boş döner ve
  // rakamlar SESSİZCE yanlış olur (her proje zararda görünür). Finansal
  // kartlar yalnız muhasebe yetkisi olana gösterilir.
  const finansGorur = yetkiVar("muhasebe");

  return (
    <>
      <Baslik ust={`Hoş geldiniz, ${(profil?.ad_soyad || "").split(" ")[0] || ""}`}
        aciklama="İşletmenin güncel durumu"
        sag={<Btn onClick={yukle} disabled={yukleniyor}>{yukleniyor ? "Yenileniyor…" : "Yenile"}</Btn>}>
        Panel
      </Baslik>

      {/* ÖLÇÜMLER */}
      <div style={{ display: "grid", gap: 12, marginBottom: 22,
        gridTemplateColumns: "repeat(auto-fit, minmax(212px, 1fr))" }}>
        <Olcum etiket="Aktif Proje" deger={ozet.aktifSayi} ikon="◈"
          alt={`${ozet.teklifSayi} teklif aşamasında`} />
        <Olcum etiket="Termini Geçen" deger={ozet.geciken} ikon="⚠"
          renk={ozet.geciken ? T.renk.hata : T.renk.basari}
          zemin={ozet.geciken ? T.renk.hataAcik : T.renk.basariAcik}
          alt={ozet.geciken ? "acil müdahale gerekiyor" : "takvime uygun"} />
        {finansGorur && <Olcum etiket="Faturalanan" deger={fmtPara(ozet.ciro)} ikon="₺"
          renk={T.renk.basari} zemin={T.renk.basariAcik} alt="tüm projeler toplamı" />}
        {finansGorur && <Olcum etiket="Net Kâr" deger={fmtPara(netKar)} ikon="∑"
          renk={netKar >= 0 ? T.renk.basari : T.renk.hata}
          zemin={netKar >= 0 ? T.renk.basariAcik : T.renk.hataAcik}
          alt={`maliyet ${fmtPara(ozet.maliyet)}`} />}
        <Olcum etiket="Açık Sipariş" deger={siparis.length} ikon="⇩"
          renk={ozet.gecikenSip ? T.renk.uyari : T.renk.marka}
          zemin={ozet.gecikenSip ? T.renk.uyariAcik : T.renk.markaAcik}
          alt={ozet.gecikenSip ? `${ozet.gecikenSip} tanesi gecikmiş` : "termin içinde"} />
        <Olcum etiket="Kritik Stok" deger={`${kritik.length} kalem`} ikon="▤"
          renk={kritik.length ? T.renk.hata : T.renk.basari}
          zemin={kritik.length ? T.renk.hataAcik : T.renk.basariAcik}
          alt={kritik.length ? "sipariş verilmeli" : "seviye yeterli"} />
      </div>

      {/* AKTİF PROJELER */}
      {yetkiVar("proje") && (
        <div style={{ marginBottom: 22 }}>
          <BolumBasligi baslik="Aktif Projeler"
            aciklama="Bütçe ve gerçekleşen maliyet karşılaştırması"
            eylem={<Btn boyut="sm" onClick={() => git("projeler")}>Tümünü gör →</Btn>} />
          <Tablo yukleniyor={yukleniyor}
            veri={projeler.filter(p => ["devam", "beklemede", "onay_bekliyor"].includes(p.durum)).slice(0, 8)}
            bosMesaj="Devam eden proje yok"
            onSatirTikla={() => git("projeler")}
            sutunlar={[
              { anahtar: "proje_kodu", baslik: "Kod", genislik: 130,
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
              { anahtar: "durum", baslik: "Durum", genislik: 120, render: r => <Rozet durum={r.durum} /> },
              { anahtar: "termin", baslik: "Termin", genislik: 108,
                render: r => {
                  const gec = r.termin && new Date(r.termin) < new Date().setHours(0, 0, 0, 0);
                  return <span style={{ color: gec ? T.renk.hata : T.renk.metin, fontWeight: gec ? 650 : 400 }}>
                    {fmtTarih(r.termin)}</span>;
                }},
              { anahtar: "ilerleme_yuzde", baslik: "İlerleme", genislik: 130,
                render: r => <Ilerleme yuzde={r.ilerleme_yuzde} /> },
              { anahtar: "butce_toplam", baslik: "Bütçe", hizala: "right", genislik: 120,
                render: r => fmtPara(r.butce_toplam) },
              { anahtar: "maliyet_toplam", baslik: "Gerçekleşen", hizala: "right", genislik: 130,
                render: r => {
                  const asim = Number(r.butce_toplam) > 0 && Number(r.maliyet_toplam) > Number(r.butce_toplam);
                  return <span style={{ color: asim ? T.renk.hata : T.renk.metin, fontWeight: asim ? 650 : 400 }}>
                    {fmtPara(r.maliyet_toplam)}</span>;
                }},
              ...(finansGorur ? [{ anahtar: "net_kar", baslik: "Net Kâr", hizala: "right", genislik: 120,
                render: r => <span style={{ color: Number(r.net_kar) >= 0 ? T.renk.basari : T.renk.hata, fontWeight: 650 }}>
                  {fmtPara(r.net_kar)}</span> }] : []),
            ]} />
        </div>
      )}

      {/* ALT BÖLÜM: 3 kolon */}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {yetkiVar("satinalma") && (
          <Kart pad={0}>
            <KartBaslik baslik="Açık Satın Alma" sayi={siparis.length} onGit={() => git("satinalma")} />
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {!siparis.length ? <Bos ikon="⇩" baslik="Açık sipariş yok" /> :
                siparis.slice(0, 8).map(s => (
                  <SatirOge key={s.id} sol={s.siparis_no} altSol={`${s.tedarikci || "—"}${s.proje_kodu ? " · " + s.proje_kodu : ""}`}
                    sag={fmtPara(s.genel_toplam, s.cur)}
                    altSag={<span style={{ color: s.gecikmis ? T.renk.hata : T.renk.metinPasif, fontWeight: s.gecikmis ? 650 : 400 }}>
                      {s.gecikmis ? "gecikmiş · " : ""}{fmtTarih(s.termin)}</span>} />
                ))}
            </div>
          </Kart>
        )}

        {yetkiVar("depo") && (
          <Kart pad={0}>
            <KartBaslik baslik="Kritik Stok" sayi={kritik.length} onGit={() => git("depo")} />
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {!kritik.length ? <Bos ikon="▤" baslik="Kritik seviyede kalem yok" /> :
                kritik.slice(0, 8).map(k => (
                  <SatirOge key={k.id} sol={k.malzeme_kodu} altSol={k.malzeme_adi}
                    sag={<span style={{ color: T.renk.hata, fontWeight: 700 }}>{fmtSayi(k.toplam_stok)} {k.birim}</span>}
                    altSag={`kritik: ${fmtSayi(k.kritik_stok)}`} />
                ))}
            </div>
          </Kart>
        )}

        {yetkiVar("servis") && (
          <Kart pad={0}>
            <KartBaslik baslik="Yaklaşan Bakımlar" sayi={bakim.length} onGit={() => git("servis")} />
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {!bakim.length ? <Bos ikon="⚙" baslik="60 gün içinde planlı bakım yok" /> :
                bakim.slice(0, 8).map(b => (
                  <SatirOge key={b.id} sol={b.ad} altSol={`${b.musteri || "—"}${b.saha_adi ? " · " + b.saha_adi : ""}`}
                    sag={fmtTarih(b.sonraki_bakim)}
                    altSag={<span style={{ color: b.kalan_gun < 0 ? T.renk.hata : b.kalan_gun < 15 ? T.renk.uyari : T.renk.metinPasif }}>
                      {b.kalan_gun < 0 ? `${Math.abs(b.kalan_gun)} gün gecikti` : `${b.kalan_gun} gün kaldı`}</span>} />
                ))}
            </div>
          </Kart>
        )}
      </div>
    </>
  );
}

// ── Yardımcı görünüm parçaları ──────────────────────────────────────────────
function BolumBasligi({ baslik, aciklama, eylem }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end",
      marginBottom: 10, gap: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 640 }}>{baslik}</h2>
        {aciklama && <p style={{ margin: "2px 0 0", fontSize: 12.5, color: T.renk.metinPasif }}>{aciklama}</p>}
      </div>
      {eylem}
    </div>
  );
}

function KartBaslik({ baslik, sayi, onGit }) {
  return (
    <div style={{ padding: "13px 16px", borderBottom: `1px solid ${T.renk.cizgi}`,
      display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 640 }}>{baslik}</span>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
          background: "#f1f5f9", color: T.renk.metinSoluk }}>{sayi}</span>
      </div>
      <button onClick={onGit} style={{ border: "none", background: "none", cursor: "pointer",
        fontSize: 12, color: T.renk.marka, fontWeight: 600 }}>→</button>
    </div>
  );
}

function SatirOge({ sol, altSol, sag, altSag }) {
  return (
    <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.renk.cizgi}`,
      display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sol}</div>
        <div style={{ fontSize: 11.5, color: T.renk.metinPasif, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{altSol}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{sag}</div>
        <div style={{ fontSize: 11.5 }}>{altSag}</div>
      </div>
    </div>
  );
}
