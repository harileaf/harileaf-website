import type { Photo, ProduceItem, ContentFields } from './cms-types';

export async function listPhotos(kv: KVNamespace): Promise<Photo[]> {
  const raw = await kv.get('photos:index');
  if (!raw) return [];
  const keys: Array<{ key: string; label: string; category?: string }> = JSON.parse(raw);
  return keys.map(({ key, label, category }) => ({
    key,
    label,
    category,
    url: `/api/photos/image?key=${encodeURIComponent(key)}`,
  }));
}

export async function addPhoto(kv: KVNamespace, r2: R2Bucket, file: File, label: string, category?: string): Promise<Photo> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const key = `photos/${Date.now()}-${safeLabel}.${ext}`;
  await r2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  const existing = await listPhotos(kv);
  const updated = [
    ...existing.map(({ key: k, label: l, category: c }) => ({ key: k, label: l, category: c })),
    { key, label, category },
  ];
  await kv.put('photos:index', JSON.stringify(updated));
  return { key, label, category, url: `/api/photos/image?key=${encodeURIComponent(key)}` };
}

export async function deletePhoto(kv: KVNamespace, r2: R2Bucket, key: string): Promise<void> {
  await r2.delete(key);
  const existing = await listPhotos(kv);
  const updated = existing
    .filter((p) => p.key !== key)
    .map(({ key: k, label: l, category: c }) => ({ key: k, label: l, category: c }));
  await kv.put('photos:index', JSON.stringify(updated));
}

export const DEFAULT_PRODUCE: ProduceItem[] = [
  { emoji: '🥭', name: 'Heritage Mangoes', category: 'Fruit', seasonal: true },
  { emoji: '🍉', name: 'Watermelon', category: 'Fruit', seasonal: true },
  { emoji: '🍈', name: 'Chicoo', category: 'Fruit', seasonal: false },
  { emoji: '🍈', name: 'Papaya', category: 'Fruit', seasonal: false },
  { emoji: '🍋', name: 'Lemon', category: 'Fruit', seasonal: false },
  { emoji: '🐉', name: 'Dragon Fruit', category: 'Fruit', seasonal: false },
  { emoji: '🫐', name: 'Black Jamun', category: 'Fruit', seasonal: true },
  { emoji: '🍈', name: 'Muskmelon', category: 'Fruit', seasonal: true },
  { emoji: '🍈', name: 'Laxman Fruit', category: 'Fruit', seasonal: false },
  { emoji: '🫛', name: 'Okra', category: 'Vegetable', seasonal: false },
  { emoji: '🌿', name: 'Methi', category: 'Herb', seasonal: false },
  { emoji: '🌱', name: 'Cilantro', category: 'Herb', seasonal: false },
  { emoji: '🎋', name: 'Red Amaranth', category: 'Vegetable', seasonal: false },
  { emoji: '🫘', name: 'Chavli (Cow Pea)', category: 'Vegetable', seasonal: false },
  { emoji: '🥔', name: 'Suran (Elephant Foot)', category: 'Vegetable', seasonal: false },
  { emoji: '🌻', name: 'Marigold', category: 'Flower', seasonal: true },
  { emoji: '🌹', name: 'Roses', category: 'Flower', seasonal: false },
  { emoji: '🪷', name: 'Lilies', category: 'Flower', seasonal: true },
];

export async function getProduce(kv: KVNamespace): Promise<ProduceItem[]> {
  const raw = await kv.get('produce:catalogue');
  return raw ? JSON.parse(raw) : DEFAULT_PRODUCE;
}

export async function putProduce(kv: KVNamespace, items: ProduceItem[]): Promise<void> {
  await kv.put('produce:catalogue', JSON.stringify(items));
}

export const DEFAULT_CONTENT: ContentFields = {
  heroBadge: 'HariLeaf Farm · Organic Produce',
  heroLine1: 'From the earth,',
  heroLine2: 'directly to you.',
  heroSubtitle: '18 varieties of fruits, vegetables, herbs and flowers — all organically grown on our farm, available for bulk orders.',
  catalogueHeadline: 'Everything we grow',
  photoStripHeadline: 'Growing in the open.',
  organicPromiseHeadline: 'Everything we grow is 100% organic. No chemicals, ever.',
};

export async function getContent(kv: KVNamespace): Promise<ContentFields> {
  const raw = await kv.get('content:produce-page');
  return raw ? JSON.parse(raw) : DEFAULT_CONTENT;
}

export async function putContent(kv: KVNamespace, fields: ContentFields): Promise<void> {
  await kv.put('content:produce-page', JSON.stringify(fields));
}
