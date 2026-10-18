/**
 * Admin product editor (React island). Talks to /api/admin/products/*.
 * Prices are entered in rupees and sent as paise; stock is changed by an
 * adjustment (+/−) so concurrent sales are never overwritten.
 */
import { useMemo, useState, type ReactNode } from 'react';

type Claim = { code: string; text: string; evidence_note: string };
type Faq = { q: string; a: string };
type NutRow = { name: string; amount: string };

export interface EditorProduct {
  categorySlug: string; slug: string; name: string; shortDescription: string; descriptionMd: string;
  status: 'draft' | 'active' | 'discontinued'; replacementProductId: number | null;
  organicScheme: 'none' | 'pgs_green' | 'pgs_organic' | 'npop'; organicConversionSince: number | null; organicCertNumber: string | null;
  processClaims: Claim[]; howItsMade: Record<string, string>; harvestInfo: Record<string, string>; attributes: Record<string, string>;
  faq: Faq[]; bestBeforeDays: number | null; storageInstructions: string; countryOfOrigin: string; ingredients: string;
  allergenInfo: string | null; vegMark: boolean; nutrition: { per: string; source: string | null; rows: NutRow[] };
  hsnCode: string; gstRateBp: number; perishable: boolean; codAllowed: boolean;
  seasonStartMd: string | null; seasonEndMd: string | null; offSeasonMode: 'notify' | 'preorder' | null; preorderDispatchDate: string | null;
  seoTitle: string | null; seoDescription: string | null; relatedProductIds: number[];
}

export interface EditorVariant {
  id?: number; sku: string; label: string; netQtyLabel: string; unitQtyG: number; pricePaise: number; mrpPaise: number;
  weightG: number; lengthCm: number; breadthCm: number; heightCm: number; stockAdjust: number; lowStockThreshold: number;
  active: boolean; sort: number; currentStock?: number;
}

export interface EditorImage { id: number; url: string; alt: string; sort: number }
export interface EditorBatch { id: number; batchCode: string; packedOn: string; groundOrMilledOn: string | null; labReportId: number | null; active: boolean }
export interface EditorLab { id: number; batchCode: string; testedOn: string; labName: string; visible: boolean; pdfUrl: string | null }

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
}

const GST_RATES = [
  { bp: 0, label: '0% (exempt)' },
  { bp: 500, label: '5%' },
  { bp: 1800, label: '18%' },
  { bp: 4000, label: '40%' },
];

const rupees = (p: number) => (Number.isFinite(p) ? String(p / 100) : '');
const toPaise = (s: string) => (s.trim() === '' ? Number.NaN : Math.round(Number(s) * 100));

const box: React.CSSProperties = { background: '#ebebea', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' };
const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' };
const small: React.CSSProperties = { fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' };
const errStyle: React.CSSProperties = { color: '#c00', fontSize: '0.8rem', marginTop: '0.25rem' };
const btn: React.CSSProperties = { background: 'none', border: '1px solid rgba(0,0,0,0.2)', borderRadius: 999, padding: '0.4rem 0.9rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' };

function Field(props: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label>{props.label}</label>
      {props.children}
      {props.hint && <p style={small}>{props.hint}</p>}
      {props.error && <p style={errStyle} role="alert">{props.error}</p>}
    </div>
  );
}

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
      <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => setRows([...rows, ['', '']])}>+ Add</button>
    </div>
  );
}

async function send(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

export default function ProductEditor(props: Props) {
  const [p, setP] = useState<EditorProduct>(props.initial);
  const [variants, setVariants] = useState<EditorVariant[]>(props.variants);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof EditorProduct>(k: K, v: EditorProduct[K]) => setP((prev) => ({ ...prev, [k]: v }));
  const err = (k: string) => errors[k];
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
    const body = { product: p, variants: variants.map(({ currentStock: _cs, ...v }) => v) };
    const res = await send(props.id ? `/api/admin/products/${props.id}` : '/api/admin/products', {
      method: props.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      const id = (res.data.id as number) ?? props.id;
      setStatus('✓ Saved');
      window.location.href = `/admin/products/${id}?saved=1`;
    } else {
      setErrors((res.data.errors as Record<string, string>) ?? { _: String(res.data.error ?? 'Save failed') });
      setStatus('Not saved — check the highlighted fields');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  const updateVariant = (i: number, patch: Partial<EditorVariant>) => setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {Object.keys(errors).length > 0 && (
        <div className="warn" role="alert">
          <strong>Please fix:</strong>
          <ul style={{ margin: '0.5rem 0 0 1.25rem' }}>
            {Object.entries(errors).map(([k, m]) => (<li key={k}><code>{k}</code>: {m}</li>))}
          </ul>
        </div>
      )}
      {props.shelfWarning && <p className="warn">{props.shelfWarning}</p>}

      <section style={box}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Basics</h2>
        <div style={row}>
          <Field label="Category" error={err('categorySlug')}>
            <select value={p.categorySlug} disabled={published} onChange={(e) => set('categorySlug', e.target.value)} style={{ width: '100%', padding: '0.7rem', borderRadius: 8 }}>
              <option value="rice">Rice</option><option value="spices">Spices</option><option value="produce">Produce</option>
            </select>
          </Field>
          <Field label="URL slug" error={err('slug')} hint={published ? 'Locked after publishing' : `harileaf.org/${p.categorySlug}/${p.slug || '…'}`}>
            <input type="text" value={p.slug} disabled={published} onChange={(e) => set('slug', e.target.value.toLowerCase())} />
          </Field>
          <Field label="Status" error={err('status')}>
            <select value={p.status} onChange={(e) => set('status', e.target.value as EditorProduct['status'])} style={{ width: '100%', padding: '0.7rem', borderRadius: 8 }}>
              <option value="draft">Draft (hidden)</option><option value="active">Active (live)</option><option value="discontinued">Discontinued</option>
            </select>
          </Field>
        </div>
        {p.status === 'discontinued' && (
          <Field label="Redirect old URL to" error={err('replacementProductId')} hint="Without a replacement the page returns 410 Gone">
            <select value={p.replacementProductId ?? ''} onChange={(e) => set('replacementProductId', e.target.value ? Number(e.target.value) : null)} style={{ width: '100%', padding: '0.7rem', borderRadius: 8 }}>
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
          “Natural”, “fresh”, “pure”, “traditional”, “authentic”, “genuine”, “real” and “original” need a claim with that exact code and evidence.
        </p>
        <Field label="Process claims" error={err('processClaims')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {p.processClaims.map((c, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 2fr auto', gap: '0.5rem' }}>
                <input type="text" aria-label="Code" placeholder="code (stone_ground)" value={c.code} onChange={(e) => set('processClaims', p.processClaims.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} />
                <input type="text" aria-label="Claim text" placeholder="Shown to shoppers" value={c.text} onChange={(e) => set('processClaims', p.processClaims.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                <input type="text" aria-label="Evidence" placeholder="Evidence (internal)" value={c.evidence_note} onChange={(e) => set('processClaims', p.processClaims.map((x, j) => (j === i ? { ...x, evidence_note: e.target.value } : x)))} />
                <button type="button" style={btn} aria-label="Remove claim" onClick={() => set('processClaims', p.processClaims.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => set('processClaims', [...p.processClaims, { code: '', text: '', evidence_note: '' }])}>+ Add claim</button>
          </div>
        </Field>
        <Field label="How it's made" hint="e.g. Grinding → Stone mill, below 40 °C"><KeyValues value={p.howItsMade} onChange={(v) => set('howItsMade', v)} keyLabel="Step" valueLabel="Detail" /></Field>
        <Field label="Harvest & freshness" hint="e.g. Harvest → Kharif 2026"><KeyValues value={p.harvestInfo} onChange={(v) => set('harvestInfo', v)} keyLabel="Label" valueLabel="Value" /></Field>
        <Field label="Attributes" hint="e.g. Grain → Short, bold"><KeyValues value={p.attributes} onChange={(v) => set('attributes', v)} keyLabel="Attribute" valueLabel="Value" /></Field>
        <Field label="FAQ" hint="Facts only — no disease or health claims" error={Object.entries(errors).find(([k]) => k.startsWith('faq'))?.[1]}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {p.faq.map((f, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '0.5rem' }}>
                <input type="text" aria-label="Question" placeholder="Question" value={f.q} onChange={(e) => set('faq', p.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} />
                <input type="text" aria-label="Answer" placeholder="Answer" value={f.a} onChange={(e) => set('faq', p.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
                <button type="button" style={btn} aria-label="Remove question" onClick={() => set('faq', p.faq.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => set('faq', [...p.faq, { q: '', a: '' }])}>+ Add question</button>
          </div>
        </Field>
      </section>

      <section style={box}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Organic certification</h2>
        <div style={row}>
          <Field label="Scheme" error={err('organicScheme')}>
            <select value={p.organicScheme} onChange={(e) => set('organicScheme', e.target.value as EditorProduct['organicScheme'])} style={{ width: '100%', padding: '0.7rem', borderRadius: 8 }}>
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
        <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Listing information (shown on the product page)</h2>
        <div style={row}>
          <Field label="Best before (days from packing)" error={err('bestBeforeDays')}><input type="number" value={p.bestBeforeDays ?? ''} onChange={(e) => set('bestBeforeDays', e.target.value ? Number(e.target.value) : null)} /></Field>
          <Field label="Country of origin"><input type="text" value={p.countryOfOrigin} onChange={(e) => set('countryOfOrigin', e.target.value)} /></Field>
          <Field label="Vegetarian">
            <select value={p.vegMark ? 'yes' : 'no'} onChange={(e) => set('vegMark', e.target.value === 'yes')} style={{ width: '100%', padding: '0.7rem', borderRadius: 8 }}><option value="yes">Yes (green mark)</option><option value="no">No</option></select>
          </Field>
        </div>
        <Field label="Ingredients" error={err('ingredients')} hint="e.g. Turmeric (100%)"><input type="text" value={p.ingredients} onChange={(e) => set('ingredients', e.target.value)} /></Field>
        <Field label="Storage instructions" error={err('storageInstructions')}><input type="text" value={p.storageInstructions} onChange={(e) => set('storageInstructions', e.target.value)} /></Field>
        <Field label="Allergen information"><input type="text" value={p.allergenInfo ?? ''} onChange={(e) => set('allergenInfo', e.target.value || null)} /></Field>
        <Field label={`Nutrition per ${p.nutrition.per}`} error={err('nutrition')} hint="Measured values only, with units (from a lab report)">
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
            <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => set('nutrition', { ...p.nutrition, rows: [...p.nutrition.rows, { name: '', amount: '' }] })}>+ Add nutrient</button>
          </div>
        </Field>
      </section>

      <section style={box}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Tax, payment &amp; season</h2>
        <div style={row}>
          <Field label="HSN code" error={err('hsnCode')}><input type="text" value={p.hsnCode} onChange={(e) => set('hsnCode', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="GST rate" error={err('gstRateBp')} hint="Confirm with your CA">
            <select value={p.gstRateBp} onChange={(e) => set('gstRateBp', Number(e.target.value))} style={{ width: '100%', padding: '0.7rem', borderRadius: 8 }}>
              {GST_RATES.map((g) => (<option key={g.bp} value={g.bp}>{g.label}</option>))}
            </select>
          </Field>
          <Field label="Perishable" error={err('perishable')}>
            <select value={p.perishable ? 'yes' : 'no'} onChange={(e) => setP((prev) => ({ ...prev, perishable: e.target.value === 'yes', codAllowed: e.target.value === 'yes' ? false : prev.codAllowed }))} style={{ width: '100%', padding: '0.7rem', borderRadius: 8 }}><option value="no">No</option><option value="yes">Yes (prepaid only)</option></select>
          </Field>
          <Field label="Cash on delivery" error={err('codAllowed')}>
            <select value={p.codAllowed ? 'yes' : 'no'} disabled={p.perishable} onChange={(e) => set('codAllowed', e.target.value === 'yes')} style={{ width: '100%', padding: '0.7rem', borderRadius: 8 }}><option value="yes">Allowed</option><option value="no">Not allowed</option></select>
          </Field>
        </div>
        <div style={row}>
          <Field label="Season start (MM-DD)" error={err('seasonStartMd')}><input type="text" placeholder="04-01" value={p.seasonStartMd ?? ''} onChange={(e) => set('seasonStartMd', e.target.value || null)} /></Field>
          <Field label="Season end (MM-DD)" error={err('seasonEndMd')}><input type="text" placeholder="06-30" value={p.seasonEndMd ?? ''} onChange={(e) => set('seasonEndMd', e.target.value || null)} /></Field>
          <Field label="Out of season" error={err('offSeasonMode')}>
            <select value={p.offSeasonMode ?? ''} onChange={(e) => set('offSeasonMode', (e.target.value || null) as EditorProduct['offSeasonMode'])} style={{ width: '100%', padding: '0.7rem', borderRadius: 8 }}><option value="">Notify me</option><option value="notify">Notify me</option><option value="preorder">Pre-order</option></select>
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
                  <input type="number" value={v.stockAdjust} onChange={(e) => updateVariant(i, { stockAdjust: Math.trunc(Number(e.target.value)) })} />
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
                  <select value={v.active ? 'yes' : 'no'} onChange={(e) => updateVariant(i, { active: e.target.value === 'yes' })} style={{ width: '100%', padding: '0.7rem', borderRadius: 8 }}><option value="yes">Yes</option><option value="no">No (hidden)</option></select>
                </Field>
              </div>
            </div>
          );
        })}
        <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => setVariants([...variants, { sku: '', label: '', netQtyLabel: '', unitQtyG: Number.NaN, pricePaise: Number.NaN, mrpPaise: Number.NaN, weightG: Number.NaN, lengthCm: Number.NaN, breadthCm: Number.NaN, heightCm: Number.NaN, stockAdjust: 0, lowStockThreshold: 5, active: true, sort: variants.length }])}>+ Add pack size</button>
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
        <button type="button" className="brand-btn" style={{ padding: '0.75rem 2rem' }} onClick={save} disabled={saving}>{props.id ? 'Save product' : 'Create product'}</button>
        <p className="muted" aria-live="polite">{status}</p>
        {props.id && p.status === 'active' && <a href={`/${p.categorySlug}/${p.slug}`} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontWeight: 700, color: '#196a5e' }}>View live page ↗</a>}
      </div>

      {props.id ? (
        <>
          <Images productId={props.id} images={props.images} />
          <Batches productId={props.id} batches={props.batches} labReports={props.labReports} />
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

function Images(props: { productId: number; images: EditorImage[] }) {
  const [images, setImages] = useState(props.images);
  const [alt, setAlt] = useState('');
  const [msg, setMsg] = useState('');
  const base = `/api/admin/products/${props.productId}/images`;

  async function upload(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('alt', alt);
    setMsg('Uploading…');
    const res = await send(base, { method: 'POST', body: fd });
    if (res.ok) window.location.reload();
    else setMsg(String(res.data.error ?? 'Upload failed'));
  }

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    setImages(next);
    await Promise.all(next.map((img, k) => send(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId: img.id, sort: k }) })));
  }

  return (
    <section style={box}>
      <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Photos</h2>
      <p className="muted">The first photo is used in search results and the Google Shopping feed. JPEG/PNG/WebP/AVIF, up to 5 MB.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
        {images.map((img, i) => (
          <figure key={img.id} style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
            <img src={img.url} alt={img.alt} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover' }} />
            <figcaption style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <input type="text" aria-label="Alt text" defaultValue={img.alt} onBlur={(e) => e.target.value !== img.alt && send(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId: img.id, alt: e.target.value }) })} />
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button type="button" style={btn} onClick={() => move(i, -1)} aria-label="Move earlier">←</button>
                <button type="button" style={btn} onClick={() => move(i, 1)} aria-label="Move later">→</button>
                <button type="button" style={{ ...btn, color: '#c00', marginLeft: 'auto' }} onClick={async () => {
                  const res = await send(`${base}?imageId=${img.id}`, { method: 'DELETE' });
                  if (res.ok) setImages(images.filter((x) => x.id !== img.id));
                  else setMsg(String(res.data.error ?? 'Delete failed'));
                }}>Delete</button>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
      <div style={row}>
        <Field label="Alt text for the new photo" hint="Describe what's in it, e.g. “Karjat 3 rice grains in a steel bowl”"><input type="text" value={alt} onChange={(e) => setAlt(e.target.value)} /></Field>
        <Field label="Upload"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></Field>
      </div>
      <p className="muted" aria-live="polite">{msg}</p>
    </section>
  );
}

function Batches(props: { productId: number; batches: EditorBatch[]; labReports: EditorLab[] }) {
  const [msg, setMsg] = useState('');
  const [b, setB] = useState({ batchCode: '', packedOn: '', groundOrMilledOn: '', labReportId: '', makeActive: true });
  const [lab, setLab] = useState({ batchCode: '', testedOn: '', labName: '', labAccreditation: '', testScope: '', summary: '{\n  "Pesticide residues": "Not detected (LOD 0.01 mg/kg)"\n}' });
  const base = `/api/admin/products/${props.productId}`;

  return (
    <section style={box}>
      <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Batches &amp; lab reports</h2>
      <p className="muted">The active batch's packed-on date and code are shown in the buy box, with a “Lab tested” badge when it links a visible report.</p>
      <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
        <thead><tr style={{ textAlign: 'left' }}><th>Batch</th><th>Packed</th><th>Ground/milled</th><th>Lab report</th><th /></tr></thead>
        <tbody>
          {props.batches.map((x) => (
            <tr key={x.id} style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
              <td>{x.batchCode} {x.active && <strong style={{ color: '#196a5e' }}>· active</strong>}</td>
              <td>{x.packedOn}</td>
              <td>{x.groundOrMilledOn ?? '—'}</td>
              <td>{props.labReports.find((l) => l.id === x.labReportId)?.labName ?? '—'}</td>
              <td>{!x.active && <button type="button" style={btn} onClick={async () => {
                const res = await send(`${base}/batches`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId: x.id }) });
                if (res.ok) window.location.reload(); else setMsg(String(res.data.error));
              }}>Make active</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={row}>
        <Field label="Batch code"><input type="text" value={b.batchCode} onChange={(e) => setB({ ...b, batchCode: e.target.value })} /></Field>
        <Field label="Packed on"><input type="date" value={b.packedOn} onChange={(e) => setB({ ...b, packedOn: e.target.value })} /></Field>
        <Field label="Ground / milled on"><input type="date" value={b.groundOrMilledOn} onChange={(e) => setB({ ...b, groundOrMilledOn: e.target.value })} /></Field>
        <Field label="Lab report">
          <select value={b.labReportId} onChange={(e) => setB({ ...b, labReportId: e.target.value })} style={{ width: '100%', padding: '0.7rem', borderRadius: 8 }}>
            <option value="">None</option>
            {props.labReports.map((l) => (<option key={l.id} value={l.id}>{l.batchCode} · {l.labName} · {l.testedOn}</option>))}
          </select>
        </Field>
      </div>
      <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={async () => {
        const res = await send(`${base}/batches`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...b, groundOrMilledOn: b.groundOrMilledOn || null, labReportId: b.labReportId ? Number(b.labReportId) : null }) });
        if (res.ok) window.location.reload(); else setMsg(String(res.data.error));
      }}>+ Add batch (make active)</button>

      <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginTop: '1rem' }}>Lab reports</h3>
      <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem' }}>
        {props.labReports.map((l) => (
          <li key={l.id}>
            {l.batchCode} · {l.labName} · {l.testedOn} {l.pdfUrl && <a href={l.pdfUrl} target="_blank" rel="noreferrer">PDF</a>}{' '}
            <button type="button" style={btn} onClick={async () => {
              const res = await send(`${base}/lab-reports`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reportId: l.id, visible: !l.visible }) });
              if (res.ok) window.location.reload(); else setMsg(String(res.data.error));
            }}>{l.visible ? 'Hide' : 'Show'}</button>
          </li>
        ))}
      </ul>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const res = await send(`${base}/lab-reports`, { method: 'POST', body: fd });
        if (res.ok) window.location.reload(); else setMsg(String(res.data.error));
      }} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={row}>
          <Field label="Batch code"><input name="batchCode" type="text" value={lab.batchCode} onChange={(e) => setLab({ ...lab, batchCode: e.target.value })} /></Field>
          <Field label="Tested on"><input name="testedOn" type="date" value={lab.testedOn} onChange={(e) => setLab({ ...lab, testedOn: e.target.value })} /></Field>
          <Field label="Lab name"><input name="labName" type="text" value={lab.labName} onChange={(e) => setLab({ ...lab, labName: e.target.value })} /></Field>
          <Field label="Accreditation (e.g. NABL TC-…)"><input name="labAccreditation" type="text" value={lab.labAccreditation} onChange={(e) => setLab({ ...lab, labAccreditation: e.target.value })} /></Field>
        </div>
        <Field label="What was tested"><input name="testScope" type="text" value={lab.testScope} onChange={(e) => setLab({ ...lab, testScope: e.target.value })} /></Field>
        <Field label="Results (JSON: name → value with units)"><textarea name="summary" rows={4} value={lab.summary} onChange={(e) => setLab({ ...lab, summary: e.target.value })} style={{ fontFamily: 'ui-monospace, monospace' }} /></Field>
        <Field label="Report PDF"><input name="pdf" type="file" accept="application/pdf" /></Field>
        <button type="submit" style={{ ...btn, alignSelf: 'flex-start' }}>+ Add lab report</button>
      </form>
      <p className="muted" aria-live="polite">{msg}</p>
    </section>
  );
}
