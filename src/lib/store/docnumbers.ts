/**
 * Statements that issue the next GST document number inside a batch.
 *
 * Put these in the same D1 batch as the `issue_invoice` claim. The counter row
 * for the FY is created on demand (so a new financial year never silently
 * issues nothing), advanced by exactly one (a trigger enforces it), and the
 * invoice row takes that value through a scalar subquery — if it were ever
 * missing, `seq` would be NULL and the NOT NULL constraint aborts the batch.
 */
import { docPrefix, docWidth, type DocSeries } from './fy';

export interface IssueDocInput {
  series: DocSeries;
  fy: string;
  docType: 'tax_invoice' | 'bill_of_supply' | 'invoice_cum_bill_of_supply' | 'credit_note';
  orderId: number;
  refInvoiceId?: number | null;
  issuedAt: string;
  snapshot: unknown;
  reason?: string | null;
}

export function issueDocStmts(db: D1Database, d: IssueDocInput): D1PreparedStatement[] {
  if ((d.series === 'CN') !== (d.docType === 'credit_note')) throw new RangeError('series and document type disagree');
  const prefix = docPrefix(d.series, d.fy);
  const width = docWidth(d.series);
  return [
    db.prepare('INSERT OR IGNORE INTO doc_counters (series, fy, last_no) VALUES (?, ?, 0)').bind(d.series, d.fy),
    db.prepare('UPDATE doc_counters SET last_no = last_no + 1 WHERE series = ? AND fy = ?').bind(d.series, d.fy),
    db
      .prepare(
        `INSERT INTO invoices (series, doc_type, fy, seq, doc_no, order_id, ref_invoice_id, issued_at, snapshot, reason)
         VALUES (?1, ?2, ?3,
                 (SELECT last_no FROM doc_counters WHERE series = ?1 AND fy = ?3),
                 ?4 || printf('%0' || ?5 || 'd', (SELECT last_no FROM doc_counters WHERE series = ?1 AND fy = ?3)),
                 ?6, ?7, ?8, ?9, ?10)`,
      )
      .bind(d.series, d.docType, d.fy, prefix, width, d.orderId, d.refInvoiceId ?? null, d.issuedAt, JSON.stringify(d.snapshot ?? {}), d.reason ?? null),
  ];
}
