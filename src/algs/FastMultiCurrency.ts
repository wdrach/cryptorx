import { map, withLatestFrom } from 'rxjs/operators';
import { AlgorithmResult, Candles, Crossover } from '../lib/lib';

export default function(candles: Candles):AlgorithmResult {
    // current best - 10, 40 ~24%POR
    const vwma10 = candles.vwma(10);
    const vwma20 = candles.vwma(40);

    // golden cross
    const goldenCross = new Crossover(vwma10, vwma20);

    // death cross
    const deathCross = new Crossover(vwma20, vwma10);

    const vol = candles.volume();
    const sma = vol.sma(10*24);
    const daySma = vol.sma(24);
    const rsi = candles.rsi(3*24);

    const rank = sma.pipe(withLatestFrom(daySma, rsi), map(([smaVol, recentVol, rsi]) => {
        return (rsi - 50) * (recentVol / smaVol);
    }));

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