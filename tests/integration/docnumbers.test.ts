import { describe, expect, it } from 'vitest';
import { issueDocStmts } from '../../src/lib/store/docnumbers';
import { AT, db, insertOrder, scalar } from '../helpers/fixtures';

const issue = (orderId: number, fy = '2627', over: Partial<Parameters<typeof issueDocStmts>[1]> = {}) =>
  db.batch(issueDocStmts(db, { series: 'INV', fy, docType: 'tax_invoice', orderId, issuedAt: AT, snapshot: { lines: [] }, ...over }));

const docNo = (orderId: number, series = 'INV') =>
  scalar<string>('SELECT doc_no FROM invoices WHERE order_id = ? AND series = ? ORDER BY id DESC LIMIT 1', orderId, series);

describe('issueDocStmts', () => {
  it('issues consecutive numbers', async () => {
    const a = await insertOrder();
    const b = await insertOrder();
    await issue(a);
    await issue(b);
    const [na, nb] = [await docNo(a), await docNo(b)];
    expect(Number(nb.split('/')[2])).toBe(Number(na.split('/')[2]) + 1);
    expect(na).toMatch(/^HL\/2627\/\d{6}$/);
  });

  it('creates the counter for a financial year that was never seeded', async () => {
    const o = await insertOrder();
    await issue(o, '2829');
    expect(await docNo(o)).toBe('HL/2829/000001');
    expect(await scalar("SELECT last_no FROM doc_counters WHERE series = 'INV' AND fy = '2829'")).toBe(1);
  });

  it('issues credit notes against an invoice of the same order only', async () => {
    const o = await insertOrder();
    await issue(o);
    const inv = await scalar('SELECT id FROM invoices WHERE order_id = ? AND series = ?', o, 'INV');
    await issue(o, '2627', { series: 'CN', docType: 'credit_note', refInvoiceId: inv, reason: 'cancelled' });
    expect(await docNo(o, 'CN')).toMatch(/^HLCN\/2627\/\d{5}$/);

    const other = await insertOrder();
    await expect(issue(other, '2627', { series: 'CN', docType: 'credit_note', refInvoiceId: inv })).rejects.toThrow(/same order/);
    const cn = await scalar('SELECT id FROM invoices WHERE order_id = ? AND series = ?', o, 'CN');
    await expect(issue(o, '2627', { series: 'CN', docType: 'credit_note', refInvoiceId: cn })).rejects.toThrow(/same order/);
  });

  it('burns no number when the batch fails', async () => {
    const o = await insertOrder();
    await issue(o);
    const before = await scalar("SELECT last_no FROM doc_counters WHERE series = 'INV' AND fy = '2627'");
    await expect(issue(o)).rejects.toThrow(/UNIQUE/); // second invoice for the same order
    expect(await scalar("SELECT last_no FROM doc_counters WHERE series = 'INV' AND fy = '2627'")).toBe(before);
  });

  it('refuses a mismatched series and document type', () => {
    expect(() => issueDocStmts(db, { series: 'INV', fy: '2627', docType: 'credit_note', orderId: 1, issuedAt: AT, snapshot: {} })).toThrow();
  });
});

describe('document counter guards', () => {
  it('only advances by one and cannot be deleted', async () => {
    await expect(db.prepare("UPDATE doc_counters SET last_no = last_no + 2 WHERE series = 'CN' AND fy = '2728'").run()).rejects.toThrow(/advance by one/);
    await expect(db.prepare("UPDATE doc_counters SET last_no = 0 WHERE series = 'INV' AND fy = '2627'").run()).rejects.toThrow(/advance by one/);
    await expect(db.prepare("DELETE FROM doc_counters WHERE series = 'CN' AND fy = '2728'").run()).rejects.toThrow(/permanent/);
  });

  it('rejects a document number that does not match its series, year and sequence', async () => {
    const o = await insertOrder();
    await expect(
      db.batch([
        db.prepare("UPDATE doc_counters SET last_no = last_no + 1 WHERE series = 'INV' AND fy = '2728'"),
        db
          .prepare(
            `INSERT INTO invoices (series, doc_type, fy, seq, doc_no, order_id, issued_at, snapshot)
             SELECT 'INV', 'tax_invoice', '2728', last_no, 'HL/2728/999999', ?, ?, '{}'
             FROM doc_counters WHERE series = 'INV' AND fy = '2728'`,
          )
          .bind(o, AT),
      ]),
    ).rejects.toThrow(/CHECK/);
  });
});
