import { describe, expect, it } from 'vitest';
import { issueDocStmts } from '../../src/lib/store/docnumbers';
import { AT, db, insertOrder, insertProduct, insertVariant, scalar } from '../helpers/fixtures';

const reserve = (variantId: number, orderId: number, qty: number) => [
  db.prepare('UPDATE variants SET stock_qty = stock_qty - ? WHERE id = ?').bind(qty, variantId),
  db
    .prepare(
      "INSERT INTO stock_reservations (variant_id, order_id, qty, expires_at, state) VALUES (?, ?, ?, ?, 'held')",
    )
    .bind(variantId, orderId, qty, AT),
];


describe('products', () => {
  it('rejects a perishable product that allows COD', async () => {
    await expect(insertProduct({ perishable: 1, cod_allowed: 1 })).rejects.toThrow(/CHECK/);
    await expect(insertProduct({ perishable: 1, cod_allowed: 0 })).resolves.toBeTypeOf('number');
  });


  it('requires season start and end together, in MM-DD form', async () => {
    await expect(insertProduct({ season_start_md: '04-01' })).rejects.toThrow(/CHECK/);
    await expect(insertProduct({ season_start_md: '4-1', season_end_md: '06-30' })).rejects.toThrow(/CHECK/);
    await expect(insertProduct({ season_start_md: '04-01', season_end_md: '06-30' })).resolves.toBeTypeOf('number');
  });

});

describe('variants', () => {
  it('rejects price above MRP and non-positive price', async () => {
    const p = await insertProduct();
    await expect(insertVariant(p, { price_paise: 20000, mrp_paise: 19900 })).rejects.toThrow(/CHECK/);
    await expect(insertVariant(p, { price_paise: 0 })).rejects.toThrow(/CHECK/);
  });

  it('never lets stock go negative, rolling back the whole batch', async () => {
    const p = await insertProduct();
    const v = await insertVariant(p, { stock_qty: 1 });
    const o = await insertOrder();
    await expect(db.batch(reserve(v, o, 2))).rejects.toThrow(/stock_qty >= 0/);
    expect(await scalar('SELECT stock_qty FROM variants WHERE id = ?', v)).toBe(1);
    expect(await scalar('SELECT count(*) FROM stock_reservations WHERE order_id = ?', o)).toBe(0);
  });

});

describe('stock_reservations', () => {
  it('refuses reservations for an inactive variant or a non-active product', async () => {
    const o = await insertOrder();
    const inactive = await insertVariant(await insertProduct(), { active: 0 });
    await expect(db.batch(reserve(inactive, o, 1))).rejects.toThrow(/not purchasable/);
    const draft = await insertVariant(await insertProduct({ status: 'draft' }));
    await expect(db.batch(reserve(draft, o, 1))).rejects.toThrow(/not purchasable/);
    expect(await scalar('SELECT stock_qty FROM variants WHERE id = ?', draft)).toBe(10);
  });

  it('keeps released rows as history and allows a fresh hold for the same line', async () => {
    const v = await insertVariant(await insertProduct());
    const o = await insertOrder();
    await db.batch(reserve(v, o, 1));
    await expect(db.batch(reserve(v, o, 1))).rejects.toThrow(/UNIQUE/); // one live hold per line
    await db.prepare("UPDATE stock_reservations SET state = 'released' WHERE order_id = ?").bind(o).run();
    await db.batch(reserve(v, o, 1)); // late authorisation re-reserves
    expect(await scalar('SELECT count(*) FROM stock_reservations WHERE order_id = ?', o)).toBe(2);
  });

  it('never changes or deletes a reservation line', async () => {
    const v = await insertVariant(await insertProduct());
    const o = await insertOrder();
    await db.batch(reserve(v, o, 2));
    await expect(db.prepare('UPDATE stock_reservations SET qty = 1 WHERE order_id = ?').bind(o).run()).rejects.toThrow(/immutable/);
    await expect(db.prepare('DELETE FROM stock_reservations WHERE order_id = ?').bind(o).run()).rejects.toThrow(/permanent/);
  });

  it('only moves forward from held', async () => {
    const v = await insertVariant(await insertProduct());
    const o = await insertOrder();
    await db.batch(reserve(v, o, 1));
    await db.prepare("UPDATE stock_reservations SET state = 'consumed' WHERE order_id = ?").bind(o).run();
    await expect(
      db.prepare("UPDATE stock_reservations SET state = 'released' WHERE order_id = ?").bind(o).run(),
    ).rejects.toThrow(/reservation state is final/);
  });
});

describe('orders and items', () => {
  it('requires total = subtotal - discount', async () => {
    await expect(insertOrder({ total_paise: 1 })).rejects.toThrow(/CHECK/);
  });


  it('requires line totals to equal taxable + tax and never mixes IGST with CGST/SGST', async () => {
    const o = await insertOrder();
    const v = await insertVariant(await insertProduct());
    const item = (over: Record<string, number>) => {
      const row = {
        order_id: o, variant_id: v, qty: 1, unit_price_paise: 69900, mrp_paise: 79900, gst_rate_bp: 500,
        discount_paise: 0, taxable_paise: 66571, cgst_paise: 1664, sgst_paise: 1665, igst_paise: 0,
        line_total_paise: 69900, ...over,
      };
      return db
        .prepare(
          `INSERT INTO order_items (order_id, variant_id, product_name, variant_label, sku, hsn_code, qty,
             unit_price_paise, mrp_paise, gst_rate_bp, discount_paise, taxable_paise, cgst_paise, sgst_paise,
             igst_paise, line_total_paise)
           VALUES (?, ?, 'Karjat 3', '5 kg', 'KJ-5', '1006', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(row.order_id, row.variant_id, row.qty, row.unit_price_paise, row.mrp_paise, row.gst_rate_bp,
          row.discount_paise, row.taxable_paise, row.cgst_paise, row.sgst_paise, row.igst_paise, row.line_total_paise)
        .run();
    };
    await expect(item({})).resolves.toBeDefined();
    await expect(item({ taxable_paise: 66570 })).rejects.toThrow(/CHECK/);
    await expect(item({ igst_paise: 1, sgst_paise: 1664 })).rejects.toThrow(/CHECK/);
    await expect(item({ qty: 21, unit_price_paise: 1, line_total_paise: 69900 })).rejects.toThrow(/CHECK/);
  });
});

describe('invoices', () => {
  const issue = (orderId: number, docType: 'tax_invoice' | 'credit_note' = 'tax_invoice', ref: number | null = null) =>
    db.batch(
      issueDocStmts(db, {
        series: docType === 'credit_note' ? 'CN' : 'INV',
        fy: '2627',
        docType,
        orderId,
        refInvoiceId: ref,
        issuedAt: AT,
        snapshot: {},
      }),
    );



  it('invoices are immutable', async () => {
    const o = await insertOrder();
    await issue(o);
    const id = await scalar('SELECT id FROM invoices WHERE order_id = ?', o);
    await expect(db.prepare("UPDATE invoices SET reason = 'x' WHERE id = ?").bind(id).run()).rejects.toThrow(/immutable/);
    await expect(db.prepare('DELETE FROM invoices WHERE id = ?').bind(id).run()).rejects.toThrow(/immutable/);
  });

  it('rejects a sequence number that does not match the counter (no gaps, no reuse)', async () => {
    const o = await insertOrder();
    await expect(
      db
        .prepare(
          `INSERT INTO invoices (series, doc_type, fy, seq, doc_no, order_id, issued_at, snapshot)
           VALUES ('INV', 'tax_invoice', '2627', 500, 'HL/2627/000500', ?, ?, '{}')`,
        )
        .bind(o, AT)
        .run(),
    ).rejects.toThrow(/sequence mismatch/);
  });

});

describe('order_events', () => {

  it('order_events are append-only', async () => {
    const o = await insertOrder();
    await db
      .prepare("INSERT INTO order_events (order_id, at, type, actor) VALUES (?, ?, 'placed', 'system')")
      .bind(o, AT)
      .run();
    await expect(db.prepare("UPDATE order_events SET note = 'x' WHERE order_id = ?").bind(o).run()).rejects.toThrow(/append-only/);
    await expect(db.prepare('DELETE FROM order_events WHERE order_id = ?').bind(o).run()).rejects.toThrow(/append-only/);
  });


});

it('0008 adds the story, GI and image-kind columns with their checks, and seeds three unpublished pages', async () => {
  await expect(insertProduct({ story: '[]' })).rejects.toThrow(/CHECK/);
  await expect(insertProduct({ story: '{"processSteps":[]}', gi_name: 'Wada Kolam', gi_au_reg_number: 'AU-1' })).resolves.toBeTypeOf('number');
  const pid = await insertProduct();
  await db.prepare("INSERT INTO product_images (product_id, r2_key, alt, sort) VALUES (?, 'products/x/a.jpg', 'a', 0)").bind(pid).run();
  expect(await scalar(`SELECT kind FROM product_images WHERE product_id = ${pid}`)).toBe('photo');
  await expect(db.prepare("INSERT INTO product_images (product_id, r2_key, alt, sort, kind) VALUES (?, 'products/x/b.jpg', 'b', 1, 'banner')").bind(pid).run()).rejects.toThrow(/CHECK/);
  await expect(db.prepare("INSERT INTO story_pages (slug, draft, draft_saved_at) VALUES ('x', '[]', ?)").bind(AT).run()).rejects.toThrow(/CHECK/);

  const { results } = await db.prepare('SELECT slug, published, json_type(draft) AS t FROM story_pages ORDER BY slug').all<{ slug: string; published: string | null; t: string }>();
  expect(results).toEqual(['rice', 'spices', 'turmeric'].map((slug) => ({ slug, published: null, t: 'object' })));
  expect(String(await scalar("SELECT draft FROM story_pages WHERE slug = 'rice'"))).not.toMatch(/GI-tagged|Wada Kolam/i);
});
