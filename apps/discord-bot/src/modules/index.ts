import { BotModule } from '../core/types';
import { claimboardModule } from './claimboard';
import { systemModule } from './system';
import { adminModule } from './admin';
import { anilistModule } from './anilist';
import { honeypotModule } from './honeypot';

// All installed bot modules
export const installedModules: BotModule[] = [
  claimboardModule,
  systemModule,
  adminModule,
  anilistModule,
  honeypotModule,
];

export { claimboardModule, systemModule, adminModule, anilistModule, honeypotModule };


