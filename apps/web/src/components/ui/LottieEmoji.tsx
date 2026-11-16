import React from 'react';
import { Lottie } from 'lottie-react';

export interface LottieProps {
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
}

/**
 * Animated Crying Face Emoji (rendered from /Emojis/cry.json)
 */
export function CryLottie({ className = 'h-4 w-4', loop = true, autoplay = true }: LottieProps) {
  return (
    <span className={`inline-flex items-center justify-center shrink-0 ${className}`}>
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
    <span className={`inline-flex items-center justify-center shrink-0 ${className}`}>
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
    <span className={`inline-flex items-center justify-center shrink-0 ${className}`}>
      <Lottie
        src="/Emojis/discord-logo.json"
        loop={loop}
        autoplay={autoplay}
        style={{ width: '100%', height: '100%' }}
      />
    </span>
  );
}
