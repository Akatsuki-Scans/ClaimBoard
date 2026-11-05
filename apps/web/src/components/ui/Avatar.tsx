import React, { useState } from 'react';
import { MangaIcon } from './icon';

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export function UserAvatar({ src, name, size = 'sm', className = '' }: UserAvatarProps) {
  const [hasError, setHasError] = useState(false);

  const sizeClasses = {
    xs: 'h-5 w-5 text-[9px]',
    sm: 'h-6 w-6 text-[10px]',
    md: 'h-8 w-8 text-xs',
    lg: 'h-10 w-10 text-sm',
  };

  const getInitials = (str?: string | null) => {
    if (!str) return 'U';
    const parts = str.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return str.slice(0, 2).toUpperCase();
  };

  if (src && !hasError) {
    return (
      <img
        src={src}
        alt={name || 'User'}
        onError={() => setHasError(true)}
        className={`${sizeClasses[size]} rounded-full object-cover shrink-0 border border-zinc-700/60 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-zinc-800 border border-zinc-700/60 flex items-center justify-center shrink-0 font-medium font-mono text-zinc-300 select-none ${className}`}
    >
      {getInitials(name)}
    </div>
  );
}

interface MangaCoverProps {
  src?: string | null;
  title?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'detail';
  className?: string;
}

export function MangaCover({ src, title, size = 'md', className = '' }: MangaCoverProps) {
  const [hasError, setHasError] = useState(false);

  const sizeClasses = {
    sm: 'h-8 w-8 rounded-md',
    md: 'h-10 w-10 rounded-md',
    lg: 'h-16 w-12 rounded-lg',
    detail: 'w-48 h-64 rounded-xl',
  };

  if (src && !hasError) {
    return (
      <img
        src={src}
        alt={title || 'Manga Cover'}
        onError={() => setHasError(true)}
        className={`${sizeClasses[size]} object-cover shrink-0 border border-zinc-800 shadow-sm ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center shrink-0 p-1 text-center shadow-sm select-none ${className}`}
    >
      <MangaIcon className="h-4 w-4 text-zinc-500 mb-0.5" />
      <span className="text-[9px] font-mono text-zinc-500 truncate max-w-full">
        {(title || 'Manga').slice(0, 4).toUpperCase()}
      </span>
    </div>
  );
}

