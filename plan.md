# BRRY Dashboard – Vollständiger Projektplan

Stand: 2025-08-14 19:41 (CEST)

## Projektziel
Funktionierendes Kunden- und Service-Dashboard für Apotheken mit Marketing-Checklisten, Onboarding-Prozess, Umsatz-Tracking und moderner UI/UX.

## Tech-Stack
- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Firebase (Firestore, Auth, Hosting, Functions)
- **UI**: Darkmode-only, "Apple-like" Design
- **Charts**: Recharts + eigene SVG-Sparklines
- **Deployment**: GitHub Actions → Firebase Hosting

## Kostenstruktur
- **Onboarding**: 750€ einmalig pro abgeschlossenem Onboarding
- **Grundgebühr**: 50€/Monat pro aktivem Kunden
- **Marketing**: 180€/Monat pro Marke + 60€/Monat je weiterer Filiale
- **Masterlayout**: 240€/Monat (wenn Marketing aktiv)
- **Zusatzservices**: individuell pro Apotheke

## Marketing-Checkbox-System (Kern-Feature)
**Problem gelöst**: 2-Checkbox-System mit stabiler Firestore-Synchronisation

### Root Cause & Fix
- **Problem**: Dot-Pfade in `setDoc` (z.B. `services.handzettel.prepared`) wurden nicht als verschachtelte Felder gespeichert
- **Lösung**: Alle Writes auf verschachtelte Objekte umgestellt:
```ts
setDoc(ref, {
  services: {
    [service]: {
      prepared: boolean,
      preparedAt: prepared ? Date.now() : deleteField(),
      done: boolean,
      doneAt: done ? Date.now() : deleteField(),
    }
  }
}, { merge: true });
```

### Invarianten
- "Abgeschlossen" impliziert "Vorbereitet"
- Bei `prepared=false` wird `done=false` erzwungen
- Firestore-Regeln verlangen gültiges `done`-Schema

### Datenmodell
- Collection: `marketingChecklists`
- Dokument-ID: `${customerId}_${ym}` (z. B. `MAXMO_2025-08`)
- Standard-Services: `services.{handzettel|poster|social|newsletter}`
- Custom-Services: `custom.{serviceKey}` (mit `label`)

## Hauptfunktionen

### Dashboard
- Live-KPIs: aktive Kunden, Filialen, Umsatz, offene Onboardings
- Umsatz-Charts (Area, Donut) mit Firestore-Zeitreihen
- Skeleton-Loading, responsive Design

### Kunden
- Kundenliste mit Inline-Editing (Status, Marketing, Grundgebühr)
- Sortierung, Filter, Suche
- Aufklappbare Details: Filialen, Zusatzservices, Notizen
- Mobile-optimiert (3er-Grid für Umsatzboxen)

### Marketing
- **2-Checkbox-System**: "Vorbereitet" (gelb) + "Abgeschlossen" (grün)
- Monatliche Checklisten pro Kunde/Service
- Fortschrittsbalken, KPI-Karten
- Standard-Services + Custom-Services pro Kunde

### Onboarding
- Aufgaben-Tracking: Webshop, App, Marketing-Toggle
- Status-Management, Abschluss-Button
- Automatischer 750€-Bonus bei Abschluss

### Einstellungen
- Preise editierbar (Grundgebühr, Onboarding, Marketing)
- Vollständiger Daten-Import/Export (JSON)
- Snapshot-Funktion (Firebase Storage)

## Deployment
- **Repo**: https://github.com/werft12/brry-dashboard-v2.git
- **Live**: https://brry-dashboard-v2.firebaseapp.com
- **CI/CD**: GitHub Actions → Firebase Hosting
- **Workflow**: `git add . && git commit -m "..." && git push`

## Lessons Learned

### Marketing-Checkbox-Debugging (Aug 2025)
**Kritischer Bug**: Checkboxes ließen sich nicht aktivieren/deaktivieren
- **Ursache**: `setDoc` mit Dot-Pfaden (`services.handzettel.prepared`) funktioniert nicht
- **Lösung**: Verschachtelte Objekte verwenden
- **Debugging-Strategie**: Before/After-Logs in allen Settern
- **Firestore-Regeln**: `done`-Feld muss immer bool sein

### Cross-Service-Activation Bug
- **Problem**: Toggle eines Services aktivierte andere Services
- **Ursache**: Merge-Logik und Snapshot-Listener-Konflikte
- **Lösung**: Präzise Feld-Updates, keine globalen Merges

### UI/UX Evolution
- **Darkmode-only**: Kein Toggle, ausschließlich dunkles Design
- **Mobile-First**: Alle Komponenten responsive optimiert
- **Apple-like**: Professionelles Finanzdashboard-Design
- **Performance**: Skeleton-Loading, Debouncing, Batching

## Zukünftige Features

### KPIs & Analytics
- MRR/ARR pro Segment, ARPU/ARPA
- Wachstum MoM/YoY mit Sparklines
- Retention & Churn-Analyse
- Forecasting & Szenarien-Simulation

### Workflow-Optimierung
- Kalenderansicht für Marketing-Aufgaben
- Vorlagen/Templates pro Marke
- Notizen/Kommentare mit Mentions
- Batch-Operationen

### Integrationen
- Kalender-Sync (Google/Outlook)
- Buchhaltung/Export-Tools
- Newsletter-Status (externe APIs)
- Mandantenverwaltung

## Troubleshooting

### Checkbox-Probleme
- **Zustand springt zurück**: AFTER-Logs prüfen → Listener/Normalisierung
- **Cross-Service-Effekte**: Nur betroffenen Service updaten
- **Persistenz**: Verschachtelte Objekte, nie Dot-Pfade

### Deploy-Probleme
- **403 Extensions API**: Service Account Rollen prüfen (`firebasemods.viewer`)
- **Build-Fehler**: Node.js 20 verwenden, nicht 22
- **Static Export**: `generateStaticParams()` für dynamische Routen

### Performance
- **Firestore-Reads**: Listener optimieren, Batching
- **UI-Lag**: Debouncing, Skeleton-Loading
- **Mobile**: Responsive Breakpoints, Touch-Targets

## Status
✅ **Produktiv**: Alle Hauptfunktionen implementiert und deployed
✅ **Marketing-Checkboxes**: Stabile Firestore-Synchronisation
✅ **UI/UX**: Vollständig responsive, Darkmode-Design
✅ **Deployment**: Automatisiert via GitHub Actions

## Schreib‑API (Server/Client)
Datei: `src/lib/marketing-checklist.ts`
- Funktionen:
  - `setMarketingServicePrepared(customerId, ym, service, prepared)`
  - `setMarketingServiceCompleted(customerId, ym, service, completed)`
  - `setCustomMarketingServicePrepared(customerId, ym, service, label, prepared)`
  - `setCustomMarketingServiceCompleted(customerId, ym, service, label, completed)`

Alle Writes verwenden verschachtelte Objekte mit `setDoc(ref, payload, { merge: true })`:
```ts
setDoc(ref, {
  customerId,
  ym,
  services: {
    [service]: {
      prepared: boolean,
      preparedAt: prepared ? Date.now() : deleteField(),
      done: boolean,
      doneAt: done ? Date.now() : deleteField(),
    },
  },
  updatedAt: Date.now(),
}, { merge: true });
```
Für Custom‑Services analog unter `custom: { [service]: { label, ... } }`.

- Invarianten:
  - „Abgeschlossen“ impliziert „Vorbereitet“: Bei `completed=true` setzen wir `prepared=true` und `preparedAt`.
  - Bei `prepared=false` erzwingen wir `done=false` und löschen `doneAt`.
  - Beim `prepared=true` behalten wir vorhandenes `done/doneAt` unverändert (kein Überschreiben), damit Regeln erfüllt bleiben, ohne fälschlich zu aktivieren/deaktivieren.

## Lese‑/Listener‑Logik
- Standard‑Services: lesen aus `services.*`.
- Custom‑Services: lesen aus `custom.*`.
- Legacy‑Fallback: lesend kann optional `services.custom.*` toleriert werden; Schreibweg ist ausschließlich `custom.*`.
- UI erhält Props für beide Stati: `prepared` und `completed`.

## UI‑Komponenten
- `components/ui/three-state-checkbox.tsx` (3‑Zustände Checkbox, Tooltips/Farben)
- `components/ui/two-checkbox.tsx` (Alt/aus Blend‑Phase; Click‑Handling mit `stopPropagation()` und Debug‑Logs)
- Marketing‑Seite: `app/(protected)/marketing/page.tsx` integriert die Checkboxen, KPI‑Karten, Progress‑Bars und Monatsnavigation.

## Test‑Checkliste (End‑to‑End)
1. Hart neu laden (Cmd+Shift+R).
2. Standard‑Service:
   - Prepared EIN → Snapshot zeigt `prepared: true`.
   - Completed EIN → `done: true` und automatisch `prepared: true`.
   - Prepared AUS → `prepared: false`, `done: false` (und `doneAt` gelöscht).
3. Custom‑Service: identisches Verhalten, `label` bleibt erhalten.
4. Reload: Zustände bleiben persistent.

## Troubleshooting & typische Ursachen
- Zustand springt zurück: Prüfe „AFTER set…“ Logs. Korrekt im AFTER, aber falsch im UI → Listener/Normalisierung prüfen. Schon im AFTER falsch → Rules/Schema prüfen.
- Cross‑Service‑Effekte: Nur den betroffenen Service in `services[service]`/`custom[service]` updaten. Kein globales Merge ganzer Strukturen.
- Dot‑Path‑Keys in `setDoc`: Werden nicht in verschachtelte Felder aufgelöst → niemals verwenden. Immer verschachteltes Objekt übergeben.
- CI/Deploy 403: Service Account‑Rollen (`firebasemods.viewer`, `firebasehosting.admin`, ggf. `run.admin` + `iam.serviceAccountUser`) und aktivierte APIs (`firebaseextensions.googleapis.com`) prüfen.

## Changelog (Kurzfassung)
- Pfadfix: Custom Services von `services.custom.*` → `custom.*` (Write‑Pfad); Listener können Legacy lesend tolerieren.
- Listener‑Normalisierung: Einheitliches Mapping für `prepared/done` inkl. `preparedAt/doneAt`.
- Invarianten implementiert: `prepared=false` ⇒ `done=false`.
- Cross‑Service‑Bugs behoben: Punktgenaue Feld‑Updates je Service; keine Stomping‑Merges.
- Kritischer Fix: Dot‑Pfade in `setDoc` durch verschachtelte Objekte ersetzt; Persistenz und Reload‑Konsistenz damit stabil.
- UI/UX wiederhergestellt: Monatsnavigation, Kunden, KPIs, gestapelte Progress‑Bars.

## Status
Produktiv: 3‑Zustände‑Checkboxen funktionieren stabil, Firestore‑Sync ist konsistent, Reload‑persistiert.
