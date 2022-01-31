import { of } from 'rxjs';
import { withLatestFrom } from 'rxjs/operators';
import { PgSim } from '../sources/pg';
import { AlgorithmResult } from './alg';
import { Candles } from './candles';
import { Wallet } from './wallet';

export class Broker {
    _sim: PgSim;
    _alg: (candle: Candles) => AlgorithmResult;
    _wallet: Wallet;
    
    constructor(wallet: Wallet, sim: PgSim, alg: (candle: Candles) => AlgorithmResult) {
      this._sim = sim;
      this._alg = alg;
      this._wallet = wallet;
    }

    async init(): Promise<void> {
      const algResult = this._alg(this._sim);

      await new Promise<void>((res) => {
        // todo - deeper order types (stop/limit)
        this._sim.pipe(withLatestFrom(algResult.entry || of(false), algResult.exit || of(false))).subscribe({
          next: ([candle, entry, exit]) => {
            if (!this._wallet.startingPrice) this._wallet.startingPrice = candle.close;
            this._wallet.endingPrice = candle.close;

            if (entry && !this._wallet.coins) {
              this._wallet.marketBuy();
            } else if (exit && !this._wallet.dollars) {
              this._wallet.marketSell();
            }
          },
          complete: () => res(),
        });
      });
    }
}
