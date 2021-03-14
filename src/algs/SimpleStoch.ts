import { map } from "rxjs/operators";
import { AlgorithmResult, Candles, Crossover } from "../lib/lib";

export function stoch(candles: Candles):AlgorithmResult {
  const UPPER = 80;
  const LOWER = 20;

  const stochK = candles.stochSlow();

  // stoch is above upper
  const overbought = stochK.pipe(map((val) => val > UPPER));
  
  // stoch is below lower
  const oversold = stochK.pipe(map((val) => val < LOWER));

  return {
    sell: oversold,
    buy: overbought,
    state: {
      stochK,
      overbought,
      oversold,
    }
  };
}