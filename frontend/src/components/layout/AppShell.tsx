import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import stylereLogoUrl from '../../assets/stylere_logo.jpg';
import '../../screens/customer-pages.css';

interface AppShellProps {
  children: ReactNode; title?: string; showBack?: boolean; backTo?: string;
  showNav?: boolean; step?: number; totalSteps?: number;
}
const STEPS = ['Delivery', 'Review', 'Payment', 'Confirmation'];

export function AppShell({ children, title, showBack = false, backTo = '/order', showNav = true, step, totalSteps = 4 }: AppShellProps) {
  const { pathname } = useLocation();
  return <div className="customer-app">
    <a className="customer-skip" href="#customer-content">Skip to content</a>
    <header className="customer-header">
      <div className="customer-header-row">
        {showBack && <Link className="customer-back" to={backTo} aria-label="Back to previous step">←</Link>}
        <Link to="/order" aria-label="Style.re customer home"><img src={stylereLogoUrl} alt="Style.re" width="110" height="40" /></Link>
        <Link className="customer-help" to="/support">Help</Link>
      </div>
      {step && <ol className="customer-progress" aria-label="Checkout progress">
        {STEPS.slice(0, totalSteps).map((label, index) => <li key={label} aria-current={index + 1 === step ? 'step' : undefined} data-complete={index + 1 < step}>
          <span aria-hidden="true">{index + 1}</span>{label}
        </li>)}
      </ol>}
    </header>
    <main id="customer-content" className="customer-main" tabIndex={-1}>
      {title && <h1>{title}</h1>}{children}
    </main>
    <footer className="customer-footer"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/merchant-landing">For retailers</Link></footer>
    {showNav && <nav className="customer-nav" aria-label="Customer navigation">
      <Link to="/order" aria-current={pathname === '/order' ? 'page' : undefined}>New delivery</Link>
      <Link to="/orders" aria-current={pathname === '/orders' ? 'page' : undefined}>Your orders</Link>
    </nav>}
  </div>;
}