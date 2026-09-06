import { api } from '../../api.js';
import { el, clear } from '../../dom.js';
import { productCard, emptyState, errorState } from '../../components.js';
import { accountShell } from './_shell.js';
import { toast } from '../../toast.js';

let content;

start();

async function start() {
  const shell = await accountShell('wishlist');
  if (!shell) return;
  content = shell.content;
  await refresh();
}

async function refresh() {
  clear(content).append(el('div', { class: 'spinner' }));
  try {
    const data = await api.getWishlist();
    render(data.items || []);
  } catch (err) {
    clear(content).append(errorState(err, refresh));
  }
}

function render(items) {
  clear(content);
  content.append(el('h2', { style: 'font-size:var(--step-2)', text: 'Wishlist' }));
  if (!items.length) {
    content.append(emptyState({
      title: 'Nothing saved yet',
      message: 'Tap the heart on any piece to keep it here for later.',
      actions: [el('a', { class: 'btn', href: '/new-in.html', text: 'Shop New In' })],
    }));
    return;
  }
  const grid = el('div', { class: 'product-grid' });
  items.forEach((p) => {
    const card = productCard(p, { onWishlist: () => removeItem(p.id), wishlisted: true });
    if (p.inStock) {
      card.querySelector('.product-card__body').append(
        el('a', {
          class: 'btn btn--small btn--secondary',
          style: 'margin-top:.5rem;position:relative;z-index:2',
          href: `/product.html?slug=${encodeURIComponent(p.slug)}`,
          text: 'Choose options',
        })
      );
    }
    grid.append(card);
  });
  content.append(grid);
}

async function removeItem(productId) {
  try {
    await api.removeWishlist(productId);
    toast('Removed from your wishlist.');
    await refresh();
  } catch (err) {
    toast((err && err.message) || 'Could not update your wishlist.', 'error');
  }
}
