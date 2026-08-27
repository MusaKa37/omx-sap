// ─────────────────────────────────────────────────────────────────────────────
// Uygulama kabuğu: sol menü + üst bar + içerik alanı.
// ESATLAS'taki "kart ızgarası ana sayfa" yerine kalıcı sol menü kullanıldı —
// 18 modüllü bir ERP'de her modül için ana sayfaya dönmek pratik değil.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { T } from "./theme";
import { APP } from "../services/config";

export function Logo({ boyut = 30, renk = "#fff" }) {
  return (
    <svg width={boyut} height={boyut} viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="11" fill={renk === "#fff" ? "#1e40af" : "#1e40af"} />
      <path d="M12 32V16h4.6l4.2 9.4L25 16h4.6v16h-3.6V22l-3.7 8h-2.6l-3.7-8v10H12Z" fill="#fff" />
      <circle cx="35.5" cy="30.5" r="4.5" fill="#60a5fa" />
    </svg>
  );
}

// Menü grupları — modül eklendikçe yalnızca burası güncellenir
export const MENU = [
  { grup: "Genel", ogeler: [
    { id: "dashboard", ad: "Panel",          ikon: "▦", modul: null },
  ]},
  { grup: "Operasyon", ogeler: [
    { id: "projeler",  ad: "Projeler",       ikon: "◈", modul: "proje" },
    { id: "teklifler", ad: "Teklifler",      ikon: "✎", modul: "satis" },
    { id: "servis",    ad: "Servis & Bakım", ikon: "⚙", modul: "servis" },
    { id: "puantaj",   ad: "Puantaj",        ikon: "◷", modul: "puantaj" },
  ]},
  { grup: "Tedarik Zinciri", ogeler: [
    { id: "satinalma", ad: "Satın Alma",     ikon: "⇩", modul: "satinalma" },
    { id: "depo",      ad: "Depo & Stok",    ikon: "▤", modul: "depo" },
  ]},
  { grup: "Ana Veri", ogeler: [
    { id: "cariler",   ad: "Müşteri & Tedarikçi", ikon: "◉", modul: "cari" },
    { id: "malzeme",   ad: "Malzeme Kartları",    ikon: "◇", modul: "malzeme" },
    { id: "bom",       ad: "Ürün Ağacı (BOM)",    ikon: "⑂", modul: "bom" },
    { id: "ekipman",   ad: "Ekipman Parkı",       ikon: "▣", modul: "servis" },
  ]},
  { grup: "Finans", ogeler: [
    { id: "maliyet",   ad: "Proje Maliyet",  ikon: "∑", modul: "maliyet" },
    { id: "muhasebe",  ad: "Cari & Muhasebe",ikon: "₺", modul: "muhasebe" },
  ]},
  { grup: "Sistem", ogeler: [
    { id: "ayarlar",   ad: "Ayarlar",        ikon: "⚒", modul: null },
  ]},
];

export function Kabuk({ aktif, onGecis, yetkiVar, kullanici, onCikis, ustSag, children }) {
  const [kapali, setKapali] = useState(false);
  const g = kapali ? 62 : 232;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.renk.zemin }}>
      {/* SOL MENÜ */}
      <aside style={{ width: g, flexShrink: 0, background: T.renk.yan, color: "#cbd5e1",
        display: "flex", flexDirection: "column", position: "sticky", top: 0,
        height: "100vh", transition: "width .18s" }}>
        <div style={{ height: 60, display: "flex", alignItems: "center", gap: 10,
          padding: "0 14px", borderBottom: "1px solid #1e293b", flexShrink: 0 }}>
          <Logo boyut={30} />
          {!kapali && (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 750, fontSize: 15, color: "#fff", letterSpacing: ".06em" }}>{APP.ad}</div>
              <div style={{ fontSize: 9.5, color: "#64748b", letterSpacing: ".1em", textTransform: "uppercase" }}>{APP.altAd}</div>
            </div>
          )}
        </div>

        <nav style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}>
          {MENU.map(gr => {
            const gorunur = gr.ogeler.filter(o => !o.modul || yetkiVar(o.modul, "goruntule"));
            if (!gorunur.length) return null;
            return (
              <div key={gr.grup} style={{ marginBottom: 14 }}>
                {!kapali && <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".12em",
                  textTransform: "uppercase", color: "#475569", padding: "0 10px 6px" }}>{gr.grup}</div>}
                {gorunur.map(o => {
                  const secili = o.id === aktif;
                  return (
                    <button key={o.id} onClick={() => onGecis(o.id)} title={o.ad}
                      style={{ display: "flex", alignItems: "center", gap: 11, width: "100%",
                        padding: kapali ? "10px 0" : "9px 10px", marginBottom: 1,
                        justifyContent: kapali ? "center" : "flex-start",
                        border: "none", borderRadius: T.r.md, cursor: "pointer",
                        background: secili ? T.renk.marka : "transparent",
                        color: secili ? "#fff" : "#94a3b8",
                        fontSize: 13, fontWeight: secili ? 600 : 500, textAlign: "left",
                        transition: "background .12s" }}
                      onMouseEnter={e => !secili && (e.currentTarget.style.background = T.renk.yanAcik)}
                      onMouseLeave={e => !secili && (e.currentTarget.style.background = "transparent")}>
                      <span style={{ fontSize: 14, width: 16, textAlign: "center", flexShrink: 0 }}>{o.ikon}</span>
                      {!kapali && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.ad}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <button onClick={() => setKapali(k => !k)}
          style={{ padding: "11px", border: "none", borderTop: "1px solid #1e293b",
            background: "transparent", color: "#475569", cursor: "pointer", fontSize: 13 }}>
          {kapali ? "»" : "« Menüyü daralt"}
        </button>
      </aside>

      {/* İÇERİK */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header style={{ height: 60, background: "#fff", borderBottom: `1px solid ${T.renk.cizgi}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 24px", gap: 16, position: "sticky", top: 0, zIndex: 50 }}>
          <div style={{ flex: 1, minWidth: 0 }}>{ustSag}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ textAlign: "right", lineHeight: 1.25 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{kullanici?.ad_soyad || kullanici?.email}</div>
              <div style={{ fontSize: 10.5, color: T.renk.metinPasif, textTransform: "uppercase", letterSpacing: ".06em" }}>
                {kullanici?.rol_ad || "—"}
              </div>
            </div>
            <div style={{ width: 33, height: 33, borderRadius: "50%", background: T.renk.markaAcik,
              color: T.renk.marka, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13 }}>
              {(kullanici?.ad_soyad || kullanici?.email || "?").slice(0, 1).toLocaleUpperCase("tr-TR")}
            </div>
            <button onClick={onCikis} title="Çıkış"
              style={{ border: `1px solid ${T.renk.cizgi}`, background: "#fff", borderRadius: T.r.md,
                padding: "6px 12px", fontSize: 12, cursor: "pointer", color: T.renk.metinSoluk }}>Çıkış</button>
          </div>
        </header>
        <main style={{ flex: 1, padding: "24px 28px 48px", minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}
