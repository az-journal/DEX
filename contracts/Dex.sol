pragma solidity 0.8.6;
pragma experimental ABIEncoderV2;
import '../node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '../node_modules/@openzeppelin/contracts/utils/math/SafeMath.sol';


contract Dex {
    
    using SafeMath for uint;
    
    //define struct to represent a token 
    struct Token{
        bytes32 ticker;
        address tokenAddress;
    }
    
    //create enum for limit orders and struct to represent each limit order
    enum Side{
        BUY,
        SELL
    }
    
    struct Order{
        uint id;
        address trader;
        Side side;
        bytes32 ticker;
        uint amount;
        uint filled; 
        uint price;
        uint date;
    }
  
    
    mapping(bytes32=>Token) public tokens;  //represent collection of the token by mapping
    bytes32[]public tokenList;              //have a list of all the tickers to be able to iterate through
    
    mapping(address =>mapping(bytes32=>uint)) public traderBalances;
    mapping(bytes32=> mapping(uint =>Order[])) public orderBook; //mapping for the orderbook uint = enum
   
    bytes32 constant DAI = bytes32('DAI');
    address public admin;                  //have address that have some administrative rights
    uint public nextOrderId; // keep track of current order Id
    uint public nextTradeId;
   
   event NewTrade(
       uint tradeId, 
       uint orderId, 
       bytes32 indexed ticker, 
       address indexed trader1, 
       address indexed trader2,
       uint amount,
       uint price,
       uint date);
   
    constructor() {                 //define admin
        admin = msg.sender;
    }
    
    modifier onlyAdmin(){
        require(msg.sender==admin, 'only Admin');
        _;
    }
    
    modifier tokenExist(bytes32 ticker){
        require(tokens[ticker].tokenAddress != address(0), 'this token does not exist');
        _;
        }
    modifier tokenIsNotDai(bytes32 ticker){
        require(ticker != DAI, 'can not trade DAI');
        _;
    }
    
      //to get list of orders of the orderbook for frontend 
    function getOrders(bytes32 ticker, Side side) external view returns(Order[] memory){
        return orderBook[ticker][uint(side)];
    }
    
    //To get the list of tokens that can be traded for front End 
    function getTokens() external view returns(Token[]memory){
        Token[]memory _tokens = new Token[](tokenList.length);
        for (uint i = 0; i<tokenList.length; i++){
            _tokens[i] = Token(
                tokens[tokenList[i]].ticker,
                tokens[tokenList[i]].tokenAddress
                );}
                return _tokens;
    }
  
    
    function addToken(bytes32 ticker, address tokenAddress) external onlyAdmin {
        tokens[ticker] = Token(ticker, tokenAddress);
        tokenList.push(ticker);
    }
         
        
        function deposit(uint amount, bytes32 ticker) external tokenExist(ticker){
            //.transferFrom(delegated transfer): before the trader calls deposit fnc, he calls the approve fnc with address of this sc & amount
            IERC20(tokens[ticker].tokenAddress).transferFrom(msg.sender,address(this),amount);
            traderBalances[msg.sender][ticker] = traderBalances[msg.sender][ticker].add(amount); //increment the balance of the trader with Safemath
            }
            
        function withdraw(uint amount, bytes32 ticker) external tokenExist(ticker){
            require(traderBalances[msg.sender][ticker] >= amount, 'balance too low');
            traderBalances[msg.sender][ticker] =traderBalances[msg.sender][ticker].sub(amount);
            IERC20(tokens[ticker].tokenAddress).transfer(msg.sender,amount);
        }
    
    
    
    function createLimitOrder(bytes32 ticker, uint amount, uint price, Side side) external tokenExist(ticker) tokenIsNotDai(ticker){
        
        if (side ==Side.SELL){ //for sell orders make sure trader has enough tokens in the balance
            require (traderBalances[msg.sender][ticker] >= amount, 'token amount too low');
        } else {require(
            traderBalances[msg.sender][DAI]>= amount.mul(price), 'DAI balance too low');
        }
        Order[] storage orders = orderBook[ticker][uint(side)];
        orders.push(Order( 
         nextOrderId,
         msg.sender,
         side,
         ticker,
         amount,
         0,
         price,
         block.timestamp
            ));
            uint i = orders.length>0 ? orders.length -1 : 0;
            while(i>0){ //buy order high price beginning of the array , for sell the other way round
                if(side ==Side.BUY && orders[i-1].price > orders[i].price){
                    break;
                }
                if (side ==Side.SELL && orders[i-1].price < orders[i].price){
                    break;
                }
                //save copy of previous element in memory
                Order memory order = orders[i-1];
                orders[i-1]=orders[i];
                orders[i] = order;
                i = i.sub(1);
            }
            nextOrderId = nextOrderId.add(1);
    }
    
    function createMarketOrder(bytes32 ticker, uint amount, Side side) external tokenExist(ticker) tokenIsNotDai(ticker){
       if (side ==Side.SELL){ //for sell orders make sure trader has enough tokens in the balance
            require (traderBalances[msg.sender][ticker]>= amount, 'token amount too low');
        }
        Order[]storage orders= orderBook[ticker][uint(side ==Side.BUY ? Side.SELL : Side.BUY)];
       
        uint i;
        uint remaining = amount;
        
        while(i<orders.length && remaining >0){
            uint available = orders[i].amount.sub(orders[i].filled); //check what is available liquidity
            uint matched = (remaining > available)? available : remaining;
            remaining =remaining.sub(matched);
            orders[i].filled = orders[i].filled.add(matched);
            emit NewTrade ( nextTradeId, 
                             orders[i].id, 
                             ticker, 
                             orders[i].trader, // trader that created order in orderbook
                             msg.sender, // trader that created market order
                             matched,
                             orders[i].price,
                            block.timestamp);
                            //next update the token balance for 2 traders that were involved in the trade, depending on a Side
                            if (side == Side.SELL){
                                traderBalances[msg.sender][ticker] = traderBalances[msg.sender][ticker].sub(matched);
                                traderBalances[msg.sender][DAI] = traderBalances[msg.sender][DAI].add(matched.mul(orders[i].price));
                                traderBalances[orders[i].trader][ticker] = traderBalances[orders[i].trader][ticker].add(matched);
                                traderBalances[orders[i].trader][DAI] =traderBalances[orders[i].trader][DAI].sub(matched.mul(orders[i].price));
                            }
                             if (side == Side.BUY){
                                 require(traderBalances[msg.sender][DAI]>=matched.mul(orders[i].price), 'DAI balance too low');
                                traderBalances[msg.sender][ticker] = traderBalances[msg.sender][ticker].add(matched);
                                traderBalances[msg.sender][DAI] =traderBalances[msg.sender][DAI].sub(matched.mul(orders[i].price));
                                traderBalances[orders[i].trader][ticker] =traderBalances[orders[i].trader][ticker].sub(matched);
                                traderBalances[orders[i].trader][DAI] =traderBalances[orders[i].trader][DAI].add(matched.mul(orders[i].price));
                            }
                            nextTradeId = nextTradeId.add(1);
                            i= i.add(1);
                            
        }
    }
   
    
    }