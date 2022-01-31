import { forkJoin, Observable } from 'rxjs';
import Sequelize from 'sequelize';
import { Column, CreatedAt, Model, PrimaryKey, Table, UpdatedAt, Sequelize as s } from 'sequelize-typescript';
import { CoinbaseGranularity, CoinbaseProduct, COINBASE_EARLIEST_TIMESTAMP } from '../constants';
import { AlgModel } from '../exec/battle';
import { Candles } from '../streams/candles';
import { Price } from '../streams/price';
import { CandleActions, DecisionActions, PriceActions, SourceActions } from '../util/alg_builder';
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
  sequelize.addModels([CandleModel, AlgModel]);

  await sequelize.authenticate();
  await CandleModel.sync({alter: true});
  await AlgModel.sync({alter: true});
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

    for (const granularity of [CoinbaseGranularity.DAY, CoinbaseGranularity.SIX_HOUR, CoinbaseGranularity.HOUR, CoinbaseGranularity.FIFTEEN_MINUTE]) {

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

  await seedAlgs();
};

/**
 * seedAlgs adds some basic algs to the postgres db so that we can start our generative algorithm!
 */
export const seedAlgs = async (): Promise<void> => {
  // volume weighted cross
  await AlgModel.upsert({
    elo: 1000,
    bullElo: 1000,
    bearElo: 1000,
    count: 1,
    bullCount: 1,
    bearCount: 1,
    por: 0,
    algorithm: JSON.stringify({
      streams: [
        [[SourceActions.CANDLES], [CandleActions.VWMA, 5]], // vwma[5]
        [[SourceActions.CANDLES], [CandleActions.VWMA, 20]], // vwma[20]
        [[SourceActions.STREAM, 0], [DecisionActions.CROSSOVER, 1]], // golden cross
        [[SourceActions.STREAM, 1], [DecisionActions.CROSSOVER, 0]], // death cross
      ],
      algResult: {
        entry: 2, // golden cross
        exit: 3,  // death cross
      }
    }),
  });

  // normal golden/death cross
  await AlgModel.upsert({
    elo: 1000,
    bullElo: 1000,
    bearElo: 1000,
    count: 1,
    bullCount: 1,
    bearCount: 1,
    por: 0,
    algorithm: JSON.stringify({
      streams: [
        [[SourceActions.CANDLES], [CandleActions.TYPICAL]],  // typical
        [[SourceActions.STREAM, 0], [PriceActions.SMA, 5]],  // sma[5]
        [[SourceActions.STREAM, 0], [PriceActions.SMA, 20]], // sma[20]
        [[SourceActions.STREAM, 1], [DecisionActions.CROSSOVER, 2]], // golden cross
        [[SourceActions.STREAM, 2], [DecisionActions.CROSSOVER, 1]], // death cross
      ],
      algResult: {
        entry: 3, // golden cross
        exit: 4,  // death cross
      }
    }),
  });

  // RSI
  await AlgModel.upsert({
    elo: 1000,
    bullElo: 1000,
    bearElo: 1000,
    count: 1,
    bullCount: 1,
    bearCount: 1,
    por: 0,
    algorithm: JSON.stringify({
      streams: [
        [[SourceActions.CANDLES], [CandleActions.RSI]],  // rsi
        [[SourceActions.STREAM, 0], [DecisionActions.GT, 75]], // overbought
        [[SourceActions.STREAM, 0], [DecisionActions.LT, 25]], // oversold
      ],
      algResult: {
        entry: 2, // oversold
        exit: 1,  // overbought
      }
    }),
  });

  // MFI
  await AlgModel.upsert({
    elo: 1000,
    bullElo: 1000,
    bearElo: 1000,
    count: 1,
    bullCount: 1,
    bearCount: 1,
    por: 0,
    algorithm: JSON.stringify({
      streams: [
        [[SourceActions.CANDLES], [CandleActions.MFI]],  // mfi
        [[SourceActions.STREAM, 0], [DecisionActions.GT, 90]], // overbought
        [[SourceActions.STREAM, 0], [DecisionActions.LT, 30]], // oversold
      ],
      algResult: {
        entry: 2, // oversold
        exit: 1,  // overbought
      }
    }),
  });

  // BBANDS
  await AlgModel.upsert({
    elo: 1000,
    bullElo: 1000,
    bearElo: 1000,
    count: 1,
    bullCount: 1,
    bearCount: 1,
    por: 0,
    algorithm: JSON.stringify({
      streams: [
        [[SourceActions.CANDLES], [CandleActions.TYPICAL]],  // typical 
        [[SourceActions.STREAM, 0], [PriceActions.BBAND, 1]], // upper
        [[SourceActions.STREAM, 0], [PriceActions.BBAND, 0]], // lower
        [[SourceActions.STREAM, 0], [DecisionActions.CROSSOVER, 1]], // cross high
        [[SourceActions.STREAM, 0], [DecisionActions.NEGCROSSOVER, 2]], // cross low
      ],
      algResult: {
        entry: 4, // oversold
        exit: 3,  // overbought
      }
    }),
  });

  // HODL
  await AlgModel.upsert({
    elo: 1000,
    bullElo: 1000,
    bearElo: 1000,
    count: 1,
    bullCount: 1,
    bearCount: 1,
    por: 0,
    algorithm: JSON.stringify({
      streams: [
        [[SourceActions.CANDLES], [CandleActions.HIGH]],
        [[SourceActions.STREAM, 0], [DecisionActions.GT, 0]], // always buy
        [[SourceActions.STREAM, 0], [DecisionActions.LT, 0]], // never sell
      ],
      algResult: {
        entry: 1,
        exit: 2,
      }
    }),
  });

  // MACD
  await AlgModel.upsert({
    elo: 1000,
    bullElo: 1000,
    bearElo: 1000,
    count: 1,
    bullCount: 1,
    bearCount: 1,
    por: 0,
    algorithm: JSON.stringify({
      streams: [
        [[SourceActions.CANDLES], [CandleActions.TYPICAL]],  // typical 
        [[SourceActions.STREAM, 0], [PriceActions.MACD]], // macd
        [[SourceActions.STREAM, 0], [PriceActions.MACDSIG]], // signal
        [[SourceActions.STREAM, 1], [DecisionActions.CROSSOVER, 2]], // macd > sig --> bull
        [[SourceActions.STREAM, 1], [DecisionActions.NEGCROSSOVER, 2]], // sig > macd --> bear
      ],
      algResult: {
        entry: 3, // bull
        exit: 4,  // bear
      }
    }),
  });

  // VW MACD
  await AlgModel.upsert({
    elo: 1000,
    bullElo: 1000,
    bearElo: 1000,
    count: 1,
    bullCount: 1,
    bearCount: 1,
    por: 0,
    algorithm: JSON.stringify({
      streams: [
        [[SourceActions.CANDLES], [CandleActions.VWMACD]], // macd
        [[SourceActions.CANDLES], [CandleActions.VWMACDSIG]], // signal
        [[SourceActions.STREAM, 0], [DecisionActions.CROSSOVER, 1]], // macd > sig --> bull
        [[SourceActions.STREAM, 0], [DecisionActions.NEGCROSSOVER, 1]], // sig > macd --> bear
      ],
      algResult: {
        entry: 2, // bull
        exit: 3,  // bear
      }
    }),
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