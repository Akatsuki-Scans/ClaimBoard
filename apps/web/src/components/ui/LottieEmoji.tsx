import React from 'react';
import { Lottie } from 'lottie-react';

export interface LottieProps {
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
  size?: number | string;
}

/**
 * Animated Big Frown Emoji (rendered from /Emojis/big-frown.json)
 * Used when no tasks have been completed by a user.
 */
export function BigFrownLottie({ className = 'h-24 w-24', loop = true, autoplay = true }: LottieProps) {
  return (
    <span className={`inline-flex items-center justify-center shrink-0 select-none ${className}`}>
      <Lottie
        src="/Emojis/big-frown.json"
        loop={loop}
        autoplay={autoplay}
        style={{ width: '100%', height: '100%' }}
      />
    </span>
  );
}

/**
 * Animated Alien Monster Emoji (rendered from /Emojis/alien-monster.json)
 * Displayed beside Administrator names.
 */
export function AlienMonsterLottie({ className = 'h-6 w-6', loop = true, autoplay = true }: LottieProps) {
  return (
    <span className={`inline-flex items-center justify-center shrink-0 select-none ${className}`}>
      <Lottie
        src="/Emojis/alien-monster.json"
        loop={loop}
        autoplay={autoplay}
        style={{ width: '100%', height: '100%' }}
      />
    </span>
  );
}

/**
 * Animated Collision Emoji (rendered from /Emojis/collision.json)
 * Displayed beside Worker names.
 */
export function CollisionLottie({ className = 'h-6 w-6', loop = true, autoplay = true }: LottieProps) {
  return (
    <span className={`inline-flex items-center justify-center shrink-0 select-none ${className}`}>
      <Lottie
        src="/Emojis/collision.json"
        loop={loop}
        autoplay={autoplay}
        style={{ width: '100%', height: '100%' }}
      />
    </span>
  );
}

/**
 * Animated Crying Face Emoji (rendered from /Emojis/cry.json)
 */
export function CryLottie({ className = 'h-4 w-4', loop = true, autoplay = true }: LottieProps) {
  return (
    <span className={`inline-flex items-center justify-center shrink-0 select-none ${className}`}>
      <Lottie
        src="/Emojis/cry.json"
        loop={loop}
        autoplay={autoplay}
        style={{ width: '100%', height: '100%' }}
      />
    </span>
  );
}

/**
 * Animated Head Nodding Emoji (rendered from /Emojis/head-nod.json)
 */
export function HeadNodLottie({ className = 'h-16 w-16', loop = true, autoplay = true }: LottieProps) {
  return (
    <span className={`inline-flex items-center justify-center shrink-0 select-none ${className}`}>
      <Lottie
        src="/Emojis/head-nod.json"
        loop={loop}
        autoplay={autoplay}
        style={{ width: '100%', height: '100%' }}
      />
    </span>
  );
}

/**
 * Animated Discord Logo (rendered from /Emojis/discord-logo.json)
 */
export function DiscordLogoLottie({ className = 'h-10 w-10', loop = true, autoplay = true }: LottieProps) {
  return (
    <span className={`inline-flex items-center justify-center shrink-0 select-none ${className}`}>
      <Lottie
        src="/Emojis/discord-logo.json"
        loop={loop}
        autoplay={autoplay}
        style={{ width: '100%', height: '100%' }}
      />
    </span>
  );
}
