# Saans — India-first air quality companion

Saans helps people understand local air conditions and plan around changes. The current product foundation is a responsive installable PWA, with an AWS serverless API for nearby PM2.5 observations and forecasts.

## Product experience

- Welcome overview, name entry, then the Saans dashboard.
- Airspace groups nearby PM2.5 readings, station freshness, schematic coverage, and an hourly forecast.
- Guidance groups household-oriented explainers and profile-aware guidance placeholders.
- Area watch currently includes an explicitly illustrative Delhi-NCR stubble-smoke corridor. It is not a live alert or a forecast for other Indian cities.
- More includes settings, English/Hindi UI options, reduced motion, geolocation, a picker for 24 Indian cities, how-to guidance, and data-source notes.
- PWA install support and a service worker provide the installable app shell.

The selectable locations are city presets, not a claim that every area has nearby monitors. The dashboard can also request the device's coordinates after the user chooses to share them.

Saans now separates OpenAQ station observations from Open-Meteo/CAMS model forecasts. The API does not manufacture station readings. If one source has no data, the UI reports that gap and can still show the other source. The visible estimate range is a distance-weighted spread of recent PM2.5 monitors; it is explicitly not a calibrated confidence interval. Saans is India-first: users can choose a supported Indian city or share their device location. The dashboard reports PM2.5 concentration and explicitly does not call it CPCB National AQI. CPCB AQI requires pollutant-specific averaging and sub-indices.

## Current implementation

- `backend/template.yaml` deploys an API Gateway HTTP API, Node.js Lambda, low-capacity DynamoDB cache, throttling, and least-purpose IAM access.
- `GET /health` reports API health.
- `GET /v1/air?lat=28.5355&lon=77.2420` returns nearby OpenAQ PM2.5 station readings (older than 7 days dropped, outliers >3× off the local median flagged and excluded), a distance-weighted PM2.5 estimate, a 48-hour Open-Meteo PM2.5/PM10 forecast, live wind (Open-Meteo), the CPCB PM2.5 band with health impact and per-profile actions in English and Hindi, timestamps, provider states, and CPCB AQI caveats.
- `POST /v1/ask` with `{question, lat, lon, profile, lang, place}` answers questions from the same live data and CPCB guidance. It uses Amazon Bedrock (`BedrockModelId` parameter) when enabled and falls back to deterministic rule-based answers otherwise; the response says which (`mode`).
- Responses are cached for 5 minutes in DynamoDB and in memory; a payload with a provider outage is cached for only 60 seconds.
- OpenAQ is optional until you add its key. The forecast endpoint works without it.
- The dashboard calls the API only after `frontend-config.js` has an API base URL. It does not show sample readings as real data.
- Personas are chosen on the name screen: office/indoor, construction/outdoor worker, delivery rider/commuter, runner, child/parent, elderly, pregnant, heart/lung condition. They change the Today alerts, guidance and assistant answers, and stay on the device.
- The app is split into pages (Today, Overview, Airspace, Guidance, Area watch, More) routed by the URL hash. Today shows notification-style alerts for the persona and the current PM2.5, PM10, NO2, O3, CO and SO2 levels (CAMS model, CPCB breakpoints, indicative) with how each affects that persona.

Saans currently displays PM2.5 concentration in µg/m³. It does **not** calculate or present an official CPCB National AQI. CPCB AQI requires pollutant-specific averages and sub-indices; a PM2.5-only estimate is not sufficient. The displayed spread is a simple estimate range, not a validated confidence interval.

## Run locally (no AWS)

Requires Node.js 22.

```sh
cd backend/src && npm ci && cd ../..
node --env-file-if-exists=backend/.env backend/local-server.mjs   # http://localhost:3000
```

Serves the PWA and runs the Lambda handler in-process. DynamoDB cache is skipped and the assistant uses rule-based answers unless `BEDROCK_MODEL_ID` and AWS credentials are set. `LIVE_API=1` serves the site against the deployed API instead. `HOST=0.0.0.0` binds IPv4 (needed under WSL for `tailscale serve` or other devices). `node backend/selfcheck.mjs` checks band, outlier and estimate logic. For OpenAQ stations, put `OPENAQ_API_KEY=...` in `backend/.env` (gitignored); without it only the Open-Meteo forecast is live.

## Deploy the API

Use an AWS region where Lambda, API Gateway, DynamoDB and Systems Manager Parameter Store are enabled. Mumbai (`ap-south-1`) is the intended default for this project. Before deployment, install the AWS CLI and AWS SAM CLI, configure an AWS profile, and confirm your AWS Budgets alert is set below the remaining credit amount. Credits do not guarantee that every service or data transfer charge is free.

From `backend/`:

```powershell
sam build
sam deploy --guided --region ap-south-1 --capabilities CAPABILITY_IAM
```

For the `AllowedOrigin` parameter, use the exact HTTPS origin where you will host the website. The template defaults to `*` for first-time setup; replace it before exposing a production site. The API outputs include `ApiBaseUrl`, `CacheTableName`, and `OpenAqParameterName`.

Copy the `ApiBaseUrl` output into `frontend-config.js`:

```js
window.SAANS_API_BASE = 'https://YOUR_API_ID.execute-api.ap-south-1.amazonaws.com/prod';
```

Serve the website locally for development, or host the root files on HTTPS (for example, AWS Amplify Hosting). A service worker and install prompt require localhost or HTTPS. The public website files are `index.html`, `styles.css`, `app.js`, `frontend-config.js`, `manifest.webmanifest`, `icon.svg`, and `sw.js`.

## Keys and values to add

1. **AWS credentials/profile** with permission to deploy the SAM stack and create Lambda, API Gateway, DynamoDB, IAM roles and Systems Manager parameters. Keep the account and region you choose consistent for deploy and key setup.
2. **OpenAQ API key** from [OpenAQ Explore](https://explore.openaq.org/). After the stack is deployed, store it as a Standard `SecureString` at the output parameter name. Example (replace the placeholder locally; do not commit it):

   ```powershell
   aws ssm put-parameter --name /saans/prod/openaq-api-key --type SecureString --value "YOUR_OPENAQ_KEY" --overwrite --region ap-south-1
   ```

   No key is stored in the source tree. Until set, Saans serves the weather-model forecast and indicates that station coverage is not configured.
3. **Website HTTPS origin**, such as your Amplify URL, passed as `AllowedOrigin` during deployment. If the API is redeployed with a new origin, update that parameter.
4. **API base URL**, copied from the SAM stack output into `frontend-config.js` after deployment.
5. **NASA FIRMS MAP key** only when the fire-hotspot ingestion/alert feature is implemented. It is not consumed by the current API yet; store it later as a SecureString, never in browser JavaScript.
6. **Bedrock model access and budget approval** only if you later choose to build the RAG assistant. It is not enabled in this low-cost path and Bedrock token usage is chargeable.

## Scope still required for the full Saans plan

This is the live-data/API foundation, not the complete feature set in the idea document. User accounts and saved profiles, alert subscriptions, smoke trajectories, historical station reliability, a trained/validated gap-fill and AQI forecast model, reviewed multilingual health rules and citations, Bedrock RAG/guardrails, and production hosting/domain monitoring still need implementation and data validation. Do not present the current PM2.5 spread as model confidence, or PM2.5 concentration as CPCB AQI. The current Delhi-NCR stubble-smoke visualization is illustrative and is not an alert for other Indian regions.
