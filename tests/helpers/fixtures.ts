import { env } from 'cloudflare:workers';

export const db = env.STORE_DB;
export const AT = '2026-10-18T06:00:00.000Z';

let seq = 0;
const next = () => ++seq;

export async function insertProduct(over: Partial<Record<string, unknown>> = {}): Promise<number> {
  const n = next();
  const row = {
    category_id: 1,
    slug: `product-${n}`,
    name: `Product ${n}`,
    status: 'active',
    hsn_code: '1006',
    gst_rate_bp: 500,
    perishable: 0,
    cod_allowed: 1,
    created_at: AT,
    updated_at: AT,
    ...over,
  };
  const cols = Object.keys(row);
  const res = await db
    .prepare(`INSERT INTO products (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .bind(...Object.values(row))
    .run();
  return res.meta.last_row_id;
}

export async function insertVariant(productId: number, over: Partial<Record<string, unknown>> = {}): Promise<number> {
  const n = next();
  const row = {
    product_id: productId,
    sku: `SKU-${n}`,
    label: '1 kg',
    net_qty_label: '1 kg',
    unit_qty_g: 1000,
    price_paise: 14900,
    mrp_paise: 16900,
    weight_g: 1050,
    length_cm: 20,
    breadth_cm: 15,
    height_cm: 5,
    stock_qty: 10,
    active: 1,
    ...over,
  };
  const cols = Object.keys(row);
  const res = await db
    .prepare(`INSERT INTO variants (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .bind(...Object.values(row))
    .run();
  return res.meta.last_row_id;
}

export async function insertOrder(over: Partial<Record<string, unknown>> = {}): Promise<number> {
  const n = next();
  const row = {
    order_no: `HL-2610-${String(n).padStart(4, '0')}`,
    view_token_hash: `hash-${n}`,
    status: 'pending_payment',
    payment_method: 'razorpay',
    customer_name: 'Test Buyer',
    email: 'buyer@example.com',
    phone: '9820000000',
    ship_line1: '1 Test Road',
    ship_city: 'Mumbai',
    ship_state: 'Maharashtra',
    ship_state_code: '27',
    ship_pincode: '400092',
    subtotal_paise: 69900,
    discount_paise: 0,
    gst_paise: 3329,
    total_paise: 69900,
    created_at: AT,
    updated_at: AT,
    ...over,
  };
  const cols = Object.keys(row);
  const res = await db
    .prepare(`INSERT INTO orders (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .bind(...Object.values(row))
    .run();
  return res.meta.last_row_id;
}

export async function scalar<T = number>(sql: string, ...binds: unknown[]): Promise<T> {
  const row = await db.prepare(sql).bind(...binds).first<Record<string, T>>();
  if (!row) throw new Error(`no row for: ${sql}`);
  return Object.values(row)[0] as T;
}
