export type IncidentSeverity = 'low' | 'medium' | 'high';

export interface IncidentPayload {
  title?: string;
  description?: string;
  severity?: string;
  occurredAt?: string;
  photos?: unknown;
}

function normalizeRequired(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeIncidentPhotos(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.trim())
    .filter(Boolean);
}

export function normalizeIncidentOccurredAt(value: string | undefined): Date {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
}

export function validateIncidentPayload(payload: IncidentPayload) {
  const title = normalizeRequired(payload.title);
  const description = normalizeRequired(payload.description);
  const severity = payload.severity?.toLowerCase();

  if (!title || !description || !severity) {
    return {
      ok: false as const,
      error: 'Title, description, and severity are required',
    };
  }

  if (!['low', 'medium', 'high'].includes(severity)) {
    return {
      ok: false as const,
      error: 'severity must be low, medium, or high',
    };
  }

  return {
    ok: true as const,
    data: {
      title,
      description,
      severity: severity as IncidentSeverity,
      occurredAt: normalizeIncidentOccurredAt(payload.occurredAt),
      photos: normalizeIncidentPhotos(payload.photos),
    },
  };
}
