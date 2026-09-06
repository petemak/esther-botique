/**
 * Static size-guide content (design-spec.md §14 — static at launch, no API dependency).
 * Keyed by the PDP's ProductDetail.sizeGuideCategory so the modal can be scoped.
 */
import { el } from './dom.js';

const TABLES = {
  'womens-tops': {
    title: "Women's tops & dresses",
    headers: ['Size', 'Bust (cm)', 'Waist (cm)', 'Hip (cm)'],
    rows: [
      ['XS (UK 6)', '78–82', '60–64', '86–90'],
      ['S (UK 8)', '82–86', '64–68', '90–94'],
      ['M (UK 10)', '86–92', '68–74', '94–100'],
      ['L (UK 12)', '92–98', '74–80', '100–106'],
      ['XL (UK 14)', '98–104', '80–88', '106–114'],
    ],
  },
  'womens-bottoms': {
    title: "Women's trousers & skirts",
    headers: ['Size', 'Waist (cm)', 'Hip (cm)', 'Inseam (cm)'],
    rows: [
      ['XS (UK 6)', '60–64', '86–90', '76'],
      ['S (UK 8)', '64–68', '90–94', '77'],
      ['M (UK 10)', '68–74', '94–100', '78'],
      ['L (UK 12)', '74–80', '100–106', '79'],
      ['XL (UK 14)', '80–88', '106–114', '80'],
    ],
  },
  'mens-tops': {
    title: "Men's shirts & tops",
    headers: ['Size', 'Chest (cm)', 'Neck (cm)', 'Sleeve (cm)'],
    rows: [
      ['S', '92–97', '37–38', '84'],
      ['M', '98–104', '39–40', '86'],
      ['L', '105–112', '41–42', '88'],
      ['XL', '113–120', '43–44', '90'],
    ],
  },
  'mens-bottoms': {
    title: "Men's trousers",
    headers: ['Size', 'Waist (cm)', 'Hip (cm)', 'Inseam (cm)'],
    rows: [
      ['30', '76–79', '92–95', '81'],
      ['32', '81–84', '97–100', '81'],
      ['34', '86–89', '102–105', '82'],
      ['36', '91–94', '107–110', '82'],
    ],
  },
  shoes: {
    title: 'Shoe sizes (sneakers)',
    headers: ['EU', 'UK', 'US (M)', 'Foot length (cm)'],
    rows: [
      ['39', '6', '7', '24.5'],
      ['40', '6.5', '7.5', '25'],
      ['41', '7.5', '8.5', '26'],
      ['42', '8', '9', '26.5'],
      ['43', '9', '10', '27.5'],
      ['44', '9.5', '10.5', '28'],
    ],
  },
  wigs: {
    title: 'Wig cap sizes',
    headers: ['Size', 'Head circumference (cm)', 'Ear to ear (cm)'],
    rows: [
      ['Petite', '52–53', '28–29'],
      ['Average', '54–56', '30–31'],
      ['Large', '57–59', '32–33'],
    ],
  },
  bags: {
    title: 'Bags & accessories',
    headers: ['Guidance', ''],
    rows: [
      ['Dimensions', 'Every bag lists width × height × depth in its Details panel.'],
      ['Strap drop', 'Crossbody straps are adjustable 55–120 cm unless stated.'],
    ],
  },
};

const ALIASES = {
  dresses: 'womens-tops',
  tops: 'womens-tops',
  trousers: 'womens-bottoms',
  bottoms: 'womens-bottoms',
  skirts: 'womens-bottoms',
  shirts: 'mens-tops',
  sneakers: 'shoes',
  watches: 'bags',
  fragrance: 'bags',
};

function tableEl(t) {
  return el('div', { style: 'overflow-x:auto' }, [
    el('h3', { text: t.title }),
    el('table', { class: 'admin-table', style: 'width:100%;margin-top:.5rem' }, [
      el('thead', {}, [el('tr', {}, t.headers.map((h) => el('th', { scope: 'col', text: h })))]),
      el('tbody', {}, t.rows.map((r) => el('tr', {}, r.map((c, i) => (i === 0 ? el('th', { scope: 'row', text: c }) : el('td', { text: c }))))),
      ),
    ]),
  ]);
}

function measuringGuide() {
  return el('div', { class: 'prose' }, [
    el('h3', { text: 'How to measure' }),
    el('ol', {}, [
      el('li', { text: 'Use a soft tape and measure over light clothing, keeping the tape level.' }),
      el('li', { text: 'Bust / chest: around the fullest part, under the arms.' }),
      el('li', { text: 'Waist: around the narrowest part of your torso.' }),
      el('li', { text: 'Hip: around the fullest part, feet together.' }),
      el('li', { text: 'Between two sizes? We size up for structured pieces, down for knits — the product story on each piece tells you which.' }),
    ]),
  ]);
}

/** Returns an array of DOM nodes. If category is given, shows that table first. */
export function sizeGuideSections(category) {
  const key = category ? ALIASES[category] || (TABLES[category] ? category : null) : null;
  const nodes = [
    el('p', { class: 'lede', text: 'House of Esther sizing is true to the measurements below. When a piece runs large or small, its product story says so plainly.' }),
  ];
  if (key && TABLES[key]) {
    nodes.push(tableEl(TABLES[key]));
    nodes.push(el('hr'));
  }
  const order = ['womens-tops', 'womens-bottoms', 'mens-tops', 'mens-bottoms', 'shoes', 'wigs', 'bags'];
  order.filter((k) => k !== key).forEach((k) => nodes.push(tableEl(TABLES[k])));
  nodes.push(el('hr'), measuringGuide());
  return nodes;
}
