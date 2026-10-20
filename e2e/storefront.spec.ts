import { expect, test } from '@playwright/test';

// Fail on any Content-Security-Policy violation (the cart, checkout and order pages enforce one).
let cspViolations: string[] = [];
test.beforeEach(({ page }) => {
  cspViolations = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) cspViolations.push(m.text());
  });
});
test.afterEach(() => expect(cspViolations).toEqual([]));

/** The current document came from a real navigation (not a view-transition swap) — so its own CSP header applies. */
async function expectFullLoad(page: import('@playwright/test').Page) {
  const nav = await page.evaluate(() => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.name ?? '');
  expect(new URL(nav).pathname).toBe(new URL(page.url()).pathname);
}

test('a shopper buys rice with cash on delivery and can cancel before packing', async ({ page }) => {
  await page.goto('/shop/');
  await expect(page.getByRole('heading', { level: 1, name: 'Shop the farm' })).toBeVisible();
  await page.getByRole('heading', { level: 2, name: 'Karjat 3 Unpolished Rice' }).click();
  await expect(page).toHaveURL(/\/rice\/karjat-3/);

  // Product JSON-LD is present and offers match the visible price.
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.some((t) => t.includes('"@type":"Product"'))).toBe(true);
  // No approved reviews yet: no rating markup, rating line or reviews section.
  expect(ld.some((t) => t.includes('aggregateRating') || t.includes('"@type":"Review"'))).toBe(false);
  await expect(page.locator('[data-rating-line], #reviews')).toHaveCount(0);

  await page.getByRole('radio', { name: /^5 kg/ }).check();
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  // Click through (no page.goto): the cart and checkout must be full page loads so their CSP applies.
  await page.getByRole('link', { name: /^Cart/ }).first().click();
  await expect(page).toHaveURL(/\/cart\/?$/);
  await expectFullLoad(page);
  await expect(page.locator('#cart-root')).toContainText('5 kg');
  await page.evaluate(() => localStorage.setItem('hl_coupon_v1', 'E2ETEN')); // applied earlier in the visit
  await page.getByRole('link', { name: 'Proceed to checkout' }).click();
  await expect(page).toHaveURL(/\/checkout\/?$/);
  await expectFullLoad(page);

  await page.fill('#c-name', 'Asha Rao');
  // A fresh shopper per run: unconfirmed COD orders are capped per email/phone.
  const run = Date.now() % 100_000_000;
  await page.fill('#c-email', `asha+${run}@example.com`);
  await page.fill('#c-phone', `9${String(run).padStart(9, '0')}`);
  await page.fill('#s-line1', '12 Lake Road');
  await page.fill('#s-city', 'Mumbai');
  await page.selectOption('#s-state', '27');
  await page.fill('#s-pincode', '400092');
  await page.locator('input[name="paymentMethod"][value="cod"]').check();
  await page.click('#place-order');

  await expect(page).toHaveURL(/\/order\/HL-\d{4}-\d{4}\?t=[0-9a-f]+$/, { timeout: 15_000 }); // the token stays, so refresh works
  expect(await page.evaluate(() => [localStorage.getItem('hl_cart_v1'), localStorage.getItem('hl_coupon_v1')])).toEqual(['[]', null]); // nothing rides into the next cart
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /please confirm/ })).toBeVisible();
  // COD orders ship once the customer confirms (setting on by default).
  await expect(page.getByRole('heading', { level: 1, name: /please confirm/ })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm my order' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Order confirmed' })).toBeVisible();
  await expect(page.getByText('Cash on delivery')).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Cancel order' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cancelled' })).toBeVisible();
});

test('order pages need their token, and offer a fresh link instead', async ({ page }) => {
  const res = await page.goto('/order/HL-2610-0001?t=not-the-token');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Find your order' })).toBeVisible();
  await expect(page.locator('#f-no')).toHaveValue('HL-2610-0001');
  await page.fill('#f-email', 'nobody@example.com');
  await page.getByRole('button', { name: 'Email me the link' }).click();
  await expect(page.locator('#find-status')).toContainText('If that order number and email match');
});

test('checkout shows field errors without placing an order', async ({ page }) => {
  await page.goto('/rice/karjat-3');
  await page.getByRole('radio', { name: /^5 kg/ }).check();
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await page.goto('/checkout/');
  await page.fill('#c-name', 'A');
  await page.fill('#c-email', 'not-an-email');
  await page.click('#place-order');
  await expect(page).toHaveURL(/\/checkout/);
  await expect(page.locator('#c-email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-err="contact.email"]')).not.toBeEmpty();
});

test('the cart blocks checkout below the minimum order', async ({ page }) => {
  await page.goto('/rice/karjat-3');
  await page.getByRole('radio', { name: /^1 kg/ }).check();
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await page.goto('/cart/');
  await expect(page.locator('#cart-root')).toContainText('to reach the minimum order of');
  await expect(page.getByRole('link', { name: 'Proceed to checkout' })).toHaveAttribute('aria-disabled', 'true');
});


test('a discount code shows as its own line and the total is what the shopper pays', async ({ page }) => {
  await page.goto('/rice/karjat-3');
  await page.getByRole('radio', { name: /^5 kg/ }).check();
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await page.goto('/cart/');
  await page.getByText('Have a discount code?').click();
  await page.getByLabel('Discount code').fill('nope1234');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('alert')).toHaveText('This code isn’t valid.');
  await page.getByLabel('Discount code').fill('e2eten');
  await page.getByRole('button', { name: 'Apply' }).click();
  const summary = page.getByRole('complementary', { name: 'Order summary' });
  await expect(summary).toContainText('Discount (E2ETEN)');
  const money = async (label: string) => Number(/₹([\d,.]+)/.exec(await summary.locator('p', { hasText: new RegExp(`^${label}`) }).first().innerText())![1].replace(/,/g, ''));
  expect(await money('Total')).toBeCloseTo((await money('Subtotal')) - (await money('Discount')), 2);
  await page.getByRole('link', { name: 'Proceed to checkout' }).click();
  await expect(page.locator('#summary-adjust')).toContainText('Discount (E2ETEN)');
});

test('fresh produce checks out on its own: the rest is saved, not dropped; out-of-zone pincodes are refused', async ({ page }) => {
  await page.goto('/rice/karjat-3');
  await page.getByRole('radio', { name: /^5 kg/ }).check();
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await page.goto('/produce/kesar-mango');
  await expect(page.getByText('Delivered only within Mumbai MMR')).toBeVisible();
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(page.locator('[data-add-status]')).toContainText('checked out on its own');
  await page.goto('/cart/');
  await expect(page.getByText('Fresh produce is checked out separately')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Proceed to checkout' })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Check out fresh produce now' }).click();
  await expect(page.getByRole('region', { name: 'Saved for your next order' })).toContainText('Karjat 3');
  await expect(page.locator('#cart-root ul').first()).toContainText('Kesar Mango');
  await page.getByRole('link', { name: 'Proceed to checkout' }).click();
  await expect(page.locator('#summary-lines')).toContainText('Kesar Mango');
  await page.fill('#s-pincode', '411001');
  await expect(page.locator('#pin-status')).toContainText('only within Mumbai MMR');
  await expect(page.locator('#place-order')).toBeDisabled();
});

test('keyboard only: choose a pack size and add it to the cart', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow is a desktop concern');
  await page.goto('/rice/karjat-3');
  await page.getByRole('radio', { name: /^1 kg/ }).focus();
  await page.keyboard.press('ArrowRight'); // radiogroup: arrow keys move the selection
  await expect(page.getByRole('radio', { name: /^5 kg/ })).toBeChecked();
  await page.getByRole('button', { name: 'Add to cart' }).first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: /^Cart/ }).first()).toContainText('1');
});

test('mobile shows the sticky add-to-cart bar', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'sticky bar is mobile only');
  await page.goto('/rice/karjat-3');
  const bar = page.locator('[data-sticky-bar]');
  await page.locator('[data-add]').scrollIntoViewIfNeeded();
  await expect(bar).toBeHidden(); // not while the main button is on screen
  await page.mouse.wheel(0, 1500);
  await expect(bar).toBeVisible();
  await bar.locator('[data-add-sticky]').click();
  await expect(page.getByRole('link', { name: /^Cart/ }).first()).toContainText('1');
});

test('the buy box and cart badge keep working after client-side navigation (view transitions)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'navigation is the same on mobile');
  await page.goto('/shop/');
  // shop → product → shop → another product, all as view-transition swaps
  await page.getByRole('heading', { level: 2, name: 'Karjat 3 Unpolished Rice' }).click();
  await expect(page).toHaveURL(/\/rice\/karjat-3/);
  await page.getByRole('radio', { name: /^5 kg/ }).check();
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await page.goBack();
  await expect(page).toHaveURL(/\/shop\/?$/);
  await page.getByRole('heading', { level: 2, name: 'Stone-Ground Turmeric Powder' }).click();
  await expect(page).toHaveURL(/\/spices\/turmeric-powder/);
  await expect(page.getByRole('link', { name: /^Cart/ }).first()).toContainText('1'); // badge survived the swap
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(page.locator('[data-add-status]').first()).toContainText('Added');
  await expect(page.getByRole('link', { name: /^Cart/ }).first()).toContainText('2');
});

test('shop filters hide the products outside the chosen category', async ({ page }) => {
  await page.goto('/shop/');
  const visible = page.locator('[data-product-card]:visible');
  const all = await visible.count();
  await page.click('[data-filter-cat="spices"]');
  await expect(visible).not.toHaveCount(all);
  for (const card of await visible.all()) await expect(card).toHaveAttribute('data-category', 'spices');
});

test('the spices hub leads to the turmeric story page, whose card leads to a product page that adds to the cart', async ({ page }) => {
  await page.goto('/spices/');
  await page.getByRole('link', { name: /The turmeric story/ }).first().click();
  await expect(page).toHaveURL(/\/turmeric\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Haldi the slow way.');
  await expect(page.getByRole('table', { name: /compared with High-speed mill/ })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Lab results per batch' })).toContainText('5.1 %');

  await page.locator('[data-product-card]').getByRole('heading', { name: 'Stone-Ground Turmeric Powder' }).click();
  await expect(page).toHaveURL(/\/spices\/turmeric-powder$/);
  await expect(page.locator('[data-proof-line]')).toContainText('Curcumin 5.1 %');
  await expect(page.getByRole('heading', { name: 'How our Stone-Ground Turmeric Powder is made' })).toBeVisible();
  await expect(page.locator('section[aria-labelledby^="timeline-"] ol > li')).toHaveCount(3);
  await expect(page.getByRole('table', { name: /compared with High-speed mill/ })).toBeVisible();

  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(page.getByRole('link', { name: /^Cart/ }).first()).toContainText('1');
});

test('legacy /rice renders until its story page is published, without GI wording', async ({ page }) => {
  await page.goto('/rice/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Rice with the bran');
  await expect(page.locator('body')).not.toContainText(/GI-tagged/i);
});
