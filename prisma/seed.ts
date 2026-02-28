import { PrismaClient, Role, Severity, Frequency } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Users ────────────────────────────────────────────────────────────────

  const SALT_ROUNDS = 10;

  const users = [
    { name: 'Maria', email: 'maria@house.local', password: 'maria123', role: 'mother' as Role, specialty: null },
    { name: 'Carlos', email: 'carlos@house.local', password: 'carlos123', role: 'father' as Role, specialty: null },
    { name: 'Rosa', email: 'rosa@house.local', password: 'rosa123', role: 'employee' as Role, specialty: 'housekeeper' },
    { name: 'Miguel', email: 'miguel@house.local', password: 'miguel123', role: 'employee' as Role, specialty: 'handyman' },
    { name: 'Luis', email: 'luis@house.local', password: 'luis123', role: 'employee' as Role, specialty: 'cook' },
    { name: 'Ana', email: 'ana@house.local', password: 'ana123', role: 'employee' as Role, specialty: 'pool maintenance' },
  ];

  const createdUsers: Record<string, string> = {};

  for (const userData of users) {
    const passwordHash = await bcrypt.hash(userData.password, SALT_ROUNDS);
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: { name: userData.name, passwordHash, role: userData.role, specialty: userData.specialty },
      create: {
        name: userData.name,
        email: userData.email,
        passwordHash,
        role: userData.role,
        specialty: userData.specialty,
      },
    });
    createdUsers[userData.name] = user.id;
    console.log(`  ✓ User: ${user.name} (${user.role})`);
  }

  const mariaId = createdUsers['Maria'];
  const rosaId = createdUsers['Rosa'];
  const miguelId = createdUsers['Miguel'];
  const luisId = createdUsers['Luis'];
  const anaId = createdUsers['Ana'];

  // ─── Recurring Templates ──────────────────────────────────────────────────

  const dailyCleaningTemplate = await prisma.recurringTemplate.create({
    data: {
      name: 'Daily Kitchen Cleaning',
      description: 'Clean and sanitize kitchen surfaces, stovetop, and sink. Sweep and mop the floor.',
      frequency: 'daily' as Frequency,
      assignedRoles: ['employee'],
      severityDefault: 'minor' as Severity,
      area: 'kitchen',
      category: 'cleaning',
      createdById: mariaId,
    },
  });
  console.log('  ✓ Recurring template: Daily Kitchen Cleaning');

  const weeklyPoolTemplate = await prisma.recurringTemplate.create({
    data: {
      name: 'Weekly Pool Check',
      description: 'Test and adjust pool chemicals (pH, chlorine). Skim surface debris. Check filter pressure.',
      frequency: 'weekly' as Frequency,
      assignedRoles: ['employee'],
      severityDefault: 'needs_fix_today' as Severity,
      area: 'pool',
      category: 'maintenance',
      createdById: mariaId,
    },
  });
  console.log('  ✓ Recurring template: Weekly Pool Check');

  // ─── Sample Tickets ────────────────────────────────────────────────────────

  // Ticket 1: Open — assigned to Rosa (housekeeper)
  const ticket1 = await prisma.ticket.create({
    data: {
      title: 'Clean master bathroom',
      description: 'Deep clean master bathroom: scrub tiles, clean toilet, wipe mirrors and surfaces.',
      area: 'bathroom',
      category: 'cleaning',
      severity: 'minor' as Severity,
      isInspection: false,
      status: 'open',
      assignedUserId: rosaId,
      createdById: mariaId,
    },
  });
  await prisma.ticketAuditLog.create({
    data: {
      ticketId: ticket1.id,
      changedById: mariaId,
      fromStatus: null,
      toStatus: 'open',
      note: 'Ticket created',
    },
  });
  console.log('  ✓ Ticket 1: Clean master bathroom (open, Rosa)');

  // Ticket 2: In progress — assigned to Miguel (handyman)
  const ticket2 = await prisma.ticket.create({
    data: {
      title: 'Fix leaking kitchen faucet',
      description: 'The kitchen sink faucet has been dripping. Needs repair or replacement of the washer.',
      area: 'kitchen',
      category: 'repair',
      severity: 'needs_fix_today' as Severity,
      isInspection: false,
      status: 'in_progress',
      assignedUserId: miguelId,
      createdById: mariaId,
      dueAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours from now
    },
  });
  await prisma.ticketAuditLog.createMany({
    data: [
      {
        ticketId: ticket2.id,
        changedById: mariaId,
        fromStatus: null,
        toStatus: 'open',
        note: 'Ticket created',
      },
      {
        ticketId: ticket2.id,
        changedById: miguelId,
        fromStatus: 'open',
        toStatus: 'in_progress',
        note: null,
      },
    ],
  });
  console.log('  ✓ Ticket 2: Fix leaking faucet (in_progress, Miguel)');

  // Ticket 3: Needs review — assigned to Ana (pool)
  const ticket3 = await prisma.ticket.create({
    data: {
      title: 'Urgent pool chemical imbalance',
      description: 'pH levels are dangerously high. Requires immediate treatment before anyone can use the pool.',
      area: 'pool',
      category: 'maintenance',
      severity: 'immediate_interrupt' as Severity,
      isInspection: true,
      status: 'needs_review',
      assignedUserId: anaId,
      createdById: mariaId,
      recurringTemplateId: weeklyPoolTemplate.id,
    },
  });
  await prisma.ticketAuditLog.createMany({
    data: [
      {
        ticketId: ticket3.id,
        changedById: mariaId,
        fromStatus: null,
        toStatus: 'open',
        note: 'Generated from weekly pool check',
      },
      {
        ticketId: ticket3.id,
        changedById: anaId,
        fromStatus: 'open',
        toStatus: 'in_progress',
        note: null,
      },
      {
        ticketId: ticket3.id,
        changedById: anaId,
        fromStatus: 'in_progress',
        toStatus: 'needs_review',
        note: 'Chemicals balanced and documented',
      },
    ],
  });
  console.log('  ✓ Ticket 3: Pool chemical imbalance (needs_review, Ana)');

  // Ticket 4: Closed — assigned to Luis (cook)
  const ticket4 = await prisma.ticket.create({
    data: {
      title: 'Weekly meal prep organization',
      description: 'Organize pantry and refrigerator. Label and date all meal prep containers.',
      area: 'kitchen',
      category: 'organization',
      severity: 'minor' as Severity,
      isInspection: false,
      status: 'closed',
      assignedUserId: luisId,
      createdById: mariaId,
      closedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
  });
  await prisma.ticketAuditLog.createMany({
    data: [
      {
        ticketId: ticket4.id,
        changedById: mariaId,
        fromStatus: null,
        toStatus: 'open',
        note: 'Ticket created',
      },
      {
        ticketId: ticket4.id,
        changedById: luisId,
        fromStatus: 'open',
        toStatus: 'in_progress',
        note: null,
      },
      {
        ticketId: ticket4.id,
        changedById: luisId,
        fromStatus: 'in_progress',
        toStatus: 'needs_review',
        note: 'All done',
      },
      {
        ticketId: ticket4.id,
        changedById: mariaId,
        fromStatus: 'needs_review',
        toStatus: 'closed',
        note: 'Looks great',
      },
    ],
  });
  console.log('  ✓ Ticket 4: Meal prep organization (closed, Luis)');

  // Ticket 5: Open — inspection ticket (before+after required)
  const ticket5 = await prisma.ticket.create({
    data: {
      title: 'Deep clean living room — quarterly inspection',
      description: 'Full deep clean: vacuum upholstery, clean windows, dust all surfaces, shampoo carpet.',
      area: 'living',
      category: 'deep-clean',
      severity: 'minor' as Severity,
      isInspection: true,
      status: 'open',
      assignedUserId: rosaId,
      createdById: mariaId,
    },
  });
  await prisma.ticketAuditLog.create({
    data: {
      ticketId: ticket5.id,
      changedById: mariaId,
      fromStatus: null,
      toStatus: 'open',
      note: 'Quarterly inspection ticket',
    },
  });
  console.log('  ✓ Ticket 5: Living room inspection (open, Rosa)');

  console.log('\n✅ Seed complete!');
  console.log('\n📋 Login credentials:');
  console.log('   maria@house.local  / maria123  (mother)');
  console.log('   carlos@house.local / carlos123 (father)');
  console.log('   rosa@house.local   / rosa123   (employee — housekeeper)');
  console.log('   miguel@house.local / miguel123 (employee — handyman)');
  console.log('   luis@house.local   / luis123   (employee — cook)');
  console.log('   ana@house.local    / ana123    (employee — pool maintenance)');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
