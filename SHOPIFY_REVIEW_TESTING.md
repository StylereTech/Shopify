# Storree: Local Fashion Delivery — Review Testing Instructions

These step-by-step instructions are for Shopify's app review team to test the Storree app.

---

## Prerequisites

- A Shopify **development store** (any plan — development stores are free)
- A test product in the store with a price > $0

---

## Step 1: Install the App

1. Navigate to the app listing in the Shopify App Store
2. Click **"Add app"**
3. You will be redirected to the OAuth authorization screen
4. Review the requested permissions:
   - `read_orders` — to process delivery requests
   - `write_shipping` — to add delivery option at checkout
   - `read_locations` — to confirm pickup address
5. Click **"Install app"**
6. You will be redirected to the Storree merchant dashboard at `https://stylere.app/shopify`

> ✅ **Expected result:** App installs cleanly. Merchant dashboard loads. No errors.

---

## Step 2: Configure Pickup Address

1. In the Storree merchant dashboard, locate the **"Store Settings"** section
2. Enter your test store's pickup address (use a real US street address for coverage check)
   - Example: `123 Main St, Dallas, TX 75201`
3. Click **Save** (or the equivalent CTA)
4. The dashboard should confirm the address is saved and delivery is enabled

> ✅ **Expected result:** Address saves successfully. Dashboard shows delivery as "Active."

---

## Step 3: Add a Product to Cart & Go to Checkout

1. Open your development store's storefront
2. Add any product to the cart
3. Proceed to checkout
4. Enter a **US delivery address** in the same city as your pickup address
5. Navigate to the **Shipping** step

> ✅ **Expected result:** "Storree Local Delivery" appears as a shipping option.

### ⚠️ Important Note on Carrier Services

Shopify's **carrier-calculated shipping** (required for Storree's shipping option to appear natively at checkout) requires the **Shopify Advanced plan or higher** on production stores.

**On development stores** or standard plan stores, use this alternative flow:
1. Customer selects any shipping option at checkout
2. Customer completes order
3. Merchant receives order in Storree dashboard
4. Merchant (or Storree auto-dispatch) initiates the delivery from the dashboard

For the purposes of app review, the delivery dispatch and tracking flow can be demonstrated via the merchant dashboard even if the checkout carrier option is not visible on a development store's standard plan.

---

## Step 4: Complete a Test Order

1. Select the "Storree Local Delivery" shipping option (or complete checkout with standard shipping for the alternative flow)
2. Enter test payment details:
   - Card: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits
3. Complete the order

> ✅ **Expected result:** Order is placed successfully. Order appears in the Storree merchant dashboard.

---

## Step 5: Verify Delivery Dispatch

1. In the Storree merchant dashboard, locate the new order
2. Confirm the order shows as "Pending" or "Dispatching"
3. In test/demo mode, a simulated courier is assigned

> ✅ **Expected result:** Order status updates in the dashboard. Dispatch is initiated.

---

## Step 6: Verify Tracking Page

1. After dispatch, check for a tracking link in:
   - The customer confirmation email, OR
   - The SMS sent to the test phone number provided at checkout
2. The tracking URL format: `https://stylere.app/shopify/tracking/{orderId}`
3. Open the tracking page

> ✅ **Expected result:** Tracking page loads with order details. Map shows courier location (simulated in test mode).

---

## Step 7: Uninstall Instructions

1. From your Shopify Admin, navigate to **Settings → Apps and sales channels**
2. Find **Storree: Local Fashion Delivery**
3. Click the three-dot menu → **Delete**
4. Confirm the uninstall

> ✅ **Expected result:** App uninstalls cleanly. The "Storree Local Delivery" shipping option is removed from checkout. No residual code or settings left in the store.

---

## Test Credentials

| Field | Value |
|---|---|
| Support email | ryan@stylere.app |
| Support phone | (346) 475-5016 |
| Merchant dashboard | https://stylere.app/shopify |
| Privacy policy | https://stylere.app/shopify/privacy |
| Terms of service | https://stylere.app/shopify/terms |
| Support page | https://stylere.app/shopify/support |

> If the review team needs a pre-installed demo account or test store credentials, please contact ryan@stylere.app and we will provide them within 1 business day.

---

## Known Limitations in Review Environment

| Limitation | Details |
|---|---|
| Real courier dispatch | In test mode, courier dispatch uses a simulated driver — no real delivery occurs |
| SMS notifications | Test SMS may not deliver to all carriers; contact support if not received |
| Carrier-calculated shipping | Requires Advanced plan on non-development stores |
