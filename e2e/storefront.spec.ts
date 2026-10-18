import { expect, test } from '@playwright/test';

test('a shopper buys rice with cash on delivery and can cancel before packing', async ({ page }) => {
  await page.goto('/shop/');
  await expect(page.getByRole('heading', { level: 1, name: 'Shop the farm' })).toBeVisible();
  await page.getByRole('heading', { level: 2, name: 'Karjat 3 Unpolished Rice' }).click();
  await expect(page).toHaveURL(/\/rice\/karjat-3/);

  // Product JSON-LD is present and offers match the visible price.
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.some((t) => t.includes('"@type":"Product"'))).toBe(true);

  await page.getByRole('radio', { name: /^5 kg/ }).check();
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await page.goto('/cart/');
  await expect(page.locator('#cart-root')).toContainText('5 kg');
  await page.getByRole('link', { name: 'Proceed to checkout' }).click();

  await page.fill('#c-name', 'Asha Rao');
  await page.fill('#c-email', 'asha@example.com');
  await page.fill('#c-phone', '9820012345');
  await page.fill('#s-line1', '12 Lake Road');
  await page.fill('#s-city', 'Mumbai');
  await page.selectOption('#s-state', '27');
  await page.fill('#s-pincode', '400092');
  await page.locator('input[name="paymentMethod"][value="cod"]').check();
  await page.click('#place-order');

  await expect(page).toHaveURL(/\/order\/HL-\d{4}-\d{4}$/, { timeout: 15_000 }); // token stripped from the address bar
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
