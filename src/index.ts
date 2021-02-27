import { forkJoin, Observable, combineLatest, Subject } from 'rxjs';
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

  let firstPrice = 0;

  let dollars = 1000;
  let btc = 0;
  let lastFee = 0;
  let fees = 0;
  let transactions: Date[] = [];
  let lastTransaction = new Date(Date.now());
  let transactionSub = new Subject<string>();

  let btcSub = new Subject<number>();
  let dolSub = new Subject<number>();
  state.btc = btcSub;
  state.dollars = dolSub;

  combineLatest([buySignal, sellSignal])
  .subscribe(([sell, buy]) => {
    // if we're not ready, we're still in pre-data, not live data
    if (!ready) return;

    // Set the first price to determine our hodl profits
    if (!firstPrice) firstPrice = price;

    if (sell && btc) {
      const fee = price*btc*COINBASE_TRANSACTION_FEE;
      dollars = price*btc - fee;


      lastTransaction = new Date(Date.now());
      transactions.push(lastTransaction);
      transactionSub.next(lastTransaction.toLocaleString());

      lastFee = fee;
      fees += fee;
      btcSub.next(0);
      dolSub.next(dollars);
      btc = 0;
    } else if (buy && dollars) {
      const fee = dollars*COINBASE_TRANSACTION_FEE;
      btc = (dollars - fee)/price;

      lastTransaction = new Date(Date.now());
      transactions.push(lastTransaction);
      transactionSub.next(lastTransaction.toLocaleString());

      lastFee = fee;
      fees += fee;
      dolSub.next(0);
      btcSub.next(btc);
      dollars = 0;
    }

    if (transactions.length > 10) {
      transactions.shift();
    }
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
    console.log(`${btc}BTC`);
    console.log(`\$${dollars}`);

    if (transactions.length > 0) {
      console.log('--------------------------------------------------------------------');
      if (dollars) {
        console.log(`Sold at ${lastTransaction.toLocaleString()}`)
        console.log('--------------------------------------------------------------------');
        console.log(`Sold ${btc.toFixed(4)}BTC at \$${price.toFixed(2)}`);
        console.log(`Fees were \$${lastFee.toFixed(2)} for a net of \$${dollars.toFixed(2)}`);
        console.log('--------------------------------------------------------------------');
        const profit = ((dollars - 1000)/10);
        const expectedProfit = (((1000/firstPrice)*price - 1000)/10);
        console.log(`Right now you have a profit of ${profit.toFixed(2)}%.`);
        console.log(`If you would have held, you'd have a profit of ${expectedProfit.toFixed(2)}%.`)
        console.log(`That's a profit over replacement of ${(profit - expectedProfit).toFixed(2)}%`);
      } else if (btc) {
        console.log(`Bought at ${lastTransaction.toLocaleString()}`);
        console.log('--------------------------------------------------------------------');
        console.log(`Bought ${btc.toFixed(4)}BTC at \$${price.toFixed(2)}`);
        console.log(`Fees were ${lastFee.toFixed(2)} for a net cost of \$${dollars.toFixed(2)}`);
        console.log('--------------------------------------------------------------------');
        const profit = ((btc*price - 1000)/10);
        const expectedProfit = (((1000/firstPrice)*price - 1000)/10);
        console.log(`Right now you have a profit of ${profit.toFixed(2)}%.`);
        console.log(`If you would have held, you'd have a profit of ${expectedProfit.toFixed(2)}%.`)
        console.log(`That's a profit over replacement of ${(profit - expectedProfit).toFixed(2)}%`);
      }

      console.log('--------------------------------------------------------------------');
      console.log(`In total, \$${fees} in fees has been paid on ${transactions.length} transactions`);
      console.log('--------------------------------------------------------------------');
      console.log('Transactions:');

      for (let transaction of transactions) {
        console.log(transaction.toLocaleString());
      }
    }
  })

  writeState(state, candles.time(), `${filename}.csv`);
  writeState({transactions: transactionSub}, transactionSub, `${filename}.transactions.csv`);

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