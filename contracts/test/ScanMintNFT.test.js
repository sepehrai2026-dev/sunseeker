const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ScanMintNFT (Barcade) — strict 1-of-1 per UPC", function () {
  let nft, owner, alice, bob;
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><rect width="1000" height="1000" fill="#08080c"/></svg>';

  const params = (overrides = {}) => ({
    to: alice.address,
    upc: "049000042566",
    svg: SVG,
    rarity: "RARE",
    ...overrides,
  });

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    const F = await ethers.getContractFactory("ScanMintNFT");
    nft = await F.deploy();
  });

  it("has the right name and symbol", async () => {
    expect(await nft.name()).to.equal("Barcade");
    expect(await nft.symbol()).to.equal("BRCDE");
  });

  it("mints a UPC to the recipient exactly once", async () => {
    await nft.mint(params());
    expect(await nft.ownerOf(0)).to.equal(alice.address);
    expect(await nft.isClaimed("049000042566")).to.equal(true);

    const [claimed, tokenId, rarity] = await nft.getUPCInfo("049000042566");
    expect(claimed).to.equal(true);
    expect(tokenId).to.equal(0);
    expect(rarity).to.equal("RARE");
  });

  it("rejects a second mint of the same UPC — even to a different address with different params", async () => {
    await nft.mint(params());
    await expect(nft.mint(params({ to: bob.address, rarity: "LEGENDARY", svg: "<svg/>" })))
      .to.be.revertedWith("This barcode has already been minted");
  });

  it("different UPCs mint independently", async () => {
    await nft.mint(params({ upc: "111111111111" }));
    await nft.mint(params({ upc: "222222222222", to: bob.address }));
    expect(await nft.ownerOf(0)).to.equal(alice.address);
    expect(await nft.ownerOf(1)).to.equal(bob.address);
    expect(await nft.isClaimed("111111111111")).to.equal(true);
    expect(await nft.isClaimed("222222222222")).to.equal(true);
    expect(await nft.isClaimed("333333333333")).to.equal(false);
  });

  it("rejects mints from non-owners", async () => {
    await expect(nft.connect(alice).mint(params()))
      .to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
  });

  it("emits Minted with UPC and rarity", async () => {
    await expect(nft.mint(params()))
      .to.emit(nft, "Minted")
      .withArgs(alice.address, 0, "049000042566", "RARE");
  });

  it("reports unclaimed UPCs correctly", async () => {
    expect(await nft.isClaimed("999999999999")).to.equal(false);
    const [claimed, tokenId, rarity] = await nft.getUPCInfo("999999999999");
    expect(claimed).to.equal(false);
    expect(tokenId).to.equal(0);
    expect(rarity).to.equal("");
  });

  it("returns fully on-chain 1-of-1 tokenURI metadata", async () => {
    await nft.mint(params());
    const uri = await nft.tokenURI(0);
    expect(uri).to.match(/^data:application\/json;base64,/);
    const json = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
    expect(json.name).to.equal("Barcade #0");
    expect(json.description).to.contain("049000042566");
    expect(json.description).to.contain("1 of 1");
    expect(json.image).to.match(/^data:image\/svg\+xml;base64,/);
    expect(Buffer.from(json.image.split(",")[1], "base64").toString()).to.equal(SVG);
    const traits = Object.fromEntries(json.attributes.map(a => [a.trait_type, a.value]));
    expect(traits.UPC).to.equal("049000042566");
    expect(traits.Rarity).to.equal("RARE");
    expect(traits.Edition).to.equal("1 of 1");
  });

  it("reverts tokenURI for nonexistent tokens", async () => {
    await expect(nft.tokenURI(42)).to.be.revertedWithCustomError(nft, "ERC721NonexistentToken");
  });
});
