import { Baslik, Bos, Kart } from "../ui/kit";
import { MENU } from "../ui/Kabuk";
import { T } from "../ui/theme";

const PLAN = {
  teklifler: ["Teklif no otomatik üretimi (TKF-2026-0001)", "Kalem bazlı maliyet ve kâr marjı", "Kazanıldı → proje otomatik açılır", "Revizyon geçmişi"],
  servis:    ["İş emri (arıza / periyodik / revizyon)", "Ekipman geçmişi ve garanti kontrolü", "Kullanılan parça → stok düşümü", "Saha raporu ve müşteri imzası"],
  puantaj:   ["Günlük saat girişi (proje × faaliyet)", "Harcırah, konaklama, yol", "Yönetici onayı → proje maliyetine düşer", "Kişi ve proje bazlı adam-saat raporu"],
  satinalma: ["BOM'dan eksik malzeme talebi", "Talep → onay → sipariş zinciri", "Sipariş anındaki kur sabitlenir", "Mal kabul → depo girişi"],
  depo:      ["Çok depolu bakiye (merkez / saha / araç)", "Giriş, çıkış, transfer, sayım", "Projeye çıkış → maliyete otomatik yazılır", "Kritik seviye uyarıları"],
  bom:       ["Çok seviyeli ürün ağacı", "Revizyon (Rev.A / Rev.B) ve geçerlilik tarihi", "Pano etiketi ve alternatif malzeme", "BOM → talep dönüşümü"],
  ekipman:   ["Müşteri sahasındaki ekipman kartı", "PLC / HMI marka, model, yazılım sürümü", "Garanti bitiş ve periyodik bakım takvimi", "Ekipmanın tüm servis geçmişi"],
  maliyet:   ["Proje maliyet defteri (malzeme / işçilik / taşeron / seyahat)", "Bütçe ↔ gerçekleşen karşılaştırması", "Kâr marjı ve hakediş durumu", "Excel dışa aktarım"],
  muhasebe:  ["Cari hesap ekstresi (TL / USD / EUR ayrı)", "Fatura ve ödeme kaydı, PDF ekleme", "Projeye bağlı fatura eşleştirme", "Hakediş → fatura dönüşümü"],
  ayarlar:   ["Kullanıcı ve rol yönetimi", "Modül bazlı yetki matrisi", "Şifre değiştirme", "Denetim kayıtları (kim, ne, ne zaman)"],
};

export default function Yapim({ sayfaId }) {
  const oge = MENU.flatMap(g => g.ogeler).find(o => o.id === sayfaId);
  const maddeler = PLAN[sayfaId] || [];
  return (
    <>
      <Baslik ust="Yapım aşamasında">{oge?.ad || "Modül"}</Baslik>
      <Kart>
        <Bos ikon={oge?.ikon || "◌"} baslik="Bu modül henüz devrede değil"
          aciklama="Veritabanı tabloları hazır; arayüz sıradaki geliştirme adımında eklenecek." />
        {maddeler.length > 0 && (
          <div style={{ maxWidth: 560, margin: "0 auto", paddingBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase",
              color: T.renk.metinPasif, marginBottom: 10 }}>Planlanan yetenekler</div>
            {maddeler.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start",
                padding: "8px 0", borderTop: `1px solid ${T.renk.cizgi}`, fontSize: 13.5, color: T.renk.metinSoluk }}>
                <span style={{ color: T.renk.marka, fontWeight: 700 }}>·</span>{m}
              </div>
            ))}
          </div>
        )}
      </Kart>
    </>
  );
}
