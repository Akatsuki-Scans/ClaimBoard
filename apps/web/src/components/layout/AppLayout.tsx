import React, { useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { CommandPalette } from '../ui/CommandPalette';
import { useAuthStore } from '../../stores/authStore';
import { useRealtimeSync } from '../../lib/useRealtimeSync';
import { Loader2 } from 'lucide-react';

export function AppLayout() {
  const { user, isLoading, fetchMe } = useAuthStore();

  // Initialize real-time synchronization
  useRealtimeSync();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      localStorage.setItem('claimboard_token', urlToken);
    }
    fetchMe();
  }, [fetchMe]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-400 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        <span className="text-xs font-mono">Connecting to ClaimBoard Workspace...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  return (
    <div className="flex min-h-screen bg-[#0c0d0e] text-zinc-100 antialiased">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar />
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
