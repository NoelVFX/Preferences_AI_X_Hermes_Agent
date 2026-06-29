# Free 24/7 cloud hosting

Recommended free always-on setup for this app:

- Oracle Cloud Always Free Ubuntu VM
- Node.js 22
- Python venv for the Discord coordinator
- PM2 to keep processes alive
- Caddy for HTTPS reverse proxy
- `sslip.io` if you do not have a custom domain

## Files used by deployment

- `server.js` — Express web app and Stripe webhook
- `agent_coordinator.py` — optional Discord slash-command worker
- `package.json` / `package-lock.json` — Node dependencies
- `requirements.txt` — Python dependencies
- `.env.example` — safe template for production environment variables
- `ecosystem.config.cjs` — PM2 process definitions

## Server setup

```bash
sudo apt update
sudo apt install -y git curl ca-certificates python3 python3-venv python3-pip
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
sudo apt install -y caddy
```

## Clone and install

```bash
cd /opt
sudo git clone https://github.com/NoelVFX/Preferences_AI_X_Hermes_Agent.git stripe-checkout-demo
sudo chown -R $USER:$USER /opt/stripe-checkout-demo
cd /opt/stripe-checkout-demo
npm ci
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

## Environment

```bash
cp .env.example .env
nano .env
```

Set at minimum:

```dotenv
PORT=4242
DOMAIN=https://<your-domain-or-ip>.sslip.io
NGROK_URL=https://<your-domain-or-ip>.sslip.io
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PREFERENCES_AI_API_KEY=...
HERMES_PREVIEW_USE_CLI=0
```

For the Discord worker also set:

```dotenv
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

Never commit `.env`.

## Caddy reverse proxy

Example `/etc/caddy/Caddyfile`:

```caddy
<your-domain-or-ip>.sslip.io {
    reverse_proxy 127.0.0.1:4242
}
```

Reload:

```bash
sudo systemctl reload caddy
```

## Start with PM2

Web app only:

```bash
pm2 start ecosystem.config.cjs --only preferences-stripe-agency
pm2 save
pm2 startup
```

Web app plus Discord worker:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Run the `sudo env ... pm2 startup ...` command PM2 prints.

## Stripe webhook

In Stripe Dashboard, add endpoint:

```text
https://<your-domain-or-ip>.sslip.io/webhook
```

Listen for:

```text
checkout.session.completed
```

Copy the signing secret to `.env` as `STRIPE_WEBHOOK_SECRET`, then restart:

```bash
pm2 restart all --update-env
```

## Verify

```bash
curl -I https://<your-domain-or-ip>.sslip.io/
curl -s https://<your-domain-or-ip>.sslip.io/api/session/test_should_404
pm2 status
```

Notes:

- Keep `DOMAIN` and `NGROK_URL` set to the final HTTPS URL before creating Stripe Checkout links.
- Do not push runtime files like `active_session.json` or `web_sessions.json`.
- Render Free and serverless hosts are not ideal for true 24/7 plus Discord gateway behavior.
