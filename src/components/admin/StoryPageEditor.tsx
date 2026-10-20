/**
 * Landing-page editor (spec: Admin UX → Pages). Fixed layout: only the fields
 * this page's layout uses are shown, in page order; sections can be hidden,
 * never added or reordered. Save draft checks structure only and lists claims
 * and completeness warnings; Preview saves, then opens the saved draft in a
 * new tab (never an iframe: the preview sends X-Frame-Options DENY); Publish
 * saves, then runs the full checks.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { coerceStoryPage, HIDEABLE_SECTIONS, labValue, PAGE_LAYOUTS, PAGE_LIMITS as LIMIT, type HideableSection, type SectionKey, type StoryPage } from '../../lib/store/story';
import { fieldLabel } from '../../lib/store/story-claims';
import type { PageStatus } from '../../lib/store/story-pages';
import type { StoryPageSlug } from '../../lib/store/urls';
import { addBtn, box, btn, Field, focusFirstError, h2, ImagePicker, MessageList, MoveButtons, moved, Msg, row, sel, send, small, storyErrorLabel } from './story-ui';

/** What the editor shows of a product's story (product-sourced sections are edited on the product). */
export interface StorySummary {
  origin: string | null;
  steps: number;
  stepPhotos: number;
  comparison: { heading: string; rows: number } | null;
  grower: string | null;
  use: { heading: string; steps: number } | null;
}
type PageInfo = { status: PageStatus; draftSavedAt: string; publishedAt: string | null };
type Messages = Record<string, string>;

interface Props {
  slug: StoryPageSlug;
  draft: StoryPage;
  info: PageInfo;
  /** Products that can be linked (the page's category), plus any already linked. */
  products: Array<{ id: number; name: string; status: string; story: StorySummary | null }>;
  /** Active batch lab values (strings only) by product id. */
  labByProduct: Record<string, Record<string, string>>;
  labKeys: string[];
}

const SECTION_NAMES: Record<SectionKey, string> = {
  hero: 'Hero', cards: 'Product cards', origin: 'Origin story', photo_strip: 'Photo strip (timeline)', comparison: 'Comparison', lab_table: 'Batch lab table',
  growers: 'Who grows it', facts: 'Facts', use: 'How to cook / use', faq: 'Questions (FAQ)', note: 'Stone-grinding note', closing: 'Closing line',
};
/** Product-sourced sections and the Story-from story keys they show (for its claims messages). */
const FROM_PRODUCT: Partial<Record<SectionKey, string>> = { origin: 'originStory', photo_strip: 'processSteps', comparison: 'comparison', growers: 'grower', use: 'use' };
const STATUS_TEXT: Record<PageStatus, string> = { never: 'Never published', published: 'Published', changed: 'Unpublished changes' };
const SIGNED_OUT = 'Your sign-in has expired. Sign in again in another tab (your edits here are kept), then try again.';

const inline: CSSProperties = { textTransform: 'none', letterSpacing: 0, fontSize: '0.9rem', color: 'inherit', margin: 0 };
const linkStyle: CSSProperties = { color: '#196a5e', fontWeight: 700 };
const sub: CSSProperties = { ...box, background: '#f6f6f3', padding: '1rem' };
const h3: CSSProperties = { fontSize: '0.9rem', fontWeight: 800 };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const at = <T,>(xs: T[], i: number, patch: Partial<T>) => xs.map((y, j) => (j === i ? { ...y, ...patch } : y));
const filled = (...xs: string[]) => xs.some((x) => x.trim() !== '');
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) : '—');

const PARTS: Record<string, string> = { q: 'question', a: 'answer', title: 'title', text: 'text' };
/** A human label for a message key; never an internal key when a name is known. */
function pageLabel(key: string, names: Record<string, string>, hub = false): string {
  if (key === '_') return '';
  if (hub && key === 'storyFromProductId') return 'Products'; // the hub calls it the Turmeric card, chosen under Products
  if (key === 'hero' || key === 'hero.photoAlt') return 'Hero photo description';
  if (key === 'hero.photoKey') return 'Hero photo';
  if (key === 'hero.proof') return 'Hero lab proof';
  if (key === 'labColumns') return 'Lab table columns';
  if (key === 'facts') return 'Facts';
  if (key === 'faq') return 'Questions';
  if (key.startsWith('hidden.')) return 'Hidden sections';
  if (key.startsWith('storyFrom.')) return `Story from product → ${storyErrorLabel(key.slice(10))}`;
  const named = fieldLabel(key, names);
  if (named !== key) return named;
  const m = key.match(/^(.+)\.(q|a|title|text)$/);
  if (m) return `${fieldLabel(m[1], names)}: ${PARTS[m[2]]}`;
  return key;
}

const isMessages = (v: unknown): v is Messages => !!v && typeof v === 'object' && !Array.isArray(v);
/** Per-field messages from an error response; never "undefined". */
function readErrors(status: number, data: Record<string, unknown>, fallback: string): Messages {
  if (status === 401) return { _: SIGNED_OUT };
  const e = isMessages(data.errors) ? Object.fromEntries(Object.entries(data.errors).filter(([, m]) => typeof m === 'string' && m)) : {};
  return Object.keys(e).length ? e : { _: typeof data.error === 'string' && data.error && !/^Not (saved|published)$/.test(data.error) ? data.error : fallback };
}

export default function StoryPageEditor(props: Props) {
  const layout = PAGE_LAYOUTS[props.slug];
  const hub = props.slug === 'spices';
  const [d, setD] = useState<StoryPage>(props.draft);
  const [info, setInfo] = useState<PageInfo>(props.info);
  const [errors, setErrors] = useState<Messages>({});
  const [warnings, setWarnings] = useState<Messages>({});
  const [failed, setFailed] = useState<'save' | 'publish'>('save');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [previewBlocked, setPreviewBlocked] = useState(false);
  /** Bumped on every edit, so a save only clears `dirty` when nothing changed while it was in flight. */
  const version = useRef(0);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // older browsers ask only when returnValue is set
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const edit = (fn: (p: StoryPage) => StoryPage) => {
    setD(fn);
    version.current += 1;
    setDirty(true);
  };
  const set = <K extends keyof StoryPage>(k: K, v: StoryPage[K]) => edit((p) => ({ ...p, [k]: v }));
  const setHero = (patch: Partial<StoryPage['hero']>) => edit((p) => ({ ...p, hero: { ...p.hero, ...patch } }));
  /** Row messages are keyed by position, so they no longer line up after a move or removal. */
  const dropMessages = (prefix: string) => {
    const keep = (m: Messages) => Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith(`${prefix}.`)));
    setErrors(keep);
    setWarnings(keep);
  };

  const product = (id: number | null) => props.products.find((p) => p.id === id);
  const name = (id: number) => product(id)?.name ?? `Product ${id}`;
  const names = Object.fromEntries(props.products.map((p) => [String(p.id), p.name]));
  const note = (k: string) => ({ error: errors[k], warning: warnings[k] });
  /** A row-level message (shown above the row) and the props that link the row's fields to it. */
  const rowMsgId = (k: string) => `page-msg-${k}`;
  const rowMsg = (k: string) => (errors[k] || warnings[k] ? <Msg id={rowMsgId(k)} kind={errors[k] ? 'error' : 'warning'}>{errors[k] ?? warnings[k]}</Msg> : null);
  const linkRow = (k: string) => ({ invalid: Boolean(errors[k]), describedBy: errors[k] || warnings[k] ? rowMsgId(k) : undefined });

  /** The draft_saved_at of the draft on screen: sent with each save so a stale tab can't overwrite a newer draft (409). */
  const savedAt = useRef(props.info.draftSavedAt);
  /** Read in click handlers: the buttons stay focusable while busy (aria-disabled), so clicks are ignored here. */
  const busyNow = useRef(false);

  async function refreshInfo() {
    const res = await send('/api/admin/pages', {});
    const pages = Array.isArray(res.data.pages) ? (res.data.pages as Array<Partial<PageInfo> & { slug?: string }>) : [];
    const p = pages.find((x) => x?.slug === props.slug);
    if (p?.status && p.status in STATUS_TEXT && typeof p.draftSavedAt === 'string') setInfo({ status: p.status, draftSavedAt: p.draftSavedAt, publishedAt: p.publishedAt ?? null });
  }

  /** A failure that isn't about a field (sign-in, network, another tab) is shown as its own text. */
  const failure = (e: Messages, prefix: string, rest: string) => {
    const keys = Object.keys(e);
    return keys.length === 1 && keys[0] === '_' ? `${prefix}: ${e._}` : `${prefix}: ${plural(keys.length, 'thing', 'things')} to fix ${rest}`;
  };

  async function saveDraft(forPublish = false): Promise<boolean> {
    // Send what the server stores (trimmed, empty rows dropped), so message positions match the rows on screen.
    const page = coerceStoryPage(d);
    setD(page);
    const sent = version.current;
    setMsg('Saving…');
    const res = await send(`/api/admin/pages/${props.slug}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: page, expectedSavedAt: savedAt.current }),
    });
    if (!res.ok) {
      // The edits stay on screen (a 409 included), so nothing typed is lost.
      const e = readErrors(res.status, res.data, "Couldn't save. Try again.");
      setErrors(e);
      setWarnings({});
      setFailed('save');
      setMsg(failure(e, forPublish ? 'Not published. Not saved' : 'Not saved', '(listed at the top).'));
      focusFirstError('page-editor', 'page-errors');
      return false;
    }
    if (typeof res.data.savedAt === 'string') savedAt.current = res.data.savedAt;
    const w = isMessages(res.data.warnings) ? res.data.warnings : {};
    setErrors({});
    setWarnings(w);
    if (version.current === sent) setDirty(false);
    const n = Object.keys(w).length;
    setMsg(n ? `Saved — ${plural(n, 'thing', 'things')} to fix before publishing (listed at the top and marked on the fields).` : 'Saved — ready to publish.');
    // Publish refreshes the status itself once it's done, so an earlier refresh can't land last.
    if (!forPublish) await refreshInfo();
    return true;
  }

  async function withBusy(fn: () => Promise<void>) {
    if (busyNow.current) return;
    busyNow.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      busyNow.current = false;
      setBusy(false);
    }
  }

  const previewUrl = `/admin/preview/page/${props.slug}`;
  function preview() {
    if (busyNow.current) return;
    setPreviewBlocked(false);
    // Open the tab inside the click (a tab opened after an await is often blocked), then point it at the preview once the draft is saved.
    const tab = window.open('', '_blank');
    try {
      if (tab) {
        tab.document.title = 'Preview';
        tab.document.body.style.cssText = 'font-family:system-ui,sans-serif;padding:2rem';
        tab.document.body.textContent = 'Saving preview…';
      }
    } catch {
      // Only a placeholder; the preview still opens.
    }
    void withBusy(async () => {
      let shown = false;
      try {
        if (!(await saveDraft())) return;
        if (!tab) return setPreviewBlocked(true);
        if (tab.closed) return;
        tab.opener = null;
        tab.location.href = previewUrl;
        shown = true;
      } finally {
        if (!shown && tab && !tab.closed) tab.close();
      }
    });
  }

  function publish() {
    if (busyNow.current || !window.confirm('Publish this page to the live site?')) return;
    void withBusy(async () => {
      if (!(await saveDraft(true))) return;
      setMsg('Publishing…');
      const res = await send(`/api/admin/pages/${props.slug}/publish`, { method: 'POST' });
      if (res.ok) {
        setErrors({});
        setWarnings({});
        setMsg('✓ Published. The live page refreshes within a minute.');
        await refreshInfo();
        return;
      }
      const e = readErrors(res.status, res.data, "Couldn't publish. Try again.");
      setErrors(e);
      setWarnings({});
      setFailed('publish');
      setMsg(failure(e, 'Not published', '(listed at the top and marked on the fields). The draft is saved.'));
      // A failed publish still saved the draft: refresh its status (in this same busy step, so nothing overwrites it later).
      await refreshInfo();
      focusFirstError('page-editor', 'page-errors');
    });
  }

  // ── products ────────────────────────────────────────────────────────────
  const linked = d.productIds;
  const fromLabel = hub ? 'Turmeric card' : 'Story from';
  const addProduct = (id: number) =>
    edit((p) => ({ ...p, productIds: [...p.productIds, id], storyFromProductId: p.storyFromProductId ?? (hub ? null : id) }));
  const removeProduct = (id: number) => {
    edit((p) => {
      const cardBlurbs = { ...p.cardBlurbs };
      delete cardBlurbs[String(id)];
      return {
        ...p, cardBlurbs, productIds: p.productIds.filter((x) => x !== id),
        storyFromProductId: p.storyFromProductId === id ? null : p.storyFromProductId,
        hero: { ...p.hero, proof: p.hero.proof.filter((x) => x.productId !== id) },
      };
    });
    dropMessages('hero.proof');
  };
  const removeQuestion = (id: number) => {
    const also = [
      d.cardBlurbs[String(id)] && 'its card blurb',
      d.hero.proof.some((x) => x.productId === id) && 'its hero lab proof',
      d.storyFromProductId === id && `the “${fromLabel}” choice`,
    ].filter(Boolean);
    return `Remove ${name(id)} from this page?${also.length ? ` This also removes ${also.join(' and ')}.` : ''}`;
  };

  // ── lab values ──────────────────────────────────────────────────────────
  const labKeysFor = (id: number, current: string) => [...new Set([...props.labKeys, ...Object.keys(props.labByProduct[String(id)] ?? {}), current])].filter(Boolean);
  const allLabKeys = [...new Set([...props.labKeys, ...linked.flatMap((id) => Object.keys(props.labByProduct[String(id)] ?? {}))])];
  const labNow = (id: number, key: string) => {
    const summary = props.labByProduct[String(id)];
    if (!summary) return `${name(id)} has no active batch with a visible lab report yet, so this item is hidden on the page.`;
    const v = labValue(summary, key);
    return v ? `Now: ${v} (${name(id)}, active batch)` : `${name(id)}'s active batch has no '${key}' value, so this item is hidden on the page.`;
  };

  // ── product-sourced sections ────────────────────────────────────────────
  function sourced(k: SectionKey): ReactNode {
    if (k === 'growers') {
      const growers = linked.flatMap((id) => {
        const g = product(id)?.story?.grower;
        return g ? [{ id, names: g }] : [];
      });
      return (
        <>
          <p style={small}>Grower cards come from the linked products' stories (up to 3, one per name).</p>
          {growers.length ? (
            <ul style={{ margin: '0 0 0 1.25rem', fontSize: '0.875rem' }}>
              {growers.map((g) => <li key={g.id}>{g.names} — <a href={`/admin/products/${g.id}#story`} style={linkStyle}>Edit on {name(g.id)} →</a></li>)}
            </ul>
          ) : <p style={small}>None of the linked products has a grower yet, so this section doesn't show.</p>}
        </>
      );
    }
    const id = d.storyFromProductId;
    if (id === null) return <p style={small}>Comes from the “Story from” product's story. Choose it under Products.</p>;
    const st = product(id)?.story;
    const none = (what: string) => `${name(id)} has no ${what} yet, so this section doesn't show.`;
    const text = !st ? none('story sections')
      : k === 'origin' ? (st.origin ? `“${st.origin}”` : none('origin story'))
      : k === 'photo_strip' ? (st.steps ? `${plural(st.steps, 'step', 'steps')}, ${st.stepPhotos} with photos${st.stepPhotos < 3 ? ' (with fewer than 3 photos it shows as a list)' : ''}.` : none('timeline'))
      : k === 'comparison' ? (st.comparison ? `“${st.comparison.heading}”, ${plural(st.comparison.rows, 'row', 'rows')}.` : none('comparison'))
      : st.use ? `“${st.use.heading}”, ${plural(st.use.steps, 'step', 'steps')}.` : none('how to cook/use');
    return <p style={{ fontSize: '0.875rem' }}>From {name(id)}: {text} <a href={`/admin/products/${id}#story`} style={linkStyle}>Edit on {name(id)} →</a></p>;
  }
  const sourcedMessages = (k: SectionKey) => {
    const prefix = `storyFrom.${FROM_PRODUCT[k]}`;
    return [...Object.entries(errors), ...Object.entries(warnings)]
      .filter(([key]) => key === prefix || key.startsWith(`${prefix}.`))
      .map(([key, m]) => <Msg key={key} kind={errors[key] ? 'error' : 'warning'}>{pageLabel(key, names)}: {m} Fix it on the product.</Msg>);
  };

  const busyStyle = (base: CSSProperties): CSSProperties => (busy ? { ...base, opacity: 0.5, cursor: 'progress' } : base);
  const seoHint = (n: number, max: number, what: string) => `${n}/${max} characters${n > max ? ' — too long' : ''}. ${what}`;

  return (
    <div id="page-editor" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <p style={{ fontSize: '0.875rem' }}>
        <strong>{STATUS_TEXT[info.status]}</strong> · Last saved {fmt(info.draftSavedAt)} · Last published {fmt(info.publishedAt)}
        {info.publishedAt && <> · <a href={`/${props.slug}/`} target="_blank" rel="noopener" style={linkStyle}>View live<span className="sr-only"> (opens in a new tab)</span></a></>}
      </p>
      <MessageList id="page-errors" kind="error" title={failed === 'publish' ? 'Not published. Please fix:' : 'Not saved. Please fix:'} messages={errors} label={(k) => pageLabel(k, names, hub)} />
      <MessageList id="page-warnings" kind="warning" title="Saved. Fix these before publishing:" messages={warnings} label={(k) => pageLabel(k, names, hub)} />

      <section style={box} aria-labelledby="page-seo-h">
        <h2 id="page-seo-h" style={h2}>1. Search appearance</h2>
        <Field label="Search title" {...note('seo.title')} hint={seoHint(d.seo.title.length, LIMIT.seoTitle, 'Shown in Google results and the browser tab.')}>
          <input type="text" value={d.seo.title} onChange={(e) => set('seo', { ...d.seo, title: e.target.value })} />
        </Field>
        <Field label="Search description" {...note('seo.description')} hint={seoHint(d.seo.description.length, LIMIT.seoDescription, 'Shown under the title in Google results.')}>
          <textarea rows={2} value={d.seo.description} onChange={(e) => set('seo', { ...d.seo, description: e.target.value })} />
        </Field>
      </section>

      <section style={box} aria-labelledby="page-hero-h">
        <h2 id="page-hero-h" style={h2}>2. Hero</h2>
        <div style={row}>
          <Field label="Eyebrow (small line above)" {...note('hero.eyebrow')}><input type="text" value={d.hero.eyebrow} onChange={(e) => setHero({ eyebrow: e.target.value })} /></Field>
          <Field label="Headline line 1" {...note('hero.line1')}><input type="text" value={d.hero.line1} onChange={(e) => setHero({ line1: e.target.value })} /></Field>
          <Field label="Headline line 2 (optional)" {...note('hero.line2')}><input type="text" value={d.hero.line2} onChange={(e) => setHero({ line2: e.target.value })} /></Field>
        </div>
        <Field label="Subtitle" {...note('hero.subtitle')}><textarea rows={2} value={d.hero.subtitle} onChange={(e) => setHero({ subtitle: e.target.value })} /></Field>
        <Field label="Button label" {...note('hero.ctaLabel')} hint="Jumps to the product cards, e.g. “Buy turmeric ↓”."><input type="text" value={d.hero.ctaLabel} onChange={(e) => setHero({ ctaLabel: e.target.value })} /></Field>
        <ImagePicker
          label="Hero photo (optional)" value={d.hero.photoKey} alt={d.hero.photoAlt}
          error={errors['hero.photoKey']} altError={errors.hero ?? errors['hero.photoAlt']} altWarning={warnings['hero.photoAlt'] ?? warnings.hero}
          onChange={(k, a) => setHero({ photoKey: k, photoAlt: a })}
        />
        {!hub && (
          <>
            <h3 style={h3}>Lab proof (up to {LIMIT.heroProof})</h3>
            <p style={small}>Each value is read from that product's active batch lab report. A missing value hides the item.</p>
            {rowMsg('hero.proof')}
            {d.hero.proof.map((x, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {rowMsg(`hero.proof.${i}`)}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr)) auto', gap: '0.5rem', alignItems: 'start' }}>
                  <Field label={`Proof ${i + 1}: product`} {...linkRow(`hero.proof.${i}`)}>
                    <select style={sel} value={x.productId} onChange={(e) => setHero({ proof: at(d.hero.proof, i, { productId: Number(e.target.value) }) })}>
                      {(linked.includes(x.productId) ? linked : [x.productId, ...linked]).map((id) => <option key={id} value={id}>{name(id)}</option>)}
                    </select>
                  </Field>
                  <Field label="Lab value" hint={labNow(x.productId, x.key)}>
                    <select style={sel} value={x.key} onChange={(e) => {
                      const key = e.target.value;
                      setHero({ proof: at(d.hero.proof, i, { key, label: !x.label || x.label === x.key ? key : x.label }) });
                    }}>
                      {labKeysFor(x.productId, x.key).map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </Field>
                  <Field label="Shown as" hint="Words before the value, e.g. “Curcumin”." {...linkRow(`hero.proof.${i}`)}>
                    <input type="text" value={x.label} onChange={(e) => setHero({ proof: at(d.hero.proof, i, { label: e.target.value }) })} />
                  </Field>
                  <MoveButtons
                    idPrefix="page-proof" index={i} count={d.hero.proof.length} noun="hero lab proof" confirmRemove={`Remove hero lab proof ${i + 1}${x.label ? ` (“${x.label}”)` : ''}?`}
                    onMove={(a, b) => { setHero({ proof: moved(d.hero.proof, a, b) }); dropMessages('hero.proof'); }}
                    onRemove={() => { setHero({ proof: d.hero.proof.filter((_, j) => j !== i) }); dropMessages('hero.proof'); }}
                  />
                </div>
              </div>
            ))}
            {d.hero.proof.length < LIMIT.heroProof && (linked.length > 0 ? (
              <button type="button" id="page-proof-add" style={addBtn} onClick={() => {
                const id = d.storyFromProductId ?? linked[0];
                const key = labKeysFor(id, '')[0] ?? '';
                setHero({ proof: [...d.hero.proof, { productId: id, key, label: key }] });
              }}>+ Add lab proof</button>
            ) : <p style={small}>Link a product under Products to add lab proof.</p>)}
          </>
        )}
      </section>

      <section style={box} aria-labelledby="page-products-h">
        <h2 id="page-products-h" style={h2}>3. Products</h2>
        <p style={small}>
          These products decide what wording is allowed on this page. Sections from the “Story from” product are edited on that product.
          {hub && ' The hub speaks for chilli too, so its wording is always checked as strictly as possible. Choose which product is the Turmeric card; the others get their own cards.'}
        </p>
        {rowMsg('storyFromProductId')}
        {linked.map((id, i) => {
          const p = product(id);
          return (
            <div key={id} style={sub}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <h3 style={h3}>{name(id)}{p && p.status !== 'active' ? ` (${p.status}: not shown until it's active)` : ''}</h3>
                <label style={inline}>
                  <input type="radio" name="page-story-from" checked={d.storyFromProductId === id} onChange={() => set('storyFromProductId', id)}
                    aria-invalid={errors.storyFromProductId ? true : undefined} aria-describedby={linkRow('storyFromProductId').describedBy} />
                  {' '}{fromLabel}<span className="sr-only">: {name(id)}</span>
                </label>
                <MoveButtons idPrefix="page-prod" index={i} count={linked.length} noun="product" confirmRemove={removeQuestion(id)}
                  onMove={(a, b) => set('productIds', moved(linked, a, b))} onRemove={() => removeProduct(id)} />
              </div>
              <Field label="Card blurb (one line, optional)" {...note(`cardBlurbs.${id}`)} hint="Leave empty to use the product's short description.">
                <input type="text" value={d.cardBlurbs[String(id)] ?? ''} onChange={(e) => set('cardBlurbs', { ...d.cardBlurbs, [String(id)]: e.target.value })} />
              </Field>
            </div>
          );
        })}
        {linked.length < LIMIT.products ? (
          <Field label="Add a product" {...note('productIds')}>
            <select id="page-prod-add" style={sel} value="" onChange={(e) => e.target.value && addProduct(Number(e.target.value))}>
              <option value="">Choose…</option>
              {props.products.filter((p) => !linked.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}{p.status !== 'active' ? ` (${p.status})` : ''}</option>)}
            </select>
          </Field>
        ) : rowMsg('productIds')}
      </section>

      <section style={box} aria-labelledby="page-sections-h">
        <h2 id="page-sections-h" style={h2}>4. Page sections</h2>
        <p style={small}>In the order they appear on the page. Hide a section to leave it out; sections can't be added or moved.</p>
        {layout.filter((k) => k !== 'hero' && k !== 'cards' && k !== 'closing').map((k) => {
          const hideable = (HIDEABLE_SECTIONS as readonly string[]).includes(k);
          const hidden = d.hidden.includes(k as HideableSection);
          return (
            <section key={k} style={sub} aria-labelledby={`page-sec-${k}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                <h3 id={`page-sec-${k}`} style={h3}>{SECTION_NAMES[k]}{hidden ? ' (hidden)' : ''}</h3>
                {hideable && (
                  <label style={inline}>
                    <input type="checkbox" checked={hidden} onChange={(e) => set('hidden', e.target.checked ? [...d.hidden, k as HideableSection] : d.hidden.filter((h) => h !== k))} />
                    {' '}Hide<span className="sr-only"> {SECTION_NAMES[k]}</span>
                  </label>
                )}
              </div>
              {FROM_PRODUCT[k] && <>{sourced(k)}{sourcedMessages(k)}</>}

              {k === 'lab_table' && (
                <>
                  <p style={small}>One row per visible lab report of the linked products, newest first (up to 8). Choose up to {LIMIT.labColumns} lab results as columns.</p>
                  {rowMsg('labColumns')}
                  {d.labColumns.map((c, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.5rem', alignItems: 'start' }}>
                      <Field label={`Column ${i + 1}`} {...note(`labColumns.${i}`)} {...linkRow('labColumns')}>
                        <input type="text" list="page-lab-keys" value={c} onChange={(e) => set('labColumns', d.labColumns.map((x, j) => (j === i ? e.target.value : x)))} />
                      </Field>
                      <MoveButtons idPrefix="page-col" index={i} count={d.labColumns.length} noun="column" confirmRemove={filled(c) ? `Remove column ${i + 1} (“${c}”)?` : undefined}
                        onMove={(a, b) => { set('labColumns', moved(d.labColumns, a, b)); dropMessages('labColumns'); }}
                        onRemove={() => { set('labColumns', d.labColumns.filter((_, j) => j !== i)); dropMessages('labColumns'); }} />
                    </div>
                  ))}
                  {d.labColumns.length < LIMIT.labColumns && <button type="button" id="page-col-add" style={addBtn} onClick={() => set('labColumns', [...d.labColumns, ''])}>+ Add column</button>}
                  <datalist id="page-lab-keys">{allLabKeys.map((x) => <option key={x} value={x} />)}</datalist>
                </>
              )}

              {k === 'facts' && (
                <>
                  <p style={small}>Up to {LIMIT.facts} short facts. Facts only: no health claims.</p>
                  {rowMsg('facts')}
                  {d.facts.map((f, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {rowMsg(`facts.${i}`)}
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr) auto', gap: '0.5rem', alignItems: 'start' }}>
                        <Field label={`Fact ${i + 1} title`} error={errors[`facts.${i}.title`]} {...linkRow(`facts.${i}`)}>
                          <input type="text" value={f.title} onChange={(e) => set('facts', at(d.facts, i, { title: e.target.value }))} />
                        </Field>
                        <Field label={`Fact ${i + 1} text`} error={errors[`facts.${i}.text`]} {...linkRow(`facts.${i}`)}>
                          <textarea rows={2} value={f.text} onChange={(e) => set('facts', at(d.facts, i, { text: e.target.value }))} />
                        </Field>
                        <MoveButtons idPrefix="page-fact" index={i} count={d.facts.length} noun="fact" confirmRemove={filled(f.title, f.text) ? `Remove fact ${i + 1}${f.title ? ` (“${f.title}”)` : ''}?` : undefined}
                          onMove={(a, b) => { set('facts', moved(d.facts, a, b)); dropMessages('facts'); }}
                          onRemove={() => { set('facts', d.facts.filter((_, j) => j !== i)); dropMessages('facts'); }} />
                      </div>
                    </div>
                  ))}
                  {d.facts.length < LIMIT.facts && <button type="button" id="page-fact-add" style={addBtn} onClick={() => set('facts', [...d.facts, { title: '', text: '' }])}>+ Add fact</button>}
                </>
              )}

              {k === 'faq' && (
                <>
                  <p style={small}>Up to {LIMIT.faq} questions, each with an answer.</p>
                  {rowMsg('faq')}
                  {d.faq.map((f, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {rowMsg(`faq.${i}`)}
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr) auto', gap: '0.5rem', alignItems: 'start' }}>
                        <Field label={`Question ${i + 1}`} error={errors[`faq.${i}.q`]} {...linkRow(`faq.${i}`)}>
                          <input type="text" value={f.q} onChange={(e) => set('faq', at(d.faq, i, { q: e.target.value }))} />
                        </Field>
                        <Field label={`Answer ${i + 1}`} error={errors[`faq.${i}.a`]} {...linkRow(`faq.${i}`)}>
                          <textarea rows={2} value={f.a} onChange={(e) => set('faq', at(d.faq, i, { a: e.target.value }))} />
                        </Field>
                        <MoveButtons idPrefix="page-faq" index={i} count={d.faq.length} noun="question" confirmRemove={filled(f.q, f.a) ? `Remove question ${i + 1}${f.q ? ` (“${f.q}”)` : ''}?` : undefined}
                          onMove={(a, b) => { set('faq', moved(d.faq, a, b)); dropMessages('faq'); }}
                          onRemove={() => { set('faq', d.faq.filter((_, j) => j !== i)); dropMessages('faq'); }} />
                      </div>
                    </div>
                  ))}
                  {d.faq.length < LIMIT.faq && <button type="button" id="page-faq-add" style={addBtn} onClick={() => set('faq', [...d.faq, { q: '', a: '' }])}>+ Add question</button>}
                </>
              )}

              {k === 'note' && (
                <Field label="Note" {...note('note')} hint="Shown with a link to “How we grow, mill and grind”. Leave empty to leave it out.">
                  <textarea rows={2} value={d.note} onChange={(e) => set('note', e.target.value)} />
                </Field>
              )}
            </section>
          );
        })}
      </section>

      <section style={box} aria-labelledby="page-closing-h">
        <h2 id="page-closing-h" style={h2}>5. Closing line</h2>
        <Field label="Closing line" {...note('closing')} hint="The last line on the page. Leave empty to leave it out.">
          <input type="text" value={d.closing} onChange={(e) => set('closing', e.target.value)} />
        </Field>
      </section>

      <div style={{ position: 'sticky', bottom: 0, zIndex: 10, background: '#f6f6f3', padding: '0.75rem 0', borderTop: '1px solid rgba(0,0,0,0.1)', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* aria-disabled, not disabled, while busy: a disabled button drops keyboard focus to the page. */}
        <button type="button" style={busyStyle(btn)} aria-disabled={busy} onClick={() => void withBusy(async () => { await saveDraft(); })}>Save draft</button>
        <button type="button" style={busyStyle(btn)} aria-disabled={busy} onClick={preview}>Preview<span className="sr-only"> (saves, then opens in a new tab)</span><span aria-hidden="true"> ↗</span></button>
        <button type="button" className="brand-btn" style={busyStyle({ padding: '0.6rem 1.4rem' })} aria-disabled={busy} onClick={publish}>Publish</button>
        <p className="muted" role="status" aria-live="polite">
          {msg}
          {previewBlocked && <> <a href={previewUrl} target="_blank" rel="noopener" style={linkStyle}>Open the preview<span className="sr-only"> (opens in a new tab)</span></a></>}
        </p>
        {dirty && !busy && <p className="muted">Unsaved changes</p>}
      </div>
    </div>
  );
}
