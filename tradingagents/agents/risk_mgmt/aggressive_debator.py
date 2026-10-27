

def create_aggressive_debator(llm):
    def aggressive_node(state) -> dict:
        risk_debate_state = state["risk_debate_state"]
        history = risk_debate_state.get("history", "")
        aggressive_history = risk_debate_state.get("aggressive_history", "")

        current_conservative_response = risk_debate_state.get("current_conservative_response", "")
        current_neutral_response = risk_debate_state.get("current_neutral_response", "")

        market_research_report = state["market_report"]
        sentiment_report = state["sentiment_report"]
        news_report = state["news_report"]
        fundamentals_report = state["fundamentals_report"]

        trader_decision = state["trader_investment_plan"]
        holding = state.get("holding_info")
        holding_ctx = ""
        if holding:
            holding_ctx = f"\n**EXISTING POSITION OPPORTUNITY**: {holding.get('quantity')} shares @ ₹{holding.get('average_price')} (CMP: ₹{holding.get('last_price')}, P&L: ₹{holding.get('pnl')} / {holding.get('pnl_pct')}%)\n"

        prompt = f"""As the Aggressive Risk Analyst for an **Indian market (NSE/BSE) short-term trading desk**, champion the high-reward opportunity. Focus on why acting boldly on this trade is the right call for the short-term horizon.
{holding_ctx}
Trader's decision: {trader_decision}

**Indian Market Aggressive Arguments:**
- Momentum is king in NSE short-term trades — strong momentum setups reward aggressive position sizing
- FII flows can sustain moves for days — if FIIs are buying, ride the trend aggressively
- Volatile stocks with high ATR offer better risk-reward for short-term trades
- Counter conservative concerns about overnight gaps with bracket order protection
- In Indian markets, stocks near 52-week highs often continue (breakout momentum)
- NIFTY trending days offer high probability setups — use these for aggressive entries

Challenge conservative caution and neutral hesitation with data. Argue for:
- Larger position sizes when setup quality is high
- Wider targets when momentum is strong
- Using the full allocated risk budget rather than being timid

Market Research: {market_research_report}
Sentiment: {sentiment_report}
News: {news_report}
Fundamentals: {fundamentals_report}
Debate history: {history}
Conservative view: {current_conservative_response}
Neutral view: {current_neutral_response}

If no prior responses exist, present your aggressive case based on available data. Debate conversationally, no special formatting."""

        response = llm.invoke(prompt)

        argument = f"Aggressive Analyst: {response.content}"

        new_risk_debate_state = {
            "history": history + "\n" + argument,
            "aggressive_history": aggressive_history + "\n" + argument,
            "conservative_history": risk_debate_state.get("conservative_history", ""),
            "neutral_history": risk_debate_state.get("neutral_history", ""),
            "latest_speaker": "Aggressive",
            "current_aggressive_response": argument,
            "current_conservative_response": risk_debate_state.get("current_conservative_response", ""),
            "current_neutral_response": risk_debate_state.get(
                "current_neutral_response", ""
            ),
            "count": risk_debate_state["count"] + 1,
        }

        return {"risk_debate_state": new_risk_debate_state}

    return aggressive_node
