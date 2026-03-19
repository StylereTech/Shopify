import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  showBack?: boolean;
  showNav?: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  title,
  showBack = false,
  showNav = true,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/', icon: HomeIcon, label: 'Home' },
    { path: '/orders', icon: ListIcon, label: 'Orders' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAF9] max-w-md mx-auto">
      {/* Header */}
      <header className="bg-white border-b border-[#E7E5E4] sticky top-0 z-50">
        <div className="flex items-center px-4 py-3 gap-3">
          {showBack && (
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 rounded-xl hover:bg-[#FAFAF9] transition-colors text-[#78716C]"
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="flex-1 flex items-center gap-2">
            {!title && (
              <span className="font-bold text-xl text-[#F97316] tracking-tight">Style.re</span>
            )}
            {title && (
              <h1 className="font-semibold text-[#1C1917] text-base">{title}</h1>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom Nav */}
      {showNav && (
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-[#E7E5E4] px-6 py-2 flex items-center justify-around z-50">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = location.pathname === path ||
              (path !== '/' && location.pathname.startsWith(path));
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition-colors ${
                  active ? 'text-[#F97316]' : 'text-[#78716C]'
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
  <svg width="22" height="22" fill={active ? '#F97316' : 'none'} viewBox="0 0 24 24"
    stroke={active ? '#F97316' : 'currentColor'} strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline strokeLinecap="round" strokeLinejoin="round" points="9 22 9 12 15 12 15 22" />
  </svg>
);

const ListIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg width="22" height="22" fill="none" viewBox="0 0 24 24"
    stroke={active ? '#F97316' : 'currentColor'} strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
);
