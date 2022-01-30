import axios from 'axios';
import crypto from 'crypto';
import { Subject } from 'rxjs';
import WS from 'ws';
import { CoinbaseGranularity, CoinbaseProduct, COINBASE_API, COINBASE_EARLIEST_TIMESTAMP, LogLevel } from '../constants';
import { Candle, Candles } from '../streams/candles';
import { Price } from '../streams/price';
import { Wallet } from '../streams/wallet';
import { log } from '../util/logging';


export class CoinbaseProPrice extends Price {
  constructor(product: CoinbaseProduct = CoinbaseProduct.ETH_USD) {
    super();

    const ws = new WS('wss://ws-feed.pro.coinbase.com');

    // eslint-disable-next-line
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

export class CoinbaseProCandles extends Candles {
  _timeout?: NodeJS.Timeout;
  _interval?: NodeJS.Timeout;
  _prefetch: number;

  ready: Subject<boolean> = new Subject<boolean>();
  current: Subject<boolean> = new Subject<boolean>();

  /**
   * Constructs and prefetches a Subject of historical CoinbaseProCandles
   * 
   * @param product A string of the Coinbase product to query for, defaults to 'ETH-USD'
   * @param prefetch The number of candles to prefetch
   * @param period The granularity, in seconds, of how large the candles are
   * @param timestamp For testing & simulation only, use to fetch a set number of historical candles starting at this timestamp
   */
  constructor(product: CoinbaseProduct = CoinbaseProduct.ETH_USD, prefetch = 300, period: CoinbaseGranularity = CoinbaseGranularity.MINUTE, timestamp?: number) {
    super();
    this._prefetch = prefetch;

    const startTime = timestamp || (Date.now() - (prefetch * period * 1000));
    const endTime = timestamp ? timestamp + (prefetch * period * 1000) : undefined;

    this._fetchCandles(product, prefetch, period, startTime, endTime).then(() => {
      log(LogLevel.SUCCESS)('received the initial batch of candles');

      if (timestamp) {
        this.complete();
        return;
      }

      let lastTimestamp = (endTime ?? Date.now()) / 1000;
      const now = Date.now() / 1000;
      const diff = now - lastTimestamp;
      let delay = (2 * period) - diff;

      if (delay < 0) delay = 0;
      else this.current.next(true);

      this._timeout = setTimeout(async () => {
        await this._fetchCandles(product, 2, period, (lastTimestamp + period)*1000);
        if (delay === 0) this.current.next(true);
        lastTimestamp += period;

        this._timeout = setInterval(async () => {
          this.ready.next(true);
          await this._fetchCandles(product, 2, period, (lastTimestamp + period)*1000);
          lastTimestamp += period;
        }, 1000 * period);
      }, 1000 * delay);
    });
  }
  _fetchCandles = async (product: CoinbaseProduct, prefetch: number, period: CoinbaseGranularity, current: number, endTime?: number):Promise<void> => {
    const inputEndTime = endTime;
    const inputCurrent = current;

    // go forward one candle's worth
    const startDate = new Date(current);
    const startStr = startDate.toISOString();

    current += 300*period*1000;

    let cancel = false;
    if (!endTime) endTime = Date.now();
    if (endTime <= current) {
      current = endTime;
      cancel = true;
    }

    const endDate = new Date(current);
    const endStr = endDate.toISOString();

    log(LogLevel.INFO)(`fetching candles for ${product} ${startDate.toLocaleString()} to ${endDate.toLocaleString()}`);

    // bump cur by 1 more candle before updating so we don't overlap that minute
    current += period*1000;

    const query = 'start=' + startStr + '&end=' + endStr + '&granularity=' + period;

    let data;

    try {
      data = await axios.get(`${COINBASE_API}/products/${product}/candles?${query}`);
    } catch (e) {
      log(LogLevel.ERROR)('Got an error, likely hit API limits');
      await (new Promise<void>((resolve) => {
        setTimeout(async () => {
          await this._fetchCandles(product, prefetch, period, inputCurrent, inputEndTime);
          resolve();
        }, 1500);
      }));
      return;
    }

    if (data) {
      const body = data.data;
      body.reverse().forEach((bucket: Array<number>) => {
        this.next(new Candle(bucket));
      });
      if (!cancel) await this._fetchCandles(product, prefetch, period, current, endTime);
    }

    return;
  };

  unsubscribe(): void {
    if (this._interval) {
      clearInterval(this._interval);
    }

    if (this._timeout) {
      clearTimeout(this._timeout);
    }

    super.unsubscribe();
  }
}

export class CoinbaseProSimulation extends Subject<Record<string, Candle>> {
    _timestamp: number;
    products: CoinbaseProduct[];
    _time: number;
    _period: number;

    constructor(products: CoinbaseProduct[], period: CoinbaseGranularity = CoinbaseGranularity.DAY, time = 300, current = false) {
      super();

      let last = Date.now() - (time * period * 1000);
      if (last < COINBASE_EARLIEST_TIMESTAMP) {
        last = COINBASE_EARLIEST_TIMESTAMP;
      }

      if (current) {
        this._timestamp = last;
      } else {
        this._timestamp = Math.floor(Math.random() * (last - COINBASE_EARLIEST_TIMESTAMP)) + COINBASE_EARLIEST_TIMESTAMP;
      }

      this.products = products;
      this._time = time;
      this._period = period;
    }

    async init(): Promise<void> {
      const theBigDb: Record<string, Record<string, Candle>> = {};
      for (const product of this.products) {
        await new Promise<void>((res) => {
          const sim = new CoinbaseProCandles(product, this._time, this._period, this._timestamp);
          sim.subscribe((candle) => {
            if (!theBigDb[candle.time]) theBigDb[candle.time] = {};
            theBigDb[candle.time][product] = candle;
          });
          sim.subscribe({complete: () => res()});
        });
      }

      const timestamps = Object.keys(theBigDb).sort((a, b) => parseInt(a) - parseInt(b));

      for (const timestamp of timestamps) {
        super.next(theBigDb[timestamp]);
      }
    }
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
  dollars = 0;
  dollarStream = new Subject<number>();

  currentCoin = '';
  
  coins: Record<string, number> = {};
  coinStream = new Subject<number>();

  inMarket = false;

  // these are unused in this (non-sim) context
  transactions = 0;
  startingPrice = 0;
  endingPrice = 0;
  fees = 0;

  // eslint-disable-next-line
  async _signAndSend(endpoint: string, request?: any): Promise<any> {
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
    };

    if (method === 'POST') {
      return axios.post(COINBASE_API + endpoint, request, {headers}).catch((err) => log(LogLevel.ERROR)(err.response.data.message));
    } else {
      return axios.get(COINBASE_API + endpoint, {headers});
    }

    // TODO - adjust the account values based on the success/failure of this.
  }

  async init(): Promise<void> {
    const accountList = (await this._signAndSend('/accounts') || {}).data;

    const dollarAccount = accountList.find((val: CoinbaseAccount) => val.currency === 'USD');
    const coinAccount = accountList.find((val: CoinbaseAccount) => parseFloat(val.available) > .0001);

    this.dollars = parseFloat(dollarAccount.available);
    if (coinAccount) {
      this.coins = {[coinAccount.currency]: parseFloat(coinAccount.available)};
    }

    this.inMarket = !!coinAccount;

    if (this.inMarket) {
      this.currentCoin = coinAccount.currency;
    }
    log(LogLevel.SUCCESS)(`USD: ${this.dollars}, ${this.currentCoin.split('-')[0]}: ${this.coins}`);
    log(LogLevel.SUCCESS)(`In market: ${this.inMarket}`);
  }

  limitBuy(product: CoinbaseProduct, price: number): void {
    this._signAndSend('/orders', {
      product_id: product,
      type: 'limit',
      side: 'buy',
      price: price.toString(),
      funds: this.dollars.toFixed(2)
    });
  }

  marketBuy(product: CoinbaseProduct): void {
    log(LogLevel.INFO)(`buying $${this.dollars} worth of ETH at ${(new Date(Date.now())).toLocaleString()}`);
    this._signAndSend('/orders', {
      product_id: product,
      type: 'market',
      side: 'buy',
      funds: (Math.floor(this.dollars * 100)/100).toFixed(2)
    });
  }

  buy(product: CoinbaseProduct, price?: number): void {
    if (this.inMarket) return;
    if (price) this.limitBuy(product, price);
    else this.marketBuy(product);

    this.inMarket = true;
  }

  limitSell(price: number): void {
    this._signAndSend('/orders', {
      product_id: this.currentCoin,
      type: 'limit',
      side: 'sell',
      price: price.toString(),
      size: this.coins.toString()
    });
  }

  marketSell(): void {
    log(LogLevel.INFO)(`selling ${this.coins} worth of ETH at ${(new Date(Date.now())).toLocaleString()}`);
    this._signAndSend('/orders', {
      product_id: this.currentCoin,
      type: 'market',
      side: 'sell',
      size: this.coins.toString()
    });
  }

  stopLoss(price: number): void {
    console.log('WOULD BE PUTTING IN A STOP LOSS IF THAT WAS SUPPORTED!', price);
  }

  stopEntry(product: CoinbaseProduct, price: number): void {
    console.log('WOULD BE PUTTING IN A STOP ENTRY IF THAT WAS SUPPORTED!', price);
  }

  sell(price?: number): void {
    if (!this.inMarket) return;
    if (price) this.limitSell(price);
    else this.marketSell();

    this.inMarket = false;
  }
}