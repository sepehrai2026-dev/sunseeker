// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

contract ScanMintNFT is ERC721, Ownable {
    using Strings for uint256;

    uint256 private _nextTokenId;

    struct UPCData {
        string upc;
        uint16 maxMints;
        uint16 minted;
        string rarity;
    }

    struct MintParams {
        address to;
        string upc;
        string svg;
        string rarity;
        uint16 maxMints;
    }

    mapping(bytes32 => UPCData) public upcRegistry;
    mapping(uint256 => bytes32) public tokenUPC;
    mapping(uint256 => string) private _tokenSVGs;
    mapping(uint256 => uint16) public tokenEdition;

    event Minted(address indexed to, uint256 indexed tokenId, string upc, uint16 edition);

    constructor() ERC721("Barcade", "BRCDE") Ownable(msg.sender) {}

    function mint(MintParams calldata p) external onlyOwner returns (uint256) {
        bytes32 upcHash = keccak256(abi.encodePacked(p.upc));
        UPCData storage data = upcRegistry[upcHash];

        if (data.maxMints == 0) {
            data.upc = p.upc;
            data.maxMints = p.maxMints;
            data.rarity = p.rarity;
        }

        require(data.minted < data.maxMints, "Edition sold out");
        data.minted++;

        uint256 tokenId = _nextTokenId++;
        _safeMint(p.to, tokenId);

        tokenUPC[tokenId] = upcHash;
        _tokenSVGs[tokenId] = p.svg;
        tokenEdition[tokenId] = data.minted;

        emit Minted(p.to, tokenId, p.upc, data.minted);
        return tokenId;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        bytes32 upcHash = tokenUPC[tokenId];
        UPCData storage data = upcRegistry[upcHash];
        uint16 edition = tokenEdition[tokenId];

        return string(abi.encodePacked(
            "data:application/json;base64,",
            Base64.encode(bytes(_buildJSON(tokenId, data, edition)))
        ));
    }

    function _buildJSON(uint256 tokenId, UPCData storage data, uint16 edition) private view returns (string memory) {
        string memory svgB64 = Base64.encode(bytes(_tokenSVGs[tokenId]));

        return string(abi.encodePacked(
            '{"name":"Barcade #', tokenId.toString(),
            '","description":"Generative art from UPC ', data.upc,
            '. Edition ', uint256(edition).toString(), '/', uint256(data.maxMints).toString(),
            '.","image":"data:image/svg+xml;base64,', svgB64,
            '",', _buildAttributes(data, edition), '}'
        ));
    }

    function _buildAttributes(UPCData storage data, uint16 edition) private view returns (string memory) {
        return string(abi.encodePacked(
            '"attributes":[',
            '{"trait_type":"UPC","value":"', data.upc, '"},',
            '{"trait_type":"Rarity","value":"', data.rarity, '"},',
            '{"trait_type":"Edition","display_type":"number","value":', uint256(edition).toString(), '},',
            '{"trait_type":"Max Supply","display_type":"number","value":', uint256(data.maxMints).toString(), '}',
            ']'
        ));
    }

    function getUPCInfo(string calldata upc) external view returns (uint16 maxMints, uint16 minted, string memory rarity) {
        bytes32 upcHash = keccak256(abi.encodePacked(upc));
        UPCData storage data = upcRegistry[upcHash];
        return (data.maxMints, data.minted, data.rarity);
    }

    function getRemainingMints(string calldata upc) external view returns (uint16) {
        bytes32 upcHash = keccak256(abi.encodePacked(upc));
        UPCData storage data = upcRegistry[upcHash];
        if (data.maxMints == 0) return 0;
        return data.maxMints - data.minted;
    }
}
