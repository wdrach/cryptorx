import { combineLatest, Subject } from "rxjs";
import { takeUntil } from "rxjs/operators";
import { stoch } from "../algs/Stoch";
import { CoinbaseProCandle, CoinbaseWallet } from "../lib/lib";

const wallet = new CoinbaseWallet();
wallet.init();

const candles = new CoinbaseProCandle('BTC-USD', 20, 86400);

const [buySignal, sellSignal] = stoch(candles);

const unsubscriber = new Subject<void>()

combineLatest([buySignal, sellSignal, candles.current]).pipe(takeUntil(unsubscriber)).subscribe(([sell, buy, ready]) => {
    // if we're not ready, we're still in pre-data, not live data
    if (!ready) return;

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

    process.exit();
})