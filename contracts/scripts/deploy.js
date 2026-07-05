const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying ScanMintNFT with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  const ScanMintNFT = await hre.ethers.getContractFactory("ScanMintNFT");
  const nft = await ScanMintNFT.deploy();
  await nft.waitForDeployment();

  const address = await nft.getAddress();
  console.log("ScanMintNFT deployed to:", address);
  console.log("\nAdd this to your app.js CONTRACT_ADDRESS:");
  console.log(address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
