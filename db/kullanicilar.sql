-- ============================================================================
-- OMX ERP · Kullanıcı rolleri
--
-- ÖNCE Supabase → Authentication → Users → Add user ile hesapları oluşturun.
-- Her yeni hesap otomatik olarak app_users tablosuna en düşük yetkiyle ('saha')
-- düşer; bu betik rolleri yükseltir.
--
-- Not: aşağıdaki update yalnızca VAR OLAN hesapları etkiler. "UPDATE 0" görürseniz
-- hesap henüz Authentication tarafında oluşturulmamıştır.
-- ============================================================================

-- ── Yöneticiler ─────────────────────────────────────────────────────────────
update app_users
   set role_id  = (select id from roles where kod = 'admin'),
       -- Ad hâlâ ham e-posta önekiyse okunur hâle getir; elle girilmişse dokunma
       ad_soyad = case
         when ad_soyad is null or ad_soyad = split_part(email,'@',1)
           then initcap(replace(split_part(email,'@',1), '.', ' '))
         else ad_soyad end
 where email in (
   'musa.karakurt@omx.com.tr',
   'ahmetoguzhan.demirci@omx.com.tr'
 );

-- ── Ad soyadı tam yazmak isterseniz ─────────────────────────────────────────
-- Yukarıdaki betik adı e-posta önekinden türetir ("Ahmetoguzhan Demirci").
-- Türkçe karakterli doğru hâlini elle yazın; sonraki çalıştırmalarda korunur.
--
-- update app_users set ad_soyad = 'Musa Karakurt'
--  where email = 'musa.karakurt@omx.com.tr';
-- update app_users set ad_soyad = 'Ahmet Oğuzhan Demirci'
--  where email = 'ahmetoguzhan.demirci@omx.com.tr';

-- ── Diğer roller için şablon ────────────────────────────────────────────────
-- Kullanılabilir rol kodları:
--   admin · yonetici · muhendis · satinalma · depo · saha · muhasebe · satis
--
-- update app_users set role_id = (select id from roles where kod = 'muhendis')
--  where email in ('ad.soyad@omx.com.tr');

-- ── Saatlik maliyet (puantajın proje maliyetine dönüşmesi için) ─────────────
-- Puantaj modülü devreye girdiğinde bu değer kullanılır. Şimdi girilebilir.
--
-- update app_users set saatlik_maliyet = 900 where email = 'musa.karakurt@omx.com.tr';

-- ── Kontrol ─────────────────────────────────────────────────────────────────
select u.email,
       u.ad_soyad,
       coalesce(r.ad, '— rol atanmamış —') as rol,
       u.saatlik_maliyet,
       u.aktif
  from app_users u
  left join roles r on r.id = u.role_id
 order by r.id nulls last, u.email;
