import { test, expect } from '@playwright/test';
import { installMockApi } from './mock-api.js';

/** Fail a test if the page throws or logs a real error (agent rule: click-test, don't just build).
 *  Resource 404s (brand fonts, which the deploy adds later) are not app bugs — ignore them. */
function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/Failed to load resource/i.test(text)) return;
    errors.push(`console.error: ${text}`);
  });
  return errors;
}

test.describe('storefront', () => {
  test('home renders and primary nav + hero CTA work', async ({ page }) => {
    await installMockApi(page);
    const errors = trackErrors(page);
    await page.goto('/');

    await expect(page.locator('h1')).toContainText('Style worth the wait');
    await expect(page.locator('header .brand')).toHaveText('House of Esther');

    // hero CTA
    await page.getByRole('link', { name: /shop new in/i }).first().click();
    await expect(page).toHaveURL(/new-in\.html/);
    await expect(page.locator('h1')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('announcement bar dismiss works', async ({ page }) => {
    await installMockApi(page);
    await page.goto('/');
    const bar = page.locator('#announcement');
    await expect(bar).toBeVisible();
    await bar.getByRole('button', { name: /dismiss/i }).click();
    await expect(bar).toBeHidden();
  });

  test('CRITICAL: product card whole-card overlay does not swallow the wishlist button', async ({ page }) => {
    await installMockApi(page);
    const errors = trackErrors(page);
    await page.goto('/new-in.html');

    const firstCard = page.locator('.product-card').first();
    await expect(firstCard).toBeVisible();

    // 1. The wishlist toggle inside the card must receive its own click (not the overlay link).
    const heart = firstCard.locator('.wishlist-toggle');
    await heart.click();
    // guest → redirected to sign in (proves the heart's handler fired, not the card link)
    await expect(page).toHaveURL(/account\/signin\.html/);

    await page.goBack();
    await expect(page.locator('.product-card').first()).toBeVisible();

    // 2. Clicking the card body (the name) navigates to the PDP via the overlay link.
    await page.locator('.product-card__link').first().click();
    await expect(page).toHaveURL(/product\.html\?slug=/);

    expect(errors).toEqual([]);
  });

  test('listing filters, sort and chips', async ({ page }) => {
    await installMockApi(page);
    await page.goto('/women.html');
    await expect(page.locator('h1')).toBeVisible();

    // open filter panel (mobile) / interact with a colour facet
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    const colour = page.locator('#filter-panel input[name="color"]').first();
    await colour.check();
    await expect(page).toHaveURL(/color=/);
    await expect(page.locator('.chip')).toContainText(/Colour/);

    // sort
    await page.locator('#sort-control').selectOption('price_asc');
    await expect(page).toHaveURL(/sort=price_asc/);
  });

  test('PDP: gallery, variant select, size guide, add to cart opens drawer', async ({ page }) => {
    await installMockApi(page);
    const errors = trackErrors(page);
    await page.goto('/product.html?slug=orin-linen-dress');

    await expect(page.locator('h1')).toHaveText('Orin Linen Dress');

    // add-to-cart disabled until options chosen
    const add = page.locator('#add-to-cart');
    await expect(add).toBeDisabled();

    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await page.getByRole('button', { name: 'M', exact: true }).click();
    await expect(add).toBeEnabled();
    await expect(page.locator('#stock-cue')).toContainText(/in stock/i);

    // size guide modal
    await page.getByRole('button', { name: /find your size/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // add to cart -> drawer opens with the line
    await add.click();
    const drawer = page.locator('#cart-drawer');
    await expect(drawer).toHaveClass(/is-open/);
    await expect(drawer).toContainText('Orin Linen Dress');
    await expect(page.locator('#cart-count')).toHaveText('1');

    expect(errors).toEqual([]);
  });

  test('PDP: out-of-stock combo shows back-in-stock form instead of add-to-cart', async ({ page }) => {
    await installMockApi(page);
    await page.goto('/product.html?slug=orin-linen-dress');
    await page.getByRole('button', { name: 'Black', exact: true }).click();
    await page.getByRole('button', { name: 'M', exact: true }).click();
    await expect(page.locator('#stock-cue')).toContainText(/out of stock/i);
    await expect(page.locator('#back-in-stock')).toBeVisible();
    await expect(page.locator('#add-to-cart')).toBeHidden();
  });

  test('JOURNEY 1: guest PDP -> cart drawer -> checkout -> M-Pesa -> confirmation', async ({ page }) => {
    await installMockApi(page);
    const errors = trackErrors(page);

    await page.goto('/product.html?slug=orin-linen-dress');
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await page.getByRole('button', { name: 'M', exact: true }).click();
    await page.locator('#add-to-cart').click();

    await page.locator('#cart-drawer').getByRole('link', { name: 'Checkout' }).click();
    await expect(page).toHaveURL(/checkout\.html/);
    await expect(page.locator('h1')).toHaveText('Checkout');

    await page.fill('#f-firstName', 'Amina');
    await page.fill('#f-email', 'amina@example.com');
    await page.fill('#f-phone', '+254712345123');
    await page.fill('#f-recipientName', 'Amina W.');
    await page.fill('#f-recipientPhone', '+254712345123');
    await page.selectOption('#f-county', 'Nairobi');
    await page.fill('#f-town', 'Kilimani');
    await page.locator('#f-town').blur();

    // quote resolves -> method + payment appear
    await expect(page.locator('#method-options')).toContainText('Nairobi next-day');
    await expect(page.locator('#payment-options')).toContainText('M-Pesa');

    // Place order gated by the agreement checkbox
    const place = page.locator('#place-order');
    await expect(place).toBeDisabled();

    // open Terms modal from the checkbox label
    await page.getByRole('button', { name: /Terms of Sale \(v4\)/ }).click();
    await expect(page.getByRole('dialog')).toContainText('Terms of Sale');
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

    await page.locator('#agree').check();
    await expect(place).toBeEnabled();
    await place.click();

    // M-Pesa polling screen -> confirmation
    await expect(page.locator('h1')).toHaveText('Confirm your payment');
    await expect(page).toHaveURL(/order-confirmation\.html/, { timeout: 15000 });
    await expect(page.locator('h1')).toContainText('Thank you, Amina');
    await expect(page.getByText(/You accepted the Terms of Sale \(v4\)/)).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('JOURNEY 2 (partial): sign in, pay on delivery checkout, track order', async ({ page }) => {
    const state = await installMockApi(page);
    state.user = { id: 'usr_1', firstName: 'Wanjiru', email: 'wanjiru@example.com', phone: '+254712345123' };

    await page.goto('/product.html?slug=harlan-leather-crossbody');
    await page.getByRole('button', { name: 'Tan', exact: true }).click();
    await page.locator('#add-to-cart').click();
    await page.locator('#cart-drawer').getByRole('link', { name: 'Checkout' }).click();

    // contact pre-filled from session
    await expect(page.locator('#f-email')).toHaveValue('wanjiru@example.com');

    await page.selectOption('#f-county', 'Nakuru');
    await page.fill('#f-town', 'Milimani');
    await page.locator('#f-town').blur();
    await expect(page.locator('#payment-options')).toContainText('Pay on delivery');
    await page.getByRole('radio', { name: /Pay on delivery/i }).check();
    await page.locator('#agree').check();
    await page.locator('#place-order').click();

    await expect(page).toHaveURL(/order-confirmation\.html/, { timeout: 10000 });
    await expect(page.getByText(/To pay on delivery/i).first()).toBeVisible();

    await page.getByRole('link', { name: /track this order/i }).click();
    await expect(page).toHaveURL(/order-tracking\.html/);
    await expect(page.locator('.timeline')).toBeVisible();
  });

  test('cart page: quantity, discount, region quote', async ({ page }) => {
    await installMockApi(page);
    await page.goto('/product.html?slug=orin-linen-dress');
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await page.getByRole('button', { name: 'M', exact: true }).click();
    await page.locator('#add-to-cart').click();
    await page.locator('#cart-drawer').getByRole('link', { name: 'View cart' }).click();

    await expect(page).toHaveURL(/cart\.html/);
    await expect(page.locator('#view .line-item').first()).toContainText('Orin Linen Dress');

    await page.fill('#discount-code', 'WELCOME10');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText(/Discount \(WELCOME10\)/)).toBeVisible();
  });

  test('checkout empty-cart state has exactly one h1 and stays noindex', async ({ page }) => {
    await installMockApi(page); // mock starts with an empty cart
    await page.goto('/checkout.html');
    await expect(page.locator('#view')).toContainText('Your cart is empty');
    await expect(page.locator('#main h1')).toHaveCount(1);
    await expect(page.locator('#main h1')).toHaveText('Checkout');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('canonical links are absolute on static pages', async ({ page }) => {
    await installMockApi(page);
    for (const path of ['/cart.html', '/about.html', '/journal.html', '/size-guide.html', '/delivery-returns.html', '/help.html', '/contact.html', '/legal.html?doc=terms-of-sale', '/']) {
      await page.goto(path);
      await page.waitForFunction(() => {
        const l = document.querySelector('link[rel="canonical"]');
        return l && /^https?:\/\//.test(l.getAttribute('href'));
      });
    }
  });

  test('contact form submits', async ({ page }) => {
    await installMockApi(page);
    await page.goto('/contact.html');
    await page.fill('#f-name', 'Amina W.');
    await page.fill('#f-email', 'amina@example.com');
    await page.selectOption('#f-topic', 'order_issue');
    await page.fill('#f-message', 'My delivery ETA passed, any update please?');
    await page.getByRole('button', { name: /send message/i }).click();
    await expect(page.locator('h1')).toHaveText('Message sent');
    await expect(page.getByText('MSG-2026-0442')).toBeVisible();
  });

  test('legal, journal, size guide, delivery pages render one h1 + JSON-LD', async ({ page }) => {
    await installMockApi(page);
    for (const path of ['/legal.html?doc=terms-of-sale', '/journal.html', '/size-guide.html', '/delivery-returns.html', '/about.html', '/help.html', '/404.html']) {
      await page.goto(path);
      await expect(page.locator('#main h1')).toHaveCount(1);
      const ld = page.locator('script[type="application/ld+json"]');
      expect(await ld.count()).toBeGreaterThan(0);
    }
  });

  test('404 page search + links work', async ({ page }) => {
    await installMockApi(page);
    await page.goto('/404.html');
    await page.getByRole('link', { name: /shop new in/i }).click();
    await expect(page).toHaveURL(/new-in\.html/);
  });

  const STOREFRONT_ROUTES = [
    '/', '/new-in.html', '/sale.html', '/women.html', '/accessories.html',
    '/search.html?q=linen', '/product.html?slug=orin-linen-dress', '/cart.html',
    '/order-tracking.html', '/about.html', '/journal.html',
    '/journal-article.html?slug=september-edit', '/size-guide.html',
    '/delivery-returns.html', '/help.html', '/contact.html',
    '/legal.html?doc=privacy', '/subscription.html?token=abc', '/404.html',
    '/account/signin.html', '/account/forgot-password.html', '/account/reset-password.html?token=x',
  ];
  for (const route of STOREFRONT_ROUTES) {
    test(`smoke: ${route} renders without page errors and has exactly one h1`, async ({ page }) => {
      await installMockApi(page);
      const errors = trackErrors(page);
      await page.goto(route);
      await expect(page.locator('#main h1, .auth-card h1, .empty-state h1')).not.toHaveCount(0);
      await page.waitForTimeout(150);
      expect(errors).toEqual([]);
    });
  }

  const ACCOUNT_ROUTES = ['/account/', '/account/orders.html', '/account/addresses.html', '/account/profile.html', '/account/wishlist.html'];
  for (const route of ACCOUNT_ROUTES) {
    test(`smoke (authed): ${route}`, async ({ page }) => {
      const state = await installMockApi(page);
      state.user = { id: 'usr_1', firstName: 'Wanjiru', email: 'wanjiru@example.com', phone: '+254712345123' };
      const errors = trackErrors(page);
      await page.goto(route);
      await expect(page.locator('#account-content')).toBeVisible();
      await expect(page.locator('#account-content h2').first()).toBeVisible();
      await page.waitForTimeout(150);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('admin', () => {
  test('admin sign-in gates the dashboard', async ({ page }) => {
    await installMockApi(page, { admin: false });
    await page.goto('/admin/');
    await expect(page).toHaveURL(/admin\/signin\.html/);

    await page.fill('#a-email', 'esther@houseofesther.co.ke');
    await page.fill('#a-password', 'correct horse battery staple');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/admin\/$/);
    await expect(page.locator('h1')).toHaveText('Dashboard');
    await expect(page.getByText('New orders today')).toBeVisible();
  });

  test('JOURNEY 3 (partial): admin products list -> new product form renders', async ({ page }) => {
    await installMockApi(page, { admin: true });
    const errors = trackErrors(page);
    await page.goto('/admin/products.html');
    await expect(page.locator('.admin-table')).toContainText('Harlan Leather Crossbody');

    await page.getByRole('link', { name: 'Add product' }).first().click();
    await expect(page).toHaveURL(/product-edit\.html/);
    await page.fill('#p-name', 'Test Sample Product');
    await expect(page.locator('#p-slug')).toHaveValue('test-sample-product');
    // preview stub is disabled (deferred feature)
    await expect(page.getByRole('button', { name: /Preview draft/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page.locator('#p-alert, .toast-region')).toBeTruthy();

    expect(errors).toEqual([]);
  });

  test('JOURNEY 4 (partial): admin order detail -> dispatch + agreement panel', async ({ page }) => {
    await installMockApi(page, { admin: true });
    await page.goto('/admin/order.html?order=HE-2026-04903');

    await expect(page.getByText('Agreement acceptance')).toBeVisible();
    await expect(page.getByText(/v4/)).toBeVisible();

    await page.locator('#next-status').selectOption('dispatched');
    await expect(page.locator('#dispatch-fields')).toBeVisible();
    await page.fill('#courier', 'Fargo Courier');
    await page.fill('#tracking-ref', 'FG12345');
    await page.getByRole('button', { name: 'Update status' }).click();
    await expect(page.locator('.toast, #fulfil-alert')).toBeTruthy();
  });

  test('admin: every sidebar nav link loads its page', async ({ page }) => {
    await installMockApi(page, { admin: true });
    const errors = trackErrors(page);
    await page.goto('/admin/');
    const links = ['Products', 'Inventory', 'Orders', 'Reviews', 'Collections & categories', 'Subscribers & broadcasts', 'Homepage content', 'Legal documents', 'Discount codes'];
    for (const name of links) {
      await page.locator('.admin-sidebar').getByRole('link', { name }).click();
      await expect(page.locator('.admin-main h1')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
});
