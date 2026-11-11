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
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'over.set(false)',
    '(drop)': 'onDrop($event)',
  },
  template: `
    <input #picker class="sr-only" type="file" multiple tabindex="-1" aria-hidden="true" [accept]="accept" (change)="onPick(picker)" />
    <span class="art" aria-hidden="true"><app-icon name="images" [size]="34" /></span>
    <button class="btn primary lg" type="button" (click)="picker.click()">
      <app-icon name="upload" [size]="19" /> {{ 'drop.choose' | transloco }}
    </button>
    <p class="hint">{{ 'drop.hint' | transloco }}</p>
    <p class="formats">{{ 'drop.formats' | transloco }}</p>
    @if (samples()) {
      <div class="samples">
        <span>{{ 'drop.samples' | transloco }}</span>
        <div class="row">
          @for (s of sampleList; track s.id; let i = $index) {
            <button type="button" class="sample" [style.--tilt]="(i - 1) * 4 + 'deg'" (click)="sample.emit(s)" [attr.aria-label]="'drop.sample.' + s.id | transloco">
              <img [src]="s.thumb" alt="" width="64" height="64" loading="lazy" decoding="async" />
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
      padding: 46px 28px 34px;
      border: 2.5px dashed var(--line);
      border-radius: var(--r-xl);
      background: var(--card);
      text-align: center;
      transition:
        background 0.15s,
        transform 0.2s var(--ease);
    }
    :host(.over) {
      background: var(--yellow-soft);
      transform: scale(1.01) rotate(-0.4deg);
    }
    .art {
      display: grid;
      place-items: center;
      width: 76px;
      height: 76px;
      margin-bottom: 4px;
      border: 2px solid var(--line);
      border-radius: 24px;
      background: var(--yellow);
      color: var(--on-yellow);
      box-shadow: var(--shadow);
      transform: rotate(-6deg);
    }
    .hint {
      color: var(--ink-muted);
      font-size: 15px;
      max-width: 400px;
    }
    .formats {
      margin-top: -6px;
      color: var(--ink-faint);
      font-size: 13px;
      max-width: 440px;
    }
    .samples {
      display: grid;
      justify-items: center;
      gap: 10px;
      margin-top: 10px;
      padding-top: 18px;
      border-top: 1.5px dashed var(--line-soft);
      width: min(100%, 360px);
      font-size: 13.5px;
      font-weight: 600;
    }
    .row {
      display: flex;
      gap: 14px;
    }
    .sample {
      padding: 0;
      border: 2px solid var(--line);
      border-radius: 14px;
      background: var(--card);
      box-shadow: var(--shadow-sm);
      cursor: pointer;
      overflow: hidden;
      transform: rotate(var(--tilt, 0deg));
      transition:
        transform 0.15s var(--ease),
        box-shadow 0.15s var(--ease);
      &:hover {
        transform: rotate(0deg) translateY(-3px);
        box-shadow: var(--shadow);
      }
      img {
        display: block;
        width: 64px;
        height: 64px;
        object-fit: cover;
      }
    }
  `,
})
export class Dropzone {
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
