import React from "react";
import { createRoot } from "react-dom/client";
import { act, Simulate } from "react-dom/test-utils";
import Malzeme from "./Malzeme";
import { api } from "../services/api";

jest.mock("../services/api", () => ({ api: { list: jest.fn(), insert: jest.fn(), update: jest.fn() }, logAudit: jest.fn() }));

const malzeme = { id: 1, malzeme_kodu: "MJ-001", malzeme_adi: "Soket", uretici_parca_no: "D38999/26WB02PN", aktif: true, tip: "sarf", birim: "Adet" };
let container, root, goster;
global.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(async () => {
  jest.clearAllMocks();
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container); goster = jest.fn();
  api.list.mockImplementation(async table => table === "materials" ? [malzeme] : []);
  api.update.mockResolvedValue(malzeme);
  await act(async () => root.render(<Malzeme yetkiVar={() => true} goster={goster} />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

async function tikla(text) {
  const button = [...container.querySelectorAll("button")].find(b => b.textContent === text);
  expect(button).toBeDefined();
  await act(async () => Simulate.click(button));
}
async function gir(etiket, value) {
  const input = [...container.querySelectorAll("label")].find(l => l.textContent.startsWith(etiket)).querySelector("input");
  await act(async () => Simulate.change(input, { target: { value } }));
}

test.each([
  ["Malzeme Kodu", " mj-001 "],
  ["Üretici Parça No", " d38999/26wb02pn "],
])("%s çakışınca kartı gösterir ve kaydetme isteği göndermez", async (alan, deger) => {
  await tikla("＋Yeni Malzeme");
  await gir("Malzeme Kodu", "YENI-001");
  await gir("Malzeme Adı", "Yeni soket");
  await gir(alan, deger);
  expect(container.textContent).toContain("MJ-001 — Soket");
  await tikla("Kaydet");
  expect(api.insert).not.toHaveBeenCalled();
  expect(api.update).not.toHaveBeenCalled();
  expect(goster).toHaveBeenCalledWith(expect.stringContaining("Aynı parça tekrar kaydedilemez"), "hata");
});

test("mevcut kart kendi kodu ve parça numarasıyla düzenlenebilir", async () => {
  await act(async () => Simulate.click(container.querySelector("tbody tr")));
  await tikla("Düzenle");
  expect(container.textContent).not.toContain("Aynı parça tekrar kaydedilemez");
  await tikla("Kaydet");
  expect(api.update).toHaveBeenCalledWith("materials", 1, expect.objectContaining({ malzeme_kodu: "MJ-001", uretici_parca_no: "D38999/26WB02PN" }));
});
