-- Lokatsiya va konsultatsiya uchun
ALTER TABLE customers ADD COLUMN lat REAL;
ALTER TABLE customers ADD COLUMN lon REAL;
ALTER TABLE products ADD COLUMN info TEXT;

UPDATE products SET info = 'Avtomat kir yuvish mashinasi uchun kukun. Oq va rangli kiyimlarga mos, qiyin dog''larni (yog'', choy, o''t) yaxshi ketkazadi. Bir yuvishga odatda 75-100 g (paketdagi yo''riqnomaga qarang), 3 kg taxminan 30-40 yuvishga yetadi. 4-5 kishilik oilaga taxminan bir oy.' WHERE id = 'ariel';
UPDATE products SET info = 'Avtomat mashina uchun kukun, rangli kiyimlarda rangni saqlashga yaxshi. Ariel''ga yaqin sifat, biroz arzonroq. 3 kg taxminan 30-40 yuvishga yetadi.' WHERE id = 'persil';
UPDATE products SET info = 'Avtomat mashina uchun kukun, kundalik yuvishga tejamli variant. Oddiy ifloslanishga yaxshi, juda qiyin dog''larga Ariel kuchliroq. 3 kg taxminan 30-40 yuvishga yetadi.' WHERE id = 'tide';
UPDATE products SET info = 'Kepakka (perxot) qarshi shampun. Har kuni ishlatsa bo''ladi. Kepak kamayishi uchun muntazam 2-3 hafta ishlatish kerak. Kepak juda kuchli, qichishish yoki qizarish bo''lsa, dermatologga ko''rinish tavsiya etiladi. 400 ml odatda 1-1,5 oyga yetadi.' WHERE id = 'head';
UPDATE products SET info = 'Kepakka qarshi shampun, sochni yengil va toza qiladi. Yog''li sochga yaxshi mos keladi. Head & Shoulders''dan biroz arzonroq. 400 ml odatda 1-1,5 oyga yetadi.' WHERE id = 'clear';
UPDATE products SET info = 'Quruq, mo''rt va bo''yalgan (shikastlangan) soch uchun shampun. Sochni yumshoq va yaltiroq qiladi, taralishini osonlashtiradi. Kepakka qarshi emas.' WHERE id = 'pantene';
UPDATE products SET info = 'Oddiy va ingichka soch uchun mustahkamlovchi shampun, mevali yoqimli hidli. Kundalik foydalanishga mos, narxi qulay. Kepakka qarshi emas.' WHERE id = 'garnier';
UPDATE products SET info = 'Antiperspirant dezodorant, terlash va hiddan uzoq himoya qiladi. Faol hayot tarzi va issiq kunlar uchun yaxshi. Toza, quruq teriga surtiladi. Qirilgandan keyin darhol surtmagan ma''qul.' WHERE id = 'rexona';
UPDATE products SET info = 'Yumshoq antiperspirant, sezgir teriga Rexona''dan ko''ra muloyimroq. Kiyimda iz qoldirmaydigan seriyalari bor. Toza, quruq teriga surtiladi.' WHERE id = 'nivea';
UPDATE products SET info = 'Dush geli, yoqimli hidli, terini quritmaydi. Butun oila uchun kundalik foydalanishga mos. Bir martaga oz miqdor yetarli, mochalka bilan yaxshi ko''piradi.' WHERE id = 'palmolive';
UPDATE products SET info = 'Idish yuvish suyuqligi, konsentrat. Yog''ni sovuq suvda ham yaxshi ketkazadi. Bir tog''ora idishga 1-2 tomchi yetadi, shuning uchun 500 ml uzoq, odatda 1-2 oyga yetadi.' WHERE id = 'fairy';
UPDATE products SET info = 'Xlorli tozalash va dezinfeksiya vositasi: unitaz, vanna, kafel. Mikroblarni o''ldiradi, sarg''ish dog''larni oqartiradi. Qo''lqop bilan ishlating, boshqa tozalash vositalari bilan ARALASHTIRMANG, bolalardan uzoqda saqlang.' WHERE id = 'domestos';
UPDATE products SET info = 'Tozalovchi krem: plita, rakovina, vanna, kafel. Mayda zarrachalari yopishgan kir va yog''ni ketkazadi, lekin sirtni tirnamaydi. Nam latta yoki gubkaga ozgina surtib ishlatiladi.' WHERE id = 'cif';
UPDATE products SET info = 'Kiyim yumshatuvchi (konditsioner). Kiyimni yumshoq va xushbo''y qiladi, elektrlanishni kamaytiradi, dazmollashni osonlashtiradi. Mashinaning maxsus bo''limiga quyiladi. Kukun bilan birga ishlatiladi.' WHERE id = 'lenor';
UPDATE products SET info = 'Ftorli tish pastasi, tish chirishidan himoya qiladi. Kuniga 2 marta, no''xatdek miqdorda. 6 yoshgacha bolalarga maxsus bolalar pastasi tavsiya etiladi.' WHERE id = 'colgate';
UPDATE products SET info = 'Namlovchi krem-sovun, terini quritmaydi. Quruq va sezgir teriga, yuz va qo''l uchun yaxshi.' WHERE id = 'dove';
UPDATE products SET info = 'Antibakterial sovun, qo''l yuvish uchun. Oilaga, ayniqsa bolali uylarga qulay. Narxi arzon.' WHERE id = 'safeguard';
UPDATE products SET info = 'Bir martalik ustara, 2 tig''li, 5 dona. Soqol va tana uchun. Bittasi odatda 3-5 marta qirishga yetadi. Ko''pik yoki gel bilan qirish terini tirnashdan saqlaydi.' WHERE id = 'gillette';
