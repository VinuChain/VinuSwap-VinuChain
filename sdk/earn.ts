import { BigNumberish } from "ethers";
import VinuEarnLPInitializableInfo from "./abi/vinu-earn/VinuEarnLPInitializable.json"
import { VinuEarnLPInitializable } from "./types/contracts/VinuEarnLPInitializable";
import { ethers } from "ethers";

class VinuEarn {
    public vinuEarnContract: VinuEarnLPInitializable;
    public signerOrProvider: ethers.Signer | ethers.providers.Provider;

    public constructor(vinuEarnAddress: string, signerOrProvider: ethers.Signer | ethers.providers.Provider) {
        // @ts-ignore
        this.vinuEarnContract = new ethers.Contract(vinuEarnAddress, VinuEarnLPInitializableInfo.abi, signerOrProvider) as VinuEarnLPInitializable;
        this.signerOrProvider = signerOrProvider;
    }

    public connect(signerOrProvider: ethers.Signer | ethers.providers.Provider) {
        return new VinuEarn(this.vinuEarnContract.address, signerOrProvider);
    }

    public async deposit(nftId: BigNumberish) {
        const tx = await this.vinuEarnContract.deposit(nftId)
        return tx;
    }

    public async withdraw(nftId: BigNumberish) {

    }

    public async collectReward(userAddress: string) {
    }

    public async collectRevenue(nftId: BigNumberish, amount0Max: BigNumberish, amount1Max: BigNumberish) {
    }
}

export default VinuEarn;