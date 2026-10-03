import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export function DiscordIcon({ className = 'h-5 w-5' }: { className?: string }) {
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
      setErrorMessage(`Authentication error: ${err}`);
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
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 overflow-hidden bg-black selection:bg-[#5865F2]/30 selection:text-white">
      {/* Fullscreen Background: akatsuki.jpg with dark atmosphere & blur */}
      <div
        className="absolute inset-0 bg-cover bg-center filter contrast-125 brightness-75 scale-105 transition-transform duration-1000"
        style={{
          backgroundImage: `url('/akatsuki.jpg')`,
        }}
      />

      {/* Dark Ambient Overlay and Vignette */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[6px]" />
      <div className="absolute inset-0 bg-radial-gradient from-transparent via-black/40 to-black/80 pointer-events-none" />

      {/* Centered Discord Server Join Style Box */}
      <div className="relative z-10 w-full max-w-[460px] rounded-xl border border-zinc-800/90 bg-[#2b2d31]/95 text-zinc-100 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.8)] backdrop-blur-md text-center">
        {/* Discord Server / App Avatar */}
        <div className="mx-auto mb-4 h-20 w-20 rounded-2xl bg-[#1e1f22] border-2 border-[#35373c] p-3 flex items-center justify-center shadow-lg relative group">
          <DiscordIcon className="h-12 w-12 text-[#5865F2] transition-transform duration-200 group-hover:scale-110" />
          {/* Online badge */}
          <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-[#23a55a] border-4 border-[#2b2d31]" />
        </div>

        {/* Header / Invited notice */}
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
          Scanlation Workspace
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Sign in with Discord
        </h1>

        {errorMessage && (
          <div className="mt-4 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {errorMessage}
          </div>
        )}

        {notApprovedUsername && (
          <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-left space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 font-semibold text-amber-400 text-xs">
              <span className="text-base">⏳</span>
              <span>Account Pending Approval</span>
            </div>
            <p className="text-[12px] leading-relaxed text-zinc-300">
              Your Discord account <span className="font-mono text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded">@{notApprovedUsername}</span> has not been approved to log into ClaimBoard yet.
            </p>
            <p className="text-[11px] leading-relaxed text-zinc-400">
              Ask your Discord server administrator to approve your account using this bot command:
            </p>
            <div className="font-mono text-xs bg-black/60 border border-zinc-800 rounded-md p-2 text-emerald-400 select-all flex items-center justify-between">
              <span>/approve username:{notApprovedUsername}</span>
            </div>
          </div>
        )}

        {/* Main Action Button */}
        <div className="mt-7">
          <button
            onClick={handleDiscordOAuth}
            disabled={isLoading}
            className="w-full h-11 px-6 rounded-md bg-[#5865F2] hover:bg-[#4752C4] active:bg-[#3c45a5] text-white font-medium text-sm flex items-center justify-center gap-2.5 transition-colors shadow-md disabled:opacity-50"
          >
            <DiscordIcon className="h-5 w-5 text-white" />
            <span>{isLoading ? 'Connecting to Discord...' : 'Continue with Discord'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
