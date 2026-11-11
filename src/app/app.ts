import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { NavigationStart, Router, RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { MODELS } from './core/models';
import { PwaService } from './core/pwa.service';
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
  protected readonly model = MODELS.isnet;
  protected readonly year = new Date().getFullYear();
  protected readonly menuOpen = signal(false);
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

  /** "Skip to content": moves the focus past the header, without changing the address. */
  protected skip(event: Event): void {
    event.preventDefault();
    this.document.getElementById('main')?.focus();
  }
}
