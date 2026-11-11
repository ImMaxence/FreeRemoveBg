import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SAMPLES, type Sample } from '../core/samples';
import { ACCEPTED_TYPES } from '../engine/files';
import { Icon } from './icon';

/**
 * Where pictures come in: a button opening the file picker (keyboard and screen readers), and
 * the same area accepting dropped files. Pasting is handled by the pages, for the whole window.
 */
@Component({
  selector: 'app-dropzone',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.over]': 'over()',
    '[class.compact]': 'compact()',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'over.set(false)',
    '(drop)': 'onDrop($event)',
  },
  template: `
    <input #picker class="sr-only" type="file" multiple tabindex="-1" aria-hidden="true" [accept]="accept" (change)="onPick(picker)" />
    <span class="art" aria-hidden="true"><app-icon name="images" [size]="compact() ? 26 : 34" /></span>
    <button class="btn primary lg" type="button" (click)="picker.click()">
      <app-icon name="upload" [size]="18" /> {{ 'drop.choose' | transloco }}
    </button>
    <p class="hint">{{ 'drop.hint' | transloco }}</p>
    @if (samples()) {
      <div class="samples">
        <span class="muted">{{ 'drop.samples' | transloco }}</span>
        <div class="row">
          @for (s of sampleList; track s.id) {
            <button type="button" class="sample" (click)="sample.emit(s)" [attr.aria-label]="'drop.sample.' + s.id | transloco">
              <img [src]="s.thumb" alt="" width="56" height="56" loading="lazy" decoding="async" />
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: grid;
      justify-items: center;
      gap: 14px;
      padding: 36px 24px;
      border: 2px dashed var(--border-strong);
      border-radius: var(--radius-lg);
      background: var(--bg-elev);
      text-align: center;
      transition:
        border-color 0.15s,
        background 0.15s,
        transform 0.15s;
    }
    :host(.over) {
      border-color: var(--accent);
      background: var(--accent-soft);
      transform: scale(1.01);
    }
    :host(.compact) {
      padding: 24px 16px;
      gap: 10px;
    }
    .art {
      display: grid;
      place-items: center;
      width: 68px;
      height: 68px;
      border-radius: 20px;
      background: var(--accent-soft);
      color: var(--accent);
    }
    :host(.compact) .art {
      width: 52px;
      height: 52px;
      border-radius: 16px;
    }
    .hint {
      color: var(--text-muted);
      font-size: 14px;
      max-width: 340px;
    }
    .samples {
      display: grid;
      justify-items: center;
      gap: 8px;
      margin-top: 6px;
      font-size: 13px;
    }
    .row {
      display: flex;
      gap: 8px;
    }
    .sample {
      padding: 0;
      border: 2px solid transparent;
      border-radius: 12px;
      background: none;
      cursor: pointer;
      overflow: hidden;
      transition:
        transform 0.15s,
        border-color 0.15s;
      &:hover {
        transform: translateY(-2px);
        border-color: var(--accent);
      }
      img {
        display: block;
        width: 56px;
        height: 56px;
        object-fit: cover;
      }
    }
  `,
})
export class Dropzone {
  /** Smaller, for the editor's side panel. */
  readonly compact = input(false);
  /** Offers the sample pictures. */
  readonly samples = input(true);
  readonly files = output<File[]>();
  readonly sample = output<Sample>();

  protected readonly accept = ACCEPTED_TYPES;
  protected readonly sampleList = SAMPLES;
  protected readonly over = signal(false);

  protected onPick(picker: HTMLInputElement): void {
    const files = Array.from(picker.files ?? []);
    // Emptied so that picking the same file again is still a change.
    picker.value = '';
    if (files.length) this.files.emit(files);
  }

  protected onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.over.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.over.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length) this.files.emit(files);
  }
}
