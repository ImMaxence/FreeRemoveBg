import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { toSignal } from '@angular/core/rxjs-interop';
import { LANGUAGES, LanguageService } from '../core/i18n';

/** Language choice: one button per language, each named in its own language. */
@Component({
  selector: 'app-lang-switch',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="segmented" role="group" [attr.aria-label]="'nav.language' | transloco">
      @for (l of languages; track l.code) {
        <button type="button" [class.active]="active() === l.code" [attr.aria-pressed]="active() === l.code" [attr.lang]="l.tag" [title]="l.label" (click)="language.choose(l.code)">
          <span aria-hidden="true">{{ l.code.toUpperCase() }}</span>
          <span class="sr-only">{{ l.label }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .segmented {
      width: 100%;
    }
    button {
      min-width: 38px;
    }
  `,
})
export class LangSwitch {
  protected readonly language = inject(LanguageService);
  protected readonly languages = LANGUAGES;
  protected readonly active = toSignal(inject(TranslocoService).langChanges$, { initialValue: this.language.active });
}
