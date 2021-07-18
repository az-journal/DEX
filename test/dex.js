const {expectRevert} = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const { assert } = require('chai');

//import ERC20 tokens & DEX contract
const Dai = artifacts.require('mocks/dai.sol');
const Bat = artifacts.require('mocks/bat.sol');
const Rep = artifacts.require('mocks/rep.sol');
const Zrx = artifacts.require('mocks/zrx.sol');
const Dex = artifacts.require('Dex.sol');

const SIDE = {
    BUY: 0,
    SELL: 1
};

contract ('Dex', (accounts)=>{
let dai, bat, rep, zrx, dex;
const [trader1, trader2] = [accounts[1],accounts[2]];
// get ticker for tokens with WEB3
const[DAI,BAT,REP,ZRX] = ['DAI','BAT','REP','ZRX'] //define ticker as byte32 in const var, after define an array with all the ticker in ascii
 .map(ticker => web3.utils.fromAscii(ticker));

beforeEach(async()=>{
   ([dai,bat,rep,zrx] =  await Promise.all([
        Dai.new(),
        Bat.new(),
        Rep.new(),
        Zrx.new()
    ]));
        dex = await Dex.new();
    await Promise.all([
        dex.addToken(DAI,dai.address),
        dex.addToken(BAT,bat.address),
        dex.addToken(REP,rep.address),
        dex.addToken(ZRX,zrx.address),
    ])

    const amount = web3.utils.toWei('1000');
    const seedTokenBalance = async(token, trader) =>{
        await token.faucet(trader,amount); //allocate tokens to an address
        await token.approve(               // trader approves the dex to transfer all his token, and allowa to deposit erc20 in contract later
            dex.address,
            amount,
            {from:trader}
        );
    };
    //loop through all the tokens and call SeedTokenBalance function
    await Promise.all(
        [dai,bat,rep,zrx].map(
            token => seedTokenBalance(token, trader1)
        )
    );
    await Promise.all(
        [dai,bat,rep,zrx].map(
            token => seedTokenBalance(token, trader2)
        )
    );
});

it ('should deposit tokens', async()=>{
  const amount = web3.utils.toWei('1000');//first define amount to deposit
  await dex.deposit(amount,DAI,{from:trader1}); 
  const balance = await dex.traderBalances(trader1,DAI); //get balance of the trader 
  assert(balance.toString() === amount); //assert that balance equal to initially deposited amount
});

it ('should NOT deposit token if token does not exist', async() => {
  await expectRevert(
    dex.deposit(
        web3.utils.toWei('100'),
        web3.utils.fromAscii('TOKEN-DOES-NOT-EXIST'),
        {from:trader1}
    ), 'this token does not exist'); 
});

it ('should withdraw tokens', async()=>{
    const amount = web3.utils.toWei('100');
    await dex.deposit(amount,DAI,{from:trader1}); 
    await dex.withdraw(amount,DAI,{from: trader1});

  const[balanceDex, balanceDai] = await Promise.all([
     dex.traderBalances(trader1,DAI),
     dai.balanceOf(trader1)]);
    assert(balanceDex.isZero());
    assert(balanceDai.toString()=== web3.utils.toWei('1000'));
});

it('should not withdraw token if token does not exist', async() =>{
    await expectRevert(
        dex.withdraw(
            web3.utils.toWei('100'),
            web3.utils.fromAscii('TOKEN-DOES-NOT-EXIST'),
            {from:trader1}
        ), 'this token does not exist'); 
});
it('should not withdraw tokens if balance is too low', async()=>{
    await dex.deposit(web3.utils.toWei('100'),DAI,{from:trader1}); 
    await expectRevert(
        dex.withdraw(
            web3.utils.toWei('1000'),
            DAI,
            {from:trader1}
        ), 'balance too low'); 
});

//Create Limit Order Tests

it('should create limit order', async() => {
    await dex.deposit( web3.utils.toWei('100'),DAI,{from: trader1}); 
    await dex.createLimitOrder(
      REP,
      web3.utils.toWei('10'),
      10,
      SIDE.BUY,
      {from: trader1});
 //inspect order book &make sure you find the order
 let buyOrders = await dex.getOrders(REP, SIDE.BUY);
 let sellOrders = await dex.getOrders(REP, SIDE.SELL);
 assert(buyOrders.length === 1);
 assert(buyOrders[0].trader === trader1);
 assert(buyOrders[0].ticker === web3.utils.padRight(REP, 64));
 assert(buyOrders[0].price === '10');
 assert(buyOrders[0].amount === web3.utils.toWei('10'));
 assert(sellOrders.length === 0);

 await dex.deposit( web3.utils.toWei('200'),DAI,{from: trader2}); 
 await dex.createLimitOrder(
   REP,
   web3.utils.toWei('10'),
   11,
   SIDE.BUY,
   {from: trader2});
  buyOrders = await dex.getOrders(REP, SIDE.BUY);
  sellOrders = await dex.getOrders(REP, SIDE.SELL);
 assert(buyOrders.length === 2);
 assert(buyOrders[0].trader === trader2);
 assert(buyOrders[1].trader === trader1);
 assert(sellOrders.length === 0);

 await dex.createLimitOrder(
    REP,
    web3.utils.toWei('10'),
    9,
    SIDE.BUY,
    {from: trader2});
   buyOrders = await dex.getOrders(REP, SIDE.BUY);
 sellOrders = await dex.getOrders(REP, SIDE.SELL);
 assert(buyOrders.length === 3);
 assert(buyOrders[0].trader === trader2);
 assert(buyOrders[1].trader === trader1);
 assert(buyOrders[2].trader === trader2);
 assert(sellOrders.length === 0);
});
it('should NOT create limit order if token does not exist', async()=>{
    await expectRevert(
        dex.createLimitOrder(
            web3.utils.fromAscii('TOKEN-DOE-NOT-EXIST'),
            web3.utils.toWei('1000'),
            10,
            SIDE.BUY,
            {from:trader1}
        ), 'this token does not exist' );
});
        it('should NOT create limit order if token is DAI', async()=>{
            await expectRevert(
                dex.createLimitOrder(
                    DAI,
                    web3.utils.toWei('1000'),
                    10,
                    SIDE.BUY,
                    {from:trader1}
                ), 'can not trade DAI'
            );
});
it('should not create limit order if token balance too low', async() =>{
    await dex.deposit (
        web3.utils.toWei('99'),
        REP,
        {from: trader1}
    );
    await expectRevert(
        dex.createLimitOrder(
            REP,
            web3.utils.toWei('1000'),
            10,
            SIDE.SELL,
            {from:trader1}
        ),'token balance too low'
    );
})
it('should not create limit order if DAI balance too low', async()=>{
    await dex.deposit (
        web3.utils.toWei('99'),
        DAI,
        {from: trader1}
    );
    await expectRevert(
        dex.createLimitOrder(
            REP,
            web3.utils.toWei('10'),
            10,
            SIDE.BUY,
            {from:trader1}
        ),'DAI balance too low'
    );
});

it('should create market order & match against existing limit order', async()=>{
    await dex.deposit (
        web3.utils.toWei('100'),
        DAI,
        {from: trader1}
    );
    await dex.createLimitOrder(
        REP,
        web3.utils.toWei('10'),
        10,
        SIDE.BUY,
        {from:trader1}
    )
    //send some rep from trader2 account
    await dex.deposit (
        web3.utils.toWei('100'),
        REP,
        {from: trader2}
    );
    await dex.createMarketOrder(
        REP,
        web3.utils.toWei('5'),
        SIDE.SELL,
        {from:trader2}
    );
    //check that market order macthed and balances are correct
    const balances = await Promise.all([
        dex.traderBalances(trader1,DAI),
        dex.traderBalances(trader1,REP),
        dex.traderBalances(trader2,DAI),
        dex.traderBalances(trader2,REP),
    ]);
    const orders = await dex.getOrders(REP, SIDE.BUY) 
    assert(orders[0].filled === web3.utils.toWei('5'));
    assert(balances[0].toString() === web3.utils.toWei('50'));
    assert(balances[1].toString() === web3.utils.toWei('5')); 
    assert(balances[2].toString() === web3.utils.toWei('50'));
    assert(balances[3].toString() === web3.utils.toWei('95'));
   
    });

    it('should NOT create market order if token does not exist', async()=>{
        await expectRevert(
            dex.createMarketOrder(
                web3.utils.fromAscii('TOKEN-DOE-NOT-EXIST'),
                web3.utils.toWei('1000'),
                SIDE.BUY,
                {from:trader1}
            ), 'this token does not exist' );
    });
    it('should NOT create market order if token is DAI', async()=>{
        await expectRevert(
            dex.createMarketOrder(
                DAI,
                web3.utils.toWei('1000'),
                SIDE.BUY,
                {from:trader1}
            ), 'can not trade DAI'
        );
});
it('should not create market order if token balance too low', async() =>{
    await dex.deposit (
        web3.utils.toWei('99'),
        REP,
        {from: trader1}
    );
    await expectRevert(
        dex.createMarketOrder(
            REP,
            web3.utils.toWei('100'),
            SIDE.SELL,
            {from:trader1}
        ),'token balance too low'
    );
})

it('should not create market order if DAI balance too low', async()=>{
    await dex.deposit (
        web3.utils.toWei('100'),
        REP,
        {from: trader1}
    );
    await dex.createLimitOrder(
        REP,
        web3.utils.toWei('100'),
        10,
        SIDE.SELL,
        {from: trader1}
    )
    await expectRevert(
        dex.createMarketOrder(
            REP,
            web3.utils.toWei('100'),
            SIDE.BUY,
            {from:trader2}
        ),'DAI balance too low'
    );
});


})