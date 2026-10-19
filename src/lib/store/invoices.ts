/**
 * GST document snapshots (spec: GST invoices). The snapshot holds everything
 * printed on the document; the HTML view renders only from it plus the
 * number/date the database assigned, so later edits never change an issued
 * document.
 */
import { documentType, splitTax, type DocumentType } from './gst';
import { stateName } from './india-states';
import { amountInWords } from './money';
import type { OrderItemRow, OrderRow } from './orders';
import type { StoreSettings } from './settings';

export interface DocAddress {
  name: string;
  lines: string[];
  stateCode: string;
  state: string;
}

export interface DocLine {
  description: string;
  hsn: string;
  qty: number;
  unitPrice: number;
  discount: number;
  taxable: number;
  rateBp: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface DocSnapshot {
  version: 1;
  docType: DocumentType | 'credit_note' | 'delivery_challan';
  title: string;
  seller: { legalName: string; tradeName: string; address: string; gstin: string; stateCode: string; state: string; fssai: string };
  buyer: { billing: DocAddress; shipping: DocAddress; gstin: string | null; legalName: string | null; email: string; phone: string };
  placeOfSupply: { stateCode: string; state: string };
  intraState: boolean;
  reverseCharge: false;
  /** couponCode: added in v2 (optional, so older snapshots render unchanged). */
  order: { orderNo: string; orderDate: string; paymentMethod: 'razorpay' | 'cod'; couponCode?: string };
  lines: DocLine[];
  totals: { taxable: number; cgst: number; sgst: number; igst: number; total: number; inWords: string };
  reference?: { docNo: string; issuedAt: string };
  reason?: string;
}

const TITLES: Record<DocumentType | 'credit_note' | 'delivery_challan', string> = {
  tax_invoice: 'Tax Invoice',
  bill_of_supply: 'Bill of Supply',
  invoice_cum_bill_of_supply: 'Invoice-cum-Bill of Supply',
  credit_note: 'Credit Note',
  delivery_challan: 'Delivery Challan',
};

function shipping(o: OrderRow): DocAddress {
  return { name: o.customer_name, lines: [o.ship_line1, o.ship_line2, `${o.ship_city} ${o.ship_pincode}`].filter((x): x is string => Boolean(x)), stateCode: o.ship_state_code, state: o.ship_state };
}

function billing(o: OrderRow): DocAddress {
  if (o.bill_same_as_ship || !o.bill_line1 || !o.bill_state_code) return shipping(o);
  return {
    name: o.buyer_legal_name ?? o.bill_name ?? o.customer_name,
    lines: [o.bill_line1, o.bill_line2, `${o.bill_city ?? ''} ${o.bill_pincode ?? ''}`.trim()].filter((x): x is string => Boolean(x)),
    stateCode: o.bill_state_code,
    state: o.bill_state ?? stateName(o.bill_state_code) ?? '',
  };
}

/**
 * Goods: the delivery state, except a registered buyer billed in one state and
 * shipped to another on their instruction — then the billing state (IGST Act
 * s.10(1)(b)). Mirrors checkout's placeOfSupplyCode.
 */
function placeOfSupply(o: OrderRow): { stateCode: string; state: string } {
  if (o.buyer_gstin && !o.bill_same_as_ship && o.bill_state_code) return { stateCode: o.bill_state_code, state: o.bill_state ?? stateName(o.bill_state_code) ?? '' };
  return { stateCode: o.ship_state_code, state: o.ship_state };
}

function totals(lines: DocLine[]) {
  const t = lines.reduce((a, l) => ({ taxable: a.taxable + l.taxable, cgst: a.cgst + l.cgst, sgst: a.sgst + l.sgst, igst: a.igst + l.igst, total: a.total + l.total }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });
  return { ...t, inWords: amountInWords(t.total) };
}

export function invoiceSnapshot(o: OrderRow, items: OrderItemRow[], s: StoreSettings): DocSnapshot {
  if (!items.length) throw new Error('cannot invoice an order without items');
  const lines: DocLine[] = items.map((i) => ({
    description: `${i.product_name} — ${i.variant_label}`,
    hsn: i.hsn_code,
    qty: i.qty,
    unitPrice: i.unit_price_paise,
    discount: i.discount_paise,
    taxable: i.taxable_paise,
    rateBp: i.gst_rate_bp,
    cgst: i.cgst_paise,
    sgst: i.sgst_paise,
    igst: i.igst_paise,
    total: i.line_total_paise,
  }));
  const docType = documentType(lines.map((l) => ({ rateBp: l.rateBp })));
  return {
    version: 1,
    docType,
    title: TITLES[docType],
    seller: {
      legalName: s.legal_name, tradeName: s.trade_name, address: s.address, gstin: s.gstin, stateCode: s.state_code,
      state: stateName(s.state_code) ?? '', fssai: s.fssai_license,
    },
    buyer: { billing: billing(o), shipping: shipping(o), gstin: o.buyer_gstin, legalName: o.buyer_legal_name, email: o.email, phone: o.phone },
    placeOfSupply: placeOfSupply(o),
    // Follow the tax actually charged at checkout (same place-of-supply rule).
    intraState: lines.some((l) => l.igst > 0) ? false : lines.some((l) => l.cgst > 0) ? true : placeOfSupply(o).stateCode === s.state_code,
    reverseCharge: false,
    order: { orderNo: o.order_no, orderDate: o.created_at, paymentMethod: o.payment_method, ...(o.coupon_code ? { couponCode: o.coupon_code } : {}) },
    lines,
    totals: totals(lines),
  };
}

/**
 * A credit note for part of an invoice (v2 partial refunds): exactly the
 * refunded amounts per line, with the tax backed out of each at the line's
 * rate and the invoice's intra/inter-state split.
 */
export function partialCreditNoteSnapshot(
  invoice: DocSnapshot,
  ref: { docNo: string; issuedAt: string },
  reason: string,
  lines: Array<{ item: Pick<OrderItemRow, 'product_name' | 'variant_label' | 'hsn_code' | 'unit_price_paise' | 'gst_rate_bp'>; qty: number; amount: number }>,
): DocSnapshot {
  const taxed = splitTax(lines.map((l) => ({ lineTotal: l.amount, rateBp: l.item.gst_rate_bp })), invoice.intraState);
  const docLines: DocLine[] = lines.map((l, i) => ({
    description: `${l.item.product_name} — ${l.item.variant_label}${l.qty === 0 ? ' (price adjustment)' : ''}`,
    hsn: l.item.hsn_code,
    qty: l.qty,
    unitPrice: l.item.unit_price_paise,
    discount: 0,
    taxable: taxed[i].taxable,
    rateBp: l.item.gst_rate_bp,
    cgst: taxed[i].cgst,
    sgst: taxed[i].sgst,
    igst: taxed[i].igst,
    total: l.amount,
  }));
  return { ...invoice, docType: 'credit_note', title: TITLES.credit_note, reference: ref, reason, lines: docLines, totals: totals(docLines) };
}

/** A credit note for the whole invoice (v1 refunds and cancellations are full). */
export function creditNoteSnapshot(invoice: DocSnapshot, ref: { docNo: string; issuedAt: string }, reason: string): DocSnapshot {
  return { ...invoice, docType: 'credit_note', title: TITLES.credit_note, reference: ref, reason, totals: totals(invoice.lines) };
}

/**
 * Delivery challan (CGST Rule 55) for a free replacement: the goods move
 * without a supply (CBIC Circular 195/07/2023), so no tax is charged; the
 * value shown is the original line value.
 */
export function challanSnapshot(o: OrderRow, items: OrderItemRow[], s: StoreSettings, originalOrderNo: string): DocSnapshot {
  if (!items.length) throw new Error('cannot issue a challan without items');
  const lines: DocLine[] = items.map((i) => {
    const value = i.unit_price_paise * i.qty;
    return { description: `${i.product_name} — ${i.variant_label}`, hsn: i.hsn_code, qty: i.qty, unitPrice: i.unit_price_paise, discount: 0, taxable: value, rateBp: 0, cgst: 0, sgst: 0, igst: 0, total: value };
  });
  const pos = placeOfSupply(o);
  return {
    version: 1,
    docType: 'delivery_challan',
    title: TITLES.delivery_challan,
    seller: { legalName: s.legal_name, tradeName: s.trade_name, address: s.address, gstin: s.gstin, stateCode: s.state_code, state: stateName(s.state_code) ?? '', fssai: s.fssai_license },
    buyer: { billing: shipping(o), shipping: shipping(o), gstin: o.buyer_gstin, legalName: o.buyer_legal_name, email: o.email, phone: o.phone },
    placeOfSupply: pos,
    intraState: pos.stateCode === s.state_code,
    reverseCharge: false,
    order: { orderNo: o.order_no, orderDate: o.created_at, paymentMethod: o.payment_method },
    lines,
    totals: totals(lines),
    reason: `Free replacement against order ${originalOrderNo} — not a supply; no tax charged.`,
  };
}
