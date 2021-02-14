# cryptorx
RxJS + Coinbase Pro/Kraken + Technical Analysis Operators

ohlc: Behavior Subject --> Current Price Object (ish)
  * don't just use the current price, fetch the last 1000 candles or so as well
  * open:  pluck('open') --> Open Price of Current Period
  * close: pluck('close')
  * high:  pluck('high')
  * low:   pluck('low')

ticker: Just the price (+ historical data)



delay(x): delayWhen(price.skip(x))

Use an empty subject in place of price, then take that subject and call subject.next(val) a bunch of times with a random time period to run a simulation
price = new Subject<Price>();

// do stuff

price.next(/* data from coinbase */)
...

// record results

Operate:
 - use open/close/high/low as a source
 - 

Decide:
 - use zip on the operators as long as they match up
 - use combineLatest on operators that don't match up
 - pipes to compare those things


Execute
 - map that takes in a truthy/falsy value (buy/sell)
 - "trade" that takes a "level of confidence"
   * x < -1 sell
   * -1 < x < 1 noop
   * x > 1 buy

