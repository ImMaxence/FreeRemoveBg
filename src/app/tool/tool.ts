import { ChangeDetectionStrategy, Component, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { isPhone } from '../core/device';
import { localizedPath } from '../core/i18n';
import { ImagesStore } from '../core/images.store';
import { SamService } from '../core/sam.service';
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

const NOTICE_KEY = 'frb-slow-notice';

/** The slow-device notice was closed during this visit. */
function readNoticeHidden(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(NOTICE_KEY) === '1';
  } catch {
    return false;
  }
}

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
  /** The model step, opened again from the stepper to choose another model. */
  private readonly browsingModels = signal(false);

  private readonly forcedCpu: boolean;
  private readonly noticeHidden = signal(readNoticeHidden());
  /**
   * A word of warning where the AI is slow: on a phone, or when the browser offers no graphics
   * card (known once the catalog of models is in). Not when the processor was asked for (tests).
   */
  protected readonly slowNotice = computed<'phone' | 'cpu' | null>(() => {
    // Shown with the first step, not above the "checking" line: nothing moves on the page.
    if (this.noticeHidden() || this.view() === 'checking') return null;
    if (isPhone()) return 'phone';
    const device = this.store.catalog()[0]?.device;
    return device === 'wasm' && !this.forcedCpu ? 'cpu' : null;
  });

  /** The first look in the browser cache is over: later checks (another model) keep the page as it is. */
  private readonly settled = signal(false);
  private readonly inModelStep = signal(false);

  protected readonly view = computed<View>(() => {
    if (this.browsingModels()) return 'model';
    const state = this.store.modelState();
    if (state === 'checking') {
      if (!this.settled()) return 'checking';
      if (this.inModelStep()) return 'model';
    } else if (state === 'missing' || state === 'error') return 'model';
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

  protected readonly steps = computed<{ id: View; state: StepState; reachable: boolean }[]>(() => {
    const view = this.view();
    const item = this.store.selected();
    const order: View[] = ['model', 'images', 'prepare', 'result'];
    const at = view === 'checking' ? 0 : order.indexOf(view);
    return order.map((id, index) => {
      let state: StepState = index < at ? 'done' : index === at ? 'current' : 'todo';
      if (id === 'model' && this.store.modelAllowed() && view !== 'model') state = 'done';
      if (id === 'result' && item?.status === 'done') state = view === 'result' ? 'current' : 'done';
      return { id, state, reachable: id !== view && this.canGo(id) };
    });
  });

  /** Steps the stepper leads to: once the model is agreed to, every step already reached. */
  private canGo(step: View): boolean {
    if (!this.store.modelAllowed()) return false;
    const items = this.store.items();
    switch (step) {
      case 'model':
      case 'images':
        return true;
      case 'prepare':
        return this.pictureToPrepare() !== undefined;
      case 'result':
        return items.some((i) => i.status === 'done');
      default:
        return false;
    }
  }

  /** The picture "Prepare" leads to: the one on screen if it can be prepared, else the first that can. */
  private pictureToPrepare() {
    const free = (i: { status: string }) => i.status === 'draft' || i.status === 'done' || i.status === 'error';
    const selected = this.store.selected();
    return selected && free(selected) ? selected : this.store.items().find(free);
  }

  /** A click on a step of the stepper: back to it, or on to it once reached. */
  protected goTo(step: View): void {
    const store = this.store;
    if (step === 'model') {
      this.browsingModels.set(true);
      return;
    }
    this.browsingModels.set(false);
    if (step === 'images') {
      store.selectedId.set(null);
    } else if (step === 'prepare') {
      const item = this.pictureToPrepare();
      if (!item) return;
      store.selectedId.set(item.id);
      if (item.status === 'draft') return;
      if (item.undo.length && !confirm(this.transloco.translate('tool.result.backConfirm'))) return;
      store.backToPrepare(item.id);
    } else if (step === 'result') {
      const selected = store.selected();
      const item = selected?.status === 'done' ? selected : store.items().find((i) => i.status === 'done');
      if (item) store.selectedId.set(item.id);
    }
  }

  /** Back from the list of pictures (step 2) to the first one still to prepare, or the first one. */
  protected resume(): void {
    const items = this.store.items();
    const item = items.find((i) => i.status === 'draft') ?? items[0];
    if (item) this.store.selectedId.set(item.id);
  }

  constructor() {
    // ?device=wasm and ?model=… impose the processor or a model (tests, broken graphics drivers).
    const params = inject(ActivatedRoute).snapshot.queryParamMap;
    const model = params.get('model');
    this.forcedCpu = params.get('device') === 'wasm';
    if (this.forcedCpu) {
      this.store.configure({ device: 'wasm' });
      inject(SamService).configure({ device: 'wasm' });
    }
    if (model && model in MODELS) this.store.selectModel(model as ModelId);
    effect(() => {
      const state = this.store.modelState();
      const view = this.view();
      untracked(() => {
        if (state !== 'checking') this.settled.set(true);
        this.inModelStep.set(view === 'model');
      });
    });

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
    this.browsingModels.set(false);
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

  protected hideNotice(): void {
    this.noticeHidden.set(true);
    try {
      sessionStorage.setItem(NOTICE_KEY, '1');
    } catch {
      // Private mode: it comes back on the next page load.
    }
  }

  protected stateKey(status: string): string {
    return `tool.state.${status}`;
  }
}
