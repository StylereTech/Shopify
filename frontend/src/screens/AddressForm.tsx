import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { SessionNotice } from '../components/customer/CustomerUI';
import { Input, Textarea } from '../components/ui';
import { useCustomerSession } from '../context/useCustomerSession';
import { useOrderStore } from '../store/orderStore';
import { customerDraftPayload } from '../lib/customerContracts';
import { customerErrorMessage, orderPath } from '../lib/customerPageState';
import type { Address } from '../types';

export function AddressForm() {
  const session = useCustomerSession();
  return <AppShell title="Delivery details" showBack backTo="/order" showNav={false} step={1}><SessionNotice session={session} />{session.status === 'ready' && <DeliveryForm key={session.key} current={session.current} />}</AppShell>;
}
function DeliveryForm({ current }: { current: () => boolean }) {
  const navigate = useNavigate();
  const { draft, checkoutRequest, setServiceType, setPickupAddress, setDropoffAddress, setContact, setItems, setNotes } = useOrderStore();
  const [error, setError] = useState('');
  if (checkoutRequest) return <div className="customer-notice" data-tone="info"><p>Recover your saved request before editing its details.</p><Link className="customer-button" to="/summary">Recover request</Link></div>;
  if (draft.orderId) return <div className="customer-notice"><p>These details belong to a saved order. Review it or start a new delivery from the customer home.</p><Link className="customer-button" to={orderPath('summary', draft.orderId)}>Review saved order</Link><Link to="/order">Customer home</Link></div>;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!current() || useOrderStore.getState().checkoutRequest) return;
    try {
      const payload = customerDraftPayload({ ...draft, serviceType: draft.serviceType ?? 'item_delivery', pickupAddress: { ...draft.pickupAddress, country: 'US', unit: draft.pickupAddress?.unit?.trim() || undefined }, dropoffAddress: { ...draft.dropoffAddress, country: 'US', unit: draft.dropoffAddress?.unit?.trim() || undefined } });
      setServiceType(payload.serviceType!); setPickupAddress(payload.pickupAddress!); setDropoffAddress(payload.dropoffAddress!); setContact(payload.contact!);
      setItems(payload.items ?? []); setNotes(payload.notes ?? '');
      navigate('/summary');
    } catch (caught) { setError(customerErrorMessage(caught)); }
  };
  const contact = draft.contact ?? {};
  return <form className="customer-stack" onSubmit={submit}>
    <p className="customer-muted">All addresses must be in the United States. Required fields are marked with an asterisk.</p>
    {error && <p className="customer-notice" data-tone="error" role="alert">{error}</p>}
    <AddressFields title="Pickup location" section="pickup" address={draft.pickupAddress ?? {}} update={setPickupAddress} />
    <AddressFields title="Delivery destination" section="destination" address={draft.dropoffAddress ?? {}} update={setDropoffAddress} />
    <fieldset className="customer-fieldset customer-card"><legend>Contact information</legend>
      <Input label="Full name" autoComplete="name" required maxLength={120} value={contact.name ?? ''} onChange={event => setContact({ name: event.target.value })} />
      <Input label="US phone number" type="tel" autoComplete="tel" required maxLength={30} hint="Include the area code. A US country code (+1) is optional." value={contact.phone ?? ''} onChange={event => setContact({ phone: event.target.value })} />
      <Input label="Email" type="email" autoComplete="email" required maxLength={254} value={contact.email ?? ''} onChange={event => setContact({ email: event.target.value })} />
    </fieldset>
    <section className="customer-card"><h2>Pickup instructions</h2><Textarea label="Delivery notes (optional)" maxLength={1000} hint="Include store order or pickup instructions. Do not include payment details or passwords." value={draft.notes ?? ''} onChange={event => setNotes(event.target.value)} /></section>
    <button className="customer-button" type="submit">Review delivery details</button>
  </form>;
}
function AddressFields({ title, section, address, update }: { title: string; section: string; address: Partial<Address>; update: (value: Partial<Address>) => void }) {
  return <fieldset className="customer-fieldset customer-card"><legend>{title}</legend>
    <Input label="Street address" autoComplete={'section-' + section + ' address-line1'} maxLength={200} required value={address.street ?? ''} onChange={event => update({ street: event.target.value, country: 'US' })} />
    <Input label="Apartment, unit or suite (optional)" autoComplete={'section-' + section + ' address-line2'} maxLength={80} value={address.unit ?? ''} onChange={event => update({ unit: event.target.value || undefined })} />
    <Input label="City" autoComplete={'section-' + section + ' address-level2'} maxLength={100} required value={address.city ?? ''} onChange={event => update({ city: event.target.value })} />
    <div className="customer-field-grid">
      <Input label="State abbreviation" autoComplete={'section-' + section + ' address-level1'} maxLength={2} minLength={2} pattern="[A-Za-z]{2}" placeholder="TX" required value={address.state ?? ''} onChange={event => update({ state: event.target.value.toUpperCase() })} />
      <Input label="ZIP code" autoComplete={'section-' + section + ' postal-code'} inputMode="numeric" maxLength={10} pattern="[0-9]{5}(-[0-9]{4})?" required value={address.zip ?? ''} onChange={event => update({ zip: event.target.value })} />
    </div>
  </fieldset>;
}
