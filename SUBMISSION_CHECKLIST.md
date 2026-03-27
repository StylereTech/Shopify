# Storree: Local Fashion Delivery — Pre-Submission Checklist

Complete every item before submitting to the Shopify App Store for review.

---

## 🌐 Legal & Policy Pages

- [ ] **Privacy policy URL live and accessible**
  - URL: `https://stylere.app/shopify/privacy`
  - Must be publicly accessible (no login required)
  - Must cover: data collected, how used, third parties, retention, user rights

- [ ] **Terms of service URL live and accessible**
  - URL: `https://stylere.app/shopify/terms`
  - Must cover: service description, payment terms, liability limitation, governing law

- [ ] **Support page/contact live**
  - URL: `https://stylere.app/shopify/support`
  - Must include a way for merchants to contact you (email or phone)

---

## ⚙️ Technical Requirements

- [ ] **App installs cleanly on a development store**
  - OAuth flow completes without errors
  - Redirects to correct post-install URL
  - All required scopes requested during install

- [ ] **App uninstalls cleanly**
  - No residual webhooks, carrier services, or settings left behind after uninstall
  - Shopify `app/uninstalled` webhook is handled — revoke access token

- [ ] **GDPR webhooks registered and functional**
  - `customers/data_request` → backend handles and responds with empty/relevant data
  - `customers/redact` → backend deletes customer data and responds 200
  - `shop/redact` → backend deletes all shop data and responds 200
  - All three webhooks registered in Shopify Partners dashboard

- [ ] **OAuth flow works end-to-end**
  - Install URL: `https://api-production-653e.up.railway.app/api/shopify/auth`
  - Callback URL: `https://api-production-653e.up.railway.app/api/shopify/callback`
  - State parameter validated (CSRF protection)
  - HMAC signature validated on callback

- [ ] **App handles session token validation** (if using Shopify App Bridge)

---

## 📋 App Listing Content

- [ ] **App name finalized** — `Storree: Local Fashion Delivery`
  - Does not include the word "Shopify" ✅
  - Does not violate Shopify trademark rules ✅

- [ ] **Tagline entered** (80 chars max)
  - `Same-hour delivery for fashion boutiques. Keep every sale.`

- [ ] **Short description entered** (160 chars max)
  - `Offer same-hour local delivery from your Shopify store. Customers order, we dispatch, they track live. Setup takes 2 minutes.`

- [ ] **Long description entered** (2500 chars max)
  - See `APP_STORE_LISTING.md` for ready-to-paste copy

- [ ] **Key benefits bullets filled in** (5 bullets)
  - See `APP_STORE_LISTING.md`

- [ ] **Category selected** — `Shipping & Delivery`

---

## 🖼️ Visual Assets

- [ ] **App icon uploaded** — 400×400 PNG (no rounded corners, Shopify applies them)
  - ⚠️ **TODO: Create and upload icon**

- [ ] **App banner uploaded** — 1200×628 PNG
  - ⚠️ **TODO: Create and upload banner**

- [ ] **Screenshots uploaded** — minimum 3
  - Recommended: merchant dashboard, checkout shipping option, tracking page
  - Desktop: 1280×800 or 2560×1600
  - Mobile: 750×1334
  - ⚠️ **TODO: Take and upload screenshots**

---

## 💰 Pricing

- [ ] **Pricing plan defined in Partners dashboard**
  - Plan name: `Pay Per Delivery`
  - Monthly price: `$0.00` (free to install)
  - Usage charges: enabled (per delivery, variable)

---

## 🔒 Security

- [ ] **Dev-install bypass removed or secured for production**
  - The `INSTALL_TOKEN` / `dev-install` endpoint in `MerchantLanding.tsx` and backend must be:
    - Either disabled/removed for production app submission
    - Or gated behind an internal-only secret that is NOT the same as production Shopify OAuth
  - ⚠️ **Action required: Review and remove/secure dev install flow**

- [ ] **Access tokens stored securely** (encrypted at rest, not exposed in logs)

- [ ] **Shopify HMAC validation on all webhooks** — verify `X-Shopify-Hmac-Sha256` header

- [ ] **Redirect URL allowlisted** in Partners dashboard (no open redirects)

---

## 🧪 Testing

- [ ] **Test account/credentials provided to Shopify review team**
  - Contact: ryan@stylere.app before submission to confirm review readiness

- [ ] **Testing instructions complete**
  - See `SHOPIFY_REVIEW_TESTING.md`

- [ ] **App tested on a real development store** (not just localhost)

- [ ] **Tested on mobile** (Shopify admin is frequently accessed on mobile)

---

## 📦 Partners Dashboard Final Checks

- [ ] App URL set correctly
- [ ] Allowed redirect URLs set correctly
- [ ] All three GDPR webhook URLs registered
- [ ] App support email set to `ryan@stylere.app`
- [ ] App listed under correct developer account (Stauri LLC / Style.re Unlimited Co.)

---

## 🚀 Submission

- [ ] All above items checked ✅
- [ ] App submitted for review in Shopify Partners dashboard
- [ ] Review notes added for Shopify team (link to `SHOPIFY_REVIEW_TESTING.md`)

---

## Post-Approval

- [ ] App goes live in the Shopify App Store
- [ ] Monitor install metrics in Partners dashboard
- [ ] Set up error alerting for backend failures
- [ ] Respond to any merchant reviews within 48 hours
