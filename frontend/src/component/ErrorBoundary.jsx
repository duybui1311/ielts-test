import * as React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";

/**
 * Catches render-time errors anywhere below it and shows a friendly fallback
 * instead of a blank white screen. Wraps the whole app in index.jsx.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surface the real cause in the console for debugging / future error tracking.
    // eslint-disable-next-line no-console
    console.error("Unhandled UI error:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Box sx={{ minHeight: "60vh", display: "grid", placeItems: "center", p: 3 }}>
        <Stack spacing={2} alignItems="center" textAlign="center" sx={{ maxWidth: 420 }}>
          <Typography variant="h5" fontWeight={800}>
            Something went wrong
          </Typography>
          <Typography color="text.secondary">
            An unexpected error occurred while rendering this page. Reloading usually
            fixes it. If it keeps happening, please let us know.
          </Typography>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </Stack>
      </Box>
    );
  }
}
