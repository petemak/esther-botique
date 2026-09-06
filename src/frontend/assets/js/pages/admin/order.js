import { api, ApiError } from '../../api.js';
import { el, clear, $ } from '../../dom.js';
import { errorState } from '../../components.js';
import { getParam, formatDateTime, uuid } from '../../util.js';
import { adminShell } from './_shell.js';
import { orderTimeline, orderSummary } from '../../order-view.js';
import { toast } from '../../toast.js';

const FLOW = ['placed', 'confirmed', 'packed', 'dispatched', 'out_for_delivery', 'delivered'];

/** Forward transitions the UI offers. The server is the source of truth on what's legal
 *  (engineering-standards.md: client logic is convenience only); it rejects illegal moves
 *  with 409, which we surface. Esther can also cancel from any pre-delivery state. */
function nextStatuses(current) {
  const i = FLOW.indexOf(current);
  if (i === -1 || current === 'delivered') return [];
  return [...FLOW.slice(i + 1), 'cancelled'];
}

let content;
let order;
const orderNumber = getParam('order');

start();

async function start() {
  const shell = await adminShell('orders', `Order ${orderNumber || ''}`);
  if (!shell) return;
  content = shell.content;
  await load();
}

async function load() {
  clear(content).append(el('div', { class: 'spinner' }));
  try {
    order = await api.admin.getOrder(orderNumber);
    render();
  } catch (err) {
    clear(content).append(errorState(err, load));
  }
}

function render() {
  clear(content);
  content.append(
    el('a', { class: 'btn--ghost', href: '/admin/orders.html', text: '← All orders' }),
    el('div', { class: 'admin-form-grid', style: 'margin-top:1rem' }, [
      el('div', {}, [customerCard(), itemsCard(), paymentCard(), fulfilmentCard(), notesCard()]),
      el('div', {}, [agreementCard(), activityCard()]),
    ])
  );
}

function customerCard() {
  const c = order.customer || {};
  const a = order.deliveryAddress || {};
  return el('div', { class: 'admin-section-card' }, [
    el('h2', { text: 'Customer & delivery' }),
    el('p', {}, [el('strong', { text: `${c.firstName || a.recipientName || ''}` }), el('br'), document.createTextNode(`${c.email || ''} · ${c.phone || a.phone || ''}`)]),
    el('p', { class: 'text-muted' }, [
      document.createTextNode(a.recipientName || ''), el('br'),
      document.createTextNode(`${a.town || ''}, ${a.county || ''}`), el('br'),
      document.createTextNode(a.phone || ''),
      a.instructions ? el('br') : null,
      a.instructions ? el('em', { text: a.instructions }) : null,
    ]),
    order.deliveryMethod ? el('p', {}, [el('strong', { text: 'Method: ' }), document.createTextNode(`${order.deliveryMethod.label} · ${order.deliveryMethod.eta}`)]) : null,
  ]);
}

function itemsCard() {
  return el('div', { class: 'admin-section-card' }, [el('h2', { text: 'Items' }), orderSummary(order)]);
}

/* ---------- Payment ---------- */
function paymentCard() {
  const p = order.payment || {};
  const card = el('div', { class: 'admin-section-card' }, [
    el('h2', { text: 'Payment' }),
    el('p', {}, [
      el('strong', { text: `${p.method === 'mpesa' ? 'M-Pesa' : 'Pay on delivery'} — ${p.state}` }),
      p.mpesaReceiptNumber ? el('br') : null,
      p.mpesaReceiptNumber ? document.createTextNode(`Receipt ${p.mpesaReceiptNumber}`) : null,
      p.paidAt ? el('br') : null,
      p.paidAt ? document.createTextNode(`Paid ${formatDateTime(p.paidAt)}`) : null,
    ]),
  ]);

  if (p.state !== 'paid' && p.state !== 'refunded' && order.status !== 'cancelled') {
    const ref = el('input', { class: 'input', 'aria-label': 'Payment reference', placeholder: 'M-Pesa code / note' });
    const note = el('input', { class: 'input', 'aria-label': 'Internal note', placeholder: 'e.g. Paid to rider' });
    card.append(
      el('form', {
        class: 'stack',
        on: {
          submit: async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            btn.classList.add('is-loading');
            try {
              await api.admin.updateOrderPayment(orderNumber, { state: 'paid', reference: ref.value.trim() || undefined, note: note.value.trim() || undefined });
              toast('Marked as paid.', 'success');
              load();
            } catch (err) {
              btn.classList.remove('is-loading');
              toast((err && err.message) || 'Could not update payment.', 'error');
            }
          },
        },
      }, [
        el('p', { class: 'hint', text: 'Mark a pay-on-delivery order paid once the rider collects.' }),
        el('div', { class: 'form-row form-row--2' }, [
          el('label', { class: 'field' }, [el('span', { class: 'hint', text: 'Reference' }), ref]),
          el('label', { class: 'field' }, [el('span', { class: 'hint', text: 'Note' }), note]),
        ]),
        el('button', { class: 'btn btn--small', type: 'submit', text: 'Mark as paid' }),
      ])
    );
  }

  if (p.state === 'paid' && order.status !== 'refunded') {
    card.append(refundForm());
  }
  return card;
}

function refundForm() {
  const amount = el('input', { class: 'input', type: 'number', inputmode: 'numeric', value: order.total ? order.total.amount : 0, 'aria-label': 'Refund amount' });
  const reason = el('select', { class: 'select', 'aria-label': 'Refund reason' }, ['return_accepted', 'goodwill', 'order_cancelled', 'other'].map((r) => el('option', { value: r, text: r.replace(/_/g, ' ') })));
  const ref = el('input', { class: 'input', 'aria-label': 'Payout reference', placeholder: 'M-Pesa B2C code' });
  const restock = el('input', { type: 'checkbox', checked: true });
  return el('details', {}, [
    el('summary', { style: 'cursor:pointer;font-weight:600', text: 'Record a refund' }),
    el('form', {
      class: 'stack',
      style: 'margin-top:.5rem',
      on: {
        submit: async (e) => {
          e.preventDefault();
          if (!window.confirm('Record this refund? This sets the order to refunded.')) return;
          const btn = e.target.querySelector('button');
          btn.classList.add('is-loading');
          try {
            await api.admin.refundOrder(orderNumber, {
              amount: { amount: parseInt(amount.value, 10) || 0, currency: (order.total && order.total.currency) || 'KES' },
              reason: reason.value,
              reference: ref.value.trim() || undefined,
              restock: restock.checked,
            }, uuid());
            toast('Refund recorded.', 'success');
            load();
          } catch (err) {
            btn.classList.remove('is-loading');
            toast((err && err.message) || 'Could not record the refund.', 'error');
          }
        },
      },
    }, [
      el('p', { class: 'hint', text: 'This records a refund and marks the order refunded. It does not move money — pay out via M-Pesa and enter the reference here.' }),
      el('div', { class: 'form-row form-row--2' }, [
        el('label', { class: 'field' }, [el('span', { class: 'hint', text: 'Amount' }), amount]),
        el('label', { class: 'field' }, [el('span', { class: 'hint', text: 'Reason' }), reason]),
      ]),
      el('label', { class: 'field' }, [el('span', { class: 'hint', text: 'Payout reference' }), ref]),
      el('label', { class: 'checkbox' }, [restock, el('span', { text: 'Restock the returned items (creates return-to-stock adjustments)' })]),
      el('button', { class: 'btn btn--danger btn--small', type: 'submit', text: 'Record refund' }),
    ]),
  ]);
}

/* ---------- Fulfilment ---------- */
function fulfilmentCard() {
  const card = el('div', { class: 'admin-section-card' }, [el('h2', { text: 'Fulfilment' }), orderTimeline(order)]);
  const options = nextStatuses(order.status);
  if (!options.length) {
    card.append(el('p', { class: 'hint', text: order.status === 'delivered' ? 'This order is delivered.' : 'No further status changes available.' }));
    return card;
  }

  const statusSel = el('select', { class: 'select', id: 'next-status', 'aria-label': 'Next status' }, options.map((s) => el('option', { value: s, text: s.replace(/_/g, ' ') })));
  const courier = el('input', { class: 'input', id: 'courier', 'aria-label': 'Courier', placeholder: 'Fargo Courier' });
  const trackingRef = el('input', { class: 'input', id: 'tracking-ref', 'aria-label': 'Tracking reference', placeholder: 'FG12345' });
  const notify = el('input', { type: 'checkbox', id: 'notify', checked: true });
  const dispatchFields = el('div', { class: 'form-row form-row--2', id: 'dispatch-fields', hidden: options[0] !== 'dispatched' }, [
    el('label', { class: 'field' }, [el('span', { class: 'hint', text: 'Courier' }), courier]),
    el('label', { class: 'field' }, [el('span', { class: 'hint', text: 'Tracking reference' }), trackingRef]),
  ]);
  statusSel.addEventListener('change', () => { dispatchFields.hidden = statusSel.value !== 'dispatched'; });

  card.append(
    el('form', {
      class: 'stack',
      on: { submit: advanceStatus },
    }, [
      el('label', { class: 'field' }, [el('span', { class: 'hint', text: 'Advance to' }), statusSel]),
      dispatchFields,
      el('label', { class: 'checkbox' }, [notify, el('span', { text: 'Notify the customer' })]),
      el('div', { role: 'alert', id: 'fulfil-alert' }),
      el('button', { class: 'btn btn--small', type: 'submit', text: 'Update status' }),
    ])
  );
  return card;
}

async function advanceStatus(e) {
  e.preventDefault();
  const alert = $('#fulfil-alert');
  clear(alert);
  const status = $('#next-status').value;
  const body = { status, notifyCustomer: $('#notify').checked };
  if (status === 'dispatched') {
    body.courier = $('#courier').value.trim();
    body.trackingReference = $('#tracking-ref').value.trim();
    if (!body.courier || !body.trackingReference) {
      alert.append(el('div', { class: 'alert alert--error', text: 'Courier and tracking reference are required to dispatch.' }));
      return;
    }
  }
  const btn = e.target.querySelector('button');
  btn.classList.add('is-loading');
  try {
    await api.admin.updateOrderStatus(orderNumber, body, uuid());
    toast(`Order marked ${status.replace(/_/g, ' ')}.`, 'success');
    load();
  } catch (err) {
    btn.classList.remove('is-loading');
    if (err instanceof ApiError && err.status === 409) {
      alert.append(el('div', { class: 'alert alert--error', text: err.message || 'That status change is not allowed from here.' }));
    } else {
      alert.append(el('div', { class: 'alert alert--error', text: (err && err.message) || 'Could not update the status.' }));
    }
  }
}

/* ---------- Agreement (read only) ---------- */
function agreementCard() {
  const acc = order.agreementAcceptance;
  if (!acc) return el('div');
  return el('div', { class: 'admin-section-card' }, [
    el('h2', { text: 'Agreement acceptance' }),
    el('p', { class: 'hint', text: 'Read-only proof of what the customer accepted. It cannot be edited or deleted.' }),
    el('div', { class: 'readonly-panel' }, [
      el('dl', {}, [
        row('Acceptance id', acc.id),
        row('Accepted at', formatDateTime(acc.acceptedAt)),
        row('Customer email', acc.customerEmail || (order.customer && order.customer.email) || '—'),
        row('Customer user id', acc.customerUserId || 'guest'),
        row('Terms of Sale', `v${acc.termsOfSaleVersion}`),
        row('Returns Policy', `v${acc.returnsPolicyVersion}`),
        row('IP address', acc.ipAddress || '—'),
        row('User agent', acc.userAgent || '—'),
      ]),
      el('p', { style: 'margin-top:.5rem' }, [
        acc.termsOfSaleHref ? el('a', { href: acc.termsOfSaleHref, target: '_blank', rel: 'noopener', text: 'Terms document ↗' }) : null,
        document.createTextNode(' · '),
        acc.returnsPolicyHref ? el('a', { href: acc.returnsPolicyHref, target: '_blank', rel: 'noopener', text: 'Returns document ↗' }) : null,
      ]),
    ]),
  ]);
}

function row(dt, dd) {
  return el('div', { style: 'display:contents' }, [el('dt', { text: dt }), el('dd', { text: dd })]);
}

/* ---------- Activity + notes ---------- */
function activityCard() {
  const log = order.activityLog || [];
  return el('div', { class: 'admin-section-card' }, [
    el('h2', { text: 'Activity log' }),
    log.length
      ? el('ul', { class: 'stack', style: 'list-style:none;padding:0;font-size:var(--step--1)' },
          log.map((a) => el('li', {}, [
            el('strong', { text: a.event ? a.event.replace(/_/g, ' ') : 'update' }),
            document.createTextNode(` — ${a.from || ''}${a.from ? ' → ' : ''}${a.to || ''}`),
            el('br'),
            el('span', { class: 'text-muted', text: `${formatDateTime(a.at)} · ${a.actor || ''}` }),
          ]))
        )
      : el('p', { class: 'text-muted', text: 'No activity yet.' }),
    el('div', { style: 'margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap' }, [
      resendBtn('confirmation', 'Resend confirmation'),
      resendBtn('receipt', 'Resend receipt'),
      resendBtn('dispatched', 'Resend dispatch note'),
    ]),
  ]);
}

function resendBtn(type, label) {
  return el('button', {
    class: 'btn btn--small btn--ghost',
    text: label,
    on: {
      click: async (e) => {
        e.target.disabled = true;
        try {
          await api.admin.resendNotification(orderNumber, type);
          toast(`${label} queued.`, 'success');
        } catch (err) {
          toast((err && err.message) || 'Could not resend.', 'error');
        } finally {
          e.target.disabled = false;
        }
      },
    },
  });
}

function notesCard() {
  const notes = order.internalNotes || [];
  const input = el('textarea', { class: 'textarea', 'aria-label': 'Internal note', placeholder: 'Add an internal note…' });
  return el('div', { class: 'admin-section-card' }, [
    el('h2', { text: 'Internal notes' }),
    el('div', { class: 'stack', id: 'notes-list' },
      notes.length
        ? notes.map((n) => el('div', { class: 'readonly-panel' }, [el('p', { text: n.body }), el('p', { class: 'hint', text: `${formatDateTime(n.at)} · ${n.author || ''}` })]))
        : [el('p', { class: 'text-muted', text: 'No notes yet.' })]
    ),
    el('form', {
      class: 'stack',
      style: 'margin-top:.5rem',
      on: {
        submit: async (e) => {
          e.preventDefault();
          if (!input.value.trim()) return;
          const btn = e.target.querySelector('button');
          btn.classList.add('is-loading');
          try {
            await api.admin.addOrderNote(orderNumber, input.value.trim());
            input.value = '';
            toast('Note added.', 'success');
            load();
          } catch (err) {
            btn.classList.remove('is-loading');
            toast((err && err.message) || 'Could not add the note.', 'error');
          }
        },
      },
    }, [input, el('button', { class: 'btn btn--small', type: 'submit', text: 'Add note' })]),
  ]);
}
