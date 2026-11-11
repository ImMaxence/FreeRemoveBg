import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, map, of } from 'rxjs';
import { APP_VERSION, CHANGELOG_URL, REPO_URL } from '../core/version';
import { Icon } from '../shared/icon';
import { parseChangelog } from './changelog-parser';

@Component({
  selector: 'app-changelog',
  imports: [TranslocoPipe, Icon],
  templateUrl: './changelog.html',
  styleUrl: './changelog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Changelog {
  protected readonly version = APP_VERSION;
  protected readonly changelogUrl = CHANGELOG_URL;
  protected readonly repoUrl = REPO_URL;

  protected readonly releases = toSignal(
    inject(HttpClient)
      .get('/CHANGELOG.md', { responseType: 'text' })
      .pipe(
        map(parseChangelog),
        catchError(() => of(null)),
      ),
    { initialValue: undefined },
  );
}
