import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeCareProfile, validateCareProfilePayload } from './care-profile';

const baseProfile = {
  id: 'profile-1',
  medicalInfo: 'Penicillin allergy',
  preferences: 'Prefers calm verbal prompts',
  equipmentSettings: 'Wheelchair tilt at 12 degrees',
  emergencyContacts: 'Paul 0400 000 000',
  medicationSchedule: '08:00 and 20:00',
  internalNotes: 'Family-only respite coordination note',
  createdAt: new Date('2026-05-20T00:00:00Z'),
  updatedAt: new Date('2026-05-20T10:00:00Z'),
  updatedBy: { id: 'user-1', name: 'Paul', role: 'FAMILY' },
};

test('validateCareProfilePayload trims required and optional fields', () => {
  const result = validateCareProfilePayload({
    medicalInfo: ' Penicillin allergy ',
    preferences: ' Calm verbal prompts ',
    equipmentSettings: ' Chair tilt 12 degrees ',
    emergencyContacts: ' Paul 0400 000 000 ',
    medicationSchedule: ' 08:00 / 20:00 ',
    internalNotes: ' Family-only note ',
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error('Expected valid result');
  }

  assert.deepEqual(result.data, {
    medicalInfo: 'Penicillin allergy',
    preferences: 'Calm verbal prompts',
    equipmentSettings: 'Chair tilt 12 degrees',
    emergencyContacts: 'Paul 0400 000 000',
    medicationSchedule: '08:00 / 20:00',
    internalNotes: 'Family-only note',
  });
});

test('validateCareProfilePayload rejects blank required fields', () => {
  const result = validateCareProfilePayload({
    medicalInfo: ' ',
    preferences: 'Calm prompts',
    equipmentSettings: 'Chair tilt 12 degrees',
    emergencyContacts: 'Paul 0400 000 000',
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error('Expected invalid result');
  }

  assert.equal(
    result.error,
    'Medical info, preferences, equipment settings, and emergency contacts are required'
  );
});

test('serializeCareProfile hides internal notes for worker-safe responses', () => {
  const serialized = serializeCareProfile(baseProfile, false);
  assert.equal(serialized.internalNotes, null);
});

test('serializeCareProfile includes internal notes for family responses', () => {
  const serialized = serializeCareProfile(baseProfile, true);
  assert.equal(serialized.internalNotes, 'Family-only respite coordination note');
});
