# Q-Learning Rennstrecke

Interaktive Website: Du zeichnest eine Rennstrecke, setzt Start und Ziel und siehst zu, wie ein virtuelles Auto
mit **echtem tabellarischem Q-Learning** selbstständig lernt, die Strecke zu fahren. Alles läuft im Browser.

## Technologien
React 18 · TypeScript · Vite · HTML Canvas 2D · IndexedDB · GitHub Actions / GitHub Pages

## Projektstruktur
- `src/core/track.ts` – Streckengeometrie, Glättung, Straßenmaske, Validierung
- `src/core/env.ts` – Fahrzeugphysik, 5 Sensoren, Zustandsdiskretisierung, Belohnungen
- `src/core/qlearning.ts` – Q-Tabelle, Epsilon-Greedy, Update-Regel
- `src/core/trainer.ts` – Episoden, Statistik, beste Fahrt
- `src/core/storage.ts` – IndexedDB, Export/Import (Formatversion 1)
- `src/components/` – Zeichenfläche/Editor (`Stage`), Einstellungen, Fortschritt, Speicherstände (`Panels`)

## Lernverfahren in Kürze
- **Zustand:** 5 Sensorwerte (je 3 Klassen) + Winkelabweichung zur Streckenrichtung (5 Klassen) = 1215 Zustände
- **Aktionen:** stark links, leicht links, geradeaus, leicht rechts, stark rechts (konstante Geschwindigkeit)
- **Update:** `Q(s,a) ← Q(s,a) + α·[r + γ·max Q(s',a') − Q(s,a)]`
- **Belohnung:** +100 Ziel, −100 Straße verlassen, −20 Abbruch ohne Fortschritt/Zeitlimit, laufend Fortschritt entlang der Strecke (negativ bei Rückwärtsfahrt) minus kleine Zeit- und Mittenabweichungsstrafe
- Die Erfolgsquote stammt ausschließlich aus echten Episoden. Lernt das Auto nicht, sieht man das in den Zahlen.
- Die Strecke ist eine Punkt-zu-Punkt-Strecke ohne Selbstüberschneidung. Die Fahrtrichtung ergibt sich aus der Reihenfolge von Start und Ziel entlang der gezeichneten Linie.

## Lokal starten
```bash
npm install
npm run dev      # Entwicklungsmodus
npm run build    # Produktions-Build (prüft vorher die Typen)
npm run preview  # Build lokal ansehen
```

## Auf GitHub Pages veröffentlichen
1. Neues Repository auf GitHub anlegen, Projekt hochladen (Branch `main`).
2. Im Repository: **Settings → Pages → Build and deployment → Source: „GitHub Actions“**.
3. Jeder Push auf `main` baut die Seite (`.github/workflows/deploy.yml`) und veröffentlicht sie unter
   `https://<nutzer>.github.io/<repo>/`. `base: './'` in `vite.config.ts` sorgt dafür, dass das auch in der Unteradresse funktioniert.

## Speicherung
GitHub Pages hat keinen Datenbankserver. Speicherstände liegen lokal im **IndexedDB des jeweiligen Browsers**
(werden beim Löschen der Websitedaten entfernt). Mit „Als JSON exportieren“ / „JSON importieren“ lassen sich Stände
sichern und auf andere Geräte übertragen. Automatisch gespeichert wird regelmäßig, nach Erfolgen, bei Pause und Ende.
