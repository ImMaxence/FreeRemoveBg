import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ImagesStore } from '../core/images.store';
import { BROWSERS, COMPARE, FAQ, FEATURES, PRIVACY_POINTS, STEPS } from '../core/landing-content';
import { MODELS, MODEL_IDS } from '../core/models';
import type { Sample } from '../core/samples';
import { REPO_URL } from '../core/version';
import { Dropzone } from '../shared/dropzone';
import { Icon } from '../shared/icon';
import { Reveal } from '../shared/reveal';

/** The home page: presents the project, and takes pictures straight into the tool. */
@Component({
  selector: 'app-landing',
  imports: [RouterLink, TranslocoPipe, Icon, Reveal, Dropzone],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:paste)': 'onPaste($event)' },
})
export class Landing {
  private readonly store = inject(ImagesStore);
  private readonly router = inject(Router);

  protected readonly repoUrl = REPO_URL;
  protected readonly features = FEATURES;
  protected readonly steps = STEPS;
  protected readonly compareRows = COMPARE;
  protected readonly privacyPoints = PRIVACY_POINTS;
  protected readonly browsers = BROWSERS;
  protected readonly faq = FAQ;
  protected readonly models = MODEL_IDS.map((id) => ({ id, ...MODELS[id] }));
  protected readonly engines = ['gpu', 'cpu'];
  protected readonly showcase = ['transparent', 'color', 'gradient', 'photo'];
  /** Position of the before / after divider of the demo, in percent. */
  protected readonly split = signal(50);

  protected open(files: File[]): void {
    void this.store.add(files);
    void this.router.navigateByUrl('/app');
  }

  protected openSample(sample: Sample): void {
    void this.store.addFromUrl(sample.url, sample.name);
    void this.router.navigateByUrl('/app');
  }

  protected onPaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!files.length) return;
    event.preventDefault();
    this.open(files);
  }

  protected value(event: Event): number {
    return +(event.target as HTMLInputElement).value;
  }
}
