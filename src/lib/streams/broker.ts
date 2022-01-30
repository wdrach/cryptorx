import { Observable, Subject } from 'rxjs';
import { bufferCount, filter, map, pluck, skipWhile, takeUntil, withLatestFrom } from 'rxjs/operators';
import { CoinbaseGranularity, CoinbaseProduct } from '../constants';
import { CoinbaseProSimulation } from '../sources/coinbase';
import { AlgorithmResult, ExtendedAlgorithmResult } from './alg';
import { Candle, Candles, MappedCandles } from './candles';
import { Wallet } from './wallet';

export class Broker {
    unsubscriber = new Subject<void>();
    _sim: CoinbaseProSimulation;
    _alg: (candle: Candles) => AlgorithmResult;
    _wallet: Wallet;
    
    _theBigDb: Record<string, Record<string, ExtendedAlgorithmResult>> = {};

    constructor(wallet: Wallet, sim: CoinbaseProSimulation, alg: (candle: Candles) => AlgorithmResult) {
      this._sim = sim;
      this._alg = alg;
      this._wallet = wallet;
    }

    async init(): Promise<void> {

      for (const product of this._sim.products) {
        const candles = new Candles();
        this._sim.pipe(takeUntil(this.unsubscriber), pluck(product), filter((val) => !!val)).subscribe((c) => candles.next(c));
        const algResult = this._alg(candles);

        if (!algResult.rank && product !== 'ETH-USD') continue;

        if (product === 'ETH-USD') {
          candles.pipe(takeUntil(this.unsubscriber)).subscribe((candle) => {
            if (!this._wallet.startingPrice) this._wallet.startingPrice = candle.close;
            this._wallet.endingPrice = candle.close;
          });
        }

        // rank, entrytarget, exittarget, entry, exit, entrystop, exitstop
        const observables: Record<string, Observable<number | boolean>> = {};

        if (algResult.rank) observables.rank = algResult.rank;
        if (algResult.entry) observables.entry = algResult.entry;
        if (algResult.entryTarget) observables.entryTarget = algResult.entryTarget;
        if (algResult.entryStop) observables.entryStop = algResult.entryStop;
        if (algResult.exit) observables.exit = algResult.exit;
        if (algResult.exitStop) observables.exitStop = algResult.exitStop;
        if (algResult.exitTarget) observables.exitTarget = algResult.exitTarget;

        candles.time().pipe(withLatestFrom(candles.close(), ...(Object.values(observables) as Observable<number|boolean>[]))).subscribe((untypedResult) => {
          const results = untypedResult as (number|boolean)[];
          const result: Record<string, number | boolean> = {};
          const keys = Object.keys(observables);

          keys.forEach((val, i) => {
            const resultVal = results[i + 2] as number|boolean;
            result[val] = resultVal;
          });

          result.close = results[1] as number;

          const intermediateAlgResult = result as ExtendedAlgorithmResult;

          const time = results[0] as number;

          if (!this._theBigDb[time]) this._theBigDb[time] = {};

          this._theBigDb[time][product] = intermediateAlgResult;
        });
      }
    }

    calculate(): void {
      const timestamps = Object.keys(this._theBigDb).sort((a, b) => parseInt(a) - parseInt(b));

      for (const timestamp of timestamps) {
        const val = this._theBigDb[timestamp];

        if (this._wallet.dollars) {
          // out of market
          let options = ['ETH-USD'];
          if (Object.keys(val).length > 1) {
            options = Object.keys(val).filter((key) => val[key].entry).sort((a, b) => (val[b].rank || 0) - (val[a].rank || 0));
          }

          if (!val[options[0]]) continue;

          // TODO - stop/limit orders
          if (options.length && !val[options[0]].exit) {
            this._wallet.buy(options[0] as CoinbaseProduct, val[options[0]].close);
          }
        } else {
          // in market
          if (val[this._wallet.currentCoin] && val[this._wallet.currentCoin].exit) {
            this._wallet.sell(val[this._wallet.currentCoin].close);
          }
        }
      }
    }

    complete(): void {
      this.unsubscriber.next();
      this.unsubscriber.complete();
    }
}

export class ComparisonBroker {
    unsubscriber = new Subject<void>();
    _sim: CoinbaseProSimulation;
    _alg: (candle: Candles) => AlgorithmResult;
    _wallet: Wallet;
    constructor(wallet: Wallet, sim: CoinbaseProSimulation, alg: (candle: Candles) => AlgorithmResult) {
      this._sim = sim;
      this._alg = alg;
      this._wallet = wallet;
    }

    async init(): Promise<void> {
      const candles = new Candles();
      this._sim.pipe(takeUntil(this.unsubscriber), pluck('ETH-USD'), filter((val) => !!val)).subscribe((c) => candles.next(c));
      const algResult = this._alg(candles);
      // rank, entrytarget, exittarget, entry, exit, entrystop, exitstop
      const observables: Record<string, Observable<number | boolean>> = {};

      if (algResult.rank) observables.rank = algResult.rank;
      if (algResult.entry) observables.entry = algResult.entry;
      if (algResult.entryTarget) observables.entryTarget = algResult.entryTarget;
      if (algResult.entryStop) observables.entryStop = algResult.entryStop;
      if (algResult.exit) observables.exit = algResult.exit;
      if (algResult.exitStop) observables.exitStop = algResult.exitStop;
      if (algResult.exitTarget) observables.exitTarget = algResult.exitTarget;

      candles.time().pipe(withLatestFrom(candles.close(), ...(Object.values(observables) as Observable<number|boolean>[]))).subscribe((untypedResult) => {
        const results = untypedResult as (number|boolean)[];
        const result: Record<string, number | boolean> = {};
        const keys = Object.keys(observables);

        keys.forEach((val, i) => {
          const resultVal = results[i + 2] as number|boolean;
          result[val] = resultVal;
        });

        result.close = results[1] as number;

        if (!this._wallet.startingPrice) this._wallet.startingPrice = result.close;
        this._wallet.endingPrice = result.close;

        if (this._wallet.dollars && result.entry) {
          // TODO - stop and limit orders
          this._wallet.buy(CoinbaseProduct.ETH_USD, result.close);
        } else if (!this._wallet.dollars && result.exit) {
          this._wallet.sell(result.close);
        }
      });
    }

    complete(): void {
      this.unsubscriber.next();
      this.unsubscriber.complete();
    }
}

export function safeStop(entry: Observable<boolean>, candles: Candles): Observable<number> {
  return entry.pipe(withLatestFrom(candles), bufferCount(2, 1), map(([prev, curr]) => {
    const [prevVal, prevCandle] = prev;
    const [currVal] = curr;
    if (!prevVal && currVal) {
      return prevCandle.low;
    }

    return 0;
  }), filter((val) => !!val));
}

export function maxStop(entry: Observable<boolean>, candles: Candles, stop = 30): Observable<number> {
  return entry.pipe(withLatestFrom(candles), map(([val, candle]) => {
    if (val) {
      return candle.open * (100 - stop) / 100;
    }

    return 0;
  }), filter((val) => !!val));
}

export function condenseCandles(c: Candles): Candles {
  const ratio = CoinbaseGranularity.DAY / CoinbaseGranularity.HOUR;

  const candleMap = c.pipe(skipWhile((c) => {
    const time = c.time;
    const timeSinceMidnight = time % (24 * 60 * 60);
    // 1 hour before the close of the day
    const timeToSkipTo = CoinbaseGranularity.DAY - CoinbaseGranularity.HOUR;
    const returnVal = timeSinceMidnight !== timeToSkipTo;

    return returnVal;
  }), bufferCount(ratio, ratio), map((values) => {
    // tlhocv: Array<number>
    const tlhocv = [
      values[0].time,
      Math.min(...values.map((val) => val.low)),
      Math.max(...values.map((val) => val.high)),
      values[0].open,
      values[values.length - 1].close,
      values.reduce((tv, v) => tv + v.volume, 0)
    ];
    return new Candle(tlhocv);
  }));

  const candles = new MappedCandles(candleMap);
  return candles;
}

export function jumpCandles(c: Candles): Candles {
  const ratio = CoinbaseGranularity.DAY / CoinbaseGranularity.HOUR;

  const candleMap = c.pipe(skipWhile((c) => {
    const time = c.time;
    const timeSinceMidnight = time % (24 * 60 * 60);
    // 2 hours before the close of the day
    const timeToSkipTo = CoinbaseGranularity.DAY - (2*CoinbaseGranularity.HOUR);
    const returnVal = timeSinceMidnight !== timeToSkipTo;

    return returnVal;
  }), bufferCount(ratio, ratio), map((values) => {
    return values[values.length - 1];
  }));

  const candles = new MappedCandles(candleMap);
  return candles;
}