import { useState, type ReactNode, type Ref } from 'react';
import { ChevronDown, LogIn, LogOut, UserRound, Users } from 'lucide-react';
import { Dropdown } from './Dropdown';
import { useAuth } from '../contexts/AuthContext';
import type { ViewId } from '../types';

interface ProfileMenuProps {
  onViewChange?: (view: ViewId) => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function ProfileMenu({ onViewChange }: ProfileMenuProps) {
  const { user, logout, notifications } = useAuth();
  const [open, setOpen] = useState(false);
  const pendingInvites = notifications.filter((n) => n.type === 'team_invitation' && !n.readAt).length;

  if (!user) return null;

  const menuItems: Array<{
    key: string;
    label: string;
    icon: ReactNode;
    onClick: () => void;
    tone?: 'default' | 'accent' | 'danger';
    trailing?: ReactNode;
    hidden?: boolean;
  }> = [
    {
      key: 'upgrade',
      label: 'Sign in or create account',
      icon: <LogIn size={15} strokeWidth={2} />,
      onClick: () => {
        setOpen(false);
        logout();
      },
      tone: 'accent',
      hidden: !user.isGuest,
    },
    {
      key: 'teams',
      label: 'Teams & shared servers',
      icon: <Users size={15} strokeWidth={2} />,
      onClick: () => {
        setOpen(false);
        onViewChange?.('team');
      },
      trailing: pendingInvites > 0 ? (
        <span className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-error/15 text-error text-[10px] font-bold flex items-center justify-center">
          {pendingInvites}
        </span>
      ) : null,
    },
    {
      key: 'signout',
      label: user.isGuest ? 'Exit guest mode' : 'Sign out',
      icon: user.isGuest ? <UserRound size={15} strokeWidth={2} /> : <LogOut size={15} strokeWidth={2} />,
      onClick: () => {
        setOpen(false);
        logout();
      },
      tone: 'danger',
    },
  ];

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      align="end"
      minWidth={248}
      panelClassName="overflow-hidden"
      trigger={({ ref, onClick, open: isOpen, ...aria }) => (
        <button
          ref={ref as Ref<HTMLButtonElement>}
          type="button"
          onClick={onClick}
          title={user.displayName}
          {...aria}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className={`h-7 pl-1 pr-1.5 rounded-full border transition-all flex items-center gap-1 ${
            isOpen
              ? 'bg-accent/15 border-accent/40 text-accent'
              : 'bg-bg-tertiary/40 border-border/30 text-text-primary hover:bg-bg-tertiary/70 hover:border-border/50'
          }`}
        >
          <span className="relative w-5 h-5 rounded-full bg-accent/20 border border-accent/25 text-accent text-[9px] font-bold flex items-center justify-center">
            {initials(user.displayName)}
            {pendingInvites > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[12px] h-[12px] px-0.5 rounded-full bg-error text-white text-[7px] font-bold flex items-center justify-center">
                {pendingInvites}
              </span>
            )}
          </span>
          <ChevronDown size={12} className={`text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      )}
    >
      <div className="px-3.5 py-3 border-b border-border/25 bg-bg-secondary/30">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-accent/15 border border-accent/25 text-accent text-xs font-bold flex items-center justify-center shrink-0">
            {initials(user.displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-text-primary truncate">{user.displayName}</p>
            <p className="text-[10px] text-text-secondary truncate mt-0.5">
              {user.email || (user.isGuest ? 'Guest session' : 'No email')}
            </p>
          </div>
        </div>
        {user.isGuest && (
          <span className="inline-flex mt-2.5 px-2 py-0.5 rounded-md bg-amber-500/12 text-amber-300 text-[9px] font-bold uppercase tracking-wide border border-amber-500/20">
            Guest mode
          </span>
        )}
      </div>

      <div className="py-1.5">
        {menuItems
          .filter((item) => !item.hidden)
          .map((item, index, arr) => {
            const isDanger = item.tone === 'danger';
            const prevNotDanger = index > 0 && arr[index - 1].tone !== 'danger';
            return (
              <div key={item.key}>
                {isDanger && prevNotDanger && <div className="h-px bg-border/20 my-1.5 mx-2" />}
                <button
                  type="button"
                  onClick={item.onClick}
                  className={`w-full px-3 py-2.5 text-left text-xs font-medium flex items-center gap-2.5 transition-colors ${
                    item.tone === 'accent'
                      ? 'text-accent hover:bg-accent/10'
                      : item.tone === 'danger'
                        ? 'text-text-secondary hover:bg-error/10 hover:text-error'
                        : 'text-text-primary hover:bg-bg-tertiary/50'
                  }`}
                >
                  <span className="shrink-0 opacity-90">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                  {item.trailing}
                </button>
              </div>
            );
          })}
      </div>
    </Dropdown>
  );
}
