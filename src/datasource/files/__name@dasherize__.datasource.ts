import { CollectionViewer, DataSource } from '@angular/cdk/collections';
import { Store, select } from '@ngrx/store';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

export class <%= classify(name) %>DataSource implements DataSource<<%= classify(name) %>> {
  private subject = new BehaviorSubject<<%= classify(name) %>[]>([]);

  constructor(private store: Store<AppState>) {}

  load(page: PageQuery, scheduleId: number) {
    this.store
      .pipe(
        select(selectInteractionsPage(page, scheduleId)),
        tap((interactions) => {
          if (interactions.length > 0) {
            this.interactionsSubject.next(interactions);
          }
        }),
        catchError(() => of([]))
      )
      .subscribe();
  }

  connect(collectionViewer: CollectionViewer): Observable<<%= classify(name) %>[]> {
    return this.subject.asObservable();
  }

  disconnect(collectionViewer: CollectionViewer): void {
    this.subject.complete();
  }
}
