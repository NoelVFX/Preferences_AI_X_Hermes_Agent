# Preferences AI Concept Validation Gateway

This project is an end-to-end concept validation workflow that takes a business or product-feature idea from Discord, asks Hermes Agent to produce a pitch-specific preview, provisions survey and simulation assets in the Preferences AI API, then uses Stripe-hosted Checkout to unlock the full dashboard links.

The system combines:

- `agent_coordinator.py` — Discord slash-command coordinator for idea validation.
- Hermes Agent — generates the free preview report and target demographic framing.
- Preferences AI API — builds a product-market-fit survey, saves it to the dashboard, and launches a digital population simulation.
- Nemoclaw / Discord runtime — exposes the workflow to users through Discord interactions and payment unlock messages.
- Stripe Checkout Sessions — collects the $9.99 unlock payment using Stripe-hosted Checkout.
- `server.js` — Express webhook and fallback checkout gateway that verifies Stripe payments and posts unlocked Preferences AI links back to Discord.

## What the workflow does

1. A Discord user runs:

```text
/validate pitch:"your business or feature idea"
```

2. `agent_coordinator.py` defers the Discord interaction and sends an immediate processing message.

3. Hermes Agent builds a free preview report for the submitted pitch:

- pitch category
- two target demographic groups
- preview affinity scores
- summary findings
- recommended validation angle

If Hermes CLI preview generation is disabled or fails, the coordinator falls back to a deterministic local market-signal model.

4. The coordinator calls the Preferences AI API to:

- build a custom product-market-fit survey from the pitch
- save the generated survey into the Preferences AI dashboard
- launch a pilot digital-population simulation for the same pitch and demographic targets

5. The coordinator writes the active survey/simulation state to:

```text
active_session.json
```

That manifest lets the Stripe webhook know which Preferences AI dashboard assets belong to the latest validation run.

6. The coordinator creates a Stripe Checkout Session for the paid unlock.

7. Discord receives a free preview embed with a Stripe button:

```text
Pay $9.99 to Unlock Full Assets
```

8. After successful payment, `server.js` receives Stripe's `checkout.session.completed` webhook, verifies the event when `STRIPE_WEBHOOK_SECRET` is configured, reads `active_session.json`, and sends a Discord webhook message containing:

- the unlocked Preferences AI survey dashboard URL
- the unlocked Preferences AI simulation dashboard URL
- the Stripe Checkout Session validation ID

## Main files

### `agent_coordinator.py`

Runs the Discord-facing validation pipeline.

Important responsibilities:

- Loads local `.env` values.
- Registers the `/validate` Discord slash command.
- Uses Hermes Agent through the `hermes` CLI to produce a structured JSON preview.
- Classifies ideas into broad market categories when Hermes preview generation is unavailable.
- Calls Preferences AI endpoints:
  - `POST /api/v1/surveys/build`
  - `POST /api/v1/surveys`
  - `POST /api/v1/simulations`
- Saves the current pitch, survey ID, simulation ID, demographics, affinity scores, and summary matrix to `active_session.json`.
- Creates a Stripe Checkout Session with Discord user and pitch metadata.
- Sends the free preview embed and paid unlock button to Discord.

### `server.js`

Runs the payment and unlock gateway.

Important responsibilities:

- Serves a small manual checkout fallback page at `/`.
- Creates a fallback Stripe Checkout Session at `/create-checkout-session`.
- Handles Stripe webhooks at `/webhook` using the raw request body.
- Verifies webhook signatures when `STRIPE_WEBHOOK_SECRET` is set.
- Responds to `checkout.session.completed` events.
- Reads `active_session.json` to find the active Preferences AI survey and simulation IDs.
- Posts the unlocked dashboard URLs to Discord through `DISCORD_WEBHOOK_URL`.
- Provides `/success` and `/cancel` return pages for Stripe Checkout.

## Architecture

```text
Discord user
   |
   | /validate pitch:"..."
   v
agent_coordinator.py
   |
   |-- Hermes Agent preview JSON
   |-- Preferences AI survey build/create
   |-- Preferences AI simulation launch
   |-- active_session.json manifest
   |
   | Stripe Checkout Session URL
   v
Discord preview embed + payment button
   |
   | successful Checkout payment
   v
Stripe webhook -> server.js /webhook
   |
   | reads active_session.json
   v
Discord unlock message with Preferences AI dashboard links
```

## Stripe design choices

This project follows the Stripe skill guidance for a safe hosted-payment workflow:

- Uses Checkout Sessions for on-session payments.
- Uses Stripe-hosted Checkout instead of collecting raw card details.
- Keeps payment completion logic server-side through webhooks.
- Uses metadata on the Checkout Session to carry the Discord user ID and pitch.
- Avoids Charges API, Sources API, Card Element, and raw card handling.

For production, keep all Stripe keys in environment variables and never hardcode live keys in source files.

## Setup

### 1. Install Node dependencies

```bash
npm install
```

### 2. Install Python dependencies

```bash
python -m pip install discord.py stripe requests
```

### 3. Create `.env`

Create a `.env` file in this project directory.

```dotenv
# Server
PORT=4242
DOMAIN=http://localhost:4242
NGROK_URL=https://your-public-ngrok-domain.ngrok-free.app

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Preferences AI
PREFERENCES_AI_API_KEY=...
PREFERENCES_SIMULATION_PRU_COST=29
PREFERENCES_REQUEST_TIMEOUT=180

# Hermes preview generation
HERMES_PREVIEW_USE_CLI=1
HERMES_COMMAND=hermes
HERMES_PROVIDER=openai-api
HERMES_MODEL=gpt-5.5
HERMES_PREVIEW_TIMEOUT=180
OPENAI_API_KEY=...

# Discord
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

`agent_coordinator.py` also expects a Discord bot token and guild ID. In the current file these are defined directly in code; for production, move them into `.env` as `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID` and read them with `os.getenv`.

## Railway deployment notes

`nixpacks.toml` installs Hermes Agent during Railway builds and puts `$HOME/.local/bin` on `PATH` at startup. Set these Railway variables so the web preview route can run Hermes instead of falling back to the local deterministic template:

```dotenv
HERMES_PREVIEW_USE_CLI=1
HERMES_COMMAND=hermes
HERMES_PROVIDER=openai-api
HERMES_MODEL=gpt-5.5
HERMES_PREVIEW_TIMEOUT=180
OPENAI_API_KEY=...
```

If Railway still falls back, check deployment logs for `Hermes preview generation failed`; the message includes command, exit code, timeout, stdout/stderr byte counts, and a stderr snippet.

## Running locally

### 1. Start the payment/unlock gateway

```bash
npm start
```

By default this starts `server.js` on:

```text
http://localhost:4242
```

### 2. Expose the webhook endpoint for Stripe

Use ngrok or another public tunnel:

```bash
ngrok http 4242
```

Set `NGROK_URL` and `DOMAIN` to the public URL when you want Stripe redirects and webhooks to point to the tunnel.

### 3. Configure the Stripe webhook

In the Stripe Dashboard or Stripe CLI, send Checkout events to:

```text
https://your-public-domain/webhook
```

Required event:

```text
checkout.session.completed
```

If using Stripe CLI locally:

```bash
stripe listen --forward-to localhost:4242/webhook
```

Copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.

### 4. Run the Discord coordinator

```bash
python agent_coordinator.py
```

Then use the Discord slash command:

```text
/validate pitch:"AI scheduling copilot for busy local service businesses"
```

## Web validation app for non-Discord users

The Express server now also serves a browser version of the Discord validation flow.

Open:

```text
http://localhost:4242
```

A visitor can enter a product/startup concept and receive:

- a pitch-specific free preview report
- Target Demographic A/B
- preview affinity scores
- summary findings
- live Preferences AI survey creation when `PREFERENCES_AI_API_KEY` is set
- optional live simulation launch when `WEB_RUN_LIVE_SIMULATION` is enabled
- a Stripe Checkout URL for the paid dashboard unlock

Main web endpoints:

```text
GET  /                  Browser app
POST /api/validate      Generate preview, create Preferences AI assets, create Stripe Checkout Session
GET  /success           Verify Stripe payment and display unlocked dashboard links
GET  /cancel            Checkout cancellation page
GET  /api/session/:id   Inspect a saved web validation session without exposing locked links
```

Web-specific environment variables:

```dotenv
WEB_RUN_LIVE_SIMULATION=1
WEB_REQUIRE_PAYMENT_FOR_DASHBOARD_LINKS=1
WEB_PRICE_CENTS=999
WEB_PRICE_CURRENCY=usd
WEB_PRODUCT_NAME="Preferences AI Blueprint Matrix"
WEB_SESSION_STORE_PATH=./web_sessions.json
HERMES_PREVIEW_USE_CLI=1
HERMES_COMMAND=hermes
HERMES_PREVIEW_TIMEOUT=90
```

Set `WEB_RUN_LIVE_SIMULATION=0` if you want web visitors to create only the dashboard survey before payment. Leave `WEB_REQUIRE_PAYMENT_FOR_DASHBOARD_LINKS=1` in production so survey/simulation URLs only appear after Stripe verifies `payment_status=paid`.

The web app stores validation sessions in `web_sessions.json`. For production, replace this file store with a database keyed by `validation_id` and Stripe Checkout Session ID.

## Manual checkout fallback

The old manual checkout-only root page has been replaced by the full web validation app at `/`. The Stripe webhook and Discord unlock fallback are still supported for the Discord slash-command flow.

## Runtime state: `active_session.json`

`agent_coordinator.py` writes the latest validation state to `active_session.json`.

Example shape:

```json
{
  "pitch": "AI scheduling copilot for busy local service businesses",
  "survey_id": "survey_...",
  "simulation_id": "sim_...",
  "pitch_category": "software_productivity",
  "demographic_a": "Ops-minded founders and small-team leads aged 25-44 who already pay for productivity software",
  "demographic_b": "Time-constrained knowledge workers aged 24-40 looking to automate repetitive coordination tasks",
  "affinity_a": "76.4%",
  "affinity_b": "58.1%",
  "summary_matrix": "..."
}
```

`server.js` reads this file after Stripe confirms payment so it can unlock the correct Preferences AI survey and simulation dashboard URLs.

## Preferences AI dashboard links

After payment, the webhook message points to:

```text
https://dashboard.preferencesai.io/surveys/{survey_id}
https://dashboard.preferencesai.io/simulations/{simulation_id}
```

These IDs come from the live Preferences AI API response when available. If the Preferences AI API call fails, the coordinator preserves fallback IDs so the Discord preview and payment flow can still render.

## Operational notes

- Start `server.js` before creating paid unlock links so Stripe has a webhook target.
- Keep the public `NGROK_URL` stable while testing a Checkout Session.
- Verify `active_session.json` updates after each `/validate` run.
- Do not rely on the fallback IDs for real customer unlocks.
- Use Stripe test mode while developing.
- Use the Stripe test card `4242 4242 4242 4242` for successful test payments.
- Configure webhook signature verification before handling production payments.
- Move all secrets out of source code before deployment.

## Production checklist

- Move Discord bot token, guild ID, Preferences AI API key, and Stripe keys into `.env` or a secrets manager.
- Remove hardcoded fallback secret values from source files.
- Store validation sessions in a database keyed by Stripe Checkout Session ID instead of a single `active_session.json` file.
- Add authenticated admin access around any manual dashboard or fallback checkout route.
- Add durable logging for Preferences AI API request IDs and Stripe event IDs.
- Handle duplicate Stripe webhook deliveries idempotently.
- Add a fulfillment record after each successful unlock.
- Review taxes, receipts, refunds, disputes, and Stripe go-live requirements.

## Quick test path

```bash
npm install
python -m pip install discord.py stripe requests
npm start
# in another terminal
python agent_coordinator.py
```

Then run `/validate` in Discord, pay through Stripe test Checkout, and confirm the Discord webhook posts the Preferences AI survey and simulation links.
