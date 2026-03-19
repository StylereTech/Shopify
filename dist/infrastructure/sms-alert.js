/**
 * SMS Alert Utility
 *
 * Sends admin SMS alerts for critical dispatch failures.
 * Uses Twilio's REST API directly without the SDK dependency.
 * Non-blocking — errors are logged but never propagate to the caller.
 */
/**
 * Send a plain SMS via Twilio REST API.
 * Returns true on success, false on failure (never throws).
 */
export async function sendSmsAlert(message, config, logger) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
    const body = new URLSearchParams({
        From: config.fromNumber,
        To: config.toNumber,
        Body: message
    });
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`
            },
            body: body.toString()
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            logger?.error('SMS alert failed', { status: response.status, body: text });
            return false;
        }
        logger?.info('SMS alert sent', { to: config.toNumber });
        return true;
    }
    catch (error) {
        logger?.error('SMS alert error', { error: String(error) });
        return false;
    }
}
/**
 * Try to send admin SMS alert from env config. Silently skips if config is missing.
 */
export async function tryAdminAlert(message, env, logger) {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER || !env.ADMIN_PHONE_NUMBER) {
        logger?.warn('Admin SMS alert skipped — Twilio config or ADMIN_PHONE_NUMBER not set');
        return;
    }
    await sendSmsAlert(message, {
        accountSid: env.TWILIO_ACCOUNT_SID,
        authToken: env.TWILIO_AUTH_TOKEN,
        fromNumber: env.TWILIO_FROM_NUMBER,
        toNumber: env.ADMIN_PHONE_NUMBER
    }, logger);
}
