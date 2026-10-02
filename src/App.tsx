import { Route, Routes } from "react-router-dom";
import { Home } from "@/pages/Home";
import { Solo } from "@/pages/Solo";
import { Room } from "@/pages/Room";
import { Scene, Weather } from "@/components/Scene";
import { useTheme } from "@/hooks/useTheme";

export default function App() {
  const { theme, setTheme } = useTheme();

  return (
    <>
      <Scene theme={theme} />
      <div className="bloom" aria-hidden="true" />
      <Weather theme={theme} />
      <div className="scanlines" aria-hidden="true" />

      <Routes>
        <Route path="/" element={<Home theme={theme} setTheme={setTheme} />} />
        <Route path="/solo" element={<Solo theme={theme} setTheme={setTheme} />} />
        <Route path="/room/:code" element={<Room theme={theme} setTheme={setTheme} />} />
        <Route path="*" element={<Home theme={theme} setTheme={setTheme} />} />
      </Routes>
    </>
  );
}
