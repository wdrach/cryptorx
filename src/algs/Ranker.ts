import { map, withLatestFrom } from 'rxjs/operators';
import { AlgorithmResult } from '../lib/streams/alg';
import { Candles } from '../lib/streams/candles';

export default function(candles: Candles):AlgorithmResult {
  const vol = candles.volume();
  const sma = vol.sma(30);
  const daySma = vol.sma(10);
  const vwmacd = candles.volumeWeightedMacd();

  const rank = sma.pipe(withLatestFrom(daySma, vwmacd), map(([smaVol, recentVol, macd]) => Math.abs(1/macd) * (smaVol / recentVol)));

  return {
    rank: rank,
  };
}