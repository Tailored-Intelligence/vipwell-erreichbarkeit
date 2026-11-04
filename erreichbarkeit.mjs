#!/usr/bin/env node
// Erreichbarkeit von vipwell.club aus den Ländern der Kunden (Kosovo, Albanien,
// Nordmazedonien, Serbien, Deutschland, Schweiz) — Anlass: Timeout-Meldung aus Kosovo
// 04.11.2026, die Uptime Kuma nicht sehen kann (läuft auf demselben Server wie die Seite).
//
// Misst über Globalping (freie Messproben weltweit, kein Konto nötig) die Health-Endpunkte
// von web und club, dazu einmal direkt vom Runner aus. Fällt eine Probe aus, misst das
// Skript dieses Land sofort noch einmal; erst eine bestätigte Störung zählt.
//
//   node erreichbarkeit.mjs            → Exit 1 bei bestätigter Störung, sonst 0
//   Ausgabe: ergebnis.json (für den Issue-Schritt) + Tabelle im GitHub-Step-Summary
//
// Läuft per GitHub Actions im öffentlichen Repo Tailored-Intelligence/vipwell-erreichbarkeit
// (öffentlich = keine Actions-Minuten); diese Datei ist die Vorlage dort.
import { appendFileSync, writeFileSync } from 'node:fs'

const API = 'https://api.globalping.io/v1/measurements'
const ZIELE = [
  { name: 'web', host: 'vipwell.club', pfad: '/api/health' },
  { name: 'club', host: 'app.vipwell.club', pfad: '/api/health' },
]
const LAENDER = [
  { country: 'XK', limit: 3 },
  { country: 'AL', limit: 2 },
  { country: 'MK', limit: 1 },
  { country: 'RS', limit: 1 },
  { country: 'DE', limit: 2 },
  { country: 'CH', limit: 1 },
]
const LAND_NAME = { Runner: 'Direkt', XK: 'Kosovo', AL: 'Albanien', MK: 'Nordmazedonien', RS: 'Serbien', DE: 'Deutschland', CH: 'Schweiz' }

const zeit = () =>
  new Date().toLocaleString('de-CH', { timeZone: 'Europe/Zurich', dateStyle: 'short', timeStyle: 'medium' })

async function messen(ziel, laender) {
  const start = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'http',
      target: ziel.host,
      locations: laender,
      measurementOptions: { protocol: 'HTTPS', request: { method: 'GET', path: ziel.pfad } },
    }),
  })
  if (!start.ok) throw new Error(`Globalping ${start.status}: ${(await start.text()).slice(0, 200)}`)
  const { id } = await start.json()
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const res = await fetch(`${API}/${id}`)
    if (!res.ok) continue
    const m = await res.json()
    if (m.status !== 'in-progress') return m.results
  }
  throw new Error(`Globalping-Messung ${id} nicht fertig geworden`)
}

function bewerten(ziel, r) {
  const p = r.probe
  const x = r.result
  const ok =
    x.status === 'finished' &&
    x.statusCode >= 200 &&
    x.statusCode < 400 &&
    (!x.rawBody || x.rawBody.includes('"status":"ok"'))
  const grund = ok
    ? ''
    : x.statusCode
      ? `HTTP ${x.statusCode}`
      : (x.rawOutput || x.status || 'keine Antwort').split('\n')[0].slice(0, 120)
  return {
    ziel: ziel.name,
    land: p.country,
    ort: p.city,
    netz: `AS${p.asn} ${p.network}`,
    ok,
    ms: x.timings?.total ?? null,
    grund,
  }
}

async function direkt(ziel) {
  const t0 = Date.now()
  try {
    const res = await fetch(`https://${ziel.host}${ziel.pfad}`, { signal: AbortSignal.timeout(15_000) })
    const text = await res.text()
    const ok = res.ok && text.includes('"status":"ok"')
    return { ziel: ziel.name, land: 'Runner', ort: 'GitHub', netz: '', ok, ms: Date.now() - t0, grund: ok ? '' : `HTTP ${res.status}` }
  } catch (e) {
    return { ziel: ziel.name, land: 'Runner', ort: 'GitHub', netz: '', ok: false, ms: null, grund: String(e.message || e).slice(0, 120) }
  }
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms))
const ergebnisse = []
const bestaetigt = []
const monitorFehler = []
for (const ziel of ZIELE) {
  // Direkt vom Runner (USA/Europa): fällt das aus, ist der Server ganz weg.
  let d = await direkt(ziel)
  if (!d.ok) {
    ergebnisse.push(d)
    await pause(5000)
    d = { ...(await direkt(ziel)), nachmessung: true }
    if (!d.ok) bestaetigt.push(d)
  }
  ergebnisse.push(d)

  let runde
  try {
    runde = (await messen(ziel, LAENDER)).map((r) => bewerten(ziel, r))
  } catch (e) {
    monitorFehler.push(`${ziel.name}: ${e.message}`)
    continue
  }
  ergebnisse.push(...runde)
  // Ausfälle sofort nachmessen — erst wenn das Land wieder ausfällt, gilt es als Störung.
  const verdaechtig = [...new Set(runde.filter((r) => !r.ok).map((r) => r.land))]
  if (!verdaechtig.length) continue
  let nach = null
  try {
    nach = (await messen(ziel, verdaechtig.map((country) => ({ country, limit: 2 })))).map((r) => ({
      ...bewerten(ziel, r),
      nachmessung: true,
    }))
    ergebnisse.push(...nach)
  } catch (e) {
    monitorFehler.push(`${ziel.name} (Nachmessung): ${e.message}`)
  }
  for (const land of verdaechtig) {
    const wieder = nach?.filter((n) => n.land === land) ?? []
    // Ohne Nachmessung (API-Fehler, keine Probe frei) zählt der erste Ausfall.
    if (!wieder.length || wieder.some((n) => !n.ok)) {
      bestaetigt.push(...runde.filter((r) => r.land === land && !r.ok))
    }
  }
}

const laender = [...new Set(bestaetigt.map((r) => LAND_NAME[r.land] ?? r.land))]

const zeilen = ergebnisse.map(
  (r) =>
    `| ${r.ok ? '✅' : '❌'} | ${r.ziel} | ${LAND_NAME[r.land] ?? r.land}${r.nachmessung ? ' (Nachmessung)' : ''} | ${r.ort ?? ''} | ${r.netz} | ${r.ms ?? '–'} | ${r.grund} |`,
)
const bericht = [
  `**${zeit()}** — ${bestaetigt.length ? `❌ Störung: ${laender.join(', ')}` : '✅ überall erreichbar'}`,
  '',
  '| | App | Land | Ort | Netz | ms | Grund |',
  '|---|---|---|---|---|---|---|',
  ...zeilen,
  ...(monitorFehler.length ? ['', `⚠️ Messung unvollständig: ${monitorFehler.join('; ')}`] : []),
].join('\n')

console.log(bericht)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, bericht + '\n')
writeFileSync('ergebnis.json', JSON.stringify({ zeit: zeit(), stoerung: bestaetigt.length > 0, laender, bericht }, null, 2))
process.exit(bestaetigt.length ? 1 : 0)
