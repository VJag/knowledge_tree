from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.deps import get_settings, require_user
from app.models import User
from app.services.trees_service import TreesService

router = APIRouter(prefix="/api/trees", tags=["trees"])


class ShareBody(BaseModel):
    email: str
    permission: str = Field(pattern="^(view|edit)$")


class SyncTreeItem(BaseModel):
    localId: Optional[str] = None
    cloudId: Optional[str] = None
    name: Optional[str] = None
    document: dict
    version: Optional[int] = None


class SyncBody(BaseModel):
    trees: list[SyncTreeItem] = Field(default_factory=list)
    force: bool = False


@router.post("/sync")
def sync_trees(body: SyncBody, request: Request, user: User = Depends(require_user)):
    service = TreesService(get_settings(request))
    payload = [item.model_dump() for item in body.trees]
    app_url = str(request.base_url).rstrip("/")
    try:
        result = service.sync(user, trees=payload, force=body.force, app_url=app_url)
    except PermissionError as exc:
        return JSONResponse({"error": str(exc)}, status_code=403)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    return {"ok": True, **result}


@router.get("")
def list_trees(request: Request, user: User = Depends(require_user)):
    service = TreesService(get_settings(request))
    trees = service.list_accessible(user)
    return {"trees": [service._serialize_access(t) for t in trees]}


@router.get("/{tree_id}")
def get_tree(tree_id: str, request: Request, user: User = Depends(require_user)):
    service = TreesService(get_settings(request))
    try:
        tree = service.get_tree(user, tree_id)
    except PermissionError as exc:
        return JSONResponse({"error": str(exc)}, status_code=404)
    return {"tree": service._serialize_access(tree)}


@router.delete("/{tree_id}")
def delete_tree(tree_id: str, request: Request, user: User = Depends(require_user)):
    service = TreesService(get_settings(request))
    try:
        service.delete_tree(user, tree_id)
    except PermissionError as exc:
        return JSONResponse({"error": str(exc)}, status_code=403)
    return {"ok": True}


@router.get("/{tree_id}/shares")
def list_shares(tree_id: str, request: Request, user: User = Depends(require_user)):
    service = TreesService(get_settings(request))
    try:
        shares = service.list_shares(user, tree_id)
    except PermissionError as exc:
        return JSONResponse({"error": str(exc)}, status_code=403)
    return {"shares": shares}


@router.post("/{tree_id}/shares")
def add_share(
    tree_id: str,
    body: ShareBody,
    request: Request,
    user: User = Depends(require_user),
):
    service = TreesService(get_settings(request))
    app_url = str(request.base_url).rstrip("/")
    try:
        share = service.add_share(
            user,
            tree_id,
            email=body.email,
            permission=body.permission,
            app_url=app_url,
        )
    except PermissionError as exc:
        return JSONResponse({"error": str(exc)}, status_code=403)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    return {"ok": True, **share}


@router.delete("/{tree_id}/shares")
def remove_share(
    tree_id: str,
    email: str,
    request: Request,
    user: User = Depends(require_user),
):
    service = TreesService(get_settings(request))
    try:
        app_url = str(request.base_url).rstrip("/")
        service.remove_share(user, tree_id, email=email, app_url=app_url)
    except PermissionError as exc:
        return JSONResponse({"error": str(exc)}, status_code=403)
    return {"ok": True}
