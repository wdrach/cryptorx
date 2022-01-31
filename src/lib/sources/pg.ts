import { forkJoin, Observable } from 'rxjs';
import Sequelize from 'sequelize';
import { Column, CreatedAt, Model, PrimaryKey, Table, UpdatedAt, Sequelize as s } from 'sequelize-typescript';
import { CoinbaseGranularity, CoinbaseProduct, COINBASE_EARLIEST_TIMESTAMP } from '../constants';
import { Candles } from '../streams/candles';
import { CoinbaseProCandles } from './coinbase';

let sequelize: s;
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

export const init = async (logging = false):Promise<void> => {
  sequelize = new s(process.env.SQL_DB ?? '', {logging});
  sequelize.addModels([CandleModel]);

  await sequelize.authenticate();
  await CandleModel.sync({alter: true});
};

export const teardown = async ():Promise<void> => {
  await sequelize.close();
};

export const populate = async ():Promise<void> => {
  // TODO - we'll add this full loop back in, but I'm focusing
  // on cleaning up the non-multi-currency bits for the time being
  //for (const p in CoinbaseProduct) {
  for (const p of ['ETH_USD']) {
    const splitProduct = p.split('_');
    if (splitProduct[1] !== 'USD') {
      continue;
    }

    const product = splitProduct.join('-') as CoinbaseProduct;

    // TODO - we either need more memory or to free up coinbase candles as we
    // go to get to 1 minute
    //for (const g in CoinbaseGranularity) {
    //  const granularity = parseInt(g);
    //  if (isNaN(granularity)) continue;

    for (const granularity of [CoinbaseGranularity.DAY, CoinbaseGranularity.SIX_HOUR, CoinbaseGranularity.HOUR, CoinbaseGranularity.FIFTEEN_MINUTE, CoinbaseGranularity.FIVE_MINUTE]) {

      let startTime = COINBASE_EARLIEST_TIMESTAMP;

      const latestCandle = await CandleModel.findOne(
        {
          where: {
            granularity,
            baseCurrency: splitProduct[0],
            quoteCurrency: splitProduct[1]
          },
          order: [['timestamp', 'DESC']]
        }
      );

      if (latestCandle) {
        startTime = latestCandle.timestamp * 1000;
      }

      const candleCount = (Date.now() - startTime) / 1000 / granularity;
      const candles = new CoinbaseProCandles(product, Math.ceil(candleCount), granularity, startTime);
    
      const candleObservables: Observable<void>[] = [];

      await new Promise<void>((res) => {
        candles.subscribe({
          next: (candle) => {
            candleObservables.push(new Observable((subscriber) => {
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
              }).catch((e) => console.log(e)).then(() => {
                subscriber.next();
                subscriber.complete();
              });
            }));
          },
          complete: () => {
            console.log('obs completed', candleObservables.length);
            forkJoin(candleObservables).subscribe(() => res());
          }
        });
      });
    }
  }
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

export class PgSim extends PgCandles {
  constructor(product: CoinbaseProduct, period: CoinbaseGranularity = CoinbaseGranularity.DAY, time = 300) {
    let last = Date.now() - (time * period * 1000);
    if (last < COINBASE_EARLIEST_TIMESTAMP) {
      last = COINBASE_EARLIEST_TIMESTAMP;
    }

    const timestamp = Math.floor(Math.random() * (last - COINBASE_EARLIEST_TIMESTAMP)) + COINBASE_EARLIEST_TIMESTAMP;

    super(product, time, period, timestamp);
  }
}