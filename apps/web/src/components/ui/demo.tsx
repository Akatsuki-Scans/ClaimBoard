"use client";

import PlugSocket from "@/components/ui/plug-socket";

export function PlugSocketDemo() {
  return (
    <div className="flex w-full items-center justify-center p-10">
      <PlugSocket
        style={{ width: 280 }}
        aria-label="A wall socket, and a plug lying on the floor at the end of its cord"
      />
    </div>
  );
}

export default PlugSocketDemo;
