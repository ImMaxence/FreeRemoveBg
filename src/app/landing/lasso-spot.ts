import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../shared/icon';
import { Reveal } from '../shared/reveal';

/**
 * The home page's "New" section: the lasso, with an animated demo (a shape drawn around the
 * grass the AI left on the cat, cut out, then brought back with Ctrl + Z).
 */
@Component({
  selector: 'section[app-lasso-spot]',
  imports: [RouterLink, TranslocoPipe, Icon, Reveal],
  templateUrl: './lasso-spot.html',
  styleUrl: './lasso-spot.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LassoSpot {
  /** The three steps, and the shape of the demo, in pixels of the 480 × 600 picture. */
  protected readonly lassoSteps = ['points', 'close', 'apply'];
  protected readonly demoPoints: [number, number][] = [
    [292, 418],
    [297, 442],
    [262, 505],
    [222, 594],
    [170, 594],
    [174, 556],
    [240, 470],
  ];
  protected readonly demoPath = 'M' + this.demoPoints.map((p) => p.join(' ')).join('L') + 'Z';
}
