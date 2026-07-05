const { ethers } = require("ethers");

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const L1_RPC = "https://ethereum-rpc.publicnode.com";

const L1_STANDARD_BRIDGE = "0x3154Cf16ccdb4C6d922629664174b904d80F2C35";
const BRIDGE_ABI = [
  "function depositETH(uint32 _minGasLimit, bytes calldata _extraData) payable",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(L1_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("Wallet address:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("L1 balance:", ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    console.log("No ETH on L1. Aborting.");
    process.exit(1);
  }

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;
  const estimatedGas = 100000n;
  const gasCost = gasPrice * estimatedGas * 2n;

  const bridgeAmount = balance - gasCost;
  if (bridgeAmount <= 0n) {
    console.log("Not enough ETH to cover gas + bridge. Need more ETH.");
    process.exit(1);
  }

  console.log("Gas cost estimate:", ethers.formatEther(gasCost), "ETH");
  console.log("Bridging:", ethers.formatEther(bridgeAmount), "ETH to Base");

  const bridge = new ethers.Contract(L1_STANDARD_BRIDGE, BRIDGE_ABI, wallet);

  const tx = await bridge.depositETH(200000, "0x", {
    value: bridgeAmount,
    gasLimit: estimatedGas,
  });

  console.log("Bridge tx submitted:", tx.hash);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("Bridge tx confirmed in block", receipt.blockNumber);
  console.log(
    "\nETH will arrive on Base in ~1-15 minutes."
  );
  console.log(
    "Check: https://etherscan.io/tx/" + receipt.hash
  );
}

main().catch((err) => {
  console.error("Bridge error:", err.message || err);
  process.exit(1);
});
