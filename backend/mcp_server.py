# backend/mcp_server.py
# ---------------------------------------------------------------------------
# This exposes our financial tools over the Model Context Protocol (MCP).
# MCP is a standard "USB port" for AI tools: any MCP-aware agent (including
# KakushIN) can discover and call these functions. We just wrap the same
# functions from tools.py and rag.py -- no logic is duplicated.
#
# Demo it live with:   mcp dev mcp_server.py     (opens the MCP Inspector UI)
# (plain run:          python mcp_server.py )
# ---------------------------------------------------------------------------

from mcp.server.fastmcp import FastMCP
from tools import compute_emi, check_schemes, scam_check
from tools import list_tools
from skills import list_skills as _list_skills
import rag

mcp = FastMCP("arthsaathi")


@mcp.tool()
def available_tools() -> list:
    """List every tool the ArthSaathi agents can call, with a short description."""
    return list_tools()


@mcp.tool()
def available_skills() -> list:
    """List the user-facing SKILLS of the ArthSaathi AI employee. Each skill maps
    to an agent and the deterministic tools it uses, so any MCP client (including
    KakushIN) can discover what ArthSaathi can do."""
    return _list_skills()


@mcp.tool()
def emi(principal_paise: int, annual_rate_bps: int, months: int) -> dict:
    """Calculate the monthly EMI and total interest for a loan.
    Money is in paise (1 rupee = 100 paise); rate is in basis points (100 = 1%)."""
    return compute_emi(principal_paise, annual_rate_bps, months)


@mcp.tool()
def schemes(profile: dict) -> dict:
    """Check which government schemes a person is eligible for, using fixed rules."""
    return check_schemes(profile)


@mcp.tool()
def search_facts(query: str, k: int = 3) -> list:
    """Vector RAG search: return the verified SEBI / NCFE passages whose MEANING
    is closest to the query (via ChromaDB + the local GGUF embedder), each with
    its source, page, and a similarity score."""
    return rag.search(query, k)


@mcp.tool()
def parivar_patra(user_id: int = 1) -> dict:
    """Generate the Parivar Patra (Family Card): every recorded asset with the
    exact claim route and documents a surviving family needs. Deterministic."""
    import db
    from tools import family_card
    db.init_db()
    return family_card(db.get_profile(user_id), db.get_assets(user_id))


@mcp.tool()
def check_scam(sms_text: str, language: str = "en") -> dict:
    """Score an SMS for scam risk and return a warning message."""
    return scam_check(sms_text, language)


if __name__ == "__main__":
    mcp.run()