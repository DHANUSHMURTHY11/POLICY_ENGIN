"""
╔══════════════════════════════════════════════════════════════════╗
║  BaikalSphere Policy Engine — Interactive QA Test Runner        ║
║  Run: python test_flow.py                                       ║
║  Follow the prompts. Press ENTER to proceed through each step. ║
╚══════════════════════════════════════════════════════════════════╝
"""
import requests
import json
import sys
import time

BASE = "http://localhost:8000"
ADMIN_EMAIL = "admin@baikalsphere.com"
ADMIN_PASS = "Admin@123"
MANAGER_EMAIL = "manager@test.com"
MANAGER_PASS = "Manager@123"

# ── Colors ──
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

state = {}  # Shared state across steps


def banner(text):
    print(f"\n{BOLD}{CYAN}{'═'*60}{RESET}")
    print(f"{BOLD}{CYAN}  {text}{RESET}")
    print(f"{BOLD}{CYAN}{'═'*60}{RESET}")


def step(num, title):
    print(f"\n{BOLD}{YELLOW}▶ Step {num} — {title}{RESET}")


def info(msg):
    print(f"  {CYAN}ℹ {msg}{RESET}")


def success(msg):
    print(f"  {GREEN}✅ {msg}{RESET}")


def fail(msg):
    print(f"  {RED}❌ {msg}{RESET}")


def show_json(data, max_lines=15):
    text = json.dumps(data, indent=2, default=str)
    lines = text.split("\n")
    for line in lines[:max_lines]:
        print(f"    {line}")
    if len(lines) > max_lines:
        print(f"    ... ({len(lines) - max_lines} more lines)")


import os

AUTO_MODE = os.environ.get("AUTO_MODE", "0") == "1"


def pause(msg="Press ENTER to continue..."):
    if AUTO_MODE:
        print(f"\n  {YELLOW}⏸ [AUTO] {msg}{RESET}")
        return
    input(f"\n  {YELLOW}⏸ {msg}{RESET}")


def api(method, path, token=None, data=None, expect=None):
    url = f"{BASE}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    # Longer timeouts for Ollama CPU inference
    ai_paths = ["/structure/ai", "/natural", "/query", "/summary", "/word", "/pdf", "/json", "/compose", "/rewrite"]
    is_ai = any(p in path for p in ai_paths)
    timeout = 360 if is_ai else 30
    try:
        if method == "GET":
            r = requests.get(url, headers=headers, timeout=timeout)
        elif method == "POST":
            r = requests.post(url, headers=headers, json=data, timeout=timeout)
        elif method == "PUT":
            r = requests.put(url, headers=headers, json=data, timeout=timeout)
        elif method == "DELETE":
            r = requests.delete(url, headers=headers, timeout=timeout)

        info(f"{method} {path} → {r.status_code}")

        if expect and r.status_code != expect:
            fail(f"Expected {expect}, got {r.status_code}")
            try:
                show_json(r.json())
            except:
                print(f"    {r.text[:200]}")
            return None

        try:
            return r.json()
        except:
            return {"status_code": r.status_code, "text": r.text[:200]}
    except requests.exceptions.ConnectionError:
        fail("Cannot connect to backend. Is it running on port 8000?")
        return None
    except Exception as e:
        fail(f"Request failed: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════
#  PART 1 — SYSTEM STARTUP CHECK
# ═══════════════════════════════════════════════════════════════════

def part1():
    banner("PART 1 — SYSTEM STARTUP CHECK")

    step("1.1", "Check Backend is Running")
    info("Calling GET http://localhost:8000/ ...")
    data = api("GET", "/")
    if data:
        success(f"Backend running: {data.get('app', 'unknown')}")
        ai_provider = data.get("ai_provider", "unknown")
        ai_model = data.get("ai_model", "unknown")
        success(f"AI Provider: {ai_provider} | Model: {ai_model}")
        if ai_provider != "ollama":
            fail(f"Expected 'ollama', got '{ai_provider}'. Check .env AI_PROVIDER setting.")
    else:
        fail("Backend not reachable. Start it with: python -m uvicorn app.main:app --reload --port 8000")
        sys.exit(1)

    step("1.2", "Check Frontend is Running")
    info("Checking http://localhost:3000 ...")
    try:
        r = requests.get("http://localhost:3000", timeout=5)
        success("Frontend is running on http://localhost:3000")
    except:
        fail("Frontend not reachable. Start it with: npm run dev (in frontend folder)")

    pause()


# ═══════════════════════════════════════════════════════════════════
#  PART 2 — CAR LOAN FULL FLOW
# ═══════════════════════════════════════════════════════════════════

def part2():
    banner("PART 2 — CAR LOAN POLICY FULL FLOW")

    # ── Step 2.1: Admin Login ──
    step("2.1", "Login as Admin")
    info(f"Logging in with: {ADMIN_EMAIL} / {ADMIN_PASS}")
    data = api("POST", "/api/auth/login", data={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASS,
    })
    if not data or "access_token" not in data:
        fail("Admin login failed! Check credentials.")
        return
    admin_token = data["access_token"]
    user = data.get("user", {})
    success(f"Logged in as: {user.get('full_name', 'unknown')} (role: {user.get('role_name', 'unknown')})")
    state["admin_token"] = admin_token
    info(f"Token: {admin_token[:30]}...")
    pause()

    # ── Step 2.2: Get Available Roles ──
    step("2.2", "Fetch Available Roles for Workflow Template")
    info("Getting roles from GET /api/workflow/roles ...")
    roles_data = api("GET", "/api/workflow/roles", token=admin_token)
    if roles_data:
        roles = roles_data if isinstance(roles_data, list) else roles_data.get("roles", roles_data)
        if isinstance(roles, list):
            success(f"Found {len(roles)} roles:")
            for r in roles:
                print(f"    • {r.get('name', '?')} (id: {r.get('id', '?')})")
            state["roles"] = roles
        else:
            info("Roles response:")
            show_json(roles_data)
    pause()

    # ── Step 2.3: Create Workflow Template via AI ──
    step("2.3", "Create Workflow Template Using AI (Natural Language)")
    description = "policy_manager reviews and approves the policy"
    info(f"Sending description: \"{description}\"")
    info("API: POST /api/workflow/templates/natural")
    info("Waiting for AI response (may take 5-15 seconds)...")

    template_data = api("POST", "/api/workflow/templates/natural", token=admin_token, data={
        "description": description,
    })
    if template_data and "id" in template_data:
        success(f"Template created: {template_data.get('name', 'unnamed')}")
        success(f"Template ID: {template_data['id']}")
        success(f"Type: {template_data.get('type', '?')}")
        levels = template_data.get("levels", [])
        success(f"Levels ({len(levels)}):")
        for lvl in levels:
            print(f"    Level {lvl.get('level_number', '?')}: {lvl.get('role_name', '?')} (parallel: {lvl.get('is_parallel', False)})")
        if template_data.get("ai_validation"):
            success(f"AI Validation: {json.dumps(template_data['ai_validation'], indent=2)[:200]}")
        state["template_id"] = template_data["id"]
    elif template_data:
        fail("Template creation failed:")
        show_json(template_data)
        info("If rate limited, wait 60 seconds and re-run.")
    pause()

    # ── Step 2.4: Register Policy Manager ──
    step("2.4", "Register Policy Manager User")
    info(f"Registering: {MANAGER_EMAIL}")
    mgr = api("POST", "/api/auth/register", data={
        "email": MANAGER_EMAIL,
        "password": MANAGER_PASS,
        "full_name": "Policy Manager",
        "role_name": "policy_manager",
    })
    if mgr and "id" in mgr:
        success(f"Manager registered: {mgr.get('email')} (role: {mgr.get('role_name')})")
    elif mgr and "detail" in mgr:
        info(f"Already exists or error: {mgr['detail']}")
    pause()

    # ── Step 2.5: Login as Manager ──
    step("2.5", "Login as Policy Manager")
    data = api("POST", "/api/auth/login", data={
        "email": MANAGER_EMAIL,
        "password": MANAGER_PASS,
    })
    if data and "access_token" in data:
        mgr_token = data["access_token"]
        success(f"Logged in as manager: {data['user'].get('full_name')}")
        state["mgr_token"] = mgr_token
    else:
        fail("Manager login failed. Using admin token instead.")
        state["mgr_token"] = admin_token
    pause()

    # ── Step 2.6: Create Car Loan Policy ──
    step("2.6", "Create Car Loan Policy")
    info("Creating policy: 'Car Loan Policy 2026'")
    policy = api("POST", "/api/policies", token=state["mgr_token"], data={
        "name": "Car Loan Policy 2026",
        "description": "Comprehensive car loan underwriting policy",
    }, expect=201)
    if policy:
        success(f"Policy created!")
        success(f"  ID: {policy.get('id')}")
        success(f"  Status: {policy.get('status')}")
        success(f"  Version: {policy.get('current_version')}")
        state["car_policy_id"] = policy["id"]
    pause()

    # ── Step 2.7: Generate AI Structure ──
    step("2.7", "Generate AI Structure for Car Loan Policy")
    prompt = (
        "Create a car loan policy with eligibility criteria including minimum age 21, "
        "maximum age 60, minimum CIBIL score 700, minimum income 3 LPA. "
        "Include loan parameters: max tenure 7 years, max amount 50 lakhs, LTV ratio 85%. "
        "Add insurance and collateral requirements."
    )
    info(f"Prompt: \"{prompt[:80]}...\"")
    info("API: POST /api/policies/<id>/structure/ai")
    info("Waiting for AI to generate structure (10-30 seconds)...")

    policy_id = state.get("car_policy_id")
    if not policy_id:
        fail("No policy ID. Skipping.")
        return

    structure = api("POST", f"/api/policies/{policy_id}/structure/ai", token=state["mgr_token"], data={
        "prompt": prompt,
    })
    if structure and "document_structure" in structure:
        ds = structure["document_structure"]
        sections = ds.get("sections", [])
        success(f"AI generated {len(sections)} sections:")
        for s in sections:
            subs = s.get("subsections", [])
            field_count = sum(len(sub.get("fields", [])) for sub in subs)
            print(f"    📁 {s.get('title', '?')} ({len(subs)} subsections, {field_count} fields)")
        if structure.get("ai_validation"):
            av = structure["ai_validation"]
            success(f"AI Validation: valid={av.get('valid')}")
            if av.get("suggestions"):
                for sg in av["suggestions"][:3]:
                    print(f"    💡 {sg}")
    elif structure:
        fail("Structure generation failed:")
        show_json(structure)
    pause()

    # ── Step 2.8: Submit for Approval ──
    step("2.8", "Submit Car Loan Policy for Approval")
    template_id = state.get("template_id")
    if not template_id:
        info("No workflow template found. Skipping approval flow.")
        pause()
        return

    info(f"Submitting policy {policy_id} with template {template_id}")
    submit = api("POST", f"/api/workflow/submit/{policy_id}", token=state["mgr_token"], data={
        "template_id": template_id,
        "comments": "Ready for review - Car Loan Policy",
    })
    if submit:
        success("Policy submitted for approval!")
        show_json(submit)
        instance_id = submit.get("id")
        state["car_instance_id"] = instance_id
    pause()

    # ── Step 2.9: Check Approval Queue ──
    step("2.9", "View Approval Queue (as Admin)")
    queue = api("GET", "/api/workflow/queue", token=admin_token)
    if queue:
        items = queue.get("items", queue) if isinstance(queue, dict) else queue
        if isinstance(items, list):
            success(f"Approval queue has {len(items)} items:")
            for item in items:
                print(f"    📋 {item.get('policy_name', '?')} | Level {item.get('current_level')}/{item.get('total_levels')} | {item.get('status')}")
        else:
            show_json(queue)
    pause()

    # ── Step 2.10: AI Risk Summary ──
    step("2.10", "Get AI Risk Summary for Approval")
    info("API: GET /api/workflow/summary/<policy_id>")
    summary = api("GET", f"/api/workflow/summary/{policy_id}", token=admin_token)
    if summary:
        success("AI Risk Summary received:")
        show_json(summary)
    pause()

    # ── Step 2.11: Approve ──
    step("2.11", "Approve the Policy")
    instance_id = state.get("car_instance_id")
    if instance_id:
        info(f"Approving instance {instance_id}")
        approve = api("POST", f"/api/workflow/instances/{instance_id}/approve", token=admin_token, data={
            "comments": "Approved — risk acceptable",
        })
        if approve:
            success("Approval action completed!")
            show_json(approve)

            # Check if more levels needed
            status_resp = api("GET", f"/api/workflow/status/{policy_id}", token=admin_token)
            if status_resp:
                wf_status = status_resp.get("status", "unknown")
                current = status_resp.get("current_level", "?")
                total = status_resp.get("total_levels", "?")
                info(f"Workflow status: {wf_status} (level {current}/{total})")

                # Auto-approve remaining levels
                while wf_status == "pending_approval" or wf_status == "in_progress":
                    info("Approving next level...")
                    inst_id = status_resp.get("id", instance_id)
                    approve2 = api("POST", f"/api/workflow/instances/{inst_id}/approve", token=admin_token, data={
                        "comments": "Approved at next level",
                    })
                    if not approve2:
                        break
                    status_resp = api("GET", f"/api/workflow/status/{policy_id}", token=admin_token)
                    if not status_resp:
                        break
                    wf_status = status_resp.get("status", "done")
                    current = status_resp.get("current_level", "?")
                    info(f"Workflow status: {wf_status} (level {current}/{total})")

                success(f"Final workflow status: {wf_status}")
    pause()

    # ── Step 2.12: Generate Documents ──
    step("2.12", "Generate Documents (Word, PDF, JSON)")

    info("Generating Word document...")
    try:
        r = requests.post(f"{BASE}/api/documents/{policy_id}/word",
                          headers={"Authorization": f"Bearer {admin_token}"}, timeout=60)
        if r.status_code == 200:
            fname = f"Car_Loan_Policy.docx"
            with open(fname, "wb") as f:
                f.write(r.content)
            success(f"Word document saved: {fname} ({len(r.content)} bytes)")
        else:
            fail(f"Word generation failed: {r.status_code} — {r.text[:200]}")
    except Exception as e:
        fail(f"Word generation error: {e}")

    info("Generating PDF document...")
    try:
        r = requests.post(f"{BASE}/api/documents/{policy_id}/pdf",
                          headers={"Authorization": f"Bearer {admin_token}"}, timeout=60)
        if r.status_code == 200:
            fname = f"Car_Loan_Policy.pdf"
            with open(fname, "wb") as f:
                f.write(r.content)
            success(f"PDF document saved: {fname} ({len(r.content)} bytes)")
        else:
            fail(f"PDF generation failed: {r.status_code} — {r.text[:200]}")
    except Exception as e:
        fail(f"PDF generation error: {e}")

    info("Generating JSON export...")
    try:
        r = requests.post(f"{BASE}/api/documents/{policy_id}/json",
                          headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        if r.status_code == 200:
            fname = f"Car_Loan_Policy.json"
            with open(fname, "wb") as f:
                f.write(r.content)
            success(f"JSON export saved: {fname} ({len(r.content)} bytes)")
        else:
            fail(f"JSON export failed: {r.status_code} — {r.text[:200]}")
    except Exception as e:
        fail(f"JSON export error: {e}")

    pause()

    # ── Step 2.13: Runtime Query ──
    step("2.13", "Runtime Query — Test Applicant (Should REJECT)")
    query_data = {
        "user_query": "Can this applicant get a car loan?",
        "structured_inputs": {
            "age": 30,
            "cibil_score": 680,
            "annual_income": 500000,
            "loan_amount": 1500000,
            "tenure_years": 5
        }
    }
    info(f"Query: {query_data['user_query']}")
    info(f"Inputs: age=30, CIBIL=680, income=5L, amount=15L, tenure=5yr")
    result = api("POST", f"/api/query/policies/{policy_id}/query", token=admin_token, data=query_data)
    if result:
        success(f"Decision: {result.get('decision', '?')}")
        success(f"Confidence: {result.get('confidence', '?')}")
        if result.get("explanation"):
            print(f"    📝 {result['explanation'][:200]}")
        evals = result.get("rule_evaluations", [])
        if evals:
            success(f"Rule evaluations ({len(evals)}):")
            for ev in evals[:5]:
                icon = "✅" if ev.get("result") == "pass" else "❌"
                print(f"    {icon} {ev.get('field_name', '?')}: {ev.get('result', '?')} — {ev.get('detail', '')[:80]}")
        trace = result.get("reasoning_trace", [])
        if trace:
            success(f"Reasoning trace ({len(trace)} steps):")
            for t in trace[:5]:
                print(f"    Step {t.get('step')}: {t.get('action')} — {t.get('detail', '')[:80]}")
        if result.get("ai_analysis"):
            success("AI Analysis:")
            print(f"    {result['ai_analysis'][:300]}")
    pause()

    step("2.14", "Runtime Query — Test Applicant (Should APPROVE)")
    query_good = {
        "user_query": "Can this applicant get a car loan?",
        "structured_inputs": {
            "age": 35,
            "cibil_score": 780,
            "annual_income": 800000,
            "loan_amount": 2000000,
            "tenure_years": 5
        }
    }
    info(f"Inputs: age=35, CIBIL=780, income=8L, amount=20L, tenure=5yr")
    result2 = api("POST", f"/api/query/policies/{policy_id}/query", token=admin_token, data=query_good)
    if result2:
        success(f"Decision: {result2.get('decision', '?')}")
        if result2.get("ai_analysis"):
            print(f"    {result2['ai_analysis'][:300]}")
    pause()


# ═══════════════════════════════════════════════════════════════════
#  PART 3 — EDUCATION LOAN FLOW
# ═══════════════════════════════════════════════════════════════════

def part3():
    banner("PART 3 — EDUCATION LOAN POLICY FLOW")
    admin_token = state.get("admin_token")
    mgr_token = state.get("mgr_token", admin_token)

    if not admin_token:
        fail("No admin token. Run Part 2 first.")
        return

    step("3.1", "Create Education Loan Policy")
    policy = api("POST", "/api/policies", token=mgr_token, data={
        "name": "Education Loan Policy 2026",
        "description": "Domestic student education loan underwriting policy",
    }, expect=201)
    if policy:
        edu_id = policy["id"]
        state["edu_policy_id"] = edu_id
        success(f"Policy created: {edu_id}")
    pause()

    step("3.2", "Generate AI Structure for Education Loan")
    prompt = (
        "Create education loan policy for domestic students with: "
        "Co-applicant mandatory, max loan amount 20 lakh, "
        "moratorium period allowed up to 1 year after course completion, "
        "minimum CIBIL score 650, eligible courses include engineering, medicine, MBA. "
        "Include sections for student eligibility, co-applicant requirements, "
        "loan parameters, repayment terms, and documentation requirements."
    )
    info(f"Prompt: \"{prompt[:80]}...\"")
    info("Waiting for AI...")

    edu_id = state.get("edu_policy_id")
    if edu_id:
        structure = api("POST", f"/api/policies/{edu_id}/structure/ai", token=mgr_token, data={"prompt": prompt})
        if structure and "document_structure" in structure:
            sections = structure["document_structure"].get("sections", [])
            success(f"AI generated {len(sections)} sections:")
            for s in sections:
                print(f"    📁 {s.get('title', '?')}")
    pause()

    step("3.3", "Submit & Approve Education Loan Policy")
    template_id = state.get("template_id")
    if edu_id and template_id:
        submit = api("POST", f"/api/workflow/submit/{edu_id}", token=mgr_token, data={
            "template_id": template_id, "comments": "Education loan ready",
        })
        if submit:
            inst_id = submit.get("id")
            success(f"Submitted. Instance: {inst_id}")

            # Approve all levels
            for i in range(5):  # max 5 levels
                approve = api("POST", f"/api/workflow/instances/{inst_id}/approve", token=admin_token, data={
                    "comments": f"Approved level {i+1}",
                })
                if not approve:
                    break
                st = api("GET", f"/api/workflow/status/{edu_id}", token=admin_token)
                if st and st.get("status") == "approved":
                    success("Policy APPROVED!")
                    break
                if st:
                    inst_id = st.get("id", inst_id)
    pause()

    step("3.4", "Runtime Query — Education Loan")
    if edu_id:
        result = api("POST", f"/api/query/policies/{edu_id}/query", token=admin_token, data={
            "user_query": "Is this student eligible for an education loan?",
            "structured_inputs": {
                "age": 22, "cibil_score": 720, "course": "engineering",
                "loan_amount": 1500000, "has_co_applicant": True,
            },
        })
        if result:
            success(f"Decision: {result.get('decision', '?')}")
            if result.get("ai_analysis"):
                print(f"    {result['ai_analysis'][:300]}")
    pause()


# ═══════════════════════════════════════════════════════════════════
#  PART 4 — STRICT AI MODE VALIDATION
# ═══════════════════════════════════════════════════════════════════

def part4():
    banner("PART 4 — STRICT AI MODE TESTS")
    admin_token = state.get("admin_token")

    step("4.1", "Test Document Generation on Draft Policy (Should FAIL)")
    info("Creating a draft policy and trying to generate a document...")
    draft = api("POST", "/api/policies", token=admin_token, data={
        "name": "Test Draft Policy", "description": "Should not allow doc gen",
    }, expect=201)
    if draft:
        draft_id = draft["id"]
        info(f"Draft policy: {draft_id}")
        r = requests.post(f"{BASE}/api/documents/{draft_id}/word",
                          headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        if r.status_code == 403:
            success(f"BLOCKED! Status {r.status_code} — Document gen requires approval ✅")
        else:
            fail(f"Got {r.status_code} — Expected 403")

    step("4.2", "Verify AI Audit Logs Exist")
    info("Checking GET / for AI provider info...")
    data = api("GET", "/")
    if data:
        success(f"Provider: {data.get('ai_provider')} | Model: {data.get('ai_model')}")
    info("Check MongoDB for audit logs: db.llm_audit_log.find().sort({timestamp:-1}).limit(5)")
    pause()


# ═══════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════

def main():
    banner("BaikalSphere Policy Engine — QA Test Runner")
    print(f"""
  This script will test the ENTIRE policy lifecycle:
  
  Part 1: System Startup Check
  Part 2: Car Loan Policy Full Flow
  Part 3: Education Loan Policy Full Flow
  Part 4: Strict AI Mode Validation

  Prerequisites:
  • Backend running: python -m uvicorn app.main:app --reload --port 8000
  • Frontend running: npm run dev (in frontend folder)
  • PostgreSQL & MongoDB running
  • Ollama running with qwen2.5:7b-instruct-q4_K_M
    """)

    pause("Press ENTER to start testing...")

    try:
        part1()
        part2()
        part3()
        part4()
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Test run interrupted.{RESET}")
        return

    banner("ALL TESTS COMPLETE")
    print(f"""
  {GREEN}Summary of IDs (for database verification):{RESET}
  • Admin Token:     {state.get('admin_token', 'N/A')[:30]}...
  • Template ID:     {state.get('template_id', 'N/A')}
  • Car Policy ID:   {state.get('car_policy_id', 'N/A')}
  • Edu Policy ID:   {state.get('edu_policy_id', 'N/A')}
  
  {CYAN}Database verification queries:{RESET}
  PostgreSQL: SELECT id, name, status FROM policy_metadata;
  MongoDB:    db.policy_documents.find({{}}, {{policy_id:1}})
  Audit:      db.llm_audit_log.countDocuments()
    """)


if __name__ == "__main__":
    main()
