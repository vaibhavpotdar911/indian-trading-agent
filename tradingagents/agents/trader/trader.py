import functools

from tradingagents.agents.utils.agent_utils import build_instrument_context


def create_trader(llm, memory):
    def trader_node(state, name):
        company_name = state["company_of_interest"]
        instrument_context = build_instrument_context(company_name)
        investment_plan = state["investment_plan"]
        market_research_report = state["market_report"]
        sentiment_report = state["sentiment_report"]
        news_report = state["news_report"]
        fundamentals_report = state["fundamentals_report"]

        curr_situation = f"{market_research_report}\n\n{sentiment_report}\n\n{news_report}\n\n{fundamentals_report}"
        past_memories = memory.get_memories(curr_situation, n_matches=2)

        past_memory_str = ""
        if past_memories:
            for i, rec in enumerate(past_memories, 1):
                past_memory_str += rec["recommendation"] + "\n\n"
        else:
            past_memory_str = "No past memories found."

        holding = state.get("holding_info")
        holding_context_str = ""
        holding_instructions = ""
        if holding:
            holding_context_str = f"""
---
**EXISTING PORTFOLIO HOLDING METRICS:**
- Quantity Held: {holding.get('quantity', 0)} shares
- Average Purchase Price: ₹{holding.get('average_price', 0)}
- Current Market Price: ₹{holding.get('last_price', 0)}
- Unrealized P&L: ₹{holding.get('pnl', 0)} ({holding.get('pnl_pct', 0)}%)
---"""
            holding_instructions = """
**SPECIAL FOCUS FOR EXISTING PORTFOLIO HOLDING:**
The user already holds this stock. Provide specific advice for their open position:
- **HOLD**: Thesis intact, retain existing position.
- **ADD / ACCUMULATE**: Strong risk-reward setup on dip/breakout to buy more shares.
- **BOOK PROFIT / TRIM**: Stock near resistance or target; lock in profits.
- **CUT LOSS / EXIT**: Key support broken or thesis invalidated; exit position.
Conclude with 'FINAL TRANSACTION PROPOSAL: **HOLD / ADD / TRIM / EXIT**'."""

        context = {
            "role": "user",
            "content": f"Based on a comprehensive analysis by a team of analysts, here is an investment plan tailored for {company_name}. {instrument_context} {holding_context_str} This plan incorporates insights from current technical market trends, macroeconomic indicators, and social media sentiment. Use this plan as a foundation for evaluating your next trading decision.\n\nProposed Investment Plan: {investment_plan}\n\nLeverage these insights to make an informed and strategic decision.",
        }

        messages = [
            {
                "role": "system",
                "content": f"""You are a short-term trading agent for the **Indian stock market (NSE/BSE)**. You analyze market data to make specific, actionable trading decisions with clear entry/exit parameters.

**Your Decision Framework:**
Based on the investment plan and analyst reports, provide:
1. **Action**: BUY / SELL / HOLD / SHORT (or HOLD / ADD / TRIM / EXIT if holding an existing position)
2. **Entry Price**: Specific price or "at market open"
3. **Stop-Loss**: Mandatory — use ATR-based or support/resistance level
4. **Target 1**: Conservative profit target
5. **Target 2**: Extended target (optional)
6. **Position Size**: Suggested % of capital (considering risk per trade)
7. **Time Horizon**: Intraday / 2-3 days / 1 week
8. **Risk-Reward Ratio**: Calculate from entry, SL, and target
9. **Order Type**: MARKET / LIMIT / SL-LIMIT (for NSE execution)
{holding_instructions}

**Indian Market Considerations:**
- NSE market hours: 9:15 AM - 3:30 PM IST
- Consider circuit limits (upper/lower) for volatile stocks
- Account for lot sizes if recommending F&O trades
- Factor in settlement cycle (T+1 for equities)
- Consider opening gap risk from overnight global cues

Always conclude with 'FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL/ADD/TRIM/EXIT**' to confirm.
Apply lessons from past decisions: {past_memory_str}""",
            },
            context,
        ]

        result = llm.invoke(messages)

        return {
            "messages": [result],
            "trader_investment_plan": result.content,
            "sender": name,
        }

    return functools.partial(trader_node, name="Trader")
