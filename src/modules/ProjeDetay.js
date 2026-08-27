// ─────────────────────────────────────────────────────────────────────────────
// PROJE DETAYI — bir projenin tüm operasyonu tek ekranda.
// Sekmeler: Özet · İş Kırılımı · Maliyet · Doküman
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from "react";
import { api, uploadFile } from "../services/api";
import { T, PROJE_TIPI_ETIKET, FAALIYET_ETIKET } from "../ui/theme";
import { Kart, Btn, Rozet, Tablo, Modal, Alan, Giris, Metin, Secim, Satir,
         Sekmeler, Olcum, Ilerleme, Bos, OnayModal,
         fmtPara, fmtTarih, fmtSayi, parseSayi, bugun } from "../ui/kit";

const MALIYET_KAYNAK = [
  ["malzeme", "Malzeme"], ["iscilik", "İşçilik"], ["taseron", "Taşeron"],
  ["seyahat", "Seyahat & Konaklama"], ["ekipman", "Ekipman"], ["nakliye", "Nakliye"],
  ["genel_gider", "Genel Gider"], ["diger", "Diğer"],
];
const DOKUMAN_TIPI = [
  ["sozlesme", "Sözleşme"], ["teknik_resim", "Teknik Resim"], ["eplan", "Elektrik Projesi (EPLAN)"],
  ["plc_program", "PLC Programı"], ["hmi_program", "HMI / SCADA Projesi"],
  ["test_raporu", "Test Raporu"], ["devreye_alma", "Devreye Alma Tutanağı"],
  ["kilavuz", "Kılavuz / Dokümantasyon"], ["fotograf", "Saha Fotoğrafı"], ["diger", "Diğer"],
];
const GOREV_DURUM = [["planlandi", "Planlandı"], ["devam", "Devam"], ["tamamlandi", "Tamamlandı"], ["beklemede", "Beklemede"]];

export default function ProjeDetay({ projeId, ozet, profil, yetkiVar, goster, kullanicilar, onGeri, onDuzenle }) {
  const [proje, setProje]   = useState(null);
  const [sekme, setSekme]   = useState("ozet");
  const [gorevler, setGorev] = useState([]);
  const [maliyet, setMaliyet] = useState([]);
  const [dokuman, setDokuman] = useState([]);
  const [yuk, setYuk]       = useState(true);
  const [ozetV, setOzetV]   = useState(ozet);

  const duzenleyebilir = yetkiVar("proje", "duzenle");

  const yukle = useCallback(async () => {
    setYuk(true);
    try {
      const [p, g, m, d, o] = await Promise.all([
        api.one("projects", projeId, "*,musteri:companies(id,unvan,telefon,ilgili_kisi),sorumlu:app_users(id,ad_soyad,email)"),
        api.list("project_tasks", { eq: { project_id: projeId }, order: "sira.asc,id.asc" }).catch(() => []),
        yetkiVar("maliyet") ? api.list("project_costs", { eq: { project_id: projeId }, order: "tarih.desc,id.desc", limit: 500 }).catch(() => []) : [],
        api.list("project_documents", { select: "*,yukleyen:app_users(ad_soyad)", eq: { project_id: projeId }, order: "created_at.desc" }).catch(() => []),
        api.list("v_project_summary", { eq: { id: projeId }, limit: 1 }).catch(() => []),
      ]);
      setProje(p); setGorev(g); setMaliyet(m); setDokuman(d);
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
            {proje.sorumlu?.ad_soyad ? ` · Sorumlu: ${proje.sorumlu.ad_soyad}` : ""}
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
        { anahtar: "gorev",   baslik: "İş Kırılımı", sayi: gorevler.length },
        { anahtar: "maliyet", baslik: "Maliyet", sayi: maliyet.length },
        { anahtar: "dokuman", baslik: "Doküman", sayi: dokuman.length },
      ]} />

      {sekme === "ozet"    && <Ozet proje={proje} ozetV={ozetV} gorevler={gorevler} butce={butce} />}
      {sekme === "gorev"   && <Gorevler projeId={projeId} gorevler={gorevler} kullanicilar={kullanicilar}
                                yetki={duzenleyebilir} goster={goster} onYenile={yukle} />}
      {sekme === "maliyet" && <Maliyetler projeId={projeId} maliyet={maliyet} butce={proje}
                                yetki={yetkiVar("maliyet", "ekle")} goster={goster} onYenile={yukle} />}
      {sekme === "dokuman" && <Dokumanlar projeId={projeId} dokuman={dokuman} profil={profil}
                                yetki={yetkiVar("dokuman", "ekle")} goster={goster} onYenile={yukle} />}
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
    setKay(true);
    try {
      await api.insert("project_costs", {
        project_id: projeId, tarih: form.tarih, kaynak: form.kaynak,
        kaynak_tablo: "manuel", aciklama: form.aciklama || null,
        tutar, cur: form.cur, tutar_try: form.cur === "TRY" ? tutar : (tutar * (parseSayi(form.kur) || 1)),
        kur: form.cur === "TRY" ? null : (parseSayi(form.kur) || null),
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

// ── DOKÜMAN SEKMESİ ─────────────────────────────────────────────────────────
function Dokumanlar({ projeId, dokuman, profil, yetki, goster, onYenile }) {
  const [form, setForm] = useState(null);
  const [kay, setKay] = useState(false);

  async function kaydet() {
    if (!form.ad.trim()) return goster("Doküman adı zorunlu.", "hata");
    setKay(true);
    try {
      let url = form.dosya_url || null, boyut = null;
      if (form.dosya) {
        const yol = `projeler/${projeId}/${Date.now()}_${form.dosya.name.replace(/[^\w.-]/g, "_")}`;
        url = await uploadFile(yol, form.dosya);
        boyut = form.dosya.size;
      }
      await api.insert("project_documents", {
        project_id: projeId, tip: form.tip, ad: form.ad.trim(),
        revizyon: form.revizyon || "Rev.0", versiyon: form.versiyon || null,
        dosya_url: url, dosya_boyut: boyut,
        sahada_yuklu: !!form.sahada_yuklu,
        yukleme_tarihi: form.yukleme_tarihi || null,
        yukleyen_id: profil?.id || null, notlar: form.notlar || null,
      });
      goster("Doküman eklendi.", "basari");
      setForm(null); onYenile();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12 }}>
        <div style={{ fontSize: 12.5, color: T.renk.metinPasif }}>
          Sahada aktif olan PLC / HMI sürümü <b>“sahada yüklü”</b> işaretiyle takip edilir.
        </div>
        {yetki && <Btn tur="birincil" boyut="sm" ikon="＋"
          onClick={() => setForm({ tip: "plc_program", ad: "", revizyon: "Rev.0", versiyon: "",
            yukleme_tarihi: bugun(), sahada_yuklu: false, notlar: "", dosya: null })}>
          Doküman Ekle</Btn>}
      </div>

      <Tablo veri={dokuman} bosMesaj="Bu projeye doküman eklenmedi"
        sutunlar={[
          { anahtar: "tip", baslik: "Tip", genislik: 180,
            render: r => DOKUMAN_TIPI.find(([k]) => k === r.tip)?.[1] || r.tip },
          { anahtar: "ad", baslik: "Doküman",
            render: r => (
              <div>
                <div style={{ fontWeight: 550 }}>{r.ad}</div>
                {r.notlar && <div style={{ fontSize: 11.5, color: T.renk.metinPasif }}>{r.notlar}</div>}
              </div>
            )},
          { anahtar: "revizyon", baslik: "Revizyon", genislik: 92 },
          { anahtar: "versiyon", baslik: "Sürüm", genislik: 100, render: r => r.versiyon || "—" },
          { anahtar: "sahada_yuklu", baslik: "Sahada", genislik: 100,
            render: r => r.sahada_yuklu
              ? <Rozet renk={T.renk.basari} zemin={T.renk.basariAcik}>Yüklü</Rozet>
              : <span style={{ color: T.renk.metinPasif, fontSize: 12 }}>—</span> },
          { anahtar: "yukleme_tarihi", baslik: "Tarih", genislik: 104, render: r => fmtTarih(r.yukleme_tarihi || r.created_at) },
          { anahtar: "dosya_url", baslik: "Dosya", genislik: 80, hizala: "center",
            render: r => r.dosya_url
              ? <a href={r.dosya_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                  style={{ color: T.renk.marka, fontWeight: 600, fontSize: 12 }}>Aç ↗</a>
              : "—" },
        ]} />

      <Modal acik={!!form} onKapat={() => setForm(null)} genislik={620} baslik="Doküman Ekle"
        altBar={<>
          <Btn onClick={() => setForm(null)}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={kaydet} disabled={kay}>{kay ? "Yükleniyor…" : "Kaydet"}</Btn>
        </>}>
        {form && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Satir>
              <Alan etiket="Doküman Tipi" genislik="230px">
                <Secim value={form.tip} bos={false} secenekler={DOKUMAN_TIPI}
                  onChange={e => setForm(f => ({ ...f, tip: e.target.value }))} />
              </Alan>
              <Alan etiket="Doküman Adı" zorunlu genislik="280px">
                <Giris value={form.ad} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))}
                  placeholder="Örn. Ana hat PLC programı" />
              </Alan>
            </Satir>
            <Satir>
              <Alan etiket="Revizyon" genislik="130px">
                <Giris value={form.revizyon} onChange={e => setForm(f => ({ ...f, revizyon: e.target.value }))} placeholder="Rev.0" />
              </Alan>
              <Alan etiket="Yazılım Sürümü" genislik="150px" ipucu="PLC / HMI için">
                <Giris value={form.versiyon} onChange={e => setForm(f => ({ ...f, versiyon: e.target.value }))} placeholder="v2.3.1" />
              </Alan>
              <Alan etiket="Yükleme Tarihi" genislik="150px">
                <Giris type="date" value={form.yukleme_tarihi}
                  onChange={e => setForm(f => ({ ...f, yukleme_tarihi: e.target.value }))} />
              </Alan>
              <Alan etiket="Sahada Yüklü mü?" genislik="150px">
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "9px 0" }}>
                  <input type="checkbox" checked={form.sahada_yuklu}
                    onChange={e => setForm(f => ({ ...f, sahada_yuklu: e.target.checked }))} />
                  Bu sürüm sahada aktif
                </label>
              </Alan>
            </Satir>
            <Alan etiket="Dosya" ipucu="PDF, ZIP, DWG, proje yedeği…">
              <Giris type="file" onChange={e => setForm(f => ({ ...f, dosya: e.target.files?.[0] || null }))} />
            </Alan>
            <Alan etiket="Notlar">
              <Metin value={form.notlar} satir={2} onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))} />
            </Alan>
          </div>
        )}
      </Modal>
    </>
  );
}
