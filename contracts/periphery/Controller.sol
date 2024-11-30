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

/// @title VinuSwap Pool Controller
/// @notice Manages pool creation and protocol fees
contract Controller is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /// @notice Emitted when fees are collected from a pool
    /// @param pool The address of the pool from which fees were collected
    /// @param token0 The first token of the pool by address sort order
    /// @param token1 The second token of the pool by address sort order
    /// @param amount0 The amount of token0 collected
    /// @param amount1 The amount of token1 collected
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
    /// @param sqrtPriceX96 The initial square root price of the pool, in Q64.96
    /// @param pool The address of the created pool
    event PoolCreated(
        address indexed token0,
        address indexed token1,
        uint24 indexed fee,
        address factory,
        int24 tickSpacing,
        address feeManager,
        uint160 sqrtPriceX96,
        address pool
    );

    /// @notice Emitted when the protocol fee is changed by the pool
    /// @param pool The pool for which the protocol fee is being updated
    /// @param feeProtocol0 The updated value of the token0 protocol fee
    /// @param feeProtocol1 The updated value of the token1 protocol fee
    event SetFeeProtocol(address indexed pool, uint8 feeProtocol0, uint8 feeProtocol1);

    /// Emitted when a pool is initialized
    /// @param pool The pool that was initialized
    /// @param sqrtPriceX96 The initial square root price of the pool, in Q64.96 format
    event Initialize(address indexed pool, uint160 sqrtPriceX96);

    mapping(address => mapping(address => uint256)) internal _balances;

    /// @notice The total number of shares
    uint256 public totalShares;

    /// @notice The shares owned by each account
    mapping(address => uint256) public shares;

    /// @notice The accounts that have shares
    address[] public accounts;

    /// @notice The default fee manager for each factory
    mapping(address => address) public defaultFeeManager;
    /// @notice The default tick spacing for each factory and fee
    mapping(address => mapping(uint24 => int24)) public defaultTickSpacing;


    /// @notice Contract constructor
    /// @param _accounts The accounts that will receive fees
    /// @param _shares The number of shares owned by each account
    constructor(address[] memory _accounts, uint256[] memory _shares) {
        require(_accounts.length > 0, 'At least one account is required');
        require(_accounts.length == _shares.length, 'Accounts and shares must have the same length');

        for (uint256 i = 0; i < _accounts.length; i++) {
            _addAccount(_accounts[i], _shares[i]);
        }
    }

    
    /// @dev Adds a new account to the contract
    /// @param account The address of the account to add
    /// @param accountShares The number of shares owned by the account
    function _addAccount(address account, uint256 accountShares) private {
        require(account != address(0), 'Account must not be the zero address');
        require(accountShares > 0, 'Shares must be greater than zero');
        require(shares[account] == 0, 'Account already has shares');

        accounts.push(account);
        shares[account] = accountShares;
        totalShares = totalShares.add(accountShares);
    }

    /// @notice Creates a new pool
    /// @dev tokenA and tokenB might be switched, depending on their addresses
    /// @param factory The factory used to create the pool
    /// @param tokenA The first token of the pool
    /// @param tokenB The second token of the pool
    /// @param fee The fee collected upon every swap in the pool, denominated in hundredths of a bip
    /// @param tickSpacing The minimum number of ticks between valid price ticks
    /// @param feeManager The address of the fee manager
    /// @param sqrtPriceX96 The initial square root price of the pool, in Q64.96
    /// @return pool The address of the created pool
    function _createPoolInternal(
        address factory,
        address tokenA,
        address tokenB,
        uint24 fee,
        int24 tickSpacing,
        address feeManager,
        uint160 sqrtPriceX96
    ) internal returns (address pool) {
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        pool = IVinuSwapFactory(factory).createPool(token0, token1, fee, tickSpacing, feeManager);
        IVinuSwapExtraPoolOwnerActions(pool).initialize(sqrtPriceX96);

        emit PoolCreated(token0, token1, fee, factory, tickSpacing, feeManager, sqrtPriceX96, pool);
    }

    /// @notice Creates a new pool
    /// @dev tokenA and tokenB might be switched, depending on their addresses
    /// @param factory The factory used to create the pool
    /// @param tokenA The first token of the pool
    /// @param tokenB The second token of the pool
    /// @param fee The fee collected upon every swap in the pool, denominated in hundredths of a bip
    /// @param tickSpacing The minimum number of ticks between valid price ticks
    /// @param feeManager The address of the fee manager
    /// @param sqrtPriceX96 The initial square root price of the pool, in Q64.96
    /// @return pool The address of the created pool
    function createPool(
        address factory,
        address tokenA,
        address tokenB,
        uint24 fee,
        int24 tickSpacing,
        address feeManager,
        uint160 sqrtPriceX96
    ) external onlyOwner nonReentrant returns (address pool) {
        _createPoolInternal(factory, tokenA, tokenB, fee, tickSpacing, feeManager, sqrtPriceX96);
    }

    /// @notice Sets the default fee manager for a factory for standard pool creation
    /// @dev A zero-address resets the default fee manager, disabling deployment
    /// @param factory The address of the factory for which to set the default fee manager
    /// @param feeManager The address of the default fee manager
    function setDefaultFeeManager(address factory, address feeManager) external onlyOwner {
        defaultFeeManager[factory] = feeManager;
    }

    /// @notice Sets the default tick spacing for a factory for standard pool creation
    /// @dev A tick spacing of 0 resets the default tick spacing
    /// @param factory The address of the factory for which to set the default tick spacing, disabling deployment
    /// @param fee The fee for which to set the default tick spacing
    /// @param tickSpacing The default tick spacing
    function setDefaultTickSpacing(address factory, uint24 fee, int24 tickSpacing) external onlyOwner {
        require(tickSpacing >= 0 && tickSpacing < 16384, 'Invalid tick spacing');
        defaultTickSpacing[factory][fee] = tickSpacing;
    }

    /// @notice Creates a standard pool with the default fee manager and tick spacing
    /// @dev tokenA and tokenB might be switched, depending on their addresses
    /// @dev The default fee manager and tick spacing must be set for the factory
    /// @param factory The address of the factory used to create the pool
    /// @param tokenA The first token of the pool
    /// @param tokenB The second token of the pool
    /// @param fee The fee collected upon every swap in the pool, denominated in hundredths of a bip
    /// @param sqrtPriceX96 The initial square root price of the pool, in Q64.96
    /// @return pool The address of the created pool
    function createStandardPool(
        address factory,
        address tokenA,
        address tokenB,
        uint24 fee,
        uint160 sqrtPriceX96
    ) external nonReentrant returns (address pool) {
        address feeManager = defaultFeeManager[factory];
        int24 tickSpacing = defaultTickSpacing[factory][fee];
        require(feeManager != address(0), 'Fee manager not set');
        require(tickSpacing > 0, 'Tick spacing not set');

        return _createPoolInternal(factory, tokenA, tokenB, fee, tickSpacing, feeManager, sqrtPriceX96);
    }

    /// @notice Collects protocol fees from a pool
    /// @param pool The address of the pool from which to collect fees
    /// @param amount0Requested The maximum amount of token0 to collect
    /// @param amount1Requested The maximum amount of token1 to collect
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

    /// @notice Sets the protocol fee for a pool
    /// @param pool The address of the pool for which to set the protocol fee
    /// @param feeProtocol0 The new protocol fee for token0
    /// @param feeProtocol1 The new protocol fee for token1
    function setFeeProtocol(address pool, uint8 feeProtocol0, uint8 feeProtocol1) external onlyOwner nonReentrant {
        IUniswapV3PoolOwnerActions(pool).setFeeProtocol(feeProtocol0, feeProtocol1);
        emit SetFeeProtocol(pool, feeProtocol0, feeProtocol1);
    }

    /// @notice Initializes a pool
    /// @param pool The address of the pool to initialize
    /// @param sqrtPriceX96 The initial square root price of the pool, in Q64.96
    function initialize(address pool, uint160 sqrtPriceX96) external onlyOwner nonReentrant {
        IVinuSwapExtraPoolOwnerActions(pool).initialize(sqrtPriceX96);
        emit Initialize(pool, sqrtPriceX96);
    }

    /// @notice Withdraws tokens from the contract
    /// @param token The address of the token to withdraw
    /// @param amount The amount of tokens to withdraw
    function withdraw(address token, uint256 amount) external nonReentrant {
        require(amount > 0, 'Cannot withdraw 0');
        require(amount <= _balances[msg.sender][token], 'Insufficient balance');

        _balances[msg.sender][token] = _balances[msg.sender][token].sub(amount);
        IERC20(token).safeTransfer(msg.sender, amount);

        emit Withdrawal(msg.sender, token, amount);
    }

    /// @notice Returns the balance of an account
    /// @param account The address of the account
    /// @param token The address of the token
    function balanceOf(address account, address token) public view returns (uint256) {
        return _balances[account][token];
    }

    /// @notice Transfers the ownership of a factory
    function transferFactoryOwnership(address factory, address newOwner) external nonReentrant onlyOwner {
        IVinuSwapFactory(factory).setOwner(newOwner);
    }
}