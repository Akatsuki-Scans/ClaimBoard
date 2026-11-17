import React from 'react';
import PlugSocket from '@/components/ui/plug-socket';

export function NotFoundPage() {
  return (
    <main
      role="main"
      className="min-h-screen w-full bg-[#090a0b] flex flex-col items-center justify-center p-6 select-none overflow-hidden"
    >
      <div className="flex items-center justify-center w-full">
        <PlugSocket
          style={{ width: 320, maxWidth: '90vw' }}
          aria-label="A wall socket, and a plug lying on the floor at the end of its cord"
        />
      </div>
    </main>
  );
}

export default NotFoundPage;
