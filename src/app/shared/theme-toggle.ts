import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { toSignal } from '@angular/core/rxjs-interop';
import { type ThemeMode, ThemeService } from '../core/theme.service';
import { Icon } from './icon';

const ORDER: ThemeMode[] = ['system', 'light', 'dark'];
const ICONS: Record<ThemeMode, string> = { system: 'monitor', light: 'sun', dark: 'moon' };

/**
 * One button for the theme: each press moves to the next mode (system, light, dark). Its name
 * says the current mode, so screen readers announce what changed.
 */
@Component({
  selector: 'app-theme-toggle',
  imports: [Icon, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="btn ghost" [class.icon]="!labelled()" [class.sm]="!labelled()" [attr.aria-label]="label()" [title]="label()" (click)="next()">
      <app-icon [name]="icon()" [size]="18" />
      @if (labelled()) {
        <span>{{ 'theme.label' | transloco }} : {{ 'theme.' + theme.mode() | transloco }}</span>
      }
    </button>
  `,
  host: { style: 'display:inline-flex' },
})
export class ThemeToggle {
  /** Shows the mode in words next to the icon (mobile menu). */
  readonly labelled = input(false);
  protected readonly theme = inject(ThemeService);
  private readonly transloco = inject(TranslocoService);
  private readonly lang = toSignal(this.transloco.langChanges$);
  protected readonly icon = computed(() => ICONS[this.theme.mode()]);
  protected readonly label = computed(() => {
    this.lang();
    return `${this.transloco.translate('theme.label')} : ${this.transloco.translate(`theme.${this.theme.mode()}`)}`;
  });

  protected next(): void {
    this.theme.mode.set(ORDER[(ORDER.indexOf(this.theme.mode()) + 1) % ORDER.length]);
  }
}
