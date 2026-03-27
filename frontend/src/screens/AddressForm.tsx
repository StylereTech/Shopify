import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrderStore } from '../store/orderStore';
import { AppShell } from '../components/layout/AppShell';
import { Button, Input, Textarea, Card } from '../components/ui';
import type { Address } from '../types';

interface FormErrors {
  pickupStreet?: string;
  pickupCity?: string;
  pickupState?: string;
  pickupZip?: string;
  dropoffStreet?: string;
  dropoffCity?: string;
  dropoffState?: string;
  dropoffZip?: string;
  name?: string;
  phone?: string;
  email?: string;
}

const PinIcon = ({ color = 'white' }: { color?: string }) => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <circle cx="12" cy="11" r="3" />
  </svg>
);

export const AddressForm: React.FC = () => {
  const navigate = useNavigate();
  const {
    draft,
    setPickupAddress,
    setDropoffAddress,
    setContact,
    setNotes,
  } = useOrderStore();

  const [errors, setErrors] = useState<FormErrors>({});

  const pickup = draft.pickupAddress ?? {};
  const dropoff = draft.dropoffAddress ?? {};
  const contact = draft.contact ?? {};

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!pickup.street) newErrors.pickupStreet = 'Street address required';
    if (!pickup.city) newErrors.pickupCity = 'City required';
    if (!pickup.state) newErrors.pickupState = 'State required';
    if (!pickup.zip) newErrors.pickupZip = 'ZIP code required';

    if (!dropoff.street) newErrors.dropoffStreet = 'Street address required';
    if (!dropoff.city) newErrors.dropoffCity = 'City required';
    if (!dropoff.state) newErrors.dropoffState = 'State required';
    if (!dropoff.zip) newErrors.dropoffZip = 'ZIP code required';

    if (!contact.name) newErrors.name = 'Name required';
    if (!contact.phone) newErrors.phone = 'Phone required';
    if (!contact.email) newErrors.email = 'Email required';
    else if (!/\S+@\S+\.\S+/.test(contact.email)) newErrors.email = 'Invalid email';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validate()) {
      navigate('/summary');
    }
  };

  const updatePickup = (field: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPickupAddress({ [field]: e.target.value });

  const updateDropoff = (field: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDropoffAddress({ [field]: e.target.value });

  return (
    <AppShell showBack showNav={false} step={1} totalSteps={4}>
      <div className="px-5 py-6 flex flex-col gap-5">

        {/* Pickup Address */}
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-full bg-[#E8621A] flex items-center justify-center flex-shrink-0">
              <PinIcon />
            </div>
            <div>
              <h2 className="font-bold text-[#1C1917] text-[15px]">Pickup Location</h2>
              <p className="text-[12px] text-[#A8A29E]">Where we pick up your order</p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Input
              label="Street Address"
              placeholder="123 Main St"
              value={pickup.street ?? ''}
              onChange={updatePickup('street')}
              error={errors.pickupStreet}
              required
            />
            <Input
              label="Unit / Suite"
              placeholder="Apt 4B (optional)"
              value={pickup.unit ?? ''}
              onChange={updatePickup('unit')}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="City"
                placeholder="Dallas"
                value={pickup.city ?? ''}
                onChange={updatePickup('city')}
                error={errors.pickupCity}
                required
              />
              <Input
                label="State"
                placeholder="TX"
                value={pickup.state ?? ''}
                onChange={updatePickup('state')}
                error={errors.pickupState}
                required
                maxLength={2}
              />
            </div>
            <Input
              label="ZIP Code"
              placeholder="75201"
              value={pickup.zip ?? ''}
              onChange={updatePickup('zip')}
              error={errors.pickupZip}
              required
              maxLength={10}
            />
          </div>
        </Card>

        {/* Route divider */}
        <div className="flex items-center gap-3 px-2">
          <div className="flex-1 border-l-2 border-dashed border-[#EEEBE8] ml-4 h-6" />
          <div className="w-8 h-8 rounded-full bg-[#1C1917] flex items-center justify-center shadow-md flex-shrink-0">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          <div className="flex-1 border-l-2 border-dashed border-[#EEEBE8] ml-4 h-6" />
        </div>

        {/* Drop-off Address */}
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-full bg-[#1C1917] flex items-center justify-center flex-shrink-0">
              <PinIcon />
            </div>
            <div>
              <h2 className="font-bold text-[#1C1917] text-[15px]">Drop-off Location</h2>
              <p className="text-[12px] text-[#A8A29E]">Where we deliver your order</p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Input
              label="Street Address"
              placeholder="456 Elm St"
              value={dropoff.street ?? ''}
              onChange={updateDropoff('street')}
              error={errors.dropoffStreet}
              required
            />
            <Input
              label="Unit / Suite"
              placeholder="Apt 2A (optional)"
              value={dropoff.unit ?? ''}
              onChange={updateDropoff('unit')}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="City"
                placeholder="Dallas"
                value={dropoff.city ?? ''}
                onChange={updateDropoff('city')}
                error={errors.dropoffCity}
                required
              />
              <Input
                label="State"
                placeholder="TX"
                value={dropoff.state ?? ''}
                onChange={updateDropoff('state')}
                error={errors.dropoffState}
                required
                maxLength={2}
              />
            </div>
            <Input
              label="ZIP Code"
              placeholder="75203"
              value={dropoff.zip ?? ''}
              onChange={updateDropoff('zip')}
              error={errors.dropoffZip}
              required
              maxLength={10}
            />
          </div>
        </Card>

        {/* Contact Info */}
        <Card>
          <h2 className="font-bold text-[#1C1917] text-[15px] mb-5">Contact Information</h2>
          <div className="flex flex-col gap-3">
            <Input
              label="Full Name"
              placeholder="Jane Smith"
              value={contact.name ?? ''}
              onChange={(e) => setContact({ name: e.target.value })}
              error={errors.name}
              required
            />
            <Input
              label="Phone Number"
              placeholder="+1 (214) 555-0100"
              value={contact.phone ?? ''}
              onChange={(e) => setContact({ phone: e.target.value })}
              error={errors.phone}
              type="tel"
              required
            />
            <Input
              label="Email"
              placeholder="jane@example.com"
              value={contact.email ?? ''}
              onChange={(e) => setContact({ email: e.target.value })}
              error={errors.email}
              type="email"
              required
            />
          </div>
        </Card>

        {/* Notes */}
        <Card>
          <h2 className="font-bold text-[#1C1917] text-[15px] mb-4">Delivery Notes</h2>
          <Textarea
            placeholder="Gate code, fragile items, special instructions…"
            value={draft.notes ?? ''}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Card>

        <Button size="lg" fullWidth onClick={handleNext}>
          Continue →
        </Button>

        <p className="text-center text-[11px] text-[#C4BFB9] -mt-2">
          Step 1 of 4 · Delivery details
        </p>
      </div>
    </AppShell>
  );
};
