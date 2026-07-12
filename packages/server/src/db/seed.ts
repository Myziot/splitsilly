import { db } from '../db';
import { categories } from '../db/schema';

const seedCategories = [
  { name: 'Food & Drink', icon: '🍔', color: '#FF6B6B' },
  { name: 'Transport', icon: '🚗', color: '#4ECDC4' },
  { name: 'Lodging', icon: '🏨', color: '#45B7D1' },
  { name: 'Activities', icon: '🎭', color: '#96CEB4' },
  { name: 'Shopping', icon: '🛍️', color: '#FFEAA7' },
  { name: 'Drinks', icon: '🍻', color: '#F6A623' },
  { name: 'Miscellaneous', icon: '📦', color: '#DDA0DD' },
];

async function seed() {
  console.log('Seeding categories...');

  for (const cat of seedCategories) {
    await db.insert(categories).values({
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      isActive: true,
    });
  }

  console.log('Categories seeded successfully!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
