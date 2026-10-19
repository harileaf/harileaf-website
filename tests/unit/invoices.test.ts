import { describe, expect, it } from 'vitest';
import { creditNoteSnapshot, invoiceSnapshot, partialCreditNoteSnapshot } from '../../src/lib/store/invoices';
import type { OrderItemRow, OrderRow } from '../../src/lib/store/orders';
import { SETTING_DEFAULTS } from '../../src/lib/store/settings';

const settings = { ...SETTING_DEFAULTS, legal_name: 'HariLeaf Agritech Pvt Ltd', address: 'Borivali, Mumbai 400092', gstin: '27AAPFU0939F1ZV', fssai_license: '11524999000123', state_code: '27' };

const order = (over: Partial<OrderRow> = {}) =>
  ({
    id: 1, order_no: 'HL-2610-0042', customer_name: 'Asha Rao', email: 'asha@example.com', phone: '9820012345', payment_method: 'cod',
    ship_line1: '12 Lake Road', ship_line2: null, ship_city: 'Mumbai', ship_state: 'Maharashtra', ship_state_code: '27', ship_pincode: '400092',
    bill_same_as_ship: 1, bill_name: null, bill_line1: null, bill_line2: null, bill_city: null, bill_state: null, bill_state_code: null, bill_pincode: null,
    buyer_gstin: null, buyer_legal_name: null, created_at: '2026-10-18T06:30:00.000Z', ...over,
  }) as OrderRow;

const item = (over: Partial<OrderItemRow> = {}) =>
  ({
    id: 1, variant_id: 1, product_name: 'Karjat 3 Rice', variant_label: '5 kg', sku: 'KJ3-5KG', hsn_code: '1006', gst_rate_bp: 500, unit_price_paise: 69900,
    mrp_paise: 79900, qty: 2, discount_paise: 0, taxable_paise: 133143, cgst_paise: 3328, sgst_paise: 3329, igst_paise: 0, line_total_paise: 139800, perishable: 0, ...over,
  }) as OrderItemRow;

describe('invoiceSnapshot', () => {
  it('builds a tax invoice with seller, buyer, place of supply and totals', () => {
    const s = invoiceSnapshot(order(), [item()], settings);
    expect(s).toMatchObject({
      docType: 'tax_invoice', title: 'Tax Invoice', intraState: true, reverseCharge: false,
      seller: { legalName: 'HariLeaf Agritech Pvt Ltd', gstin: '27AAPFU0939F1ZV', state: 'Maharashtra', fssai: '11524999000123' },
      placeOfSupply: { stateCode: '27', state: 'Maharashtra' },
      order: { orderNo: 'HL-2610-0042', paymentMethod: 'cod' },
      totals: { taxable: 133143, cgst: 3328, sgst: 3329, igst: 0, total: 139800, inWords: 'Rupees One Thousand Three Hundred Ninety Eight Only' },
    });
    expect(s.lines[0]).toMatchObject({ description: 'Karjat 3 Rice — 5 kg', hsn: '1006', qty: 2, rateBp: 500 });
    expect(s.buyer.billing).toEqual(s.buyer.shipping);
  });

  it('marks inter-state supply and uses the billing address and buyer GSTIN when given', () => {
    const s = invoiceSnapshot(
      order({ ship_state_code: '29', ship_state: 'Karnataka', bill_same_as_ship: 0, bill_line1: '1 MG Road', bill_city: 'Bengaluru', bill_state_code: '29', bill_state: 'Karnataka', bill_pincode: '560001', buyer_gstin: '29AAACR5055K1Z7', buyer_legal_name: 'Rao Foods LLP' }),
      [item({ cgst_paise: 0, sgst_paise: 0, igst_paise: 6657 })],
      settings,
    );
    expect(s.intraState).toBe(false);
    expect(s.placeOfSupply).toEqual({ stateCode: '29', state: 'Karnataka' });
    expect(s.buyer).toMatchObject({ gstin: '29AAACR5055K1Z7', billing: { name: 'Rao Foods LLP', lines: ['1 MG Road', 'Bengaluru 560001'], stateCode: '29' } });
    expect(s.totals.igst).toBe(6657);
  });


  it('builds a credit note referencing the invoice', () => {
    const inv = invoiceSnapshot(order(), [item()], settings);
    const cn = creditNoteSnapshot(inv, { docNo: 'HL/2627/000042', issuedAt: '2026-10-19T05:00:00.000Z' }, 'Cancelled by customer');
    expect(cn).toMatchObject({ docType: 'credit_note', title: 'Credit Note', reference: { docNo: 'HL/2627/000042' }, reason: 'Cancelled by customer', totals: { total: 139800 } });
  });

  it('a partial credit note for a discounted line shows the discount, so qty × price − discount is the line total', () => {
    // ₹699 × 2 with ₹139.80 off (10% code): ₹1,258.20; one unit refunded = ₹629.10.
    const inv = invoiceSnapshot(order(), [item({ discount_paise: 13980, taxable_paise: 119829, cgst_paise: 2995, sgst_paise: 2996, line_total_paise: 125820 })], settings);
    const cn = partialCreditNoteSnapshot(inv, { docNo: 'HL/2627/000042', issuedAt: '2026-10-19T05:00:00.000Z' }, 'One pack damaged', [{ item: item(), qty: 1, amount: 62910 }]);
    const [l] = cn.lines;
    expect(l.qty * l.unitPrice - l.discount).toBe(l.total);
    expect(l).toMatchObject({ qty: 1, unitPrice: 69900, discount: 6990, total: 62910 });
    expect(l.taxable + l.cgst + l.sgst + l.igst).toBe(l.total);
    expect(cn.totals.total).toBe(62910);
  });

});
