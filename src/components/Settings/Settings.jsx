import { useState } from "react";
import AiPanel from "./AiPanel";
import GitHubPanel from "./GitHubPanel";
import CloudPanel from "./CloudPanel";
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
            <button
              className={`settings-nav-item ${activeTab === "github" ? "active" : ""}`}
              onClick={() => setActiveTab("github")}
            >
              <span>🐙</span> GitHub Integration
            </button>
            <button
              className={`settings-nav-item ${activeTab === "cloud" ? "active" : ""}`}
              onClick={() => setActiveTab("cloud")}
            >
              <span>☁️</span> Cloud Workspaces
            </button>
          </div>

          <div className="settings-content">
            {activeTab === "ai" && <AiPanel />}
            {activeTab === "github" && <GitHubPanel />}
            {activeTab === "cloud" && <CloudPanel />}
          </div>
        </div>
      </div>
    </div>
  );
}
