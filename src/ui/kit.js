// ─────────────────────────────────────────────────────────────────────────────
// OMX ortak arayüz bileşenleri.
// ESATLAS'ta her modül kendi inline style'ını tekrar yazıyordu; burada tek kaynak.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { T, DURUM_RENK, DURUM_ETIKET, CUR_SEMBOL } from "./theme";

// ── Biçimlendiriciler ───────────────────────────────────────────────────────
export const fmtPara = (n, cur = "TRY", basamak = 2) =>
  n == null || n === "" || isNaN(n) ? "—"
    : `${Number(n).toLocaleString("tr-TR", { minimumFractionDigits: basamak, maximumFractionDigits: basamak })} ${CUR_SEMBOL[cur] || cur}`;

export const fmtSayi = (n, b = 0) =>
  n == null || n === "" || isNaN(n) ? "—"
    : Number(n).toLocaleString("tr-TR", { minimumFractionDigits: b, maximumFractionDigits: 3 });

export const fmtTarih = s => {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d)) return "—";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};

export const fmtTarihSaat = s => {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d)) return "—";
  return `${fmtTarih(s)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export const bugun = () => new Date().toISOString().slice(0, 10);

// 1536 → "1,5 KB" · 4.700.000 → "4,5 MB"
export function fmtBoyut(b) {
  const n = Number(b);
  if (!n || isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1048576).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`;
  return `${(n / 1073741824).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} GB`;
}

// Dosya uzantısına göre renkli rozet
const UZANTI_RENK = {
  pdf: ["#b91c1c", "#fee2e2"],
  zip: ["#7c3aed", "#ede9fe"], rar: ["#7c3aed", "#ede9fe"], "7z": ["#7c3aed", "#ede9fe"],
  xlsx: ["#15803d", "#dcfce7"], xls: ["#15803d", "#dcfce7"], csv: ["#15803d", "#dcfce7"],
  docx: ["#1d4ed8", "#dbeafe"], doc: ["#1d4ed8", "#dbeafe"],
  pptx: ["#c2410c", "#ffedd5"],
  dwg: ["#0e7490", "#cffafe"], dxf: ["#0e7490", "#cffafe"], step: ["#0e7490", "#cffafe"], stp: ["#0e7490", "#cffafe"],
  png: ["#a16207", "#fef3c7"], jpg: ["#a16207", "#fef3c7"], jpeg: ["#a16207", "#fef3c7"],
  gif: ["#a16207", "#fef3c7"], webp: ["#a16207", "#fef3c7"], svg: ["#a16207", "#fef3c7"],
  txt: ["#475569", "#f1f5f9"], md: ["#475569", "#f1f5f9"], json: ["#475569", "#f1f5f9"],
  ap15: ["#be185d", "#fce7f3"], zap: ["#be185d", "#fce7f3"], s7p: ["#be185d", "#fce7f3"],
};

export const uzanti = ad => {
  const p = String(ad || "").split(".");
  return p.length > 1 ? p.pop().toLowerCase().slice(0, 4) : "";
};

export function DosyaRozet({ ad, boyut = 34 }) {
  const u = uzanti(ad);
  const [f, b] = UZANTI_RENK[u] || ["#64748b", "#f1f5f9"];
  return (
    <div style={{ width: boyut, height: boyut, borderRadius: 7, background: b, color: f,
      display: "grid", placeItems: "center", fontSize: u.length > 3 ? 8.5 : 10,
      fontWeight: 800, letterSpacing: ".02em", textTransform: "uppercase", flexShrink: 0 }}>
      {u || "?"}
    </div>
  );
}

// Türkçe/karışık sayı girdilerini doğru okur: "2.500,50" → 2500.5 · "1,250" → 1250
export function parseSayi(s) {
  let str = String(s ?? "").replace(/[^0-9.,-]/g, "");
  if (!str) return NaN;
  const c = str.lastIndexOf(","), d = str.lastIndexOf(".");
  if (c >= 0 && d >= 0) str = c > d ? str.replace(/\./g, "").replace(",", ".") : str.replace(/,/g, "");
  else if (c >= 0) {
    const p = str.split(",");
    str = (p.length > 2 || (p.length === 2 && p[1].length === 3 && p[0].length <= 3 && p[0] !== "0"))
      ? str.replace(/,/g, "") : str.replace(",", ".");
  } else if (d >= 0) {
    const p = str.split(".");
    if (p.length > 2 || (p.length === 2 && p[1].length === 3 && p[0].length <= 3 && p[0] !== "0"))
      str = str.replace(/\./g, "");
  }
  return parseFloat(str);
}

// Türkçe karakter duyarsız arama karşılaştırması
export const trLower = s => String(s || "").toLocaleLowerCase("tr-TR");
export const eslesir = (metin, aranan) => trLower(metin).includes(trLower(aranan));

// ── Temel bileşenler ────────────────────────────────────────────────────────
export function Kart({ children, style, pad = 18, ...p }) {
  return (
    <div style={{ background: T.renk.kart, border: `1px solid ${T.renk.cizgi}`,
      borderRadius: T.r.lg, padding: pad, boxShadow: T.golge.sm, ...style }} {...p}>
      {children}
    </div>
  );
}

export function Baslik({ ust, children, aciklama, sag }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
      gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
      <div>
        {ust && <div style={{ fontSize: T.yazi.xs, fontWeight: 700, letterSpacing: ".1em",
          textTransform: "uppercase", color: T.renk.metinPasif, marginBottom: 4 }}>{ust}</div>}
        <h1 style={{ margin: 0, fontSize: T.yazi.xxl, fontWeight: 650, letterSpacing: "-.02em" }}>{children}</h1>
        {aciklama && <p style={{ margin: "6px 0 0", fontSize: T.yazi.md, color: T.renk.metinSoluk }}>{aciklama}</p>}
      </div>
      {sag && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{sag}</div>}
    </div>
  );
}

const BTN = {
  birincil:  { bg: T.renk.marka, fg: "#fff", bd: T.renk.marka },
  ikincil:   { bg: "#fff", fg: T.renk.metin, bd: T.renk.cizgiKoyu },
  sessiz:    { bg: "transparent", fg: T.renk.metinSoluk, bd: "transparent" },
  tehlike:   { bg: "#fff", fg: T.renk.hata, bd: "#fecaca" },
  basari:    { bg: T.renk.basari, fg: "#fff", bd: T.renk.basari },
};

export function Btn({ tur = "ikincil", boyut = "md", ikon, children, style, ...p }) {
  const c = BTN[tur] || BTN.ikincil;
  const pad = boyut === "sm" ? "6px 11px" : boyut === "lg" ? "11px 20px" : "8px 15px";
  return (
    <button {...p} style={{
      display: "inline-flex", alignItems: "center", gap: 7, padding: pad,
      background: c.bg, color: c.fg, border: `1px solid ${c.bd}`,
      borderRadius: T.r.md, fontSize: boyut === "sm" ? T.yazi.sm : T.yazi.md,
      fontWeight: 550, cursor: p.disabled ? "not-allowed" : "pointer",
      opacity: p.disabled ? .5 : 1, whiteSpace: "nowrap", transition: "filter .12s",
      ...style,
    }}>{ikon}{children}</button>
  );
}

export function Rozet({ durum, children, renk, zemin }) {
  const [f, b] = DURUM_RENK[durum] || [renk || T.renk.metinSoluk, zemin || "#f1f5f9"];
  return (
    <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: T.r.tam,
      background: b, color: f, fontSize: T.yazi.xs, fontWeight: 650, whiteSpace: "nowrap" }}>
      {children || DURUM_ETIKET[durum] || durum || "—"}
    </span>
  );
}

// ── Form alanları ───────────────────────────────────────────────────────────
const alanStil = {
  width: "100%", padding: "9px 11px", borderRadius: T.r.md,
  border: `1px solid ${T.renk.cizgiKoyu}`, background: "#fff",
  fontSize: T.yazi.md, color: T.renk.metin, outline: "none",
};

export function Alan({ etiket, zorunlu, ipucu, hata, genislik, children }) {
  return (
    <label style={{ display: "block", flex: genislik ? `1 1 ${genislik}` : "1 1 200px", minWidth: 0 }}>
      {etiket && (
        <span style={{ display: "block", fontSize: T.yazi.sm, fontWeight: 550,
          color: T.renk.metinSoluk, marginBottom: 5 }}>
          {etiket}{zorunlu && <span style={{ color: T.renk.hata }}> *</span>}
        </span>
      )}
      {children}
      {ipucu && !hata && <span style={{ display: "block", fontSize: T.yazi.xs, color: T.renk.metinPasif, marginTop: 4 }}>{ipucu}</span>}
      {hata && <span style={{ display: "block", fontSize: T.yazi.xs, color: T.renk.hata, marginTop: 4 }}>{hata}</span>}
    </label>
  );
}

// Kontrollü input — her tuşta yeniden odak kaybı yaşanmaması için
// bileşen modül dosyalarının İÇİNDE tanımlanmamalı, buradan import edilmeli.
export const Giris = ({ style, ...p }) => <input {...p} style={{ ...alanStil, ...style }} />;
export const Metin = ({ style, satir = 3, ...p }) =>
  <textarea rows={satir} {...p} style={{ ...alanStil, resize: "vertical", ...style }} />;

export function Secim({ secenekler = [], bos = "Seçiniz…", style, ...p }) {
  return (
    <select {...p} style={{ ...alanStil, cursor: "pointer", ...style }}>
      {bos !== false && <option value="">{bos}</option>}
      {secenekler.map(o => {
        const [v, l] = Array.isArray(o) ? o : [o.deger ?? o.value ?? o, o.etiket ?? o.label ?? o];
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  );
}

export function Satir({ children, bosluk = 12, style }) {
  return <div style={{ display: "flex", gap: bosluk, flexWrap: "wrap", ...style }}>{children}</div>;
}

// ── Arama kutusu (gecikmeli) ────────────────────────────────────────────────
export function Arama({ deger, onDegisim, yer = "Ara…", gecikme = 250, genislik = 280 }) {
  const [ic, setIc] = useState(deger || "");
  const ilk = useRef(true);
  useEffect(() => {
    if (ilk.current) { ilk.current = false; return; }
    const t = setTimeout(() => onDegisim(ic), gecikme);
    return () => clearTimeout(t);
  }, [ic]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ position: "relative", width: genislik }}>
      <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
        color: T.renk.metinPasif, fontSize: 13, pointerEvents: "none" }}>⌕</span>
      <input value={ic} onChange={e => setIc(e.target.value)} placeholder={yer}
        style={{ ...alanStil, paddingLeft: 28, borderRadius: T.r.tam, background: "#fff" }} />
      {ic && <button onClick={() => setIc("")} style={{ position: "absolute", right: 8, top: "50%",
        transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer",
        color: T.renk.metinPasif, fontSize: 15 }}>×</button>}
    </div>
  );
}

// ── Aranabilir seçim kutusu ─────────────────────────────────────────────────
// Binlerce malzeme arasından seçim yapmak için düz <select> kullanılamaz.
// secenekler: [{ deger, etiket, alt? }]
export function SecimAra({ deger, onSec, secenekler = [], yer = "Ara ve seç…",
                           bos = "— seçilmedi —", disabled }) {
  const [acik, setAcik] = useState(false);
  const [ara, setAra]   = useState("");
  const sarmal = useRef(null);

  const secili = secenekler.find(o => String(o.deger) === String(deger));

  useEffect(() => {
    if (!acik) return;
    const h = e => { if (sarmal.current && !sarmal.current.contains(e.target)) setAcik(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [acik]);

  const suzulmus = useMemo(() => {
    const q = trLower(ara).trim();
    const liste = q
      ? secenekler.filter(o => trLower(o.etiket).includes(q) || trLower(o.alt).includes(q))
      : secenekler;
    return liste.slice(0, 60);          // uzun listede tarayıcıyı boğmamak için
  }, [ara, secenekler]);

  return (
    <div ref={sarmal} style={{ position: "relative" }}>
      <button type="button" disabled={disabled} onClick={() => { setAcik(a => !a); setAra(""); }}
        style={{ ...alanStil, textAlign: "left", cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? .6 : 1, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          color: secili ? T.renk.metin : T.renk.metinPasif }}>
          {secili ? secili.etiket : bos}
        </span>
        <span style={{ color: T.renk.metinPasif, fontSize: 10 }}>▾</span>
      </button>

      {acik && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 300,
          background: "#fff", border: `1px solid ${T.renk.cizgi}`, borderRadius: T.r.md,
          boxShadow: T.golge.lg, maxHeight: 300, display: "flex", flexDirection: "column" }}>
          <input autoFocus value={ara} onChange={e => setAra(e.target.value)} placeholder={yer}
            style={{ border: "none", borderBottom: `1px solid ${T.renk.cizgi}`, padding: "9px 11px",
              fontSize: T.yazi.md, outline: "none", borderRadius: `${T.r.md}px ${T.r.md}px 0 0` }} />
          <div style={{ overflowY: "auto", flex: 1 }}>
            {deger !== "" && deger != null && (
              <div onClick={() => { onSec(""); setAcik(false); }}
                style={{ padding: "8px 11px", fontSize: T.yazi.sm, color: T.renk.metinPasif, cursor: "pointer" }}>
                {bos}
              </div>
            )}
            {!suzulmus.length ? (
              <div style={{ padding: 16, textAlign: "center", fontSize: T.yazi.sm, color: T.renk.metinPasif }}>
                Eşleşen kayıt yok
              </div>
            ) : suzulmus.map(o => (
              <div key={o.deger} onClick={() => { onSec(o.deger); setAcik(false); }}
                style={{ padding: "8px 11px", cursor: "pointer", fontSize: T.yazi.md,
                  background: String(o.deger) === String(deger) ? T.renk.markaAcik : "transparent" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f1f5f9"}
                onMouseLeave={e => e.currentTarget.style.background =
                  String(o.deger) === String(deger) ? T.renk.markaAcik : "transparent"}>
                <div style={{ fontWeight: 500 }}>{o.etiket}</div>
                {o.alt && <div style={{ fontSize: T.yazi.xs, color: T.renk.metinPasif }}>{o.alt}</div>}
              </div>
            ))}
            {secenekler.length > 60 && !ara && (
              <div style={{ padding: "7px 11px", fontSize: T.yazi.xs, color: T.renk.metinPasif,
                borderTop: `1px solid ${T.renk.cizgi}` }}>
                {secenekler.length} kayıttan ilk 60'ı — aramayı daraltın
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tablo ───────────────────────────────────────────────────────────────────
// sutunlar: [{ anahtar, baslik, genislik, hizala, render(satir), siralanabilir }]
export function Tablo({ sutunlar, veri, anahtarAl = r => r.id, onSatirTikla,
                        siralama, onSiralama, bosMesaj = "Kayıt bulunamadı", yukleniyor }) {
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${T.renk.cizgi}`,
      borderRadius: T.r.lg, background: "#fff" }}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: T.yazi.md }}>
        <thead>
          <tr>
            {sutunlar.map(s => (
              <th key={s.anahtar} onClick={() => s.siralanabilir && onSiralama?.(s.anahtar)}
                style={{
                  position: "sticky", top: 0, zIndex: 1,
                  padding: "10px 12px", textAlign: s.hizala || "left",
                  background: "#f8fafc", borderBottom: `1px solid ${T.renk.cizgi}`,
                  borderRight: `1px solid ${T.renk.cizgi}`,
                  fontSize: T.yazi.xs, fontWeight: 700, letterSpacing: ".04em",
                  textTransform: "uppercase", color: T.renk.metinSoluk,
                  width: s.genislik, whiteSpace: "nowrap",
                  cursor: s.siralanabilir ? "pointer" : "default", userSelect: "none",
                }}>
                {s.baslik}
                {siralama?.anahtar === s.anahtar && (siralama.yon === "asc" ? " ↑" : " ↓")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {yukleniyor ? (
            <tr><td colSpan={sutunlar.length} style={{ padding: 40, textAlign: "center", color: T.renk.metinPasif }}>Yükleniyor…</td></tr>
          ) : !veri?.length ? (
            <tr><td colSpan={sutunlar.length} style={{ padding: 40, textAlign: "center", color: T.renk.metinPasif }}>{bosMesaj}</td></tr>
          ) : veri.map((r, i) => (
            <tr key={anahtarAl(r)} onClick={() => onSatirTikla?.(r)}
              style={{ background: i % 2 ? "#fbfcfd" : "#fff", cursor: onSatirTikla ? "pointer" : "default" }}
              onMouseEnter={e => onSatirTikla && (e.currentTarget.style.background = T.renk.markaAcik)}
              onMouseLeave={e => onSatirTikla && (e.currentTarget.style.background = i % 2 ? "#fbfcfd" : "#fff")}>
              {sutunlar.map(s => (
                <td key={s.anahtar} style={{
                  padding: "10px 12px", textAlign: s.hizala || "left",
                  borderBottom: `1px solid ${T.renk.cizgi}`,
                  borderRight: `1px solid ${T.renk.cizgi}`,
                  color: T.renk.metin, verticalAlign: "middle",
                }}>
                  {s.render ? s.render(r) : (r[s.anahtar] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Ölçüm kutusu ────────────────────────────────────────────────────────────
export function Olcum({ etiket, deger, alt, renk = T.renk.marka, zemin, ikon, vurgu }) {
  return (
    <Kart pad={16} style={{ borderLeft: `3px solid ${renk}`, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {ikon && <div style={{ width: 38, height: 38, borderRadius: T.r.md, flexShrink: 0,
          background: zemin || T.renk.markaAcik, display: "grid", placeItems: "center", fontSize: 17 }}>{ikon}</div>}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: T.yazi.xs, color: T.renk.metinSoluk, fontWeight: 600,
            textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>{etiket}</div>
          <div style={{ fontSize: vurgu ? T.yazi.xxl : 21, fontWeight: 700, color: renk,
            lineHeight: 1.1, letterSpacing: "-.02em", whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis" }}>{deger}</div>
          {alt && <div style={{ fontSize: T.yazi.sm, color: T.renk.metinPasif, marginTop: 3 }}>{alt}</div>}
        </div>
      </div>
    </Kart>
  );
}

// ── İlerleme çubuğu ─────────────────────────────────────────────────────────
export function Ilerleme({ yuzde = 0, renk, yukseklik = 7, etiketGoster = true }) {
  const y = Math.max(0, Math.min(100, Number(yuzde) || 0));
  const c = renk || (y >= 100 ? T.renk.basari : y >= 50 ? T.renk.marka : T.renk.uyari);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: yukseklik, background: "#eef2f6", borderRadius: T.r.tam, overflow: "hidden", minWidth: 40 }}>
        <div style={{ width: `${y}%`, height: "100%", background: c, borderRadius: T.r.tam, transition: "width .3s" }} />
      </div>
      {etiketGoster && <span style={{ fontSize: T.yazi.xs, fontWeight: 700, color: c, width: 34, textAlign: "right" }}>%{Math.round(y)}</span>}
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────
export function Modal({ acik, onKapat, baslik, aciklama, genislik = 720, altBar, children }) {
  useEffect(() => {
    if (!acik) return;
    const h = e => e.key === "Escape" && onKapat?.();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [acik, onKapat]);
  if (!acik) return null;
  return (
    <div onMouseDown={e => e.target === e.currentTarget && onKapat?.()}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 200 }}>
      <div style={{ background: "#fff", borderRadius: T.r.xl, width: "100%", maxWidth: genislik,
        maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: T.golge.lg }}>
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${T.renk.cizgi}`,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: T.yazi.xl, fontWeight: 650 }}>{baslik}</h3>
            {aciklama && <p style={{ margin: "4px 0 0", fontSize: T.yazi.md, color: T.renk.metinSoluk }}>{aciklama}</p>}
          </div>
          <button onClick={onKapat} style={{ border: "none", background: "none", cursor: "pointer",
            fontSize: 24, lineHeight: 1, color: T.renk.metinPasif, padding: 0 }}>×</button>
        </div>
        <div style={{ padding: 22, overflowY: "auto", flex: 1 }}>{children}</div>
        {altBar && <div style={{ padding: "14px 22px", borderTop: `1px solid ${T.renk.cizgi}`,
          display: "flex", justifyContent: "flex-end", gap: 9, background: "#fafbfc",
          borderRadius: `0 0 ${T.r.xl}px ${T.r.xl}px` }}>{altBar}</div>}
      </div>
    </div>
  );
}

// ── Sekmeler ────────────────────────────────────────────────────────────────
export function Sekmeler({ sekmeler, aktif, onDegisim }) {
  return (
    <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${T.renk.cizgi}`,
      marginBottom: 18, overflowX: "auto" }}>
      {sekmeler.map(s => {
        const k = s.anahtar ?? s;
        const secili = k === aktif;
        return (
          <button key={k} onClick={() => onDegisim(k)} style={{
            padding: "10px 15px", border: "none", background: "none", cursor: "pointer",
            fontSize: T.yazi.md, fontWeight: secili ? 650 : 500,
            color: secili ? T.renk.marka : T.renk.metinSoluk,
            borderBottom: `2px solid ${secili ? T.renk.marka : "transparent"}`,
            marginBottom: -1, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 7,
          }}>
            {s.baslik ?? s}
            {s.sayi != null && <span style={{ fontSize: T.yazi.xs, fontWeight: 700, padding: "1px 6px",
              borderRadius: T.r.tam, background: secili ? T.renk.markaAcik : "#f1f5f9",
              color: secili ? T.renk.marka : T.renk.metinPasif }}>{s.sayi}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Boş durum ───────────────────────────────────────────────────────────────
export function Bos({ ikon = "◌", baslik, aciklama, eylem }) {
  return (
    <div style={{ textAlign: "center", padding: "56px 20px", color: T.renk.metinPasif }}>
      <div style={{ fontSize: 34, marginBottom: 10, opacity: .5 }}>{ikon}</div>
      <div style={{ fontSize: T.yazi.lg, fontWeight: 600, color: T.renk.metinSoluk, marginBottom: 5 }}>{baslik}</div>
      {aciklama && <div style={{ fontSize: T.yazi.md, maxWidth: 400, margin: "0 auto 16px" }}>{aciklama}</div>}
      {eylem}
    </div>
  );
}

// ── Bildirim (toast) ────────────────────────────────────────────────────────
export function useBildirim() {
  const [liste, setListe] = useState([]);
  const goster = useCallback((mesaj, tur = "bilgi") => {
    const id = Math.random().toString(36).slice(2);
    setListe(l => [...l, { id, mesaj, tur }]);
    setTimeout(() => setListe(l => l.filter(x => x.id !== id)), 4200);
  }, []);
  const Bildirimler = () => (
    <div style={{ position: "fixed", bottom: 22, right: 22, display: "flex",
      flexDirection: "column", gap: 9, zIndex: 400 }}>
      {liste.map(b => {
        const renk = b.tur === "hata" ? T.renk.hata : b.tur === "basari" ? T.renk.basari : T.renk.marka;
        return (
          <div key={b.id} style={{ background: "#fff", borderLeft: `3px solid ${renk}`,
            padding: "12px 18px", borderRadius: T.r.md, boxShadow: T.golge.lg,
            fontSize: T.yazi.md, color: T.renk.metin, maxWidth: 380, fontWeight: 500 }}>
            {b.mesaj}
          </div>
        );
      })}
    </div>
  );
  return { goster, Bildirimler };
}

// ── Onay penceresi ──────────────────────────────────────────────────────────
export function OnayModal({ acik, baslik = "Emin misiniz?", mesaj, onEvet, onHayir, tehlike }) {
  return (
    <Modal acik={acik} onKapat={onHayir} baslik={baslik} genislik={440}
      altBar={<>
        <Btn onClick={onHayir}>Vazgeç</Btn>
        <Btn tur={tehlike ? "tehlike" : "birincil"} onClick={onEvet}>{tehlike ? "Sil" : "Onayla"}</Btn>
      </>}>
      <p style={{ margin: 0, fontSize: T.yazi.md, color: T.renk.metinSoluk, lineHeight: 1.6 }}>{mesaj}</p>
    </Modal>
  );
}
