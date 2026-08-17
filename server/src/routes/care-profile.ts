import { Router } from 'express';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';
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

router.put('/', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    const validation = validateCareProfilePayload(req.body as Record<string, unknown>);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
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
