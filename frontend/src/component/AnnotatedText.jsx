import React from "react";
import { Box } from "@mui/material";

/** Absolute character offset of (node, offset) within `container`'s text. */
function absOffset(container, node, offset) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let total = 0;
  let n;
  while ((n = walker.nextNode())) {
    if (n === node) return total + offset;
    total += n.textContent.length;
  }
  return total;
}

/** Split text at every comment boundary so each segment knows which comments cover it. */
function buildSegments(text, comments) {
  const len = text.length;
  const clamp = (x) => Math.max(0, Math.min(len, x));
  const points = new Set([0, len]);
  comments.forEach((c) => { points.add(clamp(c.start_offset)); points.add(clamp(c.end_offset)); });
  const sorted = [...points].sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i];
    const e = sorted[i + 1];
    if (e <= s) continue;
    const ids = comments.filter((c) => c.start_offset <= s && c.end_offset >= e).map((c) => c.id);
    segs.push({ text: text.slice(s, e), ids });
  }
  return segs;
}

/**
 * Renders `text` with highlighted comment spans. When `onSelect` is given,
 * selecting text reports { start, end, quote } so a teacher can attach a comment.
 */
export default function AnnotatedText({ text = "", comments = [], onSelect, activeId, onHighlightClick }) {
  const ref = React.useRef(null);
  const segments = buildSegments(text, comments);

  const handleMouseUp = () => {
    if (!onSelect || !ref.current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!ref.current.contains(range.commonAncestorContainer)) return;
    const start = absOffset(ref.current, range.startContainer, range.startOffset);
    const end = absOffset(ref.current, range.endContainer, range.endOffset);
    if (end <= start) return;
    onSelect({ start, end, quote: text.slice(start, end) });
  };

  return (
    <Box
      ref={ref}
      onMouseUp={handleMouseUp}
      sx={{ whiteSpace: "pre-wrap", lineHeight: 1.9, cursor: onSelect ? "text" : "default" }}
    >
      {segments.map((seg, i) =>
        seg.ids.length ? (
          <Box
            key={i}
            component="span"
            onClick={() => onHighlightClick?.(seg.ids[0])}
            sx={(t) => ({
              borderRadius: 0.5,
              cursor: "pointer",
              bgcolor: seg.ids.includes(activeId)
                ? (t.palette.mode === "dark" ? "warning.dark" : "warning.light")
                : (t.palette.mode === "dark" ? "rgba(255,193,7,0.28)" : "rgba(255,193,7,0.35)"),
              borderBottom: "2px solid",
              borderColor: "warning.main",
            })}
          >
            {seg.text}
          </Box>
        ) : (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        )
      )}
    </Box>
  );
}
