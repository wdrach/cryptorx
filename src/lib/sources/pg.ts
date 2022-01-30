import Sequelize from 'sequelize';
import { Column, CreatedAt, Model, PrimaryKey, Table, Unique, UpdatedAt, Sequelize as s } from 'sequelize-typescript';
import { CoinbaseGranularity, CoinbaseProduct, COINBASE_EARLIEST_TIMESTAMP } from '../constants';
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

  const product = CoinbaseProduct.ETH_USD;
  const granularity = CoinbaseGranularity.DAY;
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
