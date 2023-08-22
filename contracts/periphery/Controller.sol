// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@uniswap/v3-core/contracts/interfaces/pool/IUniswapV3PoolImmutables.sol';
import '@uniswap/v3-core/contracts/interfaces/pool/IUniswapV3PoolOwnerActions.sol';
import '../core/interfaces/IVinuSwapExtraPoolOwnerActions.sol';
import '../core/interfaces/IVinuSwapFactory.sol';

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';

contract Controller is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    event CollectedFees(
        address indexed pool,
        address indexed token0,
        address indexed token1,
        uint256 amount0,
        uint256 amount1
    );

    event Withdrawal(
        address indexed account,
        address indexed token,
        uint256 amount
    );

    /// @notice Emitted when a pool is created
    /// @param token0 The first token of the pool by address sort order
    /// @param token1 The second token of the pool by address sort order
    /// @param fee The fee collected upon every swap in the pool, denominated in hundredths of a bip
    /// @param factory The factory used to deploy the pool
    /// @param tickSpacing The minimum number of ticks between initialized ticks
    /// @param feeManager The address of the fee manager
    /// @param pool The address of the created pool
    event PoolCreated(
        address indexed token0,
        address indexed token1,
        uint24 indexed fee,
        address factory,
        int24 tickSpacing,
        address feeManager,
        address pool
    );

    /// @notice Emitted when the protocol fee is changed by the pool
    /// @param pool The pool for which the protocol fee is being updated
    /// @param feeProtocol0 The updated value of the token0 protocol fee
    /// @param feeProtocol1 The updated value of the token1 protocol fee
    event SetFeeProtocol(address indexed pool, uint8 feeProtocol0, uint8 feeProtocol1);

    event Initialize(address indexed pool, uint160 sqrtPriceX96);

    mapping(address => mapping(address => uint256)) internal _balances;

    uint256 public totalShares;

    mapping(address => uint256) public shares;
    address[] public accounts;

    /**
     * @dev Constructor
     */
    constructor(address[] memory _accounts, uint256[] memory _shares) {
        require(_accounts.length > 0, 'At least one account is required');
        require(_accounts.length == _shares.length, 'Accounts and shares must have the same length');

        for (uint256 i = 0; i < _accounts.length; i++) {
            _addAccount(_accounts[i], _shares[i]);
        }
    }

    /**
     * @dev Add a new account to the contract
     * @param account The address of the account to add
     * @param accountShares The number of shares owned by the account
     */
    function _addAccount(address account, uint256 accountShares) private {
        require(account != address(0), 'Account must not be the zero address');
        require(accountShares > 0, 'Shares must be greater than zero');
        require(shares[account] == 0, 'Account already has shares');

        accounts.push(account);
        shares[account] = accountShares;
        totalShares = totalShares.add(accountShares);
    }

    function createPool(
        address factory,
        address tokenA,
        address tokenB,
        uint24 fee,
        int24 tickSpacing,
        address feeManager
    ) external onlyOwner nonReentrant returns (address pool) {
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        pool = IVinuSwapFactory(factory).createPool(token0, token1, fee, tickSpacing, feeManager);

        emit PoolCreated(token0, token1, fee, factory, tickSpacing, feeManager, pool);
    }

    function collectProtocolFees(address pool, uint128 amount0Requested, uint128 amount1Requested) external nonReentrant {
        bool isAccount = false;

        for (uint256 i = 0; i < accounts.length; i++) {
            if (accounts[i] == msg.sender) {
                isAccount = true;
                break;
            }
        }

        require(isAccount || msg.sender == owner(), 'Not an account or owner');

        address token0 = IUniswapV3PoolImmutables(pool).token0();
        address token1 = IUniswapV3PoolImmutables(pool).token1();

        // We don't trust the pool to correctly return the amounts, so we check ourselves
        uint256 initialToken0Balance = IERC20(token0).balanceOf(address(this));
        uint256 initialToken1Balance = IERC20(token1).balanceOf(address(this));

        IUniswapV3PoolOwnerActions(pool).collectProtocol(
            address(this),
            amount0Requested,
            amount1Requested
        );

        uint256 amount0Collected = IERC20(token0).balanceOf(address(this)).sub(initialToken0Balance);
        uint256 amount1Collected = IERC20(token1).balanceOf(address(this)).sub(initialToken1Balance);

        uint256 totalDistributed0 = 0;
        uint256 totalDistributed1 = 0;

        for (uint256 i = 0; i < accounts.length; i++) {
            address account = accounts[i];
            uint256 amount0 = amount0Collected.mul(shares[account]).div(totalShares);
            uint256 amount1 = amount1Collected.mul(shares[account]).div(totalShares);

            _balances[account][token0] = _balances[account][token0].add(amount0);
            _balances[account][token1] = _balances[account][token1].add(amount1);

            totalDistributed0 = totalDistributed0.add(amount0);
            totalDistributed1 = totalDistributed1.add(amount1);
        }

        assert(totalDistributed0 <= amount0Collected);
        assert(totalDistributed1 <= amount1Collected);

        // Give the dust to the first account
        address firstAccount = accounts[0];
        _balances[firstAccount][token0] = _balances[firstAccount][token0].add(amount0Collected.sub(totalDistributed0));
        _balances[firstAccount][token1] = _balances[firstAccount][token1].add(amount1Collected.sub(totalDistributed1));

        emit CollectedFees(pool, token0, token1, amount0Collected, amount1Collected);
    }

    function setFeeProtocol(address pool, uint8 feeProtocol0, uint8 feeProtocol1) external onlyOwner {
        IUniswapV3PoolOwnerActions(pool).setFeeProtocol(feeProtocol0, feeProtocol1);
        emit SetFeeProtocol(pool, feeProtocol0, feeProtocol1);
    }

    function initialize(address pool, uint160 sqrtPriceX96) external onlyOwner {
        IVinuSwapExtraPoolOwnerActions(pool).initialize(sqrtPriceX96);
        emit Initialize(pool, sqrtPriceX96);
    }

    function withdraw(address token, uint256 amount) external {
        require(amount > 0, 'Cannot withdraw 0');
        require(amount <= _balances[msg.sender][token], 'Insufficient balance');

        _balances[msg.sender][token] = _balances[msg.sender][token].sub(amount);
        IERC20(token).safeTransfer(msg.sender, amount);

        emit Withdrawal(msg.sender, token, amount);
    }

    function balanceOf(address account, address token) public view returns (uint256) {
        return _balances[account][token];
    }
}