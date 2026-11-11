import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ImagesStore } from '../core/images.store';
import { MODELS, MODEL_IDS, type ModelId } from '../core/models';
import { formatBytes } from '../engine/download-stats';
import { DownloadProgress } from '../shared/download-progress';
import { Icon } from '../shared/icon';

/**
 * Step 1, when the browser does not have the chosen model yet: the models to choose from,
 * what will be downloaded, from where, and why, before anything is. The download starts on
 * the user's word only.
 */
@Component({
  selector: 'app-model-step',
  imports: [TranslocoPipe, Icon, DownloadProgress],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="model card" aria-labelledby="model-title">
      <div class="copy">
        <span class="eyebrow">{{ 'tool.model.eyebrow' | transloco }}</span>
        <h2 id="model-title">{{ 'tool.model.title' | transloco }}</h2>
        <p class="lead">{{ 'tool.model.text' | transloco }}</p>
        @if (store.items().length) {
          <p class="waiting"><app-icon name="lock" [size]="16" /> {{ 'tool.model.waiting' | transloco }}</p>
        }

        @switch (store.modelState()) {
          @case ('downloading') {
            <div class="progress-block" role="status">
              <b>{{ 'tool.model.downloading' | transloco: { name: model().name } }}</b>
              <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="percent()" [attr.aria-label]="'tool.model.downloading' | transloco: { name: model().name }">
                <div [style.width.%]="percent()"></div>
              </div>
              @if (store.modelDownload(); as d) {
                @if (d.loaded !== undefined && d.total) {
                  <app-download-progress [loaded]="d.loaded" [total]="d.total" />
                }
              }
            </div>
            <div class="actions">
              <button class="btn primary lg" type="button" (click)="continue.emit()">{{ 'tool.model.continue' | transloco }} <app-icon name="arrow-right" [size]="18" /></button>
            </div>
            <p class="faint small">{{ 'tool.model.continueHint' | transloco }}</p>
          }
          @case ('preparing') {
            <div class="progress-block" role="status">
              <b>{{ 'tool.model.preparing' | transloco }}</b>
              <div class="progress indeterminate"><div></div></div>
            </div>
            <div class="actions">
              <button class="btn primary lg" type="button" (click)="continue.emit()">{{ 'tool.model.continue' | transloco }} <app-icon name="arrow-right" [size]="18" /></button>
            </div>
          }
          @default {
            <fieldset class="choices">
              <legend class="mini-label">{{ 'tool.model.choose' | transloco }}</legend>
              @for (id of ids; track id) {
                <label class="choice" [class.on]="store.model() === id">
                  <input type="radio" name="model" [value]="id" [checked]="store.model() === id" (change)="store.selectModel(id)" />
                  <span class="choice-head">
                    <b>{{ models[id].name }}</b>
                    @if (id === 'isnet') {
                      <span class="chip yellow small-chip">{{ 'tool.model.recommended' | transloco }}</span>
                    }
                  </span>
                  <span class="choice-text">{{ 'tool.models.' + id + '.text' | transloco }}</span>
                  <span class="choice-meta">
                    @if (store.modelCached(id)) {
                      <span class="ok"><app-icon name="check" [size]="14" /> {{ 'tool.model.cached' | transloco }}</span>
                    } @else {
                      {{ size(id) }}
                    }
                    · {{ models[id].license }}
                  </span>
                </label>
              }
            </fieldset>
            @if (store.modelState() === 'error') {
              <div class="error" role="alert">
                <app-icon name="alert" [size]="18" />
                <div>
                  <b>{{ 'tool.model.error' | transloco }}</b>
                  @if (store.modelError(); as e) {
                    <code>{{ e }}</code>
                  }
                </div>
              </div>
            }
            <div class="actions">
              <button class="btn primary lg" type="button" [disabled]="store.modelState() === 'checking'" (click)="agree.emit()">
                <app-icon name="download" [size]="19" />
                {{ (store.modelState() === 'error' ? 'tool.model.retry' : 'tool.model.agree') | transloco: { name: model().name, size: size(store.model()) } }}
              </button>
              @if (store.previousModel(); as previous) {
                <button class="btn lg" type="button" (click)="store.selectModel(previous)">{{ 'tool.model.keep' | transloco: { name: models[previous].name } }}</button>
              } @else {
                <button class="btn lg" type="button" (click)="decline.emit()">{{ 'tool.model.decline' | transloco }}</button>
              }
            </div>
            <p class="faint small">{{ 'tool.model.mobile' | transloco }}</p>
          }
        }
      </div>

      <dl class="label">
        <div class="label-head">
          <dt class="sr-only">{{ 'tool.model.facts.model' | transloco }}</dt>
          <dd>
            <b>{{ model().name }}</b>
            <span>{{ model().maker }}@if (model().paper) {, {{ model().paper }}}</span>
          </dd>
        </div>
        <div>
          <dt>{{ 'tool.model.facts.size' | transloco }}</dt>
          <dd>{{ 'tool.model.facts.sizeValue' | transloco: { size: size(store.model()) } }}</dd>
        </div>
        <div>
          <dt>{{ 'tool.model.facts.source' | transloco }}</dt>
          <dd>
            <a [href]="'https://huggingface.co/' + model().repo" target="_blank" rel="noopener">Hugging Face</a>
          </dd>
        </div>
        <div>
          <dt>{{ 'tool.model.facts.license' | transloco }}</dt>
          <dd>{{ model().license }}</dd>
        </div>
        <div>
          <dt>{{ 'tool.model.facts.runs' | transloco }}</dt>
          <dd>{{ 'tool.model.facts.runsValue' | transloco }}</dd>
        </div>
        <div class="zero">
          <dt>{{ 'tool.model.facts.sent' | transloco }}</dt>
          <dd>{{ 'tool.model.facts.sentValue' | transloco }}</dd>
        </div>
      </dl>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .model {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.75fr);
      gap: 48px;
      max-width: 1080px;
      margin: 3vh auto 0;
      padding: 48px;
      border-radius: var(--r-xl);
      box-shadow: var(--shadow-lg);
    }
    .copy {
      display: grid;
      gap: 18px;
      align-content: start;
      justify-items: start;
    }
    h2 {
      font-size: clamp(32px, 4.2vw, 50px);
    }
    .lead {
      font-size: 17.5px;
      color: var(--ink-muted);
      max-width: 560px;
    }
    .actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 4px;
    }
    .small {
      font-size: 13.5px;
    }
    .waiting {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border: 1.5px dashed var(--line);
      border-radius: 999px;
      font-size: 14px;
      font-weight: 600;
    }
    .progress-block {
      display: grid;
      gap: 10px;
      width: min(100%, 460px);
    }
    .choices {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      width: 100%;
      margin: 0;
      padding: 0;
      border: 0;
    }
    .mini-label {
      grid-column: 1 / -1;
      margin-bottom: 4px;
      padding: 0;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ink-muted);
    }
    .choice {
      position: relative;
      display: grid;
      gap: 6px;
      align-content: start;
      padding: 14px 16px;
      border: 2px solid var(--line-soft);
      border-radius: var(--r);
      background: var(--card);
      cursor: pointer;
      transition:
        border-color 0.15s,
        box-shadow 0.15s;
      &:hover {
        border-color: var(--line);
      }
      &.on {
        border-color: var(--line);
        background: var(--yellow-soft);
        box-shadow: var(--shadow-sm);
      }
      &:has(input:focus-visible) {
        outline: 3px solid var(--accent);
        outline-offset: 3px;
      }
      input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }
    }
    .choice-head {
      display: flex;
      align-items: center;
      gap: 8px;
      b {
        font-family: var(--display);
        font-size: 22px;
        letter-spacing: -0.02em;
      }
    }
    .small-chip {
      min-height: 24px;
      padding: 0 9px;
      font-size: 12px;
    }
    .choice-text {
      font-size: 14px;
      color: var(--ink-muted);
      line-height: 1.45;
    }
    .choice-meta {
      font-size: 13px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      .ok {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--ok);
      }
    }
    .error {
      display: flex;
      gap: 10px;
      padding: 12px 14px;
      border: 2px solid var(--danger);
      border-radius: var(--r);
      color: var(--danger);
      div {
        display: grid;
        gap: 4px;
      }
      code {
        font-size: 12.5px;
        color: var(--ink-muted);
        overflow-wrap: anywhere;
      }
    }
    /* The model's label, like the sticker on a box. */
    .label {
      display: grid;
      align-content: start;
      align-self: start;
      margin: 0;
      border: 2px solid var(--line);
      border-radius: var(--r-lg);
      background: var(--paper);
      transform: rotate(1.5deg);
      overflow: hidden;
      div {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 16px;
        padding: 13px 18px;
        border-top: 1.5px dashed var(--line-soft);
        font-size: 14.5px;
      }
      dt {
        color: var(--ink-muted);
      }
      dd {
        margin: 0;
        font-weight: 600;
        text-align: right;
      }
      .label-head {
        grid-template-columns: 1fr;
        border-top: 0;
        background: var(--yellow);
        color: var(--on-yellow);
        dd {
          display: grid;
          text-align: left;
        }
        b {
          font-family: var(--display);
          font-size: 34px;
          letter-spacing: -0.03em;
          line-height: 1;
        }
        span {
          font-size: 13.5px;
          font-weight: 500;
        }
      }
      .zero dd {
        color: var(--ok);
      }
    }
    @media (max-width: 900px) {
      .model {
        grid-template-columns: minmax(0, 1fr);
        gap: 30px;
        padding: 28px 22px;
      }
      .label {
        transform: none;
      }
    }
    @media (max-width: 560px) {
      .choices {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class ModelStep {
  protected readonly store = inject(ImagesStore);
  private readonly transloco = inject(TranslocoService);
  private readonly lang = toSignal(this.transloco.langChanges$, { initialValue: this.transloco.getActiveLang() });
  protected readonly models = MODELS;
  protected readonly ids = MODEL_IDS;
  protected readonly model = computed(() => MODELS[this.store.model()]);
  readonly agree = output();
  readonly continue = output();
  readonly decline = output();
  protected readonly percent = computed(() => Math.round((this.store.modelDownload()?.progress ?? 0) * 100));

  /** Download size of a model on this device, in the reader's language ("179 Mo"). */
  protected size(id: ModelId): string {
    return formatBytes(this.store.modelBytes(id), this.lang());
  }
}
