pragma solidity 0.8.6;
import '../../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract Rep is ERC20{
    constructor() ERC20('REP', 'Augur token'){}
    function faucet(address to, uint amount) external{
        _mint(to,amount);
    }
    
}