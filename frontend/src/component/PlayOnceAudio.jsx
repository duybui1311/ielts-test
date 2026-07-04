import React, { useEffect, useRef, useState } from "react";
import { Box, Button, LinearProgress, Stack, Typography } from "@mui/material";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import GraphicEqRoundedIcon from "@mui/icons-material/GraphicEqRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";

/**
 * Mock-test Listening player: the recording plays ONCE, start to finish, with
 * no pause or seeking — exactly like the official computer-based IELTS.
 *
 * "Used" is persisted under `storageKey` (scoped to the attempt + section) the
 * moment playback starts, so refreshing the page doesn't grant a replay. This
 * is an honest deterrent, not DRM — practice tests keep normal controls.
 */
export default function PlayOnceAudio({ src, storageKey }) {
  const audioRef = useRef(null);
  const [phase, setPhase] = useState(() => {
    try { return localStorage.getItem(storageKey) === "used" ? "done" : "ready"; }
    catch { return "ready"; }
  });
  const [progress, setProgress] = useState(0);

  // Refresh mid-recording counts as played (the real test doesn't restart either).
  const markUsed = () => {
    try { localStorage.setItem(storageKey, "used"); } catch { /* best-effort */ }
  };

  const start = async () => {
    const el = audioRef.current;
    if (!el || phase !== "ready") return;
    try {
      await el.play();
      markUsed();
      setPhase("playing");
    } catch {
      // Autoplay rejection or a bad URL — leave the button usable.
    }
  };

  useEffect(() => () => audioRef.current?.pause(), []);

  return (
    <Box
      sx={(t) => ({
        p: 2, mb: 2, borderRadius: 2,
        border: `1px solid ${t.palette.divider}`,
        bgcolor: t.palette.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
      })}
    >
      <Box
        component="audio"
        ref={audioRef}
        src={src}
        preload="auto"
        sx={{ display: "none" }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration) setProgress((el.currentTime / el.duration) * 100);
        }}
        onEnded={() => { setPhase("done"); setProgress(100); }}
      />
      {phase === "ready" && (
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button variant="contained" startIcon={<PlayArrowRoundedIcon />} onClick={start}>
            Play recording
          </Button>
          <Typography variant="body2" color="text.secondary">
            Plays <strong>once</strong>, like the real test — no pause, no replay.
            Don't leave the page while it plays.
          </Typography>
        </Stack>
      )}
      {phase === "playing" && (
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            <GraphicEqRoundedIcon color="primary" fontSize="small" />
            <Typography variant="body2" fontWeight={600}>Recording playing…</Typography>
          </Stack>
          <LinearProgress variant="determinate" value={progress} sx={{ borderRadius: 1 }} />
        </Stack>
      )}
      {phase === "done" && (
        <Stack direction="row" spacing={1} alignItems="center">
          <CheckCircleRoundedIcon color="success" fontSize="small" />
          <Typography variant="body2" color="text.secondary">
            The recording has been played. Answer from what you heard and noted.
          </Typography>
        </Stack>
      )}
    </Box>
  );
}
