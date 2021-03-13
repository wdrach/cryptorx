import { combineLatest, Subject } from "rxjs";
import { map, takeUntil } from "rxjs/operators";
import { stoch } from "../algs/SimpleStoch";
import { CoinbaseGranularity, CoinbaseProCandle, CoinbaseWallet, writeState } from "../lib/lib";

const main = async () => {
    const wallet = new CoinbaseWallet();
    wallet.init();

    const candles = new CoinbaseProCandle('BTC-USD', 20, CoinbaseGranularity.HOUR);

    const result = stoch(candles);

    const state = {
        time: candles.time().pipe(map((val) => (new Date(val * 1000)).toLocaleString())),
        open: candles.open(),
        close: candles.close(),
        high: candles.high(),
        low: candles.low(),
        ...result.state
    };

    await writeState(state, candles.time(), 'stoch-cron.csv');

    const buySignal = result.buy;
    const sellSignal = result.sell;

    const unsubscriber = new Subject<void>()

    combineLatest([buySignal, sellSignal, candles.time(), candles.current]).pipe(takeUntil(unsubscriber)).subscribe(([sell, buy, time, ready]) => {
        // if we're not ready, we're still in pre-data, not live data
        if (!ready) return;

        console.log(`time: ${(new Date(time * 1000)).toLocaleString()}`)
        console.log(`ready - sell: ${sell} buy: ${buy}`);
        unsubscriber.next();
        unsubscriber.complete();
        candles.complete();

        if (sell && !buy) {
            console.log('selling!');
            wallet.sell();
        } else if (buy && !sell) {
            console.log('buying!');
            wallet.buy();
        } else {
            console.log('sell === buy')
        }

        // give the state writer time to finish up
        setTimeout(() => {
            process.exit();
        }, 1000)
    })
}

main();