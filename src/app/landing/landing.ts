import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ImagesStore } from '../core/images.store';
import { AI_FACTS, BROWSERS, COMPARE, FAQ, FEATURES, PRIVACY_POINTS, STEPS } from '../core/landing-content';
import { AI_SHEETS, SHEET_IDS, type SheetId } from '../core/models';
import { SAMPLES } from '../core/samples';
import { REPO_URL } from '../core/version';
import { Icon } from '../shared/icon';
import { Reveal } from '../shared/reveal';
import { LassoSpot } from './lasso-spot';
import { ZonesSpot } from './zones-spot';

type ArtMode = 'photo' | 'cutout' | 'background';

/** The home page: what the tool does, with which AI, and how private it is. */
@Component({
  selector: 'app-landing',
  imports: [RouterLink, TranslocoPipe, Icon, Reveal, LassoSpot, ZonesSpot],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.dragging]': 'dragging()',
    '(document:paste)': 'onPaste($event)',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
  },
})
export class Landing {
  private readonly store = inject(ImagesStore);
  private readonly router = inject(Router);

  protected readonly repoUrl = REPO_URL;
  protected readonly models = AI_SHEETS;
  protected readonly modelIds = SHEET_IDS;
  /** The model whose spec sheet is shown. */
  protected readonly spec = signal<SheetId>('isnet');
  protected readonly specModel = computed(() => AI_SHEETS[this.spec()]);
  protected readonly steps = STEPS;
  protected readonly facts = AI_FACTS;
  protected readonly features = FEATURES;
  protected readonly compareRows = COMPARE;
  protected readonly privacyPoints = PRIVACY_POINTS;
  protected readonly browsers = BROWSERS;
  protected readonly faq = FAQ;
  protected readonly modes: ArtMode[] = ['photo', 'cutout', 'background'];
  protected readonly ticker = ['zones', 'lasso', 'free', 'ai', 'noUpload', 'fullSize', 'batch', 'offline', 'noAccount'];
  protected readonly aiPoints = ['precise', 'choice', 'local', 'open'];

  /** What the hero picture shows: the photo, the cutout, or the cutout on a new background. */
  protected readonly mode = signal<ArtMode>('cutout');
  protected readonly dragging = signal(false);

  /** Arrows move between the spec sheet's tabs. */
  protected onSpecKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = (SHEET_IDS.indexOf(this.spec()) + (event.key === 'ArrowRight' ? 1 : SHEET_IDS.length - 1)) % SHEET_IDS.length;
    this.spec.set(SHEET_IDS[index]);
    (event.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(`#spec-tab-${SHEET_IDS[index]}`)?.focus();
  }

  protected trySample(): void {
    const sample = SAMPLES[0];
    void this.store.addFromUrl(sample.url, sample.name);
    void this.router.navigateByUrl('/app');
  }

  private open(files: File[]): void {
    void this.store.add(files);
    void this.router.navigateByUrl('/app');
  }

  protected onPaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!files.length) return;
    event.preventDefault();
    this.open(files);
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
    event.preventDefault();
    this.dragging.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length) this.open(files);
  }
}
