const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ScanMintNFT (Barcade)", function () {
  let nft, owner, alice, bob;
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><rect width="1000" height="1000" fill="#08080c"/></svg>';

  const params = (overrides = {}) => ({
    to: alice.address,
    upc: "049000042566",
    svg: SVG,
    rarity: "RARE",
    maxMints: 10,
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

  it("mints to the recipient and tracks editions per UPC", async () => {
    await nft.mint(params());
    await nft.mint(params({ to: bob.address }));

    expect(await nft.ownerOf(0)).to.equal(alice.address);
    expect(await nft.ownerOf(1)).to.equal(bob.address);
    expect(await nft.tokenEdition(0)).to.equal(1);
    expect(await nft.tokenEdition(1)).to.equal(2);

    const [maxMints, minted, rarity] = await nft.getUPCInfo("049000042566");
    expect(maxMints).to.equal(10);
    expect(minted).to.equal(2);
    expect(rarity).to.equal("RARE");
    expect(await nft.getRemainingMints("049000042566")).to.equal(8);
  });

  it("locks maxMints/rarity at first mint for a UPC", async () => {
    await nft.mint(params());
    // later mints can't change the registry entry
    await nft.mint(params({ maxMints: 9999, rarity: "LEGENDARY" }));
    const [maxMints, , rarity] = await nft.getUPCInfo("049000042566");
    expect(maxMints).to.equal(10);
    expect(rarity).to.equal("RARE");
  });

  it("enforces the edition cap", async () => {
    await nft.mint(params({ maxMints: 1, upc: "111111111111", rarity: "LEGENDARY" }));
    await expect(
      nft.mint(params({ maxMints: 1, upc: "111111111111", rarity: "LEGENDARY" }))
    ).to.be.revertedWith("Edition sold out");
  });

  it("rejects mints from non-owners", async () => {
    await expect(nft.connect(alice).mint(params()))
      .to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
  });

  it("emits Minted with the UPC and edition", async () => {
    await expect(nft.mint(params()))
      .to.emit(nft, "Minted")
      .withArgs(alice.address, 0, "049000042566", 1);
  });

  it("returns fully on-chain base64 tokenURI with correct metadata", async () => {
    await nft.mint(params());
    const uri = await nft.tokenURI(0);
    expect(uri).to.match(/^data:application\/json;base64,/);
    const json = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
    expect(json.name).to.equal("Barcade #0");
    expect(json.description).to.contain("049000042566");
    expect(json.description).to.contain("Edition 1/10");
    expect(json.image).to.match(/^data:image\/svg\+xml;base64,/);
    const svg = Buffer.from(json.image.split(",")[1], "base64").toString();
    expect(svg).to.equal(SVG);
    const traits = Object.fromEntries(json.attributes.map(a => [a.trait_type, a.value]));
    expect(traits.UPC).to.equal("049000042566");
    expect(traits.Rarity).to.equal("RARE");
    expect(traits.Edition).to.equal(1);
    expect(traits["Max Supply"]).to.equal(10);
  });

  it("reverts tokenURI for nonexistent tokens", async () => {
    await expect(nft.tokenURI(42)).to.be.revertedWithCustomError(nft, "ERC721NonexistentToken");
  });

  it("returns 0 remaining for unknown UPCs", async () => {
    expect(await nft.getRemainingMints("999999999999")).to.equal(0);
  });
});
