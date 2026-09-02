/**
 * Pre-deploy sanity check for V2. Read-only, no transactions.
 *   npx hardhat run scripts/preflight-v2.ts --network arcTestnet
 */
import { network } from "hardhat";
import { formatEther } from "viem";

const { viem } = await network.create({ network: "arcTestnet" });
const publicClient = await viem.getPublicClient();
const [wallet] = await viem.getWalletClients();

const [chainId, balance, block] = await Promise.all([
  publicClient.getChainId(),
  publicClient.getBalance({ address: wallet.account.address }),
  publicClient.getBlockNumber(),
]);

console.log("");
console.log("ProofGraph V2 — preflight");
console.log("-------------------------");
console.log("Deployer wallet :", wallet.account.address);
console.log("Expected        : 0x4f80b5c475fced34fc9a07ffccf39e1adc1406bf");
console.log("Match           :", wallet.account.address.toLowerCase() === "0x4f80b5c475fced34fc9a07ffccf39e1adc1406bf");
console.log("Chain ID        :", chainId, chainId === 5042002 ? "(ok)" : "(UNEXPECTED)");
console.log("Block number    :", block.toString());
console.log("Gas balance     :", formatEther(balance), "native units");
console.log("-------------------------");
console.log("");
