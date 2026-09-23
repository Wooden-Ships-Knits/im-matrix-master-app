"""Reports: prepared by the operator, decided by whoever signs off.

draft -> submitted -> approved | rejected, and a rejected one goes back to
draft so it can be fixed and sent again.
"""
from fastapi import APIRouter, Body, HTTPException, Query

from .. import repo

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("")
def list_reports(status: str | None = Query(None)):
    return repo.list_reports(status=status)


@router.post("", status_code=201)
def create_report(payload: dict = Body(...)):
    if not (payload.get("title") or "").strip():
        raise HTTPException(status_code=400, detail="A title is required")
    return repo.save_report(payload)


@router.put("/{report_id}")
def update_report(report_id: int, payload: dict = Body(...)):
    try:
        return repo.save_report(payload, report_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{report_id}/status")
def set_status(report_id: int, payload: dict = Body(...)):
    try:
        return repo.set_report_status(
            report_id,
            payload.get("status"),
            by=payload.get("by"),
            note=payload.get("note"),
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{report_id}", status_code=204)
def delete_report(report_id: int):
    repo.delete_report(report_id)
