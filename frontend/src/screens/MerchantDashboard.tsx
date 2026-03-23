import React, { useEffect, useState } from 'react';

const SHOPIFY_API = import.meta.env.VITE_SHOPIFY_API_URL || 'https://api-production-653e.up.railway.app';
const SHOP_DOMAIN = new URLSearchParams(window.location.search).get('shop') || 
  import.meta.env.VITE_SHOP_DOMAIN || 'cxrxht-v1.myshopify.com';

interface OnboardingStatus {
  appInstalled: boolean;
  tokenPresent: boolean;
  oauthValid: boolean;
  carrierServiceRegistered: boolean;
  pickupLocationConfigured: boolean;
  merchantConfigComplete: boolean;
  dispatchConnectivityOk: boolean;
  locations: Array<{ id: string; name: string; active: boolean; address1: string | null; city: string | null }>;
  reasons: string[];
}

interface MerchantConfig {
  pickupLat: string;
  pickupLng: string;
  radiusKm: string;
  baseFeeCents: string;
  timezone: string;
}

export const MerchantDashboard: React.FC = () => {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [config, setConfig] = useState<MerchantConfig>({
    pickupLat: '32.7341',
    pickupLng: '-96.8172',
    radiusKm: '16',
    baseFeeCents: '999',
    timezone: 'America/Chicago',
  });

  useEffect(() => {
    fetch(`${SHOPIFY_API}/shopify/onboarding/status?shop=${SHOP_DOMAIN}`)
      .then(r => r.json())
      .then(d => { setStatus(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${SHOPIFY_API}/merchant/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: SHOP_DOMAIN.replace('.myshopify.com', ''),
          shopDomain: SHOP_DOMAIN,
          storreeMerchantId: SHOP_DOMAIN.replace('.myshopify.com', ''),
          pickupLocation: { lat: parseFloat(config.pickupLat), lng: parseFloat(config.pickupLng) },
          radiusKm: parseFloat(config.radiusKm),
          oneHourEnabled: true,
          sameDayEnabled: true,
          oneHourCutoffHourLocal: 19,
          sameDayCutoffHourLocal: 15,
          baseFeeCents: parseInt(config.baseFeeCents),
          pricePerKmCents: 75,
          platformMarkupPercent: 15,
          timezone: config.timezone,
          isActive: true,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // Refresh status
      const res = await fetch(`${SHOPIFY_API}/shopify/onboarding/status?shop=${SHOP_DOMAIN}`);
      setStatus(await res.json());
    } finally {
      setSaving(false);
    }
  };

  const StatusDot = ({ ok }: { ok: boolean }) => (
    <span className={`inline-block w-2.5 h-2.5 rounded-full mr-2 ${ok ? 'bg-green-500' : 'bg-red-400'}`} />
  );

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#F97316] to-[#EA6B0E] text-white px-6 pt-10 pb-8">
        <div className="text-2xl font-bold tracking-tight mb-1">Style.re</div>
        <div className="text-white/80 text-sm">Local Delivery · Merchant Dashboard</div>
        <div className="mt-3 text-xs text-white/60 font-mono">{SHOP_DOMAIN}</div>
      </div>

      <div className="px-5 py-6 space-y-5">

        {/* Status Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#F5F5F4] p-5">
          <h2 className="font-bold text-[#1C1917] text-base mb-4">System Status</h2>
          {loading ? (
            <div className="text-sm text-[#78716C]">Loading...</div>
          ) : status ? (
            <div className="space-y-2 text-sm">
              <div><StatusDot ok={status.appInstalled} /><span>App Installed</span></div>
              <div><StatusDot ok={status.oauthValid} /><span>OAuth Valid</span></div>
              <div><StatusDot ok={status.dispatchConnectivityOk} /><span>Dispatch Connected</span></div>
              <div><StatusDot ok={status.pickupLocationConfigured} /><span>Pickup Location Set</span></div>
              <div><StatusDot ok={status.carrierServiceRegistered} /><span>Carrier Service Active</span></div>
              {status.reasons.length > 0 && (
                <div className="mt-3 p-3 bg-amber-50 rounded-xl text-xs text-amber-700 space-y-1">
                  {status.reasons.map((r, i) => <div key={i}>⚠️ {r}</div>)}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-red-500">Could not load status</div>
          )}
        </div>

        {/* Store Locations */}
        {status?.locations && status.locations.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-[#F5F5F4] p-5">
            <h2 className="font-bold text-[#1C1917] text-base mb-3">Store Locations</h2>
            {status.locations.map(loc => (
              <div key={loc.id} className="flex items-center gap-3 text-sm">
                <span className={`w-2 h-2 rounded-full ${loc.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                <div>
                  <div className="font-medium text-[#1C1917]">{loc.name}</div>
                  {loc.address1 && <div className="text-[#78716C] text-xs">{loc.address1}, {loc.city}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Config Form */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#F5F5F4] p-5">
          <h2 className="font-bold text-[#1C1917] text-base mb-4">Delivery Configuration</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[#78716C] mb-1 block">Pickup Latitude</label>
                <input
                  className="w-full border border-[#E7E5E4] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]"
                  value={config.pickupLat}
                  onChange={e => setConfig(c => ({ ...c, pickupLat: e.target.value }))}
                  placeholder="32.7341"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#78716C] mb-1 block">Pickup Longitude</label>
                <input
                  className="w-full border border-[#E7E5E4] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]"
                  value={config.pickupLng}
                  onChange={e => setConfig(c => ({ ...c, pickupLng: e.target.value }))}
                  placeholder="-96.8172"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-[#78716C] mb-1 block">Delivery Radius (km)</label>
              <input
                className="w-full border border-[#E7E5E4] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]"
                value={config.radiusKm}
                onChange={e => setConfig(c => ({ ...c, radiusKm: e.target.value }))}
                placeholder="16"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#78716C] mb-1 block">Base Delivery Fee (cents)</label>
              <input
                className="w-full border border-[#E7E5E4] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]"
                value={config.baseFeeCents}
                onChange={e => setConfig(c => ({ ...c, baseFeeCents: e.target.value }))}
                placeholder="999"
              />
              <div className="text-xs text-[#78716C] mt-1">${(parseInt(config.baseFeeCents || '0') / 100).toFixed(2)} base fee</div>
            </div>
            <div>
              <label className="text-xs font-medium text-[#78716C] mb-1 block">Timezone</label>
              <select
                className="w-full border border-[#E7E5E4] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]"
                value={config.timezone}
                onChange={e => setConfig(c => ({ ...c, timezone: e.target.value }))}
              >
                <option value="America/Chicago">Central (Chicago)</option>
                <option value="America/New_York">Eastern (New York)</option>
                <option value="America/Los_Angeles">Pacific (Los Angeles)</option>
                <option value="America/Denver">Mountain (Denver)</option>
              </select>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-[#F97316] text-white font-bold py-3 rounded-2xl text-sm disabled:opacity-60 transition-opacity"
            >
              {saving ? 'Saving...' : saved ? '✅ Saved!' : 'Save Configuration'}
            </button>
          </div>
        </div>

        {/* Checkout Integration Info */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#F5F5F4] p-5">
          <h2 className="font-bold text-[#1C1917] text-base mb-3">Checkout Integration</h2>
          <div className="space-y-3 text-sm text-[#57534E]">
            <div className="p-3 bg-amber-50 rounded-xl text-xs text-amber-700">
              <strong>⚠️ Carrier Service Requirement:</strong> Injecting Storree into Shopify checkout requires Shopify Advanced or Plus plan. Development stores are also eligible.
            </div>
            <div className="p-3 bg-blue-50 rounded-xl text-xs text-blue-700">
              <strong>✅ Any Plan — Direct Link Flow:</strong> Share the Storree ordering link with customers. They order directly, pay via Stripe, and a DoorDash courier is dispatched automatically.
            </div>
            <div className="flex items-center justify-between text-xs font-medium text-[#57534E] mt-2">
              <span>Customer Ordering Link:</span>
            </div>
            <div className="bg-[#F5F5F4] rounded-lg p-2 font-mono text-xs break-all text-[#1C1917]">
              https://stylere.app/shopify?shop={SHOP_DOMAIN}
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`https://stylere.app/shopify?shop=${SHOP_DOMAIN}`);
              }}
              className="w-full py-2 text-xs font-medium bg-[#F97316] text-white rounded-xl"
            >
              Copy Link
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#F5F5F4] p-5">
          <h2 className="font-bold text-[#1C1917] text-base mb-3">Quick Links</h2>
          <div className="space-y-2 text-sm">
            <a
              href={`${SHOPIFY_API}/shopify/onboarding/status?shop=${SHOP_DOMAIN}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between text-[#F97316] font-medium"
            >
              View Full Status <span>→</span>
            </a>
            <a
              href={`${SHOPIFY_API}/shopify/checkout-capability?shop=${SHOP_DOMAIN}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between text-[#F97316] font-medium"
            >
              Checkout Capability Check <span>→</span>
            </a>
            <a
              href="https://stylere.app"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between text-[#F97316] font-medium"
            >
              Style.re Platform <span>→</span>
            </a>
          </div>
        </div>

        <div className="text-center text-xs text-[#A8A29E] pb-6">
          Powered by Style.re Local Delivery · v1.0
        </div>
      </div>
    </div>
  );
};
