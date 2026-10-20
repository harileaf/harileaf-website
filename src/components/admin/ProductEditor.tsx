/**
 * Admin product editor (React island). Talks to /api/admin/products/*.
 * Prices are entered in rupees and sent as paise; stock is changed by an
 * adjustment (+/−) so concurrent sales are never overwritten.
 */
import { useEffect, useMemo, useState } from 'react';
import { editorMedia, editorVariants, type AdminMediaRows, type AdminVariantRow } from '../../lib/store/editor-media';
import { Batches, Images, type EditorBatch, type EditorImage, type EditorLab } from './ProductMedia';
import { addBtn, box, btn, errStyle, Field, MessageList, row, sel, send, storyErrorLabel } from './story-ui';

export type { EditorBatch, EditorImage, EditorLab };

type Claim = { code: string; text: string; evidence_note: string };
type Faq = { q: string; a: string };
type NutRow = { name: string; amount: string };

export interface EditorProduct {
  categorySlug: string; slug: string; name: string; shortDescription: string; descriptionMd: string;
  status: 'draft' | 'active' | 'discontinued'; replacementProductId: number | null;
  organicScheme: 'none' | 'pgs_green' | 'pgs_organic' | 'npop'; organicConversionSince: number | null; organicCertNumber: string | null; giName: string | null; giAuRegNumber: string | null;
  processClaims: Claim[]; howItsMade: Record<string, string>; harvestInfo: Record<string, string>; attributes: Record<string, string>;
  faq: Faq[]; bestBeforeDays: number | null; storageInstructions: string; countryOfOrigin: string; ingredients: string;
  allergenInfo: string | null; vegMark: boolean; nutrition: { per: string; source: string | null; rows: NutRow[] };
  hsnCode: string; gstRateBp: number; perishable: boolean; deliveryZoneId: string | null; codAllowed: boolean;
  seasonStartMd: string | null; seasonEndMd: string | null; offSeasonMode: 'notify' | 'preorder' | null; preorderDispatchDate: string | null;
  seoTitle: string | null; seoDescription: string | null; relatedProductIds: number[];
}

export interface EditorVariant {
  id?: number; sku: string; label: string; netQtyLabel: string; unitQtyG: number; pricePaise: number; mrpPaise: number;
  weightG: number; lengthCm: number; breadthCm: number; heightCm: number; stockAdjust: number; lowStockThreshold: number;
  active: boolean; sort: number; currentStock?: number;
}

interface Props {
  id: number | null;
  initial: EditorProduct;
  variants: EditorVariant[];
  images: EditorImage[];
  batches: EditorBatch[];
  labReports: EditorLab[];
  certUrl: string | null;
  publishedAt: string | null;
  others: Array<{ id: number; name: string }>;
  shelfWarning: string | null;
  /** Delivery zones from Store settings (for perishables). */
  zones: Array<{ id: string; name: string; enabled: boolean }>;
}

const GST_RATES = [
  { bp: 0, label: '0% (exempt)' },
  { bp: 500, label: '5%' },
  { bp: 1800, label: '18%' },
  { bp: 4000, label: '40%' },
];

const rupees = (p: number) => (Number.isFinite(p) ? String(p / 100) : '');
const toPaise = (s: string) => (s.trim() === '' ? Number.NaN : Math.round(Number(s) * 100));

/** Claim types the claims policy knows. The first eight unlock that word in copy (FSSAI Reg 4) when the claim has an evidence note. */
const CLAIM_TYPES: Array<[code: string, label: string]> = [
  ['traditional', 'Traditional'], ['natural', 'Natural'], ['pure', 'Pure'], ['authentic', 'Authentic'], ['genuine', 'Genuine'], ['real', 'Real'],
  ['original', 'Original'], ['fresh', 'Fresh'], ['stone_ground', 'Stone ground'], ['sun_dried', 'Sun dried'], ['sun_cured', 'Sun cured'],
  ['hand_harvested', 'Hand harvested'], ['hand_picked', 'Hand picked'], ['unpolished', 'Unpolished'], ['single_pass_milled', 'Single-pass milled'],
  ['no_synthetic_inputs', 'No synthetic inputs'],
];
const KNOWN_CLAIMS = new Set(CLAIM_TYPES.map(([c]) => c));

const PRODUCT_LABELS: Record<string, string> = {
  _pages: 'Published pages', story: 'Product story', settings: 'Store settings', images: 'Photos', variants: 'Pack sizes',
  categorySlug: 'Category', slug: 'URL slug', status: 'Status', replacementProductId: 'Redirect old URL to', name: 'Name',
  shortDescription: 'One-line summary', descriptionMd: 'Description', processClaims: 'Process claims', organicScheme: 'Organic scheme',
  organicCertNumber: 'Organic certificate number', organicConversionSince: 'In conversion since', giName: 'GI name',
  giAuRegNumber: 'Authorised-user registration number', bestBeforeDays: 'Best before', ingredients: 'Ingredients',
  storageInstructions: 'Storage instructions', nutrition: 'Nutrition', 'nutrition.source': 'Nutrition source', hsnCode: 'HSN code',
  gstRateBp: 'GST rate', perishable: 'Perishable', deliveryZoneId: 'Delivery zone', codAllowed: 'Cash on delivery',
  seasonStartMd: 'Season start', seasonEndMd: 'Season end', offSeasonMode: 'Out of season', preorderDispatchDate: 'Pre-order dispatch date',
  seoTitle: 'SEO title', seoDescription: 'Meta description',
};
const VARIANT_LABELS: Record<string, string> = {
  sku: 'SKU', label: 'label', netQtyLabel: 'net quantity', unitQtyG: 'pack grams', pricePaise: 'selling price', mrpPaise: 'MRP',
  weightG: 'packed weight', lengthCm: 'box length', breadthCm: 'box breadth', heightCm: 'box height', stockAdjust: 'stock', lowStockThreshold: 'low-stock alert',
};
const LIST_LABELS: Record<string, string> = { howItsMade: "How it's made", harvestInfo: 'Harvest & freshness', attributes: 'Attributes' };

/** A save message's field as the owner sees it on this screen; never an internal key when a name is known. */
function productErrorLabel(key: string): string {
  if (key === '_') return '';
  if (PRODUCT_LABELS[key]) return PRODUCT_LABELS[key];
  const v = key.match(/^variants\.(\d+)\.(\w+)$/);
  if (v) return `Pack ${Number(v[1]) + 1}: ${VARIANT_LABELS[v[2]] ?? v[2]}`;
  const n = key.match(/^nutrition\.(\d+)$/);
  if (n) return `Nutrition row ${Number(n[1]) + 1}`;
  const l = key.match(/^(howItsMade|harvestInfo|attributes)\.(.+)$/);
  if (l) return `${LIST_LABELS[l[1]]}: ${l[2]}`;
  return storyErrorLabel(key);
}

/**
 * Integer field that lets the admin type intermediate text ("-", "") — a
 * controlled type=number input coerces those to 0 and erases the minus sign.
 */
function IntInput(props: { value: number; onChange: (n: number) => void; 'aria-label'?: string; id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) {
  const [text, setText] = useState(String(props.value));
  useEffect(() => {
    // Follow outside changes (e.g. reset to 0 after saving) without clobbering "-" mid-typing.
    setText((t) => (t === '' || t === '-' || Number(t) !== props.value ? String(props.value) : t));
  }, [props.value]);
  return (
    <input
      type="text"
      inputMode="text"
      pattern="-?[0-9]*"
      id={props.id}
      aria-label={props['aria-label']}
      aria-describedby={props['aria-describedby']}
      aria-invalid={props['aria-invalid']}
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/[−–]/g, '-').trim();
        if (!/^-?\d*$/.test(t)) return;
        setText(t);
        props.onChange(t === '' || t === '-' ? 0 : Number(t));
      }}
      onBlur={() => setText(String(props.value))}
    />
  );
}

IntInput.fieldControl = true;

function KeyValues(props: { value: Record<string, string>; onChange: (v: Record<string, string>) => void; keyLabel: string; valueLabel: string }) {
  const [rows, setRows] = useState(() => Object.entries(props.value));
  const push = (next: Array<[string, string]>) => {
    setRows(next);
    props.onChange(Object.fromEntries(next.filter(([k, v]) => k.trim() && v.trim())));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {rows.map(([k, v], i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '0.5rem' }}>
          <input type="text" aria-label={props.keyLabel} placeholder={props.keyLabel} value={k} onChange={(e) => push(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
          <input type="text" aria-label={props.valueLabel} placeholder={props.valueLabel} value={v} onChange={(e) => push(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
          <button type="button" style={btn} onClick={() => push(rows.filter((_, j) => j !== i))} aria-label="Remove row">✕</button>
        </div>
      ))}
      <button type="button" style={addBtn} onClick={() => setRows([...rows, ['', '']])}>+ Add</button>
    </div>
  );
}

export default function ProductEditor(props: Props) {
  const [p, setP] = useState<EditorProduct>(props.initial);
  const [variants, setVariants] = useState<EditorVariant[]>(props.variants);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveWarnings, setSaveWarnings] = useState<Record<string, string>>({});
  /** Saved, but the form couldn't be refreshed, so a second save could apply stock changes twice. */
  const [stale, setStale] = useState(false);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [media, setMedia] = useState({ images: props.images, batches: props.batches, labReports: props.labReports });
  /** Re-reads photos, batches and lab reports after a change — without a page reload, so unsaved form edits survive. */
  async function refreshMedia() {
    if (!props.id) return;
    const res = await send(`/api/admin/products/${props.id}`, { method: 'GET' });
    if (res.ok) setMedia(editorMedia(res.data as unknown as AdminMediaRows));
  }
  const set = <K extends keyof EditorProduct>(k: K, v: EditorProduct[K]) => setP((prev) => ({ ...prev, [k]: v }));
  const err = (k: string) => errors[k];
  /** The first error for a list field (e.g. "faq.2", "howItsMade.Grinding"). */
  const listErr = (k: string) => errors[k] ?? Object.entries(errors).find(([key]) => key.startsWith(`${k}.`))?.[1];
  const published = Boolean(props.publishedAt);

  const titlePreview = useMemo(() => {
    if (p.seoTitle?.trim()) return p.seoTitle.trim();
    const first = variants.find((v) => v.active);
    return `${p.name}${first ? `, ${first.label}` : ''} | HariLeaf`;
  }, [p.seoTitle, p.name, variants]);

  async function save() {
    setSaving(true);
    setStatus('Saving…');
    setErrors({});
    setSaveWarnings({});
    const body = { product: p, variants: variants.map(({ currentStock: _cs, ...v }) => v) };
    const res = await send(props.id ? `/api/admin/products/${props.id}` : '/api/admin/products', {
      method: props.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      const id = (res.data.id as number) ?? props.id;
      const warnings = (res.data.warnings as Record<string, string> | undefined) ?? {};
      if (props.id && Object.keys(warnings).length) {
        // Stay so the owner can read what to fix. Reload the pack sizes first, so stock adjustments and new packs aren't saved twice.
        const fresh = await send(`/api/admin/products/${props.id}`, { method: 'GET' });
        const rows = fresh.ok ? (fresh.data as unknown as AdminMediaRows & { variants?: AdminVariantRow[] }) : null;
        if (rows?.variants) {
          setVariants(editorVariants(rows.variants));
          setMedia(editorMedia(rows));
        } else setStale(true);
        setSaveWarnings(warnings);
        setStatus(rows?.variants ? 'Saved, with things to fix (listed at the top).' : 'Saved, with things to fix (listed at the top). Reload the page before saving again.');
        requestAnimationFrame(() => document.getElementById('product-warnings')?.focus());
        return;
      }
      setStatus('✓ Saved');
      window.location.href = `/admin/products/${id}?saved=1`;
    } else {
      const e = (res.data.errors as Record<string, string> | undefined) ?? { _: String(res.data.error ?? 'Save failed') };
      setErrors(e);
      setStatus(`Not saved: ${Object.keys(e).length === 1 ? '1 thing' : `${Object.keys(e).length} things`} to fix (listed at the top).`);
      requestAnimationFrame(() => document.getElementById('product-errors')?.focus());
    }
  }

  const updateVariant = (i: number, patch: Partial<EditorVariant>) => setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <MessageList id="product-errors" kind="error" title="Not saved. Please fix:" messages={errors} label={productErrorLabel} />
      <MessageList id="product-warnings" kind="warning" title="Saved, with things to fix:" messages={saveWarnings} label={productErrorLabel} />
      {props.shelfWarning && <p className="warn">{props.shelfWarning}</p>}

      <section style={box}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Basics</h2>
        <div style={row}>
          <Field label="Category" error={err('categorySlug')}>
            <select value={p.categorySlug} disabled={published} onChange={(e) => set('categorySlug', e.target.value)} style={sel}>
              <option value="rice">Rice</option><option value="spices">Spices</option><option value="produce">Produce</option>
            </select>
          </Field>
          <Field label="URL slug" error={err('slug')} hint={published ? 'Locked after publishing' : `harileaf.org/${p.categorySlug}/${p.slug || '…'}`}>
            <input type="text" value={p.slug} disabled={published} onChange={(e) => set('slug', e.target.value.toLowerCase())} />
          </Field>
          <Field label="Status" error={err('status')}>
            <select value={p.status} onChange={(e) => set('status', e.target.value as EditorProduct['status'])} style={sel}>
              <option value="draft">Draft (hidden)</option><option value="active">Active (live)</option><option value="discontinued">Discontinued</option>
            </select>
          </Field>
        </div>
        {p.status === 'discontinued' && (
          <Field label="Redirect old URL to" error={err('replacementProductId')} hint="Without a replacement the page returns 410 Gone">
            <select value={p.replacementProductId ?? ''} onChange={(e) => set('replacementProductId', e.target.value ? Number(e.target.value) : null)} style={sel}>
              <option value="">— none (410) —</option>
              {props.others.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
            </select>
          </Field>
        )}
        <Field label="Name" error={err('name')}><input type="text" value={p.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="One-line summary" error={err('shortDescription')} hint="Shown under the name and used for the meta description"><textarea rows={2} value={p.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} /></Field>
        <Field label="Description" error={err('descriptionMd')}><textarea rows={5} value={p.descriptionMd} onChange={(e) => set('descriptionMd', e.target.value)} /></Field>
      </section>

      <section style={box}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Claims &amp; story</h2>
        <p className="muted">
          Only specific, evidenced claims (e.g. “Stone ground below 40 °C”). No “organic”, “chemical-free”, “naturally grown” or disease/health benefits.
          “Natural”, “fresh”, “pure”, “traditional”, “authentic”, “genuine”, “real” and “original” can appear in copy only with a claim of that type and an evidence note.
        </p>
        <Field label="Process claims" error={err('processClaims')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {p.processClaims.map((c, i) => (
              <ClaimRow key={i} index={i} claim={c} onChange={(next) => set('processClaims', p.processClaims.map((x, j) => (j === i ? next : x)))} onRemove={() => set('processClaims', p.processClaims.filter((_, j) => j !== i))} />
            ))}
            <button type="button" style={addBtn} onClick={() => set('processClaims', [...p.processClaims, { code: '', text: '', evidence_note: '' }])}>+ Add claim</button>
          </div>
        </Field>
        <Field label="How it's made" error={listErr('howItsMade')} hint="e.g. Grinding → Stone mill, below 40 °C"><KeyValues value={p.howItsMade} onChange={(v) => set('howItsMade', v)} keyLabel="Step" valueLabel="Detail" /></Field>
        <Field label="Harvest & freshness" error={listErr('harvestInfo')} hint="e.g. Harvest → Kharif 2026"><KeyValues value={p.harvestInfo} onChange={(v) => set('harvestInfo', v)} keyLabel="Label" valueLabel="Value" /></Field>
        <Field label="Attributes" error={listErr('attributes')} hint="e.g. Grain → Short, bold"><KeyValues value={p.attributes} onChange={(v) => set('attributes', v)} keyLabel="Attribute" valueLabel="Value" /></Field>
        <Field label="FAQ" hint="Facts only — no disease or health claims" error={listErr('faq')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {p.faq.map((f, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '0.5rem' }}>
                <input type="text" aria-label="Question" placeholder="Question" value={f.q} onChange={(e) => set('faq', p.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} />
                <input type="text" aria-label="Answer" placeholder="Answer" value={f.a} onChange={(e) => set('faq', p.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
                <button type="button" style={btn} aria-label="Remove question" onClick={() => set('faq', p.faq.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button type="button" style={addBtn} onClick={() => set('faq', [...p.faq, { q: '', a: '' }])}>+ Add question</button>
          </div>
        </Field>
      </section>

      <section style={box}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Organic certification</h2>
        <div style={row}>
          <Field label="Scheme" error={err('organicScheme')}>
            <select value={p.organicScheme} onChange={(e) => set('organicScheme', e.target.value as EditorProduct['organicScheme'])} style={sel}>
              <option value="none">None</option><option value="pgs_green">PGS-India Green (under conversion)</option>
              <option value="pgs_organic">PGS-India Organic</option><option value="npop">NPOP (India Organic)</option>
            </select>
          </Field>
          <Field label="Certificate number" error={err('organicCertNumber')}><input type="text" value={p.organicCertNumber ?? ''} onChange={(e) => set('organicCertNumber', e.target.value || null)} /></Field>
          <Field label="In conversion since (year)" error={err('organicConversionSince')}><input type="number" value={p.organicConversionSince ?? ''} onChange={(e) => set('organicConversionSince', e.target.value ? Number(e.target.value) : null)} /></Field>
        </div>
        {props.id && <Upload label="Certificate (PDF/JPEG/PNG)" url={`/api/admin/products/${props.id}/certificate`} accept="application/pdf,image/jpeg,image/png" current={props.certUrl} />}
      </section>

      <section style={box}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Geographical Indication</h2>
        <p className="muted">Only if you are a registered authorised user of the GI. Without the registration number, GI wording and the registered name (e.g. “Wada Kolam”) can't be used anywhere on the product or its story.</p>
        <div style={row}>
          <Field label="GI name" error={err('giName')} hint="e.g. Wada Kolam"><input type="text" value={p.giName ?? ''} onChange={(e) => set('giName', e.target.value || null)} /></Field>
          <Field label="Authorised-user registration number" error={err('giAuRegNumber')}><input type="text" value={p.giAuRegNumber ?? ''} onChange={(e) => set('giAuRegNumber', e.target.value || null)} /></Field>
        </div>
      </section>

      <section style={box}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Listing information (shown on the product page)</h2>
        <div style={row}>
          <Field label="Best before (days from packing)" error={err('bestBeforeDays')}><input type="number" value={p.bestBeforeDays ?? ''} onChange={(e) => set('bestBeforeDays', e.target.value ? Number(e.target.value) : null)} /></Field>
          <Field label="Country of origin"><input type="text" value={p.countryOfOrigin} onChange={(e) => set('countryOfOrigin', e.target.value)} /></Field>
          <Field label="Vegetarian">
            <select value={p.vegMark ? 'yes' : 'no'} onChange={(e) => set('vegMark', e.target.value === 'yes')} style={sel}><option value="yes">Yes (green mark)</option><option value="no">No</option></select>
          </Field>
        </div>
        <Field label="Ingredients" error={err('ingredients')} hint="e.g. Turmeric (100%)"><input type="text" value={p.ingredients} onChange={(e) => set('ingredients', e.target.value)} /></Field>
        <Field label="Storage instructions" error={err('storageInstructions')}><input type="text" value={p.storageInstructions} onChange={(e) => set('storageInstructions', e.target.value)} /></Field>
        <Field label="Allergen information"><input type="text" value={p.allergenInfo ?? ''} onChange={(e) => set('allergenInfo', e.target.value || null)} /></Field>
        <Field label={`Nutrition per ${p.nutrition.per}`} error={listErr('nutrition')} hint="Measured values only, with units (from a lab report)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={row}>
              <input type="text" aria-label="Per" value={p.nutrition.per} onChange={(e) => set('nutrition', { ...p.nutrition, per: e.target.value })} />
              <input type="text" aria-label="Source" placeholder="Source, e.g. Lab report KJ-2610" value={p.nutrition.source ?? ''} onChange={(e) => set('nutrition', { ...p.nutrition, source: e.target.value || null })} />
            </div>
            {p.nutrition.rows.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '0.5rem' }}>
                <input type="text" aria-label="Nutrient" value={r.name} onChange={(e) => set('nutrition', { ...p.nutrition, rows: p.nutrition.rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <input type="text" aria-label="Amount" value={r.amount} onChange={(e) => set('nutrition', { ...p.nutrition, rows: p.nutrition.rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} />
                <button type="button" style={btn} aria-label="Remove nutrient" onClick={() => set('nutrition', { ...p.nutrition, rows: p.nutrition.rows.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button type="button" style={addBtn} onClick={() => set('nutrition', { ...p.nutrition, rows: [...p.nutrition.rows, { name: '', amount: '' }] })}>+ Add nutrient</button>
          </div>
        </Field>
      </section>

      <section style={box}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Tax, payment &amp; season</h2>
        <div style={row}>
          <Field label="HSN code" error={err('hsnCode')}><input type="text" value={p.hsnCode} onChange={(e) => set('hsnCode', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="GST rate" error={err('gstRateBp')} hint="Confirm with your CA">
            <select value={p.gstRateBp} onChange={(e) => set('gstRateBp', Number(e.target.value))} style={sel}>
              {GST_RATES.map((g) => (<option key={g.bp} value={g.bp}>{g.label}</option>))}
            </select>
          </Field>
          <Field label="Perishable" error={err('perishable')}>
            <select value={p.perishable ? 'yes' : 'no'} onChange={(e) => setP((prev) => ({ ...prev, perishable: e.target.value === 'yes', codAllowed: e.target.value === 'yes' ? false : prev.codAllowed }))} style={sel}><option value="no">No</option><option value="yes">Yes (prepaid only)</option></select>
          </Field>
          {p.perishable && (
            <Field label="Delivery zone" error={err('deliveryZoneId')} hint="Zones are set in Store settings">
              <select value={p.deliveryZoneId ?? ''} onChange={(e) => set('deliveryZoneId', e.target.value || null)} style={sel}>
                <option value="">Choose…</option>
                {props.zones.map((z) => (<option key={z.id} value={z.id}>{z.name}{z.enabled ? '' : ' (not selling yet)'}</option>))}
              </select>
            </Field>
          )}
          <Field label="Cash on delivery" error={err('codAllowed')}>
            <select value={p.codAllowed ? 'yes' : 'no'} disabled={p.perishable} onChange={(e) => set('codAllowed', e.target.value === 'yes')} style={sel}><option value="yes">Allowed</option><option value="no">Not allowed</option></select>
          </Field>
        </div>
        <div style={row}>
          <Field label="Season start (MM-DD)" error={err('seasonStartMd')}><input type="text" placeholder="04-01" value={p.seasonStartMd ?? ''} onChange={(e) => set('seasonStartMd', e.target.value || null)} /></Field>
          <Field label="Season end (MM-DD)" error={err('seasonEndMd')}><input type="text" placeholder="06-30" value={p.seasonEndMd ?? ''} onChange={(e) => set('seasonEndMd', e.target.value || null)} /></Field>
          <Field label="Out of season" error={err('offSeasonMode')}>
            <select value={p.offSeasonMode ?? ''} onChange={(e) => set('offSeasonMode', (e.target.value || null) as EditorProduct['offSeasonMode'])} style={sel}><option value="">Notify me</option><option value="notify">Notify me</option><option value="preorder">Pre-order</option></select>
          </Field>
          <Field label="Pre-order dispatch date" error={err('preorderDispatchDate')}><input type="text" placeholder="YYYY-MM-DD" value={p.preorderDispatchDate ?? ''} onChange={(e) => set('preorderDispatchDate', e.target.value || null)} /></Field>
        </div>
      </section>

      <section style={box}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Pack sizes</h2>
        {err('variants') && <p style={errStyle} role="alert">{err('variants')}</p>}
        {variants.map((v, i) => {
          const ve = (k: string) => err(`variants.${i}.${k}`);
          return (
            <div key={v.id ?? `new-${i}`} style={{ background: '#fff', borderRadius: 12, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', opacity: v.active ? 1 : 0.6 }}>
              <div style={row}>
                <Field label="SKU" error={ve('sku')}><input type="text" value={v.sku} onChange={(e) => updateVariant(i, { sku: e.target.value.toUpperCase() })} /></Field>
                <Field label="Label" error={ve('label')} hint="Shown on the chip, e.g. 5 kg"><input type="text" value={v.label} onChange={(e) => updateVariant(i, { label: e.target.value })} /></Field>
                <Field label="Net quantity (as printed)" error={ve('netQtyLabel')}><input type="text" value={v.netQtyLabel} onChange={(e) => updateVariant(i, { netQtyLabel: e.target.value })} /></Field>
                <Field label="Pack grams" error={ve('unitQtyG')}><input type="number" value={Number.isFinite(v.unitQtyG) ? v.unitQtyG : ''} onChange={(e) => updateVariant(i, { unitQtyG: Number(e.target.value) })} /></Field>
              </div>
              <div style={row}>
                <Field label="Selling price (₹)" error={ve('pricePaise')}><input type="number" step="0.01" value={rupees(v.pricePaise)} onChange={(e) => updateVariant(i, { pricePaise: toPaise(e.target.value) })} /></Field>
                <Field label="Printed MRP (₹)" error={ve('mrpPaise')}><input type="number" step="0.01" value={rupees(v.mrpPaise)} onChange={(e) => updateVariant(i, { mrpPaise: toPaise(e.target.value) })} /></Field>
                <Field label={`Stock${v.currentStock !== undefined ? ` (now ${v.currentStock})` : ''}`} error={ve('stockAdjust')} hint={v.id ? 'Adjust by, e.g. +20 or −3' : 'Opening stock'}>
                  <IntInput value={v.stockAdjust} onChange={(n) => updateVariant(i, { stockAdjust: n })} />
                </Field>
                <Field label="Low-stock alert at" error={ve('lowStockThreshold')}><input type="number" value={v.lowStockThreshold} onChange={(e) => updateVariant(i, { lowStockThreshold: Number(e.target.value) })} /></Field>
              </div>
              <div style={row}>
                <Field label="Packed weight (g)" error={ve('weightG')}><input type="number" value={Number.isFinite(v.weightG) ? v.weightG : ''} onChange={(e) => updateVariant(i, { weightG: Number(e.target.value) })} /></Field>
                <Field label="Box L × B × H (cm)" error={ve('lengthCm') ?? ve('breadthCm') ?? ve('heightCm')}>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <input type="number" aria-label="Length" value={Number.isFinite(v.lengthCm) ? v.lengthCm : ''} onChange={(e) => updateVariant(i, { lengthCm: Number(e.target.value) })} />
                    <input type="number" aria-label="Breadth" value={Number.isFinite(v.breadthCm) ? v.breadthCm : ''} onChange={(e) => updateVariant(i, { breadthCm: Number(e.target.value) })} />
                    <input type="number" aria-label="Height" value={Number.isFinite(v.heightCm) ? v.heightCm : ''} onChange={(e) => updateVariant(i, { heightCm: Number(e.target.value) })} />
                  </div>
                </Field>
                <Field label="On sale">
                  <select value={v.active ? 'yes' : 'no'} onChange={(e) => updateVariant(i, { active: e.target.value === 'yes' })} style={sel}><option value="yes">Yes</option><option value="no">No (hidden)</option></select>
                </Field>
              </div>
              {/* Only unsaved packs can be removed; saved ones have orders pointing at them, so they are hidden with "On sale: No". */}
              {!v.id && (
                <button type="button" style={addBtn} aria-label={`Remove pack ${v.label || i + 1}`} onClick={() => {
                  setVariants((vs) => vs.filter((_, j) => j !== i));
                  // Pack errors are keyed by position, so they no longer line up.
                  setErrors((es) => Object.fromEntries(Object.entries(es).filter(([k]) => !k.startsWith('variants.'))));
                }}>✕ Remove pack</button>
              )}
            </div>
          );
        })}
        <button type="button" style={addBtn} onClick={() => setVariants([...variants, { sku: '', label: '', netQtyLabel: '', unitQtyG: Number.NaN, pricePaise: Number.NaN, mrpPaise: Number.NaN, weightG: Number.NaN, lengthCm: Number.NaN, breadthCm: Number.NaN, heightCm: Number.NaN, stockAdjust: 0, lowStockThreshold: 5, active: true, sort: variants.length }])}>+ Add pack size</button>
      </section>

      <section style={box}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Search appearance</h2>
        <Field label="SEO title (optional)" error={err('seoTitle')} hint={`Preview: ${titlePreview}`}><input type="text" value={p.seoTitle ?? ''} onChange={(e) => set('seoTitle', e.target.value || null)} /></Field>
        <Field label="Meta description (optional)" error={err('seoDescription')} hint={`${(p.seoDescription ?? p.shortDescription).length}/155 characters`}><textarea rows={2} value={p.seoDescription ?? ''} onChange={(e) => set('seoDescription', e.target.value || null)} /></Field>
        <Field label="Related products">
          <select multiple value={p.relatedProductIds.map(String)} onChange={(e) => set('relatedProductIds', Array.from(e.target.selectedOptions).map((o) => Number(o.value)))} style={{ width: '100%', minHeight: 90, borderRadius: 8 }}>
            {props.others.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
          </select>
        </Field>
      </section>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'sticky', bottom: 0, background: '#f6f6f3', padding: '1rem 0', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
        <button type="button" className="brand-btn" style={{ padding: '0.75rem 2rem' }} onClick={save} disabled={saving || stale}>{props.id ? 'Save product' : 'Create product'}</button>
        <p className="muted" aria-live="polite">{status}</p>
        {props.id && p.status === 'active' && <a href={`/${p.categorySlug}/${p.slug}`} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontWeight: 700, color: '#196a5e' }}>View live page ↗</a>}
      </div>

      {props.id ? (
        <>
          <Images productId={props.id} images={media.images} onChanged={refreshMedia} />
          <Batches productId={props.id} categorySlug={p.categorySlug} batches={media.batches} labReports={media.labReports} onChanged={refreshMedia} />
        </>
      ) : (
        <p className="muted">Save the product first to add photos, batches and lab reports.</p>
      )}
    </div>
  );
}

function Upload(props: { label: string; url: string; accept: string; current: string | null }) {
  const [msg, setMsg] = useState('');
  return (
    <Field label={props.label} hint={props.current ? 'A file is uploaded' : undefined}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <input type="file" accept={props.accept} onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const fd = new FormData();
          fd.append('file', f);
          setMsg('Uploading…');
          const res = await send(props.url, { method: 'POST', body: fd });
          setMsg(res.ok ? '✓ Uploaded' : String(res.data.error ?? 'Upload failed'));
        }} />
        {props.current && <a href={props.current} target="_blank" rel="noreferrer">View current</a>}
        <span className="muted" aria-live="polite">{msg}</span>
      </div>
    </Field>
  );
}

/** One process claim: a claim type picker (or a custom type), the shopper-facing text and the internal evidence note. */
function ClaimRow(props: { index: number; claim: { code: string; text: string; evidence_note: string }; onChange: (c: { code: string; text: string; evidence_note: string }) => void; onRemove: () => void }) {
  const { claim: c, index: i } = props;
  const [custom, setCustom] = useState(false);
  const isCustom = custom || (c.code !== '' && !KNOWN_CLAIMS.has(c.code));
  return (
    <fieldset style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '0.75rem', margin: 0, background: '#fff' }}>
      <legend style={{ fontWeight: 700, fontSize: '0.85rem', padding: '0 0.25rem' }}>Claim {i + 1}</legend>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr)) auto', gap: '0.5rem', alignItems: 'start' }}>
        <Field label="Claim type">
          <select style={sel} value={isCustom ? '__custom' : c.code} onChange={(e) => {
            const v = e.target.value;
            setCustom(v === '__custom');
            props.onChange({ ...c, code: v === '__custom' ? '' : v });
          }}>
            <option value="">Choose…</option>
            {CLAIM_TYPES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            <option value="__custom">Other (type it)</option>
          </select>
        </Field>
        {isCustom && (
          <Field label="Other claim type" hint="Lowercase words joined by _, e.g. slow_dried">
            <input type="text" value={c.code} onChange={(e) => props.onChange({ ...c, code: e.target.value.toLowerCase().replace(/[\s-]+/g, '_') })} />
          </Field>
        )}
        <Field label="Shown to shoppers" hint="e.g. “Stone ground below 40 °C”"><input type="text" value={c.text} onChange={(e) => props.onChange({ ...c, text: e.target.value })} /></Field>
        <Field label="Evidence note (not shown)" hint="e.g. “Village records: used for 35+ years”"><input type="text" value={c.evidence_note} onChange={(e) => props.onChange({ ...c, evidence_note: e.target.value })} /></Field>
        <button type="button" style={{ ...btn, color: '#c00', alignSelf: 'end' }} aria-label={`Remove claim ${i + 1}`} onClick={props.onRemove}>✕</button>
      </div>
    </fieldset>
  );
}
