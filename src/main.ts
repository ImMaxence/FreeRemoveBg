import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

let started = false;
const start = () => {
  if (started) return;
  started = true;
  bootstrapApplication(App, appConfig).catch((err) => console.error(err));
};

// The public pages arrive prerendered: the browser paints them first, then Angular takes over
// (hydration is one long task, and nothing is painted while it runs). A tab opened in the
// background gets no frames: the timer starts Angular there.
if (document.querySelector('app-root')?.childElementCount) {
  requestAnimationFrame(() => setTimeout(start));
  setTimeout(start, 250);
} else start();
