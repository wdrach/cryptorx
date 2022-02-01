import { Column, CreatedAt, Model, Table, Unique, UpdatedAt } from 'sequelize-typescript';
import Sequelize from 'sequelize';
import { CoinbaseGranularity, CoinbaseProduct, LogLevel } from '../constants';
import { PgSim } from '../sources/pg';
import { Broker } from '../streams/broker';
import { SimulationWallet } from '../streams/wallet';
import { log } from '../util/logging';
import { algBuilder, CandleActions, DecisionActions, MachineAlgorithm, PriceActions, SourceActions } from '../util/alg_builder';

@Table({ tableName: 'algs' })
export class AlgModel extends Model {
  @Unique
  @Column(Sequelize.TEXT)
  algorithm!: string;

  @Column(Sequelize.FLOAT)
  elo!: number;

  @Column({type: Sequelize.FLOAT, field: 'bull_elo'})
  bullElo!: number;

  @Column({type: Sequelize.FLOAT, field: 'bear_elo'})
  bearElo!: number;

  @Column(Sequelize.BIGINT)
  count!: number;

  @Column({type: Sequelize.BIGINT, field: 'bull_count'})
  bullCount!: number;

  @Column({type: Sequelize.BIGINT, field: 'bear_count'})
  bearCount!: number;

  @Column(Sequelize.FLOAT)
  por!: number;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;
}

const makeParameterModification = async (alg: string): Promise<void> => {
  const childAlg = JSON.parse(alg) as MachineAlgorithm;

  const potentialModifications: number[][] = [];

  for (const i in childAlg.streams) {
    const s = parseInt(i);
    const stream = childAlg.streams[s];
    for (const j in stream) {
      const m = parseInt(j);
      const modifier = stream[m];
      const action = modifier[0] as string;

      // Modifiers 0: Parameter modification
      switch (action) {
      // single argument? Change by 1
      case DecisionActions.GT:
      case DecisionActions.LT:
      case PriceActions.SMA:
      case PriceActions.EMA:
      case PriceActions.ROC:
      case PriceActions.TSTOCH:
      case CandleActions.STOCH:
      case CandleActions.STOCHD:
      case CandleActions.RSI:
      case CandleActions.SRSI:
      case CandleActions.VWMA:
      case CandleActions.MFI:
      case CandleActions.STOCHRSI:
        potentialModifications.push([s, m, 1, modifier[1] as number + 1]);
        potentialModifications.push([s, m, 1, modifier[1] as number - 1]);
        break;
      // 2 numbers? change one of them by 1
      case PriceActions.MACDOF:
      case CandleActions.STOCHSLOW:
      case CandleActions.VWMACDOF:
        potentialModifications.push([s, m, 1, modifier[1] as number + 1]);
        potentialModifications.push([s, m, 1, modifier[1] as number - 1]);
        potentialModifications.push([s, m, 2, modifier[2] as number + 1]);
        potentialModifications.push([s, m, 2, modifier[2] as number - 1]);
        break;
      // 3 numbers? same story
      case PriceActions.MACDSIGOF:
      case CandleActions.STOCHSLOWD:
      case CandleActions.VWMACDSIGOF:
        potentialModifications.push([s, m, 1, modifier[1] as number + 1]);
        potentialModifications.push([s, m, 1, modifier[1] as number - 1]);
        potentialModifications.push([s, m, 2, modifier[2] as number + 1]);
        potentialModifications.push([s, m, 2, modifier[2] as number - 1]);
        potentialModifications.push([s, m, 3, modifier[3] as number + 1]);
        potentialModifications.push([s, m, 3, modifier[3] as number - 1]);
        break;
      // bbands are special in that the first one is true/false
      case PriceActions.BBAND:
      case CandleActions.VWBB:
        potentialModifications.push([s, m, 1, modifier[1] ? 0 : 1]);
        potentialModifications.push([s, m, 2, modifier[2] as number + 1]);
        potentialModifications.push([s, m, 2, modifier[2] as number - 1]);
        potentialModifications.push([s, m, 3, modifier[3] as number + 1]);
        potentialModifications.push([s, m, 3, modifier[3] as number - 1]);
        break;
      // ema bbands even have an extra smoothing param
      case PriceActions.BBANDEMA:
        potentialModifications.push([s, m, 1, modifier[1] ? 0 : 1]);
        potentialModifications.push([s, m, 2, modifier[2] as number + 1]);
        potentialModifications.push([s, m, 2, modifier[2] as number - 1]);
        potentialModifications.push([s, m, 3, modifier[3] as number + 1]);
        potentialModifications.push([s, m, 3, modifier[3] as number - 1]);
        potentialModifications.push([s, m, 4, modifier[4] as number + 1]);
        potentialModifications.push([s, m, 4, modifier[4] as number - 1]);
        break;
      }
    }
  }

  if (potentialModifications.length > 0) {
    const randomModification = Math.floor(Math.random() * (potentialModifications.length - 1));
    const modificationToMake = potentialModifications[randomModification];
    childAlg.streams[modificationToMake[0]][modificationToMake[1]][modificationToMake[2]] = modificationToMake[3];

    await AlgModel.upsert({
      elo: 1000,
      bullElo: 1000,
      bearElo: 1000,
      count: 1,
      bullCount: 1,
      bearCount: 1,
      por: 0,
      algorithm: JSON.stringify(childAlg)
    }).catch((e) => log(LogLevel.ERROR)(e));
  }
};

const mate = async (mom: string, dad: string): Promise<void> => {
  // child starts as a clone of mommy
  const childAlg = JSON.parse(mom) as MachineAlgorithm;
  const daddyAlg = JSON.parse(dad) as MachineAlgorithm;

  // entry and exit of child/daddy should be combined with OR and AND.
  const entryOperator = Math.random() > 0.5 ? DecisionActions.OR : DecisionActions.AND;
  const exitOperator = Math.random() > 0.5 ? DecisionActions.OR : DecisionActions.AND;

  const daddyEntry = daddyAlg.algResult.entry + childAlg.streams.length - 1;
  const daddyExit = daddyAlg.algResult.exit + childAlg.streams.length - 1;

  const childEntry = childAlg.algResult.entry;
  const childExit = childAlg.algResult.exit;

  daddyAlg.streams = daddyAlg.streams.map((stream) => {
    return stream.map((modifier) => {
      switch(modifier[0]) {
      case DecisionActions.AND:
      case DecisionActions.OR:
      case DecisionActions.CROSSOVER:
      case DecisionActions.NEGCROSSOVER:
      case SourceActions.STREAM:
        modifier[1] = modifier[1] as number + childAlg.streams.length;
        break;
      }
      return modifier;
    });
  });

  // TODO - should we just modify one of the entry/exit? Or do we always want to modify both?
  childAlg.streams = [
    ...childAlg.streams,
    ...daddyAlg.streams,
    [[SourceActions.STREAM, childEntry], [entryOperator, daddyEntry]], // new entry
    [[SourceActions.STREAM, childExit], [exitOperator, daddyExit]], // new entry
  ];

  childAlg.algResult.entry = childAlg.streams.length - 2;
  childAlg.algResult.exit  = childAlg.streams.length - 1;

  await AlgModel.upsert({
    elo: 1000,
    bullElo: 1000,
    bearElo: 1000,
    count: 1,
    bullCount: 1,
    bearCount: 1,
    por: 0,
    algorithm: JSON.stringify(childAlg)
  }).catch((e) => log(LogLevel.ERROR)(e));

  return;
};

const makeGeneration = async (algs: AlgModel[]): Promise<void> => {
  /*
    In reality, we have a handful of streams that are then compressed into 2 decision streams for entry/exit

    Entry points:
      - [x] Parameter modification - change 1 parameter in 1 action by 1 value, swapping out defaults if needed.
      - [ ] Action modification - change an action to another, compatible action
      - [ ] Component addition - add a new "component" to an alg. Another sma, a macd with a new comparison, etc.
      - [x] Stream addition (mating) - add a new stream (usually a well known thing like an RSA check) and attach it to the
        existing decision with an "OR" or "AND" operation, OR change a point of comparison (like a crossover) to
        the new stream.

    On all generations
      - trim unused streams
      - reset entry/exit points to correc indices
  */

  let generateAmount = Math.floor(algs.length / 2);
  if (generateAmount > 50) generateAmount = 50;
  for (const alg of algs.slice(0, generateAmount)) {
    // todo - validate each action: are all params present? do they make sense? Can we simplify?
    // e.g. BBAND, 1, 0, null doesn't make sense. That's just the current price!
    // seed algs are also written with missing params, so any "null" params should be filled out with their defaults
    const rand = Math.random();

    if (rand > .5) {
      await makeParameterModification(alg.algorithm);
    } else {
      await mate(alg.algorithm, algs[Math.floor(Math.random() * algs.length)].algorithm);
    }
  }

};

export default async (t: CoinbaseGranularity): Promise<void> => {
  let runCount = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const duration = 90 * 24 * 60 * 60 / t;

    const algs = await AlgModel.findAll({
      limit: 1000,
      order: [
        ['elo', 'DESC'],
        ['bear_elo', 'DESC'],
        ['bull_elo', 'DESC']
      ]
    });

    runCount++;
    if (runCount >= 100) {
      log(LogLevel.INFO)('Generating a new alg.');
      runCount = 0;

      await makeGeneration(algs);
    }

    let randI = Math.floor(Math.random() * (algs.length));
    const alg1Rank = algs[randI];
    const alg1 = algBuilder(JSON.parse(alg1Rank.algorithm) as MachineAlgorithm);

    algs.splice(randI, 1);

    randI = Math.floor(Math.random() * (algs.length));
    const alg2Rank = algs[randI];
    const alg2 = algBuilder(JSON.parse(alg2Rank.algorithm) as MachineAlgorithm);

    const wallet = new SimulationWallet();
    const comparisonWallet = new SimulationWallet();

    const sim = new PgSim(CoinbaseProduct.ETH_USD, t, duration);
    wallet.sim = sim;
    comparisonWallet.sim = sim;

    const broker = new Broker(wallet, sim, alg1);
    const comparisonBroker = new Broker(comparisonWallet, sim, alg2);
    await broker.init();
    await comparisonBroker.init();

    if (wallet.expectedProfit < 0) {
      log(LogLevel.ERROR)(`This was a bear market, expected profit was ${wallet.expectedProfit}`);
    } else {
      log(LogLevel.SUCCESS)(`This was a bull market, expected profit was ${wallet.expectedProfit}`);
    }

    if (isNaN(alg1Rank.por)) {
      alg1Rank.por = 0;
    }

    if (isNaN(alg2Rank.por)) {
      alg2Rank.por = 0;
    }

    if (!isNaN(wallet.profitOverReplacement)) {
      alg1Rank.por = ((alg1Rank.por * alg1Rank.count) + wallet.profitOverReplacement)/alg1Rank.count;
    } else if (!isNaN(wallet.expectedProfit)) {
      alg1Rank.por = ((alg1Rank.por * (alg1Rank.count)) + wallet.expectedProfit)/alg1Rank.count;
    }

    if (!isNaN(comparisonWallet.profitOverReplacement)) {
      alg2Rank.por = ((alg2Rank.por * (alg2Rank.count)) + comparisonWallet.profitOverReplacement)/alg2Rank.count;
    } else if (!isNaN(comparisonWallet.expectedProfit)) {
      alg2Rank.por = ((alg2Rank.por * (alg2Rank.count)) + comparisonWallet.expectedProfit)/alg2Rank.count;
    }

    alg1Rank.count++;
    alg2Rank.count++;

    const alg1All = alg1Rank.elo;
    const alg2All = alg2Rank.elo;
    const alg1Bear = alg1Rank.bearElo;
    const alg2Bear = alg2Rank.bearElo;
    const alg1Bull = alg1Rank.bullElo;
    const alg2Bull = alg2Rank.bullElo;


    if (wallet.profit > comparisonWallet.profit) {
      alg1Rank.elo = ((alg1All * (alg1Rank.count - 1)) + (alg2All + 400)) / alg1Rank.count;
      alg2Rank.elo = ((alg2All * (alg2Rank.count - 1)) + (alg1All - 400)) / alg2Rank.count;

      if (wallet.expectedProfit < 0) {
        alg1Rank.bearCount++;
        alg2Rank.bearCount++;

        alg1Rank.bearElo = ((alg1Bear * (alg1Rank.bearCount - 1)) + (alg2Bear + 400)) / alg1Rank.bearCount;
        alg2Rank.bearElo = ((alg2Bear * (alg2Rank.bearCount - 1)) + (alg1Bear - 400)) / alg2Rank.bearCount;
      } else {
        alg1Rank.bullCount++;
        alg2Rank.bullCount++;

        alg1Rank.bullElo = ((alg1Bull * (alg1Rank.bullCount - 1)) + (alg2Bull + 400)) / alg1Rank.bullCount;
        alg2Rank.bullElo = ((alg2Bull * (alg2Rank.bullCount - 1)) + (alg1Bull - 400)) / alg2Rank.bullCount;
      }
    } else if (wallet.profit === comparisonWallet.profit) {
      log(LogLevel.INFO)(`Draw, with POR of ${wallet.profitOverReplacement}`);
    } else {
      alg2Rank.elo = ((alg2All * (alg2Rank.count - 1)) + (alg1All + 400)) / alg2Rank.count;
      alg1Rank.elo = ((alg1All * (alg1Rank.count - 1)) + (alg2All - 400)) / alg1Rank.count;

      if (wallet.expectedProfit < 0) {
        alg2Rank.bearCount++;
        alg1Rank.bearCount++;

        alg2Rank.bearElo = ((alg2Bear * (alg2Rank.bearCount - 1)) + (alg1Bear + 400)) / alg2Rank.bearCount;
        alg1Rank.bearElo = ((alg1Bear * (alg1Rank.bearCount - 1)) + (alg2Bear - 400)) / alg1Rank.bearCount;
      } else {
        alg1Rank.bullCount++;
        alg2Rank.bullCount++;

        alg2Rank.bullElo = ((alg2Bull * (alg2Rank.bullCount - 1)) + (alg1Bull + 400)) / alg2Rank.bullCount;
        alg1Rank.bullElo = ((alg1Bull * (alg1Rank.bullCount - 1)) + (alg2Bull - 400)) / alg1Rank.bullCount;
      }
    }

    await alg1Rank.save().catch((err) => console.log('alg 1 err', err));
    await alg2Rank.save().catch((err) => console.log('alg 2 err', err));

    if (runCount === 0) {
      log(LogLevel.INFO)('cleaning up the db');
      // TODO - remove algs outside out 100 alg limit
      AlgModel.destroy({
        where: 
          {
            [Sequelize.Op.and]: [
              // big count
              { count: {[Sequelize.Op.gt]: 10} },
              // por = 0 --> equivalent to hodling
              { por: {[Sequelize.Op.eq]: 0} }
            ]
          },
      });

    }
  }
};
