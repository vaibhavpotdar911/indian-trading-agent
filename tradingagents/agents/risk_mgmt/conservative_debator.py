

def create_conservative_debator(llm):
    def conservative_node(state) -> dict:
        risk_debate_state = state["risk_debate_state"]
        history = risk_debate_state.get("history", "")
        conservative_history = risk_debate_state.get("conservative_history", "")

        current_aggressive_response = risk_debate_state.get("current_aggressive_response", "")
        current_neutral_response = risk_debate_state.get("current_neutral_response", "")

        market_research_report = state["market_report"]
        sentiment_report = state["sentiment_report"]
        news_report = state["news_report"]
        fundamentals_report = state["fundamentals_report"]

        trader_decision = state["trader_investment_plan"]
        holding = state.get("holding_info")
        holding_ctx = ""
        if holding:
            holding_ctx = f"\n**EXISTING POSITION AT RISK**: {holding.get('quantity')} shares @ ₹{holding.get('average_price')} (CMP: ₹{holding.get('last_price')}, P&L: ₹{holding.get('pnl')} / {holding.get('pnl_pct')}%)\n"

        prompt = f"""As the Conservative Risk Analyst for an **Indian market (NSE/BSE) short-term trading desk**, your priority is capital preservation and risk mitigation. Critically examine the trade for excessive risk.
{holding_ctx}
Trader's decision: {trader_decision}

**Indian Market Conservative Arguments:**
- NSE circuit limits (5%/10%/20%) can trap positions — especially in mid/small caps
- Overnight gap risk: SGX Nifty, US market moves, and global events cause unpredictable gaps
- FII sudden selling can reverse momentum in a single session
- RBI policy surprises (rate changes, liquidity measures) cause sector-wide moves
- Indian market volatility around F&O expiry (weekly Thursday for NIFTY/BANKNIFTY) is treacherous
- Settlement risk in T+1 — capital gets locked
- Operator-driven stocks on NSE can create false breakouts — verify with delivery percentage
- Crude oil spikes directly hurt Indian markets (import dependency)
- INR depreciation events can trigger broad sell-offs

Advocate for:
- Strict stop-losses — never risk more than 1-2% of capital per trade
- Smaller position sizes in volatile market conditions
- Avoiding trades before major events (RBI policy, Union Budget, earnings)
- Using bracket orders to automate risk management

Market Research: {market_research_report}
Sentiment: {sentiment_report}
News: {news_report}
Fundamentals: {fundamentals_report}
Debate history: {history}
Aggressive view: {current_aggressive_response}
Neutral view: {current_neutral_response}

If no prior responses exist, present your conservative risk assessment. Debate conversationally, no special formatting."""

        response = llm.invoke(prompt)

        argument = f"Conservative Analyst: {response.content}"

        new_risk_debate_state = {
            "history": history + "\n" + argument,
            "aggressive_history": risk_debate_state.get("aggressive_history", ""),
            "conservative_history": conservative_history + "\n" + argument,
            "neutral_history": risk_debate_state.get("neutral_history", ""),
            "latest_speaker": "Conservative",
            "current_aggressive_response": risk_debate_state.get(
                "current_aggressive_response", ""
            ),
            "current_conservative_response": argument,
            "current_neutral_response": risk_debate_state.get(
                "current_neutral_response", ""
            ),
            "count": risk_debate_state["count"] + 1,
        }

        return {"risk_debate_state": new_risk_debate_state}

    return conservative_node
