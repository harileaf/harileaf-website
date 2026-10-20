import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSession } from '../../src/lib/auth';
import { emptyStoryPage } from '../../src/lib/store/story';
import { GET as listPages } from '../../src/pages/api/admin/pages/index';
import { GET as getPage, PUT as putDraft } from '../../src/pages/api/admin/pages/[slug]/index';
import { POST as publish } from '../../src/pages/api/admin/pages/[slug]/publish';
import { PUT as putStory } from '../../src/pages/api/admin/products/[id]/story';
import { db, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

type Handler = (ctx: any) => Promise<Response>;
let token: string;
const cookies = (t?: string) => ({ get: (n: string) => (t && n === 'hl_session' ? { value: t } : undefined) });
const call = async (h: Handler, o: { params?: Record<string, string>; body?: unknown; raw?: string; auth?: boolean } = {}) => {
  const raw = o.raw ?? (o.body === undefined ? undefined : JSON.stringify(o.body));
  const res = await h({
    request: new Request('https://harileaf.org/api/admin/x', { method: raw === undefined ? 'GET' : 'POST', body: raw }),
    params: o.params ?? {}, cookies: cookies(o.auth === false ? undefined : token), locals: {},
  });
  return { status: res.status, body: (await res.json()) as any };
};
const BAD = "Couldn't read that request. Reload the page and try again.";
const draftOf = async () => String(await scalar("SELECT draft FROM story_pages WHERE slug = 'turmeric'"));

beforeEach(async () => {
  token = await createSession(env.HARILEAF_CMS);
  await db.prepare('UPDATE story_pages SET published = NULL, published_at = NULL').run();
});

describe('admin story routes', () => {
  it('401 without a session, on every route', async () => {
    const p = { params: { slug: 'turmeric', id: '1' }, auth: false };
    for (const [h, extra] of [[listPages, {}], [getPage, {}], [putDraft, { body: { draft: emptyStoryPage() } }], [publish, { body: {} }], [putStory, { body: { story: null } }]] as Array<[Handler, object]>) {
      expect((await call(h, { ...p, ...extra })).status).toBe(401);
    }
  });

  it('an empty, array, null or malformed body is 400 and changes nothing', async () => {
    const id = await insertProduct({ category_id: 2 });
    await insertVariant(id);
    const story = { icons: [{ icon: 'sun', label: 'Sun-cured' }] };
    expect((await call(putStory, { params: { id: String(id) }, body: { story } })).status).toBe(200);
    const storyBefore = await scalar(`SELECT story FROM products WHERE id = ${id}`);
    expect(storyBefore).toBeTruthy();
    const draftBefore = await draftOf();
    for (const raw of ['{}', '[]', 'null', 'not json']) {
      const s = await call(putStory, { params: { id: String(id) }, raw });
      expect(s.status).toBe(400);
      expect(s.body.error).toBe(BAD);
      const d = await call(putDraft, { params: { slug: 'turmeric' }, raw });
      expect(d.status).toBe(400);
      expect(d.body.error).toBe(BAD);
    }
    for (const bad of ['x', 5, true, []]) {
      const r = await call(putStory, { params: { id: String(id) }, body: { story: bad } });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe(BAD);
    }
    for (const draft of [null, [], 'x']) expect((await call(putDraft, { params: { slug: 'turmeric' }, body: { draft } })).status).toBe(400);
    expect(await scalar(`SELECT story FROM products WHERE id = ${id}`)).toBe(storyBefore);
    expect(await draftOf()).toBe(draftBefore);
  });

  it('{story: null} removes a story', async () => {
    const id = await insertProduct({ category_id: 2 });
    await insertVariant(id);
    await call(putStory, { params: { id: String(id) }, body: { story: { icons: [{ icon: 'sun', label: 'Sun-cured' }] } } });
    const res = await call(putStory, { params: { id: String(id) }, body: { story: null } });
    expect(res.status).toBe(200);
    expect(await scalar(`SELECT story FROM products WHERE id = ${id}`)).toBeNull();
  });
});
