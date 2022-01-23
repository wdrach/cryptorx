import { Observable, Subject, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { Price } from '../streams/price';

export const bollingerBand = (upper: boolean, ma: number, deviations: number, stddev: number): number => {
    return upper ? (ma + (deviations * stddev)) : (ma - (deviations * stddev));
};

export const stddev = (sma: number, values: number[]): number => {
    const variance = values.reduce((acc, val) => acc + Math.pow((val - sma), 2), 0) / values.length;
    return Math.sqrt(variance);
};

export class Distance extends Subject<number> {
  _subscription: Subscription;

  constructor(a: Price, b: number) {
      super();

      this._subscription = a
          .pipe(
              map((val) => val - b)
          )
          .subscribe((decision: number) => {
              this.next(decision);
          });
  }

  inverse(): Observable<number> {
      return this.pipe(map((val) => 1/val));
  }

  complete(): void {
      this._subscription.unsubscribe();
      super.complete();
  }
}