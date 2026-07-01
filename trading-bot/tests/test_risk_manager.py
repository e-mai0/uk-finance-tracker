"""Pure-logic tests for the risk manager. No network, no API keys."""

from risk.manager import RiskLimits, RiskManager


def test_position_size_respects_cap():
    rm = RiskManager(RiskLimits(max_position_pct=0.10), starting_equity=10_000)
    # 10% of 10,000 = 1,000 notional; at $100 that's 10 shares, none held.
    assert rm.position_size(10_000, 100, current_qty=0) == 10


def test_position_size_accounts_for_existing_holding():
    rm = RiskManager(RiskLimits(max_position_pct=0.10), starting_equity=10_000)
    # Already hold 6 @ $100 = 600 notional; room = 400 -> 4 more shares.
    assert rm.position_size(10_000, 100, current_qty=6) == 4


def test_position_size_zero_when_cap_reached():
    rm = RiskManager(RiskLimits(max_position_pct=0.10), starting_equity=10_000)
    assert rm.position_size(10_000, 100, current_qty=10) == 0


def test_position_size_zero_on_bad_price():
    rm = RiskManager(RiskLimits(), starting_equity=10_000)
    assert rm.position_size(10_000, 0, current_qty=0) == 0


def test_daily_loss_breach():
    rm = RiskManager(RiskLimits(max_daily_loss_pct=0.03), starting_equity=10_000)
    rm.start_new_day(10_000)
    assert not rm.daily_loss_breached(9_800)  # 2% down — fine
    assert rm.daily_loss_breached(9_600)      # 4% down — breached


def test_kill_switch_uses_high_water_mark():
    rm = RiskManager(RiskLimits(kill_switch_drawdown_pct=0.15), starting_equity=10_000)
    rm.update_equity(12_000)                    # new peak
    assert not rm.kill_switch_triggered(11_000)  # ~8.3% drawdown — fine
    assert rm.kill_switch_triggered(10_000)      # ~16.7% drawdown — halt


def test_can_trade_blocks_and_explains():
    rm = RiskManager(
        RiskLimits(max_daily_loss_pct=0.03, kill_switch_drawdown_pct=0.15),
        starting_equity=10_000,
    )
    rm.start_new_day(10_000)
    ok, reason = rm.can_trade(9_600)
    assert not ok
    assert "daily loss" in reason
