import { Subject } from 'rxjs';
import Sequelize from 'sequelize';
import { Column, CreatedAt, Model, PrimaryKey, Table, Unique, UpdatedAt, Sequelize as s } from 'sequelize-typescript';
import { CoinbaseGranularity, CoinbaseProduct, COINBASE_EARLIEST_TIMESTAMP } from '../constants';
import { Candle, Candles } from '../streams/candles';
import { CoinbaseProCandles } from './coinbase';

@Table({ tableName: 'candles' })
class CandleModel extends Model {
  /**
   * Key is equivalent to baseCurrency + '-' + quoteCurrency + ':' + timestamp + ',' + granularity
   */
  @PrimaryKey
  @Column(Sequelize.STRING)
  public key!: string;

  @Column(Sequelize.INTEGER)
  public timestamp!: number;

  /**
   * Base currency - the currency the _quote_ is for
   */
  @Column({ type: Sequelize.STRING, field: 'base_currency' })
  public baseCurrency!: string;

  /**
   * Quote currency - the currency the _price_ is in
   */
  @Column({ type: Sequelize.STRING, field: 'quote_currency '})
  public quoteCurrency!: string;

  /**
   * Granularity (in seconds)
   */
  @Column(Sequelize.INTEGER)
  public granularity!: number;

  @Column(Sequelize.FLOAT)
  public low!: number;

  @Column(Sequelize.FLOAT)
  public high!: number;

  @Column(Sequelize.FLOAT)
  public open!: number;

  @Column(Sequelize.FLOAT)
  public close!: number;

  @Column(Sequelize.FLOAT)
  public volume!: number;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;
}

export const init = async ():Promise<void> => {
  const sequelize = new s(process.env.SQL_DB ?? '');
  sequelize.addModels([CandleModel]);

  await sequelize.authenticate();
  await CandleModel.sync({alter: true});
};

export const populate = async ():Promise<void> => {
  const product = CoinbaseProduct.ETH_USD;
  const granularity = CoinbaseGranularity.HOUR;
  const candleCount = (Date.now() - COINBASE_EARLIEST_TIMESTAMP) / 1000 / granularity;
  const candles = new CoinbaseProCandles(product, Math.ceil(candleCount), granularity, COINBASE_EARLIEST_TIMESTAMP);

  candles.subscribe({
    next: (candle) => {
      CandleModel.upsert({
        timestamp: candle.time,
        baseCurrency: product.split('-')[0],
        quoteCurrency: product.split('-')[1],
        granularity: granularity,
        low: candle.low,
        high: candle.high,
        open: candle.open,
        close: candle.close,
        volume: candle.volume,
        key: product + ':' + candle.time + ',' + granularity,
      }).catch((e) => console.log(e));
    }
  });
};

export class PgCandles extends Candles {
  constructor(product: CoinbaseProduct = CoinbaseProduct.ETH_USD, prefetch = 300, period: CoinbaseGranularity = CoinbaseGranularity.MINUTE, timestamp?: number) {
    super();

    let startTime = Math.floor((timestamp || (Date.now() - (prefetch * period * 1000))) / 1000);
    startTime -= startTime % period;
    const endTime = startTime + (prefetch * period);

    this._fetchAndPush(startTime, endTime, period, product);
  }

  async _fetchAndPush(startTime: number, endTime: number, period: CoinbaseGranularity, product: CoinbaseProduct):Promise<void> {
    for (let tick = startTime; tick <= endTime; tick += period) {
      const candle = await CandleModel.findByPk(product + ':' + tick + ',' + period);
      if (!candle) continue;
      this.next({
        time: tick,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume
      });
    }

    this.complete();
  }
}

export class PgSimulation extends Subject<Record<string, Candle>> {
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
          const sim = new PgCandles(product, this._time, this._period, this._timestamp);
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