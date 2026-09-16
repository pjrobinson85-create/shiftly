import { Router } from 'express';
import { AuthRequest, requireAuth, requireRole, getUserPermissions } from '../middleware/auth';
import prisma from '../lib/prisma';
import { serializeCareProfile, validateCareProfilePayload } from '../lib/care-profile';

const router = Router();
router.use(requireAuth);

const CARE_PROFILE_ID = 'default-care-profile';

async function getCareProfileRecord() {
  return prisma.careProfile.findUnique({
    where: { id: CARE_PROFILE_ID },
    include: {
      updatedBy: { select: { id: true, name: true, role: true } },
    },
  });
}

router.get('/', async (req: AuthRequest, res) => {
  try {
    const profile = await getCareProfileRecord();
    if (!profile) {
      return res.status(404).json({ error: 'Care profile not found' });
    }

    const includeInternalNotes = req.user?.role === 'FAMILY';
    res.json(serializeCareProfile(profile, includeInternalNotes));
  } catch (error) {
    console.error('Get care profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/', async (req: AuthRequest, res) => {
  try {
    // Care-plan edits: admin, or a user explicitly granted the canEditCarePlan
    // flag (granted from the admin panel without full admin rights).
    const perms = await getUserPermissions(req.user!.id);
    if (!perms.isAdmin && !perms.canEditCarePlan) {
      return res
        .status(403)
        .json({ error: 'You are not allowed to edit the care plan. Ask a family admin to grant you access.' });
    }

    const validation = validateCareProfilePayload(req.body as Record<string, unknown>);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    // H2 protection: internalNotes are family-confidential. A non-FAMILY
    // editor (e.g. a worker granted canEditCarePlan) can update clinical
    // fields but must NOT overwrite the internal notes — preserve whatever
    // is stored rather than accepting (usually blank) client input.
    const isFamilyOrAdmin = req.user!.role === 'FAMILY' || perms.isAdmin;
    if (!isFamilyOrAdmin) {
      const existing = await prisma.careProfile.findUnique({
        where: { id: CARE_PROFILE_ID },
      });
      validation.data.internalNotes = existing?.internalNotes ?? null;
    }

    const profile = await prisma.careProfile.upsert({
      where: { id: CARE_PROFILE_ID },
      update: {
        ...validation.data,
        updatedById: req.user?.id,
      },
      create: {
        id: CARE_PROFILE_ID,
        ...validation.data,
        updatedById: req.user?.id,
      },
      include: {
        updatedBy: { select: { id: true, name: true, role: true } },
      },
    });

    res.status(200).json(serializeCareProfile(profile, true));
  } catch (error) {
    console.error('Upsert care profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
