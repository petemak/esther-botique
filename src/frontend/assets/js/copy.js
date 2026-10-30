/**
 * Single source of truth for every customer-facing sentence that talks about HOW A
 * CUSTOMER PAYS.
 *
 * Two variants:
 *   ONLINE   - staging / future production: M-Pesa STK prompt at checkout, or pay on delivery.
 *   POD_ONLY - production launch with no Daraja credentials: pay on delivery only
 *              (M-Pesa or cash handed to the rider). Nothing may promise an STK prompt,
 *              "pay now" or prepayment.
 *
 * CONFIG.onlineMpesa (build-time, assets/js/env.js) picks the variant, so flipping the
 * flag back restores the original wording everywhere. POD_ONLY spreads ONLINE, so a
 * phrase that is true in both modes is written once.
 *
 * The *_HTML strings are static literals (never user input) and are only ever passed to
 * el(..., { html }).
 */
import { CONFIG } from './config.js';

/** The one-sentence pay-on-delivery statement, reused wherever it stands alone. */
export const POD_TITLE = 'Pay on delivery';
export const POD_DETAIL = 'M-Pesa or cash to the rider when your order arrives.';
export const POD_SENTENCE = `${POD_TITLE} — ${POD_DETAIL}`;

const ONLINE = {
  footerPaymentHtml: 'Pay with <strong>M-Pesa</strong> or on delivery.',

  aboutDelivery:
    'Nairobi next-day where we can, courier to every county, and a tracking link the moment your order is dispatched. Pay with M-Pesa or on delivery. If you message us, a person replies — within one business day.',

  productPaymentHtml: '<strong>Payment:</strong> M-Pesa, or pay on delivery where available.',

  homeTrust: ['Pay your way', 'M-Pesa or pay on delivery — your choice at checkout.'],
  homePaymentAccepted: ['M-Pesa', 'Cash on delivery'],

  cartTrust: ['Secure M-Pesa checkout', 'Pay on delivery in many areas'],

  checkoutPhoneHint: 'We need it for M-Pesa and to reach you about delivery.',

  checkoutPlaceHint: 'By placing your order you agree to be charged the total shown. A retry will not double-charge you.',

  deliveryTimeframes:
    'You get a tracking link by SMS and email the moment your order is dispatched. Timeframes are business days and start once payment clears (or once the order is confirmed, for pay on delivery).',
  deliveryPaymentHtml: [
    '<strong>M-Pesa:</strong> choose M-Pesa at checkout, approve the STK prompt on your phone, and your order confirms automatically.',
    '<strong>Pay on delivery:</strong> available for many areas (shown at checkout if yours qualifies). Have cash or M-Pesa ready for the rider for the full order total.',
  ],
  deliveryShowPodColumn: true,
  refundLine: 'Refunds go back to your M-Pesa number once we receive and check the item.',

  helpPaymentQA: [
    ['How does M-Pesa payment work?', 'At checkout you choose M-Pesa, we send an STK prompt to your phone, and you enter your PIN. Your order confirms automatically once payment clears.'],
    ['What is pay on delivery?', 'Where available for your area, you pay the rider in cash or by M-Pesa when the order arrives. It shows as an option at checkout only if your location allows it.'],
    ['Is my payment secure?', 'We never see or store your M-Pesa PIN. Payment is handled directly between you and Safaricom.'],
  ],
};

const POD_ONLY = {
  ...ONLINE,

  footerPaymentHtml: '<strong>Pay on delivery</strong> — M-Pesa or cash to the rider.',

  aboutDelivery:
    'Nairobi next-day where we can, courier to every county, and a tracking link the moment your order is dispatched. Pay on delivery — M-Pesa or cash to the rider when your order arrives. If you message us, a person replies — within one business day.',

  productPaymentHtml: `<strong>Payment:</strong> ${POD_SENTENCE}`,

  homeTrust: [POD_TITLE, POD_DETAIL],
  // schema.org paymentAccepted is free text; both are taken at the door.
  homePaymentAccepted: ['Cash on delivery', 'M-Pesa on delivery'],

  cartTrust: [POD_SENTENCE],

  checkoutPhoneHint: 'We need it to reach you about delivery.',
  checkoutPlaceHint: 'By placing your order you agree to pay the total shown to the rider when it arrives. A retry will not place a second order.',

  deliveryTimeframes:
    'You get a tracking link by SMS and email the moment your order is dispatched. Timeframes are business days and start once your order is confirmed.',
  deliveryPaymentHtml: [
    `<strong>${POD_TITLE}:</strong> you pay the rider when your order arrives, by M-Pesa or in cash, for the full order total. There is nothing to pay online. Please have the amount ready.`,
  ],
  deliveryShowPodColumn: false,
  refundLine: 'Refunds are sent by M-Pesa to the number you give us once we receive and check the item.',

  helpPaymentQA: [
    ['How do I pay?', 'You pay the rider when your order arrives, by M-Pesa or in cash. There is nothing to pay at checkout.'],
    ['Do I pay anything when I place my order?', 'No. Placing an order only reserves your pieces. You pay for the full total, including delivery, when the rider hands your order over.'],
    ['Is my payment secure?', 'We never ask for your M-Pesa PIN or card details online. If you pay by M-Pesa, you do it on your own phone, directly with Safaricom, when your order arrives.'],
  ],
};

export const copy = CONFIG.onlineMpesa ? ONLINE : POD_ONLY;

/**
 * Payment methods this customer may actually use: what the quote allows, minus online
 * M-Pesa when the build has it switched off. A missing array falls back to both (older
 * quote shape); an EMPTY array stays empty so the UI can block instead of guessing.
 */
export function effectivePaymentMethods(allowed) {
  const list = Array.isArray(allowed) ? allowed : ['mpesa', 'pay_on_delivery'];
  return CONFIG.onlineMpesa ? list : list.filter((m) => m !== 'mpesa');
}

/** One-line payment status for the cart's delivery-estimate widget. */
export function cartPaymentStatus(allowed) {
  const methods = effectivePaymentMethods(allowed);
  const pod = methods.includes('pay_on_delivery');
  const mpesa = methods.includes('mpesa');
  if (!methods.length) return 'We cannot take orders for this area right now. Please contact us.';
  if (pod && !mpesa) return POD_SENTENCE;
  if (pod) return 'Pay on delivery available here.';
  return 'Prepay with M-Pesa for this area.';
}
