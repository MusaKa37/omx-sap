import { api } from "./api";

jest.mock("./config", () => ({ SB_URL: "https://test.invalid", SB_KEY: "test", STORAGE_KEY: "test_session" }));

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; localStorage.clear(); });

test.each([
  ["materials_malzeme_kodu_key", "Bu malzeme koduyla kayıtlı bir kart zaten var."],
  ["materials_malzeme_kodu_normalized_uidx", "Bu malzeme koduyla kayıtlı bir kart zaten var."],
  ["materials_uretici_parca_no_normalized_uidx", "Bu üretici parça numarasıyla kayıtlı bir kart zaten var."],
  ["companies_vergi_no_key", "Bu kayıt zaten mevcut (benzersiz alan çakışması)."],
])("veritabanındaki %s çakışmasını kullanıcıya açıklar", async (constraint, expected) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false, status: 409,
    text: async () => JSON.stringify({ code: "23505", message: `duplicate key value violates unique constraint "${constraint}"` }),
  });
  await expect(api.insert("materials", { malzeme_kodu: "YENI" })).rejects.toThrow(expected);
});
