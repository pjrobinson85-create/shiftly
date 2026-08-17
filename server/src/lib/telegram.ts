import { Bot } from 'node-telegram-bot-api';

const BOT_TOKEN = process.env.SHIFTLY_TELEGRAM_TOKEN;
const CHAT_ID = process.env.SHIFTLY_TELEGRAM_CHAT_ID;

let bot: Bot | null = null;

function getBot(): Bot | null {
  if (!BOT_TOKEN || !CHAT_ID) return null;
  if (!bot) {
    // v2 transport is fetch-based; no polling needed for outbound-only alerts.
    bot = new Bot(BOT_TOKEN);
  }
  return bot;
}

/**
 * Send a Telegram alert to the configured family chat.
 * Fails silently (logs only) — alerting must never break a request.
 */
export async function sendAlert(text: string): Promise<boolean> {
  if (process.env.NODE_ENV === 'test') {
    console.log('[telegram] test mode — skipping alert:', text.slice(0, 80));
    return false;
  }
  const b = getBot();
  if (!b) {
    console.log('[telegram] Not configured (SHIFTLY_TELEGRAM_TOKEN / CHAT_ID missing)');
    return false;
  }
  try {
    await b.api.sendMessage({ chat_id: CHAT_ID!, text, parse_mode: 'Markdown' });
    return true;
  } catch (err) {
    console.error('[telegram] Alert failed:', (err as Error).message);
    return false;
  }
}
