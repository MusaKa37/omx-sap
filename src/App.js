import { useState, useEffect, useCallback } from "react";
import { api, getSession, setSession, sessionValid, refreshSession, signIn, signOut } from "./services/api";
import { SB_URL } from "./services/config";
import { Kabuk, Logo } from "./ui/Kabuk";
import { T } from "./ui/theme";
import { Btn, Giris, Alan, Kart, useBildirim } from "./ui/kit";

import Panel     from "./modules/Panel";
import Projeler  from "./modules/Projeler";
import Cariler   from "./modules/Cariler";
import Malzeme   from "./modules/Malzeme";
import Yapim     from "./modules/Yapim";

const MODULLER = {
  dashboard: Panel,
  projeler:  Projeler,
  cariler:   Cariler,
  malzeme:   Malzeme,
};

export default function App() {
  const [oturum, setOturum]   = useState(null);
  const [profil, setProfil]   = useState(null);   // app_users kaydı + rol
  const [yetkiler, setYetki]  = useState({});     // { modul: {goruntule, ekle, ...} }
  const [sayfa, setSayfa]     = useState("dashboard");
  const [hazir, setHazir]     = useState(false);
  const [giris, setGiris]     = useState({ email: "", sifre: "", hata: "", bekle: false });
  const { goster, Bildirimler } = useBildirim();

  // ── Oturum geri yükleme ───────────────────────────────────────────────────
  useEffect(() => {
    const s = getSession();
    if (!s) { setHazir(true); return; }
    if (sessionValid(s)) { setOturum(s); setHazir(true); return; }
    refreshSession().then(yeni => { if (yeni) setOturum(yeni); else setSession(null); setHazir(true); });
  }, []);

  // ── Profil + yetki yükleme ────────────────────────────────────────────────
  const profilYukle = useCallback(async () => {
    if (!oturum?.user?.id) return;
    try {
      const u = await api.list("app_users", {
        select: "*,rol:roles(kod,ad)", eq: { id: oturum.user.id }, limit: 1,
      });
      const kul = u[0] || { id: oturum.user.id, email: oturum.user.email };
      setProfil({ ...kul, rol_kod: kul.rol?.kod, rol_ad: kul.rol?.ad });
      if (kul.role_id) {
        const izin = await api.list("role_permissions", { eq: { role_id: kul.role_id } });
        const harita = {};
        izin.forEach(p => { harita[p.modul] = p; });
        setYetki(harita);
      }
    } catch (e) {
      goster("Kullanıcı profili okunamadı: " + e.message, "hata");
      setProfil({ id: oturum.user.id, email: oturum.user.email });
    }
  }, [oturum, goster]);

  useEffect(() => { if (oturum) profilYukle(); }, [oturum, profilYukle]);

  const yetkiVar = useCallback((modul, islem = "goruntule") => {
    if (!modul) return true;
    if (profil?.rol_kod === "admin") return true;
    return !!yetkiler[modul]?.[islem];
  }, [profil, yetkiler]);

  async function girisYap() {
    setGiris(g => ({ ...g, bekle: true, hata: "" }));
    try {
      const d = await signIn(giris.email.trim(), giris.sifre);
      setOturum(d);
      setGiris({ email: "", sifre: "", hata: "", bekle: false });
    } catch (e) {
      setGiris(g => ({ ...g, hata: e.message, bekle: false }));
    }
  }

  async function cikisYap() {
    await signOut();
    setOturum(null); setProfil(null); setYetki({}); setSayfa("dashboard");
  }

  if (!hazir) return <Ekran>Yükleniyor…</Ekran>;

  if (!SB_URL) return (
    <Ekran>
      <Kart style={{ maxWidth: 520 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 18 }}>Supabase bağlantısı tanımlı değil</h2>
        <p style={{ margin: 0, fontSize: 13.5, color: T.renk.metinSoluk, lineHeight: 1.7 }}>
          Proje kökünde <code>.env.local</code> dosyası oluşturup şu iki satırı ekleyin,
          ardından <code>npm start</code> komutunu yeniden çalıştırın:
        </p>
        <pre style={{ background: "#0f172a", color: "#e2e8f0", padding: 14, borderRadius: 10,
          fontSize: 12, overflowX: "auto", marginTop: 12 }}>
{`REACT_APP_SB_URL=https://xxxxx.supabase.co
REACT_APP_SB_KEY=eyJhbGciOiJIUzI1NiIs...`}
        </pre>
      </Kart>
    </Ekran>
  );

  if (!oturum) return <GirisEkrani giris={giris} setGiris={setGiris} onGiris={girisYap} />;

  const Aktif = MODULLER[sayfa] || Yapim;

  return (
    <>
      <Kabuk aktif={sayfa} onGecis={setSayfa} yetkiVar={yetkiVar}
        kullanici={profil} onCikis={cikisYap}>
        <Aktif profil={profil} yetkiVar={yetkiVar} goster={goster} git={setSayfa} sayfaId={sayfa} />
      </Kabuk>
      <Bildirimler />
    </>
  );
}

function Ekran({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center",
      background: T.renk.zemin, color: T.renk.metinSoluk, padding: 24 }}>{children}</div>
  );
}

function GirisEkrani({ giris, setGiris, onGiris }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", background: T.renk.zemin }}>
      {/* Sol tanıtım paneli */}
      <div style={{ flex: "1 1 52%", background: `linear-gradient(150deg, ${T.renk.yan} 0%, ${T.renk.markaKoyu} 100%)`,
        color: "#fff", padding: "56px 60px", display: "flex", flexDirection: "column",
        justifyContent: "space-between", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <Logo boyut={38} />
          <div>
            <div style={{ fontWeight: 750, fontSize: 19, letterSpacing: ".08em" }}>OMX</div>
            <div style={{ fontSize: 10.5, color: "#93c5fd", letterSpacing: ".12em", textTransform: "uppercase" }}>Proje Yönetim Sistemi</div>
          </div>
        </div>
        <div style={{ maxWidth: 460 }}>
          <h2 style={{ fontSize: 30, fontWeight: 620, lineHeight: 1.25, margin: "0 0 16px", letterSpacing: "-.02em" }}>
            Teklif verdiğiniz andan garanti bitene kadar<br />tek sistem.
          </h2>
          <p style={{ fontSize: 14.5, color: "#bfdbfe", lineHeight: 1.75, margin: 0 }}>
            Proje · BOM · Satın alma · Depo · Puantaj · Servis · Maliyet.
            Her harcama otomatik olarak projeye düşer; kârı tahmin etmezsiniz, görürsünüz.
          </p>
        </div>
        <div style={{ fontSize: 11.5, color: "#64748b" }}>© {new Date().getFullYear()} OMX</div>
      </div>

      {/* Giriş formu */}
      <div style={{ flex: "1 1 48%", display: "grid", placeItems: "center", padding: 32 }}>
        <div style={{ width: "100%", maxWidth: 350 }}>
          <h1 style={{ fontSize: 22, fontWeight: 640, margin: "0 0 6px" }}>Giriş yapın</h1>
          <p style={{ fontSize: 13.5, color: T.renk.metinSoluk, margin: "0 0 24px" }}>
            Kurumsal hesabınızla devam edin.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Alan etiket="E-posta">
              <Giris type="email" value={giris.email} autoComplete="username"
                onChange={e => setGiris(g => ({ ...g, email: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && onGiris()}
                placeholder="ad.soyad@omx.com.tr" />
            </Alan>
            <Alan etiket="Şifre">
              <Giris type="password" value={giris.sifre} autoComplete="current-password"
                onChange={e => setGiris(g => ({ ...g, sifre: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && onGiris()}
                placeholder="••••••••" />
            </Alan>
            {giris.hata && (
              <div style={{ fontSize: 12.5, color: T.renk.hata, background: T.renk.hataAcik,
                padding: "9px 12px", borderRadius: T.r.md }}>{giris.hata}</div>
            )}
            <Btn tur="birincil" boyut="lg" onClick={onGiris} disabled={giris.bekle}
              style={{ justifyContent: "center", marginTop: 4 }}>
              {giris.bekle ? "Giriş yapılıyor…" : "Giriş Yap"}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
