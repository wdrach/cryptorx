
import { Observable, Subject, Subscription, combineLatest, zip } from 'rxjs';
import { bufferCount, map, pluck } from 'rxjs/operators';
import WS from 'ws';
import axios from 'axios';
import crypto from 'crypto';
import chalk from 'chalk';
import { promises } from 'fs';

import dotenv from 'dotenv';
dotenv.config();

// TODO - this should be all products
// https://api.pro.coinbase.com/products
export type CoinbaseProduct = 'BTC-USD';
export enum CoinbaseGranularity {
  MINUTE = 60,
  FIVE_MINUTE = 300,
  FIFTEEN_MINUTE = 900,
  HOUR = 3600,
  SIX_HOUR = 21600,
  DAY = 86400
};

const COINBASE_API = 'https://api.pro.coinbase.com';
export const COINBASE_EARLIEST_TIMESTAMP = 1437428220000;
const COINBASE_TRANSACTION_FEE = .005;

export interface AlgorithmResult {
  buy: Observable<boolean>;
  sell: Observable<boolean>;
  state?: Record<string, Observable<any>>;
}

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

  _sma(values: number[]): number {
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
    const reducer = map((values: number[]) => {
      return this._sma(values);
    });

    return new Price(this.pipe(bufferCount(period, 1), reducer));
  }

  /** Shorthand for sma(5) */
  sma5(): Price {
    return this.sma(5);
  }

  /** Shorthand for sma(20) */
  sma20(): Price {
    return this.sma(20);
  }

  /** Shorthand for sma(30) */
  sma30(): Price {
    return this.sma(30);
  }

  /** Shorthand for sma(50) */
  sma50(): Price {
    return this.sma(50);
  }

  /** Shorthand for sma(100) */
  sma100(): Price {
    return this.sma(100);
  }

  /** Shorthand for sma(200) */
  sma200(): Price {
    return this.sma(200);
  }

  _ema(currentEma: number, val: number, smoothing: number, period: number) {
    const commonTerm = (smoothing / (1 + period));
    return val * commonTerm + currentEma * (1 - commonTerm);
  }

  // I'm not saying I condone messing up math, I'm just saying there isn't always
  // a reason for everything
  _fema(currentEma: number, val: number, smoothing: number) {
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
    const reducer = map((values: number[]) => {
      const len = values.length;

      // no EMA? Start with an SMA
      if (!currentEma) {
        if (values.length >= (period - 1)) {
          currentEma = this._sma(values);
          return currentEma;
        }

        return this._sma(values);
      } else {
        currentEma = this._ema(currentEma, values[len - 1], smoothingConstant, len);
        return currentEma;
      }
    });

    return new Price(this.pipe(bufferCount(period, 1), reducer));
  }

  /** It's EMA with a twist! (the twist is it doesn't do what it's supposed to) */
  fema(period: number, smoothing?: number): Price {
    const smoothingConstant = smoothing || 2/(period + 1);

    let currentEma = 0;
    const reducer = map((values: number[]) => {
      const len = values.length;

      // no EMA? Start with an SMA
      if (!currentEma) {
        if (values.length >= (period - 1)) {
          currentEma = this._sma(values);
          return currentEma;
        }

        return this._sma(values);
      } else {
        currentEma = this._fema(currentEma, values[len - 1], smoothingConstant);
        return currentEma;
      }
    });

    return new Price(this.pipe(bufferCount(period, 1), reducer));
  }

  /** Shorthand for ema(5) */
  ema5(): Price {
    return this.ema(5);
  }

  /** Shorthand for ema(20) */
  ema20(): Price {
    return this.ema(20);
  }

  /** Shorthand for ema(30) */
  ema30(): Price {
    return this.ema(30);
  }

  /** Shorthand for ema(50) */
  ema50(): Price {
    return this.ema(50);
  }

  /** Shorthand for ema(100) */
  ema100(): Price {
    return this.ema(100);
  }

  /** Shorthand for ema(200) */
  ema200(): Price {
    return this.ema(200);
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
    const reducer = map((values: number[]) => {
      const sma = this._sma(values);
      const stddev = this._stddev(sma, values);

      return this._bollingerBand(upper, sma, deviations, stddev);
    });

    return new Price(this.pipe(bufferCount(period, 1), reducer));
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

    let currentEma = 0;

    const reducer = map((values: number[]) => {
      let ema = 0;
      const len = values.length
      // no EMA? Start with an SMA
      if (!currentEma) {
        if (len >= (period - 1)) {
          currentEma = this._sma(values);
          ema = currentEma;
        } else {
          ema = this._sma(values);
        }
      } else {
        currentEma = this._ema(currentEma, values[len - 1], smoothingConstant, len);
        ema = currentEma;
      }
      const stddev = this._stddev(ema, values);

      return this._bollingerBand(upper, ema, deviations, stddev);
    });

    return new Price(this.pipe(bufferCount(period, 1), reducer));
  }

  /**
   * Returns a custom MACD indicator for 2 given periods.
   * Defined as EMA(lowerPeriod) - EMA(upperPeriod)
   * 
   * @param lowerPeriod the first, smaller period for the ema
   * @param upperPeriod the second, larger period for the ema 
   */
  macdOf(lowerPeriod: number = 12, upperPeriod: number = 26) {
    return new Price(zip(this.ema(lowerPeriod), this.ema(upperPeriod)).pipe(map(([ema1, ema2]) => ema1 - ema2)));
  }

  /**
   * Returns the MACD indicator, defined as the EMA(12) - EMA(26)
   */
  macd(): Price {
    return this.macdOf();
  }

  /**
   * Returns a custom MACD indicator for 2 given periods.
   * Defined as EMA(MACD(lowerPeriod, upperPeriod), signalPeriod)
   * 
   * @param lowerPeriod the first, smaller period for the ema
   * @param upperPeriod the second, larger period for the ema 
   * @param signalPeriod the period to base the signal value off of
   */
  macdSignalOf(lowerPeriod: number = 12, upperPeriod: number = 26, signalPeriod: number = 9): Price {
    return this.macdOf(lowerPeriod, upperPeriod).ema(signalPeriod);
  }

  /**
   * Returns the MACD signal, defined as EMA(MACD, 9)
   */
  macdSignal(): Price {
    return this.macdSignalOf();
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

  log(LogLevel.INFO)(`fetching candles for ${startDate.toLocaleString()} to ${endDate.toLocaleString()}`)

  // bump cur by 1 more candle before updating so we don't overlap that minute
  current += period*1000;

  const query = 'start=' + startStr + '&end=' + endStr + '&granularity=' + period;

  let data;

  try {
    data = await axios.get(`${COINBASE_API}/products/${product}/candles?${query}`)
  } catch (e) {
    log(LogLevel.ERROR)('Got an error, likely hit API limits');
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

export class Candles extends Subject<Candle> {
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

  // fstoch, or "fucked stoch" is my initial fuck up of the stochastic oscillator
  // that turned out to be incredibly profitable when used correctly
  fstoch(period: number = 14): Price {
    const reducer = map((values: Candle[]) => {
      const lastValue = values[values.length - 1];
      const firstValue = values[0];

      return 100 * (lastValue.close - firstValue.low) / (firstValue.high - firstValue.low);
    });

    return new Price(this.pipe(bufferCount(period, 1), reducer));
  }
  fstochD(period: number = 14, avgPeriod: number = 3): Price {
    return this.stoch(period).fema(avgPeriod);
  }
  fstochSlow(period: number = 14, avgPeriod: number = 3): Price {
    return this.stochD(period, avgPeriod);
  }
  fstochSlowD(period: number = 14, avgPeriod: number = 3, secondAvgPeriod: number = 3): Price {
    return this.stochSlow(period, avgPeriod).fema(secondAvgPeriod);
  }

  /**
   * The stochastic %K, defined as:
   *  100 * (C - L(P))/(H(P) - L(P))
   * 
   * Where L(P) is the low price in the last P periods
   * and H(P) is the high price in the last P periods
   * 
   * @param period the period to compare to, default of 14
   */
  stoch(period: number = 14): Price {
    const reducer = map((values: Candle[]) => {
      const lowest = values.reduce((acc, val) => (val.low < acc || acc === -1) ? val.low : acc, -1)
      const highest = values.reduce((acc, val) => val.high > acc ? val.high : acc, -1)
      const lastValue = values[values.length - 1];

      return 100 * (lastValue.close - lowest) / (highest - lowest);
    });

    return new Price(this.pipe(bufferCount(period, 1), reducer));
  }

  /**
   * The stochastic %D, the <avgPeriod> period average of the stochastic %K
   * 
   * @param period the period to compare to, default of 14
   * @param avgPeriod the smoothing factor, default of 3
   */
  stochD(period: number = 14, avgPeriod: number = 3): Price {
    return this.stoch(period).ema(avgPeriod);
  }

  /**
   * The stochastic slow %K, defined as the stochastic fast %D
   * 
   * @param period the period to compare to, default of 14
   * @param avgPeriod the smoothing factor, default of 3
   */
  stochSlow(period: number = 14, avgPeriod: number = 3): Price {
    return this.stochD(period, avgPeriod);
  }

  /**
   * The stochastic slow %D, applies a second moving average to the stochastic slow %D
   * 
   * @param period the period to compare to, default of 14
   * @param avgPeriod the smoothing factor, default of 3
   * @param secondAvgPeriod the smoothing factor, default of 3
   */
  stochSlowD(period: number = 14, avgPeriod: number = 3, secondAvgPeriod: number = 3): Price {
    return this.stochSlow(period, avgPeriod).ema(secondAvgPeriod);
  }

  // fucked fucked stoch. do I need to say anything else?
  ffstoch(period: number = 14, avgPeriod: number = 3): Price {
    return this.stoch(period).fema(avgPeriod);
  }
}

export class CoinbaseProCandle extends Candles {
  _timeout: NodeJS.Timeout | undefined;
  _prefetch: number;

  ready: Subject<boolean> = new Subject<boolean>();
  current: Subject<boolean> = new Subject<boolean>();

  /**
   * Constructs and prefetches a Subject of historical CoinbaseProCandles
   * 
   * @param product A string of the Coinbase product to query for, defaults to 'BTC-USD'
   * @param prefetch The number of candles to prefetch
   * @param period The granularity, in seconds, of how large the candles are
   * @param timestamp For testing & simulation only, use to fetch a set number of historical candles starting at this timestamp
   */
  constructor(product: CoinbaseProduct = 'BTC-USD', prefetch: number = 300, period: CoinbaseGranularity = CoinbaseGranularity.MINUTE, timestamp?: number) {
    super();
    this._prefetch = prefetch;

    let startTime = timestamp || (Date.now() - (prefetch * period * 1000));
    let endTime = timestamp ? timestamp + (prefetch * period * 1000) : undefined;

    _fetchCandles(product, prefetch, period, startTime, endTime).then((candles: Array<Candle>) => {
      console.log('received the initial batch of candles');
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
      else this.current.next(true);

      this._timeout = setTimeout(async () => {
        const timeoutCandles = await _fetchCandles(product, 2, period, (lastTimestamp + period)*1000);
        for (let candle of timeoutCandles) {
          this.next(candle);
        }

        if (delay === 0) this.current.next(true);

        lastTimestamp = timeoutCandles[timeoutCandles.length - 1].time;

        this._timeout = setInterval(async () => {
          this.ready.next(true);
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

  unsubscribe() {
    if (this._timeout) {
      clearTimeout(this._timeout);
    }

    super.unsubscribe();
  }
}

export class CoinbaseProSimulation extends CoinbaseProCandle {
  constructor(period: CoinbaseGranularity = CoinbaseGranularity.MINUTE, time: number = 300, product: CoinbaseProduct = 'BTC-USD') {
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

export async function writeState(values: Record<string, Observable<any>>, writeObs: Observable<any>, filename: string) {
  const state: Record<string, any> = {};

  for (let key in values) {
    state[key] = '';
    values[key].subscribe((val) => state[key] = val);
  }

  let keys = Object.keys(state);
  await promises.writeFile(filename, keys.join(',') + '\n');

  writeObs.subscribe(async () => {
    await promises.appendFile(filename, keys.map((key) => (state[key] || '')).join(',') + '\n')
  })
}

export enum LogLevel {
  INFO = 'info',
  ERROR = 'error',
  WARN = 'warn',
  SUCCESS = 'success'
}
export function log(level: LogLevel): (val: string) => void {
  switch (level) {
  case LogLevel.ERROR:
    return (val: any) => console.log(chalk.bgRed('ERROR:') + '  ', val);
  case LogLevel.WARN:
    return (val: any) => console.log(chalk.bgYellow('WARN:') + '   ', val);
  case LogLevel.SUCCESS:
    return (val: any) => console.log(chalk.bgGreen('SUCCESS:'), val);
  default:
    return (val: any) => console.log(chalk.bgBlue('INFO:') + '   ', val);
  }
}

interface Wallet {
  dollars: number;
  dollarStream: Subject<number>;

  coin: number;
  coinStream: Subject<number>;

  product: string;

  transactionStream: Subject<Date>;
  lastTransaction: Date;

  lastFee: number;

  buy(price?: number): void
  sell(price?: number): void
}

interface CoinbaseAccount {
  id: string;
  currency: string;
  balance: string;
  available: string;
  hold: string;
  profile_id: string;
  trading_enabled: boolean;
}

export class CoinbaseWallet implements Wallet {
  dollars: number = 0;
  dollarStream = new Subject<number>();
  
  coin: number = 0;
  coinStream = new Subject<number>();

  inMarket: boolean = false;

  product = 'BTC-USD';

  transactionStream = new Subject<Date>();
  lastTransaction = new Date(Date.now());

  lastFee = 0;

  constructor(product?: CoinbaseProduct) {
    if (product) {
      this.product = product;
    }
  }

  async _signAndSend(endpoint: string, request?: any) {
    const method = request ? 'POST' : 'GET';

    const timestamp = Date.now() / 1000;

    let prehash = timestamp + method + endpoint;

    if (request) {
      prehash += JSON.stringify(request);
    }

    const key = Buffer.from(process.env.COINBASE_SECRET || '', 'base64');
    const hmac = crypto.createHmac('sha256', key);
    const signature = hmac.update(prehash).digest('base64');

    const headers = {
      'CB-ACCESS-KEY': process.env.COINBASE_API_KEY,
      'CB-ACCESS-SIGN': signature,
      'CB-ACCESS-TIMESTAMP': timestamp,
      'CB-ACCESS-PASSPHRASE': process.env.COINBASE_PASSPHRASE
    }

    if (method === 'POST') {
      return axios.post(COINBASE_API + endpoint, request, {headers}).catch((err) => log(LogLevel.ERROR)(err.response.data.message));
    } else {
      return axios.get(COINBASE_API + endpoint, {headers})
    }
  }

  async init() {
    const accountList = (await this._signAndSend('/accounts') || {}).data;

    const dollarAccount = accountList.find((val: CoinbaseAccount) => val.currency === 'USD');
    const coinAccount = accountList.find((val: CoinbaseAccount) => val.currency === this.product.split('-')[0]);

    this.dollars = parseFloat(dollarAccount.available);
    this.coin = parseFloat(coinAccount.available);

    this.inMarket = this.coin > .0001
    log(LogLevel.SUCCESS)(`USD: ${this.dollars}, ${this.product.split('-')[0]}: ${this.coin}`);
    log(LogLevel.SUCCESS)(`In market: ${this.inMarket}`);
  }

  limitBuy(price: number) {
    this._signAndSend('/orders', {
      product_id: this.product,
      type: 'limit',
      side: 'buy',
      price: price.toString(),
      funds: this.dollars.toFixed(2)
    });
  }

  marketBuy() {
    log(LogLevel.INFO)(`buying \$${this.dollars} worth of BTC at ${(new Date(Date.now())).toLocaleString()}`);
    this._signAndSend('/orders', {
      product_id: this.product,
      type: 'market',
      side: 'buy',
      funds: (Math.floor(this.dollars * 100)/100).toFixed(2)
    });
  }

  buy(price?: number) {
    if (this.inMarket) return;
    if (price) this.limitBuy(price);
    else this.marketBuy();

    this.inMarket = true;
  }

  limitSell(price: number) {
    this._signAndSend('/orders', {
      product_id: this.product,
      type: 'limit',
      side: 'sell',
      price: price.toString(),
      size: this.coin.toString()
    });
  }

  marketSell() {
    log(LogLevel.INFO)(`selling ${this.coin} worth of BTC at ${(new Date(Date.now())).toLocaleString()}`);
    this._signAndSend('/orders', {
      product_id: this.product,
      type: 'market',
      side: 'sell',
      size: this.coin.toString()
    });
  }

  sell(price?: number) {
    if (!this.inMarket) return;
    if (price) this.limitSell(price);
    else this.marketSell();

    this.inMarket = false;
  }


  transact(buySignal: Observable<boolean>, sellSignal: Observable<boolean>, readySignal: Observable<boolean>) {
    combineLatest([buySignal, sellSignal, readySignal]).subscribe(([sell, buy, ready]) => {
        // if we're not ready, we're still in pre-data, not live data
        if (!ready || sell === buy) return;

        if (sell) this.sell();
        else if (buy) this.buy();
    })
  }
}

export class SimulationWallet implements Wallet {
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
  product = 'BTC-USD';

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