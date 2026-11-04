# Erreichbarkeit vipwell.club

Misst alle 15 Minuten, ob **vipwell.club** (web) und **app.vipwell.club** (club) aus den Ländern
der Kunden erreichbar sind: Kosovo, Albanien, Nordmazedonien, Serbien, Deutschland, Schweiz.
Dazu einmal direkt vom GitHub-Runner aus.

Warum: Uptime Kuma (status.vipwell.club) läuft auf demselben Server wie die Seite und sieht
deshalb nur, ob die Apps laufen — nicht, ob Besucher draussen durchkommen. Anlass war eine
Timeout-Meldung aus Kosovo am 04.11.2026.

## Wie es misst

- [Globalping](https://globalping.io) (freie Messproben weltweit, kein Konto) ruft
  `/api/health` auf; ok = HTTP 2xx/3xx und `"status":"ok"`.
- Fällt eine Probe aus, misst das Skript dieses Land sofort noch einmal. Erst wenn es wieder
  ausfällt, gilt es als **Störung** — einzelne wacklige Proben lösen keinen Alarm aus.
- Ist Globalping selbst nicht erreichbar, steht das als Warnung im Lauf, aber ohne Alarm.

## Was bei einer Störung passiert

- Ein Issue **«Störung: vipwell.club aus … nicht erreichbar»** mit Label `stoerung`, zugewiesen
  an Laurin8 → GitHub schickt eine Mail.
- Jede weitere gestörte Messung kommt als Kommentar dazu (Uhrzeit, Land, Netz, Fehler).
- Sobald alles wieder grün ist: Kommentar «Wieder überall erreichbar» und das Issue schliesst.

Die geschlossenen Issues sind damit das Störungsprotokoll.

## Bedienung

- Sofort messen: Actions → «Erreichbarkeit» → «Run workflow».
- Lokal: `node erreichbarkeit.mjs` (Node 20+), Exit 1 = Störung, Ergebnis in `ergebnis.json`.
- Länder oder Ziele ändern: `LAENDER` / `ZIELE` oben im Skript.

Das Repo ist öffentlich, damit die Läufe keine Actions-Minuten kosten. Es enthält keine
Zugangsdaten — nur öffentliche Adressen.

Quelle: `Tailored-Intelligence/vipwell` → `tools/monitoring/` (dort ändern, hierher kopieren).
