

def create_neutral_debator(llm):
    def neutral_node(state) -> dict:
        risk_debate_state = state["risk_debate_state"]
        history = risk_debate_state.get("history", "")
        neutral_history = risk_debate_state.get("neutral_history", "")

        current_aggressive_response = risk_debate_state.get("current_aggressive_response", "")
        current_conservative_response = risk_debate_state.get("current_conservative_response", "")

        market_research_report = state["market_report"]
        sentiment_report = state["sentiment_report"]
        news_report = state["news_report"]
        fundamentals_report = state["fundamentals_report"]

        trader_decision = state["trader_investment_plan"]
        holding = state.get("holding_info")
        holding_ctx = ""
        if holding:
            holding_ctx = f"\n**EXISTING POSITION METRICS**: {holding.get('quantity')} shares @ ₹{holding.get('average_price')} (CMP: ₹{holding.get('last_price')}, P&L: ₹{holding.get('pnl')} / {holding.get('pnl_pct')}%)\n"

        prompt = f"""As the Neutral Risk Analyst for an **Indian market (NSE/BSE) short-term trading desk**, provide a balanced risk assessment. Weigh both upside potential and downside risks for this specific trade.
{holding_ctx}
Trader's decision: {trader_decision}

**Your Balanced Framework for Indian Markets:**
- Evaluate the trade on its risk-reward ratio — is it at least 1:2?
- Consider position sizing as a risk tool — partial position entry allows scaling
- Factor in the current NIFTY/BANKNIFTY trend — trading against the broad market is riskier
- Assess liquidity — average daily volume should support the position size
- Consider timing — avoid entries right before F&O expiry, major events, or end-of-session
- Suggest a staggered approach if both sides have merit — enter 50% now, 50% on confirmation
- Recommend time-based stop-loss — exit if target not hit within planned horizon

Challenge:
- The aggressive analyst where they ignore genuine Indian market risks (gap risk, circuit limits, operator activity)
- The conservative analyst where they let fear of loss prevent capturing genuine short-term opportunities

Market Research: {market_research_report}
Sentiment: {sentiment_report}
News: {news_report}
Fundamentals: {fundamentals_report}
Debate history: {history}
Aggressive view: {current_aggressive_response}
Conservative view: {current_conservative_response}

If no prior responses exist, present your balanced assessment. Debate conversationally, no special formatting."""

        response = llm.invoke(prompt)

        argument = f"Neutral Analyst: {response.content}"

        new_risk_debate_state = {
            "history": history + "\n" + argument,
            "aggressive_history": risk_debate_state.get("aggressive_history", ""),
            "conservative_history": risk_debate_state.get("conservative_history", ""),
            "neutral_history": neutral_history + "\n" + argument,
            "latest_speaker": "Neutral",
            "current_aggressive_response": risk_debate_state.get(
                "current_aggressive_response", ""
            ),
            "current_conservative_response": risk_debate_state.get("current_conservative_response", ""),
            "current_neutral_response": argument,
            "count": risk_debate_state["count"] + 1,
        }

        return {"risk_debate_state": new_risk_debate_state}

    return neutral_node
