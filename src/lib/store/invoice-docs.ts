/** An order's GST documents in issue order (the invoice first, then any credit notes). */
export async function orderDocs(db: D1Database, orderId: number) {
  const { results } = await db
    .prepare("SELECT doc_no, issued_at, snapshot, series FROM invoices WHERE order_id = ? ORDER BY CASE series WHEN 'INV' THEN 0 ELSE 1 END, id")
    .bind(orderId)
    .all<{ doc_no: string; issued_at: string; snapshot: string; series: string }>();
  return results;
}
