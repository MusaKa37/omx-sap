import { malzemeCakismalari, cakismaMesaji } from "./malzemeKontrol";

const liste = [
  { id: 1, malzeme_kodu: "MJ-001", malzeme_adi: "Soket", uretici_parca_no: "D38999/26WB02PN", aktif: true },
  { id: 2, malzeme_kodu: "MJ-002", malzeme_adi: "Pasif soket", uretici_parca_no: " ABC-2 ", aktif: false },
  { id: 3, malzeme_kodu: "MJ-003", malzeme_adi: "Numarasız", uretici_parca_no: null, aktif: true },
];

test("aynı kod veya aynı üretici parça numarası tek başına çakışma oluşturur", () => {
  expect(malzemeCakismalari({ malzeme_kodu: " mj-001 ", uretici_parca_no: "farkli" }, liste)).toEqual({ malzeme_kodu: liste[0] });
  expect(malzemeCakismalari({ malzeme_kodu: "YENI", uretici_parca_no: " d38999/26wb02pn " }, liste)).toEqual({ uretici_parca_no: liste[0] });
});

test("pasif kayıtlar da korunur ve çakışan kart uyarıda belirtilir", () => {
  const sonuc = malzemeCakismalari({ malzeme_kodu: "YENI", uretici_parca_no: "abc-2" }, liste);
  expect(sonuc.uretici_parca_no).toBe(liste[1]);
  expect(cakismaMesaji("uretici_parca_no", sonuc.uretici_parca_no)).toContain("MJ-002 — Pasif soket (pasif kart)");
});

test("düzenlenen kart kendisiyle çakışmaz, başka karta ait numarayı alamaz", () => {
  expect(malzemeCakismalari({ ...liste[0], id: "1" }, liste)).toEqual({});
  expect(malzemeCakismalari({ ...liste[0], uretici_parca_no: "ABC-2" }, liste)).toEqual({ uretici_parca_no: liste[1] });
});

test("iki alan farklı kartlarla çakışırsa iki hata da gösterilir", () => {
  expect(malzemeCakismalari({ malzeme_kodu: "MJ-001", uretici_parca_no: "ABC-2" }, liste)).toEqual({ malzeme_kodu: liste[0], uretici_parca_no: liste[1] });
});

test("boş parça numaraları ve yalnızca benzer olan numaralar çakışmaz", () => {
  for (const uretici_parca_no of [null, "", "   ", "D38999/26WB02PN-X", "D38999/26WB02P"]) {
    expect(malzemeCakismalari({ malzeme_kodu: "YENI", uretici_parca_no }, liste)).toEqual({});
  }
});
