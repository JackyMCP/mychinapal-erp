# Panel Przetargów — pełna specyfikacja techniczna i plan budowy (v2)

*Dokument roboczy — plan przed budową. v1: lipiec 2026 (profil firmy + wstępna koncepcja). v2 — ten dokument: pogłębiony, zweryfikowany na żywo research realnych API/platform przetargowych, potwierdzony z użytkownikiem zakres kategorii, pełna architektura, UX i plan fazowania. Traktuj to jako "prompt do samego siebie" na moment rozpoczęcia budowy — wszystko poniżej ma być wystarczające, żeby zacząć kodować bez dalszych pytań badawczych.*

## 0. Skrót decyzji podjętych z użytkownikiem (21 lipca 2026)

- **Start fazy 1: tylko Baza Konkurencyjności.** e-Zamówienia i TED wchodzą w fazie 2 — Baza Konkurencyjności jest już w 100% przetestowana na żywo (patrz sekcja 4.1), więc daje najszybszy, najpewniejszy start.
- **Powiadomienia: w samej zakładce Panelu Przetargów, mocno wyeksponowane, z ładnym odznaczaniem** — nie e-mail, nie generyczny push (użytkownik dał mi wolną rękę na pomysł, patrz sekcja 7.2 — Centrum Sygnałów).
- **Codzienny digest o 6:30**, spójnie z istniejącym porannym rytuałem ("Minerva"/brief).
- **Kategorie na start:** maszyny, BESS, sprzęt medyczny (3.1 ogólnie), sprzęt sieciowy/akcesoria (3.2 — ale NIE flagowe komputery/laptopy marek, patrz downgrade z wcześniejszej rundy researchu), edukacja (3.4), odzież BHP (3.5), infrastruktura komunalna (3.6) — **plus nowo zaakceptowane dziś:** oświetlenie solarne uliczne, stacje ładowania EV, pompy ciepła, przemysłowe drukarki 3D, roboty/AGV magazynowe, elektronarzędzia warsztatowe.
- **Wykluczone na pewno:** wyposażenie biurowe (3.3), środki czystości/chemia gospodarcza, systemy monitoringu CCTV, znaki drogowe, sprzęt przeciwpożarowy.
- Użytkownik poprosił też, żebym **sam dopisał kategorie, o których mógł zapomnieć** — patrz sekcja 2.3.

## 1. Profil firmy i model biznesowy (skrót — bez zmian względem v1)

MyChinaPal: import z Chin. Core: **OZE/energetyka** (magazyny energii/BESS, PV, ładowarki EV, pompy ciepła, oświetlenie solarne) i **maszyny** (CNC/obrabiarki, drewno/meble, tworzywa, lasery, roboty/automatyka, linie produkcyjne). Plus ogólny import na zamówienie.

Dwa tryby pracy z przetargiem:
1. **Tryb projektowy** (BESS/maszyny) — wycena od zera pod specyfikację, tak jak dziś działa moduł Wyceny.
2. **Tryb katalogowy** (towary standaryzowane: BHP, sprzęt IT/akcesoria, edukacja, komunalna) — raz zweryfikowany produkt (kod CN/HS, certyfikat CE, cena) automatycznie dopasowywany do wielu ogłoszeń naraz — "wyceń raz, wyślij do wielu przetargów".

## 2. Zakres kategorii — finalna wersja

### 2.1 Tier 1 — priorytet najwyższy

| Kategoria | Uwagi |
|---|---|
| Maszyny przemysłowe | CNC/obrabiarki metalu, drewna, tworzywa, lasery, linie produkcyjne, maszyny rolnicze/ogrodnicze/recyklingu |
| BESS / magazyny energii | Kontenerowe komercyjne, all-in-one 5–20 kWh, przenośne power station. Uwaga: dla bardzo dużych przetargów grid-scale ze spółkami Skarbu Państwa (PGE/PSE/Tauron/Enea) — flaga ryzyka "local content/TSUE" (patrz 2.4 starego researchu, wciąż aktualne) |
| Sprzęt medyczny (3.1, ogólnie) | Urządzenia + materiały/wyposażenie jednorazowe (rękawice/maseczki/fartuchy — pilnować certyfikatu MDR/PPE 2016/425) |
| Sprzęt sieciowy i akcesoria (3.2, węziej niż wcześniej) | Switche, routery, okablowanie, UTM/firewall, akcesoria komputerowe (myszy/klawiatury/stacje dokujące/monitory zwykłe) — **NIE** flagowe laptopy marek (te wygrywają autoryzowani dystrybutorzy, nie niezależni importerzy — ustalone w poprzedniej rundzie) |

### 2.2 Tier 2 — włączone dziś

| Kategoria | Uwagi |
|---|---|
| Edukacja i przedszkola (3.4) | Tablice interaktywne, pracownie STEM, sprzęt sportowy szkolny — napędzane programami rządowymi (Laboratoria Przyszłości, Kompas Jutra, Cyfrowy Uczeń) |
| Odzież BHP (3.5) | Bardzo powtarzalne specyfikacje rok do roku — dobry kandydat do katalogu standaryzowanego |
| Infrastruktura komunalna (3.6) | Kosiarki, sprzęt do utrzymania zieleni |
| Oświetlenie solarne uliczne | **Nowe dziś.** Uwaga z v1: większość przetargów to "budowa/modernizacja" z montażem, nie czysta dostawa — filtrować pod tym kątem |
| Stacje ładowania EV | **Nowe dziś.** Gminy/spółki komunalne, floty, parkingi publiczne — regularny, średniej wartości wolumen |
| Pompy ciepła | **Nowe dziś.** Masowo kupowane w programach termomodernizacji budynków publicznych |
| Przemysłowe drukarki 3D | **Nowe dziś.** Naturalne rozszerzenie kategorii maszyn |
| Roboty/AGV magazynowe | **Nowe dziś.** j.w. |
| Elektronarzędzia warsztatowe | **Nowe dziś.** j.w., często te same przetargi co obrabiarki |

### 2.3 Propozycje dodatkowe ode mnie (do potwierdzenia przy starcie budowy)

Użytkownik poprosił, żebym dopisał, co mogło zostać pominięte. Z dotychczasowego researchu (v1) i profilu firmy, kandydaci z potwierdzonym realnym wolumenem:

- **Meble (szkolne/biurowe/medyczne)** — potwierdzony wolumen: ~21 830 ogłoszeń/rok wg Atlas Przetargów (~484/miesiąc). Filtrować pod kątem "dostawa" bez montażu na miejscu.
- **Wyposażenie medyczne jednorazowe jako osobna podkategoria katalogowa** (rękawice/maseczki/fartuchy/przyłbice/dezynfekcja) — bardzo częste, stałe zamówienia szpitali/DPS/szkół; wart wydzielenia z ogólnego "sprzętu medycznego", bo to inny model sprzedaży (katalogowy, nie projektowy).
- **Sprzęt gastronomiczny nierdzewny** (piece konwekcyjno-parowe, zmywarki przemysłowe, stoły/szafy ze stali nierdzewnej) dla stołówek szkolnych/szpitalnych — regularna kategoria modernizacyjna, wymaga CE gastronomicznego.
- **Regały magazynowe / systemy składowania** — naturalne dopełnienie kategorii AGV/roboty magazynowe.
- **Wyposażenie placów zabaw i siłowni zewnętrznych** — regularne przetargi gminne (jeden dostawca wygrał 118 przetargów w tej branży w jednym roku wg starego researchu) — zwykle dostawa+montaż małej architektury, ale sam sprzęt można sourcingować z Chin.

Rekomendacja: dodać te 5 jako **Tier 3 (obserwacyjne)** od pierwszego dnia silnika dopasowania (tanie: to tylko dodatkowe słowa kluczowe/CPV), nawet jeśli UI na start pokazuje tylko Tier 1+2 domyślnie w filtrach.

### 2.4 Wykluczone na pewno

Wyposażenie biurowe (3.3), środki czystości i chemia gospodarcza, systemy monitoringu CCTV (ryzyko Lex China/DWR — patrz prospekt sekcja 4), znaki drogowe, sprzęt przeciwpożarowy (bariery formalne).

## 3. Kody CPV — zweryfikowane dziś (żywe źródła, lipiec 2026)

| Kategoria | Kody CPV |
|---|---|
| Maszyny/obrabiarki | `42600000-2` Obrabiarki, `42632000-5` Obrabiarki CNC do metalu, `42640000-4` Obrabiarki do tworzyw, `42670000-3` Części/akcesoria do obrabiarek |
| BESS/magazyny energii | `31154000-0` Bezprzestojowe źródła energii (najbliższy odpowiednik — **ale patrz zastrzeżenie niżej**), pomocniczo `31420000-6` Baterie galwaniczne, `51112200-2` Usługi instalowania sprzętu sterowania energią elektryczną |
| Sprzęt medyczny | `33100000-1` Urządzenia medyczne, `33190000-8` Różne urządzenia i produkty medyczne, `33140000-3` Materiały medyczne, `33196000-0` Pomoce medyczne |
| Sprzęt sieciowy | `32420000-3` Urządzenia sieciowe, `32424000-1` Infrastruktura sieciowa |
| Edukacja | `30231320-6` Monitory dotykowe (potwierdzone żywym przykładem dziś — patrz 4.1), dodatkowo szukać w kategorii `39162100` pomoce dydaktyczne |
| Odzież BHP | `18100000-0` Odzież branżowa/specjalna/dodatki, `18110000-3`, `18113000-4`, `18130000-9` |
| Kosiarki/komunalna | `16311000-8` Kosiarki do trawników |

**Ważne zastrzeżenie:** dla nowych/niszowych kategorii (zwłaszcza BESS) zamawiający w praktyce używają **niespójnych kodów CPV** — w realnych przykładach widziałem tenże sam typ zamówienia pod `31154000-0`, `09300000-2` (energia), a nawet bez żadnego dedykowanego kodu, tylko generyczne "roboty budowlane" gdy magazyn energii jest częścią większej instalacji PV. **Wniosek architektoniczny: CPV to filtr wstępny, NIGDY jedyne kryterium — silnik musi łączyć CPV + słowa kluczowe w tytule/treści + (docelowo) klasyfikację AI.** Patrz sekcja 5.

Kody CPV, progi i kursy euro do zamówień publicznych są **rewidowane biennalnie (co 2 lata)** — obecne wartości (progi UE, kurs euro 4,31) obowiązują na lata 2026–2027. To trzeba odświeżyć w systemie na przełomie 2027/2028.

## 4. Źródła danych — zweryfikowany na żywo stan na 21.07.2026

### 4.1 Baza Konkurencyjności — ŹRÓDŁO FAZY 1, w pełni przetestowane

Baza: `bazakonkurencyjnosci.funduszeeuropejskie.gov.pl`. Zapytania ofertowe firm prywatnych realizujących projekty z dotacją UE, próg **80 000 zł netto** (zasada konkurencyjności, próg podniesiony z 50 000 zł 25.03.2025 — bez zmian od poprzedniego researchu).

**Publiczne, nieautoryzowane REST API — potwierdzone dziś trzema żywymi zapytaniami:**

1. **Wyszukiwanie** (potwierdzone, zwraca poprawny JSON):
   ```
   GET /api/announcements/search?page=1&limit=N&sort=default&query=...&status[0]=PUBLISHED
   ```
   Zwraca `data.advertisements[]` (id, title, content — skrót, advertiser_name, publication_date, submission_deadline, fulfillment_place, favorite) + `data.meta.total` (dokładna liczba wyników — dziś: 1168 aktywnych ogłoszeń ogółem, 436 dla frazy "dostawa sprzętu").

2. **Szczegóły pojedynczego ogłoszenia** (NOWO potwierdzone dziś — nie było w v1):
   ```
   GET /api/announcements/{id}
   ```
   Zwraca KOMPLETNE dane: pełny tytuł, `order_items[].cpv_items[]` (kody CPV), `estimated_value`, `warranty_period`, `participation_conditions[]` (warunki udziału — kluczowe dla oceny barier formalnych!), `evaluation_criteria[]` (kryteria oceny ofert z wagami), `fulfillment_places[]`, `contact_persons[]`, `terms_of_contract_change`, **`attachments[]`** (lista załączników z metadanymi).

3. **Pobieranie załączników** (NOWO potwierdzone dziś, żywy przykład):
   ```
   GET /api/files/{file_id}
   ```
   Sprawdzone na realnym ogłoszeniu z dziś (id 285084, "DOSTAWA MONITORÓW INTERAKTYWNYCH", Stowarzyszenie Dobra Edukacja, wartość 84 000 zł, CPV `30231320-6`) — 4 załączniki: Zapytanie ofertowe (PDF), Formularz ofertowy (XLSX), Oświadczenie o warunkach (PDF), Wzór umowy (PDF). **To otwiera drogę do pełnej automatycznej ekstrakcji AI (sekcja 5, warstwa 4) — możemy pobrać i przeanalizować każdy dokument programowo, bez ręcznego wchodzenia na stronę.**

**Limity/throttling:** brak oficjalnie udokumentowanych limitów zapytań — rekomendacja: polling co 15–30 minut, żądania sekwencyjne z ~300–500ms odstępu (uprzejmość wobec publicznej infrastruktury rządowej, nie tylko dla uniknięcia blokady).

### 4.2 e-Zamówienia / BZP — ŹRÓDŁO FAZY 2

**Istotna korekta względem v1** (tam błędnie napisałem, że wymaga rejestracji integratora): platforma oficjalnie deklaruje wprost (ezamowienia.gov.pl/pl/integracja/):

> *"Odczyt ogłoszeń i statystyk dot. ogłoszeń krajowych publikowanych w BZP **nie wymaga przejścia procedury integracyjnej**. Informacje z BZP udostępnione są przez API dostępne pod adresem: `ezamowienia.gov.pl/mo-board/api/v1/notice`."*

Znalazłem też potwierdzony wzorzec pobierania pojedynczego ogłoszenia jako PDF: `mo-board/api/v1/Board/GetNoticePdfById?noticeId={guid}`. Pełna dokumentacja dokładnych parametrów zapytań (paginacja, filtrowanie po CPV/dacie/progu) jest w **Załączniku 3 – Instrukcja integracji z API BZP** (plik ZIP, `media.ezamowienia.gov.pl/pod/2022/08/Zalącznik-3-Instrukcja-integracji-z-API-BZP.zip`) — **pierwszy konkretny krok fazy 2: pobrać i przeczytać ten ZIP przed pisaniem kodu integracji**, żeby nie zgadywać nazw parametrów.

Pozostałe API platformy (MO/PP/MMIA/CRD — publikowanie ogłoszeń, plany postępowań, sprawozdania) wymagają pełnej procedury integracyjnej z testami — **nie są nam potrzebne** (tylko odczyt, nie publikujemy niczego na platformie).

**Próg ustawy Pzp od 1.01.2026:** 170 000 zł (podniesiony z ok. 130 000 zł).

### 4.3 TED (Tenders Electronic Daily) — opcjonalne, faza 2/3

Dla bardzo dużych przetargów (BESS grid-scale, duże kontrakty szpitalne) powyżej progów unijnych, które trafiają też do TED oprócz BZP. **Potwierdzone: anonimowy odczyt bez uwierzytelnienia**, dokumentacja `docs.ted.europa.eu`, wszystkie endpointy w `api.ted.europa.eu/swagger`.

**Progi unijne 2026–2027** (kurs euro 4,31 zł, rewidowane co 2 lata):
- Roboty budowlane: 5 404 000 € (23 291 240 zł)
- Dostawy/usługi, administracja centralna: 140 000 € (603 400 zł)
- Dostawy/usługi, poniżej szczebla centralnego (gminy, spółki komunalne — **to nasz główny segment**): 216 000 € (930 960 zł)
- Usługi społeczne: 750 000 € (3 232 500 zł)

Warto dodać w fazie 2/3 głównie dla monitorowania **dużych BESS/kontraktów szpitalnych** (powyżej ~930 tys. zł) — mniejsze przetargi komunalne i tak nie osiągają progu unijnego i żyją tylko w BZP.

### 4.4 Inne platformy zakupowe — faza 3+, opcjonalnie

Pogłębiony dziś research pokazał, że **znaczna część polskiego rynku przetargowego (zwłaszcza sektor prywatny/komunalny) w ogóle nie przechodzi przez BZP ani Bazę Konkurencyjności**, tylko przez komercyjne platformy zakupowe:

| Platforma | Skala | API/dostęp | Ocena |
|---|---|---|---|
| **platformazakupowa.pl** (Open Nexus) | Największa — firma deklaruje ok. 1/3 wszystkich polskich przetargów, >3200 klientów instytucjonalnych | Brak publicznego API. `robots.txt`: dozwolone crawlowanie, ale **`Crawl-delay: 900`** (15 min między żądaniami) — twardy sygnał prawny/techniczny. Nowy regulamin od 10.12.2025 — **do sprawdzenia prawnie przed scrapowaniem**. | Najwyższy priorytet wg skali rynku, ale wymaga wolnego, uprzejmego crawlera zgodnego z Crawl-delay — realistycznie da się zbierać tylko ograniczoną liczbę stron dziennie |
| **Marketplanet OnePlace / eZamawiający** | Ministerstwa, agencje, szpitale — każdy zamawiający ma osobną subdomenę | `robots.txt` permisywny, pełny sitemap | Technicznie łatwe do scrapowania, ale architektonicznie trudniejsze (trzeba enumerować dziesiątki subdomen zamiast jednego źródła) |
| **SmartPZP** | Sieci szpitalne/podmioty lecznicze (istotne dla kategorii medycznej!) | Nieznane, do zbadania w fazie 3 | Priorytet jeśli kategoria medyczna okaże się zbyt uboga z Bazy Konkurencyjności/BZP |
| **Logintrade** | Przemysł/energetyka (Orlen, JSW, Grupa Azoty) — pasuje do profilu maszyn/BESS | Brak API, per-klient instancje | Niski priorytet, obserwacyjnie |
| **e-ProPublico** | Uczelnie/instytucje akademickie | Brak API | Niski priorytet, chyba że kategoria edukacyjna z uczelni stanie się ważna |

**Agregatorzy płatni** (Ofertis, SellWith, Atlas Przetargów, BZP Monitor/Klevio) już monitorują zbiorczo BZP+TED — mogą być **tanim stopgapem na czas budowy własnego silnika**, ale generalnie NIE indeksują głęboko dokumentacji z platform powyżej (to jest realna luka rynkowa/przewaga, którą możemy zbudować).

**Rekomendacja fazowania źródeł:** Faza 1 = Baza Konkurencyjności. Faza 2 = + e-Zamówienia/BZP. Faza 3 = + TED (dla progu >930k zł) + ocena czy platformazakupowa.pl/SmartPZP wnoszą wystarczająco dużo unikalnego wolumenu żeby uzasadnić scraper.

## 5. Silnik dopasowania — 4 warstwy ("panel musi sprawdzać wszystko")

1. **Warstwa 1 — CPV whitelist.** Szybki, tani filtr wstępny na podstawie tabeli z sekcji 3. Nie odrzuca ostatecznie — tylko przyspiesza pierwsze sito.
2. **Warstwa 2 — słowa kluczowe (tytuł + treść).** Lista synonimów PL per kategoria + **lista słów wykluczających** (np. "monitoring" w kontekście CCTV ma być odrzucane, "czyszczenie"/"środki czystości" ma być odrzucane nawet jeśli inne słowo pasuje). Edytowalna w Ustawieniach (tabela `tender_profile`), żeby zespół mógł samodzielnie dostrajać bez zmiany kodu.
3. **Warstwa 3 — klasyfikacja AI (Claude).** Dla ogłoszeń, które przeszły warstwy 1–2, ale są niejednoznaczne (np. CPV pasuje, ale tytuł brzmi ogólnie) — Claude ocenia dopasowanie 0–100, przypisuje kategorię z listy w sekcji 2, i **krótko uzasadnia dlaczego** (widoczne w karcie przetargu — buduje zaufanie do systemu zamiast być czarną skrzynką).
4. **Warstwa 4 — ekstrakcja warunków z załączników.** Dla ogłoszeń zakwalifikowanych (score powyżej progu) — pobranie załączników (patrz 4.1, `/api/files/{id}`), przekazanie do Claude z promptem ekstrakcyjnym, wyciągnięcie ustrukturyzowanie:
   - termin składania ofert, planowany termin podpisania umowy,
   - **warunki udziału** (referencje, doświadczenie, potencjał finansowy, wadium) → automatyczna flaga "bariery formalne: niskie/średnie/wysokie" (dokładnie to, co użytkownik kazał sprawdzać w poprzedniej rundzie przy komputerach/znakach drogowych/ppoż),
   - kryteria oceny ofert (cena vs. jakość — % wagi),
   - okres gwarancji, kary umowne,
   - waluta rozliczenia,
   - czy jest wzmianka o wymogu pochodzenia UE / "dostawca wysokiego ryzyka" (Lex China — istotne dla kategorii sieciowej, patrz prospekt sekcja 4),
   - automatyczne sprawdzenie kodu CN/HS przez już istniejący mechanizm ISZTAR (z modułu Wyceny) — jeśli kategoria produktu ma cło antydumpingowe, dolicza flagę ryzyka (stal, aluminium, rowery elektryczne, ceramika — z v1).

## 6. Architektura techniczna

### 6.1 Schemat SQL (Supabase/Postgres) — v2, rozszerzony

```sql
-- Konfiguracja silnika dopasowania — edytowalna w Ustawieniach przez zespół,
-- bez potrzeby zmiany kodu przy dostrajaniu.
tender_profile (
  id, category text, -- z listy w sekcji 2
  cpv_codes text[], keywords text[], excluded_keywords text[],
  tier smallint, -- 1|2|3
  active boolean default true,
  updated_at, updated_by uuid
)

-- Surowe/dopasowane ogłoszenia, wspólne dla wszystkich źródeł
tenders (
  id uuid primary key default gen_random_uuid(),
  source text not null, -- 'baza_konkurencyjnosci' | 'bzp' | 'ted' (faza 2/3)
  external_id text not null, -- np. numer ogłoszenia w źródle
  source_url text,
  title text, buyer_name text, buyer_nip text,
  cpv_codes text[], estimated_value numeric, currency text default 'PLN',
  submission_deadline timestamptz, publication_date timestamptz,
  fulfillment_place text,
  category text, match_score numeric, match_reasoning text, -- warstwa 3
  formal_barrier_level text, -- 'niskie'|'srednie'|'wysokie' — warstwa 4
  risk_flags text[], -- 'clo_antydumpingowe' | 'local_content' | 'dostawca_wysokiego_ryzyka' | ...
  status text not null default 'nowy',
    -- 'nowy' | 'do_oceny' | 'zakwalifikowany' | 'w_przygotowaniu' | 'zlozona_oferta'
    -- | 'wygrany' | 'przegrany' | 'uniewazniony' | 'odrzucony'
  assigned_to uuid references profiles(id),
  raw_data jsonb, -- pełna odpowiedź źródła, do audytu/debugowania
  last_seen_at timestamptz, -- do wykrywania aneksów/zmian (modified_at źródła)
  created_at timestamptz default now(),
  unique(source, external_id)
)

tender_documents (
  id, tender_id references tenders(id) on delete cascade,
  file_name text, storage_path text, source_file_url text,
  extracted_text text, -- do ewentualnego pełnotekstowego wyszukiwania
  created_at
)

tender_ai_analysis (
  id, tender_id references tenders(id) on delete cascade,
  summary text, requirements text[], evaluation_criteria jsonb,
  warranty_period text, penalty_clauses text,
  submission_deadline_confirmed timestamptz,
  recommended boolean, confidence numeric,
  analyzed_at timestamptz default now()
)

tender_notes (
  id, tender_id references tenders(id) on delete cascade,
  author_id uuid references profiles(id), content text, created_at
)

tender_status_history (
  id, tender_id references tenders(id) on delete cascade,
  from_status text, to_status text, changed_by uuid, changed_at
)

-- Katalog towarów standaryzowanych (tryb B, sekcja 1) — reużywalny między
-- wieloma dopasowanymi przetargami
tender_product_catalog (
  id, name, specification text, category text,
  cn_hs_code text, isztar_checked_at timestamptz,
  ce_mdr_certificate boolean, certificate_notes text,
  unit_price_pln numeric, lead_time_days int, min_order_qty int,
  keywords text[], active boolean default true
)

-- Powiadomienia w panelu (Centrum Sygnałów, sekcja 7.2)
tender_notifications (
  id, tender_id references tenders(id) on delete cascade,
  type text, -- 'nowy_dopasowany' | 'zmiana_terminu' | 'blisko_terminu' | 'aneks'
  seen_by uuid[], -- kto już to widział — do liczenia odznaki nieprzeczytanych
  created_at timestamptz default now()
)
```

RLS: `tenders`/`tender_documents`/`tender_ai_analysis`/`tender_notes` dostępne dla całego zespołu PL (nie per-klient jak reszta apki — przetargi to wspólna pula szans sprzedażowych), edycja `tender_profile` tylko dla zarządu.

### 6.2 Edge functions + harmonogram pg_cron (wzorem `outlook-renew-subscriptions`/`translate-backfill`)

| Funkcja | Harmonogram | Zadanie |
|---|---|---|
| `tenders-ingest-bazakonkurencyjnosci` | co 20 min (pg_cron) | Pobiera nowe/zmienione ogłoszenia od `last_seen_at`, zapisuje do `tenders` (upsert po `source`+`external_id`) |
| `tenders-match` | po każdym ingest (albo co 20 min) | Warstwy 1–2 (CPV+słowa kluczowe) na nowych rekordach, ustawia `match_score` wstępny |
| `tenders-ai-classify` | co godzinę, tylko dla niejednoznacznych | Warstwa 3 — Claude klasyfikuje graniczne przypadki |
| `tenders-ai-extract` | po zakwalifikowaniu (`status = 'zakwalifikowany'`) | Warstwa 4 — pobiera załączniki, ekstrakcja Claude, zapis do `tender_ai_analysis` |
| `tenders-daily-digest` | 6:30 rano (pg_cron, zgodnie z decyzją) | Buduje podsumowanie dnia, tworzy wiersze w `tender_notifications`, generuje treść Centrum Sygnałów |
| `tenders-deadline-watch` | co godzinę | Sprawdza `submission_deadline` zbliżające się w ciągu 48h dla niezłożonych ofert → alert priorytetowy |

### 6.3 Deduplikacja

Klucz unikalności `(source, external_id)` w obrębie jednego źródła. Między źródłami (np. duży BESS w BZP i TED jednocześnie) — dopasowanie fuzzy po (nazwa zamawiającego + wartość szacunkowa ± 5% + data publikacji ± 3 dni), z ręcznym potwierdzeniem "to ten sam przetarg" w UI zamiast automatycznego scalania (bezpieczniej — fałszywe scalenie gorsze niż duplikat na liście).

### 6.4 Wykrywanie aneksów/zmian

Pole `modified_at` w Bazie Konkurencyjności (potwierdzone w danych) pokazuje, że ogłoszenia bywają edytowane po publikacji (zmiana terminu, dodatkowe załączniki). `last_seen_at` + porównanie `raw_data` przy każdym ingest → jeśli zmiana wykryta na zakwalifikowanym przetargu, tworzy `tender_notifications` typu `aneks` i **podbija go na start listy**, nawet jeśli był już oceniony.

## 7. UX Panelu Przetargów

### 7.1 Nowa zakładka w Sidebarze: "🎯 Przetargi"

Odznaka z liczbą nieprzeczytanych (dokładnie jak istniejące czerwone kółka na Czacie) — liczona z `tender_notifications` gdzie `auth.uid()` nie jest jeszcze w `seen_by`.

### 7.2 Centrum Sygnałów — codzienny digest, "ładnie wyeksponowany" (zgodnie z życzeniem)

Górny pasek zakładki, zawsze widoczny, w stylu hero-banera (podobny ton do gry "rozbij złotą rudę" na Dashboardzie — firma lubi taki żywy, gamifikowany styl UI):

- **Duża liczba dnia**: "🎯 7 nowych dopasowanych ogłoszeń dziś" z animowanym licznikiem (CountUp — już używany w apce).
- Pod spodem **rząd kolorowych "chipów" per kategoria** z liczbą (np. "⚙️ Maszyny: 3", "🔋 BESS: 2", "🏥 Medyczne: 2") — klik filtruje listę.
- **Pasek pilności**: jeśli jakiś zakwalifikowany przetarg ma termin < 48h, czerwony baner "⏰ 2 przetargi z terminem w ciągu 48h — sprawdź teraz" ponad wszystkim innym.
- Osobna, mniejsza sekcja "📝 Aneksy/zmiany" — jeśli któryś ZAKWALIFIKOWANY wcześniej przetarg się zmienił.
- Wszystko odznaczane jako przeczytane pojedynczo (klik w kartę) albo zbiorczo ("Oznacz wszystkie jako przeczytane").

### 7.3 Tablica kanban wg statusu

Kolumny: Nowy → Do oceny → Zakwalifikowany → W przygotowaniu oferty → Złożona oferta → (rozgałęzienie) Wygrany / Przegrany / Unieważniony / Odrzucony. Kafelek = jak w Projektach/Wycenach (spójny język wizualny): tytuł, zamawiający, wartość, dni do terminu (kolor: zielony >14 dni, pomarańczowy 3–14, czerwony <3), dopasowanie % w formie małego paska, ikony flag ryzyka.

### 7.4 Karta szczegółów przetargu

Pełny opis + wszystko wyciągnięte przez AI (warunki udziału, kryteria oceny, gwarancja, kary) w czytelnych sekcjach + lista dokumentów z podglądem **w aplikacji** (zero dodatkowej pracy — `FilePreviewModal` już obsługuje PDF/Excel/Word) + link źródłowy + `tender_notes` (prosty czat/log notatek zespołu, wzorem istniejących komponentów czatu) + selektor przypisanej osoby.

### 7.5 Integracja z istniejącymi modułami

Przycisk "→ Utwórz zamówienie z tego przetargu" na zakwalifikowanym przetargu — tworzy nowy rekord w `projects` wstępnie wypełniony danymi (nazwa, wartość, klient = zamawiający jeśli już istnieje w bazie klientów, albo tworzy nowego), i przechodzi do istniejącego flow Wycen. To spina "znalezienie szansy" z "wyceną i realizacją" w jeden ciągły proces, zamiast dwóch osobnych światów.

## 8. Plan wdrożenia fazami

**Faza 1 (start budowy):**
1. SQL: pełny schemat z sekcji 6.1.
2. Edge function `tenders-ingest-bazakonkurencyjnosci` (polling co 20 min) + `tenders-match` (CPV+słowa kluczowe, warstwy 1–2).
3. UI: zakładka Sidebar + kanban (bez AI na start — same ustrukturyzowane dane) + Centrum Sygnałów (bez ekstrakcji AI, tylko liczniki nowych/pilnych).
4. `tenders-daily-digest` o 6:30.

**Faza 2:**
5. ✅ **Wdrożone (21.07.2026):** `tenders-ai-classify` (warstwa 3) + `tenders-ai-extract` (warstwa 4). Ważna decyzja architektoniczna podjęta przy wdrożeniu: warstwa 4 NIE pobiera binarnych załączników (PDF/DOCX) — okazało się, że ustrukturyzowane pola już zwracane przez `/api/announcements/{id}` (`participation_conditions[]`, `evaluation_criteria[]`, pełny `description` zapytania ofertowego, `warranty_period`) zawierają praktycznie wszystko, co warstwa 4 miała wyciągać z załączników. Pobieranie/OCR faktycznych plików PDF/DOCX zostaje jako możliwe rozszerzenie, gdyby ta uproszczona wersja czegoś nie domykała. Harmonogram: klasyfikacja co 20 min (10,30,50 * * * *), ekstrakcja co godzinę.
6. Integracja z ISZTAR (cła antydumpingowe) i flagowanie "local content"/Lex China — jeszcze do zrobienia.
7. e-Zamówienia/BZP: pobrać Załącznik 3, dopisać `tenders-ingest-bzp` — jeszcze do zrobienia.

**Faza 3 (opcjonalnie, po walidacji wolumenu z fazy 1–2):**
8. TED dla przetargów >930 960 zł.
9. Katalog produktów standaryzowanych (`tender_product_catalog`) + generator gotowej oferty (reużycie edytora TipTap z Wycen).
10. Ocena czy platformazakupowa.pl/SmartPZP wnoszą wystarczająco unikalnego wolumenu żeby uzasadnić scraper (decyzja biznesowa, nie tylko techniczna).

## 9. Rzeczy, o których mogłeś zapomnieć — dopisane przeze mnie

- **Aneksy/zmiany** już zakwalifikowanych przetargów — obsłużone w 6.4, ale podkreślam: to częsty powód przeoczenia zmiany terminu w praktyce.
- **Wynik przetargu (kto wygrał, za ile)** — warto zbierać nawet dla przegranych, jako *competitive intelligence* na przyszłość (kto jest realną konkurencją w danej kategorii). Pole `winner_name`/`winning_value` do dodania w `tenders` przy statusie 'przegrany'/'wygrany', uzupełniane ręcznie na razie (automatyczne pobranie wyniku to osobny, trudniejszy temat na później).
- **Pętla feedbacku** — przycisk "to nie pasuje" na błędnie dopasowanym ogłoszeniu, zbierany jako dane do okresowego (miesięcznego) przeglądu i poprawy słów kluczowych/promptu klasyfikacji AI.
- **Wymóg podpisu kwalifikowanego** przy faktycznym złożeniu oferty (przypomnienie z v1, wciąż aktualne) — apka automatyzuje **przygotowanie** kompletnej oferty, ale samo złożenie w miniPortalu/Platformie e-Zamówienia to ręczny krok osoby z podpisem elektronicznym. To wymóg prawny, nie ograniczenie techniczne.
- **RODO** — `contact_persons` w odpowiedziach API Bazy Konkurencyjności zawiera dane osobowe (imię, nazwisko, e-mail, telefon) — przechowywać tylko w zakresie potrzebnym do kontaktu w sprawie oferty, nie eksponować w miejscach niepotrzebnych.
- **SLA zespołu na ocenę nowego przetargu** — bez tego kolumna "Do oceny" w kanbanie może się zapychać w nieskończoność. Warto dodać automatyczne przypomnienie/eskalację jeśli przetarg leży w statusie "Do oceny" dłużej niż np. 2 dni robocze.
- **Koszt AI** (z v1, zaktualizowane): przy 10–30 dopasowanych przetargach dziennie z pełną analizą warstwy 3+4 — rząd wielkości 40–150 zł/miesiąc (Sonnet) albo kilkanaście-kilkadziesiąt zł (Haiku). Pomijalne.
- **Refresh progów/kursów** — próg Pzp (170 000 zł), próg Bazy Konkurencyjności (80 000 zł), progi UE i kurs euro (4,31) są rewidowane biennalnie — ustawić przypomnienie/zadanie na przełom 2027/2028.

## 10. Definition of Done dla Fazy 1

- [ ] Schemat SQL wdrożony z RLS.
- [ ] `tenders-ingest-bazakonkurencyjnosci` działa cyklicznie, zapisuje bez duplikatów.
- [ ] Warstwy 1–2 dopasowania działają wg `tender_profile` z kategoriami z sekcji 2.1–2.2 (+ obserwacyjnie 2.3).
- [ ] Zakładka "Przetargi" w Sidebarze z kanbanem i licznikiem nieprzeczytanych.
- [ ] Centrum Sygnałów pokazuje dzienne podsumowanie, generowane o 6:30.
- [ ] Karta szczegółów przetargu pokazuje wszystkie surowe dane + link źródłowy + podgląd załączników (jeśli już pobrane).
- [ ] Test na żywo: co najmniej 5 realnych dopasowanych ogłoszeń widocznych w panelu w ciągu pierwszych 24h działania (dziś sam research znalazł kilka realnych trafień z kategorii edukacja/IT — dobry sygnał, że to osiągalne).

---
*Ten dokument to plan do dyskusji i punkt startowy budowy — nic z sekcji 6–8 nie zostało jeszcze zaimplementowane. v1 (marzec/lipiec) zawierało wstępny profil firmy; v2 (ten dokument) dodaje zweryfikowane na żywo API, potwierdzony zakres kategorii i pełną architekturę/UX.*
