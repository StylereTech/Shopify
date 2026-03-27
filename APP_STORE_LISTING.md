# Storree: Local Fashion Delivery — Shopify App Store Listing

## App Name
`Storree: Local Fashion Delivery`

---

## Tagline (80 chars max)
```
Same-hour delivery for fashion boutiques. Keep every sale.
```
*(58 characters)*

---

## Short Description (160 chars max)
```
Offer same-hour local delivery from your Shopify store. Customers order, we dispatch, they track live. Setup takes 2 minutes.
```
*(126 characters)*

---

## Long Description (2500 chars max)

```
Storree turns your Shopify boutique into a same-hour delivery powerhouse — no warehouse, no logistics team, no hassle.

When a customer checks out and chooses local delivery, Storree instantly dispatches a courier from your store to their door. They track every step in real time. You keep the sale.

─── HOW IT WORKS ───

1. Install Storree from the App Store (takes 2 minutes)
2. Enter your store's pickup address in the app dashboard
3. Storree automatically adds "Storree Local Delivery" as a shipping option at your checkout
4. Customer places order → courier is dispatched immediately
5. Customer receives a live tracking link via SMS

No code changes to your store. No theme editing. No developer required.

─── WHY BOUTIQUES LOVE IT ───

Fashion is local. Your best customers live within 5 miles of your store — they just don't always want to drive. With Storree, you capture the impulse buy, the last-minute gift, the "I need it today" moment that would have otherwise gone to Amazon.

Same-day delivery used to be only for big-box retailers. Now it's yours.

─── KEY FEATURES ───

✓ Same-hour local delivery — courier dispatched the moment the order is placed
✓ Live tracking — customers track their courier on a map in real time
✓ 2-minute setup — no code, no developer, no complicated configuration
✓ No monthly fees — pay only per delivery, nothing when you're not using it
✓ Works with your existing checkout — fully integrated with Shopify shipping

─── PRICING ───

Free to install. You only pay a small per-delivery fee when a customer actually orders. No subscription. No monthly minimums. No surprises.

─── REQUIREMENTS ───

• A Shopify store (any plan)
• Store located in the United States (more countries coming soon)
• Products available for same-day courier pickup from your store location

Note: The "Storree Local Delivery" option will appear at checkout when your store's location has courier coverage. Coverage is verified during setup.

─── SUPPORT ───

Questions? Our team responds fast.
• Email: ryan@stylere.app
• SMS: (346) 475-5016
• Support: stylere.app/shopify/support
```

*(~1,950 characters)*

---

## Key Benefits (5 bullets)

1. **Same-hour local delivery** — courier dispatched the moment order is placed
2. **Live tracking** — customer tracks every step in real time
3. **2-minute setup** — connect your store, set pickup address, go live
4. **No monthly fees** — pay only when you deliver
5. **Works with your existing checkout** — no code changes required

---

## App Category
`Shipping & Delivery`

---

## Pricing
`Free to install` (per-delivery fees apply)

> In Shopify Partners dashboard, set up as:
> - Plan name: Pay Per Delivery
> - Monthly price: $0.00
> - Usage charges: Yes (per delivery, variable)

---

## Required Permissions & Explanations

| Permission | Why We Need It |
|---|---|
| `read_orders` | To receive and process delivery requests from paid orders placed in your store |
| `write_shipping` | To register Storree as a shipping carrier option at your checkout |
| `read_locations` | To confirm your store's pickup address for courier dispatch |

---

## GDPR Webhooks Required (mandatory for App Store approval)

| Webhook | Endpoint |
|---|---|
| `customers/data_request` | `https://api-production-653e.up.railway.app/api/shopify/gdpr/customers/data_request` |
| `customers/redact` | `https://api-production-653e.up.railway.app/api/shopify/gdpr/customers/redact` |
| `shop/redact` | `https://api-production-653e.up.railway.app/api/shopify/gdpr/shop/redact` |

---

## App URLs

| Field | URL |
|---|---|
| App URL | `https://api-production-653e.up.railway.app/api/shopify/auth` |
| Redirect URL | `https://api-production-653e.up.railway.app/api/shopify/callback` |
| Privacy Policy | `https://stylere.app/shopify/privacy` |
| Terms of Service | `https://stylere.app/shopify/terms` |
| Support | `https://stylere.app/shopify/support` |

---

## App Assets Needed

| Asset | Spec | Status |
|---|---|---|
| App icon | 400×400 PNG, no rounded corners (Shopify applies) | ⬜ TODO |
| App banner | 1200×628 PNG | ⬜ TODO |
| Screenshots | Min 3, 1280×800 or 2560×1600 (desktop) | ⬜ TODO |

### Screenshot ideas:
1. Merchant dashboard — pickup address configured, delivery enabled
2. Customer checkout — "Storree Local Delivery" shipping option visible
3. Live tracking page — courier on map
4. Order confirmation with delivery ETA
