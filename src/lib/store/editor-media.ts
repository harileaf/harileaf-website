/** Maps getProductForAdmin's media rows to the product editor's shapes (server render and in-place refresh). */
import { mediaUrl } from './urls';

export interface AdminMediaRows {
  images: Array<{ id: number; r2_key: string; alt: string; sort: number; kind?: 'photo' | 'infographic' }>;
  batches: Array<{ id: number; batch_code: string; packed_on: string; ground_or_milled_on: string | null; lab_report_id: number | null; active: number }>;
  labReports: Array<{ id: number; batch_code: string; tested_on: string; lab_name: string; visible: number; pdf_r2_key: string | null }>;
}

export function editorMedia(a: AdminMediaRows) {
  return {
    images: a.images.map((i) => ({ id: i.id, url: mediaUrl(i.r2_key), key: i.r2_key, alt: i.alt, sort: i.sort, kind: i.kind ?? 'photo' })),
    batches: a.batches.map((b) => ({ id: b.id, batchCode: b.batch_code, packedOn: b.packed_on, groundOrMilledOn: b.ground_or_milled_on, labReportId: b.lab_report_id, active: b.active === 1 })),
    labReports: a.labReports.map((l) => ({ id: l.id, batchCode: l.batch_code, testedOn: l.tested_on, labName: l.lab_name, visible: l.visible === 1, pdfUrl: l.pdf_r2_key ? mediaUrl(l.pdf_r2_key) : null })),
  };
}

export interface AdminVariantRow {
  id: number; sku: string; label: string; net_qty_label: string; unit_qty_g: number; price_paise: number; mrp_paise: number;
  weight_g: number; length_cm: number; breadth_cm: number; height_cm: number; stock_qty: number; low_stock_threshold: number; active: number; sort: number;
}

/** Pack sizes for the product editor; stock is changed by an adjustment, so it starts at 0 with the current stock beside it. */
export function editorVariants(rows: AdminVariantRow[]) {
  return rows.map((v) => ({
    id: v.id, sku: v.sku, label: v.label, netQtyLabel: v.net_qty_label, unitQtyG: v.unit_qty_g, pricePaise: v.price_paise,
    mrpPaise: v.mrp_paise, weightG: v.weight_g, lengthCm: v.length_cm, breadthCm: v.breadth_cm, heightCm: v.height_cm,
    stockAdjust: 0, currentStock: v.stock_qty, lowStockThreshold: v.low_stock_threshold, active: v.active === 1, sort: v.sort,
  }));
}
