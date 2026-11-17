import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Home } from "@/pages/Home";
import { Solo } from "@/pages/Solo";
import { Daily } from "@/pages/Daily";
import { Room } from "@/pages/Room";
import { Legal } from "@/pages/Legal";
import { Scene, Weather } from "@/components/Scene";
import { useTheme } from "@/hooks/useTheme";
import { trackPage } from "@/telemetry";

export default function App() {
  const { theme, setTheme } = useTheme();
  const { pathname } = useLocation();
  useEffect(trackPage, [pathname]);

  return (
    <>
      <Scene theme={theme} />
      <div className="bloom" aria-hidden="true" />
      <Weather theme={theme} />
      <div className="scanlines" aria-hidden="true" />

      <Routes>
        <Route path="/" element={<Home theme={theme} setTheme={setTheme} />} />
        <Route path="/solo" element={<Solo theme={theme} setTheme={setTheme} />} />
        <Route path="/daily" element={<Daily theme={theme} setTheme={setTheme} />} />
        <Route path="/privacy" element={<Legal page="privacy" theme={theme} setTheme={setTheme} />} />
        <Route path="/terms" element={<Legal page="terms" theme={theme} setTheme={setTheme} />} />
        <Route path="/room/:code" element={<Room theme={theme} setTheme={setTheme} />} />
        <Route path="*" element={<Home theme={theme} setTheme={setTheme} />} />
      </Routes>
    </>
  );
}
