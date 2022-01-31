import { Subscription } from 'rxjs';
import { COINBASE_TRANSACTION_FEE } from '../constants';
import { PgSim } from '../sources/pg';

export interface Wallet {
  dollars: number;
  coins: number;
  transactions: number;
  fees: number;
  startingPrice: number;
  endingPrice: number;

  buy(price?: number): void
  sell(price?: number): void

  marketBuy(): void
  marketSell(): void

  limitBuy(price: number): void
  limitSell(price: number): void

  stopEntry(price: number): void
  stopLoss(price: number): void
}

export class SimulationWallet implements Wallet {
    dollars = 1000;
    transactionFee = COINBASE_TRANSACTION_FEE;
    startingDollars = 1000;
    coins = 0;
    sim!: PgSim;
    startingPrice = 0;
    endingPrice = 0;
    transactions = 0;
    fees = 0;

    marketSellSub?: Subscription;
    marketBuySub?: Subscription;

    buy(price: number): void {
      if (this.marketBuySub) {
        this.marketBuySub.unsubscribe();
        this.marketBuySub = undefined;
      }

      const fee = this.transactionFee * this.dollars;
      this.coins = (this.dollars - fee) / price;
      this.dollars = 0;

      this.fees += fee;
      this.transactions++;
    }

    sell(price: number): void {
      if (this.marketSellSub) {
        this.marketSellSub.unsubscribe();
        this.marketSellSub = undefined;
      }

      this.dollars = this.coins * price;
      const fee = this.transactionFee*price*this.coins;
      this.dollars = (this.coins * price) - fee;
      this.coins = 0;

      this.fees += fee;
      this.transactions++;
    }

    marketBuy(): void {
      if (this.marketBuySub) return;

      this.marketBuySub = this.sim.subscribe((result) => {
        this.buy(result.close || 0);
      });
    }

    marketSell(): void {
      // market sell already in progress
      if (this.marketSellSub) return;

      this.marketSellSub = this.sim.subscribe((result) => {
        this.sell(result.close || 0);
      });
    }

    limitBuy(price: number): void {
      console.log('LIMIT BUY NOT IMPLEMENTED', price);
    }

    limitSell(price: number): void {
      console.log('LIMIT SELL NOT IMPLEMENTED', price);
    }

    stopEntry(price: number): void {
      console.log('STOP ENTRY NOT IMPLEMENTED', price);
    }

    stopLoss(price: number): void {
      console.log('STOP LOSS NOT IMPLEMENTED', price);
    }

    get expected(): number {
      const entryFee = this.startingDollars * this.transactionFee;
      const entryCoin = (this.startingDollars - entryFee) / this.startingPrice;
      return (this.endingPrice * entryCoin) * (1 - this.transactionFee);
    }
    get netWorth(): number {
      return this.dollars || (this.endingPrice * this.coins * (1 - this.transactionFee));
    }

    get profit(): number {
      return 100 * (this.netWorth - this.startingDollars)/this.startingDollars;
    }

    get expectedProfit(): number {
      return 100 * (this.expected - this.startingDollars)/this.startingDollars;
    }

    get profitOverReplacement(): number {
      return this.profit - this.expectedProfit;
    }
}