# cryptorx

Hello, if you are reading this, that means you're one of the few, the proud, the people who I trust with this project.

First things first, this is a deeply personal project to me. It is provided without warranty. It is provided without promise. It is provided without support. I will happily take suggestions, but I will not guarantee anything. All of this is best-effort.

I can't guarantee that any of this _actually_ does what it says. This is a project for me, and since I'm not a big corporate fund with promises to stakeholders, I don't actually _have_ to have it perfect. Nothing works in crypto that works in traditional trades, so this is all one big shitshow anyway. See "fucked stoch" or "algs/Stoch.ts" for an example. Mistakes can breed profits if they test well.

As of now, all algorithms are "all-in" meaning they will trade with 100% of the funds available, and they will utilize every cent/coin in your Coinbase account. You can create Coinbase portfolios and manage the keys that way if you want to not go 100%.

## Quick start
Get a Raspberry Pi. Make sure you get a case, a power cord, an sd card, and an sd adapter. Make sure you can plug it into ethernet or this is going to be a lot harder. Put the case on it, install Ubuntu server, and plug it in. SSH into it, clone or download this repo into it. Run updates just to be safe. Run `crontab -e` and add this line:
```
05 0 * * * /usr/local/bin/npm run daily-cron --prefix /home/ubuntu/Git/cryptorx/ >> /home/ubuntu/log.txt
```

## The library
The library (`src/lib`) is all of the helpers that make up the algs and runners laid out in this library. It's all documented to the best of my ability. In summary, it goes:
 - Coinbase Candles collects historical and current data from Coinbase
 - The math on prices and candles get sent into the Decision class which outputs a stream of true/false values
 - A wallet is initialized with the Coinbase API keys
 - The transact helper takes in the buy/sell Decisions and makes transactions

## Running

### Coinbase keys
**note - Coinbase keys are not necessary to run in papertrade or backtesting mode, just live mode**

You can generate a key using [this guide.](https://help.coinbase.com/en/pro/other-topics/api/how-do-i-create-an-api-key-for-coinbase-pro)

Once that key is generated, create a `.env` file in the root of this repo with the following format:
```
COINBASE_API_KEY="<api key>"
COINBASE_SECRET="<secret provided BY Coinbase>"
COINBASE_PASSPHRASE="<passphrase provided TO Coinbase>"
```

You can now run the scripts in this repo in "live mode."

### Scratch pad
`npm start -- <option>` runs the scratch pad (`index.js`). This is a completely random thing that is used for backtesting and trying new things. It is not stable.

-l runs a live trade mode
  * You need to have either a .env set with environment variables for
    * COINBASE_API_KEY - your api key
    * COINBASE_SECRET - your api secret (provided to you by Coinbase when creating a key)
    * COINBASE_PASSPHRASE - your api passphrase (provided by you to Coinbase when creating a key)
-s runs a simulation
-p runs a papertrade (a simulation, but with current data instead of historical data)
-f + a filename with NO EXTENSION outputs debug csv files

### Best Algs
The best algs I've found for a given time period are noted in scripts.

#### 1 day
`npm run daily-cron` is meant to be run once a day. Coinbase "closes" their day at midnight UTC, so for best results run this script as a daily cronjob, scheduled for a few minutes (say, 5) after midnight UTC.