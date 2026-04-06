const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

/**
 * Send a structured alert to the Discord webhook.
 * Falls back to console logging if no webhook URL is configured.
 */
export async function sendSecurityAlert(
  message: string,
  level: 'info' | 'warn' | 'error' = 'warn'
): Promise<void> {
  const tag = `[SECURITY] [${level.toUpperCase()}]`;

  if (!DISCORD_WEBHOOK_URL) {
    console.log(`${tag} ${message}`);
    return;
  }

  const colors = { info: 0x3498db, warn: 0xf39c12, error: 0xe74c3c };

  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `Chain Pong Security [${level.toUpperCase()}]`,
          description: message,
          color: colors[level],
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch (err: any) {
    console.error(`${tag} Discord webhook failed:`, err.message);
  }
}
