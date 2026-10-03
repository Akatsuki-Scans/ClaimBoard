import { Client } from 'discord.js';
import { BotModule, BotCommand } from './types';

export class ModuleManager {
  private modules: Map<string, BotModule> = new Map();
  private client: Client | null = null;

  public setClient(client: Client): void {
    this.client = client;
  }

  public registerModule(module: BotModule): void {
    if (this.modules.has(module.id)) {
      console.warn(`[ModuleManager] Module "${module.id}" is already registered. Overwriting.`);
    }

    const mod: BotModule = {
      ...module,
      enabled: module.enabled ?? true,
      commands: module.commands || [],
    };

    this.modules.set(mod.id, mod);
    console.log(`[ModuleManager] Registered module: [${mod.id}] "${mod.name}" (${mod.commands?.length || 0} commands)`);

    if (this.client && mod.enabled && mod.onLoad) {
      try {
        mod.onLoad(this.client);
      } catch (err) {
        console.error(`[ModuleManager] Error initializing module "${mod.id}":`, err);
      }
    }
  }

  public unregisterModule(moduleId: string): boolean {
    const mod = this.modules.get(moduleId);
    if (!mod) return false;

    if (this.client && mod.onUnload) {
      try {
        mod.onUnload(this.client);
      } catch (err) {
        console.error(`[ModuleManager] Error unloading module "${moduleId}":`, err);
      }
    }

    this.modules.delete(moduleId);
    console.log(`[ModuleManager] Unregistered module: [${moduleId}]`);
    return true;
  }

  public enableModule(moduleId: string): boolean {
    const mod = this.modules.get(moduleId);
    if (!mod) return false;

    mod.enabled = true;
    if (this.client && mod.onLoad) {
      mod.onLoad(this.client);
    }
    console.log(`[ModuleManager] Enabled module: [${moduleId}]`);
    return true;
  }

  public disableModule(moduleId: string): boolean {
    const mod = this.modules.get(moduleId);
    if (!mod) return false;

    mod.enabled = false;
    if (this.client && mod.onUnload) {
      mod.onUnload(this.client);
    }
    console.log(`[ModuleManager] Disabled module: [${moduleId}]`);
    return true;
  }

  public getModule(moduleId: string): BotModule | undefined {
    return this.modules.get(moduleId);
  }

  public getAllModules(): BotModule[] {
    return Array.from(this.modules.values());
  }

  public getEnabledModules(): BotModule[] {
    return this.getAllModules().filter((m) => m.enabled !== false);
  }

  public getAllCommands(): { command: BotCommand; module: BotModule }[] {
    const commands: { command: BotCommand; module: BotModule }[] = [];
    for (const mod of this.getEnabledModules()) {
      if (mod.commands) {
        for (const cmd of mod.commands) {
          commands.push({ command: cmd, module: mod });
        }
      }
    }
    return commands;
  }

  public findCommand(commandName: string): { command: BotCommand; module: BotModule } | undefined {
    for (const mod of this.getEnabledModules()) {
      const found = mod.commands?.find((c) => c.name.toLowerCase() === commandName.toLowerCase());
      if (found) {
        return { command: found, module: mod };
      }
    }
    return undefined;
  }
}

export const moduleManager = new ModuleManager();
