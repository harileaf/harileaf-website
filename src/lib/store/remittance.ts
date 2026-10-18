/**
 * COD remittance import: Shiprocket's remittance report (CSV) → cod_remittances,
 * matched to orders by AWB (or our order number). Column names vary between
 * report versions, so headers are matched loosely.
 */
import { nowIso } from './db';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

export interface RemittanceRow { awb: string | null; orderNo: string | null; amountPaise: number; remittedOn: string | null; utr: string | null }

export function remittanceRows(text: string): { rows: RemittanceRow[]; error?: string } {
  const [header, ...body] = parseCsv(text);
  if (!header) return { rows: [], error: 'The file is empty' };
  const h = header.map((x) => x.trim().toLowerCase());
  const col = (re: RegExp, not?: RegExp) => h.findIndex((x) => re.test(x) && !(not && not.test(x)));
  const awb = col(/awb/);
  const order = col(/channel order|order (id|no|number)|^order$/, /shiprocket|sr order/);
  const amount = col(/cod.*amount|remit.*amount|^amount|collected/, /charge|fee|deduct/);
  const utr = col(/utr|crf|bank ref|reference/);
  const date = col(/remit.*date|^date|paid on|remitted on/);
  if (amount < 0 || (awb < 0 && order < 0)) return { rows: [], error: 'Couldn’t find the AWB/order and amount columns' };
  const rows = body.map((r) => {
    const amt = Number(String(r[amount] ?? '').replace(/[₹,\s]/g, ''));
    return {
      awb: awb >= 0 ? r[awb]?.trim() || null : null,
      orderNo: order >= 0 ? r[order]?.trim().toUpperCase() || null : null,
      amountPaise: Number.isFinite(amt) ? Math.round(amt * 100) : -1,
      remittedOn: date >= 0 ? r[date]?.trim() || null : null,
      utr: utr >= 0 ? r[utr]?.trim() || null : null,
    };
  });
  return { rows };
}

export interface ImportReport {
  imported: number; duplicates: number; unmatched: string[]; invalid: number;
  mismatched: Array<{ orderNo: string; expected: number; got: number }>;
  notCod: string[];
}

/** D1 allows ~1000 queries per Worker invocation (Paid); each row is one insert. */
export const MAX_ROWS = 800;

export async function importRemittances(db: D1Database, text: string, now: Date): Promise<ImportReport | { error: string }> {
  const parsed = remittanceRows(text);
  if (parsed.error) return { error: parsed.error };
  if (parsed.rows.length > MAX_ROWS) return { error: `Too many rows (${parsed.rows.length}) — split the file into parts of ${MAX_ROWS} or fewer` };
  const report: ImportReport = { imported: 0, duplicates: 0, unmatched: [], mismatched: [], invalid: 0, notCod: [] };
  const rows = parsed.rows.filter((r) => {
    const ok = r.amountPaise >= 0 && Boolean(r.awb || r.orderNo);
    if (!ok) report.invalid += 1;
    return ok;
  });

  // Look orders up in chunks by AWB and order number.
  type Hit = { id: number; order_no: string; total_paise: number; awb: string | null; payment_method: string };
  const byAwb = new Map<string, Hit>();
  const byNo = new Map<string, Hit>();
  const keys = [...new Set(rows.flatMap((r) => [r.awb, r.orderNo].filter((x): x is string => Boolean(x))))];
  for (let i = 0; i < keys.length; i += 50) {
    const chunk = keys.slice(i, i + 50);
    const marks = chunk.map(() => '?').join(',');
    const { results } = await db
      .prepare(`SELECT id, order_no, total_paise, awb, payment_method FROM orders WHERE awb IN (${marks}) OR order_no IN (${marks})`)
      .bind(...chunk, ...chunk)
      .all<Hit>();
    for (const h of results) {
      if (h.awb) byAwb.set(h.awb, h);
      byNo.set(h.order_no, h);
    }
  }

  const at = nowIso(now);
  const matched = rows.map((r) => ({ r, o: (r.awb && byAwb.get(r.awb)) || (r.orderNo && byNo.get(r.orderNo)) || null }));
  for (let i = 0; i < matched.length; i += 50) {
    const chunk = matched.slice(i, i + 50);
    const res = await db.batch(
      chunk.map(({ r, o }) =>
        db
          .prepare('INSERT OR IGNORE INTO cod_remittances (order_id, order_no, awb, amount_paise, remitted_on, utr, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          // UNIQUE(awb, utr) dedupes re-imports; NULLs never collide in SQLite, so key AWB-less rows by order number.
          .bind(o?.id ?? null, o?.order_no ?? r.orderNo, r.awb ?? `#${r.orderNo}`, r.amountPaise, r.remittedOn, r.utr ?? '', at),
      ),
    );
    chunk.forEach(({ r, o }, j) => {
      if (!(res[j].meta.changes ?? 0)) {
        report.duplicates += 1;
        return;
      }
      report.imported += 1;
      if (!o) report.unmatched.push(r.awb ?? r.orderNo ?? '?');
      else {
        if (o.payment_method !== 'cod') report.notCod.push(o.order_no);
        if (o.total_paise !== r.amountPaise) report.mismatched.push({ orderNo: o.order_no, expected: o.total_paise, got: r.amountPaise });
      }
    });
  }
  return report;
}
