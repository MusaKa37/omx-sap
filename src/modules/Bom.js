// ─────────────────────────────────────────────────────────────────────────────
// ÜRÜN AĞACI (BOM)
// Çok seviyeli, revizyonlu. Ağaç patlatıldığında üst seviye miktarları alt
// seviyelerle çarpılır; ihtiyaç listesi buradan çıkar ve satın alma talebine
// dönüşür.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from "react";
import { api, nextDocNo, logAudit } from "../services/api";
import { T, DURUM_ETIKET } from "../ui/theme";
import { Kart, Baslik, Btn, Rozet, Tablo, Modal, Alan, Giris, Metin, Secim, Satir,
         Arama, Olcum, Bos, OnayModal, SecimAra,
         fmtSayi, fmtTarih, parseSayi, sayiMetni, bugun, eslesir } from "../ui/kit";

const BOM_DURUM = [["taslak", "Taslak"], ["onayli", "Onaylı"], ["pasif", "Pasif"]];

export default function Bom({ profil, yetkiVar, goster }) {
  const [bomlar, setBomlar]     = useState([]);
  const [satirlar, setSatirlar] = useState([]);
  const [malzemeler, setMlz]    = useState([]);
  const [projeler, setProjeler] = useState([]);
  const [bakiye, setBakiye]     = useState([]);
  const [yuk, setYuk]           = useState(true);
  const [ara, setAra]           = useState("");
  const [fDurum, setFDurum]     = useState("");
  const [secili, setSecili]     = useState(null);
  const [bomForm, setBomForm]   = useState(null);
  const [satirForm, setSatirForm] = useState(null);
  const [kay, setKay]           = useState(false);
  const [silinecek, setSil]     = useState(null);
  const [talepOnay, setTalepOnay] = useState(null);

  const ekleyebilir    = yetkiVar("bom", "ekle");
  const duzenleyebilir = yetkiVar("bom", "duzenle");
  const silebilir      = yetkiVar("bom", "sil");

  const yukle = useCallback(async () => {
    setYuk(true);
    try {
      const [b, l, m, p, s] = await Promise.all([
        api.list("boms", { select: "*,urun:materials(malzeme_kodu,malzeme_adi),proje:projects(proje_kodu,proje_adi)",
                           order: "id.desc", limit: 500 }),
        api.list("bom_lines", { order: "seviye.asc,sira.asc,id.asc", limit: 10000 }),
        api.list("materials", { select: "id,malzeme_kodu,malzeme_adi,birim", eq: { aktif: true },
                                order: "malzeme_kodu.asc", limit: 5000 }),
        api.list("projects", { select: "id,proje_kodu,proje_adi,durum", order: "proje_kodu.desc", limit: 500 }),
        api.list("stock_balances", { select: "material_id,miktar", limit: 20000 }).catch(() => []),
      ]);
      setBomlar(b); setSatirlar(l); setMlz(m); setProjeler(p); setBakiye(s);
    } catch (e) { goster("Ürün ağacı yüklenemedi: " + e.message, "hata"); }
    finally { setYuk(false); }
  }, [goster]);

  useEffect(() => { yukle(); }, [yukle]);

  const mlzMap = useMemo(() => Object.fromEntries(malzemeler.map(m => [m.id, m])), [malzemeler]);
  const stokMap = useMemo(() => {
    const h = {};
    bakiye.forEach(b => { h[b.material_id] = (h[b.material_id] || 0) + Number(b.miktar || 0); });
    return h;
  }, [bakiye]);

  const malzemeSecenek = useMemo(() => malzemeler.map(m => ({
    deger: m.id, etiket: `${m.malzeme_kodu} · ${m.malzeme_adi}`, alt: m.birim })), [malzemeler]);
  const projeSecenek = useMemo(() => projeler.filter(p => p.durum !== "iptal")
    .map(p => ({ deger: p.id, etiket: `${p.proje_kodu} · ${p.proje_adi}` })), [projeler]);

  const gorunen = useMemo(() => bomlar.filter(b => {
    if (fDurum && b.durum !== fDurum) return false;
    if (ara && !(eslesir(b.ad, ara) || eslesir(b.kod, ara) || eslesir(b.revizyon, ara)
              || eslesir(b.urun?.malzeme_adi, ara) || eslesir(b.proje?.proje_kodu, ara))) return false;
    return true;
  }), [bomlar, ara, fDurum]);

  const satirSayisi = useCallback(id => satirlar.filter(l => l.bom_id === id).length, [satirlar]);

  // ── Ağaç kurma ────────────────────────────────────────────────────────────
  const agac = useMemo(() => {
    if (!secili) return [];
    const kendi = satirlar.filter(l => l.bom_id === secili.id);
    // Ziyaret kümesi: parent_line_id verisinde döngü varsa (SQL/içe aktarma ile
    // oluşabilir) sonsuz özyineleme sayfayı çökertiyordu.
    const cocuk = (ust, gorulen) => kendi
      .filter(l => (l.parent_line_id || null) === (ust || null) && !gorulen.has(l.id))
      .map(l => ({ ...l, cocuklar: cocuk(l.id, new Set([...gorulen, l.id])) }));
    return cocuk(null, new Set());
  }, [satirlar, secili]);

  // Ağacı patlatıp yaprak malzeme ihtiyacını toplar (üst miktar × alt miktar)
  const ihtiyac = useMemo(() => {
    const toplam = {};
    const gez = (dugumler, carpan) => dugumler.forEach(d => {
      const m = (Number(d.miktar) || 0) * carpan * (1 + (Number(d.fire_yuzde) || 0) / 100);
      if (d.cocuklar.length) gez(d.cocuklar, m);
      else if (d.material_id) toplam[d.material_id] = (toplam[d.material_id] || 0) + m;
    });
    gez(agac, 1);
    return Object.entries(toplam).map(([id, miktar]) => {
      const stok = stokMap[id] || 0;
      return { material_id: Number(id), miktar, stok, eksik: Math.max(0, miktar - stok) };
    }).sort((a, b) => (mlzMap[a.material_id]?.malzeme_kodu || "").localeCompare(mlzMap[b.material_id]?.malzeme_kodu || "", "tr"));
  }, [agac, stokMap, mlzMap]);

  // ── BOM kaydet ────────────────────────────────────────────────────────────
  async function bomKaydet() {
    const f = bomForm;
    if (!f.ad.trim()) return goster("Ürün ağacı adı zorunlu.", "hata");
    setKay(true);
    try {
      const govde = {
        kod: f.kod?.trim() || null, ad: f.ad.trim(),
        material_id: f.material_id ? Number(f.material_id) : null,
        project_id: f.project_id ? Number(f.project_id) : null,
        revizyon: f.revizyon || "Rev.A", durum: f.durum,
        gecerli_baslangic: f.gecerli_baslangic || null,
        aciklama: f.aciklama || null,
      };
      if (f.id) {
        await api.update("boms", f.id, govde);
        goster("Ürün ağacı güncellendi.", "basari");
        setSecili(s => s && s.id === f.id ? { ...s, ...govde } : s);
      } else {
        const yeni = await api.insert("boms", { ...govde, created_by: profil?.id || null });
        logAudit({ tablo: "boms", kayit_id: yeni?.id, islem: "insert", aciklama: govde.ad });
        goster("Ürün ağacı oluşturuldu.", "basari");
      }
      setBomForm(null); yukle();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  async function satirKaydet() {
    const f = satirForm;
    if (!f.material_id && !f.serbest_aciklama?.trim())
      return goster("Malzeme seçin veya serbest açıklama yazın.", "hata");
    if (!(parseSayi(f.miktar) > 0)) return goster("Miktar sıfırdan büyük olmalı.", "hata");
    setKay(true);
    try {
      const govde = {
        bom_id: secili.id, parent_line_id: f.parent_line_id || null,
        seviye: f.seviye || 1, sira: Number(f.sira) || 0,
        material_id: f.material_id ? Number(f.material_id) : null,
        serbest_aciklama: f.serbest_aciklama || null,
        miktar: parseSayi(f.miktar),
        birim: f.material_id ? (mlzMap[f.material_id]?.birim || "Adet") : (f.birim || "Adet"),
        fire_yuzde: parseSayi(f.fire_yuzde) || 0,
        alternatif_material_id: f.alternatif_material_id ? Number(f.alternatif_material_id) : null,
        etiket: f.etiket || null, notlar: f.notlar || null,
      };
      if (f.id) await api.update("bom_lines", f.id, govde);
      else await api.insert("bom_lines", govde);
      goster("Kalem kaydedildi.", "basari");
      setSatirForm(null); yukle();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  async function sil() {
    try {
      await api.remove(silinecek.tablo, silinecek.id);
      goster("Silindi.", "basari");
      if (silinecek.tablo === "boms") setSecili(null);
      setSil(null); yukle();
    } catch (e) { goster(e.message, "hata"); setSil(null); }
  }

  // Yeni revizyon: BOM ve tüm kalemler kopyalanır, ağaç yapısı korunur
  async function revizyonAl(b) {
    setKay(true);
    try {
      // Revizyon harfi: A→B→…→Z→AA→AB… (eski kod Z'den sonra "[" üretiyordu)
      const eskiEk = String(b.revizyon || "Rev.A").match(/Rev\.([A-Z]+)/i)?.[1]?.toUpperCase() || "A";
      const artir = h => {
        const d = h.split("");
        let i = d.length - 1;
        while (i >= 0) {
          if (d[i] !== "Z") { d[i] = String.fromCharCode(d[i].charCodeAt(0) + 1); return d.join(""); }
          d[i] = "A"; i -= 1;
        }
        return "A" + d.join("");
      };
      const yeniHarf = artir(eskiEk);
      const yeniBom = await api.insert("boms", {
        kod: b.kod, ad: b.ad, material_id: b.material_id, project_id: b.project_id,
        revizyon: `Rev.${yeniHarf}`, durum: "taslak",
        gecerli_baslangic: bugun(), aciklama: b.aciklama,
        created_by: profil?.id || null,
      });

      const eski = satirlar.filter(l => l.bom_id === b.id);
      const idHarita = {};
      // Üst kalem her zaman çocuğundan ÖNCE kopyalanmalı. Yalnız seviye sırası,
      // bozuk veride (üst ile çocuk aynı seviyedeyse) bağı sessizce koparıyordu;
      // topolojik sıra kullanılır: ebeveyni kopyalanmamış satır sona bırakılır.
      const sirali = [];
      {
        const kalan = [...eski].sort((x, y) => (x.seviye || 1) - (y.seviye || 1));
        const eklendi = new Set();
        let onceki = -1;
        while (kalan.length && kalan.length !== onceki) {
          onceki = kalan.length;
          for (let i = 0; i < kalan.length; ) {
            const l = kalan[i];
            if (!l.parent_line_id || eklendi.has(l.parent_line_id)) {
              sirali.push(l); eklendi.add(l.id); kalan.splice(i, 1);
            } else i += 1;
          }
        }
        if (kalan.length) throw new Error("Ürün ağacında döngüsel/eksik üst kalem bağı var; revizyon alınamadı.");
      }
      for (const l of sirali) {
        const yeni = await api.insert("bom_lines", {
          bom_id: yeniBom.id,
          parent_line_id: l.parent_line_id ? (idHarita[l.parent_line_id] || null) : null,
          seviye: l.seviye, sira: l.sira, material_id: l.material_id,
          serbest_aciklama: l.serbest_aciklama, miktar: l.miktar, birim: l.birim,
          fire_yuzde: l.fire_yuzde, alternatif_material_id: l.alternatif_material_id,
          etiket: l.etiket, notlar: l.notlar,
        });
        idHarita[l.id] = yeni.id;
      }
      logAudit({ tablo: "boms", kayit_id: yeniBom.id, islem: "insert",
                 aciklama: `${b.revizyon} → Rev.${yeniHarf} revizyonu` });
      goster(`Rev.${yeniHarf} oluşturuldu (${eski.length} kalem kopyalandı).`, "basari");
      await yukle();
      setSecili(yeniBom);
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  // ── BOM → satın alma talebi ───────────────────────────────────────────────
  async function talepOlustur() {
    const eksikler = ihtiyac.filter(i => i.eksik > 0);
    if (!eksikler.length) return goster("Eksik malzeme yok, talep oluşturulmadı.", "hata");
    setKay(true);
    try {
      let no = "";
      try { no = await nextDocNo("TLP"); } catch { no = `TLP-${Date.now()}`; }
      const talep = await api.insert("purchase_requests", {
        talep_no: no, project_id: secili.project_id || null, bom_id: secili.id,
        talep_eden_id: profil?.id || null, tarih: bugun(), durum: "taslak",
        aciklama: `${secili.ad} (${secili.revizyon}) ürün ağacından üretildi`,
      });
      await api.insertMany("purchase_request_lines", eksikler.map(i => ({
        request_id: talep.id, material_id: i.material_id,
        miktar: Math.ceil(i.eksik * 100) / 100,
        birim: mlzMap[i.material_id]?.birim || "Adet",
        stok_miktar: i.stok, eksik_miktar: i.eksik, durum: "taslak",
      })));
      logAudit({ tablo: "purchase_requests", kayit_id: talep.id, islem: "insert",
                 aciklama: `BOM ${secili.ad} → ${no}` });
      goster(`${no} talebi ${eksikler.length} kalemle oluşturuldu. Satın Alma modülünden onaya gönderin.`, "basari");
      setTalepOnay(null);
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  // ── DETAY EKRANI ──────────────────────────────────────────────────────────
  if (secili) {
    const b = bomlar.find(x => x.id === secili.id) || secili;
    const eksikSayi = ihtiyac.filter(i => i.eksik > 0).length;
    return (
      <>
        <div style={{ marginBottom: 18 }}>
          <button onClick={() => setSecili(null)} style={{ border: "none", background: "none",
            cursor: "pointer", color: T.renk.metinSoluk, fontSize: 12.5, padding: 0, marginBottom: 8 }}>
            ← Ürün Ağaçları
          </button>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
                <h1 style={{ margin: 0, fontSize: 23, fontWeight: 650, letterSpacing: "-.02em" }}>{b.ad}</h1>
                <Rozet renk={T.renk.marka} zemin={T.renk.markaAcik}>{b.revizyon}</Rozet>
                <Rozet durum={b.durum}>{DURUM_ETIKET[b.durum] || b.durum}</Rozet>
              </div>
              <div style={{ fontSize: 13, color: T.renk.metinSoluk, marginTop: 6 }}>
                {b.kod ? `${b.kod} · ` : ""}
                {b.urun?.malzeme_adi || b.proje?.proje_adi || "bağımsız ürün ağacı"}
                {b.gecerli_baslangic ? ` · geçerlilik ${fmtTarih(b.gecerli_baslangic)}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {duzenleyebilir && <Btn onClick={() => setBomForm({ ...b,
                material_id: b.material_id || "", project_id: b.project_id || "" })} ikon="✎">Düzenle</Btn>}
              {duzenleyebilir && <Btn onClick={() => revizyonAl(b)} disabled={kay}>Yeni Revizyon</Btn>}
              {ekleyebilir && eksikSayi > 0 &&
                <Btn tur="birincil" onClick={() => setTalepOnay(true)}>Eksikler için Talep Aç ({eksikSayi})</Btn>}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12, marginBottom: 18,
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          <Olcum etiket="Toplam Kalem" deger={satirlar.filter(l => l.bom_id === b.id).length} ikon="⑂" />
          <Olcum etiket="Farklı Malzeme" deger={ihtiyac.length} ikon="◇" renk={T.renk.mor} zemin={T.renk.morAcik} />
          <Olcum etiket="Stokta Eksik" deger={eksikSayi} ikon="⚠"
            renk={eksikSayi ? T.renk.hata : T.renk.basari}
            zemin={eksikSayi ? T.renk.hataAcik : T.renk.basariAcik}
            alt={eksikSayi ? "satın alınmalı" : "tümü stokta"} />
          <Olcum etiket="Maksimum Seviye"
            deger={Math.max(1, ...satirlar.filter(l => l.bom_id === b.id).map(l => l.seviye || 1))} ikon="≡"
            renk={T.renk.bilgi} zemin={T.renk.bilgiAcik} />
        </div>

        {/* AĞAÇ */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 640 }}>Ürün Ağacı</h2>
          {duzenleyebilir && <Btn boyut="sm" tur="birincil" ikon="＋"
            onClick={() => setSatirForm({ parent_line_id: null, seviye: 1, sira: agac.length + 1,
              material_id: "", serbest_aciklama: "", miktar: "1", fire_yuzde: "",
              alternatif_material_id: "", etiket: "", notlar: "" })}>
            Ana Kalem Ekle</Btn>}
        </div>

        {!agac.length ? (
          <Kart><Bos ikon="⑂" baslik="Ürün ağacı boş"
            aciklama="Ana kalemleri ekleyin; her kalemin altına alt montaj ve bileşen ekleyebilirsiniz." /></Kart>
        ) : (
          <Kart pad={0}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 100px 90px 90px",
              gap: 8, padding: "10px 15px", background: "#f8fafc", fontSize: 10.5, fontWeight: 700,
              letterSpacing: ".06em", textTransform: "uppercase", color: T.renk.metinSoluk,
              borderBottom: `1px solid ${T.renk.cizgi}` }}>
              <span>Kalem</span><span style={{ textAlign: "right" }}>Miktar</span>
              <span style={{ textAlign: "right" }}>Toplam</span><span style={{ textAlign: "right" }}>Stok</span>
              <span>Etiket</span><span />
            </div>
            {agac.map((d, i) => (
              <AgacDugumu key={d.id} dugum={d} derinlik={0} carpan={1} son={i === agac.length - 1}
                mlzMap={mlzMap} stokMap={stokMap} duzenleyebilir={duzenleyebilir} silebilir={silebilir}
                onAltEkle={p => setSatirForm({ parent_line_id: p.id, seviye: (p.seviye || 1) + 1,
                  sira: (p.cocuklar?.length || 0) + 1, material_id: "", serbest_aciklama: "",
                  miktar: "1", fire_yuzde: "", alternatif_material_id: "", etiket: "", notlar: "" })}
                onDuzenle={l => setSatirForm({ ...l, material_id: l.material_id || "",
                  alternatif_material_id: l.alternatif_material_id || "",
                  miktar: sayiMetni(l.miktar), fire_yuzde: sayiMetni(l.fire_yuzde) })}
                onSil={l => setSil({ tablo: "bom_lines", id: l.id, ad: mlzMap[l.material_id]?.malzeme_adi || l.serbest_aciklama })} />
            ))}
          </Kart>
        )}

        {/* İHTİYAÇ LİSTESİ */}
        {ihtiyac.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 640 }}>Malzeme İhtiyacı</h2>
            <p style={{ margin: "0 0 10px", fontSize: 12.5, color: T.renk.metinPasif }}>
              Ağaç patlatılıp aynı malzemeler toplanmış, fire oranları eklenmiş hâli
            </p>
            <Tablo veri={ihtiyac} anahtarAl={r => r.material_id}
              sutunlar={[
                { anahtar: "kod", baslik: "Kod", genislik: 140,
                  render: r => <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: T.renk.marka }}>
                    {mlzMap[r.material_id]?.malzeme_kodu || "—"}</span> },
                { anahtar: "ad", baslik: "Malzeme",
                  render: r => mlzMap[r.material_id]?.malzeme_adi || "—" },
                { anahtar: "miktar", baslik: "İhtiyaç", hizala: "right", genislik: 110,
                  render: r => <b>{fmtSayi(r.miktar)} <span style={{ fontWeight: 400, fontSize: 11.5, color: T.renk.metinPasif }}>
                    {mlzMap[r.material_id]?.birim}</span></b> },
                { anahtar: "stok", baslik: "Stok", hizala: "right", genislik: 100, render: r => fmtSayi(r.stok) },
                { anahtar: "eksik", baslik: "Eksik", hizala: "right", genislik: 110,
                  render: r => r.eksik > 0
                    ? <b style={{ color: T.renk.hata }}>{fmtSayi(r.eksik)}</b>
                    : <span style={{ color: T.renk.basari }}>—</span> },
              ]} />
          </div>
        )}

        <SatirFormu form={satirForm} setForm={setSatirForm} kaydet={satirKaydet} kay={kay}
          malzemeSecenek={malzemeSecenek} />

        <OnayModal acik={!!talepOnay} onHayir={() => setTalepOnay(null)} onEvet={talepOlustur}
          baslik="Satın alma talebi oluşturulsun mu?"
          mesaj={`Stokta eksik ${eksikSayi} kalem için taslak bir talep açılacak. Talep, Satın Alma modülünde onaya gönderilmeyi bekler.`} />

        <BomFormu form={bomForm} setForm={setBomForm} kaydet={bomKaydet} kay={kay}
          malzemeSecenek={malzemeSecenek} projeSecenek={projeSecenek}
          onSil={silebilir ? () => { setSil({ tablo: "boms", id: bomForm.id, ad: bomForm.ad }); setBomForm(null); } : null} />

        <OnayModal acik={!!silinecek} tehlike onHayir={() => setSil(null)} onEvet={sil}
          baslik="Silinsin mi?" mesaj={`"${silinecek?.ad || "Kayıt"}" ve varsa alt kalemleri kalıcı olarak silinecek.`} />
      </>
    );
  }

  // ── LİSTE EKRANI ──────────────────────────────────────────────────────────
  return (
    <>
      <Baslik ust="Ana Veri" aciklama="Çok seviyeli, revizyonlu ürün ağaçları"
        sag={ekleyebilir && <Btn tur="birincil" ikon="＋"
          onClick={() => setBomForm({ kod: "", ad: "", material_id: "", project_id: "",
            revizyon: "Rev.A", durum: "taslak", gecerli_baslangic: bugun(), aciklama: "" })}>
          Yeni Ürün Ağacı</Btn>}>
        Ürün Ağacı (BOM)
      </Baslik>

      <div style={{ display: "grid", gap: 12, marginBottom: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <Olcum etiket="Ürün Ağacı" deger={bomlar.length} ikon="⑂" />
        <Olcum etiket="Onaylı" deger={bomlar.filter(b => b.durum === "onayli").length} ikon="✓"
          renk={T.renk.basari} zemin={T.renk.basariAcik} />
        <Olcum etiket="Taslak" deger={bomlar.filter(b => b.durum === "taslak").length} ikon="✎"
          renk={T.renk.uyari} zemin={T.renk.uyariAcik} />
        <Olcum etiket="Toplam Kalem" deger={satirlar.length} ikon="◇"
          renk={T.renk.mor} zemin={T.renk.morAcik} />
      </div>

      <Kart pad={13} style={{ marginBottom: 14 }}>
        <Satir bosluk={10} style={{ alignItems: "center" }}>
          <Arama deger={ara} onDegisim={setAra} yer="Ad, kod, revizyon, ürün, proje…" genislik={320} />
          <div style={{ width: 170 }}>
            <Secim value={fDurum} onChange={e => setFDurum(e.target.value)} secenekler={BOM_DURUM} bos="Tüm durumlar" />
          </div>
          <div style={{ marginLeft: "auto", fontSize: 12.5, color: T.renk.metinPasif }}>{gorunen.length} kayıt</div>
        </Satir>
      </Kart>

      <Tablo yukleniyor={yuk} veri={gorunen} onSatirTikla={b => setSecili(b)}
        bosMesaj={ara || fDurum ? "Filtreye uyan ürün ağacı yok" : "Henüz ürün ağacı oluşturulmadı"}
        sutunlar={[
          { anahtar: "kod", baslik: "Kod", genislik: 130,
            render: r => <span style={{ fontFamily: "monospace", fontSize: 12, color: T.renk.marka }}>{r.kod || "—"}</span> },
          { anahtar: "ad", baslik: "Ürün Ağacı",
            render: r => (
              <div>
                <div style={{ fontWeight: 550 }}>{r.ad}</div>
                <div style={{ fontSize: 11.5, color: T.renk.metinPasif }}>
                  {r.urun?.malzeme_adi || r.proje?.proje_adi || "bağımsız"}
                </div>
              </div>
            )},
          { anahtar: "revizyon", baslik: "Revizyon", genislik: 100,
            render: r => <Rozet renk={T.renk.marka} zemin={T.renk.markaAcik}>{r.revizyon}</Rozet> },
          { anahtar: "durum", baslik: "Durum", genislik: 110,
            render: r => <Rozet durum={r.durum}>{DURUM_ETIKET[r.durum] || r.durum}</Rozet> },
          { anahtar: "kalem", baslik: "Kalem", hizala: "right", genislik: 90, render: r => satirSayisi(r.id) },
          { anahtar: "gecerli_baslangic", baslik: "Geçerlilik", genislik: 110, render: r => fmtTarih(r.gecerli_baslangic) },
        ]} />

      <BomFormu form={bomForm} setForm={setBomForm} kaydet={bomKaydet} kay={kay}
        malzemeSecenek={malzemeSecenek} projeSecenek={projeSecenek} onSil={null} />
    </>
  );
}

// ── Ağaç düğümü (özyinelemeli) ──────────────────────────────────────────────
function AgacDugumu({ dugum, derinlik, carpan, mlzMap, stokMap, duzenleyebilir, silebilir,
                      onAltEkle, onDuzenle, onSil }) {
  const [acik, setAcik] = useState(true);
  const m = mlzMap[dugum.material_id];
  const miktar = Number(dugum.miktar) || 0;
  const fireli = miktar * (1 + (Number(dugum.fire_yuzde) || 0) / 100);
  const toplam = fireli * carpan;
  const stok = dugum.material_id ? (stokMap[dugum.material_id] || 0) : null;
  const yaprak = !dugum.cocuklar.length;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 100px 90px 90px", gap: 8,
        padding: "9px 15px", borderBottom: `1px solid ${T.renk.cizgi}`, alignItems: "center",
        background: derinlik === 0 ? "#fff" : derinlik === 1 ? "#fcfdfe" : "#fafbfc" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, paddingLeft: derinlik * 22, minWidth: 0 }}>
          {!yaprak ? (
            <button onClick={() => setAcik(a => !a)}
              style={{ border: "none", background: "none", cursor: "pointer", color: T.renk.metinSoluk,
                fontSize: 10, width: 14, flexShrink: 0 }}>{acik ? "▼" : "▶"}</button>
          ) : <span style={{ width: 14, flexShrink: 0, color: T.renk.cizgiKoyu, fontSize: 10 }}>·</span>}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: yaprak ? 500 : 650, fontSize: 13,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {m?.malzeme_adi || dugum.serbest_aciklama || "—"}
            </div>
            <div style={{ fontSize: 11, color: T.renk.metinPasif, fontFamily: "monospace" }}>
              {m?.malzeme_kodu || (dugum.material_id ? "" : "serbest kalem")}
              {dugum.fire_yuzde > 0 ? `  ·  fire %${dugum.fire_yuzde}` : ""}
              {dugum.alternatif_material_id ? `  ·  alt: ${mlzMap[dugum.alternatif_material_id]?.malzeme_kodu || "—"}` : ""}
            </div>
          </div>
        </div>
        <span style={{ textAlign: "right", fontSize: 12.5 }}>
          {fmtSayi(miktar)} <span style={{ color: T.renk.metinPasif, fontSize: 11 }}>{dugum.birim}</span>
        </span>
        <span style={{ textAlign: "right", fontSize: 12.5, fontWeight: 600 }}>
          {carpan !== 1 ? fmtSayi(toplam) : <span style={{ color: T.renk.metinPasif }}>—</span>}
        </span>
        <span style={{ textAlign: "right", fontSize: 12.5,
          color: stok == null ? T.renk.metinPasif : (stok < toplam ? T.renk.hata : T.renk.basari) }}>
          {stok == null ? "—" : fmtSayi(stok)}
        </span>
        <span style={{ fontSize: 11.5, color: T.renk.metinSoluk, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dugum.etiket || ""}</span>
        <div style={{ display: "flex", gap: 3, justifyContent: "flex-end" }}>
          {duzenleyebilir && <>
            <button onClick={() => onAltEkle(dugum)} title="Alt kalem ekle"
              style={{ border: "none", background: "none", cursor: "pointer", color: T.renk.marka, fontSize: 14 }}>＋</button>
            <button onClick={() => onDuzenle(dugum)} title="Düzenle"
              style={{ border: "none", background: "none", cursor: "pointer", color: T.renk.metinSoluk, fontSize: 12 }}>✎</button>
          </>}
          {silebilir && <button onClick={() => onSil(dugum)} title="Sil"
            style={{ border: "none", background: "none", cursor: "pointer", color: T.renk.hata, fontSize: 14 }}>×</button>}
        </div>
      </div>
      {acik && dugum.cocuklar.map(c => (
        <AgacDugumu key={c.id} dugum={c} derinlik={derinlik + 1} carpan={toplam}
          mlzMap={mlzMap} stokMap={stokMap} duzenleyebilir={duzenleyebilir} silebilir={silebilir}
          onAltEkle={onAltEkle} onDuzenle={onDuzenle} onSil={onSil} />
      ))}
    </>
  );
}

// ── Formlar ─────────────────────────────────────────────────────────────────
function BomFormu({ form, setForm, kaydet, kay, malzemeSecenek, projeSecenek, onSil }) {
  return (
    <Modal acik={!!form} onKapat={() => setForm(null)} genislik={700}
      baslik={form?.id ? "Ürün Ağacını Düzenle" : "Yeni Ürün Ağacı"}
      altBar={<>
        {form?.id && onSil && <Btn tur="tehlike" onClick={onSil}>Sil</Btn>}
        <Btn onClick={() => setForm(null)}>Vazgeç</Btn>
        <Btn tur="birincil" onClick={kaydet} disabled={kay}>{kay ? "Kaydediliyor…" : "Kaydet"}</Btn>
      </>}>
      {form && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Satir>
            <Alan etiket="Kod" genislik="160px">
              <Giris value={form.kod || ""} onChange={e => setForm(f => ({ ...f, kod: e.target.value }))}
                placeholder="BOM-PANO-001" />
            </Alan>
            <Alan etiket="Ad" zorunlu genislik="320px">
              <Giris value={form.ad} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))}
                placeholder="Ana pano komple" />
            </Alan>
            <Alan etiket="Revizyon" genislik="120px">
              <Giris value={form.revizyon} onChange={e => setForm(f => ({ ...f, revizyon: e.target.value }))} />
            </Alan>
          </Satir>
          <Alan etiket="Ürün Kartı" ipucu="Standart bir ürünün ağacıysa seçin">
            <SecimAra deger={form.material_id} secenekler={malzemeSecenek}
              onSec={v => setForm(f => ({ ...f, material_id: v }))} bos="Ürün kartına bağlı değil" />
          </Alan>
          <Alan etiket="Proje" ipucu="Projeye özel ağaçsa seçin">
            <SecimAra deger={form.project_id} secenekler={projeSecenek}
              onSec={v => setForm(f => ({ ...f, project_id: v }))} bos="Projeye bağlı değil" />
          </Alan>
          <Satir>
            <Alan etiket="Durum" genislik="160px">
              <Secim value={form.durum} bos={false} secenekler={BOM_DURUM}
                onChange={e => setForm(f => ({ ...f, durum: e.target.value }))} />
            </Alan>
            <Alan etiket="Geçerlilik Başlangıcı" genislik="180px">
              <Giris type="date" value={form.gecerli_baslangic || ""}
                onChange={e => setForm(f => ({ ...f, gecerli_baslangic: e.target.value }))} />
            </Alan>
          </Satir>
          <Alan etiket="Açıklama">
            <Metin value={form.aciklama || ""} satir={2}
              onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} />
          </Alan>
        </div>
      )}
    </Modal>
  );
}

function SatirFormu({ form, setForm, kaydet, kay, malzemeSecenek }) {
  return (
    <Modal acik={!!form} onKapat={() => setForm(null)} genislik={640}
      baslik={form?.id ? "Kalemi Düzenle" : (form?.parent_line_id ? "Alt Kalem Ekle" : "Ana Kalem Ekle")}
      altBar={<>
        <Btn onClick={() => setForm(null)}>Vazgeç</Btn>
        <Btn tur="birincil" onClick={kaydet} disabled={kay}>{kay ? "Kaydediliyor…" : "Kaydet"}</Btn>
      </>}>
      {form && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Alan etiket="Malzeme">
            <SecimAra deger={form.material_id} secenekler={malzemeSecenek}
              onSec={v => setForm(f => ({ ...f, material_id: v }))}
              bos="Serbest kalem (alt montaj başlığı)" yer="Kod veya ad…" />
          </Alan>
          {!form.material_id && (
            <Alan etiket="Kalem Açıklaması" zorunlu ipucu="Örn. “Güç katı”, “Kontrol katı”">
              <Giris value={form.serbest_aciklama || ""}
                onChange={e => setForm(f => ({ ...f, serbest_aciklama: e.target.value }))} />
            </Alan>
          )}
          <Satir>
            <Alan etiket="Miktar" zorunlu genislik="130px">
              <Giris value={form.miktar} onChange={e => setForm(f => ({ ...f, miktar: e.target.value }))} />
            </Alan>
            {!form.material_id && (
              <Alan etiket="Birim" genislik="120px">
                <Giris value={form.birim || "Adet"} onChange={e => setForm(f => ({ ...f, birim: e.target.value }))} />
              </Alan>
            )}
            <Alan etiket="Fire (%)" genislik="120px" ipucu="Kabloda kesim payı gibi">
              <Giris value={form.fire_yuzde} onChange={e => setForm(f => ({ ...f, fire_yuzde: e.target.value }))}
                placeholder="0" />
            </Alan>
            <Alan etiket="Sıra" genislik="100px">
              <Giris type="number" value={form.sira}
                onChange={e => setForm(f => ({ ...f, sira: e.target.value }))} />
            </Alan>
            <Alan etiket="Etiket" genislik="150px" ipucu="Pano klemens / adres">
              <Giris value={form.etiket || ""} onChange={e => setForm(f => ({ ...f, etiket: e.target.value }))}
                placeholder="-X1:12" />
            </Alan>
          </Satir>
          <Alan etiket="Alternatif Malzeme" ipucu="Bulunamazsa yerine kullanılabilecek kart">
            <SecimAra deger={form.alternatif_material_id} secenekler={malzemeSecenek}
              onSec={v => setForm(f => ({ ...f, alternatif_material_id: v }))} bos="Alternatif yok" />
          </Alan>
          <Alan etiket="Notlar">
            <Metin value={form.notlar || ""} satir={2}
              onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))} />
          </Alan>
        </div>
      )}
    </Modal>
  );
}
