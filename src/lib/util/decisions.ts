import { combineLatest, Observable, Subject, Subscription } from 'rxjs';
import { bufferCount, filter, map } from 'rxjs/operators';
import { Price } from '../streams/price';

export class Decision<T> extends Subject<boolean> {
  _subscription: Subscription;

  constructor(a: Observable<T>, b: Observable<T>, operator: (valA: T, valB: T) => boolean) {
      super();

      this._subscription = combineLatest([a, b])
          .pipe(
              map(([mapValA, mapValB]) => operator(mapValA, mapValB)),
              bufferCount(2, 1),
              filter(([prev, curr]) => prev !== curr),
              map((arrVal) => arrVal[1])
          )
          .subscribe((decision: boolean) => {
              this.next(decision);
          });
  }

  complete(): void {
      this._subscription.unsubscribe();
      super.complete();
  }
}

export class Crossover extends Decision<number> {
    constructor(a: Price, b: Price) {
        super(a, b, (a, b) => a > b);
    }
}

export class NegativeCrossover extends Decision<number> {
    constructor(a: Price, b: Price) {
        super(a, b, (a, b) => a < b);
    }
}