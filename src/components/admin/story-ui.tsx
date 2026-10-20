/**
 * Shared bits for the admin editors (product, product story, landing pages):
 * styles, the fetch helper, a labelled field whose error, warning and hint are
 * linked with aria-describedby, row reordering and the story image picker.
 */
import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { fieldLabel } from '../../lib/store/story-claims';
import { mediaUrl } from '../../lib/store/urls';

export const box: CSSProperties = { background: '#ebebea', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' };
export const row: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' };
export const small: CSSProperties = { fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' };
export const errStyle: CSSProperties = { color: '#c00', fontSize: '0.8rem', marginTop: '0.25rem', whiteSpace: 'pre-line' };
export const warnStyle: CSSProperties = { color: '#6b4a07', fontSize: '0.8rem', marginTop: '0.25rem', whiteSpace: 'pre-line' };
export const btn: CSSProperties = { background: 'none', border: '1px solid rgba(0,0,0,0.2)', borderRadius: 999, padding: '0.4rem 0.9rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' };
export const sel: CSSProperties = { width: '100%', padding: '0.7rem', borderRadius: 8 };
export const h2: CSSProperties = { fontSize: '1rem', fontWeight: 800 };
export const addBtn: CSSProperties = { ...btn, alignSelf: 'flex-start' };
export const removeBtn: CSSProperties = { ...btn, alignSelf: 'flex-start', color: '#c00' };

/** Fired on window by the product editor with `detail: boolean` while its GI fields have unsaved changes (read by the story editor). */
export const GI_DIRTY_EVENT = 'harileaf:product-gi-dirty';

export async function send(url: string, init: RequestInit) {
  try {
    const res = await fetch(url, init);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Couldn't reach the server. Check your connection and try again." } as Record<string, unknown> };
  }
}

type ControlProps = { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean };
/** A component that forwards id / aria-describedby / aria-invalid to its input marks itself with `fieldControl = true`. */
type FieldControl = { fieldControl?: boolean };
const isControl = (el: ReactNode): el is ReactElement<ControlProps> =>
  isValidElement(el) && (typeof el.type === 'string' ? ['input', 'select', 'textarea'].includes(el.type) : Boolean((el.type as FieldControl).fieldControl));

/** A message under a field; multi-line messages keep their line breaks. */
export function Msg(props: { id?: string; kind: 'error' | 'warning'; children: ReactNode }) {
  return <p id={props.id} style={props.kind === 'error' ? errStyle : warnStyle}>{props.children}</p>;
}

/**
 * A label and one control (or a labelled group of controls). The error,
 * warning and hint are linked to the control with aria-describedby, and an
 * error (or `invalid`, for a row-level error shown elsewhere) sets aria-invalid.
 */
export function Field(props: { label: string; error?: string; warning?: string; hint?: string; describedBy?: string; invalid?: boolean; children: ReactNode }) {
  const id = useId();
  const ids = { label: `${id}-label`, hint: `${id}-hint`, err: `${id}-err`, warn: `${id}-warn` };
  const described = [props.error && ids.err, props.warning && ids.warn, props.hint && ids.hint, props.describedBy].filter(Boolean).join(' ') || undefined;
  const invalid = Boolean(props.error || props.invalid) || undefined;
  const single = isControl(props.children) ? props.children : null;
  const controlId = single?.props.id ?? id;
  return (
    <div role={single ? undefined : 'group'} aria-labelledby={single ? undefined : ids.label} aria-describedby={single ? undefined : described}>
      <label id={ids.label} htmlFor={single ? controlId : undefined}>{props.label}</label>
      {single
        ? cloneElement(single, { id: controlId, 'aria-describedby': [single.props['aria-describedby'], described].filter(Boolean).join(' ') || undefined, 'aria-invalid': invalid })
        : props.children}
      {props.error && <Msg id={ids.err} kind="error">{props.error}</Msg>}
      {props.warning && <Msg id={ids.warn} kind="warning">{props.warning}</Msg>}
      {props.hint && <p id={ids.hint} style={small}>{props.hint}</p>}
    </div>
  );
}

/**
 * ↑ / ↓ / ✕ for a row. Focus follows the moved row (or its other arrow at
 * the ends); after a removal it goes to the next row's ✕, or to the list's
 * add button (`${idPrefix}-add`).
 */
export function MoveButtons(props: {
  idPrefix: string; index: number; count: number; noun: string; onMove: (from: number, to: number) => void; onRemove: () => void;
  /** Ask before removing (e.g. a row that has text in it). */
  confirmRemove?: string;
}) {
  const { idPrefix, index, count, noun } = props;
  const focus = (...ids: string[]) =>
    requestAnimationFrame(() => {
      for (const target of ids) {
        const el = document.getElementById(target) as HTMLButtonElement | null;
        if (el && !el.disabled) return el.focus();
      }
    });
  const move = (to: number) => {
    if (to < 0 || to >= count) return;
    props.onMove(index, to);
    const [first, second] = to < index ? ['up', 'down'] : ['down', 'up'];
    focus(`${idPrefix}-${to}-${first}`, `${idPrefix}-${to}-${second}`, `${idPrefix}-${to}-remove`);
  };
  return (
    <span style={{ display: 'inline-flex', gap: '0.25rem', alignSelf: 'end' }}>
      <button type="button" id={`${idPrefix}-${index}-up`} style={btn} aria-label={`Move ${noun} ${index + 1} up`} disabled={index === 0} onClick={() => move(index - 1)}>↑</button>
      <button type="button" id={`${idPrefix}-${index}-down`} style={btn} aria-label={`Move ${noun} ${index + 1} down`} disabled={index === count - 1} onClick={() => move(index + 1)}>↓</button>
      <button type="button" id={`${idPrefix}-${index}-remove`} style={{ ...btn, color: '#c00' }} aria-label={`Remove ${noun} ${index + 1}`} onClick={() => {
        if (props.confirmRemove && !window.confirm(props.confirmRemove)) return;
        props.onRemove();
        focus(`${idPrefix}-${index}-remove`, `${idPrefix}-${index - 1}-remove`, `${idPrefix}-add`);
      }}>✕</button>
    </span>
  );
}

export const moved = <T,>(xs: T[], from: number, to: number): T[] => {
  const next = [...xs];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
};

/** Error keys that aren't a single field. */
const SECTION_LABELS: Record<string, string> = {
  _pages: 'Published pages', story: 'Product story', proofLine: 'Proof line', icons: 'Icon row', processSteps: 'Timeline',
  originStory: 'Origin story', comparison: 'Comparison', 'comparison.rows': 'Comparison rows', grower: 'Grower', use: 'How to cook/use',
  'comparison.imageKey': 'Comparison image', 'comparison.imageAlt': 'Comparison image description',
};
const PART_LABELS: Record<string, string> = {
  title: 'title', text: 'text', photoKey: 'photo', photoAlt: 'photo description', aspect: 'what is compared', ours: 'ours', theirs: 'theirs',
  source: 'source', heading: 'heading', bodyMd: 'text', names: 'names', place: 'place', since: 'since',
};

/** "processSteps.2.title" → "Step 3: title", "_pages" → "Published pages"; never an internal key when a name is known. */
export function storyErrorLabel(key: string): string {
  if (key === '_') return '';
  if (SECTION_LABELS[key]) return SECTION_LABELS[key];
  const named = fieldLabel(key);
  if (named !== key) return named;
  const m = key.match(/^(.+)\.([A-Za-z]+)$/);
  return m ? `${storyErrorLabel(m[1])}: ${PART_LABELS[m[2]] ?? m[2]}` : key;
}

/** A list of labelled messages (save errors or warnings); focusable so a save can move focus to it (the editor's status line announces the outcome). */
export function MessageList(props: { id: string; kind: 'error' | 'warning'; title: string; messages: Record<string, string>; label: (key: string) => string }) {
  const entries = Object.entries(props.messages);
  if (!entries.length) return null;
  return (
    <div id={props.id} className="warn" tabIndex={-1} style={props.kind === 'error' ? { borderColor: '#e5a3a3', background: '#fdeeee', color: '#7a1010' } : undefined}>
      <strong>{props.title}</strong>
      <ul style={{ margin: '0.5rem 0 0 1.25rem' }}>
        {entries.map(([k, m]) => {
          const label = props.label(k);
          return <li key={k} style={{ whiteSpace: 'pre-line' }}>{label ? <><strong>{label}:</strong> </> : null}{m}</li>;
        })}
      </ul>
    </div>
  );
}

/** After a failed save: focus the first invalid control inside `rootId`, else the error list. */
export function focusFirstError(rootId: string, listId: string) {
  requestAnimationFrame(() => {
    const root = document.getElementById(rootId);
    const first = root?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (first ?? document.getElementById(listId))?.focus();
  });
}

type LibraryPhoto = { key: string; label: string };
export type PickerImage = { key: string; url: string; alt: string; kind: 'photo' | 'infographic' };

/**
 * Picks an image for a story section: this product's own images or the
 * photo library (R2 photos/…, served from /media). Uploads go to the photo
 * library with category "story". Stores the key; alt text is edited beside it.
 */
export function ImagePicker(props: {
  label: string; value: string | null; alt: string; onChange: (key: string | null, alt: string) => void;
  productImages?: PickerImage[]; error?: string; altError?: string; altHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<LibraryPhoto[] | null>(null);
  const [msg, setMsg] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const errId = useId();

  useEffect(() => {
    const d = dialog.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);
  useEffect(() => {
    if (!open || photos) return;
    fetch('/api/photos')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((p: LibraryPhoto[]) => setPhotos(Array.isArray(p) ? p.filter((x) => typeof x?.key === 'string' && x.key.startsWith('photos/')) : []))
      .catch(() => setMsg("Couldn't load the photo library. Close this and try again."));
  }, [open, photos]);

  const choose = (key: string, alt: string) => {
    props.onChange(key, props.alt || alt);
    setOpen(false);
  };
  async function upload(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('label', props.alt || file.name.replace(/\.[a-z0-9]+$/i, ''));
    fd.append('category', 'story');
    setMsg('Uploading…');
    const res = await send('/api/photos', { method: 'POST', body: fd });
    if (res.ok && typeof res.data.key === 'string') {
      setPhotos(null);
      setMsg('');
      choose(res.data.key, '');
    } else setMsg(typeof res.data.error === 'string' && res.data.error ? res.data.error : 'Upload failed. Try again.');
  }

  const choices: Array<{ key: string; label: string; alt: string }> = [
    ...(props.productImages ?? []).map((i) => ({ key: i.key, label: `${i.kind === 'infographic' ? 'Infographic: ' : 'Product photo: '}${i.alt || 'no description'}`, alt: i.alt })),
    ...(photos ?? []).map((p) => ({ key: p.key, label: p.label, alt: '' })),
  ];

  return (
    <div role="group" aria-labelledby={`${titleId}-l`} aria-describedby={props.error ? errId : undefined}>
      <span id={`${titleId}-l`} style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666', marginBottom: '0.5rem' }}>{props.label}</span>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {props.value && <img src={mediaUrl(props.value)} alt="" width={96} height={72} style={{ objectFit: 'cover', borderRadius: 8 }} />}
        <button type="button" ref={opener} style={btn} onClick={() => { setMsg(''); setOpen(true); }}>{props.value ? 'Change image' : 'Choose image'}</button>
        {props.value && <button type="button" style={btn} onClick={() => { props.onChange(null, ''); opener.current?.focus(); }}>Remove image</button>}
      </div>
      {props.error && <Msg id={errId} kind="error">{props.error}</Msg>}
      {props.value && (
        <div style={{ marginTop: '0.5rem' }}>
          <Field label="Describe the image (alt text)" error={props.altError} hint={props.altHint ?? 'Say what it shows, e.g. “Turmeric drying on mats in the sun”.'}>
            <input type="text" value={props.alt} onChange={(e) => props.onChange(props.value, e.target.value)} />
          </Field>
        </div>
      )}
      <dialog ref={dialog} aria-labelledby={titleId} onClose={() => { setOpen(false); opener.current?.focus(); }} style={{ background: '#fff', width: 'min(900px, 92vw)', maxHeight: '85vh', overflow: 'auto', border: 'none', borderRadius: 16, padding: 0 }}>
        {/* No display style on the <dialog> itself: it would override the closed dialog's display: none. */}
        {open && (
          <div style={{ ...box, background: '#fff', border: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 id={titleId} style={h2}>Choose an image</h2>
              <button type="button" style={btn} onClick={() => setOpen(false)}>Close</button>
            </div>
            {photos === null && !msg && <p className="muted">Loading the photo library…</p>}
            {photos !== null && choices.length === 0 && <p className="muted">No images yet. Upload one below.</p>}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem' }}>
              {choices.map((p) => (
                <li key={p.key}>
                  <button type="button" aria-pressed={p.key === props.value} style={{ ...btn, width: '100%', borderRadius: 10, padding: 4, display: 'flex', flexDirection: 'column', gap: 4, borderColor: p.key === props.value ? '#196a5e' : undefined }} onClick={() => choose(p.key, p.alt)}>
                    <img src={mediaUrl(p.key)} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} />
                    <span style={{ fontSize: '0.7rem', fontWeight: 400 }}>{p.label}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Field label="Or upload a new photo to the library (up to 8 MB)">
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={async (e) => {
                const input = e.currentTarget;
                const file = input.files?.[0];
                if (!file) return;
                await upload(file);
                input.value = ''; // so the same file can be picked again after a failed upload
              }} />
            </Field>
            <p className="muted" aria-live="polite">{msg}</p>
          </div>
        )}
      </dialog>
    </div>
  );
}
