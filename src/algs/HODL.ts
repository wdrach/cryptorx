import { of } from 'rxjs';
import { map } from 'rxjs/operators';
import { AlgorithmResult, Candles } from '../lib/lib';

export default function(candles: Candles):AlgorithmResult {
    return {
        entry: of(true),
        exit: of(false),
        state: {
        }
    };
}