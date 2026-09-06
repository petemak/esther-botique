import { el, clear } from '../dom.js';
import { injectJsonLd } from '../util.js';
import { bootStorefront, view } from './_boot.js';

bootStorefront({ active: '' });

const TOPICS = [
  {
    topic: 'Ordering',
    qa: [
      ['Do I need an account to order?', 'No. Guest checkout is the default. An account just saves your details, order history and wishlist.'],
      ['Can I change or cancel an order?', 'If it has not been dispatched, message us straight away via Contact with your order number and we will do what we can.'],
    ],
  },
  {
    topic: 'Payment',
    qa: [
      ['How does M-Pesa payment work?', 'At checkout you choose M-Pesa, we send an STK prompt to your phone, and you enter your PIN. Your order confirms automatically once payment clears.'],
      ['What is pay on delivery?', 'Where available for your area, you pay the rider in cash or by M-Pesa when the order arrives. It shows as an option at checkout only if your location allows it.'],
      ['Is my payment secure?', 'We never see or store your M-Pesa PIN. Payment is handled directly between you and Safaricom.'],
    ],
  },
  {
    topic: 'Delivery',
    qa: [
      ['Where do you deliver?', 'Countrywide. Nairobi next-day where we can, courier to major towns in 2–4 business days, and upcountry in 3–6.'],
      ['How do I track my order?', 'Every dispatch comes with a tracking link by SMS and email. You can also track any order from the Track your order page with your order number and email.'],
    ],
  },
  {
    topic: 'Sizing',
    qa: [
      ['How do I know my size?', 'Every piece has measurements and a Find your size guide on its page. Our Size Guide has full conversion tables for clothing, shoes and wig caps.'],
      ['What if it does not fit?', 'Return unworn pieces within 14 days — see Delivery & Returns.'],
    ],
  },
  {
    topic: 'Returns',
    qa: [
      ['What is your returns window?', '14 days from delivery, for unworn items in original condition with tags.'],
      ['How do I start a return?', 'Message us via Contact with your order number and reason. We reply within one business day with next steps.'],
    ],
  },
  {
    topic: 'Account',
    qa: [
      ['I forgot my password.', 'Use the "forgot password" link on the sign-in page. We email a reset link if the address is registered.'],
      ['How do I stop marketing emails?', 'Manage every notification in Profile & notifications, or use the unsubscribe link in any email.'],
    ],
  },
  {
    topic: 'Product care',
    qa: [
      ['How should I care for leather?', 'Wipe with a dry cloth, keep out of prolonged direct sun, and let it dry naturally if it gets wet. Each product page has specific care notes.'],
    ],
  },
];

render();

function render() {
  const root = view();
  clear(root);
  root.append(
    el('h1', { text: 'Help & FAQ' }),
    el('p', { class: 'lede', text: 'Answers to the questions we hear most. Still stuck? Contact us and a person will reply.' }),
    el('nav', { 'aria-label': 'Jump to topic', class: 'chips', style: 'margin:1rem 0' },
      TOPICS.map((t) => el('a', { class: 'chip', href: `#${slugify(t.topic)}`, text: t.topic }))
    )
  );

  TOPICS.forEach((t) => {
    root.append(
      el('section', { id: slugify(t.topic), class: 'section', 'aria-labelledby': `${slugify(t.topic)}-h` }, [
        el('h2', { id: `${slugify(t.topic)}-h`, text: t.topic }),
        el('div', { class: 'accordion' },
          t.qa.map(([q, a]) =>
            el('details', {}, [el('summary', { text: q }), el('p', { text: a })])
          )
        ),
      ])
    );
  });

  root.append(
    el('div', { class: 'card', style: 'text-align:center' }, [
      el('h2', { style: 'font-size:var(--step-1)', text: 'Still need help?' }),
      el('a', { class: 'btn btn--secondary', href: '/contact.html', text: 'Contact us' }),
    ])
  );

  injectJsonLd({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: TOPICS.flatMap((t) =>
      t.qa.map(([q, a]) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      }))
    ),
  });
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z]+/g, '-');
}
