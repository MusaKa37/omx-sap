// ─────────────────────────────────────────────────────────────────────────────
// AYARLAR
// Kullanıcı ve rol yönetimi, modül bazlı yetki matrisi, döviz kurları,
// şifre değiştirme ve denetim kayıtları.
// Gerçek yetki sınırı veritabanındaki RLS politikalarıdır; buradaki matris
// o politikaların okuduğu tabloyu düzenler.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from "react";
import { api, changePassword, logAudit } from "../services/api";
import { T, CUR_SEMBOL } from "../ui/theme";
import { Kart, Baslik, Btn, Rozet, Tablo, Modal, Alan, Giris, Secim, Satir,
         Arama, Sekmeler, Bos, fmtPara, fmtTarih, fmtTarihSaat, parseSayi, bugun, eslesir } from "../ui/kit";

const MODULLER = [
  ["proje", "Proje"], ["cari", "Müşteri & Tedarikçi"], ["malzeme", "Malzeme"],
  ["bom", "Ürün Ağacı"], ["satinalma", "Satın Alma"], ["depo", "Depo & Stok"],
  ["puantaj", "Puantaj"], ["servis", "Servis & Ekipman"], ["kalite", "Kalite"],
  ["dokuman", "Doküman"], ["maliyet", "Proje Maliyet"], ["muhasebe", "Muhasebe"],
  ["satis", "Teklif & Satış"], ["sistem", "Sistem"],
];
const IZINLER = [["goruntule", "Görüntüle"], ["ekle", "Ekle"], ["duzenle", "Düzenle"],
                 ["sil", "Sil"], ["onayla", "Onayla"]];
const PARALAR = [["EUR", "€ EUR"], ["USD", "$ USD"], ["GBP", "£ GBP"]];

export default function Ayarlar({ profil, yetkiVar, goster }) {
  const [kullanicilar, setKul] = useState([]);
  const [roller, setRoller]    = useState([]);
  const [izinler, setIzinler]  = useState([]);
  const [kurlar, setKurlar]    = useState([]);
  const [loglar, setLoglar]    = useState([]);
  const [yuk, setYuk]          = useState(true);
  const [sekme, setSekme]      = useState("kullanicilar");
  const [ara, setAra]          = useState("");
  const [kulForm, setKulForm]  = useState(null);
  const [sifreForm, setSifre]  = useState(null);
  const [kurForm, setKurForm]  = useState(null);
  const [seciliRol, setRol]    = useState(null);
  const [kay, setKay]          = useState(false);
  const [logKul, setLogKul]    = useState("");

  const admin = profil?.rol_kod === "admin" || yetkiVar("sistem", "duzenle");

  const yukle = useCallback(async () => {
    setYuk(true);
    try {
      const [u, r, rp, k, l] = await Promise.all([
        api.list("app_users", { select: "*,rol:roles(kod,ad)", order: "ad_soyad.asc", limit: 500 }),
        api.list("roles", { order: "id.asc" }).catch(() => []),
        api.list("role_permissions", { limit: 2000 }).catch(() => []),
        api.list("exchange_rates", { order: "tarih.desc", limit: 200 }).catch(() => []),
        api.list("audit_logs", { order: "created_at.desc", limit: 300 }).catch(() => []),
      ]);
      setKul(u); setRoller(r); setIzinler(rp); setKurlar(k); setLoglar(l);
      if (!seciliRol && r.length) setRol(r.find(x => x.kod === "muhendis")?.id || r[0].id);
    } catch (e) { goster("Ayarlar yüklenemedi: " + e.message, "hata"); }
    finally { setYuk(false); }
  }, [goster]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { yukle(); }, [yukle]);

  const rolMap = useMemo(() => Object.fromEntries(roller.map(r => [r.id, r])), [roller]);

  const gorunenKullanicilar = useMemo(() => kullanicilar.filter(u =>
    !ara || eslesir(u.ad_soyad, ara) || eslesir(u.email, ara) || eslesir(u.rol?.ad, ara)),
    [kullanicilar, ara]);

  // ── Kullanıcı ─────────────────────────────────────────────────────────────
  async function kullaniciKaydet() {
    const f = kulForm;
    setKay(true);
    try {
      await api.update("app_users", f.id, {
        ad_soyad: f.ad_soyad?.trim() || null,
        role_id: f.role_id ? Number(f.role_id) : null,
        departman: f.departman || null, telefon: f.telefon || null,
        saatlik_maliyet: parseSayi(f.saatlik_maliyet) || 0,
        aktif: !!f.aktif,
      });
      logAudit({ tablo: "app_users", kayit_id: f.id, islem: "update",
                 aciklama: `${f.ad_soyad} · rol ${rolMap[f.role_id]?.kod || "—"}` });
      goster("Kullanıcı güncellendi.", "basari");
      setKulForm(null); yukle();
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  // ── Yetki matrisi ─────────────────────────────────────────────────────────
  const rolIzni = useCallback((rolId, modul) =>
    izinler.find(i => String(i.role_id) === String(rolId) && i.modul === modul)
      || { role_id: rolId, modul, goruntule: false, ekle: false, duzenle: false, sil: false, onayla: false },
    [izinler]);

  async function izinDegistir(rolId, modul, alan, deger) {
    const mevcut = izinler.find(i => String(i.role_id) === String(rolId) && i.modul === modul);
    try {
      if (mevcut) {
        await api.update("role_permissions", mevcut.id, { [alan]: deger });
        setIzinler(l => l.map(i => i.id === mevcut.id ? { ...i, [alan]: deger } : i));
      } else {
        const yeni = await api.insert("role_permissions", {
          role_id: Number(rolId), modul,
          goruntule: false, ekle: false, duzenle: false, sil: false, onayla: false,
          [alan]: deger,
        });
        setIzinler(l => [...l, yeni]);
      }
    } catch (e) { goster(e.message, "hata"); yukle(); }
  }

  // ── Kur ───────────────────────────────────────────────────────────────────
  async function kurKaydet() {
    const f = kurForm;
    const satis = parseSayi(f.satis);
    if (!satis || satis <= 0) return goster("Satış kuru girilmeli.", "hata");
    setKay(true);
    try {
      await api.insert("exchange_rates", {
        tarih: f.tarih, cur: f.cur, satis,
        alis: parseSayi(f.alis) || null, kaynak: f.kaynak || "elle",
      });
      goster("Kur kaydedildi.", "basari");
      setKurForm(null); yukle();
    } catch (e) {
      goster(e.message.includes("zaten mevcut")
        ? "Bu tarih ve para birimi için kur zaten girilmiş."
        : e.message, "hata");
    } finally { setKay(false); }
  }

  async function sifreDegistir() {
    const f = sifreForm;
    if (!f.yeni || f.yeni.length < 8) return goster("Şifre en az 8 karakter olmalı.", "hata");
    if (f.yeni !== f.tekrar) return goster("Şifreler eşleşmiyor.", "hata");
    setKay(true);
    try {
      await changePassword(f.yeni);
      goster("Şifreniz değiştirildi.", "basari");
      setSifre(null);
    } catch (e) { goster(e.message, "hata"); } finally { setKay(false); }
  }

  const logKullanicilar = useMemo(() =>
    [...new Set(loglar.map(l => l.user_email).filter(Boolean))], [loglar]);

  return (
    <>
      <Baslik ust="Sistem" aciklama="Kullanıcılar, roller, yetkiler, kurlar ve denetim kayıtları"
        sag={<>
          <Btn onClick={() => setSifre({ yeni: "", tekrar: "" })}>Şifremi Değiştir</Btn>
          <Btn onClick={yukle} disabled={yuk}>{yuk ? "Yenileniyor…" : "Yenile"}</Btn>
        </>}>
        Ayarlar
      </Baslik>

      <Sekmeler aktif={sekme} onDegisim={setSekme} sekmeler={[
        { anahtar: "kullanicilar", baslik: "Kullanıcılar", sayi: kullanicilar.length },
        { anahtar: "yetkiler", baslik: "Yetki Matrisi" },
        { anahtar: "kurlar", baslik: "Döviz Kurları", sayi: kurlar.length },
        { anahtar: "loglar", baslik: "Denetim Kayıtları", sayi: loglar.length },
      ]} />

      {/* ── KULLANICILAR ── */}
      {sekme === "kullanicilar" && (
        <>
          <Kart pad={13} style={{ marginBottom: 14 }}>
            <Satir bosluk={10} style={{ alignItems: "center" }}>
              <Arama deger={ara} onDegisim={setAra} yer="Ad, e-posta, rol…" genislik={280} />
              <div style={{ marginLeft: "auto", fontSize: 12.5, color: T.renk.metinPasif }}>
                Yeni kullanıcı Supabase → Authentication → Users ekranından açılır;
                buraya otomatik düşer ve rolü buradan verilir.
              </div>
            </Satir>
          </Kart>

          <Tablo yukleniyor={yuk} veri={gorunenKullanicilar}
            onSatirTikla={admin ? u => setKulForm({ ...u, role_id: u.role_id || "",
              saatlik_maliyet: String(u.saatlik_maliyet ?? "") }) : undefined}
            bosMesaj="Kullanıcı yok"
            sutunlar={[
              { anahtar: "ad_soyad", baslik: "Kullanıcı",
                render: r => (
                  <div>
                    <div style={{ fontWeight: 550 }}>{r.ad_soyad || "—"}</div>
                    <div style={{ fontSize: 11.5, color: T.renk.metinPasif }}>{r.email}</div>
                  </div>
                )},
              { anahtar: "rol", baslik: "Rol", genislik: 180,
                render: r => r.rol?.ad
                  ? <Rozet renk={r.rol.kod === "admin" ? T.renk.mor : T.renk.marka}
                      zemin={r.rol.kod === "admin" ? T.renk.morAcik : T.renk.markaAcik}>{r.rol.ad}</Rozet>
                  : <Rozet renk={T.renk.hata} zemin={T.renk.hataAcik}>Rol atanmadı</Rozet> },
              { anahtar: "departman", baslik: "Departman", genislik: 150, render: r => r.departman || "—" },
              { anahtar: "telefon", baslik: "Telefon", genislik: 140, render: r => r.telefon || "—" },
              { anahtar: "saatlik_maliyet", baslik: "Saatlik Maliyet", hizala: "right", genislik: 150,
                render: r => Number(r.saatlik_maliyet)
                  ? fmtPara(r.saatlik_maliyet)
                  : <span style={{ color: T.renk.uyari, fontSize: 12 }}>tanımsız</span> },
              { anahtar: "aktif", baslik: "Durum", genislik: 100,
                render: r => r.aktif === false
                  ? <Rozet renk={T.renk.hata} zemin={T.renk.hataAcik}>Pasif</Rozet>
                  : <Rozet renk={T.renk.basari} zemin={T.renk.basariAcik}>Aktif</Rozet> },
            ]} />

          {kullanicilar.some(u => !u.role_id) && (
            <div style={{ marginTop: 12, fontSize: 12.5, color: T.renk.uyari,
              background: T.renk.uyariAcik, padding: "10px 14px", borderRadius: 9 }}>
              Rolü atanmamış kullanıcılar var. Rol verilmeden hiçbir modüle erişemezler.
            </div>
          )}
        </>
      )}

      {/* ── YETKİ MATRİSİ ── */}
      {sekme === "yetkiler" && (
        <>
          <Kart pad={13} style={{ marginBottom: 14 }}>
            <Satir bosluk={10} style={{ alignItems: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em",
                textTransform: "uppercase", color: T.renk.metinPasif }}>Rol</div>
              <div style={{ width: 240 }}>
                <Secim value={seciliRol || ""} bos={false}
                  secenekler={roller.map(r => [r.id, r.ad])}
                  onChange={e => setRol(e.target.value)} />
              </div>
              <div style={{ marginLeft: "auto", fontSize: 12.5, color: T.renk.metinPasif }}>
                {rolMap[seciliRol]?.kod === "admin"
                  ? "Yönetici rolü tüm yetkilere sahiptir, matris uygulanmaz."
                  : "Değişiklikler anında kaydedilir."}
              </div>
            </Satir>
          </Kart>

          {rolMap[seciliRol]?.kod === "admin" ? (
            <Kart><Bos ikon="👑" baslik="Sistem yöneticisi"
              aciklama="Bu rol tüm modüllerde tam yetkilidir; kısıtlanamaz." /></Kart>
          ) : (
            <div style={{ overflowX: "auto", border: `1px solid ${T.renk.cizgi}`,
              borderRadius: T.r.lg, background: "#fff" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0,
                fontSize: 13, minWidth: 700 }}>
                <thead>
                  <tr>
                    <th style={{ ...bh, textAlign: "left", minWidth: 200 }}>Modül</th>
                    {IZINLER.map(([k, ad]) => (
                      <th key={k} style={{ ...bh, width: 100, textAlign: "center" }}>{ad}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULLER.map(([modul, ad]) => {
                    const izin = rolIzni(seciliRol, modul);
                    return (
                      <tr key={modul}>
                        <td style={{ ...bd, fontWeight: 550 }}>{ad}</td>
                        {IZINLER.map(([alan]) => (
                          <td key={alan} style={{ ...bd, textAlign: "center" }}>
                            <input type="checkbox" checked={!!izin[alan]} disabled={!admin}
                              onChange={e => izinDegistir(seciliRol, modul, alan, e.target.checked)}
                              style={{ width: 16, height: 16, cursor: admin ? "pointer" : "not-allowed" }} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── KURLAR ── */}
      {sekme === "kurlar" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12.5, color: T.renk.metinPasif, maxWidth: 620 }}>
              Kurlar işlem anında kaydın içine sabitlenir; burada girilen değer yalnızca yeni
              işlemler için varsayılan ve raporlarda TL karşılığı hesabı içindir. Geçmiş kayıtlar
              kur değişiminden etkilenmez.
            </div>
            {admin && <Btn tur="birincil" boyut="sm" ikon="＋"
              onClick={() => setKurForm({ tarih: bugun(), cur: "EUR", satis: "", alis: "", kaynak: "TCMB" })}>
              Kur Gir</Btn>}
          </div>

          {!kurlar.length ? (
            <Kart><Bos ikon="₺" baslik="Henüz kur girilmedi"
              aciklama="Yabancı para birimli işlem girebilmek için güncel TCMB satış kurunu ekleyin." /></Kart>
          ) : (
            <Tablo yukleniyor={yuk} veri={kurlar} anahtarAl={r => `${r.tarih}|${r.cur}`}
              sutunlar={[
                { anahtar: "tarih", baslik: "Tarih", genislik: 130, render: r => fmtTarih(r.tarih) },
                { anahtar: "cur", baslik: "Para Birimi", genislik: 130,
                  render: r => <b>{CUR_SEMBOL[r.cur]} {r.cur}</b> },
                { anahtar: "alis", baslik: "Alış", hizala: "right", genislik: 130,
                  render: r => r.alis ? fmtPara(r.alis) : "—" },
                { anahtar: "satis", baslik: "Satış", hizala: "right", genislik: 130,
                  render: r => <b>{fmtPara(r.satis)}</b> },
                { anahtar: "kaynak", baslik: "Kaynak", genislik: 120, render: r => r.kaynak || "—" },
              ]} />
          )}
        </>
      )}

      {/* ── DENETİM KAYITLARI ── */}
      {sekme === "loglar" && (
        <>
          <Kart pad={13} style={{ marginBottom: 14 }}>
            <Satir bosluk={10} style={{ alignItems: "center" }}>
              <div style={{ width: 260 }}>
                <Secim value={logKul} onChange={e => setLogKul(e.target.value)}
                  secenekler={logKullanicilar.map(e => [e, e])} bos="Tüm kullanıcılar" />
              </div>
              <Arama deger={ara} onDegisim={setAra} yer="Tablo, işlem, açıklama…" genislik={260} />
              <div style={{ marginLeft: "auto", fontSize: 12.5, color: T.renk.metinPasif }}>
                Son 300 kayıt
              </div>
            </Satir>
          </Kart>

          <Tablo yukleniyor={yuk}
            veri={loglar.filter(l => {
              if (logKul && l.user_email !== logKul) return false;
              if (ara && !(eslesir(l.tablo, ara) || eslesir(l.islem, ara)
                        || eslesir(l.aciklama, ara) || eslesir(l.user_email, ara))) return false;
              return true;
            })}
            bosMesaj="Denetim kaydı yok"
            sutunlar={[
              { anahtar: "created_at", baslik: "Zaman", genislik: 140, render: r => fmtTarihSaat(r.created_at) },
              { anahtar: "user_email", baslik: "Kullanıcı", genislik: 210,
                render: r => <span style={{ fontSize: 12.5 }}>{r.user_email || "—"}</span> },
              { anahtar: "tablo", baslik: "Tablo", genislik: 160,
                render: r => <span style={{ fontFamily: "monospace", fontSize: 11.5 }}>{r.tablo}</span> },
              { anahtar: "islem", baslik: "İşlem", genislik: 100,
                render: r => {
                  const renk = r.islem === "delete" ? T.renk.hata
                    : r.islem === "insert" ? T.renk.basari : T.renk.marka;
                  const zemin = r.islem === "delete" ? T.renk.hataAcik
                    : r.islem === "insert" ? T.renk.basariAcik : T.renk.markaAcik;
                  const ad = { insert: "Ekleme", update: "Güncelleme", delete: "Silme" }[r.islem] || r.islem;
                  return <Rozet renk={renk} zemin={zemin}>{ad}</Rozet>;
                }},
              { anahtar: "kayit_id", baslik: "Kayıt", genislik: 80,
                render: r => <span style={{ fontFamily: "monospace", fontSize: 11.5,
                  color: T.renk.metinPasif }}>{r.kayit_id || "—"}</span> },
              { anahtar: "aciklama", baslik: "Açıklama", render: r => r.aciklama || "—" },
            ]} />
        </>
      )}

      {/* ── KULLANICI FORMU ── */}
      <Modal acik={!!kulForm} onKapat={() => setKulForm(null)} genislik={640}
        baslik="Kullanıcıyı Düzenle" aciklama={kulForm?.email}
        altBar={<>
          <Btn onClick={() => setKulForm(null)}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={kullaniciKaydet} disabled={kay}>{kay ? "Kaydediliyor…" : "Kaydet"}</Btn>
        </>}>
        {kulForm && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Satir>
              <Alan etiket="Ad Soyad" genislik="260px">
                <Giris value={kulForm.ad_soyad || ""}
                  onChange={e => setKulForm(f => ({ ...f, ad_soyad: e.target.value }))} />
              </Alan>
              <Alan etiket="Rol" zorunlu genislik="220px">
                <Secim value={kulForm.role_id} bos="Rol seçin"
                  secenekler={roller.map(r => [r.id, r.ad])}
                  onChange={e => setKulForm(f => ({ ...f, role_id: e.target.value }))} />
              </Alan>
            </Satir>
            <Satir>
              <Alan etiket="Departman" genislik="200px">
                <Giris value={kulForm.departman || ""}
                  onChange={e => setKulForm(f => ({ ...f, departman: e.target.value }))} />
              </Alan>
              <Alan etiket="Telefon" genislik="180px">
                <Giris value={kulForm.telefon || ""}
                  onChange={e => setKulForm(f => ({ ...f, telefon: e.target.value }))} />
              </Alan>
              <Alan etiket="Saatlik Maliyet" genislik="180px"
                ipucu="Puantaj bu değerle proje maliyetine yazılır">
                <Giris value={kulForm.saatlik_maliyet}
                  onChange={e => setKulForm(f => ({ ...f, saatlik_maliyet: e.target.value }))}
                  placeholder="0,00" />
              </Alan>
            </Satir>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={kulForm.aktif !== false}
                onChange={e => setKulForm(f => ({ ...f, aktif: e.target.checked }))} />
              Kullanıcı aktif (pasif kullanıcı hiçbir veriye erişemez)
            </label>
            <div style={{ fontSize: 12.5, color: T.renk.metinPasif, background: "#f8fafc",
              padding: "11px 14px", borderRadius: 9 }}>
              Şifre sıfırlama Supabase → Authentication ekranından yapılır. Kullanıcı kendi
              şifresini bu ekranın sağ üstündeki “Şifremi Değiştir” ile değiştirebilir.
            </div>
          </div>
        )}
      </Modal>

      {/* ── KUR FORMU ── */}
      <Modal acik={!!kurForm} onKapat={() => setKurForm(null)} genislik={520} baslik="Döviz Kuru Gir"
        altBar={<>
          <Btn onClick={() => setKurForm(null)}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={kurKaydet} disabled={kay}>{kay ? "Kaydediliyor…" : "Kaydet"}</Btn>
        </>}>
        {kurForm && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Satir>
              <Alan etiket="Tarih" genislik="160px">
                <Giris type="date" value={kurForm.tarih}
                  onChange={e => setKurForm(f => ({ ...f, tarih: e.target.value }))} />
              </Alan>
              <Alan etiket="Para Birimi" genislik="150px">
                <Secim value={kurForm.cur} bos={false} secenekler={PARALAR}
                  onChange={e => setKurForm(f => ({ ...f, cur: e.target.value }))} />
              </Alan>
            </Satir>
            <Satir>
              <Alan etiket="Alış" genislik="160px">
                <Giris value={kurForm.alis} onChange={e => setKurForm(f => ({ ...f, alis: e.target.value }))}
                  placeholder="0,0000" />
              </Alan>
              <Alan etiket="Satış" zorunlu genislik="160px" ipucu="Hesaplarda bu kullanılır">
                <Giris value={kurForm.satis} onChange={e => setKurForm(f => ({ ...f, satis: e.target.value }))}
                  placeholder="0,0000" />
              </Alan>
              <Alan etiket="Kaynak" genislik="150px">
                <Giris value={kurForm.kaynak} onChange={e => setKurForm(f => ({ ...f, kaynak: e.target.value }))} />
              </Alan>
            </Satir>
          </div>
        )}
      </Modal>

      {/* ── ŞİFRE ── */}
      <Modal acik={!!sifreForm} onKapat={() => setSifre(null)} genislik={480} baslik="Şifremi Değiştir"
        aciklama="En az 8 karakter. Değişiklik anında geçerli olur."
        altBar={<>
          <Btn onClick={() => setSifre(null)}>Vazgeç</Btn>
          <Btn tur="birincil" onClick={sifreDegistir} disabled={kay}>{kay ? "Değiştiriliyor…" : "Değiştir"}</Btn>
        </>}>
        {sifreForm && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Alan etiket="Yeni Şifre" zorunlu>
              <Giris type="password" value={sifreForm.yeni} autoComplete="new-password"
                onChange={e => setSifre(f => ({ ...f, yeni: e.target.value }))} />
            </Alan>
            <Alan etiket="Yeni Şifre (tekrar)" zorunlu
              hata={sifreForm.tekrar && sifreForm.yeni !== sifreForm.tekrar ? "Şifreler eşleşmiyor" : undefined}>
              <Giris type="password" value={sifreForm.tekrar} autoComplete="new-password"
                onChange={e => setSifre(f => ({ ...f, tekrar: e.target.value }))} />
            </Alan>
          </div>
        )}
      </Modal>
    </>
  );
}

const bh = {
  padding: "10px 14px", background: "#f8fafc", borderBottom: `1px solid ${T.renk.cizgi}`,
  fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase",
  color: T.renk.metinSoluk,
};
const bd = { padding: "9px 14px", borderBottom: `1px solid ${T.renk.cizgi}` };
