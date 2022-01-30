import { AlgorithmResult } from '../lib/streams/alg';
import { Candles } from '../lib/streams/candles';
import { Crossover } from '../lib/util/decisions';

export default function(candles: Candles):AlgorithmResult {
  const vwma20 = candles.vwma(50);
  const close = candles.close();

  // golden cross
  const goldenCross = new Crossover(close, vwma20);

  // death cross
  const deathCross = new Crossover(vwma20, close);

  return {
    entry: goldenCross,
    exit: deathCross,
    state: {
      goldenCross,
      deathCross,
      vwma20
    }
  };
}