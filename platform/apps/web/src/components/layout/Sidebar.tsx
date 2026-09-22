'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Award, BookOpen, Calendar, ClipboardCheck, History, Home, Layers, Shapes, UserCheck, Users, X } from 'lucide-react';
import { UserRole } from '@dojo-hub/shared';
import DojoHubLogo from '../DojoHubLogo';
import { cn } from '../ui/cn';
import { useSlidingIndicator } from '../ui/useSlidingIndicator';

interface NavItem {
  href: string;
  name: string;
  icon: typeof Home;
  badge?: number;
}

const ROLE_LABEL: Record<UserRole, string> = {
  STUDENT: 'Student',
  ADMIN: 'Platform Admin',
  EVALUATOR: 'Senior Supervisor',
};

export function Sidebar({
  role,
  pendingCount = 0,
  credentialsCount = 0,
  mobileOpen = false,
  onMobileClose,
}: {
  role: UserRole;
  pendingCount?: number;
  credentialsCount?: number;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();
  const { registerItem, focusItem, release, indicatorStyle } = useSlidingIndicator('vertical');

  useEffect(() => {
    onMobileClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const navigationItems: Record<UserRole, NavItem[]> = {
    STUDENT: [
      { href: '/home', name: 'Home', icon: Home },
      { href: '/learning', name: 'My Learning', icon: BookOpen },
      { href: '/certificates', name: 'My Certificates', icon: Award },
      // Office Hours — hidden for now to keep the app simple. The page and API
      // remain in place; uncomment to re-enable.
      // { href: '/office-hours', name: 'Office Hours', icon: Calendar },
    ],
    ADMIN: [
      { href: '/metrics', name: 'Platform Metrics', icon: Activity },
      { href: '/users', name: 'User Directory', icon: Users },
      { href: '/curriculum', name: 'Curriculum Builder', icon: Layers },
      { href: '/enrolment-requests', name: 'Enrolment Requests', icon: UserCheck },
      { href: '/settings', name: 'Categories & Levels', icon: Shapes },
      { href: '/audit-log', name: 'Audit Log', icon: History },
    ],
    EVALUATOR: [
      { href: '/queue', name: 'Grading Queue', icon: ClipboardCheck, badge: pendingCount || undefined },
      { href: '/insights', name: 'Student Insights', icon: Activity },
      // Office Hours — hidden for now to keep the app simple. The page and API
      // remain in place; uncomment to re-enable.
      // { href: '/evaluator-office-hours', name: 'Office Hours', icon: Calendar },
    ],
  };

  const items = navigationItems[role] ?? [];

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-navy-950/60 backdrop-blur-sm z-30 lg:hidden animate-fadeIn"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'w-72 bg-navy-950 text-white flex flex-col fixed top-0 bottom-0 left-0 z-40 border-r border-white/[0.06] shadow-2xl shadow-black/40 transition-transform duration-300 ease-out',
          'lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
      {/* Brand header */}
      <div className="relative p-5 flex items-center gap-3 overflow-hidden">
        <div className="absolute inset-x-0 -top-16 h-32 bg-crimson-600/15 blur-3xl rounded-full pointer-events-none" />
        {/* The brand is the way back out to the public site. Without it the landing page
            was only reachable by editing the URL, which is the convention every product
            follows for a reason. */}
        <Link
          href="/"
          title="Go to the Dojo Hub Learning Platform home page"
          className="relative flex-1 flex items-center gap-3 min-w-0 rounded-xl -m-1 p-1 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-500/60"
        >
          <span className="p-1.5 bg-white rounded-xl shadow-lg flex items-center justify-center shrink-0">
            <DojoHubLogo size={34} />
          </span>
          <span className="min-w-0">
            <span className="block font-extrabold text-xl tracking-tight text-white leading-none group-hover:text-crimson-100 transition-colors">
              DOJO <span className="text-crimson-500">HUB</span>
            </span>
            <span className="block text-[12px] font-mono text-navy-300 tracking-[0.15em] uppercase mt-0.5">
              Learning Platform
            </span>
          </span>
        </Link>
        <button
          onClick={onMobileClose}
          aria-label="Close navigation menu"
          className="relative lg:hidden p-1.5 rounded-lg text-navy-300 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-500/60"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="h-px mx-5 bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Role indicator */}
      <div className="mx-4 mt-4 glass-dark rounded-xl px-4 py-3">
        <span className="text-[12px] font-mono text-navy-300 uppercase block tracking-[0.15em]">Active Security Shell</span>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-crimson-500 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-crimson-500" />
          </span>
          <span className="text-base font-semibold text-white tracking-tight">{ROLE_LABEL[role]}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="relative flex-1 px-4 py-6 overflow-y-auto" onMouseLeave={release} aria-label="Primary navigation">
        <p className="text-[12px] font-mono text-navy-500 uppercase tracking-[0.15em] px-3 mb-2.5">Navigation Directory</p>

        <div className="relative">
          {/* sliding hover pill */}
          <div
            className="slide-indicator absolute left-0 right-0 rounded-lg bg-white/[0.06] border border-white/[0.08] pointer-events-none"
            style={indicatorStyle}
          />

          <div className="relative space-y-1">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  ref={registerItem(item.href)}
                  href={item.href}
                  onMouseEnter={() => focusItem(item.href)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative w-full flex items-center justify-between px-3.5 py-3.5 rounded-lg text-base font-medium transition-colors duration-200 group',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950',
                    isActive ? 'text-white' : 'text-navy-300 hover:text-white',
                  )}
                >
                  {isActive && (
                    <span className="absolute inset-0 rounded-lg bg-gradient-to-r from-crimson-600 to-crimson-600/90 shadow-lg shadow-crimson-900/30" />
                  )}
                  {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-white" />}
                  <div className="relative flex items-center gap-3">
                    <Icon
                      className={cn(
                        'w-[21px] h-[21px] shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3',
                        isActive ? 'text-white' : 'text-navy-400 group-hover:text-crimson-500',
                      )}
                    />
                    <span className="tracking-tight">{item.name}</span>
                  </div>
                  {!!item.badge && (
                    <span
                      className={cn(
                        'relative text-[12px] px-2 py-0.5 rounded-full font-mono font-bold',
                        isActive ? 'bg-white text-crimson-600' : 'bg-crimson-600/20 text-crimson-400 border border-crimson-500/30',
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="m-4 mt-0 glass-dark rounded-xl p-4 text-xs text-navy-300 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[12px] tracking-wide">Engine Node</span>
          <span className="font-mono text-[12px] text-emerald-400 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> ONLINE
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[12px] tracking-wide">Active Credentials</span>
          <span className="font-mono text-[12px] text-crimson-400 font-bold">{credentialsCount}</span>
        </div>
        <p className="text-[12px] text-center text-navy-500 pt-2.5 mt-1.5 border-t border-white/[0.06]">© 2026 Dojo Hub (SMC)</p>
      </div>
      </aside>
    </>
  );
}
