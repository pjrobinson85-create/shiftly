import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('password123', 10);
  const today = new Date().toISOString().split('T')[0];

  // Create family user
  const family = await prisma.user.upsert({
    where: { email: 'family@shiftly.test' },
    update: {},
    create: {
      email: 'family@shiftly.test',
      name: 'Paul',
      role: 'FAMILY',
      password: hashedPassword,
      phone: '+61 400 000 000',
    },
  });

  // Create worker user
  const worker = await prisma.user.upsert({
    where: { email: 'worker@shiftly.test' },
    update: {},
    create: {
      email: 'worker@shiftly.test',
      name: 'Sarah',
      role: 'WORKER',
      password: hashedPassword,
      phone: '+61 400 000 001',
    },
  });

  // Create recurring tasks
  const morningRoutine = await prisma.recurringTask.upsert({
    where: { id: 'morning-routine' },
    update: {},
    create: {
      id: 'morning-routine',
      title: 'Morning routine — meds + breakfast',
      description: 'Administer morning medication, assist with breakfast and personal care',
      dayOfWeek: undefined, // daily (null = every day)
      time: '07:30',
      priority: 'URGENT',
    },
  });

  const exercise = await prisma.recurringTask.upsert({
    where: { id: 'exercise' },
    update: {},
    create: {
      id: 'exercise',
      title: 'Exercise / physio session',
      description: 'Morning exercises and stretches as per physio plan',
      dayOfWeek: undefined,
      time: '09:00',
      priority: 'NORMAL',
    },
  });

  const lunch = await prisma.recurringTask.upsert({
    where: { id: 'lunch' },
    update: {},
    create: {
      id: 'lunch',
      title: 'Lunch preparation',
      description: 'Prepare and serve lunch, check dietary requirements',
      dayOfWeek: undefined,
      time: '12:00',
      priority: 'NORMAL',
    },
  });

  // Create today's task instances from recurring tasks
  const now = new Date();
  const tasks = [
    { title: morningRoutine.title, description: morningRoutine.description, dueDate: new Date(`${today}T${morningRoutine.time || '07:30'}:00`), priority: morningRoutine.priority as any, recurringTaskId: morningRoutine.id },
    { title: exercise.title, description: exercise.description, dueDate: new Date(`${today}T${exercise.time || '09:00'}:00`), priority: exercise.priority as any, recurringTaskId: exercise.id },
    { title: lunch.title, description: lunch.description, dueDate: new Date(`${today}T${lunch.time || '12:00'}:00`), priority: lunch.priority as any, recurringTaskId: lunch.id },
  ];

  for (const t of tasks) {
    await prisma.taskInstance.create({
      data: {
        title: t.title,
        description: t.description,
        priority: t.priority,
        dueDate: t.dueDate,
        isRecurring: true,
        recurringTaskId: t.recurringTaskId,
        createdById: family.id,
      },
    });
  }

  console.log(`Seeded ${family.name} (FAMILY) and ${worker.name} (WORKER), password: password123`);
  console.log(`Created ${tasks.length} tasks for today (${today})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => await prisma.$disconnect());
