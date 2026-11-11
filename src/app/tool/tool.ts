import { ChangeDetectionStrategy, Component, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { localizedPath } from '../core/i18n';
import { ImagesStore } from '../core/images.store';
import { MODELS, type ModelId } from '../core/models';
import type { Sample } from '../core/samples';
import { ACCEPTED_TYPES } from '../engine/files';
import { Dropzone } from '../shared/dropzone';
import { Icon } from '../shared/icon';
import { ModelStep } from './model-step';
import { PrepareView } from './prepare-view';
import { ResultView } from './result-view';

type View = 'checking' | 'model' | 'images' | 'prepare' | 'result';
type StepState = 'done' | 'current' | 'todo';

interface LaunchParams {
  files: { getFile(): Promise<File> }[];
}

/**
 * The tool, as four steps: agree to the AI model (only the first time), add pictures,
 * prepare them (optional), then cut them out and export. Rendered in the browser only.
 */
@Component({
  selector: 'app-tool',
  imports: [TranslocoPipe, Icon, Dropzone, ModelStep, PrepareView, ResultView],
  templateUrl: './tool.html',
  styleUrl: './tool.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.dragging]': 'dragging()',
    '(document:paste)': 'onPaste($event)',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
  },
})
export class Tool {
  protected readonly store = inject(ImagesStore);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  protected readonly accept = ACCEPTED_TYPES;
  protected readonly dragging = signal(false);
  /** The user asked for the model in this visit, and has not moved on yet. */
  private readonly asked = signal(false);
  private readonly continued = signal(false);

  protected readonly view = computed<View>(() => {
    const state = this.store.modelState();
    if (state === 'checking') return 'checking';
    if (state === 'missing' || state === 'error') return 'model';
    if (this.asked() && !this.continued() && (state === 'downloading' || state === 'preparing')) return 'model';
    const item = this.store.selected();
    if (!item) return 'images';
    return item.status === 'draft' ? 'prepare' : 'result';
  });

  /** Model progress in a few words, for the stepper. */
  protected readonly modelNote = computed(() => {
    const state = this.store.modelState();
    if (state === 'downloading') return `${Math.round((this.store.modelDownload()?.progress ?? 0) * 100)} %`;
    if (state === 'preparing') return this.transloco.translate('tool.steps.preparing');
    if (state === 'ready') return this.transloco.translate('tool.steps.ready');
    return this.transloco.translate('tool.steps.modelNote');
  });

  protected readonly steps = computed<{ id: string; state: StepState }[]>(() => {
    const view = this.view();
    const item = this.store.selected();
    const order: View[] = ['model', 'images', 'prepare', 'result'];
    const at = view === 'checking' ? 0 : order.indexOf(view);
    return order.map((id, index) => {
      let state: StepState = index < at ? 'done' : index === at ? 'current' : 'todo';
      if (id === 'model' && this.store.modelAllowed() && view !== 'model') state = 'done';
      if (id === 'result' && item?.status === 'done') state = view === 'result' ? 'current' : 'done';
      return { id, state };
    });
  });

  constructor() {
    // ?device=wasm and ?model=… impose the processor or a model (tests, broken graphics drivers).
    const params = inject(ActivatedRoute).snapshot.queryParamMap;
    const model = params.get('model');
    if (params.get('device') === 'wasm' || model) {
      this.store.configure({ device: params.get('device') === 'wasm' ? 'wasm' : undefined, model: model && model in MODELS ? (model as ModelId) : undefined });
    }
    // A new step starts at the top: after "Cut out" on a phone, the result is above the button.
    let previous: View | null = null;
    effect(() => {
      const view = this.view();
      untracked(() => {
        if (previous && previous !== view && typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        previous = view;
      });
    });
    afterNextRender(() => {
      void this.store.checkModel();
      // "Open with FreeRemoveBg" (installed app) hands its files over here.
      const queue = (window as unknown as { launchQueue?: { setConsumer(consumer: (params: LaunchParams) => void): void } }).launchQueue;
      queue?.setConsumer(async (launch) => {
        if (launch.files.length) void this.store.add(await Promise.all(launch.files.map((f) => f.getFile())));
      });
    });
  }

  // --- Model ---------------------------------------------------------------------------------

  protected agree(): void {
    this.asked.set(true);
    void this.store.downloadModel();
  }

  protected continue(): void {
    this.continued.set(true);
  }

  protected decline(): void {
    void this.router.navigateByUrl(localizedPath('/', this.transloco.getActiveLang()));
  }

  // --- Pictures in ---------------------------------------------------------------------------

  protected add(files: File[]): void {
    void this.store.add(files);
  }

  protected addSample(sample: Sample): void {
    void this.store.addFromUrl(sample.url, sample.name);
  }

  protected onPick(picker: HTMLInputElement): void {
    const files = Array.from(picker.files ?? []);
    picker.value = '';
    if (files.length) this.add(files);
  }

  protected onPaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!files.length) return;
    event.preventDefault();
    this.add(files);
  }

  protected onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) this.dragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    if (event.defaultPrevented) return;
    event.preventDefault();
    this.dragging.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length) this.add(files);
  }

  protected stateKey(status: string): string {
    return `tool.state.${status}`;
  }
}
