import { network } from "hardhat";

const { viem } = await network.create({
  network: "arcTestnet",
});

const [wallet] = await viem.getWalletClients();
const publicClient = await viem.getPublicClient();

const balance = await publicClient.getBalance({
  address: wallet.account.address,
});

console.log("");
console.log("ProofGraph Arc deploy check");
console.log("---------------------------");
console.log("Deploy wallet:", wallet.account.address);
console.log("Chain ID:", await publicClient.getChainId());
console.log("Gas balance:", balance.toString());
console.log("---------------------------");
console.log("");
