import type { Plugin } from 'obsidian';
import { Notice } from 'obsidian';

import { SESSIONS_PATH, SessionStorage } from '../../core/bootstrap/SessionStorage';
import type { SharedAppStorage } from '../../core/bootstrap/storage';
import { AIDIAN_STORAGE_PATH } from '../../core/bootstrap/StoragePaths';
import { VaultFileAdapter } from '../../core/storage/VaultFileAdapter';
import { AidianSettingsStorage, type StoredAidianSettings } from '../settings/AidianSettingsStorage';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export class SharedStorageService implements SharedAppStorage {
  readonly aidianSettings: AidianSettingsStorage;
  readonly sessions: SessionStorage;

  private adapter: VaultFileAdapter;
  private plugin: Plugin;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.adapter = new VaultFileAdapter(plugin.app);
    this.aidianSettings = new AidianSettingsStorage(this.adapter);
    this.sessions = new SessionStorage(this.adapter);
  }

  async initialize(): Promise<{ aidian: Record<string, unknown> }> {
    await this.ensureDirectories();
    const aidian = await this.aidianSettings.load();
    return { aidian };
  }

  async saveAidianSettings(settings: Record<string, unknown>): Promise<void> {
    await this.aidianSettings.save(settings as StoredAidianSettings);
  }

  async setTabManagerState(state: { openTabs: Array<{ tabId: string; conversationId: string | null; draftModel?: string | null }>; activeTabId: string | null }): Promise<void> {
    try {
      const loaded: unknown = await this.plugin.loadData();
      const data = isRecord(loaded) ? loaded : {};
      data.tabManagerState = state;
      await this.plugin.saveData(data);
    } catch {
      new Notice('Failed to save tab layout');
    }
  }

  async getTabManagerState(): Promise<{ openTabs: Array<{ tabId: string; conversationId: string | null; draftModel?: string | null }>; activeTabId: string | null } | null> {
    try {
      const data: unknown = await this.plugin.loadData();
      if (!isRecord(data) || !data.tabManagerState) {
        return null;
      }

      return this.validateTabManagerState(data.tabManagerState);
    } catch {
      return null;
    }
  }

  getAdapter(): VaultFileAdapter {
    return this.adapter;
  }

  private async ensureDirectories(): Promise<void> {
    await this.adapter.ensureFolder(AIDIAN_STORAGE_PATH);
    await this.adapter.ensureFolder(SESSIONS_PATH);
  }

  private validateTabManagerState(data: unknown): { openTabs: Array<{ tabId: string; conversationId: string | null; draftModel?: string | null }>; activeTabId: string | null } | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const state = data as Record<string, unknown>;
    if (!Array.isArray(state.openTabs)) {
      return null;
    }

    const validatedTabs: Array<{ tabId: string; conversationId: string | null; draftModel?: string | null }> = [];
    for (const tab of state.openTabs) {
      if (!tab || typeof tab !== 'object') {
        continue;
      }

      const tabObj = tab as Record<string, unknown>;
      if (typeof tabObj.tabId !== 'string') {
        continue;
      }

      validatedTabs.push({
        tabId: tabObj.tabId,
        conversationId: typeof tabObj.conversationId === 'string' ? tabObj.conversationId : null,
        ...(typeof tabObj.draftModel === 'string'
          ? { draftModel: tabObj.draftModel }
          : {}),
      });
    }

    return {
      openTabs: validatedTabs,
      activeTabId: typeof state.activeTabId === 'string' ? state.activeTabId : null,
    };
  }
}
