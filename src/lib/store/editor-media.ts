/** Maps getProductForAdmin's media rows to the product editor's shapes (server render and in-place refresh). */
import { mediaUrl } from './urls';

export interface AdminMediaRows {
  images: Array<{ id: number; r2_key: string; alt: string; sort: number }>;
  batches: Array<{ id: number; batch_code: string; packed_on: string; ground_or_milled_on: string | null; lab_report_id: number | null; active: number }>;
  labReports: Array<{ id: number; batch_code: string; tested_on: string; lab_name: string; visible: number; pdf_r2_key: string | null }>;
}

export function editorMedia(a: AdminMediaRows) {
  return {
    images: a.images.map((i) => ({ id: i.id, url: mediaUrl(i.r2_key), alt: i.alt, sort: i.sort })),
    batches: a.batches.map((b) => ({ id: b.id, batchCode: b.batch_code, packedOn: b.packed_on, groundOrMilledOn: b.ground_or_milled_on, labReportId: b.lab_report_id, active: b.active === 1 })),
    labReports: a.labReports.map((l) => ({ id: l.id, batchCode: l.batch_code, testedOn: l.tested_on, labName: l.lab_name, visible: l.visible === 1, pdfUrl: l.pdf_r2_key ? mediaUrl(l.pdf_r2_key) : null })),
  };
}
