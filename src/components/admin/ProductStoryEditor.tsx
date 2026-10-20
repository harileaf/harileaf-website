/**
 * Product story editor (spec: Admin UX → Products → Story editor). Saves to
 * PUT /api/admin/products/[id]/story. The story is live once saved, so
 * claims errors block; warnings (e.g. a proof item without a lab value) don't.
 * Preview posts the unsaved story to /admin/preview/product in a new tab.
 */
import { useEffect, useState } from 'react';
import { coerceProductStory, EMPTY_STORY, labValue, STORY_ICONS, type Comparison, type ProductStory, type StoryIcon } from '../../lib/store/story';
import { addBtn, box, btn, Field, focusFirstError, h2, ImagePicker, MessageList, MoveButtons, moved, Msg, removeBtn, row, sel, send, small, storyErrorLabel, type PickerImage } from './story-ui';

interface Props {
  productId: number;
  productName: string;
  initial: ProductStory | null;
  /** Standard lab keys for the product's category. */
  labKeys: string[];
  activeLab: { batchCode: string; summary: Record<string, string> } | null;
  productImages: PickerImage[];
  howItsMade: Record<string, string>;
}

const ICON_LABELS: Record<StoryIcon, string> = { stone_mill: 'Stone mill', sun: 'Sun', lab: 'Lab flask', hand: 'Hand', grain: 'Grain', leaf: 'Leaf', water: 'Water drop', gi: 'GI star' };
const emptyRow = () => ({ aspect: '', ours: '', theirs: '', source: '' });
const emptyComparison = (): Comparison => ({ heading: '', oursLabel: 'Ours', theirsLabel: '', rows: [emptyRow(), emptyRow()], note: '', imageKey: null, imageAlt: '' });
const at = <T,>(xs: T[], i: number, patch: Partial<T>) => xs.map((y, j) => (j === i ? { ...y, ...patch } : y));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function ProductStoryEditor(props: Props) {
  const [enabled, setEnabled] = useState(props.initial !== null);
  const [s, setS] = useState<ProductStory>(props.initial ?? EMPTY_STORY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = <K extends keyof ProductStory>(k: K, v: ProductStory[K]) => {
    setS((prev) => ({ ...prev, [k]: v }));
    setDirty(true);
  };
  /** Row errors are keyed by position, so they no longer line up after a move or removal. */
  const reorder = <K extends keyof ProductStory>(k: K, v: ProductStory[K], prefix: string) => {
    set(k, v);
    const keep = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([key]) => !key.startsWith(`${prefix}.`)));
    setErrors(keep);
    setWarnings(keep);
  };
  const err = (k: string) => errors[k];
  /** A row-level message's id, for the row's fields' aria-describedby. */
  const msgId = (k: string) => (errors[k] ? `story-msg-${k}` : undefined);
  const rowMsg = (k: string) => (errors[k] ? <Msg id={`story-msg-${k}`} kind="error">{errors[k]}</Msg> : null);

  async function save() {
    // Save what the server stores (trimmed, empty rows dropped), so error positions match the rows on screen.
    const story = enabled ? (coerceProductStory(s) ?? EMPTY_STORY) : null;
    if (story) setS(story);
    setSaving(true);
    setStatus('Saving…');
    const res = await send(`/api/admin/products/${props.productId}/story`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ story }) });
    setSaving(false);
    if (res.ok) {
      const w = (res.data.warnings as Record<string, string> | undefined) ?? {};
      setErrors({});
      setWarnings(w);
      setDirty(false);
      const n = Object.keys(w).length;
      if (n) {
        setStatus(`Saved, with ${plural(n, 'thing', 'things')} to check (listed above).`);
        requestAnimationFrame(() => document.getElementById('story-warnings')?.focus());
      } else setStatus(story ? '✓ Saved. Live pages refresh within a minute.' : '✓ Story sections removed. Live pages refresh within a minute.');
    } else {
      const e = (res.data.errors as Record<string, string> | undefined) ?? { _: String(res.data.error ?? 'Save failed') };
      setErrors(e);
      setWarnings({});
      setStatus(`Not saved: ${plural(Object.keys(e).length, 'thing', 'things')} to fix.`);
      focusFirstError('story', 'story-errors');
    }
  }

  const proofKeys = [...new Set([...props.labKeys, ...Object.keys(props.activeLab?.summary ?? {})])];
  const labNow = (key: string) => {
    if (!props.activeLab) return 'No active batch with a visible lab report yet, so this item is hidden on the page.';
    const v = labValue(props.activeLab.summary, key);
    return v ? `${key} → ${v} from batch ${props.activeLab.batchCode} (active)` : `Batch ${props.activeLab.batchCode}'s lab report has no '${key}', so this item is hidden on the page.`;
  };
  const infographics = props.productImages.filter((i) => i.kind === 'infographic');
  const cmp = s.comparison;
  const setCmp = (patch: Partial<Comparison>) => cmp && set('comparison', { ...cmp, ...patch });

  return (
    <div id="story" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '2.5rem' }}>
      <section style={box} aria-labelledby="story-h">
        <h2 id="story-h" style={h2}>Story sections</h2>
        <p className="muted">Proof line, timeline, comparison, origin, grower and how to cook/use for {props.productName}. Shown on the product page and, when this is a landing page's “Story from” product, on that page too. Checked against the claims policy when you save. This part has its own Save button.</p>
        <label style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.9rem', color: 'inherit' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setDirty(true); }} /> This product has story sections
        </label>
        {!enabled && props.initial && <p style={small}>Saving now removes the story sections from the product page.</p>}
        <MessageList id="story-errors" kind="error" title="Not saved. Please fix:" messages={errors} label={storyErrorLabel} />
        <MessageList id="story-warnings" kind="warning" title="Saved, with things to check:" messages={warnings} label={storyErrorLabel} />
      </section>

      {enabled && (
        <>
          <section style={box} aria-labelledby="story-buy-h">
            <h2 id="story-buy-h" style={h2}>Buy box</h2>
            <p style={small}>Proof line (up to 4 items). Lab values are read from the active batch's lab report{props.activeLab ? ` (batch ${props.activeLab.batchCode})` : '; there is no active batch with a visible report yet'}.</p>
            {rowMsg('proofLine')}
            {s.proofLine.map((x, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(8rem, 10rem) 1fr 1fr auto', gap: '0.5rem', alignItems: 'start' }}>
                <Field label={`Proof item ${i + 1} type`}>
                  <select style={sel} value={x.kind} onChange={(e) => set('proofLine', s.proofLine.map((y, j) => (j !== i ? y : e.target.value === 'lab' ? { kind: 'lab', key: proofKeys[0] ?? '', label: proofKeys[0] ?? '' } : { kind: 'text', text: '' })))}>
                    <option value="text">Text</option><option value="lab">Lab value</option>
                  </select>
                </Field>
                {x.kind === 'text' ? (
                  <Field label="Text" error={err(`proofLine.${i}`)} hint="e.g. “Stone ground below 40 °C”">
                    <input type="text" value={x.text} onChange={(e) => set('proofLine', s.proofLine.map((y, j) => (j === i ? { kind: 'text', text: e.target.value } : y)))} />
                  </Field>
                ) : (
                  <Field label="Lab value" warning={warnings[`proofLine.${i}`]} hint={warnings[`proofLine.${i}`] ? undefined : labNow(x.key)}>
                    <select style={sel} value={x.key} onChange={(e) => set('proofLine', s.proofLine.map((y, j) => (j === i ? { kind: 'lab', key: e.target.value, label: e.target.value } : y)))}>
                      {[...new Set([...proofKeys, x.key])].filter(Boolean).map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </Field>
                )}
                {x.kind === 'lab' ? (
                  <Field label="Shown as" error={err(`proofLine.${i}`)} hint="Words before the value, e.g. “Curcumin”">
                    <input type="text" value={x.label} onChange={(e) => set('proofLine', s.proofLine.map((y, j) => (j === i && y.kind === 'lab' ? { ...y, label: e.target.value } : y)))} />
                  </Field>
                ) : <span />}
                <MoveButtons idPrefix="story-proof" index={i} count={s.proofLine.length} noun="proof item" onMove={(a, b) => reorder('proofLine', moved(s.proofLine, a, b), 'proofLine')} onRemove={() => reorder('proofLine', s.proofLine.filter((_, j) => j !== i), 'proofLine')} />
              </div>
            ))}
            {s.proofLine.length < 4 && <button type="button" id="story-proof-add" style={addBtn} onClick={() => set('proofLine', [...s.proofLine, { kind: 'text', text: '' }])}>+ Add proof item</button>}

            <p style={small}>Icon row (up to 3)</p>
            {rowMsg('icons')}
            {s.icons.map((x, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(8rem, 12rem) 1fr auto', gap: '0.5rem', alignItems: 'start' }}>
                <Field label={`Icon ${i + 1}`}>
                  <select style={sel} value={x.icon} onChange={(e) => set('icons', at(s.icons, i, { icon: e.target.value as StoryIcon }))}>{STORY_ICONS.map((k) => <option key={k} value={k}>{ICON_LABELS[k]}</option>)}</select>
                </Field>
                <Field label="Label" error={err(`icons.${i}`)}><input type="text" value={x.label} onChange={(e) => set('icons', at(s.icons, i, { label: e.target.value }))} /></Field>
                <MoveButtons idPrefix="story-icon" index={i} count={s.icons.length} noun="icon" onMove={(a, b) => reorder('icons', moved(s.icons, a, b), 'icons')} onRemove={() => reorder('icons', s.icons.filter((_, j) => j !== i), 'icons')} />
              </div>
            ))}
            {s.icons.length < 3 && <button type="button" id="story-icon-add" style={addBtn} onClick={() => set('icons', [...s.icons, { icon: 'leaf', label: '' }])}>+ Add icon</button>}
            <label style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.9rem', color: 'inherit' }}>
              <input type="checkbox" checked={s.showCategorySwitcher} onChange={(e) => set('showCategorySwitcher', e.target.checked)} /> Show the variety switcher (other products in this category)
            </label>
          </section>

          <section style={box} aria-labelledby="story-steps-h">
            <h2 id="story-steps-h" style={h2}>Timeline</h2>
            <p style={small}>How it's made, in 3 to 8 steps (or none).</p>
            {rowMsg('processSteps')}
            {s.processSteps.length === 0 && Object.keys(props.howItsMade).length > 0 && (
              <button type="button" style={addBtn} onClick={() => set('processSteps', Object.entries(props.howItsMade).slice(0, 8).map(([title, text]) => ({ title, text, photoKey: null, photoAlt: '' })))}>Convert from “How it's made”</button>
            )}
            {s.processSteps.map((x, i) => (
              <div key={i} style={{ ...box, background: '#f6f6f3', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 800 }}>Step {i + 1}</h3>
                  <MoveButtons idPrefix="story-step" index={i} count={s.processSteps.length} noun="step" onMove={(a, b) => reorder('processSteps', moved(s.processSteps, a, b), 'processSteps')} onRemove={() => reorder('processSteps', s.processSteps.filter((_, j) => j !== i), 'processSteps')} />
                </div>
                {rowMsg(`processSteps.${i}`)}
                <div style={row}>
                  <Field label="Title" error={err(`processSteps.${i}.title`)} invalid={!!err(`processSteps.${i}`)} describedBy={msgId(`processSteps.${i}`)}>
                    <input type="text" value={x.title} onChange={(e) => set('processSteps', at(s.processSteps, i, { title: e.target.value }))} />
                  </Field>
                  <Field label="Text" error={err(`processSteps.${i}.text`)} invalid={!!err(`processSteps.${i}`)} describedBy={msgId(`processSteps.${i}`)}>
                    <textarea rows={2} value={x.text} onChange={(e) => set('processSteps', at(s.processSteps, i, { text: e.target.value }))} />
                  </Field>
                </div>
                <ImagePicker label="Photo (optional)" value={x.photoKey} alt={x.photoAlt} productImages={props.productImages} error={err(`processSteps.${i}.photoKey`)} onChange={(k, a) => set('processSteps', at(s.processSteps, i, { photoKey: k, photoAlt: a }))} />
              </div>
            ))}
            {s.processSteps.length < 8 && <button type="button" id="story-step-add" style={addBtn} onClick={() => set('processSteps', [...s.processSteps, { title: '', text: '', photoKey: null, photoAlt: '' }])}>+ Add step</button>}
          </section>

          <section style={box} aria-labelledby="story-cmp-h">
            <h2 id="story-cmp-h" style={h2}>Comparison</h2>
            <p style={small}>Describe the other process, not a competitor. Use numbers only with a source (e.g. “IFCT 2017”, “Lab report T-01”).</p>
            {!cmp ? (
              <button type="button" style={addBtn} onClick={() => set('comparison', emptyComparison())}>+ Add a comparison</button>
            ) : (
              <>
                {rowMsg('comparison')}
                <div style={row}>
                  <Field label="Heading" error={err('comparison.heading')} invalid={!!err('comparison')} describedBy={msgId('comparison')}><input type="text" value={cmp.heading} onChange={(e) => setCmp({ heading: e.target.value })} /></Field>
                  <Field label="Our column" error={err('comparison.oursLabel')}><input type="text" value={cmp.oursLabel} onChange={(e) => setCmp({ oursLabel: e.target.value })} /></Field>
                  <Field label="Their column (a process)" error={err('comparison.theirsLabel')} hint="e.g. “Machine-polished rice”"><input type="text" value={cmp.theirsLabel} onChange={(e) => setCmp({ theirsLabel: e.target.value })} /></Field>
                </div>
                {rowMsg('comparison.rows')}
                {cmp.rows.map((r, i) => (
                  <fieldset key={i} style={{ border: 'none', padding: 0, margin: 0 }}>
                    <legend style={{ fontWeight: 700, fontSize: '0.85rem' }}>Row {i + 1}</legend>
                    {rowMsg(`comparison.rows.${i}`)}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr)) auto', gap: '0.5rem', alignItems: 'start' }}>
                      {(['aspect', 'ours', 'theirs', 'source'] as const).map((k) => (
                        <Field key={k} label={{ aspect: 'What', ours: 'Ours', theirs: 'Theirs', source: 'Source' }[k]} error={err(`comparison.rows.${i}.${k}`)} invalid={!!err(`comparison.rows.${i}`)} describedBy={msgId(`comparison.rows.${i}`)}>
                          <input type="text" value={r[k]} onChange={(e) => setCmp({ rows: at(cmp.rows, i, { [k]: e.target.value }) })} />
                        </Field>
                      ))}
                      <MoveButtons idPrefix="story-crow" index={i} count={cmp.rows.length} noun="comparison row" onMove={(a, b) => reorder('comparison', { ...cmp, rows: moved(cmp.rows, a, b) }, 'comparison.rows')} onRemove={() => reorder('comparison', { ...cmp, rows: cmp.rows.filter((_, j) => j !== i) }, 'comparison.rows')} />
                    </div>
                  </fieldset>
                ))}
                {cmp.rows.length < 8 && <button type="button" id="story-crow-add" style={addBtn} onClick={() => setCmp({ rows: [...cmp.rows, emptyRow()] })}>+ Add row</button>}
                <Field label="Note under the table (optional)" error={err('comparison.note')}><input type="text" value={cmp.note} onChange={(e) => setCmp({ note: e.target.value })} /></Field>
                <ImagePicker
                  label="Comparison image (optional; e.g. the comparison infographic)" value={cmp.imageKey} alt={cmp.imageAlt} productImages={infographics}
                  error={err('comparison.imageKey')} altError={err('comparison.imageAlt')} altHint="Describe what the image says in a full sentence. Every fact in it must also be in the table."
                  onChange={(k, a) => setCmp({ imageKey: k, imageAlt: a })}
                />
                <button type="button" style={removeBtn} onClick={() => set('comparison', null)}>Remove comparison</button>
              </>
            )}
          </section>

          <section style={box} aria-labelledby="story-origin-h">
            <h2 id="story-origin-h" style={h2}>Origin &amp; grower</h2>
            {!s.originStory ? <button type="button" style={addBtn} onClick={() => set('originStory', { heading: '', bodyMd: '', photoKey: null, photoAlt: '' })}>+ Add an origin story</button> : (
              <>
                {rowMsg('originStory')}
                <Field label="Origin heading" error={err('originStory.heading')} invalid={!!err('originStory')} describedBy={msgId('originStory')}><input type="text" value={s.originStory.heading} onChange={(e) => set('originStory', { ...s.originStory!, heading: e.target.value })} /></Field>
                <Field label="Origin story" error={err('originStory.bodyMd')} invalid={!!err('originStory')} describedBy={msgId('originStory')} hint="Basic markdown: **bold**, *italic*, blank line for a new paragraph."><textarea rows={4} value={s.originStory.bodyMd} onChange={(e) => set('originStory', { ...s.originStory!, bodyMd: e.target.value })} /></Field>
                <ImagePicker label="Origin photo (optional)" value={s.originStory.photoKey} alt={s.originStory.photoAlt} productImages={props.productImages} error={err('originStory.photoKey')} altError={err('originStory.photoAlt')} onChange={(k, a) => set('originStory', { ...s.originStory!, photoKey: k, photoAlt: a })} />
                <button type="button" style={removeBtn} onClick={() => set('originStory', null)}>Remove origin story</button>
              </>
            )}
            {!s.grower ? <button type="button" style={addBtn} onClick={() => set('grower', { names: '', place: '', since: '', bodyMd: '', photoKey: null, photoAlt: '' })}>+ Add the grower</button> : (
              <>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 800 }}>Grower</h3>
                <p style={small}>Only with the grower's OK to be named and pictured.</p>
                {rowMsg('grower')}
                <div style={row}>
                  <Field label="Names" error={err('grower.names')} invalid={!!err('grower')} describedBy={msgId('grower')}><input type="text" value={s.grower.names} onChange={(e) => set('grower', { ...s.grower!, names: e.target.value })} /></Field>
                  <Field label="Place" error={err('grower.place')} invalid={!!err('grower')} describedBy={msgId('grower')}><input type="text" value={s.grower.place} onChange={(e) => set('grower', { ...s.grower!, place: e.target.value })} /></Field>
                  <Field label="On this land since (optional)" error={err('grower.since')}><input type="text" value={s.grower.since} onChange={(e) => set('grower', { ...s.grower!, since: e.target.value })} /></Field>
                </div>
                <Field label="A few lines (optional)" error={err('grower.bodyMd')} hint="Basic markdown."><textarea rows={3} value={s.grower.bodyMd} onChange={(e) => set('grower', { ...s.grower!, bodyMd: e.target.value })} /></Field>
                <ImagePicker label="Grower photo (optional)" value={s.grower.photoKey} alt={s.grower.photoAlt} productImages={props.productImages} error={err('grower.photoKey')} onChange={(k, a) => set('grower', { ...s.grower!, photoKey: k, photoAlt: a })} />
                <button type="button" style={removeBtn} onClick={() => set('grower', null)}>Remove grower</button>
              </>
            )}
          </section>

          <section style={box} aria-labelledby="story-use-h">
            <h2 id="story-use-h" style={h2}>How to cook / use</h2>
            {!s.use ? <button type="button" style={addBtn} onClick={() => set('use', { kind: 'cook', heading: '', steps: [''] })}>+ Add how to cook/use</button> : (
              <>
                {rowMsg('use')}
                <div style={row}>
                  <Field label="Kind"><select style={sel} value={s.use.kind} onChange={(e) => set('use', { ...s.use!, kind: e.target.value === 'cook' ? 'cook' : 'use' })}><option value="cook">How to cook</option><option value="use">How to use</option></select></Field>
                  <Field label="Heading" error={err('use.heading')} invalid={!!err('use')} describedBy={msgId('use')}><input type="text" value={s.use.heading} onChange={(e) => set('use', { ...s.use!, heading: e.target.value })} /></Field>
                </div>
                {s.use.steps.map((x, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', alignItems: 'start' }}>
                    <Field label={`Step ${i + 1}`} error={err(`use.steps.${i}`)}><input type="text" value={x} onChange={(e) => set('use', { ...s.use!, steps: s.use!.steps.map((y, j) => (j === i ? e.target.value : y)) })} /></Field>
                    <MoveButtons idPrefix="story-use" index={i} count={s.use!.steps.length} noun="cooking/use step" onMove={(a, b) => reorder('use', { ...s.use!, steps: moved(s.use!.steps, a, b) }, 'use.steps')} onRemove={() => reorder('use', { ...s.use!, steps: s.use!.steps.filter((_, j) => j !== i) }, 'use.steps')} />
                  </div>
                ))}
                {s.use.steps.length < 8 && <button type="button" id="story-use-add" style={addBtn} onClick={() => set('use', { ...s.use!, steps: [...s.use!.steps, ''] })}>+ Add step</button>}
                <button type="button" style={removeBtn} onClick={() => set('use', null)}>Remove how to cook/use</button>
              </>
            )}
          </section>
        </>
      )}

      <div style={{ position: 'sticky', bottom: 0, background: '#f6f6f3', padding: '0.75rem 0', borderTop: '1px solid rgba(0,0,0,0.08)', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="brand-btn" style={{ padding: '0.7rem 1.5rem' }} onClick={save} disabled={saving}>Save story</button>
        <form method="post" action="/admin/preview/product" target="_blank">
          <input type="hidden" name="payload" value={JSON.stringify({ productId: props.productId, story: enabled ? s : null })} />
          <button type="submit" style={btn}>Preview<span className="sr-only"> (opens in a new tab)</span><span aria-hidden="true"> ↗</span></button>
        </form>
        <p className="muted" role="status" aria-live="polite">{status}</p>
        {dirty && !saving && <p className="muted">Unsaved changes</p>}
      </div>
    </div>
  );
}
