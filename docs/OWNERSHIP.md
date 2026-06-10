# VinuSwap Ownership & Governance

This document describes the on-chain ownership model of the VinuSwap deployment:
the chain of privileged roles, exactly what each role can do, and the operational
procedures for responding to an incident. It exists because the audit
(`04-VinuSwap-Backend.md`, finding **H-1**) flagged that the admin model is
powerful and was previously undocumented.

The VinuSwap deployment uses **single-key custody** as its accepted governance
model. This is a deliberate decision: there is no on-chain multisig or timelock
in front of the owner roles. The mitigation is operational discipline plus the
documented emergency procedures below, not additional smart-contract machinery.

> This document does **not** describe where or how owner keys are stored. Key
> custody is intentionally out of scope here.

## Ownership chain

Privilege flows top-down from a single owner key through the Controller:

```
Owner key (EOA)
   │  owns
   ▼
Controller ──(owns via factory.setOwner)──► VinuSwapFactory ──► every pool
   │
   └── also owns: OverridableFeeManager ──► TieredDiscount (fee policy)
```

- The **Controller** is the hub. It owns the **VinuSwapFactory**, and the factory
  is the owner of every pool it deploys. Pool owner actions (`initialize`,
  `setFeeProtocol`, `collectProtocol`) are therefore exercised *through* the
  Controller.
- The **fee managers** (`OverridableFeeManager`, `TieredDiscount`) are separate
  `Ownable` contracts. Each pool holds an immutable pointer to its fee manager;
  production pools point at `OverridableFeeManager`, which delegates to a policy
  contract (`TieredDiscount` or `NoDiscount`).

### Mainnet addresses (VinuChain, chain ID 207)

| Role | Contract | Address |
|------|----------|---------|
| Pool/factory governance hub | Controller | `0x47fF80713b1d66DdA47237AB374F3080E2075528` |
| Pool deployer | VinuSwapFactory | `0xd74dEe1C78D5C58FbdDe619b707fcFbAE50c3EEe` |
| Fee-manager router | OverridableFeeManager | `0xA15770c5692646667c195446996e1fE9D210374c` |
| Discount policy | TieredDiscount | `0x58818859dD0179498c530f549270F40fEB48579E` |

Verify the live owner of each contract on-chain with `owner()` before trusting
any of the procedures below.

## What each owner can do

### Controller owner (the root authority)

- `createPool` / `initialize` — create and initialize pools (permissioned).
- `setDefaultFeeManager` / `setDefaultTickSpacing` — configure the parameters used
  by the permissionless `createStandardPool` path. Setting either to its zero
  value (zero address / tick spacing 0) **disables** standard pool creation for
  that factory/fee.
- `setFeeProtocol` — set the protocol-fee split (0-10% per token) on any pool.
- `collectProtocolFees` — pull accrued protocol fees into the Controller's
  pull-payment ledger (also callable by any configured payee account).
- `transferFactoryOwnership` — reassign the factory's owner. This can **detach the
  factory from the Controller entirely**; treat it as a high-consequence action.

The Controller's payee table (accounts and shares for protocol-fee splitting) is
fixed at construction and cannot be changed; rotating it requires deploying a new
Controller and migrating factory ownership.

### Fee-manager owners (live trading economics)

- `OverridableFeeManager.setDefaultFeeManager` — swap the global policy contract
  that every pool routes through.
- `OverridableFeeManager.setFeeManagerOverride` — override the policy for a single
  pool.
- `TieredDiscount.updateInfo` — set the discount-tier thresholds and discounts.

The pool enforces `actualFee <= fee` on every swap step (`'IFV'`), so a fee
manager can only ever **reduce** the fee, never raise it above the pool's
immutable fee. The two failure modes a hostile/buggy fee manager can cause are:
(1) a **reverting** `computeFee`, which halts swaps on affected pools (LP
`burn`/`collect` still work — funds are never locked); (2) a **100% discount**,
which zeroes LP fee revenue while trades continue.

## Owner powers summary (trust model)

A single owner key, if compromised or misused, can:

- Halt swaps on all pools by pointing the fee manager at a reverting contract.
- Zero out LP fee revenue by configuring 100% discounts.
- Brick pool owner functions by fat-fingering factory ownership to a dead address.

It **cannot** drain LP funds: `mint`/`burn`/`collect` do not consult the fee
manager, and swap settlement still enforces the canonical balance checks. The
governance risk is denial-of-service and fee-economics manipulation, not theft.

## Emergency procedures (incident runbook)

### Symptom: swaps are reverting (suspected fee-manager fault)

The fastest mitigation is to route pools to `NoDiscount`, which always returns the
unchanged fee and cannot revert.

1. Identify the affected pool(s). If global, treat all production pools as affected.
2. Point the global policy back to a known-good `NoDiscount` deployment:
   `OverridableFeeManager.setDefaultFeeManager(<NoDiscount address>)`.
3. Or, for a single pool, override just that pool:
   `OverridableFeeManager.setFeeManagerOverride(<pool>, <NoDiscount address>)`.
4. Confirm a test swap succeeds on an affected pool before standing down.

### Symptom: discounts misconfigured (e.g. unintended 100% tier)

1. Correct the tier table with `TieredDiscount.updateInfo(...)`, or
2. Temporarily route pools to `NoDiscount` (steps above) while a corrected
   `TieredDiscount` is prepared and deployed.

### Symptom: owner key suspected compromised

1. Immediately route all pools to `NoDiscount` to neutralize fee-policy abuse
   (steps above), if the key is still usable by the legitimate operator.
2. Plan an ownership migration: deploy fresh fee-manager/Controller contracts as
   needed and transfer ownership to a new key. Note that the live factory and
   pools cannot be upgraded; migration is via `transferFactoryOwnership` and
   redeployment of off-pool governance contracts.

### Rehearsal

Any ownership-transfer or fee-manager-swap procedure should be rehearsed on a
testnet deployment (`scripts/main_scripts/deploy_core.ts`) before being executed
against mainnet. The existing `requireOwner` checks in the configuration scripts
(`scripts/main_scripts/set_default_discount_fee_manager.ts`) should be relied on
to abort early if the signer is not the expected owner.

## Notes for future deployments

These are recommendations for the *next* contract generation; the live deployment
cannot be upgraded:

- Add events to `setDefaultFeeManager`, `setFeeManagerOverride`, and `updateInfo`
  so indexers and users can monitor fee-policy changes (audit L-4).
- Consider a two-step ownership transfer to remove the single-step `setOwner`
  foot-gun (audit H-1).
- Consider a cap below 100% on configurable discounts (audit M-1).
