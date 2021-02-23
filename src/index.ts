import { forkJoin, Observable, zip } from 'rxjs';
import { CoinbaseProCandle, CoinbaseProSimulation, CoinbaseProPrice, Decision, log } from './lib/lib';

const COINBASE_TRANSACTION_FEE = .005;

let totalCash = 0;
let totalExpected = 0;
let totalTrades = 0;
let totalFees = 0;

function transact(signals: Observable<boolean>[], candles: CoinbaseProCandle) {
  const buySignal = signals[0];
  const sellSignal = signals[1];

  let price = 0;
  candles.close().subscribe((val) => price = val);

  let firstPrice = 0;

  let dollars = 1000;
  let btc = 0;

  zip(buySignal, sellSignal)
  .subscribe(([buy, sell]) => {
    if (!firstPrice) firstPrice = price;

    if (sell && btc) {
      totalTrades++;
      const fee = price*btc*COINBASE_TRANSACTION_FEE;
      totalFees += fee
      dollars = price*btc - fee;
      btc = 0;
    } else if (buy && dollars) {
      const fee = dollars*COINBASE_TRANSACTION_FEE;
      totalTrades++;
      totalFees += fee;
      btc = (dollars - fee)/price;
      dollars = 0;
    }
  })

  candles.subscribe({complete: () => {
    let cash = dollars || price*btc;
    totalCash += cash;
    let expected = price * 1000/firstPrice;
    totalExpected += expected;
  }});

  return candles;
}

function paperTransact(signals: Observable<boolean>[], candles: CoinbaseProCandle, priceStream: CoinbaseProPrice) {
  const buySignal = signals[0];
  const sellSignal = signals[1];

  let price = 0;
  let ready = false;

  let firstPrice = 0;

  let dollars = 1000;
  let btc = 0;

  zip(buySignal, sellSignal)
  .subscribe(([sell, buy]) => {
    // if we're not ready, we're still in pre-data, not live data
    if (!ready) return;

    // Set the first price to determine our hodl profits
    if (!firstPrice) firstPrice = price;

    if (sell && btc) {
      const fee = price*btc*COINBASE_TRANSACTION_FEE;
      dollars = price*btc - fee;

      console.log('================================================');
      console.log('SELL SELL SELL!');
      console.log(`Sold ${btc.toFixed(4)}BTC at \$${price.toFixed(2)}`);
      console.log(`Fees were \$${fee.toFixed(2)} for a net of \$${dollars.toFixed(2)}`);
      console.log('------------------------------------------------');
      const profit = ((dollars - 1000)/10);
      const expectedProfit = (((1000/firstPrice)*price - 1000)/10);
      console.log(`Right now you have a profit of ${profit.toFixed(2)}%.`);
      console.log(`If you would have held, you'd have a profit of ${expectedProfit.toFixed(2)}%.`)
      console.log(`That's a profit over replacement of ${(profit - expectedProfit).toFixed(2)}%`);
      console.log('================================================');

      btc = 0;
    } else if (buy && dollars) {
      const fee = dollars*COINBASE_TRANSACTION_FEE;
      btc = (dollars - fee)/price;

      console.log('================================================');
      console.log('BUY BUY BUY!');
      console.log(`Bought ${btc.toFixed(4)}BTC at \$${price.toFixed(2)}`);
      console.log(`Fees were ${fee.toFixed(2)} for a net cost of \$${dollars.toFixed(2)}`);
      console.log('================================================');

      dollars = 0;
    }
  })

  candles.ready().subscribe((val) => {
    ready = val
  });
  priceStream.subscribe((val) => {
    price = val
  });

  zip(candles.close(), buySignal, sellSignal).subscribe(([p, b, s]) => {
    console.log('=========');
    console.log(`Current Price: ${price}`);
    console.log(`Closing Price: ${p}`);
    console.log(`Buy: ${b}`);
    console.log(`Sell: ${s}`);
    console.log(`Ready: ${ready}`)
    console.log('=========');
  })

  return candles;
}

let algo = (candles: CoinbaseProCandle) => {
  const sma15 = candles.close().sma(15);
  const sma50 = candles.close().sma(50);

  // golden cross
  const goldenCross = new Decision(sma50, sma15, (a, b) => a < b);

  // death cross
  const deathCross = new Decision(sma50, sma15, (a, b) => a > b);

  return [goldenCross, deathCross];
}

let fullSim = () => {
  const candles = new CoinbaseProSimulation();
  return transact(algo(candles), candles);
}

let paperTrade = () => {
  const candles = new CoinbaseProCandle('BTC-USD', 100);
  const price = new CoinbaseProPrice();
  paperTransact(algo(candles), candles, price);
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

  for (let i=0; i< RUN_SIMS; i++) {
    sims.push(fullSim());
  }

  forkJoin(sims).subscribe(() => {
    console.log(`\nGot ${totalCash/RUN_SIMS} in the bank`);
    console.log(`would have ${totalExpected/RUN_SIMS} in the bank if I just held`);

    const expectedProfit = ((totalExpected/RUN_SIMS) - 1000)/10;
    const profit = ((totalCash/RUN_SIMS) - 1000)/10;
    const diffProfit = profit - expectedProfit;
    console.log(`that's a ${profit.toFixed(2)}% profit when I expected ${expectedProfit.toFixed(2)}% or a ${diffProfit.toFixed(2)}% profit over replacement.`);
    console.log(`you made ${(totalTrades/RUN_SIMS).toFixed(2)} trades per sim, for an average fee of ${(totalFees/totalTrades).toFixed(2)} and a total of ${(totalFees/RUN_SIMS).toFixed(2)}`)
  });
} else if (process.argv.findIndex((val) => val === '-p') !== -1) {
  paperTrade();
} else {
  console.log('unsupported');
}