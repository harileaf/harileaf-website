/** An order's documents in issue order: the invoice (or a replacement's delivery challan), then any credit notes. */
export async function orderDocs(db: D1Database, orderId: number) {
  const { results } = await db
    .prepare(
      `SELECT doc_no, issued_at, snapshot, series, series = 'CN' AS is_cn, id FROM invoices WHERE order_id = ?1
       UNION ALL SELECT doc_no, issued_at, snapshot, 'DC', 0, id FROM delivery_challans WHERE order_id = ?1
       ORDER BY is_cn, id`,
    )
    .bind(orderId)
    .all<{ doc_no: string; issued_at: string; snapshot: string; series: string }>();
  return results;
}
