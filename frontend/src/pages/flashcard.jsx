import React, { useEffect, useState, useCallback } from "react";
import {
  Box, Card, CardActionArea, Stack, Typography, Button, IconButton,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Chip, LinearProgress,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import StyleRoundedIcon from "@mui/icons-material/StyleRounded";
import { apiFetch } from "../api";
import { PageHeader } from "../component/ui";

const RATINGS = [
  { label: "Again", rating: 1, color: "error" },
  { label: "Hard", rating: 2, color: "warning" },
  { label: "Good", rating: 3, color: "info" },
  { label: "Easy", rating: 4, color: "success" },
];

export default function FlashcardPage() {
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState(null); // deck being studied

  // dialogs
  const [deckDialog, setDeckDialog] = useState(false);
  const [deckName, setDeckName] = useState("");

  const loadDecks = useCallback(() => {
    setLoading(true);
    apiFetch("/api/flashcards/decks")
      .then((r) => r.json())
      .then((d) => setDecks(Array.isArray(d) ? d : []))
      .catch(() => setError("Could not load decks."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadDecks(); }, [loadDecks]);

  const createDeck = async () => {
    const name = deckName.trim();
    if (!name) return;
    await apiFetch("/api/flashcards/decks", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    setDeckName("");
    setDeckDialog(false);
    loadDecks();
  };

  if (active) {
    return <StudyView deck={active} onBack={() => { setActive(null); loadDecks(); }} />;
  }

  return (
    <Box>
      <PageHeader
        eyebrow="Study"
        title="Flashcards"
        subtitle="Build decks and study them in flip-card mode."
        icon={<StyleRoundedIcon />}
        action={
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDeckDialog(true)}>
            New deck
          </Button>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}><CircularProgress /></Box>
      ) : decks.length === 0 ? (
        <Card sx={{ p: 5, textAlign: "center" }}>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            No decks yet. Create your first deck to start studying.
          </Typography>
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDeckDialog(true)}>
            New deck
          </Button>
        </Card>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(3, 1fr)" }, gap: 2 }}>
          {decks.map((d) => (
            <Card key={d.id}>
              <CardActionArea onClick={() => setActive(d)} sx={{ p: 3, height: "100%" }}>
                <Stack spacing={1.5}>
                  <Box sx={{ color: "primary.main" }}><StyleRoundedIcon /></Box>
                  <Typography variant="h6" noWrap>{d.name}</Typography>
                  <Chip size="small" label={`${d.card_count} card${d.card_count === 1 ? "" : "s"}`} sx={{ alignSelf: "flex-start" }} />
                </Stack>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      )}

      <Dialog open={deckDialog} onClose={() => setDeckDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>New deck</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth label="Deck name" sx={{ mt: 1 }}
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createDeck(); }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeckDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={createDeck}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function StudyView({ deck, onBack }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // add-card dialog
  const [cardDialog, setCardDialog] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`/api/flashcards/cards?deck_id=${deck.id}`)
      .then((r) => r.json())
      .then((d) => setCards(Array.isArray(d) ? d : []))
      .catch(() => setCards([]))
      .finally(() => setLoading(false));
  }, [deck.id]);

  useEffect(() => { load(); }, [load]);

  const addCard = async () => {
    if (!front.trim() || !back.trim()) return;
    await apiFetch(`/api/flashcards/decks/${deck.id}/cards`, {
      method: "POST",
      body: JSON.stringify({ front: front.trim(), back: back.trim() }),
    });
    setFront(""); setBack(""); setCardDialog(false);
    load();
  };

  const rate = async (rating) => {
    const card = cards[idx];
    if (card) {
      apiFetch("/api/flashcards/review", {
        method: "POST",
        body: JSON.stringify({ card_id: card.id, rating }),
      }).catch(() => {});
    }
    setFlipped(false);
    setIdx((i) => (i + 1) % Math.max(cards.length, 1));
  };

  const card = cards[idx];

  return (
    <Box>
      <PageHeader
        title={deck.name}
        subtitle={cards.length ? `Card ${idx + 1} of ${cards.length}` : "No cards yet"}
        action={
          <Stack direction="row" spacing={1}>
            <Button startIcon={<ArrowBackRoundedIcon />} onClick={onBack}>Decks</Button>
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setCardDialog(true)}>
              Add card
            </Button>
          </Stack>
        }
      />

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}><CircularProgress /></Box>
      ) : cards.length === 0 ? (
        <Card sx={{ p: 5, textAlign: "center" }}>
          <Typography color="text.secondary" sx={{ mb: 2 }}>This deck is empty. Add your first card.</Typography>
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setCardDialog(true)}>Add card</Button>
        </Card>
      ) : (
        <Box sx={{ maxWidth: 620, mx: "auto" }}>
          <LinearProgress
            variant="determinate"
            value={((idx + 1) / cards.length) * 100}
            sx={{ borderRadius: 1, mb: 2 }}
          />
          <Card
            sx={{
              minHeight: 280,
              display: "grid",
              placeItems: "center",
              p: 4,
              cursor: "pointer",
              textAlign: "center",
              userSelect: "none",
            }}
            onClick={() => setFlipped((f) => !f)}
          >
            <Box>
              <Typography variant="overline" color="text.secondary">
                {flipped ? "Answer" : "Term"}
              </Typography>
              <Typography variant="h5" sx={{ mt: 1 }}>
                {flipped ? card.back : card.front}
              </Typography>
              {!flipped && (
                <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 2 }}>
                  Click to reveal
                </Typography>
              )}
            </Box>
          </Card>

          <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 2 }}>
            {RATINGS.map((r) => (
              <Button
                key={r.rating}
                variant="outlined"
                color={r.color}
                disabled={!flipped}
                onClick={() => rate(r.rating)}
              >
                {r.label}
              </Button>
            ))}
          </Stack>
        </Box>
      )}

      <Dialog open={cardDialog} onClose={() => setCardDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add card</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField autoFocus fullWidth label="Front (term / question)" value={front} onChange={(e) => setFront(e.target.value)} />
            <TextField fullWidth multiline minRows={2} label="Back (answer)" value={back} onChange={(e) => setBack(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCardDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={addCard}>Add</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
