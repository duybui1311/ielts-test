import React from "react";
import { Box, Card, Stack, Typography, IconButton, Tooltip } from "@mui/material";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import AnnotatedText from "./AnnotatedText";

/**
 * Google-Docs-style commented document: the text on the left with highlighted
 * spans, and comment cards in a right margin. Clicking a highlight focuses its
 * comment and vice-versa. Pass `onSelect` to let a teacher select text and add a
 * comment; pass `onDelete` to allow removing comments.
 */
export default function CommentedDoc({ text = "", comments = [], onSelect, onDelete }) {
  const [activeId, setActiveId] = React.useState(null);
  const cardRefs = React.useRef({});

  const focusComment = (id) => {
    setActiveId(id);
    cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr minmax(240px, 300px)" }, gap: 2, alignItems: "start" }}>
      <Card variant="outlined" sx={{ p: 2, boxShadow: "none" }}>
        <AnnotatedText
          text={text}
          comments={comments}
          activeId={activeId}
          onHighlightClick={focusComment}
          onSelect={onSelect}
        />
      </Card>

      <Stack spacing={1} sx={{ position: { md: "sticky" }, top: { md: 88 } }}>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <ChatBubbleOutlineRoundedIcon fontSize="small" color="action" />
          <Typography variant="subtitle2" color="text.secondary">
            Comments ({comments.length})
          </Typography>
        </Stack>
        {comments.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {onSelect ? "Select text in the response to add a comment." : "No comments."}
          </Typography>
        ) : (
          comments.map((c) => (
            <Card
              key={c.id}
              ref={(el) => { cardRefs.current[c.id] = el; }}
              variant="outlined"
              onMouseEnter={() => setActiveId(c.id)}
              onMouseLeave={() => setActiveId(null)}
              onClick={() => setActiveId(c.id)}
              sx={{
                p: 1.5, boxShadow: "none", cursor: "pointer",
                borderLeft: "4px solid", borderLeftColor: "warning.main",
                borderColor: activeId === c.id ? "warning.main" : "divider",
                bgcolor: activeId === c.id ? "action.hover" : "transparent",
              }}
            >
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }} display="block">
                    “{c.quote}”
                  </Typography>
                  <Typography variant="body2">{c.comment}</Typography>
                </Box>
                {onDelete && (
                  <Tooltip title="Delete comment">
                    <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}>
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            </Card>
          ))
        )}
      </Stack>
    </Box>
  );
}
