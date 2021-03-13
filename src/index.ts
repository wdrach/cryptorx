import { forkJoin, Observable, combineLatest, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { CoinbaseProCandle, CoinbaseProSimulation, CoinbaseProPrice, Decision, log, writeState, SimulationWallet, Crossover, CoinbaseWallet, AlgorithmResult, CoinbaseGranularity } from './lib/lib';
import { stoch } from './algs/SimpleStoch';

function transact(wallet: SimulationWallet, signals: AlgorithmResult, candles: CoinbaseProCandle) {
  const buySignal = signals.buy;
  const sellSignal = signals.sell;

  let price = 0;
  candles.close().subscribe((val) => {
    if (!wallet.startingPrice) wallet.startingPrice = val;
    wallet.endingPrice = val;
    price = val
  });

  combineLatest([buySignal, sellSignal])
  .subscribe(([buy, sell]) => {
    if (sell === buy) return;
    if (sell) wallet.sell(price);
    if (buy) wallet.buy(price);
  })

  return candles;
}

let state: Record<string, Observable<any>> = {};

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

  const buySignal = signals.buy;
  const sellSignal = signals.sell;
  state.buy = buySignal;
  state.sell = sellSignal;

  let price = 0;
  let ready = false;

  combineLatest([buySignal, sellSignal]).subscribe(([sell, buy]) => {
    // if we're not ready, we're still in pre-data, not live data
    if (!ready || sell === buy) return;

    if (sell) wallet.sell(price);
    else if (buy) wallet.buy(price);
  })

  candles.ready.subscribe((val) => {
    ready = val
  });
  priceStream.subscribe((val) => {
    price = val
  });

  combineLatest([candles.time()]).subscribe(([t]) => {
    console.clear();
    console.log(`Time: ${(new Date(t * 1000)).toLocaleString()}`);
    console.log(`Current Price: ${price}`);
    console.log(`${wallet.coin}BTC`);
    console.log(`\$${wallet.dollars}`);

    if (wallet.transactions > 0) {
      console.log('--------------------------------------------------------------------');
      if (wallet.dollars) {
        console.log(`Sold at ${wallet.lastTransaction.toLocaleString()}`)
        console.log('--------------------------------------------------------------------');
        console.log(`Sold ${wallet.coin.toFixed(4)}BTC at \$${wallet.lastTransactionPrice.toFixed(2)}`);
        console.log(`Fees were \$${wallet.lastFee.toFixed(2)} for a net of \$${wallet.dollars.toFixed(2)}`);
        console.log('--------------------------------------------------------------------');
        console.log(`Right now you have a profit of ${wallet.profit.toFixed(2)}%.`);
        console.log(`If you would have held, you'd have a profit of ${wallet.expectedProfit.toFixed(2)}%.`)
        console.log(`That's a profit over replacement of ${wallet.profitOverReplacement.toFixed(2)}%`);
      } else if (wallet.coin) {
        console.log(`Bought at ${wallet.lastTransaction.toLocaleString()}`);
        console.log('--------------------------------------------------------------------');
        console.log(`Bought ${wallet.coin.toFixed(4)}BTC at \$${wallet.lastTransactionPrice.toFixed(2)}`);
        console.log(`Fees were ${wallet.lastFee.toFixed(2)} for a net cost of \$${wallet.dollars.toFixed(2)}`);
        console.log('--------------------------------------------------------------------');
        console.log(`Right now you have a profit of ${wallet.profit.toFixed(2)}%.`);
        console.log(`If you would have held, you'd have a profit of ${wallet.expectedProfit.toFixed(2)}%.`)
        console.log(`That's a profit over replacement of ${wallet.profitOverReplacement.toFixed(2)}%`);
      }

      console.log('--------------------------------------------------------------------');
      console.log(`In total, \$${wallet.fees} in fees has been paid on ${wallet.transactions} transactions`);
      console.log('--------------------------------------------------------------------');
      console.log('Transactions:');

      for (let transaction of wallet.lastTransactions) {
        console.log(transaction.toLocaleString());
      }
    }
  })

  if (filename) {
    writeState(state, candles.time(), `${filename}.csv`);
    writeState({transactions: state.transactions}, state.transactions, `${filename}.transactions.csv`);
  }

  return candles;
}

let paperTrade = (filename?: string) => {
  const candles = new CoinbaseProCandle('BTC-USD', 100, 86400);
  const price = new CoinbaseProPrice();
  paperTransact(stoch(candles), candles, price, filename);
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
  const RUN_SIMS = 10;

  const sims = [];
  const wallets: SimulationWallet[] = [];
  for (let i = 0; i < RUN_SIMS; i++) {
    const wallet = new SimulationWallet();
    wallets.push(wallet);
    const sim = new CoinbaseProSimulation(CoinbaseGranularity.HOUR, 365*24);

    sims.push(transact(wallet, stoch(sim), sim));
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


    for (let wallet of wallets) {
      cash += wallet.netWorth;
      expected += wallet.expected;
      expectedProfit += wallet.expectedProfit;
      profit += wallet.profit;
      profitOverReplacement += wallet.profitOverReplacement;
      fees += wallet.fees;
      trades += wallet.transactions;

      if (worstProfit === -1 || wallet.profit < worstProfit) {
        worstExpectedProfit = wallet.expectedProfit;
        worstProfit = wallet.profit;
        worstProfitOverReplacement = wallet.profitOverReplacement;
      }

      if (bestProfit === -1 || wallet.profit > bestProfit) {
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
    console.log(`The best sim made ${bestProfit.toFixed(2)} over ${bestExpectedProfit.toFixed(2)} for a POR of ${bestProfitOverReplacement.toFixed(2)}`)
    console.log(`The worst sim made ${worstProfit.toFixed(2)} over ${worstExpectedProfit.toFixed(2)} for a POR of ${worstProfitOverReplacement.toFixed(2)}`)
  });
} else if (process.argv.findIndex((val) => val === '-p') !== -1) {
  let filenameIndex = process.argv.findIndex((val) => val === '-f') + 1;
  if (filenameIndex && filenameIndex < process.argv.length) {
    paperTrade(process.argv[filenameIndex]);
  } else {
    paperTrade();
  }
} else if (process.argv.findIndex((val) => val === '-l') !== -1) {
  const wallet = new CoinbaseWallet();
  wallet.init();
} else {
  console.log('unsupported');
}