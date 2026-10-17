/** Customer checkout is guest scoped; legacy repository access is retained for non-customer integration callers. */
import { Router, type Request, type Response } from 'express';
import { InMemoryStorreeOrderRepository, type StorreeOrderRepository } from '../infrastructure/persistence/postgres-repositories.js';
export { createCustomerOrdersRouter as createOrdersRouter, createCustomerPaymentsRouter as createPaymentsRouter, setCustomerCheckoutRepository } from './customer-checkout.js';
let legacyRepository: StorreeOrderRepository = new InMemoryStorreeOrderRepository();
export function setStorreeOrderRepository(repository: StorreeOrderRepository): void { legacyRepository=repository; }
export function getStorreeOrderRepository(): StorreeOrderRepository { return legacyRepository; }
export function createStoresRouter(): Router {
  const router = Router();

  // GET /api/stores/nearby
  router.get('/stores/nearby', (req: Request, res: Response) => {
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

    // In production, query Style.re backend: GET https://api.stylere.app/api/stores
    // For now, return mock stores near Dallas
    const stores = [
      {
        id: 'store-1',
        name: 'Nordstrom NorthPark',
        address: { street: '100 NorthPark Center', city: 'Dallas', state: 'TX', zip: '75225', country: 'US' },
        distance: 2.3,
        phone: '+12145559001',
      },
      {
        id: 'store-2',
        name: 'Neiman Marcus Downtown',
        address: { street: '1618 Main St', city: 'Dallas', state: 'TX', zip: '75201', country: 'US' },
        distance: 1.1,
        phone: '+12145559002',
      },
      {
        id: 'store-3',
        name: 'Madewell Mockingbird',
        address: { street: '5307 E Mockingbird Ln', city: 'Dallas', state: 'TX', zip: '75206', country: 'US' },
        distance: 3.7,
        phone: '+12145559003',
      },
    ];

    return res.json(stores);
  });

  return router;
}
