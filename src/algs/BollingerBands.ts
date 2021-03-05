import { Observable } from "rxjs";
import { CoinbaseProCandle, Crossover, NegativeCrossover } from "../lib/lib";

export function bollingerBands(candles: CoinbaseProCandle):Observable<boolean>[] {
  const typical = candles.typical();
  const upper = typical.bollingerBand();
  const lower = typical.bollingerBand(false);

  // price crosses upper, sell signal
  const priceOverUpper = new Crossover(typical, upper);

  // price dips below lower, buy signal
  const priceBelowLower = new NegativeCrossover(typical, lower);

  // this is actually the opposite of what they say to do, but it works better than the real suggestion
  return [priceOverUpper, priceBelowLower];
}