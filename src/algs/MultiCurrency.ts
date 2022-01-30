import { AlgorithmResult } from '../lib/streams/alg';
import { Candles } from '../lib/streams/candles';
import { Crossover } from '../lib/util/decisions';
import { Distance } from '../lib/util/math';

export default function(candles: Candles):AlgorithmResult {
  const supermacd = candles.volumeWeightedMacdOf(20, 40).takeStoch();
  const IDEAL_SUPER_MACD = .37;

  const macdDistance = new Distance(supermacd, IDEAL_SUPER_MACD);

  const vwma10 = candles.vwma(20);
  const vwma20 = candles.vwma(50);

  const goldenCross = new Crossover(vwma10, vwma20);
  const deathCross = new Crossover(vwma20, vwma10);

  return {
    entry: goldenCross,
    exit: deathCross,
    rank: supermacd,
    state: {
    }
  };
}