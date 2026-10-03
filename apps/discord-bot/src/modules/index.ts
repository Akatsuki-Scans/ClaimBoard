import { BotModule } from '../core/types';
import { claimboardModule } from './claimboard';
import { systemModule } from './system';
import { adminModule } from './admin';

// All installed bot modules
export const installedModules: BotModule[] = [
  claimboardModule,
  systemModule,
  adminModule,
];

export { claimboardModule, systemModule, adminModule };

