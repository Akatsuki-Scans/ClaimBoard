import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  Client,
  AutocompleteInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  AnySelectMenuInteraction,
  ModalSubmitInteraction,
} from 'discord.js';

export interface CommandContext {
  client: Client;
  interaction: ChatInputCommandInteraction;
  webUrl: string;
}

export type SlashCommandData =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | any;

export interface BotCommand {
  name: string;
  description: string;
  data: SlashCommandData;
  execute: (ctx: CommandContext) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
  handleButton?: (interaction: ButtonInteraction) => Promise<void>;
  handleSelect?: (interaction: any) => Promise<void>;
  handleModal?: (interaction: ModalSubmitInteraction) => Promise<void>;
}

export interface BotModule {
  id: string;
  name: string;
  description: string;
  version?: string;
  enabled?: boolean;
  commands?: BotCommand[];
  onLoad?: (client: Client) => Promise<void> | void;
  onUnload?: (client: Client) => Promise<void> | void;
}
