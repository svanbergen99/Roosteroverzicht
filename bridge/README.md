# Traffic bridge

Deze map bevat de beveiligde read-only bridge tussen Roosteroverzicht en het officiële Traffic/Kibana-dashboard.

## Doel

De browserpagina van Roosteroverzicht mag geen Kibana-sessiecookie (`sid`) of andere geheime credentials bevatten. De bridge haalt daarom server-side alleen de benodigde informatie op en geeft een klein JSON-resultaat terug.

Eerste endpoint:

- `GET /api/traffic-header` — haalt de officiële Traffic-header uit het opgeslagen Markdown-paneel van dashboard `731a7b2c-c25f-4ff6-a032-5f62ef6d2272`.
- `GET /api/health` — controleert of de bridge draait en of een goedgekeurde Kibana-authenticatie is geconfigureerd.

## Beveiliging

- De browser-`sid` wordt bewust niet ondersteund.
- Secrets horen alleen in de secret/configuration store van de gekozen host.
- `KIBANA_AUTHORIZATION` accepteert alleen een goedgekeurde `ApiKey ...` of `Bearer ...` waarde.
- CORS wordt beperkt tot `ALLOWED_ORIGIN`.
- De bridge retourneert alleen de benodigde Traffic-informatie, niet de volledige Kibana-response.

## Lokaal starten

Node.js 20 of nieuwer:

```bash
cd bridge
npm start
```

Zonder `KIBANA_AUTHORIZATION` blijft de bridge bewust in veilige niet-gekoppelde modus. `/api/health` werkt dan wel; `/api/traffic-header` geeft `503 NOT_CONFIGURED`.

## Nog nodig voor echte koppeling

Er is nog één geautoriseerde backend-identiteit nodig die dit Kibana-endpoint mag lezen:

`POST /s/centraal-beheer/api/content_management/rpc/get`

met payload:

```json
{
  "contentTypeId": "dashboard",
  "id": "731a7b2c-c25f-4ff6-a032-5f62ef6d2272",
  "version": 3
}
```

Zodra die officiële read-only authenticatie beschikbaar is, kan de bridge de header live synchroniseren. Daarna kunnen dezelfde principes worden uitgebreid naar de `internal/bsearch` live metrics.
