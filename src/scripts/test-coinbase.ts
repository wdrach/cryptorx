import { CoinbaseWallet } from "../lib/lib";

const main = async () => {
    const wallet = new CoinbaseWallet();
    await wallet.init();

    wallet.sell();
}

main();