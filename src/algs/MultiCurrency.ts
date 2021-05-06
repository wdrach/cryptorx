import { map, withLatestFrom } from 'rxjs/operators';
import { AlgorithmResult, CoinbaseProCandles, Crossover } from '../lib/lib';

export default function(candles: CoinbaseProCandles):AlgorithmResult {
    const vwma10 = candles.vwma(10*24);
    const vwma20 = candles.vwma(20*24);

    // golden cross
    const goldenCross = new Crossover(vwma10, vwma20);

    // death cross
    const deathCross = new Crossover(vwma20, vwma10);

    const vol = candles.volume();
    const sma = vol.sma(30*24);
    const daySma = vol.sma(24);
    const vwmacd = candles.volumeWeightedMacd();

    const rank = sma.pipe(withLatestFrom(daySma, vwmacd), map(([smaVol, recentVol, macd]) => (1/macd) * (recentVol / smaVol)));

    return {
        entry: goldenCross,
        exit: deathCross,
        rank: rank,
        state: {
            goldenCross,
            deathCross,
            vwma10,
            vwma20
        }
    };
}