import { el } from '../../dom.js';
import { adminShell } from './_shell.js';

/*
 * Shop owner's guide — 100% static, plain-language help for Esther. No API calls
 * beyond the admin session check that adminShell() already does. Written in her
 * voice: warm, direct, "you", short sentences, says what to click.
 */

const h3 = (text) => el('h3', { text });
const p = (children) => el('p', {}, children);
const lnk = (href, text) => el('a', { href, text });
const steps = (items) => el('ol', {}, items.map((it) => el('li', {}, it)));
const bullets = (items) => el('ul', {}, items.map((it) => el('li', {}, it)));

const IMAGE_ROWS = [
  ['Product photos', 'Tall (4:5)', '1600 x 2000 pixels', 'Frame every photo of the same product the same way, or the gallery jumps around.'],
  ['Category tile (homepage)', 'Tall (4:5)', '1600 x 2000 pixels', 'Keep the subject centred.'],
  ['Journal cover / editorial / collection banner', 'Wide (16:10)', '2000 x 1250 pixels', 'The top and bottom get trimmed on phones — keep the important part in the middle.'],
  ['Homepage main photo (hero)', 'Wide (about 5:3)', '2400 x 1500 pixels (at least 2000 wide)', 'The headline sits over the lower-left — leave that area calm, and keep the subject centred or to the right.'],
];

function imageTable() {
  return el('div', { class: 'admin-table-wrap' }, [
    el('table', { class: 'admin-table' }, [
      el('caption', { class: 'visually-hidden', text: 'Best photo shape and size for each place a photo is used' }),
      el('thead', {}, [
        el('tr', {}, ['Photo type', 'Shape', 'Best size to upload', 'Watch out for'].map((c) => el('th', { scope: 'col', text: c }))),
      ]),
      el('tbody', {}, IMAGE_ROWS.map((row) => el('tr', {}, [
        el('th', { scope: 'row', text: row[0] }),
        el('td', { text: row[1] }),
        el('td', { text: row[2] }),
        el('td', { text: row[3] }),
      ]))),
    ]),
  ]);
}

const SECTIONS = [
  {
    id: 'getting-started',
    title: 'Getting started',
    body: () => [
      p(['Sign in on the ', lnk('/admin/signin.html', 'admin sign-in page'), ' with your email and password. To change your own password later, use ', lnk('/admin/account.html', 'Account'), ' at the bottom of the left menu.']),
      h3('Adding other people'),
      p(['You can give other people their own logins from the ', lnk('/admin/team.html', 'Team'), ' page (you see it in the left menu because you are the owner).']),
      bullets([
        'Choose a role. An Owner can do everything you can, including managing the team. Staff can do all the shop work — products, orders, stock, reviews, messages, broadcasts — but do not see the Team page.',
        'You type a starting password and share it with that person privately — a call or a message, not email. No email invite is sent.',
        'The first time they sign in, they are asked to set their own password before they can do anything else.',
        'When someone leaves, open Team and click Deactivate on their row. They can no longer sign in, but their name stays on everything they did. Reactivate brings them back.',
      ]),
      p('There must always be at least one active Owner, so the system will stop you removing or demoting the last one.'),
      p('The left menu is how you move around.'),
      p('Start each day on the Dashboard. It is your morning check:'),
      bullets(['new orders', 'orders to pack', 'unpaid pay-on-delivery orders', 'low stock', 'reviews waiting', 'unread messages']),
    ],
  },
  {
    id: 'adding-a-product',
    title: 'Adding a product',
    body: () => [
      steps([
        'Open Products, then click "Add product".',
        'Basics: type the name (the web address fills in by itself). Pick a Category and a Subcategory. Write a short description — one or two lines, it shows under the title. Then fill the longer "Story", the Care instructions, and a few Spec lines (Material, Fit, Origin, and so on).',
        'Photos: drag them in. Give each one a short Alt text — describe what is in the photo. This helps blind shoppers and it helps Google. Click the star on the photo you want as the main one. The system shrinks and tidies every photo for you.',
        'Variants: set your options — for example Colour: Tan, Black and Size: S, M, L. The form makes a row for every combination. On each row fill in the SKU (your own code), the Price, the "Compare at" price (only if the piece is on sale — this shows the crossed-out old price), the Stock count, the Low-stock alert number, and pick which photo goes with that row.',
        'SEO: the title and description fill in from what you typed. Tweak them if you like.',
        'Click "Save as draft". The product is saved but it is not on the shop yet.',
        'Click "Preview" to see exactly how the product page will look, phone size included.',
        'When it looks right, click "Publish". It appears on the shop within about 2 minutes. Your admin screens update straight away.',
      ]),
      h3('Adding lots of products at once'),
      p('If you are setting many prices or stock counts in one go, or adding a batch of new pieces, you can work from a spreadsheet instead of opening each product — and you can bring the photos in the same pass.'),
      steps([
        ['On the Products page, in "Catalogue tools", click ', el('strong', { text: 'Download current products (CSV)' }), ' to get your live list, or ', el('strong', { text: 'Download template' }), ' to start fresh.'],
        'Open it in Excel or Google Sheets. Fill in name, price, description, quantity and category. Keep price and quantity as whole numbers.',
        ['In the ', el('strong', { text: 'photos' }), ' column, list the photo file names for that product, separated by commas or semicolons — for example ', el('em', { text: 'orin-front.jpg; orin-back.jpg' }), '. The first name is the main image. Leave the cell blank to change nothing.'],
        ['Save it as a CSV, then click ', el('strong', { text: 'Bulk import' }), '. Choose your CSV and, in the same pick, select all the photo files you named in the sheet (you can also drag them onto the box).'],
        'Check the summary. It shows you every row: what will be created, what will be updated, how many photos matched, and anything it cannot use. Nothing is saved yet.',
        ['When it looks right, click ', el('strong', { text: 'Apply changes' }), '.'],
      ]),
      p('A name that matches a product you already have updates it (and any photos you named are added to its gallery). A new name creates a draft with its photos attached.'),
      p(['Everything you import — new pieces included — comes in as a ', el('strong', { text: 'draft' }), '. Nothing goes on the shop by itself. When the import finishes, go to the Products list, tick the checkboxes on the new rows, and click ', el('strong', { text: 'Publish selected' }), ' in the bar that appears.']),
      p('If you name a photo file in the sheet but forget to select it at upload, the review just flags it — the row still imports, and you can add that photo later from the product page.'),
      p('Products that have sizes or colours only get their price and description updated this way. Set their stock on the Inventory page, one option at a time, so the movement is recorded.'),
      p('Stock changes made by an import show up on the Inventory page as adjustments with your name on them, the same as any other stock change.'),
    ],
  },
  {
    id: 'photo-sizes',
    title: 'Photo sizes and framing',
    body: () => [
      p('This one matters for keeping the shop looking tidy.'),
      p('The site shows every photo in a fixed shape and crops it to fit. So the shape of the photo matters more than the file size.'),
      imageTable(),
      h3('A few notes'),
      bullets([
        'Upload JPG or PNG, up to 15 MB. Anything bigger is rejected.',
        'Anything smaller than about three-quarters of the sizes above will look soft.',
        'You do not need to compress or resize photos yourself — just crop to the right shape.',
      ]),
    ],
  },
  {
    id: 'changing-a-product',
    title: 'Changing or removing a product',
    body: () => [
      h3('To change something'),
      p('Open Products, click the product, change what you need, then click Save. On a live product, price and stock changes show within about 2 minutes.'),
      h3('To take something off the shop'),
      p('Open it and set the status to Archived. Do not delete it. Archived hides the piece from the shop and from search, but keeps it in past orders and reports.'),
      p('"Draft" means not published yet. "Published" means live.'),
      p('Never hard-delete a product that has been ordered. Archive it.'),
      h3('Changing several products at once'),
      p(['On the Products list every row has a checkbox, and there is a "select all" box in the header. Tick the ones you want, and a bar appears with ', el('strong', { text: 'Publish selected' }), ', ', el('strong', { text: 'Archive selected' }), ' and ', el('strong', { text: 'Move to draft' }), '. This is how you publish a batch of freshly imported drafts, or pull a whole group off the shop in one go. Archiving several asks you to confirm first.']),
    ],
  },
  {
    id: 'stock',
    title: 'Stock',
    body: () => [
      p('The Inventory page shows every variant and its stock.'),
      p('To change a count, click "Record adjustment" and pick a reason: Restock, Correction, Damage, or Return to stock. This keeps a history, so you can always see what happened.'),
      p('When something comes back into stock — from 0 to any number — customers who asked to be notified get an email automatically.'),
    ],
  },
  {
    id: 'sales-and-discounts',
    title: 'Putting something on sale, and discount codes',
    body: () => [
      h3('A simple markdown'),
      p('Edit the variant and set a "Compare at" price that is higher than the price. The shop then shows the old price crossed out and "Save KES X".'),
      h3('Coupon codes'),
      p('Open Discount codes and create a code — percent off, a fixed amount off, or free delivery. Set the minimum spend, the usage limit, and the start and end dates.'),
    ],
  },
  {
    id: 'orders',
    title: 'Orders',
    body: () => [
      p('The Orders page lists everything. Filter by status. Open an order to see the items, the address, the payment method and state, and the terms the customer accepted (kept as a record).'),
      h3('To send an order out'),
      p('Set the status to Dispatched, enter the courier and the tracking number (both required), and leave "notify customer" switched on.'),
      h3('Pay on delivery'),
      p('When the rider has been paid, open the order, click "Update payment", and mark it Paid with the M-Pesa reference.'),
      h3('Refunds'),
      p('Open the order, click Refund, and enter the amount, the reason, and the M-Pesa reference of the payout you have already sent. Tick "restock" if the item is coming back. The system records the refund — it does not move any money. You send the M-Pesa payout yourself.'),
    ],
  },
  {
    id: 'reviews',
    title: 'Reviews',
    body: () => [
      p('On the Reviews page, approve or reject each waiting review. Approved reviews show on the product page.'),
    ],
  },
  {
    id: 'categories-and-collections',
    title: 'Categories and collections',
    body: () => [
      p('Manage your top categories and subcategories here — name, image, description, and order.'),
      p('Collections are curated groups. "New Arrivals" fills itself from recent publish dates. A manual collection has a hand-picked, ordered list of products.'),
    ],
  },
  {
    id: 'new-arrivals-email',
    title: 'The new-arrivals email',
    body: () => [
      p('Open Subscribers & broadcasts, then compose: a subject, an intro line, pick the products, and choose the audience.'),
      p([el('strong', { text: 'Always click "Send test" to yourself first.' }), ' Check it. Then Send.']),
    ],
  },
  {
    id: 'homepage-content',
    title: 'Homepage content',
    body: () => [
      p('In the Homepage content editor you can change the announcement bar text, the main photo with its headline and button, the two editorial blocks, the featured collection, and the social links.'),
    ],
  },
  {
    id: 'legal-documents',
    title: 'Legal documents',
    body: () => [
      p('Terms of Sale, Privacy, and Returns live here. When you edit one and click "Publish new version", the version number goes up. Past versions stay on file for the orders that accepted them.'),
      p('These documents are what customers must accept at checkout, so change them carefully.'),
    ],
  },
  {
    id: 'contact-messages',
    title: 'Contact messages',
    body: () => [
      p('Messages from the Contact form arrive here. Open one, read it, and reply to the customer by email — their address is shown. Then mark it "Handled". The number on the Dashboard is how many are still unhandled.'),
    ],
  },
  {
    id: 'good-habits',
    title: 'Good habits',
    body: () => [
      bullets([
        'Publishing takes about 2 minutes to show on the shop.',
        'Always Archive, never delete.',
        'Every stock change needs a reason.',
        'Test every broadcast before you send it.',
        'Check the Dashboard every day.',
        'Keep the photos of one product framed the same way every time.',
      ]),
    ],
  },
];

start();

async function start() {
  const shell = await adminShell('guide', "Shop owner's guide");
  if (!shell) return;
  const { content } = shell;

  const guide = el('div', { class: 'guide' }, [
    p('A plain-language walk-through of everything in this admin. No jargon. Jump to what you need.'),
    el('nav', { class: 'guide__contents', 'aria-label': 'On this page' }, [
      el('h2', { text: 'On this page' }),
      el('ol', {}, SECTIONS.map((s) => el('li', {}, [lnk(`#${s.id}`, s.title)]))),
    ]),
    ...SECTIONS.map((s) =>
      el('section', { id: s.id, 'aria-labelledby': `${s.id}-h` }, [
        el('h2', { id: `${s.id}-h`, text: s.title }),
        ...s.body(),
      ])
    ),
  ]);

  content.append(guide);
}
