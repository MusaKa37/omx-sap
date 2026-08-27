// ─────────────────────────────────────────────────────────────────────────────
// PROJE DETAYI — bir projenin tüm operasyonu tek ekranda.
// Sekmeler: Özet · İş Kırılımı · Maliyet · Doküman
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from "react";
import { api, uploadFile, deleteFile } from "../services/api";
import { T, PROJE_TIPI_ETIKET, FAALIYET_ETIKET } from "../ui/theme";
import { Kart, Btn, Rozet, Tablo, Modal, Alan, Giris, Metin, Secim, Satir,
         Sekmeler, Olcum, Ilerleme, Bos, OnayModal,
         fmtPara, fmtTarih, fmtSayi, fmtBoyut, parseSayi, bugun,
         DosyaRozet, uzanti, Arama, eslesir } from "../ui/kit";

const MALIYET_KAYNAK = [
  ["malzeme", "Malzeme"], ["iscilik", "İşçilik"], ["taseron", "Taşeron"],
  ["seyahat", "Seyahat & Konaklama"], ["ekipman", "Ekipman"], ["nakliye", "Nakliye"],
  ["genel_gider", "Genel Gider"], ["diger", "Diğer"],
];
const DOKUMAN_TIPI = [
  ["sozlesme", "Sözleşme & Teklif"], ["teknik_resim", "Teknik Resim"],
  ["eplan", "Elektrik Projesi (EPLAN)"], ["plc_program", "PLC Programı"],
  ["hmi_program", "HMI / SCADA Projesi"], ["malzeme_listesi", "Malzeme Listesi (Excel)"],
  ["hesap", "Hesap & Analiz"], ["test_raporu", "Test Raporu"],
  ["devreye_alma", "Devreye Alma Tutanağı"], ["kilavuz", "Kılavuz & Dokümantasyon"],
  ["fotograf", "Fotoğraf & Görsel"], ["yazisma", "Yazışma"], ["diger", "Diğer"],
];
const DOKUMAN_TIPI_AD = Object.fromEntries(DOKUMAN_TIPI);

const NOT_TIPI = [
  ["not", "Not", "#475569", "#f1f5f9"],
  ["karar", "Karar", "#1d4ed8", "#dbeafe"],
  ["risk", "Risk", "#b91c1c", "#fee2e2"],
  ["musteri", "Müşteri Görüşmesi", "#15803d", "#dcfce7"],
  ["saha", "Saha Raporu", "#a16207", "#fef3c7"],
  ["degisiklik", "Değişiklik Talebi", "#7c3aed", "#ede9fe"],
];
const GOREV_DURUM = [["planlandi", "Planlandı"], ["devam", "Devam"], ["tamamlandi", "Tamamlandı"], ["beklemede", "Beklemede"]];

export default function ProjeDetay({ projeId, ozet, profil, yetkiVar, goster, kullanicilar, onGeri, onDuzenle }) {
  const [proje, setProje]   = useState(null);
  const [sekme, setSekme]   = useState("ozet");
  const [gorevler, setGorev] = useState([]);
  const [maliyet, setMaliyet] = useState([]);
  const [dokuman, setDokuman] = useState([]);
  const [notlar, setNotlar]   = useState([]);
  const [yuk, setYuk]       = useState(true);
  const [ozetV, setOzetV]   = useState(ozet);

  const duzenleyebilir = yetkiVar("proje", "duzenle");
  const sorumluAdi = kullanicilar.find(u => u.id === proje?.sorumlu_id)?.ad_soyad || null;

  const yukle = useCallback(async () => {
    setYuk(true);
    try {
      const [p, g, m, d, o, n] = await Promise.all([
        // projects → app_users ilişkisi iki yabancı anahtar üzerinden kurulduğu için
        // gömülü sorgu kullanılmaz; sorumlu, kullanicilar listesinden eşleştirilir.
        api.one("projects", projeId, "*,musteri:companies(id,unvan,telefon,ilgili_kisi)"),
        api.list("project_tasks", { eq: { project_id: projeId }, order: "sira.asc,id.asc" }).catch(() => []),
        yetkiVar("maliyet") ? api.list("project_costs", { eq: { project_id: projeId }, order: "tarih.desc,id.desc", limit: 500 }).catch(() => []) : [],
        api.list("project_documents", { select: "*,yukleyen:app_users(ad_soyad)", eq: { project_id: projeId }, order: "created_at.desc" }).catch(() => []),
        api.list("v_project_summary", { eq: { id: projeId }, limit: 1 }).catch(() => []),
        api.list("project_notes", { select: "*,yazan:app_users(ad_soyad)",
                                    eq: { project_id: projeId },
                                    order: "onemli.desc,tarih.desc,id.desc" }).catch(() => []),
      ]);
      setProje(p); setGorev(g); setMaliyet(m); setDokuman(d); setNotlar(n);
      if (o?.[0]) setOzetV(o[0]);
    } catch (e) { goster("Proje okunamadı: " + e.message, "hata"); }
    finally { setYuk(false); }
  }, [projeId, goster, yetkiVar]);

  useEffect(() => { yukle(); }, [yukle]);

  if (yuk && !proje) return <Kart><Bos ikon="◌" baslik="Yükleniyor…" /></Kart>;
  if (!proje) return <Kart><Bos ikon="⚠" baslik="Proje bulunamadı" eylem={<Btn onClick={onGeri}>← Listeye dön</Btn>} /></Kart>;

  const butce = Number(proje.butce_malzeme || 0) + Number(proje.butce_iscilik || 0)
              + Number(proje.butce_taseron || 0) + Number(proje.butce_diger || 0);
  const gerceklesen = Number(ozetV?.maliyet_toplam || 0);
  const gelir = Number(ozetV?.faturalanan_gelir || 0);
  const kar = gelir - gerceklesen;

  return (
    <>
      {/* ÜST BAŞLIK */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <button onClick={onGeri} style={{ border: "none", background: "none", cursor: "pointer",
            color: T.renk.metinSoluk, fontSize: 12.5, padding: 0, marginBottom: 8 }}>← Projeler</button>
          <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: T.renk.marka,
              background: T.renk.markaAcik, padding: "3px 9px", borderRadius: 6 }}>{proje.proje_kodu}</span>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 650, letterSpacing: "-.02em" }}>{proje.proje_adi}</h1>
            <Rozet durum={proje.durum} />
          </div>
          <div style={{ fontSize: 13, color: T.renk.metinSoluk, marginTop: 7 }}>
            {proje.musteri?.unvan || "Müşteri atanmadı"} · {PROJE_TIPI_ETIKET[proje.tip] || proje.tip}
            {proje.saha_adi ? ` · ${proje.saha_adi}` : ""}
            {sorumluAdi ? ` · Sorumlu: ${sorumluAdi}` : ""}
          </div>
        </div>
        {duzenleyebilir && <Btn tur="birincil" onClick={() => onDuzenle(proje)} ikon="✎">Düzenle</Btn>}
      </div>

      {/* ÖLÇÜMLER */}
      <div style={{ display: "grid", gap: 12, marginBottom: 20,
        gridTemplateColumns: "repeat(auto-fit, minmax(196px, 1fr))" }}>
        <Olcum etiket="Sözleşme Bedeli" deger={fmtPara(proje.sozlesme_bedeli, proje.cur)} ikon="◈" />
        <Olcum etiket="Bütçe" deger={fmtPara(butce)} ikon="◇"
          alt={butce ? `gerçekleşen %${Math.round(gerceklesen / butce * 100)}` : "bütçe girilmedi"} />
        <Olcum etiket="Gerçekleşen Maliyet" deger={fmtPara(gerceklesen)} ikon="∑"
          renk={butce && gerceklesen > butce ? T.renk.hata : T.renk.metin}
          zemin={butce && gerceklesen > butce ? T.renk.hataAcik : "#f1f5f9"}
          alt={butce && gerceklesen > butce ? `bütçe aşımı ${fmtPara(gerceklesen - butce)}` : "bütçe içinde"} />
        <Olcum etiket="Faturalanan" deger={fmtPara(gelir)} ikon="₺"
          renk={T.renk.basari} zemin={T.renk.basariAcik} />
        <Olcum etiket="Net Kâr" deger={fmtPara(kar)} ikon="↗"
          renk={kar >= 0 ? T.renk.basari : T.renk.hata}
          zemin={kar >= 0 ? T.renk.basariAcik : T.renk.hataAcik}
          alt={ozetV?.kar_marji_yuzde != null ? `marj %${ozetV.kar_marji_yuzde}` : "henüz fatura yok"} />
      </div>

      <Sekmeler aktif={sekme} onDegisim={setSekme} sekmeler={[
        { anahtar: "ozet",    baslik: "Özet" },
        { anahtar: "bilgi",   baslik: "Bilgi & Notlar", sayi: notlar.length },
        { anahtar: "dosya",   baslik: "Dosyalar", sayi: dokuman.length },
        { anahtar: "gorev",   baslik: "İş Kırılımı", sayi: gorevler.length },
        { anahtar: "maliyet", baslik: "Maliyet", sayi: maliyet.length },
      ]} />

      {sekme === "ozet"    && <Ozet proje={proje} ozetV={ozetV} gorevler={gorevler} butce={butce} />}
      {sekme === "gorev"   && <Gorevler projeId={projeId} gorevler={gorevler} kullanicilar={kullanicilar}
                                yetki={duzenleyebilir} goster={goster} onYenile={yukle} />}
      {sekme === "maliyet" && <Maliyetler projeId={projeId} maliyet={maliyet} butce={proje}
                                yetki={yetkiVar("maliyet", "ekle")} goster={goster} onYenile={yukle} />}
      {sekme === "bilgi"   && <BilgiNotlar proje={proje} notlar={notlar} profil={profil}
                                yetki={duzenleyebilir} goster={goster} onYenile={yukle} />}
      {sekme === "dosya"   && <Dosyalar projeId={projeId} dokuman={dokuman} profil={profil}
                                yetki={yetkiVar("dokuman", "ekle")}
                                silebilir={yetkiVar("dokuman", "sil")}
                                goster={goster} onYenile={yukle} />}
    </>
  );
}

// ── ÖZET SEKMESİ ────────────────────────────────────────────────────────────
function Ozet({ proje, ozetV, gorevler, butce }) {
  const kalemler = [
    ["Malzeme", proje.butce_malzeme, ozetV?.maliyet_malzeme],
    ["İşçilik", proje.butce_iscilik, ozetV?.maliyet_iscilik],
    ["Taşeron", proje.butce_taseron, ozetV?.maliyet_taseron],
    ["Diğer",   proje.butce_diger,   ozetV?.maliyet_diger],
  ];
  const planSaat = gorevler.reduce((t, g) => t + Number(g.plan_saat || 0), 0);
  const gercekSaat = gorevler.reduce((t, g) => t + Number(g.gercek_saat || 0), 0);

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
      <Kart>
        <BolumAd>Bütçe ↔ Gerçekleşen</BolumAd>
        {kalemler.map(([ad, b, g]) => {
          const bs = Number(b || 0), gs = Number(g || 0);
          const oran = bs > 0 ? gs / bs * 100 : (gs > 0 ? 100 : 0);
          const asim = bs > 0 && gs > bs;
          return (
            <div key={ad} style={{ padding: "11px 0", borderBottom: `1px solid ${T.renk.cizgi}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                <span style={{ fontWeight: 550 }}>{ad}</span>
                <span style={{ color: asim ? T.renk.hata : T.renk.metinSoluk }}>
                  <b style={{ color: asim ? T.renk.hata : T.renk.metin }}>{fmtPara(gs)}</b>
                  <span style={{ fontSize: 12 }}> / {fmtPara(bs)}</span>
                </span>
              </div>
              <Ilerleme yuzde={oran} renk={asim ? T.renk.hata : undefined} yukseklik={6} />
            </div>
          );
        })}
        <div style={{ paddingTop: 12, display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 700 }}>
          <span>Toplam</span>
          <span>{fmtPara(ozetV?.maliyet_toplam)} / {fmtPara(butce)}</span>
        </div>
      </Kart>

      <Kart>
        <BolumAd>Proje Bilgileri</BolumAd>
        <Bilgi ad="Müşteri" deger={proje.musteri?.unvan} />
        <Bilgi ad="İlgili Kişi" deger={proje.musteri?.ilgili_kisi} />
        <Bilgi ad="Telefon" deger={proje.musteri?.telefon} />
        <Bilgi ad="Saha / Tesis" deger={proje.saha_adi} />
        <Bilgi ad="Saha Adresi" deger={proje.saha_adres} />
        <Bilgi ad="Sözleşme No" deger={proje.sozlesme_no} />
        <Bilgi ad="Başlangıç" deger={fmtTarih(proje.baslangic)} />
        <Bilgi ad="Termin" deger={fmtTarih(proje.termin)} />
        <Bilgi ad="Bitiş" deger={proje.bitis ? fmtTarih(proje.bitis) : "—"} />
      </Kart>

      <Kart>
        <BolumAd>İlerleme ve Adam-Saat</BolumAd>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, color: T.renk.metinSoluk, marginBottom: 6 }}>Genel ilerleme</div>
          <Ilerleme yuzde={proje.ilerleme_yuzde} yukseklik={10} />
        </div>
        <Bilgi ad="Planlanan Saat" deger={planSaat ? `${fmtSayi(planSaat, 1)} sa` : "—"} />
        <Bilgi ad="Harcanan Saat" deger={gercekSaat ? `${fmtSayi(gercekSaat, 1)} sa` : "—"} />
        <Bilgi ad="Sapma" deger={planSaat ? `${gercekSaat > planSaat ? "+" : ""}${fmtSayi(gercekSaat - planSaat, 1)} sa` : "—"}
          renk={gercekSaat > planSaat && planSaat ? T.renk.hata : undefined} />
        <Bilgi ad="Görev Sayısı" deger={`${gorevler.filter(g => g.durum === "tamamlandi").length} / ${gorevler.length} tamamlandı`} />
        {proje.aciklama && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.renk.cizgi}` }}>
            <div style={{ fontSize: 11.5, color: T.renk.metinPasif, marginBottom: 5 }}>Açıklama</div>
            <div style={{ fontSize: 13, lineHeight: 1.65, color: T.renk.metinSoluk, whiteSpace: "pre-wrap" }}>{proje.aciklama}</div>
          </div>
        )}
      </Kart>
    </div>
  );
}

const BolumAd = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase",
    color: T.renk.metinPasif, marginBottom: 12 }}>{children}</div>
);

const Bilgi = ({ ad, deger, renk }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12,
    padding: "7px 0", borderBottom: `1px solid ${T.renk.cizgi}`, fontSize: 13 }}>
    <span style={{ color: T.renk.metinPasif }}>{ad}</span>
    <span style={{ fontWeight: 550, textAlign: "right", color: renk || T.renk.metin }}>{deger || "—"}</span>
  </div>
);

// ── İŞ KIRILIMI SEKMESİ ─────────────────────────────────────────────────────
const BOS_GOREV = { ad: "", faaliyet: "tasarim", sorumlu_id: "", plan_baslangic: "", plan_bitis: "",
                    plan_saat: "", gercek_saat: "", ilerleme_yuzde: 0, durum: "planlandi", notlar: "" };

function Gorevler({ projeId, gorevler, kullanicilar, yetki, goster, onYenile }) {
  const [form, setForm] = useState(null);
  const [kay, setKay] = useState(false);
  const [silinecek, setSil] = useState(null);

  async function kaydet() {
    if (!form.ad.trim()) return goster("Görev adı zorunlu.", "hata");
    setKay(true);
    try {
      const govde = {
        project_id: projeId, ad: form.ad.trim(), faaliyet: form.faaliyet,
        sorumlu_id: form.sorumlu_id || null,
        plan_baslangic: form.plan_baslangic || null, plan_bitis: form.plan_bitis || null,
        plan_saat: parseSayi(form.plan_saat) || 0, gercek_saat: parseSayi(form.gercek_saat) || 0,
        ilerleme_yuzde: Number(form.ilerleme_yuzde) || 0, durum: form.durum,
        notlar: form.notlar || null,
      };
      if (form.id) await api.update("project_tasks", form.id, govde);
      else await api.insert("project_tasks", govde);
      goster("Görev kaydedildi.", "basari");
      setForm(null); onYenile();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  async function sil() {
    try { await api.remove("project_tasks", silinecek.id); goster("Görev silindi.", "basari"); setSil(null); onYenile(); }
    catch (e) { goster(e.message, "hata"); setSil(null); }
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        {yetki && <Btn tur="birincil" boyut="sm" onClick={() => setForm({ ...BOS_GOREV })} ikon="＋">Görev Ekle</Btn>}
      </div>
      <Tablo veri={gorevler} bosMesaj="Bu proje için henüz görev tanımlanmadı"
        onSatirTikla={yetki ? g => setForm({ ...BOS_GOREV, ...g, sorumlu_id: g.sorumlu_id || "" }) : undefined}
        sutunlar={[
          { anahtar: "ad", baslik: "Görev", render: r => <span style={{ fontWeight: 550 }}>{r.ad}</span> },
          { anahtar: "faaliyet", baslik: "Faaliyet", genislik: 150,
            render: r => <span style={{ fontSize: 12.5 }}>{FAALIYET_ETIKET[r.faaliyet] || r.faaliyet || "—"}</span> },
          { anahtar: "sorumlu_id", baslik: "Sorumlu", genislik: 150,
            render: r => <span style={{ fontSize: 12.5 }}>
              {kullanicilar.find(u => u.id === r.sorumlu_id)?.ad_soyad || "—"}</span> },
          { anahtar: "plan_bitis", baslik: "Plan Bitiş", genislik: 108, render: r => fmtTarih(r.plan_bitis) },
          { anahtar: "saat", baslik: "Saat (gerçek/plan)", genislik: 150, hizala: "right",
            render: r => {
              const asim = Number(r.gercek_saat) > Number(r.plan_saat) && Number(r.plan_saat) > 0;
              return <span style={{ color: asim ? T.renk.hata : T.renk.metin, fontWeight: asim ? 650 : 400 }}>
                {fmtSayi(r.gercek_saat, 1)} / {fmtSayi(r.plan_saat, 1)}</span>;
            }},
          { anahtar: "ilerleme_yuzde", baslik: "İlerleme", genislik: 130, render: r => <Ilerleme yuzde={r.ilerleme_yuzde} /> },
          { anahtar: "durum", baslik: "Durum", genislik: 118, render: r => <Rozet durum={r.durum} /> },
          ...(yetki ? [{ anahtar: "islem", baslik: "", genislik: 50, hizala: "center",
            render: r => <button onClick={e => { e.stopPropagation(); setSil(r); }}
              style={{ border: "none", background: "none", cursor: "pointer", color: T.renk.hata, fontSize: 15 }}>×</button> }] : []),
        ]} />

      <Modal acik={!!form} onKapat={() => setForm(null)} genislik={680}
        baslik={form?.id ? "Görevi Düzenle" : "Yeni Görev"}
        altBar={<>
          <Btn onClick={() => setForm(null)}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={kaydet} disabled={kay}>{kay ? "Kaydediliyor…" : "Kaydet"}</Btn>
        </>}>
        {form && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Alan etiket="Görev Adı" zorunlu>
              <Giris value={form.ad} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))}
                placeholder="Örn. Ana pano elektrik projesi çizimi" />
            </Alan>
            <Satir>
              <Alan etiket="Faaliyet Tipi" genislik="200px">
                <Secim value={form.faaliyet} bos={false}
                  onChange={e => setForm(f => ({ ...f, faaliyet: e.target.value }))}
                  secenekler={Object.entries(FAALIYET_ETIKET)} />
              </Alan>
              <Alan etiket="Sorumlu" genislik="200px">
                <Secim value={form.sorumlu_id} bos="Atanmadı"
                  onChange={e => setForm(f => ({ ...f, sorumlu_id: e.target.value }))}
                  secenekler={kullanicilar.map(u => [u.id, u.ad_soyad || u.email])} />
              </Alan>
              <Alan etiket="Durum" genislik="160px">
                <Secim value={form.durum} bos={false} secenekler={GOREV_DURUM}
                  onChange={e => setForm(f => ({ ...f, durum: e.target.value }))} />
              </Alan>
            </Satir>
            <Satir>
              <Alan etiket="Plan Başlangıç" genislik="150px">
                <Giris type="date" value={form.plan_baslangic || ""}
                  onChange={e => setForm(f => ({ ...f, plan_baslangic: e.target.value }))} />
              </Alan>
              <Alan etiket="Plan Bitiş" genislik="150px">
                <Giris type="date" value={form.plan_bitis || ""}
                  onChange={e => setForm(f => ({ ...f, plan_bitis: e.target.value }))} />
              </Alan>
              <Alan etiket="Plan Saat" genislik="120px">
                <Giris value={form.plan_saat} onChange={e => setForm(f => ({ ...f, plan_saat: e.target.value }))} />
              </Alan>
              <Alan etiket="Gerçek Saat" genislik="120px" ipucu="Puantajdan da beslenir">
                <Giris value={form.gercek_saat} onChange={e => setForm(f => ({ ...f, gercek_saat: e.target.value }))} />
              </Alan>
              <Alan etiket="İlerleme (%)" genislik="120px">
                <Giris type="number" min="0" max="100" value={form.ilerleme_yuzde}
                  onChange={e => setForm(f => ({ ...f, ilerleme_yuzde: e.target.value }))} />
              </Alan>
            </Satir>
            <Alan etiket="Notlar">
              <Metin value={form.notlar || ""} satir={2}
                onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))} />
            </Alan>
          </div>
        )}
      </Modal>

      <OnayModal acik={!!silinecek} tehlike onHayir={() => setSil(null)} onEvet={sil}
        baslik="Görev silinsin mi?" mesaj={`"${silinecek?.ad}" görevi kalıcı olarak silinecek.`} />
    </>
  );
}

// ── MALİYET SEKMESİ ─────────────────────────────────────────────────────────
function Maliyetler({ projeId, maliyet, yetki, goster, onYenile }) {
  const [form, setForm] = useState(null);
  const [kay, setKay] = useState(false);

  const toplamlar = useMemo(() => {
    const t = {};
    maliyet.forEach(m => { t[m.kaynak] = (t[m.kaynak] || 0) + Number(m.tutar_try || 0); });
    return t;
  }, [maliyet]);
  const genelToplam = Object.values(toplamlar).reduce((a, b) => a + b, 0);

  async function kaydet() {
    const tutar = parseSayi(form.tutar);
    if (!tutar) return goster("Tutar girilmeli.", "hata");
    // Dövizli maliyette kur boş bırakılırsa 1 varsayılıyordu → 5.000 EUR proje
    // maliyetine 5.000 TL olarak düşüyordu. Kur artık zorunlu (Muhasebe ile aynı kural).
    const kur = parseSayi(form.kur);
    if (form.cur !== "TRY" && !(kur > 0))
      return goster("Dövizli maliyette kur girilmeli.", "hata");
    setKay(true);
    try {
      await api.insert("project_costs", {
        project_id: projeId, tarih: form.tarih, kaynak: form.kaynak,
        kaynak_tablo: "manuel", aciklama: form.aciklama || null,
        tutar, cur: form.cur, tutar_try: form.cur === "TRY" ? tutar : tutar * kur,
        kur: form.cur === "TRY" ? null : kur,
      });
      goster("Maliyet kaydı eklendi.", "basari");
      setForm(null); onYenile();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  return (
    <>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {MALIYET_KAYNAK.filter(([k]) => toplamlar[k]).map(([k, ad]) => (
          <div key={k} style={{ background: "#fff", border: `1px solid ${T.renk.cizgi}`, borderRadius: 10,
            padding: "8px 14px", fontSize: 12.5 }}>
            <span style={{ color: T.renk.metinPasif }}>{ad}</span>{" "}
            <b>{fmtPara(toplamlar[k])}</b>
          </div>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 13 }}>Toplam <b style={{ fontSize: 15 }}>{fmtPara(genelToplam)}</b></div>
          {yetki && <Btn tur="birincil" boyut="sm" ikon="＋"
            onClick={() => setForm({ tarih: bugun(), kaynak: "diger", tutar: "", cur: "TRY", kur: "", aciklama: "" })}>
            Maliyet Ekle</Btn>}
        </div>
      </div>

      <Tablo veri={maliyet} bosMesaj="Bu projeye henüz maliyet düşmedi"
        sutunlar={[
          { anahtar: "tarih", baslik: "Tarih", genislik: 104, render: r => fmtTarih(r.tarih) },
          { anahtar: "kaynak", baslik: "Kalem", genislik: 150,
            render: r => MALIYET_KAYNAK.find(([k]) => k === r.kaynak)?.[1] || r.kaynak },
          { anahtar: "aciklama", baslik: "Açıklama", render: r => r.aciklama || "—" },
          { anahtar: "kaynak_tablo", baslik: "Kaynak", genislik: 130,
            render: r => <span style={{ fontSize: 11.5, color: T.renk.metinPasif }}>
              {({ stock_moves: "Depo çıkışı", timesheets: "Puantaj", purchase_orders: "Satın alma",
                  transactions: "Fatura", service_orders: "Servis", manuel: "Manuel giriş" })[r.kaynak_tablo] || r.kaynak_tablo || "—"}</span> },
          { anahtar: "tutar", baslik: "Tutar", hizala: "right", genislik: 130,
            render: r => fmtPara(r.tutar, r.cur) },
          { anahtar: "tutar_try", baslik: "TL Karşılığı", hizala: "right", genislik: 130,
            render: r => <b>{fmtPara(r.tutar_try)}</b> },
        ]} />

      <Modal acik={!!form} onKapat={() => setForm(null)} genislik={560} baslik="Maliyet Kaydı Ekle"
        aciklama="Depo çıkışı, puantaj ve satın alma maliyetleri otomatik düşer; buradan yalnızca elle kalem eklenir."
        altBar={<>
          <Btn onClick={() => setForm(null)}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={kaydet} disabled={kay}>{kay ? "Kaydediliyor…" : "Ekle"}</Btn>
        </>}>
        {form && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Satir>
              <Alan etiket="Tarih" genislik="150px">
                <Giris type="date" value={form.tarih} onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))} />
              </Alan>
              <Alan etiket="Maliyet Kalemi" genislik="200px">
                <Secim value={form.kaynak} bos={false} secenekler={MALIYET_KAYNAK}
                  onChange={e => setForm(f => ({ ...f, kaynak: e.target.value }))} />
              </Alan>
            </Satir>
            <Satir>
              <Alan etiket="Tutar" zorunlu genislik="160px">
                <Giris value={form.tutar} onChange={e => setForm(f => ({ ...f, tutar: e.target.value }))} placeholder="0,00" />
              </Alan>
              <Alan etiket="Para Birimi" genislik="130px">
                <Secim value={form.cur} bos={false} secenekler={[["TRY", "₺ TL"], ["EUR", "€ EUR"], ["USD", "$ USD"]]}
                  onChange={e => setForm(f => ({ ...f, cur: e.target.value }))} />
              </Alan>
              {form.cur !== "TRY" && (
                <Alan etiket="Kur" genislik="130px" ipucu="İşlem anındaki kur sabitlenir">
                  <Giris value={form.kur} onChange={e => setForm(f => ({ ...f, kur: e.target.value }))} placeholder="0,0000" />
                </Alan>
              )}
            </Satir>
            <Alan etiket="Açıklama">
              <Metin value={form.aciklama} satir={2} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} />
            </Alan>
          </div>
        )}
      </Modal>
    </>
  );
}

// ── BİLGİ & NOTLAR SEKMESİ ──────────────────────────────────────────────────
// Tek bir "açıklama" alanı ekip için yetersiz kalıyor: kimin ne zaman ne yazdığı
// görünsün diye projenin tarihli bir günlüğü var. Önemli işaretli notlar üstte.
function BilgiNotlar({ proje, notlar, profil, yetki, goster, onYenile }) {
  const [aciklama, setAciklama] = useState(proje.aciklama || "");
  const [duzenle, setDuzenle]   = useState(false);
  const [kay, setKay]           = useState(false);
  const [form, setForm]         = useState(null);
  const [silinecek, setSil]     = useState(null);
  const [fTip, setFTip]         = useState("");

  useEffect(() => { setAciklama(proje.aciklama || ""); }, [proje.aciklama]);

  async function aciklamaKaydet() {
    setKay(true);
    try {
      await api.update("projects", proje.id, { aciklama: aciklama.trim() || null });
      goster("Proje açıklaması kaydedildi.", "basari");
      setDuzenle(false); onYenile();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  async function notKaydet() {
    if (!form.icerik.trim()) return goster("Not içeriği boş olamaz.", "hata");
    setKay(true);
    try {
      const govde = {
        project_id: proje.id, tarih: form.tarih, tip: form.tip,
        baslik: form.baslik?.trim() || null, icerik: form.icerik.trim(),
        onemli: !!form.onemli,
      };
      // yazan_id yalnızca yeni kayıtta yazılır; düzenlemede korunur — yoksa
      // başkasının notunu düzenleyen kişi "yazar" görünüyordu.
      if (form.id) await api.update("project_notes", form.id, govde);
      else await api.insert("project_notes", { ...govde, yazan_id: profil?.id || null });
      goster(form.id ? "Not güncellendi." : "Not eklendi.", "basari");
      setForm(null); onYenile();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  async function notSil() {
    try { await api.remove("project_notes", silinecek.id); goster("Not silindi.", "basari"); setSil(null); onYenile(); }
    catch (e) { goster(e.message, "hata"); setSil(null); }
  }

  const gorunen = fTip ? notlar.filter(n => n.tip === fTip) : notlar;
  const sayilar = NOT_TIPI.map(([k, ad]) => [k, ad, notlar.filter(n => n.tip === k).length]);

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0,1fr)" }}>
      {/* PROJE AÇIKLAMASI */}
      <Kart>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <BolumAd>Proje Açıklaması</BolumAd>
          {yetki && !duzenle && <Btn boyut="sm" onClick={() => setDuzenle(true)} ikon="✎">Düzenle</Btn>}
        </div>
        {duzenle ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Metin value={aciklama} satir={7} onChange={e => setAciklama(e.target.value)}
              placeholder={"Kapsam, teknik çözüm, özel şartlar, müşteri beklentileri, dikkat edilecek noktalar…\n\nBu alan projeyi ilk kez açan bir ekip arkadaşının okuyacağı özet metindir."} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn boyut="sm" onClick={() => { setAciklama(proje.aciklama || ""); setDuzenle(false); }}>Vazgeç</Btn>
              <Btn boyut="sm" tur="birincil" onClick={aciklamaKaydet} disabled={kay}>
                {kay ? "Kaydediliyor…" : "Kaydet"}</Btn>
            </div>
          </div>
        ) : aciklama ? (
          <div style={{ fontSize: 13.5, lineHeight: 1.75, color: T.renk.metin, whiteSpace: "pre-wrap" }}>{aciklama}</div>
        ) : (
          <div style={{ fontSize: 13, color: T.renk.metinPasif, fontStyle: "italic" }}>
            Henüz açıklama yazılmadı. {yetki && "Sağ üstteki Düzenle ile ekleyebilirsiniz."}
          </div>
        )}
      </Kart>

      {/* PROJE GÜNLÜĞÜ */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 640 }}>Proje Günlüğü</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: T.renk.metinPasif }}>
              Kararlar, riskler, müşteri görüşmeleri ve saha notları — kim, ne zaman yazdı
            </p>
          </div>
          {yetki && <Btn tur="birincil" boyut="sm" ikon="＋"
            onClick={() => setForm({ tarih: bugun(), tip: "not", baslik: "", icerik: "", onemli: false })}>
            Not Ekle</Btn>}
        </div>

        {notlar.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <FiltreCip aktif={!fTip} onTikla={() => setFTip("")}>Tümü · {notlar.length}</FiltreCip>
            {sayilar.filter(([, , n]) => n > 0).map(([k, ad, n]) => (
              <FiltreCip key={k} aktif={fTip === k} onTikla={() => setFTip(fTip === k ? "" : k)}>{ad} · {n}</FiltreCip>
            ))}
          </div>
        )}

        {!gorunen.length ? (
          <Kart><Bos ikon="✎" baslik={fTip ? "Bu tipte not yok" : "Henüz not girilmedi"}
            aciklama={fTip ? undefined : "Projeyle ilgili her kararı, riski ve müşteri görüşmesini buraya yazın; ay sonra kimse hatırlamıyor."} /></Kart>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {gorunen.map(n => {
              const [, ad, renk, zemin] = NOT_TIPI.find(t => t[0] === n.tip) || ["", n.tip, T.renk.metinSoluk, "#f1f5f9"];
              return (
                <Kart key={n.id} pad={16} style={n.onemli ? { borderLeft: `3px solid ${T.renk.uyari}` } : undefined}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12,
                    alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                      <Rozet renk={renk} zemin={zemin}>{ad}</Rozet>
                      {n.onemli && <Rozet renk={T.renk.uyari} zemin={T.renk.uyariAcik}>★ Önemli</Rozet>}
                      {n.baslik && <span style={{ fontWeight: 640, fontSize: 14 }}>{n.baslik}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, color: T.renk.metinPasif }}>
                      <span>{fmtTarih(n.tarih)} · {n.yazan?.ad_soyad || "—"}</span>
                      {yetki && (
                        <>
                          <button onClick={() => setForm({ ...n, baslik: n.baslik || "" })}
                            style={{ border: "none", background: "none", cursor: "pointer",
                              color: T.renk.marka, fontSize: 12, fontWeight: 600 }}>Düzenle</button>
                          <button onClick={() => setSil(n)}
                            style={{ border: "none", background: "none", cursor: "pointer",
                              color: T.renk.hata, fontSize: 14 }}>×</button>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.7, whiteSpace: "pre-wrap", color: T.renk.metin }}>{n.icerik}</div>
                </Kart>
              );
            })}
          </div>
        )}
      </div>

      <Modal acik={!!form} onKapat={() => setForm(null)} genislik={620}
        baslik={form?.id ? "Notu Düzenle" : "Yeni Not"}
        altBar={<>
          <Btn onClick={() => setForm(null)}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={notKaydet} disabled={kay}>{kay ? "Kaydediliyor…" : "Kaydet"}</Btn>
        </>}>
        {form && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Satir>
              <Alan etiket="Tarih" genislik="150px">
                <Giris type="date" value={form.tarih} onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))} />
              </Alan>
              <Alan etiket="Not Tipi" genislik="200px">
                <Secim value={form.tip} bos={false} secenekler={NOT_TIPI.map(([k, a]) => [k, a])}
                  onChange={e => setForm(f => ({ ...f, tip: e.target.value }))} />
              </Alan>
              <Alan etiket="Başlık" genislik="240px">
                <Giris value={form.baslik} onChange={e => setForm(f => ({ ...f, baslik: e.target.value }))}
                  placeholder="Kısa özet (isteğe bağlı)" />
              </Alan>
            </Satir>
            <Alan etiket="İçerik" zorunlu>
              <Metin value={form.icerik} satir={6}
                onChange={e => setForm(f => ({ ...f, icerik: e.target.value }))}
                placeholder="Ne konuşuldu, ne karar verildi, ne yapılacak…" />
            </Alan>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={!!form.onemli}
                onChange={e => setForm(f => ({ ...f, onemli: e.target.checked }))} />
              Önemli olarak işaretle (listenin en üstünde kalır)
            </label>
          </div>
        )}
      </Modal>

      <OnayModal acik={!!silinecek} tehlike onHayir={() => setSil(null)} onEvet={notSil}
        baslik="Not silinsin mi?" mesaj="Bu günlük kaydı kalıcı olarak silinecek." />
    </div>
  );
}

function FiltreCip({ aktif, onTikla, children }) {
  return (
    <button onClick={onTikla} style={{
      padding: "5px 11px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 550,
      border: `1px solid ${aktif ? T.renk.marka : T.renk.cizgi}`,
      background: aktif ? T.renk.markaAcik : "#fff",
      color: aktif ? T.renk.marka : T.renk.metinSoluk,
    }}>{children}</button>
  );
}

// ── DOSYALAR SEKMESİ ────────────────────────────────────────────────────────
// Her tür dosya kabul edilir: pdf, zip, xlsx, docx, dwg, görsel, PLC/HMI yedeği.
// Birden fazla dosya aynı anda seçilebilir; sürükle-bırak da çalışır.
const MAKS_BOYUT = 50 * 1024 * 1024;   // Supabase Storage varsayılan sınırı

function Dosyalar({ projeId, dokuman, profil, yetki, silebilir, goster, onYenile }) {
  const [form, setForm]     = useState(null);
  const [kay, setKay]       = useState(false);
  const [ilerleme, setIler] = useState("");
  const [silinecek, setSil] = useState(null);
  const [ara, setAra]       = useState("");
  const [fTip, setFTip]     = useState("");
  const [suruklu, setSuruklu] = useState(false);

  const gorunen = useMemo(() => dokuman.filter(d => {
    if (fTip && d.tip !== fTip) return false;
    if (ara && !(eslesir(d.ad, ara) || eslesir(d.dosya_adi, ara) || eslesir(d.notlar, ara)
              || eslesir(d.versiyon, ara) || eslesir(DOKUMAN_TIPI_AD[d.tip], ara))) return false;
    return true;
  }), [dokuman, ara, fTip]);

  const toplamBoyut = dokuman.reduce((t, d) => t + Number(d.dosya_boyut || 0), 0);

  function dosyalariAl(listesi) {
    const dosyalar = [...listesi];
    if (!dosyalar.length) return;
    const buyuk = dosyalar.find(f => f.size > MAKS_BOYUT);
    if (buyuk) return goster(`"${buyuk.name}" 50 MB sınırını aşıyor. Sıkıştırıp tekrar deneyin.`, "hata");
    setForm({
      tip: tahminiTip(dosyalar[0].name), dosyalar,
      ad: dosyalar.length === 1 ? dosyalar[0].name.replace(/\.[^.]+$/, "") : "",
      revizyon: "Rev.0", versiyon: "", yukleme_tarihi: bugun(),
      sahada_yuklu: false, notlar: "",
    });
  }

  // Uzantıya bakıp makul bir tip önerir; kullanıcı yine değiştirebilir
  function tahminiTip(ad) {
    const u = uzanti(ad);
    if (["xlsx", "xls", "csv"].includes(u)) return "malzeme_listesi";
    if (["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(u)) return "fotograf";
    if (["dwg", "dxf", "step", "stp", "igs"].includes(u)) return "teknik_resim";
    if (["zap", "s7p", "ap15", "ap16", "mwp"].includes(u)) return "plc_program";
    if (["docx", "doc", "msg", "eml"].includes(u)) return "yazisma";
    return "diger";
  }

  async function kaydet() {
    const cok = form.dosyalar?.length > 1;
    if (!cok && !form.ad.trim() && !form.dosyalar?.length)
      return goster("Doküman adı zorunlu.", "hata");
    setKay(true);
    try {
      const dosyalar = form.dosyalar || [];
      if (!dosyalar.length) {
        // Dosyasız kayıt: yalnızca bilgi girişi (örn. müşteride duran belge)
        await api.insert("project_documents", govdeYap(form, null, null));
      } else {
        for (let i = 0; i < dosyalar.length; i++) {
          const d = dosyalar[i];
          setIler(`${i + 1}/${dosyalar.length} · ${d.name}`);
          const temiz = d.name.replace(/[^\w.-]/g, "_");
          const yol = `projeler/${projeId}/${Date.now()}_${i}_${temiz}`;
          const url = await uploadFile(yol, d);
          await api.insert("project_documents",
            govdeYap(form, d, url, cok ? d.name.replace(/\.[^.]+$/, "") : null));
        }
      }
      goster(dosyalar.length > 1 ? `${dosyalar.length} dosya yüklendi.` : "Dosya yüklendi.", "basari");
      setForm(null); setIler(""); onYenile();
    } catch (e) {
      goster(e.message.includes("yüklenemedi")
        ? "Dosya yüklenemedi. Supabase'de 'omx-files' kovası ve yükleme politikası kurulu mu? (db/kurulum.sql)"
        : e.message, "hata");
    } finally { setKay(false); setIler(""); }
  }

  function govdeYap(f, dosya, url, adGecersizKilma) {
    return {
      project_id: projeId, tip: f.tip,
      ad: (adGecersizKilma || f.ad || dosya?.name || "Adsız").trim(),
      revizyon: f.revizyon || "Rev.0", versiyon: f.versiyon || null,
      dosya_url: url, dosya_adi: dosya?.name || null,
      dosya_tipi: dosya?.type || null, dosya_boyut: dosya?.size || null,
      sahada_yuklu: !!f.sahada_yuklu, yukleme_tarihi: f.yukleme_tarihi || null,
      yukleyen_id: profil?.id || null, notlar: f.notlar || null,
    };
  }

  async function sil() {
    try {
      if (silinecek.dosya_url) await deleteFile(silinecek.dosya_url).catch(() => {});
      await api.remove("project_documents", silinecek.id);
      goster("Dosya silindi.", "basari"); setSil(null); onYenile();
    } catch (e) { goster(e.message, "hata"); setSil(null); }
  }

  const tipSayilari = DOKUMAN_TIPI
    .map(([k, ad]) => [k, ad, dokuman.filter(d => d.tip === k).length])
    .filter(([, , n]) => n > 0);

  return (
    <>
      {/* YÜKLEME ALANI */}
      {yetki && (
        <div
          onDragOver={e => { e.preventDefault(); setSuruklu(true); }}
          onDragLeave={() => setSuruklu(false)}
          onDrop={e => { e.preventDefault(); setSuruklu(false); dosyalariAl(e.dataTransfer.files); }}
          style={{
            border: `1.5px dashed ${suruklu ? T.renk.marka : T.renk.cizgiKoyu}`,
            background: suruklu ? T.renk.markaAcik : "#fff",
            borderRadius: 14, padding: "22px 20px", textAlign: "center", marginBottom: 16,
            transition: "background .12s, border-color .12s",
          }}>
          <div style={{ fontSize: 22, marginBottom: 6, opacity: .55 }}>⇪</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
            Dosyaları buraya sürükleyin
          </div>
          <div style={{ fontSize: 12.5, color: T.renk.metinPasif, marginBottom: 12 }}>
            PDF · Excel · Word · ZIP · DWG · görsel · PLC/HMI yedeği — dosya başına en fazla 50 MB
          </div>
          <label style={{ display: "inline-block" }}>
            <input type="file" multiple style={{ display: "none" }}
              onChange={e => { dosyalariAl(e.target.files); e.target.value = ""; }} />
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px",
              background: T.renk.marka, color: "#fff", borderRadius: T.r.md,
              fontSize: 13, fontWeight: 550, cursor: "pointer",
            }}>Dosya Seç</span>
          </label>
          <button onClick={() => setForm({ tip: "diger", dosyalar: [], ad: "", revizyon: "Rev.0",
            versiyon: "", yukleme_tarihi: bugun(), sahada_yuklu: false, notlar: "" })}
            style={{ marginLeft: 10, border: `1px solid ${T.renk.cizgiKoyu}`, background: "#fff",
              borderRadius: T.r.md, padding: "8px 15px", fontSize: 13, cursor: "pointer",
              color: T.renk.metinSoluk }}>
            Dosyasız kayıt
          </button>
        </div>
      )}

      {/* FİLTRELER */}
      {dokuman.length > 0 && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <Arama deger={ara} onDegisim={setAra} yer="Dosya adı, sürüm, not…" genislik={260} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <FiltreCip aktif={!fTip} onTikla={() => setFTip("")}>Tümü · {dokuman.length}</FiltreCip>
            {tipSayilari.map(([k, ad, n]) => (
              <FiltreCip key={k} aktif={fTip === k} onTikla={() => setFTip(fTip === k ? "" : k)}>{ad} · {n}</FiltreCip>
            ))}
          </div>
          <div style={{ marginLeft: "auto", fontSize: 12.5, color: T.renk.metinPasif }}>
            {gorunen.length} dosya · {fmtBoyut(toplamBoyut)}
          </div>
        </div>
      )}

      {/* LİSTE */}
      {!gorunen.length ? (
        <Kart><Bos ikon="🗀" baslik={dokuman.length ? "Filtreye uyan dosya yok" : "Henüz dosya yüklenmedi"}
          aciklama={dokuman.length ? undefined : "Sözleşme, teknik resim, malzeme listesi, PLC yedeği, saha fotoğrafı — hepsi buraya."} /></Kart>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 1, background: T.renk.cizgi,
          border: `1px solid ${T.renk.cizgi}`, borderRadius: T.r.lg, overflow: "hidden" }}>
          {gorunen.map(d => (
            <div key={d.id} style={{ background: "#fff", padding: "12px 15px", display: "flex",
              alignItems: "center", gap: 13, flexWrap: "wrap" }}>
              <DosyaRozet ad={d.dosya_adi || d.ad} />
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{d.ad}</span>
                  {d.revizyon && d.revizyon !== "Rev.0" &&
                    <Rozet renk={T.renk.marka} zemin={T.renk.markaAcik}>{d.revizyon}</Rozet>}
                  {d.versiyon && <span style={{ fontFamily: "monospace", fontSize: 11.5,
                    color: T.renk.metinSoluk, background: "#f1f5f9", padding: "1px 6px", borderRadius: 4 }}>{d.versiyon}</span>}
                  {d.sahada_yuklu && <Rozet renk={T.renk.basari} zemin={T.renk.basariAcik}>Sahada yüklü</Rozet>}
                </div>
                <div style={{ fontSize: 11.5, color: T.renk.metinPasif, marginTop: 2,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {DOKUMAN_TIPI_AD[d.tip] || d.tip}
                  {d.dosya_adi ? ` · ${d.dosya_adi}` : " · dosyasız kayıt"}
                  {d.dosya_boyut ? ` · ${fmtBoyut(d.dosya_boyut)}` : ""}
                </div>
                {d.notlar && <div style={{ fontSize: 12, color: T.renk.metinSoluk, marginTop: 4 }}>{d.notlar}</div>}
              </div>
              <div style={{ textAlign: "right", fontSize: 11.5, color: T.renk.metinPasif, flexShrink: 0 }}>
                <div>{fmtTarih(d.yukleme_tarihi || d.created_at)}</div>
                <div>{d.yukleyen?.ad_soyad || "—"}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {d.dosya_url ? (
                  <a href={d.dosya_url} target="_blank" rel="noreferrer" download={d.dosya_adi || undefined}
                    style={{ padding: "6px 12px", border: `1px solid ${T.renk.cizgiKoyu}`,
                      borderRadius: T.r.md, fontSize: 12, fontWeight: 550, color: T.renk.marka,
                      textDecoration: "none", whiteSpace: "nowrap" }}>İndir ↓</a>
                ) : (
                  <span style={{ fontSize: 12, color: T.renk.metinPasif, padding: "6px 4px" }}>—</span>
                )}
                {silebilir && (
                  <button onClick={() => setSil(d)} title="Sil"
                    style={{ border: `1px solid #fecaca`, background: "#fff", borderRadius: T.r.md,
                      padding: "6px 10px", cursor: "pointer", color: T.renk.hata, fontSize: 13 }}>×</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* YÜKLEME FORMU */}
      <Modal acik={!!form} onKapat={() => !kay && setForm(null)} genislik={640}
        baslik={form?.dosyalar?.length > 1 ? `${form.dosyalar.length} dosya yükleniyor`
                : form?.dosyalar?.length ? "Dosya bilgileri" : "Dosyasız kayıt"}
        aciklama={form?.dosyalar?.length > 1
          ? "Ortak bilgiler tüm dosyalara uygulanır; ad olarak her dosyanın kendi adı kullanılır."
          : undefined}
        altBar={<>
          <Btn onClick={() => setForm(null)} disabled={kay}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={kaydet} disabled={kay}>
            {kay ? (ilerleme || "Yükleniyor…") : "Kaydet"}</Btn>
        </>}>
        {form && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {form.dosyalar?.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 170,
                overflowY: "auto", background: "#f8fafc", padding: 11, borderRadius: 9 }}>
                {form.dosyalar.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                    <DosyaRozet ad={d.name} boyut={26} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                    <span style={{ color: T.renk.metinPasif, flexShrink: 0 }}>{fmtBoyut(d.size)}</span>
                  </div>
                ))}
              </div>
            )}
            <Satir>
              <Alan etiket="Doküman Tipi" genislik="240px">
                <Secim value={form.tip} bos={false} secenekler={DOKUMAN_TIPI}
                  onChange={e => setForm(f => ({ ...f, tip: e.target.value }))} />
              </Alan>
              {form.dosyalar?.length <= 1 && (
                <Alan etiket="Doküman Adı" genislik="300px" ipucu="Boş bırakılırsa dosya adı kullanılır">
                  <Giris value={form.ad} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))} />
                </Alan>
              )}
            </Satir>
            <Satir>
              <Alan etiket="Revizyon" genislik="130px">
                <Giris value={form.revizyon} onChange={e => setForm(f => ({ ...f, revizyon: e.target.value }))} placeholder="Rev.0" />
              </Alan>
              <Alan etiket="Yazılım Sürümü" genislik="160px" ipucu="PLC / HMI dosyaları için">
                <Giris value={form.versiyon} onChange={e => setForm(f => ({ ...f, versiyon: e.target.value }))} placeholder="v2.3.1" />
              </Alan>
              <Alan etiket="Tarih" genislik="150px">
                <Giris type="date" value={form.yukleme_tarihi}
                  onChange={e => setForm(f => ({ ...f, yukleme_tarihi: e.target.value }))} />
              </Alan>
              <Alan etiket="Sahada Yüklü mü?" genislik="170px">
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "9px 0" }}>
                  <input type="checkbox" checked={form.sahada_yuklu}
                    onChange={e => setForm(f => ({ ...f, sahada_yuklu: e.target.checked }))} />
                  Bu sürüm sahada aktif
                </label>
              </Alan>
            </Satir>
            <Alan etiket="Notlar">
              <Metin value={form.notlar} satir={2}
                onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))}
                placeholder="Neyi kapsıyor, neden yüklendi…" />
            </Alan>
          </div>
        )}
      </Modal>

      <OnayModal acik={!!silinecek} tehlike onHayir={() => setSil(null)} onEvet={sil}
        baslik="Dosya silinsin mi?"
        mesaj={`"${silinecek?.ad}" kaydı ve varsa yüklenen dosya kalıcı olarak silinecek.`} />
    </>
  );
}
