import { Observable } from 'rxjs';
import { Candles } from './candles';

export interface AlgorithmResult {
  entry?: Observable<boolean>;
  exit?: Observable<boolean>;
  entryTarget?: Observable<number>;
  exitTarget?: Observable<number>;
  entryStop?: Observable<number>;
  exitStop?: Observable<number>;
  rank?: Observable<number>;

  // eslint-disable-next-line
  state?: Record<string, Observable<any>>;
}

export type Algorithm = (candles: Candles) => AlgorithmResult;