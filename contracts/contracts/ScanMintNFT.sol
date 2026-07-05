// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

/// @title Barcade — every UPC barcode is a strict 1-of-1.
/// @notice One mint per UPC, forever. First to claim a barcode owns it.
contract ScanMintNFT is ERC721, Ownable {
    using Strings for uint256;

    uint256 private _nextTokenId;

    struct UPCData {
        string upc;
        string rarity;
        uint256 tokenIdPlusOne; // 0 = unclaimed; tokenId + 1 once minted
    }

    struct MintParams {
        address to;
        string upc;
        string svg;
        string rarity;
    }

    mapping(bytes32 => UPCData) public upcRegistry;
    mapping(uint256 => bytes32) public tokenUPC;
    mapping(uint256 => string) private _tokenSVGs;

    event Minted(address indexed to, uint256 indexed tokenId, string upc, string rarity);

    constructor() ERC721("Barcade", "BRCDE") Ownable(msg.sender) {}

    function mint(MintParams calldata p) external onlyOwner returns (uint256) {
        bytes32 upcHash = keccak256(abi.encodePacked(p.upc));
        UPCData storage data = upcRegistry[upcHash];
        require(data.tokenIdPlusOne == 0, "This barcode has already been minted");

        uint256 tokenId = _nextTokenId++;
        data.upc = p.upc;
        data.rarity = p.rarity;
        data.tokenIdPlusOne = tokenId + 1;

        _safeMint(p.to, tokenId);
        tokenUPC[tokenId] = upcHash;
        _tokenSVGs[tokenId] = p.svg;

        emit Minted(p.to, tokenId, p.upc, p.rarity);
        return tokenId;
    }

    function isClaimed(string calldata upc) external view returns (bool) {
        return upcRegistry[keccak256(abi.encodePacked(upc))].tokenIdPlusOne != 0;
    }

    /// @return claimed whether the UPC has been minted
    /// @return tokenId the token for this UPC (0 if unclaimed — check `claimed`)
    /// @return rarity the rarity trait recorded at mint
    function getUPCInfo(string calldata upc)
        external
        view
        returns (bool claimed, uint256 tokenId, string memory rarity)
    {
        UPCData storage data = upcRegistry[keccak256(abi.encodePacked(upc))];
        if (data.tokenIdPlusOne == 0) return (false, 0, "");
        return (true, data.tokenIdPlusOne - 1, data.rarity);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        UPCData storage data = upcRegistry[tokenUPC[tokenId]];
        return string(abi.encodePacked(
            "data:application/json;base64,",
            Base64.encode(bytes(_buildJSON(tokenId, data)))
        ));
    }

    function _buildJSON(uint256 tokenId, UPCData storage data) private view returns (string memory) {
        string memory svgB64 = Base64.encode(bytes(_tokenSVGs[tokenId]));
        return string(abi.encodePacked(
            '{"name":"Barcade #', tokenId.toString(),
            '","description":"Generative art from UPC ', data.upc,
            '. A strict 1 of 1 - one mint per barcode, forever.',
            '","image":"data:image/svg+xml;base64,', svgB64,
            '",', _buildAttributes(data), '}'
        ));
    }

    function _buildAttributes(UPCData storage data) private view returns (string memory) {
        return string(abi.encodePacked(
            '"attributes":[',
            '{"trait_type":"UPC","value":"', data.upc, '"},',
            '{"trait_type":"Rarity","value":"', data.rarity, '"},',
            '{"trait_type":"Edition","value":"1 of 1"}',
            ']'
        ));
    }
}
