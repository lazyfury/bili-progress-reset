import { browser } from 'wxt/browser';
import type { PinnedChannel } from './types';

/** 插件设置（storage.local） */

export const FLOATING_KEY = 'floatingEnabled';
export const HOMEPAGE_KEY = 'homepageEnabled';
export const PINNED_KEY = 'pinnedChannels';

export const HOME_PILL_KEY = 'homePillEnabled';

/** 所有设置的默认值 */
export const DEFAULT_SETTINGS: Record<string, unknown> = {
  [FLOATING_KEY]: false,
  [HOMEPAGE_KEY]: false,
  [HOME_PILL_KEY]: true,
  [PINNED_KEY]: [] as PinnedChannel[],
};

export async function getSettings(): Promise<Record<string, unknown>> {
  const v = await browser.storage.local.get(DEFAULT_SETTINGS);
  return v as Record<string, unknown>;
}

export async function getFloatingEnabled(): Promise<boolean> {
  const v = await browser.storage.local.get({ [FLOATING_KEY]: false });
  return !!v[FLOATING_KEY];
}

export async function setFloatingEnabled(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [FLOATING_KEY]: enabled });
}
