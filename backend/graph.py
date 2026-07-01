# ===========================================================================
# ArthSaathi · graph.py  =  THE ORCHESTRATOR
#   LangGraph spine that wires the whole pipeline.
#   PIPELINE:  guard -> plan -> agent -> compose -> critic -> respond
# ===========================================================================
# backend/graph.py
# ---------------------------------------------------------------------------
# ORCHESTRATION with LangGraph, driven by the KakushIN LLM.
#
#   START -> [plan] --(which agent?)--> [advisor] -\
#                                       [risk]      \
#                                       [asset]      \
#                                       [scheme]      >-> [compose] -> [critic] --(ok?)--> [respond] -> END
#                                       [scam]       /                                \--> [handoff] -> END
#                                       [legacy]    /
#                                       [general] -/
#
#   plan    : the LLM reads the message and picks the agent (intent).        [KakushIN, with keyword fallback]
#   <agent> : that one skill calls its TOOL(s) and reads its KNOWLEDGE.      [deterministic -> trustworthy numbers]
#   compose : the LLM turns the result into a warm, simple human reply.      [KakushIN, with template fallback]
#   critic  : refuses any rupee number the tools did not produce.            [deterministic -> the trust gate]
#
# The math is always the tools' (never the LLM's), and the Critic always runs
# last, so the LLM can route and phrase but can never put a wrong number in
# front of the user. state["trace"] shows the exact path taken.
# ---------------------------------------------------------------------------

import operator
from typing import Annotated, TypedDict

from langgraph.graph import StateGraph, START, END

from agents import AGENTS, plan_route, compose_reply, critic
import guardrails


# ---- the shared state that flows through the graph ----
class ChatState(TypedDict, total=False):
    text: str
    profile: dict
    language: str
    intent: str
    reply: str
    citations: list
    computed_numbers: list
    allow_compose: bool
    status: str
    reason: str
    guard: dict
    agent: str
    tool_calls: list
    trace: Annotated[list, operator.add]       # reducer: each node APPENDS its name


# ---- node: GUARDRAIL -- the SAFETY-intent classifier. Runs BEFORE the agent
# router. It is the orchestrator's first gate: obvious prompt-injection / unsafe
# finance -> "blocked"; distress -> escalate; everything else -> "plan". ----
def guard_node(state: ChatState) -> dict:
    verdict = guardrails.inspect_input(state["text"], state.get("language", "en"))
    return {"guard": verdict, "trace": ["guard"]}


def route_after_guard(state: ChatState) -> str:
    return "plan" if state["guard"]["action"] == "allow" else "blocked"


def blocked_node(state: ChatState) -> dict:
    """Terminal node for a blocked/escalated message: return a safe canned reply
    and skip every agent + tool. Shows up in the trace as guard -> blocked."""
    v = state["guard"]
    return {"reply": v["reply"], "status": v["status"], "reason": v["category"],
            "agent": "guardrail", "citations": [], "computed_numbers": [],
            "tool_calls": [], "trace": ["blocked"]}


# ---- node: the LLM plans which agent should handle the message ----
def plan_node(state: ChatState) -> dict:
    return {"intent": plan_route(state["text"]), "trace": ["plan"]}


def route_to_agent(state: ChatState) -> str:
    """Conditional edge after planning: the key IS the agent/node name."""
    return state["intent"]


# ---- one node per agent, built from the AGENTS registry ----
def make_agent_node(name):
    def node(state: ChatState) -> dict:
        draft = AGENTS[name](state["text"], state["profile"], state.get("language", "en"))
        return {"reply": draft["reply"],
                "citations": draft["citations"],
                "computed_numbers": draft["computed_numbers"],
                "allow_compose": draft["allow_compose"],
                "agent": draft["agent"],
                "tool_calls": draft["tool_calls"],
                "trace": [name]}
    return node


# ---- node: the LLM composes the human-friendly reply (numbers preserved) ----
def compose_node(state: ChatState) -> dict:
    reply = compose_reply(state["reply"], state["computed_numbers"],
                          state.get("language", "en"), state.get("allow_compose", True),
                          state.get("agent", "general"))
    return {"reply": reply, "trace": ["compose"]}


# ---- node: the Critic verifies the composed reply ----
def critic_node(state: ChatState) -> dict:
    c = critic(state["reply"], state["computed_numbers"])
    return {"status": c["status"], "reason": c["reason"], "trace": ["critic"]}


def route_after_critic(state: ChatState) -> str:
    return "deliver" if state["status"] == "delivered" else "handoff"


def respond_node(state: ChatState) -> dict:
    return {"trace": ["respond"]}


def handoff_node(state: ChatState) -> dict:
    return {"reply": ("I could not verify that safely, so let me connect you to a "
                      "trained person who can help."),
            "trace": ["handoff"]}


# ===========================================================================
# BUILD + COMPILE THE GRAPH ONCE.
# ===========================================================================
def build_graph():
    g = StateGraph(ChatState)

    g.add_node("guard", guard_node)
    g.add_node("plan", plan_node)
    for name in AGENTS:                        # advisor, risk, asset, scheme, scam, legacy, general
        g.add_node(name, make_agent_node(name))
    g.add_node("compose", compose_node)
    g.add_node("critic", critic_node)
    g.add_node("respond", respond_node)
    g.add_node("handoff", handoff_node)
    g.add_node("blocked", blocked_node)

    g.add_edge(START, "guard")                 # the guardrail is the FIRST stage
    g.add_conditional_edges("guard", route_after_guard,
                            {"plan": "plan", "blocked": "blocked"})
    g.add_conditional_edges("plan", route_to_agent, {name: name for name in AGENTS})
    for name in AGENTS:
        g.add_edge(name, "compose")            # every agent -> compose
    g.add_edge("compose", "critic")            # compose -> critic
    g.add_conditional_edges("critic", route_after_critic,
                            {"deliver": "respond", "handoff": "handoff"})
    g.add_edge("respond", END)
    g.add_edge("handoff", END)
    g.add_edge("blocked", END)

    return g.compile()


GRAPH = build_graph()


def run_chat(text, profile, language="en"):
    """Run one message through the agent graph and return the final answer."""
    final = GRAPH.invoke({"text": text, "profile": profile,
                          "language": language, "trace": []})
    return {
        "reply": final["reply"],
        "citations": final.get("citations", []),
        "computed_numbers": final.get("computed_numbers", []),
        "status": final["status"],
        "agent": final.get("agent", ""),
        "tool_calls": final.get("tool_calls", []),
        "trace": final["trace"],   # e.g. ["plan","advisor","compose","critic","respond"]
    }


# ---- quick self-test: run `python graph.py` ----
if __name__ == "__main__":
    import db
    db.init_db()
    p = db.get_profile(3)
    for q in ["can I afford a 50000 loan", "guarantee me 12% return on 10000",
              "will my money last the year?", "how are my assets doing?",
              "any government scheme for me?", "is this KYC OTP link a scam?"]:
        out = run_chat(q, p, "en")
        print(f"\nQ: {q}")
        print("   path  :", " -> ".join(out["trace"]))
        print("   agent :", out["agent"], "| tools:", out["tool_calls"], "| status:", out["status"])
        print("   reply :", out["reply"][:84], "...")
