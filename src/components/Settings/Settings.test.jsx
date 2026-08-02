import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Settings from "./Settings";
import * as tauriBridge from "../../services/tauriBridge";

vi.mock("../../services/tauriBridge", () => ({
  getAiConfig: vi.fn(),
  saveAiConfig: vi.fn(),
  testAiConnection: vi.fn(),
}));

describe("Settings Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauriBridge.getAiConfig.mockResolvedValue({
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
      has_key: true,
    });
  });

  it("renders null when isOpen is false", () => {
    const { container } = render(<Settings isOpen={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders Settings modal with AI Assistant section when isOpen is true", async () => {
    render(<Settings isOpen={true} onClose={() => {}} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("AI Assistant Settings")).toBeInTheDocument();
      expect(screen.getByText("✓ Saved in Keychain")).toBeInTheDocument();
    });
  });

  it("handles test connection click", async () => {
    tauriBridge.testAiConnection.mockResolvedValue(true);

    render(<Settings isOpen={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Test Connection")).toBeInTheDocument();
    });

    const testBtn = screen.getByText("Test Connection");
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(tauriBridge.testAiConnection).toHaveBeenCalled();
      expect(screen.getByText(/✓ Connection successful!/)).toBeInTheDocument();
    });
  });

  it("saves configuration on submit", async () => {
    tauriBridge.saveAiConfig.mockResolvedValue({
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
      has_key: true,
    });

    render(<Settings isOpen={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Save Configuration")).toBeInTheDocument();
    });

    const apiKeyInput = screen.getByPlaceholderText("•••••••••••••••• (Key saved in Keychain)");
    fireEvent.change(apiKeyInput, { target: { value: "sk-ant-test-key" } });

    const saveBtn = screen.getByText("Save Configuration");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(tauriBridge.saveAiConfig).toHaveBeenCalledWith(
        "anthropic",
        "claude-3-5-sonnet-20241022",
        "sk-ant-test-key"
      );
      expect(screen.getByText(/✓ Settings saved successfully!/)).toBeInTheDocument();
    });
  });
});
