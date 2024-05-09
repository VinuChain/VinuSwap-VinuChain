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

    public async deposit(nftId: BigNumberish) : Promise<ethers.ContractTransaction> {
        const tx = await this.vinuEarnContract.deposit(nftId)
        return tx;
    }

    public async withdraw(nftId: BigNumberish) : Promise<ethers.ContractTransaction> {
        const tx = await this.vinuEarnContract.withdraw(nftId)
        return tx;
    }

    public async collectReward() : Promise<ethers.ContractTransaction> {
        const tx = await this.vinuEarnContract.collectReward()
        return tx;
    }

    public async collectRevenue(nftId: BigNumberish, amount0Max: BigNumberish, amount1Max: BigNumberish) {
        const tx = await this.vinuEarnContract.collectRevenue(nftId, amount0Max, amount1Max);
        return tx;
    }
}

export default VinuEarn;