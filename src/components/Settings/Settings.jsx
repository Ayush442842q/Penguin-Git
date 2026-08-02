import { useState } from "react";
import AiPanel from "./AiPanel";
import "./Settings.css";

export default function Settings({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState("ai");

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close-btn" onClick={onClose} title="Close Settings">
            ✕
          </button>
        </div>

        <div className="settings-body">
          <div className="settings-sidebar">
            <button
              className={`settings-nav-item ${activeTab === "ai" ? "active" : ""}`}
              onClick={() => setActiveTab("ai")}
            >
              <span>🤖</span> AI Assistant
            </button>
            <button className="settings-nav-item" disabled title="Coming in Phase 6">
              <span>🐙</span> GitHub Integration
            </button>
            <button className="settings-nav-item" disabled title="Coming in Phase 7">
              <span>☁️</span> Cloud Workspaces
            </button>
          </div>

          <div className="settings-content">{activeTab === "ai" && <AiPanel />}</div>
        </div>
      </div>
    </div>
  );
}
