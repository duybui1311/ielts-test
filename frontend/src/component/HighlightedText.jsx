import * as React from "react";
import { Box, alpha } from "@mui/material";

/** Escape a string for use inside a RegExp. */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Render `text`, wrapping any occurrence of the given `sentences` in a colored
 * highlight. Matching is whitespace-tolerant and case-insensitive so AI-copied
 * support sentences still match the passage even with minor spacing differences.
 */
export default function HighlightedText({ text, sentences = [], sx }) {
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
      out.push(
        <Box
          key={`hl-${key++}`}
          component="mark"
          sx={(theme) => ({
            px: 0.5,
            py: 0.1,
            borderRadius: 0.5,
            color: "inherit",
            bgcolor: alpha(theme.palette.secondary.main, theme.palette.mode === "dark" ? 0.32 : 0.28),
            boxShadow: `inset 0 -2px 0 ${alpha(theme.palette.secondary.main, 0.6)}`,
          })}
        >
          {m[0]}
        </Box>
      );
      last = m.index + m[0].length;
      if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width
    }
    if (last < content.length) out.push(content.slice(last));
    return out;
  }, [content, terms]);

  return (
    <Box component="span" sx={[{ whiteSpace: "pre-wrap", lineHeight: 1.9 }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {nodes}
    </Box>
  );
}
