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

    await expect(page.locator('#main h1')).toHaveCount(1);
    await expect(page.locator('h1')).toContainText('Style worth the wait');
    await expect(page.locator('header .brand')).toHaveAttribute('aria-label', /House of Esther/);
    await expect(page.locator('header .brand svg')).toBeVisible();

    // hero CTA
    await page.getByRole('link', { name: /shop new in/i }).first().click();
    await expect(page).toHaveURL(/new-in\.html/);
    await expect(page.locator('h1')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('homepage hero: real <img> backdrop (not a CSS background) + full-bleed structure', async ({ page }) => {
    await installMockApi(page);
    await page.goto('/');
    await page.waitForSelector('.hero');

    const heroImg = page.locator('.hero__media img');
    await expect(heroImg).toHaveCount(1);
    await expect(heroImg).toHaveAttribute('src', /\/seed\/img_hero1-2000\.jpg/);
    await expect(heroImg).toHaveAttribute('loading', 'eager');
    await expect(heroImg).toHaveAttribute('fetchpriority', 'high');
    await expect(heroImg).toHaveAttribute('alt', /.+/); // non-empty
    expect(await heroImg.evaluate((n) => n.naturalWidth)).toBeGreaterThan(0);

    // no CSS background-image anywhere in the hero (LCP + a11y — must stay an <img>)
    const bgImages = await page.evaluate(() =>
      ['.hero', '.hero__media', '.hero__inner', '.hero__content'].map((sel) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).backgroundImage : 'none';
      })
    );
    expect(bgImages.every((v) => v === 'none')).toBe(true);

    // full-bleed: hero spans the viewport width
    const w = await page.locator('.hero').evaluate((n) => n.getBoundingClientRect().width);
    expect(w).toBeGreaterThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth) - 1);
  });

  test('homepage header: transparent over hero, swaps to solid the instant the hero CONTENT TOP reaches the header (IntersectionObserver on a sentinel), reverses on scroll up', async ({ page }) => {
    await installMockApi(page);
    await page.goto('/');
    await page.waitForSelector('.hero');
    const header = page.locator('.site-header');
    await expect(page.locator('body')).toHaveClass(/has-transparent-header/);
    await expect(header).toHaveClass(/site-header--transparent/);

    // at the top: transparent (not solid), header bg is see-through
    await page.waitForTimeout(250); // observer arms after 2 rAF
    await expect(header).not.toHaveClass(/is-solid/);
    const bgTop = await header.evaluate((n) => getComputedStyle(n).backgroundColor);
    expect(bgTop === 'rgba(0, 0, 0, 0)' || bgTop === 'transparent').toBe(true);

    // zero-height sentinel is the FIRST child of .hero__content (before the eyebrow);
    // the observer watches it so the swap fires on the content's TOP edge.
    await expect(page.locator('.hero__content > .hero__sentinel:first-child')).toHaveCount(1);

    // small scroll: the sentinel (content top) is still well below the header -> transparent
    await page.evaluate(() => window.scrollBy(0, 30));
    await expect(header).not.toHaveClass(/is-solid/);

    // scroll on: the moment the hero content's TOP reaches the header -> solid,
    // with most of the hero section (photo + content) still on screen. Previously the
    // header stayed transparent while the eyebrow/headline slid under the nav here.
    await page.evaluate(() => {
      const s = document.querySelector('.hero__sentinel');
      window.scrollBy(0, s.getBoundingClientRect().top + 8);
    });
    const heroH = await page.locator('.hero').evaluate((n) => n.getBoundingClientRect().height);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(heroH);
    await expect(header).toHaveClass(/is-solid/);
    await expect(header).toHaveCSS('background-color', 'rgb(247, 241, 247)'); // Orchid Mist

    // keep scrolling past the whole hero -> still solid
    await page.evaluate(() => window.scrollTo(0, document.querySelector('.hero').getBoundingClientRect().height + 300));
    await expect(header).toHaveClass(/is-solid/);

    // scroll back to top -> transparent again
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(header).not.toHaveClass(/is-solid/);

    // non-home pages never get the transparent state
    await page.goto('/women.html');
    await expect(page.locator('body')).not.toHaveClass(/has-transparent-header/);
    await expect(page.locator('.site-header')).not.toHaveClass(/site-header--transparent/);
  });

  test('header brand mark is the bold monogram SVG, prominent (>= 32px)', async ({ page }) => {
    await installMockApi(page);
    await page.goto('/');
    const mark = page.locator('.site-header .brand__mark');
    await expect(mark).toBeVisible();
    expect(await mark.evaluate((n) => n.tagName.toLowerCase())).toBe('svg');
    const h = await mark.evaluate((n) => n.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(32);
    // bold variant: viewBox 0 0 120 132, single knocked-out path (fill-rule evenodd)
    expect(await mark.getAttribute('viewBox')).toBe('0 0 120 132');
    await expect(mark.locator('path[fill-rule="evenodd"]')).toHaveCount(1);
    // recolours via currentColor -> Orchid Mist over the hero, Aubergine on the solid header
    expect(await mark.evaluate((n) => getComputedStyle(n).color)).toBe('rgb(247, 241, 247)');
    await page.goto('/women.html');
    expect(
      await page.locator('.site-header .brand__mark').evaluate((n) => getComputedStyle(n).color)
    ).toBe('rgb(74, 29, 66)');
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

    // no stock cue (and no stray bullet) before a variant is chosen
    const cue = page.locator('#stock-cue');
    await expect(cue).toBeHidden();
    await expect(cue).toHaveText('');
    const bulletBefore = await cue.evaluate((n) => getComputedStyle(n, '::before').content);
    expect(bulletBefore === 'none' || bulletBefore === 'normal').toBeTruthy();

    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await page.getByRole('button', { name: 'M', exact: true }).click();
    await expect(add).toBeEnabled();
    await expect(cue).toBeVisible();
    await expect(cue).toContainText(/in stock/i);

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

  test('cart page: delivery-estimate widget keeps the typed town + picked county across the quote and a re-render', async ({ page }) => {
    await installMockApi(page);
    await page.goto('/product.html?slug=orin-linen-dress');
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await page.getByRole('button', { name: 'M', exact: true }).click();
    await page.locator('#add-to-cart').click();
    await page.locator('#cart-drawer').getByRole('link', { name: 'View cart' }).click();
    await expect(page).toHaveURL(/cart\.html/);

    // Reproduce the bug steps: type a town, then pick a county (fires the quote).
    await page.fill('#cart-town', 'Kileleshwa');
    await page.selectOption('#cart-county', 'Nairobi');

    // The quote figures update in place (no full re-render).
    await expect(page.locator('#sum-delivery')).toHaveText('KES 300');
    await expect(page.locator('#sum-total')).toHaveText('KES 5,700');

    // The widget must NOT snap back — both fields retain what the shopper entered.
    await expect(page.locator('#cart-county')).toHaveValue('Nairobi');
    await expect(page.locator('#cart-town')).toHaveValue('Kileleshwa');

    // The picker stays expanded.
    await expect(page.locator('#cart-town')).toBeVisible();

    // A legitimate full re-render (quantity change) must still keep the location.
    const qty = page.locator('#view .line-item input[type="number"]').first();
    await qty.fill('2');
    await qty.blur();
    await expect(page.locator('#view .line-item strong').first()).toContainText('KES 10,800');
    await expect(page.locator('#cart-county')).toHaveValue('Nairobi');
    await expect(page.locator('#cart-town')).toHaveValue('Kileleshwa');
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

  test('no stray "null"/"undefined"/"false" text nodes leak into the DOM', async ({ page }) => {
    await installMockApi(page);
    // seed products carry rating {average:0,count:0} and empty colour/size facets,
    // which is exactly what produced the `null` / `nullnull` text-node regression.
    const routes = [
      '/product.html?slug=orin-linen-dress', // rating {count:0} -> buy-box conditional hits the : null branch
      '/watches.html', // empty colour + size + subcategory facets -> filter panel null groups
      '/women.html',
      '/',
      '/cart.html',
      '/checkout.html',
      '/journal.html',
    ];
    for (const route of routes) {
      await page.goto(route);
      await page.waitForTimeout(250);
      const strays = await page.evaluate(() => {
        const root = document.querySelector('#main') || document.body;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const bad = [];
        let n;
        while ((n = walker.nextNode())) {
          const t = n.nodeValue.trim();
          if (t === 'null' || t === 'undefined' || t === 'false') {
            bad.push({ text: t, parent: n.parentElement && n.parentElement.className });
          }
        }
        return bad;
      });
      expect(strays, `stray literal text nodes on ${route}`).toEqual([]);
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

test.describe('brand (Orchid & Aubergine rebrand)', () => {
  test('new palette tokens are wired and old ones are gone', async ({ page }) => {
    await installMockApi(page);
    await page.goto('/');
    const tok = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        primary: s.getPropertyValue('--color-primary').trim(),
        cta: s.getPropertyValue('--color-cta').trim(),
        bg: s.getPropertyValue('--color-bg').trim(),
        oldNavy: s.getPropertyValue('--ink-navy').trim(),
        oldBone: s.getPropertyValue('--bone').trim(),
      };
    });
    expect(tok.primary.toLowerCase()).toBe('#4a1d42');
    expect(tok.cta.toLowerCase()).toBe('#9e3c88');
    expect(tok.bg.toLowerCase()).toBe('#f7f1f7');
    expect(tok.oldNavy).toBe('');
    expect(tok.oldBone).toBe('');

    // footer ground is Aubergine
    const footerBg = await page.locator('.site-footer').evaluate((n) => getComputedStyle(n).backgroundColor);
    expect(footerBg).toBe('rgb(74, 29, 66)');

    // primary button (hero CTA) = Orchid fill / white label
    const btnStyle = await page.locator('.hero .btn').first().evaluate((n) => {
      const c = getComputedStyle(n);
      return { bg: c.backgroundColor, color: c.color };
    });
    expect(btnStyle.bg).toBe('rgb(158, 60, 136)');
    expect(btnStyle.color).toBe('rgb(255, 255, 255)');

    // solid header ground is Orchid Mist (non-home page — home header starts transparent)
    await page.goto('/women.html');
    const headerBg = await page.locator('.site-header').evaluate((n) => getComputedStyle(n).backgroundColor);
    expect(headerBg).toBe('rgb(247, 241, 247)');
  });

  test('real logo mark replaces the text wordmark; favicon + manifest wired', async ({ page }) => {
    await installMockApi(page);
    await page.goto('/');
    await expect(page.locator('header .brand svg[aria-label="House of Esther"]')).toBeVisible();
    await expect(page.locator('.site-footer .footer-brand svg[aria-label="House of Esther"]')).toBeVisible();

    await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', /favicon\.svg/);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /apple-touch-icon\.png/);
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#4A1D42');
  });

  test('seed photos load on the home page (hero + category tiles)', async ({ page }) => {
    await installMockApi(page);
    await page.goto('/');
    const hero = page.locator('.hero__media img');
    await expect(hero).toHaveAttribute('src', /\/seed\/img_hero1-2000\.jpg/);
    await expect
      .poll(() => hero.evaluate((n) => n.naturalWidth))
      .toBeGreaterThan(0);

    const tile = page.locator('.tile img').first();
    await expect(tile).toHaveAttribute('src', /\/seed\//);
    await expect.poll(() => tile.evaluate((n) => n.naturalWidth)).toBeGreaterThan(0);
  });

  test('seed photos load on a PDP gallery', async ({ page }) => {
    await installMockApi(page);
    await page.goto('/product.html?slug=orin-linen-dress');
    const main = page.locator('.gallery__main img');
    await expect(main).toHaveAttribute('src', /\/seed\/img_orin1-2000\.jpg/);
    await expect.poll(() => main.evaluate((n) => n.naturalWidth)).toBeGreaterThan(0);
  });
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
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page.locator('#p-alert, .toast-region')).toBeTruthy();

    expect(errors).toEqual([]);
  });

  test('JOURNEY 3 step 8: Preview opens the PDP with a draft banner + working width toggle', async ({ page, context }) => {
    await installMockApi(page, { admin: true });
    await page.goto('/admin/product-edit.html?id=prod_1042');
    await expect(page.locator('#preview-btn')).toBeVisible();

    const [preview] = await Promise.all([
      context.waitForEvent('page'),
      page.locator('#preview-btn').click(),
    ]);
    await preview.waitForLoadState();
    expect(preview.url()).toContain('preview=prod_1042');

    // outer shell: toolbar + width toggle + iframe
    await expect(preview.locator('.preview-toolbar')).toBeVisible();
    const stage = preview.locator('.preview-stage');
    await expect(stage).toHaveAttribute('data-mode', 'desktop');

    // the framed PDP shows the persistent draft banner
    const frame = preview.frameLocator('.preview-iframe');
    await expect(frame.locator('.preview-banner')).toContainText(/not visible to customers/i);
    await expect(frame.locator('h1')).toHaveText('Harlan Leather Crossbody');
    // preview must not fetch related products
    await expect(frame.getByRole('heading', { name: 'You may also like' })).toHaveCount(0);

    await preview.getByRole('button', { name: 'Mobile' }).click();
    await expect(stage).toHaveAttribute('data-mode', 'mobile');
    const width = await preview.locator('.preview-iframe').evaluate((n) => n.getBoundingClientRect().width);
    expect(width).toBeLessThan(420);

    await preview.getByRole('button', { name: 'Desktop' }).click();
    await expect(stage).toHaveAttribute('data-mode', 'desktop');
  });

  test('CONTACT INBOX: list loads, detail opens, mark-handled round-trips', async ({ page }) => {
    await installMockApi(page, { admin: true });
    const errors = trackErrors(page);

    // reachable from the sidebar nav
    await page.goto('/admin/');
    await page.locator('.admin-sidebar').getByRole('link', { name: 'Contact messages' }).click();
    await expect(page).toHaveURL(/admin\/contacts\.html/);
    await expect(page.locator('.admin-table')).toContainText('MSG-2026-0442');

    // defaults to unhandled; MSG-2026-0441 (handled) should not show
    await expect(page.locator('.admin-table')).not.toContainText('MSG-2026-0441');

    await page.getByRole('link', { name: 'MSG-2026-0442' }).click();
    await expect(page).toHaveURL(/ref=MSG-2026-0442/);
    await expect(page.getByText('amina@gmail.com')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open order' })).toHaveAttribute('href', /HE-2026-04871/);
    await expect(page.getByText(/Replies to the customer are sent by email/i)).toBeVisible();

    await page.getByRole('button', { name: 'Mark as handled' }).click();
    await expect(page.getByText(/^handled$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reopen' })).toBeVisible();
    await expect(page.getByText(/Handled .* by usr_admin1/)).toBeVisible();

    // reopen round-trips back
    await page.getByRole('button', { name: 'Reopen' }).click();
    await expect(page.getByRole('button', { name: 'Mark as handled' })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('dashboard "contact messages unhandled" links to the inbox', async ({ page }) => {
    await installMockApi(page, { admin: true });
    await page.goto('/admin/');
    const stat = page.getByRole('link', { name: /Contact messages unhandled/i });
    await expect(stat).toHaveAttribute('href', '/admin/contacts.html?handled=false');
    await stat.click();
    await expect(page).toHaveURL(/contacts\.html\?handled=false/);
    await expect(page.locator('#c-handled')).toHaveValue('false');
  });

  test("SHOP OWNER'S GUIDE: renders behind the admin gate, one h1, nav link lands here, image table + contents anchors resolve", async ({ page }) => {
    await installMockApi(page, { admin: false });
    const errors = trackErrors(page);

    // gated exactly like the other admin pages: no session -> bounced to sign in
    await page.goto('/admin/guide.html');
    await expect(page).toHaveURL(/admin\/signin\.html\?next=/);

    // sign in, land back on the guide
    await page.fill('#a-email', 'esther@houseofesther.co.ke');
    await page.fill('#a-password', 'correct horse battery staple');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/admin\/guide\.html/);

    // and it is reachable from the sidebar nav (last item)
    const navLink = page.locator('.admin-sidebar').getByRole('link', { name: 'Guide' });
    await expect(navLink).toBeVisible();
    await navLink.click();
    await expect(page).toHaveURL(/admin\/guide\.html/);

    // exactly one h1, and it is the guide title
    await expect(page.locator('#main h1, .admin-main h1')).toHaveCount(1);
    await expect(page.locator('.admin-main h1')).toHaveText("Shop owner's guide");

    // the image-size reference is a real <table> with the four rows
    const table = page.locator('.guide table');
    await expect(table).toHaveCount(1);
    await expect(table.locator('thead th')).toHaveText(['Photo type', 'Shape', 'Best size to upload', 'Watch out for']);
    await expect(table.locator('tbody tr')).toHaveCount(4);

    // every contents anchor points at a real section id
    const contents = page.locator('nav[aria-label="On this page"] a');
    const count = await contents.count();
    expect(count).toBeGreaterThan(10);
    const hrefs = await contents.evaluateAll((els) => els.map((a) => a.getAttribute('href')));
    for (const href of hrefs) {
      expect(href).toMatch(/^#[a-z-]+$/);
      await expect(page.locator(`section#${href.slice(1)}`)).toHaveCount(1);
    }

    // the first contents link jumps to its section
    await contents.first().click();
    await expect(page).toHaveURL(new RegExp(`${hrefs[0]}$`));

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
    const links = ['Products', 'Inventory', 'Orders', 'Reviews', 'Contact messages', 'Collections & categories', 'Subscribers & broadcasts', 'Homepage content', 'Legal documents', 'Discount codes', 'Guide'];
    for (const name of links) {
      await page.locator('.admin-sidebar').getByRole('link', { name }).click();
      await expect(page.locator('.admin-main h1')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('TEAM (A16): owner sees the Team nav item and can open the page', async ({ page }) => {
    await installMockApi(page, { admin: true, adminRole: 'owner' });
    const errors = trackErrors(page);
    await page.goto('/admin/');

    const teamLink = page.locator('.admin-sidebar').getByRole('link', { name: 'Team' });
    await expect(teamLink).toBeVisible();
    await teamLink.click();
    await expect(page).toHaveURL(/admin\/team\.html/);
    await expect(page.locator('.admin-main h1')).toHaveText('Team');

    // seeded list shows just the owner's own row
    await expect(page.locator('.admin-table')).toContainText('esther@houseofesther.co.ke');
    await expect(page.locator('tr', { hasText: 'esther@houseofesther.co.ke' }).locator('.team-badge')).toHaveText('Active');

    expect(errors).toEqual([]);
  });

  test('TEAM (A16): staff never see Team and are bounced off /admin/team.html', async ({ page }) => {
    await installMockApi(page, { admin: true, adminRole: 'staff' });
    await page.goto('/admin/');

    await expect(page.locator('.admin-sidebar')).toBeVisible();
    await expect(page.locator('.admin-sidebar').getByRole('link', { name: 'Team' })).toHaveCount(0);

    await page.goto('/admin/team.html');
    await expect(page).toHaveURL(/\/admin\/$/);
    await expect(page.locator('.admin-main h1')).toHaveText('Dashboard');
  });

  test('TEAM (A16): add administrator posts, shows the share-the-password reminder, and the row appears', async ({ page }) => {
    await installMockApi(page, { admin: true, adminRole: 'owner' });
    const errors = trackErrors(page);
    await page.goto('/admin/team.html');

    await page.fill('#t-name', 'Miriam Otieno');
    await page.fill('#t-email', 'miriam@houseofesther.co.ke');
    await page.selectOption('#t-role', 'staff');
    await page.fill('#t-password', 'Temp-Handover-2026');
    await page.getByRole('button', { name: 'Add administrator' }).click();

    await expect(page.locator('#t-result')).toContainText('Miriam Otieno added');
    await expect(page.locator('#t-result')).toContainText(/privately/i);
    await expect(page.locator('#t-result')).toContainText(/set their own password the first time/i);

    const row = page.locator('tr', { hasText: 'miriam@houseofesther.co.ke' });
    await expect(row).toContainText('Staff');
    await expect(row.locator('.team-badge--active')).toBeVisible();
    await expect(row.locator('td').nth(4)).toHaveText('—'); // never signed in

    expect(errors).toEqual([]);
  });

  test('TEAM (A16): email_taken is surfaced inline', async ({ page }) => {
    await installMockApi(page, { admin: true, adminRole: 'owner' });
    await page.goto('/admin/team.html');

    await page.fill('#t-name', 'Someone Else');
    await page.fill('#t-email', 'esther@houseofesther.co.ke');
    await page.selectOption('#t-role', 'staff');
    await page.fill('#t-password', 'Temp-Handover-2026');
    await page.getByRole('button', { name: 'Add administrator' }).click();

    await expect(page.getByText(/already uses that email — reactivate them instead/i)).toBeVisible();
  });

  test('TEAM (A16): deactivate toggles the status badge', async ({ page }) => {
    await installMockApi(page, { admin: true, adminRole: 'owner' });
    page.on('dialog', (d) => d.accept());
    await page.goto('/admin/team.html');

    // add a second admin we are allowed to deactivate
    await page.fill('#t-name', 'Miriam Otieno');
    await page.fill('#t-email', 'miriam@houseofesther.co.ke');
    await page.selectOption('#t-role', 'staff');
    await page.fill('#t-password', 'Temp-Handover-2026');
    await page.getByRole('button', { name: 'Add administrator' }).click();

    const rowStatus = () => page.locator('tr', { hasText: 'miriam@houseofesther.co.ke' }).locator('td').nth(3);
    await expect(rowStatus()).toContainText('Active');

    await page.locator('tr', { hasText: 'miriam@houseofesther.co.ke' }).getByRole('button', { name: 'Deactivate' }).click();
    await expect(rowStatus()).toContainText('Disabled');
    await expect(page.locator('tr', { hasText: 'miriam@houseofesther.co.ke' })).toHaveClass(/team-row--disabled/);

    // and back
    await page.locator('tr', { hasText: 'miriam@houseofesther.co.ke' }).getByRole('button', { name: 'Reactivate' }).click();
    await expect(rowStatus()).toContainText('Active');
  });

  test('TEAM (A16): demoting the only owner shows the last_owner message', async ({ page }) => {
    await installMockApi(page, { admin: true, adminRole: 'owner' });
    await page.goto('/admin/team.html');

    const row = page.locator('tr', { hasText: 'esther@houseofesther.co.ke' });
    await row.getByRole('button', { name: 'Edit' }).click();
    await page.selectOption('#e-role', 'staff');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('#team-edit-slot')).toContainText(/only owner/i);
    // the row is unchanged
    await expect(page.locator('tr', { hasText: 'esther@houseofesther.co.ke' })).toContainText('Owner');
  });

  test('FORCED PASSWORD (A1/p44): mustChangePassword blocks every admin view until it succeeds', async ({ page }) => {
    await installMockApi(page, { admin: true, adminMustChangePassword: true });
    const errors = trackErrors(page);

    await page.goto('/admin/');
    await expect(page.locator('.admin-sidebar')).toHaveCount(0);
    await expect(page.locator('#main h1')).toHaveText('Set a password only you know');

    // cannot navigate away
    await page.goto('/admin/products.html');
    await expect(page.locator('.admin-sidebar')).toHaveCount(0);
    await expect(page.locator('#main h1')).toHaveText('Set a password only you know');
    await expect(page.locator('.admin-table')).toHaveCount(0);

    // wrong current password
    await page.goto('/admin/');
    await page.getByLabel('Temporary password').fill('not-the-temp-one');
    await page.getByLabel('New password', { exact: true }).fill('a-secret-only-she-knows');
    await page.getByLabel('Confirm new password').fill('a-secret-only-she-knows');
    await page.getByRole('button', { name: 'Set my password' }).click();
    await expect(page.getByText("That current password doesn't match.")).toBeVisible();

    // confirm-mismatch is caught client-side
    await page.getByLabel('Temporary password').fill('Temp-Handover-2026');
    await page.getByLabel('Confirm new password').fill('different');
    await page.getByRole('button', { name: 'Set my password' }).click();
    await expect(page.getByText('This does not match the new password.')).toBeVisible();

    // valid change clears the gate and lands on the dashboard
    await page.getByLabel('Confirm new password').fill('a-secret-only-she-knows');
    await page.getByRole('button', { name: 'Set my password' }).click();
    await expect(page).toHaveURL(/\/admin\/$/);
    await expect(page.locator('.admin-main h1')).toHaveText('Dashboard');
    await expect(page.locator('.admin-sidebar')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('ACCOUNT (p44): admin account page shows read-only identity + a working change-password form', async ({ page }) => {
    await installMockApi(page, { admin: true, adminRole: 'owner' });
    await page.goto('/admin/');

    await page.locator('.admin-sidebar').getByRole('link', { name: 'Account' }).click();
    await expect(page).toHaveURL(/admin\/account\.html/);
    await expect(page.locator('.readonly-panel')).toContainText('esther@houseofesther.co.ke');
    await expect(page.locator('.readonly-panel')).toContainText('Owner');

    await page.getByLabel('Current password').fill('correct horse battery staple');
    await page.getByLabel('New password', { exact: true }).fill('another-fresh-secret');
    await page.getByLabel('Confirm new password').fill('another-fresh-secret');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.locator('.toast-region')).toContainText(/Password changed/i);
  });

  test('GUIDE: getting-started explains the Team capability', async ({ page }) => {
    await installMockApi(page, { admin: true, adminRole: 'owner' });
    await page.goto('/admin/guide.html');
    const gs = page.locator('#getting-started');
    await expect(gs).toContainText('Team');
    await expect(gs).toContainText(/staff/i);
    await expect(gs).toContainText(/set their own password/i);
    await expect(gs).toContainText(/no email invite is sent/i);
  });
});
