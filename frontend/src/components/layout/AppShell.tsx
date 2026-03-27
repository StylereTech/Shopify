import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import stylereLogoUrl from '../../assets/stylere_logo.jpg';

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  showBack?: boolean;
  showNav?: boolean;
  step?: number;      // 1–4 for customer flow progress
  totalSteps?: number;
}

const STEPS = ['Delivery', 'Summary', 'Payment', 'Done'];

export const AppShell: React.FC<AppShellProps> = ({
  children,
  title,
  showBack = false,
  showNav = true,
  step,
  totalSteps = 4,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/', icon: HomeIcon, label: 'Home' },
    { path: '/orders', icon: ListIcon, label: 'Orders' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F7] max-w-md mx-auto">
      {/* Header */}
      <header className="bg-white border-b border-[#EEEBE8] sticky top-0 z-50">
        <div className="flex items-center px-4 h-14 gap-3">
          {showBack && (
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-1 rounded-xl hover:bg-[#FAF9F7] transition-colors text-[#78716C] min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Go back"
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="flex-1 flex items-center gap-2">
            {!title && (
              <img src={stylereLogoUrl} alt="Style.re" className="h-8 w-auto rounded-lg object-contain" />
            )}
            {title && (
              <h1 className="font-semibold text-[#1C1917] text-base">{title}</h1>
            )}
          </div>
        </div>

        {/* Progress indicator for customer flow */}
        {step && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-1.5 mb-2">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full flex-1 transition-all duration-300 ${
                    i < step ? 'bg-[#E8621A]' : 'bg-[#EEEBE8]'
                  }`}
                />
              ))}
            </div>
            <div className="flex justify-between">
              {STEPS.slice(0, totalSteps).map((label, i) => (
                <span
                  key={label}
                  className={`text-[10px] font-medium ${
                    i + 1 === step ? 'text-[#E8621A]' : i + 1 < step ? 'text-[#78716C]' : 'text-[#C4BFB9]'
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-24">
        {children}
      </main>

      {/* Bottom Nav */}
      {showNav && (
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-[#EEEBE8] px-6 py-2 flex items-center justify-around z-50">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = location.pathname === path ||
              (path !== '/' && location.pathname.startsWith(path));
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-colors min-h-[44px] min-w-[44px] ${
                  active ? 'text-[#E8621A]' : 'text-[#78716C]'
                }`}
              >
                <Icon active={active} />
                <span className="text-xs font-medium">{label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
};

const HomeIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg width="22" height="22" fill={active ? '#E8621A' : 'none'} viewBox="0 0 24 24"
    stroke={active ? '#E8621A' : 'currentColor'} strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline strokeLinecap="round" strokeLinejoin="round" points="9 22 9 12 15 12 15 22" />
  </svg>
);

const ListIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg width="22" height="22" fill="none" viewBox="0 0 24 24"
    stroke={active ? '#E8621A' : 'currentColor'} strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
);
