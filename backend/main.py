import io
import os
import csv
from pathlib import Path
from typing import Optional, List

from fastapi import FastAPI, Depends, HTTPException, Header, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend import db
from backend import importer as imp

STATIC_TOKEN = "kolossus-static-token"
DATA_FILE = os.environ.get("DATA_FILE", "/app/data/Gandhidham I-4.0.xlsx")

app = FastAPI(title="Kolossus AI Marketing API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def verify_token(authorization: str = Header(...)):
    if authorization != f"Bearer {STATIC_TOKEN}":
        raise HTTPException(status_code=401, detail="Invalid token")
    return True


@app.on_event("startup")
async def startup():
    try:
        db._ensure_db_exists()
        db.init_schema()
        count = db.count_users()
        if count == 0 and Path(DATA_FILE).exists():
            imp.import_excel(DATA_FILE, source_file=Path(DATA_FILE).name)
        # Run multi-file importer (upsert-safe, skips already-imported files)
        try:
            import importlib.util, sys as _sys
            spec = importlib.util.spec_from_file_location(
                "multi_importer", "/app/multi_importer.py"
            )
            mi = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mi)
            mi.main()
            print("Multi-file import completed.")
        except Exception as me:
            print(f"Multi-file import error (non-fatal): {me}")
    except Exception as e:
        print(f"Startup DB init skipped (will retry on first request): {e}")


class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/login")
def login(req: LoginRequest):
    app_user = os.environ.get("APP_USER", "admin")
    app_pass = os.environ.get("APP_PASSWORD", "")
    if req.username == app_user and req.password == app_pass and app_pass:
        return {"token": STATIC_TOKEN}
    raise HTTPException(status_code=401, detail="Invalid credentials")


@app.get("/api/health")
def health():
    return {"status": "ok"}


def _serialize(obj):
    """Convert non-JSON-serializable objects."""
    import datetime
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()
    return obj


def _serialize_dict(d: dict) -> dict:
    import datetime
    result = {}
    for k, v in d.items():
        if isinstance(v, (datetime.datetime, datetime.date)):
            result[k] = v.isoformat()
        else:
            result[k] = v
    return result


@app.get("/api/stats")
def get_stats(auth=Depends(verify_token)):
    kpis = db.get_kpis()
    status_counts = db.get_status_counts()
    filter_options = db.get_filter_options()
    chart_data = db.get_chart_data()
    return {"kpis": kpis, "status_counts": status_counts, "filter_options": filter_options, "chart_data": chart_data}


@app.get("/api/contacts")
def get_contacts(
    statuses: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    next_followup_filter: Optional[str] = Query(None),
    last_followup_from: Optional[str] = Query(None),
    last_followup_to: Optional[str] = Query(None),
    company_types: Optional[str] = Query(None),
    sectors: Optional[str] = Query(None),
    msme_types: Optional[str] = Query(None),
    cities: Optional[str] = Query(None),
    designations: Optional[str] = Query(None),
    assigned_tos: Optional[str] = Query(None),
    priorities: Optional[str] = Query(None),
    interest_levels: Optional[str] = Query(None),
    last_channels: Optional[str] = Query(None),
    id_search: Optional[str] = Query(None),
    last_followup_filter: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("id"),
    sort_dir: Optional[str] = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    auth=Depends(verify_token),
):
    def split(v):
        return [x for x in v.split(",") if x] if v else None

    result = db.get_users(
        statuses=split(statuses),
        search=search,
        next_followup_filter=next_followup_filter,
        last_followup_from=last_followup_from,
        last_followup_to=last_followup_to,
        company_types=split(company_types),
        sectors=split(sectors),
        msme_types=split(msme_types),
        cities=split(cities),
        designations=split(designations),
        assigned_tos=split(assigned_tos),
        priorities=split(priorities),
        interest_levels=split(interest_levels),
        last_channels=split(last_channels),
        id_search=id_search,
        last_followup_filter=last_followup_filter,
        sort_by=sort_by or "id",
        sort_dir=sort_dir or "desc",
        page=page,
        page_size=page_size,
    )
    return {
        "items": [_serialize_dict(r) for r in result["items"]],
        "total": result["total"],
        "page": result["page"],
        "page_size": result["page_size"],
    }


@app.get("/api/contacts/{contact_id}")
def get_contact(contact_id: int, auth=Depends(verify_token)):
    row = db.get_user(contact_id)
    if not row:
        raise HTTPException(status_code=404, detail="Contact not found")
    return _serialize_dict(row)


@app.put("/api/contacts/{contact_id}")
def update_contact(contact_id: int, body: dict, auth=Depends(verify_token)):
    db.update_user(contact_id, **body)
    row = db.get_user(contact_id)
    if not row:
        raise HTTPException(status_code=404, detail="Contact not found")
    return _serialize_dict(row)


@app.get("/api/contacts/{contact_id}/followups")
def get_followups(contact_id: int, auth=Depends(verify_token)):
    rows = db.get_followups(contact_id)
    return [_serialize_dict(r) for r in rows]


@app.post("/api/contacts/{contact_id}/followups")
def add_followup(contact_id: int, body: dict, auth=Depends(verify_token)):
    db.insert_followup(
        user_id=contact_id,
        followup_at=body.get("followup_at"),
        channel=body.get("channel"),
        direction=body.get("direction", "Outbound"),
        call_result=body.get("call_result"),
        duration_min=body.get("duration_min"),
        contacted_by=body.get("contacted_by"),
        spoke_with=body.get("spoke_with"),
        customer_said=body.get("customer_said"),
        our_notes=body.get("our_notes"),
        status_before=body.get("status_before"),
        status_after=body.get("status_after"),
        next_action=body.get("next_action"),
        next_followup_at=body.get("next_followup_at"),
    )
    rows = db.get_followups(contact_id)
    return [_serialize_dict(r) for r in rows]


@app.put("/api/followups/{followup_id}")
def update_followup(followup_id: int, body: dict, auth=Depends(verify_token)):
    db.update_followup(followup_id, **body)
    return {"ok": True}


@app.delete("/api/followups/{followup_id}")
def delete_followup(followup_id: int, auth=Depends(verify_token)):
    db.delete_followup(followup_id)
    return {"ok": True}


@app.get("/api/export-csv")
def export_csv(
    statuses: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    next_followup_filter: Optional[str] = Query(None),
    last_followup_from: Optional[str] = Query(None),
    last_followup_to: Optional[str] = Query(None),
    company_types: Optional[str] = Query(None),
    sectors: Optional[str] = Query(None),
    msme_types: Optional[str] = Query(None),
    cities: Optional[str] = Query(None),
    designations: Optional[str] = Query(None),
    assigned_tos: Optional[str] = Query(None),
    priorities: Optional[str] = Query(None),
    interest_levels: Optional[str] = Query(None),
    last_channels: Optional[str] = Query(None),
    auth=Depends(verify_token),
):
    def split(v):
        return [x for x in v.split(",") if x] if v else None

    rows = db.get_users(
        statuses=split(statuses),
        search=search,
        next_followup_filter=next_followup_filter,
        last_followup_from=last_followup_from,
        last_followup_to=last_followup_to,
        company_types=split(company_types),
        sectors=split(sectors),
        msme_types=split(msme_types),
        cities=split(cities),
        designations=split(designations),
        assigned_tos=split(assigned_tos),
        priorities=split(priorities),
        interest_levels=split(interest_levels),
        last_channels=split(last_channels),
    )
    serialized = [_serialize_dict(r) for r in rows]

    output = io.StringIO()
    if serialized:
        writer = csv.DictWriter(output, fieldnames=serialized[0].keys())
        writer.writeheader()
        writer.writerows(serialized)
    else:
        output.write("")

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=contacts.csv"},
    )


@app.post("/api/import")
async def import_file(file: UploadFile = File(...), auth=Depends(verify_token)):
    contents = await file.read()
    buf = io.BytesIO(contents)
    result = imp.import_excel(buf, source_file=file.filename)
    return result


# Serve React SPA static assets (JS/CSS/images) and root-level files
frontend_dist = Path("/app/frontend/dist")
if frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    # Catch-all: return index.html for every non-API path so React Router can
    # handle client-side navigation on direct URL loads (e.g. /contacts/123).
    # Registered AFTER all /api/* routes so API endpoints are matched first.
    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        index = frontend_dist / "index.html"
        return FileResponse(str(index))
