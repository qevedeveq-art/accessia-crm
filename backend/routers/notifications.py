"""
Router notifications & alertes — /api/notifications, /api/alerts
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import Notification
from helpers import _now, _serialize_notification, _collect_alerts, _sync_notifications

router = APIRouter()


# ═══════════════════════════════════════════════════════════════
# ALERTES
# ═══════════════════════════════════════════════════════════════

@router.get("/api/alerts")
def get_alerts(db: Session = Depends(get_db)):
    return _collect_alerts(db)


# ═══════════════════════════════════════════════════════════════
# NOTIFICATIONS
# ═══════════════════════════════════════════════════════════════

@router.get("/api/notifications")
def list_notifications(
    unread_only: bool = False,
    severity: Optional[str] = Query(None, pattern="^(critical|warning|info)$"),
    type: Optional[str] = Query(None, max_length=50),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    _sync_notifications(db)
    q = db.query(Notification)
    if unread_only:
        q = q.filter(Notification.is_read == False)
    if severity:
        q = q.filter(Notification.severity == severity)
    if type:
        q = q.filter(Notification.type == type)
    notifications = q.order_by(Notification.created_at.desc()).limit(limit).all()
    return [_serialize_notification(n) for n in notifications]


@router.get("/api/notifications/summary")
def notifications_summary(db: Session = Depends(get_db)):
    _sync_notifications(db)
    notifications = db.query(Notification).all()
    unread = [n for n in notifications if not n.is_read]
    return {
        "total": len(notifications),
        "unread": len(unread),
        "critical": len([n for n in unread if n.severity == "critical"]),
        "warning": len([n for n in unread if n.severity == "warning"]),
        "info": len([n for n in unread if n.severity == "info"]),
    }


@router.post("/api/notifications/check")
def check_notifications(db: Session = Depends(get_db)):
    created = _sync_notifications(db)
    return {"count": created}


@router.patch("/api/notifications/mark-all-read")
def mark_all_notifications_read(db: Session = Depends(get_db)):
    unread = db.query(Notification).filter(Notification.is_read == False).all()
    now = _now()
    for notification in unread:
        notification.is_read = True
        notification.read_at = now
    db.commit()
    return {"count": len(unread)}


@router.patch("/api/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int, db: Session = Depends(get_db)):
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(404, "Notification introuvable")
    notification.is_read = True
    notification.read_at = _now()
    db.commit()
    return {"id": notification.id}


@router.delete("/api/notifications/{notification_id}")
def delete_notification(notification_id: int, db: Session = Depends(get_db)):
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(404, "Notification introuvable")
    db.delete(notification)
    db.commit()
    return {"message": "Notification supprimée"}
