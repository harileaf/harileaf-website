/**
 * The product editor's photo, batch and lab-report sections. Each change is
 * saved straight away through /api/admin/products/[id]/*, apart from the
 * product form, so unsaved form edits survive.
 */
import { useEffect, useId, useState } from 'react';
import { LAB_KEYS } from '../../lib/store/story';
import { addBtn, box, btn, Field, row, sel, send, small } from './story-ui';

export interface EditorImage { id: number; url: string; key: string; alt: string; sort: number; kind: 'photo' | 'infographic' }
export interface EditorBatch { id: number; batchCode: string; packedOn: string; groundOrMilledOn: string | null; labReportId: number | null; active: boolean }
export interface EditorLab { id: number; batchCode: string; testedOn: string; labName: string; visible: boolean; pdfUrl: string | null }

const json = (body: unknown): RequestInit => ({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const INFOGRAPHIC_HINT = "Infographic: describe what the image says in a full sentence. Every fact in it must also appear in the page's sections.";

export function Images(props: { productId: number; images: EditorImage[]; onChanged: () => Promise<void> }) {
  const [images, setImages] = useState(props.images);
  useEffect(() => setImages(props.images), [props.images]);
  const [alt, setAlt] = useState('');
  const [msg, setMsg] = useState('');
  const base = `/api/admin/products/${props.productId}/images`;
  const hintId = useId();

  async function upload(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('alt', alt);
    setMsg('Uploading…');
    const res = await send(base, { method: 'POST', body: fd });
    if (res.ok) {
      await props.onChanged();
      setAlt('');
      setMsg('✓ Uploaded');
    } else setMsg(String(res.data.error ?? 'Upload failed'));
  }

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    setImages(next);
    await Promise.all(next.map((img, k) => send(base, json({ imageId: img.id, sort: k }))));
  }

  async function setKind(img: EditorImage, kind: EditorImage['kind']) {
    setImages((xs) => xs.map((x) => (x.id === img.id ? { ...x, kind } : x)));
    const res = await send(base, json({ imageId: img.id, kind }));
    if (res.ok) setMsg(`✓ Image ${images.findIndex((x) => x.id === img.id) + 1} is now ${kind === 'infographic' ? 'an infographic' : 'a photo'}`);
    else {
      setImages((xs) => xs.map((x) => (x.id === img.id ? { ...x, kind: img.kind } : x)));
      setMsg(String(res.data.error ?? "Couldn't change the image type"));
    }
  }

  return (
    <section style={box}>
      <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Photos</h2>
      <p className="muted">The first photo is used in search results and the Google Shopping feed. JPEG/PNG/WebP/AVIF, up to 5 MB. Mark charts and labelled diagrams as “Infographic”.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
        {images.map((img, i) => (
          <figure key={img.id} style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
            <img src={img.url} alt={img.alt} style={{ width: '100%', aspectRatio: '4/3', objectFit: img.kind === 'infographic' ? 'contain' : 'cover' }} />
            <figcaption style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <select aria-label={`Image ${i + 1} type`} value={img.kind} onChange={(e) => setKind(img, e.target.value === 'infographic' ? 'infographic' : 'photo')} style={{ ...sel, padding: '0.4rem' }}>
                <option value="photo">Photo</option><option value="infographic">Infographic</option>
              </select>
              <input type="text" aria-label={`Image ${i + 1} alt text`} aria-describedby={img.kind === 'infographic' ? `${hintId}-${img.id}` : undefined} defaultValue={img.alt} onBlur={(e) => e.target.value !== img.alt && send(base, json({ imageId: img.id, alt: e.target.value }))} />
              {img.kind === 'infographic' && <p id={`${hintId}-${img.id}`} style={small}>{INFOGRAPHIC_HINT}</p>}
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button type="button" style={btn} onClick={() => move(i, -1)} aria-label={`Move image ${i + 1} earlier`}>←</button>
                <button type="button" style={btn} onClick={() => move(i, 1)} aria-label={`Move image ${i + 1} later`}>→</button>
                <button type="button" style={{ ...btn, color: '#c00', marginLeft: 'auto' }} aria-label={`Delete image ${i + 1}`} onClick={async () => {
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

export function Batches(props: { productId: number; categorySlug: string; batches: EditorBatch[]; labReports: EditorLab[]; onChanged: () => Promise<void> }) {
  const [msg, setMsg] = useState('');
  const [b, setB] = useState({ batchCode: '', packedOn: '', groundOrMilledOn: '', labReportId: '', makeActive: true });
  const [lab, setLab] = useState({ batchCode: '', testedOn: '', labName: '', labAccreditation: '', testScope: '' });
  const standardKeys = LAB_KEYS[props.categorySlug] ?? [];
  const [results, setResults] = useState<Array<[string, string]>>(() => (standardKeys.length ? standardKeys : ['']).map((k) => [k, '']));
  const listId = useId();
  const base = `/api/admin/products/${props.productId}`;
  const summary = Object.fromEntries(results.filter(([k, v]) => k.trim() && v.trim()).map(([k, v]) => [k.trim(), v.trim()]));

  return (
    <section style={box}>
      <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Batches &amp; lab reports</h2>
      <p className="muted">The active batch's packed-on date and code are shown in the buy box, with a “Lab tested” badge when it links a visible report.</p>
      <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
        <thead><tr style={{ textAlign: 'left' }}><th scope="col">Batch</th><th scope="col">Packed</th><th scope="col">Ground/milled</th><th scope="col">Lab report</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {props.batches.map((x) => (
            <tr key={x.id} style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
              <td>{x.batchCode} {x.active && <strong style={{ color: '#196a5e' }}>· active</strong>}</td>
              <td>{x.packedOn}</td>
              <td>{x.groundOrMilledOn ?? '—'}</td>
              <td>{props.labReports.find((l) => l.id === x.labReportId)?.labName ?? '—'}</td>
              <td>{!x.active && <button type="button" style={btn} aria-label={`Make batch ${x.batchCode} active`} onClick={async () => {
                const res = await send(`${base}/batches`, json({ batchId: x.id }));
                if (res.ok) { await props.onChanged(); setMsg('✓ Saved'); } else setMsg(String(res.data.error));
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
          <select value={b.labReportId} onChange={(e) => setB({ ...b, labReportId: e.target.value })} style={sel}>
            <option value="">None</option>
            {props.labReports.map((l) => (<option key={l.id} value={l.id}>{l.batchCode} · {l.labName} · {l.testedOn}</option>))}
          </select>
        </Field>
      </div>
      <button type="button" style={addBtn} onClick={async () => {
        const res = await send(`${base}/batches`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...b, groundOrMilledOn: b.groundOrMilledOn || null, labReportId: b.labReportId ? Number(b.labReportId) : null }) });
        if (res.ok) { await props.onChanged(); setMsg('✓ Saved'); } else setMsg(String(res.data.error));
      }}>+ Add batch (make active)</button>

      <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginTop: '1rem' }}>Lab reports</h3>
      <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem' }}>
        {props.labReports.map((l) => (
          <li key={l.id}>
            {l.batchCode} · {l.labName} · {l.testedOn} {l.pdfUrl && <a href={l.pdfUrl} target="_blank" rel="noreferrer">PDF</a>}{' '}
            <button type="button" style={btn} aria-label={`${l.visible ? 'Hide' : 'Show'} the ${l.batchCode} report from ${l.labName}`} onClick={async () => {
              const res = await send(`${base}/lab-reports`, json({ reportId: l.id, visible: !l.visible }));
              if (res.ok) { await props.onChanged(); setMsg('✓ Saved'); } else setMsg(String(res.data.error));
            }}>{l.visible ? 'Hide' : 'Show'}</button>
          </li>
        ))}
      </ul>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set('summary', JSON.stringify(summary));
        const res = await send(`${base}/lab-reports`, { method: 'POST', body: fd });
        if (res.ok) { await props.onChanged(); setMsg('✓ Saved'); } else setMsg(String(res.data.error));
      }} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={row}>
          <Field label="Batch code"><input name="batchCode" type="text" value={lab.batchCode} onChange={(e) => setLab({ ...lab, batchCode: e.target.value })} /></Field>
          <Field label="Tested on"><input name="testedOn" type="date" value={lab.testedOn} onChange={(e) => setLab({ ...lab, testedOn: e.target.value })} /></Field>
          <Field label="Lab name"><input name="labName" type="text" value={lab.labName} onChange={(e) => setLab({ ...lab, labName: e.target.value })} /></Field>
          <Field label="Accreditation (e.g. NABL TC-…)"><input name="labAccreditation" type="text" value={lab.labAccreditation} onChange={(e) => setLab({ ...lab, labAccreditation: e.target.value })} /></Field>
        </div>
        <Field label="What was tested"><input name="testScope" type="text" value={lab.testScope} onChange={(e) => setLab({ ...lab, testScope: e.target.value })} /></Field>
        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <legend style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666', marginBottom: '0.5rem' }}>Results</legend>
          <p style={{ ...small, marginTop: 0 }}>One row per result: the name (pick a standard one so the product page can show it) and the value with units. Empty rows are skipped.</p>
          {results.map(([k, v], i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem' }}>
              <input type="text" list={listId} aria-label={`Result ${i + 1} name`} placeholder="e.g. Curcumin" value={k} onChange={(e) => setResults(results.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
              <input type="text" aria-label={`Result ${i + 1} value with units`} placeholder="e.g. 5.1 %" value={v} onChange={(e) => setResults(results.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
              <button type="button" style={btn} aria-label={`Remove result ${i + 1}`} onClick={() => setResults(results.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <datalist id={listId}>{standardKeys.map((k) => <option key={k} value={k} />)}</datalist>
          <button type="button" style={addBtn} onClick={() => setResults([...results, ['', '']])}>+ Add result</button>
        </fieldset>
        <Field label="Report PDF"><input name="pdf" type="file" accept="application/pdf" /></Field>
        <button type="submit" style={addBtn}>+ Add lab report</button>
      </form>
      <p className="muted" aria-live="polite">{msg}</p>
    </section>
  );
}
