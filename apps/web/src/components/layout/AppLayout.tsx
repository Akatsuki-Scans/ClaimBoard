import React, { useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { CommandPalette } from '../ui/CommandPalette';
import { useAuthStore } from '../../stores/authStore';
import { Loader2 } from 'lucide-react';

export function AppLayout() {
  const { user, isLoading, fetchMe } = useAuthStore();

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
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#090a0b] text-zinc-400 gap-3">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        >
          <Loader2 className="h-5 w-5 text-zinc-400" />
        </motion.div>
        <span className="text-xs font-mono text-zinc-500">Connecting to ClaimBoard workspace...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  return (
    <div className="flex min-h-screen bg-[#090a0b] text-zinc-100 antialiased selection:bg-zinc-800 selection:text-white">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar />
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
