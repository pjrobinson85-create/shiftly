export type ShiftStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface ShiftTimingState {
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
}

export function deriveShiftStatus(state: ShiftTimingState): ShiftStatus {
  if (!state.checkedInAt) {
    return 'NOT_STARTED';
  }

  if (!state.checkedOutAt) {
    return 'IN_PROGRESS';
  }

  return 'COMPLETED';
}

export function canCheckIn(state: ShiftTimingState): boolean {
  return deriveShiftStatus(state) === 'NOT_STARTED';
}

export function canCheckOut(state: ShiftTimingState): boolean {
  return deriveShiftStatus(state) === 'IN_PROGRESS';
}

export function validateCheckoutNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeShiftPhotos(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.trim())
    .filter(Boolean);
}
