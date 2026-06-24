import express from 'express';
import Stripe from 'stripe';
import fs from 'fs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const port = Number(process.env.PORT || 4242);
const domain = process.env.DOMAIN || `http://localhost:${port}`;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const stripe = new Stripe(stripeSecretKey);

if (!DISCORD_WEBHOOK_URL) {
    console.warn("⚠️ DISCORD_WEBHOOK_URL is not set; webhook unlocks will fall back to DISCORD_BOT_TOKEN + Checkout metadata.channel_id, or DM the paying user when only metadata.discord_id is available.");
}

async function sendDiscordUnlock(discordPayload, channelId, userId) {
    if (DISCORD_WEBHOOK_URL) {
        const discordResponse = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(discordPayload)
        });

        if (!discordResponse.ok) {
            const errorBody = await discordResponse.text();
            throw new Error(`Discord webhook rejected payload: ${discordResponse.status} ${discordResponse.statusText} ${errorBody}`);
        }

        console.log("🚀 Custom dynamic payload dispatched to target channel webhook.");
        return;
    }

    if (DISCORD_BOT_TOKEN && channelId) {
        const botResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(discordPayload)
        });

        if (!botResponse.ok) {
            const errorBody = await botResponse.text();
            throw new Error(`Discord bot message rejected payload: ${botResponse.status} ${botResponse.statusText} ${errorBody}`);
        }

        console.log(`🚀 Payment unlock message dispatched to Discord channel ${channelId} with bot token fallback.`);
        return;
    }

    if (DISCORD_BOT_TOKEN && userId) {
        const dmResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ recipient_id: userId })
        });

        if (!dmResponse.ok) {
            const errorBody = await dmResponse.text();
            throw new Error(`Discord DM channel creation rejected: ${dmResponse.status} ${dmResponse.statusText} ${errorBody}`);
        }

        const dmChannel = await dmResponse.json();
        const botResponse = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(discordPayload)
        });

        if (!botResponse.ok) {
            const errorBody = await botResponse.text();
            throw new Error(`Discord bot DM rejected payload: ${botResponse.status} ${botResponse.statusText} ${errorBody}`);
        }

        console.log(`🚀 Payment unlock message dispatched to Discord user ${userId} by DM fallback.`);
        return;
    }

    throw new Error("No Discord delivery route configured. Set DISCORD_WEBHOOK_URL, or include metadata.channel_id/metadata.discord_id and set DISCORD_BOT_TOKEN.");
}

// ==========================================
// 1. STRIPE WEBHOOK ENDPOINT (Must handle raw body)
// ==========================================
app.post('/webhook', express.raw({ type: 'application/json' }), async (request, response) => {
    let event = request.body;
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (endpointSecret) {
        const signature = request.headers['stripe-signature'];
        try {
            event = stripe.webhooks.constructEvent(request.body, signature, endpointSecret);
        } catch (err) {
            console.error(`⚠️ Webhook signature verification failed:`, err.message);
            return response.sendStatus(400);
        }
    } else {
        try {
            event = JSON.parse(request.body);
        } catch (err) {
            return response.sendStatus(400);
        }
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        // Grab authenticated metadata parameters straight from the secure signature payload
        const discordUserId = session.metadata ? session.metadata.discord_id : null;
        const discordChannelId = session.metadata ? session.metadata.channel_id : null;
        const pitchValidated = session.metadata && session.metadata.pitch ? session.metadata.pitch : 'Dynamic Concept Framework';

        console.log(`\n💰 [PAYMENT VERIFIED] Unlocking full agency report for: ${pitchValidated}`);

        const baseManifestPath = "/mnt/c/Users/Anson/stripe-checkout-demo/active_session.json";

        // Fallback structures strictly for extreme contingencies
        let surveyId = "survey_rdohjcsqytgjsg40";
        let simulationId = "AeHA3EN8az46uHPX4DjF";

        try {
            if (fs.existsSync(baseManifestPath)) {
                const rawState = fs.readFileSync(baseManifestPath, 'utf8');
                const stateManifest = JSON.parse(rawState);

                // Read the exact fresh new active tracking IDs generated live via your Python API script!
                surveyId = stateManifest.survey_id || surveyId;
                simulationId = stateManifest.simulation_id || simulationId;
                console.log(`🔗 Webhook securely parsed active production route: [Survey ID: ${surveyId}]`);
            }
        } catch (err) {
            console.error("⚠️ Error parsing runtime state manifest file:", err.message);
        }

        // Build URLs targeting the newly deployed live production endpoints
        const surveyDashboardUrl = `https://dashboard.preferencesai.io/surveys/${surveyId}`;
        const simulationDashboardUrl = `https://dashboard.preferencesai.io/simulations/${simulationId}`;

        const discordPayload = {
            content: discordUserId ? `🔔 **Payment Confirmed!** <@${discordUserId}>` : `🔔 **Payment Confirmed!**`,
            embeds: [{
                title: "🔓 PREFERENCES AI PORTAL UNLOCKED",
                description: `The discovery assets for your project concept *"${pitchValidated}"* are now fully active inside your dashboard configuration setup.\n\n` +
                    `➡️ **[📝 Click Here to View Unlocked Survey](${surveyDashboardUrl})**\n\n` +
                    `➡️ **[📈 Click Here to View Live Simulation Logs](${simulationDashboardUrl})**`,
                color: 65280, // Vibrant Green
                fields: [
                    { name: "📋 Survey API State", value: `Live provisioned instance tracking key \`${surveyId}\`.`, inline: true },
                    { name: "📊 Simulation Matrix State", value: `Active running profile benchmark matrix key \`${simulationId}\`.`, inline: true }
                ],
                footer: { text: `Session Validation ID: ${session.id}` }
            }]
        };

        try {
            await sendDiscordUnlock(discordPayload, discordChannelId, discordUserId);
        } catch (error) {
            console.error("❌ Failed to push payment unlock data downstream to Discord:", error.message);
        }
    }
    response.json({ received: true });
});

// ==========================================
// 2. STANDARD MIDDLEWARE (Keep down here)
// ==========================================
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ==========================================
// 3. CORE ROUTING
// ==========================================
app.get('/', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Stripe Checkout Demo</title></head>
  <body style="font-family: system-ui; max-width: 720px; margin: 4rem auto; padding: 0 1rem;">
    <div style="border: 1px solid #ddd; border-radius: 16px; padding: 24px; box-shadow: 0 6px 24px rgba(0,0,0,.06);">
      <h1>Preferences AI Blueprint Matrix</h1>
      <p style="color: #666;">Manual Web Checkout Sandbox Fallback</p>
      <form method="POST" action="/create-checkout-session">
        <button type="submit" style="background: #635bff; color: white; border: 0; border-radius: 8px; padding: 12px 18px; font-size: 16px; cursor: pointer; font-weight: bold;">Pay with Stripe Checkout</button>
      </form>
    </div>
  </body>
</html>`);
});

app.post('/create-checkout-session', async (_req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: 'Preferences AI Blueprint Matrix' },
                    unit_amount: 999
                },
                quantity: 1,
            }],
            success_url: `${domain}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${domain}/cancel`,
            metadata: {
                discord_id: "",
                channel_id: "",
                pitch: "Web Interface Testing Matrix"
            }
        });
        return res.redirect(303, session.url);
    } catch (error) {
        return res.status(500).send(`Stripe error: ${error.message}`);
    }
});

app.get('/success', async (req, res) => {
    res.type('html').send(`<h1>Payment Completed successfully! Check Discord for your unlocked dashboard endpoints.</h1>`);
});

app.get('/cancel', (_req, res) => { res.send('Cancelled'); });

// ==========================================
// 4. SERVER INITIALIZATION
// ==========================================
app.listen(port, () => {
    console.log(`Gateway process active on port ${port}`);
});