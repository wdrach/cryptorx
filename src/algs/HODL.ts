import { of } from 'rxjs';
import { map } from 'rxjs/operators';
import { AlgorithmResult } from '../lib/streams/alg';
import { Candles } from '../lib/streams/candles';

export default function(candles: Candles):AlgorithmResult {
    return {
        entry: of(true),
        exit: of(false),
        state: {
        }
    };
}