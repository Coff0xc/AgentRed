# Operator Console UI Redesign Reference Research

Date: 2026-05-31

## Scope

This research pass looked at GitHub projects in the same or adjacent product space: AI-assisted penetration testing, AI red-team platforms, MCP security tool bridges, autonomous cyber agents, and security dashboards with operator workflow surfaces. The intent is not to copy a visual theme; it is to extract durable UI patterns that fit this repository's local-first, evidence-gated operator console.

## Reference Pool

1. [0x4m4/hexstrike-ai](https://github.com/0x4m4/hexstrike-ai) - MCP cybersecurity automation with real-time dashboards, progress visualization, vulnerability cards, and a large tool arsenal.
2. [Tencent/AI-Infra-Guard](https://github.com/Tencent/AI-Infra-Guard) - Web red-team platform with one-click scanning, real-time progress, plugin management, bilingual UI, and API docs.
3. [PurpleAILAB/Decepticon](https://github.com/PurpleAILAB/Decepticon) - autonomous red-team agent.
4. [GH05TCREW/pentestagent](https://github.com/GH05TCREW/pentestagent) - TUI-first pentest agent with modes, conversation history, child agents, notes, and report generation.
5. [0xSteph/pentest-ai-agents](https://github.com/0xSteph/pentest-ai-agents) - Claude Code security agent pack for pentest planning, recon, exploit research, detections, and reporting.
6. [Armur-Ai/Pentest-Swarm-AI](https://github.com/Armur-Ai/Pentest-Swarm-AI) - autonomous swarm workflow for recon, classification, exploitation, and reporting.
7. [SanMuzZzZz/LuaN1aoAgent](https://github.com/SanMuzZzZz/LuaN1aoAgent) - dual-graph autonomous penetration testing agent.
8. [0xSteph/pentest-ai](https://github.com/0xSteph/pentest-ai) - offensive-security MCP server with specialist agents and SPA-aware probes.
9. [ARCANGEL0/EVA](https://github.com/ARCANGEL0/EVA) - AI-assisted penetration testing workflow engine.
10. [SHAdd0WTAka/Zen-Ai-Pentest](https://github.com/SHAdd0WTAka/Zen-Ai-Pentest) - React dashboard, FastAPI/WebSocket backend, agent manager, scan state machine, report generation, risk levels, and screenshots.
11. [z3n70/Frida-Script-Runner](https://github.com/z3n70/Frida-Script-Runner) - web-based mobile pentest toolkit with device management, real-time output, package selection, and AI script generation.
12. [CommonHuman-Lab/nyxstrike](https://github.com/CommonHuman-Lab/nyxstrike) - AI offensive security orchestration engine with dashboard/session/workbench surfaces and live command output.
13. [yohannesgk/blacksmith](https://github.com/yohannesgk/blacksmith) - multi-agent pentest framework with web UI and terminal interface.
14. [transilienceai/communitytools](https://github.com/transilienceai/communitytools) - AI-powered pentest/bug bounty skills and agents.
15. [matty69v/Bug-Bounty-Agents](https://github.com/matty69v/Bug-Bounty-Agents) - bug bounty and red-team AI agent pack.
16. [securityfortech/secops-mcp](https://github.com/securityfortech/secops-mcp) - all-in-one security testing toolbox over MCP.
17. [fzn0x/watchtower](https://github.com/fzn0x/watchtower) - AI-powered pentest automation CLI with reporting.
18. [penligent/AI2PentestTool](https://github.com/penligent/AI2PentestTool) - AI-assisted pentest tool suite installation.
19. [RamKansal/pentestMCP](https://github.com/RamKansal/pentestMCP) - AI-powered penetration testing via MCP.
20. [mvster-p/kali-openclaw-usb](https://github.com/mvster-p/kali-openclaw-usb) - portable Kali/OpenClaw AI automation environment.
21. [hexian2001/H-Pentest](https://github.com/hexian2001/H-Pentest) - AI-powered penetration testing platform.
22. [x-glacier/kali-pentest](https://github.com/x-glacier/kali-pentest) - Kali penetration testing skill for AI agents with approval gates.
23. [vichhka-git/opencode-shannon-plugin](https://github.com/vichhka-git/opencode-shannon-plugin) - AI penetration testing plugin with Playwright and Kali tooling.
24. [ibrahimsaleem/PentestThinkingMCP](https://github.com/ibrahimsaleem/PentestThinkingMCP) - AI-powered reasoning engine for attack path planning.
25. [yashab-cyber/KaliGpt](https://github.com/yashab-cyber/KaliGpt) - Kali Linux AI pentest assistant.
26. [Lstalet04/Pentesting-AI](https://github.com/Lstalet04/Pentesting-AI) - multi-agent penetration testing AI.
27. [zebbern/zebbern-kali-mcp](https://github.com/zebbern/zebbern-kali-mcp) - MCP server exposing Kali tools to AI agents.
28. [gus5298/PentestingTool](https://github.com/gus5298/PentestingTool) - AI-based web application pentest tool.
29. [StirlingGoetz/a0pentester](https://github.com/StirlingGoetz/a0pentester) - Agent Zero extensions for ethical penetration testing.
30. [exjskdjsdfks/pentest-mcp-server](https://github.com/exjskdjsdfks/pentest-mcp-server) - persistent MCP server for autonomous pentesting.
31. [ARESHAmohanad/BugHunter-AI](https://github.com/ARESHAmohanad/BugHunter-AI) - cyber-inspired GUI with resource monitor, queue, console, and AI-assisted analysis.
32. [wudidike/pentest_skill](https://github.com/wudidike/pentest_skill) - black-box web pentest automation framework for AI agents.
33. [tuannguyen14/SpectreWeb-AI](https://github.com/tuannguyen14/SpectreWeb-AI) - self-learning AI for manual web penetration testing.
34. [scf13/pentestai](https://github.com/scf13/pentestai) - AI-powered penetration testing framework.
35. [dwain-barnes/PurPaaS-LLM](https://github.com/dwain-barnes/PurPaaS-LLM) - purple-team local LLM security assessment platform.
36. [CyberStrikeus/CyberStrike](https://github.com/CyberStrikeus/CyberStrike) - AI offensive security agent using ATT&CK, CIS, OWASP, and NIST knowledge.
37. [ktol1/RedTeam-Agent](https://github.com/ktol1/RedTeam-Agent) - MCP red-team agent with internal-network tooling integrations.
38. [secwexen/aapp-mart](https://github.com/secwexen/aapp-mart) - AI autonomous attack path prediction and multi-agent red-team simulation.
39. [studiofarzulla/adversarial-security-agents](https://github.com/studiofarzulla/adversarial-security-agents) - multi-agent adversarial security testing proof of concept.
40. [Harry-Ashley/Builder-Breaker-Lab](https://github.com/Harry-Ashley/Builder-Breaker-Lab) - AI red-teaming lab using PyRIT.
41. [gfranrp/Auto-Pentest-LLM](https://github.com/gfranrp/Auto-Pentest-LLM) - local LLM/Kali automated pentest environment.
42. [badchars/cloud-audit-mcp](https://github.com/badchars/cloud-audit-mcp) - cloud security audit MCP tools for AI agents.
43. [xalgord/xalgorix](https://github.com/xalgord/xalgorix) - open-source AI pentesting agent.
44. [ASCIT31/Dark-Moon](https://github.com/ASCIT31/Dark-Moon) - autonomous AI pentesting engine for web, cloud, AD, and Kubernetes attack paths.
45. [bhavsec/autopentest-ai](https://github.com/bhavsec/autopentest-ai) - agentic pentesting MCP server for web vulnerability discovery, exploitation, and reporting.
46. [c0tton-fluff/caido-mcp-server](https://github.com/c0tton-fluff/caido-mcp-server) - Caido proxy MCP bridge for AI-assisted HTTP traffic analysis.
47. [qualifire-dev/rogue](https://github.com/qualifire-dev/rogue) - AI agent evaluator and red-team platform.
48. [SuperagenticAI/superclaw](https://github.com/SuperagenticAI/superclaw) - red-team platform for AI agents.
49. [humanbound/humanbound](https://github.com/humanbound/humanbound) - open-source AI agent red-team engine, SDK, and CLI.
50. [RevylAI/mobile-pentest-agent](https://github.com/RevylAI/mobile-pentest-agent) - AI-powered mobile penetration testing agent.

## GitHub Search Spot Check

Current GitHub repository search on 2026-05-31 returned broad live pools for the core terms used here: `AI penetration testing` / `AI pentest` returned 369 results, `pentest agent AI` returned 69 results, `red team AI agent` returned 162 results, and `pentest MCP AI` returned 110 results. The reference pool above favors repositories whose descriptions, topics, or project shape map to AI-assisted penetration testing, autonomous red-team agents, MCP security tool bridges, evidence/review workflows, or operator-facing security dashboards.

## UI Patterns Worth Reusing

- Mission-first hierarchy: the best surfaces make current objective, current phase, next operator action, and blocking gates visible before raw logs.
- Session/workbench split: mature tools separate run selection, task creation, live operation, evidence review, and reporting instead of flattening everything into one wall of cards.
- Real-time confidence: live progress, worker health, tool availability, and recent events should be visible without forcing the operator to read verbose timelines.
- Evidence as a first-class object: findings, reports, replay, redaction, and screenshots work best when evidence has dedicated inbox/review/viewer surfaces.
- Approval and safety gates should be visually distinct: risk level, scope gate, destructive action, token/vault policy, and R3/R4 blocks need stable visual treatment.
- Operator ergonomics matter more than cyberpunk decoration: dense enterprise dashboards with restrained color, sticky navigation, and strong scanability are more useful than neon-heavy themes.
- Local runner awareness is important: mobile/Frida, browser/proxy/OAST, Docker/Kali, MCP connectors, and cloud tools all benefit from a readiness panel before execution.
- AI reasoning should be separate from audit evidence: reasoning trail and next action can be concise, while raw tool output and evidence details live lower in the page.

## Design Decisions For This Repository

- Keep the current local-first TypeScript/no-framework delivery model; avoid migrating to React just for visual polish.
- Preserve every existing DOM id and API call so the current tests and operator workflows keep working.
- Refactor the console into an operations cockpit: sticky command header, mission rail, run masthead, metric deck, primary workflow, then advanced workbench grid.
- Use neutral enterprise colors with multiple semantic accents: teal for primary action, blue for information, amber for approval/warning, red for danger, and violet only as a sparse secondary marker.
- Make simple mode useful by default; advanced mode becomes an organized engineering workbench instead of a long unstructured panel stack.
- Improve responsive behavior, text wrapping, focus states, empty states, dense lists, and mobile-safe controls.
