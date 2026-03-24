import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────
// Seed: Insert all 8 boards into the database
// ─────────────────────────────────────────────────────────

const BOARDS = [
  {
    id: 'classic',
    name: 'Classic',
    price: 0,
    color: '#00d4ff',
    gradient: 'from-cyan-500 to-blue-500',
    perk: 'None',
    perkDescription: 'The OG board. No perks, pure skill.',
    perkIcon: '🏓',
    rarity: 'COMMON' as const,
  },
  {
    id: 'inferno',
    name: 'Inferno',
    price: 0.005,
    color: '#f97316',
    gradient: 'from-orange-500 to-red-600',
    perk: 'Fireball',
    perkDescription: 'Ball speeds up 20% after 5 hits',
    perkIcon: '🔥',
    rarity: 'RARE' as const,
  },
  {
    id: 'frost',
    name: 'Frost Byte',
    price: 0.008,
    color: '#38bdf8',
    gradient: 'from-sky-400 to-cyan-300',
    perk: 'Freeze',
    perkDescription: 'Slow opponent paddle by 30% for 3s once per game',
    perkIcon: '❄️',
    rarity: 'RARE' as const,
  },
  {
    id: 'phantom',
    name: 'Phantom',
    price: 0.012,
    color: '#a855f7',
    gradient: 'from-purple-500 to-violet-600',
    perk: 'Invisibility',
    perkDescription: 'Ball becomes invisible for 1s once per game',
    perkIcon: '👻',
    rarity: 'EPIC' as const,
  },
  {
    id: 'thunder',
    name: 'Thunder Strike',
    price: 0.015,
    color: '#eab308',
    gradient: 'from-yellow-500 to-amber-500',
    perk: 'Lightning',
    perkDescription: 'Paddle grows 40% wider for 3s once per game',
    perkIcon: '⚡',
    rarity: 'EPIC' as const,
  },
  {
    id: 'void',
    name: 'Void Walker',
    price: 0.025,
    color: '#ec4899',
    gradient: 'from-pink-500 to-rose-600',
    perk: 'Teleport',
    perkDescription: 'Ball teleports to a random position once per game',
    perkIcon: '🌀',
    rarity: 'LEGENDARY' as const,
  },
  {
    id: 'matrix',
    name: 'The Matrix',
    price: 0.03,
    color: '#22c55e',
    gradient: 'from-green-500 to-emerald-500',
    perk: 'Slow-Mo',
    perkDescription: 'Everything slows to 50% speed for 3s once per game',
    perkIcon: '🟢',
    rarity: 'LEGENDARY' as const,
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    price: 0.05,
    color: '#8b5cf6',
    gradient: 'from-indigo-500 via-purple-500 to-pink-500',
    perk: 'Gravity Well',
    perkDescription: "Ball curves toward opponent's side for 3s",
    perkIcon: '🌌',
    rarity: 'LEGENDARY' as const,
  },
];

async function main() {
  console.log('🌱 Seeding database...\n');

  // Upsert boards (won't duplicate on re-run)
  for (const board of BOARDS) {
    const result = await prisma.board.upsert({
      where: { id: board.id },
      update: {
        name: board.name,
        price: board.price,
        color: board.color,
        gradient: board.gradient,
        perk: board.perk,
        perkDescription: board.perkDescription,
        perkIcon: board.perkIcon,
        rarity: board.rarity,
      },
      create: board,
    });
    console.log(`  ✅ Board: ${result.name} (${result.rarity}) — ${result.price} ETH`);
  }

  console.log(`\n🎉 Seeded ${BOARDS.length} boards successfully!`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
