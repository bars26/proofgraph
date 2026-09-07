/**
 * x402 payment layer for the ProofGraph score API on Arc.
 *
 * Arc isn't in any hosted x402 facilitator's network list, but `@x402/evm`'s
 * `ExactEvmScheme` is chain-agnostic (`eip155:*`). We run the facilitator
 * **in-process**: a viem wallet on Arc verifies the client's EIP-3009 signature and
 * settles it by submitting `transferWithAuthorization` on the Arc USDC contract.
 *
 * Server-only. The facilitator signer is a hot key — use a dedicated, low-value
 * wallet funded with a little Arc USDC (gas on Arc is USDC).
 */
import "server-only";
import { createWalletClient, http, publicActions, parseUnits, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { x402ResourceServer, type FacilitatorClient } from "@x402/core/server";
import { x402Facilitator } from "@x402/core/facilitator";
import { ExactEvmScheme as ExactEvmServer } from "@x402/evm/exact/server";
import { ExactEvmScheme as ExactEvmFacilitator } from "@x402/evm/exact/facilitator";
import { toFacilitatorEvmSigner } from "@x402/evm";

import { arcTestnet } from "./erc8004";

export const ARC_X402_NETWORK = `eip155:${arcTestnet.id}` as const; // "eip155:5042002"
/** Arc USDC, ERC-20 (6-decimal) view. Native gas is the same asset, 18-decimal view. */
export const ARC_USDC: Address = "0x3600000000000000000000000000000000000000";
export const ARC_USDC_DECIMALS = 6;
/**
 * EIP-712 domain of the Arc USDC contract, needed for the `exact` scheme's
 * `transferWithAuthorization` signature. Arc USDC is a Circle FiatTokenProxy;
 * `name() = "USDC"`, `version() = "2"` (verified on-chain — the recomputed
 * DOMAIN_SEPARATOR matches). x402 only knows these for its built-in asset table,
 * so we hand them over explicitly in the payment requirements' `extra`.
 */
export const ARC_USDC_EIP712 = { name: "USDC", version: "2" } as const;

/** Where paid-query USDC lands. Defaults to the facilitator address. */
export function payToAddress(): Address {
  const explicit = process.env.PROOFGRAPH_X402_PAY_TO;
  if (explicit) return explicit as Address;
  return facilitatorAccount().address;
}

let _facilitatorAccount: ReturnType<typeof privateKeyToAccount> | null = null;
function facilitatorAccount() {
  if (_facilitatorAccount) return _facilitatorAccount;
  const pk = process.env.X402_FACILITATOR_PRIVATE_KEY;
  if (!pk) {
    throw new Error(
      "X402_FACILITATOR_PRIVATE_KEY is not set — a dedicated Arc wallet (funded with a little USDC) that settles x402 payments",
    );
  }
  _facilitatorAccount = privateKeyToAccount(pk.startsWith("0x") ? (pk as `0x${string}`) : (`0x${pk}` as `0x${string}`));
  return _facilitatorAccount;
}

/** In-process facilitator: verifies EIP-3009 sigs and settles them on Arc. */
function buildLocalFacilitatorClient(): FacilitatorClient {
  const account = facilitatorAccount();
  const client = createWalletClient({ account, chain: arcTestnet, transport: http() }).extend(publicActions);
  const signer = toFacilitatorEvmSigner(
    Object.assign(client, { address: account.address }) as never,
    { confirmationTimeoutMs: 45_000 },
  );
  const facilitator = new x402Facilitator().register(ARC_X402_NETWORK, new ExactEvmFacilitator(signer));
  return {
    verify: (p, r) => facilitator.verify(p, r),
    settle: (p, r) => facilitator.settle(p, r),
    getSupported: async () => facilitator.getSupported() as never,
  };
}

let _resourceServer: x402ResourceServer | null = null;
export function getResourceServer(): x402ResourceServer {
  if (_resourceServer) return _resourceServer;
  const evmServer = new ExactEvmServer().registerMoneyParser(async (amount, network) => {
    if (network !== ARC_X402_NETWORK) return null;
    return {
      asset: ARC_USDC,
      amount: parseUnits(String(amount), ARC_USDC_DECIMALS).toString(),
      extra: { ...ARC_USDC_EIP712 },
    };
  });
  _resourceServer = new x402ResourceServer(buildLocalFacilitatorClient()).register(ARC_X402_NETWORK, evmServer);
  return _resourceServer;
}

/** Route config for `withX402`, keyed by the served path pattern. */
export function x402Route(pathPattern: string, priceUsd: string, description: string) {
  return {
    [pathPattern]: {
      accepts: {
        scheme: "exact" as const,
        network: ARC_X402_NETWORK,
        price: priceUsd, // e.g. "$0.01" — resolved to Arc USDC by the money parser
        payTo: payToAddress(),
        maxTimeoutSeconds: 120,
      },
      description,
    },
  };
}

/** How many free queries per client per day before x402 kicks in. */
export const FREE_QUERIES_PER_DAY = Number(process.env.PROOFGRAPH_X402_FREE_PER_DAY ?? "5");
