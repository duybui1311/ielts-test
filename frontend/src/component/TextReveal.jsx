import * as React from "react";
import { Box, Typography } from "@mui/material";
import { motion, useReducedMotion } from "framer-motion";

/**
 * ReactBits-style animated text reveal (Blur / Split Text). Each word rises and
 * un-blurs in sequence for a lively heading entrance. Lives in a lazy page
 * bundle (framer-motion is already loaded there), and falls back to plain text
 * when the user prefers reduced motion.
 */
export function BlurText({
  text,
  variant = "h3",
  component = "div",
  sx,
  delay = 0,
  stagger = 0.06,
  ...rest
}) {
  const reduce = useReducedMotion();
  const words = String(text ?? "").split(" ");

  if (reduce) {
    return (
      <Typography variant={variant} component={component} sx={sx} {...rest}>
        {text}
      </Typography>
    );
  }

  return (
    <Typography variant={variant} component={component} sx={sx} {...rest}>
      {words.map((w, i) => (
        <Box
          key={`${w}-${i}`}
          component={motion.span}
          sx={{ display: "inline-block", whiteSpace: "pre" }}
          initial={{ opacity: 0, filter: "blur(8px)", y: "0.35em" }}
          animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
          transition={{ duration: 0.5, delay: delay + i * stagger, ease: [0.22, 1, 0.36, 1] }}
        >
          {w}
          {i < words.length - 1 ? " " : ""}
        </Box>
      ))}
    </Typography>
  );
}

export default BlurText;
