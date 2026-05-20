export interface CareProfileRecord {
  id: string;
  medicalInfo: string;
  preferences: string;
  equipmentSettings: string;
  emergencyContacts: string;
  medicationSchedule: string | null;
  internalNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  updatedBy?: {
    id: string;
    name: string;
    role: string;
  } | null;
}

export interface CareProfilePayload {
  medicalInfo?: string;
  preferences?: string;
  equipmentSettings?: string;
  emergencyContacts?: string;
  medicationSchedule?: string | null;
  internalNotes?: string | null;
}

function normalizeRequired(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function validateCareProfilePayload(payload: CareProfilePayload) {
  const medicalInfo = normalizeRequired(payload.medicalInfo);
  const preferences = normalizeRequired(payload.preferences);
  const equipmentSettings = normalizeRequired(payload.equipmentSettings);
  const emergencyContacts = normalizeRequired(payload.emergencyContacts);

  if (!medicalInfo || !preferences || !equipmentSettings || !emergencyContacts) {
    return {
      ok: false as const,
      error: 'Medical info, preferences, equipment settings, and emergency contacts are required',
    };
  }

  return {
    ok: true as const,
    data: {
      medicalInfo,
      preferences,
      equipmentSettings,
      emergencyContacts,
      medicationSchedule: normalizeOptional(payload.medicationSchedule),
      internalNotes: normalizeOptional(payload.internalNotes),
    },
  };
}

export function serializeCareProfile(profile: CareProfileRecord, includeInternalNotes: boolean) {
  return {
    id: profile.id,
    medicalInfo: profile.medicalInfo,
    preferences: profile.preferences,
    equipmentSettings: profile.equipmentSettings,
    emergencyContacts: profile.emergencyContacts,
    medicationSchedule: profile.medicationSchedule,
    internalNotes: includeInternalNotes ? profile.internalNotes : null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    updatedBy: profile.updatedBy ?? null,
  };
}
