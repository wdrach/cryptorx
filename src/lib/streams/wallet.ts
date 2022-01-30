import { Subscription } from 'rxjs';
import { CoinbaseProduct, COINBASE_TRANSACTION_FEE } from '../constants';
import { PgSimulation } from '../sources/pg';

export interface Wallet {
  dollars: number;
  coins: Record<string, number>;
  currentCoin: string;
  transactions: number;
  fees: number;
  startingPrice: number;
  endingPrice: number;

  buy(product: CoinbaseProduct, price?: number): void
  sell(price?: number): void

  marketBuy(product: CoinbaseProduct): void
  marketSell(): void

  limitBuy(product: CoinbaseProduct, price: number): void
  limitSell(price: number): void

  stopEntry(product: CoinbaseProduct, price: number): void
  stopLoss(price: number): void
}

export class SimulationWallet implements Wallet {
    dollars = 1000;
    transactionFee = COINBASE_TRANSACTION_FEE;
    startingDollars = 1000;
    coins: Record<string, number> = {};
    currentCoin = '';
    sim!: PgSimulation;
    startingPrice = 0;
    endingPrice = 0;
    transactions = 0;
    fees = 0;

    marketSellSub?: Subscription;
    marketBuySub?: Subscription;

    buy(product: CoinbaseProduct, price: number): void {
      if (this.marketBuySub) {
        this.marketBuySub.unsubscribe();
        this.marketBuySub = undefined;
      }

      this.currentCoin = product;

      const fee = this.transactionFee * this.dollars;
      this.coins[product] = (this.dollars - fee) / price;
      this.dollars = 0;

      this.fees += fee;
      this.transactions++;
    }

    sell(price: number): void {
      if (this.marketSellSub) {
        this.marketSellSub.unsubscribe();
        this.marketSellSub = undefined;
      }

      this.dollars = this.coins[this.currentCoin] * price;
      const fee = this.transactionFee*price*this.coins[this.currentCoin];
      this.dollars = (this.coins[this.currentCoin] * price) - fee;
      this.coins[this.currentCoin] = 0;

      this.currentCoin = '';

      this.fees += fee;
      this.transactions++;
    }

    marketBuy(product: CoinbaseProduct): void {
      if (this.marketBuySub) return;

      this.marketBuySub = this.sim.subscribe((result) => {
        this.buy(product, result[product].close || 0);
      });
    }

    marketSell(): void {
      // market sell already in progress
      if (this.marketSellSub) return;

      this.marketSellSub = this.sim.subscribe((result) => {
        if (this.currentCoin) {
          this.sell(result[this.currentCoin].close || 0);
        }
      });
    }

    limitBuy(product: CoinbaseProduct, price: number): void {
      console.log('LIMIT BUY NOT IMPLEMENTED', product, price);
    }

    limitSell(price: number): void {
      console.log('LIMIT SELL NOT IMPLEMENTED', price);
    }

    stopEntry(product: CoinbaseProduct, price: number): void {
      console.log('STOP ENTRY NOT IMPLEMENTED', product, price);
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
      return this.dollars || (this.endingPrice * this.coins['ETH-USD'] * (1 - this.transactionFee));
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