import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { SwUpdate, type VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Where the "Install" steps differ: each browser hides the command somewhere else. */
export type InstallPlatform = 'ios' | 'android' | 'edge' | 'chrome' | 'safari' | 'firefox' | 'other';

/**
 * Install button and "new version available" handling for the PWA.
 *
 * The install button is always shown (except inside the installed app): the browser's own
 * prompt only becomes available some time after the page has loaded, and not at all on
 * Safari or Firefox, so a button that appeared with it would pop up late, push the menu
 * aside, and never show on an iPhone. When there is no prompt, the button explains the steps.
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly swUpdate = inject(SwUpdate);
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  readonly updateReady = signal(false);
  /** Running as the installed app, or just installed: no button. */
  readonly installed = signal(false);

  constructor() {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
        .subscribe(() => this.updateReady.set(true));
    }
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const standalone = window.matchMedia('(display-mode: standalone)');
    const update = () => this.installed.set(standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    update();
    standalone.addEventListener('change', update);
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
    });
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.installed.set(true);
    });
  }

  /** Shows the browser's install prompt. false: there is none (yet), the steps have to be explained. */
  async install(): Promise<boolean> {
    const prompt = this.deferredPrompt;
    if (!prompt) return false;
    this.deferredPrompt = null;
    await prompt.prompt();
    if ((await prompt.userChoice).outcome === 'accepted') this.installed.set(true);
    return true;
  }

  /** The browser the steps are written for. */
  platform(): InstallPlatform {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    if (/Firefox\//.test(ua)) return 'firefox';
    if (/Edg\//.test(ua)) return 'edge';
    if (/Chrome\//.test(ua)) return 'chrome';
    if (/Safari\//.test(ua) && ua.includes('Macintosh')) return 'safari';
    return 'other';
  }

  async reload(): Promise<void> {
    await this.swUpdate.activateUpdate().catch(() => undefined);
    location.reload();
  }
}
