// ─────────────────────────────────────────────────────────────────────────────
// PROJELER — sistemin merkezi.
// Liste → proje detayı (özet · iş kırılımı · maliyet · doküman)
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from "react";
import { api, nextDocNo, logAudit } from "../services/api";
import ProjeDetay from "./ProjeDetay";
import { T, PROJE_TIPI_ETIKET, DURUM_ETIKET } from "../ui/theme";
import { Kart, Baslik, Btn, Rozet, Tablo, Modal, Alan, Giris, Metin, Secim, Satir,
         Arama, Olcum, Ilerleme, OnayModal,
         fmtPara, fmtTarih, parseSayi, bugun, eslesir } from "../ui/kit";

const TIPLER  = Object.entries(PROJE_TIPI_ETIKET).map(([v, l]) => [v, l]);
const DURUMLAR = ["teklif", "onay_bekliyor", "devam", "beklemede", "tamamlandi", "garanti", "iptal"]
  .map(v => [v, DURUM_ETIKET[v]]);
const CURLAR = [["TRY", "₺ TL"], ["EUR", "€ EUR"], ["USD", "$ USD"], ["GBP", "£ GBP"]];

const BOS_PROJE = {
  proje_kodu: "", proje_adi: "", musteri_id: "", tip: "muhendislik", durum: "teklif",
  sorumlu_id: "", saha_adi: "", saha_adres: "", baslangic: bugun(), termin: "",
  sozlesme_no: "", sozlesme_bedeli: "", cur: "TRY",
  butce_malzeme: "", butce_iscilik: "", butce_taseron: "", butce_diger: "",
  ilerleme_yuzde: 0, aciklama: "",
};

export default function Projeler({ profil, yetkiVar, goster }) {
  const [liste, setListe]   = useState([]);
  const [ozetler, setOzet]  = useState({});     // v_project_summary id → satır
  const [musteriler, setMus] = useState([]);
  const [kullanicilar, setKul] = useState([]);
  const [yukleniyor, setYuk] = useState(true);
  const [secili, setSecili]  = useState(null);  // proje id → detay ekranı
  const [ara, setAra]        = useState("");
  const [fDurum, setFDurum]  = useState("");
  const [fTip, setFTip]      = useState("");
  const [form, setForm]      = useState(null);  // düzenleme modalı
  const [kaydediyor, setKay] = useState(false);
  const [silinecek, setSil]  = useState(null);

  const yazabilir  = yetkiVar("proje", "ekle");
  const silebilir  = yetkiVar("proje", "sil");

  // ── Veri yükleme ──────────────────────────────────────────────────────────
  const yukle = useCallback(async () => {
    setYuk(true);
    try {
      const [p, o, m, k] = await Promise.all([
        // DİKKAT: projects tablosunun app_users'a İKİ yabancı anahtarı var
        // (sorumlu_id ve created_by). Gömülü sorgu (sorumlu:app_users(...)) bu yüzden
        // "more than one relationship was found" hatası verir. Sorumlu adı aşağıda
        // yüklenen kullanıcı listesinden eşleştiriliyor.
        api.list("projects", { select: "*,musteri:companies(id,unvan)",
                               order: "created_at.desc", limit: 500 }),
        api.list("v_project_summary", { limit: 500 }).catch(() => []),
        api.list("companies", { select: "id,unvan,kod", in: { tip: ["musteri", "her_ikisi"] },
                                eq: { aktif: true }, order: "unvan.asc", limit: 1000 }).catch(() => []),
        api.list("app_users", { select: "id,ad_soyad,email", eq: { aktif: true }, order: "ad_soyad.asc" }).catch(() => []),
      ]);
      setListe(p);
      const h = {}; o.forEach(r => { h[r.id] = r; }); setOzet(h);
      setMus(m); setKul(k);
    } catch (e) { goster("Projeler yüklenemedi: " + e.message, "hata"); }
    finally { setYuk(false); }
  }, [goster]);

  useEffect(() => { yukle(); }, [yukle]);

  // Kullanıcı id → ad soyad eşlemesi (gömülü sorgu yerine yerel çözüm)
  const adSoyad = useCallback(
    id => kullanicilar.find(u => u.id === id)?.ad_soyad || null,
    [kullanicilar]);

  // ── Filtreleme ────────────────────────────────────────────────────────────
  const filtreli = useMemo(() => liste.filter(p => {
    if (fDurum && p.durum !== fDurum) return false;
    if (fTip && p.tip !== fTip) return false;
    if (ara && !(eslesir(p.proje_kodu, ara) || eslesir(p.proje_adi, ara)
              || eslesir(p.musteri?.unvan, ara) || eslesir(p.saha_adi, ara))) return false;
    return true;
  }), [liste, ara, fDurum, fTip]);

  const sayilar = useMemo(() => {
    const a = { hepsi: liste.length };
    DURUMLAR.forEach(([d]) => { a[d] = liste.filter(p => p.durum === d).length; });
    return a;
  }, [liste]);

  // ── Kaydetme ──────────────────────────────────────────────────────────────
  async function yeniAc() {
    let kod = "";
    try { kod = await nextDocNo("OMX"); } catch { kod = `OMX-${new Date().getFullYear()}-`; }
    setForm({ ...BOS_PROJE, proje_kodu: kod, sorumlu_id: profil?.id || "" });
  }

  async function kaydet() {
    if (!form.proje_adi.trim()) return goster("Proje adı zorunlu.", "hata");
    if (!form.proje_kodu.trim()) return goster("Proje kodu zorunlu.", "hata");
    setKay(true);
    try {
      const govde = {
        proje_kodu: form.proje_kodu.trim(),
        proje_adi:  form.proje_adi.trim(),
        musteri_id: form.musteri_id || null,
        tip: form.tip, durum: form.durum,
        sorumlu_id: form.sorumlu_id || null,
        saha_adi: form.saha_adi || null, saha_adres: form.saha_adres || null,
        baslangic: form.baslangic || null, termin: form.termin || null,
        bitis: form.durum === "tamamlandi" ? (form.bitis || bugun()) : (form.bitis || null),
        sozlesme_no: form.sozlesme_no || null,
        sozlesme_bedeli: parseSayi(form.sozlesme_bedeli) || 0,
        cur: form.cur,
        butce_malzeme: parseSayi(form.butce_malzeme) || 0,
        butce_iscilik: parseSayi(form.butce_iscilik) || 0,
        butce_taseron: parseSayi(form.butce_taseron) || 0,
        butce_diger:   parseSayi(form.butce_diger) || 0,
        ilerleme_yuzde: Number(form.ilerleme_yuzde) || 0,
        aciklama: form.aciklama || null,
      };
      if (form.id) {
        await api.update("projects", form.id, govde);
        logAudit({ tablo: "projects", kayit_id: form.id, islem: "update", yeni: govde });
        goster("Proje güncellendi.", "basari");
      } else {
        const yeni = await api.insert("projects", { ...govde, created_by: profil?.id || null });
        logAudit({ tablo: "projects", kayit_id: yeni?.id, islem: "insert", yeni: govde });
        goster("Proje oluşturuldu.", "basari");
      }
      setForm(null); yukle();
    } catch (e) { goster(e.message, "hata"); }
    finally { setKay(false); }
  }

  async function sil() {
    try {
      await api.remove("projects", silinecek.id);
      logAudit({ tablo: "projects", kayit_id: silinecek.id, islem: "delete", eski: silinecek });
      goster("Proje silindi.", "basari");
      setSil(null); setSecili(null); yukle();
    } catch (e) { goster(e.message, "hata"); setSil(null); }
  }

  // ── Detay ekranı ──────────────────────────────────────────────────────────
  if (secili) return (
    <ProjeDetay projeId={secili} ozet={ozetler[secili]} profil={profil}
      yetkiVar={yetkiVar} goster={goster} kullanicilar={kullanicilar}
      onGeri={() => { setSecili(null); yukle(); }}
      onDuzenle={p => setForm({
        ...BOS_PROJE, ...p,
        musteri_id: p.musteri_id || "", sorumlu_id: p.sorumlu_id || "",
      })} />
  );

  return (
    <>
      <Baslik ust="Operasyon" aciklama="Teklif aşamasından garanti bitimine kadar tüm projeler"
        sag={yazabilir && <Btn tur="birincil" onClick={yeniAc} ikon="＋">Yeni Proje</Btn>}>
        Projeler
      </Baslik>

      {/* Özet ölçümler */}
      <div style={{ display: "grid", gap: 12, marginBottom: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <Olcum etiket="Toplam Proje" deger={sayilar.hepsi} ikon="◈" />
        <Olcum etiket="Devam Eden" deger={sayilar.devam || 0} ikon="▸"
          renk={T.renk.marka} zemin={T.renk.markaAcik} />
        <Olcum etiket="Teklif Aşaması" deger={sayilar.teklif || 0} ikon="✎"
          renk={T.renk.uyari} zemin={T.renk.uyariAcik} />
        <Olcum etiket="Tamamlanan" deger={sayilar.tamamlandi || 0} ikon="✓"
          renk={T.renk.basari} zemin={T.renk.basariAcik} />
      </div>

      {/* Filtreler */}
      <Kart pad={13} style={{ marginBottom: 14 }}>
        <Satir bosluk={10} style={{ alignItems: "center" }}>
          <Arama deger={ara} onDegisim={setAra} yer="Kod, proje adı, müşteri, saha…" genislik={300} />
          <div style={{ width: 175 }}>
            <Secim value={fDurum} onChange={e => setFDurum(e.target.value)}
              secenekler={DURUMLAR} bos="Tüm durumlar" />
          </div>
          <div style={{ width: 190 }}>
            <Secim value={fTip} onChange={e => setFTip(e.target.value)}
              secenekler={TIPLER} bos="Tüm proje tipleri" />
          </div>
          <div style={{ marginLeft: "auto", fontSize: 12.5, color: T.renk.metinPasif }}>
            {filtreli.length} kayıt
          </div>
        </Satir>
      </Kart>

      <Tablo yukleniyor={yukleniyor} veri={filtreli} onSatirTikla={p => setSecili(p.id)}
        bosMesaj={ara || fDurum || fTip ? "Filtreye uyan proje yok" : "Henüz proje oluşturulmadı"}
        sutunlar={[
          { anahtar: "proje_kodu", baslik: "Kod", genislik: 132,
            render: r => <b style={{ color: T.renk.marka }}>{r.proje_kodu}</b> },
          { anahtar: "proje_adi", baslik: "Proje",
            render: r => (
              <div>
                <div style={{ fontWeight: 550 }}>{r.proje_adi}</div>
                <div style={{ fontSize: 11.5, color: T.renk.metinPasif }}>
                  {r.musteri?.unvan || "müşteri atanmadı"}{r.saha_adi ? ` · ${r.saha_adi}` : ""}
                </div>
              </div>
            )},
          { anahtar: "tip", baslik: "Tip", genislik: 140,
            render: r => <span style={{ fontSize: 12.5 }}>{PROJE_TIPI_ETIKET[r.tip] || r.tip}</span> },
          { anahtar: "durum", baslik: "Durum", genislik: 122, render: r => <Rozet durum={r.durum} /> },
          { anahtar: "sorumlu", baslik: "Sorumlu", genislik: 140,
            render: r => <span style={{ fontSize: 12.5 }}>{adSoyad(r.sorumlu_id) || "—"}</span> },
          { anahtar: "termin", baslik: "Termin", genislik: 104,
            render: r => {
              const gec = r.termin && new Date(r.termin) < new Date().setHours(0, 0, 0, 0)
                && !["tamamlandi", "iptal"].includes(r.durum);
              return <span style={{ color: gec ? T.renk.hata : T.renk.metin, fontWeight: gec ? 650 : 400 }}>
                {fmtTarih(r.termin)}</span>;
            }},
          { anahtar: "ilerleme_yuzde", baslik: "İlerleme", genislik: 128,
            render: r => <Ilerleme yuzde={r.ilerleme_yuzde} /> },
          { anahtar: "sozlesme_bedeli", baslik: "Sözleşme", hizala: "right", genislik: 130,
            render: r => fmtPara(r.sozlesme_bedeli, r.cur) },
          { anahtar: "kar", baslik: "Net Kâr", hizala: "right", genislik: 122,
            render: r => {
              const o = ozetler[r.id];
              if (!o) return "—";
              return <span style={{ color: Number(o.net_kar) >= 0 ? T.renk.basari : T.renk.hata, fontWeight: 650 }}>
                {fmtPara(o.net_kar)}</span>;
            }},
          ...(silebilir ? [{ anahtar: "islem", baslik: "", genislik: 46, hizala: "center",
            render: r => <button title="Sil" onClick={e => { e.stopPropagation(); setSil(r); }}
              style={{ border: "none", background: "none", cursor: "pointer", color: T.renk.hata, fontSize: 15 }}>×</button> }] : []),
        ]} />

      {/* PROJE FORMU */}
      <Modal acik={!!form} onKapat={() => setForm(null)} genislik={860}
        baslik={form?.id ? "Projeyi Düzenle" : "Yeni Proje"}
        aciklama={form?.id ? form.proje_kodu : "Proje kodu otomatik üretildi, dilerseniz değiştirin"}
        altBar={<>
          <Btn onClick={() => setForm(null)}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={kaydet} disabled={kaydediyor}>
            {kaydediyor ? "Kaydediliyor…" : "Kaydet"}</Btn>
        </>}>
        {form && <ProjeFormu form={form} setForm={setForm} musteriler={musteriler} kullanicilar={kullanicilar} />}
      </Modal>

      <OnayModal acik={!!silinecek} tehlike onHayir={() => setSil(null)} onEvet={sil}
        baslik="Proje silinsin mi?"
        mesaj={`"${silinecek?.proje_adi}" projesi ve ona bağlı görev, maliyet ve doküman kayıtları silinir. Bu işlem geri alınamaz.`} />
    </>
  );
}

// ── Proje formu ─────────────────────────────────────────────────────────────
function ProjeFormu({ form, setForm, musteriler, kullanicilar }) {
  const d = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const butceToplam = ["butce_malzeme", "butce_iscilik", "butce_taseron", "butce_diger"]
    .reduce((t, k) => t + (parseSayi(form[k]) || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Bolum baslik="Tanım">
        <Satir>
          <Alan etiket="Proje Kodu" zorunlu genislik="180px">
            <Giris value={form.proje_kodu} onChange={e => d("proje_kodu", e.target.value)} placeholder="OMX-2026-0001" />
          </Alan>
          <Alan etiket="Proje Adı" zorunlu genislik="320px">
            <Giris value={form.proje_adi} onChange={e => d("proje_adi", e.target.value)}
              placeholder="Örn. Çimento Fabrikası Paketleme Hattı Otomasyonu" />
          </Alan>
        </Satir>
        <Satir>
          <Alan etiket="Müşteri" genislik="280px">
            <Secim value={form.musteri_id} onChange={e => d("musteri_id", e.target.value)}
              bos="Müşteri seçin…"
              secenekler={musteriler.map(m => [m.id, m.kod ? `${m.kod} · ${m.unvan}` : m.unvan])} />
          </Alan>
          <Alan etiket="Proje Tipi" genislik="200px">
            <Secim value={form.tip} onChange={e => d("tip", e.target.value)} secenekler={TIPLER} bos={false} />
          </Alan>
          <Alan etiket="Durum" genislik="170px">
            <Secim value={form.durum} onChange={e => d("durum", e.target.value)} secenekler={DURUMLAR} bos={false} />
          </Alan>
          <Alan etiket="Proje Sorumlusu" genislik="220px">
            <Secim value={form.sorumlu_id} onChange={e => d("sorumlu_id", e.target.value)}
              bos="Atanmadı" secenekler={kullanicilar.map(u => [u.id, u.ad_soyad || u.email])} />
          </Alan>
        </Satir>
      </Bolum>

      <Bolum baslik="Saha ve Takvim" ipucu="Taahhüt ve servis işlerinde saha bilgisi raporlamada kullanılır">
        <Satir>
          <Alan etiket="Saha / Tesis Adı" genislik="260px">
            <Giris value={form.saha_adi || ""} onChange={e => d("saha_adi", e.target.value)} placeholder="Örn. Bolu 2. Hat" />
          </Alan>
          <Alan etiket="Saha Adresi" genislik="360px">
            <Giris value={form.saha_adres || ""} onChange={e => d("saha_adres", e.target.value)} />
          </Alan>
        </Satir>
        <Satir>
          <Alan etiket="Başlangıç" genislik="150px">
            <Giris type="date" value={form.baslangic || ""} onChange={e => d("baslangic", e.target.value)} />
          </Alan>
          <Alan etiket="Termin" genislik="150px">
            <Giris type="date" value={form.termin || ""} onChange={e => d("termin", e.target.value)} />
          </Alan>
          <Alan etiket="Bitiş" genislik="150px" ipucu="Tamamlandığında doldurulur">
            <Giris type="date" value={form.bitis || ""} onChange={e => d("bitis", e.target.value)} />
          </Alan>
          <Alan etiket="İlerleme (%)" genislik="130px">
            <Giris type="number" min="0" max="100" value={form.ilerleme_yuzde}
              onChange={e => d("ilerleme_yuzde", e.target.value)} />
          </Alan>
        </Satir>
      </Bolum>

      <Bolum baslik="Sözleşme ve Bütçe"
        ipucu="Bütçe kalemleri gerçekleşen maliyetle karşılaştırılır; aşım panelde kırmızı görünür">
        <Satir>
          <Alan etiket="Sözleşme No" genislik="180px">
            <Giris value={form.sozlesme_no || ""} onChange={e => d("sozlesme_no", e.target.value)} />
          </Alan>
          <Alan etiket="Sözleşme Bedeli" genislik="180px">
            <Giris value={form.sozlesme_bedeli} onChange={e => d("sozlesme_bedeli", e.target.value)} placeholder="0,00" />
          </Alan>
          <Alan etiket="Para Birimi" genislik="130px">
            <Secim value={form.cur} onChange={e => d("cur", e.target.value)} secenekler={CURLAR} bos={false} />
          </Alan>
        </Satir>
        <Satir>
          <Alan etiket="Bütçe · Malzeme" genislik="160px">
            <Giris value={form.butce_malzeme} onChange={e => d("butce_malzeme", e.target.value)} placeholder="0,00" />
          </Alan>
          <Alan etiket="Bütçe · İşçilik" genislik="160px">
            <Giris value={form.butce_iscilik} onChange={e => d("butce_iscilik", e.target.value)} placeholder="0,00" />
          </Alan>
          <Alan etiket="Bütçe · Taşeron" genislik="160px">
            <Giris value={form.butce_taseron} onChange={e => d("butce_taseron", e.target.value)} placeholder="0,00" />
          </Alan>
          <Alan etiket="Bütçe · Diğer" genislik="160px">
            <Giris value={form.butce_diger} onChange={e => d("butce_diger", e.target.value)} placeholder="0,00" />
          </Alan>
        </Satir>
        <div style={{ fontSize: 12.5, color: T.renk.metinSoluk, background: "#f8fafc",
          padding: "9px 13px", borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
          <span>Toplam bütçe</span>
          <b style={{ color: T.renk.metin }}>{fmtPara(butceToplam, form.cur)}</b>
        </div>
      </Bolum>

      <Alan etiket="Açıklama">
        <Metin value={form.aciklama || ""} onChange={e => d("aciklama", e.target.value)} satir={3}
          placeholder="Kapsam, özel şartlar, dikkat edilecek noktalar…" />
      </Alan>
    </div>
  );
}

function Bolum({ baslik, ipucu, children }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em",
          textTransform: "uppercase", color: T.renk.metinPasif }}>{baslik}</div>
        {ipucu && <div style={{ fontSize: 11.5, color: T.renk.metinPasif }}>· {ipucu}</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>{children}</div>
    </div>
  );
}
