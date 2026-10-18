# Style.re merchant branding

The user approved **Style.re throughout** for the embedded Shopify merchant pages. This source update replaces displayed Storree names in the merchant landing, sign-in, signup, plans and order detail headers, plus the application name in the shared terms and privacy introductions. The existing Style.re logos, dashboard and customer shell already use the approved name.

Seven screen files changed. A case-insensitive scan of frontend source finds no remaining Storree display copy. Internal backend/package identities and provider configuration are not display branding and are preserved. The approved retention period remains 90 days after each completed order.

Verification: all 75 existing merchant/customer/payment callback checks passed with zero failures/skips; frontend lint and the TypeScript/Vite production build passed. This is a source and compiler check. Browser appearance, actual Shopify installation/listing identity, provider acceptance and deployment remain unverified. The main website's separately compiled `/shopify` copy must be rebuilt from this reviewed source before the branding appears there.
