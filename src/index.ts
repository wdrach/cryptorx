import { forkJoin, Observable, combineLatest, Subject } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { CoinbaseProCandle, CoinbaseProSimulation, CoinbaseProPrice, log, writeState, SimulationWallet, CoinbaseWallet, AlgorithmResult, Broker } from './lib/lib';
import { CoinbaseGranularity, LogLevel, CoinbaseProduct } from './lib/constants';

const activeProduct = CoinbaseProduct.ETH_USD;

// eslint-disable-next-line
const state: Record<string, Observable<any>> = {};

function paperTransact(signals: AlgorithmResult, candles: CoinbaseProCandle, priceStream: CoinbaseProPrice, filename?: string) {
    const wallet = new SimulationWallet();
    state.coin = wallet.coinStream;
    state.dollars = wallet.dollarStream;
    state.transaction = wallet.transactionStream.pipe(map((val) => val.toLocaleString()));

    state.time = candles.time();
    state.high = candles.high();
    state.low = candles.low();
    state.open = candles.open();
    state.close = candles.close();
    state.price = priceStream;

    const entrySignal = signals.entry;
    const exitSignal = signals.exit;
    state.entry = entrySignal;
    state.exit = exitSignal;

    let price = 0;
    let ready = false;

    combineLatest([entrySignal, exitSignal]).subscribe(([entry, exit]) => {
    // if we're not ready, we're still in pre-data, not live data
        if (!ready || exit === entry) return;

        if (exit) wallet.sell(price);
        else if (entry) wallet.buy(price);
    });

    candles.ready.subscribe((val) => {
        ready = val;
    });
    priceStream.subscribe((val) => {
        price = val;
    });

    combineLatest([candles.time()]).subscribe(([t]) => {
        console.clear();
        console.log(`Time: ${(new Date(t * 1000)).toLocaleString()}`);
        console.log(`Current Price: ${price}`);
        console.log(`${wallet.coin}ETH`);
        console.log(`$${wallet.dollars}`);

        if (wallet.transactions > 0) {
            console.log('--------------------------------------------------------------------');
            if (wallet.dollars) {
                console.log(`Sold at ${wallet.lastTransaction.toLocaleString()}`);
                console.log('--------------------------------------------------------------------');
                console.log(`Sold ${wallet.coin.toFixed(4)}ETH at $${wallet.lastTransactionPrice.toFixed(2)}`);
                console.log(`Fees were $${wallet.lastFee.toFixed(2)} for a net of $${wallet.dollars.toFixed(2)}`);
                console.log('--------------------------------------------------------------------');
                console.log(`Right now you have a profit of ${wallet.profit.toFixed(2)}%.`);
                console.log(`If you would have held, you'd have a profit of ${wallet.expectedProfit.toFixed(2)}%.`);
                console.log(`That's a profit over replacement of ${wallet.profitOverReplacement.toFixed(2)}%`);
            } else if (wallet.coin) {
                console.log(`Bought at ${wallet.lastTransaction.toLocaleString()}`);
                console.log('--------------------------------------------------------------------');
                console.log(`Bought ${wallet.coin.toFixed(4)}ETH at $${wallet.lastTransactionPrice.toFixed(2)}`);
                console.log(`Fees were ${wallet.lastFee.toFixed(2)} for a net cost of $${wallet.dollars.toFixed(2)}`);
                console.log('--------------------------------------------------------------------');
                console.log(`Right now you have a profit of ${wallet.profit.toFixed(2)}%.`);
                console.log(`If you would have held, you'd have a profit of ${wallet.expectedProfit.toFixed(2)}%.`);
                console.log(`That's a profit over replacement of ${wallet.profitOverReplacement.toFixed(2)}%`);
            }

            console.log('--------------------------------------------------------------------');
            console.log(`In total, $${wallet.fees} in fees has been paid on ${wallet.transactions} transactions`);
            console.log('--------------------------------------------------------------------');
            console.log('Transactions:');

            for (const transaction of wallet.lastTransactions) {
                console.log(transaction.toLocaleString());
            }
        }
    });

    if (filename) {
        writeState(state, candles.time(), `${filename}.csv`);
        writeState({transactions: state.transactions}, state.transactions, `${filename}.transactions.csv`);
    }

    return candles;
}

const paperTrade = (activeAlg: (candle: CoinbaseProCandle) => AlgorithmResult, activePeriod: CoinbaseGranularity, filename?: string) => {
    const candles = new CoinbaseProCandle(activeProduct, 100, activePeriod);
    const price = new CoinbaseProPrice();
    paperTransact(activeAlg(candles), candles, price, filename);
};

const liveTrade = async () => {
    const wallet = new CoinbaseWallet();
    await wallet.init();
};


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
        let activeAlg: (candles: CoinbaseProCandle) => AlgorithmResult = require(alg).default;

        const simIndex = process.argv.findIndex((val) => val === '-s');
        const sim   = simIndex !== -1;
        const paper = process.argv.findIndex((val) => val === '-p') !== -1;
        const live  = process.argv.findIndex((val) => val === '-l') !== -1;
        const cron  = process.argv.findIndex((val) => val === '-c') !== -1;
        const sellTest  = process.argv.findIndex((val) => val === '--sell-test') !== -1;
        const buyTest  = process.argv.findIndex((val) => val === '--buy-test') !== -1;

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

        const duration = 365 * 24 * 60 * 60 / t;

        if (sim) {
            const RUN_SIMS = 10;

            const sims = [];
            const wallets: SimulationWallet[] = [];
            for (let i = 0; i < RUN_SIMS; i++) {
                const sim = new CoinbaseProSimulation(t, duration, activeProduct);
                const wallet = new SimulationWallet();
                wallet.sim = sim;
                wallets.push(wallet);

                const broker = new Broker(wallet, activeAlg(sim));
                sim.subscribe({complete: () => broker.complete()});

                sims.push(sim);
            }

            forkJoin(sims).subscribe(() => {
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


                for (const wallet of wallets) {
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
                }

                expectedProfit = expectedProfit / RUN_SIMS;
                profit = profit / RUN_SIMS;
                profitOverReplacement = profitOverReplacement / RUN_SIMS;

                console.log(`\nGot ${(cash / RUN_SIMS).toFixed(2)} in the bank`);
                console.log(`would have ${(expected / RUN_SIMS).toFixed(2)} in the bank if I just held`);
                console.log(`that's a ${profit.toFixed(2)}% profit when I expected ${expectedProfit.toFixed(2)}% or a ${profitOverReplacement.toFixed(2)}% profit over replacement.`);
                console.log(`you made ${(trades / RUN_SIMS).toFixed(2)} trades per sim, for an average fee of ${(fees/trades).toFixed(2)} and a total of ${(fees/RUN_SIMS).toFixed(2)} per sim`);
                console.log('--------------------------------------------------------------');
                console.log(`The best sim made ${bestProfit.toFixed(2)} over ${bestExpectedProfit.toFixed(2)} for a POR of ${bestProfitOverReplacement.toFixed(2)}`);
                console.log(`The worst sim made ${worstProfit.toFixed(2)} over ${worstExpectedProfit.toFixed(2)} for a POR of ${worstProfitOverReplacement.toFixed(2)}`);
            });
        } else if (paper) {
            const filenameIndex = process.argv.findIndex((val) => val === '-f') + 1;
            if (filenameIndex && filenameIndex < process.argv.length) {
                paperTrade(activeAlg, t, process.argv[filenameIndex]);
            } else {
                paperTrade(activeAlg, t);
            }
        } else if (live) {
            console.log('Live trading is discouraged over cron trading, which is more stable and accurate over many days.');
            liveTrade();
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

            const candles = new CoinbaseProCandle(activeProduct, 250, t);

            const out = activeAlg(candles);

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
        } else {
            console.log('unsupported');
        }
    }
};

main();
