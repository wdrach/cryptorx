import { forkJoin, Observable, Subject, Subscription, TimeoutError, zip } from 'rxjs';
import { finalize, map, pluck } from 'rxjs/operators';
import WS from 'ws';
import axios from 'axios';

// TODO - this should be all products
// https://api.pro.coinbase.com/products
type CoinbaseProduct = 'BTC-USD';
type CoinbaseGranularity = 60 | 300 | 900 | 3600 | 21600 | 86400;

const COINBASE_API = 'https://api.pro.coinbase.com';
const COINBASE_EARLIEST_TIMESTAMP = 1437428220000;

class Candle {
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

class Price extends Subject<number> {
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

class CoinbaseProPrice extends Price {
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

const _fetchCandles = async (product: CoinbaseProduct, prefetch: number, period: CoinbaseGranularity, current: number, endTime?: number):Promise<Candle[]> => {
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

class CoinbaseProCandle extends Subject<Candle> {
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

class CoinbaseProSimulation extends CoinbaseProCandle {
  constructor(product: CoinbaseProduct = 'BTC-USD', prefetch: number = 2400, period: CoinbaseGranularity = 60) {
    let last = Date.now() - (prefetch * period * 1000);
    if (last < COINBASE_EARLIEST_TIMESTAMP) {
      last = COINBASE_EARLIEST_TIMESTAMP;
    }

    let timestamp = Math.floor(Math.random() * (last - COINBASE_EARLIEST_TIMESTAMP)) + COINBASE_EARLIEST_TIMESTAMP;

    super(product, prefetch, period, timestamp);
  }
}

class Decision<T> extends Subject<boolean> {
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

function log(type: string): (val: any) => void {
  return (val: any) => console.log(`${type}: ${val}`);
}

let totalCash = 0;
let totalExpected = 0;

function transact(signals: Observable<boolean>[], candles: CoinbaseProCandle) {
  const buySignal = signals[0];
  const sellSignal = signals[1];

  let price = 0;
  candles.close().subscribe((val) => price = val);

  let firstPrice = 0;

  let dollars = 1000;
  let btc = 0;

  zip(buySignal, sellSignal)
  .subscribe(([sell, buy]) => {
    if (!firstPrice) firstPrice = price;

    if (sell && btc) {
      dollars = price*btc;
    } else if (buy && dollars) {
      btc = dollars/price;
    }
  })

  candles.subscribe({complete: () => {
    let cash = dollars || price*btc;
    totalCash += cash;
    let expected = price * 1000/firstPrice;
    totalExpected += expected;
  }});

  return candles;
}

let algo = (candles: CoinbaseProCandle) => {
  const sma100 = candles.close().sma(200);
  const sma50 = candles.close().sma(100);

  // golden cross
  const goldenCross = new Decision(sma100, sma50, (a, b) => a < b);

  // death cross
  const deathCross = new Decision(sma100, sma50, (a, b) => a > b);

  return [goldenCross, deathCross]
}

let fullSim = () => {
  const candles = new CoinbaseProSimulation();
  return transact(algo(candles), candles);
}

let paperTrade = () => {
  console.log('papertrading not implemented');
}



if (process.argv.length <= 2) {
  // no file provided
  const candles = new CoinbaseProCandle();

  candles.open().subscribe(log('open'));

  candles.high().subscribe(log('high'));
  candles.low().subscribe(log('low'));

  candles.close().subscribe(log('close'));

  const price = new CoinbaseProPrice();
  price.subscribe(log('price'));
} else if (process.argv.findIndex((val) => val === '-s') !== -1) {
  const RUN_SIMS = 100;
  const sims = [];

  for (let i=0; i< RUN_SIMS; i++) {
    sims.push(fullSim());
  }

  forkJoin(sims).subscribe(() => {
    console.log(`\nGot ${totalCash/RUN_SIMS} in the bank`);
    console.log(`would have ${totalExpected/RUN_SIMS} in the bank if I just held`);

    const expectedProfit = ((totalExpected/RUN_SIMS) - 1000)/10;
    const profit = ((totalCash/RUN_SIMS) - 1000)/10;
    const diffProfit = profit - expectedProfit;
    console.log(`that's a ${profit.toFixed(2)}% profit when I expected ${expectedProfit.toFixed(2)}% or a ${diffProfit.toFixed(2)}% profit over replacement.`);
  });
} else if (process.argv.findIndex((val) => val === '-s') !== -1) {
  paperTrade();
} else {
  console.log('unsupported');
}