import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ImagesStore } from '../core/images.store';
import { SAMPLES } from '../core/samples';
import { Icon } from '../shared/icon';
import { Reveal } from '../shared/reveal';

/**
 * The home page's "New" section for the zones: four dogs on one photo, a frame drawn around each,
 * cut out together on the same picture, or as four separate pictures.
 */
@Component({
  selector: 'section[app-zones-spot]',
  imports: [TranslocoPipe, Icon, Reveal],
  templateUrl: './zones-spot.html',
  styleUrl: './zones-spot.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZonesSpot {
  private readonly store = inject(ImagesStore);
  private readonly router = inject(Router);
  protected readonly steps = ['draw', 'together', 'split'];
  /** The zones of the demo, in pixels of the 960 × 641 photo: one around each dog. */
  protected readonly zones: [number, number, number, number][] = [
    [250, 210, 170, 285],
    [385, 222, 95, 300],
    [415, 158, 190, 445],
    [608, 252, 215, 335],
  ];

  /** Opens the tool with the four dogs, ready to be prepared. */
  protected tryDogs(): void {
    const sample = SAMPLES.find((s) => s.id === 'dogs')!;
    void this.store.addFromUrl(sample.url, sample.name);
    void this.router.navigateByUrl('/app');
  }

  protected percent(value: number, of: number): number {
    return (value / of) * 100;
  }
}
