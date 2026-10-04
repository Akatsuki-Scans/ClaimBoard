import { BotModule } from '../core/types';
import { claimboardModule } from './claimboard';
import { systemModule } from './system';
import { adminModule } from './admin';
import { anilistModule } from './anilist';

// All installed bot modules
export const installedModules: BotModule[] = [
  claimboardModule,
  systemModule,
  adminModule,
  anilistModule,
];

export { claimboardModule, systemModule, adminModule, anilistModule };

