import { stoch } from "../algs/Stoch";
import { CoinbaseProCandle, CoinbaseWallet } from "../lib/lib";

const wallet = new CoinbaseWallet();
wallet.init();

const candles = new CoinbaseProCandle('BTC-USD', 300, 86400);

const [buySignal, sellSignal] = stoch(candles);

wallet.transact(buySignal, sellSignal, candles.ready);