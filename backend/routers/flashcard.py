# from fastapi import APIRouter, Depends, HTTPException, Query
# from sqlalchemy.orm import Session
# from sqlalchemy import func
# from typing import Optional, List
# from datetime import datetime
#
# from backend.service.database import get_db
# from backend.service import models
# from backend.service.schemas import (
#     DeckCreateIn, DeckOut,
#     CardCreateIn, CardOut,
#     ReviewCreateIn, ReviewOut,
#     OkOut, PageOut, PageMeta
# )
#
# router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])
#
#
# # =========================================================
# # CREATE DECK
# # =========================================================
# @router.post("/decks", response_model=DeckOut)
# def create_deck(
#     payload: DeckCreateIn,
#     user_id: int = 1,   # replace later with auth user
#     db: Session = Depends(get_db)
# ):
#     deck = models.FlashcardDeck(
#         name=payload.title,
#         owner_id=user_id,
#     )
#
#     db.add(deck)
#     db.commit()
#     db.refresh(deck)
#
#     return DeckOut(
#         id=deck.id,
#         title=deck.name,
#         owner_id=deck.owner_id,
#         visibility=payload.visibility,
#         created_at=deck.created_at,
#     )
#
#
# # =========================================================
# # LIST DECKS (PAGINATED)
# # =========================================================
# @router.get("/decks", response_model=PageOut)
# def list_decks(
#     page: int = 1,
#     size: int = 20,
#     db: Session = Depends(get_db)
# ):
#     query = db.query(models.FlashcardDeck)
#
#     total = query.count()
#
#     decks = (
#         query
#         .offset((page - 1) * size)
#         .limit(size)
#         .all()
#     )
#
#     items = [
#         DeckOut(
#             id=d.id,
#             title=d.name,
#             owner_id=d.owner_id,
#             visibility="private",
#             created_at=d.created_at,
#         ).dict()
#         for d in decks
#     ]
#
#     return PageOut(
#         meta=PageMeta(page=page, size=size, total=total),
#         items=items
#     )
#
#
# # =========================================================
# # CREATE CARD
# # =========================================================
# @router.post("/cards", response_model=CardOut)
# def create_card(
#     payload: CardCreateIn,
#     db: Session = Depends(get_db)
# ):
#     deck = db.query(models.FlashcardDeck).filter(
#         models.FlashcardDeck.id == payload.deck_id
#     ).first()
#
#     if not deck:
#         raise HTTPException(404, "Deck not found")
#
#     card = models.Flashcard(
#         deck_id=payload.deck_id,
#         front=payload.front,
#         back=payload.back,
#     )
#
#     db.add(card)
#     db.commit()
#     db.refresh(card)
#
#     return CardOut(
#         id=card.id,
#         deck_id=card.deck_id,
#         front=card.front,
#         back=card.back,
#         tags=card.tags,
#         created_at=card.created_at,
#     )
#
#
# # =========================================================
# # LIST CARDS (SEARCH + TAG + PAGINATION)
# # =========================================================
# # =========================================================
# # LIST CARDS (SEARCH + TAG + PAGINATION)
# # =========================================================
# @router.get("/cards", response_model=PageOut)
# def list_cards(
#     deck_id: Optional[int] = None,
#     search: Optional[str] = None,
#     tag: Optional[str] = None,
#     page: int = 1,
#     size: int = 20,
#     db: Session = Depends(get_db)
# ):
#     query = db.query(models.Flashcard)
#
#     if deck_id:
#         query = query.filter(models.Flashcard.deck_id == deck_id)
#
#     if search:
#         query = query.filter(
#             models.Flashcard.front.ilike(f"%{search}%") |
#             models.Flashcard.back.ilike(f"%{search}%")
#         )
#
#     if tag:
#         query = query.filter(models.Flashcard.tags.like(f"%{tag}%"))
#
#     total = query.count()
#
#     cards = (
#         query
#         .offset((page - 1) * size)
#         .limit(size)
#         .all()
#     )
#
#     items = [
#     CardOut(
#         id=c.id,
#         deck_id=c.deck_id,
#         front=c.front,
#         back=c.back,
#         created_at=c.created_at,
#     ).dict()
#     for c in cards
# ]
#
#     return PageOut(
#         meta=PageMeta(page=page, size=size, total=total),
#         items=items
#     )
#
# # =========================================================
# # REVIEW CARD
# # =========================================================
# @router.post("/reviews", response_model=ReviewOut)
# def review_card(
#     payload: ReviewCreateIn,
#     user_id: int = 1,  # replace with auth
#     db: Session = Depends(get_db)
# ):
#     if payload.rating < 1 or payload.rating > 5:
#         raise HTTPException(400, "Rating must be 1–5")
#
#     card = db.query(models.Flashcard).filter(
#         models.Flashcard.id == payload.card_id
#     ).first()
#
#     if not card:
#         raise HTTPException(404, "Card not found")
#
#     review = models.FlashcardReview(
#         card_id=payload.card_id,
#         user_id=user_id,
#         rating=payload.rating,
#     )
#
#     db.add(review)
#     db.commit()
#     db.refresh(review)
#
#     return ReviewOut(
#         id=review.id,
#         card_id=review.card_id,
#         user_id=review.user_id,
#         rating=review.rating,
#         reviewed_at=review.reviewed_at,
#     )
#
#
# # =========================================================
# # DELETE CARD
# # =========================================================
# @router.delete("/cards/{card_id}", response_model=OkOut)
# def delete_card(card_id: int, db: Session = Depends(get_db)):
#
#     card = db.query(models.Flashcard).filter(
#         models.Flashcard.id == card_id
#     ).first()
#
#     if not card:
#         raise HTTPException(404, "Card not found")
#
#     db.delete(card)
#     db.commit()
#
#     return OkOut(ok=True)