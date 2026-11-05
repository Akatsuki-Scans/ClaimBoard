import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { ClaimBoardLogoIcon } from '../../components/ui/icon';
import { Clock, AlertCircle } from 'lucide-react';

export function DiscordIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notApprovedUsername, setNotApprovedUsername] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const err = params.get('error');
    const usernameParam = params.get('username');

    if (err === 'account_not_approved') {
      setNotApprovedUsername(usernameParam || 'your Discord account');
      setErrorMessage(null);
    } else if (err) {
      setErrorMessage(`Authentication notice: ${err}`);
      setNotApprovedUsername(null);
    }

    if (urlToken) {
      localStorage.setItem('claimboard_token', urlToken);
      fetchMe().then(() => {
        navigate('/dashboard', { replace: true });
      });
    } else if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, fetchMe, navigate]);

  // Real Discord OAuth Redirect
  const handleDiscordOAuth = () => {
    setIsLoading(true);
    setErrorMessage(null);
    setNotApprovedUsername(null);
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    window.location.href = `${apiBase}/api/auth/oauth/discord`;
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#090a0b] text-zinc-100 select-none">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-[#111215] p-6 shadow-2xl">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 h-10 w-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <ClaimBoardLogoIcon className="h-5 w-5 text-zinc-100" />
          </div>
          <h1 className="text-base font-semibold text-zinc-100 tracking-tight">ClaimBoard Workspace</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Production management for scanlation organizations
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {notApprovedUsername && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-left space-y-2">
            <div className="flex items-center gap-2 font-medium text-amber-400 text-xs">
              <Clock className="h-3.5 w-3.5" />
              <span>Account Pending Approval</span>
            </div>
            <p className="text-xs text-zinc-300 leading-normal">
              Your Discord account <span className="font-mono text-amber-300 bg-amber-500/20 px-1 py-0.5 rounded">@{notApprovedUsername}</span> is awaiting administrator approval.
            </p>
            <p className="text-[11px] text-zinc-400">
              Run this bot command in your Discord server:
            </p>
            <div className="font-mono text-xs bg-zinc-950 border border-zinc-800 rounded p-2 text-emerald-400 select-all">
              /approve username:{notApprovedUsername}
            </div>
          </div>
        )}

        {/* Primary Discord OAuth Button */}
        <div>
          <button
            onClick={handleDiscordOAuth}
            disabled={isLoading}
            className="w-full h-10 px-4 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] active:bg-[#3c45a5] text-white font-medium text-xs flex items-center justify-center gap-2.5 transition-colors disabled:opacity-40 shadow-sm"
          >
            <DiscordIcon className="h-4 w-4" />
            <span>{isLoading ? 'Connecting to Discord...' : 'Continue with Discord'}</span>
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-zinc-800/80 text-center">
          <p className="text-[11px] text-zinc-500 font-mono">
            ClaimBoard v1.0 • Connected to MongoDB Atlas & Discord Bot
          </p>
        </div>
      </div>
    </div>
  );
}
