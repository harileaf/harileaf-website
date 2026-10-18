/**
 * Static recipes for v1 (spec: Recipes → v1: 2–3 hand-written pages). v2 moves
 * these to a Keystatic collection. Each recipe links to the category it uses.
 */
export interface Recipe {
  slug: string;
  title: string;
  summary: string;
  image: string;
  imageAlt: string;
  prepMinutes: number;
  cookMinutes: number;
  serves: number;
  category: 'Main course' | 'Drink' | 'Breakfast';
  ingredients: string[];
  steps: string[];
  uses: Array<{ label: string; path: string }>;
  tip?: string;
}

export const RECIPES: Recipe[] = [
  {
    slug: 'konkan-masoor-khichdi',
    title: 'Konkan-style masoor khichdi with Karjat 3 rice',
    summary: 'A one-pot khichdi of unpolished short-grain rice and whole masoor, tempered with cumin, garlic and a pinch of turmeric.',
    image: '/images/placeholders/rice-karjat.jpg',
    imageAlt: 'Karjat 3 rice grains',
    prepMinutes: 25,
    cookMinutes: 30,
    serves: 4,
    category: 'Main course',
    ingredients: [
      '1 cup Karjat 3 unpolished rice, rinsed and soaked 20 minutes',
      '½ cup whole masoor (brown lentils), soaked 1 hour',
      '1 tbsp ghee or oil',
      '1 tsp cumin seeds',
      '4 cloves garlic, crushed',
      '1 green chilli, slit',
      '¼ tsp HariLeaf turmeric powder',
      '½ tsp HariLeaf red chili powder',
      '4½ cups water',
      'Salt to taste',
      'Chopped coriander to finish',
    ],
    steps: [
      'Heat the ghee in a pressure cooker or heavy pot. Add the cumin and let it splutter, then the garlic and green chilli; fry for a minute.',
      'Stir in the turmeric and red chili powder, then add the drained rice and masoor and toss for two minutes.',
      'Add the water and salt. Pressure-cook for 4 whistles, or simmer covered for about 30 minutes until soft, stirring now and then.',
      'Rest for 5 minutes, loosen with a splash of hot water if you like it softer, and finish with coriander.',
    ],
    uses: [
      { label: 'Karjat 3 rice', path: '/rice/' },
      { label: 'Turmeric & red chili powder', path: '/spices/' },
    ],
    tip: 'Unpolished rice needs a little more water and time than polished rice — the 20-minute soak makes up most of the difference.',
  },
  {
    slug: 'red-rice-pulao',
    title: 'Red rice vegetable pulao',
    summary: 'Nutty unpolished red rice cooked with whole spices and seasonal vegetables — a hearty one-pot meal.',
    image: '/images/placeholders/rice-red.jpg',
    imageAlt: 'Unpolished red rice grains',
    prepMinutes: 40,
    cookMinutes: 35,
    serves: 4,
    category: 'Main course',
    ingredients: [
      '1½ cups HariLeaf red rice, rinsed and soaked 30 minutes',
      '2 tbsp oil or ghee',
      '1 bay leaf, 4 cloves, 1 small stick cinnamon, 2 green cardamom',
      '1 onion, sliced',
      '1 tsp ginger-garlic paste',
      '2 cups mixed vegetables (carrot, beans, peas)',
      '¼ tsp HariLeaf turmeric powder',
      '3¼ cups water',
      'Salt to taste',
    ],
    steps: [
      'Heat the oil and fry the whole spices until fragrant. Add the onion and cook until golden.',
      'Add the ginger-garlic paste, then the vegetables and turmeric; stir for 2–3 minutes.',
      'Add the drained red rice, water and salt. Bring to a boil, then cover and cook on low for 30–35 minutes (or 3 whistles in a pressure cooker).',
      'Let it rest covered for 10 minutes before fluffing with a fork.',
    ],
    uses: [
      { label: 'Red rice', path: '/rice/' },
      { label: 'Turmeric powder', path: '/spices/' },
    ],
  },
  {
    slug: 'haldi-doodh',
    title: 'Haldi doodh (turmeric milk)',
    summary: 'Warm milk with stone-ground turmeric, a pinch of pepper and jaggery — a classic Indian bedtime drink.',
    image: '/images/placeholders/spice-turmeric.jpg',
    imageAlt: 'Stone-ground turmeric powder',
    prepMinutes: 2,
    cookMinutes: 5,
    serves: 1,
    category: 'Drink',
    ingredients: [
      '1 cup milk (dairy or plant-based)',
      '½ tsp HariLeaf turmeric powder',
      'A pinch of black pepper',
      'A small piece of cinnamon or a pinch of ground cardamom (optional)',
      '1–2 tsp jaggery or honey, to taste',
    ],
    steps: [
      'Warm the milk in a small pan with the turmeric, pepper and cinnamon or cardamom.',
      'Simmer gently for 3–4 minutes, stirring so the turmeric doesn\'t settle.',
      'Take off the heat, stir in the jaggery or honey, strain if you used whole spices, and serve warm.',
    ],
    uses: [{ label: 'Turmeric powder', path: '/spices/' }],
  },
];

export const recipeBySlug = (slug: string) => RECIPES.find((r) => r.slug === slug);
