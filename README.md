# Saans — India-first air quality companion

Saans helps people understand local air conditions and plan around changes. The current product foundation is a responsive installable PWA, with an AWS serverless API for nearby PM2.5 observations and forecasts.

## Product experience

- Welcome overview, then a six-step onboarding: name; age (and pregnancy for teens/adults); work and hours outdoors; floor, home near a main road/gate/construction/industry, cooking fuel, smoking at home, purifier; health conditions (asthma, COPD, dust allergy, eye irritation, sinus, heart, diabetes); optional hourly email alerts. The persona is derived from the answers, and the answers shape alerts, indoor tips and assistant replies.
- Two views, switched in the top bar: **Citizen** (Today, Overview, Airspace, Health, Trip planner, Daily challenge, More) and **Government** (Overview, Area watch, More).
- Trip planner compares up to three driving routes (OSRM) by PM2.5 and visibility sampled every ~2 km along each route, flags hazy stretches and upwind fires, and charts the cleanest hour to leave over the next 24 hours. On city trips (up to 60 km), each sample within 6 km of a live monitor (OpenAQ, reported in the last 3 hours) is rescaled to the inverse-distance monitor reading; elsewhere it is the CAMS forecast (~40 km grid). Each route card shows how many live monitors and what share of the road they cover, and the planner says when routes breathe the same air so the quickest one wins. Start and end points come from Amazon Location Service place search (colleges, sectors, landmarks, streets).
- Daily challenge: one air-awareness question a day (English/Hindi, same for everyone), offered by a pop-up on entry, building a streak with a 14-day strip. Past questions can be practised without changing the score. Progress stays on the device.
- Overview adds a 30/90-day history chart (CAMS PM2.5 bars, ERA5 peak ventilation line) with a simple backtest and a CSV download.
- Airspace is a full-page OpenStreetMap (Leaflet) map with a monitor panel over it: nearest monitor, recent average and how many report now, then numbered cards coloured by CPCB band. Tapping a card flies the map to that monitor.
- Today leads with an indicative AQI circle (CPCB method, dominant pollutant).
- Overview charts are hoverable (time, PM2.5, AQI); unusual hours/days are dotted and explained by Bedrock or Gemini (or weather rules). Inside Delhi a ward card shows the GNN forecast.
- Health & guidance merges persona and condition actions (asthma, COPD, dust allergy, heart disease, diabetes), indoor-air tips (HEPA sizing by CADR, ventilation timing, smoke, cooking, dust, CO, ozone, an honest note on plants) and the lung explainer. Old `#guidance` links redirect.
- Health shows an animated lung for every pollutant (worst first): where it deposits (nose/throat, trachea, bronchi, bronchioles, alveoli, blood), short- and long-term effects, the multiple of the WHO 2021 guideline, a persona risk line, and dose figures (cigarette equivalent, air breathed per day, AQLI life-years).
- Area watch has the fire map as the card background with the summary floating over it, and shows live weather (temperature, humidity, mixing height, IMD ventilation index) and NASA FIRMS fire hotspots for India over 1/3/7 days, with the 500 km upwind zone drawn from the current wind.
- More is a list page (profile card, language, location, city, health profile, reduce motion, how-to, data and privacy, replay welcome) and includes English/Hindi UI options, reduced motion, geolocation, a place search for any Indian locality, college or landmark (Amazon Location Service, with Open-Meteo geocoding as fallback), how-to guidance, and data-source notes.
- PWA install support and a service worker provide the installable app shell.

The selectable locations are city presets, not a claim that every area has nearby monitors. The dashboard can also request the device's coordinates after the user chooses to share them.

Saans now separates OpenAQ station observations from Open-Meteo/CAMS model forecasts. The API does not manufacture station readings. If one source has no data, the UI reports that gap and can still show the other source. The visible estimate range is a distance-weighted spread of recent PM2.5 monitors; it is explicitly not a calibrated confidence interval. Saans is India-first: users can choose a supported Indian city or share their device location. The dashboard reports PM2.5 concentration and explicitly does not call it CPCB National AQI. CPCB AQI requires pollutant-specific averaging and sub-indices.

## Current implementation

- `backend/template.yaml` deploys an API Gateway HTTP API, Node.js Lambda, low-capacity DynamoDB cache, throttling, and least-purpose IAM access.
- `GET /health` reports API health.
- `GET /v1/air?lat=28.5355&lon=77.2420` returns nearby OpenAQ PM2.5 station readings (older than 7 days dropped, outliers >3× off the local median flagged and excluded), a distance-weighted PM2.5 estimate, a 48-hour Open-Meteo PM2.5/PM10 forecast, live wind (Open-Meteo), the CPCB PM2.5 band with health impact and per-profile actions in English and Hindi, timestamps, provider states, and CPCB AQI caveats.
- The `/v1/air` response also has `weather` (wind, gusts, temperature, humidity, boundary-layer height `blhM`, ventilation index and label, 24 hourly steps) and `fires` (FIRMS detections in the last 24 h inside a ±35°, 500 km wedge upwind of the location: count, FRP, nearest km, top states).
- `GET /v1/fires?days=1|3|7` returns NASA FIRMS VIIRS (NOAA-20) hotspots over India and border areas from the last 24 h × days (low-confidence rows dropped), counts by state, and up to 4000 points ranked by fire power. Cached 30 minutes in memory.
- `GET /v1/history?lat&lon&days=7..92[&format=csv]` returns daily ERA5 weather (temperature, humidity, wind, rain, peak boundary layer, peak ventilation) joined with daily CAMS PM2.5, plus a backtest (stagnant vs. ventilated days, correlation). Cached 6 hours. `format=csv` downloads it for training.
- `GET /v1/geocode?q=DTU&near=lat,lon` returns Indian place matches from Amazon Location Service `SearchText`, ranked around `near` (not cached, per its single-use terms); falls back to Open-Meteo geocoding (cached 1 day). `source` says which answered.
- `/v1/air` also returns `aqi`: an indicative CPCB-method AQI (24 h rolling means, 8 h for O3/CO, max sub-index) on CAMS data with PM bias-corrected by nearby stations or CPCB-anchored monthly factors and its dominant pollutant. Forecast points carry `aqi`. It is not the official CPCB AQI.
- `GET /v1/explain?lat&lon&kind=forecast|history&days=30|90&lang` flags unusual hours/days (|z| ≥ 1.5 or a sharp jump) and explains them from mixing height, wind, rain and upwind fires, via Bedrock, then Gemini, then rules (`mode`).
- `GET /v1/route?from=lat,lon&to=lat,lon` (0.5–1500 km) returns up to three OSRM driving routes with PM2.5/visibility samples (live monitors blended in on city trips: `basis`, per-route `monitors` and `measuredShare`, `sameAir`), hazy kilometres, fires within 10 km, a 24-departure-hour comparison and the recommended route. `state: no_route` when OSRM finds none. Cached 30 minutes.
- `POST /v1/alerts` with `{email, lat, lon, place, profile, conditions, about, lang, freq: hourly|changes}` subscribes the email to the `AlertsTopic` SNS topic with a per-subscriber filter policy and stores the profile in the `AlertSubscribers` table (capped at 500). AWS sends a confirmation email first. A Step Functions state machine (`saans-alerts`) runs at 5 past every hour (EventBridge Scheduler, Asia/Kolkata): `AlertsFunction` lists subscribers, then a Map state alerts each one (3 at a time) with retries, catching a failure for that subscriber only. It skips 10 pm–7 am unless the air turns very poor, and removes subscribers who unsubscribed.
- `GET /v1/advisory?lat&lon[&count=1&place]` returns active government advisories within their radius (with `count=1`: subscriber count within 5 km and a bilingual preview). `POST /v1/advisory` `{lat, lon, place}` (Government view, simulated) builds a Hindi + English advisory from live data, emails every alert subscriber within 5 km through SNS, and shows it on Today for anyone nearby for 6 hours; one advisory every 5 minutes, no free text.
- `POST /v1/ask` with `{question, lat, lon, profile, conditions, about, history, lang, place}` (history = last 8 turns) answers questions from the same live data and CPCB guidance. It tries Amazon Bedrock (`BedrockModelId`), then Google Gemini (`GeminiModelId`, key in SSM `GeminiParameterName`), then deterministic rule-based answers; the response says which (`mode`).
- Responses are cached for 5 minutes in DynamoDB and in memory; a payload with a provider outage is cached for only 60 seconds.
- OpenAQ is optional until you add its key. The forecast endpoint works without it.
- The dashboard calls the API only after `frontend-config.js` has an API base URL. It does not show sample readings as real data.
- Personas are derived from the onboarding answers: office/indoor, construction/outdoor worker, delivery rider/commuter, runner, child/parent, elderly, pregnant, heart/lung condition. They change the Today alerts, guidance and assistant answers, and stay on the device.
- Observability: Lambda and API run with AWS X-Ray active tracing (Powertools Tracer; DynamoDB, SSM and Bedrock calls appear as subsegments, with cold-start and status annotations). The handler writes CloudWatch embedded metrics in the `Saans` namespace (`ProviderLatency`, `ProviderError`, `CacheHit`, `CacheMiss`, `AskAnswered`, `FireDetections`). The stack adds JSON API access logs (14 days), a `saans-ops` CloudWatch dashboard, and a CloudTrail trail (management events plus Lambda data events for the API function) writing to an encrypted S3 bucket with 90-day expiry. Outputs: `DashboardUrl`, `XRayTracesUrl`, `AuditBucketName`.
- The app is split into pages (Today, Overview, Airspace, Health & guidance, Trip planner, Daily challenge, Area watch, More) routed by the URL hash. Today shows notification-style alerts for the persona and the current PM2.5, PM10, NO2, O3, CO and SO2 levels (CAMS model, CPCB breakpoints, indicative) with how each affects that persona.

Saans shows PM2.5 concentration in µg/m³ and an **indicative** AQI computed with the CPCB method on model data. It is not the official CPCB National AQI, which uses certified monitor data. The displayed spread is a simple estimate range, not a validated confidence interval.

## Run locally (no AWS)

Requires Node.js 22.

```sh
cd backend/src && npm ci && cd ../..
node --env-file-if-exists=backend/.env backend/local-server.mjs   # http://localhost:3000
```

Serves the PWA and runs the Lambda handler in-process. DynamoDB cache is skipped and the assistant uses rule-based answers unless `BEDROCK_MODEL_ID` and AWS credentials are set. `LIVE_API=1` serves the site against the deployed API instead. `HOST=0.0.0.0` binds IPv4 (needed under WSL for `tailscale serve` or other devices). `node backend/selfcheck.mjs` checks band, outlier and estimate logic. For OpenAQ stations, put `OPENAQ_API_KEY=...` in `backend/.env` (gitignored); without it only the Open-Meteo forecast is live. For fire hotspots, add `FIRMS_MAP_KEY=...` to the same file. Weather, history and place search need no key.

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

Serve the website locally for development. The stack also hosts it: a private S3 bucket behind CloudFront (HTTPS, Origin Access Control). After `sam deploy`, run `bash backend/deploy-site.sh` to upload the files and refresh the cache; it prints the public `SiteUrl`. A service worker and install prompt require localhost or HTTPS. The public website files are `index.html`, `styles.css`, `health.js`, `trip.js`, `quiz.js`, `app.js`, `frontend-config.js`, `manifest.webmanifest`, `icon.svg`, and `sw.js`.

## Delhi ward GNN forecaster (optional, separate stack)

`gnn/` packages the WardGraphTransformer from [mansi724/PROJECT-AQI](https://github.com/mansi724/PROJECT-AQI) (pinned commit) as an x86_64 container Lambda that runs hourly (EventBridge Scheduler), fetches fresh CAMS + weather, and writes `ward-forecast/latest.json` to the main stack's `ForecastBucket`. Needs Docker. About 70 s and 1.4 GB per run.

```sh
cd gnn && sam build && sam deploy --parameter-overrides ForecastBucket=<ForecastBucketName output>
```

Run once locally from a PROJECT-AQI checkout (its requirements installed): `PYTHONPATH=. python <saans>/gnn/forecast.py out.json`.

## Keys and values to add

1. **AWS credentials/profile** with permission to deploy the SAM stack and create Lambda, API Gateway, DynamoDB, IAM roles and Systems Manager parameters. Keep the account and region you choose consistent for deploy and key setup.
2. **OpenAQ API key** from [OpenAQ Explore](https://explore.openaq.org/). After the stack is deployed, store it as a Standard `SecureString` at the output parameter name. Example (replace the placeholder locally; do not commit it):

   ```powershell
   aws ssm put-parameter --name /saans/prod/openaq-api-key --type SecureString --value "YOUR_OPENAQ_KEY" --overwrite --region ap-south-1
   ```

   No key is stored in the source tree. Until set, Saans serves the weather-model forecast and indicates that station coverage is not configured.
3. **Website HTTPS origin**, such as your Amplify URL, passed as `AllowedOrigin` during deployment. If the API is redeployed with a new origin, update that parameter.
4. **API base URL**, copied from the SAM stack output into `frontend-config.js` after deployment.
5. **NASA FIRMS MAP key** (free) from [FIRMS](https://firms.modaps.eosdis.nasa.gov/api/map_key/). Store it server-side only, never in browser JavaScript:

   ```powershell
   aws ssm put-parameter --name /saans/prod/firms-map-key --type SecureString --value "YOUR_FIRMS_KEY" --overwrite --region ap-south-1
   ```

   Until set, Area watch still shows the upwind zone and says the hotspot layer needs a key.
6. **Bedrock model access** for the chat and chart explanations (`BedrockModelId`, default `apac.amazon.nova-lite-v1:0`). Without it both use Gemini when `/saans/prod/gemini-api-key` exists (SecureString; `aws ssm put-parameter --type SecureString --name /saans/prod/gemini-api-key --value <key>`), else rule-based answers. A self-hosted Qwen2.5 model on a SageMaker serverless endpoint was tried as a fallback and dropped: the 1.5B model was too slow on CPU for the API timeout and the 0.5B model gave unsafe advice. Token usage is chargeable.
7. **`AppUrl`** (optional): the public site URL, linked from alert emails.

## Scope still required for the full Saans plan

This is the live-data/API foundation, not the complete feature set in the idea document. User accounts and synced profiles, smoke trajectories (the upwind wedge is a straight-line heuristic, not HYSPLIT), historical station reliability, a validated gap-fill model outside Delhi, reviewed multilingual health rules and citations, Bedrock RAG/guardrails, and production hosting/domain monitoring still need implementation and data validation. Do not present the current PM2.5 spread as model confidence, or the indicative AQI as the official CPCB AQI. Health effects on the Health page are general WHO/EPA summaries, not medical advice.
