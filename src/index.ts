import { forkJoin, Observable, combineLatest, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { CoinbaseProCandle, CoinbaseProSimulation, CoinbaseProPrice, Decision, log, writeState, SimulationWallet } from './lib/lib';

const COINBASE_TRANSACTION_FEE = .005;

function transact(wallet: SimulationWallet, signals: Observable<boolean>[], candles: CoinbaseProCandle) {
  const buySignal = signals[0];
  const sellSignal = signals[1];

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

function paperTransact(signals: Observable<boolean>[], candles: CoinbaseProCandle, priceStream: CoinbaseProPrice, filename?: string) {
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

  const buySignal = signals[0];
  const sellSignal = signals[1];
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

  candles.ready().subscribe((val) => {
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

let algo = (candles: CoinbaseProCandle, sma1: number = 15, sma2: number = 50) => {
  const sma15 = candles.close().sma(sma1);
  const sma50 = candles.close().sma(sma2);

  state.sma15 = sma15;
  state.sma50 = sma50;

  // golden cross
  const goldenCross = new Decision(sma50, sma15, (a, b) => a < b);

  // death cross
  const deathCross = new Decision(sma50, sma15, (a, b) => a > b);

  return [goldenCross, deathCross];
}

let fullSim = (wallet: SimulationWallet, candles: CoinbaseProSimulation, sma1: number, sma2: number) => {
  return transact(wallet, algo(candles, sma1, sma2), candles);
}

let paperTrade = (filename?: string) => {
  const candles = new CoinbaseProCandle('BTC-USD', 100);
  const price = new CoinbaseProPrice();
  paperTransact(algo(candles), candles, price, filename);
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
  const RUN_SIMS = 50;
  const iSTART = 900;
  const jSTART = 2400;
  const iEND = 1000;
  const jEND = 2500;
  const INCREMENT = 100;
  const simData: CoinbaseProSimulation[] = [];
  const allSims = [];

  const simMatrix: {profit: number; profitOverReplacement: number; sim1: number; sim2: number}[] = [];

  for (let i=0; i < RUN_SIMS; i++) {
    simData.push(new CoinbaseProSimulation());
  }

  for (let i = iSTART; i < iEND; i += INCREMENT) {
    for (let j = jSTART; j < jEND; j += INCREMENT) {
      console.log(`starting sim ${i}, ${j}`)
      const theseSims = [];
      const wallets: SimulationWallet[] = [];
      for (let ourSimData of simData) {
        const wallet = new SimulationWallet();
        let ourSim = fullSim(wallet, ourSimData, i, j);
        theseSims.push(ourSim);
        allSims.push(ourSim);
        wallets.push(wallet);
      }

      forkJoin(theseSims).subscribe(() => {
        let cash = 0;
        let expected = 0;
        let expectedProfit = 0;
        let profitOverReplacement = 0;
        let fees = 0;
        let trades = 0;
        let profit = 0;

        for (let wallet of wallets) {
          cash += wallet.netWorth;
          expected += wallet.expected;
          expectedProfit += wallet.expectedProfit;
          profit += wallet.profit;
          profitOverReplacement += wallet.profitOverReplacement;
          fees += wallet.fees;
          trades += wallet.transactions;
        }

        expectedProfit = expectedProfit / RUN_SIMS;
        profit = profit / RUN_SIMS;
        profitOverReplacement = profitOverReplacement / RUN_SIMS;

        console.log(`\nGot ${cash} in the bank`);
        console.log(`would have ${expected} in the bank if I just held`);
        console.log(`that's a ${profit.toFixed(2)}% profit when I expected ${expectedProfit.toFixed(2)}% or a ${profitOverReplacement.toFixed(2)}% profit over replacement.`);
        console.log(`you made ${(trades).toFixed(2)} trades, for an average fee of ${(fees/trades).toFixed(2)} and a total of ${(fees/RUN_SIMS).toFixed(2)}`)
        simMatrix.push({sim1: i, sim2: j, profitOverReplacement: profitOverReplacement, profit: profit});
      });
    }

    forkJoin(allSims).subscribe(() => {
      let winners = simMatrix.filter((val) => val.profit).sort((a, b) => b.profitOverReplacement - a.profitOverReplacement);

      for (let winner of winners.slice(0,10)) {
        console.log(`WINNER: ${winner.sim1}, ${winner.sim2} : ${winner.profitOverReplacement}`);
      }
    })
  }
} else if (process.argv.findIndex((val) => val === '-p') !== -1) {
  let filenameIndex = process.argv.findIndex((val) => val === '-f') + 1;
  if (filenameIndex && filenameIndex < process.argv.length) {
    paperTrade(process.argv[filenameIndex]);
  } else {
    paperTrade();
  }
} else {
  console.log('unsupported');
}