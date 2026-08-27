// ─────────────────────────────────────────────────────────────────────────────
// Supabase REST katmanı.
// ESATLAS'taki fetch sarmalayıcısının genelleştirilmiş hâli: her modül
// kendi fetch'ini yazmak yerine buradaki api.list/get/insert/update/remove'u
// kullanır. Token yenileme ve hata mesajı tek yerde.
// ─────────────────────────────────────────────────────────────────────────────
import { SB_URL, SB_KEY, STORAGE_KEY, STORAGE_BUCKET } from "./config";

export function getSession() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
export function setSession(s) {
  if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  else localStorage.removeItem(STORAGE_KEY);
}

function headers(token, extra = {}) {
  return {
    apikey: SB_KEY,
    Authorization: `Bearer ${token || SB_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...extra,
  };
}

export async function refreshSession() {
  const s = getSession();
  if (!s?.refresh_token) return null;
  try {
    const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: SB_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: s.refresh_token }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    setSession(data);
    return data;
  } catch { return null; }
}

// Türkçeleştirilmiş hata mesajları — ham PostgREST çıktısı kullanıcıya gösterilmez
function friendlyError(payload, status) {
  const msg = payload?.message || payload?.error_description || payload?.error || "";
  const code = payload?.code || "";
  if (status === 401 || status === 403) return "Bu işlem için yetkiniz yok.";
  if (code === "23505") return "Bu kayıt zaten mevcut (benzersiz alan çakışması).";
  if (code === "23503") return "Bu kayıt başka kayıtlarla ilişkili, önce onları düzenleyin.";
  if (code === "23502") return "Zorunlu bir alan boş bırakılmış.";
  if (code === "PGRST204" || /column .* does not exist|schema cache/i.test(msg))
    return "Veritabanı şeması güncel değil. db/01_schema.sql dosyasını çalıştırın.";
  return msg || `İstek başarısız (${status})`;
}

async function call(path, opts = {}, retry = true) {
  if (!SB_URL) throw new Error("Supabase bağlantısı tanımlı değil (.env.local).");
  const token = getSession()?.access_token;
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: opts.method || "GET",
    headers: headers(token, opts.headers),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && retry) {
    const s = await refreshSession();
    if (s) return call(path, opts, false);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(friendlyError(data, res.status));
  return { data, range: res.headers.get("content-range") };
}

// ── Sorgu kurucu ────────────────────────────────────────────────────────────
// api.list("projects", { select: "*,musteri:companies(unvan)", eq: { durum: "devam" },
//                        ilike: { proje_adi: "pano" }, order: "termin.asc", limit: 50 })
//
// GÖMÜLÜ SORGU UYARISI
// Bir tablonun hedefe BİRDEN FAZLA yabancı anahtarı varsa PostgREST hangisini
// kullanacağını bilemez ve şu hatayı verir:
//   "Could not embed because more than one relationship was found"
// Şemadaki belirsiz çiftler:
//   projects   → app_users  (sorumlu_id, created_by)
//   boms       → app_users  (onaylayan_id, created_by)
//   timesheets → app_users  (user_id, onaylayan_id)
//   bom_lines  → materials  (material_id, alternatif_material_id)
//   stock_moves→ warehouses (warehouse_id, hedef_warehouse_id)
// Çözüm: ya sütunu "!" ile belirtin —
//   select: "*,sorumlu:app_users!sorumlu_id(ad_soyad)"
// ya da (tercih edilen) ilgili listeyi ayrıca yükleyip adı arayüzde eşleştirin;
// böylece her satır için ek birleştirme maliyeti de doğmaz.
function buildQuery(q = {}) {
  const p = new URLSearchParams();
  if (q.select) p.set("select", q.select);
  Object.entries(q.eq || {}).forEach(([k, v]) => v != null && v !== "" && p.append(k, `eq.${v}`));
  Object.entries(q.neq || {}).forEach(([k, v]) => p.append(k, `neq.${v}`));
  Object.entries(q.gte || {}).forEach(([k, v]) => v && p.append(k, `gte.${v}`));
  Object.entries(q.lte || {}).forEach(([k, v]) => v && p.append(k, `lte.${v}`));
  Object.entries(q.in || {}).forEach(([k, v]) => v?.length && p.append(k, `in.(${v.join(",")})`));
  Object.entries(q.ilike || {}).forEach(([k, v]) => v && p.append(k, `ilike.*${sanitize(v)}*`));
  if (q.or) p.set("or", q.or);
  if (q.order) p.set("order", q.order);
  if (q.limit) p.set("limit", q.limit);
  if (q.offset) p.set("offset", q.offset);
  return p.toString();
}

// PostgREST or=/in= sözdizimini bozan karakterleri temizler
export const sanitize = s => String(s || "").replace(/[,()*\\]/g, " ").trim();

export const api = {
  async list(table, q = {}) {
    const { data } = await call(`${table}?${buildQuery(q)}`);
    return data || [];
  },
  async count(table, q = {}) {
    const { range } = await call(`${table}?${buildQuery({ ...q, select: "id", limit: 1 })}`,
      { headers: { Prefer: "count=exact" } });
    return Number(String(range || "0/0").split("/")[1]) || 0;
  },
  async one(table, id, select = "*") {
    const { data } = await call(`${table}?id=eq.${id}&select=${encodeURIComponent(select)}&limit=1`);
    return data?.[0] || null;
  },
  async insert(table, body) {
    const { data } = await call(table, { method: "POST", body });
    return Array.isArray(data) ? data[0] : data;
  },
  async insertMany(table, rows) {
    const { data } = await call(table, { method: "POST", body: rows });
    return data || [];
  },
  async update(table, id, body) {
    const q = typeof id === "string" && id.includes("=") ? id : `id=eq.${id}`;
    const { data } = await call(`${table}?${q}`, { method: "PATCH", body });
    return Array.isArray(data) ? data[0] : data;
  },
  async remove(table, id) {
    const q = typeof id === "string" && id.includes("=") ? id : `id=eq.${id}`;
    await call(`${table}?${q}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  },
  async rpc(fn, args = {}) {
    const { data } = await call(`rpc/${fn}`, { method: "POST", body: args });
    return data;
  },
};

// ── Kimlik doğrulama ────────────────────────────────────────────────────────
export async function signIn(email, password) {
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    const m = data.error_description || data.msg || "";
    throw new Error(/invalid/i.test(m) ? "E-posta veya şifre hatalı." : m || "Giriş yapılamadı.");
  }
  setSession(data);
  return data;
}

export async function signOut() {
  const t = getSession()?.access_token;
  if (t) await fetch(`${SB_URL}/auth/v1/logout`, {
    method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${t}` },
  }).catch(() => {});
  setSession(null);
}

export async function changePassword(newPassword) {
  const t = getSession()?.access_token;
  const res = await fetch(`${SB_URL}/auth/v1/user`, {
    method: "PUT",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password: newPassword }),
  });
  if (!res.ok) throw new Error("Şifre değiştirilemedi.");
  return true;
}

export function sessionValid(s) {
  try {
    const b64 = s.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return Date.now() / 1000 < JSON.parse(atob(b64)).exp;
  } catch { return false; }
}

// ── Dosya yükleme ───────────────────────────────────────────────────────────
export async function uploadFile(path, file, bucket = STORAGE_BUCKET) {
  const t = getSession()?.access_token;
  const res = await fetch(`${SB_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${t}`, "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new Error("Dosya yüklenemedi.");
  return `${SB_URL}/storage/v1/object/public/${bucket}/${path}`;
}

// ── Denetim kaydı ───────────────────────────────────────────────────────────
export async function logAudit({ tablo, kayit_id, islem, aciklama, eski, yeni }) {
  const u = getSession()?.user;
  try {
    await api.insert("audit_logs", {
      tablo, kayit_id: String(kayit_id ?? ""), islem, aciklama,
      eski_deger: eski || null, yeni_deger: yeni || null,
      user_email: u?.email, user_id: u?.id,
    });
  } catch { /* denetim kaydı kritik değil, akışı durdurmaz */ }
}

// ── Belge numarası ──────────────────────────────────────────────────────────
export const nextDocNo = prefix => api.rpc("next_doc_no", { p_prefix: prefix });
