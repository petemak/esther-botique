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

  test('A17: Products page shows the three catalogue-tools controls pointing at the right URLs', async ({ page }) => {
    await installMockApi(page, { admin: true });
    const errors = trackErrors(page);
    await page.goto('/admin/products.html');

    const tools = page.locator('.catalogue-tools');
    await expect(tools).toContainText('Catalogue tools');
    await expect(tools.getByRole('link', { name: 'Bulk import' })).toHaveAttribute('href', '/admin/product-import.html');
    await expect(tools.getByRole('link', { name: 'Download current products (CSV)' })).toHaveAttribute('href', '/api/admin/products/export');
    await expect(tools.getByRole('link', { name: 'Download template' })).toHaveAttribute('href', '/api/admin/products/import/template');

    expect(errors).toEqual([]);
  });

  const PHOTO_FILES = [
    { name: 'orin-front.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('orin-front-bytes') },
    { name: 'orin-back.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('orin-back-bytes') },
    { name: 'marren-front.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('marren-front-bytes') },
    { name: 'harlan-front.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('harlan-front-bytes') },
  ];
  const MARREN_BACK_FILE = { name: 'marren-back.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('marren-back-bytes') };
  const CATALOGUE_CSV = {
    name: 'catalogue.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('name,price,quantity,category,photos\nMarren Wool Coat,12800,4,women,marren-front.jpg;marren-back.jpg\n'),
  };

  async function gotoImportWithPhotos(page) {
    await page.goto('/admin/product-import.html');
    await expect(page.locator('#import-preview-btn')).toBeDisabled();
    await page.setInputFiles('#import-file', CATALOGUE_CSV);
    await expect(page.locator('#import-filename')).toHaveText('catalogue.csv');
    // step 1 photo picker + count
    await page.setInputFiles('#import-photos', PHOTO_FILES);
    await expect(page.locator('#import-photo-count')).toHaveText('4 photos selected');
    await expect(page.locator('#import-preview-btn')).toBeEnabled();
  }

  /** Correlates each successful POST /admin/images upload back to its selected filename. */
  function trackUploadedImageIds(page) {
    const ids = {};
    page.on('response', async (res) => {
      const req = res.request();
      if (req.method() !== 'POST' || res.status() !== 201) return;
      let pathname;
      try { pathname = new URL(res.url()).pathname; } catch { return; }
      if (pathname !== '/api/admin/images') return;
      const raw = req.postDataBuffer() ? req.postDataBuffer().toString('latin1') : '';
      const m = raw.match(/name="file";\s*filename="([^"]*)"/i);
      if (!m) return;
      try {
        const data = await res.json();
        ids[m[1]] = data.id;
      } catch { /* ignore */ }
    });
    return ids;
  }

  test('A17 / JOURNEY 6: CSV + photos -> review (photo status + tally) -> tiny JSON commit -> photo phase -> done', async ({ page }) => {
    await installMockApi(page, { admin: true });
    const errors = trackErrors(page);

    await page.goto('/admin/products.html');
    await page.locator('.catalogue-tools').getByRole('link', { name: 'Bulk import' }).click();
    await expect(page).toHaveURL(/product-import\.html/);
    await expect(page.locator('.admin-main h1')).toHaveText('Bulk import products');

    await gotoImportWithPhotos(page);

    // preview request is multipart carrying `file` + `filename` parts (unchanged by this fix)
    const [previewReq] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/admin/products/import') && !r.url().includes('/commit') && r.method() === 'POST'),
      page.getByRole('button', { name: 'Preview changes' }).click(),
    ]);
    expect(previewReq.headers()['content-type']).toContain('multipart/form-data');
    const previewBody = previewReq.postDataBuffer().toString('latin1');
    expect(previewBody).toContain('name="file"');
    expect(previewBody).toContain('name="filename"');
    expect(previewBody).toContain('orin-front.jpg');

    // step 2: count strip + photo tally
    const strip = page.locator('.import-countstrip');
    await expect(strip).toContainText('2 new');
    await expect(strip).toContainText('3 to update');
    await expect(strip).toContainText('4 photos matched');
    await expect(strip).toContainText('1 not found');

    // per-row photo status: matched, missing warning, no-photos muted
    const rowOrin = page.locator('.import-table tbody tr', { hasText: 'Orin Linen Dress' });
    await expect(rowOrin.locator('.import-badge')).toHaveText('Update');
    await expect(rowOrin).toContainText('Price KES 5,400 → KES 5,900');
    await expect(rowOrin.locator('.import-photo--ok')).toHaveText('2 photos ✓');

    const rowMarren = page.locator('.import-table tbody tr', { hasText: 'Marren Wool Coat' });
    await expect(rowMarren.locator('.import-badge')).toHaveText('New');
    await expect(rowMarren.locator('.import-photo--ok')).toHaveText('1 photo ✓');
    await expect(rowMarren.locator('.import-photo--warn')).toContainText('marren-back.jpg not selected');

    const rowSuede = page.locator('.import-table tbody tr', { hasText: 'Suede Weekender' });
    await expect(rowSuede.locator('.import-photo--muted')).toHaveText('No photos — will be a draft');

    const rowBag = page.locator('.import-table tbody tr', { hasText: 'Sample Multi Bag' });
    await expect(rowBag).toContainText('set stock and per-option prices on the product page');
    await expect(rowBag).not.toContainText('Stock');

    const rowBroken = page.locator('.import-table tbody tr', { hasText: 'Broken Row' });
    await expect(rowBroken.locator('.import-badge')).toHaveText('Problem');

    // confirm -> tiny JSON commit, no image bytes at all, Idempotency-Key still required
    const confirm = page.getByRole('button', { name: 'Apply 5 changes' });
    await expect(confirm).toBeEnabled();
    const imageReqs = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/admin/images') imageReqs.push(r);
    });
    const [commitReq] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/admin/products/import/commit') && r.method() === 'POST'),
      confirm.click(),
    ]);
    expect(commitReq.headers()['content-type']).toContain('application/json');
    expect(commitReq.headers()['idempotency-key']).toBeTruthy();
    expect(JSON.parse(commitReq.postData())).toEqual({ token: expect.any(String) });

    // photo phase, driven entirely client-side: Orin (update, 2 matched) + Marren (create,
    // 1 matched — marren-back.jpg was never selected so it's just a preview note, never
    // attempted) each get their own POST /admin/images + PATCH /admin/products/{id}.
    await expect(page.locator('.import-result-summary')).toHaveText(
      "2 products created, 2 updated · 3 photos added — 1 skipped, 1 couldn't be applied"
    );
    expect(imageReqs.length).toBe(3);
    imageReqs.forEach((r) => expect(r.headers()['content-type']).toContain('multipart/form-data'));
    await expect(page.getByText('New products are drafts')).toBeVisible();
    await expect(page.locator('.import-failed')).toContainText('Harlan Leather Belt');
    await expect(page.locator('.import-photo-fails')).toHaveCount(0); // nothing failed this run
    await page.getByRole('link', { name: 'Back to products' }).click();
    await expect(page).toHaveURL(/admin\/products\.html/);

    expect(errors).toEqual([]);
  });

  test('A17: a create row with two matched photos uploads both and attaches them via one PATCH, in CSV order', async ({ page }) => {
    await installMockApi(page, { admin: true });
    const errors = trackErrors(page);
    const uploadedIds = trackUploadedImageIds(page);

    await page.goto('/admin/product-import.html');
    await page.setInputFiles('#import-file', CATALOGUE_CSV);
    await page.setInputFiles('#import-photos', [PHOTO_FILES[2], MARREN_BACK_FILE]); // marren-front.jpg + marren-back.jpg only
    await page.getByRole('button', { name: 'Preview changes' }).click();

    const rowMarren = page.locator('.import-table tbody tr', { hasText: 'Marren Wool Coat' });
    await expect(rowMarren.locator('.import-photo--ok')).toHaveText('2 photos ✓');
    await expect(rowMarren.locator('.import-photo--warn')).toHaveCount(0);

    const patchPromise = page.waitForRequest((r) => r.url().includes('/api/admin/products/prod_marren') && r.method() === 'PATCH');
    await page.getByRole('button', { name: 'Apply 5 changes' }).click();
    const patchReq = await patchPromise;

    await expect(page.locator('.import-result-summary')).toHaveText(
      "2 products created, 2 updated · 2 photos added — 1 skipped, 1 couldn't be applied"
    );
    const patchBody = JSON.parse(patchReq.postData());
    expect(patchBody.imageIds).toEqual([uploadedIds['marren-front.jpg'], uploadedIds['marren-back.jpg']]);
    expect(patchBody.primaryImageId).toBe(uploadedIds['marren-front.jpg']);
    expect(patchBody.imageIds.every((id) => typeof id === 'string' && id)).toBe(true);

    expect(errors).toEqual([]);
  });

  test('A17: an update row appends one new photo to its existing gallery without disturbing the primary', async ({ page }) => {
    await installMockApi(page, { admin: true });
    const errors = trackErrors(page);
    const uploadedIds = trackUploadedImageIds(page);

    await page.goto('/admin/product-import.html');
    await page.setInputFiles('#import-file', CATALOGUE_CSV);
    await page.setInputFiles('#import-photos', [PHOTO_FILES[0]]); // orin-front.jpg only — prod_2001 already has 2 images
    await page.getByRole('button', { name: 'Preview changes' }).click();

    const getPromise = page.waitForRequest((r) => r.url().includes('/api/admin/products/prod_2001') && r.method() === 'GET');
    const patchPromise = page.waitForRequest((r) => r.url().includes('/api/admin/products/prod_2001') && r.method() === 'PATCH');
    await page.getByRole('button', { name: 'Apply 5 changes' }).click();
    await getPromise; // existing gallery is read before appending
    const patchReq = await patchPromise;

    await expect(page.locator('.import-result-summary')).toHaveText(
      "2 products created, 2 updated · 1 photo added — 1 skipped, 1 couldn't be applied"
    );
    const patchBody = JSON.parse(patchReq.postData());
    expect(patchBody.imageIds).toEqual(['img_orin1', 'img_orin2', uploadedIds['orin-front.jpg']]);
    expect(patchBody.primaryImageId).toBe('img_orin1'); // unchanged — the product already had a primary

    expect(errors).toEqual([]);
  });

  test('A17: a failed photo upload does not block the row — the other photo still attaches, and Retry photos is offered', async ({ page }) => {
    await installMockApi(page, { admin: true, imageUploadFailNames: ['orin-back.jpg'] });
    const errors = trackErrors(page);
    const uploadedIds = trackUploadedImageIds(page);
    let getCount = 0;
    page.on('request', (r) => {
      if (r.url().includes('/api/admin/products/prod_2001') && r.method() === 'GET') getCount += 1;
    });

    await gotoImportWithPhotos(page);
    await page.getByRole('button', { name: 'Preview changes' }).click();

    const patchPromise = page.waitForRequest((r) => r.url().includes('/api/admin/products/prod_2001') && r.method() === 'PATCH');
    await page.getByRole('button', { name: 'Apply 5 changes' }).click();
    const patchReq = await patchPromise;

    // the row still commits its other photo — a failed image never blocks the row
    const patchBody = JSON.parse(patchReq.postData());
    expect(patchBody.imageIds).toEqual(['img_orin1', 'img_orin2', uploadedIds['orin-front.jpg']]);
    expect(patchBody.primaryImageId).toBe('img_orin1');

    await expect(page.locator('.import-result-summary')).toHaveText(
      "2 products created, 2 updated · 2 photos added, 1 photo couldn't be added — 1 skipped, 1 couldn't be applied"
    );
    await expect(page.locator('.import-photo-fails')).toContainText('Orin Linen Dress: orin-back.jpg —');
    const retryBtn = page.getByRole('button', { name: 'Retry photos' });
    await expect(retryBtn).toBeVisible();
    expect(getCount).toBe(1);

    // retry only retries the outstanding photo — no duplicate fetch of the existing gallery
    await retryBtn.click();
    await expect(page.getByRole('button', { name: 'Retry photos' })).toBeVisible(); // still fails — mock keeps rejecting it
    expect(getCount).toBe(1);

    expect(errors).toEqual([]);
  });

  test('A17: no photos selected -> plain JSON commit (unchanged path)', async ({ page }) => {
    await installMockApi(page, { admin: true });
    await page.goto('/admin/product-import.html');
    await page.setInputFiles('#import-file', {
      name: 'catalogue.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('name,price,quantity,category\nMarren Wool Coat,12800,4,women\n'),
    });
    await expect(page.locator('#import-photo-count')).toHaveText('No photos selected');
    await page.getByRole('button', { name: 'Preview changes' }).click();

    const [commitReq] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/admin/products/import/commit') && r.method() === 'POST'),
      page.getByRole('button', { name: 'Apply 5 changes' }).click(),
    ]);
    expect(commitReq.headers()['content-type']).toContain('application/json');
    expect(JSON.parse(commitReq.postData())).toHaveProperty('token');
    await expect(page.locator('.import-result-summary')).toHaveText(
      "2 products created, 2 updated — 1 skipped, 1 couldn't be applied"
    );
  });

  test('A17: 413 on commit shows the "too many photos" message and stays on step 2', async ({ page }) => {
    await installMockApi(page, { admin: true, importCommitTooLarge: true });
    await page.goto('/admin/product-import.html');
    await gotoImportWithPhotos(page);
    await page.getByRole('button', { name: 'Preview changes' }).click();
    await page.getByRole('button', { name: 'Apply 5 changes' }).click();

    await expect(page.locator('#import-commit-msg')).toContainText('too many photos for one import');
    // still on step 2 — the plan table is intact
    await expect(page.locator('.import-table')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose fewer photos' })).toBeVisible();
  });

  test('A17: a 422 on upload shows the error and stays on step 1', async ({ page }) => {
    await installMockApi(page, { admin: true });
    await page.goto('/admin/product-import.html');
    await page.setInputFiles('#import-file', {
      name: 'broken.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('not,a,valid\nfile\n'),
    });
    await page.getByRole('button', { name: 'Preview changes' }).click();

    await expect(page.locator('#import-upload-msg')).toContainText("That file couldn't be read");
    await expect(page.locator('.import-countstrip')).toHaveCount(0);
    await expect(page.locator('#import-preview-btn')).toBeEnabled();
  });

  test('A17: Confirm is disabled when nothing will apply', async ({ page }) => {
    await installMockApi(page, { admin: true });
    await page.route('**/api/admin/products/import', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'imp_nochange',
          summary: { toCreate: 0, toUpdate: 0, toSkip: 0, errors: 0, totalRows: 1 },
          rows: [{ row: 2, name: 'Orin Linen Dress', slug: 'orin-linen-dress', action: 'update', changes: {}, notes: [], message: null }],
        }),
      })
    );
    await page.goto('/admin/product-import.html');
    await page.setInputFiles('#import-file', { name: 'unchanged.csv', mimeType: 'text/csv', buffer: Buffer.from('name,price,quantity\nOrin Linen Dress,5400,9\n') });
    await page.getByRole('button', { name: 'Preview changes' }).click();
    await expect(page.getByRole('button', { name: 'Apply 0 changes' })).toBeDisabled();
  });

  test('A17: token-expired on commit shows the re-upload message and returns to step 1', async ({ page }) => {
    await installMockApi(page, { admin: true, importCommitExpired: true });
    await page.goto('/admin/product-import.html');
    await page.setInputFiles('#import-file', { name: 'catalogue.csv', mimeType: 'text/csv', buffer: Buffer.from('name,price,quantity,category\nMarren Wool Coat,12800,4,women\n') });
    await page.getByRole('button', { name: 'Preview changes' }).click();
    await page.getByRole('button', { name: 'Apply 5 changes' }).click();

    await expect(page.locator('#import-upload-msg')).toContainText('upload the file again');
    await expect(page.locator('.import-countstrip')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Preview changes' })).toBeVisible();
  });

  test('A17: guide "adding a product" area covers bulk import', async ({ page }) => {
    await installMockApi(page, { admin: true });
    await page.goto('/admin/guide.html');
    const section = page.locator('#adding-a-product');
    await expect(section).toContainText('Adding lots of products at once');
    await expect(section).toContainText('Bulk import');
    await expect(section).toContainText(/draft/i);
    await expect(section).toContainText(/Inventory page/i);
  });

  test('A3 / JOURNEY 6: Products list bulk bar — select, Publish selected posts ids+status, list refreshes', async ({ page }) => {
    await installMockApi(page, { admin: true });
    const errors = trackErrors(page);
    await page.goto('/admin/products.html');
    await expect(page.locator('.admin-table')).toContainText('Harlan Leather Crossbody');

    // Orin starts as a draft
    const rowOrin = page.locator('.admin-table tbody tr', { hasText: 'Orin Linen Dress' });
    await expect(rowOrin.locator('.status-badge')).toHaveText('draft');

    // no bar until something is ticked
    await expect(page.locator('#p-bulkbar')).toBeHidden();
    await page.locator('.p-check-all').check();
    const bar = page.locator('#p-bulkbar');
    await expect(bar).toBeVisible();
    await expect(bar.locator('.bulk-bar__count')).toHaveText('2 selected');

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/admin/products/bulk-status') && r.method() === 'POST'),
      bar.getByRole('button', { name: 'Publish selected' }).click(),
    ]);
    expect(JSON.parse(req.postData())).toEqual({ ids: ['prod_1042', 'prod_2001'], status: 'published' });

    // result surfaced + selection cleared + list refreshed (Orin now published)
    await expect(page.locator('.toast-region')).toContainText('1 published');
    await expect(page.locator('.toast-region')).toContainText('already published');
    await expect(page.locator('#p-bulkbar')).toBeHidden();
    await expect(rowOrin.locator('.status-badge')).toHaveText('published');

    expect(errors).toEqual([]);
  });

  test('A3: "Archive selected" asks for confirmation before posting', async ({ page }) => {
    await installMockApi(page, { admin: true });
    await page.goto('/admin/products.html');
    await expect(page.locator('.admin-table')).toContainText('Harlan Leather Crossbody');

    const rowHarlan = page.locator('.admin-table tbody tr', { hasText: 'Harlan Leather Crossbody' });
    await rowHarlan.locator('.p-row-check').check();
    const bar = page.locator('#p-bulkbar');
    await expect(bar).toBeVisible();

    let posted = false;
    page.on('request', (r) => { if (r.url().includes('/bulk-status')) posted = true; });

    await bar.getByRole('button', { name: 'Archive selected' }).click();
    await expect(bar.locator('.bulk-bar__confirm')).toContainText("Archive 1 product? They'll be hidden from the shop");
    expect(posted).toBe(false);

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/admin/products/bulk-status') && r.method() === 'POST'),
      bar.getByRole('button', { name: 'Archive', exact: true }).click(),
    ]);
    expect(JSON.parse(req.postData())).toEqual({ ids: ['prod_1042'], status: 'archived' });
    await expect(page.locator('.toast-region')).toContainText('1 archived');
  });

  test('A17: guide covers the photos column + Publish selected', async ({ page }) => {
    await installMockApi(page, { admin: true });
    await page.goto('/admin/guide.html');
    const section = page.locator('#adding-a-product');
    await expect(section).toContainText('photos');
    await expect(section).toContainText('orin-front.jpg');
    await expect(section).toContainText('Publish selected');
    await expect(section).toContainText(/draft/i);
    await expect(page.locator('#changing-a-product')).toContainText('Archive selected');
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

/* ------------------------------------------------------------------------------------
 * Production launch: pay on delivery only + completely empty catalogue.
 *
 * `podOnlyBuild(page)` serves the file deploy/build-staging-frontend.sh writes into dist
 * when FE_ONLINE_MPESA=false, so these tests exercise the real onlineMpesa:false code path
 * (assets/js/env.js -> config.js -> copy.js) without needing a second build.
 * ---------------------------------------------------------------------------------- */
async function podOnlyBuild(page) {
  await page.context().route('**/assets/js/env.js', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: 'export const ENV = { onlineMpesa: false };\n' })
  );
}

const FORBIDDEN_PAYMENT_COPY = /\bSTK\b|pay now|prepay|approve the .* prompt|Try M-Pesa again|M-Pesa \(pay now\)|Secure M-Pesa checkout|Pay your way/i;

async function addOrinToCart(page) {
  await page.goto('/product.html?slug=orin-linen-dress');
  await page.getByRole('button', { name: 'Sand', exact: true }).click();
  await page.getByRole('button', { name: 'M', exact: true }).click();
  await page.locator('#add-to-cart').click();
  await expect(page.locator('#cart-drawer')).toBeVisible();
}

async function fillCheckoutAddress(page, { county = 'Nairobi', town = 'Kilimani' } = {}) {
  await page.fill('#f-firstName', 'Amina');
  await page.fill('#f-email', 'amina@example.com');
  await page.fill('#f-phone', '+254712345123');
  await page.fill('#f-recipientName', 'Amina W.');
  await page.fill('#f-recipientPhone', '+254712345123');
  await page.selectOption('#f-county', county);
  await page.fill('#f-town', town);
  await page.locator('#f-town').blur();
}

test.describe('production launch: pay on delivery only (onlineMpesa:false)', () => {
  test('no page promises an STK prompt, "pay now" or prepayment', async ({ page }) => {
    await podOnlyBuild(page);
    await installMockApi(page);
    const errors = trackErrors(page);
    const bodyText = async (route) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      return page.locator('body').innerText();
    };

    // home: trust strip + footer line + JSON-LD
    let text = await bodyText('/');
    expect(text).not.toMatch(FORBIDDEN_PAYMENT_COPY);
    expect(text).toContain('M-Pesa or cash to the rider when your order arrives');
    // the JSON-LD the page injects at runtime (the static copy in index.html is rewritten by
    // the build script and checked against dist-prod, not here)
    const ld = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      return all[all.length - 1].textContent;
    });
    expect(ld).toContain('Cash on delivery');
    expect(ld).not.toContain('"M-Pesa"');
    await expect(page.locator('.site-footer')).toContainText('Pay on delivery');

    // product: delivery/payment box
    await page.goto('/product.html?slug=orin-linen-dress');
    await expect(page.locator('.delivery-note')).toContainText('Pay on delivery — M-Pesa or cash to the rider');
    text = await page.locator('body').innerText();
    expect(text).not.toMatch(FORBIDDEN_PAYMENT_COPY);
    expect(text).not.toMatch(/where available/i);

    // cart: picker status + trust list
    await addOrinToCart(page);
    await page.goto('/cart.html');
    await page.selectOption('#cart-county', 'Nairobi');
    await page.fill('#cart-town', 'Kilimani');
    await page.locator('#cart-town').blur();
    await expect(page.getByText(/Pay on delivery — M-Pesa or cash to the rider\.$/).first()).toBeVisible();
    text = await page.locator('body').innerText();
    expect(text).not.toMatch(FORBIDDEN_PAYMENT_COPY);
    expect(text).not.toMatch(/Prepay/i);

    // delivery & returns, help, about, checkout
    for (const route of ['/delivery-returns.html', '/help.html', '/about.html', '/checkout.html']) {
      text = await bodyText(route);
      expect(text, route).not.toMatch(FORBIDDEN_PAYMENT_COPY);
    }
    await page.goto('/delivery-returns.html');
    await expect(page.locator('#view')).toContainText('you pay the rider when your order arrives');
    await expect(page.locator('#view')).toContainText('Refunds are sent by M-Pesa');
    await expect(page.getByRole('columnheader', { name: 'Pay on delivery' })).toHaveCount(0);
    await page.goto('/help.html');
    await expect(page.locator('#payment-h')).toBeVisible();
    await expect(page.locator('#payment')).toContainText('You pay the rider when your order arrives');
    const faq = await page.evaluate(() => document.querySelector('script[type="application/ld+json"]').textContent);
    expect(faq).not.toMatch(/STK/);

    expect(errors).toEqual([]);
  });

  test('checkout: pay on delivery is preselected, shown as one statement, and the order posts pay_on_delivery with no stk-push', async ({ page }) => {
    await podOnlyBuild(page);
    const state = await installMockApi(page, { podOnly: true });
    const errors = trackErrors(page);
    await addOrinToCart(page);
    await page.goto('/checkout.html');

    // stated up front, before the address is known, with no STK/pay-now wording
    await expect(page.locator('#payment-options')).toContainText('Pay on delivery — M-Pesa or cash to the rider');
    await expect(page.locator('#f-phone ~ .hint')).toHaveText('We need it to reach you about delivery.');

    await fillCheckoutAddress(page);
    await expect(page.locator('#method-options')).toContainText('Nairobi next-day');

    const pay = page.locator('#payment-options');
    await expect(pay.locator('#pay-single')).toHaveText(/Pay on delivery — M-Pesa or cash to the rider/);
    await expect(pay.locator('input[type="radio"]')).toHaveCount(0); // not a broken one-option radio group
    await expect(pay).not.toContainText(/not available|prepay|STK|pay now/i);

    await page.locator('#agree').check();
    await expect(page.locator('#place-order')).toBeEnabled();
    await page.locator('#place-order').click();
    await expect(page).toHaveURL(/order-confirmation\.html/, { timeout: 10000 });
    await expect(page.getByText(/To pay on delivery/i).first()).toBeVisible();

    const posted = state.requests.filter((r) => r.method === 'POST' && r.path === '/orders');
    expect(posted).toHaveLength(1);
    expect(posted[0].body.paymentMethod).toBe('pay_on_delivery');
    expect(state.requests.some((r) => r.path === '/payments/mpesa/stk-push')).toBe(false);
    expect(errors).toEqual([]);
  });

  test('checkout: a pay-on-delivery-only quote is handled the same even when the build flag is on (staging + backend flag off)', async ({ page }) => {
    const state = await installMockApi(page, { podOnly: true });
    await addOrinToCart(page);
    await page.goto('/checkout.html');
    await fillCheckoutAddress(page);
    await expect(page.locator('#pay-single')).toContainText('Pay on delivery');
    await expect(page.locator('#payment-options input[type="radio"]')).toHaveCount(0);
    await expect(page.locator('#payment-options')).not.toContainText(/not available for this area/i);
    await page.locator('#agree').check();
    await page.locator('#place-order').click();
    await expect(page).toHaveURL(/order-confirmation\.html/, { timeout: 10000 });
    expect(state.requests.find((r) => r.method === 'POST' && r.path === '/orders').body.paymentMethod).toBe('pay_on_delivery');
    expect(state.requests.some((r) => r.path === '/payments/mpesa/stk-push')).toBe(false);
  });

  test('checkout: an EMPTY allowedPaymentMethods blocks the order with a clear message', async ({ page }) => {
    const state = await installMockApi(page, { noPayment: true });
    await addOrinToCart(page);
    await page.goto('/checkout.html');
    await fillCheckoutAddress(page);
    await expect(page.locator('#pay-none')).toBeVisible();
    await expect(page.locator('#pay-none')).toContainText(/cannot take an order/i);
    await expect(page.locator('#pay-none').getByRole('link', { name: 'contact us' })).toHaveAttribute('href', '/contact.html');
    await page.locator('#agree').check();
    await expect(page.locator('#place-order')).toBeDisabled();
    expect(state.requests.some((r) => r.method === 'POST' && r.path === '/orders')).toBe(false);
  });

  test('flag on (staging): the original M-Pesa copy and STK option are unchanged', async ({ page }) => {
    await installMockApi(page);
    await page.goto('/help.html');
    await expect(page.locator('#payment')).toContainText('we send an STK prompt');
    await page.goto('/');
    await expect(page.locator('.trust-strip')).toContainText('Pay your way');
    await expect(page.locator('.site-footer')).toContainText('Pay with M-Pesa or on delivery.');
  });
});

test.describe('production launch: empty catalogue + minimal home content', () => {
  test('home: only the sections that have content render, nothing throws or spins', async ({ page }) => {
    const state = await installMockApi(page, { emptyCatalogue: true });
    const errors = trackErrors(page);
    await page.goto('/');
    await page.waitForSelector('.hero');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(250);

    // headings that remain are exactly the ones with real content behind them
    const h2s = await page.locator('#view h2:visible').allInnerTexts();
    expect(h2s).toEqual(['Shop by category', 'Be first to know when new pieces land']);
    await expect(page.locator('#view')).not.toContainText(/New In|Featured|From the Journal/);
    await expect(page.locator('.rail')).toBeHidden();
    await expect(page.locator('.spinner:visible')).toHaveCount(0);

    // two category tiles, laid out as two (not two-of-four)
    await expect(page.locator('.tiles .tile')).toHaveCount(2);
    await expect(page.locator('.tiles')).toHaveClass(/tiles--2/);
    await expect(page.locator('#view')).not.toContainText(/\bnull\b|undefined/);

    // empty socialLinks: no social list in the footer
    await expect(page.locator('#footer-social')).toBeHidden();
    await expect(page.locator('#footer-social li')).toHaveCount(0);

    // null featuredCollectionSlug must not cause a collection request
    expect(state.requests.filter((r) => /^\/collections\//.test(r.path))).toEqual([]);
    expect(state.requests.filter((r) => /collection=(null|undefined|)(&|$)/.test(r.query) && r.path === '/products')).toEqual([]);

    // both tiles still navigate
    await page.locator('.tiles .tile').first().click();
    await expect(page).toHaveURL(/women\.html/);
    expect(errors).toEqual([]);
  });

  for (const [route, name] of [['/women.html', 'category'], ['/accessories.html', 'category'], ['/new-in.html', 'New In'], ['/sale.html', 'Sale']]) {
    test(`listing ${route} (${name}) shows the friendly empty state`, async ({ page }) => {
      await installMockApi(page, { emptyCatalogue: true });
      const errors = trackErrors(page);
      await page.goto(route);
      await expect(page.locator('#main h1')).toHaveCount(1);
      await expect(page.locator('#view .empty-state h2')).toHaveText('Nothing here yet');
      await expect(page.locator('#view .empty-state')).toContainText('New pieces are on their way');
      await expect(page.locator('.product-card')).toHaveCount(0);
      await expect(page.locator('.spinner')).toHaveCount(0);
      await expect(page.locator('#filter-panel')).toHaveCount(0); // no empty filter panel / "0 pieces" toolbar
      await expect(page.locator('#view')).not.toContainText(/\b0 pieces\b/);

      await page.getByRole('button', { name: 'Get notified' }).click();
      await expect(page.locator('#footer-newsletter-email')).toBeFocused();
      await page.getByRole('link', { name: 'Back to home' }).click();
      await expect(page).toHaveURL(/\/$/);
      expect(errors).toEqual([]);
    });
  }

  test('search with a term on an empty shop says no matches, without errors', async ({ page }) => {
    await installMockApi(page, { emptyCatalogue: true });
    const errors = trackErrors(page);
    await page.goto('/search.html?q=dress');
    await expect(page.locator('#view .empty-state h2')).toHaveText('No matches for that search');
    await expect(page.locator('.spinner')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('journal listing shows an empty state', async ({ page }) => {
    await installMockApi(page, { emptyCatalogue: true });
    const errors = trackErrors(page);
    await page.goto('/journal.html');
    await expect(page.locator('#main h1')).toHaveCount(1);
    await expect(page.locator('#view .empty-state h2')).toHaveText('Nothing here yet');
    await expect(page.locator('#view .empty-state')).toContainText('on their way');
    await expect(page.locator('.spinner')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('empty catalogue + pay-on-delivery build: home, listing and journal together stay clean', async ({ page }) => {
    await podOnlyBuild(page);
    await installMockApi(page, { emptyCatalogue: true, podOnly: true });
    const errors = trackErrors(page);
    for (const route of ['/', '/new-in.html', '/journal.html', '/cart.html', '/checkout.html', '/delivery-returns.html', '/help.html']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      expect(await page.locator('body').innerText(), route).not.toMatch(FORBIDDEN_PAYMENT_COPY);
    }
    expect(errors).toEqual([]);
  });
});
