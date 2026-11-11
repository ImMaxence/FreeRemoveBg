import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { LANGUAGES, LanguageService } from '../core/i18n';

/**
 * Two languages, so one button: it shows the other one, written in that language
 * ("English" on the French site, "Français" on the English one).
 */
@Component({
  selector: 'app-lang-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (other(); as l) {
      <button type="button" class="btn ghost" [class.sm]="!labelled()" [attr.lang]="l.tag" [attr.aria-label]="l.label" [title]="l.label" (click)="language.choose(l.code)">
        @if (labelled()) {
          {{ l.label }}
        } @else {
          <span class="code" aria-hidden="true">{{ l.code.toUpperCase() }}</span>
        }
      </button>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .code {
      font-weight: 700;
      letter-spacing: 0.04em;
    }
  `,
})
export class LangSwitch {
  /** The full name instead of the code (mobile menu). */
  readonly labelled = input(false);
  protected readonly language = inject(LanguageService);
  private readonly active = toSignal(inject(TranslocoService).langChanges$, { initialValue: this.language.active });
  protected readonly other = computed(() => LANGUAGES.find((l) => l.code !== this.active()));
}
