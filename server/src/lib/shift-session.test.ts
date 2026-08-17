import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveShiftStatus,
  canCheckIn,
  canCheckOut,
  normalizeShiftPhotos,
  validateCheckoutNote,
} from './shift-session';

test('deriveShiftStatus reports not-started before check-in', () => {
  assert.equal(
    deriveShiftStatus({ checkedInAt: null, checkedOutAt: null }),
    'NOT_STARTED'
  );
});

test('deriveShiftStatus reports in-progress after check-in before checkout', () => {
  assert.equal(
    deriveShiftStatus({ checkedInAt: new Date('2026-05-20T08:00:00Z'), checkedOutAt: null }),
    'IN_PROGRESS'
  );
});

test('deriveShiftStatus reports completed after checkout', () => {
  assert.equal(
    deriveShiftStatus({
      checkedInAt: new Date('2026-05-20T08:00:00Z'),
      checkedOutAt: new Date('2026-05-20T16:00:00Z'),
    }),
    'COMPLETED'
  );
});

test('check-in is only allowed before a shift has started', () => {
  assert.equal(canCheckIn({ checkedInAt: null, checkedOutAt: null }), true);
  assert.equal(
    canCheckIn({ checkedInAt: new Date('2026-05-20T08:00:00Z'), checkedOutAt: null }),
    false
  );
});

test('check-out is only allowed after check-in and before checkout', () => {
  assert.equal(canCheckOut({ checkedInAt: null, checkedOutAt: null }), false);
  assert.equal(
    canCheckOut({ checkedInAt: new Date('2026-05-20T08:00:00Z'), checkedOutAt: null }),
    true
  );
  assert.equal(
    canCheckOut({
      checkedInAt: new Date('2026-05-20T08:00:00Z'),
      checkedOutAt: new Date('2026-05-20T16:00:00Z'),
    }),
    false
  );
});

test('validateCheckoutNote rejects blank notes and trims valid ones', () => {
  assert.equal(validateCheckoutNote('   '), null);
  assert.equal(validateCheckoutNote(' Handed over meds and charger location '), 'Handed over meds and charger location');
});

test('normalizeShiftPhotos accepts only non-empty string entries', () => {
  assert.deepEqual(normalizeShiftPhotos(undefined), []);
  assert.deepEqual(normalizeShiftPhotos([' photo-1.jpg ', '', 'photo-2.jpg', 42 as never]), [
    'photo-1.jpg',
    'photo-2.jpg',
  ]);
});
