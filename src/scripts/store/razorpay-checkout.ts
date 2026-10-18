/**
 * Opens Razorpay Standard Checkout for an order and confirms the result with
 * our server. checkout.js is loaded only on the checkout and order pages.
 */
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void; on(event: string, cb: (r: { error?: { description?: string } }) => void): void };
  }
}

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('Could not load the payment window. Check your connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export type PayOutcome = { kind: 'paid' } | { kind: 'dismissed' } | { kind: 'failed'; message: string };

export async function payForOrder(options: Record<string, unknown>, order: { orderNo: string; token: string }): Promise<PayOutcome> {
  await loadScript();
  return new Promise<PayOutcome>((resolve) => {
    let failedMessage: string | null = null;
    const rzp = new window.Razorpay!({
      ...options,
      handler: async (r: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        const res = await fetch('/api/store/checkout/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderNo: order.orderNo, token: order.token, ...r }),
        });
        const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
        if (res.ok && data.status === 'placed') resolve({ kind: 'paid' });
        else resolve({ kind: 'failed', message: data.error ?? 'We could not confirm your payment yet. If money was taken, your order will update within a few minutes.' });
      },
      modal: {
        ondismiss: () => resolve(failedMessage ? { kind: 'failed', message: failedMessage } : { kind: 'dismissed' }),
      },
    });
    rzp.on('payment.failed', (r) => {
      failedMessage = r.error?.description ?? 'The payment did not go through.';
    });
    rzp.open();
  });
}
