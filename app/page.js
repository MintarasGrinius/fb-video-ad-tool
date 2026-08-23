"use client";

import { useEffect, useState } from "react";

const ASPECT_RATIOS = ["9:16", "4:5", "1:1", "16:9"];
const RESOLUTIONS = ["480P", "768P", "2K", "4K"];

function FramePanel({ title, prompt, setPrompt, image, loading, error, onGenerate }) {
  return (
    <div>
      <label>{title} — image prompt (nano-banana-2)</label>
      <textarea
        rows={4}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the frame, e.g. product on a clean pastel background, studio lighting…"
      />
      <button onClick={onGenerate} disabled={loading || !prompt.trim()}>
        {loading && <span className="spinner" />}
        {loading ? "Generating…" : image ? "Regenerate" : "Generate image"}
      </button>
      {error && <div className="error">{error}</div>}
      <div className="preview">
        {image ? <img src={image} alt={title} /> : "No image yet"}
      </div>
    </div>
  );
}

export default function Home() {
  const [falKey, setFalKey] = useState("");
  const [concept, setConcept] = useState("");

  useEffect(() => {
    try {
      const k = localStorage.getItem("fal_key");
      if (k) setFalKey(k);
    } catch {}
  }, []);

  function updateFalKey(v) {
    setFalKey(v);
    try {
      localStorage.setItem("fal_key", v);
    } catch {}
  }

  const authHeaders = () => (falKey.trim() ? { "x-fal-key": falKey.trim() } : {});
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [brandLogo, setBrandLogo] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);

  async function uploadLogo(file) {
    if (!file) return;
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", headers: authHeaders(), body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setBrandLogo(data.url);
    } catch (err) {
      alert(String(err.message || err));
    } finally {
      setLogoUploading(false);
    }
  }

  const [startPrompt, setStartPrompt] = useState("");
  const [endPrompt, setEndPrompt] = useState("");
  const [startImage, setStartImage] = useState(null);
  const [endImage, setEndImage] = useState(null);
  const [startLoading, setStartLoading] = useState(false);
  const [endLoading, setEndLoading] = useState(false);
  const [startError, setStartError] = useState(null);
  const [endError, setEndError] = useState(null);

  const [videoPrompt, setVideoPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState("768P");
  const [loraUrl, setLoraUrl] = useState(
    "https://huggingface.co/fal/MiniMax-H3-Realism-People-LoRA/resolve/main/h3-realism-people-t2v-i2v-r2v.safetensors"
  );
  const [loraScale, setLoraScale] = useState(1);
  const [video, setVideo] = useState(null);
  const [videoSaved, setVideoSaved] = useState(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState(null);

  async function generateImage(prompt, role, setImage, setLoading, setError) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          prompt,
          aspect_ratio: aspectRatio,
          concept,
          role,
          // End frame references the start frame so the character stays consistent
          reference_urls: role === "end" && startImage ? [startImage] : [],
          logo_url: brandLogo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Image generation failed");
      setImage(data.url);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function generateVideo() {
    setVideoLoading(true);
    setVideoError(null);
    setVideo(null);
    setVideoSaved(null);
    try {
      const res = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          prompt: videoPrompt,
          image_url: startImage,
          end_image_url: endImage,
          duration,
          resolution,
          lora_url: loraUrl,
          lora_scale: loraScale,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Video submission failed");

      // Poll the queue until the render completes (renders take 1–15 minutes).
      const { request_id, endpoint } = data;
      for (;;) {
        await new Promise((r) => setTimeout(r, 8000));
        const sres = await fetch("/api/video/status", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            request_id,
            endpoint,
            concept,
            sidecar: { prompt: videoPrompt, image_url: startImage, end_image_url: endImage, duration, resolution },
          }),
        });
        const s = await sres.json();
        if (!sres.ok) throw new Error(s.error || "Status check failed");
        if (s.status === "COMPLETED") {
          setVideo(s.url);
          setVideoSaved(s.saved);
          break;
        }
      }
    } catch (err) {
      setVideoError(String(err.message || err));
    } finally {
      setVideoLoading(false);
    }
  }

  return (
    <main>
      <h1>FB Video Ad Maker</h1>
      <p className="subtitle">
        nano-banana-2 keyframes → MiniMax H3 image-to-video, via fal.ai
      </p>

      <details className="step guide">
        <summary>How it works — read this first</summary>
        <ol>
          <li>
            <b>Paste your fal.ai API key</b> (create one at{" "}
            <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noreferrer">
              fal.ai/dashboard/keys
            </a>
            ). Each generation is billed to your fal account.
          </li>
          <li>
            <b>Generate the two keyframes.</b> The start image is the video&apos;s first
            frame, the end image its last — the video morphs from one to the other.
            Describe each fully: who is in the shot, what they wear, the setting, the
            mood, and any text/caption the frame should include. Generating the end
            frame automatically uses the start frame as a reference, so the same person
            appears in both.
          </li>
          <li>
            <b>Upload your brand logo</b> (optional but recommended) — frames will then
            reproduce your real logo instead of inventing one.
          </li>
          <li>
            <b>Write the video prompt as a full ad script.</b> MiniMax H3 generates
            synchronized audio: dialogue and VO lines in the script are spoken, so a
            timed script (0:00–0:03 HOOK … dialogue … captions) works far better than a
            one-line description. 15&nbsp;s max.
          </li>
          <li>
            <b>Generate the video</b> — rendering takes 1–10&nbsp;minutes; the page polls
            until it&apos;s ready, then shows a download link.
          </li>
        </ol>
        <p className="hint">
          Tips: regenerate a keyframe until it&apos;s right before spending on the video —
          the video only ever sees the two frames. Avoid real brand names (Zara, Chanel…)
          in prompts: models draw their logos and Meta may reject the ad. 480P/768P are
          native quality; 2K/4K are upscales of 768P.
        </p>
      </details>

      <div className="step">
        <h2>
          0. fal.ai API key <span>get one at fal.ai/dashboard/keys — sent per request, stored only in your browser</span>
        </h2>
        <input
          type="text"
          value={falKey}
          onChange={(e) => updateFalKey(e.target.value)}
          placeholder="key_id:key_secret"
          autoComplete="off"
        />
      </div>

      <div className="step">
        <h2>
          1. Keyframes <span>generate the first and last frame of the ad</span>
        </h2>
        <div className="row" style={{ marginBottom: 8 }}>
          <div>
            <label>Ad concept name (output folder)</label>
            <input
              type="text"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="e.g. last-minute panic"
            />
          </div>
          <div style={{ maxWidth: 260 }}>
            <label>Brand logo (used as exact-logo reference)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => uploadLogo(e.target.files?.[0])}
            />
            {logoUploading && <p className="hint">Uploading logo…</p>}
            {brandLogo && !logoUploading && (
              <p className="hint">
                Logo set ✓ — frames will reproduce this exact logo
              </p>
            )}
          </div>
          <div style={{ maxWidth: 200 }}>
            <label>Aspect ratio</label>
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
              {ASPECT_RATIOS.map((r) => (
                <option key={r} value={r}>
                  {r} {r === "9:16" ? "(Reels/Stories)" : r === "4:5" ? "(Feed)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="frames">
          <FramePanel
            title="Video start"
            prompt={startPrompt}
            setPrompt={setStartPrompt}
            image={startImage}
            loading={startLoading}
            error={startError}
            onGenerate={() =>
              generateImage(startPrompt, "start", setStartImage, setStartLoading, setStartError)
            }
          />
          <FramePanel
            title="Video end"
            prompt={endPrompt}
            setPrompt={setEndPrompt}
            image={endImage}
            loading={endLoading}
            error={endError}
            onGenerate={() =>
              generateImage(endPrompt, "end", setEndImage, setEndLoading, setEndError)
            }
          />
        </div>
      </div>

      <div className="step">
        <h2>
          2. Video <span>MiniMax H3 animates start → end</span>
        </h2>
        <label>Video prompt (motion, camera, transition)</label>
        <textarea
          rows={3}
          value={videoPrompt}
          onChange={(e) => setVideoPrompt(e.target.value)}
          placeholder="e.g. slow dolly-in, product rotates and lands in the final composition, soft light sweep…"
        />
        <div className="row">
          <div>
            <label>Duration (seconds)</label>
            <input
              type="number"
              min={5}
              max={15}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
          <div>
            <label>Resolution</label>
            <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
              {RESOLUTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>LoRA URL (optional)</label>
            <input
              type="text"
              value={loraUrl}
              onChange={(e) => setLoraUrl(e.target.value)}
              placeholder="leave empty to use base model"
            />
          </div>
          <div style={{ maxWidth: 120 }}>
            <label>LoRA scale</label>
            <input
              type="number"
              step={0.1}
              min={0}
              max={2}
              value={loraScale}
              onChange={(e) => setLoraScale(e.target.value)}
            />
          </div>
        </div>
        <p className="hint">
          The /lora endpoint requires a trained LoRA adapter — with the field empty, the
          base minimax/h3/image-to-video endpoint is used with the same first/last frames.
        </p>
        <button
          onClick={generateVideo}
          disabled={videoLoading || !videoPrompt.trim() || !startImage || !endImage}
        >
          {videoLoading && <span className="spinner" />}
          {videoLoading ? "Generating video (can take a few minutes)…" : "Generate video"}
        </button>
        {videoError && <div className="error">{videoError}</div>}
        <div className="preview">
          {video ? (
            <video src={video} controls autoPlay loop muted playsInline />
          ) : (
            "No video yet"
          )}
        </div>
        {video && (
          <>
            <a className="download" href={video} target="_blank" rel="noreferrer">
              Download / open video ↗
            </a>
            {videoSaved && <p className="hint">Saved locally: {videoSaved}</p>}
          </>
        )}
      </div>
    </main>
  );
}
