import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, type ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { NavigationStart, Router, RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { MODELS, SAM } from './core/models';
import { type InstallPlatform, PwaService } from './core/pwa.service';
import { SeoService } from './core/seo';
import { APP_VERSION, REPO_URL } from './core/version';
import { Icon } from './shared/icon';
import { LangSwitch } from './shared/lang-switch';
import { LocalizePipe } from './shared/localize';
import { Logo } from './shared/logo';
import { ThemeToggle } from './shared/theme-toggle';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, TranslocoPipe, Icon, Logo, LangSwitch, ThemeToggle, LocalizePipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'menuOpen.set(false)' },
})
export class App {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  protected readonly pwa = inject(PwaService);
  protected readonly version = APP_VERSION;
  protected readonly repoUrl = REPO_URL;
  protected readonly models = [MODELS.isnet, MODELS.ormbg, SAM];
  protected readonly year = new Date().getFullYear();
  protected readonly menuOpen = signal(false);
  /** The browser whose install steps are shown, while the help is open. */
  protected readonly installSteps = signal<InstallPlatform | null>(null);
  private readonly installDialog = viewChild.required<ElementRef<HTMLDialogElement>>('installDialog');
  protected readonly navLinks = [
    { fragment: 'how', key: 'nav.how' },
    { fragment: 'ai', key: 'nav.ai' },
    { fragment: 'privacy', key: 'nav.privacy' },
    { fragment: 'faq', key: 'nav.faq' },
  ];

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationStart)).subscribe(() => this.menuOpen.set(false));
    inject(SeoService);
    // Freeze the page behind the open mobile menu.
    effect(() => this.document.documentElement.classList.toggle('menu-open', this.menuOpen()));
  }

  /** The browser's own install prompt when it offers one, otherwise the steps for this browser. */
  protected async install(): Promise<void> {
    this.menuOpen.set(false);
    if (await this.pwa.install()) return;
    this.installSteps.set(this.pwa.platform());
    this.installDialog().nativeElement.showModal();
  }

  /** A click outside the help's card closes it. */
  protected closeOnBackdrop(event: MouseEvent): void {
    const dialog = this.installDialog().nativeElement;
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  }

  /** "Skip to content": moves the focus past the header, without changing the address. */
  protected skip(event: Event): void {
    event.preventDefault();
    this.document.getElementById('main')?.focus();
  }
}
