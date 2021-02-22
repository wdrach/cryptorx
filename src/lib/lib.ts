
import { Observable, Subject, Subscription, zip } from 'rxjs';
import { map, pluck } from 'rxjs/operators';
import WS from 'ws';
import axios from 'axios';

// TODO - this should be all products
// https://api.pro.coinbase.com/products
export type CoinbaseProduct = 'BTC-USD';
export type CoinbaseGranularity = 60 | 300 | 900 | 3600 | 21600 | 86400;

const COINBASE_API = 'https://api.pro.coinbase.com';
export const COINBASE_EARLIEST_TIMESTAMP = 1437428220000;

export class Candle {
  time: number;
  low: number;
  high: number;
  open: number;
  close: number;
  volume: number;

  constructor(tlhocv: Array<number>) {
    this.time = tlhocv[0];
    this.low = tlhocv[1];
    this.high = tlhocv[2];
    this.open = tlhocv[3];
    this.close = tlhocv[4];
    this.volume = tlhocv[5];
  }

  toString() {
    return `=======================
time:   ${this.time}
low:    ${this.low}
high:   ${this.high}
open:   ${this.open}
close:  ${this.close}
volume: ${this.volume}
=======================`;
  }
}

export class Price extends Subject<number> {
  _subscription: Subscription | undefined;

  constructor(input?: Subject<any> | Observable<any>, key?: string) {
    super();

    if (input) {
      let inputObs: Observable<number> | Subject<number> = key ? input.pipe(pluck(key)) : input;
      this._subscription = inputObs.subscribe((val: any) => {
        this.next(val);
      });
    }
  }

  sma(period: number): Observable<number> {
    let values: Array<number> = [];
    const reducer = map((val: number) => {
      if (values.length >= period) {
        values.shift();
      }
      values.push(val);
      return (values.reduce((a, b) => a + b, 0) / values.length);
    });

    return this.pipe(reducer);
  }

  unsubscribe() {
    if (this._subscription) {
      this._subscription.unsubscribe();
    }
    super.unsubscribe();
  }
}

export class CoinbaseProPrice extends Price {
  constructor(product: CoinbaseProduct = 'BTC-USD') {
    super();

    const ws = new WS('wss://ws-feed.pro.coinbase.com');

    ws.addEventListener('message', (ev: any) => {
      const data = JSON.parse(ev.data);

      const currentPrice = parseFloat(data.price);

      if (isNaN(currentPrice)) return;

      this.next(currentPrice);
    });

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        type: 'subscribe',
        channels: [{name: 'ticker', product_ids: [product]}]
      }));
    });
  }
}

export const _fetchCandles = async (product: CoinbaseProduct, prefetch: number, period: CoinbaseGranularity, current: number, endTime?: number):Promise<Candle[]> => {
  const inputEndTime = endTime;
  const inputCurrent = current;

  // go forward one candle's worth
  const startDate = new Date(current);
  const startStr = startDate.toISOString();

  current += 300*period*1000;

  let cancel = false
  if (!endTime) endTime = Date.now();
  if (endTime <= current) {
    current = endTime;
    cancel = true;
  }

  const endDate = new Date(current);
  const endStr = endDate.toISOString();

  // bump cur by 1 more minute before updating so we don't overlap that minute
  current += 60*1000;

  const query = 'start=' + startStr + '&end=' + endStr;

  let data;

  try {
    data = await axios.get(`${COINBASE_API}/products/${product}/candles?${query}`)
  } catch (e) {
    let prom = new Promise<Candle[]>((resolve) => {
      setTimeout(async () => {
        resolve(await _fetchCandles(product, prefetch, period, inputCurrent, inputEndTime));
      }, 1500)
    });

    return await prom;
  }

  if (data) {
    const body = data.data;
    const snapshot = body.reverse().map((bucket: Array<number>) => {
      return new Candle(bucket);
    });
    if (!cancel) snapshot.push(...await _fetchCandles(product, prefetch, period, current, endTime));
    return snapshot;
  }

  return [];
}

export class CoinbaseProCandle extends Subject<Candle> {
  _timeout: NodeJS.Timeout | undefined;

  /**
   * Constructs and prefetches a Subject of historical CoinbaseProCandles
   * 
   * @param product A string of the Coinbase product to query for.
   * @param prefetch The number of candles to prefetch
   * @param period The granularity, in seconds, of how large the candles are
   * @param timestamp For testing & simulation only, use to fetch a set number of historical candles starting at this timestamp
   */
  constructor(product: CoinbaseProduct = 'BTC-USD', prefetch: number = 300, period: CoinbaseGranularity = 60, timestamp?: number) {
    super();

    let startTime = timestamp || (Date.now() - (prefetch * period * 1000));
    let endTime = timestamp ? timestamp + (prefetch * period * 1000) : undefined;

    _fetchCandles(product, prefetch, period, startTime, endTime).then((candles: Array<Candle>) => {
      for (let candle of candles) {
        this.next(candle);
      }

      if (timestamp) {
        this.complete();
        return;
      }

      let lastTimestamp = candles[candles.length - 1].time;
      const now = Date.now() / 1000;
      const diff = now - lastTimestamp;
      let delay = (2 * period) - diff;

      if (delay < 0) delay = 0;

      this._timeout = setTimeout(async () => {
        const timeoutCandles = await _fetchCandles(product, 2, period, (lastTimestamp + period)*1000);
        for (let candle of timeoutCandles) {
          this.next(candle);
        }

        lastTimestamp = timeoutCandles[timeoutCandles.length - 1].time;

        this._timeout = setInterval(async () => {
          const intervalCandles = await _fetchCandles(product, 2, period, (lastTimestamp + period)*1000);
          for (let candle of intervalCandles) {
            this.next(candle);
          }
  
          lastTimestamp = intervalCandles[intervalCandles.length - 1].time;
        }, 1000 * period)
      }, 1000 * delay)
    });
  }

  time(): Observable<number> {
    return this.pipe(pluck('time'))
  }

  open(): Price {
    return new Price(this.pipe(pluck('open')));
  }

  close(): Price {
    return new Price(this.pipe(pluck('close')));
  }

  high(): Price {
    return new Price(this.pipe(pluck('high')));
  }

  low(): Price {
    return new Price(this.pipe(pluck('low')));
  }

  volume(): Observable<number> {
    return this.pipe(pluck('volume'));
  }

  unsubscribe() {
    if (this._timeout) {
      clearTimeout(this._timeout);
    }

    super.unsubscribe();
  }
}

export class CoinbaseProSimulation extends CoinbaseProCandle {
  constructor(product: CoinbaseProduct = 'BTC-USD', prefetch: number = 2400, period: CoinbaseGranularity = 60) {
    let last = Date.now() - (prefetch * period * 1000);
    if (last < COINBASE_EARLIEST_TIMESTAMP) {
      last = COINBASE_EARLIEST_TIMESTAMP;
    }

    let timestamp = Math.floor(Math.random() * (last - COINBASE_EARLIEST_TIMESTAMP)) + COINBASE_EARLIEST_TIMESTAMP;

    super(product, prefetch, period, timestamp);
  }
}

export class Decision<T> extends Subject<boolean> {
  _subscription: Subscription;

  constructor(a: Observable<T>, b: Observable<T>, operator: (valA: T, valB: T) => boolean) {
    super();

    this._subscription = zip(a, b).pipe(map(([mapValA, mapValB]) => operator(mapValA, mapValB))).subscribe((decision: boolean) => {
      this.next(decision);
    });
  }

  unsubscribe() {
    this._subscription.unsubscribe();
    super.unsubscribe();
  }
}

export function log(type: string): (val: any) => void {
  return (val: any) => console.log(`${type}: ${val}`);
}