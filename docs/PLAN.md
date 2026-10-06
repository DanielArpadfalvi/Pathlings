# Pathlings – megvalósítási terv

> Munkacím: **Pathlings** (később átnevezhető). Prémium érzetű, Lemmings-szerű „terelős” kirakós **portré módban**,
> rombolható/építhető pixeles terepen, beépített **pályaszerkesztővel** és **offline pályakód-megosztással**.
> Forrás: `swaplight/docs/market-research-2026-10.md`, #3 (Igény 4 · Rés 5 · Megval. 4 · Trend 3).
> Repo: `DanielArpadfalvi/Pathlings` · Bundle ID: `com.arpadfalvi.pathlings`.
> Döntések (2026-10-06): TypeScript + Capacitor 8 · ingyenes letöltés + egyszeri 2,99 $-os „Teljes játék” feloldás
> (nincs reklám, energia, valuta, fogyóeszköz; „Data Not Collected”) · 1.0 teljesen offline, online pályaböngésző a 1.1-ben · kódból generált pixelgrafika.

---

## 0. Pitch, célközönség, rés

**Pitch:** „Vezesd haza a kis Pathlingeket! Ásni, hidat építeni, falat fúrni – minden képességből csak néhány van.
80 kézzel készített pálya, saját pályaszerkesztő, és a megoldott pályádat egy szövegkóddal bárkinek elküldheted.
Energia és reklám nélkül, offline.”

**Célközönség:**
- 30–50 éves nosztalgiázók, akik a 90-es évek PC/Amiga terelős kirakósain nőttek fel, és a mostani mobilos
  F2P változattól elfordultak (elsődleges, ők terjesztik a pályakódokat fórumokon, Redditen, Discordon).
- Fiatalabb casual-puzzle játékosok (Cut the Rope, Monument Valley, Baba Is You közönség), akik rövid, de
  fejtörős pályákat szeretnek, egy kézzel, ingázás közben.
- Alkotók: a pályaszerkesztő és a kódos megosztás a hosszú élettartam motorja (lásd Mario Maker, NeoLemmix-közösség).

**A rés (miért most):**
- A hivatalos mobil változat (2018 óta, Exient/Sony) F2P: **energia minden képesség-kiosztáshoz**, több valuta,
  loot boxok, VIP-előfizetés, **7 USD a 2 óra korlátlan energiáért**, IAP-ok **99,99 USD-ig**; a vélemények
  rendszeresen panaszkodnak a pay-to-win felugrókra és a reklámokra. Van benne pályaszerkesztő („Creatorverse”),
  de ugyanaz a gazdaságtan alatt, online-kötötten.
- Prémium, energia nélküli, igényes mobil alternatíva gyakorlatilag nincs; a PC-s rajongói kiadások (NeoLemmix
  és társai) mobilon nem elérhetők, a „games like Lemmings” listák mobilon főleg régi/elhagyott klónokat mutatnak.
- A műfaj mechanikája mobilra termett (érintéssel kiosztott parancsok, szünet közbeni tervezés), a
  determinisztikus szimuláció pedig olcsón ad megoldás-visszajátszást és hamisíthatatlan pályakódot.

**Versenytársak és mit csinálnak rosszul:**
| Játék | Modell | Gyengeség, amire építünk |
|---|---|---|
| Hivatalos mobil verzió (Puzzle Survival / Puzzle Adventure) | F2P, energia, VIP, IAP 99,99 USD-ig | energia-kapu játék közben, reklámok, online-kötött szerkesztő |
| Humanity és hasonló „tömeg-terelős” prémiumok | prémium, konzol/PC | nincs mobil / nem touch-ra tervezett |
| Régi mobil klónok | fizetős / reklámos | elavult, nem frissül, rossz touch-pontosság kis lényeken |

Források: [Android Authority](https://www.androidauthority.com/lemmings-android-936634/),
[Android Police](https://www.androidpolice.com/2018/12/20/lemmings-is-the-latest-victim-of-mobile-gaming-goes-free-to-play-on-android/),
[Google Play](https://play.google.com/store/apps/details?id=com.sadpuppy.lemmings&hl=en_US),
[MiniReview – games like](https://minireview.io/puzzle/lemmings/games-like). (A mintajáték neve csak itt, belső
elemzésben szerepel – kódban, appban, store-szövegben soha.)

---

## 1. Játékterv (GDD)

### 1.1 Alapmechanika (számokkal)
**Világ és mértékegység**
- A terep bitmaszk, **1 cella = 1 világpixel**; pályaméret **160–640 széles × 240–960 magas** (portré-barát:
  tipikusan 320×480, a nagy pályák 640×960). Belső felbontás egész számokkal, nincs lebegőpont a szimulációban.
- Anyagok (`Uint8Array`): 0 levegő, 1 föld (ásható), 2 kő (ásható, de lassabban: 2× idő), 3 fém (nem ásható,
  nem robbantható), 4 egyirányú-balra, 5 egyirányú-jobbra (csak az adott irányba haladva fúrható), 6 morzsalék
  (rálépés után 60 tick múlva eltűnik). Víz/láva/csapda **objektum**, nem terep.
- **Szimuláció: fix 60 Hz tick**, minden mozgás egész pixel / tick-számláló alapú. Megjelenítés interpolál.

**A lények (Pathlingek)**
- Méret: **5 px széles × 9 px magas** hitbox, talppont alapú (x, y = a talp alatti pixel).
- **Menetelés:** 1 px / **3 tick** (20 px/s). Fellépés max **6 px** magas lépcsőn; magasabb fal → megfordul
  (ha nem Mászó).
- **Esés:** 1 px/tick (60 px/s). **Halálos esési magasság: 60 px** (Vitorlázónál nincs).
- **Kijárat:** a kijárati zóna (12×12 px) talppont-belépése = hazaért (20 tick „beugrás” animáció, input nem hat rá).
- Halál: víz/láva érintése, csapda, esés > 60 px, pályán kívülre (alul/oldalt) kerülés, Pukkancs robbanása.
- **Kiadási ütem (release rate):** a bejárat N tick-enként enged ki egyet; pályánként min. érték, a játékos
  **+/−** gombbal gyorsíthat a min. és 4× ütem között (classic-szerű, de touch-gombokkal).
- Időkorlát: alapértelmezés 5:00 (pályánként 2:00–9:59), lejárta után a pálya értékelése.
- **Cél:** „X-ből legalább Y hazajut.” Csillagok: ★ = elérted Y-t, ★★ = elérted a „mester” küszöböt (pályánként
  megadott, ≥ Y), ★★★ = a „takarékos” küszöb (legfeljebb K képesség-kiosztással teljesítve). A csillag csak
  kozmetikai/elismerés, nem kapuz semmit (a világok a pályák *teljesítésével* nyílnak).

**A 8 képesség (eredeti nevek, EN / HU)**
| # | EN | HU | Tartós? | Viselkedés (számok) |
|---|---|---|---|---|
| 1 | **Scaler** | Mászó | igen | falnál függőlegesen felmászik 1 px / 4 tick; túlnyúló plafonnál visszaesik és megfordul |
| 2 | **Glider** | Vitorlázó | igen | 16 px esés után levélernyő nyílik: 1 px / 3 tick esés, nincs halálos magasság |
| 3 | **Popper** | Pukkancs | – | 5 mp (300 tick) visszaszámlálás a feje fölött, majd 12 px sugarú kráter (föld+kő, fém nem), a lény elvész |
| 4 | **Warden** | Őr | – | megáll, 7×11 px-es zónájába érő lényeket megfordítja; csak alatta kiásva / Pukkanccsal szabadul |
| 5 | **Mason** | Kőműves | – | 12 deszkás lépcső: deszka 6×1 px, deszkánként +2 px előre, +1 px fel, 32 tick / deszka; az utolsó 3 deszkánál „fogyóban” jelzés; falba ütközve megfordul |
| 6 | **Burrower** | Fúró | – | vízszintes alagút, 9 px magas, 1 px / 4 tick; ha 8 px-en belül nincs több fúrható anyag előtte, visszaáll menetelésre; fémen megáll |
| 7 | **Sloper** | Csákányos | – | átlós lefelé (2 előre : 1 le) alagút, 9 px magas, 1 lépés / 6 tick; fémen megáll |
| 8 | **Delver** | Ásó | – | függőlegesen lefelé, 9 px széles sáv, 1 px / 8 tick (kőben 16); ha alatta levegő van, esni kezd |

- A tartós képességek (Mászó, Vitorlázó) kombinálhatók egymással és egy aktív képességgel („Mindenes” lény).
- Pályánként képességenként 0–99 db; az aktuális készlet a gombon. Kiosztás csak érvényes lényre (pl. zuhanó
  lényre nem adható Ásó) – érvénytelen próbálkozás halk „nem” hangot ad, és **nem fogy** a készletből.
- **Mind pukkan** (nuke): minden lény Pukkancs lesz (hosszú nyomás 0,6 mp + megerősítő pöccintés).

**Pályaobjektumok (1.0)**
Bejárat (1–2 db), kijárat (1–3 db), víz, láva (azonnali halál, a láva izzik), csapda (egyszerre egy lényt öl,
180 tick újratöltés), teleport-pár (belépés → kilépés ugyanazzal az iránnyal), ugrópárna (40 px függőleges
lökés), egyirányú fal (anyagként), morzsalék (anyagként). 1.1 jelöltek: szállítószalag, kapcsoló + ajtó, szél.

**Determinizmus**
- Teljes állapot = pályadefiníció + **input log** (tick, parancs, cél-lény id) + kiadási ütem változásai.
  Nincs véletlen a magban (a pálya maga determinisztikus); a seedelt RNG csak a napi pálya kiválasztásához és
  kozmetikumhoz (pl. részecskék a render rétegben) kell.
- **Lény-azonosítás az input logban stabil id-vel** (kiadási sorszám), nem képernyő-koordinátával.
- Állapot-hash (FNV-1a a terepen + lényeken) tesztekhez, replay-validáláshoz és a pályakód-ellenőrzéshez.

### 1.2 Játékmódok
| Mód | 1.0 | 1.1 | Ingyenes? |
|---|---|---|---|
| **Kampány** – 4 világ × 20 pálya | ✔ | +1 világ (frissítésként, a feloldás tartalmazza) | 30 pálya: 1. világ + 2. világ 1–10 |
| **Oktatás** – az 1. világ első 8 pályája interaktív súgóval | ✔ | | igen |
| **Pályaszerkesztő** – építés, teszt, közzététel kódként | ✔ | sablonok, objektumok bővítése | **igen, teljesen** |
| **Pályakód lejátszása** – beillesztés / megnyitás linkből | ✔ | QR-kód olvasás | **igen** |
| **Saját gyűjtemény** – mentett / kapott pályák, kedvencek | ✔ | | igen |
| **Megoldás-visszajátszás** – saját és a kódba csomagolt megoldás | ✔ | | igen |
| **Napi pálya** – kurált bónuszkészletből napi választás + módosító (pl. −1 Kőműves) | ✔ | online ranglista | **igen** (a mai pálya); archívum: Teljes játék |
| **Online pályaböngésző** – feltöltés, lájk, keresés, kiemeltek | – | ✔ | igen |
| **Kihívás-pályák** (pl. „csak Ásó”, időre) | – | ✔ | Teljes játék |

### 1.3 Tartalom 1.0-ra
- **80 kampánypálya** (4 × 20), mind kézzel készítve **ugyanazzal a szerkesztővel** (dogfooding), mindegyikhez
  ellenőrzött, a buildbe csomagolt referencia-megoldás (CI-ben visszajátszva → nem lehet megoldhatatlan pálya).
- Világok és új elemek:
  1. **Mohaliget** (Mossy Glade) – oktatás; képességek egyenként: Ásó, Kőműves, Fúró, Őr, Mászó, Vitorlázó,
     Csákányos, Pukkancs; víz.
  2. **Kristálymély** (Crystal Deep) – kő, fém, egyirányú falak, láva; függőleges „akna” pályák (portré!).
  3. **Óraműhely** (Clockworks) – csapdák, teleportok, ugrópárnák, több bejárat/kijárat, időnyomás.
  4. **Felhőszirt** (Skyreach) – morzsalék, nagy esések, Vitorlázó+Mászó kombók, „mester” pályák.
- **Bónuszkészlet** a napi pályához: 30 extra pálya (a napi pálya ezekből választ dátum-seed alapján; a teljes
  archívum „Bónusz” csomagként a Teljes játékban érhető el).
- **Szerkesztő-darabok:** témánként ~16 előre definiált forma („bélyeg”: szikla, híd, oszlop, kristály, fogaskerék…)
  + alapformák (téglalap, kör, rámpa, sokszög, szabadkézi ecset 3 méretben).

### 1.4 Progresszió és nehézség
- Világon belül lineáris, de mindig **3 nyitott pálya** egyszerre (ha elakadsz, továbbléphetsz) – a világ utolsó
  pályája 17/20 teljesítésnél nyílik, a következő világ a világ utolsó pályájával.
- Nehézségi görbe: világonként 1–5 → 3–8 → 5–9 → 7–10 (belső skála, a pályafájlban rögzítve, QA-hoz).
- Segítség, ami nem fizetős és nem fogy: **Tipp** (pályánként 2 szöveges tipp, 3 sikertelen próba után nyílik),
  **Megoldás megnézése** (5 sikertelen próba után, a pálya ettől még „★ megoldva (segítséggel)” jelölést kap).
- **Visszatekerés** (Rewind): 1 mp-es lépésekben vissza a pálya bármely pontjára (determinisztikus újraszimulálás
  kulcskockákból), majd onnan folytatható – a műfaj legnagyobb frusztrációját (perces újrakezdés egy hiba miatt)
  szünteti meg. Korlátlan, ingyenes.

### 1.5 Oktatás
- Az 1. világ első 8 pályája: minden pálya **egy** képességet vezet be, kontextuális buborékkal („Koppints a
  Pathlingre, aki a szakadék szélén áll”), szellem-kéz animációval és automatikus szünettel a kulcspillanatban.
- A vezérlés (kijelölés, nagyítás, sebesség, szünet közbeni kiosztás, visszatekerés) az első 3 pályán, egyenként.
- Bármikor átugorható; a Beállításokban újraindítható.

### 1.6 Portré vagy fekvő? – **Döntés: PORTRÉ**
Indoklás:
- Egykezes, ingázós használat; a többi stúdió-projekttel (Swaplight, Craterpult) azonos héj, UI-készlet és
  screenshot-pipeline.
- A pályákat **portréra tervezzük**: a 4 világból kettő kifejezetten függőleges (aknák, tornyok, zuhanások),
  ami a műfajban friss és felismerhető („a függőleges terelős játék”). A széles pályák görgetéssel/nagyítással
  működnek: a kamera kezdetben a bejáratot és (ha belefér) a kijáratot mutatja.
- Alapnagyítás: a képernyő szélességére ~200 világpixel (390 pt széles telefonon ~2× skála → egy lény ~10×18 pt).
  Nagyítás 1×–4× között, csípéssel; „teljes pálya” gomb.
- A fekvő mód ára (két kezes, más UI-elrendezés, dupla screenshot-készlet) az 1.0-ban nem éri meg;
  tableten a portré-UI középre igazítva, nagyobb látható területtel fut. Fekvő támogatás: 1.1-jelölt.

### 1.7 Touch-vezérlés részletesen
**Képernyő-elrendezés (portré):** felül vékony HUD (kint / bent / szükséges / idő / szünet), középen a pálya,
alul a hüvelykujj-zónában 2 sorban: **8 képesség-gomb** (ikon + készlet, legalább 48×48 pt), alatta
sebesség/szünet/visszatekerés/kiadási ütem ± / mind pukkan. Balkezes mód: a vezérlősor tükrözve.

**Kijelölés kis lényeken („okos koppintás”):**
1. Koppintáskor a **28 pt sugarú** körön belül lévő lények közül a jelölt-pontszám szerint választunk:
   (a) a kiválasztott képességre **jogosult** lény előnyt kap, (b) távolság a koppintástól, (c) aki még nem kapott
   képességet, (d) haladási irány a koppintás oldala felé, (e) stabil sorrend: kisebb id.
2. A kurzor alatti „célzott” lény **már ujj-lenyomás alatt** kiemelődik (körvonal + nyíl), így az elengedés
   előtt látszik, kit kap a parancs; az ujj elhúzásával a jelölt váltható.
3. **Nagyító lupe:** 250 ms nyomva tartás után 2,5×-es kör alakú nagyító jelenik meg az ujj fölött
   (hogy ne takarja az ujj), elengedés = kiosztás a kiemelt lényre; ujj lehúzása a lupe-ból = mégse.
4. **Irányszűrő:** bal/jobb/mindkettő kapcsoló (csak az adott irányba haladók kijelölhetők) – tömeg esetén.
5. Kiosztás **szünetben is** működik (fő stratégiai eszköz); opcionális „Auto-szünet koppintáskor” mód, ami
   kijelöléskor megállítja az időt, kiosztás után folytatja.
- **Kamera:** 1 ujjas húzás üres területen = pásztázás (5 pt holtzónával, hogy a koppintás ne legyen pásztázás),
  2 ujjas csípés = zoom, dupla koppintás = ráközelítés / vissza. Kamera-mozgás *nem* kerül az input logba.
- **Sebesség:** szünet, 0,5× (akadálymentesség), 1×, 2×, 4× (gyorsítás). A szimuláció mindig 60 Hz-es tick;
  gyorsításnál több tick fut képkockánként, lassításnál ritkábban.
- **Visszatekerés:** gomb nyomva tartása = folyamatos vissza 4×-es sebességgel; elengedve szünetel.
- Haptika: rövid koppanás sikeres kiosztáskor, dupla az érvénytelennél, erősebb hazaérkezéskor/haláleseménynél
  (kikapcsolható).

### 1.8 Pályaszerkesztő (1.0)
- Portré, egykezes: alul eszköztár (Ecset / Forma / Bélyeg / Radír / Objektum / Kéz), anyagválasztó, felül
  Visszavonás/Újra (min. 100 lépés), Tesztjáték, Tulajdonságok.
- Tulajdonságok: méret (előre adott méretek: 320×480, 480×720, 640×960, 640×480), téma, lényszám (1–100),
  szükséges (1–lényszám), képességkészlet (0–99/képesség), időkorlát, min. kiadási ütem, cím (max 32 karakter),
  szerző (becenév, opcionális), 2 tipp (opcionális).
- **A terep műveletlistaként tárolódik** (ecsetvonás, forma, bélyeg, radír – max. 1024 művelet), nem bitmapként:
  a raszterizálás egész számos, determinisztikus. Ettől lesz a pályakód kicsi (tipikusan 0,3–2 KB).
- **Közzététel = megoldás**: csak akkor generálható megosztható kód, ha a szerző tesztjátékban **teljesítette**
  a pályát; a megoldás input logja a kódba kerül. A fogadó kliens a betöltéskor **visszajátssza** a megoldást,
  és csak egyező végeredménynél fogadja el „ellenőrzött” jelöléssel (különben „nem ellenőrzött / sérült”).
- Szerkesztői validáció: van bejárat és kijárat, a szükséges ≤ lényszám, a műveletlimit és kódméret-limit alatt.

### 1.9 Megosztás pályakóddal (offline)
- Formátum: `PL1-` előtag + **base64url** szöveg; a „Másolás” gomb vágólapra teszi, a „Beillesztés” felismeri
  (szóközök/sortörések tűrésével). Megosztás a rendszer share sheet-jével (szövegként) + link formában
  `https://<site>/l#PL1-…` (a weboldal csak továbbirányít az appba/store-ba; 1.0-ban opcionális deep link).
- QR-kód generálás/olvasás: 1.1 (a ≤ 2 KB célméret ezt eleve lehetővé teszi).
- Részletes bináris formátum: lásd 3.3.

### 1.10 Akadálymentesség
- Színvak-barát: a képességeket **ikon + forma** jelöli (a lény feje fölötti szimbólum), nem csak szín.
- Magas kontrasztú mód (terep körvonal erősítése, egyszínű háttér), csökkentett mozgás (nincs rázás/villanás),
  0,5× sebesség, auto-szünet, balkezes elrendezés, nagyobb betű és nagyobb gombok, állítható érintési sugár
  (20 / 28 / 36 pt).
- Minden információ hanggal és vizuálisan is (pl. „utolsó 3 deszka” jelzés + hang).

### 1.11 Látvány és hang (kódból generált)
- **Pixeles stílus**, de modern: alacsony belső felbontás (a terep 1 cella = 1 px textúra), *nearest* skálázás,
  világonkénti procedurális anyagminták (determinisztikus zaj, a render rétegben), világos élkiemelés a terep
  peremén, lágy parallax háttér-rétegek, bloom a láván/kristályokon.
- A lények **kódban definiált pixel-sprite-ok** (karakter-tömbökből), ~6 animáció (menet, esés, ásás, építés,
  fúrás, mászás, ernyő, pukkanás előtti remegés, győzelmi ugrás), saját, eredeti dizájn: kerek fejű, levélsapkás
  kis erdei lények – semmilyen elemük nem utal a mintajátékra.
- Hang: Web Audio procedurális SFX (lépés-csipogás, ásás, deszkák növekvő hangmagassággal, pukkanás,
  hazaérés „pling” akkordja), világonként generatív zene (2–3 sáv, tempó a sebességgel arányos). Hangerők
  külön állíthatók. Haptika: Capacitor Haptics a `platform` mögött.

### 1.12 Nyelvek
EN + HU az 1.0-ban (i18n), később DE, ES, PT-BR, JA. Pályacímek: beépített pályák fordítottak, közösségi
pályák címe a szerző nyelvén marad.

---

## 2. Üzleti modell

> A `/home/user/orchestrator/docs/monetization-research-2026-10.md` ajánlását követi („tartalomintenzív puzzle /
> Lemmings-szerű” sor): ingyenes, teljes értékű mag + egyszeri, nem fogyó feloldás + opcionális supporter.
> Cél a **minél több játékos**, nem a bevétel.

**Ingyenes letöltés + egy egyszeri, nem fogyó (non-consumable) IAP: „Teljes játék” – 2,99 USD** (felső határ
3,99 USD; Apple/Google regionális árajánlás elfogadva, feltörekvő piacokon kézzel lejjebb). A feloldás
**minden jövőbeli frissítést tartalmaz** (új világok, bónuszpályák). Nincs reklám, nincs energia, nincs valuta,
nincs fogyóeszköz, nincs előfizetés, nincs fizetős erő/tipp.

| Ingyenes (örökre, korlátlanul újrajátszható) | Teljes játék (egyszeri 2,99 USD) |
|---|---|
| **30 kampánypálya**: az 1. világ (20, benne az oktatás) + a 2. világ első 10 pályája (~27% a 110 pályás 1.0 tartalomból) | a 2. világ 11–20. pályája, 3–4. világ (50 pálya) |
| **Napi pálya** (a mai nap pályája) | Bónuszkészlet (30 pálya) teljes archívumként + napi pálya-archívum |
| **Pályaszerkesztő, minden eszközzel és objektummal** | Jövőbeli világok és pályacsomagok (1.1+) további vásárlás nélkül |
| **Bármely megosztott pályakód lejátszása** | |
| Visszatekerés, tippek, megoldás-visszajátszás, minden akadálymentességi opció | |

**Opcionális „Supporter” (tip jar):** 1 db nem fogyó IAP (2,99 USD), csak kozmetika (pl. arany levélsapka a
lényeknek + „Támogató” jelölés a szerzőnévnél a pályakódban), semmi játékmenetbeli előny; a Beállításokban és
a „Köszönjük” képernyőn érhető el, soha nem felugróként. Az összes lehetséges költés így max. ~6 USD (Polytopia-elv).

**Miért nem riaszt el:**
- Az ingyenes rész önmagában lezárt, teljes élmény (kb. 3–4 óra kampány + napi pálya + végtelen közösségi
  tartalom), és a végén sem zár ki: minden ingyenes pálya újrajátszható.
- A szerkesztőben **minden objektum ingyenes**, és bármely kód lejátszható – különben a fizető szerzők pályáit az
  ingyenes játékosok nem tudnák lejátszani, ami a megosztást (a fő növekedési csatornát) ölné meg.
- Előre deklarált kapu: a store-leírás **első sora** kimondja: „Ingyenesen játszható – 30 pálya, napi pálya és a
  teljes pályaszerkesztő ingyen; a teljes játék egyszeri 2,99 $-os vásárlás. Reklám és adatgyűjtés nélkül.”
  A játékban a világtérképen a zárt pályák lakat + ár jelöléssel látszanak az első perctől.
- A vásárlást csak két nyugodt helyen ajánljuk: a 2. világ 10. pályája után (egyszer, „Később” gombbal) és a
  menüben; nincs időkorlátos „akció”, nincs játék közbeni felugró.
- **Kerüljük a „Lite”, „Demo”, „Trial” szavakat** (Apple 2.2) – az app teljes app, IAP-feloldással.
- Kötelező: **„Vásárlások visszaállítása”** gomb (Beállítások + paywall), **iOS Family Sharing bekapcsolva**.
- **„Data Not Collected”** privacy label: nincs analitika-, crash-riport- vagy reklám-SDK (Firebase/Crashlytics
  sem); a RevenueCat csak a vásárlás-ellenőrzéshez kell, anonim app-user-id-vel – az M9 privacy-válaszokban
  ennek pontos besorolását ellenőrizni kell (Swaplight `docs/store-privacy-answers.md` mintájára).
- Technika: RevenueCat a `Purchases` interfész mögött (web/dev mock), entitlementek: `full_game`, `supporter`.

---

## 3. Technikai terv

### 3.1 Stack
Vite + TypeScript (strict) · PixiJS v8 · Preact (DOM UI) · Capacitor 8 (iOS/Android) · Vitest · Playwright.
Tömörítés: `fflate` (kicsi, tisztán JS, determinisztikus kimenet; nem a böngésző `CompressionStream`-je).
Minden eszköz a Swaplightból/Craterpultból bevált beállításokkal (ESLint flat config, CI workflow-k, `scripts/`).

### 3.2 Modulok
```
src/
  core/        # tiszta, determinisztikus – NINCS DOM/Pixi, NINCS Math.random/Date.now, NINCS float a sim-állapotban
    terrain.ts      # Uint8Array maszk + anyagok, carve/fill, dirty-rect (Craterpult terrain.ts mintájára)
    raster.ts       # szerkesztő-műveletek → terep (egész számos téglalap/kör/rámpa/sokszög/bélyeg/ecset)
    creature.ts     # lény-állapotgép (walk, fall, climb, glide, dig, build, bash, mine, block, pop, exit, die)
    skills/         # képességenként egy modul, közös interfész (canAssign, start, tick)
    objects.ts      # bejárat, kijárat, víz/láva, csapda, teleport, ugrópárna
    level.ts        # pályadefiníció típusai + validáció
    sim.ts          # tick-hurok, input-parancsok, eseményfolyam (spawned, saved, died, skillAssigned, terrainChanged…)
    replay.ts       # input log, állapot-hash, kulcskockák, visszatekerés (újraszimulálás)
    levelcode.ts    # bináris kódolás/dekódolás, CRC32, base64url, verziózás
    rng.ts          # seedelt PRNG (napi pálya választás)
  levels/      # beépített pályák (JSON műveletlista + referencia-megoldás), világonként
  render/      # Pixi: terep-textúra dirty-rect frissítéssel, lény-sprite-ok, objektumok, effektek, kamera
  input/       # okos kijelölés, lupe, pásztázás/zoom, gyorsbillentyűk (web)
  editor/      # szerkesztő állapot (műveletlista, undo/redo), eszközök – UI a ui/editor alatt
  audio/       # Web Audio SFX + generatív zene
  game/        # módok összekötése: kampány, tesztjáték, kódos pálya, napi pálya; mentés-állapot
  ui/          # Preact: menük, HUD, képességsor, szerkesztő-panelek, paywall
  platform/    # Capacitor wrapper: storage, haptics, IAP, clipboard, share, lifecycle, deep link – web mockkal
  i18n/        # EN + HU
  main.ts
scripts/       # make-assets (ikon/splash), store-frames (screenshotok), validate-levels (CI)
tests/unit, tests/e2e
android/, ios/
```

**Terep-minta újrahasznosítása:** a Craterpult `src/core/terrain.ts` (bájtmaszk, `materialAt`, `fillCircle`,
`fillRect`, `carveCircle` → érintett `Rect` a dirty-rect renderhez) szinte változatlanul átvehető; bővítés:
egyirányú/morzsalék anyagok, „építés” (deszka-pixelek írása csak levegőbe), anyagfüggő ásási sebesség.
A Craterpult fixpontos matekja itt nem kell (minden mozgás egész pixel/tick).

### 3.3 Adatformátumok
**Pályadefiníció (belső, JSON a `src/levels`-ben):**
`{ v, id, title, author, theme, w, h, ops:[…], objects:[…], creatures, required, master, frugal, skills:{…},
timeLimitTicks, minReleaseTicks, hints:[…], solution:{ log:[…], releaseChanges:[…], finalHash } }`

**Pályakód (`PL1-…`), bináris, majd `deflate-raw` (fflate, level 9) + base64url:**
| Mező | Méret |
|---|---|
| magic + formátumverzió | 2 B |
| szimulációs motor verzió (`SIM_VERSION`) | 1 B |
| szélesség/magasság (÷16), téma, lényszám, szükséges, mester, takarékos, időkorlát, min. ütem | ~10 B |
| képességkészlet (8 × 1 B) | 8 B |
| cím + szerző (UTF-8, hossz-előtaggal) | ≤ 64 B |
| műveletlista (varint + delta kódolás: típus, anyag, koordináták, méret/pontok) | változó |
| objektumlista | változó |
| megoldás: input log (delta tick varint, lény-id varint, képesség 3 bit) + kiadási-ütem változások | változó |
| a megoldás végi állapot-hash (32 bit) | 4 B |
| CRC32 a teljes tartalomra | 4 B |
- Célméret: tipikus pálya ≤ 1 KB tömörítve (≈ 1 400 karakter), kemény limit 4 KB (≈ 5 500 karakter).
- **Validálás betöltéskor:** CRC → dekódolás → raszterizálás → megoldás visszajátszása (headless, gyorsítva) →
  `saved ≥ required` és `finalHash` egyezik → „ellenőrzött”. Eltérő `SIM_VERSION` esetén a régi motorverziók
  viselkedését a core verzió-kapcsolókkal őrzi meg, vagy (ha nem lehetséges) „régebbi verzióból” jelölést kap.
- Mentés: `@capacitor/preferences` (weben localStorage), verziózott séma migrációval; a saját pályák
  kódformátumban tárolódnak (egyszerű export/import).

### 3.4 Determinizmus
- Csak egész aritmetika a magban; iterációs sorrend rögzített (lények id szerint, objektumok definíciós sorrendben).
- A raszterizáló is a core része (egész Bresenham/kitöltés) – a pályakód ugyanazt a terepet adja minden
  platformon. Unit teszt: arany hash-ek a raszterizálóra és 10 referencia-megoldásra; CI-ben minden beépített
  pálya megoldása lefut (`scripts/validate-levels`).
- **`SIM_VERSION` szabály:** bármely viselkedés-változás a magban → verzió növelés + arany hash-ek frissítése
  + az összes beépített megoldás újravalidálása. Kiadott verzió után a régi viselkedés megtartandó (megosztott
  kódok miatt).

### 3.5 Teljesítmény
- Max. 100 lény, max. 640×960 terep (614 KB). Tick költség cél: < 0,5 ms közepes Androidon → 4× gyorsítás is
  bőven 60 FPS.
- Terep-textúra: dirty-rect részleges feltöltés (Pixi `Texture` + `BufferImageSource` frissítés), max. 1 feltöltés
  képkockánként összevont téglalappal.
- Visszatekerés: kulcskocka 1 mp-enként (terep: csak az előző kulcskockához képesti diff, RLE), lények tömbje
  másolva; visszaugrás = legközelebbi kulcskocka + ≤ 59 tick újraszimulálás. Memória cél: < 30 MB egy 10 perces
  pályán.
- Megoldás-validálás headless: egy 5 perces pálya (18 000 tick) < 300 ms.

### 3.6 Kockázatok
| Kockázat | Hatás | Kezelés |
|---|---|---|
| **Touch-pontosság kis lényeken** | a műfaj mobilon ezen bukik | okos kijelölés + előzetes kiemelés + lupe + irányszűrő + auto-szünet; korai Playwright-szkriptelt és kézi tesztek, M2-ben mérhető cél |
| **Pályadizájn-mennyiség és minőség** (80 + 30 jó pálya) | a játék értéke ezen múlik | szerkesztő korán (M4), pályák a saját eszközzel, nehézség-címke, CI-validált megoldás, review-agent játszik |
| **Determinizmus / motorverziók** (megosztott kódok törése frissítéskor) | közösségi pályák elvesznek | `SIM_VERSION`, arany hash-ek, minden kódban a megoldás → regresszió azonnal kiderül |
| Védjegy/IP | store-elutasítás | eredeti név, lények, képességnevek; a mintajáték neve sehol (store-szöveg, kulcsszó sem) |
| Kódméret | túl hosszú kód kellemetlen | műveletlista-alapú terep, limit + méretjelző a szerkesztőben |
| Webview-teljesítmény régi Androidon | akadozás | 1× belső felbontás, dirty-rect, részecske-limit, perf-teszt M7-ben |

### 3.7 Tudatosan 1.1-re hagyva
Online pályaböngésző (feltöltés, értékelés, kiemelés, moderáció – backend, pl. Supabase), QR-kód, online napi
ranglista, fekvő mód, 5. világ, új objektumok (szalag, kapcsoló/ajtó, szél), kihívás-pályák, további nyelvek,
iCloud/Google mentés-szinkron.

---

## 4. Mérföldkövek

| # | Mérföldkő | Tartalom | Kész, ha… |
|---|---|---|---|
| M0 | Alapozás | scaffold, lint, teszt, CI | check/build/e2e zöld |
| M1 | Mag-motor | terep, raszterizáló, lények, 8 képesség, objektumok, sim, replay, hash | determinizmus- és viselkedéstesztek zöldek |
| M2 | Játszható prototípus | render, kamera, okos kijelölés, HUD, 5 tesztpálya | e2e: szkriptelt megoldás → „pálya teljesítve” |
| M3 | Játékélmény | animációk, effektek, hang, haptika, visszatekerés, sebesség | screenshot-review, 60 FPS 100 lénnyel |
| M4 | Szerkesztő + pályakód | szerkesztő, tesztjáték, kódolás/validálás, megosztás | kód oda-vissza + manipulált kód elutasítva |
| M5 | Tartalom | 80 + 30 bónuszpálya, oktatás, tippek, napi pálya | CI-ben mind a 110 megoldás validálódik |
| M6 | Meta & UI | menü, világtérkép, beállítások, mentés, gyűjtemény, EN/HU, akadálymentesség | teljes UI-flow e2e |
| M7 | Mobil héj | Capacitor, ikon/splash, safe area, életciklus, vágólap/share, natív CI | APK/AAB + iOS build zöld |
| M8 | Monetizáció | Purchases interfész, RevenueCat, `full_game` + `supporter`, kapuk, paywall, visszaállítás | mockkal tesztelve |
| M9 | Kiadás-előkészítés | store-szövegek, screenshotok, adatvédelem, QA, 1.0.0 | feltölthető állapot |
| M10 | 1.1 ötletek | online böngésző, QR, fekvő mód… | nem kötelező |

## 5. Munkafolyamat
Az orkesztrátor-playbook (`orchestrator/playbook/PIPELINE.md`) szerint: `docs/TASKS.md` a hiteles feladatlista;
feladatonként builder-agent → ellenőrzés (check/build/e2e/screenshot) → review → commit + push.
A tulajdonostól a végén kell: Apple/Google fejlesztői fiók, aláíró kulcsok GitHub secretként, RevenueCat fiók
és a `full_game` + `supporter` termék a két store-ban, a `DanielArpadfalvi/Pathlings` repó létrehozása.
