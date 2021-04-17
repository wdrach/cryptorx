import { map } from 'rxjs/operators';
import { AlgorithmResult, Candles } from '../lib/lib';

export default function(candles: Candles):AlgorithmResult {
    const UPPER = 10000;
    const LOWER = -10000;

    const obv = candles.obv();

    // obv is above upper
    const bull = obv.pipe(map((val) => val > UPPER));
  
    // obv is below lower
    const bear = obv.pipe(map((val) => val < LOWER));

    return {
        sell: bear,
        buy: bull,
        state: {
            obv,
            bull,
            bear,
        }
    };
}