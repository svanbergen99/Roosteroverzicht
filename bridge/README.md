# Traffic bridge

Deze map bevat de beveiligde read-only bridge tussen Roosteroverzicht en het officiële Traffic/Kibana-dashboard.

## Doel

De browserpagina van Roosteroverzicht mag geen Kibana-sessiecookie (`sid`) of andere geheime credentials bevatten. De bridge haalt daarom server-side alleen de benodigde informatie op en geeft een klein JSON-resultaat terug.

Endpoints:

- `GET /api/traffic-header` — haalt de officiële Traffic-header op.
- `GET /api/health` — controleert of de bridge draait en of alle vereiste configuratie aanwezig is.

## Beveiliging

- Browsercookies, waaronder `sid`, worden bewust niet ondersteund.
- Alle `KIBANA_*` waarden worden alleen via environment variables gelezen.
- In Codespaces horen die waarden in **Codespaces Secrets**, niet in bestanden of terminalcommando's.
- `KIBANA_AUTHORIZATION` accepteert alleen een expliciet goedgekeurde `ApiKey ...` of `Bearer ...` waarde.
- CORS wordt beperkt tot `ALLOWED_ORIGIN`.
- De bridge retourneert alleen de benodigde Traffic-header en beperkte tijdmetadata, niet de volledige upstream-response.

## Vereiste Codespaces Secrets

Maak voor deze repository de volgende secrets aan en vul de echte waarden alleen daar in:

- `KIBANA_ORIGIN`
- `KIBANA_SPACE`
- `KIBANA_DASHBOARD_ID`
- `KIBANA_DASHBOARD_VERSION`
- `KIBANA_TRAFFIC_PANEL_ID`
- `KIBANA_AUTHORIZATION`

De repository bevat bewust geen echte Kibana-hostnaam, dashboard-ID, paneel-ID of autorisatiewaarde in de bridge-configuratie.

## Starten in Codespaces

Node.js 20 of nieuwer:

```bash
node bridge/server.js
```

Controle:

```bash
curl http://localhost:8787/api/health
```

Zonder de vereiste Codespaces Secrets blijft de bridge bewust in veilige niet-gekoppelde modus. `/api/health` werkt dan wel en meldt `configured: false`; `/api/traffic-header` geeft `503 NOT_CONFIGURED`.

## Volgende stap

Zodra een officieel goedgekeurde read-only backend-identiteit beschikbaar is, zet je die uitsluitend als `KIBANA_AUTHORIZATION` in Codespaces Secrets. Daarna kan de bridge de officiële header live synchroniseren. Dezelfde beveiligingsopzet kan later worden uitgebreid naar de live Traffic-metrics.
