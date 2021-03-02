import { Observable } from "rxjs";
import { CoinbaseProCandle, Crossover } from "../lib/lib";

export function goldenAndDeathCross(candles: CoinbaseProCandle):Observable<boolean>[] {
  const sma15 = candles.close().sma(15);
  const sma50 = candles.close().sma(50);

  // golden cross
  const goldenCross = new Crossover(sma15, sma50);

  // death cross
  const deathCross = new Crossover(sma50, sma15);

  return [goldenCross, deathCross];
}