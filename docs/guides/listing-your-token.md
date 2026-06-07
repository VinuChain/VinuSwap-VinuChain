# Listing / Whitelisting Your Token

VinuSwap does not maintain its own token allow-list. Instead, the token metadata
shown in the app — symbols, names, decimals, and logos in the swap and liquidity
token pickers — is sourced from the community **VinuChain Lists** registry:

- Repository: [`github.com/VinuChain/vinuchain-lists`](https://github.com/VinuChain/vinuchain-lists)

The VinuSwap front-end enumerates the registry's `tokens/` directory at runtime via
the GitHub Contents API (`https://api.github.com/repos/VinuChain/vinuchain-lists/contents/tokens`)
and fetches each token's metadata/logo from the raw base
(`https://raw.githubusercontent.com/VinuChain/vinuchain-lists/main/tokens`), falling
back to a small built-in set if the fetch fails. Wallets and the VinuExplorer block
explorer consume the same registry. **To make your token appear with proper branding
across the VinuChain ecosystem — including VinuSwap — you list it in `vinuchain-lists`.**

> Listing a token in the registry is **metadata only**. It does not create a pool
> or affect trading. Anyone can already create a pool and trade any ERC-20 on
> VinuSwap (see [Pool Creation](../deployment/pool-creation.md)); listing simply
> makes the token render with a name, symbol, and logo instead of a raw address.

## Prerequisites

| Requirement | Detail |
|-------------|--------|
| Deployed ERC-20 | Your token must already be deployed on **VinuChain (chain ID 207)** |
| Checksummed address | The contract address in **EIP-55 checksummed** form (use the [EIP-55 converter](https://ethsum.netlify.app/) if needed) |
| Logo file | A square logo, **200×200px** recommended, PNG preferred (JPG/WebP allowed), ≤100KB recommended (500KB hard limit), filename `{address}.png` |
| Token facts | Exact `symbol` (uppercase, 1–20 chars), `name`, and `decimals` |

## Directory layout

Each token lives in its own directory named by its checksummed address, containing
the metadata JSON and the required logo:

```
tokens/
└── 0xYourChecksummedAddress/
    ├── 0xYourChecksummedAddress.json   # metadata (required)
    └── 0xYourChecksummedAddress.png    # logo (required)
```

## Metadata file

### Required fields

```json
{
  "symbol": "TOKEN",
  "name": "Token Name",
  "address": "0xYourChecksummedAddress",
  "decimals": 18
}
```

| Field | Rules |
|-------|-------|
| `symbol` | Uppercase letters/digits, 1–20 chars (`^[A-Z0-9]+$`) |
| `name` | 1–100 chars |
| `address` | EIP-55 checksummed, `0x` + 40 hex |
| `decimals` | Integer 0–77 (values above 18 trigger a warning) |

### Useful optional fields

```json
{
  "description": "Brief description of the token and its purpose (10-500 chars)",
  "project": "vinuswap",
  "logoURI": "https://.../logo.png",
  "website": "https://yourproject.org",
  "support": "hello@yourproject.org",
  "github": "https://github.com/your-org",
  "twitter": "https://twitter.com/your-handle",
  "telegram": "https://t.me/your-channel",
  "coingecko": "https://www.coingecko.com/en/coins/your-token",
  "coinmarketcap": "https://coinmarketcap.com/currencies/your-token/"
}
```

- Set `project` to a contract-project slug under `contracts/` only if your token
  belongs to that project (for example, a token issued by a registered protocol).
  Most standalone tokens omit `project`.
- A physical logo file in the token directory is required even if you also supply
  `logoURI`.

A real entry, for reference, is **Wrapped VC** (the ERC-20 form of VinuChain's
native token that VinuSwap routes through):

```json
{
  "symbol": "WVC",
  "name": "Wrapped VC",
  "address": "0xEd8c5530a0A086a12f57275728128a60DFf04230",
  "decimals": 18,
  "description": "Wrapped VC is the ERC-20 compatible version of VinuChain's native token, enabling seamless integration with smart contracts and DeFi protocols.",
  "website": "https://vinuchain.org"
}
```

## Submission process

You can submit either way; the registry runs automated schema and security
validation on both.

### Option 1 — GitHub issue (easiest)

1. Open a [new issue](https://github.com/VinuChain/vinuchain-lists/issues/new/choose).
2. Choose the **"Token Submission"** template.
3. Fill in the required fields and attach your logo.
4. Submit for automated validation and review.

### Option 2 — Pull request (advanced)

1. Fork [`vinuchain-lists`](https://github.com/VinuChain/vinuchain-lists) and clone your fork.
2. Install dependencies and create your token directory:
   ```bash
   npm install
   mkdir -p tokens/0xYourChecksummedAddress
   ```
3. Add `tokens/0xYourChecksummedAddress/0xYourChecksummedAddress.json` (metadata)
   and `tokens/0xYourChecksummedAddress/0xYourChecksummedAddress.png` (logo).
4. Validate locally before opening the PR:
   ```bash
   npm run validate     # schema + address checksum + logo checks
   npm test             # full validation + test suite
   ```
5. Open a pull request from your fork.

> **Address checksum matters.** Both the directory name and the `address` field
> must be EIP-55 checksummed, and they must match. A non-checksummed or mismatched
> address fails validation.

## After your token is merged

Once your PR is merged into `main`:

- The VinuSwap app picks up the new token on its next registry fetch — it appears
  in the swap and liquidity token pickers with your symbol, name, and logo.
- Wallets and VinuExplorer that read the registry display the same metadata.
- To make the token **tradable**, a pool must exist for it. See
  [Pool Creation](../deployment/pool-creation.md) and
  [Providing Liquidity](providing-liquidity.md).

## Listing a contract project (optional)

If you operate a protocol (not just a token), the registry also accepts contract
projects under `contracts/{project-slug}/` with an `info.json`, source files, and
ABIs — this is how VinuSwap's own contracts are published (see
`contracts/vinuswap/info.json` in the registry, which lists every VinuSwap
contract address). See the registry README's **Contract Project Submission**
section for the schema and process.
