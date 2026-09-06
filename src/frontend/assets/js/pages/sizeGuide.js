import { el, clear } from '../dom.js';
import { getParam } from '../util.js';
import { bootStorefront, view } from './_boot.js';
import { sizeGuideSections } from '../sizeguide.js';

bootStorefront({ active: '' });

const category = getParam('category') || undefined;
const root = view();
clear(root);
root.append(
  el('h1', { text: 'Size Guide' }),
  el('div', { class: 'prose stack' }, sizeGuideSections(category))
);
