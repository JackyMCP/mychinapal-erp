# Panel Przetargów — plan modułu (research + specyfikacja)

*Dokument roboczy, planowanie przed budową. Ostatnia aktualizacja: lipiec 2026.*

## 1. Punkt wyjścia — poprawiony profil firmy

Wcześniej błędnie założyłem, że core biznesem MyChinaPal są domki modułowe. Po sprawdzeniu mychinapal.pl to nieprawda — realny profil firmy to:

- **OZE / energetyka**: magazyny energii (BESS) — komercyjne/przemysłowe (systemy kontenerowe, integracja z PV/siecią) i dla budynków/prosumentów (zestawy all-in-one 5–20 kWh); farmy i instalacje fotowoltaiczne (dachy hal, carporty, wielkoskalowe); systemy ładowania EV (AC, DC dużej mocy, huby); przenośne magazyny energii / power station / off-grid; oświetlenie solarne; pompy ciepła; małe turbiny wiatrowe; komponenty (inwertery, PCS, BMS, moduły PV).
- **Maszyny**: CNC/obrabiarki do metalu, maszyny do drewna/mebli, przetwórstwo tworzyw sztucznych, systemy laserowe (cięcie/znakowanie/grawerowanie), kompaktowe maszyny budowlane/drogowe, przemysłowe drukarki 3D, automatyka/robotyka przemysłowa, maszyny i linie pakujące, maszyny rolnicze/ogrodnicze, maszyny do recyklingu, linie produkcyjne.
- **Ogólny import na zamówienie** — praktycznie dowolna kategoria, plus dotychczasowe kanały (armatura, dom i ogród, elektronika, e-commerce).

Ten profil jest podstawą do budowy silnika dopasowania przetargów (sekcja 3).

## 2. Co opłaca się importować z Chin pod przetargi — analiza rynku

### 2.1. Kategorie z realnym popytem w polskich zamówieniach publicznych

Sprawdziłem rzeczywiste przetargi i newsy branżowe (nie tylko teorię):

- **BESS / magazyny energii** — bardzo aktywny rynek. Przykłady z 2025/2026: gminne przetargi na "dostawę i montaż magazynów energii elektrycznej dla mieszkańców" (np. Gmina Koziegłowy), przemysłowe BESS finansowane z NFOŚiGW (program 1.15 "Transformacja energetyczna"), oraz duże projekty grid-scale (Greenvolt–BYD w Siedlcach, 600 MW/2,4 GWh; PGE Gryfino, do 400 MW/800 MWh). To pokazuje, że **skala popytu jest ogromna, ale dzieli się na dwie zupełnie różne ligi** — patrz ryzyko "local content" niżej.
- **Fotowoltaika komercyjna/gminna** — cło antydumpingowe na panele PV zostało zniesione przez UE, więc to bezpieczna, aktywnie kupowana kategoria (dachy urzędów, szkół, oczyszczalni, hal produkcyjnych).
- **Stacje ładowania EV** — gminy i spółki komunalne regularnie kupują ładowarki AC/DC (parkingi publiczne, floty, MZK) — częste, średniej wartości przetargi.
- **Maszyny i urządzenia przemysłowe** — szkoły zawodowe/branżowe, warsztaty, spółki komunalne (np. maszyny do utrzymania dróg, recyklingu, obróbki) regularnie kupują sprzęt przez przetargi — mniejsza rozpoznawalność medialna niż BESS, ale bardzo regularny wolumen.
- **Pompy ciepła** — masowo kupowane przez gminy w programach termomodernizacji budynków publicznych.

### 2.2. Kategorie ryzykowne (cła antydumpingowe) — do unikania lub jawnego flagowania

Sprawdziłem aktualne stawki: **stal i wyroby stalowe** mają cła antydumpingowe 50,3–66,4% (28 z 52 unijnych środków ochronnych dotyczy Chin), **profile aluminiowe** 21,2–32,1%, do tego **rowery elektryczne**, **ceramika wykończeniowa**, **folia aluminiowa**. Te kategorie należy z automatu oznaczać w systemie jako wysokiego ryzyka, niezależnie od tego, czy przetarg wygląda atrakcyjnie.

**Panele fotowoltaiczne — dobra wiadomość**: cło antydumpingowe zostało zniesione i nie przedłużone, więc to już bezpieczna kategoria (w przeciwieństwie do stanu sprzed paru lat).

### 2.3. Ryzyko "local content" / TSUE — realne dla DUŻYCH przetargów energetycznych

To ważne odkrycie z researchu: w marcu 2026 PGE **wykluczyło z przetargu na magazyn energii w Gryfinie** (do 400 MW / 800 MWh) konsorcjum z udziałem chińskiej spółki Jiangsu Linyang Energy Storage Technology. Artykuł branżowy (WysokieNapiecie.pl) tłumaczy to głównie skutkami **wyroku TSUE**, a nie jeszcze formalną polityką "local content" rządu — ale efekt jest ten sam: **duże przetargi na infrastrukturę sieciową dla spółek Skarbu Państwa (PGE, PSE, Tauron, Enea, Energa) niosą realne ryzyko wykluczenia ofert z chińskim pochodzeniem sprzętu**, szczególnie przy skali grid-scale (dziesiątki/setki MW).

To ryzyko **nie dotyczy** mniejszych przetargów gminnych/komercyjnych (magazyny 5–20 kWh dla mieszkańców, kontenerowe BESS 1–5 MW dla firm prywatnych, PV na dachach, stacje ładowania, maszyny) — to zdecydowana większość tego, czym realnie zajmuje się MyChinaPal. System powinien to rozróżniać automatycznie (patrz `risk_flags` w schemacie niżej): flaga "ryzyko local content" pojawia się tylko przy bardzo dużych przetargach energetycznych ze spółkami Skarbu Państwa jako zamawiającym.

### 2.4. Wolumen rynku — czy 5-10 przetargów dziennie >100 000 zł jest realne

W Polsce publikowanych jest **ponad 2000 nowych ogłoszeń przetargowych dziennie w dni robocze** (509 185 ogłoszeń w całym 2025 roku, wzrost 14,6% rok do roku). Przy dobrze zbudowanym filtrze kodów CPV + słów kluczowych + progu wartości 100 000 zł, znalezienie 5–10 trafionych ogłoszeń dziennie w niszy BESS/OZE/maszyny/import ogólny jest w pełni realistyczne — to bardzo mały wycinek ogromnego strumienia danych.

## 2.5. Drugi model biznesowy: towary standaryzowane — "wyceń raz, wyślij do wielu przetargów"

BESS i maszyny to projekty **bespoke** — każdy przetarg ma inną specyfikację, więc wymaga osobnej wyceny. Jest jednak druga, uzupełniająca ścieżka: **towary standaryzowane (komodytyzowane)**, gdzie ten sam produkt o tej samej specyfikacji pasuje do dziesiątek/setek różnych ogłoszeń — tu naprawdę można przygotować jedną wycenę/katalog i składać oferty seryjnie. Sprawdziłem realny wolumen kilku takich kategorii:

- **Wyposażenie medyczne jednorazowe (rękawiczki, maseczki, fartuchy, przyłbice, środki dezynfekcyjne)** — bardzo częsta i regularna kategoria: szpitale, DPS-y, szkoły kupują to stale (znalazłem aktualne ogłoszenia z lipca 2026 z Legionowa, Milicza, Łodzi, Katowic, Gdańska, Wrocławia — to tylko wycinek). Kluczowe zastrzeżenie: rękawiczki/maseczki **medyczne** wymagają oznaczenia zgodnego z unijnym rozporządzeniem o wyrobach medycznych (MDR) lub o środkach ochrony indywidualnej (PPE 2016/425) — trzeba dopilnować, żeby dostawca miał certyfikat CE we właściwej klasie. To standardowy, znany wymóg (nie bariera nie do przejścia), ale system powinien to weryfikować per-produkt w katalogu.
- **Sprzęt komputerowy dla szkół/urzędów (laptopy, tablety, monitory, projektory, tablice interaktywne)** — ogromny, systemowy popyt napędzany programami rządowymi/KPO. Konkretny przykład: przetarg Ministerstwa Cyfryzacji na **735 000 laptopów/tabletów za ~1,7 mld zł**, rozbity na **73 osobne części regionalne (NUTS3)** — to podręcznikowy przykład modelu "jedna specyfikacja, wiele powtarzalnych zamówień". Do tego dochodzi stały strumień mniejszych przetargów "Cyfrowa Gmina" w pojedynczych gminach.
- **Meble (szkolne, biurowe, medyczne)** — potwierdzony realny wolumen: Atlas Przetargów notuje **21 830 ogłoszeń w tej branży, ok. 484 miesięcznie (~5 800 rocznie)**. Uwaga: część przetargów łączy dostawę z montażem — dla modelu "gotowa wycena" najlepiej pasują te czysto "dostawa" (bez usług na miejscu).
- **Odzież robocza i BHP (odzież ochronna, obuwie, rękawice robocze, kaski, środki ochrony indywidualnej)** — regularne, cykliczne zamówienia (urzędy, zakłady komunalne, spółki jak PGNiG, instytuty badawcze) — bardzo powtarzalne specyfikacje z roku na rok.
- **Wyposażenie placów zabaw i siłowni zewnętrznych** — regularne przetargi gminne; jeden z dostawców w samym 2014 roku wygrał 118 przetargów w tej branży, co dobrze pokazuje skalę powtarzalności. Zwykle łączy dostawę z montażem (mała architektura), ale sam sprzęt (urządzenia zabawowe, siłownie plenerowe) można sourcingować z Chin, a montaż podzlecać lokalnie.
- **Sprzęt gastronomiczny dla stołówek szkolnych/szpitalnych** (piece konwekcyjno-parowe, zmywarki przemysłowe, meble ze stali nierdzewnej) — regularna kategoria w modernizacjach stołówek, wymaga oznaczeń CE dla urządzeń gastronomicznych.
- **Oświetlenie uliczne LED** — bardzo częste ogłoszenia (Piotrków Trybunalski, Łącko, Dzikowiec i wiele innych w samym 2026), ale **większość to "budowa/modernizacja" z projektowaniem i montażem, nie czysta dostawa opraw** — słabiej pasuje do modelu "jedna wycena", chyba że uda się namierzyć te nieliczne przetargi na samą dostawę lamp.
- **Systemy monitoringu miejskiego (kamery CCTV)** — regularna kategoria w programach bezpieczeństwa gmin, podobny profil do sprzętu IT.

### Co to oznacza dla systemu

Warto rozdzielić w aplikacji dwa tryby pracy z przetargiem:

1. **Tryb projektowy (BESS/maszyny)** — wycena budowana od zera pod konkretną specyfikację (tak jak dziś działa moduł Wyceny).
2. **Tryb katalogowy (towary standaryzowane)** — firma utrzymuje **katalog produktów gotowych do przetargów**: nazwa, specyfikacja, kod CN/HS (zweryfikowany raz przez ISZTAR), certyfikat CE/MDR, cena jednostkowa, czas dostawy. Gdy system znajdzie pasujący przetarg, automatycznie proponuje dopasowanie z katalogu i generuje gotową ofertę w kilka sekund zamiast liczyć wszystko od nowa — to jest właśnie mechanizm "wyceniamy raz, wysyłamy do wielu ogłoszeń".

## 3. Źródła danych

Zgodnie z ustaleniami: **polskie przetargi publiczne + prywatne zapytania ofertowe** (bez TED/UE na razie).

| Źródło | Co daje | Dostęp |
|---|---|---|
| **e-Zamówienia / BZP** (Urząd Zamówień Publicznych) | Wszystkie krajowe przetargi publiczne (gminy, spółki Skarbu Państwa, urzędy) | Oficjalne API REST (OAuth2 Client Credentials, wymaga rejestracji jako integrator) — dokumentacja na ezamowienia.gov.pl/pl/integracja/ |
| **dane.gov.pl** (Otwarte Dane) | Ten sam zbiór ogłoszeń BZP, bez uwierzytelniania | Prostszy start, ale wolniejsze aktualizacje niż API |
| **Baza Konkurencyjności** (funduszeeuropejskie.gov.pl) | Zapytania ofertowe firm PRYWATNYCH realizujących projekty z dotacją UE (bardzo częste przy zakupach BESS/PV/maszyn — to jest nasza "prywatna" część zakresu) | Publiczny, bez uwierzytelniania |

Rekomendacja: zacząć od **dane.gov.pl + Baza Konkurencyjności** (brak biurokracji rejestracyjnej, szybki start), a po walidacji pomysłu wdrożyć oficjalne API e-Zamówienia dla świeższych/pełniejszych danych.

## 4. Architektura techniczna

### 4.1. Schemat bazy (Supabase / Postgres)

```sql
-- Konfiguracja dopasowania (profil firmy) — edytowalna w Ustawieniach
tender_profile (
  id, cpv_codes text[], keywords text[], excluded_keywords text[],
  min_value numeric default 100000, buyer_type_blocklist text[], -- np. blokada PGE/PSE dla dużych BESS
  updated_at
)

-- Surowe dopasowane ogłoszenia
tenders (
  id, source text, -- 'bzp' | 'baza_konkurencyjnosci'
  external_id text, title, buyer_name, buyer_type text, -- 'gmina'|'spolka_sp'|'prywatna'|...
  cpv_codes text[], estimated_value numeric, currency,
  submission_deadline timestamptz, published_at timestamptz,
  category text, match_score numeric, -- 0-100, z silnika dopasowania
  risk_flags text[], -- 'clo_antydumpingowe' | 'local_content' | ...
  status text default 'new', -- new|reviewed|applying|submitted|won|lost|ignored
  source_url text, raw_data jsonb,
  created_at
)

tender_documents ( id, tender_id, file_name, storage_path, extracted_text )

tender_ai_analysis (
  id, tender_id, summary text, requirements text[], risks text[],
  evaluation_criteria text, recommended boolean, analyzed_at
)

tender_applications (
  id, tender_id, assigned_to uuid, status text, notes text,
  generated_document_path text, updated_at
)

-- Katalog towarów standaryzowanych (model B — patrz sekcja 2.5): raz
-- zweryfikowany produkt gotowy do automatycznego dopasowania do wielu przetargów
tender_product_catalog (
  id, name, specification text, cn_hs_code text, isztar_checked_at timestamptz,
  ce_mdr_certificate boolean, certificate_notes text,
  unit_price_pln numeric, lead_time_days int, min_order_qty int,
  category text, keywords text[], active boolean default true
)
```

### 4.2. Codzienny pipeline (Edge Function + pg_cron, wzorem `outlook-renew-subscriptions`)

1. **`tenders-daily-sync`** (uruchamiane w nocy, np. 4:00) — pobiera nowe ogłoszenia od ostatniego uruchomienia z BZP/dane.gov.pl i Bazy Konkurencyjności.
2. **Filtr wstępny** — dopasowanie po kodach CPV z `tender_profile` + słowach kluczowych w tytule/opisie + próg `estimated_value >= 100000`.
3. **`tenders-ai-analyze`** — dla każdego dopasowanego ogłoszenia: pobranie dokumentacji (SWZ/specyfikacja), Claude czyta i wyciąga: przedmiot zamówienia, kluczowe wymagania techniczne, kryteria oceny ofert, termin, potencjalne ryzyka. Automatyczne sprawdzenie kodu CN/HS przez już istniejący mechanizm ISZTAR (z modułu Wyceny) — jeśli trafi na kategorię z cłem antydumpingowym, dolicza flagę ryzyka.
4. **Ranking i selekcja top 5–10** — sortowanie po `match_score` i wartości, z odrzuceniem tych z krytycznymi flagami ryzyka (opcjonalnie: pokazane, ale wyraźnie oznaczone).
5. **Powiadomienie poranne** — o 6:30 (dokładnie jak Minerva) trafia do centrum powiadomień w aplikacji + osobny widget na Dashboardzie, wzorem istniejącego systemu zadań/powiadomień.

### 4.3. UI — nowa zakładka "Przetargi" w Sidebarze

- **Lista** — kafelki (jak w Wycenach/Zamówieniach): tytuł, zamawiający, wartość, termin, dopasowanie %, flagi ryzyka kolorowe.
- **Szczegóły przetargu** — pełny opis, wyciągnięte przez AI kluczowe fakty, lista dokumentów z podglądem w aplikacji (już mamy `FilePreviewModal` dla PDF/Excel/Word — zero dodatkowej pracy), link źródłowy.
- **Zgłoszenie/oferta** — przycisk generujący dokument wypełniony danymi firmy (NIP/REGON/KRS z `company_settings`, tak jak przy fakturach/wycenach), z sekcjami pod wymagania z SWZ; edytowalny w przeglądarce (ten sam edytor TipTap co w Wycenach), eksport do docx/PDF.

### 4.4. Ważne zastrzeżenie prawne

Złożenie **wiążącej** oferty w polskim przetargu publicznym wymaga podpisu kwalifikowanego/zaufanego i przejścia przez oficjalny portal (miniPortal/Platforma e-Zamówienia). Aplikacja może w pełni zautomatyzować **przygotowanie** kompletnego dokumentu oferty — ale samo **złożenie** musi pozostać ręcznym krokiem osoby z uprawnionym podpisem elektronicznym. To nie jest ograniczenie techniczne, tylko wymóg prawny dotyczący każdego narzędzia tego typu (Minerva też tego nie robi automatycznie).

## 5. Koszt AI (przypomnienie z wcześniejszej rozmowy)

Przy 10–30 dopasowanych przetargach dziennie i pełnej analizie AI dokumentacji: rząd wielkości **40–150 zł/miesiąc** (Sonnet) lub **kilkanaście-kilkadziesiąt zł/miesiąc** (Haiku) — dla użytku jednej firmy to koszt pomijalny względem wartości informacji.

## 6. Sugerowana kolejność budowy (fazowanie)

1. SQL: schemat (`tender_profile`, `tenders`, `tender_documents`, `tender_ai_analysis`, `tender_applications`).
2. Edge function pobierania z **dane.gov.pl + Baza Konkurencyjności** (najprostszy start, bez rejestracji API) + prosty filtr CPV/słowa kluczowe/wartość.
3. UI: lista + szczegóły przetargu (bez AI na start — samo ustrukturyzowane dane z ogłoszenia).
4. Powiadomienie poranne / widget Dashboard.
5. Dołożenie analizy AI (Claude czyta dokumentację, wyciąga fakty, flaguje ryzyka CN/HS przez ISZTAR i "local content").
6. Generator zgłoszenia/oferty (reużycie edytora z Wycen).
7. Opcjonalnie później: rejestracja w oficjalnym API e-Zamówienia dla świeższych danych, rozszerzenie o TED/UE.

---
*Ten dokument to plan do dyskusji, nie ostateczna specyfikacja — nic z tego nie zostało jeszcze zaimplementowane.*
