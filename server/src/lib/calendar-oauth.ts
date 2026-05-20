import * as crypto from 'crypto';

const DEFAULT_REDIRECT_PATH = '/shiftly/calendar';
const STATE_TTL_MS = 15 * 60 * 1000;
const TOKEN_FORMAT_VERSION = 'v1';

function toBase64Url(value: Buffer | string) {
  return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url');
}

function sign(value: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function deriveEncryptionKey(secret: string) {
  return crypto.createHash('sha256').update(secret).digest();
}

export function sanitizeCalendarRedirectPath(input?: string) {
  if (!input) {
    return DEFAULT_REDIRECT_PATH;
  }

  try {
    const url = new URL(input, 'https://shiftly.local');
    if (url.origin !== 'https://shiftly.local') {
      return DEFAULT_REDIRECT_PATH;
    }

    if (!url.pathname.startsWith('/shiftly')) {
      return DEFAULT_REDIRECT_PATH;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_REDIRECT_PATH;
  }
}

export function createCalendarOAuthState({
  userId,
  redirectPath,
  secret,
  now = new Date(),
}: {
  userId: string;
  redirectPath?: string;
  secret: string;
  now?: Date;
}) {
  const payload = JSON.stringify({
    userId,
    redirectPath: sanitizeCalendarRedirectPath(redirectPath),
    issuedAt: now.toISOString(),
  });
  const encodedPayload = toBase64Url(payload);
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyCalendarOAuthState(
  state: string | undefined,
  { secret, now = new Date() }: { secret: string; now?: Date }
) {
  if (!state) {
    return null;
  }

  const [encodedPayload, providedSignature] = state.split('.');
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload, secret);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(encodedPayload).toString('utf8')) as {
      userId?: string;
      redirectPath?: string;
      issuedAt?: string;
    };

    if (!parsed.userId || !parsed.issuedAt) {
      return null;
    }

    const issuedAt = new Date(parsed.issuedAt);
    if (Number.isNaN(issuedAt.getTime())) {
      return null;
    }

    if (now.getTime() - issuedAt.getTime() > STATE_TTL_MS) {
      return null;
    }

    return {
      userId: parsed.userId,
      redirectPath: sanitizeCalendarRedirectPath(parsed.redirectPath),
    };
  } catch {
    return null;
  }
}

export function sealCalendarRefreshToken(refreshToken: string, secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveEncryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(refreshToken, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    TOKEN_FORMAT_VERSION,
    toBase64Url(iv),
    toBase64Url(authTag),
    toBase64Url(encrypted),
  ].join('.');
}

export function openCalendarRefreshToken(sealedValue: string, secret: string) {
  try {
    const [version, ivPart, authTagPart, encryptedPart] = sealedValue.split('.');
    if (version !== TOKEN_FORMAT_VERSION || !ivPart || !authTagPart || !encryptedPart) {
      return null;
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveEncryptionKey(secret), fromBase64Url(ivPart));
    decipher.setAuthTag(fromBase64Url(authTagPart));
    const decrypted = Buffer.concat([
      decipher.update(fromBase64Url(encryptedPart)),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export function getCalendarAuthFailure(error: unknown) {
  const details = error as { code?: number; message?: string; errors?: Array<{ message?: string }> };
  const combinedMessage = [details?.message, ...(details?.errors || []).map((entry) => entry.message)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (details?.code === 401 || combinedMessage.includes('invalid_grant') || combinedMessage.includes('invalid credentials')) {
    return {
      status: 401,
      message: 'Google Calendar connection expired or was revoked. Reconnect Google Calendar and try again.',
      shouldClearStoredToken: true,
    };
  }

  return {
    status: 502,
    message: 'Google Calendar sync failed. Check the server OAuth configuration and try again.',
    shouldClearStoredToken: false,
  };
}

export { DEFAULT_REDIRECT_PATH, STATE_TTL_MS };
