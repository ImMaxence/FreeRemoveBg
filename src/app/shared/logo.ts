import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The mark: a yellow sticker peeling off at one corner, showing the transparency grid under
 * it. Same drawing as public/favicon.svg.
 */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <clipPath [attr.id]="id"><path d="M60 36 V60 H36 Z" /></clipPath>
      </defs>
      <g [attr.clip-path]="'url(#' + id + ')'">
        <rect x="36" y="36" width="24" height="24" fill="#ffffff" />
        <path d="M36 36h6v6h-6zM48 36h6v6h-6zM42 42h6v6h-6zM54 42h6v6h-6zM36 48h6v6h-6zM48 48h6v6h-6zM42 54h6v6h-6zM54 54h6v6h-6z" fill="#cfc6b3" />
      </g>
      <path
        d="M18 4 H46 A14 14 0 0 1 60 18 V36 L36 60 H18 A14 14 0 0 1 4 46 V18 A14 14 0 0 1 18 4 Z"
        fill="#ffd60a"
        stroke="#16140f"
        stroke-width="4"
        stroke-linejoin="round"
      />
      <path d="M60 36 L36 60 L37 37 Z" fill="#fffdf8" stroke="#16140f" stroke-width="4" stroke-linejoin="round" />
      <path d="M23 12 C24 19 25.5 20.5 32 22 C25.5 23.5 24 25 23 32 C22 25 20.5 23.5 14 22 C20.5 20.5 22 19 23 12 Z" fill="#16140f" />
    </svg>
  `,
  host: { style: 'display:inline-flex;flex:none' },
})
export class Logo {
  readonly size = input(32);
  protected readonly id = `frb-c-${Math.random().toString(36).slice(2, 8)}`;
}
