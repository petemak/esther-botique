/**
 * Build-time environment flags. The committed defaults describe STAGING.
 *
 * deploy/build-staging-frontend.sh overwrites this file inside the built bundle
 * (never in src/) when FE_ONLINE_MPESA=false, which is what
 * deploy/build-prod-frontend.sh does while production has no Daraja credentials.
 * Import it only through config.js (CONFIG.onlineMpesa).
 */
export const ENV = { onlineMpesa: true };
