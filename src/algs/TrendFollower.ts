import { map } from 'rxjs/operators';
import { AlgorithmResult, Candles } from '../lib/lib';

export default function(candles: Candles):AlgorithmResult {
    const UPPER = 60;
    const LOWER = 40;

    const rsi = candles.rsi();

    const entry = rsi.pipe(map((val) => val > LOWER));
    const exit = rsi.pipe(map((val) => val < UPPER));

    return {
        exit,
        entry,
        state: {
            rsi,
        }
    };
}