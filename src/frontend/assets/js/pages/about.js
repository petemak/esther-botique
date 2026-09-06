import { api } from '../api.js';
import { el, clear } from '../dom.js';
import { injectJsonLd } from '../util.js';
import { bootStorefront, view } from './_boot.js';
import { CONFIG } from '../config.js';

bootStorefront({ active: '' });
render();

async function render() {
  const root = view();
  clear(root);
  root.append(
    el('article', { class: 'prose stack-l' }, [
      el('p', { class: 'eyebrow', text: 'Our story' }),
      el('h1', { text: 'A boutique with marketplace-grade plumbing' }),
      el('p', { class: 'lede', text: 'House of Esther exists to close the gap between marketplace scale and boutique warmth. One person chooses every piece; the delivery and payment behind it are built to be as reliable as anything larger.' }),

      el('h2', { text: 'Esther’s eye' }),
      el('p', { text: 'Esther has spent years dressing friends, family and clients who wanted better than the local market routinely offers, without paying international-luxury prices. House of Esther is that instinct, made into a shop: a tight, considered range across womenswear, menswear, accessories, watches, fragrance, sneakers and hair.' }),

      el('h2', { text: 'How we choose' }),
      el('ul', {}, [
        el('li', { text: 'We buy pieces we would wear ourselves, and keep the range small on purpose.' }),
        el('li', { text: 'We photograph everything as it really is, on plain ground and on real bodies.' }),
        el('li', { text: 'We publish honest measurements and say plainly when something runs large or small.' }),
        el('li', { text: 'We only restock what earns its place.' }),
      ]),

      el('h2', { text: 'Our delivery & support promise' }),
      el('p', { text: 'Nairobi next-day where we can, courier to every county, and a tracking link the moment your order is dispatched. Pay with M-Pesa or on delivery. If you message us, a person replies — within one business day.' }),

      el('h2', { id: 'boutique', text: 'The boutique' }),
      el('p', { text: 'A flagship House of Esther store is planned within the year. Address and opening hours will appear here once the doors are set.' }),

      el('h2', { text: 'Find us' }),
      el('ul', { id: 'about-social' }, [
        el('li', {}, [el('a', { href: `https://wa.me/${CONFIG.whatsappNumber.replace(/[^\d]/g, '')}`, text: 'WhatsApp' })]),
        el('li', {}, [el('a', { href: `mailto:${CONFIG.supportEmail}`, text: CONFIG.supportEmail })]),
      ]),
    ])
  );

  injectJsonLd({
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: 'Our Story — House of Esther',
    mainEntity: { '@type': 'Organization', name: CONFIG.brand, url: window.location.origin + '/' },
  });

  try {
    const data = await api.getHomeContent();
    const links = (data && data.socialLinks) || [];
    if (links.length) {
      const ul = document.getElementById('about-social');
      links.forEach((l) => ul.appendChild(el('li', {}, [el('a', { href: l.url, target: '_blank', rel: 'noopener', text: cap(l.platform) })])));
    }
  } catch { /* non-critical */ }
}

function cap(s) {
  return String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
}
