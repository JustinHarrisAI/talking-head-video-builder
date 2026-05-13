"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

interface Script {
  id: string;
  title: string;
  body: string;
  platform: string | null;
  status: string;
}

interface Take {
  id: string;
  takeNumber: number;
  selected: boolean;
  duration: number | null;
  createdAt: string;
}

export default function RecordPage() {
  const { scriptId } = useParams<{ scriptId: string }>();
  const router = useRouter();

  const [script, setScript] = useState<Script | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const [recording, setRecording] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [scriptPosition, setScriptPosition] = useState<"side" | "overlay">("side");
  const [submitting, setSubmitting] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);

  // Load script and takes
  useEffect(() => {
    fetch(`/api/scripts/${scriptId}`).then((r) => r.json()).then((data) => {
      setScript(data.script);
      setTakes(data.takes);
    });
  }, [scriptId]);

  // Initialize camera
  useEffect(() => {
    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1920, height: 1080, facingMode: "user" },
          audio: true,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraReady(true);
      } catch {
        alert("Camera access denied. Please allow camera and microphone access.");
      }
    }
    initCamera();

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: "video/webm;codecs=vp9,opus",
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const duration = (Date.now() - startTimeRef.current) / 1000;

      // Upload take
      const formData = new FormData();
      formData.append("scriptId", scriptId);
      formData.append("video", blob, `take-${Date.now()}.webm`);

      const res = await fetch("/api/takes", { method: "POST", body: formData });
      if (res.ok) {
        const take = await res.json();
        setTakes((prev) => [...prev, { ...take, duration }]);
      }
    };

    mediaRecorderRef.current = recorder;
    startTimeRef.current = Date.now();
    recorder.start(1000); // collect data every second
    setRecording(true);
  }, [scriptId]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }, []);

  async function selectTake(takeId: string) {
    await fetch("/api/takes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ takeId, action: "select" }),
    });
    setTakes((prev) =>
      prev.map((t) => ({ ...t, selected: t.id === takeId }))
    );
  }

  async function deleteTake(takeId: string) {
    await fetch("/api/takes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ takeId, action: "delete" }),
    });
    setTakes((prev) => prev.filter((t) => t.id !== takeId));
  }

  async function submitForEditing() {
    const selected = takes.find((t) => t.selected);
    if (!selected) {
      alert("Select a take first");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scriptId }),
    });

    if (res.ok) {
      router.push("/");
    } else {
      alert("Failed to submit for editing");
      setSubmitting(false);
    }
  }

  if (!script) {
    return <p className="text-foreground-secondary">Loading script...</p>;
  }

  const selectedTake = takes.find((t) => t.selected);

  return (
    <div className="h-[calc(100vh-48px)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{script.title}</h1>
          {script.platform && (
            <span className="text-xs text-foreground-secondary uppercase">{script.platform}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScriptPosition((p) => (p === "side" ? "overlay" : "side"))}
            className="border border-border px-3 py-1.5 text-xs hover:bg-black/5 transition-colors"
          >
            Script: {scriptPosition === "side" ? "Side Panel" : "Overlay"}
          </button>
          {selectedTake && (
            <button
              onClick={submitForEditing}
              disabled={submitting}
              className="bg-accent text-white px-4 py-1.5 text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit for Editing"}
            </button>
          )}
        </div>
      </div>

      <div className={`flex gap-4 ${scriptPosition === "side" ? "flex-row" : "flex-col"} h-[calc(100%-60px)]`}>
        {/* Camera Preview */}
        <div className={`relative bg-black ${scriptPosition === "side" ? "flex-1" : "flex-1"}`}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />

          {/* Script Overlay */}
          {scriptPosition === "overlay" && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-4 max-h-[40%] overflow-auto">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{script.body}</p>
            </div>
          )}

          {/* Recording indicator */}
          {recording && (
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 animate-pulse" />
              <span className="text-white text-sm font-medium">REC</span>
            </div>
          )}

          {/* Take counter */}
          <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-1 text-sm">
            Take {takes.length + (recording ? 1 : 0)}
          </div>

          {/* Record controls */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4">
            {!recording ? (
              <button
                onClick={startRecording}
                disabled={!cameraReady}
                className="w-16 h-16 bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center"
                title="Start recording"
              >
                <div className="w-6 h-6 bg-white" />
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="w-16 h-16 bg-red-500 hover:bg-red-600 transition-colors flex items-center justify-center"
                title="Stop recording"
              >
                <div className="w-6 h-6 bg-white" style={{ borderRadius: "0" }} />
              </button>
            )}
          </div>
        </div>

        {/* Script Side Panel */}
        {scriptPosition === "side" && (
          <div className="w-80 bg-surface border border-border overflow-auto">
            <div className="p-4 border-b border-border">
              <p className="text-xs font-medium uppercase tracking-wider text-foreground-secondary">Script</p>
            </div>
            <div className="p-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{script.body}</p>
            </div>
          </div>
        )}
      </div>

      {/* Takes List */}
      {takes.length > 0 && (
        <div className="mt-4 bg-surface border border-border p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-foreground-secondary mb-3">Takes</p>
          <div className="flex gap-2 flex-wrap">
            {takes.map((take) => (
              <div
                key={take.id}
                className={`flex items-center gap-2 border px-3 py-2 text-sm ${
                  take.selected ? "border-accent bg-accent/10" : "border-border"
                }`}
              >
                <span className="font-medium">Take {take.takeNumber}</span>
                {take.duration && (
                  <span className="text-xs text-foreground-secondary">
                    {Math.floor(take.duration / 60)}:{String(Math.floor(take.duration % 60)).padStart(2, "0")}
                  </span>
                )}
                {!take.selected && (
                  <>
                    <button
                      onClick={() => selectTake(take.id)}
                      className="text-xs text-accent hover:underline"
                    >
                      Select
                    </button>
                    <button
                      onClick={() => deleteTake(take.id)}
                      className="text-xs text-error hover:underline"
                    >
                      Delete
                    </button>
                  </>
                )}
                {take.selected && (
                  <span className="text-xs text-accent font-medium">Selected</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
