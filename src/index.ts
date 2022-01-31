import { combineLatest, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CoinbaseGranularity, LogLevel, CoinbaseProduct } from './lib/constants';

import dotenv from 'dotenv';
import { CoinbaseProCandles, CoinbaseProPrice, CoinbaseWallet } from './lib/sources/coinbase';
import { Candles } from './lib/streams/candles';
import { AlgorithmResult } from './lib/streams/alg';
import { log } from './lib/util/logging';
import { SimulationWallet } from './lib/streams/wallet';
import { Broker } from './lib/streams/broker';
import { init, PgSim, populate, teardown } from './lib/sources/pg';

import battleRunner from './lib/exec/battle';
dotenv.config();

const activeProduct = CoinbaseProduct.ETH_USD;

const main = async () => {
  if (process.argv.length <= 2) {
    // no file provided
    const price = new CoinbaseProPrice();
    price.subscribe((price) => log(LogLevel.SUCCESS)(price.toFixed(2)));
  } else {
    let algName = process.argv[process.argv.length - 1];
    let defaultAlg = false;
    
    if (algName.charAt(0) === '-') {
      defaultAlg = true;
      algName = 'BollingerBands';
    }

    const alg = `./algs/${algName}`;
    // eslint-disable-next-line
    let activeAlg: (candles: Candles) => AlgorithmResult = require(alg).default;
    console.log(alg);

    const simIndex  = process.argv.findIndex((val) => val === '-s');
    const sim       = simIndex !== -1;
    const cron      = process.argv.findIndex((val) => val === '-c') !== -1;
    const multi     = process.argv.findIndex((val) => val === '-m') !== -1;
    const huge      = process.argv.findIndex((val) => val === '-h') !== -1;
    const sellTest  = process.argv.findIndex((val) => val === '--sell-test') !== -1;
    const buyTest   = process.argv.findIndex((val) => val === '--buy-test') !== -1;
    const scratch   = process.argv.findIndex((val) => val === '-z') !== -1;
    const battle    = process.argv.findIndex((val) => val === '-b') !== -1;
    const initDb    = process.argv.findIndex((val) => val === '-p') !== -1;

    const timeIndex = process.argv.findIndex((val) => val === '-t');
    let t: CoinbaseGranularity | undefined;
    if (timeIndex !== -1) {
      switch (process.argv[timeIndex + 1].toUpperCase()) {
      case 'HOUR':
        t = CoinbaseGranularity.HOUR;
        break;
      case 'DAY':
        t = CoinbaseGranularity.DAY;
        break;
      }
    }

    if (!t) t = CoinbaseGranularity.HOUR;

    let duration = 365 * 24 * 60 * 60 / t;

    await init();

    if (sim) {
      const RUN_SIMS = huge ? (multi ? 10 : 100) : (multi ? 1 : 10);

      let cash = 0;
      let expected = 0;
      let expectedProfit = 0;
      let profitOverReplacement = 0;
      let fees = 0;
      let trades = 0;
      let profit = 0;

      let worstProfit = -1;
      let bestProfit = -1;
      let worstExpectedProfit = -1;
      let bestExpectedProfit = -1;
      let worstProfitOverReplacement = -1;
      let bestProfitOverReplacement = -1;

      let bearProfit = 0;
      let bearExpectedProfit = 0;
      let bearProfitOverReplacement = 0;
      let bearCount = 0;
      let bullProfit = 0;
      let bullExpectedProfit = 0;
      let bullProfitOverReplacement = 0;
      let bullCount = 0;

      for (let i = 0; i < RUN_SIMS; i++) {
        const wallet = new SimulationWallet();
        let comparisonWallet: SimulationWallet | undefined;
        let products = [CoinbaseProduct.ETH_USD];
        if (multi) {
          comparisonWallet = new SimulationWallet();
          products = [];

          for (const product in CoinbaseProduct) {
            const splitProduct = product.split('_');
            if (splitProduct[1] === 'USD') {
              products.push(splitProduct.join('-') as CoinbaseProduct);
            }
          }
        }

        const sim = new PgSim(CoinbaseProduct.ETH_USD, t, duration);
        wallet.sim = sim;
        if (comparisonWallet) comparisonWallet.sim = sim;

        const broker = new Broker(wallet, sim, activeAlg);
        await broker.init();

        cash += wallet.netWorth;
        expected += wallet.expected;
        expectedProfit += wallet.expectedProfit;
        profit += wallet.profit;
        profitOverReplacement += wallet.profitOverReplacement;
        fees += wallet.fees;
        trades += wallet.transactions;

        if (worstProfitOverReplacement === -1 || wallet.profitOverReplacement < worstProfitOverReplacement) {
          worstExpectedProfit = wallet.expectedProfit;
          worstProfit = wallet.profit;
          worstProfitOverReplacement = wallet.profitOverReplacement;
        }

        if (bestProfitOverReplacement === -1 || wallet.profitOverReplacement > bestProfitOverReplacement) {
          bestExpectedProfit = wallet.expectedProfit;
          bestProfit = wallet.profit;
          bestProfitOverReplacement = wallet.profitOverReplacement;
        }

        if (wallet.expectedProfit < 0) {
          bearProfit += wallet.profit;
          bearExpectedProfit += wallet.expectedProfit;
          bearProfitOverReplacement += wallet.profitOverReplacement;
          bearCount++;
        } else {
          bullProfit += wallet.profit;
          bullExpectedProfit += wallet.expectedProfit;
          bullProfitOverReplacement += wallet.profitOverReplacement;
          bullCount++;
        }
      }

      expectedProfit = expectedProfit / RUN_SIMS;
      profit = profit / RUN_SIMS;
      profitOverReplacement = profitOverReplacement / RUN_SIMS;

      console.log(`\nGot ${(cash / RUN_SIMS).toFixed(2)} in the bank`);
      console.log(`would have ${(expected / RUN_SIMS).toFixed(2)} in the bank if I just held`);
      console.log(`that's a ${profit.toFixed(2)}% profit when I expected ${expectedProfit.toFixed(2)}% or a ${profitOverReplacement.toFixed(2)}% profit over replacement.`);
      console.log(`you made ${(trades / RUN_SIMS).toFixed(2)} trades per sim, for an average fee of ${(fees/trades).toFixed(2)} and a total of ${(fees/RUN_SIMS).toFixed(2)} per sim`);
      console.log('--------------------------------------------------------------');
      console.log(`The best sim made ${bestProfit.toFixed(2)}% over ${bestExpectedProfit.toFixed(2)} for a POR of ${bestProfitOverReplacement.toFixed(2)}%`);
      console.log(`The worst sim made ${worstProfit.toFixed(2)}% over ${worstExpectedProfit.toFixed(2)} for a POR of ${worstProfitOverReplacement.toFixed(2)}%`);
      console.log('--------------------------------------------------------------');
      console.log(`In bear markets, you made ${(bearProfit/bearCount).toFixed(2)}% over ${(bearExpectedProfit/bearCount).toFixed(2)}% for a POR of ${(bearProfitOverReplacement/bearCount).toFixed(2)}%`);
      console.log(`In bull markets, you made ${(bullProfit/bullCount).toFixed(2)}% over ${(bullExpectedProfit/bullCount).toFixed(2)}% for a POR of ${(bullProfitOverReplacement/bullCount).toFixed(2)}%`);
      console.log('--------------------------------------------------------------');
      console.log('expected profit | profit | profit over replacement | bear expected profit | bear profit | bear profit over replacement | bull expected profit | bull profit | bull profit over replacement | trades per sim | fees per sim');
      console.log('You can copy the following line and paste into excel!');
      console.log(`${expectedProfit}	${profit}	${profitOverReplacement}	${bearExpectedProfit/bearCount}	${bearProfit/bearCount}	${bearProfitOverReplacement/bearCount}	${bullExpectedProfit/bullCount}	${bullProfit/bullCount}	${bullProfitOverReplacement/bullCount}	${trades / RUN_SIMS}	${fees / RUN_SIMS}`);

      await teardown();
    } else if (battle) {
      await battleRunner(t);
      await teardown();

    // TODO - verify this still works lol
    } else if (cron) {
      if (defaultAlg) {
        switch (t) {
        case CoinbaseGranularity.HOUR:
          // eslint-disable-next-line
                    activeAlg = require('./algs/VolumeWeightedCross').default;
          break;
        case CoinbaseGranularity.DAY:
          // eslint-disable-next-line
                    activeAlg = require('./algs/VolumeWeightedCross').default;
        }
      }

      const wallet = new CoinbaseWallet();
      await wallet.init();

      const candles = new CoinbaseProCandles(activeProduct, 250, t);

      const out = activeAlg(candles);

      if (!out.entry || !out.exit) return;

      const unsubscriber = new Subject<void>();

      combineLatest([out.entry, out.exit, candles.time(), candles.current]).pipe(takeUntil(unsubscriber)).subscribe(([entry, exit, time, ready]) => {
        // if we're not ready, we're still in pre-data, not live data
        if (!ready) return;

        console.log(`time: ${(new Date(time * 1000)).toLocaleString()}`);
        console.log(`ready - exit: ${exit} entry: ${entry}`);
        unsubscriber.next();
        unsubscriber.complete();
        candles.complete();

        // TODO - this really shouldn't be necessary, but we want to wait extra time just in the off chance
        // we hit a coinbase limit
        setTimeout(() => {
          if (exit && !entry) {
            console.log('selling!');
            wallet.sell();
          } else if (entry && !exit) {
            console.log('buying!');
            wallet.buy();
          } else {
            console.log('exit === entry');
          }

          setTimeout(() => {
            process.exit();
          }, 2000);
        }, 2000);
      });
    } else if (sellTest || buyTest) {
      const wallet = new CoinbaseWallet();
      await wallet.init();
      if (sellTest) {
        wallet.sell();
      } else {
        wallet.buy();
      }
    } else if (initDb) {
      await init(true);
      await populate();
      await teardown();
    } else if (scratch) {
      console.log('hello world');
    }
  }
};

main();
