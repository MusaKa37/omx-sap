// ─────────────────────────────────────────────────────────────────────────────
// MÜŞTERİ & TEDARİKÇİ — tek cari kartı, tip alanıyla ayrılır.
// Bir firma hem müşteri hem tedarikçi olabilir ("her_ikisi").
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from "react";
import { api, nextDocNo, logAudit } from "../services/api";
import { T } from "../ui/theme";
import { Kart, Baslik, Btn, Rozet, Tablo, Modal, Alan, Giris, Metin, Secim, Satir,
         Arama, Sekmeler, Olcum, OnayModal,
         fmtPara, fmtTarih, parseSayi, sayiMetni, eslesir } from "../ui/kit";

const TIPLER = [["musteri", "Müşteri"], ["tedarikci", "Tedarikçi"],
                ["taseron", "Taşeron"], ["her_ikisi", "Müşteri + Tedarikçi"]];
const TIP_ETIKET = Object.fromEntries(TIPLER);
const CURLAR = [["TRY", "₺ TL"], ["EUR", "€ EUR"], ["USD", "$ USD"], ["GBP", "£ GBP"]];

const BOS = {
  kod: "", unvan: "", kisa_ad: "", tip: "musteri", vergi_dairesi: "", vergi_no: "",
  adres: "", il: "", ulke: "Türkiye", telefon: "", email: "", web: "",
  ilgili_kisi: "", varsayilan_cur: "TRY", vade_gun: 0, risk_limiti: "", notlar: "", aktif: true,
};

export default function Cariler({ yetkiVar, goster }) {
  const [liste, setListe] = useState([]);
  const [bakiye, setBakiye] = useState({});
  const [yuk, setYuk] = useState(true);
  const [ara, setAra] = useState("");
  const [sekme, setSekme] = useState("hepsi");
  const [form, setForm] = useState(null);
  const [kay, setKay] = useState(false);
  const [silinecek, setSil] = useState(null);
  const [detay, setDetay] = useState(null);

  const ekleyebilir = yetkiVar("cari", "ekle");
  const duzenleyebilir = yetkiVar("cari", "duzenle");
  const silebilir = yetkiVar("cari", "sil");

  const yukle = useCallback(async () => {
    setYuk(true);
    try {
      const [c, b] = await Promise.all([
        api.list("companies", { order: "unvan.asc", limit: 2000 }),
        yetkiVar("muhasebe") ? api.list("v_company_balance", { limit: 5000 }).catch(() => []) : [],
      ]);
      setListe(c);
      const h = {};
      b.forEach(r => {
        if (!r.cur) return;
        (h[r.id] ||= {})[r.cur] = { alacak: Number(r.alacak || 0), borc: Number(r.borc || 0), net: Number(r.net || 0) };
      });
      setBakiye(h);
    } catch (e) { goster("Cari listesi yüklenemedi: " + e.message, "hata"); }
    finally { setYuk(false); }
  }, [goster, yetkiVar]);

  useEffect(() => { yukle(); }, [yukle]);

  const filtreli = useMemo(() => liste.filter(c => {
    if (sekme === "musteri" && !["musteri", "her_ikisi"].includes(c.tip)) return false;
    if (sekme === "tedarikci" && !["tedarikci", "her_ikisi", "taseron"].includes(c.tip)) return false;
    if (sekme === "pasif" && c.aktif) return false;
    if (sekme !== "pasif" && !c.aktif) return false;
    if (ara && !(eslesir(c.unvan, ara) || eslesir(c.kod, ara) || eslesir(c.vergi_no, ara)
              || eslesir(c.ilgili_kisi, ara) || eslesir(c.il, ara))) return false;
    return true;
  }), [liste, ara, sekme]);

  async function yeniAc() {
    let kod = "";
    try { kod = await nextDocNo("CAR"); } catch { /* sayaç yoksa elle girilir */ }
    setForm({ ...BOS, kod });
  }

  async function kaydet() {
    if (!form.unvan.trim()) return goster("Firma unvanı zorunlu.", "hata");
    setKay(true);
    try {
      const govde = {
        kod: form.kod?.trim() || null, unvan: form.unvan.trim(), kisa_ad: form.kisa_ad || null,
        tip: form.tip, vergi_dairesi: form.vergi_dairesi || null, vergi_no: form.vergi_no || null,
        adres: form.adres || null, il: form.il || null, ulke: form.ulke || null,
        telefon: form.telefon || null, email: form.email || null, web: form.web || null,
        ilgili_kisi: form.ilgili_kisi || null, varsayilan_cur: form.varsayilan_cur,
        vade_gun: Number(form.vade_gun) || 0, risk_limiti: parseSayi(form.risk_limiti) || null,
        notlar: form.notlar || null, aktif: !!form.aktif,
      };
      if (form.id) {
        await api.update("companies", form.id, govde);
        logAudit({ tablo: "companies", kayit_id: form.id, islem: "update", yeni: govde });
      } else {
        const y = await api.insert("companies", govde);
        logAudit({ tablo: "companies", kayit_id: y?.id, islem: "insert", yeni: govde });
      }
      goster("Cari kaydedildi.", "basari");
      setForm(null); yukle();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  async function sil() {
    try {
      await api.remove("companies", silinecek.id);
      logAudit({ tablo: "companies", kayit_id: silinecek.id, islem: "delete", eski: silinecek });
      goster("Cari silindi.", "basari"); setSil(null); yukle();
    } catch (e) { goster(e.message, "hata"); setSil(null); }
  }

  const sayilar = {
    hepsi: liste.filter(c => c.aktif).length,
    musteri: liste.filter(c => c.aktif && ["musteri", "her_ikisi"].includes(c.tip)).length,
    tedarikci: liste.filter(c => c.aktif && ["tedarikci", "her_ikisi", "taseron"].includes(c.tip)).length,
    pasif: liste.filter(c => !c.aktif).length,
  };

  const bakiyeGoster = id => {
    const b = bakiye[id];
    if (!b) return <span style={{ color: T.renk.metinPasif }}>—</span>;
    const satirlar = Object.entries(b).filter(([, v]) => v.alacak || v.borc);
    if (!satirlar.length) return <span style={{ color: T.renk.metinPasif }}>—</span>;
    return (
      <div style={{ lineHeight: 1.45 }}>
        {satirlar.map(([cur, v]) => (
          <div key={cur} style={{ fontSize: 12, whiteSpace: "nowrap",
            color: v.net >= 0 ? T.renk.basari : T.renk.hata, fontWeight: 600 }}>
            {fmtPara(v.net, cur)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <Baslik ust="Ana Veri" aciklama="Müşteri, tedarikçi ve taşeron kartları"
        sag={ekleyebilir && <Btn tur="birincil" onClick={yeniAc} ikon="＋">Yeni Cari</Btn>}>
        Müşteri & Tedarikçi
      </Baslik>

      <div style={{ display: "grid", gap: 12, marginBottom: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <Olcum etiket="Toplam Aktif Cari" deger={sayilar.hepsi} ikon="◉" />
        <Olcum etiket="Müşteri" deger={sayilar.musteri} ikon="◈" renk={T.renk.basari} zemin={T.renk.basariAcik} />
        <Olcum etiket="Tedarikçi / Taşeron" deger={sayilar.tedarikci} ikon="⇩" renk={T.renk.uyari} zemin={T.renk.uyariAcik} />
        <Olcum etiket="Pasif" deger={sayilar.pasif} ikon="◌" renk={T.renk.metinPasif} zemin="#f1f5f9" />
      </div>

      <Sekmeler aktif={sekme} onDegisim={setSekme} sekmeler={[
        { anahtar: "hepsi", baslik: "Tümü", sayi: sayilar.hepsi },
        { anahtar: "musteri", baslik: "Müşteriler", sayi: sayilar.musteri },
        { anahtar: "tedarikci", baslik: "Tedarikçi & Taşeron", sayi: sayilar.tedarikci },
        { anahtar: "pasif", baslik: "Pasif", sayi: sayilar.pasif },
      ]} />

      <Kart pad={13} style={{ marginBottom: 14 }}>
        <Satir style={{ alignItems: "center" }}>
          <Arama deger={ara} onDegisim={setAra} yer="Unvan, kod, vergi no, ilgili kişi, il…" genislik={340} />
          <div style={{ marginLeft: "auto", fontSize: 12.5, color: T.renk.metinPasif }}>{filtreli.length} kayıt</div>
        </Satir>
      </Kart>

      <Tablo yukleniyor={yuk} veri={filtreli} onSatirTikla={c => setDetay(c)}
        bosMesaj={ara ? "Aramaya uyan cari yok" : "Henüz cari kaydı yok"}
        sutunlar={[
          { anahtar: "kod", baslik: "Kod", genislik: 110,
            render: r => <span style={{ fontFamily: "monospace", fontSize: 12, color: T.renk.marka }}>{r.kod || "—"}</span> },
          { anahtar: "unvan", baslik: "Unvan",
            render: r => (
              <div>
                <div style={{ fontWeight: 550 }}>{r.unvan}</div>
                <div style={{ fontSize: 11.5, color: T.renk.metinPasif }}>
                  {[r.ilgili_kisi, r.il].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
            )},
          { anahtar: "tip", baslik: "Tip", genislik: 160,
            render: r => <span style={{ fontSize: 12.5 }}>{TIP_ETIKET[r.tip] || r.tip}</span> },
          { anahtar: "vergi_no", baslik: "Vergi No", genislik: 130, render: r => r.vergi_no || "—" },
          { anahtar: "telefon", baslik: "Telefon", genislik: 140, render: r => r.telefon || "—" },
          { anahtar: "vade_gun", baslik: "Vade", genislik: 80, hizala: "right",
            render: r => r.vade_gun ? `${r.vade_gun} gün` : "—" },
          { anahtar: "bakiye", baslik: "Net Bakiye", genislik: 130, hizala: "right",
            render: r => bakiyeGoster(r.id) },
        ]} />

      {/* DETAY / DÜZENLEME */}
      <Modal acik={!!detay} onKapat={() => setDetay(null)} genislik={640}
        baslik={detay?.unvan} aciklama={detay?.kod}
        altBar={<>
          {silebilir && <Btn tur="tehlike" onClick={() => { setSil(detay); setDetay(null); }}>Sil</Btn>}
          <Btn onClick={() => setDetay(null)}>Kapat</Btn>
          {duzenleyebilir && <Btn tur="birincil"
            onClick={() => { setForm({ ...BOS, ...detay, risk_limiti: sayiMetni(detay.risk_limiti) }); setDetay(null); }}>
            Düzenle</Btn>}
        </>}>
        {detay && (
          <div>
            <Satir style={{ marginBottom: 16 }}>
              <Rozet renk={T.renk.marka} zemin={T.renk.markaAcik}>{TIP_ETIKET[detay.tip]}</Rozet>
              {!detay.aktif && <Rozet renk={T.renk.hata} zemin={T.renk.hataAcik}>Pasif</Rozet>}
            </Satir>
            {[
              ["Vergi Dairesi / No", [detay.vergi_dairesi, detay.vergi_no].filter(Boolean).join(" · ")],
              ["İlgili Kişi", detay.ilgili_kisi], ["Telefon", detay.telefon], ["E-posta", detay.email],
              ["Web", detay.web], ["Adres", detay.adres], ["İl / Ülke", [detay.il, detay.ulke].filter(Boolean).join(" / ")],
              ["Varsayılan Para Birimi", detay.varsayilan_cur],
              ["Vade", detay.vade_gun ? `${detay.vade_gun} gün` : "—"],
              ["Risk Limiti", detay.risk_limiti ? fmtPara(detay.risk_limiti, detay.varsayilan_cur) : "—"],
              ["Kayıt Tarihi", fmtTarih(detay.created_at)],
            ].map(([ad, d]) => (
              <div key={ad} style={{ display: "flex", justifyContent: "space-between", gap: 16,
                padding: "8px 0", borderBottom: `1px solid ${T.renk.cizgi}`, fontSize: 13 }}>
                <span style={{ color: T.renk.metinPasif, flexShrink: 0 }}>{ad}</span>
                <span style={{ fontWeight: 550, textAlign: "right" }}>{d || "—"}</span>
              </div>
            ))}
            {bakiye[detay.id] && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase",
                  color: T.renk.metinPasif, marginBottom: 8 }}>Cari Bakiye</div>
                {Object.entries(bakiye[detay.id]).map(([cur, v]) => (
                  <div key={cur} style={{ display: "flex", justifyContent: "space-between",
                    padding: "8px 12px", background: "#f8fafc", borderRadius: 8, marginBottom: 5, fontSize: 13 }}>
                    <span>{cur}</span>
                    <span>
                      <span style={{ color: T.renk.basari }}>Alacak {fmtPara(v.alacak, cur)}</span>
                      {"  ·  "}
                      <span style={{ color: T.renk.hata }}>Borç {fmtPara(v.borc, cur)}</span>
                      {"  ·  "}
                      <b style={{ color: v.net >= 0 ? T.renk.basari : T.renk.hata }}>Net {fmtPara(v.net, cur)}</b>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {detay.notlar && (
              <div style={{ marginTop: 14, fontSize: 13, color: T.renk.metinSoluk,
                background: "#f8fafc", padding: 12, borderRadius: 8, whiteSpace: "pre-wrap" }}>{detay.notlar}</div>
            )}
          </div>
        )}
      </Modal>

      {/* FORM */}
      <Modal acik={!!form} onKapat={() => setForm(null)} genislik={780}
        baslik={form?.id ? "Cariyi Düzenle" : "Yeni Cari"}
        altBar={<>
          <Btn onClick={() => setForm(null)}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={kaydet} disabled={kay}>{kay ? "Kaydediliyor…" : "Kaydet"}</Btn>
        </>}>
        {form && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Satir>
              <Alan etiket="Cari Kodu" genislik="150px">
                <Giris value={form.kod} onChange={e => setForm(f => ({ ...f, kod: e.target.value }))} />
              </Alan>
              <Alan etiket="Firma Unvanı" zorunlu genislik="360px">
                <Giris value={form.unvan} onChange={e => setForm(f => ({ ...f, unvan: e.target.value }))}
                  placeholder="Örn. ABC Makine San. ve Tic. A.Ş." />
              </Alan>
              <Alan etiket="Kısa Ad" genislik="160px">
                <Giris value={form.kisa_ad || ""} onChange={e => setForm(f => ({ ...f, kisa_ad: e.target.value }))} />
              </Alan>
            </Satir>
            <Satir>
              <Alan etiket="Cari Tipi" genislik="200px">
                <Secim value={form.tip} bos={false} secenekler={TIPLER}
                  onChange={e => setForm(f => ({ ...f, tip: e.target.value }))} />
              </Alan>
              <Alan etiket="Vergi Dairesi" genislik="180px">
                <Giris value={form.vergi_dairesi || ""} onChange={e => setForm(f => ({ ...f, vergi_dairesi: e.target.value }))} />
              </Alan>
              <Alan etiket="Vergi / TC No" genislik="180px">
                <Giris value={form.vergi_no || ""} onChange={e => setForm(f => ({ ...f, vergi_no: e.target.value }))} />
              </Alan>
            </Satir>
            <Satir>
              <Alan etiket="İlgili Kişi" genislik="200px">
                <Giris value={form.ilgili_kisi || ""} onChange={e => setForm(f => ({ ...f, ilgili_kisi: e.target.value }))} />
              </Alan>
              <Alan etiket="Telefon" genislik="170px">
                <Giris value={form.telefon || ""} onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))} />
              </Alan>
              <Alan etiket="E-posta" genislik="220px">
                <Giris type="email" value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </Alan>
              <Alan etiket="Web" genislik="180px">
                <Giris value={form.web || ""} onChange={e => setForm(f => ({ ...f, web: e.target.value }))} />
              </Alan>
            </Satir>
            <Alan etiket="Adres">
              <Metin value={form.adres || ""} satir={2} onChange={e => setForm(f => ({ ...f, adres: e.target.value }))} />
            </Alan>
            <Satir>
              <Alan etiket="İl" genislik="150px">
                <Giris value={form.il || ""} onChange={e => setForm(f => ({ ...f, il: e.target.value }))} />
              </Alan>
              <Alan etiket="Ülke" genislik="150px">
                <Giris value={form.ulke || ""} onChange={e => setForm(f => ({ ...f, ulke: e.target.value }))} />
              </Alan>
              <Alan etiket="Para Birimi" genislik="130px">
                <Secim value={form.varsayilan_cur} bos={false} secenekler={CURLAR}
                  onChange={e => setForm(f => ({ ...f, varsayilan_cur: e.target.value }))} />
              </Alan>
              <Alan etiket="Vade (gün)" genislik="120px">
                <Giris type="number" value={form.vade_gun} onChange={e => setForm(f => ({ ...f, vade_gun: e.target.value }))} />
              </Alan>
              <Alan etiket="Risk Limiti" genislik="150px">
                <Giris value={form.risk_limiti} onChange={e => setForm(f => ({ ...f, risk_limiti: e.target.value }))} placeholder="0,00" />
              </Alan>
            </Satir>
            <Alan etiket="Notlar">
              <Metin value={form.notlar || ""} satir={2} onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))} />
            </Alan>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={!!form.aktif}
                onChange={e => setForm(f => ({ ...f, aktif: e.target.checked }))} />
              Cari aktif
            </label>
          </div>
        )}
      </Modal>

      <OnayModal acik={!!silinecek} tehlike onHayir={() => setSil(null)} onEvet={sil}
        baslik="Cari silinsin mi?"
        mesaj={`"${silinecek?.unvan}" silinecek. Bu cariye bağlı proje veya fatura varsa silme işlemi engellenir; bunun yerine kartı pasife alabilirsiniz.`} />
    </>
  );
}
