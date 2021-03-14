import { Observable, zip } from "rxjs";
import { map } from "rxjs/operators";
import { AlgorithmResult, Candles, Crossover } from "../lib/lib";

export function stoch(candles: Candles):AlgorithmResult {
  const UPPER = 80;
  const LOWER = 20;

  const stochK = candles.fstochSlow();
  const stochD = candles.fstochSlowD();

  // stoch is above upper
  const overbought = stochK.pipe(map((val) => val > UPPER));
  
  // stoch is below lower
  const oversold = stochK.pipe(map((val) => val < LOWER));

  // %K crosses over %D
  const bull = new Crossover(stochK, stochD);

  // %D crosses over %K
  const bear = new Crossover(stochD, stochK);

  // bull && oversold
  const buy = zip(bull, oversold).pipe(map(([b, o]) => b && o));

  // bear && overbought
  const sell = zip(bear, overbought).pipe(map(([b, o]) => b && o));

  // this is actually the opposite of what it's supposed to be
  return {
    buy: sell,
    sell: buy,
    state: {
      stochK,
      stochD,
      overbought,
      oversold,
      bull,
      bear
    }
  };
}