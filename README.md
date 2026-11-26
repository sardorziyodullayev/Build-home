# Lola Bog' Residence: 3D sotuv ofisi

Qurilishi hali tugamagan turar-joy binosini mijozga **tayyor holida** ko'rsatadigan interaktiv 3D sahifa. Sotuv ofisidagi ekranda, planshetda yoki saytda ishlaydi.

Hamma narsa kod bilan yaratiladi (Three.js): bino, interyer, mebel, tom bog'i, ko'cha, mashinalar, shahar. Tashqi 3D model yoki render rasm kerak emas.

## Nimalar bor

| Ko'rinish | Nima qiladi |
| --- | --- |
| **Bino** | Kechki shahar fonida bino. Qavat ustiga olib borilsa yoritiladi va nechta xonadon sotuvdaligi chiqadi. Bosilsa o'sha qavatga o'tadi. |
| **Qurilish holati** | Slayder: poydevor → karkas → fasad → tayyor. "Hozir" belgisi (masalan 46%) va "Tayyor" holati. Sahifa ochilganda bino hozirgi holatidan tayyor holatiga "qurilib" boradi. |
| **Xonadonlar** | Kamera yuqoridan qavat kesimiga tushadi (yuqori qavatlar kesib olinadi). Har bir xonadonda raqamli pin, mebel, devorlar. Sotilgan xonadonlar qoraygan, band qilinganlar sarg'ish. Xonalar soni va "faqat sotuvda" filtri, o'ngda qavat tanlash. |
| **Xonadon kartasi** | Avtomatik chiziladigan reja (xonalar va m²), maydon, tomon, narx, 1 m² narxi, foizsiz muddatli to'lov kalkulyatori (boshlang'ich to'lov %, 12/24/36 oy). |
| **Ichkariga kirish** | Kamera xonadon ichiga, ko'z balandligiga tushadi. Xonalar o'rtasida o'tish, atrofga qarash. |
| **Tom bog'i** | Pergola terrasa, basseyn, mevali bog' va so'ri, maysazor: har biri pin va karta bilan. |
| **Ko'cha** | Pastki qavat: lobbi, kafe, do'kon. Harakatlanayotgan mashinalar, ko'cha chiroqlari. |
| **So'rov** | "Qo'ng'iroq buyurtma qilish" formasi, tanlangan xonadon bilan birga. |
| **Valyuta** | $ va so'm o'rtasida almashish. |
| **Kun vaqti** | Tong, kunduz, shom, tun va har qanday soat (slayder). Quyosh vaqtga qarab sharqdan g'arbga harakatlanadi va soya tashlaydi. Osmon, tuman, deraza chiroqlari va ko'cha chiroqlari vaqtga mos o'zgaradi. "Hozir" tugmasi qurilmaning haqiqiy vaqtini qo'yadi, ▶ esa bir kunni 18 soniyada ko'rsatadi. Ichkarida ham ishlaydi: kunduzi derazadan kunduzgi shahar ko'rinadi. |
| **Quyosh nuri** | Xonadon kartasida derazalar tomoni (janub/shimol, burchakdagilar uchun sharq/g'arb) va quyosh qachon tushishi ko'rsatiladi. |

Havolalar: `#bino`, `#xonadonlar`, `#tom`, `#kocha` (masalan, sotuv ofisidagi planshetni to'g'ridan-to'g'ri xonadonlar sahifasida ochish uchun).

## Ishga tushirish

Build kerak emas. Istalgan statik serverdan oching:

```bash
npx serve .        # yoki: python3 -m http.server
```

Bitta faylga yig'ish (hostingga yoki CMS'ga qo'yish uchun):

```bash
node tools/build.mjs           # dist/lola-bog.html
```

Three.js `cdn.jsdelivr.net` dan yuklanadi (versiya 0.170.0 ga qotirilgan).

## O'z obyektingizga moslash

Hammasi `js/app.js` ning boshida:

- `PROJECT`: nomi, manzil, qurilishning hozirgi foizi (`progressNow`), topshirish sanasi, dollar kursi, telefon, `leadEndpoint`, quyosh chiqishi/botishi (`sunrise`, `sunset`) va sahifa ochilgandagi vaqt (`startHour`).
- Yo'nalish: ko'cha tomoni janub (+z), bog' tomoni shimol (-z). Haqiqiy uchastka boshqacha joylashgan bo'lsa, `sunAt()` dagi yo'nalishni va xonadonlardagi `sides`/`sun` matnlarini moslang.
- `TOD_KEYS`: har bir vaqtdagi osmon ranglari va yorug'lik (tong, kunduz, shom, tun).
- `ROOF_PLACES`, `STREET_PLACES`: tom va pastki qavatdagi joylar, matnlari.
- `G_H`, `F_H`, `RES`, `WIDTHS`: qavat balandligi, qavatlar soni, xonadonlar kengligi.
- Xonadonlar generatori (`UNITS`): hozir narx va holat namunaviy (deterministik tasodifiy). Haqiqiy loyihada bu ro'yxatni CRM/1C dan JSON qilib olish kerak: `id, f, side, idx, area, price, status`.

### So'rovlarni qabul qilish

`PROJECT.leadEndpoint` ga CRM yoki Telegram-bot webhook manzilini yozing. Forma `POST` bilan JSON yuboradi:

```json
{ "name": "Dilnoza", "phone": "+998 90 123 45 67", "time": "Bugun kechqurun", "unit": "603", "project": "Lola Bog'", "at": "2026-11-26T08:00:00.000Z" }
```

Manzil bo'sh bo'lsa so'rov faqat brauzerning `localStorage` ida saqlanadi va mijozga telefon raqami ko'rsatiladi. Bu demo rejim: haqiqiy saytda albatta ulang.

## Fayllar

```
index.html        sahifa tuzilishi (UI)
css/style.css     dizayn
js/app.js         3D sahna, ma'lumotlar, interaktivlik
tools/build.mjs   bitta HTML faylga yig'ish
```

Nomi, manzil, narxlar va xonadonlar holati namunaviy ma'lumot.
