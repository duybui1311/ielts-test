"""Flashcard decks, cards and reviews — owner-scoped via the `X-User-Id` header."""
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.service.database import get_db
from backend.service import models

router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])


def _user_id(x_user_id: Optional[str]) -> Optional[int]:
    try:
        return int(x_user_id) if x_user_id else None
    except (TypeError, ValueError):
        return None


def _require_uid(x_user_id: Optional[str]) -> int:
    uid = _user_id(x_user_id)
    if not uid:
        raise HTTPException(401, "Sign in required.")
    return uid


class DeckIn(BaseModel):
    name: str


class CardIn(BaseModel):
    front: str
    back: str


class ReviewIn(BaseModel):
    card_id: int
    rating: int  # 1 = again ... 4 = easy


@router.get("/decks")
def list_decks(
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    uid = _user_id(x_user_id)
    if not uid:
        return []
    counts = dict(
        db.query(models.Flashcard.deck_id, func.count(models.Flashcard.id))
        .group_by(models.Flashcard.deck_id)
        .all()
    )
    decks = (
        db.query(models.FlashcardDeck)
        .filter(models.FlashcardDeck.owner_id == uid)
        .order_by(models.FlashcardDeck.created_at.desc())
        .all()
    )
    return [
        {"id": d.id, "name": d.name, "card_count": int(counts.get(d.id, 0))}
        for d in decks
    ]


@router.get("/cards")
def list_cards(
    deck_id: int,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    uid = _require_uid(x_user_id)
    deck = (
        db.query(models.FlashcardDeck)
        .filter(models.FlashcardDeck.id == deck_id, models.FlashcardDeck.owner_id == uid)
        .first()
    )
    if not deck:
        raise HTTPException(404, "Deck not found")
    cards = (
        db.query(models.Flashcard)
        .filter(models.Flashcard.deck_id == deck_id)
        .order_by(models.Flashcard.created_at.asc())
        .all()
    )
    return [{"id": c.id, "front": c.front, "back": c.back} for c in cards]


@router.post("/decks")
def create_deck(
    payload: DeckIn,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    uid = _require_uid(x_user_id)
    deck = models.FlashcardDeck(owner_id=uid, name=payload.name.strip() or "Untitled deck")
    db.add(deck)
    db.commit()
    return {"id": deck.id, "name": deck.name, "card_count": 0}


@router.post("/decks/{deck_id}/cards")
def add_card(
    deck_id: int,
    payload: CardIn,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    uid = _require_uid(x_user_id)
    deck = (
        db.query(models.FlashcardDeck)
        .filter(models.FlashcardDeck.id == deck_id, models.FlashcardDeck.owner_id == uid)
        .first()
    )
    if not deck:
        raise HTTPException(404, "Deck not found")
    card = models.Flashcard(deck_id=deck_id, front=payload.front, back=payload.back)
    db.add(card)
    db.commit()
    return {"id": card.id, "front": card.front, "back": card.back}


@router.post("/review")
def review_card(
    payload: ReviewIn,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    uid = _require_uid(x_user_id)
    card = db.query(models.Flashcard).filter(models.Flashcard.id == payload.card_id).first()
    if not card:
        raise HTTPException(404, "Card not found")
    db.add(models.FlashcardReview(card_id=payload.card_id, user_id=uid, rating=payload.rating))
    db.commit()
    return {"ok": True}
