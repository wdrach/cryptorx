import { AlgorithmResult } from '../lib/streams/alg';
import { Candles } from '../lib/streams/candles';
import { Crossover } from '../lib/util/decisions';
import { condenseCandles } from '../lib/util/helpers';

export default function(candles: Candles):AlgorithmResult {
  const vwma5 = condenseCandles(candles).vwma(5);
  const vwma20 = condenseCandles(candles).vwma(20);

  // golden cross
  const goldenCross = new Crossover(vwma5, vwma20);

  // death cross
  const deathCross = new Crossover(vwma20, vwma5);

  return {
    entry: goldenCross,
    exit: deathCross,
    state: {
      goldenCross,
      deathCross,
      vwma20,
      vwma5
    }
  };
}