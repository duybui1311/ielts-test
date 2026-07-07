import * as React from "react";
import {
  Box, Checkbox, FormControlLabel, FormGroup, MenuItem, Radio, RadioGroup,
  Select, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";

/** Letter label for a matching/multi-select option: A, B, C… */
const letter = (i) => String.fromCharCode(65 + i);

/** Display label for a chosen matching option: just "A" when the option text is
 *  blank or is itself the letter, else "A — <text>". Avoids a redundant "A — A". */
export function matchingLabel(i, optText) {
  const L = letter(i);
  return optText && optText !== L ? `${L} — ${optText}` : L;
}

/** Parse a multi-select answer (JSON array of option indices) from value_text. */
export function parsePicked(valueText) {
  try {
    const v = JSON.parse(valueText || "[]");
    return Array.isArray(v) ? v.map(Number).filter(Number.isInteger) : [];
  } catch {
    return [];
  }
}

/** The blank inside a gap-fill prompt: 3+ underscores (with optional spacing). */
const GAP_RE = /_{3,}/;

/**
 * Parse the word limit from a task's instructions ("Write ONE WORD ONLY…",
 * "NO MORE THAN TWO WORDS…"). Returns {limit, allowsNumber} or null when the
 * instructions don't state one.
 */
export function wordLimitFromInstructions(instructions) {
  const t = (instructions || "").toUpperCase();
  const words = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4 };
  const m = t.match(/(?:NO MORE THAN |)(ONE|TWO|THREE|FOUR) WORDS?(?: ONLY|\b)/);
  if (!m) return null;
  return { limit: words[m[1]], allowsNumber: /NUMBER/.test(t) };
}

/** Count the words in an answer the way IELTS markers do: whitespace-separated
 * tokens; hyphenated words count as one; pure numbers are skipped when the
 * instructions allow "…AND/OR A NUMBER". */
export function countAnswerWords(answer, allowsNumber = false) {
  const tokens = (answer || "").trim().split(/\s+/).filter(Boolean);
  if (!allowsNumber) return tokens.length;
  return tokens.filter((tok) => !/^[0-9.,:%-]+$/.test(tok)).length;
}

/** Over-limit warning under a text answer, e.g. "The instructions allow ONE
 * word — this answer has 3." Warns only; never blocks typing. */
function WordLimitHint({ instructions, value }) {
  const rule = wordLimitFromInstructions(instructions);
  if (!rule) return null;
  const used = countAnswerWords(value, rule.allowsNumber);
  if (used <= rule.limit) return null;
  const names = { 1: "ONE word", 2: "TWO words", 3: "THREE words", 4: "FOUR words" };
  return (
    <Typography variant="caption" color="error.main" sx={{ display: "block", mt: 0.5 }}>
      The instructions allow {names[rule.limit]}
      {rule.allowsNumber ? " (and/or a number)" : ""} — this answer has {used} words
      and would score zero on the real test.
    </Typography>
  );
}

/**
 * Render a question's answer input in its native IELTS format (`q.qformat`):
 * - tfng / ynng  → three tap buttons
 * - matching     → dropdown over the shared list (labelled A, B, C…)
 * - multi_select → checkboxes capped at `select_count`, stored as a JSON array
 *                  of option indices in value_text
 * - gap_fill     → the prompt's blank becomes an inline text input
 * - otherwise    → classic radio group / text field by qtype
 *
 * `value` is {choice_index, value_text}; `onChange` receives a patch of the
 * same shape. `onCommitText` (optional) fires when a text answer should be
 * persisted (blur). `disabled` renders the graded, read-only view.
 */
export default function QuestionInput({ question: q, value = {}, onChange, onCommitText, disabled = false }) {
  const fmt = q.qformat || null;
  const opts = q.options || [];

  if (fmt === "tfng" || fmt === "ynng") {
    return (
      <ToggleButtonGroup
        exclusive
        size="small"
        disabled={disabled}
        value={value.choice_index ?? null}
        onChange={(_, v) => { if (v !== null) onChange?.({ choice_index: v }); }}
        sx={{ mt: 1, flexWrap: "wrap" }}
      >
        {opts.map((opt, i) => (
          <ToggleButton
            key={i}
            value={i}
            sx={{ px: 2, fontWeight: 700, textTransform: "none" }}
          >
            {opt}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    );
  }

  if (fmt === "matching") {
    return (
      <Select
        size="small"
        fullWidth
        displayEmpty
        disabled={disabled}
        value={value.choice_index ?? ""}
        onChange={(e) => onChange?.({ choice_index: e.target.value })}
        renderValue={(v) =>
          v === "" ? (
            <Typography component="span" color="text.secondary">Choose…</Typography>
          ) : (
            // When the option text is just its own letter (or blank), show the
            // bare letter instead of a redundant "A — A".
            matchingLabel(v, opts[v])
          )
        }
        sx={{ mt: 1 }}
      >
        {opts.map((opt, i) => (
          <MenuItem key={i} value={i} sx={{ whiteSpace: "normal", maxWidth: 480 }}>
            <strong style={{ marginRight: 8 }}>{letter(i)}</strong>
            {opt && opt !== letter(i) ? opt : null}
          </MenuItem>
        ))}
      </Select>
    );
  }

  if (fmt === "multi_select") {
    const picked = parsePicked(value.value_text);
    const cap = q.select_count || 2;
    const toggle = (i) => {
      const next = picked.includes(i)
        ? picked.filter((x) => x !== i)
        : [...picked, i].slice(0, cap === picked.length ? picked.length : undefined);
      if (!picked.includes(i) && picked.length >= cap) return; // at the cap
      onChange?.({ value_text: JSON.stringify(next.sort((a, b) => a - b)) });
    };
    return (
      <Box sx={{ mt: 0.5 }}>
        <Typography variant="caption" color={picked.length === cap ? "success.main" : "text.secondary"}>
          Choose {cap} — {picked.length}/{cap} selected
        </Typography>
        <FormGroup>
          {opts.map((opt, i) => (
            <FormControlLabel
              key={i}
              disabled={disabled || (!picked.includes(i) && picked.length >= cap)}
              control={
                <Checkbox
                  size="small"
                  checked={picked.includes(i)}
                  onChange={() => toggle(i)}
                />
              }
              label={`${letter(i)}  ${opt}`}
            />
          ))}
        </FormGroup>
      </Box>
    );
  }

  if (fmt === "gap_fill" && q.qtype === "short") {
    // Render the sentence with an inline input where the blank is; extra blank
    // runs (rare) stay as plain underscores.
    const m = (q.prompt || "").match(GAP_RE);
    if (m) {
      const before = q.prompt.slice(0, m.index);
      const after = q.prompt.slice(m.index + m[0].length);
      return (
        <>
          <Typography variant="body2" component="div" sx={{ mt: 1, lineHeight: 2.4 }}>
            {before}
            <TextField
              variant="standard"
              size="small"
              disabled={disabled}
              value={value.value_text ?? ""}
              onChange={(e) => onChange?.({ value_text: e.target.value })}
              onBlur={(e) => onCommitText?.(e.target.value)}
              placeholder="answer"
              inputProps={{
                style: { textAlign: "center", fontWeight: 700 },
                "aria-label": "gap answer",
              }}
              sx={{ mx: 0.75, width: Math.max(110, (value.value_text?.length || 6) * 11), verticalAlign: "baseline" }}
            />
            {after}
          </Typography>
          {!disabled && <WordLimitHint instructions={q.task_instructions} value={value.value_text} />}
        </>
      );
    }
    // No detectable blank — fall through to the plain short input below.
  }

  if (q.qtype === "mcq") {
    return (
      <RadioGroup
        value={value.choice_index?.toString() ?? ""}
        onChange={(e) => onChange?.({ choice_index: parseInt(e.target.value, 10) })}
      >
        {opts.map((opt, i) => (
          <FormControlLabel
            key={i}
            value={i.toString()}
            disabled={disabled}
            control={<Radio size="small" />}
            label={opt}
          />
        ))}
      </RadioGroup>
    );
  }

  // short (default) / gap_fill without a marker
  return (
    <>
      <TextField
        size="small"
        fullWidth
        disabled={disabled}
        placeholder="Type your answer…"
        value={value.value_text ?? ""}
        onChange={(e) => onChange?.({ value_text: e.target.value })}
        onBlur={(e) => onCommitText?.(e.target.value)}
        sx={{ mt: 1 }}
      />
      {!disabled && <WordLimitHint instructions={q.task_instructions} value={value.value_text} />}
    </>
  );
}
