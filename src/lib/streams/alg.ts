import { Observable } from 'rxjs';

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

export interface IntermediateAlgorithmResult {
  entry?: boolean;
  exit?: boolean;

  entryTarget?: number;
  exitTarget?:  number;
  entryStop?:   number;
  exitStop?:    number;

  rank?: number;

  // eslint-disable-next-line
  state?: Record<string, Observable<any>>;
}

export interface ExtendedAlgorithmResult extends IntermediateAlgorithmResult {
    close?: number;
}