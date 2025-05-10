import React, { useEffect, useState } from "react";

// You can use fetcher from Remix, or regular fetch for data mutation.
export default function PixelActivation() {
  const [status, setStatus] = useState("loading"); // 'activated' | 'not_activated' | 'error' | 'loading'
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch current pixel status on mount
  useEffect(() => {
    setLoading(true);
    fetch("/api/pixel-activation")
      .then(r => r.json())
      .then(data => {
        setStatus(data.status);
        setError(data.error || "");
      })
      .catch(e => setError("Failed to fetch status"))
      .finally(() => setLoading(false));
  }, []);

  // Handler for activate/deactivate
  const handleMutation = async (activate) => {
    setLoading(true);
    setError("");
    const intent = activate ? "activate" : "deactivate";
    try {
      const resp = await fetch("/api/pixel-activation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent }),
      });
      const data = await resp.json();
      setStatus(data.status);
      if (data.error) setError(data.error);
    } catch {
      setError("Mutation failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // Render status + actionable button
  let statusText;
  switch(status) {
    case "activated":
      statusText = "Web Pixel is Activated";
      break;
    case "not_activated":
      statusText = "Web Pixel is Not Activated";
      break;
    case "error":
      statusText = "Status Error";
      break;
    default:
      statusText = "Checking status…";
  }

  return (
    <div style={{maxWidth: 400, margin: "2rem auto", padding: 24, border: "1px solid #eee", borderRadius: 8}}>
      <h2>Web Pixel Activation</h2>
      <div style={{marginBottom: 16}}>{statusText}</div>
      {error && <div style={{color: "red", marginBottom: 16}}>{error}</div>}
      <button
        onClick={() => handleMutation(status !== "activated")}
        disabled={loading}
        style={{
          padding: "8px 24px",
          background: status === "activated" ? "#fffbe6" : "#e8ffed",
          border: "1px solid #999", borderRadius: 4, fontWeight: 600
        }}
      >
        {loading ? "Processing..." : (status === "activated" ? "Deactivate" : "Activate")}
      </button>
    </div>
  );
}
