import { api } from '../api.js';
import { el, clear } from '../dom.js';
import { formatMoney } from '../money.js';
import { bootStorefront, view } from './_boot.js';

bootStorefront({ active: '' });
render();

async function render() {
  const root = view();
  clear(root);
  root.append(
    el('div', { class: 'prose stack-l' }, [
      el('h1', { text: 'Delivery & Returns' }),
      el('p', { class: 'lede', text: 'How we get your order to you, what it costs, and how to send something back.' }),
      el('h2', { text: 'Delivery' }),
      el('div', { id: 'zones-table' }, [el('div', { class: 'spinner' })]),
      el('p', { text: 'You get a tracking link by SMS and email the moment your order is dispatched. Timeframes are business days and start once payment clears (or once the order is confirmed, for pay on delivery).' }),

      el('h2', { text: 'Payment' }),
      el('p', { html: '<strong>M-Pesa:</strong> choose M-Pesa at checkout, approve the STK prompt on your phone, and your order confirms automatically.' }),
      el('p', { html: '<strong>Pay on delivery:</strong> available for many areas (shown at checkout if yours qualifies). Have cash or M-Pesa ready for the rider for the full order total.' }),

      el('h2', { text: 'Returns' }),
      el('ul', {}, [
        el('li', { text: 'Return unworn items in original condition, with tags, within 14 days of delivery.' }),
        el('li', { text: 'Fragrance, and hair/wig products once opened, cannot be returned for hygiene reasons unless faulty.' }),
        el('li', { text: 'Refunds go back to your M-Pesa number once we receive and check the item.' }),
      ]),
      el('p', {}, [
        document.createTextNode('To start a return, '),
        el('a', { href: '/contact.html?topic=return', text: 'message us' }),
        document.createTextNode(' with your order number. Full terms are in the '),
        el('a', { href: '/legal.html?doc=returns', text: 'Returns & Refund Policy' }),
        document.createTextNode('.'),
      ]),
    ])
  );

  try {
    const data = await api.getDeliveryZones();
    const wrap = document.getElementById('zones-table');
    clear(wrap);
    wrap.append(
      el('table', { class: 'admin-table', style: 'width:100%' }, [
        el('thead', {}, [el('tr', {}, [el('th', { scope: 'col', text: 'Area' }), el('th', { scope: 'col', text: 'Method' }), el('th', { scope: 'col', text: 'Fee' }), el('th', { scope: 'col', text: 'Time' }), el('th', { scope: 'col', text: 'Pay on delivery' })])]),
        el('tbody', {}, (data.zones || []).flatMap((z) =>
          (z.methods || []).map((m) =>
            el('tr', {}, [
              el('th', { scope: 'row', text: z.label }),
              el('td', { text: m.label }),
              el('td', { text: formatMoney(m.fee) }),
              el('td', { text: m.eta }),
              el('td', { text: m.payOnDeliveryAllowed ? 'Yes' : 'No' }),
            ])
          )
        )),
      ])
    );
    wrap.append(
      el('p', { class: 'hint', text: `Counties covered: ${(data.zones || []).flatMap((z) => z.counties || []).filter((c) => c && c !== '...').join(', ')}.` })
    );
  } catch {
    const wrap = document.getElementById('zones-table');
    clear(wrap);
    wrap.append(el('p', { class: 'text-muted', text: 'Delivery fees could not load right now. They also appear at checkout once you enter your address.' }));
  }
}
