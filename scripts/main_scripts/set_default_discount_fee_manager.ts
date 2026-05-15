import { ethers } from "hardhat"

const DEFAULT_CONTROLLER_ADDRESS = "0x47fF80713b1d66DdA47237AB374F3080E2075528"
const DEFAULT_FACTORY_ADDRESS = "0xd74dEe1C78D5C58FbdDe619b707fcFbAE50c3EEe"
const DEFAULT_OVERRIDABLE_FEE_MANAGER_ADDRESS = "0xA15770c5692646667c195446996e1fE9D210374c"
const DEFAULT_TIERED_DISCOUNT_ADDRESS = "0x58818859dD0179498c530f549270F40fEB48579E"

function envAddress(name: string, fallback: string) {
    return ethers.utils.getAddress(process.env[name] || fallback)
}

function envFlag(name: string, fallback: boolean) {
    const value = process.env[name]
    if (value === undefined || value === "") {
        return fallback
    }

    return !["0", "false", "no", "off"].includes(value.toLowerCase())
}

async function requireOwner(contractLabel: string, contract: any, signerAddress: string) {
    const owner = ethers.utils.getAddress(await contract.owner())
    if (owner !== signerAddress) {
        throw new Error(`${contractLabel} owner is ${owner}, but signer is ${signerAddress}`)
    }
}

async function waitForTransaction(label: string, txPromise: Promise<any>) {
    const tx = await txPromise
    console.log(`${label} tx:`, tx.hash)
    await tx.wait()
    console.log(`${label} confirmed`)
}

async function main() {
    const controllerAddress = envAddress("VINUSWAP_CONTROLLER_ADDRESS", DEFAULT_CONTROLLER_ADDRESS)
    const factoryAddress = envAddress("VINUSWAP_FACTORY_ADDRESS", DEFAULT_FACTORY_ADDRESS)
    const overridableFeeManagerAddress = envAddress(
        "VINUSWAP_OVERRIDABLE_FEE_MANAGER_ADDRESS",
        DEFAULT_OVERRIDABLE_FEE_MANAGER_ADDRESS
    )
    const tieredDiscountAddress = envAddress("VINUSWAP_TIERED_DISCOUNT_ADDRESS", DEFAULT_TIERED_DISCOUNT_ADDRESS)
    const setControllerDefault = envFlag("VINUSWAP_SET_CONTROLLER_DEFAULT", true)

    const [signer] = await ethers.getSigners()
    if (!signer) {
        throw new Error("No signer configured. Add VINUSWAP_OWNER_PRIVATE_KEY to .env.")
    }

    const signerAddress = ethers.utils.getAddress(await signer.getAddress())
    console.log("Signer:", signerAddress)
    console.log("Controller:", controllerAddress)
    console.log("Factory:", factoryAddress)
    console.log("Overridable fee manager:", overridableFeeManagerAddress)
    console.log("Tiered discount:", tieredDiscountAddress)

    const controller = await ethers.getContractAt("Controller", controllerAddress, signer)
    const overridableFeeManager = await ethers.getContractAt(
        "OverridableFeeManager",
        overridableFeeManagerAddress,
        signer
    )
    const tieredDiscount = await ethers.getContractAt("TieredDiscount", tieredDiscountAddress, signer)

    await requireOwner("OverridableFeeManager", overridableFeeManager, signerAddress)
    if (setControllerDefault) {
        await requireOwner("Controller", controller, signerAddress)
    }

    const discountToken = await tieredDiscount.token()
    const firstThreshold = await tieredDiscount.thresholds(0)
    const firstDiscount = await tieredDiscount.discounts(0)
    await tieredDiscount.callStatic.computeFeeFor(2500, signerAddress)
    console.log("Discount token:", discountToken)
    console.log("First discount tier:", firstThreshold.toString(), firstDiscount.toString())

    const currentOverridableDefault = ethers.utils.getAddress(await overridableFeeManager.defaultFeeManager())
    console.log("Current Overridable default:", currentOverridableDefault)
    if (currentOverridableDefault !== tieredDiscountAddress) {
        await waitForTransaction(
            "Set Overridable default fee manager",
            overridableFeeManager.setDefaultFeeManager(tieredDiscountAddress)
        )
    } else {
        console.log("Overridable default already points at the tiered discount manager")
    }

    if (setControllerDefault) {
        const currentControllerDefault = ethers.utils.getAddress(await controller.defaultFeeManager(factoryAddress))
        console.log("Current Controller default for factory:", currentControllerDefault)
        if (currentControllerDefault !== overridableFeeManagerAddress) {
            await waitForTransaction(
                "Set Controller default fee manager",
                controller.setDefaultFeeManager(factoryAddress, overridableFeeManagerAddress)
            )
        } else {
            console.log("Controller default already points at the overridable fee manager")
        }
    }

    const finalOverridableDefault = await overridableFeeManager.defaultFeeManager()
    const finalControllerDefault = await controller.defaultFeeManager(factoryAddress)
    console.log("Final Overridable default:", finalOverridableDefault)
    console.log("Final Controller default for factory:", finalControllerDefault)
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
}).then(() => process.exit())
