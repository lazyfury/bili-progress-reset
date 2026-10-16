import { browser } from 'wxt/browser';

/** 插件设置（storage.local） */

export const FLOATING_KEY = 'floatingEnabled';
export const HOMEPAGE_KEY = 'homepageEnabled';

/** 所有设置的默认值 */
export const DEFAULT_SETTINGS = {
  [FLOATING_KEY]: false,
  [HOMEPAGE_KEY]: false,
};

export async function getSettings(): Promise<Record<string, boolean>> {
  const v = await browser.storage.local.get(DEFAULT_SETTINGS);
  return v as Record<string, boolean>;
}

export async function getFloatingEnabled(): Promise<boolean> {
  const v = await browser.storage.local.get({ [FLOATING_KEY]: false });
  return !!v[FLOATING_KEY];
}

export async function setFloatingEnabled(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [FLOATING_KEY]: enabled });
}
