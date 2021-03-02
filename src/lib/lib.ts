
import { Observable, Subject, Subscription, combineLatest } from 'rxjs';
import { first, map, pluck, skip, tap } from 'rxjs/operators';
import WS from 'ws';
import axios from 'axios';
import { appendFile, fstat, writeFile } from 'fs';

// TODO - this should be all products
// https://api.pro.coinbase.com/products
export type CoinbaseProduct = 'BTC-USD';
export type CoinbaseGranularity = 60 | 300 | 900 | 3600 | 21600 | 86400;

const COINBASE_API = 'https://api.pro.coinbase.com';
export const COINBASE_EARLIEST_TIMESTAMP = 1437428220000;
const COINBASE_TRANSACTION_FEE = .005;

/** A convenience class for working with candle data */
export class Candle {
  /** The time (in seconds since epoch) extracted from the candle object */
  time: number;

  low: number;
  high: number;
  open: number;
  close: number;
  volume: number;

  /**
   * Turn a tlhocv array (from the Coinbase Pro API, for example) into an object-like candle
   * 
   * @param tlhocv an array of data in the form [ time, low, high, open, close, volume ]
   */
  constructor(tlhocv: Array<number>) {
    this.time = tlhocv[0];
    this.low = tlhocv[1];
    this.high = tlhocv[2];
    this.open = tlhocv[3];
    this.close = tlhocv[4];
    this.volume = tlhocv[5];
  }

  /** Pretty-print the data */
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

/** A class for handling number streams with a mathematical boost */
export class Price extends Subject<number> {
  _subscription: Subscription | undefined;

  /**
   * Create a price stream, either to call next on manually or infer from an input stream
   * 
   * @param input if your price stream is coming from somewhere (like a candle stream) you can use input it here.
   * @param key will perform a 'pluck' on the input if provided
   */
  constructor(input?: Subject<any> | Observable<any>, key?: string) {
    super();

    if (input) {
      let inputObs: Observable<number> | Subject<number> = key ? input.pipe(pluck(key)) : input;
      this._subscription = inputObs.subscribe((val: any) => {
        this.next(val);
      });
    }
  }

  _sma(period: number, values: number[]): number {
    return (values.reduce((a, b) => a + b, 0) / values.length)
  }

  _stddev(sma: number, values: number[]): number {
    const variance = values.reduce((acc, val) => acc + Math.pow((val - sma), 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Take the simple moving average over a given period
   * 
   * @param period the length of time to take the average for, smoothing constant
   */
  sma(period: number): Price {
    let values: Array<number> = [];
    const reducer = map((val: number) => {
      values.push(val);
      if (values.length >= period) {
        values.shift();
      }
      return this._sma(period, values);
    });

    return new Price(this.pipe(reducer, skip(period)));
  }

  _ema(currentEma: number, val: number, smoothing: number) {
    return smoothing * (val - currentEma) + val;
  }

  /**
   * Take the exponential moving average over a given period
   * 
   * @param period the length of time to take the average for
   * @param smoothing the smoothing constant, defaults to 2/(period + 1)
   */
  ema(period: number, smoothing?: number): Price {
    const smoothingConstant = smoothing || 2/(period + 1);

    let currentEma = 0;
    let values: Array<number> = [];
    const reducer = map((val: number) => {
      // no EMA? Start with an SMA
      if (!currentEma) {
        values.push(val);
        if (values.length >= (period - 1)) {
          currentEma = this._sma(period, values);
          values = [];
          return currentEma;
        }

        return this._sma(period, values);
      } else {
        currentEma = this._ema(currentEma, val, smoothingConstant);
        return currentEma;
      }
    });

    return new Price(this.pipe(reducer, skip(period)));
  }

  _bollingerBand(upper: boolean, ma: number, deviations: number, stddev: number) {
    return upper ? (ma + (deviations * stddev)) : (ma - (deviations * stddev));
  }

  /**
   * Create a single, simple moving average based Bollinger Band
   * 
   * @param upper true for an upper band, false for a lower band
   * @param period the length of time to take the moving average for
   * @param deviations the number of standard deviations to offset the band
   */
  bollingerBand(upper: boolean = true, period: number = 20, deviations: number = 2) {
    let values: Array<number> = [];
    const reducer = map((val: number) => {
      const len = values.length;
      values.push(val);
      if (len >= period) {
        values.shift();
      }

      const sma = this._sma(period, values);
      const stddev = this._stddev(sma, values);

      return this._bollingerBand(upper, sma, deviations, stddev);
    });

    return new Price(this.pipe(reducer, skip(period),));
  }

  /**
   * Create a single, exponential moving average based Bollinger Band
   * 
   * @param upper true for an upper band, false for a lower band
   * @param period the length of time to take the moving average for
   * @param deviations the number of standard deviations to offset the band
   * @param smoothing the smoothing constant for the ema, defaults to 2/(period + 1)
   */
  bollingerBandEma(upper: boolean = true, period: number = 20, deviations: number = 2, smoothing?: number) {
    const smoothingConstant = smoothing || 2/(period + 1);

    let values: Array<number> = [];
    let currentEma = 0;

    const reducer = map((val: number) => {
      let ema = 0;
      // no EMA? Start with an SMA
      if (!currentEma) {
        values.push(val);
        if (values.length >= (period - 1)) {
          currentEma = this._sma(period, values);
          values = [];
          ema = currentEma;
        } else {
          ema = this._sma(period, values);
        }
      } else {
        currentEma = this._ema(currentEma, val, smoothingConstant);
        ema = currentEma;
      }
      const stddev = this._stddev(ema, values);

      return this._bollingerBand(upper, ema, deviations, stddev);
    });

    return new Price(this.pipe(reducer, skip(period)));
  }

  complete() {
    if (this._subscription) {
      this._subscription.unsubscribe();
    }
    super.complete();
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

  // bump cur by 1 more candle before updating so we don't overlap that minute
  current += period*1000;

  const query = 'start=' + startStr + '&end=' + endStr + '&granularity=' + period;

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
  _prefetch: number;

  /**
   * Constructs and prefetches a Subject of historical CoinbaseProCandles
   * 
   * @param product A string of the Coinbase product to query for, defaults to 'BTC-USD'
   * @param prefetch The number of candles to prefetch
   * @param period The granularity, in seconds, of how large the candles are
   * @param timestamp For testing & simulation only, use to fetch a set number of historical candles starting at this timestamp
   */
  constructor(product: CoinbaseProduct = 'BTC-USD', prefetch: number = 300, period: CoinbaseGranularity = 60, timestamp?: number) {
    super();
    this._prefetch = prefetch;

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

          if (intervalCandles.length) {
            for (let candle of intervalCandles) {
              this.next(candle);
            }
    
            lastTimestamp = intervalCandles[intervalCandles.length - 1].time;
          }
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

  typical(): Price {
    return new Price(this.pipe(map((c: Candle) => (c.high + c.low + c.close)/3)));
  }

  volume(): Observable<number> {
    return this.pipe(pluck('volume'));
  }

  ready(): Observable<boolean> {
    return this.pipe(skip(this._prefetch), first(), map(() => true));
  }

  unsubscribe() {
    if (this._timeout) {
      clearTimeout(this._timeout);
    }

    super.unsubscribe();
  }
}

export class CoinbaseProSimulation extends CoinbaseProCandle {
  constructor(period: CoinbaseGranularity = 60, time: number = 300, product: CoinbaseProduct = 'BTC-USD') {
    let last = Date.now() - (time * period * 1000);
    if (last < COINBASE_EARLIEST_TIMESTAMP) {
      last = COINBASE_EARLIEST_TIMESTAMP;
    }

    let timestamp = Math.floor(Math.random() * (last - COINBASE_EARLIEST_TIMESTAMP)) + COINBASE_EARLIEST_TIMESTAMP;

    super(product, time, period, timestamp);
  }
}

export class Decision<T> extends Subject<boolean> {
  _subscription: Subscription;

  constructor(a: Observable<T>, b: Observable<T>, operator: (valA: T, valB: T) => boolean) {
    super();

    this._subscription = combineLatest([a, b]).pipe(map(([mapValA, mapValB]) => operator(mapValA, mapValB))).subscribe((decision: boolean) => {
      this.next(decision);
    });
  }

  complete() {
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

export function writeState(values: Record<string, Observable<any>>, writeObs: Observable<any>, filename: string) {
  const state: Record<string, any> = {};

  for (let key in values) {
    state[key] = '';
    values[key].subscribe((val) => state[key] = val);
  }

  let keys = Object.keys(state);

  writeFile(filename, keys.join(',') + '\n', () => {
    writeObs.subscribe(() => {
      appendFile(filename, keys.map((key) => state[key] || '').join(',') + '\n', () => {})
    })
  });
}

export function log(type: string): (val: any) => void {
  return (val: any) => console.log(`${type}: ${val}`);
}

export class SimulationWallet {
  dollars: number = 1000;
  dollarStream = new Subject<number>();
  startingDollars: number = 1000;
  coin: number = 0;
  coinStream = new Subject<number>();
  startingPrice: number = 0;
  endingPrice: number = 0;
  lastTransactionPrice: number = 0;
  fees: number = 0;
  lastFee: number = 0;
  transactions: number = 0;
  transactionStream = new Subject<Date>();
  lastTransaction: Date = new Date(Date.now());
  lastTransactions: Date[] = [];
  transactionFee: number = .005;

  constuctor(startingCash: number = 1000, fee: number = COINBASE_TRANSACTION_FEE) {
    this.dollars = startingCash;
    this.transactionFee = fee;
    this.startingDollars = this.dollars;
  }

  _transact(fee: number, price: number) {
    this.fees += fee;
    this.lastFee = fee;
    this.transactions++;
    this.lastTransaction = new Date(Date.now());
    this.lastTransactions.push(this.lastTransaction);

    if (this.lastTransactions.length > 10) {
      this.lastTransactions.shift();
    }

    this.transactionStream.next(this.lastTransaction);
    this.dollarStream.next(this.dollars);
    this.coinStream.next(this.coin);
    
    if (!this.startingPrice) {
      this.startingPrice = price;
    }
    this.endingPrice = price;
    this.lastTransactionPrice = price;
  }
  buy(price: number) {
    if (!this.dollars) return;

    let fee = this.transactionFee * this.dollars;
    this.coin = (this.dollars - fee) / price;
    this.dollars = 0;


    this._transact(fee, price);
  }

  sell(price: number) {
    if (!this.coin) return;

    let fee = this.transactionFee*price*this.coin;
    this.dollars = (this.coin * price) - fee;
    this.coin = 0;

    this._transact(fee, price);
  }

  get expected(): number {
    const entryFee = this.startingDollars * this.transactionFee;
    const entryCoin = (this.startingDollars - entryFee) / this.startingPrice;
    return (this.endingPrice * entryCoin) * (1 - this.transactionFee);
  }
  get netWorth(): number {
    return this.dollars || (this.coin * this.endingPrice * (1 - this.transactionFee));
  }

  get profit(): number {
    return 100 * (this.netWorth - this.startingDollars)/this.startingDollars;
  }

  get expectedProfit(): number {
    return 100 * (this.expected - this.startingDollars)/this.startingDollars;
  }

  get profitOverReplacement(): number {
    return this.profit - this.expectedProfit;
  }
}