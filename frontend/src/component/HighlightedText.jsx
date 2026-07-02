import * as React from "react";
import { Box, alpha } from "@mui/material";

/** Escape a string for use inside a RegExp. */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Normalize for whitespace-tolerant, case-insensitive comparison. */
export function normalizeFragment(s) {
  return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Render `text`, wrapping any occurrence of the given `sentences` in a colored
 * highlight. Matching is whitespace-tolerant and case-insensitive so AI-copied
 * support sentences still match the passage even with minor spacing differences.
 *
 * Each <mark> carries a normalized `data-hl` attribute so callers can locate a
 * specific highlight in the DOM (see ExamResults' jump-to-evidence).
 * `color` picks the palette used for the wash ("secondary" for AI evidence,
 * "warning" for the student's own highlighter). `onMarkClick(matchedText)`
 * makes highlights clickable (e.g. click-to-remove while taking a test).
 */
export default function HighlightedText({ text, sentences = [], sx, color = "secondary", onMarkClick }) {
  const content = String(text || "");
  const terms = (sentences || []).map((s) => String(s || "").trim()).filter((s) => s.length > 3);

  const nodes = React.useMemo(() => {
    if (!content) return null;
    if (terms.length === 0) return [content];
    // Build one regex matching any support sentence, tolerant of whitespace runs.
    const pattern = terms
      .map((t) => escapeRe(t).replace(/\s+/g, "\\s+"))
      .join("|");
    let re;
    try {
      re = new RegExp(`(${pattern})`, "gi");
    } catch {
      return [content];
    }
    const out = [];
    let last = 0;
    let m;
    let key = 0;
    while ((m = re.exec(content)) !== null) {
      if (m.index > last) out.push(content.slice(last, m.index));
      const matched = m[0];
      out.push(
        <Box
          key={`hl-${key++}`}
          component="mark"
          data-hl={normalizeFragment(matched)}
          onClick={onMarkClick ? () => onMarkClick(matched) : undefined}
          sx={(theme) => {
            const c = theme.palette[color]?.main || theme.palette.secondary.main;
            return {
              px: 0.5,
              py: 0.1,
              borderRadius: 0.5,
              color: "inherit",
              bgcolor: alpha(c, theme.palette.mode === "dark" ? 0.32 : 0.28),
              boxShadow: `inset 0 -2px 0 ${alpha(c, 0.6)}`,
              cursor: onMarkClick ? "pointer" : "inherit",
            };
          }}
        >
          {matched}
        </Box>
      );
      last = m.index + matched.length;
      if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width
    }
    if (last < content.length) out.push(content.slice(last));
    return out;
  }, [content, terms, color, onMarkClick]);

  return (
    <Box component="span" sx={[{ whiteSpace: "pre-wrap", lineHeight: 1.9 }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {nodes}
    </Box>
  );
}
