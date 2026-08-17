import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

interface CareProfile {
  id: string;
  medicalInfo: string;
  preferences: string;
  equipmentSettings: string;
  emergencyContacts: string;
  medicationSchedule: string | null;
  internalNotes: string | null;
  updatedAt: string;
  updatedBy?: {
    id: string;
    name: string;
    role: 'FAMILY' | 'WORKER';
  } | null;
}

interface CareProfileForm {
  medicalInfo: string;
  preferences: string;
  equipmentSettings: string;
  emergencyContacts: string;
  medicationSchedule: string;
  internalNotes: string;
}

const emptyForm: CareProfileForm = {
  medicalInfo: '',
  preferences: '',
  equipmentSettings: '',
  emergencyContacts: '',
  medicationSchedule: '',
  internalNotes: '',
};

function toForm(profile: CareProfile | null): CareProfileForm {
  if (!profile) {
    return emptyForm;
  }

  return {
    medicalInfo: profile.medicalInfo,
    preferences: profile.preferences,
    equipmentSettings: profile.equipmentSettings,
    emergencyContacts: profile.emergencyContacts,
    medicationSchedule: profile.medicationSchedule ?? '',
    internalNotes: profile.internalNotes ?? '',
  };
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function splitParagraphs(value: string) {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

export default function CareProfilePage() {
  const { user } = useAuth();
  const isFamily = user?.role === 'FAMILY';
  const [profile, setProfile] = useState<CareProfile | null>(null);
  const [form, setForm] = useState<CareProfileForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get<CareProfile>('/care-profile');
      setProfile(data);
      setForm(toForm(data));
      setEditing(false);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setProfile(null);
        setForm(emptyForm);
        setEditing(isFamily);
      } else {
        setError('Failed to load care profile.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaveMessage('');

    try {
      const { data } = await api.put<CareProfile>('/care-profile', {
        medicalInfo: form.medicalInfo,
        preferences: form.preferences,
        equipmentSettings: form.equipmentSettings,
        emergencyContacts: form.emergencyContacts,
        medicationSchedule: form.medicationSchedule,
        internalNotes: form.internalNotes,
      });
      setProfile(data);
      setForm(toForm(data));
      setEditing(false);
      setSaveMessage('Care profile updated.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save care profile.');
    } finally {
      setSaving(false);
    }
  }

  const sections = useMemo(() => ([
    { key: 'medicalInfo', title: 'Medical info', value: profile?.medicalInfo ?? '' },
    { key: 'preferences', title: 'Preferences', value: profile?.preferences ?? '' },
    { key: 'equipmentSettings', title: 'Equipment settings', value: profile?.equipmentSettings ?? '' },
    { key: 'emergencyContacts', title: 'Emergency contacts', value: profile?.emergencyContacts ?? '' },
    { key: 'medicationSchedule', title: 'Medication schedule', value: profile?.medicationSchedule ?? '' },
  ]), [profile]);

  if (loading) {
    return <div style={styles.loading}>Loading care profile...</div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.pageTitle}>Care Profile</h2>
          <p style={styles.subtitle}>
            Key reference details for workers and family members.
          </p>
        </div>
        {isFamily && (
          <button
            type="button"
            style={styles.primaryBtn}
            onClick={() => {
              setEditing(prev => !prev);
              setForm(toForm(profile));
              setError('');
              setSaveMessage('');
            }}
          >
            {editing ? 'Cancel' : profile ? 'Edit Profile' : 'Create Profile'}
          </button>
        )}
      </div>

      {error && <div style={styles.error}>{error}</div>}
      {saveMessage && <div style={styles.success}>{saveMessage}</div>}

      {!profile && !editing && (
        <div style={styles.emptyCard}>
          No care profile has been created yet.
        </div>
      )}

      {editing && isFamily ? (
        <form onSubmit={saveProfile} style={styles.formCard}>
          <ProfileField
            label="Medical info"
            value={form.medicalInfo}
            onChange={value => setForm(prev => ({ ...prev, medicalInfo: value }))}
            placeholder="Allergies, seizure protocol, hydration notes..."
          />
          <ProfileField
            label="Preferences"
            value={form.preferences}
            onChange={value => setForm(prev => ({ ...prev, preferences: value }))}
            placeholder="Likes/dislikes, communication style, routines..."
          />
          <ProfileField
            label="Equipment settings"
            value={form.equipmentSettings}
            onChange={value => setForm(prev => ({ ...prev, equipmentSettings: value }))}
            placeholder="Wheelchair settings, charger location, transfer notes..."
          />
          <ProfileField
            label="Emergency contacts"
            value={form.emergencyContacts}
            onChange={value => setForm(prev => ({ ...prev, emergencyContacts: value }))}
            placeholder="Phone numbers, escalation order, emergency instructions..."
          />
          <ProfileField
            label="Medication schedule"
            value={form.medicationSchedule}
            onChange={value => setForm(prev => ({ ...prev, medicationSchedule: value }))}
            placeholder="Optional high-level medication timing guidance..."
          />
          <ProfileField
            label="Internal family-only notes"
            value={form.internalNotes}
            onChange={value => setForm(prev => ({ ...prev, internalNotes: value }))}
            placeholder="Visible only to family members..."
          />

          <div style={styles.formActions}>
            <button type="submit" style={styles.primaryBtn} disabled={saving}>
              {saving ? 'Saving…' : 'Save Care Profile'}
            </button>
          </div>
        </form>
      ) : profile ? (
        <div style={styles.grid}>
          {sections.map(section => (
            <section key={section.key} style={styles.sectionCard}>
              <h3 style={styles.sectionTitle}>{section.title}</h3>
              <SectionContent value={section.value} />
            </section>
          ))}

          {isFamily && profile.internalNotes && (
            <section style={{ ...styles.sectionCard, ...styles.internalOnlyCard }}>
              <h3 style={styles.sectionTitle}>Internal family-only notes</h3>
              <SectionContent value={profile.internalNotes} />
            </section>
          )}

          <section style={styles.metaCard}>
            <div style={styles.metaLabel}>Last updated</div>
            <div style={styles.metaValue}>{formatDateTime(profile.updatedAt)}</div>
            {profile.updatedBy && (
              <div style={styles.metaSubtle}>by {profile.updatedBy.name}</div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ProfileField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label style={styles.fieldWrap}>
      <span style={styles.fieldLabel}>{label}</span>
      <textarea
        style={styles.textarea}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
      />
    </label>
  );
}

function SectionContent({ value }: { value: string }) {
  const lines = splitParagraphs(value);

  if (!lines.length) {
    return <div style={styles.emptyValue}>Not provided.</div>;
  }

  return (
    <div style={styles.sectionBody}>
      {lines.map(line => (
        <p key={line} style={styles.sectionParagraph}>{line}</p>
      ))}
    </div>
  );
}

const styles: Record<string, any> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  loading: {
    padding: '2rem',
    color: '#64748b',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '1rem',
  },
  pageTitle: {
    margin: 0,
    fontSize: '1.75rem',
    color: '#0f172a',
  },
  subtitle: {
    margin: '0.35rem 0 0',
    color: '#64748b',
  },
  primaryBtn: {
    border: 'none',
    borderRadius: '10px',
    background: '#2563eb',
    color: '#fff',
    padding: '0.8rem 1.1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: {
    borderRadius: '12px',
    padding: '0.9rem 1rem',
    background: '#fef2f2',
    color: '#b91c1c',
  },
  success: {
    borderRadius: '12px',
    padding: '0.9rem 1rem',
    background: '#ecfdf5',
    color: '#047857',
  },
  emptyCard: {
    background: '#fff',
    borderRadius: '16px',
    padding: '1.5rem',
    color: '#64748b',
    border: '1px dashed #cbd5e1',
  },
  formCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    background: '#fff',
    borderRadius: '16px',
    padding: '1.5rem',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
  },
  fieldWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  fieldLabel: {
    fontWeight: 600,
    color: '#0f172a',
  },
  textarea: {
    width: '100%',
    minHeight: '108px',
    borderRadius: '12px',
    border: '1px solid #cbd5e1',
    padding: '0.85rem 0.95rem',
    font: 'inherit',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  grid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  },
  sectionCard: {
    background: '#fff',
    borderRadius: '16px',
    padding: '1.35rem',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
    border: '1px solid #e2e8f0',
  },
  internalOnlyCard: {
    borderColor: '#f59e0b',
    background: '#fffbeb',
  },
  sectionTitle: {
    margin: '0 0 0.75rem',
    fontSize: '1rem',
    color: '#0f172a',
  },
  sectionBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  sectionParagraph: {
    margin: 0,
    color: '#334155',
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
  },
  emptyValue: {
    color: '#94a3b8',
  },
  metaCard: {
    background: '#eff6ff',
    borderRadius: '16px',
    padding: '1.35rem',
    border: '1px solid #bfdbfe',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  metaLabel: {
    color: '#1d4ed8',
    fontWeight: 700,
    fontSize: '0.85rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  metaValue: {
    color: '#0f172a',
    fontWeight: 600,
  },
  metaSubtle: {
    color: '#475569',
  },
};
