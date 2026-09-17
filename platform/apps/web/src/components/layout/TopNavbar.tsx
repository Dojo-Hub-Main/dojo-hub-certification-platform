'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Bell, ChevronDown, LogOut, Menu, Settings } from 'lucide-react';
import { NotificationDto } from '@dojo-hub/shared';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import { cn } from '../ui/cn';

const ROLE_STATUS: Record<string, string> = {
  STUDENT: 'Certification Candidate',
  EVALUATOR: 'Senior Certification Supervisor',
  ADMIN: 'Platform Superuser',
};

const ROLE_COLOR: Record<string, string> = {
  STUDENT: 'bg-navy-800',
  EVALUATOR: 'bg-deep-black',
  ADMIN: 'bg-crimson-600',
};

export function TopNavbar({
  title,
  subtitle,
  onMenuClick,
}: {
  title: string;
  subtitle?: string;
  onMenuClick?: () => void;
}) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const { data: notifications = [] } = useQuery<NotificationDto[]>({
    queryKey: ['notifications'],
    queryFn: () => api.get<NotificationDto[]>('/notifications'),
    refetchInterval: 30_000,
    enabled: !!user,
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (!user) return null;

  const initials = user.name.split(' ').map((n) => n[0]).join('');

  return (
    <header className="h-20 bg-white/85 backdrop-blur-xl border-b border-black/[0.06] flex items-center justify-between gap-4 px-4 sm:px-8 sticky top-0 z-30">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 -ml-1 rounded-xl text-navy-500 hover:text-navy-950 hover:bg-black/[0.05] transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-500/50"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-extrabold text-deep-black tracking-tight truncate">{title}</h2>
          <p className="text-xs text-navy-500 mt-0.5 truncate hidden sm:block">{subtitle ?? 'Dojo Hub Learning Platform'}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen((v) => !v)}
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            aria-haspopup="true"
            aria-expanded={notifOpen}
            className={cn(
              'relative p-2.5 rounded-xl transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-500/50',
              notifOpen ? 'bg-navy-950 text-white' : 'hover:bg-black/[0.05] text-navy-500 hover:text-navy-950',
            )}
          >
            <Bell className="w-[18px] h-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-crimson-600 text-white text-[12px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 mt-3 w-80 bg-white/95 backdrop-blur-xl rounded-2xl border border-black/[0.06] shadow-2xl shadow-navy-950/10 z-50 overflow-hidden animate-slideUp">
              <div className="p-3.5 flex items-center justify-between border-b border-black/[0.05] bg-navy-950">
                <span className="text-xs font-bold text-white tracking-tight">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllRead.mutate()}
                    className="link-sweep text-[12px] font-semibold text-crimson-400 hover:text-crimson-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-500/50 rounded"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-black/[0.04]">
                {notifications.length === 0 && <p className="p-6 text-xs text-navy-400 text-center">No notifications yet.</p>}
                {notifications.slice(0, 20).map((n) => (
                  <div key={n.id} className={cn('p-3.5 text-xs transition-colors hover:bg-black/[0.02]', !n.read && 'bg-crimson-50/40')}>
                    <p className="font-bold text-navy-950">{n.title}</p>
                    <p className="text-navy-500 mt-0.5">{n.body}</p>
                    <p className="text-[12px] text-navy-400 mt-1.5 font-mono">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-8 bg-black/[0.06]" />

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setProfileOpen((v) => !v)}
            aria-label={`Account menu for ${user.name}`}
            aria-haspopup="true"
            aria-expanded={profileOpen}
            className={cn(
              'flex items-center gap-3 text-left p-1.5 pr-3 rounded-xl transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-500/50',
              profileOpen ? 'bg-black/[0.05]' : 'hover:bg-black/[0.04]',
            )}
          >
            <div className="relative">
              <div
                className={cn(
                  'w-10 h-10 rounded-full text-white flex items-center justify-center font-bold text-sm shadow-sm ring-2 ring-white transition-transform duration-300',
                  ROLE_COLOR[user.role],
                )}
              >
                {initials}
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
            </div>
            <div className="hidden lg:block leading-none">
              <p className="text-[12px] font-mono text-navy-400 font-bold uppercase tracking-wider">{ROLE_STATUS[user.role]}</p>
              <div className="flex items-center gap-1 mt-1">
                <h4 className="text-xs font-bold text-deep-black tracking-tight">{user.name}</h4>
                <ChevronDown className={cn('w-3 h-3 text-navy-400 transition-transform duration-300', profileOpen && 'rotate-180')} />
              </div>
            </div>
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-3 w-72 bg-white/95 backdrop-blur-xl rounded-2xl border border-black/[0.06] shadow-2xl shadow-navy-950/10 z-50 overflow-hidden divide-y divide-black/[0.05] animate-slideUp">
              <div className="p-4 flex gap-3 items-center bg-gradient-to-br from-navy-950 to-navy-900">
                <div className={cn('w-12 h-12 rounded-full text-white flex items-center justify-center font-bold text-base ring-2 ring-white/20', ROLE_COLOR[user.role])}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <h5 className="text-sm font-bold text-white truncate">{user.name}</h5>
                  <p className="text-[13px] text-navy-300 truncate">{user.email}</p>
                  <span className="inline-block bg-white/10 text-crimson-300 text-[12px] font-mono font-bold px-1.5 py-0.5 rounded mt-1.5 border border-white/10">
                    {ROLE_STATUS[user.role]}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setProfileOpen(false);
                  router.push('/account-settings');
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-xs text-navy-600 hover:bg-black/[0.03] hover:text-navy-950 font-semibold transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-crimson-500/50"
              >
                <Settings className="w-4 h-4" />
                <span>Account settings</span>
              </button>
              {(user.roles?.length ?? 0) > 1 && (
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    router.push('/choose-workspace?from=menu');
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-xs text-navy-600 hover:bg-black/[0.03] hover:text-navy-950 font-semibold transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-crimson-500/50"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  <span>Switch workspace</span>
                </button>
              )}
              <button
                onClick={async () => {
                  await logout();
                  router.replace('/login');
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-xs text-crimson-600 hover:bg-crimson-50 font-bold transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-crimson-500/50"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign out of secure session</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
