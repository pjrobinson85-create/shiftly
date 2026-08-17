import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeIncidentOccurredAt,
  normalizeIncidentPhotos,
  validateIncidentPayload,
} from './incidents';

test('validateIncidentPayload trims fields and normalizes severity', () => {
  const result = validateIncidentPayload({
    title: ' Charger issue ',
    description: ' Powerchair charger sparked briefly ',
    severity: 'HIGH',
    occurredAt: '2026-05-20T08:30:00.000Z',
    photos: [' charger.jpg ', '', 42],
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('Expected valid result');

  assert.equal(result.data.title, 'Charger issue');
  assert.equal(result.data.description, 'Powerchair charger sparked briefly');
  assert.equal(result.data.severity, 'high');
  assert.equal(result.data.occurredAt.toISOString(), '2026-05-20T08:30:00.000Z');
  assert.deepEqual(result.data.photos, ['charger.jpg']);
});

test('validateIncidentPayload rejects blank required fields', () => {
  const result = validateIncidentPayload({
    title: ' ',
    description: 'Something happened',
    severity: 'low',
  });

  assert.equal(result.ok, false);
  if (result.ok) throw new Error('Expected invalid result');
  assert.equal(result.error, 'Title, description, and severity are required');
});

test('validateIncidentPayload rejects invalid severity', () => {
  const result = validateIncidentPayload({
    title: 'Mood change',
    description: 'Escalated quickly',
    severity: 'urgent',
  });

  assert.equal(result.ok, false);
  if (result.ok) throw new Error('Expected invalid result');
  assert.equal(result.error, 'severity must be low, medium, or high');
});

test('normalizeIncidentOccurredAt falls back to now for invalid values', () => {
  const before = Date.now();
  const value = normalizeIncidentOccurredAt('not-a-date').getTime();
  const after = Date.now();

  assert.equal(value >= before && value <= after, true);
});

test('normalizeIncidentPhotos ignores non-string and blank values', () => {
  assert.deepEqual(normalizeIncidentPhotos(undefined), []);
  assert.deepEqual(normalizeIncidentPhotos([' one.jpg ', '', 'two.jpg', null]), ['one.jpg', 'two.jpg']);
});
