from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from app.config import Settings
from app.db import get_conn
from app.models import TreeAccess, User
from app.services.email_service import EmailDeliveryError, EmailService

logger = logging.getLogger("knowledgetree.trees")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _validate_document(document: dict) -> dict:
    if not isinstance(document, dict):
        raise ValueError("Tree document must be an object.")
    name = document.get("name")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 80:
        raise ValueError("Tree name must be 1–80 characters.")
    if "root" not in document or "topics" not in document:
        raise ValueError("Tree document must include root and topics.")
    if not isinstance(document.get("topics"), list):
        raise ValueError("Tree topics must be an array.")
    encoded = json.dumps(document)
    if len(encoded.encode("utf-8")) > 1_048_576:
        raise ValueError("Tree document must be smaller than 1 MB.")
    return document


class TreesService:
    def __init__(self, settings: Settings):
        self.settings = settings

    def list_accessible(self, user: User) -> list[TreeAccess]:
        with get_conn(self.settings) as conn:
            rows = conn.execute(
                """
                SELECT t.id, t.owner_id, t.name, t.document, t.version, t.updated_at,
                       u.email AS owner_email,
                       CASE
                         WHEN t.owner_id = %s THEN 'owner'
                         ELSE ts.permission
                       END AS role
                FROM trees t
                JOIN users u ON u.id = t.owner_id
                LEFT JOIN tree_shares ts ON ts.tree_id = t.id AND ts.user_id = %s
                WHERE t.owner_id = %s OR ts.user_id IS NOT NULL
                ORDER BY t.updated_at DESC
                """,
                (user.id, user.id, user.id),
            ).fetchall()
        return [self._to_access(row) for row in rows]

    def get_tree(self, user: User, tree_id: str) -> TreeAccess:
        access = self._get_access(user, tree_id)
        if not access:
            raise PermissionError("Tree not found or access denied.")
        return access

    def create_tree(self, user: User, *, name: str, document: dict) -> TreeAccess:
        document = _validate_document(document)
        name = name.strip() or document["name"].strip()
        document = {**document, "name": name}
        now = _utc_now()
        with get_conn(self.settings) as conn:
            row = conn.execute(
                """
                INSERT INTO trees (owner_id, name, document, version, updated_at)
                VALUES (%s, %s, %s::jsonb, 1, %s)
                RETURNING id, owner_id, name, document, version, updated_at
                """,
                (user.id, name, json.dumps(document), now),
            ).fetchone()
            conn.commit()
        return TreeAccess(
            id=str(row["id"]),
            owner_id=str(row["owner_id"]),
            name=row["name"],
            document=row["document"],
            version=row["version"],
            role="owner",
            updated_at=row["updated_at"].isoformat(),
            owner_email=user.email,
        )

    def update_tree(
        self,
        user: User,
        tree_id: str,
        *,
        name: str | None,
        document: dict,
        expected_version: int | None,
        force: bool = False,
    ) -> TreeAccess | dict:
        access = self._get_access(user, tree_id)
        if not access:
            raise PermissionError("Tree not found or access denied.")
        if access.role == "view":
            raise PermissionError("This tree is read-only for you.")

        document = _validate_document(document)
        if name and name.strip():
            document = {**document, "name": name.strip()}

        now = _utc_now()
        with get_conn(self.settings) as conn:
            current = conn.execute(
                "SELECT version, updated_at FROM trees WHERE id = %s",
                (tree_id,),
            ).fetchone()
            if not current:
                raise PermissionError("Tree not found.")

            if expected_version is not None and current["version"] != expected_version and not force:
                server = conn.execute(
                    """
                    SELECT t.id, t.owner_id, t.name, t.document, t.version, t.updated_at,
                           u.email AS owner_email
                    FROM trees t
                    JOIN users u ON u.id = t.owner_id
                    WHERE t.id = %s
                    """,
                    (tree_id,),
                ).fetchone()
                return {
                    "conflict": True,
                    "server": self._to_access({**server, "role": access.role}),
                }

            row = conn.execute(
                """
                UPDATE trees
                SET name = %s,
                    document = %s::jsonb,
                    version = version + 1,
                    updated_at = %s
                WHERE id = %s
                RETURNING id, owner_id, name, document, version, updated_at
                """,
                (document["name"], json.dumps(document), now, tree_id),
            ).fetchone()
            conn.commit()

        return TreeAccess(
            id=str(row["id"]),
            owner_id=str(row["owner_id"]),
            name=row["name"],
            document=row["document"],
            version=row["version"],
            role=access.role,
            updated_at=row["updated_at"].isoformat(),
            owner_email=access.owner_email,
        )

    def delete_tree(self, user: User, tree_id: str) -> None:
        access = self._get_access(user, tree_id)
        if not access or access.role != "owner":
            raise PermissionError("Only the owner can delete this tree.")
        with get_conn(self.settings) as conn:
            conn.execute("DELETE FROM trees WHERE id = %s AND owner_id = %s", (tree_id, user.id))
            conn.commit()

    def sync(
        self,
        user: User,
        *,
        trees: list[dict],
        force: bool = False,
    ) -> dict:
        uploaded: list[dict] = []
        conflicts: list[dict] = []

        for item in trees:
            cloud_id = (item.get("cloudId") or item.get("cloud_id") or "").strip() or None
            local_id = item.get("localId") or item.get("local_id")
            document = item.get("document") or {}
            name = (item.get("name") or document.get("name") or "").strip()
            expected_version = item.get("version")

            if not cloud_id:
                created = self.create_tree(user, name=name, document=document)
                uploaded.append(
                    {
                        "localId": local_id,
                        "cloudId": created.id,
                        "name": created.name,
                        "document": created.document,
                        "version": created.version,
                        "role": created.role,
                        "updatedAt": created.updated_at,
                    }
                )
                continue

            result = self.update_tree(
                user,
                cloud_id,
                name=name or None,
                document=document,
                expected_version=expected_version,
                force=force,
            )
            if isinstance(result, dict) and result.get("conflict"):
                server = result["server"]
                conflicts.append(
                    {
                        "localId": local_id,
                        "cloudId": cloud_id,
                        "serverVersion": server.version,
                        "serverDocument": server.document,
                        "serverUpdatedAt": server.updated_at,
                    }
                )
                continue

            uploaded.append(
                {
                    "localId": local_id,
                    "cloudId": result.id,
                    "name": result.name,
                    "document": result.document,
                    "version": result.version,
                    "role": result.role,
                    "updatedAt": result.updated_at,
                }
            )

        remote = self.list_accessible(user)
        return {
            "uploaded": uploaded,
            "conflicts": conflicts,
            "remote": [self._serialize_access(t) for t in remote],
        }

    def list_shares(self, user: User, tree_id: str) -> list[dict]:
        access = self._get_access(user, tree_id)
        if not access or access.role != "owner":
            raise PermissionError("Only the owner can view shares.")
        with get_conn(self.settings) as conn:
            rows = conn.execute(
                """
                SELECT u.email, ts.permission, ts.created_at
                FROM tree_shares ts
                JOIN users u ON u.id = ts.user_id
                WHERE ts.tree_id = %s
                ORDER BY ts.created_at ASC
                """,
                (tree_id,),
            ).fetchall()
        return [
            {
                "email": row["email"],
                "permission": row["permission"],
                "createdAt": row["created_at"].isoformat(),
            }
            for row in rows
        ]

    def add_share(
        self,
        user: User,
        tree_id: str,
        *,
        email: str,
        permission: str,
        app_url: str | None = None,
    ) -> dict:
        access = self._get_access(user, tree_id)
        if not access or access.role != "owner":
            raise PermissionError("Only the owner can share this tree.")
        if permission not in {"view", "edit"}:
            raise ValueError("Permission must be view or edit.")

        normalized = _normalize_email(email)
        if normalized == user.email.lower():
            raise ValueError("You already own this tree.")

        tree_name = access.name

        with get_conn(self.settings) as conn:
            grantee = conn.execute(
                "SELECT id, email FROM users WHERE LOWER(email) = LOWER(%s)",
                (normalized,),
            ).fetchone()
            if not grantee:
                grantee = conn.execute(
                    """
                    INSERT INTO users (email) VALUES (%s)
                    RETURNING id, email
                    """,
                    (normalized,),
                ).fetchone()

            conn.execute(
                """
                INSERT INTO tree_shares (tree_id, user_id, permission)
                VALUES (%s, %s, %s)
                ON CONFLICT (tree_id, user_id)
                DO UPDATE SET permission = EXCLUDED.permission
                """,
                (tree_id, grantee["id"], permission),
            )
            conn.commit()

        result: dict = {
            "email": grantee["email"],
            "permission": permission,
            "emailSent": False,
        }
        mailer = EmailService(self.settings)
        if mailer.configured:
            try:
                mailer.send_share_invite(
                    to_email=grantee["email"],
                    owner_email=user.email,
                    tree_name=tree_name,
                    permission=permission,
                    app_url=app_url,
                )
                result["emailSent"] = True
            except EmailDeliveryError as exc:
                logger.warning("share_invite_email_failed tree=%s to=%s", tree_id, grantee["email"])
                result["emailWarning"] = str(exc)
        else:
            result["emailWarning"] = "Email is not configured on this server."

        return result

    def remove_share(self, user: User, tree_id: str, *, email: str) -> None:
        access = self._get_access(user, tree_id)
        if not access or access.role != "owner":
            raise PermissionError("Only the owner can manage shares.")
        normalized = _normalize_email(email)
        with get_conn(self.settings) as conn:
            conn.execute(
                """
                DELETE FROM tree_shares ts
                USING users u
                WHERE ts.tree_id = %s
                  AND ts.user_id = u.id
                  AND LOWER(u.email) = LOWER(%s)
                """,
                (tree_id, normalized),
            )
            conn.commit()

    def _get_access(self, user: User, tree_id: str) -> TreeAccess | None:
        with get_conn(self.settings) as conn:
            row = conn.execute(
                """
                SELECT t.id, t.owner_id, t.name, t.document, t.version, t.updated_at,
                       u.email AS owner_email,
                       CASE
                         WHEN t.owner_id = %s THEN 'owner'
                         ELSE ts.permission
                       END AS role
                FROM trees t
                JOIN users u ON u.id = t.owner_id
                LEFT JOIN tree_shares ts ON ts.tree_id = t.id AND ts.user_id = %s
                WHERE t.id = %s AND (t.owner_id = %s OR ts.user_id IS NOT NULL)
                """,
                (user.id, user.id, tree_id, user.id),
            ).fetchone()
        return self._to_access(row) if row else None

    def _to_access(self, row: dict) -> TreeAccess:
        return TreeAccess(
            id=str(row["id"]),
            owner_id=str(row["owner_id"]),
            name=row["name"],
            document=row["document"],
            version=row["version"],
            role=row["role"],
            updated_at=row["updated_at"].isoformat(),
            owner_email=row.get("owner_email"),
        )

    def _serialize_access(self, access: TreeAccess) -> dict:
        return {
            "cloudId": access.id,
            "name": access.name,
            "document": access.document,
            "version": access.version,
            "role": access.role,
            "updatedAt": access.updated_at,
            "ownerEmail": access.owner_email,
        }
